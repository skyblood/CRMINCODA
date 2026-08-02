// One-time, idempotent backfill for the `id` field added to Commission
// documents. Every Commission created before this field existed (via
// server/migrations/002-create-commissions-from-projects.js, the only
// call site of Commission.create()) has no `id` at all, so the generic
// CRUD router's GET/PUT/DELETE `:id` routes (server/routes/crud.js, which
// filter by `{ id: req.params.id }`) and the model's `post('findOneAndUpdate')`
// ledger-posting hook can never match those documents.
//
// Run on every server startup (see server/index.js) — safe to call
// repeatedly because the query only matches documents that still lack the
// key, so once backfilled a commission is never touched again by this
// function. Each document needs a distinct id, so this loops rather than
// using a single updateMany $set (which would assign the same id to every
// matched document, violating the unique index).
import { nanoid } from 'nanoid';
import Commission from '../models/Commission.js';

export async function ensureCommissionIdsBackfilled() {
    const missing = await Commission.find({ id: { $exists: false } }).select('_id').lean();
    for (const { _id } of missing) {
        await Commission.updateOne({ _id }, { $set: { id: nanoid() } });
    }
}
