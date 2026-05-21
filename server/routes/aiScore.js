import { Router } from 'express';
import Lead from '../models/Lead.js';
import { scoreLead } from '../services/leadScoring.js';
import { logAudit } from '../auditService.js';
import { emitCollectionChange } from '../socketInstance.js';

const router = Router();

// POST /api/leads/:id/score  — trigger AI scoring for a single lead
router.post('/:id/score', async (req, res) => {
    try {
        const lead = await Lead.findOne({ id: req.params.id }).lean();
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        const { score, reason, nextAction } = await scoreLead(lead);

        const updated = await Lead.findOneAndUpdate(
            { id: req.params.id },
            { $set: { aiScore: score, aiScoreReason: reason, aiNextAction: nextAction || '' } },
            { new: true, lean: true }
        );
        const { _id, __v, createdAt, updatedAt, ...rest } = updated;

        logAudit({
            entityType: 'lead', entityId: rest.id, action: 'scored',
            userId: req.session?.user?.id, userName: req.session?.user?.name,
            meta: { score, reason, nextAction },
        });
        emitCollectionChange('leads', 'updated', rest);

        res.json({ score, reason, nextAction });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/leads/score-all  — batch score all active leads
router.post('/score-all', async (req, res) => {
    try {
        const leads = await Lead.find({ deleted: { $ne: true }, stage: { $nin: ['closed-won', 'closed-lost'] } }).lean();
        const results = [];

        for (const lead of leads) {
            const { score, reason, nextAction } = await scoreLead(lead);
            await Lead.updateOne({ id: lead.id }, { $set: { aiScore: score, aiScoreReason: reason, aiNextAction: nextAction || '' } });
            results.push({ id: lead.id, score, reason, nextAction });
        }

        emitCollectionChange('leads', 'batch_scored', { count: results.length });
        res.json({ scored: results.length, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
