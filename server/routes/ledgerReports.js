import { Router } from 'express';
import LedgerAccount from '../models/LedgerAccount.js';
import JournalEntry from '../models/JournalEntry.js';
import User from '../models/User.js';
import { decrypt } from '../utils/encryption.js';

const router = Router();

/**
 * Normalizes a date-only string (e.g. "2026-08-01") to end-of-day UTC so it
 * behaves as an inclusive upper bound in a `$lte` filter. `new Date(dateStr)`
 * on a bare YYYY-MM-DD string parses to UTC midnight, which silently
 * excludes any entry posted later that same day (in any timezone at or
 * behind UTC) — the default "today" view of P&L/Balance Sheet would omit
 * everything from today (see Task 17 review Fix 3). Strings that already
 * carry a time component (full ISO datetimes) are respected as-is.
 */
function endOfDayUTC(dateStr) {
    const d = new Date(dateStr);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
        d.setUTCHours(23, 59, 59, 999);
    }
    return d;
}

/** Sums debit/credit (in USD) per account across a set of posted entries. */
function sumByAccount(entries) {
    // Object.create(null) — not {} — because `line.accountId` is an
    // unvalidated string sourced from client-controlled journal entry lines
    // (see Task 17 review Fix 1). A plain {} accumulator lets an accountId of
    // "__proto__" write through the prototype chain onto Object.prototype
    // itself, polluting every object in the process for its lifetime. A
    // prototype-less object has no inherited keys to collide with.
    const totals = Object.create(null); // accountId -> { debit, credit }
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
            if (req.query.end) filter.date.$lte = endOfDayUTC(req.query.end);
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
        const asOf = req.query.asOf ? endOfDayUTC(req.query.asOf) : new Date();
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

// ── 1099-NEC THRESHOLD REPORT ────────────────────────────────────────────────────
const NEC_1099_THRESHOLD_USD = 600;
const CONTRACT_LABOR_ACCOUNT_CODE = '6100';

router.get('/1099', async (req, res) => {
    try {
        const year = Number(req.query.year) || new Date().getFullYear();
        const laborAccount = await LedgerAccount.findOne({ code: CONTRACT_LABOR_ACCOUNT_CODE }).lean();
        if (!laborAccount) return res.json([]);

        const entries = await JournalEntry.find({
            status: 'posted',
            date: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31T23:59:59.999Z`) },
            'lines.accountId': laborAccount.id,
        }).lean();

        const totals = Object.create(null); // entityId -> totalUSD
        for (const entry of entries) {
            for (const line of entry.lines) {
                if (line.accountId !== laborAccount.id || !line.entityId || line.debit <= 0) continue;
                totals[line.entityId] = (totals[line.entityId] || 0) + line.amountUSD;
            }
        }

        const entityIds = Object.keys(totals);
        const users = await User.find({ id: { $in: entityIds } }).lean();
        const userById = Object.fromEntries(users.map(u => [u.id, u]));

        const rows = entityIds.map(entityId => {
            const totalUSD = totals[entityId];
            const user = userById[entityId];
            return {
                entityId,
                name: user?.name || entityId,
                totalUSD,
                crossesThreshold: totalUSD >= NEC_1099_THRESHOLD_USD,
                hasTIN: !!user?.taxInfo?.tinEncrypted,
            };
        });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function csvEscape(value) {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/1099/export', async (req, res) => {
    if (!(req.session?.user?.permissions?.finance || req.session?.user?.permissions?.admin)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const year = Number(req.query.year) || new Date().getFullYear();
        const header = 'Recipient Name,TIN,TIN Type,Address,City,State,Zip,Box1_NonemployeeComp';
        const laborAccount = await LedgerAccount.findOne({ code: CONTRACT_LABOR_ACCOUNT_CODE }).lean();

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="1099-${year}.csv"`);

        if (!laborAccount) return res.send(header + '\n');

        const entries = await JournalEntry.find({
            status: 'posted',
            date: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31T23:59:59.999Z`) },
            'lines.accountId': laborAccount.id,
        }).lean();

        const totals = Object.create(null);
        for (const entry of entries) {
            for (const line of entry.lines) {
                if (line.accountId !== laborAccount.id || !line.entityId || line.debit <= 0) continue;
                totals[line.entityId] = (totals[line.entityId] || 0) + line.amountUSD;
            }
        }

        const qualifyingIds = Object.keys(totals).filter(id => totals[id] >= NEC_1099_THRESHOLD_USD);
        const users = await User.find({ id: { $in: qualifyingIds } }).lean();
        const userById = Object.fromEntries(users.map(u => [u.id, u]));

        const rows = [header];
        for (const entityId of qualifyingIds) {
            const user = userById[entityId];
            const taxInfo = user?.taxInfo || {};
            let tin = '';
            if (taxInfo.tinEncrypted) {
                try { tin = decrypt(taxInfo.tinEncrypted); }
                catch { tin = 'TIN_DECRYPT_ERROR'; }
            }
            const addr = taxInfo.address || {};
            rows.push([
                csvEscape(taxInfo.legalName || user?.name || entityId),
                csvEscape(tin),
                csvEscape(taxInfo.tinType || ''),
                csvEscape(addr.line1 || ''),
                csvEscape(addr.city || ''),
                csvEscape(addr.state || ''),
                csvEscape(addr.zip || ''),
                csvEscape(totals[entityId].toFixed(2)),
            ].join(','));
        }

        res.send(rows.join('\n') + '\n');
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
