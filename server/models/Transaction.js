import mongoose from 'mongoose';

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
}, { timestamps: true, strict: false });

TransactionSchema.index({ type: 1, dateObj: -1 });
TransactionSchema.index({ category: 1 });

export default mongoose.model('Transaction', TransactionSchema);
