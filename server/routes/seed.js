import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../middleware/requireAuth.js';
import Lead from '../models/Lead.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import Template from '../models/Template.js';
import SKU from '../models/SKU.js';
import Transaction from '../models/Transaction.js';
import Contact from '../models/Contact.js';
import Goal from '../models/Goal.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import BalanceSheetAccount from '../models/BalanceSheetAccount.js';
import BalanceSheetNote from '../models/BalanceSheetNote.js';
import Account from '../models/Account.js';
import AutomationRule from '../models/AutomationRule.js';
import Commission from '../models/Commission.js';
import EmailTemplate from '../models/EmailTemplate.js';
import Pipeline from '../models/Pipeline.js';
import ProposalTemplate from '../models/ProposalTemplate.js';

// Prepare users by hashing their password if provided in plain text.
// If no password is sent (frontend no longer includes them), fall back to
// server-side SEED_PASS_* env vars keyed by role.
const SEED_PASSWORDS_BY_ROLE = {
    admin:      process.env.SEED_PASS_ADMIN,
    consultant: process.env.SEED_PASS_CONSULTANT,
    sales:      process.env.SEED_PASS_SALES,
};

const prepareUsers = async (users) => {
    return Promise.all((users || []).map(async (u) => {
        const plaintext = u.password || SEED_PASSWORDS_BY_ROLE[u.role];
        const { password, ...rest } = u;
        if (plaintext && !rest.passwordHash) {
            rest.passwordHash = await bcrypt.hash(plaintext, 10);
        }
        return rest;
    }));
};

const router = Router();

// POST /api/seed - Reset DB with provided data
router.post('/', requireAdmin, async (req, res) => {
    try {
        const {
            users, leads, projects, templates, skus, transactions, contacts, goals,
            invoices, payments, balanceSheetAccounts, balanceSheetNotes,
            accounts, automationRules, commissions, emailTemplates, pipelines, proposalTemplates
        } = req.body;

        // Clear all collections
        await Promise.all([
            User.deleteMany({}),
            Lead.deleteMany({}),
            Project.deleteMany({}),
            Template.deleteMany({}),
            SKU.deleteMany({}),
            Transaction.deleteMany({}),
            Contact.deleteMany({}),
            Goal.deleteMany({}),
            Invoice.deleteMany({}),
            Payment.deleteMany({}),
            BalanceSheetAccount.deleteMany({}),
            BalanceSheetNote.deleteMany({}),
            Account.deleteMany({}),
            AutomationRule.deleteMany({}),
            Commission.deleteMany({}),
            EmailTemplate.deleteMany({}),
            Pipeline.deleteMany({}),
            ProposalTemplate.deleteMany({})
        ]);

        // Insert data
        const preparedUsers = await prepareUsers(users);
        if (preparedUsers?.length) await User.insertMany(preparedUsers);
        if (leads?.length) await Lead.insertMany(leads);
        if (projects?.length) await Project.insertMany(projects);
        if (templates?.length) await Template.insertMany(templates);
        if (skus?.length) await SKU.insertMany(skus);
        if (transactions?.length) await Transaction.insertMany(transactions);
        if (contacts?.length) await Contact.insertMany(contacts);
        if (invoices?.length) await Invoice.insertMany(invoices);
        if (payments?.length) await Payment.insertMany(payments);
        if (balanceSheetAccounts?.length) await BalanceSheetAccount.insertMany(balanceSheetAccounts);
        if (balanceSheetNotes?.length) await BalanceSheetNote.insertMany(balanceSheetNotes);
        if (accounts?.length) await Account.insertMany(accounts);
        if (automationRules?.length) await AutomationRule.insertMany(automationRules);
        if (commissions?.length) await Commission.insertMany(commissions);
        if (emailTemplates?.length) await EmailTemplate.insertMany(emailTemplates);
        if (pipelines?.length) await Pipeline.insertMany(pipelines);
        if (proposalTemplates?.length) await ProposalTemplate.insertMany(proposalTemplates);

        if (goals && typeof goals === 'object') {
            const goalsArr = Object.entries(goals).map(([year, amount]) => ({
                year: parseInt(year), amount
            }));
            if (goalsArr.length) await Goal.insertMany(goalsArr);
        }

        res.json({ success: true, message: 'Database reset complete' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/seed/check - Check if the DB is empty
router.post('/check', async (_req, res) => {
    try {
        const count = await User.countDocuments();
        res.json({ empty: count === 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/seed/init - Insert data only if the DB is empty
router.post('/init', async (req, res) => {
    try {
        const count = await User.countDocuments();
        if (count > 0) {
            return res.json({ success: true, message: 'Database already has data, skipping seed' });
        }

        const { users, leads, projects, templates, skus, transactions, contacts, goals } = req.body;

        const preparedUsers = await prepareUsers(users);
        if (preparedUsers?.length) await User.insertMany(preparedUsers);
        if (leads?.length) await Lead.insertMany(leads);
        if (projects?.length) await Project.insertMany(projects);
        if (templates?.length) await Template.insertMany(templates);
        if (skus?.length) await SKU.insertMany(skus);
        if (transactions?.length) await Transaction.insertMany(transactions);
        if (contacts?.length) await Contact.insertMany(contacts);

        if (goals && typeof goals === 'object') {
            const goalsArr = Object.entries(goals).map(([year, amount]) => ({
                year: parseInt(year), amount
            }));
            if (goalsArr.length) await Goal.insertMany(goalsArr);
        }

        res.json({ success: true, message: 'Database seeded with initial data' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/seed/sync-templates - Upsert templates by id (insert new, skip existing)
router.post('/sync-templates', requireAdmin, async (req, res) => {
    try {
        const { templates } = req.body;
        if (!Array.isArray(templates) || templates.length === 0) {
            return res.json({ success: true, message: 'No templates provided' });
        }

        const results = await Promise.all(
            templates.map(t =>
                Template.findOneAndUpdate(
                    { id: t.id },
                    { $setOnInsert: t },
                    { upsert: true, new: true }
                )
            )
        );

        res.json({ success: true, synced: results.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
