import mongoose from 'mongoose';

const LeadSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    companyName: { type: String, required: true },
    contactName: { type: String, required: true },
    email: String,
    phone: String,
    city: String,
    country: String,
    role: String,
    description: String,
    projectName: { type: String, default: '' },
    manufacturer: String,
    value: { type: Number, default: 0 },
    closedValue: Number,
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
    costingItems: { type: mongoose.Schema.Types.Mixed, default: [] },
    costingSyncLog: { type: mongoose.Schema.Types.Mixed, default: [] },
    budgetedCost: { type: Number, default: 0 },
    costingReviewedAt: Date,
    costingReviewedBy: String,
    stage: { type: String, default: 'prospect' },
    probability: { type: Number, default: 0 },
    expectedCloseDate: String,
    dealType: String,
    partnerName: String,
    interactions: { type: mongoose.Schema.Types.Mixed, default: [] },
    documents: { type: mongoose.Schema.Types.Mixed, default: [] },
    preSalesTimeLogs: { type: mongoose.Schema.Types.Mixed, default: [] },
    tasks: { type: mongoose.Schema.Types.Mixed, default: [] },
    deleted: { type: Boolean, default: false },
    stageHistory: { type: mongoose.Schema.Types.Mixed, default: [] },
    nextStep: { type: String, default: '' },
    nextStepDueDate: { type: String, default: '' },
    completedNextSteps: { type: mongoose.Schema.Types.Mixed, default: [] },
    aiScore:       { type: Number, default: null },
    aiScoreReason: { type: String, default: '' },
    aiNextAction:  { type: String, default: '' },
    wonReason:     { type: String, default: '' }, // Best Price | Best Solution | Relationship | References | Speed | Support | Other
    lostReason:    { type: String, default: '' }, // Price | Competitor | No Budget | No Decision | Timeline | Other
    lostNote:      { type: String, default: '' },
    competitor:    { type: String, default: '' },
    assignedTo:    { type: String, default: '' },
    assignedToName:{ type: String, default: '' },
    // Collection reminder kill switches
    suppressCollectionReminders: { type: Boolean, default: false },
    suppressCollectionReason: String,
    suppressCollectionUntil: Date,
    enrichment: {
        domain:          { type: String, default: '' },
        title:           { type: String, default: '' },
        metaDescription: { type: String, default: '' },
        ogSiteName:      { type: String, default: '' },
        industryGuess:   { type: String, default: '' },
        enrichedAt:      { type: Date, default: null },
        status: {
            type: String,
            enum: ['enriched', 'failed', 'skipped_free_domain'],
        },
    },
}, { timestamps: true, strict: false });

LeadSchema.index({ stage: 1, createdAt: -1 });
LeadSchema.index({ assignedTo: 1 });
LeadSchema.index({ deleted: 1, stage: 1 });
LeadSchema.index({
  companyName: 'text',
  contactName: 'text',
  email: 'text',
  description: 'text',
  manufacturer: 'text',
  partnerName: 'text',
});

export default mongoose.model('Lead', LeadSchema);
