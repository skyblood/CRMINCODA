import { Router } from 'express';
import User from '../models/User.js';
import { encrypt, decrypt } from '../utils/encryption.js';

const router = Router();

function maskedProfile(user) {
  const t = user?.taxInfo || {};
  return {
    legalName: t.legalName || '',
    tinLast4: t.tinLast4 || '',
    tinType: t.tinType || '',
    address: t.address || {},
    w9SubmittedAt: t.w9SubmittedAt || null,
  };
}

function isFinanceOrAdmin(sessionUser) {
  return !!(sessionUser?.permissions?.finance || sessionUser?.permissions?.admin);
}

router.get('/me', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  const user = await User.findOne({ id: req.session.user.id }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(maskedProfile(user));
});

router.put('/me', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });

  const { legalName, tin, tinType, address } = req.body || {};
  const digits = String(tin || '').replace(/\D/g, '');
  if (digits.length !== 9) {
    return res.status(400).json({ error: 'TIN must be 9 digits' });
  }

  const user = await User.findOne({ id: req.session.user.id });
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.taxInfo = {
    legalName: legalName || '',
    tinEncrypted: encrypt(digits),
    tinLast4: digits.slice(-4),
    tinType: tinType === 'EIN' ? 'EIN' : 'SSN',
    address: address || {},
    w9SubmittedAt: new Date(),
  };
  await user.save();

  res.json(maskedProfile(user));
});

router.get('/admin/:userId', async (req, res) => {
  if (!isFinanceOrAdmin(req.session?.user)) return res.status(403).json({ error: 'Forbidden' });

  const user = await User.findOne({ id: req.params.userId }).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  const t = user.taxInfo || {};
  res.json({
    legalName: t.legalName || '',
    tin: t.tinEncrypted ? decrypt(t.tinEncrypted) : '',
    tinType: t.tinType || '',
    address: t.address || {},
    w9SubmittedAt: t.w9SubmittedAt || null,
  });
});

export default router;
