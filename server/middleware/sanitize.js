/**
 * Input Sanitization Middleware
 * ─────────────────────────────
 * Defends against:
 *   1. NoSQL injection   — strips keys starting with '$' from body/query
 *   2. Prototype pollution — removes __proto__, constructor, prototype keys
 *   3. Mass assignment   — blocks sensitive internal fields from reaching DB
 *   4. Query param abuse — whitelists allowed params on external API
 *   5. Oversized strings — truncates text fields > MAX_STRING_LEN
 */

const MAX_STRING_LEN = 10_000;

// Fields that must never be writable via the API (protect DB internals)
const BLOCKED_FIELDS = new Set([
    '_id', '__v', 'keyHash', 'passwordHash',
    'createdAt', 'updatedAt', 'lastUsedAt',
]);

// Prototype pollution keys
const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ─── DEEP SANITIZER ──────────────────────────────────────────────────────────
/**
 * Recursively cleans an object:
 *  - Removes prototype-pollution keys
 *  - Removes MongoDB operator keys ($gt, $where, etc.)
 *  - Removes blocked internal fields
 *  - Trims & truncates strings
 *  - Rejects non-plain values (functions)
 */
export const deepSanitize = (value, isRoot = false) => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
        return value.trim().slice(0, MAX_STRING_LEN);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'function') {
        return undefined; // drop functions
    }

    if (Array.isArray(value)) {
        return value.map(item => deepSanitize(item, false)).filter(v => v !== undefined);
    }

    if (typeof value === 'object') {
        const clean = {};
        for (const [key, val] of Object.entries(value)) {
            // Block prototype pollution
            if (PROTO_KEYS.has(key)) continue;

            // Block MongoDB operators (NoSQL injection)
            if (key.startsWith('$')) continue;

            // Block sensitive internal fields (only at root level of body)
            if (isRoot && BLOCKED_FIELDS.has(key)) continue;

            const sanitized = deepSanitize(val, false);
            if (sanitized !== undefined) {
                clean[key] = sanitized;
            }
        }
        return clean;
    }

    return value;
};

// ─── BODY SANITIZER MIDDLEWARE ────────────────────────────────────────────────
/**
 * Applied globally — sanitizes req.body before any route handler.
 */
export const sanitizeBody = (req, _res, next) => {
    if (req.body && typeof req.body === 'object') {
        req.body = deepSanitize(req.body, true);
    }
    next();
};

// ─── QUERY PARAM SANITIZER MIDDLEWARE ────────────────────────────────────────
/**
 * Applied globally — sanitizes req.query to prevent operator injection.
 */
export const sanitizeQuery = (req, _res, next) => {
    if (req.query && typeof req.query === 'object') {
        const clean = {};
        for (const [key, val] of Object.entries(req.query)) {
            if (key.startsWith('$') || PROTO_KEYS.has(key)) continue;
            clean[key] = typeof val === 'string' ? val.trim().slice(0, 500) : val;
        }
        req.query = clean;
    }
    next();
};

// ─── ROUTE PARAM SANITIZER MIDDLEWARE ────────────────────────────────────────
/**
 * Validates that :id route params are safe alphanumeric strings.
 * Prevents path traversal and injection via URL segments.
 */
export const sanitizeParams = (req, res, next) => {
    for (const [key, val] of Object.entries(req.params || {})) {
        if (typeof val !== 'string') continue;
        // IDs in this app are hex strings (uuid-style or crypto.randomBytes hex)
        if (!/^[a-zA-Z0-9_\-]{1,128}$/.test(val)) {
            return res.status(400).json({ error: `Invalid value for param '${key}'.` });
        }
    }
    next();
};

// ─── EXTERNAL API QUERY WHITELIST ─────────────────────────────────────────────
/**
 * Per-resource whitelists for external API query params.
 * Only allows known enum values — prevents MongoDB operator injection.
 */
const VALID_STAGES = new Set([
    'prospect', 'qualification', 'presentation', 'proposal',
    'negotiation', 'closed-won', 'project-delivered', 'closed-lost',
]);
const VALID_PROJECT_STATUS = new Set(['active', 'completed', 'on-hold']);
const VALID_PROJECT_TYPES = new Set(['implementation', 'support', 'consulting', 'license', 'hours_pack']);

export const validateExternalQuery = {
    leads: (req, res, next) => {
        if (req.query.stage && !VALID_STAGES.has(req.query.stage)) {
            return res.status(400).json({ error: `Invalid stage value.`, valid: [...VALID_STAGES] });
        }
        // manufacturer is a free-form string — already trimmed by sanitizeQuery
        next();
    },
    projects: (req, res, next) => {
        if (req.query.status && !VALID_PROJECT_STATUS.has(req.query.status)) {
            return res.status(400).json({ error: `Invalid status value.`, valid: [...VALID_PROJECT_STATUS] });
        }
        if (req.query.type && !VALID_PROJECT_TYPES.has(req.query.type)) {
            return res.status(400).json({ error: `Invalid type value.`, valid: [...VALID_PROJECT_TYPES] });
        }
        next();
    },
};
