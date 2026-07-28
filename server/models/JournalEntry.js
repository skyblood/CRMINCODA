import mongoose from 'mongoose';

const JournalEntrySchema = new mongoose.Schema({
    id:        { type: String, required: true, unique: true },
    date:      { type: Date, required: true },
    reference: { type: String, default: '' },
    memo:      { type: String, default: '' },
}, { timestamps: true, strict: false });

export default mongoose.model('JournalEntry', JournalEntrySchema);
