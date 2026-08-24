// server/routes/leadEnrichment.js
import { Router } from 'express';
import Lead from '../models/Lead.js';
import { enrichLead } from '../services/leadEnrichmentService.js';

const router = Router();

// POST /api/leads/:id/enrich — admin only: force a single lead's re-enrichment on demand
router.post('/:id/enrich', async (req, res) => {
  try {
    if (!req.session?.user?.permissions?.admin) return res.status(403).json({ error: 'Forbidden' });

    const lead = await Lead.findOne({ id: req.params.id });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const result = await enrichLead(lead);
    lead.enrichment = result;
    await lead.save();

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
