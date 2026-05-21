import { Router } from 'express';
import { nanoid } from 'nanoid';
import EmailTemplate from '../models/EmailTemplate.js';

const router = Router();

// Merge field substitution — replaces {{field}} with lead data
export const applyMergeFields = (text, lead) => {
    if (!text || !lead) return text;
    return text
        .replace(/\{\{companyName\}\}/g, lead.companyName || '')
        .replace(/\{\{contactName\}\}/g, lead.contactName || '')
        .replace(/\{\{email\}\}/g, lead.email || '')
        .replace(/\{\{phone\}\}/g, lead.phone || '')
        .replace(/\{\{value\}\}/g, lead.value ? `$${lead.value.toLocaleString()}` : '')
        .replace(/\{\{stage\}\}/g, lead.stage || '')
        .replace(/\{\{nextStep\}\}/g, lead.nextStep || '')
        .replace(/\{\{expectedCloseDate\}\}/g, lead.expectedCloseDate || '');
};

router.get('/', async (_req, res) => {
    try {
        const docs = await EmailTemplate.find().lean();
        res.json(docs.map(({ _id, __v, ...rest }) => rest));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const doc = await EmailTemplate.create({ id: nanoid(), ...req.body });
        const { _id, __v, ...rest } = doc.toObject();
        res.status(201).json(rest);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { id: _bodyId, ...update } = req.body;
        const doc = await EmailTemplate.findOneAndUpdate({ id: req.params.id }, { $set: update }, { new: true, lean: true });
        if (!doc) return res.status(404).json({ error: 'Not found' });
        const { _id, __v, ...rest } = doc;
        res.json(rest);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await EmailTemplate.deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /preview — apply merge fields to a template body without saving
router.post('/preview', (req, res) => {
    const { subject, body, lead } = req.body;
    res.json({
        subject: applyMergeFields(subject, lead),
        body: applyMergeFields(body, lead),
    });
});

export default router;
