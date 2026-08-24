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
