import { Router } from 'express';
import EmailLog from '../models/EmailLog.js';

const router = Router();

// GET /api/email-logs?leadId=xxx&limit=50
router.get('/', async (req, res) => {
    try {
        const { leadId, limit = 50 } = req.query;
        const filter = leadId ? { leadId } : {};
        const logs = await EmailLog.find(filter)
            .sort({ createdAt: -1 })
            .limit(Math.min(Number(limit), 200))
            .lean();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
