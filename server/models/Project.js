import mongoose from 'mongoose';

const ProjectSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    leadId: String,
    name: { type: String, required: true },
    clientName: { type: String, required: true },
    type: { type: String, default: 'implementation' },
    startDate: String,
    status: { type: String, default: 'active' },
    totalBudgetHours: { type: Number, default: 0 },
    team: { type: mongoose.Schema.Types.Mixed, default: [] },
    tasks: { type: mongoose.Schema.Types.Mixed, default: [] },
    timeLogs: { type: mongoose.Schema.Types.Mixed, default: [] },
    // Note: Each timeLog in timeLogs array SHOULD have: entryCost, hourlyCostSnapshot (Fase 2E)
    payments: { type: mongoose.Schema.Types.Mixed, default: [] },
    consultantRates: { type: mongoose.Schema.Types.Mixed, default: {} },
    factoryCommissionRate: { type: Number, default: 10 },
    // Costing fields (Fase 1E: Schema extension for cost tracking)
    actualCost: { type: Number, default: 0 },  // Sum of entryCost from all timeLogs
    actualCostLastUpdated: { type: Date },
    budgetedCost: { type: Number, default: null }  // Snapshot from Lead at conversion
}, { timestamps: true, strict: false });

ProjectSchema.index({ leadId: 1 });
ProjectSchema.index({ status: 1, createdAt: -1 });
ProjectSchema.index({ name: 'text', clientName: 'text' });

export default mongoose.model('Project', ProjectSchema);
