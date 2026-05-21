/**
 * Field-Level Security middleware.
 *
 * Strips sensitive fields from API responses based on the caller's role.
 * Admin role bypasses all filtering.
 *
 * Usage:
 *   import { fieldFilter } from './middleware/fieldFilter.js';
 *   app.use('/api/leads', fieldFilter('leads'), leadsRouter);
 */

// Fields to REMOVE per resource per role.
// Admin always gets everything; omitting a role = no restrictions for that role.
const RESTRICTIONS = {
    leads: {
        consultant: ['value', 'probability', 'commissionAmount', 'factoryCommission', 'closedValue'],
    },
    users: {
        sales:      ['hourlyCost', 'monthlySalary', 'salaryHistory'],
        consultant: ['hourlyCost', 'monthlySalary', 'salaryHistory', 'salesQuota', 'permissions'],
    },
    projects: {
        consultant: ['payments', 'factoryCommissionRate', 'totalRevenue', 'profit', 'marginPct'],
    },
};

function stripFields(obj, fields) {
    if (Array.isArray(obj)) return obj.map(item => stripFields(item, fields));
    if (obj && typeof obj === 'object') {
        const out = { ...obj };
        for (const f of fields) delete out[f];
        return out;
    }
    return obj;
}

export function fieldFilter(resource) {
    return (req, res, next) => {
        const role = req.session?.user?.role;
        // Admin sees everything; unauthenticated requests are handled elsewhere
        if (!role || role === 'admin') return next();

        const fields = RESTRICTIONS[resource]?.[role];
        if (!fields?.length) return next();

        const originalJson = res.json.bind(res);
        res.json = (data) => originalJson(stripFields(data, fields));
        next();
    };
}
