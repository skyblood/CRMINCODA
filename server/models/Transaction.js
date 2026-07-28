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

// Auto-post to the general ledger on creation only (not on every edit — see
// Task 5 of docs/superpowers/plans/2026-07-28-accounting-ledger.md for why).
// Never lets a posting failure block the write that triggered it.
TransactionSchema.post('save', async function postToLedger(doc) {
    if (!doc.wasNew || doc.type !== 'expense') return;
    try {
        const poster = doc.category === 'consultant_payment' ? postConsultantPayment : postExpense;
        await poster(doc.toObject());
        await mongoose.model('Transaction').updateOne({ _id: doc._id }, { $set: { postingStatus: 'posted' } });
    } catch (err) {
        console.error(`[ledger] Failed to post Transaction ${doc.id}:`, err.message);
        await mongoose.model('Transaction').updateOne({ _id: doc._id }, { $set: { postingStatus: 'failed' } });
    }
});

// Mongoose doesn't give post('save') a reliable "was this an insert" flag
// out of the box on all versions, so we capture it ourselves in pre('save').
TransactionSchema.pre('save', function captureWasNew(next) {
    this.wasNew = this.isNew;
    next();
});

export default mongoose.model('Transaction', TransactionSchema);
