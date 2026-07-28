// tests/ledger/journalEntriesRoute.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import journalEntriesRouter from '../../server/routes/journalEntries.js';
import JournalEntry from '../../server/models/JournalEntry.js';

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { user: { role: 'admin' } }; next(); }); // stub session
app.use('/api/journal-entries', journalEntriesRouter);

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
});
