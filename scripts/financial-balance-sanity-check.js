/**
 * Financial Balance — Data Sanity Check
 *
 * Run: node scripts/financial-balance-sanity-check.js
 *
 * READ-ONLY — does not modify any data.
 * Output: console report + tmp/sanity-check-{timestamp}.json
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

import Invoice from '../server/models/Invoice.js';
import Payment from '../server/models/Payment.js';
import Transaction from '../server/models/Transaction.js';
import Commission from '../server/models/Commission.js';
import Project from '../server/models/Project.js';
import Lead from '../server/models/Lead.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm_incoda';

// ── Helpers ──────────────────────────────────────────────────────────────────
function header(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function warn(msg) {
  console.log(`  ⚠  ${msg}`);
}

function ok(msg) {
  console.log(`  ✓  ${msg}`);
}

function info(msg) {
  console.log(`     ${msg}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log('Connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  const report = {
    generatedAt: new Date().toISOString(),
    invoices: {},
    payments: {},
    legacy: {},
    exchangeRateIssues: [],
    orphanedInvoices: [],
    paymentAllocationIssues: [],
    inconsistentStatuses: [],
    commissionIssues: [],
    expenseIssues: [],
    summary: { errors: 0, warnings: 0 },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 1. INVOICES
  // ══════════════════════════════════════════════════════════════════════════
  header('1. INVOICES');

  const invoices = await Invoice.find({ deleted: { $ne: true } }).lean();
  const totalInvoices = invoices.length;

  // Date range
  const issueDates = invoices.filter(i => i.issueDate).map(i => new Date(i.issueDate));
  const minIssueDate = issueDates.length ? new Date(Math.min(...issueDates)) : null;
  const maxIssueDate = issueDates.length ? new Date(Math.max(...issueDates)) : null;

  ok(`Total invoices: ${totalInvoices}`);
  ok(`Date range: ${minIssueDate?.toISOString().slice(0, 10) || 'N/A'} → ${maxIssueDate?.toISOString().slice(0, 10) || 'N/A'}`);

  // Status distribution
  const statusDist = {};
  for (const inv of invoices) {
    statusDist[inv.status || 'unknown'] = (statusDist[inv.status || 'unknown'] || 0) + 1;
  }
  info(`Status distribution: ${JSON.stringify(statusDist)}`);

  report.invoices = {
    total: totalInvoices,
    dateRange: { min: minIssueDate?.toISOString() || null, max: maxIssueDate?.toISOString() || null },
    statusDistribution: statusDist,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 2. PAYMENTS
  // ══════════════════════════════════════════════════════════════════════════
  header('2. PAYMENTS');

  const payments = await Payment.find({}).lean();
  const totalPayments = payments.length;

  const paymentDates = payments.filter(p => p.paymentDate).map(p => new Date(p.paymentDate));
  const minPayDate = paymentDates.length ? new Date(Math.min(...paymentDates)) : null;
  const maxPayDate = paymentDates.length ? new Date(Math.max(...paymentDates)) : null;

  // Currencies
  const currencies = {};
  for (const p of payments) {
    currencies[p.currency || 'unknown'] = (currencies[p.currency || 'unknown'] || 0) + 1;
  }

  // Methods
  const methods = {};
  for (const p of payments) {
    methods[p.method || 'unknown'] = (methods[p.method || 'unknown'] || 0) + 1;
  }

  ok(`Total payments: ${totalPayments}`);
  ok(`Date range: ${minPayDate?.toISOString().slice(0, 10) || 'N/A'} → ${maxPayDate?.toISOString().slice(0, 10) || 'N/A'}`);
  info(`Currencies: ${JSON.stringify(currencies)}`);
  info(`Methods: ${JSON.stringify(methods)}`);

  report.payments = {
    total: totalPayments,
    dateRange: { min: minPayDate?.toISOString() || null, max: maxPayDate?.toISOString() || null },
    currencies,
    methods,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 3. LEGACY MIGRATION RECORDS
  // ══════════════════════════════════════════════════════════════════════════
  header('3. LEGACY MIGRATION');

  const legacyInvoices = invoices.filter(i => i.legacy_migration);
  const legacyPayments = payments.filter(p => p.exchangeRateSource === 'legacy_migration');

  ok(`Legacy invoices: ${legacyInvoices.length} / ${totalInvoices}`);
  ok(`Legacy payments: ${legacyPayments.length} / ${totalPayments}`);

  report.legacy = {
    invoices: legacyInvoices.length,
    payments: legacyPayments.length,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 4. EXCHANGE RATE ISSUES
  // ══════════════════════════════════════════════════════════════════════════
  header('4. EXCHANGE RATE CHECKS');

  let rateIssues = 0;
  for (const p of payments) {
    // Check for missing exchange rate
    if (!p.exchangeRateToUSD && p.exchangeRateToUSD !== 0) {
      report.exchangeRateIssues.push({
        paymentId: p._id.toString(),
        issue: 'missing_exchange_rate',
        currency: p.currency,
        amount: p.amount,
      });
      rateIssues++;
      continue;
    }

    // Check for suspicious COP/USD rates (expected range: 3500-5500)
    if (p.currency === 'COP' && p.exchangeRateToUSD) {
      const rate = p.exchangeRateToUSD;
      if (rate < 3500 || rate > 5500) {
        report.exchangeRateIssues.push({
          paymentId: p._id.toString(),
          issue: 'suspicious_cop_rate',
          rate,
          currency: p.currency,
          amount: p.amount,
        });
        rateIssues++;
      }
    }
  }

  if (rateIssues > 0) {
    warn(`${rateIssues} payment(s) with exchange rate issues`);
    report.summary.warnings += rateIssues;
  } else {
    ok('All exchange rates look valid');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. ORPHANED INVOICES (no projectId or no clientId)
  // ══════════════════════════════════════════════════════════════════════════
  header('5. ORPHANED INVOICES');

  const noProject = invoices.filter(i => !i.projectId);
  const noClient = invoices.filter(i => !i.clientId);

  if (noProject.length > 0) {
    warn(`${noProject.length} invoice(s) without projectId:`);
    for (const inv of noProject) {
      info(`  ${inv.invoiceNumber} — ${inv.clientName} — $${inv.totalUSD?.toFixed(2)}`);
      report.orphanedInvoices.push({
        invoiceId: inv._id.toString(),
        invoiceNumber: inv.invoiceNumber,
        issue: 'no_projectId',
        clientName: inv.clientName,
      });
    }
    report.summary.warnings += noProject.length;
  } else {
    ok('All invoices have projectId');
  }

  if (noClient.length > 0) {
    warn(`${noClient.length} invoice(s) without clientId — CRITICAL`);
    for (const inv of noClient) {
      info(`  ${inv.invoiceNumber}`);
      report.orphanedInvoices.push({
        invoiceId: inv._id.toString(),
        invoiceNumber: inv.invoiceNumber,
        issue: 'no_clientId',
      });
    }
    report.summary.errors += noClient.length;
  } else {
    ok('All invoices have clientId');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. PAYMENT ALLOCATION ISSUES
  // ══════════════════════════════════════════════════════════════════════════
  header('6. PAYMENT ALLOCATION');

  let allocIssues = 0;
  for (const p of payments) {
    // No appliedTo
    if (!p.appliedTo || p.appliedTo.length === 0) {
      report.paymentAllocationIssues.push({
        paymentId: p._id.toString(),
        issue: 'no_appliedTo',
        amount: p.amount,
        clientName: p.clientName,
      });
      allocIssues++;
      continue;
    }

    // Sum of amountApplied vs amount
    const allocatedSum = p.appliedTo.reduce((sum, a) => sum + (a.amountApplied || 0), 0);
    const diff = Math.abs(allocatedSum - p.amount);
    if (diff > 0.01) {
      report.paymentAllocationIssues.push({
        paymentId: p._id.toString(),
        issue: 'allocation_mismatch',
        paymentAmount: p.amount,
        allocatedSum,
        diff,
        clientName: p.clientName,
      });
      allocIssues++;
    }
  }

  if (allocIssues > 0) {
    warn(`${allocIssues} payment(s) with allocation issues:`);
    for (const issue of report.paymentAllocationIssues) {
      info(`  ${issue.issue}: ${issue.clientName || issue.paymentId} — $${issue.amount || issue.paymentAmount}`);
    }
    report.summary.warnings += allocIssues;
  } else {
    ok('All payment allocations are consistent');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. INCONSISTENT STATUSES (paid but no payments)
  // ══════════════════════════════════════════════════════════════════════════
  header('7. STATUS CONSISTENCY');

  // Build a set of invoiceIds that have payments
  const invoiceIdsWithPayments = new Set();
  for (const p of payments) {
    for (const a of (p.appliedTo || [])) {
      invoiceIdsWithPayments.add(a.invoiceId);
    }
  }

  const paidNoPayments = invoices.filter(i =>
    i.status === 'paid' && !invoiceIdsWithPayments.has(i._id.toString())
  );

  if (paidNoPayments.length > 0) {
    warn(`${paidNoPayments.length} invoice(s) marked 'paid' but have NO payments — BUG in derived status:`);
    for (const inv of paidNoPayments) {
      info(`  ${inv.invoiceNumber} — ${inv.clientName} — $${inv.totalUSD?.toFixed(2)}`);
      report.inconsistentStatuses.push({
        invoiceId: inv._id.toString(),
        invoiceNumber: inv.invoiceNumber,
        issue: 'paid_without_payments',
        clientName: inv.clientName,
        totalUSD: inv.totalUSD,
      });
    }
    report.summary.errors += paidNoPayments.length;
  } else {
    ok('No invoices marked paid without associated payments');
  }

  // Also check partially_paid with no payments
  const partialNoPayments = invoices.filter(i =>
    i.status === 'partially_paid' && !invoiceIdsWithPayments.has(i._id.toString())
  );
  if (partialNoPayments.length > 0) {
    warn(`${partialNoPayments.length} invoice(s) marked 'partially_paid' with no payments`);
    report.summary.errors += partialNoPayments.length;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8. COMMISSION ISSUES
  // ══════════════════════════════════════════════════════════════════════════
  header('8. COMMISSIONS');

  const commissions = await Commission.find({}).lean();
  const projects = await Project.find({}).lean();
  const leads = await Lead.find({}).lean();

  ok(`Total commissions: ${commissions.length}`);
  ok(`Total projects: ${projects.length}`);

  // Commissions without matching project
  const projectIds = new Set(projects.map(p => p.id));
  const orphanedCommissions = commissions.filter(c => !projectIds.has(c.projectId));
  if (orphanedCommissions.length > 0) {
    warn(`${orphanedCommissions.length} commission(s) referencing non-existent projects`);
    for (const c of orphanedCommissions) {
      info(`  projectId: ${c.projectId} — $${c.amountUSD?.toFixed(2)}`);
      report.commissionIssues.push({
        commissionId: c._id.toString(),
        issue: 'orphaned_project',
        projectId: c.projectId,
      });
    }
    report.summary.warnings += orphanedCommissions.length;
  } else {
    ok('All commissions reference valid projects');
  }

  // Projects without commissions
  const commProjectIds = new Set(commissions.map(c => c.projectId));
  const projectsNoComm = projects.filter(p => !commProjectIds.has(p.id));
  if (projectsNoComm.length > 0) {
    warn(`${projectsNoComm.length} project(s) without commission record:`);
    for (const p of projectsNoComm) {
      info(`  ${p.name} (${p.id})`);
    }
  }

  // Commission status distribution
  const commStatusDist = {};
  for (const c of commissions) {
    commStatusDist[c.status || 'unknown'] = (commStatusDist[c.status || 'unknown'] || 0) + 1;
  }
  info(`Status distribution: ${JSON.stringify(commStatusDist)}`);

  // Commissions referencing quotes (leads) that don't exist
  const leadIds = new Set(leads.map(l => l.id));
  const projectLeadMap = {};
  for (const p of projects) {
    if (p.leadId) projectLeadMap[p.id] = p.leadId;
  }

  let orphanedQuoteRefs = 0;
  for (const c of commissions) {
    const leadId = projectLeadMap[c.projectId];
    if (leadId && !leadIds.has(leadId)) {
      report.commissionIssues.push({
        commissionId: c._id.toString(),
        issue: 'references_missing_lead',
        projectId: c.projectId,
        leadId,
      });
      orphanedQuoteRefs++;
    }
  }
  if (orphanedQuoteRefs > 0) {
    warn(`${orphanedQuoteRefs} commission(s) reference leads/quotes that don't exist`);
    report.summary.warnings += orphanedQuoteRefs;
  } else {
    ok('All commission project-lead chains are valid');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 9. EXPENSE / TRANSACTION ISSUES
  // ══════════════════════════════════════════════════════════════════════════
  header('9. EXPENSES (TRANSACTIONS)');

  const transactions = await Transaction.find({}).lean();
  const expenses = transactions.filter(t => t.type === 'expense');

  ok(`Total transactions: ${transactions.length}`);
  ok(`Expenses: ${expenses.length}`);

  // Category distribution
  const catDist = {};
  for (const t of expenses) {
    catDist[t.category || 'none'] = (catDist[t.category || 'none'] || 0) + 1;
  }
  info(`Category distribution: ${JSON.stringify(catDist)}`);

  // Expenses without category
  const noCategory = expenses.filter(t => !t.category);
  if (noCategory.length > 0) {
    warn(`${noCategory.length} expense(s) without category assigned`);
    for (const t of noCategory) {
      info(`  ${t.title} — $${t.amount}`);
      report.expenseIssues.push({
        transactionId: t.id || t._id.toString(),
        issue: 'no_category',
        title: t.title,
      });
    }
    report.summary.warnings += noCategory.length;
  } else {
    ok('All expenses have a category');
  }

  // Expenses without dateObj (migration may have missed)
  const noDateObj = expenses.filter(t => !t.dateObj);
  if (noDateObj.length > 0) {
    warn(`${noDateObj.length} expense(s) without dateObj — run migration 003`);
    report.summary.warnings += noDateObj.length;
  } else {
    ok('All expenses have dateObj populated');
  }

  // Expenses without amountUSD
  const noAmountUSD = expenses.filter(t => t.amountUSD === undefined || t.amountUSD === null);
  if (noAmountUSD.length > 0) {
    warn(`${noAmountUSD.length} expense(s) without amountUSD — run migration 003`);
    report.summary.warnings += noAmountUSD.length;
  } else {
    ok('All expenses have amountUSD populated');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  header('SUMMARY');
  console.log(`  Errors:   ${report.summary.errors}`);
  console.log(`  Warnings: ${report.summary.warnings}`);

  if (report.summary.errors === 0 && report.summary.warnings === 0) {
    console.log('\n  ✅ Data looks clean — ready for financial balance report.');
  } else if (report.summary.errors > 0) {
    console.log('\n  🔴 ERRORS found — fix these before building the report.');
  } else {
    console.log('\n  🟡 Warnings found — review before building the report.');
  }

  // Write JSON report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(__dirname, '..', 'tmp', `sanity-check-${timestamp}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n  Report saved to: ${outPath}`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Sanity check failed:', err);
  process.exit(1);
});
