import mongoose from 'mongoose';
const WebhookSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  events: [{ type: String }],
  secret: String,
  headers: { type: Map, of: String, default: {} },
  isActive: { type: Boolean, default: true },
  retryPolicy: {
    maxRetries: { type: Number, default: 3 },
    retryDelayMs: { type: Number, default: 5000 }
  },
  createdBy: String,
  lastTriggeredAt: Date,
  lastStatus: Number,
  failCount: { type: Number, default: 0 },
  autoDisableAfter: { type: Number, default: 10 },
  disabledAt: Date,
  disabledReason: String
}, { timestamps: true });
export default mongoose.model('Webhook', WebhookSchema);
