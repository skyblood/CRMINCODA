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
import LedgerAccount from '../../server/models/LedgerAccount.js';
import LedgerPeriodClose from '../../server/models/LedgerPeriodClose.js';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../server/seed/chartOfAccounts.js';

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

  it('builds Description from counterpartyNickname, not the nonexistent "description" field Mercury never sends', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        // Real Mercury transactions never carry a top-level "description" field
        // (verified against a live API response) — only bankDescription,
        // counterpartyName, and counterpartyNickname. Deliberately omitting
        // "description" here to prove the fix doesn't depend on it.
        { id: 'tx_desc_1', amount: -50, status: 'sent', postedAt: '2026-07-01', counterpartyNickname: 'Andres Incoda', counterpartyName: 'Reinaldo Andrés Jaimes Muñoz', bankDescription: 'Send Money transaction initiated on Mercury' },
      ],
    }));

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    assert.equal(res.body.missing[0].bankRow.Description, 'Andres Incoda');
    const stored = await MercuryTransaction.findOne({ mercuryTransactionId: 'tx_desc_1' }).lean();
    assert.equal(stored?.description, 'Andres Incoda');
  });

  it('falls back to counterpartyName, then bankDescription, when counterpartyNickname is absent', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        { id: 'tx_desc_2', amount: -30, status: 'sent', postedAt: '2026-07-01', counterpartyName: 'Amazon Web Services', bankDescription: 'Some generic bank text' },
        { id: 'tx_desc_3', amount: -5, status: 'sent', postedAt: '2026-07-01', bankDescription: 'Intl. Transaction Fee' },
      ],
    }));

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    const byId = (id: string) => res.body.missing.find((m: any) => m.bankRow.mercuryTransactionId === id);
    assert.equal(byId('tx_desc_2').bankRow.Description, 'Amazon Web Services');
    assert.equal(byId('tx_desc_3').bankRow.Description, 'Intl. Transaction Fee');
  });

  it('renders Date as a plain date (not a raw ISO timestamp) even when falling back to createdAt', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        { id: 'tx_pending', amount: -100, status: 'pending', postedAt: null, createdAt: '2026-07-27T17:49:05.436430Z', counterpartyNickname: 'Vendor' },
      ],
    }));

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    assert.equal(res.body.missing[0].bankRow.Date, '2026-07-27');
  });

  it('combines counterparty and Mercury note as "Counterparty — Note" when both are present', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        { id: 'tx_note_1', amount: -106.34, status: 'sent', postedAt: '2026-08-20', counterpartyNickname: 'Bold Sa*grupo Pa', note: 'Cena cliente Cartagena' },
      ],
    }));

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    assert.equal(res.body.missing[0].bankRow.Description, 'Bold Sa*grupo Pa — Cena cliente Cartagena');
    const stored = await MercuryTransaction.findOne({ mercuryTransactionId: 'tx_note_1' }).lean();
    assert.equal(stored?.note, 'Cena cliente Cartagena');
  });

  it('uses just the note when there is no counterparty name at all', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        { id: 'tx_note_2', amount: -5, status: 'sent', postedAt: '2026-08-20', note: 'Solo la nota' },
      ],
    }));

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    assert.equal(res.body.missing[0].bankRow.Description, 'Solo la nota');
  });

  it('omits the note when Mercury sends null (the common case)', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        { id: 'tx_note_3', amount: -20, status: 'sent', postedAt: '2026-08-20', counterpartyNickname: 'Vendor X', note: null },
      ],
    }));

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    assert.equal(res.body.missing[0].bankRow.Description, 'Vendor X');
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

  // Finding 1: a positive-amount (incoming) Mercury transaction must never be
  // approved as an expense — see server/routes/mercuryReconciliation.js's sign
  // guard right after the 404 check.
  it('rejects approving a positive-amount (incoming) Mercury transaction', async () => {
    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_incoming_1',
      amount: 5000, status: 'sent', postedAt: new Date('2026-07-05'),
      description: 'Client payment', mercuryCategoryName: 'Revenue',
    });

    const res = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_incoming_1' });

    assert.equal(res.status, 400);
    const tx = await Transaction.findOne({ id: 'mercury_tx_incoming_1' }).lean();
    assert.equal(tx, null, 'no Transaction should have been created for an incoming transaction');
  });

  // Finding 2: a still-pending Mercury transaction (postedAt: null) must fall
  // back to Mercury's own createdAt, persisted as mercuryCreatedAt, instead of
  // today's date — otherwise the ledger entry is misdated and the row can
  // never re-match on a later sync.
  it('falls back to mercuryCreatedAt (not today) when postedAt is null', async () => {
    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_pending_1',
      amount: -42, status: 'pending', postedAt: null,
      mercuryCreatedAt: new Date('2026-06-15T00:00:00.000Z'),
      description: 'Pending charge', mercuryCategoryName: 'Bank Fees',
    });

    const res = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_pending_1' });

    assert.equal(res.status, 201);
    const tx = await Transaction.findOne({ id: 'mercury_tx_pending_1' }).lean();
    assert.ok(tx);
    assert.equal(tx?.date, '2026-06-15');
    assert.equal(new Date(tx!.dateObj as unknown as string).toISOString().split('T')[0], '2026-06-15');
  });

  // Finding 3: if ledger posting fails (e.g. a required account is missing),
  // /approve must not silently return 201 — the Transaction is already
  // created and kept (never deleted), but the response must signal failure.
  it('returns 502 when the Transaction is created but ledger posting fails', async () => {
    // Force postExpense() to fail by removing the Cash account it requires.
    await LedgerAccount.deleteOne({ code: '1000' });

    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_fail_1',
      amount: -30, status: 'sent', postedAt: new Date('2026-07-05'),
      description: 'Bad posting', mercuryCategoryName: 'Bank Fees',
    });

    const res = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_fail_1' });

    assert.equal(res.status, 502);
    assert.match(res.body.error, /libro diario/);

    // The Transaction record itself must survive — it's not deleted on a
    // posting failure, only flagged as not-yet-posted.
    const tx = await Transaction.findOne({ id: 'mercury_tx_fail_1' }).lean();
    assert.ok(tx, 'the Transaction must not be deleted after a posting failure');

    const entry = await JournalEntry.findOne({ source: 'expense', sourceId: 'mercury_tx_fail_1' }).lean();
    assert.equal(entry, null);
  });

  // Finding 3: retrying an approval whose posting previously failed must
  // self-heal — not just return a stale 200 alreadyApproved with no
  // JournalEntry ever created.
  it('self-heals on retry after a posting failure: a real JournalEntry gets created', async () => {
    await LedgerAccount.deleteOne({ code: '1000' });

    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_fail_2',
      amount: -15, status: 'sent', postedAt: new Date('2026-07-05'),
      description: 'Bad posting 2', mercuryCategoryName: 'Bank Fees',
    });

    const first = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_fail_2' });
    assert.equal(first.status, 502);

    // Restore the Cash account, then retry the same approval.
    await LedgerAccount.insertMany([DEFAULT_CHART_OF_ACCOUNTS.find(a => a.code === '1000')]);

    const second = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_fail_2' });
    assert.equal(second.status, 200);
    assert.equal(second.body.alreadyApproved, true);

    const entry = await JournalEntry.findOne({ source: 'expense', sourceId: 'mercury_tx_fail_2' }).lean();
    assert.ok(entry, 'expected the retry to self-heal by posting the JournalEntry');

    const tx = await Transaction.findOne({ id: 'mercury_tx_fail_2' }).lean();
    assert.equal(tx?.postingStatus, 'posted');
  });
});

