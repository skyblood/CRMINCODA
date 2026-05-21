/**
 * Expenses section of the financial balance report.
 *
 * Exports: computeExpenses(db, params) → { byCategory, monthlyTrend, recommendations, benchmarks }
 */
import Transaction from '../../../models/Transaction.js';
import User from '../../../models/User.js';
import Invoice from '../../../models/Invoice.js';

export async function computeExpenses(_db, params) {
  const { from, to } = params;

  // ── By Category ────────────────────────────────────────────────────────
  const byCategory = await Transaction.aggregate([
    {
      $match: {
        type: 'expense',
        dateObj: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: '$category',
        totalUSD: { $sum: { $ifNull: ['$amountUSD', '$amount'] } },
        count: { $sum: 1 },
      },
    },
    { $sort: { totalUSD: -1 } },
  ]);

  // ── Monthly Trend ──────────────────────────────────────────────────────
  const monthlyTrend = await Transaction.aggregate([
    {
      $match: {
        type: 'expense',
        dateObj: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: {
          month: { $dateToString: { format: '%Y-%m', date: '$dateObj' } },
          category: '$category',
        },
        totalUSD: { $sum: { $ifNull: ['$amountUSD', '$amount'] } },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.month': 1 } },
  ]);

  // Reshape into { month, total, byCategory: { cat: amount } }
  const monthMap = {};
  for (const row of monthlyTrend) {
    const month = row._id.month;
    if (!monthMap[month]) monthMap[month] = { month, total: 0, byCategory: {} };
    monthMap[month].total += row.totalUSD;
    monthMap[month].byCategory[row._id.category || 'other'] = row.totalUSD;
  }
  const monthlyTrendSorted = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

  // ── Expense Rules (recommendations) ────────────────────────────────────
  const recommendations = await computeExpenseRecommendations(monthlyTrendSorted, from, to);

  // ── Benchmarks ─────────────────────────────────────────────────────────
  const totalExpenses = byCategory.reduce((s, c) => s + c.totalUSD, 0);
  const consultants = await User.find({ role: 'consultant' }).lean();
  const activeClients = await Invoice.distinct('clientId', {
    deleted: { $ne: true },
    issueDate: { $gte: from, $lte: to },
  });

  const monthsInRange = Math.max(1, Math.round((to - from) / (30 * 86400000)));
  const monthlyAvg = totalExpenses / monthsInRange;

  // Overhead ratio = expenses / revenue
  const [revenueResult] = await Invoice.aggregate([
    {
      $match: {
        status: { $ne: 'void' },
        deleted: { $ne: true },
        issueDate: { $gte: from, $lte: to },
      },
    },
    { $group: { _id: null, total: { $sum: '$totalUSD' } } },
  ]);
  const totalRevenue = revenueResult?.total || 0;

  const benchmarks = {
    costPerConsultant: consultants.length > 0
      ? Math.round(monthlyAvg / consultants.length)
      : 0,
    costPerClient: activeClients.length > 0
      ? Math.round(totalExpenses / activeClients.length)
      : 0,
    overheadRatio: totalRevenue > 0
      ? Math.round((totalExpenses / totalRevenue) * 100)
      : 0,
    monthlyAverage: Math.round(monthlyAvg),
  };

  return {
    byCategory: byCategory.map(c => ({
      category: c._id || 'other',
      totalUSD: Math.round(c.totalUSD * 100) / 100,
      count: c.count,
    })),
    monthlyTrend: monthlyTrendSorted,
    recommendations,
    benchmarks,
  };
}

/**
 * Deterministic expense recommendations — delegates to individual rule files.
 */
async function computeExpenseRecommendations(monthlyTrend, from, to) {
  const recommendations = [];

  // Dynamically import all rules from expense-rules/
  const ruleModules = await Promise.all([
    import('./expense-rules/growing-category.js'),
    import('./expense-rules/inactive-subscription.js'),
    import('./expense-rules/duplicate-licenses.js'),
  ]);

  for (const mod of ruleModules) {
    const results = mod.evaluate(monthlyTrend, { from, to });
    if (results?.length) recommendations.push(...results);
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
  });
}
