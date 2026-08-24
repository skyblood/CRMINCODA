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
  redactForPublic,
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

describe('redactForPublic', () => {
  it('strips the error field from an unhealthy check', () => {
    const result = { status: 'degraded', timestamp: 'x', checks: {
      mongo: { healthy: true, latencyMs: 0, tier: 'critical' },
      smtp: { configured: true, healthy: false, latencyMs: 1, tier: 'optional', error: 'Invalid login: secret internal detail' },
      anthropic: { configured: false, healthy: null, latencyMs: 0, tier: 'optional' },
    } };

    const redacted = redactForPublic(result);

    assert.equal(redacted.status, 'degraded');
    assert.equal(redacted.checks.smtp.healthy, false);
    assert.equal(redacted.checks.smtp.configured, true);
    assert.equal(redacted.checks.smtp.error, undefined);
  });
});

describe('GET /api/health (route smoke test)', () => {
  function buildApp(sessionUser) {
    const app = express();
    app.use((req, _res, next) => { req.session = sessionUser ? { user: sessionUser } : undefined; next(); });
    app.use('/api/health', healthRouter);
    return app;
  }

  it('returns the expected JSON shape end-to-end', async () => {
    const res = await request(buildApp(null)).get('/api/health');

    assert.equal(res.status, 200);
    assert.ok(['ok', 'degraded', 'down'].includes(res.body.status));
    assert.ok(res.body.checks.mongo);
    assert.ok(res.body.checks.smtp);
    assert.ok(res.body.checks.anthropic);
    assert.ok(res.body.timestamp);
  });

  it('does not leak an internal error message to an unauthenticated caller', async () => {
    const res = await request(buildApp(null)).get('/api/health');

    assert.equal(res.body.checks.smtp.error, undefined);
    assert.equal(res.body.checks.mongo.error, undefined);
    assert.equal(res.body.checks.anthropic.error, undefined);
  });

  it('hides a real check error from a non-admin caller but shows it to an admin', async () => {
    // Pre-warm the module-level cache with a result that actually carries an
    // error, via the same getHealthWithCache() the route itself calls — this
    // is the only way to get a real error into the route's response, since
    // the route always calls getHealthWithCache() with no overrides.
    await getHealthWithCache({
      smtpProbe: () => checkSmtp(() => ({ verify: async () => { throw new Error('super secret smtp detail'); } })),
    });

    const nonAdminRes = await request(buildApp({ permissions: { admin: false } })).get('/api/health');
    const adminRes = await request(buildApp({ permissions: { admin: true } })).get('/api/health');

    assert.equal(nonAdminRes.body.checks.smtp.error, undefined);
    assert.match(adminRes.body.checks.smtp.error, /super secret smtp detail/);
  });
});
