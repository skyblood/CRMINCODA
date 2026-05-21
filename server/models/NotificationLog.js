import mongoose from 'mongoose';

const NotificationLogSchema = new mongoose.Schema({
  invoiceId: { type: String, required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: [
      'reminder_before_due',     // 5 days before
      'reminder_due_today',      // day of
      'escalation_7d',           // 7 days overdue
      'escalation_15d',          // 15 days overdue
      'escalation_30d',          // 30 days overdue
      'internal_overdue_alert',  // team notification
      'internal_threshold_alert', // client > X USD overdue
      'internal_payment_received', // payment registered
    ],
  },
  recipientEmail: String,
  recipientUserId: String,
  sentAt: { type: Date, default: Date.now },
  success: { type: Boolean, default: true },
  error: String,
  templateUsed: String,
  invoiceNumber: String,
  clientName: String,
}, { timestamps: true, strict: true });

// Compound unique index for idempotent upserts (CEO finding #9)
NotificationLogSchema.index(
  { invoiceId: 1, type: 1, sentAt: 1 },
  { unique: false }
);
// For idempotency: findOneAndUpdate checks this combo before sending
NotificationLogSchema.index({ invoiceId: 1, type: 1 });
NotificationLogSchema.index({ sentAt: -1 });

export default mongoose.model('NotificationLog', NotificationLogSchema);
