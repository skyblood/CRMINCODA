/**
 * Migration: Derive Commission documents from existing Projects
 *
 * Run: node server/migrations/002-create-commissions-from-projects.js
 *
 * Idempotent: skips projects that already have a Commission record.
 *
 * Logic (mirrors ProfitabilityReport.tsx):
 *   soldValue   = lead.items sum (services at full price, licenses at margin)
 *   laborCost   = sum(timeLog.hours * consultantRate) for approved/paid logs
 *   expenses    = sum(transactions where type='expense' and projectId matches)
 *   netUtility  = soldValue - laborCost - expenses
 *   commission  = netUtility > 0 ? netUtility * (factoryCommissionRate / 100) : 0
 *   split       = BM 40% / Fabian 30% / Spencer 30%
 *   status      = derived from consultant_payment transactions
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import Project from '../models/Project.js';
import Lead from '../models/Lead.js';
import Transaction from '../models/Transaction.js';
import Commission from '../models/Commission.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm_blackmoon';

async function migrate() {
  console.log('Connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  const projects = await Project.find({}).lean();
  const leads = await Lead.find({}).lean();
  const transactions = await Transaction.find({ type: 'expense' }).lean();

  const leadMap = {};
  for (const l of leads) leadMap[l.id] = l;

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const project of projects) {
    // Skip if commission already exists
    const existing = await Commission.findOne({ projectId: project.id });
    if (existing) {
      skipped++;
      continue;
    }

    const lead = leadMap[project.leadId];

    // Calculate sold value (same logic as ProfitabilityReport)
    let soldValue = 0;
    if (lead?.items?.length) {
      for (const item of lead.items) {
        if (item.category === 'license') {
          const cost = item.costPrice || item.unitCost || 0;
          const sell = item.sellPrice || item.unitPrice || 0;
          soldValue += (sell - cost) * (item.quantity || 1);
        } else {
          const price = item.sellPrice || item.unitPrice || 0;
          soldValue += price * (item.quantity || 1);
        }
      }
    }
    if (soldValue <= 0 && lead?.value) {
      soldValue = lead.value;
    }

    // Calculate labor cost
    const timeLogs = project.timeLogs || [];
    let laborCost = 0;
    for (const log of timeLogs) {
      if (log.status === 'approved' || log.status === 'paid') {
        const consultantId = log.odooEmployeeId || log.odooConsultantId || log.consultantId || log.userId;
        const rate = (project.consultantRates && project.consultantRates[consultantId]) || 0;
        laborCost += (log.hours || 0) * rate;
      }
    }

    // Calculate expenses
    const projectExpenses = transactions.filter(t =>
      t.projectId === project.id || (t.leadId && lead && t.leadId === lead.id)
    );
    const totalExpenses = projectExpenses.reduce((sum, t) => sum + (t.amount || 0), 0);

    // Net utility and commission
    const totalCost = laborCost + totalExpenses;
    const netUtility = soldValue - totalCost;
    const rate = project.factoryCommissionRate !== undefined ? project.factoryCommissionRate : 10;
    const commissionAmount = netUtility > 0 ? netUtility * (rate / 100) : 0;

    // Split
    const blackMoonUtility = netUtility - commissionAmount;
    const bmRetained = blackMoonUtility * 0.40;
    const fabianShare = blackMoonUtility * 0.30;
    const spencerShare = blackMoonUtility * 0.30;

    // Determine payment status from consultant_payment transactions
    const commissionPayments = transactions.filter(t =>
      t.projectId === project.id &&
      t.category === 'consultant_payment'
    );
    const paidAmount = commissionPayments.reduce((sum, t) => sum + (t.amount || 0), 0);

    let status = 'pending';
    if (commissionAmount <= 0) {
      status = 'cancelled';
    } else if (paidAmount >= commissionAmount) {
      status = 'paid';
    } else if (paidAmount > 0) {
      status = 'partially_paid';
    }

    const paymentRefs = commissionPayments.map(t => ({
      transactionId: t.id,
      amount: t.amount,
      date: t.date ? new Date(t.date) : new Date(t.createdAt),
      reference: t.description || '',
    }));

    try {
      await Commission.create({
        projectId: project.id,
        projectName: project.name,
        clientId: lead?.clientId || lead?.companyName || project.clientName,
        clientName: project.clientName,
        rate,
        revenueUSD: soldValue,
        costUSD: totalCost,
        netUtilityUSD: netUtility,
        amountUSD: commissionAmount,
        split: {
          bmRetainedUSD: bmRetained,
          fabianShareUSD: fabianShare,
          spencerShareUSD: spencerShare,
        },
        status,
        paidAmountUSD: paidAmount,
        paymentRefs,
        legacy_migration: true,
      });
      created++;
      console.log(`  [OK] ${project.name} → $${commissionAmount.toFixed(2)} (${status})`);
    } catch (err) {
      errors++;
      console.error(`  [ERR] ${project.name}: ${err.message}`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${created}`);
  console.log(`Skipped (already exist): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total projects: ${projects.length}`);

  await mongoose.disconnect();
  console.log('Done.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
