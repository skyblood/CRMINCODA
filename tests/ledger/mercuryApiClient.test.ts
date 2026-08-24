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

  it('stops after MAX_PAGES (20) even if every page is full, never looping forever', async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(() => {
      calls++;
      return { status: 200, body: { transactions: Array.from({ length: 100 }, (_, i) => ({ id: `tx_${calls}_${i}` })) } };
    });
    const results = await listAccountTransactions('acc_1', {}, fetchImpl);
    assert.equal(calls, 20);
    assert.equal(results.length, 2000);
  });

  it('throws a "Mercury API " prefixed error on a non-2xx response', async () => {
    const fetchImpl = fakeFetch(() => ({ status: 500, body: { error: 'boom' } }));
    await assert.rejects(() => listAccountTransactions('acc_1', {}, fetchImpl), /^Error: Mercury API /);
  });
});
