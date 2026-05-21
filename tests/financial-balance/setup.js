/**
 * Shared test setup for financial balance tests.
 * Uses mongodb-memory-server for an isolated in-memory database.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Invoice from '../../server/models/Invoice.js';
import Payment from '../../server/models/Payment.js';
import Transaction from '../../server/models/Transaction.js';
import Commission from '../../server/models/Commission.js';
import Project from '../../server/models/Project.js';
import Lead from '../../server/models/Lead.js';
import User from '../../server/models/User.js';

let mongoServer;

export async function setupTestDB() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}

export async function teardownTestDB() {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
}

export async function clearCollections() {
  await Promise.all([
    Invoice.deleteMany({}),
    Payment.deleteMany({}),
    Transaction.deleteMany({}),
    Commission.deleteMany({}),
    Project.deleteMany({}),
    Lead.deleteMany({}),
    User.deleteMany({}),
  ]);
}

/**
 * Seeds a realistic financial scenario for testing.
 */
export async function seedTestData() {
  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000);

  // ── Users (consultants) ──────────────────────────────────────────────
  await User.create([
    { id: 'user-alice', name: 'Alice', email: 'alice@bm.co', role: 'consultant', hourlyCost: 50, monthlySalary: 4000 },
    { id: 'user-bob', name: 'Bob', email: 'bob@bm.co', role: 'consultant', hourlyCost: 40, monthlySalary: 3500 },
    { id: 'user-admin', name: 'Admin', email: 'admin@bm.co', role: 'admin', permissions: { admin: true } },
  ]);

  // ── Leads ────────────────────────────────────────────────────────────
  await Lead.create([
    {
      id: 'lead-acme', companyName: 'ACME Corp', contactName: 'John Doe', name: 'ACME Deal', stage: 'closed_won', value: 20000,
      expectedCloseDate: daysAgo(60).toISOString(), closedAt: daysAgo(55),
      items: [
        { description: 'Implementation', category: 'service', quantity: 1, sellPrice: 15000, unitPrice: 15000 },
        { description: 'License', category: 'license', quantity: 1, sellPrice: 8000, costPrice: 3000, unitPrice: 8000 },
      ],
    },
    {
      id: 'lead-beta', companyName: 'Beta Inc', contactName: 'Jane Smith', name: 'Beta Deal', stage: 'closed_won', value: 10000,
      expectedCloseDate: daysAgo(30).toISOString(), closedAt: daysAgo(25),
      items: [
        { description: 'Hours pack', category: 'service', quantity: 100, sellPrice: 100, unitPrice: 100 },
      ],
    },
    {
      id: 'lead-gamma', companyName: 'Gamma LLC', contactName: 'Carlos G', name: 'Gamma Deal', stage: 'negotiation', value: 30000,
      expectedCloseDate: new Date(now.getTime() + 45 * 86400000).toISOString(),
      items: [
        { description: 'Implementation', category: 'service', quantity: 1, sellPrice: 30000, unitPrice: 30000 },
      ],
    },
    {
      id: 'lead-delta', companyName: 'Delta Co', contactName: 'Maria D', name: 'Delta Proposal', stage: 'proposal', value: 50000,
      expectedCloseDate: new Date(now.getTime() + 60 * 86400000).toISOString(),
      items: [
        { description: 'Full suite', category: 'service', quantity: 1, sellPrice: 50000, unitPrice: 50000 },
      ],
    },
  ]);

  // ── Projects ─────────────────────────────────────────────────────────
  await Project.create([
    {
      id: 'proj-acme', leadId: 'lead-acme', name: 'IMPL: ACME', clientName: 'ACME Corp',
      type: 'implementation', status: 'active',
      totalBudgetHours: 200,
      consultantRates: { 'user-alice': 75, 'user-bob': 60 },
      factoryCommissionRate: 10,
      timeLogs: [
        { consultantId: 'user-alice', consultantName: 'Alice', hours: 80, date: daysAgo(40).toISOString(), status: 'approved', isBillable: true },
        { consultantId: 'user-bob', consultantName: 'Bob', hours: 40, date: daysAgo(30).toISOString(), status: 'approved', isBillable: true },
        { consultantId: 'user-alice', consultantName: 'Alice', hours: 10, date: daysAgo(20).toISOString(), status: 'pending', isBillable: true },
      ],
    },
    {
      id: 'proj-beta', leadId: 'lead-beta', name: 'HOURS: Beta', clientName: 'Beta Inc',
      type: 'hours_pack', status: 'active',
      totalBudgetHours: 100,
      consultantRates: { 'user-bob': 60 },
      factoryCommissionRate: 15,
      timeLogs: [
        { consultantId: 'user-bob', consultantName: 'Bob', hours: 50, date: daysAgo(15).toISOString(), status: 'paid', isBillable: true },
      ],
    },
  ]);

  // ── Invoices (multi-currency) ────────────────────────────────────────
  const invoiceACME = await Invoice.create({
    invoiceNumber: 'BMI-TEST-0001',
    clientId: 'ACME Corp', clientName: 'ACME Corp', projectId: 'proj-acme',
    issueDate: daysAgo(50), dueDate: daysAgo(20),
    subtotal: 20000, total: 20000, currency: 'USD', totalUSD: 20000,
    exchangeRateToUSD: 1, balanceUSD: 5000, paidAmountUSD: 15000, status: 'partially_paid',
    lineItems: [{ description: 'Implementation', quantity: 1, unitPrice: 20000, amount: 20000 }],
  });

  const invoiceBeta = await Invoice.create({
    invoiceNumber: 'BMI-TEST-0002',
    clientId: 'Beta Inc', clientName: 'Beta Inc', projectId: 'proj-beta',
    issueDate: daysAgo(20), dueDate: daysAgo(0),
    subtotal: 10000, total: 10000, currency: 'USD', totalUSD: 10000,
    exchangeRateToUSD: 1, balanceUSD: 10000, paidAmountUSD: 0, status: 'issued',
    lineItems: [{ description: 'Hours pack', quantity: 100, unitPrice: 100, amount: 10000 }],
  });

  // Invoice in COP (multi-currency test)
  const invoiceCOP = await Invoice.create({
    invoiceNumber: 'BMI-TEST-0003',
    clientId: 'ACME Corp', clientName: 'ACME Corp', projectId: 'proj-acme',
    issueDate: daysAgo(10), dueDate: new Date(now.getTime() + 20 * 86400000),
    subtotal: 16000000, total: 16000000, currency: 'COP', totalUSD: 4000,
    exchangeRateToUSD: 4000, balanceUSD: 4000, paidAmountUSD: 0, status: 'issued',
    lineItems: [{ description: 'License renewal', quantity: 1, unitPrice: 16000000, amount: 16000000 }],
  });

  // ── Payments (partial, multi-currency) ───────────────────────────────
  await Payment.create([
    {
      clientId: 'ACME Corp', clientName: 'ACME Corp',
      paymentDate: daysAgo(35), amount: 10000, currency: 'USD', amountUSD: 10000,
      exchangeRateToUSD: 1, exchangeRateSource: 'manual', method: 'wire_transfer',
      appliedTo: [{ invoiceId: invoiceACME._id.toString(), amountApplied: 10000, amountAppliedUSD: 10000 }],
    },
    {
      clientId: 'ACME Corp', clientName: 'ACME Corp',
      paymentDate: daysAgo(10), amount: 20000000, currency: 'COP', amountUSD: 5000,
      exchangeRateToUSD: 4000, exchangeRateSource: 'auto', method: 'wire_transfer',
      appliedTo: [{ invoiceId: invoiceACME._id.toString(), amountApplied: 5000, amountAppliedUSD: 5000 }],
    },
  ]);

  // ── Transactions (expenses) ──────────────────────────────────────────
  await Transaction.create([
    { id: 'tx-1', title: 'AWS Hosting', amount: 500, amountUSD: 500, currency: 'USD', exchangeRateToUSD: 1, date: daysAgo(45).toISOString(), dateObj: daysAgo(45), type: 'expense', category: 'software', projectId: 'proj-acme' },
    { id: 'tx-2', title: 'AWS Hosting', amount: 500, amountUSD: 500, currency: 'USD', exchangeRateToUSD: 1, date: daysAgo(15).toISOString(), dateObj: daysAgo(15), type: 'expense', category: 'software' },
    { id: 'tx-3', title: 'Office Rent', amount: 2000, amountUSD: 2000, currency: 'USD', exchangeRateToUSD: 1, date: daysAgo(30).toISOString(), dateObj: daysAgo(30), type: 'expense', category: 'office' },
    { id: 'tx-4', title: 'Alice Salary', amount: 4000, amountUSD: 4000, currency: 'USD', exchangeRateToUSD: 1, date: daysAgo(5).toISOString(), dateObj: daysAgo(5), type: 'expense', category: 'salary' },
    { id: 'tx-5', title: 'Bob Salary', amount: 3500, amountUSD: 3500, currency: 'USD', exchangeRateToUSD: 1, date: daysAgo(5).toISOString(), dateObj: daysAgo(5), type: 'expense', category: 'salary' },
    { id: 'tx-6', title: 'Marketing Campaign', amount: 1200, amountUSD: 1200, currency: 'USD', exchangeRateToUSD: 1, date: daysAgo(25).toISOString(), dateObj: daysAgo(25), type: 'expense', category: 'marketing' },
  ]);

  // ── Commissions ──────────────────────────────────────────────────────
  await Commission.create([
    {
      projectId: 'proj-acme', projectName: 'IMPL: ACME', clientId: 'ACME Corp', clientName: 'ACME Corp',
      rate: 10, revenueUSD: 20000, costUSD: 8900, netUtilityUSD: 11100, amountUSD: 1110,
      split: { bmRetainedUSD: 3996, fabianShareUSD: 2997, spencerShareUSD: 2997 },
      status: 'approved', paidAmountUSD: 0,
    },
    {
      projectId: 'proj-beta', projectName: 'HOURS: Beta', clientId: 'Beta Inc', clientName: 'Beta Inc',
      rate: 15, revenueUSD: 10000, costUSD: 3000, netUtilityUSD: 7000, amountUSD: 1050,
      split: { bmRetainedUSD: 2380, fabianShareUSD: 1785, spencerShareUSD: 1785 },
      status: 'pending', paidAmountUSD: 0,
    },
  ]);

  return {
    invoiceACME, invoiceBeta, invoiceCOP,
  };
}
