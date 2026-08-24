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
