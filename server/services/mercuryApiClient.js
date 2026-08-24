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
