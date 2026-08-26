import mongoose from 'mongoose';

const JournalLineSchema = new mongoose.Schema({
    accountId:          { type: String, required: true },
    debit:              { type: Number, default: 0, min: 0 },  // native currency
    credit:             { type: Number, default: 0, min: 0 },  // native currency
    memo:               { type: String, default: '' },
    entityId:           { type: String, default: '' },         // consultantId / clientId, for 1099 & AR aggregation
    currency:           { type: String, default: 'USD' },
    exchangeRateToUSD:  { type: Number, default: 1 },
    amountUSD:          { type: Number, required: true },       // USD value of whichever of debit/credit is set
    reconciled:         { type: Boolean, default: false },      // set by Mercury reconciliation (Task 9)
}, { _id: false });

function validateLines(lines) {
    if (!lines || lines.length < 2) return false;
    for (const l of lines) {
        const hasDebit = l.debit > 0;
        const hasCredit = l.credit > 0;
        if (hasDebit === hasCredit) return false; // exactly one must be set
    }
    const debitUSD = lines.reduce((sum, l) => sum + (l.debit > 0 ? l.amountUSD : 0), 0);
    const creditUSD = lines.reduce((sum, l) => sum + (l.credit > 0 ? l.amountUSD : 0), 0);
    return Math.abs(debitUSD - creditUSD) < 0.01;
}

const JournalEntrySchema = new mongoose.Schema({
    date:     { type: Date, required: true, default: Date.now },
    memo:     { type: String, default: '' },
    source:   {
        type: String,
        required: true,
        enum: ['manual', 'expense', 'payment', 'payroll', 'commission', 'import', 'opening_balance'],
    },
    sourceId: { type: String, default: '' },
    lines: {
        type: [JournalLineSchema],
        required: true,
        validate: {
            validator: validateLines,
            message: 'Journal entry needs 2+ lines, each with exactly one of debit/credit set, and debit-USD must equal credit-USD',
        },
    },
    status: { type: String, enum: ['posted', 'void'], default: 'posted' },
}, { timestamps: true, strict: true });

JournalEntrySchema.index({ date: -1 });
// Unique (not just indexed) among posted entries with a real sourceId: closes
// a check-then-act race in ledgerPostingService's alreadyPosted() guard,
// where two concurrent postX() calls for the same source+sourceId can both
// see "not yet posted" and both proceed to create() — see
// ledgerPostingService.js's createJournalEntryIdempotent(). Void entries are
// excluded so re-approving after an /unapprove (same sourceId, new entry)
// isn't blocked by the old voided one; sourceId:'' is excluded so manual/
// opening_balance entries (which don't use sourceId) never collide.
// MongoDB partial indexes only support a small operator subset ($eq, $gt,
// $gte, $lt, $lte, $exists, $type — not $ne), so "sourceId is a real,
// non-empty value" is expressed as $gt: '' rather than $ne: ''.
JournalEntrySchema.index(
    { source: 1, sourceId: 1 },
    { unique: true, partialFilterExpression: { status: 'posted', sourceId: { $gt: '' } } }
);
JournalEntrySchema.index({ 'lines.accountId': 1 });

export default mongoose.model('JournalEntry', JournalEntrySchema);
