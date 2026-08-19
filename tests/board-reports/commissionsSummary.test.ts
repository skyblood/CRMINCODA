import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearBoardCollections, seedApiKey } from './setup.js';
import externalRouter from '../../server/routes/external.js';
import Commission from '../../server/models/Commission.js';

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

describe('GET /api/v1/commissions/summary', () => {
    it('rejects a key without the commissions scope', async () => {
        const key = await seedApiKey(['leads']);
        const res = await request(app).get('/api/v1/commissions/summary').set('Authorization', `Bearer ${key}`);
        assert.equal(res.status, 403);
    });

    it('aggregates totals, per-person split, and status breakdown', async () => {
        await Commission.create([
            {
                id: 'c1', projectId: 'p1', projectName: 'Proj A', clientId: 'cl1', clientName: 'Acme',
                rate: 10, revenueUSD: 100000, costUSD: 40000, netUtilityUSD: 60000, amountUSD: 6000,
                split: { bmRetainedUSD: 2400, fabianShareUSD: 1800, spencerShareUSD: 1800 },
                status: 'paid',
            },
            {
                id: 'c2', projectId: 'p2', projectName: 'Proj B', clientId: 'cl2', clientName: 'Beta',
                rate: 10, revenueUSD: 50000, costUSD: 20000, netUtilityUSD: 30000, amountUSD: 3000,
                split: { bmRetainedUSD: 1200, fabianShareUSD: 900, spencerShareUSD: 900 },
                status: 'pending',
            },
        ]);

        const key = await seedApiKey(['commissions']);
        const res = await request(app).get('/api/v1/commissions/summary').set('Authorization', `Bearer ${key}`);

        assert.equal(res.status, 200);
        assert.equal(res.body.count, 2);
        assert.equal(res.body.totalAmountUSD, 9000);
        assert.equal(res.body.byPerson.bmRetainedUSD, 3600);
        assert.equal(res.body.byPerson.fabianShareUSD, 2700);
        assert.equal(res.body.byStatus.paid, 6000);
        assert.equal(res.body.byStatus.pending, 3000);
    });
});
