import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import { postExpense, postConsultantPayment } from '../../server/services/ledgerPostingService.js';
import JournalEntry from '../../server/models/JournalEntry.js';

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
