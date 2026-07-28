// tests/ledger/postingHooks.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import Transaction from '../../server/models/Transaction.js';
import Payment from '../../server/models/Payment.js';
import Commission from '../../server/models/Commission.js';
import JournalEntry from '../../server/models/JournalEntry.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(async () => { await clearLedgerCollections(); await seedChartOfAccounts(); });

// Hooks are async and fire-and-forget from Mongoose's perspective; give them
// one microtask tick before asserting.
const tick = () => new Promise(r => setTimeout(r, 50));

describe('Transaction posting hook', () => {
  it('posts a journal entry and marks postingStatus=posted for an expense', async () => {
    const tx = await Transaction.create({ id: 'tx_h1', title: 'AWS', amount: 100, amountUSD: 100, currency: 'USD', exchangeRateToUSD: 1, category: 'software', type: 'expense', date: '2026-07-01' });
    await tick();
    const entry = await JournalEntry.findOne({ source: 'expense', sourceId: 'tx_h1' });
    assert.ok(entry);
    const reloaded = await Transaction.findOne({ id: 'tx_h1' }).lean();
    assert.equal(reloaded.postingStatus, 'posted');
  });

  it('routes consultant_payment category through postConsultantPayment (source=payroll)', async () => {
    await Transaction.create({ id: 'tx_h2', title: 'Bob payout', amount: 500, amountUSD: 500, currency: 'USD', exchangeRateToUSD: 1, category: 'consultant_payment', consultantId: 'user-bob', type: 'expense', date: '2026-07-01' });
    await tick();
    const entry = await JournalEntry.findOne({ source: 'payroll', sourceId: 'tx_h2' });
    assert.ok(entry);
  });

  it('marks postingStatus=failed and does NOT throw when the chart of accounts is empty', async () => {
    await JournalEntry.deleteMany({});
    await (await import('../../server/models/LedgerAccount.js')).default.deleteMany({});
    const tx = await Transaction.create({ id: 'tx_h3', title: 'AWS', amount: 100, amountUSD: 100, currency: 'USD', exchangeRateToUSD: 1, category: 'software', type: 'expense', date: '2026-07-01' });
    await tick();
    const reloaded = await Transaction.findOne({ id: 'tx_h3' }).lean();
    assert.equal(reloaded.postingStatus, 'failed');
  });

  it('never propagates an error out of save()/create() even when the failure-recovery updateOne also fails', async () => {
    // Force poster() to throw (no chart of accounts)...
    await JournalEntry.deleteMany({});
    await (await import('../../server/models/LedgerAccount.js')).default.deleteMany({});

    // ...AND force the hook's own recovery updateOne (the one that tries to
    // record postingStatus='failed') to also reject, simulating a correlated
    // Mongo blip. Per Mongoose's async post-save-hook semantics, an unguarded
    // rejection in this second step would propagate into the original
    // Transaction.create() promise even though the document was already
    // persisted — this is exactly the regression this test guards against.
    const originalUpdateOne = Transaction.updateOne;
    Transaction.updateOne = async () => { throw new Error('simulated Mongo connection blip'); };

    let created;
    try {
      await assert.doesNotReject(async () => {
        created = await Transaction.create({ id: 'tx_h5', title: 'AWS', amount: 100, amountUSD: 100, currency: 'USD', exchangeRateToUSD: 1, category: 'software', type: 'expense', date: '2026-07-01' });
      });
    } finally {
      Transaction.updateOne = originalUpdateOne;
    }

    assert.ok(created);
    await tick();
    // Both the posting attempt and the postingStatus write failed, so the
    // field never got updated off its schema default.
    const reloaded = await Transaction.findOne({ id: 'tx_h5' }).lean();
    assert.equal(reloaded.postingStatus, 'n/a');
  });

  it('does not repost on update', async () => {
    await Transaction.create({ id: 'tx_h4', title: 'AWS', amount: 100, amountUSD: 100, currency: 'USD', exchangeRateToUSD: 1, category: 'software', type: 'expense', date: '2026-07-01' });
    await tick();
    const doc = await Transaction.findOne({ id: 'tx_h4' });
    doc.amount = 200;
    await doc.save();
    await tick();
    const count = await JournalEntry.countDocuments({ source: 'expense', sourceId: 'tx_h4' });
    assert.equal(count, 1);
  });
});

describe('Payment posting hook', () => {
  it('posts a journal entry and marks postingStatus=posted', async () => {
    const payment = await Payment.create({ clientId: 'ACME', clientName: 'ACME', paymentDate: new Date(), amount: 100, currency: 'USD', amountUSD: 100, exchangeRateToUSD: 1, method: 'mercury' });
    await tick();
    const entry = await JournalEntry.findOne({ source: 'payment', sourceId: payment._id.toString() });
    assert.ok(entry);
    const reloaded = await Payment.findById(payment._id).lean();
    assert.equal(reloaded.postingStatus, 'posted');
  });
});

describe('Commission posting hook', () => {
  it('posts a journal entry when status transitions to paid via findOneAndUpdate', async () => {
    const commission = await Commission.create({
      projectId: 'proj-1', projectName: 'IMPL: ACME', clientId: 'ACME', clientName: 'ACME',
      rate: 10, revenueUSD: 20000, costUSD: 8900, netUtilityUSD: 11100, amountUSD: 1110,
      split: { bmRetainedUSD: 400, fabianShareUSD: 355, spencerShareUSD: 355 },
      status: 'approved',
    });
    await Commission.findOneAndUpdate(
      { _id: commission._id },
      { $set: { status: 'paid', paidAmountUSD: 1110 } },
      { new: true },
    );
    await tick();
    const entry = await JournalEntry.findOne({ source: 'commission', sourceId: commission._id.toString() });
    assert.ok(entry);
  });

  it('does not post when the update does not set status to paid', async () => {
    const commission = await Commission.create({
      projectId: 'proj-2', projectName: 'HOURS: Beta', clientId: 'Beta', clientName: 'Beta',
      rate: 15, revenueUSD: 10000, costUSD: 3000, netUtilityUSD: 7000, amountUSD: 1050,
      split: { bmRetainedUSD: 380, fabianShareUSD: 335, spencerShareUSD: 335 },
      status: 'pending',
    });
    await Commission.findOneAndUpdate({ _id: commission._id }, { $set: { notes: 'reviewed' } });
    await tick();
    const entry = await JournalEntry.findOne({ source: 'commission', sourceId: commission._id.toString() });
    assert.equal(entry, null);
  });
});
