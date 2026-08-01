// Regression test for the Task 17 review fix: `permissions.finance` (added in
// Task 12) is a Mongoose schema default, which only applies to newly-created
// documents. Every User that existed before Task 12 has a `permissions`
// subdocument with no `finance` key at all — ensureFinancePermissionBackfilled()
// (server/seed/userPermissions.js) closes that gap on every server startup.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB } from './setup.js';
import User from '../../server/models/User.js';
import { ensureFinancePermissionBackfilled } from '../../server/seed/userPermissions.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(async () => {
  await User.deleteMany({});
});

describe('ensureFinancePermissionBackfilled', () => {
  it('grants finance: true to a pre-existing admin with no permissions.finance key', async () => {
    await User.create({
      id: 'u_old_admin',
      name: 'Old Admin',
      email: 'oldadmin@test.com',
      role: 'admin',
      // Explicit permissions object with no `finance` key — mirrors a real
      // document created before Task 12 added the flag. Mongoose only
      // applies a Mixed field's schema default when the field itself is
      // entirely absent from the input, so this object is stored verbatim.
      permissions: { dashboard: true, crm: true, projects: true, portal: true, admin: true },
    });

    await ensureFinancePermissionBackfilled();

    const reloaded = await User.findOne({ id: 'u_old_admin' });
    assert.equal(reloaded.permissions.finance, true);
  });

  it('leaves a pre-existing non-admin user without permissions.finance untouched', async () => {
    await User.create({
      id: 'u_old_consultant',
      name: 'Old Consultant',
      email: 'oldconsultant@test.com',
      role: 'consultant',
      permissions: { dashboard: false, crm: false, projects: false, portal: true, admin: false },
    });

    await ensureFinancePermissionBackfilled();

    const reloaded = await User.findOne({ id: 'u_old_consultant' });
    assert.ok(!reloaded.permissions.finance);
    assert.ok(!('finance' in reloaded.permissions));
  });

  it('is idempotent and does not touch a user that already has permissions.finance set', async () => {
    await User.create({
      id: 'u_explicit_false',
      name: 'Explicitly Denied Admin',
      email: 'explicitfalse@test.com',
      role: 'admin',
      // An admin whose finance flag was deliberately turned off via
      // UserManagement — the backfill must not clobber that choice.
      permissions: { dashboard: true, crm: true, projects: true, portal: true, admin: true, finance: false },
    });

    await ensureFinancePermissionBackfilled();

    const reloaded = await User.findOne({ id: 'u_explicit_false' });
    assert.equal(reloaded.permissions.finance, false);
  });
});
