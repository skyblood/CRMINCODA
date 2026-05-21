import mongoose from 'mongoose';

const AccountSchema = new mongoose.Schema({
    id:       { type: String, required: true, unique: true },
    name:     { type: String, required: true },
    industry: { type: String, default: '' },
    size:     { type: String, default: '' }, // e.g. '1-10', '11-50', '51-200', '200+'
    website:  { type: String, default: '' },
    address:  { type: String, default: '' },
    notes:    { type: String, default: '' },
}, { timestamps: true, strict: false });

export default mongoose.model('Account', AccountSchema);
