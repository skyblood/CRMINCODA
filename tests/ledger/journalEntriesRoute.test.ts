// tests/ledger/journalEntriesRoute.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import journalEntriesRouter from '../../server/routes/journalEntries.js';
import JournalEntry from '../../server/models/JournalEntry.js';

function buildApp(role) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { user: { role, email: `${role}@example.com` } }; next(); });
  a.use('/api/journal-entries', journalEntriesRouter);
  return a;
}

const app = buildApp('admin'); // stub session — admin, as in the original brief
const nonAdminApp = buildApp('sales'); // stub session — non-admin, for authorization tests

before(setupTestDB);
after(teardownTestDB);
beforeEach(async () => { await clearLedgerCollections(); await seedChartOfAccounts(); });

describe('POST /api/journal-entries', () => {
  it('creates a balanced manual entry', async () => {
    const res = await request(app).post('/api/journal-entries').send({
      date: '2026-07-01', memo: 'Opening balance', source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 1000, amountUSD: 1000 },
        { accountId: 'coa_3000', credit: 1000, amountUSD: 1000 },
      ],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'posted');
  });

  it('rejects an unbalanced manual entry with 400', async () => {
    const res = await request(app).post('/api/journal-entries').send({
      date: '2026-07-01', source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 1000, amountUSD: 1000 },
        { accountId: 'coa_3000', credit: 900, amountUSD: 900 },
      ],
    });
    assert.equal(res.status, 400);
  });

  it('rejects a new entry dated inside a closed period', async () => {
    await request(app).post('/api/journal-entries/close-period').send({ year: 2026, month: 7 });
    const res = await request(app).post('/api/journal-entries').send({
      date: '2026-07-15', source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 100, amountUSD: 100 },
        { accountId: 'coa_3000', credit: 100, amountUSD: 100 },
      ],
    });
    assert.equal(res.status, 409);
  });

  it('rejects an entry with a missing date with 400 (does not silently bypass the closed-period guard)', async () => {
    const res = await request(app).post('/api/journal-entries').send({
      source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 100, amountUSD: 100 },
        { accountId: 'coa_3000', credit: 100, amountUSD: 100 },
      ],
    });
    assert.equal(res.status, 400);
  });

  it('rejects an entry with an unparseable date with 400', async () => {
    const res = await request(app).post('/api/journal-entries').send({
      date: 'not-a-real-date', source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 100, amountUSD: 100 },
        { accountId: 'coa_3000', credit: 100, amountUSD: 100 },
      ],
    });
    assert.equal(res.status, 400);
  });
});

describe('POST /api/journal-entries/:id/void', () => {
  it('marks the entry void without deleting it', async () => {
    const entry = await JournalEntry.create({
      date: new Date(), source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 50, amountUSD: 50 },
        { accountId: 'coa_3000', credit: 50, amountUSD: 50 },
      ],
    });
    const res = await request(app).post(`/api/journal-entries/${entry._id}/void`);
    assert.equal(res.status, 200);
    const reloaded = await JournalEntry.findById(entry._id).lean();
    assert.equal(reloaded.status, 'void');
  });

  it('rejects voiding an entry dated inside a closed period with 409', async () => {
    const entry = await JournalEntry.create({
      date: new Date('2026-07-10'), source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 50, amountUSD: 50 },
        { accountId: 'coa_3000', credit: 50, amountUSD: 50 },
      ],
    });
    await request(app).post('/api/journal-entries/close-period').send({ year: 2026, month: 7 });
    const res = await request(app).post(`/api/journal-entries/${entry._id}/void`);
    assert.equal(res.status, 409);
    const reloaded = await JournalEntry.findById(entry._id).lean();
    assert.equal(reloaded.status, 'posted');
  });
});

