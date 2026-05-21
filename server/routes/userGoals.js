import { Router } from 'express';
import { nanoid } from 'nanoid';
import UserGoal from '../models/UserGoal.js';

const router = Router();

// GET all — optionally filter by ?year=
router.get('/', async (req, res) => {
    try {
        const filter = {};
        if (req.query.year) filter.year = Number(req.query.year);
        if (req.query.userId) filter.userId = req.query.userId;
        const docs = await UserGoal.find(filter).lean();
        res.json(docs.map(({ _id, __v, createdAt, updatedAt, ...rest }) => rest));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPSERT — create or overwrite goal for userId + year
router.put('/', async (req, res) => {
    try {
        const { userId, userName, year, target, type } = req.body;
        if (!userId || !year || target === undefined)
            return res.status(400).json({ error: 'userId, year, and target are required' });

        const doc = await UserGoal.findOneAndUpdate(
            { userId, year },
            { $set: { userName: userName || '', target, type: type || 'revenue' }, $setOnInsert: { id: nanoid() } },
            { upsert: true, new: true }
        ).lean();
        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        res.json(rest);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE by userId + year
router.delete('/', async (req, res) => {
    try {
        const { userId, year } = req.query;
        if (!userId || !year) return res.status(400).json({ error: 'userId and year required' });
        await UserGoal.deleteOne({ userId, year: Number(year) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
