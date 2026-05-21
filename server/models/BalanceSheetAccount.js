import mongoose from 'mongoose';

const BalanceSheetAccountSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    accountType: { type: String, required: true },
    name: { type: String, required: true },
    year: { type: Number, required: true },
    amount: { type: Number, required: true },
    inventoryMethod: String,
    notes: String
}, { timestamps: true, strict: false });

export default mongoose.model('BalanceSheetAccount', BalanceSheetAccountSchema);
