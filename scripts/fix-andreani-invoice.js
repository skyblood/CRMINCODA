/**
 * One-shot fix: Create missing ANDREANI invoice that failed during migration 001.
 * Run: node scripts/fix-andreani-invoice.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

import Invoice from '../server/models/Invoice.js';
import Project from '../server/models/Project.js';
import Lead from '../server/models/Lead.js';
import Settings from '../server/models/Settings.js';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm_incoda';

async function run() {
  await mongoose.connect(MONGO_URI);

  // Check if already fixed
  const existing = await Invoice.findOne({ clientName: /ANDREANI/i });
  if (existing) {
    console.log('ANDREANI invoice already exists:', existing.invoiceNumber);
    await mongoose.disconnect();
    return;
  }

  const project = await Project.findOne({ name: /ANDREANI/i }).lean();
  if (!project) {
    console.log('No ANDREANI project found');
    await mongoose.disconnect();
    return;
  }

  const lead = project.leadId ? await Lead.findOne({ id: project.leadId }).lean() : null;

  // Get next invoice number
  const settings = await Settings.findOneAndUpdate(
    { id: 'global' },
    { $inc: { invoiceCounterNextNumber: 1 } },
    { new: true }
  );
  const num = settings.invoiceCounterNextNumber;
  const prefix = settings.invoiceCounterPrefix || 'BMI';
  const invoiceNumber = `${prefix}-${new Date().getFullYear()}-${String(num).padStart(4, '0')}`;

  // Calculate total from lead items
  let total = 0;
  if (lead?.items?.length) {
    for (const item of lead.items) {
      const price = item.sellPrice || item.unitPrice || 0;
      total += price * (item.quantity || 1);
    }
  }
  if (total <= 0) total = lead?.value || 0;

  const inv = await Invoice.create({
    invoiceNumber,
    clientId: lead?.companyName || project.clientName,
    clientName: project.clientName,
    projectId: project.id,
    quoteId: lead?.id,
    issueDate: new Date(project.createdAt),
    dueDate: new Date(new Date(project.createdAt).getTime() + 30 * 86400000),
    subtotal: total,
    taxRate: 0,
    taxAmount: 0,
    total,
    currency: 'USD',
    totalUSD: total,
    exchangeRateToUSD: 1,
    balanceUSD: total,
    paidAmountUSD: 0,
    status: 'issued',
    legacy_migration: true,
    lineItems: (lead?.items || []).map(i => ({
      description: i.description || i.name || 'Service',
      quantity: i.quantity || 1,
      unitPrice: i.sellPrice || i.unitPrice || 0,
      amount: (i.sellPrice || i.unitPrice || 0) * (i.quantity || 1),
    })),
  });

  console.log('Created:', inv.invoiceNumber, '-', inv.clientName, '- $' + inv.totalUSD);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
