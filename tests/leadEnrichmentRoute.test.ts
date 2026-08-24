// tests/leadEnrichmentRoute.test.ts
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Lead from '../server/models/Lead.js';
import leadEnrichmentRouter from '../server/routes/leadEnrichment.js';

let mongoServer;

// Helper: mock dns.promises.lookup to resolve to a given public IP by
// default, matching how a real domain would resolve in production. This
// mirrors the pattern used in tests/leadEnrichmentService.test.ts and
// tests/leadEnrichmentScheduler.test.ts — enrichLead's SSRF-hardened
// fetchSiteMetadata performs a real DNS lookup before fetching, so it must
// be mocked or the test would hit the real network.
function mockDnsLookup(addresses = [{ address: '93.184.216.34', family: 4 }]) {
  return mock.method(dns.promises, 'lookup', async () => addresses);
}

function buildApp(isAdmin) {
  const a = express();
  a.use((req, _res, next) => { req.session = { user: { permissions: { admin: isAdmin } } }; next(); });
  a.use('/api/leads', leadEnrichmentRouter);
  return a;
}

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Lead.deleteMany({});
});

describe('POST /api/leads/:id/enrich', () => {
  it('re-enriches a single lead for an admin caller', async () => {
    mockDnsLookup();
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      body: { getReader: () => {
        let sent = false;
        return { read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: new TextEncoder().encode('<title>Acme</title>') };
        }, cancel: async () => {} };
      } },
    }));
    await Lead.create({ id: 'lead_1', companyName: 'Acme', contactName: 'Jane', email: 'jane@acme.com' });

    const res = await request(buildApp(true)).post('/api/leads/lead_1/enrich');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'enriched');
    const stored = await Lead.findOne({ id: 'lead_1' }).lean();
    assert.equal(stored.enrichment.status, 'enriched');
    mock.restoreAll();
  });

  it('rejects a non-admin caller with 403', async () => {
    await Lead.create({ id: 'lead_1', companyName: 'Acme', contactName: 'Jane', email: 'jane@acme.com' });
    const res = await request(buildApp(false)).post('/api/leads/lead_1/enrich');
    assert.equal(res.status, 403);
  });

  it('returns 404 for an unknown lead id', async () => {
    const res = await request(buildApp(true)).post('/api/leads/does-not-exist/enrich');
    assert.equal(res.status, 404);
  });

  it('returns 500 (and does not crash the process) when an internal error occurs after the admin check passes', async () => {
    await Lead.create({ id: 'lead_1', companyName: 'Acme', contactName: 'Jane', email: 'jane@acme.com' });

    mock.method(Lead, 'findOne', () => { throw new Error('simulated DB failure'); });
    try {
      const res = await request(buildApp(true)).post('/api/leads/lead_1/enrich');
      assert.equal(res.status, 500);
    } finally {
      mock.restoreAll();
    }
  });
});
