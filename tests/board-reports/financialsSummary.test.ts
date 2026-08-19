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

describe('GET /api/v1/financials/summary', () => {
    it('returns 401 without an API key', async () => {
        const res = await request(app).get('/api/v1/financials/summary');
        assert.equal(res.status, 401);
    });

    it('returns 403 without the financials scope', async () => {
        const key = await seedApiKey(['leads']);
        const res = await request(app).get('/api/v1/financials/summary').set('Authorization', `Bearer ${key}`);
        assert.equal(res.status, 403);
    });

    it('computes income, expense, and balance-sheet totals from posted journal entries', async () => {
        const key = await seedApiKey(['financials']);
        await LedgerAccount.create([
            { id: 'cash', code: '1000', name: 'Cash', type: 'asset' },
            { id: 'income', code: '4000', name: 'Service Income', type: 'income' },
            { id: 'expense', code: '6000', name: 'Software', type: 'expense' },
        ]);
        await JournalEntry.create([
            {
                date: new Date(), source: 'payment', status: 'posted',
                lines: [
                    { accountId: 'cash', debit: 1000, amountUSD: 1000 },
                    { accountId: 'income', credit: 1000, amountUSD: 1000 },
                ],
            },
            {
                date: new Date(), source: 'payment', status: 'posted',
                lines: [
                    { accountId: 'cash', credit: 200, amountUSD: 200 },
                    { accountId: 'expense', debit: 200, amountUSD: 200 },
                ],
            },
        ]);
        const res = await request(app).get('/api/v1/financials/summary').set('Authorization', `Bearer ${key}`);
        assert.equal(res.status, 200);
        assert.equal(res.body.totalIncome, 1000);
        assert.equal(res.body.totalExpense, 200);
        assert.equal(res.body.netIncome, 800);
        assert.equal(res.body.totalAssets, 800); // cash: +1000 debit, -200 credit
        assert.equal(res.body.balanced, true);
    });
});
