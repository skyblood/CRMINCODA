# Mercury Integration Hardening — Design

## Context

Following an audit of the Mercury sync/approve feature (docs/superpowers/plans/
2026-08-24-mercury-api-sync.md and 2026-08-24-mercury-approve-missing.md), six
concrete improvements were identified and explicitly approved for
implementation as a batch, without further per-item confirmation ("implementar
todos, no preguntar, mejorar"). Ambiguous implementation choices below are
resolved by the author's own judgment and recorded as rulings inline, per the
same "rulings, not stalls" principle used during this session's
subagent-driven-development work.

## Goals

1. **Server-side finance-permission enforcement.** Every Ledger-family route
   (`/api/mercury-import`, `/api/journal-entries`, `/api/ledger-accounts`,
   `/api/ledger-reports`) currently enforces only `requireAuth` — any
   authenticated user of any role can call them directly, bypassing the
   frontend's `perm.finance` route gate. This is the highest-priority item:
   it's a real broken-access-control gap, made more acute by Mercury now
   exposing real bank/payroll data and financial-transaction-creation
   endpoints through those same routes.
2. **Editable tax category on approve** — replace the read-only "Categoría
   sugerida" text with an editable dropdown, and let `/approve` accept an
   optional override.
3. **Bulk approve** — approve every currently-suggested "missing" row in one
   action, using each row's (possibly overridden) category.
4. **Rate limit headroom** — bulk approve can burst well past the current
   60-mutations/15-min write tier; give `/api/mercury-import`'s mutating
   routes a larger, dedicated budget.
5. **"Ver en Mercury" links** — Mercury's own API returns a `dashboardLink`
   per transaction; capture and surface it so a user can jump to the
   transaction's real Mercury page (which has attachments/receipts,
   see Non-goals) without CRMINCODA re-hosting any files.
6. **Retention** — `MercuryTransaction` rows are cached forever today with no
   expiry; add a TTL so old cache rows don't accumulate indefinitely.
7. **Optional nightly background sync** — a cache-warming cron job (mirroring
   the existing `leadEnrichmentScheduler.js`/`invoiceScheduler.js` pattern)
   that syncs every Mercury account's transactions in the background, so the
   cache is fresher before a user ever clicks "Sincronizar." Inert if
   `MERCURY_API_TOKEN` isn't configured (same convention as lead enrichment's
   `ANTHROPIC_API_KEY` gate).

## Non-goals (explicitly out of scope for this batch)

- **Downloading/re-hosting Mercury attachments.** The audit's original
  finding was "attachments exist in Mercury but we don't capture them" — on
  reflection, building blob storage plus an authenticated per-attachment
  fetch flow is a materially bigger feature (storage infra, access control
  for the files themselves) than the rest of this batch. The `dashboardLink`
  field (Goal 5) covers the practical need — a user can view/download the
  actual receipt from Mercury's own UI — without CRMINCODA taking on file
  storage. Revisit only if a real need for offline/in-app receipt access
  surfaces.
- **Introducing a frontend test framework.** No component in this codebase
  has automated tests today (verified: zero `*.test.tsx`/testing-library
  usage anywhere in the repo). Adding one now, for this feature alone, would
  be a disproportionate net-new-infrastructure decision unrelated to the
  actual improvements requested. Frontend changes in this batch remain
  manually/visually verified, consistent with this session's established
  precedent for every prior frontend change.
- **Scheduled sync configurability** (choosing which accounts, custom cron
  time, etc.) — the nightly job syncs every account returned by
  `listAccounts()` unconditionally; no per-account opt-out or custom
  schedule UI. If a real need for that arises later, it's a small follow-up.

## Design

### 1. Server-side finance-permission enforcement

New middleware in `server/middleware/requireAuth.js`, mirroring the existing
`requireAdmin`:

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

