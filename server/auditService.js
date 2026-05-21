/**
 * Audit Service — logs who changed what and when.
 * Call logAudit() after any mutation on a lead or project.
 */
import AuditLog from './models/AuditLog.js';

// Fields to exclude from change diffing (too noisy or internal)
const SKIP_FIELDS = new Set([
    '_id', '__v', 'id', 'updatedAt', 'createdAt',
    'stageHistory', 'completedNextSteps', 'interactions',
    'preSalesTimeLogs', 'documents',
]);

/**
 * Diff two plain objects and return an array of { field, from, to } changes.
 * Only top-level scalar fields are diffed (arrays excluded unless whitelisted).
 */
export const diffDocs = (before, after) => {
    if (!before || !after) return [];
    const changes = [];
    const scalarWhitelist = new Set([
        'stage', 'companyName', 'contactName', 'email', 'phone',
        'value', 'closedValue', 'probability', 'expectedCloseDate',
        'country', 'city', 'manufacturer', 'partnerName', 'dealType',
        'nextStep', 'nextStepDueDate', 'description', 'deleted',
        'aiScore', 'aiScoreReason',
        // project fields
        'name', 'status', 'budget', 'startDate', 'endDate',
    ]);

    for (const field of scalarWhitelist) {
        if (SKIP_FIELDS.has(field)) continue;
        const from = before[field];
        const to   = after[field];
        if (from !== to) changes.push({ field, from: from ?? null, to: to ?? null });
    }
    return changes;
};

/**
 * Write an audit log entry. Fire-and-forget — never throws.
 */
export const logAudit = async ({ entityType, entityId, action, userId, userName, changes = [], meta = {} }) => {
    try {
        await AuditLog.create({ entityType, entityId, action, userId, userName, changes, meta });
    } catch (err) {
        console.error('[Audit] Failed to write audit log:', err.message);
    }
};
