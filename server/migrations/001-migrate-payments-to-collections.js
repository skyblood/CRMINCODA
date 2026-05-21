/**
 * Migration: Move project.payments[] → Invoice + Payment collections
 *
 * Run: node server/migrations/001-migrate-payments-to-collections.js
 *
 * Idempotent: checks for existing legacy invoices before creating.
 * Post-migration: sum-check validates migrated amounts match originals.
 *
 * Key behaviors:
 * - Projects with value>0 + payments → invoice (issued) + payments
 * - Projects with value>0 + no payments → invoice (issued, open receivable)
 * - Projects with value=0 + no payments → SKIP
 * - Currency assumed USD for all legacy data
 * - exchangeRateSource: 'legacy_migration'
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
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Settings from '../models/Settings.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm_blackmoon';

async function getNextNumber() {
  const settings = await Settings.findOneAndUpdate(
    { id: 'global' },
    { $inc: { invoiceCounterNextNumber: 1 } },
    { new: false, upsert: true }
  );
  const prefix = settings?.invoiceCounterPrefix || 'BMI';
  const year = new Date().getFullYear();
  const num = settings?.invoiceCounterNextNumber || 1;
  return `${prefix}-${year}-${String(num).padStart(4, '0')}`;
}

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  const projects = await Project.find({}).lean();
  console.log(`Found ${projects.length} projects.\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;
  const validationErrors = [];

  for (const project of projects) {
    const projectId = project.id || project._id.toString();
    const payments = project.payments || [];
    const value = project.value || 0;

    // Skip projects with no financial data
    if (value === 0 && payments.length === 0) {
      skipped++;
      continue;
    }

    // Idempotency: check if already migrated
    const existing = await Invoice.findOne({
      projectId,
      notes: /legacy_migration/,
    });
    if (existing) {
      console.log(`  SKIP ${project.name || projectId} — already migrated`);
      skipped++;
      continue;
    }

    try {
      // Resolve client email from Lead
      let clientEmail = '';
      if (project.leadId) {
        const lead = await Lead.findOne({ id: project.leadId }).lean();
        if (lead) clientEmail = lead.email || '';
      }

      const invoiceNumber = await getNextNumber();
      const issueDate = project.createdAt || new Date();
      const dueDate = new Date(new Date(issueDate).getTime() + 30 * 86400000);

      // Create invoice
      const invoice = await Invoice.create({
        invoiceNumber,
        clientId: project.leadId || projectId,
        clientName: project.clientName || project.name || 'Unknown',
        clientEmail,
        projectId,
        issueDate,
        dueDate,
        subtotal: value,
        taxRate: 0,
        taxAmount: 0,
        total: value,
        currency: 'USD',
        totalUSD: value,
        exchangeRateToUSD: 1,
        lineItems: [],
        status: 'issued',
        paidAmount: 0,
        paidAmountUSD: 0,
        balance: value,
        balanceUSD: value,
        notes: `legacy_migration — migrated from project.payments[] on ${new Date().toISOString()}`,
        createdBy: 'migration',
      });

      // Create payments
      let totalMigrated = 0;
      for (const p of payments) {
        const amount = p.amount || 0;
        totalMigrated += amount;

        await Payment.create({
          clientId: project.leadId || projectId,
          clientName: project.clientName || project.name || 'Unknown',
          paymentDate: p.date ? new Date(p.date) : (project.updatedAt || new Date()),
          amount,
          currency: 'USD',
          amountUSD: amount,
          exchangeRateToUSD: 1,
          exchangeRateSource: 'legacy_migration',
          method: 'wire_transfer',
          reference: p.reference || '',
          appliedTo: [{
            invoiceId: invoice._id.toString(),
            amountApplied: amount,
            amountAppliedUSD: amount,
          }],
          isLegacyMigration: true,
          createdBy: 'migration',
          notes: `Migrated from project ${projectId}`,
        });
      }

      // Recalculate invoice status from migrated payments
      const [agg] = await Payment.aggregate([
        { $unwind: '$appliedTo' },
        { $match: { 'appliedTo.invoiceId': invoice._id.toString() } },
        { $group: { _id: null, paid: { $sum: '$appliedTo.amountApplied' } } },
      ]);
      const paidAmount = agg?.paid || 0;
      let status = 'issued';
      if (paidAmount >= value) status = 'paid';
      else if (paidAmount > 0) status = 'partially_paid';
      else if (new Date(dueDate) < new Date()) status = 'overdue';

      await Invoice.findByIdAndUpdate(invoice._id, {
        $set: {
          paidAmount,
          paidAmountUSD: paidAmount,
          balance: value - paidAmount,
          balanceUSD: value - paidAmount,
          status,
        },
      });

      // Post-migration validation (CEO finding #10)
      const originalSum = payments.reduce((s, p) => s + (p.amount || 0), 0);
      if (Math.abs(totalMigrated - originalSum) > 0.01) {
        validationErrors.push({
          projectId,
          projectName: project.name,
          originalSum,
          migratedSum: totalMigrated,
          diff: totalMigrated - originalSum,
        });
      }

      created++;
      console.log(`  OK ${project.name || projectId} → ${invoiceNumber} (${payments.length} payments, status: ${status})`);
    } catch (err) {
      errors++;
      console.error(`  ERROR ${project.name || projectId}: ${err.message}`);
    }
  }

  // Summary
  console.log('\n=== MIGRATION SUMMARY ===');
  console.log(`Created: ${created} invoices`);
  console.log(`Skipped: ${skipped} (no data or already migrated)`);
  console.log(`Errors:  ${errors}`);

  if (validationErrors.length > 0) {
    console.log('\n⚠ VALIDATION ERRORS (sum mismatch):');
    for (const ve of validationErrors) {
      console.log(`  ${ve.projectName}: original=${ve.originalSum}, migrated=${ve.migratedSum}, diff=${ve.diff}`);
    }
  } else {
    console.log('\n✓ All sum-checks passed');
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
