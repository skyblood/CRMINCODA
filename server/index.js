/**
 * ==================================================================================
 * 🖥️ BACKEND SERVER - CRM INCODA
 * ==================================================================================
 *
 * Express + Mongoose connected to local MongoDB.
 * If MongoDB is not installed, falls back to mongodb-memory-server (in-memory DB).
 *
 * Usage:
 *   npm run server        → Start backend only (port 3001)
 *   npm run dev:full      → Start frontend + backend together
 */

import 'dotenv/config';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync } from 'fs';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { sanitizeBody, sanitizeQuery, sanitizeParams } from './middleware/sanitize.js';
import cron from 'node-cron';
// Lazy-loaded if system MongoDB fails (see connectDB function)
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { setIo } from './socketInstance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import routes
import leadsRouter from './routes/leads.js';
import { fieldFilter } from './middleware/fieldFilter.js';
import projectsRouter from './routes/projects.js';
import usersRouter from './routes/users.js';
import templatesRouter from './routes/templates.js';
import skusRouter from './routes/skus.js';
import transactionsRouter from './routes/transactions.js';
import contactsRouter from './routes/contacts.js';
import goalsRouter from './routes/goals.js';
import seedRouter from './routes/seed.js';
import authRouter from './routes/auth.js';
import { sendMonthlyPendingPaymentReport } from './emailService.js';
import User from './models/User.js';
import Project from './models/Project.js';
import Settings from './models/Settings.js';
import balanceSheetAccountsRouter from './routes/balanceSheetAccounts.js';
import balanceSheetNotesRouter from './routes/balanceSheetNotes.js';
import ledgerAccountsRouter from './routes/ledgerAccounts.js';
import { ensureChartOfAccountsSeeded } from './seed/chartOfAccounts.js';
import apiKeysRouter from './routes/apiKeys.js';
import externalRouter from './routes/external.js';
import searchRouter from './routes/search.js';
import exportRouter from './routes/export.js';
import webhooksRouter from './routes/webhooks.js';
import { resumePendingRetries } from './webhookService.js';
import notificationsRouter from './routes/notifications.js';
import aiScoreRouter from './routes/aiScore.js';
import auditLogsRouter from './routes/auditLogs.js';
import analyticsRouter from './routes/analytics.js';
import userGoalsRouter from './routes/userGoals.js';
import emailTemplatesRouter from './routes/emailTemplates.js';
import emailLogsRouter from './routes/emailLogs.js';
import docsRouter from './routes/docs.js';
import { generatePeriodicNotifications } from './notificationService.js';
import accountsRouter from './routes/accounts.js';
import activitiesRouter from './routes/activities.js';
import automationsRouter from './routes/automations.js';
import pipelinesRouter from './routes/pipelines.js';
import googleCalendarRouter from './routes/googleCalendar.js';
import proposalsRouter from './routes/proposals.js';
import invoicesRouter from './routes/invoices.js';
import paymentsRouter from './routes/payments.js';
import reportsRouter from './routes/reports.js';
import commissionsRouter from './routes/commissions.js';
import { startInvoiceScheduler, getSchedulerHealth } from './jobs/invoiceScheduler.js';
import proposalTemplatesRouter from './routes/proposalTemplates.js';
import aiReportsRouter from './routes/aiReports.js';
import backupRouter from './routes/backup.js';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// ==================== SOCKET.IO ====================
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? process.env.CORS_ORIGIN : 'http://localhost:5173',
        credentials: true,
    },
});
setIo(io);

io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);
    socket.on('disconnect', () => console.log(`[WS] Client disconnected: ${socket.id}`));
});

// ==================== SECURITY ====================
app.use(helmet({
    hsts: false, // Server runs on HTTP; HSTS would force browsers to HTTPS and break asset loading
    contentSecurityPolicy: {
        directives: {
            defaultSrc:  ["'self'"],
            scriptSrc:   ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            styleSrc:    ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
            fontSrc:     ["'self'", "data:", "https://fonts.gstatic.com"],
            imgSrc:      ["'self'", "data:", "blob:"],
            connectSrc:  ["'self'", "ws:", "wss:"],
            objectSrc:   ["'none'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: null,
        },
    },
}));

const IS_PROD = process.env.NODE_ENV === 'production';

// ── Rate limit helpers ────────────────────────────────────────────────────────
const makeLimit = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    standardHeaders: true,   // RateLimit-* headers (RFC 6585)
    legacyHeaders: false,
    message: { error: message },
    skip: () => !IS_PROD,    // disabled in development
});

// ── Tier 1 — Global fallback (all /api/* not matched below) ──────────────────
// 300 req / 15 min per IP — covers normal CRM usage across all modules
app.use('/api/', makeLimit(
    15 * 60 * 1000, 300,
    'Too many requests. Please slow down.'
));

