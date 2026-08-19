import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearBoardCollections, seedApiKey } from './setup.js';
import externalRouter from '../../server/routes/external.js';
import LedgerAccount from '../../server/models/LedgerAccount.js';
import JournalEntry from '../../server/models/JournalEntry.js';

function buildApp() {
    const a = express();
    a.use(express.json());
    a.use('/api/v1', externalRouter);
    return a;
}

const app = buildApp();

before(setupTestDB);
after(teardownTestDB);
beforeEach(clearBoardCollections);

describe('GET /api/v1/cash/mercury-status', () => {
    it('returns all-zero counts when no chart of accounts is seeded yet', async () => {
        const key = await seedApiKey(['cash']);
        const res = await request(app).get('/api/v1/cash/mercury-status').set('Authorization', `Bearer ${key}`);
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { reconciledCount: 0, pendingCount: 0, reconciledUSD: 0, pendingUSD: 0 });
    });

    it('counts reconciled vs. pending cash-account journal lines', async () => {
        await LedgerAccount.create({ id: 'cash', code: '1000', name: 'Cash', type: 'asset' });
        await JournalEntry.create([
            {
                date: new Date(), source: 'payment', status: 'posted',
                lines: [
                    { accountId: 'cash', debit: 1000, amountUSD: 1000, reconciled: true },
                    { accountId: 'income-placeholder', credit: 1000, amountUSD: 1000 },
                ],
            },
            {
                date: new Date(), source: 'expense', status: 'posted',
                lines: [
                    { accountId: 'cash', credit: 200, amountUSD: 200, reconciled: false },
                    { accountId: 'expense-placeholder', debit: 200, amountUSD: 200 },
                ],
            },
        ]);

        const key = await seedApiKey(['cash']);
        const res = await request(app).get('/api/v1/cash/mercury-status').set('Authorization', `Bearer ${key}`);

        assert.equal(res.status, 200);
        assert.equal(res.body.reconciledCount, 1);
        assert.equal(res.body.pendingCount, 1);
        assert.equal(res.body.reconciledUSD, 1000);
        assert.equal(res.body.pendingUSD, 200);
    });
});
