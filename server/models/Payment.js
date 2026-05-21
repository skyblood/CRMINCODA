import mongoose from 'mongoose';

const ISO_4217_CODES = [
  'USD', 'COP', 'EUR', 'GBP', 'BRL', 'MXN', 'CAD', 'AUD', 'CHF', 'JPY',
  'CNY', 'ARS', 'CLP', 'PEN', 'UYU', 'BOB', 'PYG', 'VES', 'CRC', 'DOP',
  'GTQ', 'HNL', 'NIO', 'PAB', 'SGD', 'HKD', 'KRW', 'INR', 'ZAR', 'SEK',
  'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'ILS', 'TRY', 'AED', 'SAR', 'NZD',
];

const AllocationSchema = new mongoose.Schema({
  invoiceId: { type: String, required: true },
  amountApplied: { type: Number, required: true, min: 0 },
  amountAppliedUSD: { type: Number, required: true },
}, { _id: false });

const PaymentSchema = new mongoose.Schema({
  clientId: { type: String, required: true, index: true },
  clientName: String,

  // Payment details
  paymentDate: { type: Date, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: {
    type: String,
    required: true,
    default: 'USD',
    validate: {
      validator: v => ISO_4217_CODES.includes(v),
      message: props => `${props.value} is not a valid ISO 4217 currency code`,
    },
  },

  // Multi-currency
  amountUSD: { type: Number, required: true },
  exchangeRateToUSD: { type: Number, default: 1 },
  exchangeRateSource: { type: String, default: 'auto' }, // 'auto' | 'manual' | 'legacy_migration'

  // Method
  method: {
    type: String,
    enum: ['wire_transfer', 'stripe', 'mercury', 'cash', 'check', 'other'],
    default: 'wire_transfer',
  },
  reference: String,

  // Allocation — which invoices this payment covers
  appliedTo: [AllocationSchema],

  // Migration flag
  isLegacyMigration: { type: Boolean, default: false },

  // Audit
  createdBy: String,
  notes: String,
}, { timestamps: true, strict: true });

PaymentSchema.index({ paymentDate: -1 });
PaymentSchema.index({ clientId: 1, paymentDate: -1 });
PaymentSchema.index({ 'appliedTo.invoiceId': 1 });

export default mongoose.model('Payment', PaymentSchema);
