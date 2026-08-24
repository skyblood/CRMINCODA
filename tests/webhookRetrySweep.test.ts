import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Webhook from '../server/models/Webhook.js';
import WebhookLog from '../server/models/WebhookLog.js';
import { runWebhookRetrySweep } from '../server/webhookService.js';

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
  await Webhook.deleteMany({});
  await WebhookLog.deleteMany({});
});

describe('runWebhookRetrySweep', () => {
  it('resumes a retry whose nextRetryAt has already passed', async () => {
    mock.method(globalThis, 'fetch', async () => new Response('ok', { status: 200 }));

    const webhook = await Webhook.create({
      name: 'Test hook',
      url: 'https://example.com/hook',
      events: ['lead.won'],
      isActive: true,
    });
    await WebhookLog.create({
      webhookId: webhook._id,
      webhookName: webhook.name,
      event: 'lead.won',
      url: webhook.url,
      requestBody: '{}',
      status: 'retrying',
      attempt: 1,
      nextRetryAt: new Date(Date.now() - 1000),
      retryPayload: { eventType: 'lead.won', data: { id: 'lead_1' }, triggeredBy: 'system', attempt: 2 },
    });

    await runWebhookRetrySweep();
    // resumePendingRetries deletes the pending log synchronously, then fires
    // the actual retry attempt asynchronously — give it a tick to land.
    await new Promise((r) => setTimeout(r, 50));

    const stillRetrying = await WebhookLog.find({ status: 'retrying' });
    assert.equal(stillRetrying.length, 0);
    const succeeded = await WebhookLog.findOne({ status: 'success' });
    assert.ok(succeeded, 'expected a success log after the resumed retry completed');

    mock.restoreAll();
  });

  it('does nothing when there are no due retries', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch should not be called when nothing is due');
    });

    await runWebhookRetrySweep();

    mock.restoreAll();
  });
});
