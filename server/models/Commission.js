import mongoose from 'mongoose';

const CommissionSchema = new mongoose.Schema({
  projectId: { type: String, required: true },
  projectName: { type: String, required: true },
  clientId: { type: String, index: true },
  clientName: String,

  // The rate snapshot at commission creation time
  rate: { type: Number, required: true, min: 0, max: 100 },

  // Base amounts (USD)
  revenueUSD: { type: Number, required: true },
  costUSD: { type: Number, required: true },
  netUtilityUSD: { type: Number, required: true },

  // Calculated commission
  amountUSD: { type: Number, required: true },

  // Split breakdown (snapshot — persisted so historical records don't shift)
  split: {
    bmRetainedUSD: { type: Number, default: 0 },
    fabianShareUSD: { type: Number, default: 0 },
    spencerShareUSD: { type: Number, default: 0 },
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'partially_paid', 'paid', 'cancelled'],
    default: 'pending',
    index: true,
  },

  // Payment tracking
  paidAmountUSD: { type: Number, default: 0 },
  paymentRefs: [{
    transactionId: String,
    amount: Number,
    date: Date,
    reference: String,
  }],

  // Audit
  approvedBy: String,
  approvedAt: Date,
  notes: String,

  // Migration flag
  legacy_migration: { type: Boolean, default: false },
}, { timestamps: true, strict: true });

// One commission per project (for now — can be extended to per-consultant later)
CommissionSchema.index({ projectId: 1 }, { unique: true });
CommissionSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Commission', CommissionSchema);
