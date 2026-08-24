# Mercury Direct API Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual CSV-upload step in Mercury reconciliation with a button-triggered sync that pulls transactions directly from Mercury's REST API, persists them for audit trail, and feeds the existing matching pipeline.

**Architecture:** A new `mercuryApiClient.js` service wraps Mercury's REST API (fixed host, bearer token, injectable `fetch`). A new `MercuryTransaction` Mongoose model persists pulled transactions with a unique compound index for idempotent upserts. The existing `mercuryReconciliation.js` router gets its matching logic extracted into a shared `reconcileRows()` function, then gains `GET /accounts` and `POST /sync` routes that call the client, upsert into Mongo, map to the same row shape the CSV path already produces, and reuse `reconcileRows()`. The frontend `ReconciliationTab.tsx` gets an account selector, date-range inputs, and a "Sincronizar con Mercury" button, reusing its existing result-rendering block unchanged.

**Tech Stack:** Express 4, Mongoose 8, native `fetch` (Node 18+), React 18 + TypeScript, `node:test` + `supertest` + `mongodb-memory-server` for testing.

**Spec:** `docs/superpowers/specs/2026-08-24-mercury-api-sync-design.md`

## Global Constraints

- `MERCURY_API_TOKEN` is read only inside `server/services/mercuryApiClient.js`, via `process.env` — never logged, never included in any HTTP response body.
- Mercury's API base URL (`https://api.mercury.com/api/v1`) is a hardcoded constant — never built from user input, so no SSRF hardening is needed for this client (unlike `fetchSiteMetadata` in lead enrichment).
- All new/modified routes stay under the existing `/api/mercury-import` mount and inherit `requireAuth` (mounted globally in `server/index.js` before this router) — no additional permission gate is added, matching the existing CSV path's protection level.
- `reconcileRows()` must produce byte-identical response shape to today's `POST /` handler — the frontend's existing render block for `matched/suggested/unmatched/missing` must not need any changes.
- Every fetch to the Mercury API goes through an injectable function (default-parameter DI, matching the `checkSmtp(transporterGetter = getTransporter)` pattern in `server/routes/health.js`) so tests never hit the real network.
- New test files live under `tests/ledger/` (already fully excluded from `tsc` via `tsconfig.json`'s `"tests/ledger"` entry — no tsconfig edit needed) and are picked up automatically by the `test`/`test:watch` npm scripts' `tests/ledger/*.test.ts` glob.
- Run `pnpm test` after every task; all pre-existing tests (including `tests/ledger/mercuryReconciliation.test.ts`) must stay green throughout.

---

### Task 1: MercuryTransaction model

**Files:**
- Create: `server/models/MercuryTransaction.js`
- Modify: `tests/ledger/setup.js`
- Test: `tests/ledger/mercuryTransaction.test.ts`

**Interfaces:**
- Produces: `MercuryTransaction` Mongoose model, default export, with schema fields `mercuryAccountId: String`, `mercuryTransactionId: String`, `amount: Number`, `status: String`, `postedAt: Date`, `description: String`, `counterpartyName: String`, plus Mongoose `timestamps`. Unique compound index on `{ mercuryAccountId: 1, mercuryTransactionId: 1 }`.

- [ ] **Step 1: Write the failing test**

Create `tests/ledger/mercuryTransaction.test.ts`:

```typescript
// tests/ledger/mercuryTransaction.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections } from './setup.js';
import MercuryTransaction from '../../server/models/MercuryTransaction.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(clearLedgerCollections);

describe('MercuryTransaction', () => {
  it('creates a transaction document with the expected fields', async () => {
    const doc = await MercuryTransaction.create({
      mercuryAccountId: 'acc_1',
      mercuryTransactionId: 'tx_1',
      amount: -42.5,
      status: 'sent',
      postedAt: new Date('2026-07-01'),
      description: 'AWS Hosting',
      counterpartyName: 'Amazon Web Services',
    });
    assert.equal(doc.mercuryAccountId, 'acc_1');
    assert.equal(doc.amount, -42.5);
  });

  it('upserting the same account+transaction id twice results in exactly one document, with fields updated', async () => {
    const key = { mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_1' };
    await MercuryTransaction.updateOne(key, { $set: { ...key, amount: -10, status: 'pending', description: 'first' } }, { upsert: true });
    await MercuryTransaction.updateOne(key, { $set: { ...key, amount: -10, status: 'sent', description: 'updated' } }, { upsert: true });

    const docs = await MercuryTransaction.find(key).lean();
    assert.equal(docs.length, 1);
    assert.equal(docs[0].status, 'sent');
    assert.equal(docs[0].description, 'updated');
  });

  it('rejects a duplicate insert of the same account+transaction id via direct .create() (unique index enforced)', async () => {
    const key = { mercuryAccountId: 'acc_1', mercuryTransactionId: 'tx_1', amount: -1 };
    await MercuryTransaction.create(key);
    await assert.rejects(() => MercuryTransaction.create(key));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../../server/models/MercuryTransaction.js'`

- [ ] **Step 3: Create the model**

Create `server/models/MercuryTransaction.js`:

```js
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
```

- [ ] **Step 4: Wire the new collection into the shared ledger test setup**

In `tests/ledger/setup.js`, add the import near the other model imports:

```js
import MercuryTransaction from '../../server/models/MercuryTransaction.js';
```

And add it to the `Promise.all` array inside `clearLedgerCollections`:

```js
export async function clearLedgerCollections() {
  await Promise.all([
    LedgerAccount.deleteMany({}),
    JournalEntry.deleteMany({}),
    LedgerPeriodClose.deleteMany({}),
    Transaction.deleteMany({}),
    Payment.deleteMany({}),
    Commission.deleteMany({}),
    MercuryTransaction.deleteMany({}),
  ]);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — all 3 new tests green, all pre-existing `tests/ledger/*.test.ts` still green.

- [ ] **Step 6: Commit**

```bash
git add server/models/MercuryTransaction.js tests/ledger/setup.js tests/ledger/mercuryTransaction.test.ts
git commit -m "feat: add MercuryTransaction model with idempotent upsert key"
```

---

### Task 2: Mercury API client service

**Files:**
- Create: `server/services/mercuryApiClient.js`
- Modify: `.env.example`
- Test: `tests/ledger/mercuryApiClient.test.ts`

**Interfaces:**
- Consumes: `process.env.MERCURY_API_TOKEN` (already set in the real `.env`, not committed).
- Produces:
  - `listAccounts(fetchImpl = fetch)` → `Promise<{id: string, name: string, type: string}[]>`
  - `listAccountTransactions(accountId: string, {start, end} = {}, fetchImpl = fetch)` → `Promise<Array<{id, amount, status, postedAt, createdAt, description, counterpartyName}>>` — paginates internally, capped at `MAX_PAGES` (20) pages of 100.
  - Both throw `Error` with a message starting `Mercury API ` on a non-2xx response.
  - The `fetchImpl` parameter is the injection point tests use to avoid real network calls — same shape as `checkSmtp`'s `transporterGetter` parameter in `server/routes/health.js`.

- [ ] **Step 1: Write the failing test**

Create `tests/ledger/mercuryApiClient.test.ts`:

```typescript
// tests/ledger/mercuryApiClient.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listAccounts, listAccountTransactions } from '../../server/services/mercuryApiClient.js';

function fakeFetch(handler: (url: URL) => { status: number; body: unknown }) {
  return async (url: string) => {
    const parsed = new URL(url);
    const { status, body } = handler(parsed);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  };
}

describe('listAccounts', () => {
  it('maps the Mercury accounts response to {id, name, type}', async () => {
    const fetchImpl = fakeFetch(() => ({
      status: 200,
      body: { accounts: [{ id: 'acc_1', name: 'Checking', type: 'checking', extraField: 'ignored' }] },
    }));
    const accounts = await listAccounts(fetchImpl);
    assert.deepEqual(accounts, [{ id: 'acc_1', name: 'Checking', type: 'checking' }]);
  });

  it('throws a "Mercury API " prefixed error on a non-2xx response', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 401, body: { error: 'invalid token' } }));
    await assert.rejects(() => listAccounts(fetchImpl), /^Error: Mercury API /);
  });
});

describe('listAccountTransactions', () => {
  it('sends accountId, start, and end through to the request URL', async () => {
    let seenUrl: URL | undefined;
    const fetchImpl = fakeFetch((url) => { seenUrl = url; return { status: 200, body: { transactions: [] } }; });
    await listAccountTransactions('acc_1', { start: '2026-07-01', end: '2026-07-31' }, fetchImpl);
    assert.equal(seenUrl?.pathname, '/api/v1/account/acc_1/transactions');
    assert.equal(seenUrl?.searchParams.get('start'), '2026-07-01');
    assert.equal(seenUrl?.searchParams.get('end'), '2026-07-31');
  });

  it('follows the start_after cursor across pages until a short page ends pagination', async () => {
    let calls = 0;
    const fetchImpl = fakeFetch((url) => {
      calls++;
      if (!url.searchParams.get('start_after')) {
        return { status: 200, body: { transactions: Array.from({ length: 100 }, (_, i) => ({ id: `tx_${i}` })) } };
      }
      return { status: 200, body: { transactions: [{ id: 'tx_last' }] } };
    });
    const results = await listAccountTransactions('acc_1', {}, fetchImpl);
    assert.equal(calls, 2);
    assert.equal(results.length, 101);
  });

  it('stops after MAX_PAGES (20) even if every page is full, never looping forever', async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(() => {
      calls++;
      return { status: 200, body: { transactions: Array.from({ length: 100 }, (_, i) => ({ id: `tx_${calls}_${i}` })) } };
    });
    const results = await listAccountTransactions('acc_1', {}, fetchImpl);
    assert.equal(calls, 20);
    assert.equal(results.length, 2000);
  });

  it('throws a "Mercury API " prefixed error on a non-2xx response', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 500, body: { error: 'boom' } }));
    await assert.rejects(() => listAccountTransactions('acc_1', {}, fetchImpl), /^Error: Mercury API /);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '../../server/services/mercuryApiClient.js'`

- [ ] **Step 3: Implement the client**

Create `server/services/mercuryApiClient.js`:

```js
// Thin wrapper around Mercury's REST API. The host is a fixed constant, never
// derived from user input, so this needs no SSRF hardening (unlike
// fetchSiteMetadata in the lead-enrichment service, which fetches arbitrary
// user-supplied domains).
const BASE_URL = 'https://api.mercury.com/api/v1';
const MAX_PAGES = 20; // safety cap: 20 pages x 100 = 2000 tx per sync call

async function mercuryFetch(path, params = {}, fetchImpl = fetch) {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  const res = await fetchImpl(url.href, {
    headers: {
      Authorization: `Bearer ${process.env.MERCURY_API_TOKEN}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mercury API ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function listAccounts(fetchImpl = fetch) {
  const data = await mercuryFetch('/accounts', {}, fetchImpl);
  return data.accounts.map(a => ({ id: a.id, name: a.name, type: a.type }));
}

export async function listAccountTransactions(accountId, { start, end } = {}, fetchImpl = fetch) {
  const results = [];
  let startAfter;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await mercuryFetch(`/account/${accountId}/transactions`, {
      start, end, limit: 100, order: 'asc', start_after: startAfter,
    }, fetchImpl);
    results.push(...data.transactions);
    if (data.transactions.length < 100) break;
    startAfter = data.transactions[data.transactions.length - 1].id;
  }
  return results;
}
```

- [ ] **Step 4: Add the .env.example entry**

In `.env.example`, after the `NOTIFY_EMAIL=...` line, add:

```
# ---- Mercury API (sincronización directa de transacciones bancarias) ----
# Token generado en Mercury → Settings → API Tokens (Read Only recomendado)
MERCURY_API_TOKEN=
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — all new `mercuryApiClient` tests green, everything else still green.

- [ ] **Step 6: Commit**

```bash
git add server/services/mercuryApiClient.js .env.example tests/ledger/mercuryApiClient.test.ts
git commit -m "feat: add Mercury REST API client with pagination and page cap"
```

---

### Task 3: Extract reconcileRows() from the CSV route (pure refactor)

**Files:**
- Modify: `server/routes/mercuryReconciliation.js`

**Interfaces:**
- Produces: `async function reconcileRows(rows)` — module-scoped (not exported), where `rows` is `Array<{Date: string, Description: string, Amount: string}>` (the exact shape `parseCsv` already returns per row). Returns `{ matched, unmatched, missing, suggested }` — the same four arrays `POST /` returns today, minus `parseErrors` (the caller attaches that).

This task changes no behavior — it only moves code. The full pre-existing `tests/ledger/mercuryReconciliation.test.ts` suite is the regression check; no new test file.

- [ ] **Step 1: Extract the matching logic into `reconcileRows`**

Replace the body of `server/routes/mercuryReconciliation.js` from the top through the end of the existing `router.post('/', ...)` handler with:

```js
import { Router } from 'express';
import LedgerAccount from '../models/LedgerAccount.js';
import JournalEntry from '../models/JournalEntry.js';
import { parseCsv } from '../utils/csvParser.js';
import { CASH_ACCOUNT_CODE } from '../seed/chartOfAccounts.js';
import { computeMatchScore } from '../utils/reconciliationScore.js';

const SUGGESTION_THRESHOLD = 0.5;

const router = Router();

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

async function reconcileRows(rows) {
    const cashAccount = await LedgerAccount.findOne({ code: CASH_ACCOUNT_CODE }).lean();
    if (!cashAccount) throw new Error('Cash account not seeded');

    const cashEntries = await JournalEntry.find({ status: 'posted', 'lines.accountId': cashAccount.id }).lean();
    const cashLines = [];
    for (const entry of cashEntries) {
        entry.lines.forEach((line, index) => {
            if (line.accountId === cashAccount.id) {
                cashLines.push({ entryId: entry._id.toString(), lineIndex: index, date: new Date(entry.date), amount: line.debit || -line.credit, memo: entry.memo, reconciled: !!line.reconciled });
            }
        });
    }

    const matched = [];
    const missing = [];
    const claimedCashLineKeys = new Set();

    for (const row of rows) {
        const bankDate = new Date(row.Date);
        const bankAmount = Number(row.Amount);
        const candidate = cashLines.find(l =>
            !l.reconciled &&
            !claimedCashLineKeys.has(`${l.entryId}:${l.lineIndex}`) &&
            sameDay(l.date, bankDate) &&
            Math.abs(l.amount - bankAmount) < 0.01
        );
        if (candidate) {
            claimedCashLineKeys.add(`${candidate.entryId}:${candidate.lineIndex}`);
            matched.push({ bankRow: row, journalEntryId: candidate.entryId, lineIndex: candidate.lineIndex });
        } else {
            missing.push({ bankRow: row });
        }
    }

    const unmatchedLines = cashLines
        .filter(l => !l.reconciled && !claimedCashLineKeys.has(`${l.entryId}:${l.lineIndex}`));

    const candidates = [];
    missing.forEach((m, missingIndex) => {
        unmatchedLines.forEach(line => {
            const { score, reasons } = computeMatchScore(m.bankRow, line);
            if (score >= SUGGESTION_THRESHOLD) {
                candidates.push({ missingIndex, line, score, reasons });
            }
        });
    });
    candidates.sort((a, b) => b.score - a.score);

    const suggested = [];
    const claimedMissingIndexes = new Set();
    const claimedSuggestedLineKeys = new Set();
    for (const c of candidates) {
        const lineKey = `${c.line.entryId}:${c.line.lineIndex}`;
        if (claimedMissingIndexes.has(c.missingIndex) || claimedSuggestedLineKeys.has(lineKey)) continue;
        claimedMissingIndexes.add(c.missingIndex);
        claimedSuggestedLineKeys.add(lineKey);
        suggested.push({
            bankRow: missing[c.missingIndex].bankRow,
            journalEntryId: c.line.entryId,
            lineIndex: c.line.lineIndex,
            confidence: c.score,
            reasons: c.reasons,
        });
    }

    const finalMissing = missing.filter((_, i) => !claimedMissingIndexes.has(i));
    const unmatched = unmatchedLines
        .filter(l => !claimedSuggestedLineKeys.has(`${l.entryId}:${l.lineIndex}`))
        .map(l => ({ journalEntryId: l.entryId, lineIndex: l.lineIndex, date: l.date, amount: l.amount }));

    return { matched, unmatched, missing: finalMissing, suggested };
}

router.post('/', async (req, res) => {
    try {
        const { csv } = req.body;
        if (typeof csv !== 'string') return res.status(400).json({ error: 'csv (string) is required' });
        const { rows, errors } = parseCsv(csv);
        const result = await reconcileRows(rows);
        res.json({ ...result, parseErrors: errors });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

Leave the existing `router.post('/confirm-match', ...)` handler and the `export default router;` line at the end of the file exactly as they are today — only the code above it changes.

- [ ] **Step 2: Run the full pre-existing suite to confirm no behavior changed**

Run: `pnpm test`
Expected: PASS — every test in `tests/ledger/mercuryReconciliation.test.ts` (all 10 cases) still passes unchanged, since `reconcileRows` is byte-for-byte the same logic, just extracted into a named function.

- [ ] **Step 3: Commit**

```bash
git add server/routes/mercuryReconciliation.js
git commit -m "refactor: extract reconcileRows() from the CSV route handler"
```

---

### Task 4: GET /accounts and POST /sync routes

**Files:**
- Modify: `server/routes/mercuryReconciliation.js`
- Test: `tests/ledger/mercuryReconciliation.test.ts`

**Interfaces:**
- Consumes: `reconcileRows(rows)` from Task 3 (same file, module-scoped); `MercuryTransaction` from Task 1; `listAccounts`/`listAccountTransactions` from Task 2.
- Produces: `export function createMercuryReconciliationRouter({ mercuryListAccounts = listAccounts, mercuryListTransactions = listAccountTransactions } = {})` — a named export alongside the existing default export, so tests can inject fake Mercury-API functions without hitting the network (the file's default export continues to use the real ones, unaffected).
  - `GET /accounts` → `200` with the array `mercuryListAccounts()` resolves to, or `502 { error }` on rejection.
  - `POST /sync` with body `{ accountId, start?, end? }` → `400 { error }` if `accountId` is missing/non-string; otherwise pulls transactions via `mercuryListTransactions`, upserts each into `MercuryTransaction`, maps to `{Date, Description, Amount}` rows, and responds with `{ ...reconcileRows(rows), parseErrors: [] }` (`200`), or `502 { error }` if the Mercury call or DB write throws.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `tests/ledger/mercuryReconciliation.test.ts` (add these imports to the top of the file alongside the existing ones):

```typescript
import { createMercuryReconciliationRouter } from '../../server/routes/mercuryReconciliation.js';
import MercuryTransaction from '../../server/models/MercuryTransaction.js';
```

Then append at the end of the file, before the final closing of the file (i.e. as new top-level `describe` blocks):

```typescript
describe('GET /api/mercury-import/accounts', () => {
  it('returns the accounts the injected Mercury client resolves', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListAccounts: async () => [{ id: 'acc_1', name: 'Checking', type: 'checking' }],
    }));

    const res = await request(testApp).get('/api/mercury-import/accounts');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, [{ id: 'acc_1', name: 'Checking', type: 'checking' }]);
  });

  it('returns 502 when the Mercury client throws', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({
      mercuryListAccounts: async () => { throw new Error('Mercury API /accounts failed: 401 unauthorized'); },
    }));

    const res = await request(testApp).get('/api/mercury-import/accounts');
    assert.equal(res.status, 502);
    assert.match(res.body.error, /Mercury API/);
  });
});

describe('POST /api/mercury-import/sync', () => {
  function buildApp(mercuryListTransactions: (...args: any[]) => Promise<any[]>) {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/mercury-import', createMercuryReconciliationRouter({ mercuryListTransactions }));
    return testApp;
  }

  it('rejects a request with no accountId', async () => {
    const testApp = buildApp(async () => []);
    const res = await request(testApp).post('/api/mercury-import/sync').send({});
    assert.equal(res.status, 400);
  });

  it('persists fetched transactions into MercuryTransaction and reconciles them like the CSV path', async () => {
    await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 500, amountUSD: 500 },
            { accountId: 'coa_1000', credit: 500, amountUSD: 500 },
        ],
    });
    const testApp = buildApp(async () => [
      { id: 'tx_1', amount: -500, status: 'sent', postedAt: '2026-07-01', description: 'AWS Hosting', counterpartyName: 'AWS' },
    ]);

    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1', start: '2026-07-01', end: '2026-07-31' });

    assert.equal(res.status, 200);
    assert.equal(res.body.matched.length, 1);

    const stored = await MercuryTransaction.find({ mercuryAccountId: 'acc_1' }).lean();
    assert.equal(stored.length, 1);
    assert.equal(stored[0].mercuryTransactionId, 'tx_1');
    assert.equal(stored[0].amount, -500);
  });

  it('syncing an overlapping range twice does not duplicate persisted transactions', async () => {
    const fetchTx = [
      { id: 'tx_1', amount: -25, status: 'sent', postedAt: '2026-07-01', description: 'Fee', counterpartyName: 'Bank' },
    ];
    const testApp = buildApp(async () => fetchTx);

    await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });
    await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });

    const stored = await MercuryTransaction.find({ mercuryAccountId: 'acc_1' }).lean();
    assert.equal(stored.length, 1);
  });

  it('returns 502 when the Mercury client throws', async () => {
    const testApp = buildApp(async () => { throw new Error('Mercury API /account/acc_1/transactions failed: 500'); });
    const res = await request(testApp).post('/api/mercury-import/sync').send({ accountId: 'acc_1' });
    assert.equal(res.status, 502);
    assert.match(res.body.error, /Mercury API/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `createMercuryReconciliationRouter is not a function` (not yet exported).

- [ ] **Step 3: Implement the routes**

In `server/routes/mercuryReconciliation.js`, add the import at the top (alongside the existing imports):

```js
import MercuryTransaction from '../models/MercuryTransaction.js';
import { listAccounts, listAccountTransactions } from '../services/mercuryApiClient.js';
```

After Task 3, the file's structure is: imports, `SUGGESTION_THRESHOLD`, `const router = Router();`, `sameDay`, `reconcileRows`, `router.post('/', ...)`, `router.post('/confirm-match', ...)`, `export default router;`.

**Replace everything from `const router = Router();` through the end of the file** (i.e. keep the imports, `SUGGESTION_THRESHOLD`, `sameDay`, and `reconcileRows` exactly as Task 3 left them, but remove the standalone `const router = Router();` line and every `router.post(...)` handler below it — they get rebuilt inside the factory below, so leaving the old ones in place would redeclare `router` and throw a SyntaxError) with:

```js
export function createMercuryReconciliationRouter({
    mercuryListAccounts = listAccounts,
    mercuryListTransactions = listAccountTransactions,
} = {}) {
    const scopedRouter = Router();

    scopedRouter.post('/', async (req, res) => {
        try {
            const { csv } = req.body;
            if (typeof csv !== 'string') return res.status(400).json({ error: 'csv (string) is required' });
            const { rows, errors } = parseCsv(csv);
            const result = await reconcileRows(rows);
            res.json({ ...result, parseErrors: errors });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    scopedRouter.post('/confirm-match', async (req, res) => {
        try {
            const { journalEntryId, lineIndex } = req.body;
            if (typeof journalEntryId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(journalEntryId)) {
                return res.status(400).json({ error: 'Invalid journalEntryId' });
            }
            const entry = await JournalEntry.findById(journalEntryId);
            if (!entry) return res.status(404).json({ error: 'Journal entry line not found' });
            if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= entry.lines.length) {
                return res.status(404).json({ error: 'Journal entry line not found' });
            }
            entry.lines[lineIndex].reconciled = true;
            await entry.save();
            res.json(entry.toObject());
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    scopedRouter.get('/accounts', async (req, res) => {
        try {
            res.json(await mercuryListAccounts());
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });

    scopedRouter.post('/sync', async (req, res) => {
        try {
            const { accountId, start, end } = req.body;
            if (typeof accountId !== 'string' || !accountId) {
                return res.status(400).json({ error: 'accountId is required' });
            }
            const transactions = await mercuryListTransactions(accountId, { start, end });

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
                } },
                { upsert: true }
            )));

            const rows = transactions.map(t => ({
                Date: t.postedAt ?? t.createdAt,
                Description: t.description ?? '',
                Amount: String(t.amount),
            }));
            const result = await reconcileRows(rows);
            res.json({ ...result, parseErrors: [] });
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });

    return scopedRouter;
}

const router = createMercuryReconciliationRouter();
export default router;
```

**Note:** `reconcileRows` and `sameDay` (defined earlier in the file, from Task 3) stay module-scoped functions, not redeclared inside `createMercuryReconciliationRouter` — they don't depend on the injected Mercury functions, only `/accounts` and `/sync` do.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all new `GET /accounts` and `POST /sync` tests green, all pre-existing tests in the file (which use the default-exported `router`, unaffected by the refactor) still green.

- [ ] **Step 5: Commit**

```bash
git add server/routes/mercuryReconciliation.js tests/ledger/mercuryReconciliation.test.ts
git commit -m "feat: add GET /accounts and POST /sync routes for direct Mercury API reconciliation"
```

---

### Task 5: Frontend — account selector, date range, sync button

**Files:**
- Modify: `components/ledger/ReconciliationTab.tsx`

**Interfaces:**
- Consumes: `GET /api/mercury-import/accounts` → `{id: string, name: string, type: string}[]`; `POST /api/mercury-import/sync` with `{accountId, start, end}` → same `ImportResult` shape the CSV path already returns (defined at the top of this file).

No new automated test — this is a manual browser-testable UI change per the project's own convention ("For UI or frontend changes ... test the feature in a browser before reporting the task as complete"); the backend routes it calls are already covered by Task 4's tests.

- [ ] **Step 1: Add account/date state and the accounts fetch**

In `components/ledger/ReconciliationTab.tsx`, add to the imports:

```typescript
import React, { useState, useEffect } from 'react';
import { Upload, CheckCircle, AlertTriangle, HelpCircle, Sparkles, RefreshCw } from 'lucide-react';
```

Add a type near the top, after `ImportResult`:

```typescript
type MercuryAccount = { id: string; name: string; type: string };

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}
```

Inside `ReconciliationTab()`, after the existing `useState` calls, add:

```typescript
  const [accounts, setAccounts] = useState<MercuryAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [{ start, end }, setDateRange] = useState(defaultDateRange());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    apiFetch('/api/mercury-import/accounts')
      .then(res => res.ok ? res.json() : [])
      .then((list: MercuryAccount[]) => {
        setAccounts(list);
        if (list.length > 0) setAccountId(list[0].id);
      })
      .catch(() => setAccounts([]));
  }, []);
```

- [ ] **Step 2: Add the sync handler**

After the existing `handleFile` function, add:

```typescript
  const handleSync = async () => {
    if (!accountId) return;
    setBusy(true);
    setSyncing(true);
    setError('');
    try {
      const res = await apiFetch('/api/mercury-import/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, start, end }),
      });
      if (res.ok) {
        setResult(await res.json());
      } else {
        const body = await res.json().catch(() => ({ error: 'Error desconocido' }));
        setError(body.error || 'No se pudo sincronizar con Mercury.');
      }
    } finally {
      setBusy(false);
      setSyncing(false);
    }
  };
```

- [ ] **Step 3: Render the account selector, date inputs, and sync button**

Replace the existing upload `<label>` block:

```tsx
      <label className="flex items-center gap-2 w-fit cursor-pointer bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-800 mb-6">
        <Upload size={16} /> Subir CSV de Mercury
        <input type="file" accept=".csv" className="hidden" onChange={handleFile} disabled={busy} />
      </label>
```

with:

```tsx
      <div className="flex flex-wrap items-end gap-3 mb-6">
        {accounts.length > 0 && (
          <>
            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Cuenta Mercury</label>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                disabled={busy}
              >
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Desde</label>
              <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={start} onChange={e => setDateRange(r => ({ ...r, start: e.target.value }))} disabled={busy} />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Hasta</label>
              <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={end} onChange={e => setDateRange(r => ({ ...r, end: e.target.value }))} disabled={busy} />
            </div>
            <button
              onClick={handleSync}
              disabled={busy || !accountId}
              className="flex items-center gap-2 bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-800 disabled:opacity-50"
            >
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} /> Sincronizar con Mercury
            </button>
          </>
        )}
        <label className="flex items-center gap-2 w-fit cursor-pointer bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200">
          <Upload size={16} /> Subir CSV de Mercury
          <input type="file" accept=".csv" className="hidden" onChange={handleFile} disabled={busy} />
        </label>
      </div>
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors introduced by this file.

- [ ] **Step 5: Manual browser verification**

Start the app with `pnpm dev:full`, log in, navigate to the Ledger's reconciliation tab, and confirm:
- The account selector populates from `GET /api/mercury-import/accounts`.
- The date inputs default to a 30-day range.
- Clicking "Sincronizar con Mercury" calls `POST /api/mercury-import/sync` and renders the same matched/suggested/unmatched/missing sections the CSV path already renders.
- The CSV upload button still works as a fallback.

- [ ] **Step 6: Commit**

```bash
git add components/ledger/ReconciliationTab.tsx
git commit -m "feat: add Mercury account selector, date range, and direct sync button to reconciliation UI"
```
