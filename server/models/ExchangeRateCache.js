import mongoose from 'mongoose';

const ExchangeRateCacheSchema = new mongoose.Schema({
  pair: { type: String, required: true, unique: true }, // e.g. 'COP_USD'
  rate: { type: Number, required: true },
  fetchedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true, strict: true });

// TTL: auto-delete entries older than 7 days (stale cache cleanup)
// Active cache threshold is 24h (checked in exchangeRateService)
ExchangeRateCacheSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default mongoose.model('ExchangeRateCache', ExchangeRateCacheSchema);
