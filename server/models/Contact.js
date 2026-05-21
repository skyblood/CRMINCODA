import mongoose from 'mongoose';

const ContactSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: String,
    phone: String,
    role: String,
    companyName: String,
    notes: String,
    lastContacted: String
}, { timestamps: true, strict: false });

export default mongoose.model('Contact', ContactSchema);
