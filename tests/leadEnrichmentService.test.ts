// tests/leadEnrichmentService.test.ts
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import {
  extractDomain,
  guessIndustry,
  fetchSiteMetadata,
  enrichLead,
} from '../server/services/leadEnrichmentService.js';

// Helper: mock dns.promises.lookup to resolve to a given public IP by
// default, matching how a real domain would resolve in production.
function mockDnsLookup(addresses = [{ address: '93.184.216.34', family: 4 }]) {
  return mock.method(dns.promises, 'lookup', async () => addresses);
}

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
    mockDnsLookup();
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
    mockDnsLookup();
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
    mockDnsLookup();
    mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }));
    await assert.rejects(fetchSiteMetadata('gone.com'));
    mock.restoreAll();
  });

  it('rejects when the resolved address is a private/internal IP, without ever calling fetch', async () => {
    mockDnsLookup([{ address: '127.0.0.1', family: 4 }]);
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch should not have been called — DNS check must run first');
    });

    await assert.rejects(fetchSiteMetadata('evil.com'), /private|internal/i);
    assert.equal(fetchMock.mock.callCount(), 0);
    mock.restoreAll();
  });

  it('rejects the AWS/GCP/Azure cloud metadata link-local address', async () => {
    mockDnsLookup([{ address: '169.254.169.254', family: 4 }]);
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch should not have been called — DNS check must run first');
    });

    await assert.rejects(fetchSiteMetadata('metadata-attack.com'), /private|internal/i);
    assert.equal(fetchMock.mock.callCount(), 0);
    mock.restoreAll();
  });

  it('succeeds normally when DNS resolves to a public address (happy path still works)', async () => {
    mockDnsLookup([{ address: '93.184.216.34', family: 4 }]);
    const html = `<title>Public Site</title>`;
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

    const meta = await fetchSiteMetadata('public-site.com');

    assert.equal(meta.title, 'Public Site');
    mock.restoreAll();
  });

  it('rejects a domain that fails the URL-parser round-trip check, before any DNS lookup or fetch', async () => {
    const lookupMock = mockDnsLookup();
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch should not have been called — round-trip check must run first');
    });

    // A domain string containing a backslash gets normalized by the WHATWG
    // URL parser (backslashes are treated as path separators / re-encoded),
    // so `new URL('https://evil.com\\@attacker.com').hostname` will not
    // equal the raw literal string — exactly the parser-differential this
    // check exists to catch.
    const malicious = 'evil.com\\@attacker.com';
    await assert.rejects(fetchSiteMetadata(malicious), /round-trip|invalid domain/i);

    assert.equal(lookupMock.mock.callCount(), 0);
    assert.equal(fetchMock.mock.callCount(), 0);
    mock.restoreAll();
  });

  it('rejects (does not hang forever) when the DNS lookup itself times out', async () => {
    // Never-resolving lookup simulates a slow/malicious DNS server.
    mock.method(dns.promises, 'lookup', () => new Promise(() => {}));
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch should not have been called — DNS timeout must reject first');
    });

    const start = Date.now();
    await assert.rejects(fetchSiteMetadata('slow-dns.com'), /timed out/i);
    const elapsed = Date.now() - start;

    // The service's internal DNS timeout is a few seconds; assert we reject
    // well under the 8s fetch budget instead of hanging indefinitely.
    assert.ok(elapsed < 7000, `expected rejection well under the fetch timeout, took ${elapsed}ms`);
    assert.equal(fetchMock.mock.callCount(), 0);
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
    mockDnsLookup();
    mock.method(globalThis, 'fetch', async () => { throw new Error('network down'); });
    const result = await enrichLead({ email: 'jane@dead-domain.com' });
    assert.equal(result.status, 'failed');
    assert.equal(result.domain, 'dead-domain.com');
    mock.restoreAll();
  });

  it('marks status failed (not enriched) when the domain resolves to a private IP', async () => {
    mockDnsLookup([{ address: '10.0.0.5', family: 4 }]);
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch should not have been called — DNS check must run first');
    });
    const result = await enrichLead({ email: 'jane@internal-attack.com' });
    assert.equal(result.status, 'failed');
    assert.equal(result.domain, 'internal-attack.com');
    assert.equal(fetchMock.mock.callCount(), 0);
    mock.restoreAll();
  });

  it('marks status enriched and stores the industry guess on success', async () => {
    mockDnsLookup();
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
