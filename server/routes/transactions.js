import { Router } from 'express';
import Transaction from '../models/Transaction.js';
import { deepSanitize } from '../middleware/sanitize.js';
import { dispatchWebhooks } from '../webhookService.js';

const IMMUTABLE_FIELDS = ['_id', '__v', 'keyHash', 'passwordHash', 'createdAt', 'updatedAt'];

const router = Router();

// GET ALL
router.get('/', async (_req, res) => {
  try {
    const docs = await Transaction.find().lean();
    const cleaned = docs.map(({ _id, __v, createdAt, updatedAt, ...rest }) => rest);
    res.json(cleaned);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET BY ID
router.get('/:id', async (req, res) => {
  try {
    const doc = await Transaction.findOne({ id: req.params.id }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const { _id, __v, createdAt, updatedAt, ...rest } = doc;
    res.json(rest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE
router.post('/', async (req, res) => {
  try {
    const payload = deepSanitize(req.body, true);
    IMMUTABLE_FIELDS.forEach(f => delete payload[f]);
    const doc = await Transaction.create(payload);
    const { _id, __v, createdAt, updatedAt, ...rest } = doc.toObject();
    dispatchWebhooks('transaction.created', rest, req.session?.user?.email).catch(() => {});
    res.status(201).json(rest);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    const { id, ...updateData } = req.body;
    IMMUTABLE_FIELDS.forEach(f => delete updateData[f]);
    const doc = await Transaction.findOneAndUpdate(
      { id: req.params.id },
      { $set: updateData },
      { new: true, lean: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const { _id, __v, createdAt, updatedAt, ...rest } = doc;
    res.json(rest);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const result = await Transaction.findOneAndDelete({ id: req.params.id });
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
