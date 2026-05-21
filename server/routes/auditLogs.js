import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';

const router = Router();

// GET /api/audit-logs?entityId=<id>&entityType=lead&limit=50
router.get('/', async (req, res) => {
    try {
        const filter = {};
        if (req.query.entityId)   filter.entityId   = req.query.entityId;
        if (req.query.entityType) filter.entityType = req.query.entityType;

        const limit = Math.min(200, parseInt(req.query.limit) || 50);
        const logs  = await AuditLog.find(filter)
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
