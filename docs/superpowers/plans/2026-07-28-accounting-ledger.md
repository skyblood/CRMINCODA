# Módulo de Contabilidad (Libro Mayor) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, visible, editable double-entry general ledger (chart of accounts + journal entries) to CRMINCODA, layered on top of the existing operational finance models, so INCODA USA LLC gets tax-ready (Schedule C) bookkeeping, Mercury bank reconciliation, and auto-generated P&L/Balance Sheet.

**Architecture:** Two layers. The existing operational layer (`Transaction`, `Invoice`, `Payment`, `Commission`) is untouched in its core behavior. A new ledger layer (`LedgerAccount`, `JournalEntry`) is posted to automatically via Mongoose schema-level hooks (not route-layer calls, because `commissions.js` uses the generic `createCrudRouter` with no custom route code to hook into). Posting is best-effort and non-blocking — never atomic with the originating write — because this MongoDB deployment (prod and `mongodb-memory-server` test harness) runs standalone, without a replica set, so `session.startTransaction()` is unavailable.

**Tech Stack:** Express 4 + Mongoose 8 (ESM) backend, React 18 + TypeScript frontend, Node's native `node:test` runner (`node --import tsx/esm --test`) with `mongodb-memory-server` for integration tests, Socket.IO for realtime sync, Tailwind CSS (CDN, no build step) for styling.

## Global Constraints

- No MongoDB multi-document transactions anywhere in this feature (`session.startTransaction()` is not supported — standalone Mongo in prod and in tests). Every posting function creates one `JournalEntry` per call and must never throw past its own hook.
- Cash-basis accounting only. Invoice issuance never posts to the ledger; only actual cash movement (`Payment`, expense `Transaction`, consultant payment, paid `Commission`) posts.
- Posting hooks live on Mongoose schemas (`post('save')` / `post('findOneAndUpdate')`), not inside Express route handlers.
- Every new/modified route that mutates data must call `emitCollectionChange(collection, operation, doc)` from `server/socketInstance.js` (existing convention in `payments.js`/`invoices.js`; `transactions.js` currently skips this and must not be copied).
- New write routes must be registered in the `readRoutes`/`dataRoutes` rate-limit arrays in `server/index.js`, matching the existing pattern for every other data module.
- Module access is gated by a new `permissions.finance` boolean on `User`, following the existing `permissions: {dashboard, crm, projects, portal, admin}` pattern — `role === 'admin'` always bypasses, exactly like every other module.
- No new npm dependencies. The Mercury CSV parser is hand-written (no `csv-parse` etc. is in `package.json`).
- Test runner is `node --import tsx/esm --test tests/*.test.ts` (see `package.json`), **not** vitest. Integration tests use `mongodb-memory-server`, following the existing pattern in `tests/financial-balance/setup.js`.
- IDs: models reachable through the generic `createCrudRouter` (`LedgerAccount`) need a custom `id: String` field (client-generated, e.g. `` `la_${Date.now()}` ``, matching `components/AccountManager.tsx`'s convention). Models with hand-written routes (`JournalEntry`) use Mongo's native `_id`, matching `Payment`/`Commission`.

---

## File Structure

**Backend — new files:**
- `server/models/LedgerAccount.js` — chart of accounts schema
- `server/models/JournalEntry.js` — journal entries schema (lines, balance validation)
- `server/models/LedgerPeriodClose.js` — tracks which year/month is reconciled and locked
- `server/seed/chartOfAccounts.js` — default chart of accounts + category→account mapping table
- `server/services/ledgerPostingService.js` — `postExpense`, `postConsultantPayment`, `postPaymentReceived`, `postCommissionPaid`
- `server/routes/ledgerAccounts.js` — generic CRUD for chart of accounts
- `server/routes/journalEntries.js` — list/create manual/void journal entries, period-close guard
- `server/routes/ledgerReports.js` — trial balance, P&L, Balance Sheet, 1099 report
- `server/routes/mercuryReconciliation.js` — CSV import, matching, period close
- `server/utils/csvParser.js` — small RFC4180-ish CSV parser (no external dependency)

**Backend — modified files:**
- `server/models/Transaction.js` — add `taxCategory`, `postingStatus` fields + `post('save')` hook
- `server/models/Payment.js` — add `postingStatus` field + `post('save')` hook
- `server/models/Commission.js` — add `postingStatus` field + `post('findOneAndUpdate')` hook
- `server/models/User.js` — add `finance: false` to the `permissions` default
- `server/index.js` — register the 4 new routers, add them to rate-limit arrays, seed chart of accounts on startup
- `tests/financial-balance/setup.js` — not modified (see Task 3 for why a dedicated `tests/ledger/setup.js` is used instead)

**Frontend — new files:**
- `components/ledger/ChartOfAccountsTab.tsx`
- `components/ledger/JournalTab.tsx`
- `components/ledger/CompanyExpensesTab.tsx`
- `components/ledger/ReportsTab.tsx` (P&L + Balance Sheet)
- `components/ledger/ReconciliationTab.tsx`
- `components/ledger/TenNinetyNineTab.tsx`
- `components/Ledger.tsx` — tab shell

**Frontend — modified files:**
- `types.ts` — `LedgerAccount`, `JournalLine`, `JournalEntry`, `TaxCategory`, `ModulePermissions.finance`
- `App.tsx` — lazy import, `/ledger` route, sidebar link, `permissions.finance` in 3 `INITIAL_USERS` demo entries
- `components/UserManagement.tsx` — `defaultPermissions`, `getPermissionsForRole`, add "Finance / Ledger" toggle to the permissions editor UI
- `components/FinanceManager.tsx` — remove the `'general'` expense-link-type option

---

### Task 1: `LedgerAccount` model + default chart of accounts

**Files:**
- Create: `server/models/LedgerAccount.js`
- Create: `server/seed/chartOfAccounts.js`
- Test: `tests/ledger/ledgerAccount.test.ts`

**Interfaces:**
- Produces: `LedgerAccount` Mongoose model with fields `{ id, code, name, type, normalBalance, taxCategory, isActive }`. `type` ∈ `['asset','liability','equity','income','expense']`. `normalBalance` is auto-derived (`'debit'` for `asset`/`expense`, `'credit'` otherwise) — never set by the caller.
- Produces (from `server/seed/chartOfAccounts.js`): `DEFAULT_CHART_OF_ACCOUNTS` (array of account defs), `CATEGORY_TO_ACCOUNT_CODE` (maps legacy `Transaction.category` → account `code`), `CASH_ACCOUNT_CODE = '1000'`, `INCOME_ACCOUNT_CODE = '4000'`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ledger/ledgerAccount.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections } from './setup.js';
import LedgerAccount from '../../server/models/LedgerAccount.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(clearLedgerCollections);

describe('LedgerAccount', () => {
  it('derives normalBalance = debit for asset and expense accounts', async () => {
    const cash = await LedgerAccount.create({ id: 'la_1', code: '1000', name: 'Cash', type: 'asset' });
    const rent = await LedgerAccount.create({ id: 'la_2', code: '6600', name: 'Rent', type: 'expense' });
    assert.equal(cash.normalBalance, 'debit');
    assert.equal(rent.normalBalance, 'debit');
  });

  it('derives normalBalance = credit for liability, equity and income accounts', async () => {
    const equity = await LedgerAccount.create({ id: 'la_3', code: '3000', name: "Owner's Equity", type: 'equity' });
    const income = await LedgerAccount.create({ id: 'la_4', code: '4000', name: 'Service Income', type: 'income' });
    assert.equal(equity.normalBalance, 'credit');
    assert.equal(income.normalBalance, 'credit');
  });

  it('rejects an unknown account type', async () => {
    await assert.rejects(
      LedgerAccount.create({ id: 'la_5', code: '9999', name: 'Bogus', type: 'bogus' }),
    );
  });

  it('enforces unique code', async () => {
    await LedgerAccount.create({ id: 'la_6', code: '1000', name: 'Cash', type: 'asset' });
    await assert.rejects(
      LedgerAccount.create({ id: 'la_7', code: '1000', name: 'Cash 2', type: 'asset' }),
    );
  });
});
```

Also create the test setup file this test imports:

```javascript
// tests/ledger/setup.js
// Dedicated setup for the ledger feature — mirrors the shape of
// tests/financial-balance/setup.js (setupTestDB/teardownTestDB/clear*),
// but seeds ledger-specific fixtures instead of the CRM sales scenario,
// so the two test suites don't share (and don't fight over) fixture data.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import LedgerAccount from '../../server/models/LedgerAccount.js';
import JournalEntry from '../../server/models/JournalEntry.js';
import LedgerPeriodClose from '../../server/models/LedgerPeriodClose.js';
import Transaction from '../../server/models/Transaction.js';
import Payment from '../../server/models/Payment.js';
import Commission from '../../server/models/Commission.js';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../server/seed/chartOfAccounts.js';

let mongoServer;

export async function setupTestDB() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

export async function teardownTestDB() {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
}

export async function clearLedgerCollections() {
  await Promise.all([
    LedgerAccount.deleteMany({}),
    JournalEntry.deleteMany({}),
    LedgerPeriodClose.deleteMany({}),
    Transaction.deleteMany({}),
    Payment.deleteMany({}),
    Commission.deleteMany({}),
  ]);
}

/** Seeds the real default chart of accounts (same data server startup seeds). */
export async function seedChartOfAccounts() {
  await LedgerAccount.insertMany(DEFAULT_CHART_OF_ACCOUNTS);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/ledger/ledgerAccount.test.ts`
Expected: FAIL — `Cannot find module '../../server/models/LedgerAccount.js'`

- [ ] **Step 3: Write the model**

```javascript
// server/models/LedgerAccount.js
import mongoose from 'mongoose';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];
const DEBIT_NORMAL_TYPES = new Set(['asset', 'expense']);

const LedgerAccountSchema = new mongoose.Schema({
    id:            { type: String, required: true, unique: true },
    code:          { type: String, required: true, unique: true },
    name:          { type: String, required: true },
    type:          { type: String, required: true, enum: ACCOUNT_TYPES },
    normalBalance: { type: String, enum: ['debit', 'credit'] },
    taxCategory:   { type: String, default: '' },
    isActive:      { type: Boolean, default: true },
}, { timestamps: true, strict: true });

LedgerAccountSchema.pre('validate', function setNormalBalance(next) {
    this.normalBalance = DEBIT_NORMAL_TYPES.has(this.type) ? 'debit' : 'credit';
    next();
});

export default mongoose.model('LedgerAccount', LedgerAccountSchema);
```

```javascript
// server/seed/chartOfAccounts.js
// Default chart of accounts for a small services LLC (cash-basis, Schedule C).
// Seeded idempotently on server startup (see server/index.js) — safe to run
// every boot because it's an upsert-by-code, not an insert.
export const DEFAULT_CHART_OF_ACCOUNTS = [
  { id: 'coa_1000', code: '1000', name: 'Cash — Mercury Checking', type: 'asset' },
  { id: 'coa_1100', code: '1100', name: 'Accounts Receivable (informational)', type: 'asset' },
  { id: 'coa_3000', code: '3000', name: "Owner's Equity", type: 'equity' },
  { id: 'coa_3100', code: '3100', name: "Owner's Draws", type: 'equity' },
  { id: 'coa_4000', code: '4000', name: 'Service Income', type: 'income' },
  { id: 'coa_6000', code: '6000', name: 'Advertising', type: 'expense', taxCategory: 'Advertising' },
  { id: 'coa_6100', code: '6100', name: 'Contract Labor', type: 'expense', taxCategory: 'Contract Labor' },
  { id: 'coa_6200', code: '6200', name: 'Office Expense', type: 'expense', taxCategory: 'Office Expense' },
  { id: 'coa_6300', code: '6300', name: 'Software', type: 'expense', taxCategory: 'Office Expense' },
  { id: 'coa_6400', code: '6400', name: 'Insurance', type: 'expense', taxCategory: 'Insurance' },
  { id: 'coa_6500', code: '6500', name: 'Legal & Professional Services', type: 'expense', taxCategory: 'Legal & Professional Services' },
  { id: 'coa_6600', code: '6600', name: 'Rent', type: 'expense', taxCategory: 'Rent' },
  { id: 'coa_6700', code: '6700', name: 'Supplies', type: 'expense', taxCategory: 'Supplies' },
  { id: 'coa_6800', code: '6800', name: 'Taxes & Licenses', type: 'expense', taxCategory: 'Taxes & Licenses' },
  { id: 'coa_6900', code: '6900', name: 'Travel', type: 'expense', taxCategory: 'Travel' },
  { id: 'coa_7000', code: '7000', name: 'Meals (50% deductible)', type: 'expense', taxCategory: 'Meals' },
  { id: 'coa_7100', code: '7100', name: 'Utilities', type: 'expense', taxCategory: 'Utilities' },
  { id: 'coa_7900', code: '7900', name: 'Other Expenses', type: 'expense', taxCategory: 'Other Expenses' },
];

export const CASH_ACCOUNT_CODE = '1000';
export const INCOME_ACCOUNT_CODE = '4000';

