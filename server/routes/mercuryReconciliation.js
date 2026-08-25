import { Router } from 'express';
import LedgerAccount from '../models/LedgerAccount.js';
import JournalEntry from '../models/JournalEntry.js';
import { parseCsv } from '../utils/csvParser.js';
import { CASH_ACCOUNT_CODE } from '../seed/chartOfAccounts.js';
import { computeMatchScore } from '../utils/reconciliationScore.js';
import MercuryTransaction from '../models/MercuryTransaction.js';
import { listAccounts, listAccountTransactions } from '../services/mercuryApiClient.js';
import Transaction from '../models/Transaction.js';
import { suggestTaxCategory } from '../seed/mercuryCategoryMap.js';
import { postExpense } from '../services/ledgerPostingService.js';

const SUGGESTION_THRESHOLD = 0.5;

// Same charset enforced by server/middleware/sanitize.js's sanitizeParams for
// route params — accountId arrives via req.body here (sanitizeParams only
// runs on req.params), and it's interpolated directly into the Mercury API
// request path in mercuryApiClient.js, so it needs the same validation before
// it's used to build a URL.
const SAFE_ID_RE = /^[a-zA-Z0-9_\-]{1,128}$/;

// Real Mercury transactions never carry a top-level "description" field
// (verified against a live production API response) — only bankDescription
// (a generic boilerplate string, e.g. "Send Money transaction initiated on
// Mercury"), counterpartyName, and counterpartyNickname. Mercury's own
// dashboard shows the nickname/name in its "To/From" column, which is far
// more useful than the generic bank text, so prefer it.
function describeTransaction(t) {
    return t.counterpartyNickname || t.counterpartyName || t.bankDescription || '';
}

// A pending transaction has no postedAt yet, so callers fall back to
// createdAt — Mercury returns both as full ISO timestamps. Truncating to the
// date portion keeps the value readable in the UI and still parses fine as
// the same calendar day for reconcileRows' sameDay() matching.
function toDateOnly(isoString) {
    return typeof isoString === 'string' ? isoString.slice(0, 10) : isoString;
}

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

async function reconcileRows(rows) {
    const cashAccount = await LedgerAccount.findOne({ code: CASH_ACCOUNT_CODE }).lean();
    if (!cashAccount) throw new Error('Cash account not seeded');

    const cashEntries = await JournalEntry.find({ status: 'posted', 'lines.accountId': cashAccount.id }).lean();
    const cashLines = [];
    for (const entry of cashEntries) {
        entry.lines.forEach((line, index) => {
            if (line.accountId === cashAccount.id) {
                cashLines.push({ entryId: entry._id.toString(), lineIndex: index, date: new Date(entry.date), amount: line.debit || -line.credit, memo: entry.memo, reconciled: !!line.reconciled });
            }
        });
    }

    const matched = [];
    const missing = [];
    const claimedCashLineKeys = new Set();

    for (const row of rows) {
        const bankDate = new Date(row.Date);
        const bankAmount = Number(row.Amount);
        const candidate = cashLines.find(l =>
            !l.reconciled &&
            !claimedCashLineKeys.has(`${l.entryId}:${l.lineIndex}`) &&
            sameDay(l.date, bankDate) &&
            Math.abs(l.amount - bankAmount) < 0.01
        );
        if (candidate) {
            claimedCashLineKeys.add(`${candidate.entryId}:${candidate.lineIndex}`);
            matched.push({ bankRow: row, journalEntryId: candidate.entryId, lineIndex: candidate.lineIndex });
        } else {
            missing.push({ bankRow: row });
        }
    }

    const unmatchedLines = cashLines
        .filter(l => !l.reconciled && !claimedCashLineKeys.has(`${l.entryId}:${l.lineIndex}`));

    const candidates = [];
    missing.forEach((m, missingIndex) => {
        unmatchedLines.forEach(line => {
            const { score, reasons } = computeMatchScore(m.bankRow, line);
            if (score >= SUGGESTION_THRESHOLD) {
                candidates.push({ missingIndex, line, score, reasons });
            }
        });
    });
    candidates.sort((a, b) => b.score - a.score);

    const suggested = [];
    const claimedMissingIndexes = new Set();
    const claimedSuggestedLineKeys = new Set();
    for (const c of candidates) {
        const lineKey = `${c.line.entryId}:${c.line.lineIndex}`;
        if (claimedMissingIndexes.has(c.missingIndex) || claimedSuggestedLineKeys.has(lineKey)) continue;
        claimedMissingIndexes.add(c.missingIndex);
        claimedSuggestedLineKeys.add(lineKey);
        suggested.push({
            bankRow: missing[c.missingIndex].bankRow,
            journalEntryId: c.line.entryId,
            lineIndex: c.line.lineIndex,
            confidence: c.score,
            reasons: c.reasons,
        });
    }

    const finalMissing = missing.filter((_, i) => !claimedMissingIndexes.has(i));
    const unmatched = unmatchedLines
        .filter(l => !claimedSuggestedLineKeys.has(`${l.entryId}:${l.lineIndex}`))
        .map(l => ({ journalEntryId: l.entryId, lineIndex: l.lineIndex, date: l.date, amount: l.amount }));

    return { matched, unmatched, missing: finalMissing, suggested };
}

