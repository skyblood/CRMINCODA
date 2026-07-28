import LedgerAccount from '../models/LedgerAccount.js';
import JournalEntry from '../models/JournalEntry.js';
import { CATEGORY_TO_ACCOUNT_CODE, CASH_ACCOUNT_CODE } from '../seed/chartOfAccounts.js';

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
        const byTax = await LedgerAccount.findOne({ type: 'expense', taxCategory: tx.taxCategory }).lean();
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

/**
 * Debit Contract Labor, Credit Cash. Kept separate from postExpense (even
 * though the shape is identical) because it always resolves to the
 * Contract Labor account regardless of `category`, and it's the function
 * the 1099 report (Task 7) depends on for its entityId aggregation.
 */
export async function postConsultantPayment(tx) {
    if (await alreadyPosted('payroll', tx.id)) return null;
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
