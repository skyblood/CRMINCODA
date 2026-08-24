# Lead Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically derive a lead's company domain from its email and pull free, lightweight signal (page title, meta description, industry guess) from that domain's homepage, surfaced on the lead card.

**Architecture:** A nightly `node-cron` job (same shape as `server/jobs/invoiceScheduler.js`) scans leads with an email and no enrichment attempt yet, derives a domain, fetches the homepage with a byte cap and timeout, regex-extracts title/meta tags (no new dependency), and keyword-guesses an industry. Results land on a new `Lead.enrichment` subdocument.

**Tech Stack:** Node.js/Express, Mongoose, `node-cron` (existing dependency), native `fetch`, `node:test` + `mongodb-memory-server`.

**Spec:** `docs/superpowers/specs/2026-08-23-lead-enrichment-design.md`

## Global Constraints

- No paid API, no new npm dependency — regex extraction over a byte-capped `fetch`.
- A lead whose enrichment attempt failed (`status: 'failed'`) is never retried automatically by the nightly job — only via the manual endpoint. This is intentional (see spec's Error handling) — don't "fix" this into an auto-retry loop.
- `guessIndustry` is explicitly best-effort; never surface it as authoritative data (e.g. don't feed it into `aiScore` or any report without a human in the loop).

---

### Task 1: `leadEnrichmentService.js`

**Files:**
- Create: `server/services/leadEnrichmentService.js`
- Test: `tests/leadEnrichmentService.test.ts`

**Interfaces:**
- Produces: `extractDomain(email: string): string | null`, `guessIndustry(title: string, description: string): string`, `fetchSiteMetadata(domain: string): Promise<{ title: string; metaDescription: string; ogSiteName: string }>`, `enrichLead(lead: { email?: string }): Promise<{ domain: string; title?: string; metaDescription?: string; ogSiteName?: string; industryGuess?: string; status: 'enriched' | 'failed' | 'skipped_free_domain'; enrichedAt: Date }>`. Task 2's scheduler consumes `enrichLead` directly; Task 3's manual-trigger route consumes it too.

- [ ] **Step 1: Write the failing test**

```ts
// tests/leadEnrichmentService.test.ts
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDomain,
  guessIndustry,
  fetchSiteMetadata,
  enrichLead,
} from '../server/services/leadEnrichmentService.js';

describe('extractDomain', () => {
  it('returns the lowercased domain from a normal business email', () => {
    assert.equal(extractDomain('Jane@Acme.COM'), 'acme.com');
  });

  it('returns null for a missing email', () => {
    assert.equal(extractDomain(undefined), null);
    assert.equal(extractDomain(''), null);
  });

  it('returns null for a malformed email', () => {
    assert.equal(extractDomain('not-an-email'), null);
    assert.equal(extractDomain('jane@nodot'), null);
  });

  it('returns null for each free/generic email provider', () => {
    for (const domain of ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'protonmail.com', 'aol.com', 'live.com', 'msn.com']) {
      assert.equal(extractDomain(`someone@${domain}`), null, `expected ${domain} to be blocked`);
    }
  });
});

describe('guessIndustry', () => {
  it('matches Technology for software/SaaS language', () => {
    assert.equal(guessIndustry('Acme SaaS Platform', 'We build software for teams'), 'Technology');
  });

  it('matches Healthcare for clinic/medical language', () => {
    assert.equal(guessIndustry('Acme Medical Clinic', ''), 'Healthcare');
  });

  it('matches Logistics for freight/shipping language', () => {
    assert.equal(guessIndustry('', 'Freight and cargo shipping services'), 'Logistics');
  });

  it('returns an empty string when nothing matches', () => {
    assert.equal(guessIndustry('Acme Corp', 'We do things for people'), '');
  });
});

describe('fetchSiteMetadata', () => {
  it('extracts title, meta description, and og:site_name from HTML', async () => {
    const html = `<html><head><title>Acme Corp — Home</title>
      <meta name="description" content="Industrial widgets since 1990">
      <meta property="og:site_name" content="Acme">
      </head><body></body></html>`;
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      body: { getReader: () => {
        let sent = false;
        return { read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: new TextEncoder().encode(html) };
        }, cancel: async () => {} };
      } },
    }));

    const meta = await fetchSiteMetadata('acme.com');

    assert.equal(meta.title, 'Acme Corp — Home');
    assert.equal(meta.metaDescription, 'Industrial widgets since 1990');
    assert.equal(meta.ogSiteName, 'Acme');
    mock.restoreAll();
  });

  it('returns empty strings for tags that are not present, without throwing', async () => {
    const html = `<html><head><title>Just A Title</title></head><body></body></html>`;
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      body: { getReader: () => {
        let sent = false;
        return { read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: new TextEncoder().encode(html) };
        }, cancel: async () => {} };
      } },
    }));

    const meta = await fetchSiteMetadata('bare.com');

    assert.equal(meta.title, 'Just A Title');
    assert.equal(meta.metaDescription, '');
    assert.equal(meta.ogSiteName, '');
    mock.restoreAll();
  });

  it('throws when the response is not ok', async () => {
    mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }));
    await assert.rejects(fetchSiteMetadata('gone.com'));
    mock.restoreAll();
  });
});

describe('enrichLead', () => {
  it('skips enrichment for a lead with no email', async () => {
    const result = await enrichLead({ email: '' });
    assert.equal(result.status, 'skipped_free_domain');
    assert.equal(result.domain, '');
  });

  it('skips enrichment for a free-provider email domain', async () => {
    const result = await enrichLead({ email: 'jane@gmail.com' });
    assert.equal(result.status, 'skipped_free_domain');
  });

  it('marks status failed when the fetch throws, without propagating the error', async () => {
    mock.method(globalThis, 'fetch', async () => { throw new Error('network down'); });
    const result = await enrichLead({ email: 'jane@dead-domain.com' });
    assert.equal(result.status, 'failed');
    assert.equal(result.domain, 'dead-domain.com');
    mock.restoreAll();
  });

  it('marks status enriched and stores the industry guess on success', async () => {
    const html = `<title>Acme SaaS</title><meta name="description" content="software for teams">`;
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      body: { getReader: () => {
        let sent = false;
        return { read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: new TextEncoder().encode(html) };
        }, cancel: async () => {} };
      } },
    }));
    const result = await enrichLead({ email: 'jane@acme.com' });
    assert.equal(result.status, 'enriched');
    assert.equal(result.domain, 'acme.com');
    assert.equal(result.industryGuess, 'Technology');
    mock.restoreAll();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/leadEnrichmentService.test.ts`
Expected: FAIL — `server/services/leadEnrichmentService.js` does not exist yet.

- [ ] **Step 3: Implement the service**

```js
// server/services/leadEnrichmentService.js
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
  'protonmail.com', 'aol.com', 'live.com', 'msn.com',
]);

export function extractDomain(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return null;
  const domain = email.split('@')[1]?.trim().toLowerCase();
  if (!domain || !domain.includes('.')) return null;
  if (FREE_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

const INDUSTRY_KEYWORDS = [
  { pattern: /\b(software|saas|platform|app)\b/i, industry: 'Technology' },
  { pattern: /\b(logistic|freight|shipping|cargo)\b/i, industry: 'Logistics' },
  { pattern: /\b(manufactur|factory|industrial)\b/i, industry: 'Manufacturing' },
  { pattern: /\b(construction|contractor|building)\b/i, industry: 'Construction' },
  { pattern: /\b(hospital|clinic|health|medical)\b/i, industry: 'Healthcare' },
  { pattern: /\b(bank|finance|financial|insurance)\b/i, industry: 'Financial Services' },
  { pattern: /\b(retail|store|shop|ecommerce)\b/i, industry: 'Retail' },
];

export function guessIndustry(title, description) {
  const text = `${title || ''} ${description || ''}`;
  for (const { pattern, industry } of INDUSTRY_KEYWORDS) {
    if (pattern.test(text)) return industry;
  }
  return '';
}

const MAX_HTML_BYTES = 50 * 1024;

export async function fetchSiteMetadata(domain) {
  const res = await fetch(`https://${domain}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  let html = '';
  let bytesRead = 0;
  while (bytesRead < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    html += Buffer.from(value).toString('utf8');
    bytesRead += value.length;
  }
  reader.cancel().catch(() => {});

  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || '';
  const metaDescription = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(html)?.[1]?.trim() || '';
  const ogSiteName = /<meta\s+property=["']og:site_name["']\s+content=["']([^"']*)["']/i.exec(html)?.[1]?.trim() || '';

  return { title, metaDescription, ogSiteName };
}

export async function enrichLead(lead) {
  const domain = extractDomain(lead.email);
  if (!domain) {
    return { domain: '', status: 'skipped_free_domain', enrichedAt: new Date() };
  }
  try {
    const { title, metaDescription, ogSiteName } = await fetchSiteMetadata(domain);
    const industryGuess = guessIndustry(title, metaDescription);
    return { domain, title, metaDescription, ogSiteName, industryGuess, status: 'enriched', enrichedAt: new Date() };
  } catch {
    return { domain, status: 'failed', enrichedAt: new Date() };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/leadEnrichmentService.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add server/services/leadEnrichmentService.js tests/leadEnrichmentService.test.ts
git commit -m "feat: add free-tier lead domain enrichment service"
```

---

### Task 2: `Lead.enrichment` schema + nightly scheduler

**Files:**
- Modify: `server/models/Lead.js`
- Create: `server/jobs/leadEnrichmentScheduler.js`
- Modify: `server/index.js` (start the scheduler at boot)
- Test: `tests/leadEnrichmentScheduler.test.ts`

**Interfaces:**
- Consumes: `enrichLead` from `server/services/leadEnrichmentService.js` (Task 1).
- Produces: `runNightlyEnrichmentJob(): Promise<void>` (the testable logic), `startLeadEnrichmentScheduler(): void` (the cron wiring) — same split as `invoiceScheduler.js`'s `runDailyInvoiceJob`/`startInvoiceScheduler`. Writes to `Lead.enrichment` with the shape Task 1 already defines. Task 3 and Task 4 read `lead.enrichment.industryGuess` / `.title` / `.status`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/leadEnrichmentScheduler.test.ts
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Lead from '../server/models/Lead.js';
import { runNightlyEnrichmentJob } from '../server/jobs/leadEnrichmentScheduler.js';

let mongoServer;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Lead.deleteMany({});
});

describe('runNightlyEnrichmentJob', () => {
  it('processes a lead with no enrichment attempt yet, and leaves an already-failed lead untouched', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      body: { getReader: () => {
        let sent = false;
        return { read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: new TextEncoder().encode('<title>Acme</title>') };
        }, cancel: async () => {} };
      } },
    }));

    await Lead.create({ id: 'lead_new', companyName: 'Acme', contactName: 'Jane', email: 'jane@acme.com' });
    await Lead.create({
      id: 'lead_already_failed', companyName: 'DeadCo', contactName: 'Bob', email: 'bob@deadco.com',
      enrichment: { status: 'failed', domain: 'deadco.com', enrichedAt: new Date() },
    });

    await runNightlyEnrichmentJob();

    const fresh = await Lead.findOne({ id: 'lead_new' }).lean();
    const alreadyFailed = await Lead.findOne({ id: 'lead_already_failed' }).lean();

    assert.equal(fresh.enrichment.status, 'enriched');
    assert.equal(fresh.enrichment.domain, 'acme.com');
    assert.equal(alreadyFailed.enrichment.status, 'failed'); // untouched — not retried automatically

    mock.restoreAll();
  });

  it('does nothing when there are no leads to enrich', async () => {
    mock.method(globalThis, 'fetch', async () => { throw new Error('fetch should not be called'); });
    await runNightlyEnrichmentJob(); // should not throw
    mock.restoreAll();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/leadEnrichmentScheduler.test.ts`
Expected: FAIL — `server/jobs/leadEnrichmentScheduler.js` does not exist yet.

- [ ] **Step 3: Add `enrichment` to `Lead.js`**

In `server/models/Lead.js`, add this field to `LeadSchema` (before the closing `}, { timestamps: true, strict: false });`):

```js
    enrichment: {
        domain:          { type: String, default: '' },
        title:           { type: String, default: '' },
        metaDescription: { type: String, default: '' },
        ogSiteName:      { type: String, default: '' },
        industryGuess:   { type: String, default: '' },
        enrichedAt:      { type: Date, default: null },
        status: {
            type: String,
            enum: ['enriched', 'failed', 'skipped_free_domain'],
        },
    },
```

- [ ] **Step 4: Implement the scheduler**

```js
// server/jobs/leadEnrichmentScheduler.js
import cron from 'node-cron';
import Lead from '../models/Lead.js';
import { enrichLead } from '../services/leadEnrichmentService.js';

const BATCH_SIZE = 50;
const DELAY_MS = 500;

export async function runNightlyEnrichmentJob() {
  console.log(`[LeadEnrichment] Running at ${new Date().toISOString()}`);
  try {
    const leads = await Lead.find({
      deleted: { $ne: true },
      email: { $exists: true, $ne: '' },
      'enrichment.status': { $exists: false },
    }).limit(BATCH_SIZE);

    let processed = 0;
    for (const lead of leads) {
      const result = await enrichLead(lead);
      lead.enrichment = result;
      await lead.save();
      processed++;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    console.log(`[LeadEnrichment] Done. Processed: ${processed}`);
  } catch (err) {
    console.error('[LeadEnrichment] Error:', err.message);
  }
}

export function startLeadEnrichmentScheduler() {
  cron.schedule('0 3 * * *', runNightlyEnrichmentJob, { timezone: 'America/Bogota' });
  console.log('[LeadEnrichment] Scheduled daily at 03:00 America/Bogota');
}
```

- [ ] **Step 5: Start the scheduler in `server/index.js`**

Add near the other job imports (alongside `import { startInvoiceScheduler, getSchedulerHealth } from './jobs/invoiceScheduler.js';`):

```js
import { startLeadEnrichmentScheduler } from './jobs/leadEnrichmentScheduler.js';
```

Add near the existing `startInvoiceScheduler();` call inside `start()`:

```js
    startInvoiceScheduler();
    startLeadEnrichmentScheduler();
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/leadEnrichmentScheduler.test.ts`
Expected: PASS (both tests).

- [ ] **Step 7: Run the full suite**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add server/models/Lead.js server/jobs/leadEnrichmentScheduler.js server/index.js tests/leadEnrichmentScheduler.test.ts
git commit -m "feat: nightly job to enrich leads with free domain-derived signal"
```

---

### Task 3: Manual re-enrichment endpoint

**Files:**
- Create: `server/routes/leadEnrichment.js`
- Modify: `server/index.js` (mount at `/api/leads`, following the existing `aiScoreRouter` mount pattern)
- Test: `tests/leadEnrichmentRoute.test.ts`

**Interfaces:**
- Consumes: `enrichLead` from `server/services/leadEnrichmentService.js` (Task 1).
- Produces: `POST /api/leads/:id/enrich` — admin only, returns the resulting `enrichment` object.

- [ ] **Step 1: Write the failing test**

```ts
// tests/leadEnrichmentRoute.test.ts
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Lead from '../server/models/Lead.js';
import leadEnrichmentRouter from '../server/routes/leadEnrichment.js';

let mongoServer;

function buildApp(isAdmin) {
  const a = express();
  a.use((req, _res, next) => { req.session = { user: { permissions: { admin: isAdmin } } }; next(); });
  a.use('/api/leads', leadEnrichmentRouter);
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
  await Lead.deleteMany({});
});

describe('POST /api/leads/:id/enrich', () => {
  it('re-enriches a single lead for an admin caller', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      body: { getReader: () => {
        let sent = false;
        return { read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: new TextEncoder().encode('<title>Acme</title>') };
        }, cancel: async () => {} };
      } },
    }));
    await Lead.create({ id: 'lead_1', companyName: 'Acme', contactName: 'Jane', email: 'jane@acme.com' });

    const res = await request(buildApp(true)).post('/api/leads/lead_1/enrich');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'enriched');
    const stored = await Lead.findOne({ id: 'lead_1' }).lean();
    assert.equal(stored.enrichment.status, 'enriched');
    mock.restoreAll();
  });

  it('rejects a non-admin caller with 403', async () => {
    await Lead.create({ id: 'lead_1', companyName: 'Acme', contactName: 'Jane', email: 'jane@acme.com' });
    const res = await request(buildApp(false)).post('/api/leads/lead_1/enrich');
    assert.equal(res.status, 403);
  });

  it('returns 404 for an unknown lead id', async () => {
    const res = await request(buildApp(true)).post('/api/leads/does-not-exist/enrich');
    assert.equal(res.status, 404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/leadEnrichmentRoute.test.ts`
Expected: FAIL — `server/routes/leadEnrichment.js` does not exist yet.

- [ ] **Step 3: Implement the route**

```js
// server/routes/leadEnrichment.js
import { Router } from 'express';
import Lead from '../models/Lead.js';
import { enrichLead } from '../services/leadEnrichmentService.js';

const router = Router();

router.post('/:id/enrich', async (req, res) => {
  if (!req.session?.user?.permissions?.admin) return res.status(403).json({ error: 'Forbidden' });

  const lead = await Lead.findOne({ id: req.params.id });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const result = await enrichLead(lead);
  lead.enrichment = result;
  await lead.save();

  res.json(result);
});

export default router;
```

- [ ] **Step 4: Mount the router**

In `server/index.js`, add near the other lead-related imports (alongside `import aiScoreRouter from './routes/aiScore.js';`):

```js
import leadEnrichmentRouter from './routes/leadEnrichment.js';
```

Add near `app.use('/api/leads', aiScoreRouter);`:

```js
app.use('/api/leads', leadEnrichmentRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/leadEnrichmentRoute.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/routes/leadEnrichment.js server/index.js tests/leadEnrichmentRoute.test.ts
git commit -m "feat: add manual re-enrichment endpoint for a single lead"
```

---

### Task 4: Surface the industry guess on the lead card

**Files:**
- Modify: `types.ts` (extend `Lead` interface)
- Modify: `components/CRMPipeline.tsx`

**Interfaces:**
- Consumes: `lead.enrichment.industryGuess` / `.title` (Task 2's schema, already flowing through the existing `GET /api/leads` response since `Lead.js` uses `strict: false`).

- [ ] **Step 1: Add the `enrichment` field to the `Lead` type**

In `types.ts`, add this field to the `Lead` interface (near the existing `aiScore`/`aiScoreReason`/`aiNextAction` fields around line 242-244):

```ts
  enrichment?: {
    domain: string;
    title: string;
    metaDescription: string;
    ogSiteName: string;
    industryGuess: string;
    enrichedAt: string | null;
    status?: 'enriched' | 'failed' | 'skipped_free_domain';
  };
```

- [ ] **Step 2: Render the industry guess badge**

In `components/CRMPipeline.tsx`, add this block right after the existing `{lead.aiNextAction && (...)}` block (around line 2158, before the aging/interactions `<div>`):

```tsx
                                        {lead.enrichment?.industryGuess && (
                                            <span
                                                className="flex-shrink-0 text-[10px] text-gray-600 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5"
                                                title={lead.enrichment.title || lead.enrichment.industryGuess}
                                            >
                                                {lead.enrichment.industryGuess}
                                            </span>
                                        )}
```

- [ ] **Step 3: Manually verify in the browser**

Run: `pnpm dev:full`. Trigger `POST /api/leads/:id/enrich` for a lead with a business email pointing at a real, reachable domain (e.g. via the browser dev console or a REST client while logged in as admin). Reload the pipeline board and confirm a small gray industry badge appears next to that lead's AI score badge, with the page title in its tooltip.

- [ ] **Step 4: Commit**

```bash
git add types.ts components/CRMPipeline.tsx
git commit -m "feat: show enrichment industry guess on the lead pipeline card"
```
