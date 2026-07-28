import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections } from './setup.js';
import LedgerAccount from '../../server/models/LedgerAccount.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(clearLedgerCollections);

describe('LedgerAccount', () => {
  it('derives normalBalance = debit for asset and expense accounts', async () => {
    const cash = await LedgerAccount.create({ id: 'la_1', code: '1000', name: 'Cash', type: 'asset' });
    const rent = await LedgerAccount.create({ id: 'la_2', code: '6600', name: 'Rent', type: 'expense' });
    assert.equal(cash.normalBalance, 'debit');
    assert.equal(rent.normalBalance, 'debit');
  });

  it('derives normalBalance = credit for liability, equity and income accounts', async () => {
    const equity = await LedgerAccount.create({ id: 'la_3', code: '3000', name: "Owner's Equity", type: 'equity' });
    const income = await LedgerAccount.create({ id: 'la_4', code: '4000', name: 'Service Income', type: 'income' });
    assert.equal(equity.normalBalance, 'credit');
    assert.equal(income.normalBalance, 'credit');
  });

  it('rejects an unknown account type', async () => {
    await assert.rejects(
      LedgerAccount.create({ id: 'la_5', code: '9999', name: 'Bogus', type: 'bogus' }),
    );
  });

  it('enforces unique code', async () => {
    await LedgerAccount.create({ id: 'la_6', code: '1000', name: 'Cash', type: 'asset' });
    await assert.rejects(
      LedgerAccount.create({ id: 'la_7', code: '1000', name: 'Cash 2', type: 'asset' }),
    );
  });
});
