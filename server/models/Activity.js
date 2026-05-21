import mongoose from 'mongoose';

const ActivitySchema = new mongoose.Schema({
    id:         { type: String, required: true, unique: true },
    type:       { type: String, default: 'note' }, // stage_change | note | email | call | meeting | task
    note:       { type: String, default: '' },
    date:       { type: String, default: () => new Date().toISOString() },
    userId:     { type: String, default: '' },
    userName:   { type: String, default: '' },
    entityId:   { type: String, required: true, index: true },
    entityType: { type: String, required: true }, // lead | contact
    metadata:   { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

ActivitySchema.index({ entityId: 1, entityType: 1 });

export default mongoose.model('Activity', ActivitySchema);
