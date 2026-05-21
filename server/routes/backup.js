import { Router } from 'express';
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
import bcrypt from 'bcryptjs';

const router = Router();

// Admin guard
router.use((req, res, next) => {
    if (!req.session?.user?.permissions?.admin) {
        return res.status(403).json({ error: 'Admin required' });
    }
    next();
});

// GET /api/backup — Dump all collections from MongoDB as a restorable JSON
router.get('/', async (_req, res) => {
    try {
        const [
            leads, projects, users, templates, skus, transactions, contacts,
            goalDocs, invoices, payments, balanceSheetAccounts, balanceSheetNotes,
            accounts, automationRules, commissions, emailTemplates, pipelines, proposalTemplates
        ] = await Promise.all([
            Lead.find().lean(),
            Project.find().lean(),
            User.find({}, { passwordHash: 0 }).lean(), // exclude hashed passwords
            Template.find().lean(),
            SKU.find().lean(),
            Transaction.find().lean(),
            Contact.find().lean(),
            Goal.find().lean(),
            Invoice.find().lean(),
            Payment.find().lean(),
            BalanceSheetAccount.find().lean(),
            BalanceSheetNote.find().lean(),
            Account.find().lean(),
            AutomationRule.find().lean(),
            Commission.find().lean(),
            EmailTemplate.find().lean(),
            Pipeline.find().lean(),
            ProposalTemplate.find().lean(),
        ]);

        // Convert Goal array [{year, amount}] → {year: amount} object for compatibility
        const goals = Object.fromEntries(goalDocs.map(g => [g.year, g.amount]));

        res.json({
            version: '3.0',
            timestamp: new Date().toISOString(),
            system: 'CRM_INCODA_LOCAL',
            data: {
                leads, projects, users, templates, skus, transactions, contacts, goals,
                invoices, payments, balanceSheetAccounts, balanceSheetNotes,
                accounts, automationRules, commissions, emailTemplates, pipelines, proposalTemplates
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/backup/restore — Restore all collections from a backup JSON
// Separate from /api/seed so it has its own (more generous) rate limit
router.post('/restore', async (req, res) => {
    try {
        let dataToRestore = req.body;

        // Support both raw data and wrapped { system, data } format
        if (dataToRestore.system === 'CRM_INCODA_LOCAL' && dataToRestore.data) {
            dataToRestore = dataToRestore.data;
        }

        const {
            users, leads, projects, templates, skus, transactions, contacts, goals,
            invoices, payments, balanceSheetAccounts, balanceSheetNotes,
            accounts, automationRules, commissions, emailTemplates, pipelines, proposalTemplates
        } = dataToRestore;

        // Clear all collections in parallel
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
            ProposalTemplate.deleteMany({}),
        ]);

        // Restore users — hash plain-text passwords if needed
        if (users?.length) {
            const preparedUsers = await Promise.all(users.map(async (u) => {
                if (u.password && !u.passwordHash) {
                    const passwordHash = await bcrypt.hash(u.password, 10);
                    const { password, ...rest } = u;
                    return { ...rest, passwordHash };
                }
                // Remove _id conflicts from lean() results so MongoDB generates new ones
                // Keep if it's a valid id field we want to preserve
                return u;
            }));
            await User.insertMany(preparedUsers, { ordered: false });
        }

        // Restore all other collections
        if (leads?.length) await Lead.insertMany(leads, { ordered: false });
        if (projects?.length) await Project.insertMany(projects, { ordered: false });
        if (templates?.length) await Template.insertMany(templates, { ordered: false });
        if (skus?.length) await SKU.insertMany(skus, { ordered: false });
        if (transactions?.length) await Transaction.insertMany(transactions, { ordered: false });
        if (contacts?.length) await Contact.insertMany(contacts, { ordered: false });
        if (invoices?.length) await Invoice.insertMany(invoices, { ordered: false });
        if (payments?.length) await Payment.insertMany(payments, { ordered: false });
        if (balanceSheetAccounts?.length) await BalanceSheetAccount.insertMany(balanceSheetAccounts, { ordered: false });
        if (balanceSheetNotes?.length) await BalanceSheetNote.insertMany(balanceSheetNotes, { ordered: false });
        if (accounts?.length) await Account.insertMany(accounts, { ordered: false });
        if (automationRules?.length) await AutomationRule.insertMany(automationRules, { ordered: false });
        if (commissions?.length) await Commission.insertMany(commissions, { ordered: false });
        if (emailTemplates?.length) await EmailTemplate.insertMany(emailTemplates, { ordered: false });
        if (pipelines?.length) await Pipeline.insertMany(pipelines, { ordered: false });
        if (proposalTemplates?.length) await ProposalTemplate.insertMany(proposalTemplates, { ordered: false });

        if (goals && typeof goals === 'object') {
            const goalsArr = Object.entries(goals).map(([year, amount]) => ({
                year: parseInt(year), amount
            }));
            if (goalsArr.length) await Goal.insertMany(goalsArr, { ordered: false });
        }

        res.json({ success: true, message: 'Database restored from backup' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
