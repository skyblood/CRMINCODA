import { Router } from 'express';
import Notification from '../models/Notification.js';
const router = Router();

// Middleware: require login
router.use((req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
});

const getUserId = (req) => req.session.user.id || req.session.user._id;

// GET /api/notifications?page=1&limit=20&unreadOnly=false
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const unreadOnly = req.query.unreadOnly === 'true';
    const query = { userId, dismissed: { $ne: true } };
    if (unreadOnly) query.read = false;
    const total = await Notification.countDocuments(query);
    const items = await Notification.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: getUserId(req), read: false, dismissed: { $ne: true } });
    res.json({ count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/notifications/read-all  (must be before /:id routes)
router.put('/read-all', async (req, res) => {
  try {
    await Notification.updateMany({ userId: getUserId(req), read: false }, { read: true, readAt: new Date() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true, readAt: new Date() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/notifications/:id/dismiss
router.put('/:id/dismiss', async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { dismissed: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
