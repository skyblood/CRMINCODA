import { Router } from 'express';
import Webhook from '../models/Webhook.js';
import WebhookLog from '../models/WebhookLog.js';

const router = Router();

// Admin guard
router.use((req, res, next) => {
  if (!req.session?.user?.permissions?.admin) return res.status(403).json({ error: 'Admin required' });
  next();
});

// GET / — list all webhooks
router.get('/', async (_req, res) => {
  try {
    const webhooks = await Webhook.find().lean();
    res.json(webhooks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create webhook
router.post('/', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.startsWith('https://')) {
      return res.status(400).json({ error: 'URL must start with https://' });
    }
    const webhook = await Webhook.create({
      ...req.body,
      createdBy: req.session.user?.email || req.session.user?.id
    });
    res.status(201).json(webhook);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /:id — update webhook
router.put('/:id', async (req, res) => {
  try {
    const { url } = req.body;
    if (url && !url.startsWith('https://')) {
      return res.status(400).json({ error: 'URL must start with https://' });
    }
    const webhook = await Webhook.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, lean: true });
    if (!webhook) return res.status(404).json({ error: 'Not found' });
    res.json(webhook);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /:id — delete webhook
router.delete('/:id', async (req, res) => {
  try {
    const result = await Webhook.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id/toggle — toggle isActive
router.put('/:id/toggle', async (req, res) => {
  try {
    const webhook = await Webhook.findById(req.params.id);
    if (!webhook) return res.status(404).json({ error: 'Not found' });
    webhook.isActive = !webhook.isActive;
    if (webhook.isActive) {
      webhook.disabledAt = undefined;
      webhook.disabledReason = undefined;
    }
    await webhook.save();
    res.json(webhook);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/test — send test payload
router.post('/:id/test', async (req, res) => {
  try {
    const webhook = await Webhook.findById(req.params.id);
    if (!webhook) return res.status(404).json({ error: 'Not found' });

    const payload = JSON.stringify({
      event: 'test.ping',
      timestamp: new Date().toISOString(),
      data: { message: 'Test from Incoda CRM' },
      metadata: { crmVersion: '1.0.0', triggeredBy: req.session.user?.email || 'admin' }
    });

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Incoda-CRM/1.0',
      ...Object.fromEntries(webhook.headers || [])
    };

    const start = Date.now();
    const fetchRes = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(10000)
    });
    const duration = Date.now() - start;
    res.json({ status: fetchRes.status, ok: fetchRes.ok, duration });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/logs — last 50 logs for this webhook
router.get('/:id/logs', async (req, res) => {
  try {
    const logs = await WebhookLog.find({ webhookId: req.params.id })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
