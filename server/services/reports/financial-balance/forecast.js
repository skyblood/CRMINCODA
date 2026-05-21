/**
 * Cash Forecast 90 days section of the financial balance report.
 *
 * Exports: computeForecast(db, params) → { pessimistic, base, optimistic, cashCrunchDate }
 *
 * Three scenarios:
 *   Pessimistic: only issued invoices, applying client-specific DSO
 *   Base: above + 50% of weighted pipeline
 *   Optimistic: above + 80% of pipeline
 *
 * Each scenario produces weekly cash position projections crossed against recurring expenses.
 */
import Invoice from '../../../models/Invoice.js';
import Payment from '../../../models/Payment.js';
import Transaction from '../../../models/Transaction.js';
import Lead from '../../../models/Lead.js';

const STAGE_PROBABILITY = {
  new: 0.05,
  contacted: 0.10,
  qualified: 0.20,
  proposal: 0.40,
  negotiation: 0.60,
};

export async function computeForecast(_db, params) {
  const { from, to } = params;
  const now = new Date();
  const forecast90 = new Date(now.getTime() + 90 * 86400000);

  // ── Current cash position (total collected minus total expenses) ───────
  const [collectedResult] = await Payment.aggregate([
    { $group: { _id: null, total: { $sum: '$amountUSD' } } },
  ]);
  const totalCollected = collectedResult?.total || 0;

  const [expensesResult] = await Transaction.aggregate([
    { $match: { type: 'expense' } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$amountUSD', '$amount'] } } } },
  ]);
  const totalExpenses = expensesResult?.total || 0;

  const currentCash = totalCollected - totalExpenses;

  // ── Monthly recurring expenses (average of last 3 months) ──────────────
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const recentExpenses = await Transaction.aggregate([
    { $match: { type: 'expense', dateObj: { $gte: threeMonthsAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$dateObj' } },
        total: { $sum: { $ifNull: ['$amountUSD', '$amount'] } },
      },
    },
  ]);
  const monthlyExpenseAvg = recentExpenses.length > 0
    ? recentExpenses.reduce((s, m) => s + m.total, 0) / recentExpenses.length
    : 0;
  const weeklyExpense = monthlyExpenseAvg / 4;

  // ── Client DSO map ─────────────────────────────────────────────────────
  const clientDSO = {};
  const dsoPipeline = await Payment.aggregate([
    { $unwind: '$appliedTo' },
    {
      $lookup: {
        from: 'invoices',
        let: { invId: '$appliedTo.invoiceId' },
        pipeline: [
          { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$invId'] } } },
          { $project: { issueDate: 1, clientId: 1 } },
        ],
        as: '_inv',
      },
    },
    { $unwind: { path: '$_inv', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$_inv.clientId',
        avgDays: {
          $avg: {
            $divide: [
              { $subtract: ['$paymentDate', '$_inv.issueDate'] },
              86400000,
            ],
          },
        },
      },
    },
  ]);
  for (const row of dsoPipeline) {
    if (row._id) clientDSO[row._id] = Math.max(0, Math.round(row.avgDays));
  }
  const globalDSO = dsoPipeline.length > 0
    ? Math.round(dsoPipeline.reduce((s, r) => s + (r.avgDays || 0), 0) / dsoPipeline.length)
    : 45; // Default 45 days if no history

  // ── Open invoices (pessimistic base) ───────────────────────────────────
  const openInvoices = await Invoice.find({
    status: { $in: ['issued', 'partially_paid', 'overdue'] },
    deleted: { $ne: true },
  }).lean();

  // Expected collection date = issueDate + clientDSO
  const pessimisticInflows = [];
  for (const inv of openInvoices) {
    const dso = clientDSO[inv.clientId] || globalDSO;
    const issueDate = inv.issueDate ? new Date(inv.issueDate) : now;
    const expectedDate = new Date(issueDate.getTime() + dso * 86400000);
    const balance = inv.balanceUSD || 0;
    if (balance > 0 && expectedDate <= forecast90) {
      pessimisticInflows.push({ date: expectedDate, amount: balance, source: 'invoice', ref: inv.invoiceNumber });
    }
  }

  // ── Pipeline inflows ───────────────────────────────────────────────────
  const pipelineLeads = await Lead.find({
    deleted: { $ne: true },
    stage: { $in: ['proposal', 'negotiation'] },
  }).lean();

  const pipelineInflows = pipelineLeads.map(l => {
    const prob = STAGE_PROBABILITY[l.stage] || 0;
    const closeDate = l.expectedCloseDate ? new Date(l.expectedCloseDate) : new Date(now.getTime() + 60 * 86400000);
    const expectedCollection = new Date(closeDate.getTime() + globalDSO * 86400000);
    return {
      date: expectedCollection <= forecast90 ? expectedCollection : forecast90,
      amount: (l.value || 0) * prob,
      source: 'pipeline',
      ref: l.companyName || l.name,
    };
  }).filter(p => p.amount > 0);

  // ── Generate weekly projections ────────────────────────────────────────
  function buildWeeklyProjection(inflows, label) {
    const weeks = [];
    let runningCash = currentCash;

    for (let w = 0; w < 13; w++) {
      const weekStart = new Date(now.getTime() + w * 7 * 86400000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

      const weekInflow = inflows
        .filter(i => i.date >= weekStart && i.date < weekEnd)
        .reduce((s, i) => s + i.amount, 0);

      runningCash += weekInflow - weeklyExpense;

      weeks.push({
        week: w + 1,
        weekStart: weekStart.toISOString().slice(0, 10),
        inflow: Math.round(weekInflow),
        outflow: Math.round(weeklyExpense),
        cashPosition: Math.round(runningCash),
      });
    }
    return weeks;
  }

  const pessimistic = buildWeeklyProjection(pessimisticInflows, 'pessimistic');

  const baseInflows = [
    ...pessimisticInflows,
    ...pipelineInflows.map(p => ({ ...p, amount: p.amount * 0.50 })),
  ];
  const base = buildWeeklyProjection(baseInflows, 'base');

  const optimisticInflows = [
    ...pessimisticInflows,
    ...pipelineInflows.map(p => ({ ...p, amount: p.amount * 0.80 })),
  ];
  const optimistic = buildWeeklyProjection(optimisticInflows, 'optimistic');

  // ── Cash Crunch Date ───────────────────────────────────────────────────
  // First week where base scenario cash position goes negative
  const crunchWeek = base.find(w => w.cashPosition < 0);
  const cashCrunchDate = crunchWeek ? crunchWeek.weekStart : null;

  return {
    pessimistic,
    base,
    optimistic,
    cashCrunchDate,
    currentCash: Math.round(currentCash),
    monthlyExpenseAvg: Math.round(monthlyExpenseAvg),
    globalDSO,
  };
}
