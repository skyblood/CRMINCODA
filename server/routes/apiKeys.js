/**
 * Admin-only API Key management routes.
 * All routes require internal CRM access (no external auth needed here —
 * the frontend only calls these when logged-in as admin).
 */
import { Router } from 'express';
import crypto from 'crypto';
import ApiKey from '../models/ApiKey.js';
import { invalidateKeyCache } from '../middleware/apiKeyAuth.js';

const router = Router();

const generateId = () => crypto.randomBytes(8).toString('hex');

// GET ALL — list all keys (never returns the plain key)
router.get('/', async (_req, res) => {
    try {
        const docs = await ApiKey.find().lean().sort({ createdAt: -1 });
        const safe = docs.map(({ _id, __v, keyHash, ...rest }) => rest);
        res.json(safe);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST — create a new key (returns the plain key ONCE)
router.post('/', async (req, res) => {
    const { name, scopes, createdBy } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });

    const plainKey = `crm_bm_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
    const keyPrefix = plainKey.slice(0, 16) + '…';

    try {
        const doc = await ApiKey.create({
            id: generateId(),
            name,
            keyHash,
            keyPrefix,
            scopes: scopes || ['leads', 'projects', 'contacts', 'users', 'pipeline'],
            createdBy: createdBy || '',
        });

        const { _id, __v, keyHash: _kh, ...rest } = doc.toObject();
        // Return plain key once — never stored in plain text
        res.status(201).json({ ...rest, plainKey });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT /:id — toggle active / update name or scopes
router.put('/:id', async (req, res) => {
    try {
        const { id: _id, keyHash: _kh, plainKey: _pk, ...updateData } = req.body;
        const doc = await ApiKey.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { new: true, lean: true }
        );
        if (!doc) return res.status(404).json({ error: 'Not found' });

        // Invalidate cache so changes (e.g. deactivation) take effect immediately
        invalidateKeyCache(doc.keyHash);

        const { _id: __id, __v, keyHash, ...safe } = doc;
        res.json(safe);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE /:id — permanently delete a key
router.delete('/:id', async (req, res) => {
    try {
        const result = await ApiKey.findOneAndDelete({ id: req.params.id });
        if (!result) return res.status(404).json({ error: 'Not found' });

        // Invalidate cache so the deleted key is rejected immediately
        invalidateKeyCache(result.keyHash);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
