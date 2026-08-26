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
  dashboardLink: String,
  // Free-text note the Mercury user attaches per-transaction from Mercury's
  // own dashboard (e.g. "Cena cliente Cartagena") — the most human-authored,
  // meaningful context available on a transaction, when present.
  note: String,
}, { timestamps: true });

MercuryTransactionSchema.index(
  { mercuryAccountId: 1, mercuryTransactionId: 1 },
  { unique: true }
);

// Cache rows expire after ~2 years — this is a reconciliation cache fed
// fresh by every sync, not a system of record (the resulting JournalEntry
// is the permanent record once a row is approved), so nothing depends on
// rows surviving indefinitely.
MercuryTransactionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 730 });

export default mongoose.model('MercuryTransaction', MercuryTransactionSchema);
