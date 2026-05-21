/**
 * Financial Balance Report — Orchestrator
 *
 * Imports each section module and runs them in parallel where possible.
 * Returns the full report shape as specified in the API contract.
 */
import { computeRevenue } from './revenue.js';
import { computeMargins } from './margins.js';
import { computeOperations } from './operations.js';
import { computePipeline } from './pipeline.js';
import { computeCommissions } from './commissions.js';
import { computeExpenses } from './expenses.js';
import { computeForecast } from './forecast.js';
import Invoice from '../../../models/Invoice.js';
import Payment from '../../../models/Payment.js';
import Transaction from '../../../models/Transaction.js';

/**
 * @param {object} params — { from: Date, to: Date, currency: string, includeLegacy: boolean }
 * @returns {object} Full financial balance report
 */
export async function generateFinancialBalance(params) {
  const db = {}; // Reserved for future use (e.g., injecting test DB)

  // Run independent sections in parallel
  const [revenue, margins, operations, pipeline, commissions, expenses, forecast] = await Promise.all([
    computeRevenue(db, params),
    computeMargins(db, params),
    computeOperations(db, params),
    computePipeline(db, params),
    computeCommissions(db, params),
    computeExpenses(db, params),
    computeForecast(db, params),
  ]);

  // ── Executive Summary ──────────────────────────────────────────────────
  const cashIn = forecast.currentCash > 0 ? forecast.currentCash : 0;

  // Billed pending = total open invoices AR
  const billedPending = Object.values(revenue.arAging).reduce((s, v) => s + v, 0);

  // Total expenses in period
  const totalExpenses = expenses.byCategory.reduce((s, c) => s + c.totalUSD, 0);

  // Operating margin
  const totalBilled = revenue.billedVsCollectedMonthly.reduce((s, m) => s + m.billed, 0);
  const operatingMargin = totalBilled > 0
    ? Math.round(((totalBilled - totalExpenses) / totalBilled) * 100)
    : 0;

  // Net delta (cash in - cash out this period)
  const totalCollected = revenue.billedVsCollectedMonthly.reduce((s, m) => s + m.collected, 0);
  const netDelta = totalCollected - totalExpenses;

  // Runway months = current cash / monthly burn
  const runwayMonths = forecast.monthlyExpenseAvg > 0
    ? Math.round((forecast.currentCash / forecast.monthlyExpenseAvg) * 10) / 10
    : null;

  // ── Top Alerts ─────────────────────────────────────────────────────────
  const topAlerts = [];

  if (revenue.concentrationRisk.alert) {
    topAlerts.push({ severity: 'high', message: revenue.concentrationRisk.alert });
  }
  if (forecast.cashCrunchDate) {
    topAlerts.push({ severity: 'critical', message: `Cash crunch projected by ${forecast.cashCrunchDate}` });
  }
  if (revenue.arAging['90+'] > 0) {
    topAlerts.push({ severity: 'high', message: `$${Math.round(revenue.arAging['90+'])} in receivables overdue >90 days` });
  }
  if (operations.overutilized.length > 0) {
    topAlerts.push({ severity: 'medium', message: `${operations.overutilized.length} consultant(s) over 90% utilization — burnout risk` });
  }
  if (commissions.pending > 10000) {
    topAlerts.push({ severity: 'medium', message: `$${Math.round(commissions.pending)} in unpaid commissions` });
  }
  if (runwayMonths !== null && runwayMonths < 3) {
    topAlerts.push({ severity: 'critical', message: `Runway at ${runwayMonths} months — below 3-month threshold` });
  }

  // ── Data Quality Warnings ──────────────────────────────────────────────
  const dataQualityWarnings = [];

  // Check for invoices without exchange rates
  const noRateInvoices = await Invoice.countDocuments({
    exchangeRateToUSD: { $exists: false },
    deleted: { $ne: true },
  });
  if (noRateInvoices > 0) {
    dataQualityWarnings.push(`${noRateInvoices} invoice(s) missing exchangeRateToUSD — using 1.0 default`);
  }

  // Check for expenses without amountUSD
  const noUSDExpenses = await Transaction.countDocuments({
    type: 'expense',
    amountUSD: { $exists: false },
  });
  if (noUSDExpenses > 0) {
    dataQualityWarnings.push(`${noUSDExpenses} expense(s) missing amountUSD — using raw amount as USD`);
  }

  // Open invoices using reference rate instead of actual payment rate
  if (billedPending > 0) {
    dataQualityWarnings.push(`$${Math.round(billedPending)} in open invoices valued at issue-time exchange rate, not current market rate`);
  }

  // ── Data to Clean ──────────────────────────────────────────────────────
  const dataToClean = [];

  if (revenue.topDebtors.some(d => d.totalOwedUSD > 0 && !d.oldestDueDate)) {
    dataToClean.push({ issue: 'Invoices missing dueDate', action: 'Set dueDate on all issued invoices for accurate aging' });
  }

  // ── Alerts (full list) ─────────────────────────────────────────────────
  const alerts = [...topAlerts];

  if (expenses.recommendations.length > 0) {
    for (const rec of expenses.recommendations.slice(0, 3)) {
      alerts.push({ severity: rec.priority === 'high' ? 'medium' : 'low', message: rec.action });
    }
  }

  return {
    meta: {
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      currency: params.currency,
      generatedAt: new Date().toISOString(),
      dataQualityWarnings,
    },
    executiveSummary: {
      cashIn: Math.round(cashIn),
      billedPending: Math.round(billedPending),
      totalExpenses: Math.round(totalExpenses),
      operatingMargin,
      netDelta: Math.round(netDelta),
      runwayMonths,
      topAlerts,
    },
    revenue,
    margins,
    operations,
    pipeline,
    commissions,
    expenses,
    alerts,
    cashForecast90d: {
      pessimistic: forecast.pessimistic,
      base: forecast.base,
      optimistic: forecast.optimistic,
      cashCrunchDate: forecast.cashCrunchDate,
    },
    dataToClean,
  };
}
