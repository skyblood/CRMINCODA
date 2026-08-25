import mongoose from 'mongoose';

const MercuryTransactionSchema = new mongoose.Schema({
  mercuryAccountId: { type: String, required: true },
  mercuryTransactionId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: String,
  postedAt: Date,
  // Mercury's own createdAt for this transaction — persisted so POST /approve
  // has the same fallback date available that the transient `rows` mapping in
  // POST /sync already uses (Date: t.postedAt ?? t.createdAt). Without this,
  // a still-pending transaction (postedAt: null) read back later by /approve
  // would fall through to `new Date()` instead, misdating the ledger entry
  // and permanently stranding the row (see Finding 2 of the final review).
  mercuryCreatedAt: Date,
  description: String,
  counterpartyName: String,
  mercuryCategoryName: String,
  kind: String,
  counterpartyNickname: String,
}, { timestamps: true });

MercuryTransactionSchema.index(
  { mercuryAccountId: 1, mercuryTransactionId: 1 },
  { unique: true }
);

export default mongoose.model('MercuryTransaction', MercuryTransactionSchema);
