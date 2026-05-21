/**
 * Revenue section of the financial balance report.
 *
 * Exports: computeRevenue(db, params) → { mrrVsOneShot, billedVsCollectedMonthly, dso, arAging, topClientsByRevenue, topDebtors, concentrationRisk }
 */
import Invoice from '../../../models/Invoice.js';
import Payment from '../../../models/Payment.js';

/**
 * @param {object} db — unused (models imported directly), kept for interface consistency
 * @param {object} params — { from: Date, to: Date, currency: string, includeLegacy: boolean }
 */
export async function computeRevenue(_db, params) {
  const { from, to, currency, includeLegacy } = params;

  const invoiceMatch = {
    status: { $ne: 'void' },
    deleted: { $ne: true },
    issueDate: { $gte: from, $lte: to },
  };
  if (!includeLegacy) {
    invoiceMatch.legacy_migration = { $ne: true };
  }

  const paymentMatch = {
    paymentDate: { $gte: from, $lte: to },
  };

  // ── MRR vs One-Shot ────────────────────────────────────────────────────
  // Recurring = invoices linked to HOURS_PACK projects (subscription-like)
  // One-shot = IMPLEMENTATION, LICENSE, or anything else
  const mrrPipeline = await Invoice.aggregate([
    { $match: invoiceMatch },
    {
      $lookup: {
        from: 'projects',
        let: { pid: '$projectId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$id', '$$pid'] } } },
          { $project: { type: 1 } },
        ],
        as: '_project',
      },
    },
    { $unwind: { path: '$_project', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: {
          type: {
            $cond: [
              { $regexMatch: { input: { $ifNull: ['$_project.type', ''] }, regex: /hours_pack/i } },
              'recurring',
              'one_shot',
            ],
          },
        },
        totalUSD: { $sum: '$totalUSD' },
        count: { $sum: 1 },
      },
    },
  ]);

  const mrrVsOneShot = { recurring: 0, oneShot: 0, recurringCount: 0, oneShotCount: 0 };
  for (const row of mrrPipeline) {
    if (row._id.type === 'recurring') {
      mrrVsOneShot.recurring = row.totalUSD;
      mrrVsOneShot.recurringCount = row.count;
    } else {
      mrrVsOneShot.oneShot = row.totalUSD;
      mrrVsOneShot.oneShotCount = row.count;
    }
  }

  // ── Billed vs Collected Monthly ────────────────────────────────────────
  const [billedMonthly, collectedMonthly] = await Promise.all([
    Invoice.aggregate([
      { $match: invoiceMatch },
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
      { $match: paymentMatch },
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

  // Merge into unified monthly timeline
  const monthSet = new Set();
  billedMonthly.forEach(b => monthSet.add(b._id));
  collectedMonthly.forEach(c => monthSet.add(c._id));
  const billedMap = Object.fromEntries(billedMonthly.map(b => [b._id, b]));
  const collectedMap = Object.fromEntries(collectedMonthly.map(c => [c._id, c]));

  const billedVsCollectedMonthly = [...monthSet].sort().map(month => ({
    month,
    billed: billedMap[month]?.totalUSD || 0,
    billedCount: billedMap[month]?.count || 0,
    collected: collectedMap[month]?.totalUSD || 0,
    collectedCount: collectedMap[month]?.count || 0,
  }));

  // ── DSO (weighted by amount) ───────────────────────────────────────────
  // DSO = sum(paymentDate - issueDate) * amountApplied / sum(amountApplied)
  const dsoPipeline = await Payment.aggregate([
    { $match: paymentMatch },
    { $unwind: '$appliedTo' },
    {
      $lookup: {
        from: 'invoices',
        let: { invId: '$appliedTo.invoiceId' },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$invId'] } } },
          { $project: { issueDate: 1, clientId: 1, clientName: 1 } },
        ],
        as: '_invoice',
      },
    },
    { $unwind: { path: '$_invoice', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        clientId: '$_invoice.clientId',
        clientName: '$_invoice.clientName',
        amountAppliedUSD: '$appliedTo.amountAppliedUSD',
        daysDiff: {
          $divide: [
            { $subtract: ['$paymentDate', '$_invoice.issueDate'] },
            86400000, // ms → days
          ],
        },
      },
    },
    {
      $group: {
        _id: '$clientId',
        clientName: { $first: '$clientName' },
        weightedDays: { $sum: { $multiply: ['$daysDiff', '$amountAppliedUSD'] } },
        totalAmount: { $sum: '$amountAppliedUSD' },
      },
    },
  ]);

  const byClient = dsoPipeline.map(c => ({
    clientId: c._id,
    clientName: c.clientName,
    dso: c.totalAmount > 0 ? Math.round(c.weightedDays / c.totalAmount) : 0,
    totalPaidUSD: c.totalAmount,
  })).sort((a, b) => b.dso - a.dso);

  const globalWeightedDays = dsoPipeline.reduce((s, c) => s + c.weightedDays, 0);
  const globalTotalAmount = dsoPipeline.reduce((s, c) => s + c.totalAmount, 0);
  const globalDSO = globalTotalAmount > 0 ? Math.round(globalWeightedDays / globalTotalAmount) : 0;

  const dso = { global: globalDSO, byClient };

  // ── AR Aging ───────────────────────────────────────────────────────────
  const now = new Date();
  const openInvoices = await Invoice.find({
    status: { $in: ['issued', 'partially_paid', 'overdue'] },
    deleted: { $ne: true },
  }).lean();

  const arAging = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  for (const inv of openInvoices) {
    const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
    const daysOverdue = dueDate ? Math.floor((now - dueDate) / 86400000) : 0;
    const balance = inv.balanceUSD || 0;

    if (daysOverdue <= 30) arAging['0-30'] += balance;
    else if (daysOverdue <= 60) arAging['31-60'] += balance;
    else if (daysOverdue <= 90) arAging['61-90'] += balance;
    else arAging['90+'] += balance;
  }

  // ── Top Clients by Revenue ─────────────────────────────────────────────
  const topClientsPipeline = await Invoice.aggregate([
    { $match: invoiceMatch },
    {
      $group: {
        _id: '$clientId',
        clientName: { $first: '$clientName' },
        totalUSD: { $sum: '$totalUSD' },
        invoiceCount: { $sum: 1 },
      },
    },
    { $sort: { totalUSD: -1 } },
    { $limit: 10 },
  ]);

  // ── Top Debtors ────────────────────────────────────────────────────────
  const topDebtors = await Invoice.aggregate([
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
    { $limit: 10 },
  ]);

  // ── Concentration Risk ─────────────────────────────────────────────────
  const totalRevenue = topClientsPipeline.reduce((s, c) => s + c.totalUSD, 0);
  const topClient = topClientsPipeline[0];
  const top3Revenue = topClientsPipeline.slice(0, 3).reduce((s, c) => s + c.totalUSD, 0);

  const concentrationRisk = {
    topClientPct: totalRevenue > 0 ? Math.round((topClient?.totalUSD || 0) / totalRevenue * 100) : 0,
    top3Pct: totalRevenue > 0 ? Math.round(top3Revenue / totalRevenue * 100) : 0,
    herfindahlIndex: totalRevenue > 0
      ? Math.round(topClientsPipeline.reduce((s, c) => s + Math.pow(c.totalUSD / totalRevenue * 100, 2), 0))
      : 0,
    alert: null,
  };
  if (concentrationRisk.topClientPct > 40) {
    concentrationRisk.alert = `Top client represents ${concentrationRisk.topClientPct}% of revenue — high concentration risk`;
  }

  return {
    mrrVsOneShot,
    billedVsCollectedMonthly,
    dso,
    arAging,
    topClientsByRevenue: topClientsPipeline,
    topDebtors,
    concentrationRisk,
  };
}
