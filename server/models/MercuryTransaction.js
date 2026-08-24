import mongoose from 'mongoose';

const MercuryTransactionSchema = new mongoose.Schema({
  mercuryAccountId: { type: String, required: true },
  mercuryTransactionId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: String,
  postedAt: Date,
  description: String,
  counterpartyName: String,
}, { timestamps: true });

MercuryTransactionSchema.index(
  { mercuryAccountId: 1, mercuryTransactionId: 1 },
  { unique: true }
);

export default mongoose.model('MercuryTransaction', MercuryTransactionSchema);
