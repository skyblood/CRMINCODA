/**
 * Generic CRUD router factory.
 * Generates GET (all), GET (by id), POST, PUT, DELETE for any Mongoose model.
 *
 * Improvements over original:
 *   • Pagination  — GET /?page=1&limit=50&sort=createdAt&order=desc
 *                   Without ?page the full collection is returned (backward compat).
 *   • updatedAt   — Exposed in every response so clients can detect concurrent edits.
 *   • Concurrency — PUT accepts optional clientUpdatedAt field; returns 409 if the
 *                   server document was modified after that timestamp.
 */
import { Router } from 'express';
import { deepSanitize } from '../middleware/sanitize.js';
import { emitCollectionChange } from '../socketInstance.js';

// Fields that must never be overwritten via PUT/POST (defense-in-depth).
// Note: updatedAt is intentionally NOT listed here — we strip it from the payload
// manually in the PUT handler after extracting it for the concurrency check.
const IMMUTABLE_FIELDS = ['_id', '__v', 'keyHash', 'passwordHash', 'createdAt'];

/** Strip Mongo internals but keep updatedAt for concurrency checks */
const clean = ({ _id, __v, ...rest }) => rest;

export const createCrudRouter = (Model) => {
    const router = Router();

    // ── GET ALL (with optional pagination + search) ─────────────────────────────
    router.get('/', async (req, res) => {
        try {
            const paginate = req.query.page !== undefined;
            const page  = Math.max(1, parseInt(req.query.page)  || 1);
            const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || (paginate ? 50 : 500)));
            const sort  = req.query.sort  || 'createdAt';
            const order = req.query.order === 'asc' ? 1 : -1;

            // Optional free-text search across common text fields
            let filter = {};
            if (req.query.search) {
                const re = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                filter = {
                    $or: [
                        { companyName: re }, { contactName: re }, { email: re },
                        { name: re }, { title: re }, { description: re }, { code: re },
                    ]
                };
            }

            if (paginate) {
                const skip = (page - 1) * limit;
                const [docs, total] = await Promise.all([
                    Model.find(filter).sort({ [sort]: order }).skip(skip).limit(limit).lean(),
                    Model.countDocuments(filter),
                ]);
                return res.json({
                    data:  docs.map(clean),
                    total,
                    page,
                    pages: Math.ceil(total / limit),
                });
            }

            // Backward-compatible: return plain array when no ?page param
            const docs = await Model.find(filter).sort({ [sort]: order }).limit(limit).lean();
            res.json(docs.map(clean));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET BY ID ───────────────────────────────────────────────────────────────
    router.get('/:id', async (req, res) => {
        try {
            const doc = await Model.findOne({ id: req.params.id }).lean();
            if (!doc) return res.status(404).json({ error: 'Not found' });
            res.json(clean(doc));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── CREATE ──────────────────────────────────────────────────────────────────
    router.post('/', async (req, res) => {
        try {
            const payload = deepSanitize(req.body, true);
            IMMUTABLE_FIELDS.forEach(f => delete payload[f]);
            delete payload.updatedAt; // Mongoose handles this

            const doc = await Model.create(payload);
            const result = clean(doc.toObject());
            emitCollectionChange(Model.collection.name, 'created', result);
            res.status(201).json(result);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    // ── UPDATE (with optimistic concurrency) ────────────────────────────────────
    router.put('/:id', async (req, res) => {
        try {
            // Extract clientUpdatedAt before stripping immutable fields
            const { id, clientUpdatedAt, ...updateData } = req.body;
            IMMUTABLE_FIELDS.forEach(f => delete updateData[f]);
            delete updateData.updatedAt; // Mongoose { timestamps: true } handles this

            if (clientUpdatedAt) {
                // ── Concurrency-safe path ──────────────────────────────────────
                // Only update if the document's updatedAt matches what the client saw
                const doc = await Model.findOneAndUpdate(
                    { id: req.params.id, updatedAt: new Date(clientUpdatedAt) },
                    { $set: updateData },
                    { new: true, lean: true },
                );

                if (!doc) {
                    const current = await Model.findOne({ id: req.params.id }).lean();
                    if (!current) return res.status(404).json({ error: 'Not found' });
                    return res.status(409).json({
                        error: 'Conflict: this record was modified by another session. Reload and try again.',
                        current: clean(current),
                    });
                }

                emitCollectionChange(Model.collection.name, 'updated', clean(doc));
                return res.json(clean(doc));
            }

            // ── Last-write-wins path (backward compat, no clientUpdatedAt sent) ─
            const doc = await Model.findOneAndUpdate(
                { id: req.params.id },
                { $set: updateData },
                { new: true, lean: true },
            );
            if (!doc) return res.status(404).json({ error: 'Not found' });
            emitCollectionChange(Model.collection.name, 'updated', clean(doc));
            res.json(clean(doc));
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    // ── DELETE ──────────────────────────────────────────────────────────────────
    // Hard deletes require admin role — non-admins should use soft-delete (PUT deleted:true).
    router.delete('/:id', async (req, res) => {
        if (req.session?.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden: admin role required for hard delete' });
        }
        try {
            const result = await Model.findOneAndDelete({ id: req.params.id });
            if (!result) return res.status(404).json({ error: 'Not found' });
            emitCollectionChange(Model.collection.name, 'deleted', { id: req.params.id });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
