import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String, default: 'consultant' },
    avatar: String,
    passwordHash: { type: String, default: null },
    permissions: {
        type: mongoose.Schema.Types.Mixed,
        default: { dashboard: false, crm: false, projects: false, portal: true, admin: false, finance: false }
    },
    hourlyCost: { type: Number, default: 0 },
    costModel: { type: String, default: 'burdened' }, // 'burdened' = salary + 30% overhead
    costLastUpdatedAt: { type: Date },
    costLastUpdatedBy: { type: String },  // userId
    monthlySalary: { type: Number, default: 0 },
    salaryHistory: { type: mongoose.Schema.Types.Mixed, default: [] },
    salesQuota: { type: Number, default: 0 }, // Monthly revenue target in $
    canApproveCosting: {
        type: Boolean,
        default: function() {
            // Admin role gets this by default
            return this.role === 'admin';
        }
    },
    resetPasswordToken:   { type: String,  default: null },
    resetPasswordExpires: { type: Date,    default: null },
    taxInfo: {
        legalName:    { type: String, default: '' },
        tinEncrypted: { type: String, default: '' },
        tinLast4:     { type: String, default: '' },
        tinType:      { type: String, enum: ['SSN', 'EIN', ''], default: '' },
        address: {
            line1: { type: String, default: '' },
            line2: { type: String, default: '' },
            city:  { type: String, default: '' },
            state: { type: String, default: '' },
            zip:   { type: String, default: '' },
            country: { type: String, default: 'US' },
        },
        w9SubmittedAt: { type: Date, default: null },
    },
}, { timestamps: true, strict: false });

export default mongoose.model('User', UserSchema);
