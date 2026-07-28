import { Router } from 'express';
import JournalEntry from '../models/JournalEntry.js';
import LedgerPeriodClose from '../models/LedgerPeriodClose.js';
import { deepSanitize } from '../middleware/sanitize.js';
import { emitCollectionChange } from '../socketInstance.js';

const router = Router();

async function isPeriodClosed(date) {
    const d = new Date(date);
    const closed = await LedgerPeriodClose.findOne({ year: d.getFullYear(), month: d.getMonth() + 1 }).lean();
    return !!closed;
}

// ── GET ALL (filterable) ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const filter = {};
        if (req.query.accountId) filter['lines.accountId'] = req.query.accountId;
        if (req.query.status) filter.status = req.query.status;
        if (req.query.from || req.query.to) {
            filter.date = {};
            if (req.query.from) filter.date.$gte = new Date(req.query.from);
            if (req.query.to) filter.date.$lte = new Date(req.query.to);
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
        if (await isPeriodClosed(payload.date)) {
            return res.status(409).json({ error: `Period ${payload.date} is closed. Reopen it before adding entries.` });
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

// ── CLOSE PERIOD ──────────────────────────────────────────────────────────────
router.post('/close-period', async (req, res) => {
    try {
        const { year, month } = req.body;
        const doc = await LedgerPeriodClose.findOneAndUpdate(
            { year, month },
            { $setOnInsert: { id: `close_${year}_${month}`, year, month, closedBy: req.session?.user?.email || '' } },
            { upsert: true, new: true },
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
