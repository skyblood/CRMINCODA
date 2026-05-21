import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    calcCommission,
    daysInStage,
    totalDaysOpen,
    agingBucket,
    sumHours,
    sumApprovedCost,
    approveLogs,
} from '../utils/business.ts';

// ── Commission ────────────────────────────────────────────────────────────────

describe('calcCommission', () => {
    it('splits a positive utility at the default 10% rate', () => {
        const r = calcCommission(100_000);
        assert.equal(r.commissionAmount, 10_000);
        assert.equal(r.incodaUtility, 90_000);
        assert.ok(Math.abs(r.bmRetained - 36_000) < 0.01);
        assert.ok(Math.abs(r.fabianShare - 27_000) < 0.01);
        assert.ok(Math.abs(r.spencerShare - 27_000) < 0.01);
    });

    it('splits using a custom commission rate', () => {
        const r = calcCommission(200_000, 15);
        assert.equal(r.commissionAmount, 30_000);
        assert.equal(r.incodaUtility, 170_000);
    });

    it('returns zero commission when utility is zero', () => {
        const r = calcCommission(0);
        assert.equal(r.commissionAmount, 0);
        assert.equal(r.incodaUtility, 0);
    });

    it('returns zero commission when utility is negative (loss)', () => {
        const r = calcCommission(-5_000);
        assert.equal(r.commissionAmount, 0);
        assert.equal(r.incodaUtility, -5_000);
    });

    it('internal shares always sum to incodaUtility (40+30+30=100%)', () => {
        const r = calcCommission(75_000, 8);
        assert.ok(Math.abs(r.bmRetained + r.fabianShare + r.spencerShare - r.incodaUtility) < 0.01);
    });
});

// ── Lead aging ────────────────────────────────────────────────────────────────

describe('daysInStage', () => {
    it('returns stored value when stage is closed', () => {
        assert.equal(daysInStage('2024-01-01', 14, '2024-01-15'), 14);
    });

    it('calculates live days when stage is still open', () => {
        const enteredAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        assert.equal(daysInStage(enteredAt, 0, null), 3);
    });

    it('returns 0 for a stage entered today', () => {
        assert.equal(daysInStage(new Date().toISOString(), 0, null), 0);
    });
});

describe('totalDaysOpen', () => {
    it('calculates days from createdAt to closedAt', () => {
        assert.equal(totalDaysOpen('2024-01-01', '2024-01-11'), 10);
    });

    it('uses now when closedAt is null', () => {
        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        assert.equal(totalDaysOpen(tenDaysAgo, null), 10);
    });
});

describe('agingBucket', () => {
    it('classifies leads correctly', () => {
        assert.equal(agingBucket(0), 'fresh');
        assert.equal(agingBucket(7), 'fresh');
        assert.equal(agingBucket(8), 'active');
        assert.equal(agingBucket(30), 'active');
        assert.equal(agingBucket(31), 'aging');
        assert.equal(agingBucket(90), 'aging');
        assert.equal(agingBucket(91), 'stale');
    });
});

// ── Time approval ─────────────────────────────────────────────────────────────

const LOGS = [
    { id: 'l1', hours: 4, status: 'pending' as const },
    { id: 'l2', hours: 6, status: 'pending' as const },
    { id: 'l3', hours: 2, status: 'approved' as const, approvedRate: 50, approvedCost: 100 },
];

describe('sumHours', () => {
    it('sums all hours regardless of status', () => {
        assert.equal(sumHours(LOGS), 12);
    });

    it('returns 0 for empty array', () => {
        assert.equal(sumHours([]), 0);
    });
});

describe('sumApprovedCost', () => {
    it('sums only logs that have an approvedCost', () => {
        assert.equal(sumApprovedCost(LOGS), 100);
    });

    it('returns 0 when no logs have been approved', () => {
        assert.equal(sumApprovedCost([LOGS[0], LOGS[1]]), 0);
    });
});

describe('approveLogs', () => {
    it('approves only the selected log ids', () => {
        const result = approveLogs(LOGS, new Set(['l1']), 75);
        assert.equal(result[0].status, 'approved');
        assert.equal(result[0].approvedRate, 75);
        assert.equal(result[0].approvedCost, 300); // 4h × $75
        assert.equal(result[1].status, 'pending');  // untouched
        assert.equal(result[2].status, 'approved'); // already approved, not re-set
    });

    it('sets approvedCost = hours × rate', () => {
        const [log] = approveLogs([LOGS[1]], new Set(['l2']), 100);
        assert.equal(log.approvedCost, 600); // 6h × $100
    });

    it('returns empty array unchanged', () => {
        assert.deepEqual(approveLogs([], new Set(['l1']), 50), []);
    });

    it('does not mutate original logs', () => {
        approveLogs(LOGS, new Set(['l1']), 50);
        assert.equal(LOGS[0].status, 'pending');
    });
});
