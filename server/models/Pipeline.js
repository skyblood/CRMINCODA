import mongoose from 'mongoose';

const PipelineSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true, index: true },
  name:        { type: String, required: true },
  color:       { type: String, default: '#410074' },
  description: { type: String, default: '' },
  isDefault:   { type: Boolean, default: false },
  // Optional custom stages order (if null, uses system defaults)
  stages:      { type: [String], default: null },
}, { timestamps: true, strict: false });

export default mongoose.model('Pipeline', PipelineSchema);
