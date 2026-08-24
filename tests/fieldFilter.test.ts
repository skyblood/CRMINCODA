import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../server/models/User.js';
import usersRouter from '../server/routes/users.js';
import { fieldFilter } from '../server/middleware/fieldFilter.js';

let mongoServer;

function buildApp(sessionUser) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = sessionUser ? { user: sessionUser } : undefined; next(); });
  a.use('/api/users', fieldFilter('users'), usersRouter);
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
  await User.deleteMany({});
});

const TAX_INFO = {
  legalName: 'Bob Smith',
  tinEncrypted: 'encrypted-blob',
  tinLast4: '6789',
  tinType: 'SSN',
  address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701', country: 'US' },
};

describe('fieldFilter(users) strips taxInfo for non-admin roles', () => {
  it('GET /api/users omits taxInfo for a sales caller', async () => {
    await User.create({ id: 'user-bob', name: 'Bob', email: 'bob@example.com', role: 'consultant', taxInfo: TAX_INFO });
    const app = buildApp({ id: 'user-sales', role: 'sales' });

    const res = await request(app).get('/api/users');
    assert.equal(res.status, 200);
    const bob = res.body.find((u) => u.id === 'user-bob');
    assert.ok(bob, 'expected bob in response');
    assert.equal(bob.taxInfo, undefined);
  });

  it('GET /api/users omits taxInfo for a consultant caller', async () => {
    await User.create({ id: 'user-bob', name: 'Bob', email: 'bob@example.com', role: 'consultant', taxInfo: TAX_INFO });
    const app = buildApp({ id: 'user-carol', role: 'consultant' });

    const res = await request(app).get('/api/users');
    assert.equal(res.status, 200);
    const bob = res.body.find((u) => u.id === 'user-bob');
    assert.ok(bob, 'expected bob in response');
    assert.equal(bob.taxInfo, undefined);
  });

  it('GET /api/users/:id omits taxInfo for a consultant caller, even for their own record', async () => {
    await User.create({ id: 'user-bob', name: 'Bob', email: 'bob@example.com', role: 'consultant', taxInfo: TAX_INFO });
    const app = buildApp({ id: 'user-bob', role: 'consultant' });

    const res = await request(app).get('/api/users/user-bob');
    assert.equal(res.status, 200);
    assert.equal(res.body.taxInfo, undefined);
  });

  it('GET /api/users keeps taxInfo for an admin caller', async () => {
    await User.create({ id: 'user-bob', name: 'Bob', email: 'bob@example.com', role: 'consultant', taxInfo: TAX_INFO });
    const app = buildApp({ id: 'user-admin', role: 'admin', permissions: { admin: true } });

    const res = await request(app).get('/api/users');
    assert.equal(res.status, 200);
    const bob = res.body.find((u) => u.id === 'user-bob');
    assert.ok(bob, 'expected bob in response');
    assert.ok(bob.taxInfo, 'admin should still see taxInfo');
    assert.equal(bob.taxInfo.tinLast4, '6789');
    assert.equal(bob.taxInfo.legalName, 'Bob Smith');
  });

  it('GET /api/users/:id keeps taxInfo for an admin caller', async () => {
    await User.create({ id: 'user-bob', name: 'Bob', email: 'bob@example.com', role: 'consultant', taxInfo: TAX_INFO });
    const app = buildApp({ id: 'user-admin', role: 'admin', permissions: { admin: true } });

    const res = await request(app).get('/api/users/user-bob');
    assert.equal(res.status, 200);
    assert.ok(res.body.taxInfo, 'admin should still see taxInfo');
    assert.equal(res.body.taxInfo.tinLast4, '6789');
  });
});
