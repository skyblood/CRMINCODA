# Mercury "Faltantes" One-Click Approve — Design

## Problem

The Mercury reconciliation UI's "Faltantes en el libro" section lists bank
transactions that have no corresponding ledger entry. Today the only
guidance is a hint to go create the expense manually in another tab,
re-typing date/amount/description and guessing a Schedule C tax category
from scratch. This is tedious for a real sync, which can easily surface
15-20 missing rows in a normal month.

Mercury already attaches its own category to most transactions
(`categoryData.name`, e.g. "Payroll", "Bank Fees", "Travel &
Transportation") — verified against the real production API response for
this account (see below). That signal can drive an automatic Schedule C
category suggestion, so a human only has to click "Aprobar" per row
instead of filling out a form.

## Verified ground truth

A live call to `GET /account/{accountId}/transactions` against this
account's real Mercury data returned (relevant fields only):

```json
{
  "mercuryCategory": null,
  "categoryData": { "id": "98b84212-...", "name": "Payroll", "visibleForReimbursements": true, ... },
  "kind": "outgoingPayment",
  "bankDescription": "Send Money transaction initiated on Mercury",
  "counterpartyNickname": "Andres Incoda",
  "generalLedgerCodeName": null
}
```

Two things this corrects versus the Mercury API docs (`docs.mercury.com`):
- `mercuryCategory` (the documented fixed enum: `Advertising`, `Airlines`,
  `AlcoholAndBars`, ...) is **null** on real transactions for this
  account — not the useful signal.
- The real signal is `categoryData.name` — a **free-text, account-specific
  string** the user assigns/edits from Mercury's own dashboard (confirmed
  visually: the dashboard's Category column shows an editable dropdown,
  e.g. "Payroll", "Bank Fees", "Travel & Transportation", "Rent &
  Utilities", "Office Supplies & Equipment", "Legal & Professional
  Services", "Payment Processing Fees", "Revenue"). Because it's
  account-specific rather than a fixed enum, any mapping to our Schedule C
  categories must tolerate unknown values with a safe fallback, not assume
  a closed set.

## Goals

- Capture `categoryData.name`, `kind`, and `counterpartyNickname` on
  `MercuryTransaction` during sync.
- Map Mercury's category name to one of our existing `TaxCategory` values
  via a small config table, falling back to `'Other Expenses'` for any
  name we don't recognize.
- Attach the suggested category (and the source `mercuryTransactionId`) to
  each "missing" row's `bankRow`, for Mercury-sync-sourced rows only — CSV
  path rows carry no such fields and get no "Aprobar" button, unchanged
  behavior there.
- One `POST /api/mercury-import/approve` endpoint that creates a
  `Transaction` (`type: 'expense'`) from a `MercuryTransaction`, using the
  existing automatic ledger-posting mechanism — no new posting logic.
- The UI shows the suggested category and an "Aprobar" button per
  Mercury-sourced missing row; approving removes it from the missing list
  immediately (same optimistic-update pattern the existing "Confirmar
  match" button already uses).

## Non-goals

- No inline category editing before approval in this iteration — the
  suggested category is used as-is. (If the mapping is wrong for a given
  row, the user can still create/correct the expense manually via Gastos
  de la Empresa, same as today.)
- No bulk "approve all" action.
- No changes to the CSV upload path's behavior.
- No retroactive re-categorization of already-posted transactions.

## Architecture

### Idempotency

`Transaction.id` is `unique: true`. The approve endpoint uses a
deterministic id, `mercury_${mercuryTransactionId}`, so a duplicate
approve call (double-click, or the same row surviving across two syncs
before being approved) hits Mongo's unique-index rejection instead of
creating a second expense. The endpoint treats that specific failure as
an idempotent success (200, not an error) rather than surfacing a
confusing duplicate-key message to the user.

Once approved, the resulting `JournalEntry` (posted automatically via the
existing `Transaction.post('save')` hook → `postExpense()`) has the same
date and amount as the original bank row. On the *next* sync, the
existing exact-match pass in `reconcileRows` naturally matches it —
`MercuryTransaction` itself needs no "approved" flag; the ledger entry's
existence is the source of truth.

### `server/seed/mercuryCategoryMap.js` (new)

```js
// Mercury's categoryData.name is a free-text, per-account label the user
// assigns/edits in Mercury's own dashboard — not a fixed enum (see design
// doc). This map is a best-effort suggestion; unknown names fall back to
// 'Other Expenses' rather than throwing, since new/renamed categories are
// expected to appear over time.
export const MERCURY_CATEGORY_TO_TAX_CATEGORY = {
  'Payroll': 'Contract Labor',
  'Bank Fees': 'Other Expenses',
  'Payment Processing Fees': 'Other Expenses',
  'Travel & Transportation': 'Travel',
  'Rent & Utilities': 'Rent',
  'Office Supplies & Equipment': 'Supplies',
  'Legal & Professional Services': 'Legal & Professional Services',
  'Revenue': 'Other Expenses', // incoming money should never reach "missing" as an expense; defensive fallback only
};

export function suggestTaxCategory(mercuryCategoryName) {
  return MERCURY_CATEGORY_TO_TAX_CATEGORY[mercuryCategoryName] || 'Other Expenses';
}
```

### `server/models/MercuryTransaction.js` (extend)

Add three optional fields: `mercuryCategoryName: String`, `kind: String`,
`counterpartyNickname: String`.

### `server/routes/mercuryReconciliation.js` (extend `POST /sync`)

The `$set` in the upsert loop gains the three new fields, read from the
raw Mercury transaction object (`t.categoryData?.name ?? null`, `t.kind`,
`t.counterpartyNickname`).

The `rows` array built for `reconcileRows` gains two extra properties per
row (on top of the existing `Date`/`Description`/`Amount`):
`mercuryTransactionId: t.id` and
`mercurySuggestedTaxCategory: suggestTaxCategory(t.categoryData?.name)`.
`reconcileRows` never filters the row object's keys — it reads
`row.Date`/`row.Amount` and otherwise passes `row` through untouched as
`bankRow` — so these extra fields survive into `missing[i].bankRow`
automatically, with zero changes needed inside `reconcileRows` itself.
The CSV path's rows (from `parseCsv`) never carry these fields, so
CSV-sourced missing rows have `bankRow.mercuryTransactionId === undefined`
— the frontend uses exactly that to decide whether to show "Aprobar".

New route:

```js
scopedRouter.post('/approve', async (req, res) => {
  try {
    const { mercuryTransactionId } = req.body;
    if (typeof mercuryTransactionId !== 'string' || !mercuryTransactionId) {
      return res.status(400).json({ error: 'mercuryTransactionId is required' });
    }
    const mtx = await MercuryTransaction.findOne({ mercuryTransactionId }).lean();
    if (!mtx) return res.status(404).json({ error: 'Mercury transaction not found' });

    const taxCategory = suggestTaxCategory(mtx.mercuryCategoryName);
    const amount = Math.abs(mtx.amount);
    try {
      const doc = await Transaction.create({
        id: `mercury_${mercuryTransactionId}`,
        title: mtx.description || mtx.counterpartyNickname || 'Mercury transaction',
        amount,
        amountUSD: amount,
        currency: 'USD',
        exchangeRateToUSD: 1,
        date: (mtx.postedAt || new Date()).toISOString().split('T')[0],
        dateObj: mtx.postedAt || new Date(),
        type: 'expense',
        category: 'other',
        taxCategory,
        description: mtx.description || '',
      });
      res.status(201).json({ id: doc.id, taxCategory });
    } catch (err) {
      if (err.code === 11000) {
        // Already approved (duplicate id) — idempotent success, not an error.
        return res.status(200).json({ id: `mercury_${mercuryTransactionId}`, taxCategory, alreadyApproved: true });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

### `components/ledger/ReconciliationTab.tsx` (extend)

The `ImportResult` type's `missing` entries gain optional
`bankRow.mercuryTransactionId?: string` and
`bankRow.mercurySuggestedTaxCategory?: string`. In the "Faltantes"
section's render loop, when `m.bankRow.mercuryTransactionId` is present,
show the suggested category next to the row and an "Aprobar" button that
calls `POST /api/mercury-import/approve`, then removes that row from
`result.missing` on success (same `setResult(r => r ? {...} : r)` pattern
`confirmMatch` already uses).

## Testing

- `tests/ledger/mercuryCategoryMap.test.ts` — known-name mapping, unknown
  name falls back to `'Other Expenses'`.
- `tests/ledger/mercuryTransaction.test.ts` — extend the existing create
  test to cover the three new fields.
- `tests/ledger/mercuryReconciliation.test.ts` — extend `POST /sync`
  tests: a synced transaction's `missing` entry carries
  `mercuryTransactionId` and the correctly-mapped
  `mercurySuggestedTaxCategory`; a CSV-path `missing` entry has neither
  field. New `POST /approve` tests: creates a `Transaction` and posts a
  `JournalEntry` (verify via a real DB read, not a mock) for a valid
  `mercuryTransactionId`; 404 for an unknown one; a second approve call
  for the same id is a 200 idempotent no-op, not a duplicate `Transaction`
  or `JournalEntry`.

## Security

`POST /approve` inherits the same `requireAuth` boundary as the rest of
`/api/mercury-import`. `mercuryTransactionId` is looked up via
`findOne` (not interpolated into any external URL or shell command), so
it carries no injection risk beyond standard Mongoose query safety — no
new validation regex is needed here (contrast with `accountId` in
`POST /sync`, which does reach an external URL and is validated
accordingly).
