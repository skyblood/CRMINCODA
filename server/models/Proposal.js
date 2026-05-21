import mongoose from 'mongoose';

/**
 * Proposal — a versioned, named snapshot of a rendered proposal for a lead.
 * Created from ProposalPrint when the user clicks "Save Proposal".
 * Status transitions: draft → sent → accepted | rejected
 */
const ProposalSchema = new mongoose.Schema({
    id:             { type: String, required: true, unique: true },
    leadId:         { type: String, required: true, index: true },
    name:           { type: String, required: true },
    htmlContent:    { type: String, required: true },
    status:         { type: String, enum: ['draft', 'sent', 'accepted', 'rejected'], default: 'draft' },
    templateId:     { type: String, default: null },
    totalValue:     { type: Number, default: 0 },
    version:        { type: Number, default: 1 },
    // Veracode configuration snapshot used to generate this proposal
    veracodeConfig: { type: mongoose.Schema.Types.Mixed, default: null },
    // Google Drive integration
    driveFileId:    { type: String, default: null },
    driveFileUrl:   { type: String, default: null },
    driveFolderId:  { type: String, default: null },
}, { timestamps: true });

export default mongoose.model('Proposal', ProposalSchema);
