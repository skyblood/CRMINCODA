import mongoose from 'mongoose';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];
const DEBIT_NORMAL_TYPES = new Set(['asset', 'expense']);

const LedgerAccountSchema = new mongoose.Schema({
    id:            { type: String, required: true, unique: true },
    code:          { type: String, required: true, unique: true },
    name:          { type: String, required: true },
    type:          { type: String, required: true, enum: ACCOUNT_TYPES },
    normalBalance: { type: String, enum: ['debit', 'credit'] },
    taxCategory:   { type: String, default: '' },
    isActive:      { type: Boolean, default: true },
}, { timestamps: true, strict: true });

LedgerAccountSchema.pre('validate', function setNormalBalance(next) {
    this.normalBalance = DEBIT_NORMAL_TYPES.has(this.type) ? 'debit' : 'credit';
    next();
});

export default mongoose.model('LedgerAccount', LedgerAccountSchema);
