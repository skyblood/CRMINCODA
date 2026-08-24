import mongoose from 'mongoose';

const SKUSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    basePrice: { type: Number, default: 0 },
    description: String,
    // Costing fields (Fase 1A: Schema extension for base cost)
    suggestedBaseCost: { type: Number, default: null },
    costUnit: { type: String, enum: ['hora', 'licencia', 'fijo'], default: null },
    costNotes: { type: String, default: '' },
    costLastUpdatedAt: { type: Date },
    costLastUpdatedBy: { type: String }  // userId
}, { timestamps: true, strict: false });

SKUSchema.index({ code: 'text', name: 'text', description: 'text' });

export default mongoose.model('SKU', SKUSchema);
