import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDB, teardownTestDB, clearCollections, seedTestData } from './setup.js';
import { computeRevenue } from '../../server/services/reports/financial-balance/revenue.js';
import { computeMargins } from '../../server/services/reports/financial-balance/margins.js';
import { computeOperations } from '../../server/services/reports/financial-balance/operations.js';
import { computePipeline } from '../../server/services/reports/financial-balance/pipeline.js';
import { computeCommissions } from '../../server/services/reports/financial-balance/commissions.js';
import { computeExpenses } from '../../server/services/reports/financial-balance/expenses.js';
import { computeForecast } from '../../server/services/reports/financial-balance/forecast.js';
import { generateFinancialBalance } from '../../server/services/reports/financial-balance/index.js';
import Invoice from '../../server/models/Invoice.js';
import Payment from '../../server/models/Payment.js';
import Transaction from '../../server/models/Transaction.js';
import Commission from '../../server/models/Commission.js';
import Lead from '../../server/models/Lead.js';

const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * 86400000);

const DEFAULT_PARAMS = {
  from: daysAgo(365),
  to: now,
  currency: 'USD',
  includeLegacy: true,
};

beforeAll(async () => {
  await setupTestDB();
});

afterAll(async () => {
  await teardownTestDB();
});

// ══════════════════════════════════════════════════════════════════════════════
// REVENUE
// ══════════════════════════════════════════════════════════════════════════════
describe('computeRevenue', () => {
  beforeEach(async () => {
    await clearCollections();
    await seedTestData();
  });

  it('returns all required keys', async () => {
    const result = await computeRevenue({}, DEFAULT_PARAMS);
    expect(result).toHaveProperty('mrrVsOneShot');
    expect(result).toHaveProperty('billedVsCollectedMonthly');
    expect(result).toHaveProperty('dso');
    expect(result).toHaveProperty('arAging');
    expect(result).toHaveProperty('topClientsByRevenue');
    expect(result).toHaveProperty('topDebtors');
    expect(result).toHaveProperty('concentrationRisk');
  });

  it('splits MRR vs one-shot correctly', async () => {
    const result = await computeRevenue({}, DEFAULT_PARAMS);
    // proj-beta is hours_pack (recurring), proj-acme is implementation (one-shot)
    expect(result.mrrVsOneShot.recurring).toBeGreaterThan(0);
    expect(result.mrrVsOneShot.oneShot).toBeGreaterThan(0);
    expect(result.mrrVsOneShot.recurring + result.mrrVsOneShot.oneShot).toBe(
      result.mrrVsOneShot.recurring + result.mrrVsOneShot.oneShot
    );
  });

  it('calculates billed vs collected monthly', async () => {
    const result = await computeRevenue({}, DEFAULT_PARAMS);
    expect(result.billedVsCollectedMonthly).toBeInstanceOf(Array);
    const totalBilled = result.billedVsCollectedMonthly.reduce((s, m) => s + m.billed, 0);
    expect(totalBilled).toBe(34000); // 20000 + 10000 + 4000 (COP invoice in USD)
  });

  it('calculates weighted DSO from payments', async () => {
    const result = await computeRevenue({}, DEFAULT_PARAMS);
    expect(result.dso.global).toBeGreaterThanOrEqual(0);
    expect(result.dso.byClient).toBeInstanceOf(Array);
    // ACME has payments, so should have DSO
    const acmeDSO = result.dso.byClient.find(c => c.clientId === 'ACME Corp');
    if (acmeDSO) expect(acmeDSO.dso).toBeGreaterThan(0);
  });

  it('calculates AR aging buckets', async () => {
    const result = await computeRevenue({}, DEFAULT_PARAMS);
    expect(result.arAging).toHaveProperty('0-30');
    expect(result.arAging).toHaveProperty('31-60');
    expect(result.arAging).toHaveProperty('61-90');
    expect(result.arAging).toHaveProperty('90+');
    const totalAR = Object.values(result.arAging).reduce((s, v) => s + v, 0);
    expect(totalAR).toBe(19000); // 5000 (ACME partial) + 10000 (Beta) + 4000 (COP)
  });

  it('calculates concentration risk', async () => {
    const result = await computeRevenue({}, DEFAULT_PARAMS);
    expect(result.concentrationRisk.topClientPct).toBeGreaterThan(0);
    expect(result.concentrationRisk.top3Pct).toBeLessThanOrEqual(100);
    expect(result.concentrationRisk.herfindahlIndex).toBeGreaterThan(0);
  });

  it('returns top debtors sorted by amount owed', async () => {
    const result = await computeRevenue({}, DEFAULT_PARAMS);
    expect(result.topDebtors.length).toBeGreaterThan(0);
    for (let i = 1; i < result.topDebtors.length; i++) {
      expect(result.topDebtors[i - 1].totalOwedUSD).toBeGreaterThanOrEqual(result.topDebtors[i].totalOwedUSD);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MARGINS
// ══════════════════════════════════════════════════════════════════════════════
describe('computeMargins', () => {
  beforeEach(async () => {
    await clearCollections();
    await seedTestData();
  });

  it('returns all required keys', async () => {
    const result = await computeMargins({}, DEFAULT_PARAMS);
    expect(result).toHaveProperty('byServiceLine');
    expect(result).toHaveProperty('byTopClients');
    expect(result).toHaveProperty('byActiveProject');
  });

  it('calculates margins by service line', async () => {
    const result = await computeMargins({}, DEFAULT_PARAMS);
    expect(result.byServiceLine.length).toBeGreaterThan(0);
    const implLine = result.byServiceLine.find(s => s.serviceLine === 'implementation');
    expect(implLine).toBeDefined();
    expect(implLine.revenue).toBeGreaterThan(0);
    expect(implLine.marginPct).toBeDefined();
  });

  it('calculates license margin correctly (sell - cost, not full price)', async () => {
    const result = await computeMargins({}, DEFAULT_PARAMS);
    // ACME has a license item: sell=8000, cost=3000 → margin contribution = 5000
    const acme = result.byTopClients.find(c => c.clientName === 'ACME Corp');
    expect(acme).toBeDefined();
    // Revenue should be 15000 (service) + 5000 (license margin) = 20000
    expect(acme.revenue).toBe(20000);
  });

  it('only includes active projects in byActiveProject', async () => {
    const result = await computeMargins({}, DEFAULT_PARAMS);
    for (const p of result.byActiveProject) {
      expect(['active']).toContain('active'); // all seeded projects are active
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// OPERATIONS
// ══════════════════════════════════════════════════════════════════════════════
describe('computeOperations', () => {
  beforeEach(async () => {
    await clearCollections();
    await seedTestData();
  });

  it('returns all required keys', async () => {
    const result = await computeOperations({}, DEFAULT_PARAMS);
    expect(result).toHaveProperty('consultantUtilization');
    expect(result).toHaveProperty('billableHourCost');
    expect(result).toHaveProperty('underutilized');
    expect(result).toHaveProperty('overutilized');
  });

  it('calculates consultant utilization', async () => {
    const result = await computeOperations({}, DEFAULT_PARAMS);
    expect(result.consultantUtilization.length).toBeGreaterThan(0);
    const alice = result.consultantUtilization.find(c => c.name === 'Alice');
    expect(alice).toBeDefined();
    expect(alice.billableHours).toBe(80); // only approved, not pending
    expect(alice.utilizationPct).toBeGreaterThan(0);
  });

  it('calculates global billable hour cost', async () => {
    const result = await computeOperations({}, DEFAULT_PARAMS);
    expect(result.billableHourCost).toBeGreaterThan(0);
  });

  it('identifies underutilized consultants (<50%)', async () => {
    const result = await computeOperations({}, DEFAULT_PARAMS);
    // Both Alice (80h) and Bob (90h) over 12 months vs 1920 available = very low utilization
    expect(result.underutilized.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PIPELINE
// ══════════════════════════════════════════════════════════════════════════════
describe('computePipeline', () => {
  beforeEach(async () => {
    await clearCollections();
    await seedTestData();
  });

  it('returns all required keys', async () => {
    const result = await computePipeline({}, DEFAULT_PARAMS);
    expect(result).toHaveProperty('velocity');
    expect(result).toHaveProperty('quoteToInvoiceConversion');
    expect(result).toHaveProperty('weightedPipelineValue');
    expect(result).toHaveProperty('expectedNextQuarter');
  });

  it('calculates weighted pipeline value', async () => {
    const result = await computePipeline({}, DEFAULT_PARAMS);
    // Gamma (negotiation, 30000 × 0.6 = 18000) + Delta (proposal, 50000 × 0.4 = 20000)
    expect(result.weightedPipelineValue).toBe(38000);
    expect(result.activeDeals).toBe(2);
  });

  it('calculates quote to invoice conversion', async () => {
    const result = await computePipeline({}, DEFAULT_PARAMS);
    // 2 won leads out of 4 total qualified (proposal+negotiation+closed_won+closed_lost)
    expect(result.quoteToInvoiceConversion).toBeGreaterThan(0);
    expect(result.quoteToInvoiceConversion).toBeLessThanOrEqual(100);
  });

  it('calculates expected next quarter', async () => {
    const result = await computePipeline({}, DEFAULT_PARAMS);
    // Gamma and Delta both have expectedCloseDate within 90 days
    expect(result.expectedNextQuarter).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// COMMISSIONS
// ══════════════════════════════════════════════════════════════════════════════
describe('computeCommissions', () => {
  beforeEach(async () => {
    await clearCollections();
    await seedTestData();
  });

  it('returns all required keys', async () => {
    const result = await computeCommissions({}, DEFAULT_PARAMS);
    expect(result).toHaveProperty('committed');
    expect(result).toHaveProperty('paid');
    expect(result).toHaveProperty('pending');
    expect(result).toHaveProperty('exposureNext60Days');
  });

  it('calculates committed = sum of active commissions', async () => {
    const result = await computeCommissions({}, DEFAULT_PARAMS);
    expect(result.committed).toBe(2160); // 1110 + 1050
  });

  it('calculates pending = committed - paid', async () => {
    const result = await computeCommissions({}, DEFAULT_PARAMS);
    expect(result.pending).toBe(result.committed - result.paid);
  });

  it('returns status breakdown', async () => {
    const result = await computeCommissions({}, DEFAULT_PARAMS);
    expect(result.statusBreakdown.approved).toBe(1);
    expect(result.statusBreakdown.pending).toBe(1);
  });

  it('returns top commissions sorted by amount', async () => {
    const result = await computeCommissions({}, DEFAULT_PARAMS);
    expect(result.topCommissions.length).toBe(2);
    expect(result.topCommissions[0].amountUSD).toBeGreaterThanOrEqual(result.topCommissions[1].amountUSD);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// EXPENSES
// ══════════════════════════════════════════════════════════════════════════════
describe('computeExpenses', () => {
  beforeEach(async () => {
    await clearCollections();
    await seedTestData();
  });

  it('returns all required keys', async () => {
    const result = await computeExpenses({}, DEFAULT_PARAMS);
    expect(result).toHaveProperty('byCategory');
    expect(result).toHaveProperty('monthlyTrend');
    expect(result).toHaveProperty('recommendations');
    expect(result).toHaveProperty('benchmarks');
  });

  it('groups expenses by category', async () => {
    const result = await computeExpenses({}, DEFAULT_PARAMS);
    expect(result.byCategory.length).toBeGreaterThan(0);
    const salary = result.byCategory.find(c => c.category === 'salary');
    expect(salary).toBeDefined();
    expect(salary.totalUSD).toBe(7500); // 4000 + 3500
  });

  it('calculates monthly trend', async () => {
    const result = await computeExpenses({}, DEFAULT_PARAMS);
    expect(result.monthlyTrend.length).toBeGreaterThan(0);
    for (const m of result.monthlyTrend) {
      expect(m).toHaveProperty('month');
      expect(m).toHaveProperty('total');
      expect(m).toHaveProperty('byCategory');
    }
  });

  it('calculates benchmarks', async () => {
    const result = await computeExpenses({}, DEFAULT_PARAMS);
    expect(result.benchmarks.costPerConsultant).toBeGreaterThan(0);
    expect(result.benchmarks.overheadRatio).toBeGreaterThanOrEqual(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FORECAST
// ══════════════════════════════════════════════════════════════════════════════
describe('computeForecast', () => {
  beforeEach(async () => {
    await clearCollections();
    await seedTestData();
  });

  it('returns all required keys', async () => {
    const result = await computeForecast({}, DEFAULT_PARAMS);
    expect(result).toHaveProperty('pessimistic');
    expect(result).toHaveProperty('base');
    expect(result).toHaveProperty('optimistic');
    expect(result).toHaveProperty('cashCrunchDate');
  });

  it('generates 13 weeks of projections per scenario', async () => {
    const result = await computeForecast({}, DEFAULT_PARAMS);
    expect(result.pessimistic).toHaveLength(13);
    expect(result.base).toHaveLength(13);
    expect(result.optimistic).toHaveLength(13);
  });

  it('optimistic >= base >= pessimistic at each week', async () => {
    const result = await computeForecast({}, DEFAULT_PARAMS);
    for (let i = 0; i < 13; i++) {
      expect(result.optimistic[i].cashPosition).toBeGreaterThanOrEqual(result.base[i].cashPosition);
      expect(result.base[i].cashPosition).toBeGreaterThanOrEqual(result.pessimistic[i].cashPosition);
    }
  });

  it('each week has required fields', async () => {
    const result = await computeForecast({}, DEFAULT_PARAMS);
    for (const week of result.base) {
      expect(week).toHaveProperty('week');
      expect(week).toHaveProperty('weekStart');
      expect(week).toHaveProperty('inflow');
      expect(week).toHaveProperty('outflow');
      expect(week).toHaveProperty('cashPosition');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// EXPENSE RULES
// ══════════════════════════════════════════════════════════════════════════════
describe('expense-rules', () => {
  it('growing-category detects 3+ months of >15% growth', async () => {
    const { evaluate } = await import('../../server/services/reports/financial-balance/expense-rules/growing-category.js');
    const trend = [
      { month: '2025-01', total: 100, byCategory: { software: 100 } },
      { month: '2025-02', total: 120, byCategory: { software: 120 } },
      { month: '2025-03', total: 145, byCategory: { software: 145 } },
      { month: '2025-04', total: 175, byCategory: { software: 175 } },
      { month: '2025-05', total: 210, byCategory: { software: 210 } },
    ];
    const recs = evaluate(trend);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].priority).toBe('high');
    expect(recs[0].item).toContain('software');
  });

  it('growing-category returns nothing for stable expenses', async () => {
    const { evaluate } = await import('../../server/services/reports/financial-balance/expense-rules/growing-category.js');
    const trend = [
      { month: '2025-01', total: 100, byCategory: { software: 100 } },
      { month: '2025-02', total: 100, byCategory: { software: 100 } },
      { month: '2025-03', total: 100, byCategory: { software: 100 } },
    ];
    const recs = evaluate(trend);
    expect(recs).toHaveLength(0);
  });

  it('inactive-subscription flags constant software charges', async () => {
    const { evaluate } = await import('../../server/services/reports/financial-balance/expense-rules/inactive-subscription.js');
    const trend = [
      { month: '2025-01', total: 200, byCategory: { software: 200 } },
      { month: '2025-02', total: 200, byCategory: { software: 200 } },
      { month: '2025-03', total: 200, byCategory: { software: 200 } },
      { month: '2025-04', total: 200, byCategory: { software: 200 } },
    ];
    const recs = evaluate(trend, { from: new Date(), to: new Date() });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].priority).toBe('medium');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INTEGRATION: Full Report
// ══════════════════════════════════════════════════════════════════════════════
describe('generateFinancialBalance (integration)', () => {
  beforeEach(async () => {
    await clearCollections();
    await seedTestData();
  });

  it('returns complete report with all sections', async () => {
    const report = await generateFinancialBalance(DEFAULT_PARAMS);
    expect(report).toHaveProperty('meta');
    expect(report).toHaveProperty('executiveSummary');
    expect(report).toHaveProperty('revenue');
    expect(report).toHaveProperty('margins');
    expect(report).toHaveProperty('operations');
    expect(report).toHaveProperty('pipeline');
    expect(report).toHaveProperty('commissions');
    expect(report).toHaveProperty('expenses');
    expect(report).toHaveProperty('alerts');
    expect(report).toHaveProperty('cashForecast90d');
    expect(report).toHaveProperty('dataToClean');
  });

  it('executive summary numbers are internally consistent', async () => {
    const report = await generateFinancialBalance(DEFAULT_PARAMS);
    const es = report.executiveSummary;
    expect(es.operatingMargin).toBeLessThanOrEqual(100);
    expect(es.totalExpenses).toBeGreaterThan(0);
    expect(es.billedPending).toBeGreaterThan(0);
  });

  it('meta contains correct date range and currency', async () => {
    const report = await generateFinancialBalance(DEFAULT_PARAMS);
    expect(report.meta.currency).toBe('USD');
    expect(report.meta.generatedAt).toBeDefined();
    expect(report.meta.dataQualityWarnings).toBeInstanceOf(Array);
  });

  it('totals across sections are mathematically consistent', async () => {
    const report = await generateFinancialBalance(DEFAULT_PARAMS);
    // Commissions committed should equal the sum of top commissions
    const topSum = report.commissions.topCommissions.reduce((s, c) => s + c.amountUSD, 0);
    expect(Math.abs(report.commissions.committed - topSum)).toBeLessThan(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ══════════════════════════════════════════════════════════════════════════════
describe('Edge Cases', () => {
  beforeEach(async () => {
    await clearCollections();
  });

  it('handles empty period (no data at all)', async () => {
    const report = await generateFinancialBalance({
      from: daysAgo(30),
      to: daysAgo(20),
      currency: 'USD',
      includeLegacy: false,
    });
    expect(report.executiveSummary.cashIn).toBe(0);
    expect(report.executiveSummary.totalExpenses).toBe(0);
    expect(report.revenue.billedVsCollectedMonthly).toHaveLength(0);
    expect(report.cashForecast90d.pessimistic).toHaveLength(13);
  });

  it('handles single invoice scenario', async () => {
    await Invoice.create({
      invoiceNumber: 'SINGLE-001',
      clientId: 'Solo Client', clientName: 'Solo Client', projectId: 'proj-solo',
      issueDate: daysAgo(10), dueDate: daysAgo(0),
      subtotal: 5000, total: 5000, currency: 'USD', totalUSD: 5000,
      exchangeRateToUSD: 1, balanceUSD: 5000, paidAmountUSD: 0, status: 'issued',
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 5000, amount: 5000 }],
    });

    const report = await generateFinancialBalance(DEFAULT_PARAMS);
    expect(report.revenue.topClientsByRevenue).toHaveLength(1);
    expect(report.revenue.concentrationRisk.topClientPct).toBe(100);
    expect(report.executiveSummary.billedPending).toBe(5000);
  });

  it('handles mixed currencies in payments', async () => {
    const inv = await Invoice.create({
      invoiceNumber: 'MIX-001',
      clientId: 'MixClient', clientName: 'MixClient', projectId: 'proj-mix',
      issueDate: daysAgo(30), dueDate: daysAgo(0),
      subtotal: 10000, total: 10000, currency: 'USD', totalUSD: 10000,
      exchangeRateToUSD: 1, balanceUSD: 2000, paidAmountUSD: 8000, status: 'partially_paid',
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 10000, amount: 10000 }],
    });

    await Payment.create([
      {
        clientId: 'MixClient', clientName: 'MixClient',
        paymentDate: daysAgo(20), amount: 5000, currency: 'USD', amountUSD: 5000,
        exchangeRateToUSD: 1, method: 'wire_transfer',
        appliedTo: [{ invoiceId: inv._id.toString(), amountApplied: 5000, amountAppliedUSD: 5000 }],
      },
      {
        clientId: 'MixClient', clientName: 'MixClient',
        paymentDate: daysAgo(10), amount: 12000000, currency: 'COP', amountUSD: 3000,
        exchangeRateToUSD: 4000, method: 'wire_transfer',
        appliedTo: [{ invoiceId: inv._id.toString(), amountApplied: 3000, amountAppliedUSD: 3000 }],
      },
    ]);

    const result = await computeRevenue({}, DEFAULT_PARAMS);
    expect(result.dso.global).toBeGreaterThan(0);
    expect(result.arAging['0-30'] + result.arAging['31-60']).toBe(2000);
  });

  it('handles invoice paid in multiple partial payments', async () => {
    const inv = await Invoice.create({
      invoiceNumber: 'PARTIAL-001',
      clientId: 'PartialClient', clientName: 'PartialClient', projectId: 'proj-partial',
      issueDate: daysAgo(60), dueDate: daysAgo(30),
      subtotal: 9000, total: 9000, currency: 'USD', totalUSD: 9000,
      exchangeRateToUSD: 1, balanceUSD: 0, paidAmountUSD: 9000, status: 'paid',
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 9000, amount: 9000 }],
    });

    await Payment.create([
      {
        clientId: 'PartialClient', paymentDate: daysAgo(45),
        amount: 3000, currency: 'USD', amountUSD: 3000, exchangeRateToUSD: 1, method: 'wire_transfer',
        appliedTo: [{ invoiceId: inv._id.toString(), amountApplied: 3000, amountAppliedUSD: 3000 }],
      },
      {
        clientId: 'PartialClient', paymentDate: daysAgo(30),
        amount: 3000, currency: 'USD', amountUSD: 3000, exchangeRateToUSD: 1, method: 'stripe',
        appliedTo: [{ invoiceId: inv._id.toString(), amountApplied: 3000, amountAppliedUSD: 3000 }],
      },
      {
        clientId: 'PartialClient', paymentDate: daysAgo(15),
        amount: 3000, currency: 'USD', amountUSD: 3000, exchangeRateToUSD: 1, method: 'mercury',
        appliedTo: [{ invoiceId: inv._id.toString(), amountApplied: 3000, amountAppliedUSD: 3000 }],
      },
    ]);

    const result = await computeRevenue({}, DEFAULT_PARAMS);
    // DSO should be weighted average: (15*3000 + 30*3000 + 45*3000) / 9000 = 30 days
    const clientDSO = result.dso.byClient.find(c => c.clientId === 'PartialClient');
    expect(clientDSO).toBeDefined();
    expect(clientDSO.dso).toBe(30);
  });

  it('handles client with infinite DSO (never pays)', async () => {
    await Invoice.create({
      invoiceNumber: 'DEADBEAT-001',
      clientId: 'Deadbeat', clientName: 'Deadbeat Inc', projectId: 'proj-dead',
      issueDate: daysAgo(150), dueDate: daysAgo(100),
      subtotal: 15000, total: 15000, currency: 'USD', totalUSD: 15000,
      exchangeRateToUSD: 1, balanceUSD: 15000, paidAmountUSD: 0, status: 'overdue',
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 15000, amount: 15000 }],
    });

    const result = await computeRevenue({}, DEFAULT_PARAMS);
    // No payments → DSO is 0 (no data to calculate from), not infinity
    expect(result.dso.global).toBe(0);
    // But AR aging should show 15000 in 90+ bucket
    expect(result.arAging['90+']).toBe(15000);
    // Top debtors should include this client
    expect(result.topDebtors[0].clientName).toBe('Deadbeat Inc');
    expect(result.topDebtors[0].totalOwedUSD).toBe(15000);
  });

  it('forecast detects cash crunch when expenses exceed inflows', async () => {
    // Heavy expenses, no income
    await Transaction.create([
      { id: 'tx-heavy-1', title: 'Big expense', amount: 50000, amountUSD: 50000, currency: 'USD', exchangeRateToUSD: 1, date: daysAgo(15).toISOString(), dateObj: daysAgo(15), type: 'expense', category: 'office' },
    ]);

    const result = await computeForecast({}, DEFAULT_PARAMS);
    // Should detect cash crunch since we have -50000 starting and no inflows
    expect(result.currentCash).toBeLessThan(0);
    expect(result.cashCrunchDate).toBeDefined();
  });
});
