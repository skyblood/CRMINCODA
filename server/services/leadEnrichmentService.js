// server/services/leadEnrichmentService.js
import dns from 'node:dns';
import net from 'node:net';

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
const DNS_LOOKUP_TIMEOUT_MS = 3000;

// --- SSRF guard: reject loopback / private / link-local / reserved addresses ---

function isPrivateOrReservedIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true; // malformed -> unsafe
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 ("this network" / unspecified)
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. cloud metadata IP)
  return false;
}

function isPrivateOrReservedIPv6(address) {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true; // loopback

  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded IPv4 address.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(normalized);
  if (mapped) return isPrivateOrReservedIPv4(mapped[1]);

  // IPv4-compatible (::a.b.c.d, no "ffff:") — the older, distinct
  // zero-prefixed canonical form (top 96 bits zero, no well-known prefix).
  // This does NOT match bare "::" or "::1" since those have no
  // dotted-decimal suffix for the regex to capture.
  const compatible = /^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(normalized);
  if (compatible) return isPrivateOrReservedIPv4(compatible[1]);

  // fc00::/7 unique local addresses — first hextet is fc00–fdff.
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;

  // fe80::/10 link-local addresses — first hextet is fe80–febf.
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;

  return false;
}

function isPrivateOrReservedIP(address) {
  const version = net.isIP(address);
  if (version === 4) return isPrivateOrReservedIPv4(address);
  if (version === 6) return isPrivateOrReservedIPv6(address);
  return true; // not a recognizable IP literal -> refuse rather than risk it
}

/**
 * Resolve `hostname` via DNS and throw if it fails to resolve, times out, or
 * any resolved address is loopback/private/link-local/reserved. This is an
 * SSRF guard for fetchSiteMetadata: it must run BEFORE the actual fetch.
 *
 * Note (accepted residual risk): this is a point-in-time check. A
 * DNS-rebinding attacker could change the DNS record between this lookup
 * and fetch()'s own internal resolution, reintroducing a narrow TOCTOU
 * window. Closing that fully would require pinning fetch to the specific
 * checked IP via a custom dispatcher/agent, which is out of scope here.
 */
async function resolveDomainSafely(hostname) {
  // Note (accepted residual risk — NOT fixed here): Promise.race only bounds
  // how long THIS function awaits. dns.promises.lookup() delegates to
  // libuv's getaddrinfo() on the threadpool (default size 4, shared across
  // the whole process for other fs/dns/crypto work); Node's dns.lookup has
  // no cancellation API, so when the race's timeout fires, the underlying
  // getaddrinfo() call keeps running until the OS resolver itself gives up
  // (which can exceed this 3000ms bound by a wide margin). Enough
  // concurrently-triggered lookups against an unresponsive DNS server could
  // saturate the threadpool and starve unrelated async work (other fs/dns
  // calls) sharing it. A full fix would mean switching to a genuinely
  // abortable lower-level resolver, which is out of scope here.
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`DNS lookup timed out after ${DNS_LOOKUP_TIMEOUT_MS}ms for ${hostname}`)),
      DNS_LOOKUP_TIMEOUT_MS,
    );
  });
  try {
    const addresses = await Promise.race([dns.promises.lookup(hostname, { all: true }), timeout]);
    if (!addresses || addresses.length === 0) {
      throw new Error(`DNS resolution returned no addresses for ${hostname}`);
    }
    for (const { address } of addresses) {
      if (isPrivateOrReservedIP(address)) {
        throw new Error(`Refusing to fetch ${hostname}: resolves to a private/internal address (${address})`);
      }
    }
    return addresses;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSiteMetadata(domain) {
  // Finding 2: use the URL parser itself as the source of truth for "is this
  // a well-formed hostname", and refuse if it reinterprets `domain` rather
  // than round-tripping it unchanged (parser-differential guard).
  let parsedUrl;
  try {
    parsedUrl = new URL(`https://${domain}`);
  } catch {
    throw new Error(`Invalid domain: ${domain}`);
  }
  if (parsedUrl.hostname !== domain) {
    throw new Error(`Domain does not round-trip through URL parsing: ${domain}`);
  }

  // Finding 1 + 3: SSRF guard with its own bounded timeout, run before fetch.
  await resolveDomainSafely(parsedUrl.hostname);

  const res = await fetch(parsedUrl.href, { signal: AbortSignal.timeout(8000), redirect: 'manual' });
  if (!res.ok || (res.status >= 300 && res.status < 400)) throw new Error(`HTTP ${res.status}`);

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
