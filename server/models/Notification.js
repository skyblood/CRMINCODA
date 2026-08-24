import mongoose from 'mongoose';
const NotificationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  message: String,
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  relatedModel: String,
  relatedId: String,
  route: String,
  read: { type: Boolean, default: false, index: true },
  readAt: Date,
  dismissed: { type: Boolean, default: false },
  count: { type: Number, default: 1 },
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: { createdAt: false, updatedAt: 'updatedAt' } });
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ readAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60, partialFilterExpression: { read: true } });
export default mongoose.model('Notification', NotificationSchema);
