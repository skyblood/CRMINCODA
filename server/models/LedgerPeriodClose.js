import mongoose from 'mongoose';

const LedgerPeriodCloseSchema = new mongoose.Schema({
    id:            { type: String, required: true, unique: true },
    periodEndDate: { type: Date, required: true },
    status:        { type: String, default: 'open' },
}, { timestamps: true, strict: false });

export default mongoose.model('LedgerPeriodClose', LedgerPeriodCloseSchema);
