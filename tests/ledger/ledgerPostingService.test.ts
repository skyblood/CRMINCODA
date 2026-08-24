import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import { postExpense, postConsultantPayment, postPaymentReceived, postCommissionPaid } from '../../server/services/ledgerPostingService.js';
import JournalEntry from '../../server/models/JournalEntry.js';
import User from '../../server/models/User.js';
import Notification from '../../server/models/Notification.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(async () => { await clearLedgerCollections(); await seedChartOfAccounts(); });

describe('postExpense', () => {
  it('posts Debit Software / Credit Cash for a software expense', async () => {
    const entry = await postExpense({
      id: 'tx_1', title: 'AWS Hosting', amount: 500, amountUSD: 500, currency: 'USD',
      exchangeRateToUSD: 1, category: 'software', date: '2026-07-01',
    });
    assert.ok(entry);
    const software = entry.lines.find(l => l.accountId === 'coa_6300');
    const cash = entry.lines.find(l => l.accountId === 'coa_1000');
    assert.equal(software.debit, 500);
    assert.equal(cash.credit, 500);
  });

  it('uses taxCategory over category when both are present', async () => {
    const entry = await postExpense({
      id: 'tx_2', title: 'Office chair', amount: 200, amountUSD: 200, currency: 'USD',
      exchangeRateToUSD: 1, category: 'other', taxCategory: 'Rent', date: '2026-07-01',
    });
    const rent = entry.lines.find(l => l.accountId === 'coa_6600');
    assert.equal(rent.debit, 200);
  });

  it('converts multi-currency amounts using the amountUSD already on the transaction', async () => {
    const entry = await postExpense({
      id: 'tx_3', title: 'Bogota rent', amount: 2000000, amountUSD: 500, currency: 'COP',
      exchangeRateToUSD: 4000, category: 'office', date: '2026-07-01',
    });
    const office = entry.lines.find(l => l.accountId === 'coa_6200');
    assert.equal(office.debit, 2000000);
    assert.equal(office.amountUSD, 500);
  });

  it('is idempotent — posting the same transaction id twice returns null the second time', async () => {
    const tx = { id: 'tx_4', title: 'AWS', amount: 100, amountUSD: 100, currency: 'USD', exchangeRateToUSD: 1, category: 'software', date: '2026-07-01' };
    const first = await postExpense(tx);
    const second = await postExpense(tx);
    assert.ok(first);
    assert.equal(second, null);
    const count = await JournalEntry.countDocuments({ source: 'expense', sourceId: 'tx_4' });
    assert.equal(count, 1);
  });

  // Regression test for the Task 17 review Fix 6: two seeded accounts share
  // taxCategory: 'Office Expense' (6200 Office Expense, 6300 Software) —
  // Schedule C has no dedicated "software" line, so both legitimately map
  // to the official Office Expense line for tax-filing purposes. Without a
  // deterministic tiebreak, `LedgerAccount.findOne({ taxCategory })` could
  // resolve to either account depending on MongoDB's unspecified default
  // ordering. findExpenseAccount now sorts by code, always preferring 6200.
  it('deterministically resolves taxCategory "Office Expense" to account 6200, not 6300, across repeated calls', async () => {
    for (let i = 0; i < 5; i++) {
      const entry = await postExpense({
        id: `tx_office_${i}`, title: 'Office supplies', amount: 10, amountUSD: 10, currency: 'USD',
        exchangeRateToUSD: 1, category: 'other', taxCategory: 'Office Expense', date: '2026-07-01',
      });
      const officeLine = entry.lines.find(l => l.accountId === 'coa_6200');
      const softwareLine = entry.lines.find(l => l.accountId === 'coa_6300');
      assert.ok(officeLine, `expected the expense to post to coa_6200 on iteration ${i}`);
      assert.equal(softwareLine, undefined);
    }
  });

  it('throws when the chart of accounts has no matching account (caller must catch this)', async () => {
    await clearLedgerCollections(); // no chart of accounts seeded
    await assert.rejects(postExpense({
      id: 'tx_5', title: 'AWS', amount: 100, amountUSD: 100, currency: 'USD',
      exchangeRateToUSD: 1, category: 'software', date: '2026-07-01',
    }));
  });
});

describe('postConsultantPayment', () => {
  it('posts Debit Contract Labor / Credit Cash with entityId = consultantId', async () => {
    const entry = await postConsultantPayment({
      id: 'tx_10', title: 'Bob payout', amount: 3500, amountUSD: 3500, currency: 'USD',
      exchangeRateToUSD: 1, category: 'consultant_payment', consultantId: 'user-bob', date: '2026-07-01',
    });
    const laborLine = entry.lines.find(l => l.accountId === 'coa_6100');
    assert.equal(laborLine.debit, 3500);
    assert.equal(laborLine.entityId, 'user-bob');
  });
});

