/**
 * External read-only API — v1
 * Protected by API key. Used by integrations like Claude COWORK.
 *
 * Base URL: /api/v1
 * Auth:     Authorization: Bearer crm_bm_<key>   OR   X-API-Key: crm_bm_<key>
 */
import { Router } from 'express';
import Lead from '../models/Lead.js';
import Project from '../models/Project.js';
import Contact from '../models/Contact.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { apiKeyAuth, requireScope } from '../middleware/apiKeyAuth.js';
import { validateExternalQuery } from '../middleware/sanitize.js';

const router = Router();

// All external routes require a valid API key
router.use(apiKeyAuth);

// ─── LEADS ──────────────────────────────────────────────────────────────────
// GET /api/v1/leads
router.get('/leads', requireScope('leads'), validateExternalQuery.leads, async (req, res) => {
    try {
        const filter = { deleted: { $ne: true } };
        if (req.query.stage) filter.stage = req.query.stage;
        if (req.query.manufacturer) filter.manufacturer = req.query.manufacturer;

        const docs = await Lead.find(filter).lean();
        const clean = docs.map(({ _id, __v, createdAt, updatedAt, ...rest }) => rest);
        res.json({ data: clean, count: clean.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/v1/leads/:id
router.get('/leads/:id', requireScope('leads'), async (req, res) => {
    try {
        const doc = await Lead.findOne({ id: req.params.id, deleted: { $ne: true } }).lean();
        if (!doc) return res.status(404).json({ error: 'Not found' });
        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        res.json(rest);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PIPELINE SUMMARY ───────────────────────────────────────────────────────
// GET /api/v1/pipeline  — aggregated counts & values per stage
router.get('/pipeline', requireScope('pipeline'), async (req, res) => {
    try {
        const leads = await Lead.find({ deleted: { $ne: true } }).lean();

        const stages = {};
        let totalValue = 0;

        for (const lead of leads) {
            if (!stages[lead.stage]) stages[lead.stage] = { count: 0, value: 0 };
            stages[lead.stage].count++;
            stages[lead.stage].value += lead.closedValue || lead.value || 0;
            totalValue += lead.closedValue || lead.value || 0;
        }

        const wonLeads = leads.filter(l => l.stage === 'closed-won');
        const lostLeads = leads.filter(l => l.stage === 'closed-lost');

        res.json({
            totalLeads: leads.length,
            totalPipelineValue: totalValue,
            wonCount: wonLeads.length,
            wonValue: wonLeads.reduce((s, l) => s + (l.closedValue || l.value || 0), 0),
            lostCount: lostLeads.length,
            byStage: stages,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PROJECTS ───────────────────────────────────────────────────────────────
// GET /api/v1/projects
router.get('/projects', requireScope('projects'), validateExternalQuery.projects, async (req, res) => {
    try {
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.type) filter.type = req.query.type;

        const docs = await Project.find(filter).lean();
        // Strip internal time logs detail to keep response lean
        const clean = docs.map(({ _id, __v, createdAt, updatedAt, timeLogs, tickets, ...rest }) => ({
            ...rest,
            timeLogsCount: (timeLogs || []).length,
            ticketsCount: (tickets || []).length,
        }));
        res.json({ data: clean, count: clean.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/v1/projects/:id  — full project including logs and tickets
router.get('/projects/:id', requireScope('projects'), async (req, res) => {
    try {
        const doc = await Project.findOne({ id: req.params.id }).lean();
        if (!doc) return res.status(404).json({ error: 'Not found' });
        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        res.json(rest);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── CONTACTS ────────────────────────────────────────────────────────────────
// GET /api/v1/contacts
router.get('/contacts', requireScope('contacts'), async (req, res) => {
    try {
        const docs = await Contact.find().lean();
        const clean = docs.map(({ _id, __v, createdAt, updatedAt, ...rest }) => rest);
        res.json({ data: clean, count: clean.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── USERS (safe — no passwords) ────────────────────────────────────────────
// GET /api/v1/users
router.get('/users', requireScope('users'), async (req, res) => {
    try {
        const docs = await User.find().lean();
        const clean = docs.map(({ _id, __v, createdAt, updatedAt, passwordHash, ...rest }) => rest);
        res.json({ data: clean, count: clean.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── TRANSACTIONS ────────────────────────────────────────────────────────────
// GET /api/v1/transactions
router.get('/transactions', requireScope('transactions'), async (req, res) => {
    try {
        const docs = await Transaction.find().lean();
        const clean = docs.map(({ _id, __v, createdAt, updatedAt, ...rest }) => rest);
        res.json({ data: clean, count: clean.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── META ────────────────────────────────────────────────────────────────────
// GET /api/v1/  — discovery endpoint
router.get('/', (_req, res) => {
    res.json({
        api: 'CRM Blackmoon External API',
        version: '1.0',
        scopes: res.req.apiKey?.scopes || [],
        endpoints: [
            'GET /api/v1/leads[?stage=&manufacturer=]',
            'GET /api/v1/leads/:id',
            'GET /api/v1/pipeline',
            'GET /api/v1/projects[?status=&type=]',
            'GET /api/v1/projects/:id',
            'GET /api/v1/contacts',
            'GET /api/v1/users',
            'GET /api/v1/transactions',
        ],
    });
});

export default router;
