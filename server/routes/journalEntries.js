import { Router } from 'express';
import JournalEntry from '../models/JournalEntry.js';
import LedgerAccount from '../models/LedgerAccount.js';
import LedgerPeriodClose from '../models/LedgerPeriodClose.js';
import { deepSanitize } from '../middleware/sanitize.js';
import { emitCollectionChange } from '../socketInstance.js';

const router = Router();

async function isPeriodClosed(date) {
    const d = new Date(date);
    // Use UTC getters, not local-time getters: journal entry dates are
    // stored/compared as UTC, but getFullYear()/getMonth() read local-time
    // components. In any negative-UTC-offset timezone (e.g. America/Bogota,
    // UTC-5) a date stored as e.g. 2026-01-01T00:00:00.000Z reads back as
    // December 31, 2025 in local time, which would match/miss the wrong
    // period close record (see Task 17 review Fix 4).
    const closed = await LedgerPeriodClose.findOne({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }).lean();
    return !!closed;
}

/**
 * Validates that every `lines[].accountId` in a manual journal entry
 * references a real LedgerAccount. `accountId` is a bare, unvalidated
 * string on JournalLineSchema with no schema-level reference check — without
 * this, an entry with an unknown accountId either silently drops out of
 * every report (data-entry mistake) or, in the malicious case, lets an
 * attacker post an accountId like "__proto__" that later pollutes
 * Object.prototype when reports aggregate it (see Task 17 review Fix 1).
 * Returns an array of unknown account ids (empty if all are valid).
 */
async function findUnknownAccountIds(lines) {
    if (!Array.isArray(lines)) return [];
    const accountIds = [...new Set(lines.map((l) => l && l.accountId).filter(Boolean))];
    if (!accountIds.length) return [];
    const existing = await LedgerAccount.find({ id: { $in: accountIds } }).select('id').lean();
    const existingIds = new Set(existing.map((a) => a.id));
    return accountIds.filter((id) => !existingIds.has(id));
}

// ── GET ALL (filterable) ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const filter = {};
        // Only accept plain string query values — express/qs will parse
        // `?accountId[$ne]=null` into an object, and assigning that object
        // straight into a Mongo filter would inject a raw operator. The
        // global sanitizeQuery middleware only strips top-level `$` keys,
        // not nested ones, so this route must guard it itself.
        if (typeof req.query.accountId === 'string') filter['lines.accountId'] = req.query.accountId;
        if (typeof req.query.status === 'string') filter.status = req.query.status;
        const hasFrom = typeof req.query.from === 'string';
        const hasTo = typeof req.query.to === 'string';
        if (hasFrom || hasTo) {
            filter.date = {};
            if (hasFrom) filter.date.$gte = new Date(req.query.from);
            if (hasTo) filter.date.$lte = new Date(req.query.to);
        }
        const docs = await JournalEntry.find(filter).sort({ date: -1 }).limit(1000).lean();
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── CREATE (manual entry) ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const payload = deepSanitize(req.body, true);
        const parsedDate = payload.date != null ? new Date(payload.date) : null;
        if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
            return res.status(400).json({ error: 'A valid date is required to create a journal entry.' });
        }
        if (await isPeriodClosed(parsedDate)) {
            return res.status(409).json({ error: `Period ${payload.date} is closed. Reopen it before adding entries.` });
        }
        const unknownAccountIds = await findUnknownAccountIds(payload.lines);
        if (unknownAccountIds.length) {
            return res.status(400).json({ error: `Unknown account id(s): ${unknownAccountIds.join(', ')}` });
        }
        const doc = await JournalEntry.create({ ...payload, source: payload.source || 'manual' });
        const result = doc.toObject();
        emitCollectionChange('journalEntries', 'created', result);
        res.status(201).json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── VOID (never hard-delete a posted entry) ─────────────────────────────────
router.post('/:id/void', async (req, res) => {
    try {
        const entry = await JournalEntry.findById(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Not found' });
        if (await isPeriodClosed(entry.date)) {
            return res.status(409).json({ error: 'Cannot void an entry in a closed period. Reopen the period first.' });
        }
        entry.status = 'void';
        await entry.save();
        emitCollectionChange('journalEntries', 'updated', entry.toObject());
        res.json(entry.toObject());
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── CLOSE PERIOD (admin only) ────────────────────────────────────────────────
router.post('/close-period', async (req, res) => {
    if (req.session?.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: admin role required to close a period' });
    }
    try {
        const { year, month } = req.body;
        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
            return res.status(400).json({ error: 'A valid integer year and month (1-12) are required to close a period.' });
        }
        const doc = await LedgerPeriodClose.findOneAndUpdate(
            { year, month },
            { $setOnInsert: { id: `close_${year}_${month}`, year, month, closedBy: req.session?.user?.email || '' } },
            { upsert: true, new: true, runValidators: true },
        );
        res.status(201).json(doc);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── REOPEN PERIOD (admin only) ───────────────────────────────────────────────
router.delete('/close-period/:year/:month', async (req, res) => {
    if (req.session?.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: admin role required to reopen a period' });
    }
    try {
        await LedgerPeriodClose.deleteOne({ year: Number(req.params.year), month: Number(req.params.month) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