describe('postPaymentReceived', () => {
  it('posts Debit Cash / Credit Service Income', async () => {
    const entry = await postPaymentReceived({
      _id: { toString: () => 'pay_1' },
      clientId: 'ACME Corp', clientName: 'ACME Corp',
      paymentDate: new Date('2026-07-01'), amount: 10000, currency: 'USD',
      amountUSD: 10000, exchangeRateToUSD: 1,
    });
    const cash = entry.lines.find(l => l.accountId === 'coa_1000');
    const income = entry.lines.find(l => l.accountId === 'coa_4000');
    assert.equal(cash.debit, 10000);
    assert.equal(income.credit, 10000);
    assert.equal(income.entityId, 'ACME Corp');
  });

  it('is idempotent per payment id', async () => {
    const payment = { _id: { toString: () => 'pay_2' }, clientId: 'X', clientName: 'X', paymentDate: new Date(), amount: 1, currency: 'USD', amountUSD: 1, exchangeRateToUSD: 1 };
    const first = await postPaymentReceived(payment);
    const second = await postPaymentReceived(payment);
    assert.ok(first);
    assert.equal(second, null);
  });
});

describe('postCommissionPaid', () => {
  it('posts Debit Contract Labor / Credit Cash for the paid amount', async () => {
    const entry = await postCommissionPaid({
      _id: { toString: () => 'comm_1' },
      projectName: 'IMPL: ACME', paidAmountUSD: 1110, amountUSD: 1110,
    });
    const labor = entry.lines.find(l => l.accountId === 'coa_6100');
    const cash = entry.lines.find(l => l.accountId === 'coa_1000');
    assert.equal(labor.debit, 1110);
    assert.equal(cash.credit, 1110);
  });
});

describe('postConsultantPayment — backup withholding warning', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Notification.deleteMany({});
  });

  it('notifies admins when the paid consultant has no TIN on file', async () => {
    await User.create({ id: 'admin-1', name: 'Admin One', email: 'admin@incoda.com', role: 'admin', permissions: { admin: true } });
    await User.create({ id: 'user-bob', name: 'Bob Consultant', email: 'bob@example.com', role: 'consultant' });

    await postConsultantPayment({
      id: 'tx_20', title: 'Bob payout', amount: 1000, amountUSD: 1000, currency: 'USD',
      exchangeRateToUSD: 1, category: 'consultant_payment', consultantId: 'user-bob', date: '2026-07-01',
    });

    const warning = await Notification.findOne({ type: 'backup_withholding_risk', userId: 'admin-1' });
    assert.ok(warning, 'expected the admin to be notified about the missing W-9');
    assert.equal(warning.severity, 'critical');
  });

  it('does not notify when the consultant already has a TIN on file', async () => {
    await User.create({ id: 'admin-1', name: 'Admin One', email: 'admin@incoda.com', role: 'admin', permissions: { admin: true } });
    await User.create({
      id: 'user-alice', name: 'Alice Consultant', email: 'alice@example.com', role: 'consultant',
      taxInfo: { tinEncrypted: 'already-set', tinLast4: '1234', tinType: 'SSN' },
    });

    await postConsultantPayment({
      id: 'tx_21', title: 'Alice payout', amount: 1000, amountUSD: 1000, currency: 'USD',
      exchangeRateToUSD: 1, category: 'consultant_payment', consultantId: 'user-alice', date: '2026-07-01',
    });

    const warning = await Notification.findOne({ type: 'backup_withholding_risk', userId: 'admin-1' });
    assert.equal(warning, null);
  });

  it('still posts the payment even when the tax-info lookup throws', async () => {
    await User.create({ id: 'admin-1', name: 'Admin One', email: 'admin@incoda.com', role: 'admin', permissions: { admin: true } });
    await User.create({ id: 'user-carl', name: 'Carl Consultant', email: 'carl@example.com', role: 'consultant' });

    mock.method(User, 'findOne', () => { throw new Error('DB blip'); });
    try {
      const entry = await postConsultantPayment({
        id: 'tx_22', title: 'Carl payout', amount: 1000, amountUSD: 1000, currency: 'USD',
        exchangeRateToUSD: 1, category: 'consultant_payment', consultantId: 'user-carl', date: '2026-07-01',
      });
      assert.ok(entry, 'payment should still post despite the lookup failure');
      const laborLine = entry.lines.find(l => l.debit === 1000);
      assert.ok(laborLine, 'expected the Contract Labor debit line to be created');
    } finally {
      mock.restoreAll();
    }
  });
});
