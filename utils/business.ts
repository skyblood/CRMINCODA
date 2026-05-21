/**
 * Pure business-logic helpers — framework-free, fully testable.
 * Components should import from here instead of inlining formulas.
 */

// ── Commission calculations ───────────────────────────────────────────────────

export interface CommissionResult {
    commissionAmount: number;   // Factory/partner share
    incodaUtility: number;   // Remaining after factory cut
    bmRetained: number;         // 40% of incodaUtility
    fabianShare: number;        // 30% of incodaUtility
    spencerShare: number;       // 30% of incodaUtility
}

/**
 * Calculate commission split for a project.
 * @param netUtility   Revenue minus all costs (can be ≤ 0)
 * @param commissionRate  Percentage 0–100 (defaults to 10)
 */
export const calcCommission = (netUtility: number, commissionRate = 10): CommissionResult => {
    const commissionAmount = netUtility > 0 ? netUtility * (commissionRate / 100) : 0;
    const incodaUtility = netUtility - commissionAmount;
    const bmRetained    = incodaUtility * 0.40;
    const fabianShare   = incodaUtility * 0.30;
    const spencerShare  = incodaUtility * 0.30;
    return { commissionAmount, incodaUtility, bmRetained, fabianShare, spencerShare };
};

// ── Lead aging ────────────────────────────────────────────────────────────────

/**
 * Days a lead has been in a stage.
 * - If still active (no exitedAt): calculates from enteredAt to now.
 * - If closed: returns the stored daysInStage value.
 */
export const daysInStage = (
    enteredAt: string,
    daysInStageStored: number,
    exitedAt: string | null,
    now = Date.now(),
): number => {
    if (exitedAt) return daysInStageStored;
    return Math.max(0, Math.floor((now - new Date(enteredAt).getTime()) / (1000 * 60 * 60 * 24)));
};

/**
 * Total days a lead has been open (sum across all stages, or from createdAt to now).
 */
export const totalDaysOpen = (createdAt: string, closedAt: string | null, now = Date.now()): number => {
    const end = closedAt ? new Date(closedAt).getTime() : now;
    return Math.floor((end - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * Classify a lead by aging bucket.
 */
export type AgingBucket = 'fresh' | 'active' | 'aging' | 'stale';

export const agingBucket = (daysOpen: number): AgingBucket => {
    if (daysOpen <= 7)   return 'fresh';
    if (daysOpen <= 30)  return 'active';
    if (daysOpen <= 90)  return 'aging';
    return 'stale';
};

// ── Time approval ─────────────────────────────────────────────────────────────

export interface TimeLog {
    id: string;
    hours: number;
    status: 'pending' | 'approved' | 'paid';
    approvedRate?: number;
    approvedCost?: number;
}

/** Sum total logged hours from an array of logs */
export const sumHours = (logs: TimeLog[]): number =>
    logs.reduce((sum, l) => sum + l.hours, 0);

/** Sum approved/paid cost */
export const sumApprovedCost = (logs: TimeLog[]): number =>
    logs.reduce((sum, l) => sum + (l.approvedCost ?? 0), 0);

/** Apply approval to a set of logs: sets status, approvedRate, approvedCost */
export const approveLogs = (
    logs: TimeLog[],
    approveIds: Set<string>,
    rate: number,
): TimeLog[] =>
    logs.map(log =>
        approveIds.has(log.id)
            ? { ...log, status: 'approved' as const, approvedRate: rate, approvedCost: log.hours * rate }
            : log,
    );
