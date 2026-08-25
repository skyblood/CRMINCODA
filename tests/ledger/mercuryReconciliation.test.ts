// tests/ledger/mercuryReconciliation.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import mercuryReconciliationRouter, { createMercuryReconciliationRouter } from '../../server/routes/mercuryReconciliation.js';
import JournalEntry from '../../server/models/JournalEntry.js';
import MercuryTransaction from '../../server/models/MercuryTransaction.js';
import Transaction from '../../server/models/Transaction.js';

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

  it('offers a close-but-not-exact bank row / ledger line pair as a suggestion instead of missing/unmatched', async () => {
    await JournalEntry.create({
        date: new Date('2026-07-01'), memo: 'AWS Hosting', source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 500, amountUSD: 500 },
            { accountId: 'coa_1000', credit: 500, amountUSD: 500 },
        ],
    });
    // Same day, amount off by $1 (0.2% — within the 1% tight band) and shares the "AWS Hosting" memo tokens.
    const csv = 'Date,Description,Amount\n2026-07-01,AWS Hosting Invoice,-501.00\n';
    const res = await request(app).post('/api/mercury-import').send({ csv });

    assert.equal(res.body.matched.length, 0);
    assert.equal(res.body.missing.length, 0);
    assert.equal(res.body.unmatched.length, 0);
    assert.equal(res.body.suggested.length, 1);
    assert.ok(res.body.suggested[0].confidence >= 0.8);
    assert.ok(res.body.suggested[0].journalEntryId);
    assert.equal(res.body.suggested[0].lineIndex, 1);
  });

  it('leaves a genuinely unrelated bank row / ledger line pair in missing and unmatched, not suggested', async () => {
    await JournalEntry.create({
        date: new Date('2026-01-01'), memo: 'Office rent', source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 200, amountUSD: 200 },
            { accountId: 'coa_1000', credit: 200, amountUSD: 200 },
        ],
    });
    const csv = 'Date,Description,Amount\n2026-07-01,Totally unrelated fee,-9999.00\n';
    const res = await request(app).post('/api/mercury-import').send({ csv });

    assert.equal(res.body.suggested.length, 0);
    assert.equal(res.body.missing.length, 1);
    assert.equal(res.body.unmatched.length, 1);
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

describe('GET /api/mercury-import/accounts', () => {
  it('returns the accounts the injected Mercury client resolves', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListAccounts: async () => [{ id: 'acc_1', name: 'Checking', type: 'checking' }],
    }));

    const res = await request(testApp).get('/api/mercury-import/accounts');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [{ id: 'acc_1', name: 'Checking', type: 'checking' }]);
  });

  it('returns 502 when the Mercury client throws', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListAccounts: async () => { throw new Error('Mercury API /accounts failed: 401 unauthorized'); },
    }));

    const res = await request(testApp).get('/api/mercury-import/accounts');
    assert.equal(res.status, 502);
    assert.match(res.body.error, /Mercury API/);
  });
});

describe('POST /api/mercury-import/sync', () => {
  function buildApp(mercuryListTransactions: (...args: any[]) => Promise<any[]>) {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({ mercuryListTransactions }));
    return testApp;
  }

  it('rejects a request with no accountId', async () => {
    const testApp = buildApp(async () => []);
    const res = await request(testApp).post('/api/mercury-import/sync').send({});
    assert.equal(res.status, 400);
  });

  it('rejects an accountId containing path-traversal / URL-control characters instead of forwarding it to the Mercury client', async () => {
    let called = false;
    const testApp = buildApp(async () => { called = true; return []; });
    const res = await request(testApp).post('/api/mercury-import/sync')
      .send({ accountId: '../accounts?foo=bar#x' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Invalid accountId');
    assert.equal(called, false, 'the Mercury client must never be called with an unvalidated accountId');
  });

  it('persists fetched transactions into MercuryTransaction and reconciles them like the CSV path', async () => {
    await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 500, amountUSD: 500 },
            { accountId: 'coa_1000', credit: 500, amountUSD: 500 },
        ],
    });
    const testApp = buildApp(async () => [
      { id: 'tx_1', amount: -500, status: 'sent', postedAt: '2026-07-01', description: 'AWS Hosting', counterpartyName: 'AWS' },
    ]);

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1', start: '2026-07-01', end: '2026-07-31' });

    assert.equal(res.status, 200);
    assert.equal(res.body.matched.length, 1);

    const stored = await MercuryTransaction.find({ mercuryAccountId: 'acc_1' }).lean();
    assert.equal(stored.length, 1);
    assert.equal(stored[0].mercuryTransactionId, 'tx_1');
    assert.equal(stored[0].amount, -500);
  });

  it('syncing an overlapping range twice does not duplicate persisted transactions', async () => {
    const fetchTx = [
      { id: 'tx_1', amount: -25, status: 'sent', postedAt: '2026-07-01', description: 'Fee', counterpartyName: 'Bank' },
    ];
    const testApp = buildApp(async () => fetchTx);

    await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });
    await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    const stored = await MercuryTransaction.find({ mercuryAccountId: 'acc_1' }).lean();
    assert.equal(stored.length, 1);
  });

  it('returns 502 when the Mercury client throws', async () => {
    const testApp = buildApp(async () => { throw new Error('Mercury API /account/acc_1/transactions failed: 500'); });
    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });
    assert.equal(res.status, 502);
    assert.match(res.body.error, /Mercury API/);
  });
});

