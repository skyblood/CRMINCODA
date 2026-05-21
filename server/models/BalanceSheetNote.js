import mongoose from 'mongoose';

const BalanceSheetNoteSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    year: { type: Number, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true }
}, { timestamps: true, strict: false });

export default mongoose.model('BalanceSheetNote', BalanceSheetNoteSchema);
