import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearBoardCollections, seedApiKey } from './setup.js';
import externalRouter from '../../server/routes/external.js';

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

describe('GET /api/v1/ (discovery)', () => {
    it('lists the 6 new board-reporting endpoints', async () => {
        const key = await seedApiKey(['leads']);
        const res = await request(app).get('/api/v1/').set('Authorization', `Bearer ${key}`);

        assert.equal(res.status, 200);
        const joined = res.body.endpoints.join('\n');
        for (const fragment of [
            'pipeline-forecast',
            'financials/summary',
            'cash/summary',
            'cash/mercury-status',
            'GET /api/v1/goals',
            'commissions/summary',
        ]) {
            assert.ok(joined.includes(fragment), `expected discovery list to mention "${fragment}"`);
        }
    });
});
