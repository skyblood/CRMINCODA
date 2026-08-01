import LedgerAccount from '../models/LedgerAccount.js';
import { createCrudRouter } from './crud.js';
import { emitCollectionChange } from '../socketInstance.js';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];
const DEBIT_NORMAL_TYPES = new Set(['asset', 'expense']);

/** Strip Mongo internals — mirrors crud.js's `clean()`. */
const clean = ({ _id, __v, ...rest }) => rest;

const router = createCrudRouter(LedgerAccount);

// Express matches routes in registration order, and createCrudRouter already
// registered a PUT '/:id' handler on this exact router instance — simply
// calling router.put('/:id', ...) again below would register a *second*
// handler that Express never reaches, because the generic one always
// matches first and ends the response. The generic handler must be removed
// from the router's internal layer stack before the override is added.
const genericPutIndex = router.stack.findIndex(
    (layer) => layer.route && layer.route.path === '/:id' && layer.route.methods.put,
);
if (genericPutIndex !== -1) router.stack.splice(genericPutIndex, 1);

// ── UPDATE override ──────────────────────────────────────────────────────────
// LedgerAccount.js's pre('validate') hook derives `normalBalance` from `type`,
// but that hook only fires on .save()/.create() — NOT on findOneAndUpdate,
// which is what the generic PUT (from createCrudRouter) uses. Editing `type`
// via the UI would therefore leave `normalBalance` stale, silently corrupting
// the balance-sheet sign logic in ledgerReports.js. This override re-derives
// normalBalance from `type` explicitly and validates `type` against the enum
// before persisting, then otherwise preserves the generic router's PUT
// behavior (optimistic concurrency via clientUpdatedAt, response shape, and
// emitCollectionChange conventions).
router.put('/:id', async (req, res) => {
    try {
        const { id, clientUpdatedAt, ...updateData } = req.body;
        delete updateData._id;
        delete updateData.__v;
        delete updateData.createdAt;
        delete updateData.updatedAt;

        if (updateData.type !== undefined) {
            if (!ACCOUNT_TYPES.includes(updateData.type)) {
                return res.status(400).json({ error: `Invalid account type: ${updateData.type}` });
            }
            updateData.normalBalance = DEBIT_NORMAL_TYPES.has(updateData.type) ? 'debit' : 'credit';
        }

        if (clientUpdatedAt) {
            // ── Concurrency-safe path (mirrors crud.js) ─────────────────────
            const doc = await LedgerAccount.findOneAndUpdate(
                { id: req.params.id, updatedAt: new Date(clientUpdatedAt) },
                { $set: updateData },
                { new: true, lean: true },
            );

            if (!doc) {
                const current = await LedgerAccount.findOne({ id: req.params.id }).lean();
                if (!current) return res.status(404).json({ error: 'Not found' });
                return res.status(409).json({
                    error: 'Conflict: this record was modified by another session. Reload and try again.',
                    current: clean(current),
                });
            }

            emitCollectionChange(LedgerAccount.collection.name, 'updated', clean(doc));
            return res.json(clean(doc));
        }

        // ── Last-write-wins path (backward compat, no clientUpdatedAt sent) ─
        const doc = await LedgerAccount.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { new: true, lean: true },
        );
        if (!doc) return res.status(404).json({ error: 'Not found' });
        emitCollectionChange(LedgerAccount.collection.name, 'updated', clean(doc));
        res.json(clean(doc));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

export default router;
