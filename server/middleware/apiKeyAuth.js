import crypto from 'crypto';
import ApiKey from '../models/ApiKey.js';

// ─── IN-MEMORY KEY CACHE ──────────────────────────────────────────────────────
// Avoids a MongoDB lookup on every request.
// Entry format: { apiKey: <doc>, expiresAt: <timestamp> }
const KEY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const keyCache = new Map();

const getCached = (hash) => {
    const entry = keyCache.get(hash);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        keyCache.delete(hash);
        return null;
    }
    return entry.apiKey;
};

const setCache = (hash, apiKey) => {
    keyCache.set(hash, { apiKey, expiresAt: Date.now() + KEY_CACHE_TTL_MS });
};

// Invalidate a specific key (call this after revoking a key)
export const invalidateKeyCache = (hash) => keyCache.delete(hash);

// Clear stale entries periodically (every 10 min) to prevent memory leak
setInterval(() => {
    const now = Date.now();
    for (const [hash, entry] of keyCache) {
        if (now > entry.expiresAt) keyCache.delete(hash);
    }
}, 10 * 60 * 1000);

// ─── PER-KEY RATE LIMITER ─────────────────────────────────────────────────────
// Sliding window counter per key hash — 1000 req / 15 min
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 1000;
const rateCounters = new Map(); // hash → { count, windowStart }

const checkRateLimit = (hash) => {
    const now = Date.now();
    const counter = rateCounters.get(hash) || { count: 0, windowStart: now };

    if (now - counter.windowStart > RATE_WINDOW_MS) {
        // New window
        counter.count = 1;
        counter.windowStart = now;
    } else {
        counter.count++;
    }

    rateCounters.set(hash, counter);

    const remaining = Math.max(0, RATE_MAX - counter.count);
    const resetAt = Math.ceil((counter.windowStart + RATE_WINDOW_MS) / 1000);

    return {
        allowed: counter.count <= RATE_MAX,
        remaining,
        resetAt,
    };
};

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
/**
 * Edge-layer API key validation.
 *
 * Flow:
 *  1. Extract raw key from Authorization: Bearer or X-API-Key header
 *  2. Hash with SHA-256
 *  3. Check in-memory cache (avoids DB hit for warm keys)
 *  4. On cache miss: query MongoDB, populate cache
 *  5. Per-key rate limit check (1000 req / 15 min)
 *  6. Attach req.apiKey and rate limit headers
 */
export const apiKeyAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const xApiKey = req.headers['x-api-key'];

    let rawKey = null;
    if (authHeader?.startsWith('Bearer ')) {
        rawKey = authHeader.slice(7).trim();
    } else if (xApiKey) {
        rawKey = xApiKey.trim();
    }

    if (!rawKey) {
        return res.status(401).json({
            error: 'API key required.',
            hint: 'Use Authorization: Bearer <key> or X-API-Key header.',
        });
    }

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    // 1. Cache lookup (fast path — no DB)
    let apiKey = getCached(keyHash);

    // 2. Cache miss → MongoDB
    if (!apiKey) {
        try {
            apiKey = await ApiKey.findOne({ keyHash, active: true }).lean();
        } catch (err) {
            return res.status(500).json({ error: 'Auth error: ' + err.message });
        }

        if (!apiKey) {
            return res.status(401).json({ error: 'Invalid or revoked API key.' });
        }

        setCache(keyHash, apiKey);

        // Update lastUsedAt fire-and-forget
        ApiKey.findOneAndUpdate({ keyHash }, { lastUsedAt: new Date() }).catch(() => {});
    }

    // 3. Per-key rate limit
    const rate = checkRateLimit(keyHash);
    res.set('X-RateLimit-Limit', String(RATE_MAX));
    res.set('X-RateLimit-Remaining', String(rate.remaining));
    res.set('X-RateLimit-Reset', String(rate.resetAt));

    if (!rate.allowed) {
        return res.status(429).json({
            error: 'API key rate limit exceeded.',
            resetAt: new Date(rate.resetAt * 1000).toISOString(),
        });
    }

    req.apiKey = apiKey;
    next();
};

/**
 * Scope guard — ensures the API key has access to the requested scope.
 */
export const requireScope = (scope) => (req, res, next) => {
    if (!req.apiKey?.scopes?.includes(scope)) {
        return res.status(403).json({
            error: `Scope '${scope}' not allowed for this key.`,
            allowedScopes: req.apiKey?.scopes || [],
        });
    }
    next();
};