describe('POST /api/journal-entries/close-period', () => {
  it('closes a valid period for an admin caller', async () => {
    const res = await request(app).post('/api/journal-entries/close-period').send({ year: 2026, month: 8 });
    assert.equal(res.status, 201);
    assert.equal(res.body.year, 2026);
    assert.equal(res.body.month, 8);
  });

  it('rejects a non-admin caller with 403', async () => {
    const res = await request(nonAdminApp).post('/api/journal-entries/close-period').send({ year: 2026, month: 8 });
    assert.equal(res.status, 403);
  });

  it('rejects an out-of-range month with 400', async () => {
    const res = await request(app).post('/api/journal-entries/close-period').send({ year: 2026, month: 15 });
    assert.equal(res.status, 400);
  });

  it('rejects a missing year with 400', async () => {
    const res = await request(app).post('/api/journal-entries/close-period').send({ month: 8 });
    assert.equal(res.status, 400);
  });

  it('rejects a non-integer month with 400', async () => {
    const res = await request(app).post('/api/journal-entries/close-period').send({ year: 2026, month: '8; DROP' });
    assert.equal(res.status, 400);
  });
});

describe('DELETE /api/journal-entries/close-period/:year/:month', () => {
  it('reopens the period for an admin caller', async () => {
    await request(app).post('/api/journal-entries/close-period').send({ year: 2026, month: 9 });
    const res = await request(app).delete('/api/journal-entries/close-period/2026/9');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  it('rejects a non-admin caller with 403', async () => {
    await request(app).post('/api/journal-entries/close-period').send({ year: 2026, month: 9 });
    const res = await request(nonAdminApp).delete('/api/journal-entries/close-period/2026/9');
    assert.equal(res.status, 403);
  });
});

describe('GET /api/journal-entries', () => {
  it('filters by accountId, status, and date range', async () => {
    await JournalEntry.create({
      date: new Date('2026-01-05'), source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 10, amountUSD: 10 },
        { accountId: 'coa_3000', credit: 10, amountUSD: 10 },
      ],
    });
    await JournalEntry.create({
      date: new Date('2026-02-05'), source: 'manual',
      lines: [
        { accountId: 'coa_4000', debit: 20, amountUSD: 20 },
        { accountId: 'coa_3000', credit: 20, amountUSD: 20 },
      ],
    });

    const byAccount = await request(app).get('/api/journal-entries').query({ accountId: 'coa_4000' });
    assert.equal(byAccount.status, 200);
    assert.equal(byAccount.body.length, 1);
    assert.equal(byAccount.body[0].lines.some((l) => l.accountId === 'coa_4000'), true);

    const byRange = await request(app).get('/api/journal-entries').query({ from: '2026-01-01', to: '2026-01-31' });
    assert.equal(byRange.status, 200);
    assert.equal(byRange.body.length, 1);

    const byStatus = await request(app).get('/api/journal-entries').query({ status: 'posted' });
    assert.equal(byStatus.status, 200);
    assert.equal(byStatus.body.length, 2);
  });

  it('ignores a NoSQL-operator-shaped query parameter instead of applying it as a Mongo operator', async () => {
    // Two entries: one references coa_1000, the other does not. If the raw
    // `{ $ne: 'coa_1000' }` object were applied as a Mongo filter it would
    // exclude the coa_1000 entry, returning only 1 doc. The route must
    // instead ignore the malformed (non-string) param entirely and return
    // both — proving the operator was never applied.
    await JournalEntry.create({
      date: new Date('2026-01-05'), source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 10, amountUSD: 10 },
        { accountId: 'coa_3000', credit: 10, amountUSD: 10 },
      ],
    });
    await JournalEntry.create({
      date: new Date('2026-01-06'), source: 'manual',
      lines: [
        { accountId: 'coa_4000', debit: 20, amountUSD: 20 },
        { accountId: 'coa_3000', credit: 20, amountUSD: 20 },
      ],
    });

    // qs/express parses `accountId[$ne]=coa_1000` into { accountId: { $ne: 'coa_1000' } } —
    // an object, not a string.
    const res = await request(app).get('/api/journal-entries?accountId[%24ne]=coa_1000');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
  });
});