// ── Tier 2 — Read routes (GET only) — generous ───────────────────────────────
// Frontend polls subscriptions; allow up to 600 GETs / 15 min
const readRoutes = [
    '/api/leads', '/api/projects', '/api/users', '/api/contacts',
    '/api/transactions', '/api/skus', '/api/templates', '/api/goals',
    '/api/balanceSheetAccounts', '/api/balanceSheetNotes',
    '/api/accounts', '/api/activities', '/api/automations',
    '/api/ledger-accounts',
];
readRoutes.forEach(route => {
    app.get(route, makeLimit(15 * 60 * 1000, 600, 'Too many read requests.'));
    app.get(`${route}/:id`, makeLimit(15 * 60 * 1000, 600, 'Too many read requests.'));
});

// ── Tier 3 — Write routes (POST/PUT/DELETE) — moderate ───────────────────────
// 60 mutations / 15 min per IP across all data routes
const writeLimit = makeLimit(15 * 60 * 1000, 60, 'Too many write requests. Please wait before making more changes.');
const dataRoutes = [
    '/api/leads', '/api/projects', '/api/users', '/api/contacts',
    '/api/transactions', '/api/skus', '/api/templates', '/api/goals',
    '/api/balanceSheetAccounts', '/api/balanceSheetNotes', '/api/apikeys',
    '/api/settings', '/api/accounts', '/api/automations',
    '/api/ledger-accounts',
];
dataRoutes.forEach(route => {
    app.post(route, writeLimit);
    app.put(`${route}/:id`, writeLimit);
    app.delete(`${route}/:id`, writeLimit);
});

// ── Tier 4 — Auth routes — strict ────────────────────────────────────────────
// Login:        10 attempts / 15 min  (brute-force protection)
// set-password: 5  attempts / 15 min
// logout/me:    30 req     / 15 min
app.use('/api/auth/login',           makeLimit(15 * 60 * 1000, 10, 'Too many login attempts. Please wait 15 minutes.'));
app.use('/api/auth/set-password',    makeLimit(15 * 60 * 1000, 5,  'Too many password change attempts.'));
app.use('/api/auth/forgot-password', makeLimit(60 * 60 * 1000, 5,  'Too many password reset requests. Please wait 1 hour.'));
app.use('/api/auth/reset-password',  makeLimit(15 * 60 * 1000, 10, 'Too many reset attempts.'));
app.use('/api/auth/logout',          makeLimit(15 * 60 * 1000, 30, 'Too many logout requests.'));
app.use('/api/auth/me',              makeLimit(15 * 60 * 1000, 60, 'Too many session checks.'));

// ── Tier 5 — External API (/api/v1/) — per-key limiting in apiKeyAuth ────────
// Global IP fallback: 500 req / 15 min (per-key limit handled in middleware)
app.use('/api/v1/', makeLimit(15 * 60 * 1000, 500, 'External API rate limit exceeded.'));

// ── Tier 6 — Seed endpoint — near-blocked ────────────────────────────────────
// 2 calls / hour — should only run once on initial setup
app.use('/api/seed', makeLimit(60 * 60 * 1000, 2, 'Seed can only be called twice per hour.'));

// ==================== SESSION ====================
if (IS_PROD && !process.env.SESSION_SECRET) {
    console.error('[FATAL] SESSION_SECRET env var is required in production');
    process.exit(1);
}

const SESSION_MAX_AGE = 8 * 60 * 60 * 1000; // 8 horas
app.use(session({
    secret: process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/crm_incoda',
        collectionName: 'sessions',
        ttl: SESSION_MAX_AGE / 1000,   // en segundos
        autoRemove: 'native',
    }),
    cookie: {
        httpOnly: true,
        secure: IS_PROD,   // Cloudflare Tunnel termina TLS en el edge; activar en prod siempre
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE
    }
}));

