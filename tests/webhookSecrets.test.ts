// tests/webhookSecrets.test.ts
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Webhook from '../server/models/Webhook.js';
import WebhookLog from '../server/models/WebhookLog.js';
import webhooksRouter from '../server/routes/webhooks.js';
import { decrypt, encrypt } from '../server/utils/encryption.js';
import { dispatchWebhooks } from '../server/webhookService.js';
import { ensureWebhookSecretsEncrypted } from '../server/seed/webhookSecrets.js';

let mongoServer;

function buildApp() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { user: { permissions: { admin: true } } }; next(); });
  a.use('/api/webhooks', webhooksRouter);
  return a;
}

before(async () => {
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');
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

describe('POST /api/webhooks', () => {
  it('stores the secret encrypted, not in plaintext', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/webhooks').send({
      name: 'Test hook', url: 'https://example.com/hook', events: ['lead.won'], secret: 'shh-its-a-secret',
    });
    assert.equal(res.status, 201);

    const stored = await Webhook.findById(res.body._id).lean();
    assert.notEqual(stored.secret, 'shh-its-a-secret');
    assert.equal(decrypt(stored.secret), 'shh-its-a-secret');
  });

  it('creates a webhook with no secret without error', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/webhooks').send({
      name: 'No secret hook', url: 'https://example.com/hook', events: ['lead.won'],
    });
    assert.equal(res.status, 201);
  });
});

describe('PUT /api/webhooks/:id', () => {
  it('encrypts a newly-submitted secret', async () => {
    const app = buildApp();
    const webhook = await Webhook.create({ name: 'Hook', url: 'https://example.com/hook', events: ['lead.won'] });

    const res = await request(app).put(`/api/webhooks/${webhook._id}`).send({ secret: 'new-secret-value' });
    assert.equal(res.status, 200);

    const stored = await Webhook.findById(webhook._id).lean();
    assert.notEqual(stored.secret, 'new-secret-value');
    assert.equal(decrypt(stored.secret), 'new-secret-value');
  });
});

describe('GET /api/webhooks', () => {
  it('returns the secret decrypted, so an admin can read/copy it', async () => {
    const app = buildApp();
    await Webhook.create({
      name: 'Hook', url: 'https://example.com/hook', events: ['lead.won'], secret: encrypt('the-real-secret'),
    });

    const res = await request(app).get('/api/webhooks');
    assert.equal(res.status, 200);
    assert.equal(res.body[0].secret, 'the-real-secret');
  });
});

describe('dispatchWebhooks HMAC signing', () => {
  it('signs the payload with the decrypted secret, matching what a receiver would verify', async () => {
    let capturedHeaders;
    let capturedBody;
    mock.method(globalThis, 'fetch', async (_url, init) => {
      capturedHeaders = init.headers;
      capturedBody = init.body;
      return new Response('ok', { status: 200 });
    });

    const webhook = await Webhook.create({
      name: 'Hook', url: 'https://example.com/hook', events: ['lead.won'],
      secret: encrypt('sign-me-please'), isActive: true,
    });

    await dispatchWebhooks('lead.won', { id: 'lead_1' }, 'system');
    await new Promise((r) => setTimeout(r, 50));

    const expectedHmac = crypto.createHmac('sha256', 'sign-me-please').update(capturedBody).digest('hex');
    assert.equal(capturedHeaders['X-Incoda-Signature'], `sha256=${expectedHmac}`);

    mock.restoreAll();
  });
});

describe('ensureWebhookSecretsEncrypted', () => {
  it('encrypts a plaintext legacy secret and leaves it decryptable', async () => {
    const webhook = await Webhook.create({
      name: 'Legacy hook', url: 'https://example.com/hook', events: ['lead.won'], secret: 'old-plaintext-secret',
    });

    await ensureWebhookSecretsEncrypted();

    const stored = await Webhook.findById(webhook._id).lean();
    assert.notEqual(stored.secret, 'old-plaintext-secret');
    assert.equal(decrypt(stored.secret), 'old-plaintext-secret');
  });

  it('is idempotent — does not double-encrypt an already-encrypted secret', async () => {
    const webhook = await Webhook.create({
      name: 'Hook', url: 'https://example.com/hook', events: ['lead.won'], secret: encrypt('already-safe'),
    });
    const before = (await Webhook.findById(webhook._id).lean()).secret;

    await ensureWebhookSecretsEncrypted();
    await ensureWebhookSecretsEncrypted();

    const after = (await Webhook.findById(webhook._id).lean()).secret;
    assert.equal(after, before);
    assert.equal(decrypt(after), 'already-safe');
  });

  it('does nothing for a webhook with no secret', async () => {
    await Webhook.create({ name: 'Hook', url: 'https://example.com/hook', events: ['lead.won'] });
    await assert.doesNotReject(ensureWebhookSecretsEncrypted());
  });
});
