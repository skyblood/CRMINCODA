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

describe('sumByAccount prototype pollution defense (Task 17 review Fix 1)', () => {
  // `line.accountId` is a bare, unvalidated string on JournalLineSchema — the
  // journal-entries CREATE route now rejects unknown accountIds at the door
  // (see journalEntriesRoute.test.ts), but this test proves the aggregation
  // in ledgerReports.js is *also* hardened in depth: even if an entry with a
  // "__proto__" accountId ends up in the DB (e.g. inserted directly, or via
  // any future code path that bypasses the route), report aggregation must
  // never write through the prototype chain.
  it('does not pollute Object.prototype when an entry has a "__proto__" accountId', async () => {
    await JournalEntry.create({
      date: new Date('2026-07-10'), source: 'manual',
      lines: [
        { accountId: '__proto__', debit: 999, amountUSD: 999 },
        { accountId: 'coa_1000', credit: 999, amountUSD: 999 },
      ],
    });

    const res = await request(app).get('/api/ledger-reports/pl?start=2026-07-01&end=2026-07-31');
    assert.equal(res.status, 200);

    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'debit'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'credit'), false);
    assert.equal(({}).debit, undefined);
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

describe('date-only end/asOf boundary is inclusive of the full day (Task 17 review Fix 3)', () => {
  // `new Date("2026-07-31")` parses to UTC midnight, so before the fix a
  // same-day entry posted later that day (in any timezone at or behind UTC)
  // was silently excluded by the `$lte` filter — the default "today" view of
  // these reports omitted everything from today.
  it('/pl includes an entry timestamped later on the same calendar day as `end`', async () => {
    await JournalEntry.create({
      date: new Date('2026-07-31T23:00:00.000Z'), source: 'expense',
      lines: [
        { accountId: 'coa_6300', debit: 50, amountUSD: 50 },
        { accountId: 'coa_1000', credit: 50, amountUSD: 50 },
      ],
    });
    const res = await request(app).get('/api/ledger-reports/pl?start=2026-07-01&end=2026-07-31');
    assert.equal(res.status, 200);
    assert.equal(res.body.totalExpense, 1250); // 1200 seeded + 50 same-day-later
  });

  it('/balance-sheet includes an entry timestamped later on the same calendar day as `asOf`', async () => {
    await JournalEntry.create({
      date: new Date('2026-07-31T23:00:00.000Z'), source: 'expense',
      lines: [
        { accountId: 'coa_6300', debit: 50, amountUSD: 50 },
        { accountId: 'coa_1000', credit: 50, amountUSD: 50 },
      ],
    });
    const res = await request(app).get('/api/ledger-reports/balance-sheet?asOf=2026-07-31');
    assert.equal(res.status, 200);
    assert.equal(res.body.totalAssets, 13750); // 13800 seeded - 50 same-day-later expense
    assert.equal(res.body.balanced, true);
  });
});

describe('GET /api/ledger-reports/1099', () => {
  beforeEach(async () => {
    await JournalEntry.create({
      date: new Date('2026-03-01'), source: 'payroll',
      lines: [
        { accountId: 'coa_6100', debit: 4000, amountUSD: 4000, entityId: 'user-alice' },
        { accountId: 'coa_1000', credit: 4000, amountUSD: 4000 },
      ],
    });
    await JournalEntry.create({
      date: new Date('2026-04-01'), source: 'payroll',
      lines: [
        { accountId: 'coa_6100', debit: 300, amountUSD: 300, entityId: 'user-bob' },
        { accountId: 'coa_1000', credit: 300, amountUSD: 300 },
      ],
    });
  });

  it('aggregates Contract Labor payments by entityId for the given year', async () => {
    const res = await request(app).get('/api/ledger-reports/1099?year=2026');
    assert.equal(res.status, 200);
    const alice = res.body.find((r: any) => r.entityId === 'user-alice');
    const bob = res.body.find((r: any) => r.entityId === 'user-bob');
    assert.equal(alice.totalUSD, 4000);
    assert.equal(alice.crossesThreshold, true);
    assert.equal(bob.totalUSD, 300);
    assert.equal(bob.crossesThreshold, false);
  });

  it('excludes years outside the requested range', async () => {
    const res = await request(app).get('/api/ledger-reports/1099?year=2025');
    assert.deepEqual(res.body, []);
  });
});
