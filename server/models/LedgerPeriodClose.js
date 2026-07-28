import mongoose from 'mongoose';

const LedgerPeriodCloseSchema = new mongoose.Schema({
    id:       { type: String, required: true, unique: true },
    year:     { type: Number, required: true },
    month:    { type: Number, required: true, min: 1, max: 12 },
    closedAt: { type: Date, default: Date.now },
    closedBy: { type: String, default: '' },
}, { timestamps: true, strict: true });

LedgerPeriodCloseSchema.index({ year: 1, month: 1 }, { unique: true });

export default mongoose.model('LedgerPeriodClose', LedgerPeriodCloseSchema);
