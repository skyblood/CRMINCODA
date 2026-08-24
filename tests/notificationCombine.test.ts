// tests/notificationCombine.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Notification from '../server/models/Notification.js';
import { createNotification } from '../server/notificationService.js';

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
  await Notification.deleteMany({});
});

describe('createNotification without combine (existing behavior, unchanged)', () => {
  it('creates a separate notification for a different relatedId of the same type', async () => {
    await createNotification({ userId: 'u1', type: 'lead_expiring', title: 'Lead A', relatedId: 'lead_1' });
    await createNotification({ userId: 'u1', type: 'lead_expiring', title: 'Lead B', relatedId: 'lead_2' });

    const all = await Notification.find({ userId: 'u1' });
    assert.equal(all.length, 2);
  });

  it('still dedupes an exact repeat (same userId/type/relatedId, unread)', async () => {
    await createNotification({ userId: 'u1', type: 'lead_expiring', title: 'Lead A', relatedId: 'lead_1' });
    await createNotification({ userId: 'u1', type: 'lead_expiring', title: 'Lead A again', relatedId: 'lead_1' });

    const all = await Notification.find({ userId: 'u1' });
    assert.equal(all.length, 1);
  });
});

describe('createNotification with combine: true', () => {
  it('combines a second notification of the same type into the first, incrementing count', async () => {
    const first = await createNotification({
      userId: 'u1', type: 'lead_expiring', title: 'Lead próximo a vencer: Acme', relatedId: 'lead_1', combine: true,
    });
    assert.equal(first.count, 1);

    const second = await createNotification({
      userId: 'u1', type: 'lead_expiring', title: 'Lead próximo a vencer: Beta', relatedId: 'lead_2', combine: true,
    });

    assert.equal(second._id.toString(), first._id.toString());
    assert.equal(second.count, 2);
    assert.equal(second.title, 'Lead próximo a vencer: Beta');

    const all = await Notification.find({ userId: 'u1' });
    assert.equal(all.length, 1);
  });

  it('does not combine across different users', async () => {
    await createNotification({ userId: 'u1', type: 'lead_expiring', title: 'Lead A', relatedId: 'lead_1', combine: true });
    await createNotification({ userId: 'u2', type: 'lead_expiring', title: 'Lead A', relatedId: 'lead_1', combine: true });

    const all = await Notification.find({ type: 'lead_expiring' });
    assert.equal(all.length, 2);
  });

  it('does not combine across different types', async () => {
    await createNotification({ userId: 'u1', type: 'lead_expiring', title: 'Lead A', relatedId: 'lead_1', combine: true });
    await createNotification({ userId: 'u1', type: 'project_budget_warning', title: 'Proyecto X', relatedId: 'proj_1', combine: true });

    const all = await Notification.find({ userId: 'u1' });
    assert.equal(all.length, 2);
  });

  it('does not combine into an already-read notification — starts a fresh count', async () => {
    const first = await createNotification({ userId: 'u1', type: 'lead_expiring', title: 'Lead A', relatedId: 'lead_1', combine: true });
    await Notification.findByIdAndUpdate(first._id, { read: true, count: 5 });

    const second = await createNotification({ userId: 'u1', type: 'lead_expiring', title: 'Lead B', relatedId: 'lead_2', combine: true });

    assert.notEqual(second._id.toString(), first._id.toString());
    assert.equal(second.count, 1);
  });
});
