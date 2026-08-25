// Default-deny gate for the entire /api/ surface. Every route mounted in
// server/index.js was previously reachable with zero session — no route
// registration ever checked req.session.user before this file existed.
// Confirmed live: GET /api/leads, GET /api/users (full email/role/permissions
// list), GET /api/apikeys all returned 200 with no cookie, and POST /api/seed
// unconditionally deletes and rewrites all 18 collections with no auth check
// at all.
//
// Anything not explicitly allowlisted below requires req.session.user to be
// set by server/routes/auth.js's login handler.
const PUBLIC_API_PATHS = new Set([
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/me',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/set-password',
    // Bootstrap-only: both self-guard by checking User.countDocuments() === 0
    // internally (server/routes/seed.js), so they're inert once any user
    // exists and can't be used to touch a live database.
    '/api/seed/check',
    '/api/seed/init',
    '/api/health',
    '/api/health/scheduler',
]);

export function requireAuth(req, res, next) {
    if (!req.path.startsWith('/api/')) return next();
    if (req.path.startsWith('/api/v1/')) return next(); // gated separately by apiKeyAuth (server/middleware/apiKeyAuth.js)
    if (PUBLIC_API_PATHS.has(req.path)) return next();
    if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated.' });
    next();
}

export function requireAdmin(req, res, next) {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (user.role !== 'admin' && user.permissions?.admin !== true) {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

export function requireFinance(req, res, next) {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (user.permissions?.finance !== true && user.permissions?.admin !== true) {
        return res.status(403).json({ error: 'Finance access required.' });
    }
    next();
}
