import mongoose from 'mongoose';
import { postCommissionPaid } from '../services/ledgerPostingService.js';

const CommissionSchema = new mongoose.Schema({
  projectId: { type: String, required: true },
  projectName: { type: String, required: true },
  clientId: { type: String, index: true },
  clientName: String,

  // The rate snapshot at commission creation time
  rate: { type: Number, required: true, min: 0, max: 100 },

  // Base amounts (USD)
  revenueUSD: { type: Number, required: true },
  costUSD: { type: Number, required: true },
  netUtilityUSD: { type: Number, required: true },

  // Calculated commission
  amountUSD: { type: Number, required: true },

  // Split breakdown (snapshot — persisted so historical records don't shift)
  split: {
    bmRetainedUSD: { type: Number, default: 0 },
    fabianShareUSD: { type: Number, default: 0 },
    spencerShareUSD: { type: Number, default: 0 },
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'partially_paid', 'paid', 'cancelled'],
    default: 'pending',
    index: true,
  },

  // Payment tracking
  paidAmountUSD: { type: Number, default: 0 },
  paymentRefs: [{
    transactionId: String,
    amount: Number,
    date: Date,
    reference: String,
  }],

  // Ledger (double-entry) support — see server/services/ledgerPostingService.js
  postingStatus: { type: String, enum: ['posted', 'failed', 'n/a'], default: 'n/a' },

  // Audit
  approvedBy: String,
  approvedAt: Date,
  notes: String,

  // Migration flag
  legacy_migration: { type: Boolean, default: false },
}, { timestamps: true, strict: true });

// One commission per project (for now — can be extended to per-consultant later)
CommissionSchema.index({ projectId: 1 }, { unique: true });
CommissionSchema.index({ status: 1, createdAt: -1 });

// Auto-post to the general ledger when a commission transitions to `paid`.
// commissions.js uses the generic createCrudRouter, whose PUT /:id calls
// findOneAndUpdate directly (never .save()) — so this must be query
// middleware, not document middleware. `this` is the Query; the hook
// receives the *result* document as its argument. Fires with zero route
// changes needed.
//
// Never lets a posting failure block the write that triggered it — the
// success-path and failure-path status writes are each independently
// guarded (see Task 5 of docs/superpowers/plans/2026-07-28-accounting-ledger.md
// for why: an unguarded recovery write can itself reject and propagate out
// of this hook via Mongoose's async post-hook promise chain).
CommissionSchema.post('findOneAndUpdate', async function postToLedger(doc) {
    if (!doc || doc.status !== 'paid') return;
    try {
        const result = await postCommissionPaid(doc);
        if (result) {
            try {
                await mongoose.model('Commission').updateOne({ _id: doc._id }, { $set: { postingStatus: 'posted' } });
            } catch (statusErr) {
                // The journal entry WAS posted — this is only a failure to record
                // that fact on the Commission doc. Log distinctly; do not mark
                // 'failed' (that would misrepresent a successful posting) and do
                // not rethrow (a status-write failure must never block the
                // original findOneAndUpdate()).
                console.error(`[ledger] Commission ${doc._id} posted successfully but failed to record postingStatus=posted:`, statusErr.stack || statusErr);
            }
        }
    } catch (err) {
        console.error(`[ledger] Failed to post Commission ${doc._id}:`, err.stack || err);
        try {
            await mongoose.model('Commission').updateOne({ _id: doc._id }, { $set: { postingStatus: 'failed' } });
        } catch (statusErr) {
            // Recovery write also failed (e.g. a correlated Mongo blip). Swallow
            // it — this hook must never reject, or it would propagate into the
            // caller's findOneAndUpdate() promise per Mongoose's async
            // post-hook semantics, even though the document was already
            // persisted.
            console.error(`[ledger] Also failed to record postingStatus=failed for Commission ${doc._id}:`, statusErr.stack || statusErr);
        }
    }
});

export default mongoose.model('Commission', CommissionSchema);