describe('POST /api/mercury-import/unapprove', () => {
  it('rejects a request with no mercuryTransactionId', async () => {
    const res = await request(app).post('/api/mercury-import/unapprove').send({});
    assert.equal(res.status, 400);
  });

  it('returns 404 when the Mercury transaction was never approved (no Transaction exists)', async () => {
    const res = await request(app).post('/api/mercury-import/unapprove').send({ mercuryTransactionId: 'never-approved' });
    assert.equal(res.status, 404);
  });

  it('voids the JournalEntry and deletes the Transaction on a successful undo', async () => {
    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_undo_1',
      amount: -80, status: 'sent', postedAt: new Date('2026-07-05'),
      description: 'Undo me', mercuryCategoryName: 'Bank Fees',
    });
    const approveRes = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_undo_1' });
    assert.equal(approveRes.status, 201);

    const res = await request(app).post('/api/mercury-import/unapprove').send({ mercuryTransactionId: 'tx_undo_1' });
    assert.equal(res.status, 200);

    const tx = await Transaction.findOne({ id: 'mercury_tx_undo_1' }).lean();
    assert.equal(tx, null, 'the synthetic Transaction should be deleted');

    const entry = await JournalEntry.findOne({ source: 'expense', sourceId: 'mercury_tx_undo_1' }).lean();
    assert.ok(entry, 'the JournalEntry itself must never be hard-deleted');
    assert.equal(entry?.status, 'void');
  });

  it('refuses to undo an approval whose accounting period is already closed', async () => {
    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_undo_closed',
      amount: -50, status: 'sent', postedAt: new Date('2026-06-10'),
      description: 'In a closed period', mercuryCategoryName: 'Bank Fees',
    });
    const approveRes = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_undo_closed' });
    assert.equal(approveRes.status, 201);

    await LedgerPeriodClose.create({ id: 'close_2026_06', year: 2026, month: 6 });

    const res = await request(app).post('/api/mercury-import/unapprove').send({ mercuryTransactionId: 'tx_undo_closed' });
    assert.equal(res.status, 409);

    // Nothing should have been touched.
    const tx = await Transaction.findOne({ id: 'mercury_tx_undo_closed' }).lean();
    assert.ok(tx, 'the Transaction must survive a refused undo');
    const entry = await JournalEntry.findOne({ source: 'expense', sourceId: 'mercury_tx_undo_closed' }).lean();
    assert.equal(entry?.status, 'posted');
  });

  it('lets a freshly re-approved transaction post a brand-new JournalEntry after undo (not a stale "already approved")', async () => {
    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_reapprove_1',
      amount: -25, status: 'sent', postedAt: new Date('2026-07-05'),
      description: 'Approve, undo, approve again', mercuryCategoryName: 'Bank Fees',
    });

    const firstApprove = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_reapprove_1' });
    assert.equal(firstApprove.status, 201);

    await request(app).post('/api/mercury-import/unapprove').send({ mercuryTransactionId: 'tx_reapprove_1' });

    const secondApprove = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_reapprove_1' });
    assert.equal(secondApprove.status, 201, 'a re-approval after undo must post fresh, not be treated as a stale duplicate');
    assert.equal(secondApprove.body.alreadyApproved, undefined);

    const postedEntries = await JournalEntry.countDocuments({ source: 'expense', sourceId: 'mercury_tx_reapprove_1', status: 'posted' });
    assert.equal(postedEntries, 1);
    const voidEntries = await JournalEntry.countDocuments({ source: 'expense', sourceId: 'mercury_tx_reapprove_1', status: 'void' });
    assert.equal(voidEntries, 1);
  });
});