describe('POST /api/mercury-import/sync — category suggestion on missing rows', () => {
  it('attaches mercuryTransactionId and mercurySuggestedTaxCategory to a missing row from a sync', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        { id: 'tx_1', amount: -1000, status: 'sent', postedAt: '2026-07-01', description: 'Payroll run', counterpartyNickname: 'Andres', categoryData: { name: 'Payroll' } },
      ],
    }));

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    assert.equal(res.status, 200);
    assert.equal(res.body.missing.length, 1);
    assert.equal(res.body.missing[0].bankRow.mercuryTransactionId, 'tx_1');
    assert.equal(res.body.missing[0].bankRow.mercurySuggestedTaxCategory, 'Contract Labor');
  });

  it('falls back to Other Expenses when categoryData is absent', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        { id: 'tx_2', amount: -50, status: 'sent', postedAt: '2026-07-01', description: 'Unknown charge' },
      ],
    }));

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    assert.equal(res.body.missing[0].bankRow.mercurySuggestedTaxCategory, 'Other Expenses');
  });

  it('persists mercuryCategoryName, kind, and counterpartyNickname on the stored MercuryTransaction', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        { id: 'tx_3', amount: -20, status: 'sent', postedAt: '2026-07-01', description: 'Fee', kind: 'creditCardTransaction', counterpartyNickname: 'Vendor X', categoryData: { name: 'Bank Fees' } },
      ],
    }));

    await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    const stored = await MercuryTransaction.findOne({ mercuryTransactionId: 'tx_3' }).lean();
    assert.equal(stored?.mercuryCategoryName, 'Bank Fees');
    assert.equal(stored?.kind, 'creditCardTransaction');
    assert.equal(stored?.counterpartyNickname, 'Vendor X');
  });

  it('does not attach mercuryTransactionId to a missing row from the CSV path', async () => {
    const csv = 'Date,Description,Amount\n2026-07-01,Unrecorded Fee,-25.00\n';
    const res = await request(app).post('/api/mercury-import').send({ csv });
    assert.equal(res.body.missing.length, 1);
    assert.equal(res.body.missing[0].bankRow.mercuryTransactionId, undefined);
    assert.equal(res.body.missing[0].bankRow.mercurySuggestedTaxCategory, undefined);
  });
});

describe('POST /api/mercury-import/approve', () => {
  it('rejects a request with no mercuryTransactionId', async () => {
    const res = await request(app).post('/api/mercury-import/approve').send({});
    assert.equal(res.status, 400);
  });

  it('returns 404 for an unknown mercuryTransactionId', async () => {
    const res = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'does-not-exist' });
    assert.equal(res.status, 404);
  });

  it('creates a Transaction and posts a JournalEntry for a valid mercuryTransactionId', async () => {
    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_approve_1',
      amount: -75.5, status: 'sent', postedAt: new Date('2026-07-05'),
      description: 'Zoom subscription', mercuryCategoryName: 'Office Supplies & Equipment',
    });

    const res = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_approve_1' });

    assert.equal(res.status, 201);
    assert.equal(res.body.taxCategory, 'Supplies');

    const tx = await Transaction.findOne({ id: 'mercury_tx_approve_1' }).lean();
    assert.ok(tx);
    assert.equal(tx?.amount, 75.5);
    assert.equal(tx?.taxCategory, 'Supplies');
    assert.equal(tx?.type, 'expense');

    const entry = await JournalEntry.findOne({ source: 'expense', sourceId: 'mercury_tx_approve_1' }).lean();
    assert.ok(entry, 'expected a JournalEntry to have been posted automatically');
  });

  it('approving the same mercuryTransactionId twice is an idempotent no-op, not a duplicate', async () => {
    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_approve_2',
      amount: -10, status: 'sent', postedAt: new Date('2026-07-05'),
      description: 'Coffee', mercuryCategoryName: 'Other',
    });

    const first = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_approve_2' });
    const second = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_approve_2' });

    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.alreadyApproved, true);

    const count = await Transaction.countDocuments({ id: 'mercury_tx_approve_2' });
    assert.equal(count, 1);

    const entryCount = await JournalEntry.countDocuments({ source: 'expense', sourceId: 'mercury_tx_approve_2' });
    assert.equal(entryCount, 1);
  });
});
