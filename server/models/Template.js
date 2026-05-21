import mongoose from 'mongoose';

const TemplateSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    description: String,
    items: { type: mongoose.Schema.Types.Mixed, default: [] }
}, { timestamps: true, strict: false });

export default mongoose.model('Template', TemplateSchema);
