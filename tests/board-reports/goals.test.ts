import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearBoardCollections, seedApiKey } from './setup.js';
import externalRouter from '../../server/routes/external.js';
import Goal from '../../server/models/Goal.js';

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

describe('GET /api/v1/goals', () => {
    it('rejects a key without the goals scope', async () => {
        const key = await seedApiKey(['leads']);
        const res = await request(app).get('/api/v1/goals').set('Authorization', `Bearer ${key}`);
        assert.equal(res.status, 403);
    });

    it('returns goals keyed by year', async () => {
        await Goal.create([{ year: 2026, amount: 500000 }, { year: 2027, amount: 750000 }]);

        const key = await seedApiKey(['goals']);
        const res = await request(app).get('/api/v1/goals').set('Authorization', `Bearer ${key}`);

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { '2026': 500000, '2027': 750000 });
    });
});
