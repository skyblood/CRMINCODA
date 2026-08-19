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

describe('POST /api/v1/leads', () => {
    it('rejects a key with leads scope but no leads:write scope', async () => {
        const key = await seedApiKey(['leads']);
        const res = await request(app)
            .post('/api/v1/leads')
            .set('Authorization', `Bearer ${key}`)
            .send({ companyName: 'Acme', contactName: 'Ana' });
        assert.equal(res.status, 403);
    });

    it('ignores mass-assignment of internal/protected fields and does not let the caller pick the id', async () => {
        const key = await seedApiKey(['leads', 'leads:write']);
        const res = await request(app)
            .post('/api/v1/leads')
            .set('Authorization', `Bearer ${key}`)
            .send({
                companyName: 'Acme',
                contactName: 'Ana',
                deleted: true,
                assignedTo: 'attacker',
                aiScore: 999,
                injectedField: 'evil',
                id: 'lead_forced_id',
            });
        assert.equal(res.status, 201);
        assert.equal(res.body.deleted, false);
        assert.equal(res.body.assignedTo, '');
        assert.equal(res.body.aiScore, null);
        assert.equal('injectedField' in res.body, false);
        assert.notEqual(res.body.id, 'lead_forced_id');
        assert.match(res.body.id, /^lead_/);
    });

    it('rejects an invalid stage', async () => {
        const key = await seedApiKey(['leads', 'leads:write']);
        const res = await request(app)
            .post('/api/v1/leads')
            .set('Authorization', `Bearer ${key}`)
            .send({ companyName: 'Acme', contactName: 'Ana', stage: 'not-a-real-stage' });
        assert.equal(res.status, 400);
    });

    it('rejects a negative value', async () => {
        const key = await seedApiKey(['leads', 'leads:write']);
        const res = await request(app)
            .post('/api/v1/leads')
            .set('Authorization', `Bearer ${key}`)
            .send({ companyName: 'Acme', contactName: 'Ana', value: -50 });
        assert.equal(res.status, 400);
    });

    it('creates a lead with a fully valid body', async () => {
        const key = await seedApiKey(['leads', 'leads:write']);
        const res = await request(app)
            .post('/api/v1/leads')
            .set('Authorization', `Bearer ${key}`)
            .send({
                companyName: 'Acme',
                contactName: 'Ana',
                value: 1000,
                stage: 'qualification',
                email: 'ana@acme.com',
            });
        assert.equal(res.status, 201);
        assert.equal(res.body.companyName, 'Acme');
        assert.equal(res.body.contactName, 'Ana');
        assert.equal(res.body.value, 1000);
        assert.equal(res.body.stage, 'qualification');
        assert.equal(res.body.email, 'ana@acme.com');
    });
});
