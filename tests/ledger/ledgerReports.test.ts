import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import ledgerReportsRouter from '../../server/routes/ledgerReports.js';
import JournalEntry from '../../server/models/JournalEntry.js';

const app = express();
app.use(express.json());
app.use('/api/ledger-reports', ledgerReportsRouter);

before(setupTestDB);
after(teardownTestDB);
beforeEach(async () => {
    await clearLedgerCollections();
    await seedChartOfAccounts();
    // Opening balance: owner contributes $10,000 cash
    await JournalEntry.create({
        date: new Date('2026-06-11'), source: 'opening_balance',
        lines: [
            { accountId: 'coa_1000', debit: 10000, amountUSD: 10000 },
            { accountId: 'coa_3000', credit: 10000, amountUSD: 10000 },
        ],
    });
    // Income: $5,000 payment received
    await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'payment',
        lines: [
            { accountId: 'coa_1000', debit: 5000, amountUSD: 5000 },
            { accountId: 'coa_4000', credit: 5000, amountUSD: 5000 },
        ],
    });
    // Expense: $1,200 software
    await JournalEntry.create({
        date: new Date('2026-07-05'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 1200, amountUSD: 1200 },
            { accountId: 'coa_1000', credit: 1200, amountUSD: 1200 },
        ],
    });
});

describe('GET /api/ledger-reports/trial-balance', () => {
  it('sums to zero (total debits = total credits) across all accounts', async () => {
    const res = await request(app).get('/api/ledger-reports/trial-balance');
    assert.equal(res.status, 200);
    const totalDebit = res.body.reduce((s, a) => s + a.debit, 0);
    const totalCredit = res.body.reduce((s, a) => s + a.credit, 0);
    assert.ok(Math.abs(totalDebit - totalCredit) < 0.01);
  });
});

describe('GET /api/ledger-reports/pl', () => {
  it('computes net income = income - expense for the given range', async () => {
    const res = await request(app).get('/api/ledger-reports/pl?start=2026-07-01&end=2026-07-31');
    assert.equal(res.status, 200);
    assert.equal(res.body.totalIncome, 5000);
    assert.equal(res.body.totalExpense, 1200);
    assert.equal(res.body.netIncome, 3800);
  });

  it('excludes the June opening balance from a July-only range', async () => {
    const res = await request(app).get('/api/ledger-reports/pl?start=2026-07-01&end=2026-07-31');
    assert.equal(res.body.totalIncome, 5000); // not 15000
  });
});

describe('GET /api/ledger-reports/balance-sheet', () => {
  it('balances Assets = Liabilities + Equity as of a date', async () => {
    const res = await request(app).get('/api/ledger-reports/balance-sheet?asOf=2026-07-31');
    assert.equal(res.status, 200);
    assert.equal(res.body.totalAssets, 13800); // 10000 + 5000 - 1200 cash
    assert.equal(res.body.balanced, true);
  });
});
