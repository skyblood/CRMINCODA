import mongoose from 'mongoose';
const WebhookLogSchema = new mongoose.Schema({
  webhookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Webhook' },
  webhookName: String,
  event: String,
  url: String,
  requestBody: String,
  responseStatus: Number,
  responseBody: String,
  success: Boolean,
  attempt: { type: Number, default: 1 },
  duration: Number,
  error: String,
  status: { type: String, enum: ['success', 'failed', 'retrying'], default: 'failed' },
  nextRetryAt: { type: Date, default: null },
  retryPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });
WebhookLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
WebhookLogSchema.index({ webhookId: 1, timestamp: -1 });
export default mongoose.model('WebhookLog', WebhookLogSchema);
