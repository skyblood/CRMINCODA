import { Router } from 'express';
import LedgerAccount from '../models/LedgerAccount.js';
import JournalEntry from '../models/JournalEntry.js';

const router = Router();

/** Sums debit/credit (in USD) per account across a set of posted entries. */
function sumByAccount(entries) {
    const totals = {}; // accountId -> { debit, credit }
    for (const entry of entries) {
        for (const line of entry.lines) {
            if (!totals[line.accountId]) totals[line.accountId] = { debit: 0, credit: 0 };
            totals[line.accountId].debit += line.debit > 0 ? line.amountUSD : 0;
            totals[line.accountId].credit += line.credit > 0 ? line.amountUSD : 0;
        }
    }
    return totals;
}

// ── TRIAL BALANCE ─────────────────────────────────────────────────────────────
router.get('/trial-balance', async (req, res) => {
    try {
        const [accounts, entries] = await Promise.all([
            LedgerAccount.find().lean(),
            JournalEntry.find({ status: 'posted' }).lean(),
        ]);
        const totals = sumByAccount(entries);
        const rows = accounts.map(a => ({
            accountId: a.id, code: a.code, name: a.name, type: a.type,
            debit: totals[a.id]?.debit || 0,
            credit: totals[a.id]?.credit || 0,
        }));
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── P&L ────────────────────────────────────────────────────────────────────────
router.get('/pl', async (req, res) => {
    try {
        const filter = { status: 'posted' };
        if (req.query.start || req.query.end) {
            filter.date = {};
            if (req.query.start) filter.date.$gte = new Date(req.query.start);
            if (req.query.end) filter.date.$lte = new Date(req.query.end);
        }
        const [accounts, entries] = await Promise.all([
            LedgerAccount.find({ type: { $in: ['income', 'expense'] } }).lean(),
            JournalEntry.find(filter).lean(),
        ]);
        const accountsById = Object.fromEntries(accounts.map(a => [a.id, a]));
        const totals = sumByAccount(entries);

        let totalIncome = 0;
        let totalExpense = 0;
        const byAccount = [];
        for (const [accountId, t] of Object.entries(totals)) {
            const account = accountsById[accountId];
            if (!account) continue; // asset/liability/equity line — not part of P&L
            const netForAccount = account.type === 'income' ? (t.credit - t.debit) : (t.debit - t.credit);
            if (account.type === 'income') totalIncome += netForAccount;
            else totalExpense += netForAccount;
            byAccount.push({ code: account.code, name: account.name, type: account.type, amount: netForAccount, taxCategory: account.taxCategory || '' });
        }
        res.json({ totalIncome, totalExpense, netIncome: totalIncome - totalExpense, byAccount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── BALANCE SHEET ────────────────────────────────────────────────────────────
router.get('/balance-sheet', async (req, res) => {
    try {
        const asOf = req.query.asOf ? new Date(req.query.asOf) : new Date();
        // Fetch every account (not just asset/liability/equity): an as-of-date
        // balance sheet for a period that hasn't been formally closed must fold
        // current income/expense activity into equity as unrealized retained
        // earnings, or Assets will not equal Liabilities + Equity.
        const [accounts, entries] = await Promise.all([
            LedgerAccount.find().lean(),
            JournalEntry.find({ status: 'posted', date: { $lte: asOf } }).lean(),
        ]);
        const accountsById = Object.fromEntries(accounts.map(a => [a.id, a]));
        const totals = sumByAccount(entries);

        let totalAssets = 0, totalLiabilities = 0, totalEquity = 0;
        const byAccount = [];
        for (const [accountId, t] of Object.entries(totals)) {
            const account = accountsById[accountId];
            if (!account) continue;
            const balance = account.normalBalance === 'debit' ? (t.debit - t.credit) : (t.credit - t.debit);
            if (account.type === 'asset') totalAssets += balance;
            else if (account.type === 'liability') totalLiabilities += balance;
            else if (account.type === 'equity') totalEquity += balance;
            else if (account.type === 'income') totalEquity += balance;   // credit-normal: rolls into retained earnings
            else if (account.type === 'expense') totalEquity -= balance;  // debit-normal: reduces retained earnings
            // byAccount lists only true balance-sheet lines — income/expense
            // still flow into totalEquity above, but aren't itemized here (see P&L for that detail).
            if (account.type === 'asset' || account.type === 'liability' || account.type === 'equity') {
                byAccount.push({ code: account.code, name: account.name, type: account.type, balance });
            }
        }
        res.json({
            asOf,
            totalAssets, totalLiabilities, totalEquity,
            balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
            byAccount,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
