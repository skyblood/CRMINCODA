import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections } from './setup.js';
import JournalEntry from '../../server/models/JournalEntry.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(clearLedgerCollections);

const line = (accountId: string, opts: Partial<{ debit: number; credit: number; amountUSD: number }>) => ({
  accountId, debit: 0, credit: 0, amountUSD: 0, ...opts,
});

describe('JournalEntry', () => {
  it('accepts a balanced two-line entry', async () => {
    const entry = await JournalEntry.create({
      date: new Date(), source: 'manual', memo: 'test',
      lines: [
        line('coa_6600', { debit: 500, amountUSD: 500 }),
        line('coa_1000', { credit: 500, amountUSD: 500 }),
      ],
    });
    assert.equal(entry.status, 'posted');
  });

  it('rejects an unbalanced entry', async () => {
    await assert.rejects(JournalEntry.create({
      date: new Date(), source: 'manual',
      lines: [
        line('coa_6600', { debit: 500, amountUSD: 500 }),
        line('coa_1000', { credit: 400, amountUSD: 400 }),
      ],
    }));
  });

  it('rejects a line with both debit and credit set', async () => {
    await assert.rejects(JournalEntry.create({
      date: new Date(), source: 'manual',
      lines: [
        line('coa_6600', { debit: 500, credit: 500, amountUSD: 500 }),
        line('coa_1000', { credit: 500, amountUSD: 500 }),
      ],
    }));
  });

  it('rejects a single-line entry', async () => {
    await assert.rejects(JournalEntry.create({
      date: new Date(), source: 'manual',
      lines: [line('coa_6600', { debit: 500, amountUSD: 500 })],
    }));
  });

  it('balances on amountUSD, not native currency amounts', async () => {
    // 2,000,000 COP debit vs 500 USD credit — balances only because
    // amountUSD on both lines is 500.
    const entry = await JournalEntry.create({
      date: new Date(), source: 'manual',
      lines: [
        { accountId: 'coa_6600', debit: 2000000, credit: 0, currency: 'COP', exchangeRateToUSD: 4000, amountUSD: 500 },
        { accountId: 'coa_1000', debit: 0, credit: 500, currency: 'USD', exchangeRateToUSD: 1, amountUSD: 500 },
      ],
    });
    assert.equal(entry.lines.length, 2);
  });
});
