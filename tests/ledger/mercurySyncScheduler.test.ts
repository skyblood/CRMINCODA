// tests/ledger/mercurySyncScheduler.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections } from './setup.js';
import { runNightlyMercurySyncJob } from '../../server/jobs/mercurySyncScheduler.js';
import MercuryTransaction from '../../server/models/MercuryTransaction.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(clearLedgerCollections);

describe('runNightlyMercurySyncJob', () => {
  it('does nothing when MERCURY_API_TOKEN is unset', async () => {
    const original = process.env.MERCURY_API_TOKEN;
    delete process.env.MERCURY_API_TOKEN;
    let called = false;
    try {
      await runNightlyMercurySyncJob({ mercuryListAccounts: async () => { called = true; return []; } });
    } finally {
      if (original !== undefined) process.env.MERCURY_API_TOKEN = original;
    }
    assert.equal(called, false);
  });

  it('upserts transactions for every account when the token is set', async () => {
    process.env.MERCURY_API_TOKEN = 'test-token';
    try {
      await runNightlyMercurySyncJob({
        mercuryListAccounts: async () => [{ id: 'acc_a', name: 'A', type: 'checking' }, { id: 'acc_b', name: 'B', type: 'checking' }],
        mercuryListTransactions: async (accountId: string) => [
          { id: `tx_${accountId}_1`, amount: -5, status: 'sent', postedAt: '2026-07-01', counterpartyNickname: 'Vendor' },
        ],
      });
    } finally {
      delete process.env.MERCURY_API_TOKEN;
    }

    const count = await MercuryTransaction.countDocuments({});
    assert.equal(count, 2);
    assert.ok(await MercuryTransaction.findOne({ mercuryTransactionId: 'tx_acc_a_1' }).lean());
    assert.ok(await MercuryTransaction.findOne({ mercuryTransactionId: 'tx_acc_b_1' }).lean());
  });

  it("one account's failure does not stop the others from syncing", async () => {
    process.env.MERCURY_API_TOKEN = 'test-token';
    try {
      await runNightlyMercurySyncJob({
        mercuryListAccounts: async () => [{ id: 'acc_fail', name: 'Fail', type: 'checking' }, { id: 'acc_ok', name: 'OK', type: 'checking' }],
        mercuryListTransactions: async (accountId: string) => {
          if (accountId === 'acc_fail') throw new Error('Mercury API down');
          return [{ id: 'tx_ok_1', amount: -1, status: 'sent', postedAt: '2026-07-01' }];
        },
      });
    } finally {
      delete process.env.MERCURY_API_TOKEN;
    }

    const count = await MercuryTransaction.countDocuments({});
    assert.equal(count, 1);
    assert.ok(await MercuryTransaction.findOne({ mercuryTransactionId: 'tx_ok_1' }).lean());
  });

  it('passes a bounded {start, end} date window to mercuryListTransactions instead of requesting full lifetime history', async () => {
    process.env.MERCURY_API_TOKEN = 'test-token';
    const capturedWindows: { start?: string; end?: string }[] = [];
    try {
      await runNightlyMercurySyncJob({
        mercuryListAccounts: async () => [{ id: 'acc_a', name: 'A', type: 'checking' }],
        mercuryListTransactions: async (accountId: string, window: { start?: string; end?: string }) => {
          capturedWindows.push(window);
          return [];
        },
      });
    } finally {
      delete process.env.MERCURY_API_TOKEN;
    }

    assert.equal(capturedWindows.length, 1);
    const [window] = capturedWindows;
    assert.ok(window, 'expected mercuryListTransactions to receive a second argument');
    assert.match(window.start ?? '', /^\d{4}-\d{2}-\d{2}$/, `start should look like YYYY-MM-DD, got ${window.start}`);
    assert.match(window.end ?? '', /^\d{4}-\d{2}-\d{2}$/, `end should look like YYYY-MM-DD, got ${window.end}`);
  });
});