**Ruling:** admin bypasses (matches `requireAdmin`'s own admin-or-flag
pattern and this codebase's stated convention — "admin bypasses all
restrictions" per CLAUDE.md). `role === 'admin'` is intentionally NOT checked
here (unlike `requireAdmin`) — `permissions.admin` is the authoritative flag
this app actually seeds/manages for admins (confirmed via
`server/seed/userPermissions.js`), and `finance` is a real, independently
assignable flag per `server/models/User.js`'s default permissions object; a
`role: 'admin'` user without the flag set would be a data-integrity anomaly
outside this feature's concern.

Applied at the four route mounts in `server/index.js`:

```js
app.use('/api/mercury-import', requireFinance, mercuryReconciliationRouter);
app.use('/api/journal-entries', requireFinance, journalEntriesRouter);
app.use('/api/ledger-accounts', requireFinance, ledgerAccountsRouter);
app.use('/api/ledger-reports', requireFinance, ledgerReportsRouter);
```

**Ruling:** `close-period`'s existing inline `role !== 'admin'` check inside
`journalEntries.js` stays as-is (it's a stricter sub-check within an
already-finance-gated route, not redundant — closing a period is more
sensitive than posting to one).

### 2. MercuryTransaction: dashboardLink + TTL retention

Two schema additions to `server/models/MercuryTransaction.js`:

```js
dashboardLink: String,
```

```js
// Cache rows expire after ~2 years — this is a reconciliation cache fed
// fresh by every sync, not a system of record (the resulting JournalEntry
// is the permanent record once a row is approved); nothing depends on rows
// surviving indefinitely.
MercuryTransactionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 730 });
```

`createdAt` already exists via `{ timestamps: true }`. Mongoose TTL indexes
require the indexed field to be a `Date` — `createdAt` already is.

`POST /sync`'s `$set` gains `dashboardLink: t.dashboardLink ?? null`, and the
`rows` mapping gains `dashboardLink: t.dashboardLink` so it flows into
`missing[i].bankRow` the same way `mercuryTransactionId` already does.

Frontend: in the "Faltantes" row, when `bankRow.dashboardLink` is present,
render a small "Ver en Mercury ↗" link (`target="_blank" rel="noreferrer"`)
next to the suggested category.

### 3. Editable tax category on approve

**Backend** — `POST /approve` accepts an optional `taxCategory` in the
request body. If present, it's validated against real seeded expense
accounts (dynamic, not a hardcoded list — mirrors `findExpenseAccount`'s own
lookup convention in `ledgerPostingService.js`):

```js
let taxCategory = suggestTaxCategory(mtx.mercuryCategoryName);
if (typeof req.body.taxCategory === 'string' && req.body.taxCategory) {
    const validAccount = await LedgerAccount.findOne({ type: 'expense', taxCategory: req.body.taxCategory }).lean();
    if (!validAccount) return res.status(400).json({ error: 'Invalid taxCategory' });
    taxCategory = req.body.taxCategory;
}
```

**Frontend** — the static "Categoría sugerida: X" text becomes a `<select>`
pre-filled with the suggested category, listing every known `TaxCategory`
(the same static list `CompanyExpensesTab.tsx` already hardcodes — reuse it
rather than fetching `LedgerAccount`s just for this dropdown). Local
per-row state tracks the current selection; `approveMissing` sends the
selected value as `taxCategory` in the request body.

### 4. Bulk approve

**Backend** — new route `POST /api/mercury-import/approve-many`, body
`{ items: [{ mercuryTransactionId, taxCategory? }, ...] }` (max 100 items per
call — a sanity cap, not a real expected volume). Reuses the exact same
per-item logic `/approve` already has (sign guard, idempotency, posting
verification) by extracting that logic into a shared `approveOne(mtx,
taxCategoryOverride)` helper function that both `/approve` and
`/approve-many` call. Response: `{ results: [{ mercuryTransactionId, status,
id?, taxCategory?, error? }, ...] }` — one entry per input item, never
short-circuiting the whole batch on a single item's failure (a positive-amount
row failing its sign guard shouldn't block the other 19 rows in the batch).

**Ruling:** `approve-many` is NOT wrapped in a MongoDB transaction — this
app's Mongoose connection isn't confirmed to run against a replica set (a
requirement for multi-document transactions), and each item's own
idempotency/error-handling is already self-contained per the existing
`/approve` design; a partial-batch failure is an acceptable, visible-to-the-
user outcome (the response's per-item `status` shows exactly what happened),
not a silent one.

**Frontend** — an "Aprobar todas (N)" button above the "Faltantes" list,
enabled when at least one row has `mercuryTransactionId` and a negative
amount. Sends every eligible row's `mercuryTransactionId` + its current
dropdown-selected `taxCategory`. On response, removes every item with
`status: 'approved'` from `missing` and adds it to `approvedRows`; any item
with `status: 'error'` stays in `missing` with its error surfaced inline
(reuse the existing `error` banner, concatenating messages if more than one
row failed).

### 5. Rate limit headroom

`server/index.js`'s explicit `/api/mercury-import/*` write-route
registrations (added in the rate-limiter architecture fix) move from the
shared `writeLimit` (60/15min) to a new, higher dedicated limiter:

```js
const mercuryWriteLimit = makeLimit(15 * 60 * 1000, 300, 'Too many Mercury actions. Please wait before approving more.');
```

**Ruling:** 300/15min sized to comfortably cover a full bulk-approve of the
100-item cap (Goal 4) plus normal sync/CSV/confirm-match traffic in the same
window, without becoming a de facto unlimited bucket.

### 6. Nightly background sync scheduler

New `server/jobs/mercurySyncScheduler.js`, mirroring
`leadEnrichmentScheduler.js`'s shape exactly:

```js
import cron from 'node-cron';
import { listAccounts, listAccountTransactions } from '../services/mercuryApiClient.js';
import MercuryTransaction from '../models/MercuryTransaction.js';

export async function runNightlyMercurySyncJob() {
  if (!process.env.MERCURY_API_TOKEN) return; // inert without a token, same convention as lead enrichment's ANTHROPIC_API_KEY gate
  console.log(`[MercurySync] Running at ${new Date().toISOString()}`);
  let accounts;
  try {
    accounts = await listAccounts();
  } catch (err) {
    console.error('[MercurySync] Failed to list accounts:', err.message);
    return;
  }
  let synced = 0;
  for (const account of accounts) {
    try {
      const transactions = await listAccountTransactions(account.id);
      await Promise.all(transactions.map(t => MercuryTransaction.updateOne(
        { mercuryAccountId: account.id, mercuryTransactionId: t.id },
        { $set: { /* same $set shape as POST /sync — see below */ } },
        { upsert: true }
      )));
      synced += transactions.length;
    } catch (err) {
      console.error(`[MercurySync] Failed to sync account ${account.id}:`, err.message);
    }
  }
  console.log(`[MercurySync] Done. Cached ${synced} transactions across ${accounts.length} account(s).`);
}

export function startMercurySyncScheduler() {
  cron.schedule('0 4 * * *', runNightlyMercurySyncJob, { timezone: 'America/Bogota' });
  console.log('[MercurySync] Scheduled daily at 04:00 America/Bogota');
}
```

**Ruling:** the `$set` shape is a verbatim duplicate of `POST /sync`'s own
upsert `$set` object — rather than importing/sharing code between a route
file and a job file (an awkward cross-layer dependency for ~10 lines), it's
extracted into one small shared helper,
`mapMercuryTransactionToUpsert(accountId, t)`, exported from
`server/services/mercuryApiClient.js` (already the natural home for
Mercury-API-shape-specific logic) and imported by both `POST /sync` and the
new scheduler. This also mechanically prevents the two call sites from
drifting out of sync on which fields get captured.

`server/index.js` gains `import { startMercurySyncScheduler } from
'./jobs/mercurySyncScheduler.js';` and a `startMercurySyncScheduler();` call
alongside the existing `startInvoiceScheduler(); startLeadEnrichmentScheduler();`
line. Scheduled at 04:00 America/Bogota — after lead enrichment (03:00),
avoiding both jobs' startup windows overlapping.

## Testing

- `tests/*.test.ts` (new, top-level like `tests/health.test.ts` — this
  middleware isn't ledger-specific) for `requireFinance`: 401 with no
  session, 403 with `finance: false` and no `admin`, 200 (via a dummy
  downstream handler) with `finance: true`, 200 with `admin: true` and no
  `finance` key.
- `tests/ledger/mercuryReconciliation.test.ts` extended: dashboardLink
  persisted and exposed on `missing` rows; `/approve` accepts and validates
  a `taxCategory` override (valid override succeeds with that category,
  invalid override 400s, no override still uses the suggested category as
  before); `/approve-many` happy path (multiple items, all succeed, each
  gets its own `JournalEntry`), partial failure (one positive-amount item
  fails its own sign guard, others still succeed), and the 100-item cap
  (over-cap request 400s without processing anything).
- `tests/ledger/mercuryTransaction.test.ts` extended: TTL index exists with
  the expected `expireAfterSeconds` (Mongoose exposes this on the compiled
  schema's indexes — verified via `mongoose.model('MercuryTransaction')
  .schema.indexes()`, not by actually waiting 2 years).
- `server/jobs/mercurySyncScheduler.js`'s `runNightlyMercurySyncJob` gets a
  new `tests/ledger/mercurySyncScheduler.test.ts`: inert when
  `MERCURY_API_TOKEN` is unset (no accounts fetched — verify via an injected
  fake that asserts it's never called), upserts transactions for every
  account when the token is set (injected fake `listAccounts`/
  `listAccountTransactions`), and one account's failure doesn't stop the
  others from syncing.

## Security

`requireFinance` is the security-relevant change in this batch — it's a
tightening (routes that were reachable by any authenticated user become
reachable only by `finance`/`admin` users), never a loosening, so it carries
no new exposure risk. The one behavioral risk is disruption: if any existing,
legitimate flow depends on a non-finance user hitting one of these four route
families (verified: none of the four mounted routers are imported/called by
any non-Ledger frontend code path — `grep`-confirmed no cross-module fetches
to `/api/journal-entries`, `/api/ledger-accounts`, `/api/ledger-reports`, or
`/api/mercury-import` outside `components/ledger/*.tsx`), this would 403 it.
Given the confirmed absence of such a dependency, the change is safe to ship
directly rather than behind a flag.
