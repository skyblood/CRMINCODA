import mongoose from 'mongoose';

const GoalSchema = new mongoose.Schema({
    year: { type: Number, required: true, unique: true },
    amount: { type: Number, required: true, default: 0 }
}, { timestamps: true });

export default mongoose.model('Goal', GoalSchema);
