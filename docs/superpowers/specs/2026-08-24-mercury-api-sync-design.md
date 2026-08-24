# Mercury Direct API Sync — Design

## Problem

Reconciliation against Mercury today requires a human to log into Mercury,
export a CSV, and upload it to `POST /api/mercury-import`. This is the only
manual step left in an otherwise automated close process. Mercury exposes a
REST API (`https://api.mercury.com/api/v1`) that can list accounts and
account transactions directly, so the CSV step can be replaced by a
button-triggered sync.

## Goals

- Let a user pick a Mercury account and a date range in the existing
  reconciliation UI, click "Sincronizar con Mercury", and get the same
  matched/suggested/unmatched/missing result the CSV flow produces today.
- Persist every transaction pulled from Mercury in MongoDB as an audit
  trail, keyed so repeated syncs of the same range are idempotent (no
  duplicate rows).
- Support multiple Mercury accounts — the user picks which one to sync
  against a run, not a single hardcoded account.
- Never expose `MERCURY_API_TOKEN` to the frontend.

## Non-goals

- No scheduled/background sync — this is a manual, button-triggered action
  (per explicit decision; revisit only if the manual flow proves too slow
  in practice).
- No changes to how reconciliation *matching* works — `computeMatchScore`,
  the exact-match pass, and the `confirm-match` endpoint are reused as-is.
- No UI or API for editing/deleting persisted `MercuryTransaction` rows —
  they are a read-only cache populated only by the sync endpoint.
- No support for Mercury account types beyond checking/savings (credit
  cards, treasury) — out of scope until a real need appears.

## Architecture

```
ReconciliationTab.tsx
  ├─ GET  /api/mercury-import/accounts   → account picker
  └─ POST /api/mercury-import/sync       → { accountId, start, end }
                                               │
                                               ▼
                                    mercuryReconciliation.js
                                               │
                              ┌────────────────┴────────────────┐
                              ▼                                 ▼
                    mercuryApiClient.js                MercuryTransaction
                 (fetch Mercury REST API)              (Mongoose upsert)
                              │                                 │
                              └────────────► reconcileRows() ◄──┘
                                          (existing matching logic,
                                           extracted from the CSV path)
```

### `server/services/mercuryApiClient.js` (new)

Thin wrapper around Mercury's REST API. No SSRF hardening needed here —
unlike lead enrichment's `fetchSiteMetadata`, the host is a fixed constant
(`api.mercury.com`), never derived from user input.

```js
const BASE_URL = 'https://api.mercury.com/api/v1';

async function mercuryFetch(path, params = {}) {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url.href, {
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

export async function listAccounts() {
  const data = await mercuryFetch('/accounts');
  return data.accounts.map(a => ({ id: a.id, name: a.name, type: a.type }));
}

const MAX_PAGES = 20; // safety cap: 20 pages × 100 = 2000 tx per sync call

export async function listAccountTransactions(accountId, { start, end } = {}) {
  const results = [];
  let startAfter;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await mercuryFetch(`/account/${accountId}/transactions`, {
      start, end, limit: 100, order: 'asc', start_after: startAfter,
    });
    results.push(...data.transactions);
    if (data.transactions.length < 100) break;
    startAfter = data.transactions[data.transactions.length - 1].id;
  }
  return results;
}
```

`mercuryFetch` is exported too, so tests can inject a fake `fetch` without
mocking the module's own ESM bindings (same reasoning as `checkSmtp`'s
`transporterGetter` in `health.js`).

### `server/models/MercuryTransaction.js` (new)

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

The unique compound index is what makes sync idempotent: syncing an
overlapping date range twice upserts the same rows instead of duplicating
them.

### `server/routes/mercuryReconciliation.js` (extend)

The existing matching logic (everything currently inline in `POST /`,
lines ~20–98 of the current file) is extracted into a module-level
function:

```js
async function reconcileRows(rows) {
  // exact-match pass, fuzzy pass, matched/suggested/unmatched/missing —
  // unchanged logic, just no longer only reachable from POST /
}
```

`POST /` (CSV path) becomes:

```js
router.post('/', async (req, res) => {
  const { csv } = req.body;
  if (typeof csv !== 'string') return res.status(400).json({ error: 'csv (string) is required' });
  const { rows, errors } = parseCsv(csv);
  const result = await reconcileRows(rows);
  res.json({ ...result, parseErrors: errors });
});
```

New routes:

```js
router.get('/accounts', async (req, res) => {
  try {
    res.json(await listAccounts());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const { accountId, start, end } = req.body;
    if (typeof accountId !== 'string' || !accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }
    const transactions = await listAccountTransactions(accountId, { start, end });

    await Promise.all(transactions.map(t => MercuryTransaction.updateOne(
      { mercuryAccountId: accountId, mercuryTransactionId: t.id },
      { $set: {
          amount: t.amount, status: t.status, postedAt: t.postedAt,
          description: t.description, counterpartyName: t.counterpartyName,
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
```

`reconcileRows` expects the same `{Date, Description, Amount}` shape
`parseCsv` already produces, so the Mercury-API path maps into it instead
of duplicating any matching logic.

### `components/ledger/ReconciliationTab.tsx` (extend)

- On mount, `GET /api/mercury-import/accounts` to populate a `<select>`.
- Two `<input type="date">` fields, defaulted to `today - 30 days` →
  `today`, matching Mercury's own API default.
- A second button, "Sincronizar con Mercury", calling
  `POST /api/mercury-import/sync` with `{accountId, start, end}` and
  setting `result` from the response — identical shape to the CSV path, so
  the existing render block (matched/suggested/unmatched/missing) needs no
  changes.
- The CSV upload button stays as a fallback/manual-override path.

## Error handling

- Mercury API errors (network, timeout, non-2xx) surface as `502` with
  `err.message` — same convention already used for external-dependency
  failures elsewhere (e.g. `health.js`'s SMTP check). No secrets are ever
  in that message since the token lives only in a request header we never
  echo back.
- `MAX_PAGES` caps a single sync call's Mercury API calls, protecting
  against a runaway loop if the API ever returns malformed pagination.

## Testing

- `tests/mercuryApiClient.test.ts` — inject a fake `fetch` via a thin
  wrapper (mirroring `checkSmtp`'s `transporterGetter` pattern) to test
  pagination (multi-page loop, respects `MAX_PAGES`), and error surfacing
  on non-2xx.
- `tests/mercuryTransaction.test.ts` — upsert idempotency: syncing the same
  transaction twice results in one document, updated fields overwrite
  their previous values.
- `tests/mercuryReconciliation.test.ts` (extend existing) — `POST /sync`
  end-to-end against `mongodb-memory-server` with an injected fake Mercury
  client, asserting the response shape matches the CSV path's shape
  exactly, and that a second sync of an overlapping range doesn't double
  the persisted transaction count.

## Security

- `MERCURY_API_TOKEN` stays a server-side `.env` var, read only inside
  `mercuryApiClient.js` — never serialized into any API response.
- New routes inherit `requireAuth` (mounted globally in `server/index.js`
  before the router) — same protection level as the existing CSV path.
- No user-controlled URL ever reaches `fetch` — `BASE_URL` is a constant
  and `accountId`/`start`/`end` are passed as query params, not as part of
  a URL a user could redirect.
