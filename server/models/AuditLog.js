import mongoose from 'mongoose';

const ChangeSchema = new mongoose.Schema({
    field: String,
    from:  mongoose.Schema.Types.Mixed,
    to:    mongoose.Schema.Types.Mixed,
}, { _id: false });

const AuditLogSchema = new mongoose.Schema({
    entityType: { type: String, required: true },   // 'lead' | 'project'
    entityId:   { type: String, required: true, index: true },
    action:     { type: String, required: true },   // 'created' | 'updated' | 'deleted' | 'stage_changed' | 'scored'
    userId:     String,
    userName:   String,
    changes:    [ChangeSchema],
    meta:       mongoose.Schema.Types.Mixed,        // extra context (e.g. { previousStage, newStage })
    timestamp:  { type: Date, default: Date.now },
}, { timestamps: false });

// TTL — audit logs expire after 1 year (index: true removed from field to avoid duplicate)
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export default mongoose.model('AuditLog', AuditLogSchema);
