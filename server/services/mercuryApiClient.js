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
  let lastPageWasFull = false;
  let pagesFetched = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await mercuryFetch(`/account/${accountId}/transactions`, {
      start, end, limit: 100, order: 'asc', start_after: startAfter,
    }, fetchImpl);
    pagesFetched++;
    results.push(...data.transactions);

    lastPageWasFull = data.transactions.length >= 100;
    if (!lastPageWasFull) break;

    // Defensive guard against non-advancing pagination: this assumes
    // Mercury's API honors start_after cursor pagination for this endpoint,
    // an assumption we can't independently verify. If the next cursor is
    // identical to the one we just requested with, the API most likely isn't
    // honoring the cursor at all — stop here (treated the same as a short
    // page, no error) instead of re-fetching the same page MAX_PAGES times.
    const nextStartAfter = data.transactions[data.transactions.length - 1].id;
    if (nextStartAfter === startAfter) {
      lastPageWasFull = false;
      break;
    }
    startAfter = nextStartAfter;
  }

  // If we stopped only because we ran out of pages, and the last page we
  // fetched was still full, this is a real (likely > MAX_PAGES*100
  // transaction) date range being silently truncated — not a natural end of
  // pagination. Fail loudly rather than hand the caller an incomplete list
  // that would masquerade as a complete reconciliation.
  if (lastPageWasFull && pagesFetched === MAX_PAGES) {
    throw new Error(`Mercury returned more than ${MAX_PAGES * 100} transactions for this date range — narrow the range and sync again`);
  }

  // Second, independent safety net: dedupe by transaction id in case of any
  // duplicate-fetching bug (cursor-related or otherwise) leaking duplicate
  // rows downstream into reconcileRows.
  const seen = new Set();
  const deduped = [];
  for (const t of results) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    deduped.push(t);
  }
  return deduped;
}

// Real Mercury transactions never carry a top-level "description" field
// (verified against a live production API response) — only bankDescription
// (a generic boilerplate string, e.g. "Send Money transaction initiated on
// Mercury"), counterpartyName, and counterpartyNickname. Mercury's own
// dashboard shows the nickname/name in its "To/From" column, which is far
// more useful than the generic bank text, so prefer it.
//
// This duplicates mercuryReconciliation.js's describeTransaction(t) — kept
// in sync by design. A service module importing from a route module would
// be a backwards dependency, so the logic is intentionally repeated here
// rather than shared.
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
