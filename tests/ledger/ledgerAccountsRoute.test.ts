import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections } from './setup.js';
import { ensureChartOfAccountsSeeded } from '../../server/seed/chartOfAccounts.js';
import LedgerAccount from '../../server/models/LedgerAccount.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(clearLedgerCollections);

describe('ensureChartOfAccountsSeeded', () => {
  it('inserts the full default chart of accounts into an empty DB', async () => {
    await ensureChartOfAccountsSeeded();
    const count = await LedgerAccount.countDocuments();
    assert.equal(count, 18);
  });

  it('is idempotent — running it twice does not duplicate or error', async () => {
    await ensureChartOfAccountsSeeded();
    await ensureChartOfAccountsSeeded();
    const count = await LedgerAccount.countDocuments();
    assert.equal(count, 18);
  });

  it('does not overwrite a user-edited account name', async () => {
    await ensureChartOfAccountsSeeded();
    await LedgerAccount.updateOne({ code: '6600' }, { $set: { name: 'Office Rent (renamed)' } });
    await ensureChartOfAccountsSeeded();
    const rent = await LedgerAccount.findOne({ code: '6600' }).lean();
    assert.equal(rent.name, 'Office Rent (renamed)');
  });

  // Regression test: ensureChartOfAccountsSeeded() upserts via updateOne(),
  // which does NOT trigger LedgerAccount's pre('validate') hook (only
  // .save()/.create()/.insertMany() do). If normalBalance isn't set
  // explicitly on each DEFAULT_CHART_OF_ACCOUNTS entry, every account
  // seeded through the real startup path ends up with normalBalance
  // unset — silently breaking the balance-sheet sign logic that branches
  // on account.normalBalance === 'debit'.
  it('sets a normalBalance matching each account\'s type when seeded via the real startup path', async () => {
    await ensureChartOfAccountsSeeded();
    const accounts = await LedgerAccount.find({}).lean();
    assert.equal(accounts.length, 18);
    const DEBIT_NORMAL_TYPES = new Set(['asset', 'expense']);
    for (const account of accounts) {
      const expected = DEBIT_NORMAL_TYPES.has(account.type) ? 'debit' : 'credit';
      assert.equal(
        account.normalBalance,
        expected,
        `account ${account.code} (${account.type}) expected normalBalance=${expected}, got ${account.normalBalance}`,
      );
    }
  });
});
