import bcrypt from 'bcryptjs';
import { Router } from 'express';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Lead from '../models/Lead.js';

const router = Router();

// GET ALL - without exposing passwordHash
router.get('/', async (_req, res) => {
    try {
        const docs = await User.find().lean();
        const cleaned = docs.map(({ _id, __v, createdAt, updatedAt, passwordHash, ...rest }) => rest);
        res.json(cleaned);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET BY ID
router.get('/:id', async (req, res) => {
    try {
        const doc = await User.findOne({ id: req.params.id }).lean();
        if (!doc) return res.status(404).json({ error: 'Not found' });
        const { _id, __v, createdAt, updatedAt, passwordHash, ...rest } = doc;
        res.json(rest);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE - hash password if provided in plain text
router.post('/', async (req, res) => {
    try {
        const { password, ...userData } = req.body;
        if (password) {
            userData.passwordHash = await bcrypt.hash(password, 10);
        }
        const doc = await User.create(userData);
        const { _id, __v, createdAt, updatedAt, passwordHash, ...rest } = doc.toObject();
        res.status(201).json(rest);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// UPDATE - hash password if it is being changed
router.put('/:id', async (req, res) => {
    try {
        const { id, password, ...updateData } = req.body;
        if (password) {
            updateData.passwordHash = await bcrypt.hash(password, 10);
        }
        const doc = await User.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { new: true, lean: true }
        );
        if (!doc) return res.status(404).json({ error: 'Not found' });
        const { _id, __v, createdAt, updatedAt, passwordHash, ...rest } = doc;
        res.json(rest);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE
router.delete('/:id', async (req, res) => {
    try {
        const result = await User.findOneAndDelete({ id: req.params.id });
        if (!result) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CASCADE UPDATE - Update user name across projects and leads
router.put('/:id/cascade', async (req, res) => {
    try {
        const { oldName, password, ...userData } = req.body;
        const newName = userData.name;

        if (password) {
            userData.passwordHash = await bcrypt.hash(password, 10);
        }

        await User.findOneAndUpdate({ id: req.params.id }, { $set: userData });

        if (oldName && oldName !== newName) {
            const projects = await Project.find();
            for (const p of projects) {
                let changed = false;
                const team = (p.team || []).map(m => { if (m === oldName) { changed = true; return newName; } return m; });
                const tasks = (p.tasks || []).map(t => { if (t.assignee === oldName) { changed = true; return { ...t, assignee: newName }; } return t; });
                const timeLogs = (p.timeLogs || []).map(l => { if (l.consultantName === oldName) { changed = true; return { ...l, consultantName: newName }; } return l; });
                if (changed) {
                    await Project.findOneAndUpdate({ id: p.id }, { $set: { team, tasks, timeLogs } });
                }
            }

            const leads = await Lead.find();
            for (const l of leads) {
                const tasks = (l.tasks || []).map(t => t.assignee === oldName ? { ...t, assignee: newName } : t);
                if (JSON.stringify(tasks) !== JSON.stringify(l.tasks)) {
                    await Lead.findOneAndUpdate({ id: l.id }, { $set: { tasks } });
                }
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Endpoint 1D: PATCH /api/users/:id/hourly-cost — Update consultant hourly cost (costing)
router.patch('/:id/hourly-cost', async (req, res) => {
    try {
        const { hourlyCost, reason } = req.body;

        // Validate RBAC (only admin, finance can edit hourly costs)
        // For now, allow all (TODO: add session.user.role check)

        // Validation: hourlyCost
        if (hourlyCost === undefined || hourlyCost === null) {
            return res.status(400).json({ error: 'hourlyCost is required' });
        }
        const cost = parseFloat(hourlyCost);
        if (isNaN(cost)) {
            return res.status(400).json({ error: 'hourlyCost must be a valid number' });
        }
        if (cost < 0 || cost > 100000) {
            return res.status(400).json({ error: 'Hourly cost must be between 0 and 100,000' });
        }

        const updateData = {
            hourlyCost: cost,
            costLastUpdatedAt: new Date(),
            costLastUpdatedBy: req.session?.user?.id
        };

        const doc = await User.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { new: true, lean: true }
        );
        if (!doc) return res.status(404).json({ error: 'User not found' });

        const { _id, __v, createdAt, updatedAt, passwordHash, ...rest } = doc;

        // Log audit (hourlyCost change is sensitive)
        console.log(`[AUDIT] User ${req.params.id} hourly cost updated: ${reason || 'no reason'}`);

        res.json({
            success: true,
            user: rest,
            message: `Hourly cost updated to $${hourlyCost}`
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

export default router;