// ==================== MIDDLEWARE ====================
app.use(cors({
    origin: IS_PROD ? process.env.CORS_ORIGIN : 'http://localhost:5173',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// ==================== INPUT SANITIZATION ====================
// Applied before all route handlers — strips NoSQL operators, prototype
// pollution keys, and sensitive internal fields from every request.
app.use(sanitizeBody);
app.use(sanitizeQuery);
app.use(sanitizeParams);

// ==================== API ROUTES ====================
app.use('/api/leads', fieldFilter('leads'), leadsRouter);
app.use('/api/projects', fieldFilter('projects'), projectsRouter);
app.use('/api/users', fieldFilter('users'), usersRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/skus', skusRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/seed', seedRouter);
app.use('/api/auth', authRouter);
app.use('/api/balanceSheetAccounts', balanceSheetAccountsRouter);
app.use('/api/balanceSheetNotes', balanceSheetNotesRouter);
app.use('/api/ledger-accounts', ledgerAccountsRouter);
app.use('/api/apikeys', apiKeysRouter);
app.use('/api/v1', externalRouter);
app.use('/api/search', searchRouter);
app.use('/api/export', exportRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/leads', aiScoreRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/user-goals', userGoalsRouter);
app.use('/api/email-templates', emailTemplatesRouter);
app.use('/api/email-logs', emailLogsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/automations', automationsRouter);
app.use('/api/pipelines', pipelinesRouter);
app.use('/api/calendar', googleCalendarRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api/proposal-templates', proposalTemplatesRouter);
app.use('/api/ai', aiReportsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/commissions', commissionsRouter);
app.use('/api/backup', makeLimit(60 * 60 * 1000, 10, 'Backup limit exceeded.'), backupRouter);

// ==================== HEALTH CHECK ====================
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/health/scheduler', async (_req, res) => {
  try {
    const health = await getSchedulerHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== API DOCS (dev only) ====================
if (process.env.NODE_ENV !== 'production') {
    app.use('/api/docs', docsRouter);
}

// ==================== SETTINGS ====================
// GET global settings (singleton doc)
app.get('/api/settings', async (_req, res) => {
    try {
        const doc = await Settings.findOne({ id: 'global' }).lean();
        const { _id, __v, createdAt, updatedAt, ...rest } = doc || {};
        res.json(rest.id ? rest : { id: 'global', emailLeadWon: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT global settings (upsert)
app.put('/api/settings', async (req, res) => {
    try {
        const doc = await Settings.findOneAndUpdate(
            { id: 'global' },
            { $set: req.body },
            { new: true, upsert: true, lean: true }
        );
        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        res.json(rest);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// ==================== STATIC FRONTEND (production) ====================
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
    // Assets (JS/CSS) have content-hash in filename — cache aggressively
    app.use('/assets', express.static(join(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
    }));
    // index.html must never be cached: it references hashed chunk filenames
    // and Safari will serve stale chunks (404) if index.html is cached.
    app.use(express.static(distPath, { maxAge: 0 }));
    // SPA fallback — send index.html for any non-API route
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.sendFile(join(distPath, 'index.html'));
        }
    });
}

// ==================== MONGODB CONNECTION ====================
const connectDB = async () => {
    // Try local MongoDB first
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/crm_incoda';

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');  // connection string not logged
    } catch (err) {
        console.error('❌ Cannot connect to MongoDB:', err.message);
        console.error('   URI: [redacted]');
        console.error('   Set MONGO_URI in your .env file to point to a running MongoDB instance.');
        process.exit(1);
    }
};

// ==================== MONTHLY PAYMENT REPORT (CRON) ====================
// Runs at 08:00 AM on the 1st of every month.
// Sends a pending-payment summary to all admin users via email.
const scheduleMonthlyReport = () => {
    cron.schedule('0 8 1 * *', async () => {
        console.log('[Cron] Running monthly pending-payment report...');
        try {
            const [adminUsers, projects] = await Promise.all([
                User.find({ 'permissions.admin': true }).lean(),
                Project.find().lean()
            ]);
            await sendMonthlyPendingPaymentReport(adminUsers, projects);
        } catch (err) {
            console.error('[Cron] Monthly report failed:', err.message);
        }
    }, { timezone: 'America/Bogota' });
    console.log('   Monthly payment report cron scheduled (1st of each month at 08:00 AM)');
};

// ==================== PERIODIC NOTIFICATIONS (CRON) ====================
// Runs every hour to generate deadline warnings and overdue alerts.
const schedulePeriodicNotifications = () => {
    cron.schedule('0 * * * *', async () => {
        try { await generatePeriodicNotifications(); }
        catch (err) { console.error('[Cron] Periodic notifications failed:', err.message); }
        try {
            const { evaluateRules } = await import('./automationService.js');
            await evaluateRules('days_inactive', {});
        } catch (err) { console.error('[Cron] Automation days_inactive failed:', err.message); }
    });
    console.log('   Periodic notifications cron scheduled (every hour)');
};

// ==================== START SERVER ====================
const CERT_PATH = join(__dirname, 'cert.pem');
const KEY_PATH  = join(__dirname, 'cert-key.pem');

const start = async () => {
    await connectDB();
    await ensureChartOfAccountsSeeded().catch(e => console.error('[startup] chart of accounts seed failed:', e.message));
    resumePendingRetries().catch(e => console.error('[startup] webhook resume failed:', e.message));

    const hasCerts = existsSync(CERT_PATH) && existsSync(KEY_PATH);
    if (hasCerts) {
        const httpsServer = createHttpsServer(
            { key: readFileSync(KEY_PATH), cert: readFileSync(CERT_PATH) },
            app
        );
        const wsServer = new SocketIOServer(httpsServer, {
            cors: { origin: process.env.NODE_ENV === 'production' ? process.env.CORS_ORIGIN : '*', credentials: true },
        });
        setIo(wsServer);
        httpsServer.listen(PORT, () => {
            console.log('CRM Backend started (HTTPS)');
        });
    } else {
        httpServer.listen(PORT, () => {
            console.log('CRM Backend started (HTTP)');
        });
    }

    scheduleMonthlyReport();
    schedulePeriodicNotifications();
    startInvoiceScheduler();
};

// Start server
console.log('[startup] Initializing server...');
start().catch(err => {
    console.error('[startup] Server initialization failed:', err);
    process.exit(1);
});
