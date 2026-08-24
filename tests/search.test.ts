import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Lead from '../server/models/Lead.js';
import Project from '../server/models/Project.js';
import Contact from '../server/models/Contact.js';
import SKU from '../server/models/SKU.js';
import Transaction from '../server/models/Transaction.js';
import searchRouter from '../server/routes/search.js';

let mongoServer;

function buildApp(isAdmin) {
  const a = express();
  a.use((req, _res, next) => {
    req.session = { user: { permissions: { admin: isAdmin } } };
    next();
  });
  a.use('/api/search', searchRouter);
  return a;
}

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Ensure indexes are created for all models
  await Promise.all([
    Lead.syncIndexes(),
    Project.syncIndexes(),
    Contact.syncIndexes(),
    SKU.syncIndexes(),
    Transaction.syncIndexes(),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    Lead.deleteMany({}),
    Project.deleteMany({}),
    Contact.deleteMany({}),
    SKU.deleteMany({}),
    Transaction.deleteMany({}),
  ]);
});

describe('GET /api/search', () => {
  it('finds a lead by a full-word match on companyName', async () => {
    await Lead.create({ id: 'lead_1', companyName: 'Acme Corp', contactName: 'Jane Doe' });

    const res = await request(buildApp(false)).get('/api/search?q=Acme');

    assert.equal(res.status, 200);
    assert.equal(res.body.results.leads.length, 1);
    assert.equal(res.body.results.leads[0].title, 'Acme Corp');
  });

  it('finds a lead by a word inside its email field', async () => {
    await Lead.create({
      id: 'lead_2',
      companyName: 'Beta LLC',
      contactName: 'John Roe',
      email: 'john@beta.com',
    });

    const res = await request(buildApp(false)).get('/api/search?q=beta');

    assert.ok(res.body.results.leads.some((l) => l.id === 'lead_2'));
  });

  it('finds a SKU by a word in its description', async () => {
    await SKU.create({
      id: 'sku_1',
      code: 'SKU-100',
      name: 'Widget',
      category: 'Hardware',
      description: 'Industrial grade fastener',
    });

    const res = await request(buildApp(false)).get('/api/search?q=fastener');

    assert.equal(res.body.results.skus.length, 1);
  });

  it('excludes transactions for a non-admin session', async () => {
    await Transaction.create({ id: 'txn_1', title: 'Acme invoice payment', amount: 100 });

    const res = await request(buildApp(false)).get('/api/search?q=Acme');

    assert.equal(res.body.results.transactions.length, 0);
  });

  it('includes transactions for an admin session', async () => {
    await Transaction.create({ id: 'txn_1', title: 'Acme invoice payment', amount: 100 });

    const res = await request(buildApp(true)).get('/api/search?q=Acme');

    assert.equal(res.body.results.transactions.length, 1);
  });

  it('returns empty results for an empty query without touching the database', async () => {
    const res = await request(buildApp(false)).get('/api/search?q=');

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 0);
  });
});
