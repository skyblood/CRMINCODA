# Mercury Integration Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the server-side finance-permission gap on Ledger-family routes, and add editable-category approval, bulk approve, dashboardLink surfacing, MercuryTransaction retention, and an optional nightly background sync to the Mercury reconciliation feature.

**Architecture:** A new `requireFinance` middleware (mirroring the existing `requireAdmin`) gates the four Ledger-family route mounts in `server/index.js`. `POST /approve`'s per-item logic is extracted into a shared `approveOne()` helper reused by a new `POST /approve-many`. `mercuryApiClient.js` gains a shared `mapMercuryTransactionToUpsert()` helper used by both `POST /sync` and a new nightly cron job (`server/jobs/mercurySyncScheduler.js`, mirroring the existing `leadEnrichmentScheduler.js` pattern) so the two call sites' upsert shape can't drift apart.

**Tech Stack:** Express 4, Mongoose 8, node-cron, React 18 + TypeScript, `node:test` + `supertest` + `mongodb-memory-server`.

**Spec:** `docs/superpowers/specs/2026-08-25-mercury-integration-hardening-design.md`

## Global Constraints

- `requireFinance` allows `permissions.finance === true` OR `permissions.admin === true` — never checks `role` directly (see spec's Ruling under Goal 1).
- Bulk approve (`POST /approve-many`) is capped at 100 items per call and never wrapped in a Mongo transaction (see spec's Ruling under Goal 4) — a partial-batch failure is a normal, visible-in-the-response outcome, not an error state for the whole request.
- `mapMercuryTransactionToUpsert(accountId, t)` is the single source of truth for the upsert `$set` shape — both `POST /sync` and the nightly scheduler must call it, never duplicate its fields inline.
- The nightly scheduler is inert (no-op, no error) when `MERCURY_API_TOKEN` is unset, matching `leadEnrichmentScheduler.js`'s `ANTHROPIC_API_KEY` gate convention.
- No new frontend automated tests (see spec's Non-goals) — frontend changes are type-checked (`tsc --noEmit`) and left for manual/visual verification, consistent with every prior frontend change on this branch.
- Run `pnpm test` after every task; all pre-existing tests must stay green throughout.

---

### Task 1: requireFinance middleware + enforce on Ledger-family routes

**Files:**
- Modify: `server/middleware/requireAuth.js`
- Modify: `server/index.js`
- Test: `tests/requireFinance.test.ts` (new, top-level — this middleware isn't ledger-specific)

**Interfaces:**
- Produces: `export function requireFinance(req, res, next)` in `requireAuth.js`, alongside the existing `requireAuth`/`requireAdmin` exports.

- [ ] **Step 1: Write the failing test**

Create `tests/requireFinance.test.ts`:

```typescript
// tests/requireFinance.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { requireFinance } from '../server/middleware/requireAuth.js';

function buildApp(sessionUser?: any) {
  const app = express();
  app.use((req: any, _res, next) => { req.session = sessionUser ? { user: sessionUser } : undefined; next(); });
  app.get('/protected', requireFinance, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requireFinance', () => {
  it('returns 401 when there is no session', async () => {
    const res = await request(buildApp(undefined)).get('/protected');
    assert.equal(res.status, 401);
  });

  it('returns 403 for a logged-in user with neither finance nor admin permission', async () => {
    const res = await request(buildApp({ permissions: { finance: false, admin: false } })).get('/protected');
    assert.equal(res.status, 403);
  });

  it('allows a user with permissions.finance === true', async () => {
    const res = await request(buildApp({ permissions: { finance: true } })).get('/protected');
    assert.equal(res.status, 200);
  });

  it('allows a user with permissions.admin === true even without the finance flag', async () => {
    const res = await request(buildApp({ permissions: { admin: true } })).get('/protected');
    assert.equal(res.status, 200);
  });

  it('returns 403 when permissions is entirely missing', async () => {
    const res = await request(buildApp({})).get('/protected');
    assert.equal(res.status, 403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `requireFinance is not a function` (not yet exported).

- [ ] **Step 3: Implement the middleware**

In `server/middleware/requireAuth.js`, add this export right after the existing `requireAdmin` function:

```js
export function requireFinance(req, res, next) {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (user.permissions?.finance !== true && user.permissions?.admin !== true) {
        return res.status(403).json({ error: 'Finance access required.' });
    }
    next();
}
```

- [ ] **Step 4: Apply it to the four Ledger-family route mounts**

In `server/index.js`, add the import alongside the existing one:

```js
import { requireAuth, requireFinance } from './middleware/requireAuth.js';
```

Then change these four existing lines:

```js
app.use('/api/ledger-accounts', ledgerAccountsRouter);
app.use('/api/journal-entries', journalEntriesRouter);
app.use('/api/ledger-reports', ledgerReportsRouter);
```

and

```js
app.use('/api/mercury-import', mercuryReconciliationRouter);
```

to:

```js
app.use('/api/ledger-accounts', requireFinance, ledgerAccountsRouter);
app.use('/api/journal-entries', requireFinance, journalEntriesRouter);
app.use('/api/ledger-reports', requireFinance, ledgerReportsRouter);
```

and:

```js
app.use('/api/mercury-import', requireFinance, mercuryReconciliationRouter);
```

(These two edits are in different parts of the file — the first three mounts are together, `mercury-import`'s mount is separate. Leave every other route mount in the file untouched.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all 5 new tests green. Also re-check the full ledger test suite: every existing `tests/ledger/*.test.ts` file builds its own standalone Express app directly from the router (e.g. `app.use('/api/mercury-import', mercuryReconciliationRouter)`) rather than importing `server/index.js`, so none of them go through this new middleware — they should be entirely unaffected. Confirm this is actually true by running the full suite and seeing no new failures.

- [ ] **Step 6: Commit**

```bash
git add server/middleware/requireAuth.js server/index.js tests/requireFinance.test.ts
git commit -m "feat: add requireFinance middleware, enforce on Ledger-family routes"
```

---

### Task 2: MercuryTransaction — dashboardLink field + TTL retention

**Files:**
- Modify: `server/models/MercuryTransaction.js`
- Modify: `tests/ledger/mercuryTransaction.test.ts`

**Interfaces:**
- Produces: `MercuryTransaction` schema gains `dashboardLink: String` and a TTL index on `createdAt` with `expireAfterSeconds: 63072000` (730 days).

- [ ] **Step 1: Write the failing test**

In `tests/ledger/mercuryTransaction.test.ts`, add a new test inside the existing `describe('MercuryTransaction', ...)` block:

```typescript
  it('has a TTL index on createdAt so cached rows eventually expire', () => {
    const indexes = MercuryTransaction.schema.indexes();
    const ttlIndex = indexes.find(([, opts]) => typeof opts.expireAfterSeconds === 'number');
    assert.ok(ttlIndex, 'expected a TTL index with expireAfterSeconds to exist');
    assert.deepEqual(ttlIndex![0], { createdAt: 1 });
    assert.equal(ttlIndex![1].expireAfterSeconds, 60 * 60 * 24 * 730);
  });
```

Also extend the existing "creates a transaction document with the expected fields" test's `MercuryTransaction.create({...})` call to include `dashboardLink: 'https://mercury.com/transactions/abc'` and assert `assert.equal(doc.dashboardLink, 'https://mercury.com/transactions/abc');`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `doc.dashboardLink` is `undefined`, and the TTL-index test finds no matching index.

- [ ] **Step 3: Implement**

In `server/models/MercuryTransaction.js`, add the field (after `counterpartyNickname: String,`, before `note: String,` — or anywhere in the field list, order doesn't matter):

```js
  dashboardLink: String,
```

And add the TTL index after the existing unique compound index:

```js
MercuryTransactionSchema.index(
  { mercuryAccountId: 1, mercuryTransactionId: 1 },
  { unique: true }
);

// Cache rows expire after ~2 years — this is a reconciliation cache fed
// fresh by every sync, not a system of record (the resulting JournalEntry
// is the permanent record once a row is approved), so nothing depends on
// rows surviving indefinitely.
MercuryTransactionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 730 });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/models/MercuryTransaction.js tests/ledger/mercuryTransaction.test.ts
git commit -m "feat: add dashboardLink field and 2-year TTL retention to MercuryTransaction"
```

---

### Task 3: mapMercuryTransactionToUpsert helper + capture dashboardLink in POST /sync + frontend link

**Files:**
- Modify: `server/services/mercuryApiClient.js`
- Modify: `server/routes/mercuryReconciliation.js`
- Modify: `components/ledger/ReconciliationTab.tsx`
- Modify: `tests/ledger/mercuryReconciliation.test.ts`

**Interfaces:**
- Consumes: `dashboardLink` field on `MercuryTransaction` (Task 2).
- Produces: `export function mapMercuryTransactionToUpsert(accountId, t)` in `mercuryApiClient.js` — returns the exact `$set` object shape `POST /sync`'s upsert already builds inline today, now centralized. `missing[i].bankRow.dashboardLink` on synced rows.

- [ ] **Step 1: Write the failing tests**

Add to `tests/ledger/mercuryReconciliation.test.ts`, inside the existing `describe('POST /api/mercury-import/sync — category suggestion on missing rows', ...)` block (append as a new `it`):

```typescript
  it('attaches dashboardLink to a missing row and persists it on the stored MercuryTransaction', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListTransactions: async () => [
        { id: 'tx_link_1', amount: -40, status: 'sent', postedAt: '2026-07-01', counterpartyNickname: 'Vendor', dashboardLink: 'https://mercury.com/transactions/tx_link_1' },
      ],
    }));

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    assert.equal(res.body.missing[0].bankRow.dashboardLink, 'https://mercury.com/transactions/tx_link_1');
    const stored = await MercuryTransaction.findOne({ mercuryTransactionId: 'tx_link_1' }).lean();
    assert.equal(stored?.dashboardLink, 'https://mercury.com/transactions/tx_link_1');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `res.body.missing[0].bankRow.dashboardLink` is `undefined`.

- [ ] **Step 3: Add the shared helper to mercuryApiClient.js**

In `server/services/mercuryApiClient.js`, add this export (anywhere after the existing exports — e.g. at the end of the file). Its `description` logic must produce the exact same result as `mercuryReconciliation.js`'s existing `describeTransaction(t)` function (counterparty-or-bankDescription, combined with the note as `"who — note"` when both exist) — duplicated here (rather than imported from the route file) because a service module importing from a route module would be a backwards dependency:

```js
function describeForUpsert(t) {
  const who = t.counterpartyNickname || t.counterpartyName || t.bankDescription || '';
  if (t.note) return who ? `${who} — ${t.note}` : t.note;
  return who;
}

// Single source of truth for the upsert shape both POST /sync and the
// nightly sync scheduler write into MercuryTransaction — keeping this in
// one place means the two call sites can't drift apart on which fields
// get captured.
export function mapMercuryTransactionToUpsert(accountId, t) {
  return {
    mercuryAccountId: accountId,
    mercuryTransactionId: t.id,
    amount: t.amount,
    status: t.status,
    postedAt: t.postedAt,
    mercuryCreatedAt: t.createdAt ?? null,
    description: describeForUpsert(t),
    counterpartyName: t.counterpartyName,
    mercuryCategoryName: t.categoryData?.name ?? null,
    kind: t.kind,
    counterpartyNickname: t.counterpartyNickname,
    note: t.note ?? null,
    dashboardLink: t.dashboardLink ?? null,
  };
}
```

- [ ] **Step 4: Use the helper in POST /sync and add dashboardLink to the rows mapping**

In `server/routes/mercuryReconciliation.js`, change the import line:

```js
import { listAccounts, listAccountTransactions } from '../services/mercuryApiClient.js';
```

to:

```js
import { listAccounts, listAccountTransactions, mapMercuryTransactionToUpsert } from '../services/mercuryApiClient.js';
```

Replace the `POST /sync` handler's upsert block — currently:

```js
            await Promise.all(transactions.map(t => MercuryTransaction.updateOne(
                { mercuryAccountId: accountId, mercuryTransactionId: t.id },
                { $set: {
                    mercuryAccountId: accountId,
                    mercuryTransactionId: t.id,
                    amount: t.amount,
                    status: t.status,
                    postedAt: t.postedAt,
                    mercuryCreatedAt: t.createdAt ?? null,
                    description: describeTransaction(t),
                    counterpartyName: t.counterpartyName,
                    mercuryCategoryName: t.categoryData?.name ?? null,
                    kind: t.kind,
                    counterpartyNickname: t.counterpartyNickname,
                    note: t.note ?? null,
                } },
                { upsert: true }
            )));
```

with:

```js
            await Promise.all(transactions.map(t => MercuryTransaction.updateOne(
                { mercuryAccountId: accountId, mercuryTransactionId: t.id },
                { $set: mapMercuryTransactionToUpsert(accountId, t) },
                { upsert: true }
            )));
```

(The module-level `describeTransaction`/`toDateOnly` functions defined earlier in this file stay exactly as they are — they're still used by the `rows` mapping right below this block, which builds the UI-facing row shape, a different concern from the DB upsert shape. Do not remove or modify `describeTransaction`.)

Then extend the `rows` mapping (the very next block in the same handler) to include `dashboardLink`:

```js
            const rows = transactions.map(t => ({
                Date: toDateOnly(t.postedAt ?? t.createdAt),
                Description: describeTransaction(t),
                Amount: String(t.amount),
                mercuryTransactionId: t.id,
                mercurySuggestedTaxCategory: suggestTaxCategory(t.categoryData?.name),
                dashboardLink: t.dashboardLink ?? null,
            }));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Frontend — "Ver en Mercury" link**

In `components/ledger/ReconciliationTab.tsx`, extend the `missing` field's type in `ImportResult`:

```typescript
  missing: { bankRow: Record<string, string> & { mercuryTransactionId?: string; mercurySuggestedTaxCategory?: string; dashboardLink?: string } }[];
```

In the "Faltantes" row-rendering block, add the link next to the suggested-category text:

```tsx
                <div className="min-w-0">
                  <div>{m.bankRow.Date} — {m.bankRow.Description} — ${m.bankRow.Amount}</div>
                  {m.bankRow.mercurySuggestedTaxCategory && (
                    <div className="text-[11px] text-gray-400">
                      Categoría sugerida: {m.bankRow.mercurySuggestedTaxCategory}
                      {m.bankRow.dashboardLink && (
                        <>
                          {' · '}
                          <a href={m.bankRow.dashboardLink} target="_blank" rel="noreferrer" className="text-purple-600 hover:underline">Ver en Mercury ↗</a>
                        </>
                      )}
                    </div>
                  )}
                </div>
```

(This replaces just the inner `<div className="min-w-0">...</div>` block inside the `result.missing.map(...)` loop — the surrounding row `<div>` and the "Aprobar" button next to it are untouched by this task; Task 4 will modify the category-display part again, so don't worry about making this pixel-perfect against Task 4's eventual dropdown — just get the link showing correctly for this task.)

- [ ] **Step 7: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add server/services/mercuryApiClient.js server/routes/mercuryReconciliation.js components/ledger/ReconciliationTab.tsx tests/ledger/mercuryReconciliation.test.ts
git commit -m "feat: capture Mercury dashboardLink and surface a 'Ver en Mercury' link"
```

---

### Task 4: Editable tax category on approve

**Files:**
- Modify: `server/routes/mercuryReconciliation.js`
- Modify: `components/ledger/ReconciliationTab.tsx`
- Modify: `tests/ledger/mercuryReconciliation.test.ts`

**Interfaces:**
- Consumes: `LedgerAccount` model (already imported in `mercuryReconciliation.js`).
- Produces: `POST /approve` accepts an optional `taxCategory: string` in its request body. If present and valid (a seeded `LedgerAccount` with `type: 'expense'` and that exact `taxCategory` exists), it overrides `suggestTaxCategory(mtx.mercuryCategoryName)`. If present and invalid, `400 { error: 'Invalid taxCategory' }`. If absent, behavior is unchanged from before this task.

- [ ] **Step 1: Write the failing tests**

Add to `tests/ledger/mercuryReconciliation.test.ts`, inside the existing `describe('POST /api/mercury-import/approve', ...)` block:

```typescript
  it('uses an explicit taxCategory override instead of the suggested one, when provided and valid', async () => {
    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_override_1',
      amount: -60, status: 'sent', postedAt: new Date('2026-07-05'),
      description: 'Ambiguous charge', mercuryCategoryName: 'Bank Fees', // would normally suggest Other Expenses
    });

    const res = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_override_1', taxCategory: 'Travel' });

    assert.equal(res.status, 201);
    assert.equal(res.body.taxCategory, 'Travel');
    const tx = await Transaction.findOne({ id: 'mercury_tx_override_1' }).lean();
    assert.equal(tx?.taxCategory, 'Travel');
  });

  it('rejects an invalid taxCategory override with 400, without creating anything', async () => {
    await MercuryTransaction.create({
      mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_override_2',
      amount: -10, status: 'sent', postedAt: new Date('2026-07-05'),
      description: 'Charge', mercuryCategoryName: 'Bank Fees',
    });

    const res = await request(app).post('/api/mercury-import/approve').send({ mercuryTransactionId: 'tx_override_2', taxCategory: 'Not A Real Category' });

    assert.equal(res.status, 400);
    const tx = await Transaction.findOne({ id: 'mercury_tx_override_2' }).lean();
    assert.equal(tx, null);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — both new tests fail (no override logic exists yet: the first gets `Other Expenses` instead of `Travel`; the second gets `201` instead of `400`).

- [ ] **Step 3: Implement**

In `server/routes/mercuryReconciliation.js`'s `POST /approve` handler, find this line:

```js
            const taxCategory = suggestTaxCategory(mtx.mercuryCategoryName);
```

Replace it with:

```js
            let taxCategory = suggestTaxCategory(mtx.mercuryCategoryName);
            if (typeof req.body.taxCategory === 'string' && req.body.taxCategory) {
                const validAccount = await LedgerAccount.findOne({ type: 'expense', taxCategory: req.body.taxCategory }).lean();
                if (!validAccount) return res.status(400).json({ error: 'Invalid taxCategory' });
                taxCategory = req.body.taxCategory;
            }
```

(`LedgerAccount` is already imported at the top of this file.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Frontend — editable dropdown**

In `components/ledger/ReconciliationTab.tsx`, add a constant near the top of the file (after the `ApprovedRow` type):

```typescript
// Mirrors CompanyExpensesTab.tsx's own hardcoded list — the Schedule C
// categories a user can pick from when approving a Mercury row.
const TAX_CATEGORIES = [
  'Advertising', 'Contract Labor', 'Office Expense', 'Insurance',
  'Legal & Professional Services', 'Rent', 'Supplies', 'Taxes & Licenses',
  'Travel', 'Meals', 'Utilities', 'Other Expenses',
];
```

Add state to track each row's currently-selected category, keyed by `mercuryTransactionId`:

```typescript
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});
```

Add a small helper to read the effective category for a row (override if set, otherwise the suggested one):

```typescript
  const categoryFor = (bankRow: Record<string, string>) => {
    const id = bankRow.mercuryTransactionId;
    if (id && categoryOverrides[id]) return categoryOverrides[id];
    return bankRow.mercurySuggestedTaxCategory || 'Other Expenses';
  };
```

Update `approveMissing` to send the effective category:

```typescript
  const approveMissing = async (mercuryTransactionId: string, bankRow: Record<string, string>) => {
    setError('');
    const res = await apiFetch('/api/mercury-import/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mercuryTransactionId, taxCategory: categoryFor(bankRow) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Error desconocido' }));
      setError(body.error || 'No se pudo aprobar el gasto.');
      return;
    }
    const body = await res.json().catch(() => ({ taxCategory: categoryFor(bankRow) }));
    setResult(r => r ? {
      ...r,
      missing: r.missing.filter(m => m.bankRow.mercuryTransactionId !== mercuryTransactionId),
    } : r);
    setApprovedRows(rows => [{ mercuryTransactionId, bankRow, taxCategory: body.taxCategory }, ...rows]);
  };
```

Replace the static "Categoría sugerida: X" text (from Task 3, Step 6) with an editable `<select>`:

```tsx
                <div className="min-w-0">
                  <div>{m.bankRow.Date} — {m.bankRow.Description} — ${m.bankRow.Amount}</div>
                  {m.bankRow.mercuryTransactionId && (
                    <div className="flex items-center gap-2 mt-1">
                      <select
                        className="text-[11px] border border-gray-200 rounded px-1 py-0.5 text-gray-600"
                        value={categoryFor(m.bankRow)}
                        onChange={e => setCategoryOverrides(prev => ({ ...prev, [m.bankRow.mercuryTransactionId!]: e.target.value }))}
                      >
                        {TAX_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {m.bankRow.dashboardLink && (
                        <a href={m.bankRow.dashboardLink} target="_blank" rel="noreferrer" className="text-[11px] text-purple-600 hover:underline">Ver en Mercury ↗</a>
                      )}
                    </div>
                  )}
                </div>
```

(This replaces the block Task 3, Step 6 added — the CSV-path rows, which have no `mercuryTransactionId`, correctly show neither the dropdown nor the link, matching the existing pattern of gating Mercury-only UI on that field's presence.)

- [ ] **Step 6: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add server/routes/mercuryReconciliation.js components/ledger/ReconciliationTab.tsx tests/ledger/mercuryReconciliation.test.ts
git commit -m "feat: let the tax category be edited before approving a Mercury row"
```

---

### Task 5: Bulk approve

**Files:**
- Modify: `server/routes/mercuryReconciliation.js`
- Modify: `components/ledger/ReconciliationTab.tsx`
- Modify: `tests/ledger/mercuryReconciliation.test.ts`

**Interfaces:**
- Produces: internal (not exported) `async function approveOne(mtx, taxCategoryOverride)` — extracted from `POST /approve`'s body, returns `{ status: 'approved' | 'error', id?, taxCategory?, error?, alreadyApproved? }` instead of writing to `res` directly. `POST /approve` becomes a thin wrapper calling `approveOne` and translating its result to an HTTP response (unchanged external behavior — same status codes/bodies as before). New `POST /approve-many`, body `{ items: [{ mercuryTransactionId, taxCategory? }, ...] }` (max 100 items), response `{ results: [{ mercuryTransactionId, status, id?, taxCategory?, error? }, ...] }`.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of `tests/ledger/mercuryReconciliation.test.ts`:

```typescript
describe('POST /api/mercury-import/approve-many', () => {
  it('rejects a request with no items array', async () => {
    const res = await request(app).post('/api/mercury-import/approve-many').send({});
    assert.equal(res.status, 400);
  });

  it('rejects a request with more than 100 items', async () => {
    const items = Array.from({ length: 101 }, (_, i) => ({ mercuryTransactionId: `tx_${i}` }));
    const res = await request(app).post('/api/mercury-import/approve-many').send({ items });
    assert.equal(res.status, 400);
  });

  it('approves every item in a batch, each with its own taxCategory', async () => {
    await MercuryTransaction.create({ mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_bulk_1', amount: -10, status: 'sent', postedAt: new Date('2026-07-05'), description: 'A', mercuryCategoryName: 'Bank Fees' });
    await MercuryTransaction.create({ mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_bulk_2', amount: -20, status: 'sent', postedAt: new Date('2026-07-06'), description: 'B', mercuryCategoryName: 'Payroll' });

    const res = await request(app).post('/api/mercury-import/approve-many').send({
      items: [
        { mercuryTransactionId: 'tx_bulk_1', taxCategory: 'Travel' },
        { mercuryTransactionId: 'tx_bulk_2' }, // no override — uses suggested (Contract Labor)
      ],
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.results.length, 2);
    const r1 = res.body.results.find((r: any) => r.mercuryTransactionId === 'tx_bulk_1');
    const r2 = res.body.results.find((r: any) => r.mercuryTransactionId === 'tx_bulk_2');
    assert.equal(r1.status, 'approved');
    assert.equal(r1.taxCategory, 'Travel');
    assert.equal(r2.status, 'approved');
    assert.equal(r2.taxCategory, 'Contract Labor');

    assert.ok(await Transaction.findOne({ id: 'mercury_tx_bulk_1' }).lean());
    assert.ok(await Transaction.findOne({ id: 'mercury_tx_bulk_2' }).lean());
  });

  it('reports a per-item error without blocking the rest of the batch', async () => {
    await MercuryTransaction.create({ mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_bulk_3', amount: -30, status: 'sent', postedAt: new Date('2026-07-05'), description: 'C', mercuryCategoryName: 'Bank Fees' });
    await MercuryTransaction.create({ mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_bulk_incoming', amount: 500, status: 'sent', postedAt: new Date('2026-07-05'), description: 'Incoming', mercuryCategoryName: 'Revenue' });

    const res = await request(app).post('/api/mercury-import/approve-many').send({
      items: [
        { mercuryTransactionId: 'tx_bulk_3' },
        { mercuryTransactionId: 'tx_bulk_incoming' }, // positive amount — must fail its own sign guard
      ],
    });

    assert.equal(res.status, 200);
    const ok = res.body.results.find((r: any) => r.mercuryTransactionId === 'tx_bulk_3');
    const failed = res.body.results.find((r: any) => r.mercuryTransactionId === 'tx_bulk_incoming');
    assert.equal(ok.status, 'approved');
    assert.equal(failed.status, 'error');
    assert.ok(failed.error);

    assert.ok(await Transaction.findOne({ id: 'mercury_tx_bulk_3' }).lean());
    assert.equal(await Transaction.findOne({ id: 'mercury_tx_bulk_incoming' }).lean(), null);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `POST /api/mercury-import/approve-many` doesn't exist yet (404 on every new test).

- [ ] **Step 3: Extract approveOne and add the new route**

In `server/routes/mercuryReconciliation.js`, replace the entire body of the existing `scopedRouter.post('/approve', async (req, res) => { ... });` handler. First, extract its core logic into a standalone helper function, placed right before `createMercuryReconciliationRouter` is defined (module scope, alongside `reconcileRows`/`describeTransaction`):

```js
// httpStatus travels with every error result so /approve can map it back to
// the exact status code the pre-refactor inline handler used — a generic/
// unexpected error (anything other than the sign guard, an invalid
// taxCategory override, or a posting failure) must still surface as 500, not
// be silently reclassified as a 502 "known integration failure". Getting
// this wrong is easy (string-matching the error message instead) and easy to
// miss in review since no pre-existing test exercises a truly unexpected
// Transaction.create() failure — verified by re-deriving each branch's
// status code against the pre-refactor handler line by line, not just by
// running the existing test suite.
async function approveOne(mtx, taxCategoryOverride) {
    if (!(mtx.amount < 0)) {
        return { status: 'error', httpStatus: 400, error: 'Solo los movimientos de salida se pueden aprobar como gasto.' };
    }

    let taxCategory = suggestTaxCategory(mtx.mercuryCategoryName);
    if (typeof taxCategoryOverride === 'string' && taxCategoryOverride) {
        const validAccount = await LedgerAccount.findOne({ type: 'expense', taxCategory: taxCategoryOverride }).lean();
        if (!validAccount) return { status: 'error', httpStatus: 400, error: 'Invalid taxCategory' };
        taxCategory = taxCategoryOverride;
    }

    const amount = Math.abs(mtx.amount);
    const transactionId = `mercury_${mtx.mercuryTransactionId}`;
    const postedAt = mtx.postedAt || mtx.mercuryCreatedAt || new Date();
    const postingFailedMessage = 'El gasto se registró pero no se pudo contabilizar en el libro diario. Contacta soporte.';

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

        const entry = await JournalEntry.findOne({ source: 'expense', sourceId: transactionId, status: { $ne: 'void' } }).lean();
        if (!entry) return { status: 'error', httpStatus: 502, error: postingFailedMessage };
        return { status: 'approved', id: transactionId, taxCategory };
    } catch (err) {
        if (err.code === 11000) {
            const existingEntry = await JournalEntry.findOne({ source: 'expense', sourceId: transactionId, status: { $ne: 'void' } }).lean();
            if (existingEntry) {
                return { status: 'approved', id: transactionId, taxCategory, alreadyApproved: true };
            }

            const existingTx = await Transaction.findOne({ id: transactionId }).lean();
            if (existingTx) {
                try {
                    await postExpense(existingTx);
                } catch (postErr) {
                    console.error(`[mercury-approve] retry posting failed for ${transactionId}:`, postErr.stack || postErr);
                }
            }

            const retryEntry = await JournalEntry.findOne({ source: 'expense', sourceId: transactionId, status: { $ne: 'void' } }).lean();
            if (!retryEntry) return { status: 'error', httpStatus: 502, error: postingFailedMessage };
            if (existingTx) {
                await Transaction.updateOne({ id: transactionId }, { $set: { postingStatus: 'posted' } }).catch(() => {});
            }
            return { status: 'approved', id: transactionId, taxCategory, alreadyApproved: true };
        }
        // Any other error (e.g. a Mongo write failure unrelated to a
        // duplicate key) — the pre-refactor handler let this propagate to
        // its own outer catch, which always responded 500. Preserve that
        // exactly via an explicit httpStatus rather than re-deriving it from
        // the error message.
        return { status: 'error', httpStatus: 500, error: err.message };
    }
}
```

Then replace the entire `/approve` route handler with this much shorter version:

```js
    scopedRouter.post('/approve', async (req, res) => {
        try {
            const { mercuryTransactionId, taxCategory } = req.body;
            if (typeof mercuryTransactionId !== 'string' || !mercuryTransactionId) {
                return res.status(400).json({ error: 'mercuryTransactionId is required' });
            }
            const mtx = await MercuryTransaction.findOne({ mercuryTransactionId }).lean();
            if (!mtx) return res.status(404).json({ error: 'Mercury transaction not found' });

            const result = await approveOne(mtx, taxCategory);
            if (result.status === 'error') {
                return res.status(result.httpStatus).json({ error: result.error });
            }
            res.status(result.alreadyApproved ? 200 : 201).json({ id: result.id, taxCategory: result.taxCategory, ...(result.alreadyApproved ? { alreadyApproved: true } : {}) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    scopedRouter.post('/approve-many', async (req, res) => {
        try {
            const { items } = req.body;
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'items (non-empty array) is required' });
            }
            if (items.length > 100) {
                return res.status(400).json({ error: 'Cannot approve more than 100 items in one call' });
            }

            const results = [];
            for (const item of items) {
                const { mercuryTransactionId, taxCategory } = item || {};
                if (typeof mercuryTransactionId !== 'string' || !mercuryTransactionId) {
                    results.push({ mercuryTransactionId: mercuryTransactionId ?? null, status: 'error', error: 'mercuryTransactionId is required' });
                    continue;
                }
                const mtx = await MercuryTransaction.findOne({ mercuryTransactionId }).lean();
                if (!mtx) {
                    results.push({ mercuryTransactionId, status: 'error', error: 'Mercury transaction not found' });
                    continue;
                }
                const result = await approveOne(mtx, taxCategory);
                results.push({ mercuryTransactionId, ...result });
            }

            res.status(200).json({ results });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
```

**Note on the `/approve` rewrite:** the original handler distinguished a 400 (sign guard) from other errors inline via early `return`s; the rewrite above centralizes that distinction with the `isSignOrValidationError` check so `/approve`'s external behavior (status codes, response bodies) stays byte-identical to before this task — verify this by re-reading the pre-existing tests for `/approve` (the ones from Task 4 and earlier) and confirming every one of them still describes the exact same expected status/body after this refactor.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all new `/approve-many` tests green, AND every pre-existing `/approve` test (sign guard 400, posting-failure 502, self-heal, idempotency, taxCategory override from Task 4) still green with the exact same status codes/bodies as before — this refactor must be externally invisible to `/approve`'s existing behavior.

- [ ] **Step 5: Frontend — "Aprobar todas" button**

In `components/ledger/ReconciliationTab.tsx`, add a bulk-approve handler after `approveMissing`:

```typescript
  const [bulkApproving, setBulkApproving] = useState(false);

  const approveAllMissing = async () => {
    if (!result) return;
    const eligible = result.missing.filter(m => m.bankRow.mercuryTransactionId && Number(m.bankRow.Amount) < 0);
    if (eligible.length === 0) return;

    setBulkApproving(true);
    setError('');
    try {
      const res = await apiFetch('/api/mercury-import/approve-many', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: eligible.map(m => ({ mercuryTransactionId: m.bankRow.mercuryTransactionId, taxCategory: categoryFor(m.bankRow) })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Error desconocido' }));
        setError(body.error || 'No se pudo aprobar en lote.');
        return;
      }
      const body = await res.json();
      const approvedIds = new Set(body.results.filter((r: any) => r.status === 'approved').map((r: any) => r.mercuryTransactionId));
      const failedResults = body.results.filter((r: any) => r.status === 'error');

      if (failedResults.length > 0) {
        setError(`${failedResults.length} de ${eligible.length} no se pudieron aprobar: ${failedResults.map((r: any) => r.error).join('; ')}`);
      }

      const newlyApproved: ApprovedRow[] = eligible
        .filter(m => approvedIds.has(m.bankRow.mercuryTransactionId))
        .map(m => {
          const r = body.results.find((x: any) => x.mercuryTransactionId === m.bankRow.mercuryTransactionId);
          return { mercuryTransactionId: m.bankRow.mercuryTransactionId!, bankRow: m.bankRow, taxCategory: r.taxCategory };
        });

      setResult(r => r ? { ...r, missing: r.missing.filter(m => !approvedIds.has(m.bankRow.mercuryTransactionId)) } : r);
      setApprovedRows(rows => [...newlyApproved, ...rows]);
    } finally {
      setBulkApproving(false);
    }
  };
```

Add the button in the "Faltantes" section header, right after the existing `<h3>`/`<p>` description block and before the `.map(...)` render:

```tsx
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-red-700 mb-2"><HelpCircle size={16} /> Faltantes en el libro ({result.missing.length})</h3>
            <p className="text-xs text-gray-500 mb-2">Movimientos del banco sin asiento contable — crea el gasto/asiento correspondiente en la pestaña Gastos de la Empresa o Libro Diario.</p>
            {result.missing.some(m => m.bankRow.mercuryTransactionId && Number(m.bankRow.Amount) < 0) && (
              <button
                onClick={approveAllMissing}
                disabled={bulkApproving}
                className="text-xs text-white bg-purple-700 hover:bg-purple-800 disabled:opacity-50 rounded-lg px-3 py-1.5 mb-3"
              >
                {bulkApproving ? 'Aprobando...' : `Aprobar todas (${result.missing.filter(m => m.bankRow.mercuryTransactionId && Number(m.bankRow.Amount) < 0).length})`}
              </button>
            )}
            {result.missing.map((m, i) => (
```

(Only the header block changes — the `.map(...)` loop body itself, from Task 4, stays exactly as it is.)

- [ ] **Step 6: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add server/routes/mercuryReconciliation.js components/ledger/ReconciliationTab.tsx tests/ledger/mercuryReconciliation.test.ts
git commit -m "feat: add bulk approve for Mercury missing rows"
```

---

### Task 6: Rate limit headroom for mercury-import writes

**Files:**
- Modify: `server/index.js`

**Interfaces:**
- Produces: a new `mercuryWriteLimit` rate limiter (300 req/15min) replacing the shared `writeLimit` (60 req/15min) on `/api/mercury-import`'s four explicit POST route registrations.

This is a pure configuration change — no new test (mirrors this file's existing rate-limit tiers, none of which have dedicated tests, since `skip: () => !IS_PROD` makes them all inert during `pnpm test`).

- [ ] **Step 1: Locate and update the mercury-import write registrations**

In `server/index.js`, find this block (added during the earlier rate-limiter architecture fix):

```js
// mercury-import's mutating actions live at named sub-paths (/confirm-match,
// /sync, /approve), not the generic collection+':id' shape dataRoutes assumes
// above — and Tier 1 now exempts the whole /api/mercury-import prefix (Tier 2
// only covers its GETs), so these need explicit write-tier coverage or they'd
// be completely unrated-limited rather than merely under the wrong tier.
app.post('/api/mercury-import', writeLimit);
app.post('/api/mercury-import/confirm-match', writeLimit);
app.post('/api/mercury-import/sync', writeLimit);
app.post('/api/mercury-import/approve', writeLimit);
```

Replace it with:

```js
// mercury-import's mutating actions live at named sub-paths (/confirm-match,
// /sync, /approve, /approve-many, /unapprove), not the generic
// collection+':id' shape dataRoutes assumes above — and Tier 1 exempts the
// whole /api/mercury-import prefix (Tier 2 only covers its GETs), so these
// need explicit write-tier coverage or they'd be completely unrate-limited.
// A dedicated (not the shared writeLimit) budget: bulk approve can post up
// to 100 mutations in a single user action, well past the shared tier's
// 60/15min.
const mercuryWriteLimit = makeLimit(15 * 60 * 1000, 300, 'Too many Mercury actions. Please wait before approving more.');
app.post('/api/mercury-import', mercuryWriteLimit);
app.post('/api/mercury-import/confirm-match', mercuryWriteLimit);
app.post('/api/mercury-import/sync', mercuryWriteLimit);
app.post('/api/mercury-import/approve', mercuryWriteLimit);
app.post('/api/mercury-import/approve-many', mercuryWriteLimit);
app.post('/api/mercury-import/unapprove', mercuryWriteLimit);
```

- [ ] **Step 2: Run the full suite**

Run: `pnpm test`
Expected: PASS — no behavior change during tests (rate limiting is inert outside `IS_PROD`).

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: give mercury-import writes their own 300/15min rate-limit tier"
```

---

### Task 7: Optional nightly background sync scheduler

**Files:**
- Create: `server/jobs/mercurySyncScheduler.js`
- Modify: `server/index.js`
- Test: `tests/ledger/mercurySyncScheduler.test.ts`

**Interfaces:**
- Consumes: `mapMercuryTransactionToUpsert` (Task 3), `listAccounts`/`listAccountTransactions` from `mercuryApiClient.js`, `MercuryTransaction` model.
- Produces: `export async function runNightlyMercurySyncJob({ mercuryListAccounts = listAccounts, mercuryListTransactions = listAccountTransactions } = {})` (dependency-injectable for tests, matching this codebase's established DI convention) and `export function startMercurySyncScheduler()`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ledger/mercurySyncScheduler.test.ts`:

```typescript
// tests/ledger/mercurySyncScheduler.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections } from './setup.js';
import { runNightlyMercurySyncJob } from '../../server/jobs/mercurySyncScheduler.js';
import MercuryTransaction from '../../server/models/MercuryTransaction.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(clearLedgerCollections);

describe('runNightlyMercurySyncJob', () => {
  it('does nothing when MERCURY_API_TOKEN is unset', async () => {
    const original = process.env.MERCURY_API_TOKEN;
    delete process.env.MERCURY_API_TOKEN;
    let called = false;
    try {
      await runNightlyMercurySyncJob({ mercuryListAccounts: async () => { called = true; return []; } });
    } finally {
      if (original !== undefined) process.env.MERCURY_API_TOKEN = original;
    }
    assert.equal(called, false);
  });

  it('upserts transactions for every account when the token is set', async () => {
    process.env.MERCURY_API_TOKEN = 'test-token';
    try {
      await runNightlyMercurySyncJob({
        mercuryListAccounts: async () => [{ id: 'acc_a', name: 'A', type: 'checking' }, { id: 'acc_b', name: 'B', type: 'checking' }],
        mercuryListTransactions: async (accountId: string) => [
          { id: `tx_${accountId}_1`, amount: -5, status: 'sent', postedAt: '2026-07-01', counterpartyNickname: 'Vendor' },
        ],
      });
    } finally {
      delete process.env.MERCURY_API_TOKEN;
    }

    const count = await MercuryTransaction.countDocuments({});
    assert.equal(count, 2);
    assert.ok(await MercuryTransaction.findOne({ mercuryTransactionId: 'tx_acc_a_1' }).lean());
    assert.ok(await MercuryTransaction.findOne({ mercuryTransactionId: 'tx_acc_b_1' }).lean());
  });

  it("one account's failure does not stop the others from syncing", async () => {
    process.env.MERCURY_API_TOKEN = 'test-token';
    try {
      await runNightlyMercurySyncJob({
        mercuryListAccounts: async () => [{ id: 'acc_fail', name: 'Fail', type: 'checking' }, { id: 'acc_ok', name: 'OK', type: 'checking' }],
        mercuryListTransactions: async (accountId: string) => {
          if (accountId === 'acc_fail') throw new Error('Mercury API down');
          return [{ id: 'tx_ok_1', amount: -1, status: 'sent', postedAt: '2026-07-01' }];
        },
      });
    } finally {
      delete process.env.MERCURY_API_TOKEN;
    }

    const count = await MercuryTransaction.countDocuments({});
    assert.equal(count, 1);
    assert.ok(await MercuryTransaction.findOne({ mercuryTransactionId: 'tx_ok_1' }).lean());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../../server/jobs/mercurySyncScheduler.js'`.

- [ ] **Step 3: Implement**

Create `server/jobs/mercurySyncScheduler.js`:

```js
// server/jobs/mercurySyncScheduler.js
import cron from 'node-cron';
import { listAccounts, listAccountTransactions, mapMercuryTransactionToUpsert } from '../services/mercuryApiClient.js';
import MercuryTransaction from '../models/MercuryTransaction.js';

export async function runNightlyMercurySyncJob({
    mercuryListAccounts = listAccounts,
    mercuryListTransactions = listAccountTransactions,
} = {}) {
    if (!process.env.MERCURY_API_TOKEN) return; // inert without a token, same convention as lead enrichment's ANTHROPIC_API_KEY gate

    console.log(`[MercurySync] Running at ${new Date().toISOString()}`);

    let accounts;
    try {
        accounts = await mercuryListAccounts();
    } catch (err) {
        console.error('[MercurySync] Failed to list accounts:', err.message);
        return;
    }

    let synced = 0;
    for (const account of accounts) {
        try {
            const transactions = await mercuryListTransactions(account.id);
            await Promise.all(transactions.map(t => MercuryTransaction.updateOne(
                { mercuryAccountId: account.id, mercuryTransactionId: t.id },
                { $set: mapMercuryTransactionToUpsert(account.id, t) },
                { upsert: true }
            )));
            synced += transactions.length;
        } catch (err) {
            console.error(`[MercurySync] Failed to sync account ${account.id}:`, err.message);
        }
    }

    console.log(`[MercurySync] Done. Cached ${synced} transaction(s) across ${accounts.length} account(s).`);
}

export function startMercurySyncScheduler() {
    cron.schedule('0 4 * * *', () => runNightlyMercurySyncJob(), { timezone: 'America/Bogota' });
    console.log('[MercurySync] Scheduled daily at 04:00 America/Bogota');
}
```

- [ ] **Step 4: Wire it into server startup**

In `server/index.js`, add the import alongside the existing scheduler imports:

```js
import { startMercurySyncScheduler } from './jobs/mercurySyncScheduler.js';
```

And add the call right after the existing `startInvoiceScheduler(); startLeadEnrichmentScheduler();` line:

```js
    startInvoiceScheduler();
    startLeadEnrichmentScheduler();
    startMercurySyncScheduler();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all 3 new tests green, full suite still green.

- [ ] **Step 6: Commit**

```bash
git add server/jobs/mercurySyncScheduler.js server/index.js tests/ledger/mercurySyncScheduler.test.ts
git commit -m "feat: add optional nightly background sync for all Mercury accounts"
```
