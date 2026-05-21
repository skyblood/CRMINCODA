import mongoose from 'mongoose';

// Singleton settings document — always upserted with id: 'global'
const settingsSchema = new mongoose.Schema({
  id: { type: String, default: 'global' },
  // Email notification toggles
  emailLeadWon: { type: Boolean, default: true },
  // Invoice engine
  invoiceCounterPrefix: { type: String, default: 'BMI' },
  invoiceCounterNextNumber: { type: Number, default: 1 },
  invoiceDefaultDueDays: { type: Number, default: 30 },
  invoiceDefaultTaxRate: { type: Number, default: 0 },
  // Collection alerts
  collectionAlertThresholdUSD: { type: Number, default: 5000 },
  // Scheduler
  lastSchedulerRun: Date,
  schedulerEnabled: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('Settings', settingsSchema);
