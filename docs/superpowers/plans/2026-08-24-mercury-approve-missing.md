# Mercury Approve-Missing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user turn a "missing" Mercury bank row directly into a posted ledger expense with one click, using Mercury's own per-transaction category to suggest the Schedule C tax category automatically.

**Architecture:** Extend `MercuryTransaction` with three fields captured from Mercury's real API response (`categoryData.name`, `kind`, `counterpartyNickname`). Add a category-name-to-tax-category mapping table with a safe fallback. Extend `POST /sync` to attach a suggested tax category and the source transaction id onto each synced row before it reaches the existing (unmodified) `reconcileRows()` — those extra fields flow through untouched into `missing[i].bankRow`. Add `POST /approve`, which creates a `Transaction` document; the app's existing `Transaction.post('save')` hook (`server/models/Transaction.js:46`) already posts the ledger entry automatically — no new posting logic is needed. The frontend shows the suggested category and an "Aprobar" button per Mercury-sourced missing row.

**Tech Stack:** Express 4, Mongoose 8, React 18 + TypeScript, `node:test` + `supertest` + `mongodb-memory-server`.

**Spec:** `docs/superpowers/specs/2026-08-24-mercury-approve-missing-design.md`

## Global Constraints

- `MERCURY_CATEGORY_TO_TAX_CATEGORY` must fall back to `'Other Expenses'` for any name it doesn't recognize — `categoryData.name` is a free-text, per-account label in Mercury, not a fixed enum, and new/renamed categories are expected.
- `POST /approve` must be idempotent: approving the same `mercuryTransactionId` twice must never create two `Transaction`/`JournalEntry` records. Achieved via a deterministic `Transaction.id` (`mercury_${mercuryTransactionId}`) plus Mongoose's existing unique index on `Transaction.id`; a duplicate-key error (`err.code === 11000`) on the second attempt is treated as a `200` success, not an error.
- `reconcileRows()` itself is not modified in this plan — it already passes the full `row` object through untouched into `bankRow`, so extra fields added to the `rows` array built in `POST /sync` survive automatically. Do not add any key-filtering logic to `reconcileRows`.
- The CSV path (`POST /`) is not modified and must continue producing `missing` rows with no `mercuryTransactionId`/`mercurySuggestedTaxCategory` fields, exactly as it does today (`parseCsv`'s rows never carry those fields, so this is automatic — no explicit exclusion code is needed, but tests must confirm it).
- All new/modified routes stay under the existing `/api/mercury-import` mount and inherit `requireAuth` — no additional permission gate.
- Run `pnpm test` after every task; all pre-existing tests must stay green throughout.

---

### Task 1: Mercury category mapping table

**Files:**
- Create: `server/seed/mercuryCategoryMap.js`
- Test: `tests/ledger/mercuryCategoryMap.test.ts`

**Interfaces:**
- Produces: `export const MERCURY_CATEGORY_TO_TAX_CATEGORY` (plain object, string keys/values) and `export function suggestTaxCategory(mercuryCategoryName)` — returns the mapped `TaxCategory` string, or `'Other Expenses'` if `mercuryCategoryName` is `null`/`undefined`/not a recognized key.

- [ ] **Step 1: Write the failing test**

Create `tests/ledger/mercuryCategoryMap.test.ts`:

```typescript
// tests/ledger/mercuryCategoryMap.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { suggestTaxCategory, MERCURY_CATEGORY_TO_TAX_CATEGORY } from '../../server/seed/mercuryCategoryMap.js';

describe('suggestTaxCategory', () => {
  it('maps a known Mercury category name to the correct tax category', () => {
    assert.equal(suggestTaxCategory('Payroll'), 'Contract Labor');
    assert.equal(suggestTaxCategory('Legal & Professional Services'), 'Legal & Professional Services');
    assert.equal(suggestTaxCategory('Travel & Transportation'), 'Travel');
  });

  it('falls back to Other Expenses for an unrecognized name', () => {
    assert.equal(suggestTaxCategory('Some Brand New Category Mercury Just Added'), 'Other Expenses');
  });

  it('falls back to Other Expenses for null or undefined', () => {
    assert.equal(suggestTaxCategory(null), 'Other Expenses');
    assert.equal(suggestTaxCategory(undefined), 'Other Expenses');
  });

  it('every value in the map is a real TaxCategory the UI already knows about', () => {
    const KNOWN_TAX_CATEGORIES = [
      'Advertising', 'Contract Labor', 'Office Expense', 'Insurance',
      'Legal & Professional Services', 'Rent', 'Supplies', 'Taxes & Licenses',
      'Travel', 'Meals', 'Utilities', 'Other Expenses',
    ];
    for (const taxCategory of Object.values(MERCURY_CATEGORY_TO_TAX_CATEGORY)) {
      assert.ok(KNOWN_TAX_CATEGORIES.includes(taxCategory), `${taxCategory} is not a known TaxCategory`);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../../server/seed/mercuryCategoryMap.js'`

- [ ] **Step 3: Implement the mapping**

Create `server/seed/mercuryCategoryMap.js`:

```js
// Mercury's categoryData.name is a free-text, per-account label the user
// assigns/edits from Mercury's own dashboard — not a fixed enum (verified
// against a real production API response: mercuryCategory, the documented
// fixed enum, came back null; categoryData.name carried the real value,
// e.g. "Payroll"). This map is a best-effort suggestion; unknown names
// fall back to 'Other Expenses' rather than throwing, since new or
// user-renamed categories are expected to appear over time.
export const MERCURY_CATEGORY_TO_TAX_CATEGORY = {
  'Payroll': 'Contract Labor',
  'Bank Fees': 'Other Expenses',
  'Payment Processing Fees': 'Other Expenses',
  'Travel & Transportation': 'Travel',
  'Rent & Utilities': 'Rent',
  'Office Supplies & Equipment': 'Supplies',
  'Legal & Professional Services': 'Legal & Professional Services',
  'Revenue': 'Other Expenses',
};

export function suggestTaxCategory(mercuryCategoryName) {
  return MERCURY_CATEGORY_TO_TAX_CATEGORY[mercuryCategoryName] || 'Other Expenses';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — all 4 new tests green, everything else still green.

- [ ] **Step 5: Commit**

```bash
git add server/seed/mercuryCategoryMap.js tests/ledger/mercuryCategoryMap.test.ts
git commit -m "feat: add Mercury category name to Schedule C tax category mapping"
```

---

### Task 2: Extend MercuryTransaction with category/kind/nickname fields

**Files:**
- Modify: `server/models/MercuryTransaction.js`
- Modify: `tests/ledger/mercuryTransaction.test.ts`

**Interfaces:**
- Produces: `MercuryTransaction` schema gains three new optional String fields: `mercuryCategoryName`, `kind`, `counterpartyNickname`. No index changes — the existing unique compound index on `{mercuryAccountId, mercuryTransactionId}` is untouched.

- [ ] **Step 1: Write the failing test**

In `tests/ledger/mercuryTransaction.test.ts`, extend the existing "creates a transaction document with the expected fields" test (the first `it(...)` inside `describe('MercuryTransaction', ...)`) to also pass and assert the three new fields. Replace that test with:

```typescript
  it('creates a transaction document with the expected fields', async () => {
    const doc = await MercuryTransaction.create({
      mercuryAccountId: 'acc_1',
      mercuryTransactionId: 'tx_1',
      amount: -42.5,
      status: 'sent',
      postedAt: new Date('2026-07-01'),
      description: 'AWS Hosting',
      counterpartyName: 'Amazon Web Services',
      mercuryCategoryName: 'Office Supplies & Equipment',
      kind: 'outgoingPayment',
      counterpartyNickname: 'AWS',
    });
    assert.equal(doc.mercuryAccountId, 'acc_1');
    assert.equal(doc.amount, -42.5);
    assert.equal(doc.mercuryCategoryName, 'Office Supplies & Equipment');
    assert.equal(doc.kind, 'outgoingPayment');
    assert.equal(doc.counterpartyNickname, 'AWS');
  });
```

Leave the other two tests in that file (idempotent upsert, unique-index rejection) unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — the new assertions on `doc.mercuryCategoryName`/`doc.kind`/`doc.counterpartyNickname` fail (Mongoose silently drops fields not declared on the schema, so they'd be `undefined`).

- [ ] **Step 3: Extend the schema**

In `server/models/MercuryTransaction.js`, add the three fields to the schema (after the existing `counterpartyName: String,` line):

```js
  counterpartyName: String,
  mercuryCategoryName: String,
  kind: String,
  counterpartyNickname: String,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/models/MercuryTransaction.js tests/ledger/mercuryTransaction.test.ts
git commit -m "feat: capture Mercury category, kind, and counterparty nickname on sync"
```

---

### Task 3: Wire the mapping into POST /sync and add POST /approve

**Files:**
- Modify: `server/routes/mercuryReconciliation.js`
- Modify: `tests/ledger/mercuryReconciliation.test.ts`

**Interfaces:**
- Consumes: `suggestTaxCategory` from `../seed/mercuryCategoryMap.js` (Task 1); the three new `MercuryTransaction` fields (Task 2); `Transaction` model (`../models/Transaction.js`, already exists in this codebase, exports a default Mongoose model with fields `id`, `title`, `amount`, `amountUSD`, `currency`, `exchangeRateToUSD`, `date`, `dateObj`, `type`, `category`, `taxCategory`, `description` — see `server/models/Transaction.js`).
- Produces: `POST /sync`'s `missing` rows in the response now carry `bankRow.mercuryTransactionId` and `bankRow.mercurySuggestedTaxCategory` for Mercury-sourced rows (CSV-sourced rows via `POST /` are unaffected — no code change needed there since `parseCsv`'s rows never have these fields). New `POST /approve` route, `{mercuryTransactionId: string}` in body → `201 {id, taxCategory}` on first approval, `200 {id, taxCategory, alreadyApproved: true}` on a repeat approval of the same transaction, `400` if `mercuryTransactionId` is missing/not a string, `404` if no matching `MercuryTransaction` exists.

- [ ] **Step 1: Write the failing tests**

In `tests/ledger/mercuryReconciliation.test.ts`, add this import at the top alongside the existing ones:

```typescript
import Transaction from '../../server/models/Transaction.js';
```

Then append these new tests at the end of the file (as new top-level `describe` blocks):

```typescript
describe('POST /api/mercury-import/sync — category suggestion on missing rows', () => {
  it('attaches mercuryTransactionId and mercurySuggestedTaxCategory to a missing row from a sync', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        { id: 'tx_1', amount: -1000, status: 'sent', postedAt: '2026-07-01', description: 'Payroll run', counterpartyNickname: 'Andres', categoryData: { name: 'Payroll' } },
      ],
    }));

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    assert.equal(res.status, 200);
    assert.equal(res.body.missing.length, 1);
    assert.equal(res.body.missing[0].bankRow.mercuryTransactionId, 'tx_1');
    assert.equal(res.body.missing[0].bankRow.mercurySuggestedTaxCategory, 'Contract Labor');
  });

  it('falls back to Other Expenses when categoryData is absent', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        { id: 'tx_2', amount: -50, status: 'sent', postedAt: '2026-07-01', description: 'Unknown charge' },
      ],
    }));

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    assert.equal(res.body.missing[0].bankRow.mercurySuggestedTaxCategory, 'Other Expenses');
  });

  it('persists mercuryCategoryName, kind, and counterpartyNickname on the stored MercuryTransaction', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        { id: 'tx_3', amount: -20, status: 'sent', postedAt: '2026-07-01', description: 'Fee', kind: 'creditCardTransaction', counterpartyNickname: 'Vendor X', categoryData: { name: 'Bank Fees' } },
      ],
    }));

    await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    const stored = await MercuryTransaction.findOne({ mercuryTransactionId: 'tx_3' }).lean();
    assert.equal(stored?.mercuryCategoryName, 'Bank Fees');
    assert.equal(stored?.kind, 'creditCardTransaction');
    assert.equal(stored?.counterpartyNickname, 'Vendor X');
  });

  it('does not attach mercuryTransactionId to a missing row from the CSV path', async () => {
    const csv = 'Date,Description,Amount\n2026-07-01,Unrecorded Fee,-25.00\n';
    const res = await request(app).post('/api/mercury-import').send({ csv });
    assert.equal(res.body.missing.length, 1);
    assert.equal(res.body.missing[0].bankRow.mercuryTransactionId, undefined);
    assert.equal(res.body.missing[0].bankRow.mercurySuggestedTaxCategory, undefined);
  });
});