export function createMercuryReconciliationRouter({
    mercuryListAccounts = listAccounts,
    mercuryListTransactions = listAccountTransactions,
} = {}) {
    const scopedRouter = Router();

    scopedRouter.post('/', async (req, res) => {
        try {
            const { csv } = req.body;
            if (typeof csv !== 'string') return res.status(400).json({ error: 'csv (string) is required' });
            const { rows, errors } = parseCsv(csv);
            const result = await reconcileRows(rows);
            res.json({ ...result, parseErrors: errors });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── CONFIRM MATCH — marks a Cash-account line as reconciled ────────────
    scopedRouter.post('/confirm-match', async (req, res) => {
        try {
            const { journalEntryId, lineIndex } = req.body;

            // Reject anything that isn't a plain 24-hex-char ObjectId string before
            // it ever reaches Mongoose — otherwise an object like {"$ne": null}
            // survives Mongoose's condition-casting (it recognizes $-prefixed
            // operator keys and passes them through) and matches an arbitrary
            // document instead of 404ing. Same class of bug fixed in Task 8's
            // journalEntries.js review.
            if (typeof journalEntryId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(journalEntryId)) {
                return res.status(400).json({ error: 'Invalid journalEntryId' });
            }

            const entry = await JournalEntry.findById(journalEntryId);
            if (!entry) return res.status(404).json({ error: 'Journal entry line not found' });

            // entry.lines is array-like (Mongoose DocumentArray); a non-integer
            // key such as "__proto__" resolves to the array's prototype object
            // (truthy), bypassing an `!entry.lines[lineIndex]` guard and letting
            // the assignment below pollute Object.prototype. Require a real,
            // in-bounds array index instead of trusting the raw body value.
            if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= entry.lines.length) {
                return res.status(404).json({ error: 'Journal entry line not found' });
            }

            entry.lines[lineIndex].reconciled = true;
            await entry.save();
            res.json(entry.toObject());
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    scopedRouter.get('/accounts', async (req, res) => {
        try {
            res.json(await mercuryListAccounts());
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });

    scopedRouter.post('/sync', async (req, res) => {
        try {
            const { accountId, start, end } = req.body;
            if (typeof accountId !== 'string' || !SAFE_ID_RE.test(accountId)) {
                return res.status(400).json({ error: 'Invalid accountId' });
            }
            const transactions = await mercuryListTransactions(accountId, { start, end });

            await Promise.all(transactions.map(t => MercuryTransaction.updateOne(
                { mercuryAccountId: accountId, mercuryTransactionId: t.id },
                { $set: {
                    mercuryAccountId: accountId,
                    mercuryTransactionId: t.id,
                    amount: t.amount,
                    status: t.status,
                    postedAt: t.postedAt,
                    mercuryCreatedAt: t.createdAt ?? null,
                    description: describeTransaction(t),
                    counterpartyName: t.counterpartyName,
                    mercuryCategoryName: t.categoryData?.name ?? null,
                    kind: t.kind,
                    counterpartyNickname: t.counterpartyNickname,
                } },
                { upsert: true }
            )));

            const rows = transactions.map(t => ({
                Date: toDateOnly(t.postedAt ?? t.createdAt),
                Description: describeTransaction(t),
                Amount: String(t.amount),
                mercuryTransactionId: t.id,
                mercurySuggestedTaxCategory: suggestTaxCategory(t.categoryData?.name),
            }));
            const result = await reconcileRows(rows);
            res.json({ ...result, parseErrors: [] });
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });

    scopedRouter.post('/approve', async (req, res) => {
        try {
            const { mercuryTransactionId } = req.body;
            if (typeof mercuryTransactionId !== 'string' || !mercuryTransactionId) {
                return res.status(400).json({ error: 'mercuryTransactionId is required' });
            }
            const mtx = await MercuryTransaction.findOne({ mercuryTransactionId }).lean();
            if (!mtx) return res.status(404).json({ error: 'Mercury transaction not found' });

            // Only outgoing (negative) Mercury transactions may be approved as an
            // expense. A positive/incoming transaction booked as `type: 'expense'`
            // would double-count as money leaving (a fake expense debit AND a Cash
            // credit) when it actually came in — see Finding 1 of the final review.
            if (!(mtx.amount < 0)) {
                return res.status(400).json({ error: 'Solo los movimientos de salida se pueden aprobar como gasto.' });
            }

            const taxCategory = suggestTaxCategory(mtx.mercuryCategoryName);
            const amount = Math.abs(mtx.amount);
            const transactionId = `mercury_${mercuryTransactionId}`;
            const postedAt = mtx.postedAt || mtx.mercuryCreatedAt || new Date();

            const postingFailedMessage = 'El gasto se registró pero no se pudo contabilizar en el libro diario. Contacta soporte.';

            try {
                await Transaction.create({
                    id: transactionId,
                    title: mtx.description || mtx.counterpartyNickname || 'Mercury transaction',
                    amount,
                    amountUSD: amount,
                    currency: 'USD',
                    exchangeRateToUSD: 1,
                    date: new Date(postedAt).toISOString().split('T')[0],
                    dateObj: postedAt,
                    type: 'expense',
                    category: 'other',
                    taxCategory,
                    description: mtx.description || '',
                });

                // Transaction.create() awaits the model's post('save') hook (see
                // server/models/Transaction.js), so by the time we get here the
                // ledger-posting attempt has already finished, successfully or not.
                // The hook swallows posting failures rather than throwing (so the
                // Transaction write itself is never blocked/lost), which means we
                // must check the outcome explicitly instead of trusting a 201.
                // We check for the JournalEntry directly rather than trusting
                // postingStatus alone: if the poster succeeds but the subsequent
                // postingStatus='posted' write fails, the hook logs and leaves the
                // status stale (never sets 'failed' in that case) — checking for
                // the JournalEntry itself is the one source of truth for whether
                // posting actually happened. See Finding 3 of the final review.
                const entry = await JournalEntry.findOne({ source: 'expense', sourceId: transactionId }).lean();
                if (!entry) {
                    return res.status(502).json({ error: postingFailedMessage });
                }
                res.status(201).json({ id: transactionId, taxCategory });
            } catch (err) {
                if (err.code === 11000) {
                    // The Transaction already exists (this is a retry). Don't just
                    // assume its original posting succeeded — check for the
                    // JournalEntry, and if it's missing, self-heal by retrying the
                    // post directly. postExpense() is idempotent via its own
                    // alreadyPosted() check, so calling it again is safe even if it
                    // races with another in-flight attempt.
                    const existingEntry = await JournalEntry.findOne({ source: 'expense', sourceId: transactionId }).lean();
                    if (existingEntry) {
                        return res.status(200).json({ id: transactionId, taxCategory, alreadyApproved: true });
                    }

                    const existingTx = await Transaction.findOne({ id: transactionId }).lean();
                    if (existingTx) {
                        try {
                            await postExpense(existingTx);
                        } catch (postErr) {
                            console.error(`[mercury-approve] retry posting failed for ${transactionId}:`, postErr.stack || postErr);
                        }
                    }

                    const retryEntry = await JournalEntry.findOne({ source: 'expense', sourceId: transactionId }).lean();
                    if (!retryEntry) {
                        return res.status(502).json({ error: postingFailedMessage });
                    }
                    if (existingTx) {
                        await Transaction.updateOne({ id: transactionId }, { $set: { postingStatus: 'posted' } }).catch(() => {});
                    }
                    return res.status(200).json({ id: transactionId, taxCategory, alreadyApproved: true });
                }
                throw err;
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return scopedRouter;
}

const router = createMercuryReconciliationRouter();
export default router;
