import LedgerAccount from '../models/LedgerAccount.js';
import JournalEntry from '../models/JournalEntry.js';
import User from '../models/User.js';
import { notifyAdmins } from '../notificationService.js';
import { CATEGORY_TO_ACCOUNT_CODE, CASH_ACCOUNT_CODE, INCOME_ACCOUNT_CODE } from '../seed/chartOfAccounts.js';

async function alreadyPosted(source, sourceId) {
    if (!sourceId) return false;
    const existing = await JournalEntry.findOne({ source, sourceId, status: { $ne: 'void' } }).lean();
    return !!existing;
}

function makeLine(accountId, amountNative, amountUSD, isDebit, opts = {}) {
    return {
        accountId,
        debit: isDebit ? amountNative : 0,
        credit: isDebit ? 0 : amountNative,
        currency: opts.currency || 'USD',
        exchangeRateToUSD: opts.exchangeRateToUSD ?? 1,
        amountUSD,
        memo: opts.memo || '',
        entityId: opts.entityId || '',
    };
}

async function findExpenseAccount(tx) {
    if (tx.taxCategory) {
        // Two seeded accounts intentionally share taxCategory: 'Office Expense'
        // (6200 Office Expense, 6300 Software) — Schedule C has no dedicated
        // "software" line item, so software costs are legitimately grouped
        // under the official Office Expense line for tax-filing purposes.
        // .sort({ code: 1 }) makes the tie deterministic (always 6200 first)
        // instead of depending on MongoDB's unspecified default ordering
        // (see Task 17 review Fix 6).
        const byTax = await LedgerAccount.findOne({ type: 'expense', taxCategory: tx.taxCategory }).sort({ code: 1 }).lean();
        if (byTax) return byTax;
    }
    const code = CATEGORY_TO_ACCOUNT_CODE[tx.category] || CATEGORY_TO_ACCOUNT_CODE.other;
    return LedgerAccount.findOne({ code }).lean();
}

async function requireAccount(query, label) {
    const account = await LedgerAccount.findOne(query).lean();
    if (!account) throw new Error(`Missing ledger account for ${label} (query=${JSON.stringify(query)})`);
    return account;
}

/** Debit [expense account for tx.taxCategory or tx.category], Credit Cash. */
export async function postExpense(tx) {
    if (await alreadyPosted('expense', tx.id)) return null;
    const expenseAccount = await findExpenseAccount(tx);
    if (!expenseAccount) throw new Error(`Missing expense ledger account for transaction ${tx.id} (category=${tx.category}, taxCategory=${tx.taxCategory || 'n/a'})`);
    const cashAccount = await requireAccount({ code: CASH_ACCOUNT_CODE }, `expense ${tx.id}`);
    const amountUSD = tx.amountUSD ?? tx.amount;
    const currencyOpts = { currency: tx.currency, exchangeRateToUSD: tx.exchangeRateToUSD, entityId: tx.consultantId || '' };
    return JournalEntry.create({
        date: tx.dateObj || new Date(tx.date),
        memo: tx.title,
        source: 'expense',
        sourceId: tx.id,
        lines: [
            makeLine(expenseAccount.id, tx.amount, amountUSD, true, currencyOpts),
            makeLine(cashAccount.id, tx.amount, amountUSD, false, { currency: tx.currency, exchangeRateToUSD: tx.exchangeRateToUSD }),
        ],
    });
}

async function warnIfMissingTaxInfo(consultantId, paymentLabel) {
    if (!consultantId) return;
    // This warns; it must never block the payment. Everything below —
    // including the lookup itself — is wrapped so a DB blip/timeout can
    // never propagate up into postConsultantPayment (see Task 3 review Fix 1).
    try {
        const consultant = await User.findOne({ id: consultantId }).lean();
        if (consultant?.taxInfo?.tinEncrypted) return;
        await notifyAdmins({
            type: 'backup_withholding_risk',
            title: `⚠ Pago sin W-9: ${consultant?.name || consultantId}`,
            message: `Se pagó Contract Labor (${paymentLabel}) sin TIN en archivo. El IRS exige retención de respaldo del 24% sobre pagos a contratistas sin W-9.`,
            severity: 'critical',
            relatedModel: 'user',
            relatedId: consultantId,
            route: '/settings/users',
        }).catch(() => {});
    } catch (e) {
        console.error('[warnIfMissingTaxInfo]', e.message);
    }
}

/**
 * Debit Contract Labor, Credit Cash. Kept separate from postExpense (even
 * though the shape is identical) because it always resolves to the
 * Contract Labor account regardless of `category`, and it's the function
 * the 1099 report (Task 7) depends on for its entityId aggregation.
 */
export async function postConsultantPayment(tx) {
    if (await alreadyPosted('payroll', tx.id)) return null;
    await warnIfMissingTaxInfo(tx.consultantId, tx.title);
    const laborAccount = await requireAccount({ code: CATEGORY_TO_ACCOUNT_CODE.consultant_payment }, `consultant payment ${tx.id}`);
    const cashAccount = await requireAccount({ code: CASH_ACCOUNT_CODE }, `consultant payment ${tx.id}`);
    const amountUSD = tx.amountUSD ?? tx.amount;
    return JournalEntry.create({
        date: tx.dateObj || new Date(tx.date),
        memo: tx.title,
        source: 'payroll',
        sourceId: tx.id,
        lines: [
            makeLine(laborAccount.id, tx.amount, amountUSD, true, { currency: tx.currency, exchangeRateToUSD: tx.exchangeRateToUSD, entityId: tx.consultantId || '' }),
            makeLine(cashAccount.id, tx.amount, amountUSD, false, { currency: tx.currency, exchangeRateToUSD: tx.exchangeRateToUSD }),
        ],
    });
}

/** Debit Cash, Credit Service Income. Invoice issuance never posts (cash-basis). */
export async function postPaymentReceived(payment) {
    const sourceId = payment._id.toString();
    if (await alreadyPosted('payment', sourceId)) return null;
    const cashAccount = await requireAccount({ code: CASH_ACCOUNT_CODE }, `payment ${sourceId}`);
    const incomeAccount = await requireAccount({ code: INCOME_ACCOUNT_CODE }, `payment ${sourceId}`);
    const currencyOpts = { currency: payment.currency, exchangeRateToUSD: payment.exchangeRateToUSD, entityId: payment.clientId };
    return JournalEntry.create({
        date: payment.paymentDate,
        memo: `Payment from ${payment.clientName}`,
        source: 'payment',
        sourceId,
        lines: [
            makeLine(cashAccount.id, payment.amount, payment.amountUSD, true, currencyOpts),
            makeLine(incomeAccount.id, payment.amount, payment.amountUSD, false, currencyOpts),
        ],
    });
}

/** Debit Contract Labor, Credit Cash, for the amount actually paid out on a commission. */
export async function postCommissionPaid(commission) {
    const sourceId = commission._id.toString();
    if (await alreadyPosted('commission', sourceId)) return null;
    const laborAccount = await requireAccount({ code: CATEGORY_TO_ACCOUNT_CODE.consultant_payment }, `commission ${sourceId}`);
    const cashAccount = await requireAccount({ code: CASH_ACCOUNT_CODE }, `commission ${sourceId}`);
    const amountUSD = commission.paidAmountUSD || commission.amountUSD;
    return JournalEntry.create({
        date: new Date(),
        memo: `Commission — ${commission.projectName}`,
        source: 'commission',
        sourceId,
        lines: [
            makeLine(laborAccount.id, amountUSD, amountUSD, true, {}),
            makeLine(cashAccount.id, amountUSD, amountUSD, false, {}),
        ],
    });
}
