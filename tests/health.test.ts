// tests/health.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import healthRouter, {
  checkSmtp,
  checkAnthropic,
  checkMongo,
  runChecks,
  getHealthWithCache,
  _resetHealthCache,
} from '../server/routes/health.js';

let mongoServer;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(() => {
  _resetHealthCache();
  delete process.env.ANTHROPIC_API_KEY;
});

describe('checkSmtp', () => {
  it('reports unconfigured when no transporter is available', async () => {
    const result = await checkSmtp(() => null);
    assert.deepEqual(result, { configured: false, healthy: null, latencyMs: 0, tier: 'optional' });
  });

  it('reports healthy when the transporter verifies successfully', async () => {
    const result = await checkSmtp(() => ({ verify: async () => true }));
    assert.equal(result.configured, true);
    assert.equal(result.healthy, true);
  });

  it('reports unhealthy with the error message when verify rejects', async () => {
    const result = await checkSmtp(() => ({ verify: async () => { throw new Error('ECONNREFUSED'); } }));
    assert.equal(result.configured, true);
    assert.equal(result.healthy, false);
    assert.match(result.error, /ECONNREFUSED/);
  });

  it('reports unhealthy if verify hangs past the timeout', async () => {
    const result = await checkSmtp(() => ({ verify: () => new Promise(() => {}) }), 50);
    assert.equal(result.healthy, false);
  });
});

describe('checkAnthropic', () => {
  it('reports unconfigured when ANTHROPIC_API_KEY is not set', () => {
    const result = checkAnthropic();
    assert.deepEqual(result, { configured: false, healthy: null, latencyMs: 0, tier: 'optional' });
  });

  it('reports configured and healthy when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    const result = checkAnthropic();
    assert.equal(result.configured, true);
    assert.equal(result.healthy, true);
  });
});

describe('checkMongo', () => {
  it('reports healthy when connected', () => {
    assert.equal(checkMongo().healthy, true);
  });

  it('reports unhealthy when disconnected', () => {
    const original = mongoose.connection.readyState;
    mongoose.connection.readyState = 0;
    assert.equal(checkMongo().healthy, false);
    mongoose.connection.readyState = original;
  });
});

describe('runChecks', () => {
  it('is ok when mongo is healthy and optional deps are simply unconfigured', async () => {
    const result = await runChecks({ smtpProbe: () => checkSmtp(() => null) });
    assert.equal(result.status, 'ok');
  });

  it('is degraded when a configured optional dependency is unhealthy', async () => {
    const result = await runChecks({
      smtpProbe: () => checkSmtp(() => ({ verify: async () => { throw new Error('down'); } })),
    });
    assert.equal(result.status, 'degraded');
  });

  it('is down when mongo is unhealthy, even if optional deps are fine', async () => {
    const result = await runChecks({
      mongoProbe: () => ({ healthy: false, latencyMs: 0, tier: 'critical' }),
      smtpProbe: () => checkSmtp(() => null),
    });
    assert.equal(result.status, 'down');
  });
});

describe('getHealthWithCache', () => {
  it('caches the result — a second call within the window does not re-invoke the probe', async () => {
    let calls = 0;
    const smtpProbe = () => { calls++; return checkSmtp(() => null); };

    await getHealthWithCache({ smtpProbe });
    await getHealthWithCache({ smtpProbe });

    assert.equal(calls, 1);
  });
});

describe('GET /api/health (route smoke test)', () => {
  it('returns the expected JSON shape end-to-end', async () => {
    const app = express();
    app.use('/api/health', healthRouter);

    const res = await request(app).get('/api/health');

    assert.equal(res.status, 200);
    assert.ok(['ok', 'degraded', 'down'].includes(res.body.status));
    assert.ok(res.body.checks.mongo);
    assert.ok(res.body.checks.smtp);
    assert.ok(res.body.checks.anthropic);
    assert.ok(res.body.timestamp);
  });
});
