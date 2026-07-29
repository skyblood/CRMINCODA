// tests/ledger/csvParser.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../../server/utils/csvParser.js';

describe('parseCsv', () => {
  it('parses a well-formed Mercury-style export by header name', () => {
    const csv = 'Date,Description,Amount\n2026-07-01,AWS Hosting,-500.00\n2026-07-02,Client Payment,5000.00\n';
    const { rows, errors } = parseCsv(csv);
    assert.equal(errors.length, 0);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].Date, '2026-07-01');
    assert.equal(rows[0].Amount, '-500.00');
  });

  it('handles quoted fields containing commas', () => {
    const csv = 'Date,Description,Amount\n2026-07-01,"AWS, Hosting Inc",-500.00\n';
    const { rows } = parseCsv(csv);
    assert.equal(rows[0].Description, 'AWS, Hosting Inc');
  });

  it('reports a row-level error for a row with the wrong column count, without aborting the rest', () => {
    const csv = 'Date,Description,Amount\n2026-07-01,AWS,-500.00\nBROKEN_ROW\n2026-07-03,Rent,-2000.00\n';
    const { rows, errors } = parseCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].row, 3);
  });

  it('returns an empty result for an empty string', () => {
    const { rows, errors } = parseCsv('');
    assert.deepEqual(rows, []);
    assert.deepEqual(errors, []);
  });
});
