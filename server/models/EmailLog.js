import mongoose from 'mongoose';

const EmailLogSchema = new mongoose.Schema({
    leadId:     { type: String, required: true, index: true },
    templateId: { type: String, default: null },
    to:         { type: String, required: true },
    from:       { type: String, required: true },
    subject:    { type: String, default: '' },
    status:     { type: String, enum: ['sent', 'failed'], default: 'sent' },
    error:      { type: String, default: null },
    sentBy:     { type: String, default: 'system' }, // userId or 'automation'
}, { timestamps: true });

EmailLogSchema.index({ leadId: 1, createdAt: -1 });

export default mongoose.model('EmailLog', EmailLogSchema);
