import mongoose from 'mongoose';

// ISO 4217 currency codes (common ones; String field allows any valid code)
const ISO_4217_CODES = [
  'USD', 'COP', 'EUR', 'GBP', 'BRL', 'MXN', 'CAD', 'AUD', 'CHF', 'JPY',
  'CNY', 'ARS', 'CLP', 'PEN', 'UYU', 'BOB', 'PYG', 'VES', 'CRC', 'DOP',
  'GTQ', 'HNL', 'NIO', 'PAB', 'SGD', 'HKD', 'KRW', 'INR', 'ZAR', 'SEK',
  'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'ILS', 'TRY', 'AED', 'SAR', 'NZD',
];

const LineItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  unitPrice: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true }, // quantity * unitPrice
  skuId: String,
}, { _id: false });

const InvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  clientId: { type: String, required: true, index: true },
  clientName: { type: String, required: true },
  clientEmail: { type: String },
  projectId: { type: String, index: true },
  quoteId: String,

  // Dates
  issueDate: { type: Date },
  dueDate: { type: Date, index: true },

  // Amounts
  subtotal: { type: Number, required: true, min: 0 },
  taxRate: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  total: { type: Number, required: true, min: 0 },
  currency: {
    type: String,
    required: true,
    default: 'USD',
    validate: {
      validator: v => ISO_4217_CODES.includes(v),
      message: props => `${props.value} is not a valid ISO 4217 currency code`,
    },
  },

  // Multi-currency reporting
  totalUSD: { type: Number, required: true },
  exchangeRateToUSD: { type: Number, default: 1 }, // totalUSD = total / exchangeRateToUSD

  // Line items
  lineItems: [LineItemSchema],

  // Status — hybrid model
  // Administrative (set by user): draft, issued, void
  // Financial (set by recalculateInvoiceStatus): partially_paid, paid, overdue
  status: {
    type: String,
    required: true,
    enum: ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void'],
    default: 'draft',
    index: true,
  },

  // Derived payment tracking (updated atomically via $inc)
  paidAmount: { type: Number, default: 0 },
  paidAmountUSD: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },    // total - paidAmount
  balanceUSD: { type: Number, default: 0 },  // totalUSD - paidAmountUSD

  // Metadata
  notes: String,
  internalNotes: String,
  language: { type: String, enum: ['es', 'en'], default: 'es' },

  // Notification control
  lastReminderSentAt: Date,
  reminderCount: { type: Number, default: 0 },
  suppressReminders: { type: Boolean, default: false },

  // Soft delete (draft invoices only)
  deleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: String,

  // Audit
  createdBy: String,
  voidedAt: Date,
  voidedBy: String,
  voidReason: String,
}, { timestamps: true, strict: true });

// Compound indexes for reporting
InvoiceSchema.index({ status: 1, dueDate: 1 });        // AR aging queries
InvoiceSchema.index({ clientId: 1, status: 1 });        // client AR summary
InvoiceSchema.index({ issueDate: 1 });                  // period reports
InvoiceSchema.index({ projectId: 1, status: 1 });       // project financials
InvoiceSchema.index({ deleted: 1, status: 1 });         // filter out soft-deleted

export default mongoose.model('Invoice', InvoiceSchema);
