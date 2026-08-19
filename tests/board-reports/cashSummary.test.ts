import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearBoardCollections, seedApiKey } from './setup.js';
import externalRouter from '../../server/routes/external.js';
import Payment from '../../server/models/Payment.js';
import Invoice from '../../server/models/Invoice.js';

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

describe('GET /api/v1/cash/summary', () => {
    it('rejects a key without the cash scope', async () => {
        const key = await seedApiKey(['leads']);
        const res = await request(app).get('/api/v1/cash/summary').set('Authorization', `Bearer ${key}`);
        assert.equal(res.status, 403);
    });

    it('aggregates cash-in, AR aging, DSO, and top debtors', async () => {
        const now = new Date();
        await Payment.create({ clientId: 'c1', clientName: 'Acme', paymentDate: now, amount: 5000, amountUSD: 5000 });

        const overdueDue = new Date(now.getTime() - 45 * 86400000); // 45 days overdue -> 31-60 bucket
        await Invoice.create([
            {
                invoiceNumber: 'INV-1', clientId: 'c1', clientName: 'Acme',
                status: 'overdue', deleted: false, balanceUSD: 3000, totalUSD: 3000,
                subtotal: 3000, total: 3000,
                dueDate: overdueDue, issueDate: now,
            },
        ]);

        const key = await seedApiKey(['cash']);
        const res = await request(app).get('/api/v1/cash/summary').set('Authorization', `Bearer ${key}`);

        assert.equal(res.status, 200);
        assert.equal(res.body.cashInLast12m, 5000);
        assert.equal(res.body.paymentsCountLast12m, 1);
        assert.equal(res.body.totalAR, 3000);
        assert.equal(res.body.arAgingBuckets['31-60'], 3000);
        assert.equal(res.body.globalDSO, 365);
        assert.equal(res.body.topDebtors.length, 1);
        assert.equal(res.body.topDebtors[0].clientName, 'Acme');
    });
});
