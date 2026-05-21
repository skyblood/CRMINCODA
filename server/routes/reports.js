import { Router } from 'express';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import { generateFinancialBalance } from '../services/reports/financial-balance/index.js';

const router = Router();

// ── FINANCIAL BALANCE (admin only) ──────────────────────────────────────────
router.get('/financial-balance', async (req, res) => {
  // RBAC: admin guard — accept role=admin OR permissions.admin=true
  const u = req.session?.user;
  if (!u || (u.role !== 'admin' && !u.permissions?.admin)) {
    return res.status(403).json({ error: 'Admin required' });
  }

  try {
    const now = new Date();
    const from = req.query.from
      ? new Date(req.query.from)
      : new Date(now.getFullYear(), now.getMonth() - 12, 1);
    const to = req.query.to
      ? new Date(req.query.to)
      : now;
    const currency = req.query.currency || 'USD';
    const includeLegacy = req.query.includeLegacy === 'true';

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use ISO 8601 (YYYY-MM-DD).' });
    }

    const report = await generateFinancialBalance({ from, to, currency, includeLegacy });
    res.json(report);
  } catch (err) {
    console.error('[financial-balance] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── AR AGING ─────────────────────────────────────────────────────────────────
// Buckets: current (not yet due), 1-30, 31-60, 61-90, 90+
router.get('/ar-aging', async (_req, res) => {
  try {
    const now = new Date();
    const openInvoices = await Invoice.find({
      status: { $in: ['issued', 'partially_paid', 'overdue'] },
      deleted: { $ne: true },
    }).lean();

    const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const details = [];

    for (const inv of openInvoices) {
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
      const daysOverdue = dueDate ? Math.floor((now - dueDate) / 86400000) : 0;
      const balance = inv.balanceUSD || 0;

      let bucket;
      if (daysOverdue <= 0) bucket = 'current';
      else if (daysOverdue <= 30) bucket = '1-30';
      else if (daysOverdue <= 60) bucket = '31-60';
      else if (daysOverdue <= 90) bucket = '61-90';
      else bucket = '90+';

      buckets[bucket] += balance;
      details.push({
        invoiceId: inv._id,
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.clientName,
        dueDate: inv.dueDate,
        daysOverdue: Math.max(0, daysOverdue),
        balanceUSD: balance,
        bucket,
      });
    }

    res.json({ buckets, total: Object.values(buckets).reduce((a, b) => a + b, 0), details });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CASH VS BILLED (last 12 months) ─────────────────────────────────────────
router.get('/cash-vs-billed', async (_req, res) => {
  try {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [billed, collected] = await Promise.all([
      Invoice.aggregate([
        {
          $match: {
            status: { $ne: 'void' },
            deleted: { $ne: true },
            issueDate: { $gte: twelveMonthsAgo },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$issueDate' } },
            totalUSD: { $sum: '$totalUSD' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Payment.aggregate([
        { $match: { paymentDate: { $gte: twelveMonthsAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } },
            totalUSD: { $sum: '$amountUSD' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Merge into monthly array
    const months = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = { month: key, billed: 0, billedCount: 0, collected: 0, collectedCount: 0 };
    }
    for (const b of billed) {
      if (months[b._id]) { months[b._id].billed = b.totalUSD; months[b._id].billedCount = b.count; }
    }
    for (const c of collected) {
      if (months[c._id]) { months[c._id].collected = c.totalUSD; months[c._id].collectedCount = c.count; }
    }

    res.json(Object.values(months));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DSO (Days Sales Outstanding) ─────────────────────────────────────────────
router.get('/dso', async (_req, res) => {
  try {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    // Global DSO = (Total AR / Total Revenue Last 12m) * 365
    const [arResult] = await Invoice.aggregate([
      {
        $match: {
          status: { $in: ['issued', 'partially_paid', 'overdue'] },
          deleted: { $ne: true },
        },
      },
      { $group: { _id: null, totalAR: { $sum: '$balanceUSD' } } },
    ]);

    const [revenueResult] = await Invoice.aggregate([
      {
        $match: {
          status: { $ne: 'void' },
          deleted: { $ne: true },
          issueDate: { $gte: twelveMonthsAgo },
        },
      },
      { $group: { _id: null, totalRevenue: { $sum: '$totalUSD' } } },
    ]);

    const totalAR = arResult?.totalAR || 0;
    const totalRevenue = revenueResult?.totalRevenue || 0;
    const globalDSO = totalRevenue > 0 ? Math.round((totalAR / totalRevenue) * 365) : 0;

    // Per-client DSO
    const clientAR = await Invoice.aggregate([
      {
        $match: {
          status: { $in: ['issued', 'partially_paid', 'overdue'] },
          deleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$clientId',
          clientName: { $first: '$clientName' },
          ar: { $sum: '$balanceUSD' },
        },
      },
    ]);

    const clientRevenue = await Invoice.aggregate([
      {
        $match: {
          status: { $ne: 'void' },
          deleted: { $ne: true },
          issueDate: { $gte: twelveMonthsAgo },
        },
      },
      { $group: { _id: '$clientId', revenue: { $sum: '$totalUSD' } } },
    ]);

    const revenueMap = Object.fromEntries(clientRevenue.map(c => [c._id, c.revenue]));
    const byClient = clientAR.map(c => ({
      clientId: c._id,
      clientName: c.clientName,
      ar: c.ar,
      revenue: revenueMap[c._id] || 0,
      dso: revenueMap[c._id] > 0 ? Math.round((c.ar / revenueMap[c._id]) * 365) : 0,
    })).sort((a, b) => b.dso - a.dso);

    res.json({ globalDSO, totalAR, totalRevenue, byClient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TOP DEBTORS ──────────────────────────────────────────────────────────────
router.get('/top-debtors', async (_req, res) => {
  try {
    const result = await Invoice.aggregate([
      {
        $match: {
          status: { $in: ['issued', 'partially_paid', 'overdue'] },
          deleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$clientId',
          clientName: { $first: '$clientName' },
          totalOwedUSD: { $sum: '$balanceUSD' },
          invoiceCount: { $sum: 1 },
          oldestDueDate: { $min: '$dueDate' },
        },
      },
      { $sort: { totalOwedUSD: -1 } },
      { $limit: 20 },
    ]);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CASH-IN (monthly) ────────────────────────────────────────────────────────
router.get('/cash-in', async (_req, res) => {
  try {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const result = await Payment.aggregate([
      { $match: { paymentDate: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } },
          totalUSD: { $sum: '$amountUSD' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
