# Search Full-Text Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `GET /api/search` use indexed word/token search instead of unanchored `$regex` (which cannot use any index), while keeping the same response shape.

**Architecture:** Add a MongoDB text index to each of the 5 searched collections (`Lead`, `Project`, `Contact`, `SKU`, `Transaction`), covering exactly the fields currently in each `$or` block. Rewrite `server/routes/search.js` to query with `$text: { $search: q }` sorted by `{ $meta: 'textScore' }`, instead of unanchored regex. This changes matching from "contains anywhere" to "matches a word/token" — e.g. searching "acme" still finds "Acme Corp" and "john@acme.com", but "orp" no longer matches "Corp". Confirmed acceptable trade-off (see conversation).

**Tech Stack:** Express, Mongoose (MongoDB text indexes), `node:test` + `supertest` + `mongodb-memory-server`.

**Spec:** N/A — bounded fix. Design agreed in conversation; captured in full in this plan's Architecture section and Task 1 below.

## Global Constraints

- Keep the exact same JSON response shape (`{ results: { leads, projects, contacts, skus, transactions }, total }`) — the frontend consuming this endpoint does not change.
- Keep the existing `deleted: { $ne: true }` filter on `Lead`, and the existing `isAdmin` gate on `Transaction` — both combine with the new `$text` query, they don't replace any existing filter.
- One text index per collection (MongoDB's limit) — each of the 5 models gets exactly one, covering all fields that collection searches on.

---

### Task 1: Text indexes + `$text`-based search route

**Files:**
- Modify: `server/models/Lead.js` (add text index near the existing `LeadSchema.index(...)` calls)
- Modify: `server/models/Project.js` (add text index)
- Modify: `server/models/Contact.js` (add text index)
- Modify: `server/models/SKU.js` (add text index)
- Modify: `server/models/Transaction.js` (add text index)
- Modify: `server/routes/search.js` (replace regex `$or` blocks with `$text` queries)
- Test: `tests/search.test.ts`

**Interfaces:**
- Consumes: nothing new — same models, same route file, same mount point (`app.use('/api/search', searchRouter)` in `server/index.js`, unchanged).
- Produces: same `GET /api/search?q=&limit=` contract as before.

- [ ] **Step 1: Write the failing test**

```ts
// tests/search.test.ts
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Lead from '../server/models/Lead.js';
import Project from '../server/models/Project.js';
import Contact from '../server/models/Contact.js';
import SKU from '../server/models/SKU.js';
import Transaction from '../server/models/Transaction.js';
import searchRouter from '../server/routes/search.js';

let mongoServer;

function buildApp(isAdmin) {
  const a = express();
  a.use((req, _res, next) => {
    req.session = { user: { permissions: { admin: isAdmin } } };
    next();
  });
  a.use('/api/search', searchRouter);
  return a;
}

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    Lead.deleteMany({}),
    Project.deleteMany({}),
    Contact.deleteMany({}),
    SKU.deleteMany({}),
    Transaction.deleteMany({}),
  ]);
});

describe('GET /api/search', () => {
  it('finds a lead by a full-word match on companyName', async () => {
    await Lead.create({ id: 'lead_1', companyName: 'Acme Corp', contactName: 'Jane Doe' });

    const res = await request(buildApp(false)).get('/api/search?q=Acme');

    assert.equal(res.status, 200);
    assert.equal(res.body.results.leads.length, 1);
    assert.equal(res.body.results.leads[0].title, 'Acme Corp');
  });

  it('finds a lead by a word inside its email field', async () => {
    await Lead.create({
      id: 'lead_2',
      companyName: 'Beta LLC',
      contactName: 'John Roe',
      email: 'john@beta.com',
    });

    const res = await request(buildApp(false)).get('/api/search?q=beta');

    assert.ok(res.body.results.leads.some((l) => l.id === 'lead_2'));
  });

  it('finds a SKU by a word in its description', async () => {
    await SKU.create({
      id: 'sku_1',
      code: 'SKU-100',
      name: 'Widget',
      category: 'Hardware',
      description: 'Industrial grade fastener',
    });

    const res = await request(buildApp(false)).get('/api/search?q=fastener');

    assert.equal(res.body.results.skus.length, 1);
  });

  it('excludes transactions for a non-admin session', async () => {
    await Transaction.create({ id: 'txn_1', title: 'Acme invoice payment', amount: 100 });

    const res = await request(buildApp(false)).get('/api/search?q=Acme');

    assert.equal(res.body.results.transactions.length, 0);
  });

  it('includes transactions for an admin session', async () => {
    await Transaction.create({ id: 'txn_1', title: 'Acme invoice payment', amount: 100 });

    const res = await request(buildApp(true)).get('/api/search?q=Acme');

    assert.equal(res.body.results.transactions.length, 1);
  });

  it('returns empty results for an empty query without touching the database', async () => {
    const res = await request(buildApp(false)).get('/api/search?q=');

    assert.equal(res.status, 200);
    assert.equal(res.body.total, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/search.test.ts`
Expected: FAIL — MongoDB rejects `$text` queries with `text index required for $text query` (no text index exists yet on any of the 5 collections).

- [ ] **Step 3: Add text indexes to the 5 models**

In `server/models/Lead.js`, add alongside the existing `LeadSchema.index(...)` calls (near the bottom, before `export default`):

```js
LeadSchema.index({
  companyName: 'text',
  contactName: 'text',
  email: 'text',
  description: 'text',
  manufacturer: 'text',
  partnerName: 'text',
});
```

In `server/models/Project.js`:

```js
ProjectSchema.index({ name: 'text', clientName: 'text' });
```

In `server/models/Contact.js`:

```js
ContactSchema.index({ name: 'text', companyName: 'text', email: 'text', phone: 'text' });
```

In `server/models/SKU.js`:

```js
SKUSchema.index({ code: 'text', name: 'text', description: 'text' });
```

In `server/models/Transaction.js`:

```js
TransactionSchema.index({ title: 'text', description: 'text' });
```

(Match each file's existing schema variable name exactly — e.g. `LeadSchema`, `ProjectSchema`, etc. — as already used by that file's other `.index(...)` calls.)

- [ ] **Step 4: Rewrite `server/routes/search.js` to use `$text`**

Replace the body of the route handler (everything between `const isAdmin = ...` and the `Promise.all([...])` closing, i.e. the query construction) so the file becomes:

```js
import { Router } from 'express';
import Lead from '../models/Lead.js';
import Project from '../models/Project.js';
import Contact from '../models/Contact.js';
import SKU from '../models/SKU.js';
import Transaction from '../models/Transaction.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });

    const q = (req.query.q || '').trim();
    if (!q) return res.json({ results: { leads: [], projects: [], contacts: [], skus: [], transactions: [] }, total: 0 });

    const limit = Math.min(parseInt(req.query.limit) || 5, 25);
    const textSearch = { $text: { $search: q } };
    const scoreProjection = { score: { $meta: 'textScore' } };
    const isAdmin = req.session.user?.permissions?.admin;

    const [leads, projects, contacts, skus, transactions] = await Promise.all([
      Lead.find({ deleted: { $ne: true }, ...textSearch }, scoreProjection)
        .sort(scoreProjection).lean().limit(limit),

      Project.find(textSearch, scoreProjection)
        .sort(scoreProjection).lean().limit(limit),

      Contact.find(textSearch, scoreProjection)
        .sort(scoreProjection).lean().limit(limit),

      SKU.find(textSearch, scoreProjection)
        .sort(scoreProjection).lean().limit(limit),

      isAdmin
        ? Transaction.find(textSearch, scoreProjection).sort(scoreProjection).lean().limit(limit)
        : Promise.resolve([])
    ]);

    const shape = {
      leads: leads.map(d => ({
        id: d.id || String(d._id),
        title: d.companyName,
        subtitle: `${d.contactName || ''} — ${d.stage || ''}`,
        badge: d.stage,
        icon: 'Briefcase',
        route: '/crm',
        collectionType: 'leads'
      })),
      projects: projects.map(d => ({
        id: d.id || String(d._id),
        title: d.name,
        subtitle: `${d.type || ''} — ${d.status || ''}`,
        badge: d.status,
        icon: 'FolderKanban',
        route: '/projects',
        collectionType: 'projects'
      })),
      contacts: contacts.map(d => ({
        id: d.id || String(d._id),
        title: d.name,
        subtitle: d.companyName || d.email || '',
        icon: 'Users',
        route: '/contacts',
        collectionType: 'contacts'
      })),
      skus: skus.map(d => ({
        id: d.id || String(d._id),
        title: `${d.code || ''} — ${d.name || ''}`,
        subtitle: d.category || '',
        icon: 'Package',
        route: '/skus',
        collectionType: 'skus'
      })),
      transactions: transactions.map(d => ({
        id: d.id || String(d._id),
        title: d.title,
        subtitle: `$${d.amount || 0} — ${d.type || ''}`,
        badge: d.type,
        icon: 'DollarSign',
        route: '/finance',
        collectionType: 'transactions'
      }))
    };

    const total = Object.values(shape).reduce((s, arr) => s + arr.length, 0);
    res.json({ results: shape, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

(The `shape` mapping block is unchanged from the original file — only the query construction above it changed.)

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/search.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: all tests pass, including the new `tests/search.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add server/models/Lead.js server/models/Project.js server/models/Contact.js server/models/SKU.js server/models/Transaction.js server/routes/search.js tests/search.test.ts
git commit -m "perf: replace unindexed regex search with MongoDB text indexes"
```
