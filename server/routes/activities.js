import { Router } from 'express';
import Activity from '../models/Activity.js';
import { emitCollectionChange } from '../socketInstance.js';

const router = Router();

const clean = ({ _id, __v, createdAt, updatedAt, ...rest }) => rest;

// GET — filter by entityId + entityType (required for timeline)
router.get('/', async (req, res) => {
    try {
        const { entityId, entityType } = req.query;
        if (!entityId || !entityType) {
            return res.status(400).json({ error: 'entityId and entityType are required' });
        }
        const docs = await Activity.find({ entityId, entityType })
            .sort({ date: -1 })
            .limit(200)
            .lean();
        res.json(docs.map(clean));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST — create a new activity (manual note or system event)
router.post('/', async (req, res) => {
    try {
        const { _id, __v, ...payload } = req.body;
        if (!payload.date) payload.date = new Date().toISOString();
        const doc = await Activity.create(payload);
        const result = clean(doc.toObject());
        emitCollectionChange('activities', 'created', result);
        res.status(201).json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE — remove a manual activity entry
router.delete('/:id', async (req, res) => {
    try {
        const result = await Activity.findOneAndDelete({ id: req.params.id });
        if (!result) return res.status(404).json({ error: 'Not found' });
        emitCollectionChange('activities', 'deleted', { id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
