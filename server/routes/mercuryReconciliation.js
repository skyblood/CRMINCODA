import { Router } from 'express';
import LedgerAccount from '../models/LedgerAccount.js';
import JournalEntry from '../models/JournalEntry.js';
import { parseCsv } from '../utils/csvParser.js';
import { CASH_ACCOUNT_CODE } from '../seed/chartOfAccounts.js';
import { computeMatchScore } from '../utils/reconciliationScore.js';
import MercuryTransaction from '../models/MercuryTransaction.js';
import { listAccounts, listAccountTransactions } from '../services/mercuryApiClient.js';

const SUGGESTION_THRESHOLD = 0.5;

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
            if (typeof accountId !== 'string' || !accountId) {
                return res.status(400).json({ error: 'accountId is required' });
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
                    description: t.description,
                    counterpartyName: t.counterpartyName,
                } },
                { upsert: true }
            )));

            const rows = transactions.map(t => ({
                Date: t.postedAt ?? t.createdAt,
                Description: t.description ?? '',
                Amount: String(t.amount),
            }));
            const result = await reconcileRows(rows);
            res.json({ ...result, parseErrors: [] });
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });

    return scopedRouter;
}

const router = createMercuryReconciliationRouter();
export default router;
