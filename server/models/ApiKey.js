import mongoose from 'mongoose';

/**
 * API Key — stored as SHA-256 hash. The plain key is shown once at creation.
 * Format: crm_bm_<32 hex chars>
 */
const ApiKeySchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },          // human-readable label
    keyHash: { type: String, required: true, unique: true }, // SHA-256 of plain key
    keyPrefix: { type: String, required: true },     // first 12 chars for display
    scopes: { type: [String], default: ['leads', 'projects', 'contacts', 'users', 'pipeline'] },
    active: { type: Boolean, default: true },
    lastUsedAt: { type: Date, default: null },
    createdBy: { type: String, default: '' },        // user id who created it
}, { timestamps: true });

export default mongoose.model('ApiKey', ApiKeySchema);
