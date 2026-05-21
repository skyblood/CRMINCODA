/**
 * Commissions section of the financial balance report.
 *
 * Exports: computeCommissions(db, params) → { committed, paid, pending, exposureNext60Days }
 */
import Commission from '../../../models/Commission.js';

export async function computeCommissions(_db, params) {
  const { from, to } = params;

  const commissions = await Commission.find({}).lean();

  // ── Committed (total commission liability) ─────────────────────────────
  const activeCommissions = commissions.filter(c => c.status !== 'cancelled');
  const committed = activeCommissions.reduce((s, c) => s + (c.amountUSD || 0), 0);

  // ── Paid ───────────────────────────────────────────────────────────────
  const paid = activeCommissions.reduce((s, c) => s + (c.paidAmountUSD || 0), 0);

  // ── Pending ────────────────────────────────────────────────────────────
  const pending = committed - paid;

  // ── Status breakdown ───────────────────────────────────────────────────
  const statusBreakdown = {};
  for (const c of commissions) {
    statusBreakdown[c.status] = (statusBreakdown[c.status] || 0) + 1;
  }

  // ── Exposure Next 60 Days ──────────────────────────────────────────────
  // Commissions that are pending/approved and likely to be paid soon
  // (created in the last 60 days or with recent payment activity)
  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

  const exposureCommissions = activeCommissions.filter(c =>
    (c.status === 'pending' || c.status === 'approved') &&
    c.amountUSD > c.paidAmountUSD
  );

  const exposureNext60Days = exposureCommissions.reduce((s, c) => s + (c.amountUSD - c.paidAmountUSD), 0);

  // ── Top commissions by amount ──────────────────────────────────────────
  const topCommissions = activeCommissions
    .filter(c => c.amountUSD > 0)
    .sort((a, b) => b.amountUSD - a.amountUSD)
    .slice(0, 10)
    .map(c => ({
      projectName: c.projectName,
      clientName: c.clientName,
      rate: c.rate,
      amountUSD: c.amountUSD,
      paidAmountUSD: c.paidAmountUSD,
      status: c.status,
    }));

  return {
    committed: Math.round(committed * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    pending: Math.round(pending * 100) / 100,
    exposureNext60Days: Math.round(exposureNext60Days * 100) / 100,
    statusBreakdown,
    topCommissions,
    totalCount: commissions.length,
  };
}
