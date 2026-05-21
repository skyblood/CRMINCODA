import mongoose from 'mongoose';

const UserGoalSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    userName: { type: String, default: '' },
    year: { type: Number, required: true },
    target: { type: Number, required: true, default: 0 },
    type: { type: String, default: 'revenue' }, // 'revenue' | 'deals'
}, { timestamps: true });

UserGoalSchema.index({ userId: 1, year: 1 }, { unique: true });

export default mongoose.model('UserGoal', UserGoalSchema);
