import { Router } from 'express';
import LedgerAccount from '../models/LedgerAccount.js';
import JournalEntry from '../models/JournalEntry.js';
import { parseCsv } from '../utils/csvParser.js';
import { CASH_ACCOUNT_CODE } from '../seed/chartOfAccounts.js';
import { computeMatchScore } from '../utils/reconciliationScore.js';
import MercuryTransaction from '../models/MercuryTransaction.js';
import { listAccounts, listAccountTransactions, upsertMercuryTransactions } from '../services/mercuryApiClient.js';
import Transaction from '../models/Transaction.js';
import { suggestTaxCategory } from '../seed/mercuryCategoryMap.js';
import { postExpense, isPeriodClosed } from '../services/ledgerPostingService.js';

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
    const who = t.counterpartyNickname || t.counterpartyName || t.bankDescription || '';
    // Mercury's own "Notes" field is free text the account holder writes per
    // transaction (e.g. "Cena cliente Cartagena") — the most meaningful
    // context available when present, so surface it alongside who the
    // transaction was with rather than letting it get lost.
    if (t.note) return who ? `${who} — ${t.note}` : t.note;
    return who;
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

// httpStatus travels with every error result so /approve can map it back to
// the exact status code the pre-refactor inline handler used — a generic/
// unexpected error (anything other than the sign guard, an invalid
// taxCategory override, or a posting failure) must still surface as 500, not
// be silently reclassified as a 502 "known integration failure". Getting
// this wrong is easy (string-matching the error message instead) and easy to
// miss in review since no pre-existing test exercises a truly unexpected
// Transaction.create() failure — verified by re-deriving each branch's
// status code against the pre-refactor handler line by line, not just by
// running the existing test suite.
async function approveOne(mtx, taxCategoryOverride) {
    if (!(mtx.amount < 0)) {
        return { status: 'error', httpStatus: 400, error: 'Solo los movimientos de salida se pueden aprobar como gasto.' };
    }

    let taxCategory = suggestTaxCategory(mtx.mercuryCategoryName);
    if (typeof taxCategoryOverride === 'string' && taxCategoryOverride) {
        const validAccount = await LedgerAccount.findOne({ type: 'expense', taxCategory: taxCategoryOverride }).lean();
        if (!validAccount) return { status: 'error', httpStatus: 400, error: 'Invalid taxCategory' };
        taxCategory = taxCategoryOverride;
    }

    const amount = Math.abs(mtx.amount);
    const transactionId = `mercury_${mtx.mercuryTransactionId}`;
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

        const entry = await JournalEntry.findOne({ source: 'expense', sourceId: transactionId, status: { $ne: 'void' } }).lean();
        if (!entry) return { status: 'error', httpStatus: 502, error: postingFailedMessage };
        return { status: 'approved', id: transactionId, taxCategory };
    } catch (err) {
        if (err.code === 11000) {
            // Fetch the persisted Transaction up front so both "already
            // approved" returns below report the taxCategory that's actually
            // on record — not `taxCategory`, which may hold *this* request's
            // (possibly different) override and was never saved anywhere.
            const existingTx = await Transaction.findOne({ id: transactionId }).lean();
            const persistedTaxCategory = existingTx?.taxCategory || taxCategory;

            const existingEntry = await JournalEntry.findOne({ source: 'expense', sourceId: transactionId, status: { $ne: 'void' } }).lean();
            if (existingEntry) {
                return { status: 'approved', id: transactionId, taxCategory: persistedTaxCategory, alreadyApproved: true };
            }

            if (existingTx) {
                try {
                    await postExpense(existingTx);
                } catch (postErr) {
                    console.error(`[mercury-approve] retry posting failed for ${transactionId}:`, postErr.stack || postErr);
                }
            }

            const retryEntry = await JournalEntry.findOne({ source: 'expense', sourceId: transactionId, status: { $ne: 'void' } }).lean();
            if (!retryEntry) return { status: 'error', httpStatus: 502, error: postingFailedMessage };
            if (existingTx) {
                await Transaction.updateOne({ id: transactionId }, { $set: { postingStatus: 'posted' } }).catch(() => {});
            }
            return { status: 'approved', id: transactionId, taxCategory: persistedTaxCategory, alreadyApproved: true };
        }
        // Any other error (e.g. a Mongo write failure unrelated to a
        // duplicate key) — the pre-refactor handler let this propagate to
        // its own outer catch, which always responded 500. Preserve that
        // exactly via an explicit httpStatus rather than re-deriving it from
        // the error message.
        return { status: 'error', httpStatus: 500, error: err.message };
    }
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
        const { accountId, start, end } = req.body;
        if (typeof accountId !== 'string' || !SAFE_ID_RE.test(accountId)) {
            return res.status(400).json({ error: 'Invalid accountId' });
        }

        // Only a genuine Mercury API failure gets 502 (a signal that the
        // upstream, not this server, is at fault). Anything after this point
        // (our own DB writes, reconcileRows' own logic) is an internal error
        // and must surface as 500 — conflating the two into one 502 misleads
        // whoever triages the error toward the wrong system.
        let transactions;
        try {
            transactions = await mercuryListTransactions(accountId, { start, end });
        } catch (err) {
            return res.status(502).json({ error: err.message });
        }

        try {
            await upsertMercuryTransactions(accountId, transactions, MercuryTransaction);

            const rows = transactions.map(t => ({
                Date: toDateOnly(t.postedAt ?? t.createdAt),
                Description: describeTransaction(t),
                Amount: String(t.amount),
                mercuryTransactionId: t.id,
                mercurySuggestedTaxCategory: suggestTaxCategory(t.categoryData?.name),
                dashboardLink: t.dashboardLink ?? null,
            }));
            const result = await reconcileRows(rows);
            res.json({ ...result, parseErrors: [] });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    scopedRouter.post('/approve', async (req, res) => {
        try {
            const { mercuryTransactionId, taxCategory } = req.body;
            if (typeof mercuryTransactionId !== 'string' || !mercuryTransactionId) {
                return res.status(400).json({ error: 'mercuryTransactionId is required' });
            }
            const mtx = await MercuryTransaction.findOne({ mercuryTransactionId }).lean();
            if (!mtx) return res.status(404).json({ error: 'Mercury transaction not found' });

            const result = await approveOne(mtx, taxCategory);
            if (result.status === 'error') {
                return res.status(result.httpStatus).json({ error: result.error });
            }
            res.status(result.alreadyApproved ? 200 : 201).json({ id: result.id, taxCategory: result.taxCategory, ...(result.alreadyApproved ? { alreadyApproved: true } : {}) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    scopedRouter.post('/approve-many', async (req, res) => {
        try {
            const { items } = req.body;
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'items (non-empty array) is required' });
            }
            if (items.length > 100) {
                return res.status(400).json({ error: 'Cannot approve more than 100 items in one call' });
            }

            const results = [];
            for (const item of items) {
                const { mercuryTransactionId, taxCategory } = item || {};
                if (typeof mercuryTransactionId !== 'string' || !mercuryTransactionId) {
                    results.push({ mercuryTransactionId: mercuryTransactionId ?? null, status: 'error', error: 'mercuryTransactionId is required' });
                    continue;
                }
                const mtx = await MercuryTransaction.findOne({ mercuryTransactionId }).lean();
                if (!mtx) {
                    results.push({ mercuryTransactionId, status: 'error', error: 'Mercury transaction not found' });
                    continue;
                }
                const result = await approveOne(mtx, taxCategory);
                results.push({ mercuryTransactionId, ...result });
            }

            res.status(200).json({ results });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── UNDO an approval — voids the posted JournalEntry (never hard-deleted,
    // same convention as /api/journal-entries/:id/void) and deletes the
    // synthetic Transaction, so a later re-approval starts clean instead of
    // colliding with the old deterministic id.
    scopedRouter.post('/unapprove', async (req, res) => {
        try {
            const { mercuryTransactionId } = req.body;
            if (typeof mercuryTransactionId !== 'string' || !mercuryTransactionId) {
                return res.status(400).json({ error: 'mercuryTransactionId is required' });
            }
            const transactionId = `mercury_${mercuryTransactionId}`;
            const tx = await Transaction.findOne({ id: transactionId }).lean();
            if (!tx) return res.status(404).json({ error: 'This transaction was not approved' });

            const entry = await JournalEntry.findOne({ source: 'expense', sourceId: transactionId, status: { $ne: 'void' } });
            if (entry) {
                if (await isPeriodClosed(entry.date)) {
                    return res.status(409).json({ error: 'Cannot undo: the accounting period for this entry is closed. Reopen the period first.' });
                }
                entry.status = 'void';
                await entry.save();
            }

            await Transaction.deleteOne({ id: transactionId });
            res.json({ id: transactionId, undone: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return scopedRouter;
}

const router = createMercuryReconciliationRouter();
export default router;
