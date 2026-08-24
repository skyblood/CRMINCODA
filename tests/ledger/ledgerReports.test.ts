import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import ledgerReportsRouter from '../../server/routes/ledgerReports.js';
import JournalEntry from '../../server/models/JournalEntry.js';
import User from '../../server/models/User.js';
import { encrypt } from '../../server/utils/encryption.js';

// Default session: finance permission. Most tests in this file exercise
// routes with no permission gate at all (trial-balance/pl/balance-sheet) or
// need finance access to reach the interesting behavior of gated routes
// (/1099, /1099/export) — matches how a real dashboard caller is provisioned.
// Tests that specifically exercise the permission gate build their own app
// via buildFinanceApp/buildNonFinanceApp below.
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => { req.session = { user: { permissions: { finance: true } } }; next(); });
app.use('/api/ledger-reports', ledgerReportsRouter);

function buildFinanceApp() {
    const a = express();
    a.use((req: any, _res, next) => { req.session = { user: { permissions: { finance: true } } }; next(); });
    a.use('/api/ledger-reports', ledgerReportsRouter);
    return a;
}
function buildAdminApp() {
    const a = express();
    a.use((req: any, _res, next) => { req.session = { user: { permissions: { admin: true } } }; next(); });
    a.use('/api/ledger-reports', ledgerReportsRouter);
    return a;
}
function buildNonFinanceApp() {
    const a = express();
    a.use((req: any, _res, next) => { req.session = { user: { permissions: {} } }; next(); });
    a.use('/api/ledger-reports', ledgerReportsRouter);
    return a;
}

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

  beforeEach(async () => {
    await User.deleteMany({});
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
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

  it('resolves entityId to the consultant name and flags whether a TIN is on file', async () => {
    await User.create({ id: 'user-alice', name: 'Alice Consultant', email: 'alice@example.com', role: 'consultant', taxInfo: { tinEncrypted: encrypt('123456789'), tinLast4: '6789', tinType: 'SSN' } });
    await User.create({ id: 'user-bob', name: 'Bob Consultant', email: 'bob@example.com', role: 'consultant' });

    const res = await request(app).get('/api/ledger-reports/1099?year=2026');
    const alice = res.body.find((r: any) => r.entityId === 'user-alice');
    const bob = res.body.find((r: any) => r.entityId === 'user-bob');

    assert.equal(alice.name, 'Alice Consultant');
    assert.equal(alice.hasTIN, true);
    assert.equal(bob.name, 'Bob Consultant');
    assert.equal(bob.hasTIN, false);
  });

  it('falls back to entityId as the name when no matching User exists', async () => {
    const res = await request(app).get('/api/ledger-reports/1099?year=2026');
    const orphan = res.body.find((r: any) => r.entityId === 'user-alice' || r.entityId === 'user-bob');
    assert.ok(orphan.name); // some string, either the resolved name or the raw entityId
  });

  it('rejects a non-finance, non-admin caller with 403 (Task 4 review Finding 2)', async () => {
    const res = await request(buildNonFinanceApp()).get('/api/ledger-reports/1099?year=2026');
    assert.equal(res.status, 403);
  });

  it('returns the normal 200 payload for a finance caller (Task 4 review Finding 2)', async () => {
    const res = await request(buildFinanceApp()).get('/api/ledger-reports/1099?year=2026');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it('returns the normal 200 payload for an admin caller (Task 4 review Finding 2)', async () => {
    const res = await request(buildAdminApp()).get('/api/ledger-reports/1099?year=2026');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });
});

describe('GET /api/ledger-reports/1099/export', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
    await JournalEntry.create({
      date: new Date('2026-03-01'), source: 'payroll',
      lines: [
        { accountId: 'coa_6100', debit: 4000, amountUSD: 4000, entityId: 'user-alice' },
        { accountId: 'coa_1000', credit: 4000, amountUSD: 4000 },
      ],
    });
    await User.create({
      id: 'user-alice', name: 'Alice Consultant', email: 'alice@example.com', role: 'consultant',
      taxInfo: { legalName: 'Alice A. Consultant', tinEncrypted: encrypt('123456789'), tinLast4: '6789', tinType: 'SSN', address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' } },
    });
  });

  it('rejects a non-finance, non-admin caller with 403', async () => {
    const res = await request(buildNonFinanceApp()).get('/api/ledger-reports/1099/export?year=2026');
    assert.equal(res.status, 403);
  });

  it('returns a CSV with the decrypted TIN for a finance caller', async () => {
    const res = await request(buildFinanceApp()).get('/api/ledger-reports/1099/export?year=2026');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    const lines = res.text.trim().split('\n');
    assert.equal(lines[0], 'Recipient Name,TIN,TIN Type,Address,City,State,Zip,Box1_NonemployeeComp');
    assert.match(lines[1], /Alice A\. Consultant,123456789,SSN,1 Main St,Austin,TX,78701,4000\.00/);
  });

  it('returns only the header row when no contractor crosses the threshold', async () => {
    const res = await request(buildFinanceApp()).get('/api/ledger-reports/1099/export?year=2020');
    assert.equal(res.status, 200);
    assert.equal(res.text.trim(), 'Recipient Name,TIN,TIN Type,Address,City,State,Zip,Box1_NonemployeeComp');
  });

  it('neutralizes a formula-injection payload in legalName with a leading apostrophe (Task 4 review Finding 1)', async () => {
    await User.findOneAndUpdate(
      { id: 'user-alice' },
      { $set: { 'taxInfo.legalName': '=1+1' } },
    );

    const res = await request(buildFinanceApp()).get('/api/ledger-reports/1099/export?year=2026');
    assert.equal(res.status, 200);
    const lines = res.text.trim().split('\n');
    const cells = lines[1].split(',');
    // First cell must be neutralized: leading apostrophe before the '=',
    // not a bare formula-triggering '='.
    assert.equal(cells[0], "'=1+1");
  });

  it('neutralizes a quote/comma-bearing formula-injection payload (HYPERLINK) correctly, including CSV quoting (Task 4 review Finding 1)', async () => {
    await User.findOneAndUpdate(
      { id: 'user-alice' },
      { $set: { 'taxInfo.legalName': '=HYPERLINK("http://evil.com","x")' } },
    );

    const res = await request(buildFinanceApp()).get('/api/ledger-reports/1099/export?year=2026');
    assert.equal(res.status, 200);
    const lines = res.text.trim().split('\n');
    // The value needs CSV-quoting (it contains commas/quotes) AND
    // formula-neutralizing (it starts with '='): the quoted cell's content
    // must start with an apostrophe immediately after the opening quote.
    assert.match(lines[1], /^"'=HYPERLINK\(/);
  });

  it('neutralizes a formula-injection payload starting with +, -, or @ as well (Task 4 review Finding 1)', async () => {
    await User.findOneAndUpdate(
      { id: 'user-alice' },
      { $set: { 'taxInfo.address.line1': '+1 234 555 0000' } },
    );

    const res = await request(buildFinanceApp()).get('/api/ledger-reports/1099/export?year=2026');
    assert.equal(res.status, 200);
    const lines = res.text.trim().split('\n');
    const cells = lines[1].split(',');
    // Address (Column 4, index 3) should be neutralized
    assert.equal(cells[3], "'+1 234 555 0000");
  });

  it('includes a row with a blank TIN for a qualifying entityId with no matching User (Task 4 review Finding 3)', async () => {
    await JournalEntry.create({
      date: new Date('2026-05-01'), source: 'payroll',
      lines: [
        { accountId: 'coa_6100', debit: 700, amountUSD: 700, entityId: 'user-orphan' },
        { accountId: 'coa_1000', credit: 700, amountUSD: 700 },
      ],
    });

    const res = await request(buildFinanceApp()).get('/api/ledger-reports/1099/export?year=2026');
    assert.equal(res.status, 200);
    const lines = res.text.trim().split('\n');
    const orphanLine = lines.find(l => l.startsWith('user-orphan,'));
    assert.ok(orphanLine, 'expected a row for the orphan entityId with blank TIN');
    const cells = orphanLine!.split(',');
    assert.equal(cells[0], 'user-orphan'); // falls back to entityId as name
    assert.equal(cells[1], ''); // blank TIN, not dropped
  });

  it('emits TIN_DECRYPT_ERROR for a row whose tinEncrypted is corrupted, without failing the whole export (Task 4 review Finding 4)', async () => {
    await JournalEntry.create({
      date: new Date('2026-05-01'), source: 'payroll',
      lines: [
        { accountId: 'coa_6100', debit: 800, amountUSD: 800, entityId: 'user-corrupt' },
        { accountId: 'coa_1000', credit: 800, amountUSD: 800 },
      ],
    });
    await User.create({
      id: 'user-corrupt', name: 'Corrupt TIN Consultant', email: 'corrupt@example.com', role: 'consultant',
      taxInfo: { legalName: 'Corrupt TIN Consultant', tinEncrypted: 'not-a-valid-ciphertext-at-all', tinType: 'SSN' },
    });

    const res = await request(buildFinanceApp()).get('/api/ledger-reports/1099/export?year=2026');
    assert.equal(res.status, 200); // rest of the export still succeeds
    const lines = res.text.trim().split('\n');

    // Alice's row (valid TIN) is still intact.
    assert.ok(lines.some(l => l.startsWith('Alice A. Consultant,123456789,')));

    const corruptLine = lines.find(l => l.startsWith('Corrupt TIN Consultant,'));
    assert.ok(corruptLine, 'expected a row for the corrupt-TIN entityId');
    const cells = corruptLine!.split(',');
    assert.equal(cells[1], 'TIN_DECRYPT_ERROR');
  });
});
