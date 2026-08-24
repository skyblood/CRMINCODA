import mongoose from 'mongoose';
import { postExpense, postConsultantPayment } from '../services/ledgerPostingService.js';

const EXPENSE_CATEGORIES = [
    'credit_card', 'office', 'software', 'marketing',
    'salary', 'consultant_payment', 'other',
];

const TransactionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    date: String, // Legacy — kept for backward compatibility
    dateObj: { type: Date, index: true }, // Proper Date for aggregation pipelines
    type: { type: String, default: 'expense', enum: ['income', 'expense'] },
    category: {
        type: String,
        enum: EXPENSE_CATEGORIES,
        default: 'other',
    },
    description: String,
    projectId: { type: String, index: true },
    leadId: { type: String, index: true },
    consultantId: String,
    lineItemId: String,
    logIds: [String],
    isBillable: { type: Boolean, default: false },

    // Multi-currency support
    currency: { type: String, default: 'USD' },
    amountUSD: { type: Number },
    exchangeRateToUSD: { type: Number, default: 1 },

    // Ledger (double-entry) support — see server/services/ledgerPostingService.js
    taxCategory: { type: String, default: '' },        // Schedule C line; required by UI for company expenses (Task 11)
    postingStatus: { type: String, enum: ['posted', 'failed', 'n/a'], default: 'n/a' },
}, { timestamps: true, strict: false });

TransactionSchema.index({ type: 1, dateObj: -1 });
TransactionSchema.index({ category: 1 });
TransactionSchema.index({ title: 'text', description: 'text' });

// Auto-post to the general ledger on creation only (not on every edit — see
// Task 5 of docs/superpowers/plans/2026-07-28-accounting-ledger.md for why).
// Never lets a posting failure block the write that triggered it.
TransactionSchema.post('save', async function postToLedger(doc) {
    if (!doc.wasNew || doc.type !== 'expense') return;
    try {
        const poster = doc.category === 'consultant_payment' ? postConsultantPayment : postExpense;
        await poster(doc.toObject());
        try {
            await mongoose.model('Transaction').updateOne({ _id: doc._id }, { $set: { postingStatus: 'posted' } });
        } catch (statusErr) {
            // The journal entry WAS posted — this is only a failure to record that
            // fact on the Transaction doc. Log distinctly; do not mark 'failed'
            // (that would misrepresent a successful posting) and do not rethrow
            // (a status-write failure must never block the original save()).
            console.error(`[ledger] Transaction ${doc.id} posted successfully but failed to record postingStatus=posted:`, statusErr.stack || statusErr);
        }
    } catch (err) {
        console.error(`[ledger] Failed to post Transaction ${doc.id}:`, err.stack || err);
        try {
            await mongoose.model('Transaction').updateOne({ _id: doc._id }, { $set: { postingStatus: 'failed' } });
        } catch (statusErr) {
            // Recovery write also failed (e.g. a correlated Mongo blip). Swallow
            // it — this hook must never reject, or it would propagate into the
            // caller's save()/create() promise per Mongoose's async post-hook
            // semantics, even though the document was already persisted.
            console.error(`[ledger] Also failed to record postingStatus=failed for Transaction ${doc.id}:`, statusErr.stack || statusErr);
        }
    }
});

// Mongoose doesn't give post('save') a reliable "was this an insert" flag
// out of the box on all versions, so we capture it ourselves in pre('save').
TransactionSchema.pre('save', function captureWasNew(next) {
    this.wasNew = this.isNew;
    next();
});

export default mongoose.model('Transaction', TransactionSchema);
