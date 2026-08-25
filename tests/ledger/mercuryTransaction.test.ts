// tests/ledger/mercuryTransaction.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections } from './setup.js';
import MercuryTransaction from '../../server/models/MercuryTransaction.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(clearLedgerCollections);

describe('MercuryTransaction', () => {
  it('creates a transaction document with the expected fields', async () => {
    const doc = await MercuryTransaction.create({
      mercuryAccountId: 'acc_1',
      mercuryTransactionId: 'tx_1',
      amount: -42.5,
      status: 'sent',
      postedAt: new Date('2026-07-01'),
      description: 'AWS Hosting',
      counterpartyName: 'Amazon Web Services',
      mercuryCategoryName: 'Office Supplies & Equipment',
      kind: 'outgoingPayment',
      counterpartyNickname: 'AWS',
    });
    assert.equal(doc.mercuryAccountId, 'acc_1');
    assert.equal(doc.amount, -42.5);
    assert.equal(doc.mercuryCategoryName, 'Office Supplies & Equipment');
    assert.equal(doc.kind, 'outgoingPayment');
    assert.equal(doc.counterpartyNickname, 'AWS');
  });

  it('upserting the same account+transaction id twice results in exactly one document, with fields updated', async () => {
    const key = { mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_1' };
    await MercuryTransaction.updateOne(key, { $set: { ...key, amount: -10, status: 'pending', description: 'first' } }, { upsert: true });
    await MercuryTransaction.updateOne(key, { $set: { ...key, amount: -10, status: 'sent', description: 'updated' } }, { upsert: true });

    const docs = await MercuryTransaction.find(key).lean();
    assert.equal(docs.length, 1);
    assert.equal(docs[0].status, 'sent');
    assert.equal(docs[0].description, 'updated');
  });

  it('rejects a duplicate insert of the same account+transaction id via direct .create() (unique index enforced)', async () => {
    const key = { mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_1', amount: -1 };
    await MercuryTransaction.create(key);
    await assert.rejects(() => MercuryTransaction.create(key));
  });
});
