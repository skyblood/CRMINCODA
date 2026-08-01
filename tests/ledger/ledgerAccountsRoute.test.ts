import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearLedgerCollections } from './setup.js';
import { ensureChartOfAccountsSeeded } from '../../server/seed/chartOfAccounts.js';
import LedgerAccount from '../../server/models/LedgerAccount.js';
import ledgerAccountsRouter from '../../server/routes/ledgerAccounts.js';

const app = express();
app.use(express.json());
app.use('/api/ledger-accounts', ledgerAccountsRouter);

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

// Regression tests for the Task 17 review Fix 2: createCrudRouter's generic
// PUT uses findOneAndUpdate, which does NOT trigger LedgerAccount.js's
// pre('validate') hook (only .save()/.create()/.insertMany() do). Editing an
// account's `type` via the UI therefore used to leave `normalBalance` stale
// at whatever it was before, silently corrupting the sign logic the
// balance-sheet report depends on (account.normalBalance === 'debit').
describe('PUT /api/ledger-accounts/:id (normalBalance re-derivation)', () => {
  it('re-derives normalBalance to "credit" when type changes from expense to income', async () => {
    const account = await LedgerAccount.create({
      id: 'la_test_1', code: '9000', name: 'Test Account', type: 'expense', normalBalance: 'debit',
    });

    const res = await request(app).put(`/api/ledger-accounts/${account.id}`).send({ type: 'income' });
    assert.equal(res.status, 200);
    assert.equal(res.body.type, 'income');
    assert.equal(res.body.normalBalance, 'credit');

    const reloaded = await LedgerAccount.findOne({ id: account.id }).lean();
    assert.equal(reloaded.normalBalance, 'credit');
  });

  it('re-derives normalBalance to "debit" when type changes from income to asset', async () => {
    const account = await LedgerAccount.create({
      id: 'la_test_2', code: '9001', name: 'Test Account 2', type: 'income', normalBalance: 'credit',
    });

    const res = await request(app).put(`/api/ledger-accounts/${account.id}`).send({ type: 'asset' });
    assert.equal(res.status, 200);
    assert.equal(res.body.normalBalance, 'debit');
  });

  it('rejects an update to a bogus type string with 400 and leaves the account unchanged', async () => {
    const account = await LedgerAccount.create({
      id: 'la_test_3', code: '9002', name: 'Test Account 3', type: 'expense', normalBalance: 'debit',
    });

    const res = await request(app).put(`/api/ledger-accounts/${account.id}`).send({ type: 'not_a_real_type' });
    assert.equal(res.status, 400);

    const reloaded = await LedgerAccount.findOne({ id: account.id }).lean();
    assert.equal(reloaded.type, 'expense');
    assert.equal(reloaded.normalBalance, 'debit');
  });

  it('leaves normalBalance untouched when the update does not change type', async () => {
    const account = await LedgerAccount.create({
      id: 'la_test_4', code: '9003', name: 'Test Account 4', type: 'expense', normalBalance: 'debit',
    });

    const res = await request(app).put(`/api/ledger-accounts/${account.id}`).send({ name: 'Renamed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Renamed');
    assert.equal(res.body.normalBalance, 'debit');
  });

  it('returns 404 for an update to a nonexistent account', async () => {
    const res = await request(app).put('/api/ledger-accounts/does_not_exist').send({ type: 'income' });
    assert.equal(res.status, 404);
  });
});
