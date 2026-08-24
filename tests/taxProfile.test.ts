import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../server/models/User.js';
import taxProfileRouter from '../server/routes/taxProfile.js';

let mongoServer;

function buildApp(sessionUser) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = sessionUser ? { user: sessionUser } : undefined; next(); });
  a.use('/api/tax-profile', taxProfileRouter);
  return a;
}

before(async () => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe('PUT /api/tax-profile/me', () => {
  it('stores an encrypted TIN and never returns it back in full', async () => {
    await User.create({ id: 'user-bob', name: 'Bob', email: 'bob@example.com', role: 'consultant' });
    const app = buildApp({ id: 'user-bob', role: 'consultant' });

    const putRes = await request(app).put('/api/tax-profile/me').send({
      legalName: 'Bob Smith',
      tin: '123-45-6789',
      tinType: 'SSN',
      address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701', country: 'US' },
    });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.body.tinLast4, '6789');
    assert.equal(putRes.body.tin, undefined);
    assert.equal(putRes.body.tinEncrypted, undefined);

    const getRes = await request(app).get('/api/tax-profile/me');
    assert.equal(getRes.body.tinLast4, '6789');
    assert.equal(getRes.body.legalName, 'Bob Smith');
    assert.equal(getRes.body.tin, undefined);

    const stored = await User.findOne({ id: 'user-bob' }).lean();
    assert.ok(stored.taxInfo.tinEncrypted);
    assert.notEqual(stored.taxInfo.tinEncrypted, '123456789');
  });

  it('rejects a TIN that is not exactly 9 digits', async () => {
    await User.create({ id: 'user-bob', name: 'Bob', email: 'bob@example.com', role: 'consultant' });
    const app = buildApp({ id: 'user-bob', role: 'consultant' });

    const res = await request(app).put('/api/tax-profile/me').send({
      legalName: 'Bob Smith', tin: '123-45', tinType: 'SSN', address: {},
    });
    assert.equal(res.status, 400);
  });

  it('requires an authenticated session', async () => {
    const app = buildApp(null);
    const res = await request(app).put('/api/tax-profile/me').send({ tin: '123456789' });
    assert.equal(res.status, 401);
  });
});

describe('GET /api/tax-profile/admin/:userId', () => {
  it('returns the decrypted TIN for an admin caller', async () => {
    await User.create({ id: 'user-bob', name: 'Bob', email: 'bob@example.com', role: 'consultant' });
    const consultantApp = buildApp({ id: 'user-bob', role: 'consultant' });
    await request(consultantApp).put('/api/tax-profile/me').send({
      legalName: 'Bob Smith', tin: '123456789', tinType: 'SSN', address: {},
    });

    const adminApp = buildApp({ id: 'user-admin', role: 'admin', permissions: { admin: true } });
    const res = await request(adminApp).get('/api/tax-profile/admin/user-bob');

    assert.equal(res.status, 200);
    assert.equal(res.body.tin, '123456789');
  });

  it('rejects a non-admin, non-finance caller with 403', async () => {
    await User.create({ id: 'user-bob', name: 'Bob', email: 'bob@example.com', role: 'consultant' });
    const salesApp = buildApp({ id: 'user-sales', role: 'sales', permissions: { admin: false, finance: false } });

    const res = await request(salesApp).get('/api/tax-profile/admin/user-bob');
    assert.equal(res.status, 403);
  });
});