describe('POST /api/mercury-import/approve', () => {
  it('rejects a request with no mercuryTransactionId', async () => {
    const res = await request(app).post('/api/mercury-import/approve').send({});
    assert.equal(res.status, 400);
  });

  it('returns 404 for an unknown mercuryTransactionId', async () => {
    const res = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'does-not-exist' });
    assert.equal(res.status, 404);
  });

  it('creates a Transaction and posts a JournalEntry for a valid mercuryTransactionId', async () => {
    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_approve_1',
      amount: -75.5, status: 'sent', postedAt: new Date('2026-07-05'),
      description: 'Zoom subscription', mercuryCategoryName: 'Office Supplies & Equipment',
    });

    const res = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_approve_1' });

    assert.equal(res.status, 201);
    assert.equal(res.body.taxCategory, 'Supplies');

    const tx = await Transaction.findOne({ id: 'mercury_tx_approve_1' }).lean();
    assert.ok(tx);
    assert.equal(tx?.amount, 75.5);
    assert.equal(tx?.taxCategory, 'Supplies');
    assert.equal(tx?.type, 'expense');

    const entry = await JournalEntry.findOne({ source: 'expense', sourceId: 'mercury_tx_approve_1' }).lean();
    assert.ok(entry, 'expected a JournalEntry to have been posted automatically');
  });

  it('approving the same mercuryTransactionId twice is an idempotent no-op, not a duplicate', async () => {
    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_approve_2',
      amount: -10, status: 'sent', postedAt: new Date('2026-07-05'),
      description: 'Coffee', mercuryCategoryName: 'Other',
    });

    const first = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_approve_2' });
    const second = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_approve_2' });

    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.alreadyApproved, true);

    const count = await Transaction.countDocuments({ id: 'mercury_tx_approve_2' });
    assert.equal(count, 1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `missing[0].bankRow.mercurySuggestedTaxCategory` is `undefined` in the sync tests (feature not yet wired), and `POST /approve` returns 404 (route doesn't exist) for all `approve` tests.

- [ ] **Step 3: Implement**

In `server/routes/mercuryReconciliation.js`, add these imports at the top, alongside the existing ones:

```js
import Transaction from '../models/Transaction.js';
import { suggestTaxCategory } from '../seed/mercuryCategoryMap.js';
```

In the `POST /sync` handler (inside `createMercuryReconciliationRouter`), extend the `MercuryTransaction.updateOne` call's `$set` object to include the three new fields, and extend the `rows` mapping to attach the suggestion fields:

```js
            await Promise.all(transactions.map(t => MercuryTransaction.updateOne(
                { mercuryAccountId: accountId, mercuryTransactionId: t.id },
                { $set: {
                    mercuryAccountId: accountId,
                    mercuryTransactionId: t.id,
                    amount: t.amount,
                    status: t.status,
                    postedAt: t.postedAt,
                    description: t.description,
                    counterpartyName: t.counterpartyName,
                    mercuryCategoryName: t.categoryData?.name ?? null,
                    kind: t.kind,
                    counterpartyNickname: t.counterpartyNickname,
                } },
                { upsert: true }
            )));

            const rows = transactions.map(t => ({
                Date: t.postedAt ?? t.createdAt,
                Description: t.description ?? '',
                Amount: String(t.amount),
                mercuryTransactionId: t.id,
                mercurySuggestedTaxCategory: suggestTaxCategory(t.categoryData?.name),
            }));
```

(Only the `$set` object and the `rows` mapping change — the rest of the `POST /sync` handler, and every other route in the file, stays exactly as it is today.)

Add the new `POST /approve` route inside `createMercuryReconciliationRouter`, after the existing `POST /sync` route and before `return scopedRouter;`:

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
            const transactionId = `mercury_${mercuryTransactionId}`;
            const postedAt = mtx.postedAt || new Date();

            try {
                await Transaction.create({
                    id: transactionId,
                    title: mtx.description || mtx.counterpartyNickname || 'Mercury transaction',
                    amount,
                    amountUSD: amount,
                    currency: 'USD',
                    exchangeRateToUSD: 1,
                    date: new Date(postedAt).toISOString().split('T')[0],
                    dateObj: postedAt,
                    type: 'expense',
                    category: 'other',
                    taxCategory,
                    description: mtx.description || '',
                });
                res.status(201).json({ id: transactionId, taxCategory });
            } catch (err) {
                if (err.code === 11000) {
                    return res.status(200).json({ id: transactionId, taxCategory, alreadyApproved: true });
                }
                throw err;
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all new tests green, all pre-existing tests in the file still green.

- [ ] **Step 5: Commit**

```bash
git add server/routes/mercuryReconciliation.js tests/ledger/mercuryReconciliation.test.ts
git commit -m "feat: suggest tax category on missing Mercury rows and add one-click approve"
```

---

### Task 4: Frontend — suggested category and "Aprobar" button

**Files:**
- Modify: `components/ledger/ReconciliationTab.tsx`

**Interfaces:**
- Consumes: `POST /api/mercury-import/approve` with `{mercuryTransactionId}` → `{id, taxCategory}` or `{id, taxCategory, alreadyApproved: true}`.

No new automated test — consistent with this file's precedent (Task 5 of the original plan shipped with no new test file; UI is verified manually/visually). The backend it calls is covered by Task 3's tests.

- [ ] **Step 1: Extend the ImportResult type**

In `components/ledger/ReconciliationTab.tsx`, change the `missing` field of the `ImportResult` type from:

```typescript
  missing: { bankRow: Record<string, string> }[];
```

to:

```typescript
  missing: { bankRow: Record<string, string> & { mercuryTransactionId?: string; mercurySuggestedTaxCategory?: string } }[];
```

- [ ] **Step 2: Add an approve handler**

After the existing `confirmMatch` function, add:

```typescript
  const approveMissing = async (mercuryTransactionId: string) => {
    setError('');
    const res = await apiFetch('/api/mercury-import/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mercuryTransactionId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Error desconocido' }));
      setError(body.error || 'No se pudo aprobar el gasto.');
      return;
    }
    setResult(r => r ? {
      ...r,
      missing: r.missing.filter(m => m.bankRow.mercuryTransactionId !== mercuryTransactionId),
    } : r);
  };
```

- [ ] **Step 3: Render the suggested category and Aprobar button**

Replace the "Faltantes en el libro" section's row-rendering block:

```tsx
            {result.missing.map((m, i) => (
              <div key={i} className="text-sm border-b border-gray-100 py-2">
                {m.bankRow.Date} — {m.bankRow.Description} — ${m.bankRow.Amount}
              </div>
            ))}
```

with:

```tsx
            {result.missing.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-gray-100 py-2 gap-3">
                <div className="min-w-0">
                  <div>{m.bankRow.Date} — {m.bankRow.Description} — ${m.bankRow.Amount}</div>
                  {m.bankRow.mercurySuggestedTaxCategory && (
                    <div className="text-[11px] text-gray-400">Categoría sugerida: {m.bankRow.mercurySuggestedTaxCategory}</div>
                  )}
                </div>
                {m.bankRow.mercuryTransactionId && (
                  <button
                    onClick={() => approveMissing(m.bankRow.mercuryTransactionId!)}
                    className="text-purple-700 text-xs whitespace-nowrap flex-shrink-0"
                  >
                    Aprobar
                  </button>
                )}
              </div>
            ))}
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors introduced by this file.

- [ ] **Step 5: Commit**

```bash
git add components/ledger/ReconciliationTab.tsx
git commit -m "feat: one-click approve for Mercury missing rows with suggested tax category"
```