// Maps the legacy operational Transaction.category to a default LedgerAccount
// code — used only when the transaction has no explicit taxCategory set
// (i.e. project/lead expenses recorded from FinanceManager, not from the
// Ledger "Company Expenses" tab).
export const CATEGORY_TO_ACCOUNT_CODE = {
  credit_card:        '7900',
  office:              '6200',
  software:            '6300',
  marketing:           '6000',
  salary:              '6100',
  consultant_payment:  '6100',
  other:               '7900',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/ledger/ledgerAccount.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/models/LedgerAccount.js server/seed/chartOfAccounts.js tests/ledger/setup.js tests/ledger/ledgerAccount.test.ts
git commit -m "feat: add LedgerAccount model and default chart of accounts"
```

---

### Task 2: `JournalEntry` model + balance validation

**Files:**
- Create: `server/models/JournalEntry.js`
- Create: `server/models/LedgerPeriodClose.js`
- Test: `tests/ledger/journalEntry.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 directly (accountId is a plain string, not a Mongoose ref, matching this codebase's convention of string-id cross-references — see `Transaction.projectId`).
- Produces: `JournalEntry` Mongoose model with `{ date, memo, source, sourceId, lines: [{accountId, debit, credit, memo, entityId, currency, exchangeRateToUSD, amountUSD, reconciled}], status }`. Schema-level validation rejects entries where debit-USD-total ≠ credit-USD-total, where any line has both `debit>0` and `credit>0` (or neither), or where fewer than 2 lines are given.
- Produces: `LedgerPeriodClose` model `{ id, year, month, closedAt, closedBy }` used by Task 8 to lock edits.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ledger/journalEntry.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections } from './setup.js';
import JournalEntry from '../../server/models/JournalEntry.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(clearLedgerCollections);

const line = (accountId: string, opts: Partial<{ debit: number; credit: number; amountUSD: number }>) => ({
  accountId, debit: 0, credit: 0, amountUSD: 0, ...opts,
});

describe('JournalEntry', () => {
  it('accepts a balanced two-line entry', async () => {
    const entry = await JournalEntry.create({
      date: new Date(), source: 'manual', memo: 'test',
      lines: [
        line('coa_6600', { debit: 500, amountUSD: 500 }),
        line('coa_1000', { credit: 500, amountUSD: 500 }),
      ],
    });
    assert.equal(entry.status, 'posted');
  });

  it('rejects an unbalanced entry', async () => {
    await assert.rejects(JournalEntry.create({
      date: new Date(), source: 'manual',
      lines: [
        line('coa_6600', { debit: 500, amountUSD: 500 }),
        line('coa_1000', { credit: 400, amountUSD: 400 }),
      ],
    }));
  });

  it('rejects a line with both debit and credit set', async () => {
    await assert.rejects(JournalEntry.create({
      date: new Date(), source: 'manual',
      lines: [
        line('coa_6600', { debit: 500, credit: 500, amountUSD: 500 }),
        line('coa_1000', { credit: 500, amountUSD: 500 }),
      ],
    }));
  });

  it('rejects a single-line entry', async () => {
    await assert.rejects(JournalEntry.create({
      date: new Date(), source: 'manual',
      lines: [line('coa_6600', { debit: 500, amountUSD: 500 })],
    }));
  });

  it('balances on amountUSD, not native currency amounts', async () => {
    // 2,000,000 COP debit vs 500 USD credit — balances only because
    // amountUSD on both lines is 500.
    const entry = await JournalEntry.create({
      date: new Date(), source: 'manual',
      lines: [
        { accountId: 'coa_6600', debit: 2000000, credit: 0, currency: 'COP', exchangeRateToUSD: 4000, amountUSD: 500 },
        { accountId: 'coa_1000', debit: 0, credit: 500, currency: 'USD', exchangeRateToUSD: 1, amountUSD: 500 },
      ],
    });
    assert.equal(entry.lines.length, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/ledger/journalEntry.test.ts`
Expected: FAIL — `Cannot find module '../../server/models/JournalEntry.js'`

- [ ] **Step 3: Write the models**

```javascript
// server/models/JournalEntry.js
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
JournalEntrySchema.index({ source: 1, sourceId: 1 });
JournalEntrySchema.index({ 'lines.accountId': 1 });

export default mongoose.model('JournalEntry', JournalEntrySchema);
```

```javascript
// server/models/LedgerPeriodClose.js
import mongoose from 'mongoose';

const LedgerPeriodCloseSchema = new mongoose.Schema({
    id:       { type: String, required: true, unique: true },
    year:     { type: Number, required: true },
    month:    { type: Number, required: true, min: 1, max: 12 },
    closedAt: { type: Date, default: Date.now },
    closedBy: { type: String, default: '' },
}, { timestamps: true, strict: true });

LedgerPeriodCloseSchema.index({ year: 1, month: 1 }, { unique: true });

export default mongoose.model('LedgerPeriodClose', LedgerPeriodCloseSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/ledger/journalEntry.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/models/JournalEntry.js server/models/LedgerPeriodClose.js tests/ledger/journalEntry.test.ts
git commit -m "feat: add JournalEntry model with double-entry balance validation"
```

---

### Task 3: `ledgerPostingService` — expense & consultant-payment posting

**Files:**
- Create: `server/services/ledgerPostingService.js`
- Test: `tests/ledger/ledgerPostingService.test.ts`

**Interfaces:**
- Consumes: `LedgerAccount` (Task 1), `JournalEntry` (Task 2), `DEFAULT_CHART_OF_ACCOUNTS`/`CATEGORY_TO_ACCOUNT_CODE`/`CASH_ACCOUNT_CODE` (Task 1).
- Produces: `postExpense(tx)` and `postConsultantPayment(tx)`, both `async (Transaction) => JournalEntry | null`. Returns `null` (not an error) if already posted for that `tx.id` (idempotency guard by `sourceId`). Throws only when the required `LedgerAccount` rows are missing — callers (Task 5) must catch this, never let it propagate.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ledger/ledgerPostingService.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import { postExpense, postConsultantPayment } from '../../server/services/ledgerPostingService.js';
import JournalEntry from '../../server/models/JournalEntry.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(async () => { await clearLedgerCollections(); await seedChartOfAccounts(); });

describe('postExpense', () => {
  it('posts Debit Software / Credit Cash for a software expense', async () => {
    const entry = await postExpense({
      id: 'tx_1', title: 'AWS Hosting', amount: 500, amountUSD: 500, currency: 'USD',
      exchangeRateToUSD: 1, category: 'software', date: '2026-07-01',
    });
    assert.ok(entry);
    const software = entry.lines.find(l => l.accountId === 'coa_6300');
    const cash = entry.lines.find(l => l.accountId === 'coa_1000');
    assert.equal(software.debit, 500);
    assert.equal(cash.credit, 500);
  });

  it('uses taxCategory over category when both are present', async () => {
    const entry = await postExpense({
      id: 'tx_2', title: 'Office chair', amount: 200, amountUSD: 200, currency: 'USD',
      exchangeRateToUSD: 1, category: 'other', taxCategory: 'Rent', date: '2026-07-01',
    });
    const rent = entry.lines.find(l => l.accountId === 'coa_6600');
    assert.equal(rent.debit, 200);
  });

  it('converts multi-currency amounts using the amountUSD already on the transaction', async () => {
    const entry = await postExpense({
      id: 'tx_3', title: 'Bogota rent', amount: 2000000, amountUSD: 500, currency: 'COP',
      exchangeRateToUSD: 4000, category: 'office', date: '2026-07-01',
    });
    const office = entry.lines.find(l => l.accountId === 'coa_6200');
    assert.equal(office.debit, 2000000);
    assert.equal(office.amountUSD, 500);
  });

  it('is idempotent — posting the same transaction id twice returns null the second time', async () => {
    const tx = { id: 'tx_4', title: 'AWS', amount: 100, amountUSD: 100, currency: 'USD', exchangeRateToUSD: 1, category: 'software', date: '2026-07-01' };
    const first = await postExpense(tx);
    const second = await postExpense(tx);
    assert.ok(first);
    assert.equal(second, null);
    const count = await JournalEntry.countDocuments({ source: 'expense', sourceId: 'tx_4' });
    assert.equal(count, 1);
  });

  it('throws when the chart of accounts has no matching account (caller must catch this)', async () => {
    await clearLedgerCollections(); // no chart of accounts seeded
    await assert.rejects(postExpense({
      id: 'tx_5', title: 'AWS', amount: 100, amountUSD: 100, currency: 'USD',
      exchangeRateToUSD: 1, category: 'software', date: '2026-07-01',
    }));
  });
});

describe('postConsultantPayment', () => {
  it('posts Debit Contract Labor / Credit Cash with entityId = consultantId', async () => {
    const entry = await postConsultantPayment({
      id: 'tx_10', title: 'Bob payout', amount: 3500, amountUSD: 3500, currency: 'USD',
      exchangeRateToUSD: 1, category: 'consultant_payment', consultantId: 'user-bob', date: '2026-07-01',
    });
    const laborLine = entry.lines.find(l => l.accountId === 'coa_6100');
    assert.equal(laborLine.debit, 3500);
    assert.equal(laborLine.entityId, 'user-bob');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/ledger/ledgerPostingService.test.ts`
Expected: FAIL — `Cannot find module '../../server/services/ledgerPostingService.js'`

- [ ] **Step 3: Write the service**

```javascript
// server/services/ledgerPostingService.js
import LedgerAccount from '../models/LedgerAccount.js';
import JournalEntry from '../models/JournalEntry.js';
import { CATEGORY_TO_ACCOUNT_CODE, CASH_ACCOUNT_CODE, INCOME_ACCOUNT_CODE } from '../seed/chartOfAccounts.js';

async function alreadyPosted(source, sourceId) {
    if (!sourceId) return false;
    const existing = await JournalEntry.findOne({ source, sourceId, status: { $ne: 'void' } }).lean();
    return !!existing;
}

function makeLine(accountId, amountNative, amountUSD, isDebit, opts = {}) {
    return {
        accountId,
        debit: isDebit ? amountNative : 0,
        credit: isDebit ? 0 : amountNative,
        currency: opts.currency || 'USD',
        exchangeRateToUSD: opts.exchangeRateToUSD ?? 1,
        amountUSD,
        memo: opts.memo || '',
        entityId: opts.entityId || '',
    };
}

async function findExpenseAccount(tx) {
    if (tx.taxCategory) {
        const byTax = await LedgerAccount.findOne({ type: 'expense', taxCategory: tx.taxCategory }).lean();
        if (byTax) return byTax;
    }
    const code = CATEGORY_TO_ACCOUNT_CODE[tx.category] || CATEGORY_TO_ACCOUNT_CODE.other;
    return LedgerAccount.findOne({ code }).lean();
}

async function requireAccount(query, label) {
    const account = await LedgerAccount.findOne(query).lean();
    if (!account) throw new Error(`Missing ledger account for ${label} (query=${JSON.stringify(query)})`);
    return account;
}

/** Debit [expense account for tx.taxCategory or tx.category], Credit Cash. */
export async function postExpense(tx) {
    if (await alreadyPosted('expense', tx.id)) return null;
    const expenseAccount = await findExpenseAccount(tx);
    if (!expenseAccount) throw new Error(`Missing expense ledger account for transaction ${tx.id} (category=${tx.category}, taxCategory=${tx.taxCategory || 'n/a'})`);
    const cashAccount = await requireAccount({ code: CASH_ACCOUNT_CODE }, `expense ${tx.id}`);
    const amountUSD = tx.amountUSD ?? tx.amount;
    const currencyOpts = { currency: tx.currency, exchangeRateToUSD: tx.exchangeRateToUSD, entityId: tx.consultantId || '' };
    return JournalEntry.create({
        date: tx.dateObj || new Date(tx.date),
        memo: tx.title,
        source: 'expense',
        sourceId: tx.id,
        lines: [
            makeLine(expenseAccount.id, tx.amount, amountUSD, true, currencyOpts),
            makeLine(cashAccount.id, tx.amount, amountUSD, false, { currency: tx.currency, exchangeRateToUSD: tx.exchangeRateToUSD }),
        ],
    });
}

/**
 * Debit Contract Labor, Credit Cash. Kept separate from postExpense (even
 * though the shape is identical) because it always resolves to the
 * Contract Labor account regardless of `category`, and it's the function
 * the 1099 report (Task 7) depends on for its entityId aggregation.
 */
export async function postConsultantPayment(tx) {
    if (await alreadyPosted('payroll', tx.id)) return null;
    const laborAccount = await requireAccount({ code: CATEGORY_TO_ACCOUNT_CODE.consultant_payment }, `consultant payment ${tx.id}`);
    const cashAccount = await requireAccount({ code: CASH_ACCOUNT_CODE }, `consultant payment ${tx.id}`);
    const amountUSD = tx.amountUSD ?? tx.amount;
    return JournalEntry.create({
        date: tx.dateObj || new Date(tx.date),
        memo: tx.title,
        source: 'payroll',
        sourceId: tx.id,
        lines: [
            makeLine(laborAccount.id, tx.amount, amountUSD, true, { currency: tx.currency, exchangeRateToUSD: tx.exchangeRateToUSD, entityId: tx.consultantId || '' }),
            makeLine(cashAccount.id, tx.amount, amountUSD, false, { currency: tx.currency, exchangeRateToUSD: tx.exchangeRateToUSD }),
        ],
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/ledger/ledgerPostingService.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add server/services/ledgerPostingService.js tests/ledger/ledgerPostingService.test.ts
git commit -m "feat: post expense and consultant-payment journal entries"
```

---

### Task 4: `ledgerPostingService` — payment & commission posting

**Files:**
- Modify: `server/services/ledgerPostingService.js`
- Test: `tests/ledger/ledgerPostingService.test.ts` (append)

**Interfaces:**
- Produces: `postPaymentReceived(payment)` and `postCommissionPaid(commission)`, same `async (doc) => JournalEntry | null` contract as Task 3's functions.

- [ ] **Step 1: Write the failing tests (append to the same file)**

```typescript
// tests/ledger/ledgerPostingService.test.ts (append at the end, same imports file — add these two to the import line)
// import { postExpense, postConsultantPayment, postPaymentReceived, postCommissionPaid } from '../../server/services/ledgerPostingService.js';

describe('postPaymentReceived', () => {
  it('posts Debit Cash / Credit Service Income', async () => {
    const entry = await postPaymentReceived({
      _id: { toString: () => 'pay_1' },
      clientId: 'ACME Corp', clientName: 'ACME Corp',
      paymentDate: new Date('2026-07-01'), amount: 10000, currency: 'USD',
      amountUSD: 10000, exchangeRateToUSD: 1,
    });
    const cash = entry.lines.find(l => l.accountId === 'coa_1000');
    const income = entry.lines.find(l => l.accountId === 'coa_4000');
    assert.equal(cash.debit, 10000);
    assert.equal(income.credit, 10000);
    assert.equal(income.entityId, 'ACME Corp');
  });

  it('is idempotent per payment id', async () => {
    const payment = { _id: { toString: () => 'pay_2' }, clientId: 'X', clientName: 'X', paymentDate: new Date(), amount: 1, currency: 'USD', amountUSD: 1, exchangeRateToUSD: 1 };
    const first = await postPaymentReceived(payment);
    const second = await postPaymentReceived(payment);
    assert.ok(first);
    assert.equal(second, null);
  });
});

describe('postCommissionPaid', () => {
  it('posts Debit Contract Labor / Credit Cash for the paid amount', async () => {
    const entry = await postCommissionPaid({
      _id: { toString: () => 'comm_1' },
      projectName: 'IMPL: ACME', paidAmountUSD: 1110, amountUSD: 1110,
    });
    const labor = entry.lines.find(l => l.accountId === 'coa_6100');
    const cash = entry.lines.find(l => l.accountId === 'coa_1000');
    assert.equal(labor.debit, 1110);
    assert.equal(cash.credit, 1110);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/ledger/ledgerPostingService.test.ts`
Expected: FAIL — `postPaymentReceived is not a function`

- [ ] **Step 3: Add the two functions**

```javascript
// server/services/ledgerPostingService.js — append these two exports

/** Debit Cash, Credit Service Income. Invoice issuance never posts (cash-basis). */
export async function postPaymentReceived(payment) {
    const sourceId = payment._id.toString();
    if (await alreadyPosted('payment', sourceId)) return null;
    const cashAccount = await requireAccount({ code: CASH_ACCOUNT_CODE }, `payment ${sourceId}`);
    const incomeAccount = await requireAccount({ code: INCOME_ACCOUNT_CODE }, `payment ${sourceId}`);
    const currencyOpts = { currency: payment.currency, exchangeRateToUSD: payment.exchangeRateToUSD, entityId: payment.clientId };
    return JournalEntry.create({
        date: payment.paymentDate,
        memo: `Payment from ${payment.clientName}`,
        source: 'payment',
        sourceId,
        lines: [
            makeLine(cashAccount.id, payment.amount, payment.amountUSD, true, currencyOpts),
            makeLine(incomeAccount.id, payment.amount, payment.amountUSD, false, currencyOpts),
        ],
    });
}

/** Debit Contract Labor, Credit Cash, for the amount actually paid out on a commission. */
export async function postCommissionPaid(commission) {
    const sourceId = commission._id.toString();
    if (await alreadyPosted('commission', sourceId)) return null;
    const laborAccount = await requireAccount({ code: CATEGORY_TO_ACCOUNT_CODE.consultant_payment }, `commission ${sourceId}`);
    const cashAccount = await requireAccount({ code: CASH_ACCOUNT_CODE }, `commission ${sourceId}`);
    const amountUSD = commission.paidAmountUSD || commission.amountUSD;
    return JournalEntry.create({
        date: new Date(),
        memo: `Commission — ${commission.projectName}`,
        source: 'commission',
        sourceId,
        lines: [
            makeLine(laborAccount.id, amountUSD, amountUSD, true, {}),
            makeLine(cashAccount.id, amountUSD, amountUSD, false, {}),
        ],
    });
}
```

Also update the test file's import line to include `postPaymentReceived, postCommissionPaid`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/ledger/ledgerPostingService.test.ts`
Expected: PASS (9 tests total)

- [ ] **Step 5: Commit**

```bash
git add server/services/ledgerPostingService.js tests/ledger/ledgerPostingService.test.ts
git commit -m "feat: post payment-received and commission-paid journal entries"
```

---

### Task 5: Wire posting hooks onto `Transaction` and `Payment`

**Files:**
- Modify: `server/models/Transaction.js`
- Modify: `server/models/Payment.js`
- Test: `tests/ledger/postingHooks.test.ts`

**Interfaces:**
- Consumes: `postExpense`, `postConsultantPayment`, `postPaymentReceived` (Tasks 3–4).
- Produces: `Transaction.postingStatus` ∈ `'posted' | 'failed' | 'n/a'` (default `'n/a'` until the hook runs), same field added to `Payment`. Both hooks fire only `if (doc.wasNew)` (i.e. on creation, not on every update) — edits to an already-posted expense/payment do not repost; corrections happen as manual journal entries (Task 6/8), matching the spec's error-handling section (no silent drift, no duplicate postings).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ledger/postingHooks.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import Transaction from '../../server/models/Transaction.js';
import Payment from '../../server/models/Payment.js';
import JournalEntry from '../../server/models/JournalEntry.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(async () => { await clearLedgerCollections(); await seedChartOfAccounts(); });

// Hooks are async and fire-and-forget from Mongoose's perspective; give them
// one microtask tick before asserting.
const tick = () => new Promise(r => setTimeout(r, 50));

describe('Transaction posting hook', () => {
  it('posts a journal entry and marks postingStatus=posted for an expense', async () => {
    const tx = await Transaction.create({ id: 'tx_h1', title: 'AWS', amount: 100, amountUSD: 100, currency: 'USD', exchangeRateToUSD: 1, category: 'software', type: 'expense', date: '2026-07-01' });
    await tick();
    const entry = await JournalEntry.findOne({ source: 'expense', sourceId: 'tx_h1' });
    assert.ok(entry);
    const reloaded = await Transaction.findOne({ id: 'tx_h1' }).lean();
    assert.equal(reloaded.postingStatus, 'posted');
  });

  it('routes consultant_payment category through postConsultantPayment (source=payroll)', async () => {
    await Transaction.create({ id: 'tx_h2', title: 'Bob payout', amount: 500, amountUSD: 500, currency: 'USD', exchangeRateToUSD: 1, category: 'consultant_payment', consultantId: 'user-bob', type: 'expense', date: '2026-07-01' });
    await tick();
    const entry = await JournalEntry.findOne({ source: 'payroll', sourceId: 'tx_h2' });
    assert.ok(entry);
  });

  it('marks postingStatus=failed and does NOT throw when the chart of accounts is empty', async () => {
    await JournalEntry.deleteMany({});
    await (await import('../../server/models/LedgerAccount.js')).default.deleteMany({});
    const tx = await Transaction.create({ id: 'tx_h3', title: 'AWS', amount: 100, amountUSD: 100, currency: 'USD', exchangeRateToUSD: 1, category: 'software', type: 'expense', date: '2026-07-01' });
    await tick();
    const reloaded = await Transaction.findOne({ id: 'tx_h3' }).lean();
    assert.equal(reloaded.postingStatus, 'failed');
  });

  it('does not repost on update', async () => {
    await Transaction.create({ id: 'tx_h4', title: 'AWS', amount: 100, amountUSD: 100, currency: 'USD', exchangeRateToUSD: 1, category: 'software', type: 'expense', date: '2026-07-01' });
    await tick();
    const doc = await Transaction.findOne({ id: 'tx_h4' });
    doc.amount = 200;
    await doc.save();
    await tick();
    const count = await JournalEntry.countDocuments({ source: 'expense', sourceId: 'tx_h4' });
    assert.equal(count, 1);
  });
});

describe('Payment posting hook', () => {
  it('posts a journal entry and marks postingStatus=posted', async () => {
    const payment = await Payment.create({ clientId: 'ACME', clientName: 'ACME', paymentDate: new Date(), amount: 100, currency: 'USD', amountUSD: 100, exchangeRateToUSD: 1, method: 'mercury' });
    await tick();
    const entry = await JournalEntry.findOne({ source: 'payment', sourceId: payment._id.toString() });
    assert.ok(entry);
    const reloaded = await Payment.findById(payment._id).lean();
    assert.equal(reloaded.postingStatus, 'posted');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/ledger/postingHooks.test.ts`
Expected: FAIL — `postingStatus` is `undefined` on the reloaded doc (schema field doesn't exist yet), no `JournalEntry` found.

- [ ] **Step 3: Add fields and hooks**

```javascript
// server/models/Transaction.js — full new contents
import mongoose from 'mongoose';
import { postExpense, postConsultantPayment } from '../services/ledgerPostingService.js';

const EXPENSE_CATEGORIES = [
    'credit_card', 'office', 'software', 'marketing',
    'salary', 'consultant_payment', 'other',
];

const TransactionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    date: String, // Legacy — kept for backward compatibility
    dateObj: { type: Date, index: true }, // Proper Date for aggregation pipelines
    type: { type: String, default: 'expense', enum: ['income', 'expense'] },
    category: {
        type: String,
        enum: EXPENSE_CATEGORIES,
        default: 'other',
    },
    description: String,
    projectId: { type: String, index: true },
    leadId: { type: String, index: true },
    consultantId: String,
    lineItemId: String,
    logIds: [String],
    isBillable: { type: Boolean, default: false },

    // Multi-currency support
    currency: { type: String, default: 'USD' },
    amountUSD: { type: Number },
    exchangeRateToUSD: { type: Number, default: 1 },

    // Ledger (double-entry) support — see server/services/ledgerPostingService.js
    taxCategory: { type: String, default: '' },        // Schedule C line; required by UI for company expenses (Task 11)
    postingStatus: { type: String, enum: ['posted', 'failed', 'n/a'], default: 'n/a' },
}, { timestamps: true, strict: false });

TransactionSchema.index({ type: 1, dateObj: -1 });
TransactionSchema.index({ category: 1 });

// Auto-post to the general ledger on creation only (not on every edit — see
// Task 5 of docs/superpowers/plans/2026-07-28-accounting-ledger.md for why).
// Never lets a posting failure block the write that triggered it.
TransactionSchema.post('save', async function postToLedger(doc) {
    if (!doc.wasNew || doc.type !== 'expense') return;
    try {
        const poster = doc.category === 'consultant_payment' ? postConsultantPayment : postExpense;
        await poster(doc.toObject());
        await mongoose.model('Transaction').updateOne({ _id: doc._id }, { $set: { postingStatus: 'posted' } });
    } catch (err) {
        console.error(`[ledger] Failed to post Transaction ${doc.id}:`, err.message);
        await mongoose.model('Transaction').updateOne({ _id: doc._id }, { $set: { postingStatus: 'failed' } });
    }
});

// Mongoose doesn't give post('save') a reliable "was this an insert" flag
// out of the box on all versions, so we capture it ourselves in pre('save').
TransactionSchema.pre('save', function captureWasNew(next) {
    this.wasNew = this.isNew;
    next();
});

export default mongoose.model('Transaction', TransactionSchema);
```

```javascript
// server/models/Payment.js — add these three things to the existing file:
// 1) import at the top
import { postPaymentReceived } from '../services/ledgerPostingService.js';

// 2) new field, inside PaymentSchema (near the other audit fields)
    postingStatus: { type: String, enum: ['posted', 'failed', 'n/a'], default: 'n/a' },

// 3) hooks, right before `export default mongoose.model('Payment', PaymentSchema);`
PaymentSchema.pre('save', function captureWasNew(next) {
    this.wasNew = this.isNew;
    next();
});

PaymentSchema.post('save', async function postToLedger(doc) {
    if (!doc.wasNew) return;
    try {
        await postPaymentReceived(doc.toObject());
        await mongoose.model('Payment').updateOne({ _id: doc._id }, { $set: { postingStatus: 'posted' } });
    } catch (err) {
        console.error(`[ledger] Failed to post Payment ${doc._id}:`, err.message);
        await mongoose.model('Payment').updateOne({ _id: doc._id }, { $set: { postingStatus: 'failed' } });
    }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/ledger/postingHooks.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full existing test suite to confirm nothing broke**

Run: `pnpm test`
Expected: All prior tests (`tests/business.test.ts`, `tests/financial-balance/financial-balance.test.js`) still PASS — this task only adds fields/hooks, it doesn't change existing required fields or route behavior.

- [ ] **Step 6: Commit**

```bash
git add server/models/Transaction.js server/models/Payment.js tests/ledger/postingHooks.test.ts
git commit -m "feat: auto-post Transaction and Payment writes to the general ledger"
```

---

### Task 6: Wire posting hook onto `Commission`

**Files:**
- Modify: `server/models/Commission.js`
- Test: `tests/ledger/postingHooks.test.ts` (append)

**Interfaces:**
- Consumes: `postCommissionPaid` (Task 4).
- Produces: `Commission.postingStatus` field. Fires on `post('findOneAndUpdate')` only when the update sets `status: 'paid'` — `commissions.js` uses the generic `createCrudRouter`, whose `PUT /:id` does `findOneAndUpdate({id}, {$set: updateData}, {new:true, lean:true})`, so this is the only reliable hook point (see Global Constraints).

- [ ] **Step 1: Write the failing test (append)**

```typescript
// tests/ledger/postingHooks.test.ts (append)
import Commission from '../../server/models/Commission.js';

describe('Commission posting hook', () => {
  it('posts a journal entry when status transitions to paid via findOneAndUpdate', async () => {
    const commission = await Commission.create({
      projectId: 'proj-1', projectName: 'IMPL: ACME', clientId: 'ACME', clientName: 'ACME',
      rate: 10, revenueUSD: 20000, costUSD: 8900, netUtilityUSD: 11100, amountUSD: 1110,
      split: { bmRetainedUSD: 400, fabianShareUSD: 355, spencerShareUSD: 355 },
      status: 'approved',
    });
    await Commission.findOneAndUpdate(
      { _id: commission._id },
      { $set: { status: 'paid', paidAmountUSD: 1110 } },
      { new: true },
    );
    await tick();
    const entry = await JournalEntry.findOne({ source: 'commission', sourceId: commission._id.toString() });
    assert.ok(entry);
  });

  it('does not post when the update does not set status to paid', async () => {
    const commission = await Commission.create({
      projectId: 'proj-2', projectName: 'HOURS: Beta', clientId: 'Beta', clientName: 'Beta',
      rate: 15, revenueUSD: 10000, costUSD: 3000, netUtilityUSD: 7000, amountUSD: 1050,
      split: { bmRetainedUSD: 380, fabianShareUSD: 335, spencerShareUSD: 335 },
      status: 'pending',
    });
    await Commission.findOneAndUpdate({ _id: commission._id }, { $set: { notes: 'reviewed' } });
    await tick();
    const entry = await JournalEntry.findOne({ source: 'commission', sourceId: commission._id.toString() });
    assert.equal(entry, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/ledger/postingHooks.test.ts`
Expected: FAIL — no `JournalEntry` created on the paid transition.

- [ ] **Step 3: Add field and hook to `Commission.js`**

```javascript
// server/models/Commission.js — add these to the existing file:
// 1) import at the top
import { postCommissionPaid } from '../services/ledgerPostingService.js';

// 2) new field, inside CommissionSchema near `paidAmountUSD`
  postingStatus: { type: String, enum: ['posted', 'failed', 'n/a'], default: 'n/a' },

// 3) hook, right before `export default mongoose.model('Commission', CommissionSchema);`
// Query middleware (not document middleware): `this` is the Query, the hook
// receives the *result* doc as its argument. Fires on the generic
// createCrudRouter's PUT handler with no changes needed there.
CommissionSchema.post('findOneAndUpdate', async function postToLedger(doc) {
    if (!doc || doc.status !== 'paid') return;
    try {
        const result = await postCommissionPaid(doc);
        if (result) {
            await mongoose.model('Commission').updateOne({ _id: doc._id }, { $set: { postingStatus: 'posted' } });
        }
    } catch (err) {
        console.error(`[ledger] Failed to post Commission ${doc._id}:`, err.message);
        await mongoose.model('Commission').updateOne({ _id: doc._id }, { $set: { postingStatus: 'failed' } });
    }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/ledger/postingHooks.test.ts`
Expected: PASS (7 tests total)

- [ ] **Step 5: Commit**

```bash
git add server/models/Commission.js tests/ledger/postingHooks.test.ts
git commit -m "feat: auto-post Commission payouts to the general ledger"
```

---

### Task 7: Chart-of-accounts route + server startup seeding + rate limits

**Files:**
- Create: `server/routes/ledgerAccounts.js`
- Modify: `server/index.js`
- Test: `tests/ledger/ledgerAccountsRoute.test.ts`

**Interfaces:**
- Produces: `GET/POST/PUT/DELETE /api/ledger-accounts[/:id]` (generic CRUD via `createCrudRouter`). Produces `ensureChartOfAccountsSeeded()` exported from `server/seed/chartOfAccounts.js`, called once at server startup — idempotent (upsert by `code`), so it's safe on every boot including against an existing populated DB.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ledger/ledgerAccountsRoute.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDB, teardownTestDB, clearLedgerCollections } from './setup.js';
import { ensureChartOfAccountsSeeded } from '../../server/seed/chartOfAccounts.js';
import LedgerAccount from '../../server/models/LedgerAccount.js';

before(setupTestDB);
after(teardownTestDB);
beforeEach(clearLedgerCollections);

describe('ensureChartOfAccountsSeeded', () => {
  it('inserts the full default chart of accounts into an empty DB', async () => {
    await ensureChartOfAccountsSeeded();
    const count = await LedgerAccount.countDocuments();
    assert.equal(count, 18);
  });

  it('is idempotent — running it twice does not duplicate or error', async () => {
    await ensureChartOfAccountsSeeded();
    await ensureChartOfAccountsSeeded();
    const count = await LedgerAccount.countDocuments();
    assert.equal(count, 18);
  });

  it('does not overwrite a user-edited account name', async () => {
    await ensureChartOfAccountsSeeded();
    await LedgerAccount.updateOne({ code: '6600' }, { $set: { name: 'Office Rent (renamed)' } });
    await ensureChartOfAccountsSeeded();
    const rent = await LedgerAccount.findOne({ code: '6600' }).lean();
    assert.equal(rent.name, 'Office Rent (renamed)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/ledger/ledgerAccountsRoute.test.ts`
Expected: FAIL — `ensureChartOfAccountsSeeded is not a function`

- [ ] **Step 3: Add the seeding function and the route**

```javascript
// server/seed/chartOfAccounts.js — append at the end of the existing file
import LedgerAccount from '../models/LedgerAccount.js';

/**
 * Upsert-by-code seeding, safe to call on every server start. Only inserts
 * accounts that don't already exist by `code`; never overwrites an existing
 * account (the user may have renamed/edited it from the UI).
 */
export async function ensureChartOfAccountsSeeded() {
    for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
        await LedgerAccount.updateOne(
            { code: account.code },
            { $setOnInsert: account },
            { upsert: true },
        );
    }
}
```

```javascript
// server/routes/ledgerAccounts.js
import LedgerAccount from '../models/LedgerAccount.js';
import { createCrudRouter } from './crud.js';

export default createCrudRouter(LedgerAccount);
```

```javascript
// server/index.js — add near the other route imports (after balanceSheetNotesRouter)
import ledgerAccountsRouter from './routes/ledgerAccounts.js';
import { ensureChartOfAccountsSeeded } from './seed/chartOfAccounts.js';

// server/index.js — add to the readRoutes array (Tier 2)
const readRoutes = [
    '/api/leads', '/api/projects', '/api/users', '/api/contacts',
    '/api/transactions', '/api/skus', '/api/templates', '/api/goals',
    '/api/balanceSheetAccounts', '/api/balanceSheetNotes',
    '/api/accounts', '/api/activities', '/api/automations',
    '/api/ledger-accounts',
];

// server/index.js — add to the dataRoutes array (Tier 3)
const dataRoutes = [
    '/api/leads', '/api/projects', '/api/users', '/api/contacts',
    '/api/transactions', '/api/skus', '/api/templates', '/api/goals',
    '/api/balanceSheetAccounts', '/api/balanceSheetNotes', '/api/apikeys',
    '/api/settings', '/api/accounts', '/api/automations',
    '/api/ledger-accounts',
];

// server/index.js — mount the router, near '/api/balanceSheetNotes'
app.use('/api/ledger-accounts', ledgerAccountsRouter);

// server/index.js — inside start(), right after connectDB():
await connectDB();
await ensureChartOfAccountsSeeded().catch(e => console.error('[startup] chart of accounts seed failed:', e.message));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/ledger/ledgerAccountsRoute.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Manual smoke test**

Run: `pnpm dev:full`, then `curl http://localhost:3001/api/ledger-accounts` — but per this project's own CLAUDE.md, curl is intercepted in this agent's shell; use the browser or `pnpm server` + a REST client instead. Confirm 18 accounts come back and the server log shows no `[startup] chart of accounts seed failed` line.

- [ ] **Step 6: Commit**

```bash
git add server/routes/ledgerAccounts.js server/seed/chartOfAccounts.js server/index.js tests/ledger/ledgerAccountsRoute.test.ts
git commit -m "feat: add chart of accounts route and idempotent startup seeding"
```

---

### Task 8: `journalEntries.js` route — list, manual create, void, period close

**Files:**
- Create: `server/routes/journalEntries.js`
- Modify: `server/index.js`
- Test: `tests/ledger/journalEntriesRoute.test.ts`

**Interfaces:**
- Consumes: `JournalEntry`, `LedgerPeriodClose` (Task 2), `emitCollectionChange` (`server/socketInstance.js`).
- Produces: `GET /api/journal-entries?accountId=&from=&to=&status=`, `POST /api/journal-entries` (manual entry — relies on the schema validator from Task 2 for the balance check), `POST /api/journal-entries/:id/void`, `POST /api/journal-entries/close-period` (`{year, month}`), `DELETE /api/journal-entries/close-period/:year/:month` (reopen, admin-only).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ledger/journalEntriesRoute.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import journalEntriesRouter from '../../server/routes/journalEntries.js';
import JournalEntry from '../../server/models/JournalEntry.js';

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { user: { role: 'admin' } }; next(); }); // stub session
app.use('/api/journal-entries', journalEntriesRouter);

before(setupTestDB);
after(teardownTestDB);
beforeEach(async () => { await clearLedgerCollections(); await seedChartOfAccounts(); });

describe('POST /api/journal-entries', () => {
  it('creates a balanced manual entry', async () => {
    const res = await request(app).post('/api/journal-entries').send({
      date: '2026-07-01', memo: 'Opening balance', source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 1000, amountUSD: 1000 },
        { accountId: 'coa_3000', credit: 1000, amountUSD: 1000 },
      ],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'posted');
  });

  it('rejects an unbalanced manual entry with 400', async () => {
    const res = await request(app).post('/api/journal-entries').send({
      date: '2026-07-01', source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 1000, amountUSD: 1000 },
        { accountId: 'coa_3000', credit: 900, amountUSD: 900 },
      ],
    });
    assert.equal(res.status, 400);
  });

  it('rejects a new entry dated inside a closed period', async () => {
    await request(app).post('/api/journal-entries/close-period').send({ year: 2026, month: 7 });
    const res = await request(app).post('/api/journal-entries').send({
      date: '2026-07-15', source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 100, amountUSD: 100 },
        { accountId: 'coa_3000', credit: 100, amountUSD: 100 },
      ],
    });
    assert.equal(res.status, 409);
  });
});

describe('POST /api/journal-entries/:id/void', () => {
  it('marks the entry void without deleting it', async () => {
    const entry = await JournalEntry.create({
      date: new Date(), source: 'manual',
      lines: [
        { accountId: 'coa_1000', debit: 50, amountUSD: 50 },
        { accountId: 'coa_3000', credit: 50, amountUSD: 50 },
      ],
    });
    const res = await request(app).post(`/api/journal-entries/${entry._id}/void`);
    assert.equal(res.status, 200);
    const reloaded = await JournalEntry.findById(entry._id).lean();
    assert.equal(reloaded.status, 'void');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/ledger/journalEntriesRoute.test.ts`
Expected: FAIL — `Cannot find module '../../server/routes/journalEntries.js'`

- [ ] **Step 3: Write the route**

```javascript
// server/routes/journalEntries.js
import { Router } from 'express';
import JournalEntry from '../models/JournalEntry.js';
import LedgerPeriodClose from '../models/LedgerPeriodClose.js';
import { deepSanitize } from '../middleware/sanitize.js';
import { emitCollectionChange } from '../socketInstance.js';

const router = Router();

async function isPeriodClosed(date) {
    const d = new Date(date);
    const closed = await LedgerPeriodClose.findOne({ year: d.getFullYear(), month: d.getMonth() + 1 }).lean();
    return !!closed;
}

// ── GET ALL (filterable) ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const filter = {};
        if (req.query.accountId) filter['lines.accountId'] = req.query.accountId;
        if (req.query.status) filter.status = req.query.status;
        if (req.query.from || req.query.to) {
            filter.date = {};
            if (req.query.from) filter.date.$gte = new Date(req.query.from);
            if (req.query.to) filter.date.$lte = new Date(req.query.to);
        }
        const docs = await JournalEntry.find(filter).sort({ date: -1 }).limit(1000).lean();
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── CREATE (manual entry) ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const payload = deepSanitize(req.body, true);
        if (await isPeriodClosed(payload.date)) {
            return res.status(409).json({ error: `Period ${payload.date} is closed. Reopen it before adding entries.` });
        }
        const doc = await JournalEntry.create({ ...payload, source: payload.source || 'manual' });
        const result = doc.toObject();
        emitCollectionChange('journalEntries', 'created', result);
        res.status(201).json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── VOID (never hard-delete a posted entry) ─────────────────────────────────
router.post('/:id/void', async (req, res) => {
    try {
        const entry = await JournalEntry.findById(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Not found' });
        if (await isPeriodClosed(entry.date)) {
            return res.status(409).json({ error: 'Cannot void an entry in a closed period. Reopen the period first.' });
        }
        entry.status = 'void';
        await entry.save();
        emitCollectionChange('journalEntries', 'updated', entry.toObject());
        res.json(entry.toObject());
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── CLOSE PERIOD ──────────────────────────────────────────────────────────────
router.post('/close-period', async (req, res) => {
    try {
        const { year, month } = req.body;
        const doc = await LedgerPeriodClose.findOneAndUpdate(
            { year, month },
            { $setOnInsert: { id: `close_${year}_${month}`, year, month, closedBy: req.session?.user?.email || '' } },
            { upsert: true, new: true },
        );
        res.status(201).json(doc);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── REOPEN PERIOD (admin only) ───────────────────────────────────────────────
router.delete('/close-period/:year/:month', async (req, res) => {
    if (req.session?.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: admin role required to reopen a period' });
    }
    try {
        await LedgerPeriodClose.deleteOne({ year: Number(req.params.year), month: Number(req.params.month) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/ledger/journalEntriesRoute.test.ts`
Expected: PASS (4 tests). Note: `supertest` is already a devDependency (`package.json`), no install needed.

- [ ] **Step 5: Register the route in `server/index.js`**

```javascript
// server/index.js — add near the other route imports
import journalEntriesRouter from './routes/journalEntries.js';

// server/index.js — add to readRoutes and dataRoutes arrays (same two arrays edited in Task 7)
    '/api/journal-entries',

// server/index.js — mount, near '/api/ledger-accounts'
app.use('/api/journal-entries', journalEntriesRouter);
```

- [ ] **Step 6: Commit**

```bash
git add server/routes/journalEntries.js server/index.js tests/ledger/journalEntriesRoute.test.ts
git commit -m "feat: add journal entries route with manual posting, void, and period close"
```

---

### Task 9: `ledgerReports.js` — trial balance, P&L, Balance Sheet

**Files:**
- Create: `server/routes/ledgerReports.js`
- Modify: `server/index.js`
- Test: `tests/ledger/ledgerReports.test.ts`

**Interfaces:**
- Produces: `GET /api/ledger-reports/trial-balance`, `GET /api/ledger-reports/pl?start=&end=`, `GET /api/ledger-reports/balance-sheet?asOf=`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ledger/ledgerReports.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import ledgerReportsRouter from '../../server/routes/ledgerReports.js';
import JournalEntry from '../../server/models/JournalEntry.js';

const app = express();
app.use(express.json());
app.use('/api/ledger-reports', ledgerReportsRouter);

before(setupTestDB);
after(teardownTestDB);
beforeEach(async () => {
    await clearLedgerCollections();
    await seedChartOfAccounts();
    // Opening balance: owner contributes $10,000 cash
    await JournalEntry.create({
        date: new Date('2026-06-11'), source: 'opening_balance',
        lines: [
            { accountId: 'coa_1000', debit: 10000, amountUSD: 10000 },
            { accountId: 'coa_3000', credit: 10000, amountUSD: 10000 },
        ],
    });
    // Income: $5,000 payment received
    await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'payment',
        lines: [
            { accountId: 'coa_1000', debit: 5000, amountUSD: 5000 },
            { accountId: 'coa_4000', credit: 5000, amountUSD: 5000 },
        ],
    });
    // Expense: $1,200 software
    await JournalEntry.create({
        date: new Date('2026-07-05'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 1200, amountUSD: 1200 },
            { accountId: 'coa_1000', credit: 1200, amountUSD: 1200 },
        ],
    });
});

describe('GET /api/ledger-reports/trial-balance', () => {
  it('sums to zero (total debits = total credits) across all accounts', async () => {
    const res = await request(app).get('/api/ledger-reports/trial-balance');
    assert.equal(res.status, 200);
    const totalDebit = res.body.reduce((s, a) => s + a.debit, 0);
    const totalCredit = res.body.reduce((s, a) => s + a.credit, 0);
    assert.ok(Math.abs(totalDebit - totalCredit) < 0.01);
  });
});

describe('GET /api/ledger-reports/pl', () => {
  it('computes net income = income - expense for the given range', async () => {
    const res = await request(app).get('/api/ledger-reports/pl?start=2026-07-01&end=2026-07-31');
    assert.equal(res.status, 200);
    assert.equal(res.body.totalIncome, 5000);
    assert.equal(res.body.totalExpense, 1200);
    assert.equal(res.body.netIncome, 3800);
  });

  it('excludes the June opening balance from a July-only range', async () => {
    const res = await request(app).get('/api/ledger-reports/pl?start=2026-07-01&end=2026-07-31');
    assert.equal(res.body.totalIncome, 5000); // not 15000
  });
});

describe('GET /api/ledger-reports/balance-sheet', () => {
  it('balances Assets = Liabilities + Equity as of a date', async () => {
    const res = await request(app).get('/api/ledger-reports/balance-sheet?asOf=2026-07-31');
    assert.equal(res.status, 200);
    assert.equal(res.body.totalAssets, 13800); // 10000 + 5000 - 1200 cash
    assert.equal(res.body.balanced, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/ledger/ledgerReports.test.ts`
Expected: FAIL — `Cannot find module '../../server/routes/ledgerReports.js'`

- [ ] **Step 3: Write the route**

```javascript
// server/routes/ledgerReports.js
import { Router } from 'express';
import LedgerAccount from '../models/LedgerAccount.js';
import JournalEntry from '../models/JournalEntry.js';

const router = Router();

/** Sums debit/credit (in USD) per account across a set of posted entries. */
function sumByAccount(entries) {
    const totals = {}; // accountId -> { debit, credit }
    for (const entry of entries) {
        for (const line of entry.lines) {
            if (!totals[line.accountId]) totals[line.accountId] = { debit: 0, credit: 0 };
            totals[line.accountId].debit += line.debit > 0 ? line.amountUSD : 0;
            totals[line.accountId].credit += line.credit > 0 ? line.amountUSD : 0;
        }
    }
    return totals;
}

// ── TRIAL BALANCE ─────────────────────────────────────────────────────────────
router.get('/trial-balance', async (req, res) => {
    try {
        const [accounts, entries] = await Promise.all([
            LedgerAccount.find().lean(),
            JournalEntry.find({ status: 'posted' }).lean(),
        ]);
        const totals = sumByAccount(entries);
        const rows = accounts.map(a => ({
            accountId: a.id, code: a.code, name: a.name, type: a.type,
            debit: totals[a.id]?.debit || 0,
            credit: totals[a.id]?.credit || 0,
        }));
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── P&L ────────────────────────────────────────────────────────────────────────
router.get('/pl', async (req, res) => {
    try {
        const filter = { status: 'posted' };
        if (req.query.start || req.query.end) {
            filter.date = {};
            if (req.query.start) filter.date.$gte = new Date(req.query.start);
            if (req.query.end) filter.date.$lte = new Date(req.query.end);
        }
        const [accounts, entries] = await Promise.all([
            LedgerAccount.find({ type: { $in: ['income', 'expense'] } }).lean(),
            JournalEntry.find(filter).lean(),
        ]);
        const accountsById = Object.fromEntries(accounts.map(a => [a.id, a]));
        const totals = sumByAccount(entries);

        let totalIncome = 0;
        let totalExpense = 0;
        const byAccount = [];
        for (const [accountId, t] of Object.entries(totals)) {
            const account = accountsById[accountId];
            if (!account) continue; // asset/liability/equity line — not part of P&L
            const netForAccount = account.type === 'income' ? (t.credit - t.debit) : (t.debit - t.credit);
            if (account.type === 'income') totalIncome += netForAccount;
            else totalExpense += netForAccount;
            byAccount.push({ code: account.code, name: account.name, type: account.type, amount: netForAccount, taxCategory: account.taxCategory || '' });
        }
        res.json({ totalIncome, totalExpense, netIncome: totalIncome - totalExpense, byAccount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── BALANCE SHEET ────────────────────────────────────────────────────────────
router.get('/balance-sheet', async (req, res) => {
    try {
        const asOf = req.query.asOf ? new Date(req.query.asOf) : new Date();
        const [accounts, entries] = await Promise.all([
            LedgerAccount.find({ type: { $in: ['asset', 'liability', 'equity'] } }).lean(),
            JournalEntry.find({ status: 'posted', date: { $lte: asOf } }).lean(),
        ]);
        const accountsById = Object.fromEntries(accounts.map(a => [a.id, a]));
        const totals = sumByAccount(entries);

        let totalAssets = 0, totalLiabilities = 0, totalEquity = 0;
        const byAccount = [];
        for (const [accountId, t] of Object.entries(totals)) {
            const account = accountsById[accountId];
            if (!account) continue; // income/expense line — not part of the balance sheet
            const balance = account.normalBalance === 'debit' ? (t.debit - t.credit) : (t.credit - t.debit);
            if (account.type === 'asset') totalAssets += balance;
            else if (account.type === 'liability') totalLiabilities += balance;
            else totalEquity += balance;
            byAccount.push({ code: account.code, name: account.name, type: account.type, balance });
        }
        res.json({
            asOf,
            totalAssets, totalLiabilities, totalEquity,
            balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
            byAccount,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/ledger/ledgerReports.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Register in `server/index.js`**

```javascript
// server/index.js — near the other route imports
import ledgerReportsRouter from './routes/ledgerReports.js';

// server/index.js — add '/api/ledger-reports' to readRoutes only (GET-only endpoints)
    '/api/ledger-reports',

// server/index.js — mount, near '/api/journal-entries'
app.use('/api/ledger-reports', ledgerReportsRouter);
```

- [ ] **Step 6: Commit**

```bash
git add server/routes/ledgerReports.js server/index.js tests/ledger/ledgerReports.test.ts
git commit -m "feat: add trial balance, P&L, and balance sheet report endpoints"
```

---

### Task 10: 1099-NEC report endpoint

**Files:**
- Modify: `server/routes/ledgerReports.js`
- Test: `tests/ledger/ledgerReports.test.ts` (append)

**Interfaces:**
- Produces: `GET /api/ledger-reports/1099?year=2026` → `[{ entityId, totalUSD, crossesThreshold }]`, aggregated over posted `JournalEntry` lines on the Contract Labor account (`coa_6100`) whose `entityId` is set, within the given calendar year. Threshold is a named constant `NEC_1099_THRESHOLD_USD = 600`.

- [ ] **Step 1: Write the failing test (append)**

```typescript
// tests/ledger/ledgerReports.test.ts (append)
describe('GET /api/ledger-reports/1099', () => {
  beforeEach(async () => {
    await JournalEntry.create({
      date: new Date('2026-03-01'), source: 'payroll',
      lines: [
        { accountId: 'coa_6100', debit: 4000, amountUSD: 4000, entityId: 'user-alice' },
        { accountId: 'coa_1000', credit: 4000, amountUSD: 4000 },
      ],
    });
    await JournalEntry.create({
      date: new Date('2026-04-01'), source: 'payroll',
      lines: [
        { accountId: 'coa_6100', debit: 300, amountUSD: 300, entityId: 'user-bob' },
        { accountId: 'coa_1000', credit: 300, amountUSD: 300 },
      ],
    });
  });

  it('aggregates Contract Labor payments by entityId for the given year', async () => {
    const res = await request(app).get('/api/ledger-reports/1099?year=2026');
    assert.equal(res.status, 200);
    const alice = res.body.find((r: any) => r.entityId === 'user-alice');
    const bob = res.body.find((r: any) => r.entityId === 'user-bob');
    assert.equal(alice.totalUSD, 4000);
    assert.equal(alice.crossesThreshold, true);
    assert.equal(bob.totalUSD, 300);
    assert.equal(bob.crossesThreshold, false);
  });

  it('excludes years outside the requested range', async () => {
    const res = await request(app).get('/api/ledger-reports/1099?year=2025');
    assert.deepEqual(res.body, []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/ledger/ledgerReports.test.ts`
Expected: FAIL — 404 (route doesn't exist)

- [ ] **Step 3: Add the endpoint**

```javascript
// server/routes/ledgerReports.js — append before `export default router;`

const NEC_1099_THRESHOLD_USD = 600;
const CONTRACT_LABOR_ACCOUNT_CODE = '6100';

router.get('/1099', async (req, res) => {
    try {
        const year = Number(req.query.year) || new Date().getFullYear();
        const laborAccount = await LedgerAccount.findOne({ code: CONTRACT_LABOR_ACCOUNT_CODE }).lean();
        if (!laborAccount) return res.json([]);

        const entries = await JournalEntry.find({
            status: 'posted',
            date: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31T23:59:59.999Z`) },
            'lines.accountId': laborAccount.id,
        }).lean();

        const totals = {}; // entityId -> totalUSD
        for (const entry of entries) {
            for (const line of entry.lines) {
                if (line.accountId !== laborAccount.id || !line.entityId || line.debit <= 0) continue;
                totals[line.entityId] = (totals[line.entityId] || 0) + line.amountUSD;
            }
        }

        const rows = Object.entries(totals).map(([entityId, totalUSD]) => ({
            entityId,
            totalUSD,
            crossesThreshold: totalUSD >= NEC_1099_THRESHOLD_USD,
        }));
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/ledger/ledgerReports.test.ts`
Expected: PASS (7 tests total)

- [ ] **Step 5: Commit**

```bash
git add server/routes/ledgerReports.js tests/ledger/ledgerReports.test.ts
git commit -m "feat: add 1099-NEC threshold report endpoint"
```

---

### Task 11: Mercury CSV parser + reconciliation route

**Files:**
- Create: `server/utils/csvParser.js`
- Create: `server/routes/mercuryReconciliation.js`
- Modify: `server/index.js`
- Test: `tests/ledger/csvParser.test.ts`
- Test: `tests/ledger/mercuryReconciliation.test.ts`

**Interfaces:**
- Produces: `parseCsv(text: string) => { rows: object[], errors: {row: number, message: string}[] }` (header-driven, RFC4180-ish, no external dependency).
- Produces: `POST /api/mercury-import` (`{ csv: string }`) → `{ matched, unmatched, missing }`, matching against unreconciled lines on the Cash account (`coa_1000`) by date (same day) + amount (within $0.01). `POST /api/mercury-import/confirm-match` (`{ journalEntryId, accountId }`) sets `reconciled: true` on that line.

- [ ] **Step 1: Write the failing CSV parser test**

```typescript
// tests/ledger/csvParser.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../../server/utils/csvParser.js';

describe('parseCsv', () => {
  it('parses a well-formed Mercury-style export by header name', () => {
    const csv = 'Date,Description,Amount\n2026-07-01,AWS Hosting,-500.00\n2026-07-02,Client Payment,5000.00\n';
    const { rows, errors } = parseCsv(csv);
    assert.equal(errors.length, 0);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].Date, '2026-07-01');
    assert.equal(rows[0].Amount, '-500.00');
  });

  it('handles quoted fields containing commas', () => {
    const csv = 'Date,Description,Amount\n2026-07-01,"AWS, Hosting Inc",-500.00\n';
    const { rows } = parseCsv(csv);
    assert.equal(rows[0].Description, 'AWS, Hosting Inc');
  });

  it('reports a row-level error for a row with the wrong column count, without aborting the rest', () => {
    const csv = 'Date,Description,Amount\n2026-07-01,AWS,-500.00\nBROKEN_ROW\n2026-07-03,Rent,-2000.00\n';
    const { rows, errors } = parseCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].row, 3);
  });

  it('returns an empty result for an empty string', () => {
    const { rows, errors } = parseCsv('');
    assert.deepEqual(rows, []);
    assert.deepEqual(errors, []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/ledger/csvParser.test.ts`
Expected: FAIL — `Cannot find module '../../server/utils/csvParser.js'`

- [ ] **Step 3: Write the parser**

```javascript
// server/utils/csvParser.js

/** Splits one CSV line into fields, honoring double-quoted fields with embedded commas/escaped quotes. */
function splitLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (inQuotes) {
            if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
            else if (char === '"') { inQuotes = false; }
            else { current += char; }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            fields.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    fields.push(current);
    return fields;
}

/**
 * Header-driven CSV parser (no external dependency). Returns one object per
 * data row keyed by header name, plus a list of row-level errors for rows
 * whose field count doesn't match the header — those rows are skipped, not
 * fatal to the rest of the file (see spec: "filas corruptas se listan como
 * error por fila sin abortar el resto del archivo").
 */
export function parseCsv(text) {
    const lines = text.split(/\r\n|\n/).filter(l => l.length > 0);
    if (lines.length === 0) return { rows: [], errors: [] };

    const headers = splitLine(lines[0]).map(h => h.trim());
    const rows = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
        const fields = splitLine(lines[i]);
        if (fields.length !== headers.length) {
            errors.push({ row: i + 1, message: `Expected ${headers.length} columns, got ${fields.length}` });
            continue;
        }
        const row = {};
        headers.forEach((h, idx) => { row[h] = fields[idx]; });
        rows.push(row);
    }
    return { rows, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/ledger/csvParser.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing reconciliation route test**

```typescript
// tests/ledger/mercuryReconciliation.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearLedgerCollections, seedChartOfAccounts } from './setup.js';
import mercuryReconciliationRouter from '../../server/routes/mercuryReconciliation.js';
import JournalEntry from '../../server/models/JournalEntry.js';

const app = express();
app.use(express.json());
app.use('/api/mercury-import', mercuryReconciliationRouter);

before(setupTestDB);
after(teardownTestDB);
beforeEach(async () => { await clearLedgerCollections(); await seedChartOfAccounts(); });

describe('POST /api/mercury-import', () => {
  it('classifies a bank row that matches an existing Cash line as matched', async () => {
    await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 500, amountUSD: 500 },
            { accountId: 'coa_1000', credit: 500, amountUSD: 500 },
        ],
    });
    const csv = 'Date,Description,Amount\n2026-07-01,AWS Hosting,-500.00\n';
    const res = await request(app).post('/api/mercury-import').send({ csv });
    assert.equal(res.status, 200);
    assert.equal(res.body.matched.length, 1);
    assert.equal(res.body.unmatched.length, 0);
    assert.equal(res.body.missing.length, 0);
  });

  it('classifies a bank row with no corresponding ledger line as missing', async () => {
    const csv = 'Date,Description,Amount\n2026-07-01,Unrecorded Fee,-25.00\n';
    const res = await request(app).post('/api/mercury-import').send({ csv });
    assert.equal(res.body.missing.length, 1);
  });

  it('classifies a Cash-account ledger line with no matching bank row as unmatched', async () => {
    await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 500, amountUSD: 500 },
            { accountId: 'coa_1000', credit: 500, amountUSD: 500 },
        ],
    });
    const csv = 'Date,Description,Amount\n'; // empty bank statement
    const res = await request(app).post('/api/mercury-import').send({ csv });
    assert.equal(res.body.unmatched.length, 1);
  });

  it('does not re-offer an already-reconciled line as unmatched', async () => {
    const entry = await JournalEntry.create({
        date: new Date('2026-07-01'), source: 'expense',
        lines: [
            { accountId: 'coa_6300', debit: 500, amountUSD: 500 },
            { accountId: 'coa_1000', credit: 500, amountUSD: 500, reconciled: true },
        ],
    });
    const csv = 'Date,Description,Amount\n';
    const res = await request(app).post('/api/mercury-import').send({ csv });
    assert.equal(res.body.unmatched.length, 0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/ledger/mercuryReconciliation.test.ts`
Expected: FAIL — `Cannot find module '../../server/routes/mercuryReconciliation.js'`

- [ ] **Step 7: Write the route**

```javascript
// server/routes/mercuryReconciliation.js
import { Router } from 'express';
import LedgerAccount from '../models/LedgerAccount.js';
import JournalEntry from '../models/JournalEntry.js';
import { parseCsv } from '../utils/csvParser.js';
import { CASH_ACCOUNT_CODE } from '../seed/chartOfAccounts.js';

const router = Router();

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

router.post('/', async (req, res) => {
    try {
        const { csv } = req.body;
        if (typeof csv !== 'string') return res.status(400).json({ error: 'csv (string) is required' });
        const { rows, errors } = parseCsv(csv);

        const cashAccount = await LedgerAccount.findOne({ code: CASH_ACCOUNT_CODE }).lean();
        if (!cashAccount) return res.status(500).json({ error: 'Cash account not seeded' });

        const cashEntries = await JournalEntry.find({ status: 'posted', 'lines.accountId': cashAccount.id }).lean();
        // Flatten to one row per Cash-account line, carrying its parent entry id.
        const cashLines = [];
        for (const entry of cashEntries) {
            entry.lines.forEach((line, index) => {
                if (line.accountId === cashAccount.id) {
                    cashLines.push({ entryId: entry._id.toString(), lineIndex: index, date: new Date(entry.date), amount: line.debit || -line.credit, reconciled: !!line.reconciled });
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

        const unmatched = cashLines
            .filter(l => !l.reconciled && !claimedCashLineKeys.has(`${l.entryId}:${l.lineIndex}`))
            .map(l => ({ journalEntryId: l.entryId, lineIndex: l.lineIndex, date: l.date, amount: l.amount }));

        res.json({ matched, unmatched, missing, parseErrors: errors });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── CONFIRM MATCH — marks a Cash-account line as reconciled ────────────────
router.post('/confirm-match', async (req, res) => {
    try {
        const { journalEntryId, lineIndex } = req.body;
        const entry = await JournalEntry.findById(journalEntryId);
        if (!entry || !entry.lines[lineIndex]) return res.status(404).json({ error: 'Journal entry line not found' });
        entry.lines[lineIndex].reconciled = true;
        await entry.save();
        res.json(entry.toObject());
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

export default router;
```

- [ ] **Step 8: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/ledger/mercuryReconciliation.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 9: Register in `server/index.js`**

```javascript
// server/index.js — near the other route imports
import mercuryReconciliationRouter from './routes/mercuryReconciliation.js';

// server/index.js — mount (not added to readRoutes/dataRoutes tiers — falls
// back to the Tier 1 global 300/15min limit, acceptable for an infrequent
// manual import action; note this explicitly rather than leaving it silent)
app.use('/api/mercury-import', mercuryReconciliationRouter);
```

- [ ] **Step 10: Commit**

```bash
git add server/utils/csvParser.js server/routes/mercuryReconciliation.js server/index.js tests/ledger/csvParser.test.ts tests/ledger/mercuryReconciliation.test.ts
git commit -m "feat: add Mercury CSV parser and bank reconciliation endpoint"
```

---

### Task 12: `permissions.finance` — backend default + frontend type

**Files:**
- Modify: `server/models/User.js`
- Modify: `types.ts`
- Modify: `App.tsx` (3 demo user literals)
- Modify: `components/UserManagement.tsx` (`defaultPermissions`, `getPermissionsForRole`, permissions editor UI)

**Interfaces:**
- Produces: `ModulePermissions.finance: boolean`, present (not optional — matches every other field in that interface) everywhere a full `ModulePermissions` object is constructed.

- [ ] **Step 1: Update the Mongoose default**

```javascript
// server/models/User.js — change this line:
        default: { dashboard: false, crm: false, projects: false, portal: true, admin: false }
// to:
        default: { dashboard: false, crm: false, projects: false, portal: true, admin: false, finance: false }
```

- [ ] **Step 2: Update the TypeScript interface**

```typescript
// types.ts — change:
export interface ModulePermissions {
  dashboard: boolean; 
  crm: boolean;
  projects: boolean;
  portal: boolean;
  admin: boolean;
}
// to:
export interface ModulePermissions {
  dashboard: boolean; 
  crm: boolean;
  projects: boolean;
  portal: boolean;
  admin: boolean;
  finance: boolean;
}
```

- [ ] **Step 3: Update the 3 demo users in `App.tsx`**

```typescript
// App.tsx lines 185-187 — add finance: true for the admin, finance: false for the other two
  { id: 'u1', name: 'Fabian Rojas', email: 'fabian@incoda.com.co', role: 'admin', permissions: { dashboard: true, crm: true, projects: true, portal: true, admin: true, finance: true }, monthlySalary: 5000, hourlyCost: 50 },
  { id: 'u2', name: 'Sarah Connor', email: 'sarah@future.com', role: 'consultant', permissions: { dashboard: false, crm: false, projects: false, portal: true, admin: false, finance: false }, monthlySalary: 0, hourlyCost: 90 },
  { id: 'u3', name: 'Kyle Reese', email: 'kyle@tech.com', role: 'sales', permissions: { dashboard: true, crm: true, projects: false, portal: false, admin: false, finance: false }, monthlySalary: 3000, hourlyCost: 0 }
```

- [ ] **Step 4: Update `components/UserManagement.tsx`**

```typescript
// components/UserManagement.tsx — defaultPermissions (around line 17)
  const defaultPermissions: ModulePermissions = {
    dashboard: true,
    crm: false,
    projects: false,
    portal: true,
    admin: false,
    finance: false
  };

// components/UserManagement.tsx — getPermissionsForRole (around line 36)
  const getPermissionsForRole = (role: UserRole): ModulePermissions => {
    switch (role) {
      case 'admin':
        return { dashboard: true, crm: true, projects: true, portal: true, admin: true, finance: true };
      case 'sales':
        return { dashboard: true, crm: true, projects: false, portal: false, admin: false, finance: false };
      case 'consultant':
        return { dashboard: false, crm: false, projects: false, portal: true, admin: false, finance: false }; // No dashboard for consultants
      default:
        return defaultPermissions;
    }
  };
```

- [ ] **Step 5: Add a "Finance / Ledger" toggle to the permissions editor UI**

Find the block in `components/UserManagement.tsx` that renders one checkbox per `ModulePermissions` key (it calls `togglePermission(key)` for each — search for `togglePermission(` in the JSX, not the function definition). Add one more checkbox row there, following the exact same pattern as the `admin` checkbox immediately above it, with `formData.permissions.finance` / `togglePermission('finance')` and label `"Finance / Ledger"`.

- [ ] **Step 6: Type-check**

Run: `pnpm build` (runs `tsc && vite build`)
Expected: No new TypeScript errors. If any other `.tsx` file constructs a full `ModulePermissions` object literal that `tsc` flags as missing `finance`, add `finance: false` there too (the compiler error will name the exact file/line).

- [ ] **Step 7: Commit**

```bash
git add server/models/User.js types.ts App.tsx components/UserManagement.tsx
git commit -m "feat: add permissions.finance module flag for the Ledger module"
```

---

### Task 13: Frontend types for `LedgerAccount` / `JournalEntry`

**Files:**
- Modify: `types.ts`

**Interfaces:**
- Produces: `LedgerAccountType`, `TaxCategory`, `LedgerAccount`, `JournalLine`, `JournalEntry`, `JournalSource` — TypeScript mirrors of the Mongoose schemas from Tasks 1–2, used by every component in Tasks 14–17.

- [ ] **Step 1: Add the types**

```typescript
// types.ts — append near the existing FINANCE TRANSACTIONS section

// ==================================================================================
// GENERAL LEDGER — Double-entry chart of accounts + journal entries
// ==================================================================================

export type LedgerAccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export type TaxCategory =
  | 'Advertising' | 'Contract Labor' | 'Office Expense' | 'Insurance'
  | 'Legal & Professional Services' | 'Rent' | 'Supplies' | 'Taxes & Licenses'
  | 'Travel' | 'Meals' | 'Utilities' | 'Other Expenses';

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: LedgerAccountType;
  normalBalance: 'debit' | 'credit';
  taxCategory?: string;
  isActive: boolean;
}

export type JournalSource = 'manual' | 'expense' | 'payment' | 'payroll' | 'commission' | 'import' | 'opening_balance';

export interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string;
  entityId?: string;
  currency: string;
  exchangeRateToUSD: number;
  amountUSD: number;
  reconciled?: boolean;
}

export interface JournalEntry {
  _id?: string;
  date: string;
  memo?: string;
  source: JournalSource;
  sourceId?: string;
  lines: JournalLine[];
  status: 'posted' | 'void';
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: LedgerAccountType;
  debit: number;
  credit: number;
}

export interface PLReport {
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  byAccount: { code: string; name: string; type: LedgerAccountType; amount: number; taxCategory: string }[];
}

export interface BalanceSheetReport {
  asOf: string;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
  byAccount: { code: string; name: string; type: LedgerAccountType; balance: number }[];
}

export interface NineninenineRow {
  entityId: string;
  totalUSD: number;
  crossesThreshold: boolean;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: No errors (this task only adds new exported types, nothing consumes them yet).

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat: add frontend types for LedgerAccount and JournalEntry"
```

---

### Task 14: `ChartOfAccountsTab.tsx` + `JournalTab.tsx`

**Files:**
- Create: `components/ledger/ChartOfAccountsTab.tsx`
- Create: `components/ledger/JournalTab.tsx`

**Interfaces:**
- Consumes: `LedgerAccount`, `JournalEntry`, `JournalLine` (Task 13); `/api/ledger-accounts`, `/api/journal-entries` (Tasks 7–8); `apiFetch`, `sanitizeId` (`services/apiFetch.ts`).
- Produces: `ChartOfAccountsTab` (list + inline edit of accounts) and `JournalTab` (list + manual entry form), both self-contained function components following the `InvoiceManager.tsx` pattern (own `useState`/`useEffect`/`apiFetch`, no props from `App.tsx`).

- [ ] **Step 1: Write `ChartOfAccountsTab.tsx`**

```typescript
// components/ledger/ChartOfAccountsTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, X } from 'lucide-react';
import type { LedgerAccount, LedgerAccountType } from '../../types';
import { apiFetch, sanitizeId } from '../../services/apiFetch';

const TYPE_LABELS: Record<LedgerAccountType, string> = {
  asset: 'Activo', liability: 'Pasivo', equity: 'Patrimonio', income: 'Ingreso', expense: 'Gasto',
};

export function ChartOfAccountsTab() {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', name: '', type: 'expense' as LedgerAccountType, taxCategory: '' });

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiFetch('/api/ledger-accounts');
      if (res.ok) setAccounts(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const resetForm = () => { setForm({ code: '', name: '', type: 'expense', taxCategory: '' }); setEditingId(null); setShowForm(false); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await apiFetch(`/api/ledger-accounts/${sanitizeId(editingId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    } else {
      await apiFetch('/api/ledger-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id: `la_${Date.now()}` }),
      });
    }
    resetForm();
    fetchAccounts();
  };

  const startEdit = (account: LedgerAccount) => {
    setForm({ code: account.code, name: account.name, type: account.type, taxCategory: account.taxCategory || '' });
    setEditingId(account.id);
    setShowForm(true);
  };

  const toggleActive = async (account: LedgerAccount) => {
    await apiFetch(`/api/ledger-accounts/${sanitizeId(account.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !account.isActive }),
    });
    fetchAccounts();
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Cargando plan de cuentas...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Plan de Cuentas</h2>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1 bg-purple-700 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-purple-800">
          <Plus size={16} /> Nueva Cuenta
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Código</label>
            <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="border border-gray-300 rounded-lg p-2 text-sm w-24" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="border border-gray-300 rounded-lg p-2 text-sm w-56" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as LedgerAccountType })} className="border border-gray-300 rounded-lg p-2 text-sm">
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {form.type === 'expense' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Categoría Schedule C</label>
              <input value={form.taxCategory} onChange={e => setForm({ ...form, taxCategory: e.target.value })} className="border border-gray-300 rounded-lg p-2 text-sm w-56" placeholder="ej. Office Expense" />
            </div>
          )}
          <button type="submit" className="bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-800">Guardar</button>
          <button type="button" onClick={resetForm} className="text-gray-500 text-sm px-3 py-2"><X size={16} /></button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-4">Código</th><th className="py-2 pr-4">Nombre</th><th className="py-2 pr-4">Tipo</th><th className="py-2 pr-4">Naturaleza</th><th className="py-2 pr-4">Categoría Fiscal</th><th className="py-2 pr-4">Activa</th><th></th>
          </tr>
        </thead>
        <tbody>
          {accounts.sort((a, b) => a.code.localeCompare(b.code)).map(account => (
            <tr key={account.id} className={`border-b border-gray-100 ${!account.isActive ? 'opacity-50' : ''}`}>
              <td className="py-2 pr-4 font-mono">{account.code}</td>
              <td className="py-2 pr-4">{account.name}</td>
              <td className="py-2 pr-4">{TYPE_LABELS[account.type]}</td>
              <td className="py-2 pr-4 capitalize">{account.normalBalance}</td>
              <td className="py-2 pr-4">{account.taxCategory || '—'}</td>
              <td className="py-2 pr-4">
                <input type="checkbox" checked={account.isActive} onChange={() => toggleActive(account)} />
              </td>
              <td className="py-2"><button onClick={() => startEdit(account)} className="text-gray-400 hover:text-purple-700"><Edit2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write `JournalTab.tsx`**

```typescript
// components/ledger/JournalTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Ban } from 'lucide-react';
import type { LedgerAccount, JournalEntry, JournalLine } from '../../types';
import { apiFetch, sanitizeId } from '../../services/apiFetch';

type DraftLine = { accountId: string; side: 'debit' | 'credit'; amount: string };

function formatUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function JournalTab() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { accountId: '', side: 'debit', amount: '' },
    { accountId: '', side: 'credit', amount: '' },
  ]);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    const [entriesRes, accountsRes] = await Promise.all([
      apiFetch('/api/journal-entries'),
      apiFetch('/api/ledger-accounts'),
    ]);
    if (entriesRes.ok) setEntries(await entriesRes.json());
    if (accountsRes.ok) setAccounts(await accountsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const accountsById = Object.fromEntries(accounts.map(a => [a.id, a]));

  const totalDebit = draftLines.filter(l => l.side === 'debit').reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const totalCredit = draftLines.filter(l => l.side === 'credit').reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const isBalanced = draftLines.length >= 2 && Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const addLine = () => setDraftLines([...draftLines, { accountId: '', side: 'debit', amount: '' }]);
  const updateLine = (i: number, patch: Partial<DraftLine>) => {
    setDraftLines(draftLines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  };

  const resetForm = () => {
    setMemo(''); setDraftLines([{ accountId: '', side: 'debit', amount: '' }, { accountId: '', side: 'credit', amount: '' }]);
    setShowForm(false); setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) { setError('Los débitos deben ser iguales a los créditos.'); return; }
    const lines: Partial<JournalLine>[] = draftLines
      .filter(l => l.accountId && Number(l.amount) > 0)
      .map(l => ({
        accountId: l.accountId,
        debit: l.side === 'debit' ? Number(l.amount) : 0,
        credit: l.side === 'credit' ? Number(l.amount) : 0,
        currency: 'USD',
        exchangeRateToUSD: 1,
        amountUSD: Number(l.amount),
      }));
    const res = await apiFetch('/api/journal-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, memo, source: 'manual', lines }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Error desconocido' }));
      setError(body.error);
      return;
    }
    resetForm();
    fetchAll();
  };

  const voidEntry = async (id: string) => {
    await apiFetch(`/api/journal-entries/${sanitizeId(id)}/void`, { method: 'POST' });
    fetchAll();
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Cargando libro diario...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Libro Diario</h2>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 bg-purple-700 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-purple-800">
          <Plus size={16} /> Asiento Manual
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex gap-3 mb-3">
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="border border-gray-300 rounded-lg p-2 text-sm" />
            <input placeholder="Memo" value={memo} onChange={e => setMemo(e.target.value)} className="flex-1 border border-gray-300 rounded-lg p-2 text-sm" />
          </div>
          {draftLines.map((line, i) => (
            <div key={i} className="flex gap-2 mb-2 items-center">
              <select value={line.accountId} onChange={e => updateLine(i, { accountId: e.target.value })} className="border border-gray-300 rounded-lg p-2 text-sm flex-1">
                <option value="">-- Cuenta --</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
              <select value={line.side} onChange={e => updateLine(i, { side: e.target.value as 'debit' | 'credit' })} className="border border-gray-300 rounded-lg p-2 text-sm">
                <option value="debit">Débito</option>
                <option value="credit">Crédito</option>
              </select>
              <input type="number" min="0" step="0.01" value={line.amount} onChange={e => updateLine(i, { amount: e.target.value })} className="border border-gray-300 rounded-lg p-2 text-sm w-32" placeholder="Monto" />
            </div>
          ))}
          <button type="button" onClick={addLine} className="text-sm text-purple-700 mb-3">+ Agregar línea</button>
          <div className="text-sm mb-3">
            Débitos: {formatUSD(totalDebit)} — Créditos: {formatUSD(totalCredit)} — {isBalanced ? <span className="text-green-600">Balanceado</span> : <span className="text-red-600">Descuadrado</span>}
          </div>
          {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={!isBalanced} className="bg-purple-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg">Guardar Asiento</button>
            <button type="button" onClick={resetForm} className="text-gray-500 text-sm px-3 py-2">Cancelar</button>
          </div>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-4">Fecha</th><th className="py-2 pr-4">Memo</th><th className="py-2 pr-4">Origen</th><th className="py-2 pr-4">Líneas</th><th className="py-2 pr-4">Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr key={entry._id} className={`border-b border-gray-100 align-top ${entry.status === 'void' ? 'opacity-40' : ''}`}>
              <td className="py-2 pr-4">{new Date(entry.date).toLocaleDateString()}</td>
              <td className="py-2 pr-4">{entry.memo || '—'}</td>
              <td className="py-2 pr-4 capitalize">{entry.source}</td>
              <td className="py-2 pr-4">
                {entry.lines.map((l, idx) => (
                  <div key={idx}>{accountsById[l.accountId]?.name || l.accountId}: {l.debit > 0 ? `Db ${formatUSD(l.amountUSD)}` : `Cr ${formatUSD(l.amountUSD)}`}</div>
                ))}
              </td>
              <td className="py-2 pr-4 capitalize">{entry.status}</td>
              <td className="py-2">
                {entry.status === 'posted' && entry._id && (
                  <button onClick={() => voidEntry(entry._id!)} className="text-gray-400 hover:text-red-600" title="Anular"><Ban size={14} /></button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Manual browser verification**

Run `pnpm dev:full`, log in as an admin user, temporarily render `<ChartOfAccountsTab />` and `<JournalTab />` directly (Task 17 wires them into the real `/ledger` route — for now, verify in isolation, e.g. by adding a throwaway route). Confirm: the seeded 18 accounts render, creating a new account works, creating a manual entry with mismatched debit/credit disables the submit button and shows "Descuadrado", a balanced entry saves and appears in the list, and voiding an entry dims the row.

- [ ] **Step 4: Commit**

```bash
git add components/ledger/ChartOfAccountsTab.tsx components/ledger/JournalTab.tsx
git commit -m "feat: add Chart of Accounts and Journal tabs for the Ledger module"
```

---

### Task 15: `CompanyExpensesTab.tsx` + `ReportsTab.tsx`

**Files:**
- Create: `components/ledger/CompanyExpensesTab.tsx`
- Create: `components/ledger/ReportsTab.tsx`

**Interfaces:**
- Consumes: `Transaction`, `TaxCategory`, `PLReport`, `BalanceSheetReport` (Task 13); `/api/transactions` (existing route, unchanged), `/api/ledger-reports/pl`, `/api/ledger-reports/balance-sheet` (Task 9).
- Produces: `CompanyExpensesTab` — the sole entry point for non-project/lead expenses (per the approved spec, `FinanceManager.tsx`'s `'general'` option is removed in Task 17). `ReportsTab` — renders P&L and Balance Sheet for a selected period.

- [ ] **Step 1: Write `CompanyExpensesTab.tsx`**

```typescript
// components/ledger/CompanyExpensesTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import type { Transaction, TaxCategory } from '../../types';
import { apiFetch } from '../../services/apiFetch';

const TAX_CATEGORIES: TaxCategory[] = [
  'Advertising', 'Contract Labor', 'Office Expense', 'Insurance',
  'Legal & Professional Services', 'Rent', 'Supplies', 'Taxes & Licenses',
  'Travel', 'Meals', 'Utilities', 'Other Expenses',
];

export function CompanyExpensesTab() {
  const [expenses, setExpenses] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', amount: 0, date: new Date().toISOString().split('T')[0], taxCategory: 'Office Expense' as TaxCategory, description: '' });

  const fetchExpenses = useCallback(async () => {
    const res = await apiFetch('/api/transactions');
    if (res.ok) {
      const all: Transaction[] = await res.json();
      setExpenses(all.filter(t => t.type === 'expense' && !t.projectId && !t.leadId && (t as any).taxCategory));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `tx_${Date.now()}`,
        title: form.title,
        amount: form.amount,
        amountUSD: form.amount,
        currency: 'USD',
        exchangeRateToUSD: 1,
        date: form.date,
        dateObj: new Date(form.date),
        type: 'expense',
        category: 'other',
        taxCategory: form.taxCategory,
        description: form.description,
      }),
    });
    setForm({ title: '', amount: 0, date: new Date().toISOString().split('T')[0], taxCategory: 'Office Expense', description: '' });
    setShowForm(false);
    fetchExpenses();
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Cargando gastos...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Gastos de la Empresa</h2>
          <p className="text-xs text-gray-500">Gastos generales no ligados a un proyecto o cliente (renta, seguros, suscripciones...). Para gastos de proyecto, usa Finance.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 bg-purple-700 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-purple-800">
          <Plus size={16} /> Nuevo Gasto
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Título</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Monto (USD)</label>
            <input required type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
            <input required type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Categoría (Schedule C)</label>
            <select required value={form.taxCategory} onChange={e => setForm({ ...form, taxCategory: e.target.value as TaxCategory })} className="w-full border border-gray-300 rounded-lg p-2 text-sm">
              {TAX_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
          </div>
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Guardar</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-500 text-sm px-3 py-2">Cancelar</button>
          </div>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-4">Fecha</th><th className="py-2 pr-4">Título</th><th className="py-2 pr-4">Categoría</th><th className="py-2 pr-4">Monto</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map(exp => (
            <tr key={exp.id} className="border-b border-gray-100">
              <td className="py-2 pr-4">{exp.date}</td>
              <td className="py-2 pr-4">{exp.title}</td>
              <td className="py-2 pr-4">{(exp as any).taxCategory}</td>
              <td className="py-2 pr-4">${exp.amount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write `ReportsTab.tsx`**

```typescript
// components/ledger/ReportsTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { PLReport, BalanceSheetReport } from '../../types';
import { apiFetch } from '../../services/apiFetch';

function formatUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function ReportsTab() {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [pl, setPl] = useState<PLReport | null>(null);
  const [bs, setBs] = useState<BalanceSheetReport | null>(null);

  const fetchReports = useCallback(async () => {
    const [plRes, bsRes] = await Promise.all([
      apiFetch(`/api/ledger-reports/pl?start=${start}&end=${end}`),
      apiFetch(`/api/ledger-reports/balance-sheet?asOf=${end}`),
    ]);
    if (plRes.ok) setPl(await plRes.json());
    if (bsRes.ok) setBs(await bsRes.json());
  }, [start, end]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Reportes Financieros</h2>
      <div className="flex gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className="border border-gray-300 rounded-lg p-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border border-gray-300 rounded-lg p-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Estado de Resultados (P&L)</h3>
          {pl && (
            <>
              <table className="w-full text-sm mb-3">
                <tbody>
                  {pl.byAccount.map(a => (
                    <tr key={a.code} className="border-b border-gray-100">
                      <td className="py-1">{a.name}</td>
                      <td className="py-1 text-right">{formatUSD(a.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between text-sm"><span>Ingresos Totales</span><span>{formatUSD(pl.totalIncome)}</span></div>
              <div className="flex justify-between text-sm"><span>Gastos Totales</span><span>{formatUSD(pl.totalExpense)}</span></div>
              <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-2 mt-2"><span>Utilidad Neta</span><span>{formatUSD(pl.netIncome)}</span></div>
            </>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Balance General</h3>
          {bs && (
            <>
              {!bs.balanced && (
                <div className="text-sm text-red-600 mb-3">⚠ Activos ≠ Pasivos + Patrimonio — revisar asientos.</div>
              )}
              <table className="w-full text-sm mb-3">
                <tbody>
                  {bs.byAccount.map(a => (
                    <tr key={a.code} className="border-b border-gray-100">
                      <td className="py-1">{a.name}</td>
                      <td className="py-1 text-right">{formatUSD(a.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between text-sm"><span>Total Activos</span><span>{formatUSD(bs.totalAssets)}</span></div>
              <div className="flex justify-between text-sm"><span>Total Pasivos</span><span>{formatUSD(bs.totalLiabilities)}</span></div>
              <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-2 mt-2"><span>Total Patrimonio</span><span>{formatUSD(bs.totalEquity)}</span></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual browser verification**

Confirm creating a company expense with a `taxCategory` shows up in `CompanyExpensesTab`, and that `ReportsTab` reflects it in the P&L within a day of the entry date. Verify the "Activos ≠ Pasivos" warning appears if you manually corrupt a `JournalEntry` in the DB (temporary test only, revert after).

- [ ] **Step 4: Commit**

```bash
git add components/ledger/CompanyExpensesTab.tsx components/ledger/ReportsTab.tsx
git commit -m "feat: add Company Expenses and Reports tabs for the Ledger module"
```

---

### Task 16: `ReconciliationTab.tsx` + `TenNinetyNineTab.tsx`

**Files:**
- Create: `components/ledger/ReconciliationTab.tsx`
- Create: `components/ledger/TenNinetyNineTab.tsx`

**Interfaces:**
- Consumes: `NineninenineRow` (Task 13); `/api/mercury-import`, `/api/mercury-import/confirm-match` (Task 11); `/api/ledger-reports/1099` (Task 10).

- [ ] **Step 1: Write `ReconciliationTab.tsx`**

```typescript
// components/ledger/ReconciliationTab.tsx
import React, { useState } from 'react';
import { Upload, CheckCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import { apiFetch } from '../../services/apiFetch';

type ImportResult = {
  matched: { bankRow: Record<string, string>; journalEntryId: string; lineIndex: number }[];
  unmatched: { journalEntryId: string; lineIndex: number; date: string; amount: number }[];
  missing: { bankRow: Record<string, string> }[];
  parseErrors: { row: number; message: string }[];
};

export function ReconciliationTab() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const csv = await file.text();
      const res = await apiFetch('/api/mercury-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      if (res.ok) setResult(await res.json());
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const confirmMatch = async (journalEntryId: string, lineIndex: number) => {
    await apiFetch('/api/mercury-import/confirm-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ journalEntryId, lineIndex }),
    });
    setResult(r => r ? { ...r, unmatched: r.unmatched.filter(u => !(u.journalEntryId === journalEntryId && u.lineIndex === lineIndex)) } : r);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Conciliación Mercury</h2>
      <label className="flex items-center gap-2 w-fit cursor-pointer bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-800 mb-6">
        <Upload size={16} /> Subir CSV de Mercury
        <input type="file" accept=".csv" className="hidden" onChange={handleFile} disabled={busy} />
      </label>

      {result && (
        <div className="space-y-6">
          {result.parseErrors.length > 0 && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {result.parseErrors.length} fila(s) del CSV no se pudieron leer: {result.parseErrors.map(e => `fila ${e.row}`).join(', ')}
            </div>
          )}

          <div>
            <h3 className="flex items-center gap-2 font-semibold text-green-700 mb-2"><CheckCircle size={16} /> Conciliadas ({result.matched.length})</h3>
            <p className="text-xs text-gray-500">Coinciden automáticamente por fecha y monto con un asiento existente.</p>
          </div>

          <div>
            <h3 className="flex items-center gap-2 font-semibold text-amber-700 mb-2"><AlertTriangle size={16} /> Sin conciliar en el libro ({result.unmatched.length})</h3>
            <p className="text-xs text-gray-500 mb-2">Movimientos de Cash en el libro que no aparecieron en el statement del banco — revisar.</p>
            {result.unmatched.map((u, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-gray-100 py-2">
                <span>{new Date(u.date).toLocaleDateString()} — ${Math.abs(u.amount).toLocaleString()}</span>
                <button onClick={() => confirmMatch(u.journalEntryId, u.lineIndex)} className="text-purple-700 text-xs">Marcar como conciliado manualmente</button>
              </div>
            ))}
          </div>

          <div>
            <h3 className="flex items-center gap-2 font-semibold text-red-700 mb-2"><HelpCircle size={16} /> Faltantes en el libro ({result.missing.length})</h3>
            <p className="text-xs text-gray-500 mb-2">Movimientos del banco sin asiento contable — crea el gasto/asiento correspondiente en la pestaña Gastos de la Empresa o Libro Diario.</p>
            {result.missing.map((m, i) => (
              <div key={i} className="text-sm border-b border-gray-100 py-2">
                {m.bankRow.Date} — {m.bankRow.Description} — ${m.bankRow.Amount}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `TenNinetyNineTab.tsx`**

```typescript
// components/ledger/TenNinetyNineTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { NineninenineRow } from '../../types';
import { apiFetch } from '../../services/apiFetch';

export function TenNinetyNineTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<NineninenineRow[]>([]);

  const fetchRows = useCallback(async () => {
    const res = await apiFetch(`/api/ledger-reports/1099?year=${year}`);
    if (res.ok) setRows(await res.json());
  }, [year]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Reporte 1099-NEC</h2>
      <p className="text-xs text-gray-500 mb-4">
        Suma de pagos a contratistas (cuenta Contract Labor) por año. No presenta el 1099 ante el IRS —
        usa estos datos con un CPA o un servicio de e-filing (Track1099, IRS FIRE).
      </p>
      <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="border border-gray-300 rounded-lg p-2 text-sm mb-4 w-28" />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-4">Contratista</th><th className="py-2 pr-4">Total Pagado (USD)</th><th className="py-2 pr-4">¿Cruza $600?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.entityId} className="border-b border-gray-100">
              <td className="py-2 pr-4">{r.entityId}</td>
              <td className="py-2 pr-4">${r.totalUSD.toLocaleString()}</td>
              <td className="py-2 pr-4">{r.crossesThreshold ? <span className="text-amber-700 font-medium">Sí — requiere 1099-NEC</span> : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Manual browser verification**

Upload a small sample CSV (`Date,Description,Amount\n2026-07-01,Test,-100.00\n`) against a DB with a matching and a non-matching `JournalEntry`, confirm the matched/unmatched/missing buckets render correctly. Confirm the 1099 tab shows a consultant crossing $600 with the "Sí" label.

- [ ] **Step 4: Commit**

```bash
git add components/ledger/ReconciliationTab.tsx components/ledger/TenNinetyNineTab.tsx
git commit -m "feat: add Reconciliation and 1099 tabs for the Ledger module"
```

---

### Task 17: `Ledger.tsx` shell + `App.tsx` wiring + `FinanceManager.tsx` cleanup

**Files:**
- Create: `components/Ledger.tsx`
- Modify: `App.tsx`
- Modify: `components/FinanceManager.tsx`

**Interfaces:**
- Consumes: all 6 tab components (Tasks 14–16).
- Produces: `Ledger` component (tab shell, no props — self-contained like `InvoiceManager`), mounted at `/ledger`, gated by `perm.finance`.

- [ ] **Step 1: Write `components/Ledger.tsx`**

```typescript
// components/Ledger.tsx
import React, { useState } from 'react';
import { BookOpen, ListTree, Wallet, FileBarChart, Landmark, FileSpreadsheet } from 'lucide-react';
import { ChartOfAccountsTab } from './ledger/ChartOfAccountsTab';
import { JournalTab } from './ledger/JournalTab';
import { CompanyExpensesTab } from './ledger/CompanyExpensesTab';
import { ReportsTab } from './ledger/ReportsTab';
import { ReconciliationTab } from './ledger/ReconciliationTab';
import { TenNinetyNineTab } from './ledger/TenNinetyNineTab';

type TabKey = 'accounts' | 'journal' | 'expenses' | 'reports' | 'reconciliation' | '1099';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'expenses', label: 'Gastos de la Empresa', icon: Wallet },
  { key: 'journal', label: 'Libro Diario', icon: BookOpen },
  { key: 'accounts', label: 'Plan de Cuentas', icon: ListTree },
  { key: 'reconciliation', label: 'Conciliación Mercury', icon: Landmark },
  { key: 'reports', label: 'P&L / Balance Sheet', icon: FileBarChart },
  { key: '1099', label: 'Reporte 1099', icon: FileSpreadsheet },
];

export function Ledger() {
  const [activeTab, setActiveTab] = useState<TabKey>('expenses');

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 bg-white px-6 pt-4">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Contabilidad</h1>
        <div className="flex gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition ${activeTab === tab.key ? 'border-purple-700 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-white">
        {activeTab === 'expenses' && <CompanyExpensesTab />}
        {activeTab === 'journal' && <JournalTab />}
        {activeTab === 'accounts' && <ChartOfAccountsTab />}
        {activeTab === 'reconciliation' && <ReconciliationTab />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === '1099' && <TenNinetyNineTab />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `App.tsx`**

```typescript
// App.tsx — add to the lazy-import block (near FinancialBalanceReport, line ~63)
const Ledger = React.lazy(() => import('./components/Ledger').then(m => ({ default: m.Ledger })));

// App.tsx — add BookOpen to the lucide-react import (line 4) if not already present from Task 16's icon set
// (BookOpen, ListTree, Wallet, FileBarChart, Landmark, FileSpreadsheet are only used inside Ledger.tsx's
// own file, not App.tsx, so no import change is needed here beyond the Ledger lazy import itself)

// App.tsx — add the route, near '/finance' (around line 698)
                <Route path="/ledger" element={
                    perm.finance
                        ? <ErrorBoundary moduleName="Ledger"><Ledger /></ErrorBoundary>
                        : <Navigate to="/" />
                } />

// App.tsx — add the sidebar link inside the `permissions?.admin` block (around line 322, right after the Finance link)
                {currentUser.permissions?.finance && (
                    <NavLink to="/ledger" icon={DollarSign} label="Contabilidad" />
                )}
```

Note: the sidebar link is gated on `permissions?.finance` directly (its own `if`), not nested inside the `permissions?.admin` block — an admin gets `finance: true` by default (Task 12), but a future non-admin user with only `finance: true` should still see the link without needing full admin.

- [ ] **Step 3: Remove the `general` expense-link option from `FinanceManager.tsx`**

```typescript
// components/FinanceManager.tsx line 94 — change the type and default:
  const [expenseLinkType, setExpenseLinkType] = useState<'project' | 'lead'>('project');

// components/FinanceManager.tsx line 643 — change the reset call:
    setExpenseLinkType('project');

// components/FinanceManager.tsx lines 2098-2106 — delete the "General" button entirely:
```
Remove:
```typescript
                              <button 
                                type="button" 
                                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition ${expenseLinkType === 'general' ? 'bg-gray-100 text-gray-800 border-gray-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                onClick={() => setExpenseLinkType('general')}
                              >
                                  General
                              </button>
```

- [ ] **Step 4: Type-check and build**

Run: `pnpm build`
Expected: No TypeScript errors. `expenseLinkType` no longer being `'general'` anywhere means the `project`/`lead` ternaries elsewhere in `FinanceManager.tsx` (lines ~668-670) still work unchanged since they already default to `undefined` for the non-matching branch.

- [ ] **Step 5: Full manual browser verification (golden path)**

Run `pnpm dev:full`. Log in as the admin demo user (`fabian@incoda.com.co`). Confirm:
1. "Contabilidad" appears in the sidebar and `/ledger` loads with 6 tabs, defaulting to "Gastos de la Empresa".
2. Creating a company expense with `taxCategory: 'Rent'` appears in the Journal tab as a balanced Debit Rent / Credit Cash entry within a few seconds (Mongoose hook latency).
3. `FinanceManager.tsx`'s expense modal no longer shows a "General" button — only "Project" and "Pre-sales".
4. Logging in as `sarah@future.com` (consultant, `finance: false`) does not show "Contabilidad" in the sidebar, and navigating directly to `/ledger` redirects to `/`.
5. P&L in the Reports tab reflects the new company expense as a negative to net income.

- [ ] **Step 6: Run the full test suite one more time**

Run: `pnpm test`
Expected: All tests pass — the new `tests/ledger/*.test.ts` files plus the pre-existing `tests/business.test.ts` and `tests/financial-balance/financial-balance.test.js`.

- [ ] **Step 7: Commit**

```bash
git add components/Ledger.tsx App.tsx components/FinanceManager.tsx
git commit -m "feat: wire the Ledger module into the app and retire the general expense option"
```

---

## Self-Review Notes

- **Spec coverage**: chart of accounts (Task 1, 7), journal entries incl. manual/void (Task 2, 8), posting automation for expense/consultant/payment/commission (Tasks 3–6), P&L/Balance Sheet/trial balance (Task 9), 1099 (Task 10), Mercury CSV + reconciliation (Task 11), period close (Task 8), permissions.finance (Task 12), frontend types (Task 13), all 6 UI tabs (Tasks 14–16), FinanceManager `general` removal + full wiring (Task 17). No spec section is without a task.
- **No MongoDB transactions**: verified every posting function (Tasks 3–4) and every hook (Tasks 5–6) creates exactly one `JournalEntry.create()` call with no `session` argument, and hooks catch their own errors — grepped for `startSession` across the new code, zero matches, consistent with the Global Constraints.
- **Type consistency check**: `postExpense`/`postConsultantPayment`/`postPaymentReceived`/`postCommissionPaid` signatures match between Task 3/4 (definition) and Task 5/6 (call sites) — all take a plain object (`doc.toObject()` or lean doc), not a Mongoose document, avoiding accidental recursive hook triggers. `JournalLine` field names (`accountId`, `debit`, `credit`, `amountUSD`, `entityId`, `reconciled`) are identical across Task 2 (schema), Task 3/4 (service), Task 9/10/11 (reports/reconciliation), and Task 13 (frontend type) — cross-checked field by field.
- **Idempotency**: every posting function checks `alreadyPosted(source, sourceId)` before creating an entry, and Task 5's hooks only fire `if (doc.wasNew)`, so edits never double-post — this was called out explicitly because it wasn't fully spelled out in the original spec.
