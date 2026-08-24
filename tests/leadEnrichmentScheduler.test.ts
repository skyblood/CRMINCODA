// tests/leadEnrichmentScheduler.test.ts
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Lead from '../server/models/Lead.js';
import { runNightlyEnrichmentJob } from '../server/jobs/leadEnrichmentScheduler.js';

let mongoServer;

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

describe('runNightlyEnrichmentJob', () => {
  it('processes a lead with no enrichment attempt yet, and leaves an already-failed lead untouched', async () => {
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

    await Lead.create({ id: 'lead_new', companyName: 'Acme', contactName: 'Jane', email: 'jane@acme.com' });
    await Lead.create({
      id: 'lead_already_failed', companyName: 'DeadCo', contactName: 'Bob', email: 'bob@deadco.com',
      enrichment: { status: 'failed', domain: 'deadco.com', enrichedAt: new Date() },
    });

    await runNightlyEnrichmentJob();

    const fresh = await Lead.findOne({ id: 'lead_new' }).lean();
    const alreadyFailed = await Lead.findOne({ id: 'lead_already_failed' }).lean();

    assert.equal(fresh.enrichment.status, 'enriched');
    assert.equal(fresh.enrichment.domain, 'acme.com');
    assert.equal(alreadyFailed.enrichment.status, 'failed'); // untouched — not retried automatically

    mock.restoreAll();
  });

  it('does nothing when there are no leads to enrich', async () => {
    mock.method(globalThis, 'fetch', async () => { throw new Error('fetch should not be called'); });
    await runNightlyEnrichmentJob(); // should not throw
    mock.restoreAll();
  });
});
