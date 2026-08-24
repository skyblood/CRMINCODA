// tests/ledger/reconciliationScore.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeMatchScore } from '../../server/utils/reconciliationScore.js';

describe('computeMatchScore', () => {
  it('scores an amount within 1% and a same-day date highly, without description overlap', () => {
    const bankRow = { Date: '2026-07-01', Description: 'Wire Transfer 4821', Amount: '-501.00' };
    const ledgerLine = { date: new Date('2026-07-01'), amount: -500, memo: 'AWS Hosting' };

    const { score, reasons } = computeMatchScore(bankRow, ledgerLine);

    assert.ok(score >= 0.8, `expected score >= 0.8, got ${score}`);
    assert.ok(reasons.some(r => /monto/i.test(r)));
    assert.ok(reasons.some(r => /fecha/i.test(r)));
  });

  it('gives partial credit for an amount within 5% but not 1%', () => {
    const bankRow = { Date: '2026-07-01', Description: 'Fee', Amount: '-520.00' };
    const ledgerLine = { date: new Date('2026-07-01'), amount: -500, memo: 'Something' };

    const { score } = computeMatchScore(bankRow, ledgerLine);

    // 5%-tier amount (+0.25) + same-day date (+0.3) = 0.55, below the 1%-tier band
    assert.ok(score >= 0.5 && score < 0.8, `expected a mid-range score, got ${score}`);
  });

  it('gives no amount credit when the difference exceeds 5%', () => {
    const bankRow = { Date: '2026-07-01', Description: 'Unrelated', Amount: '-900.00' };
    const ledgerLine = { date: new Date('2026-07-01'), amount: -500, memo: 'Something else' };

    const { score, reasons } = computeMatchScore(bankRow, ledgerLine);

    assert.ok(!reasons.some(r => /monto/i.test(r)));
    // Date-only credit (+0.3) stays below the suggestion threshold
    assert.ok(score < 0.5, `expected score < 0.5, got ${score}`);
  });

  it('scores a date within 3 days as full date credit, and within 7 days as partial', () => {
    const bankRow3d = { Date: '2026-07-04', Description: 'x', Amount: '-500.00' };
    const ledgerLine = { date: new Date('2026-07-01'), amount: -500, memo: 'y' };
    const { reasons: reasons3d } = computeMatchScore(bankRow3d, ledgerLine);
    assert.ok(reasons3d.some(r => /3 días/i.test(r)));

    const bankRow7d = { Date: '2026-07-07', Description: 'x', Amount: '-500.00' };
    const { reasons: reasons7d } = computeMatchScore(bankRow7d, ledgerLine);
    assert.ok(reasons7d.some(r => /7 días/i.test(r)));
  });

  it('gives no date credit past 7 days', () => {
    const bankRow = { Date: '2026-07-20', Description: 'x', Amount: '-500.00' };
    const ledgerLine = { date: new Date('2026-07-01'), amount: -500, memo: 'y' };

    const { reasons } = computeMatchScore(bankRow, ledgerLine);

    assert.ok(!reasons.some(r => /fecha/i.test(r)));
  });

  it('credits overlapping description/memo tokens', () => {
    const bankRow = { Date: '2026-07-01', Description: 'AWS Hosting Invoice', Amount: '-480.00' };
    const ledgerLine = { date: new Date('2026-07-15'), amount: -500, memo: 'AWS Hosting charge' };

    const { reasons } = computeMatchScore(bankRow, ledgerLine);

    assert.ok(reasons.some(r => /descripci[oó]n/i.test(r)));
  });

  it('does not credit short/common tokens as a description match', () => {
    const bankRow = { Date: '2026-07-01', Description: 'The ACH for a', Amount: '-480.00' };
    const ledgerLine = { date: new Date('2026-07-15'), amount: -500, memo: 'The bill of a service' };

    const { reasons } = computeMatchScore(bankRow, ledgerLine);

    assert.ok(!reasons.some(r => /descripci[oó]n/i.test(r)));
  });

  it('combines all three signals up to a capped total near 1.0', () => {
    const bankRow = { Date: '2026-07-01', Description: 'AWS Hosting', Amount: '-500.00' };
    const ledgerLine = { date: new Date('2026-07-01'), amount: -500, memo: 'AWS Hosting' };

    const { score } = computeMatchScore(bankRow, ledgerLine);

    assert.ok(score >= 0.95, `expected near-max score, got ${score}`);
  });

  it('handles a zero-amount ledger line without dividing by zero', () => {
    const bankRow = { Date: '2026-07-01', Description: 'x', Amount: '-5.00' };
    const ledgerLine = { date: new Date('2026-07-01'), amount: 0, memo: 'y' };

    assert.doesNotThrow(() => computeMatchScore(bankRow, ledgerLine));
  });
});
