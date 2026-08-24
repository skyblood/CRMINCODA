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

  it('isolates a per-lead failure: one lead throwing on save does not stop later leads in the batch', async () => {
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

    // Fail save() only for the specific lead we designate to blow up, regardless
    // of the order Lead.find() returns documents in.
    const originalSave = Lead.prototype.save;
    mock.method(Lead.prototype, 'save', function (...args) {
      if (this.id === 'lead_will_fail') {
        return Promise.reject(new Error('Simulated save failure'));
      }
      return originalSave.apply(this, args);
    });

    await Lead.create({ id: 'lead_will_fail', companyName: 'Failco', contactName: 'Fay', email: 'fay@failco.com' });
    await Lead.create({ id: 'lead_should_still_process', companyName: 'Okco', contactName: 'Ollie', email: 'ollie@okco.com' });

    await runNightlyEnrichmentJob(); // must not throw / abort despite the mid-batch save failure

    const failed = await Lead.findOne({ id: 'lead_will_fail' }).lean();
    const stillProcessed = await Lead.findOne({ id: 'lead_should_still_process' }).lean();

    // The failing lead's save() rejected, so its enrichment was never persisted.
    assert.ok(!failed.enrichment || !failed.enrichment.status);
    // The other lead in the batch must still have been processed.
    assert.equal(stillProcessed.enrichment.status, 'enriched');
    assert.equal(stillProcessed.enrichment.domain, 'okco.com');

    mock.restoreAll();
  });
});
