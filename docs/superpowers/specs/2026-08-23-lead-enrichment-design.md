# Lead/Client Domain Enrichment (Free Tier) — Design Spec

**Date:** 2026-08-23
**Status:** Approved for planning

## Problem

Midday auto-enriches customer records with ~20 fields (industry, size,
funding, socials) resolved from the company's domain, with a domain-match
validation step. CRMINCODA has only `aiScore`/`aiScoreReason` — a textual AI
judgment with no external company data behind it. `Lead.js` has no
`website`/`domain` field at all today, only `email`.

## Goals

- Automatically derive a lead's likely company domain from its email.
- Pull lightweight, free signal (page title, meta description, OG site name)
  from that domain's homepage.
- Produce a best-effort industry guess from that signal.
- Surface this on the lead detail view without requiring any paid API or
  new dependency.

## Non-goals

- Paid enrichment API integration (Clearbit/Apollo/PDL) — explicitly ruled
  out for cost reasons; the interfaces below are intentionally simple
  (a single service module, not a pluggable provider abstraction) since
  YAGNI applies until there's a concrete reason to swap providers.
- High-accuracy industry classification. `guessIndustry` is a keyword
  heuristic, documented as best-effort in the UI copy, not a source of
  truth for reporting.

## Architecture

### 1. `Lead.js` schema addition

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
    default: undefined, // absent = never attempted, used by the scheduler query
  },
}
```

### 2. `server/services/leadEnrichmentService.js`

```js
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
  } catch (err) {
    return { domain, status: 'failed', enrichedAt: new Date() };
  }
}
```

`fetchSiteMetadata` reads the response body in chunks and stops at 50KB
rather than buffering the whole page — most homepages have `<title>` and
meta tags in the `<head>`, well within that cap, and this bounds memory/time
on unexpectedly large pages without adding a streaming HTML parser
dependency.

### 3. `server/jobs/leadEnrichmentScheduler.js`

Same shape as `invoiceScheduler.js` (node-cron + try/catch + console logging):

```js
import cron from 'node-cron';
import Lead from '../models/Lead.js';
import { enrichLead } from '../services/leadEnrichmentService.js';

const BATCH_SIZE = 50;
const DELAY_MS = 500;

async function runNightlyEnrichmentJob() {
  console.log(`[LeadEnrichment] Running at ${new Date().toISOString()}`);
  try {
    const leads = await Lead.find({
      deleted: { $ne: true },
      email: { $exists: true, $ne: '' },
      'enrichment.status': { $exists: false },
    }).limit(BATCH_SIZE);

    let enriched = 0;
    for (const lead of leads) {
      const result = await enrichLead(lead);
      lead.enrichment = result;
      await lead.save();
      enriched++;
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
    console.log(`[LeadEnrichment] Done. Processed: ${enriched}`);
  } catch (err) {
    console.error('[LeadEnrichment] Error:', err.message);
  }
}

export function startLeadEnrichmentScheduler() {
  cron.schedule('0 3 * * *', runNightlyEnrichmentJob, { timezone: 'America/Bogota' });
  console.log('[LeadEnrichment] Scheduled daily at 03:00 America/Bogota');
}

export { runNightlyEnrichmentJob };
```

Query targets `'enrichment.status': { $exists: false }` specifically —
leads with `status: 'failed'` are excluded from automatic retry (see Error
handling below), leads with `status: 'skipped_free_domain'` also won't be
retried since a free email domain won't change on its own.

### 4. Manual trigger — addition to an existing leads route

`POST /api/leads/:id/enrich`, admin-only
(`req.session.user?.permissions?.admin`), calls `enrichLead()` for that one
lead synchronously and returns the resulting `enrichment` object. Used after
an admin corrects a lead's email, to re-run without waiting for the nightly
job.

### 5. Frontend

Wherever the lead detail view currently renders `aiScoreReason` (existing
pattern), add a small read-only block: `enrichment.industryGuess` (badge),
`enrichment.title` and `enrichment.ogSiteName` (secondary text), and — if
`status === 'failed'` — nothing rendered (fails silently, this is a
best-effort enrichment, not a required field).

## Data flow

1. Nightly cron (03:00 America/Bogota) queries up to 50 leads with an email
   and no `enrichment.status` yet.
2. For each: derive domain from email → skip if missing/free-provider →
   fetch homepage HTML (8s timeout, 50KB cap) → regex-extract title/meta
   description/OG site name → keyword-guess industry → save on
   `Lead.enrichment` with a 500ms pause before the next lead.
3. Admin viewing a lead sees the industry guess and site title inline; can
   force a re-run via the manual endpoint after fixing a bad email.

## Error handling

- Missing/free-provider email domain → `status: 'skipped_free_domain'`, no
  network call made, not treated as an error.
- Network failure, timeout, or non-2xx response → caught inside
  `enrichLead`, `status: 'failed'`, no metadata stored. Not retried
  automatically (the scheduler's query excludes anything with a `status`
  already set) — a dead or unreachable domain doesn't get hit every night.
- Malformed HTML with no matching `<title>`/meta tags → regexes simply
  return empty strings; `status` is still `'enriched'` since the fetch
  itself succeeded — partial data is acceptable, this is best-effort
  signal, not a required field.

## Testing

- `extractDomain`: returns `null` for missing email, malformed email
  (no `@`, no `.`), and each domain in `FREE_EMAIL_DOMAINS`; returns the
  lowercased domain for a normal business email.
- `guessIndustry`: each keyword pattern matches its expected industry from a
  representative title+description pair; returns `''` when nothing matches.
- `fetchSiteMetadata`: mock global `fetch` to return a fixture HTML string
  containing `<title>`, `<meta name="description">`, and
  `<meta property="og:site_name">` — assert all three are extracted
  correctly; a fixture missing one tag still returns the other two.
- `leadEnrichmentScheduler`: seed two leads (one with a business email and
  no `enrichment.status`, one already `status: 'failed'`) — run the job body
  directly (not through `node-cron`) — assert only the first lead was
  processed and its `enrichment.status` is now set, the second was left
  untouched.
