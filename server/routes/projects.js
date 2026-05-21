/**
 * Projects Router
 * ───────────────
 * Extends the generic CRUD router with role-based data filtering:
 *
 *  - admin / sales  → full project data (all time logs, all rates)
 *  - consultant     → only projects where they are in team[];
 *                     time logs and ticket logs stripped to their own entries;
 *                     other consultants' rates hidden from consultantRates map.
 *
 * The session user is read from req.session.user (set at login).
 * If no session exists the request falls through to the generic router
 * (internal calls from the frontend always have a session in production).
 */
import { Router } from 'express';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { createCrudRouter } from './crud.js';

const router = Router();

// ─── HELPER ──────────────────────────────────────────────────────────────────
/**
 * Strips all time log and financial data that belongs to other consultants.
 * Called only when req.session.user.role === 'consultant'.
 */
const filterForConsultant = (project, consultantName) => {
    // Filter top-level time logs
    const myTimeLogs = (project.timeLogs || []).filter(
        l => l.consultantName === consultantName
    );

    // Filter ticket time logs
    const myTickets = (project.tickets || []).map(ticket => ({
        ...ticket,
        timeLogs: (ticket.timeLogs || []).filter(
            l => l.consultantName === consultantName
        ),
    }));

    // Strip other consultants' rates — only keep own rate
    const myRates = project.consultantRates
        ? { [consultantName]: project.consultantRates[consultantName] }
        : undefined;

    return {
        ...project,
        timeLogs: myTimeLogs,
        tickets: myTickets,
        ...(myRates !== undefined ? { consultantRates: myRates } : {}),
    };
};

// ─── GET ALL ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const docs = await Project.find().lean();
        const cleaned = docs.map(({ _id, __v, createdAt, updatedAt, ...rest }) => rest);

        const sessionUser = req.session?.user;

        if (sessionUser?.role === 'consultant') {
            // Only projects where the consultant is in the team
            const mine = cleaned
                .filter(p => (p.team || []).includes(sessionUser.name))
                .map(p => filterForConsultant(p, sessionUser.name));
            return res.json(mine);
        }

        res.json(cleaned);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET BY ID ───────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const doc = await Project.findOne({ id: req.params.id }).lean();
        if (!doc) return res.status(404).json({ error: 'Not found' });
        const { _id, __v, createdAt, updatedAt, ...rest } = doc;

        const sessionUser = req.session?.user;

        if (sessionUser?.role === 'consultant') {
            // Block access to projects the consultant is not part of
            if (!(rest.team || []).includes(sessionUser.name)) {
                return res.status(403).json({ error: 'Access denied.' });
            }
            return res.json(filterForConsultant(rest, sessionUser.name));
        }

        res.json(rest);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── WRITE OPERATIONS ────────────────────────────────────────────────────────
const IMMUTABLE = ['_id', '__v', 'keyHash', 'passwordHash', 'createdAt', 'updatedAt'];

router.post('/', async (req, res) => {
    try {
        const payload = { ...req.body };
        IMMUTABLE.forEach(f => delete payload[f]);
        const doc = await Project.create(payload);
        const { _id, __v, createdAt, updatedAt, ...rest } = doc.toObject();
        res.status(201).json(rest);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { id, ...updateData } = req.body;
        IMMUTABLE.forEach(f => delete updateData[f]);

        // FIX #2: Process timeLogs for costing (snapshot hourlyCost + calculate entryCost)
        if (updateData.timeLogs && Array.isArray(updateData.timeLogs)) {
            // Validation: check hours >= 0
            for (const log of updateData.timeLogs) {
                if (log.hours !== undefined && log.hours !== null) {
                    const hours = parseFloat(log.hours);
                    if (isNaN(hours)) {
                        return res.status(400).json({ error: 'hours must be a valid number' });
                    }
                    if (hours < 0) {
                        return res.status(400).json({ error: 'hours must be >= 0' });
                    }
                }
            }

            let totalActualCost = 0;
            const processedLogs = await Promise.all(
                updateData.timeLogs.map(async (log) => {
                    // If log has hours and consultantName, calculate entryCost
                    if (log.hours && log.consultantName && !log.hourlyCostSnapshot) {
                        const user = await User.findOne({ name: log.consultantName }).lean();
                        if (user) {
                            // Capture hourly cost snapshot at this moment
                            log.hourlyCostSnapshot = user.hourlyCost || 0;
                            log.entryCost = log.hours * log.hourlyCostSnapshot;
                            log.costCalculatedAt = new Date();
                        }
                        // If user not found by name, skip cost calculation but still save the log
                    }
                    // Accumulate actual cost from all logs
                    if (log.entryCost) totalActualCost += log.entryCost;
                    return log;
                })
            );
            updateData.timeLogs = processedLogs;
            updateData.actualCost = totalActualCost;
            updateData.actualCostLastUpdated = new Date();
        }

        // ── Consultant merge guard ────────────────────────────────────────────
        // Consultants GET filtered projects (only their own timeLogs). If we let
        // their PUT replace the full timeLogs array we would silently wipe every
        // other consultant's hours. Instead, merge: keep DB logs that belong to
        // other consultants and replace only the submitting consultant's logs.
        const sessionUser = req.session?.user;
        if (sessionUser?.role === 'consultant') {
            const existing = await Project.findOne({ id: req.params.id }).lean();
            if (existing) {
                const consultantName = sessionUser.name;

                // Merge project-level timeLogs
                if (updateData.timeLogs !== undefined) {
                    const othersLogs = (existing.timeLogs || []).filter(
                        l => l.consultantName !== consultantName
                    );
                    updateData.timeLogs = [...othersLogs, ...updateData.timeLogs];
                }

                // Merge ticket-level timeLogs (per ticket)
                if (updateData.tickets !== undefined) {
                    updateData.tickets = updateData.tickets.map(ticket => {
                        const existingTicket = (existing.tickets || []).find(t => t.id === ticket.id);
                        if (!existingTicket) return ticket;
                        const othersTicketLogs = (existingTicket.timeLogs || []).filter(
                            l => l.consultantName !== consultantName
                        );
                        return {
                            ...ticket,
                            timeLogs: [...othersTicketLogs, ...(ticket.timeLogs || [])],
                        };
                    });
                }

                // Recalculate actualCost across all merged logs
                if (updateData.timeLogs !== undefined) {
                    updateData.actualCost = updateData.timeLogs.reduce(
                        (sum, l) => sum + (l.entryCost || 0), 0
                    );
                }
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        const doc = await Project.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { new: true, lean: true }
        );
        if (!doc) return res.status(404).json({ error: 'Project not found' });
        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        res.json(rest);
    } catch (err) {
        // Specific error handling for consultant not found
        if (err.message.includes('not found')) {
            return res.status(404).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const result = await Project.findOneAndDelete({ id: req.params.id });
        if (!result) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
