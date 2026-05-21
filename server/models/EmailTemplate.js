import mongoose from 'mongoose';

const EmailTemplateSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },       // e.g., "Follow-up post demo"
    subject: { type: String, default: '' },
    body: { type: String, default: '' },          // Plain text with {{mergeFields}}
    tags: { type: [String], default: [] },        // e.g., ['follow-up', 'proposal']
    language: { type: String, enum: ['es', 'en'], default: 'es' },
    category: { type: String, enum: ['general', 'collection', 'notification'], default: 'general' },
}, { timestamps: true });

export default mongoose.model('EmailTemplate', EmailTemplateSchema);
