import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listAccounts, listAccountTransactions } from '../../server/services/mercuryApiClient.js';

function fakeFetch(handler: (url: URL) => { status: number; body: unknown }) {
  return async (url: string) => {
    const parsed = new URL(url);
    const { status, body } = handler(parsed);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  };
}

describe('listAccounts', () => {
  it('maps the Mercury accounts response to {id, name, type}', async () => {
    const fetchImpl = fakeFetch(() => ({
      status: 200,
      body: { accounts: [{ id: 'acc_1', name: 'Checking', type: 'checking', extraField: 'ignored' }] },
    }));
    const accounts = await listAccounts(fetchImpl);
    assert.deepEqual(accounts, [{ id: 'acc_1', name: 'Checking', type: 'checking' }]);
  });

  it('throws a "Mercury API " prefixed error on a non-2xx response', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 401, body: { error: 'invalid token' } }));
    await assert.rejects(() => listAccounts(fetchImpl), /^Error: Mercury API /);
  });
});

describe('listAccountTransactions', () => {
  it('sends accountId, start, and end through to the request URL', async () => {
    let seenUrl: URL | undefined;
    const fetchImpl = fakeFetch((url) => { seenUrl = url; return { status: 200, body: { transactions: [] } }; });
    await listAccountTransactions('acc_1', { start: '2026-07-01', end: '2026-07-31' }, fetchImpl);
    assert.equal(seenUrl?.pathname, '/api/v1/account/acc_1/transactions');
    assert.equal(seenUrl?.searchParams.get('start'), '2026-07-01');
    assert.equal(seenUrl?.searchParams.get('end'), '2026-07-31');
  });

  it('follows the start_after cursor across pages until a short page ends pagination', async () => {
    let calls = 0;
    let secondPageCursor: string | null = null;
    const fetchImpl = fakeFetch((url) => {
      calls++;
      if (!url.searchParams.get('start_after')) {
        return { status: 200, body: { transactions: Array.from({ length: 100 }, (_, i) => ({ id: `tx_${i}` })) } };
      }
      secondPageCursor = url.searchParams.get('start_after');
      return { status: 200, body: { transactions: [{ id: 'tx_last' }] } };
    });
    const results = await listAccountTransactions('acc_1', {}, fetchImpl);
    assert.equal(calls, 2);
    assert.equal(results.length, 101);
    assert.equal(secondPageCursor, 'tx_99');
  });

  it('stops fetching after MAX_PAGES (20), never looping forever', async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(() => {
      calls++;
      return { status: 200, body: { transactions: Array.from({ length: 100 }, (_, i) => ({ id: `tx_${calls}_${i}` })) } };
    });
    await assert.rejects(() => listAccountTransactions('acc_1', {}, fetchImpl));
    assert.equal(calls, 20);
  });

  it('throws instead of silently returning a truncated list when a real range has more than MAX_PAGES full pages', async () => {
    const fetchImpl = fakeFetch((url) => ({
      status: 200,
      // Every page comes back full (100) and the cursor keeps advancing, so
      // this simulates a genuinely large date range, not a stuck cursor.
      body: { transactions: Array.from({ length: 100 }, (_, i) => ({ id: `${url.searchParams.get('start_after') ?? '0'}_${i}` })) },
    }));
    await assert.rejects(
      () => listAccountTransactions('acc_1', {}, fetchImpl),
      /more than 2000 transactions/,
    );
  });

  it('does NOT throw when pagination ends naturally via a short page, even on the very last allowed page', async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(() => {
      calls++;
      // Every page is full except the last one, which is short — this must
      // end the loop cleanly, not trip the MAX_PAGES truncation error.
      if (calls < 20) return { status: 200, body: { transactions: Array.from({ length: 100 }, (_, i) => ({ id: `tx_${calls}_${i}` })) } };
      return { status: 200, body: { transactions: [{ id: 'tx_last' }] } };
    });
    const results = await listAccountTransactions('acc_1', {}, fetchImpl);
    assert.equal(calls, 20);
    assert.equal(results.length, 1901);
  });

  it('stops (without error) instead of spinning when the cursor does not advance across a full page', async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(() => {
      calls++;
      // Always returns the same 100 transactions regardless of start_after —
      // simulates an API that ignores the cursor for this endpoint. The
      // non-advancing cursor is only detectable once a *second* request is
      // sent with the previous page's cursor and gets the same last id back,
      // so this stops on page 2, not page 1.
      return { status: 200, body: { transactions: Array.from({ length: 100 }, (_, i) => ({ id: `tx_${i}` })) } };
    });
    const results = await listAccountTransactions('acc_1', {}, fetchImpl);
    assert.equal(calls, 2, 'must stop once a repeated request yields a non-advancing cursor, not spin to MAX_PAGES');
    assert.equal(results.length, 100, 'the duplicate second page must be deduplicated away');
  });

  it('deduplicates the final results by transaction id as a defensive backstop', async () => {
    let calls = 0;
    const fetchImpl = fakeFetch((url) => {
      calls++;
      if (!url.searchParams.get('start_after')) {
        return { status: 200, body: { transactions: Array.from({ length: 100 }, (_, i) => ({ id: `tx_${i}` })) } };
      }
      // Second page re-sends one duplicate id alongside a new one, then ends
      // pagination with a short page.
      return { status: 200, body: { transactions: [{ id: 'tx_99' }, { id: 'tx_100' }] } };
    });
    const results = await listAccountTransactions('acc_1', {}, fetchImpl);
    assert.equal(calls, 2);
    assert.equal(results.length, 101);
    assert.equal(results.filter(t => t.id === 'tx_99').length, 1);
  });

  it('throws a "Mercury API " prefixed error on a non-2xx response', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 500, body: { error: 'boom' } }));
    await assert.rejects(() => listAccountTransactions('acc_1', {}, fetchImpl), /^Error: Mercury API /);
  });
});
