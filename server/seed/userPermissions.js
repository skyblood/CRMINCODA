// One-time, idempotent backfill for the `permissions.finance` flag added in
// Task 12. Mongoose schema defaults (see server/models/User.js) only apply to
// newly-created documents — they never retroactively add missing keys to
// existing rows. Every User document that existed before Task 12 has a
// `permissions` subdocument with no `finance` key at all, so
// `currentUser.permissions?.finance` evaluates to `undefined` (falsy) and
// those users can't see or reach the Ledger module until this runs.
//
// Run on every server startup (see server/index.js) — safe to call
// repeatedly because the query only matches documents that still lack the
// key, so once backfilled a user is never touched again by this function.
import User from '../models/User.js';

/**
 * Grants `permissions.finance = true` to existing admin users that predate
 * the Task 12 permission and therefore have no `finance` key at all.
 * Non-admin users are left untouched — they get `finance` via the same
 * per-role opt-in path (UserManagement) that governs their other permission
 * flags, matching the existing convention that admins get `finance: true`
 * by default.
 */
export async function ensureFinancePermissionBackfilled() {
    await User.updateMany(
        { 'permissions.finance': { $exists: false }, 'permissions.admin': true },
        { $set: { 'permissions.finance': true } },
    );
}
