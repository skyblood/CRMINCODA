// tests/ledger/mercuryReconciliation.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import mercuryReconciliationRouter from '../../server/routes/mercuryReconciliation.js';
import JournalEntry from '../../server/models/JournalEntry.js';

const app = express();
app.use(express.json());
app.use('/api/mercury-import', mercuryReconciliationRouter);

before(setupTestDB);
after(teardownTestDB);
beforeEach(async () => { await clearLedgerCollections(); await seedChartOfAccounts(); });

describe('POST /api/mercury-import', () => {
  it('classifies a bank row that matches an existing Cash line as matched', async () => {
    await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 500, amountUSD: 500 },
            { accountId: 'coa_1000', credit: 500, amountUSD: 500 },
        ],
    });
    const csv = 'Date,Description,Amount\n2026-07-01,AWS Hosting,-500.00\n';
    const res = await request(app).post('/api/mercury-import').send({ csv });
    assert.equal(res.status, 200);
    assert.equal(res.body.matched.length, 1);
    assert.equal(res.body.unmatched.length, 0);
    assert.equal(res.body.missing.length, 0);
  });

  it('classifies a bank row with no corresponding ledger line as missing', async () => {
    const csv = 'Date,Description,Amount\n2026-07-01,Unrecorded Fee,-25.00\n';
    const res = await request(app).post('/api/mercury-import').send({ csv });
    assert.equal(res.body.missing.length, 1);
  });

  it('classifies a Cash-account ledger line with no matching bank row as unmatched', async () => {
    await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 500, amountUSD: 500 },
            { accountId: 'coa_1000', credit: 500, amountUSD: 500 },
        ],
    });
    const csv = 'Date,Description,Amount\n'; // empty bank statement
    const res = await request(app).post('/api/mercury-import').send({ csv });
    assert.equal(res.body.unmatched.length, 1);
  });

  it('does not re-offer an already-reconciled line as unmatched', async () => {
    const entry = await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 500, amountUSD: 500 },
            { accountId: 'coa_1000', credit: 500, amountUSD: 500, reconciled: true },
        ],
    });
    const csv = 'Date,Description,Amount\n';
    const res = await request(app).post('/api/mercury-import').send({ csv });
    assert.equal(res.body.unmatched.length, 0);
  });
});

describe('POST /api/mercury-import/confirm-match', () => {
  it('confirms a match and sets reconciled: true on the correct line', async () => {
    const entry = await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 500, amountUSD: 500 },
            { accountId: 'coa_1000', credit: 500, amountUSD: 500 },
        ],
    });
    const res = await request(app).post('/api/mercury-import/confirm-match')
        .send({ journalEntryId: entry._id.toString(), lineIndex: 1 });
    assert.equal(res.status, 200);
    assert.equal(res.body.lines[1].reconciled, true);

    const reloaded = await JournalEntry.findById(entry._id);
    assert.equal(reloaded.lines[1].reconciled, true);
    assert.equal(reloaded.lines[0].reconciled, false);
  });

  it('rejects a NoSQL-operator-injection journalEntryId ($ne) without matching any document', async () => {
    const entry = await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 500, amountUSD: 500 },
            { accountId: 'coa_1000', credit: 500, amountUSD: 500 },
        ],
    });
    const res = await request(app).post('/api/mercury-import/confirm-match')
        .send({ journalEntryId: { $ne: null }, lineIndex: 1 });
    assert.equal(res.status, 400);

    const reloaded = await JournalEntry.findById(entry._id);
    assert.equal(reloaded.lines[1].reconciled, false);
  });

  it('rejects a non-ObjectId journalEntryId string', async () => {
    const res = await request(app).post('/api/mercury-import/confirm-match')
        .send({ journalEntryId: 'not-a-valid-object-id', lineIndex: 0 });
    assert.equal(res.status, 400);
  });

  it('rejects an out-of-range or non-numeric lineIndex without polluting Object.prototype', async () => {
    const entry = await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 500, amountUSD: 500 },
            { accountId: 'coa_1000', credit: 500, amountUSD: 500 },
        ],
    });
    const id = entry._id.toString();

    for (const lineIndex of [999, -1, '__proto__']) {
        const res = await request(app).post('/api/mercury-import/confirm-match').send({ journalEntryId: id, lineIndex });
        assert.equal(res.status, 404, `expected 404 for lineIndex=${JSON.stringify(lineIndex)}`);
    }

    assert.equal(({}).reconciled, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'reconciled'), false);
  });
});
