// tests/export.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Transaction from '../server/models/Transaction.js';
import Project from '../server/models/Project.js';
import Lead from '../server/models/Lead.js';
import Invoice from '../server/models/Invoice.js';
import exportRouter from '../server/routes/export.js';

let mongoServer;

function buildApp(isAdmin = true) {
  const a = express();
  a.use((req, _res, next) => { req.session = { user: { permissions: { admin: isAdmin } } }; next(); });
  a.use('/api/export', exportRouter);
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
  await Promise.all([
    Transaction.deleteMany({}),
    Project.deleteMany({}),
    Lead.deleteMany({}),
    Invoice.deleteMany({}),
  ]);
});

describe('GET /api/export/finance/expenses — CSV formula injection', () => {
  it('prefixes a formula-like title/description with a leading apostrophe', async () => {
    await Transaction.create({
      id: 'tx_1', type: 'expense', title: '=1+1+cmd|calc', description: '@SUM(A1:A9)',
      amount: 100, date: '2026-07-01', category: 'other',
    });

    const res = await request(buildApp()).get('/api/export/finance/expenses');

    assert.equal(res.status, 200);
    assert.match(res.text, /'=1\+1\+cmd\|calc/);
    assert.match(res.text, /'@SUM\(A1:A9\)/);
  });

  it('leaves a normal title/description untouched', async () => {
    await Transaction.create({
      id: 'tx_2', type: 'expense', title: 'AWS Hosting', description: 'Monthly bill',
      amount: 100, date: '2026-07-01', category: 'other',
    });

    const res = await request(buildApp()).get('/api/export/finance/expenses');

    assert.match(res.text, /AWS Hosting/);
    assert.doesNotMatch(res.text, /'AWS Hosting/);
  });

  it('does not corrupt a legitimate negative amount with an apostrophe', async () => {
    await Transaction.create({
      id: 'tx_3', type: 'expense', title: 'Refund', amount: -50, date: '2026-07-01', category: 'other',
    });

    const res = await request(buildApp()).get('/api/export/finance/expenses');

    assert.match(res.text, /,-50,/);
    assert.doesNotMatch(res.text, /'-50/);
  });
});

describe('GET /api/export/profitability — CSV formula injection', () => {
  it('prefixes a formula-like project name', async () => {
    await Project.create({ id: 'proj_1', name: '=HYPERLINK("http://evil.example")', clientName: 'Acme' });

    const res = await request(buildApp()).get('/api/export/profitability');

    assert.match(res.text, /'=HYPERLINK/);
  });
});

describe('GET /api/export/commissions — CSV formula injection', () => {
  it('prefixes a formula-like company name', async () => {
    await Lead.create({
      id: 'lead_1', companyName: '+cmd|calc!A1', contactName: 'Jane', stage: 'closed-won',
      closedValue: 1000, expectedCloseDate: '2026-07-01',
    });

    const res = await request(buildApp()).get('/api/export/commissions');

    assert.match(res.text, /'\+cmd\|calc!A1/);
  });
});

describe('GET /api/export/leads — CSV formula injection', () => {
  it('prefixes formula-like company/contact/country/partner fields', async () => {
    await Lead.create({
      id: 'lead_2', companyName: '=1+1', contactName: '-2+3', country: '@Colombia', partnerName: '+Partner',
    });

    const res = await request(buildApp()).get('/api/export/leads');

    assert.match(res.text, /'=1\+1/);
    assert.match(res.text, /'-2\+3/);
    assert.match(res.text, /'@Colombia/);
    assert.match(res.text, /'\+Partner/);
  });
});

describe('GET /api/export/timelogs — CSV formula injection', () => {
  it('prefixes a formula-like consultant/task field', async () => {
    await Project.create({
      id: 'proj_2', name: 'Acme Project', clientName: 'Acme',
      timeLogs: [{ consultantName: '=cmd|calc', task: '@evil', date: '2026-07-01', hours: 5, status: 'approved' }],
    });

    const res = await request(buildApp()).get('/api/export/timelogs?projectId=proj_2');

    assert.match(res.text, /'=cmd\|calc/);
    assert.match(res.text, /'@evil/);
  });
});
