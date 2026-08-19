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

describe('GET /api/v1/pipeline-forecast', () => {
    it('rejects requests with no API key', async () => {
        const res = await request(app).get('/api/v1/pipeline-forecast');
        assert.equal(res.status, 401);
    });

    it('rejects a key without the pipeline scope', async () => {
        const key = await seedApiKey(['leads']);
        const res = await request(app).get('/api/v1/pipeline-forecast').set('Authorization', `Bearer ${key}`);
        assert.equal(res.status, 403);
    });

    it('returns 503 when ANTHROPIC_API_KEY is not configured (the default in tests)', async () => {
        const key = await seedApiKey(['pipeline']);
        const res = await request(app).get('/api/v1/pipeline-forecast').set('Authorization', `Bearer ${key}`);
        assert.equal(res.status, 503);
        assert.match(res.body.error, /AI not configured/);
    });
});
