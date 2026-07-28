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
});
