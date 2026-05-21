import { Router } from 'express';
import mongoose from 'mongoose';
import Lead from '../models/Lead.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import Activity from '../models/Activity.js';
import Project from '../models/Project.js';
import { sendLeadWonNotification } from '../emailService.js';
import { dispatchWebhooks } from '../webhookService.js';
import { notifyAdmins } from '../notificationService.js';
import { logAudit, diffDocs } from '../auditService.js';
import { emitCollectionChange } from '../socketInstance.js';
import { evaluateRules } from '../automationService.js';

const router = Router();

// GET ALL — excludes soft-deleted leads
router.get('/', async (_req, res) => {
    try {
        const docs = await Lead.find({ deleted: { $ne: true } }).lean();
        const cleaned = docs.map(({ _id, __v, createdAt, updatedAt, ...rest }) => rest);
        res.json(cleaned);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET BY ID
router.get('/:id', async (req, res) => {
    try {
        const doc = await Lead.findOne({ id: req.params.id }).lean();
        if (!doc) return res.status(404).json({ error: 'Not found' });
        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        res.json(rest);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE
router.post('/', async (req, res) => {
    try {
        const body = req.body;
        // Initialize stageHistory if not provided
        if (!body.stageHistory || body.stageHistory.length === 0) {
            body.stageHistory = [{
                stage: body.stage || 'prospect',
                enteredAt: new Date().toISOString(),
                exitedAt: null,
                daysInStage: 0
            }];
        }
        const doc = await Lead.create(body);
        const { _id, __v, createdAt, updatedAt, ...rest } = doc.toObject();
        dispatchWebhooks('lead.created', rest, req.session?.user?.email).catch(() => {});
        emitCollectionChange('leads', 'created', rest);
        logAudit({ entityType: 'lead', entityId: rest.id, action: 'created', userId: req.session?.user?.id, userName: req.session?.user?.name });
        res.status(201).json(rest);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// UPDATE — intercepts stage → 'closed-won' to fire email notification
router.put('/:id', async (req, res) => {
    try {
        const { id: _bodyId, ...updateData } = req.body;

        // Fetch existing doc to check stage change and update stageHistory
        const existing = await Lead.findOne({ id: req.params.id }).lean();
        if (!existing) return res.status(404).json({ error: 'Not found' });

        const previousStage = existing.stage;

        // Update stageHistory if stage changed
        if (updateData.stage && updateData.stage !== previousStage) {
            const now = new Date().toISOString();
            const history = Array.isArray(existing.stageHistory) ? [...existing.stageHistory] : [];

            // Close out the last entry
            if (history.length > 0) {
                const last = { ...history[history.length - 1] };
                last.exitedAt = now;
                last.daysInStage = Math.floor(
                    (Date.now() - new Date(last.enteredAt).getTime()) / (1000 * 60 * 60 * 24)
                );
                history[history.length - 1] = last;
            }

            // Open new entry
            history.push({ stage: updateData.stage, enteredAt: now, exitedAt: null, daysInStage: 0 });
            updateData.stageHistory = history;
        }

        const doc = await Lead.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { new: true, lean: true }
        );
        if (!doc) return res.status(404).json({ error: 'Not found' });
        const { _id, __v, createdAt, updatedAt, ...rest } = doc;

        // Audit diff
        const changes = diffDocs(existing, rest);
        const auditAction = (updateData.stage && updateData.stage !== previousStage) ? 'stage_changed' : 'updated';
        logAudit({
            entityType: 'lead', entityId: rest.id, action: auditAction,
            userId: req.session?.user?.id, userName: req.session?.user?.name,
            changes,
            meta: auditAction === 'stage_changed' ? { previousStage, newStage: updateData.stage } : undefined,
        });
        emitCollectionChange('leads', 'updated', rest);

        // Log activity + evaluate automations on stage change (fire-and-forget)
        if (updateData.stage && updateData.stage !== previousStage) {
            Activity.create({
                id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                type: 'stage_change',
                note: `Stage changed from "${previousStage}" to "${updateData.stage}"`,
                date: new Date().toISOString(),
                userId: req.session?.user?.id || '',
                userName: req.session?.user?.name || 'System',
                entityId: rest.id,
                entityType: 'lead',
                metadata: { previousStage, newStage: updateData.stage },
            }).catch(() => {});

            evaluateRules('stage_changed', { lead: rest, previousStage, newStage: updateData.stage, userId: req.session?.user?.id }).catch(() => {});
        }
        if (updateData.assignedTo && updateData.assignedTo !== existing.assignedTo) {
            evaluateRules('lead_assigned', { lead: rest, userId: req.session?.user?.id }).catch(() => {});
        }
        if (updateData.stage === 'closed-won' && previousStage !== 'closed-won') {
            evaluateRules('deal_won', { lead: rest, userId: req.session?.user?.id }).catch(() => {});
        }
        // field_updated — fires for any field change that isn't a stage change
        const changedFields = Object.keys(updateData).filter(k => k !== 'stage' && k !== 'stageHistory');
        if (changedFields.length > 0 && !(updateData.stage && updateData.stage !== previousStage)) {
            evaluateRules('field_updated', { lead: rest, changedFields, userId: req.session?.user?.id }).catch(() => {});
        }

        // Send notification only when stage transitions INTO closed-won
        if (updateData.stage === 'closed-won' && previousStage !== 'closed-won') {
            Settings.findOne({ id: 'global' }).lean()
                .then(async (cfg) => {
                    if (cfg?.emailLeadWon === false) return; // disabled by admin
                    const adminUsers = await User.find({ 'permissions.admin': true }).lean();
                    return sendLeadWonNotification(rest, adminUsers);
                })
                .catch(err => console.error('[Email] Notification error:', err.message));
        }

        // Webhook + in-app notification dispatches (fire-and-forget)
        if (updateData.stage && updateData.stage !== previousStage) {
            dispatchWebhooks('lead.stage_changed', { lead: rest, previousStage, newStage: updateData.stage }, req.session?.user?.email).catch(() => {});
        }
        if (updateData.stage === 'closed-won' && previousStage !== 'closed-won') {
            dispatchWebhooks('lead.closed_won', rest, req.session?.user?.email).catch(() => {});
            notifyAdmins({
                type: 'lead_closed_won',
                title: `Lead Closed Won: ${rest.companyName}`,
                severity: 'info',
                relatedModel: 'lead',
                relatedId: rest.id,
                route: '/crm'
            }).catch(() => {});
        }
        if (updateData.stage === 'closed-lost' && previousStage !== 'closed-lost') {
            dispatchWebhooks('lead.closed_lost', rest, req.session?.user?.email).catch(() => {});
        }

        return res.json(rest);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
});

// BULK PATCH — change_stage | assign_owner | delete
router.patch('/bulk', async (req, res) => {
    try {
        const { ids, action, payload } = req.body;
        if (!Array.isArray(ids) || ids.length === 0)
            return res.status(400).json({ error: 'ids must be a non-empty array' });

        let updateQuery = {};
        switch (action) {
            case 'change_stage':
                if (!payload?.stage) return res.status(400).json({ error: 'payload.stage required' });
                updateQuery = { $set: { stage: payload.stage } };
                break;
            case 'assign_owner':
                if (!payload?.assignedTo) return res.status(400).json({ error: 'payload.assignedTo required' });
                updateQuery = { $set: { assignedTo: payload.assignedTo, assignedToName: payload.assignedToName || '' } };
                break;
            case 'delete':
                updateQuery = { $set: { deleted: true } };
                break;
            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }

        await Lead.updateMany({ id: { $in: ids } }, updateQuery);

        if (action === 'delete') {
            ids.forEach(id => emitCollectionChange('leads', 'deleted', { id }));
        } else {
            const updated = await Lead.find({ id: { $in: ids } }).lean();
            updated.forEach(doc => {
                const { _id, __v, createdAt, updatedAt, ...rest } = doc;
                emitCollectionChange('leads', 'updated', rest);
            });
        }

        logAudit({
            entityType: 'lead', entityId: ids.join(','), action: `bulk_${action}`,
            userId: req.session?.user?.id, userName: req.session?.user?.name,
            meta: { ids, ...payload },
        });

        return res.json({ success: true, count: ids.length });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /import — bulk upsert from CSV (accepts parsed leads array, max 2000)
router.post('/import', async (req, res) => {
    const { leads: rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'leads array required' });
    }
    if (rows.length > 2000) {
        return res.status(400).json({ error: 'Max 2000 leads per import' });
    }
    try {
        const ops = rows.map(row => ({
            updateOne: {
                filter: { id: row.id },
                update: { $set: row },
                upsert: true,
            },
        }));
        const result = await Lead.bulkWrite(ops, { ordered: false });
        const inserted = result.upsertedCount ?? 0;
        const updated  = result.modifiedCount ?? 0;
        logAudit({ entityType: 'lead', entityId: 'bulk_import', action: 'imported', userId: req.session?.user?.id, userName: req.session?.user?.name, changes: { inserted, updated } });
        emitCollectionChange('leads', 'bulk_import', { inserted, updated });
        res.json({ success: true, inserted, updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE
router.delete('/:id', async (req, res) => {
    try {
        const result = await Lead.findOneAndDelete({ id: req.params.id });
        if (!result) return res.status(404).json({ error: 'Not found' });
        logAudit({ entityType: 'lead', entityId: req.params.id, action: 'deleted', userId: req.session?.user?.id, userName: req.session?.user?.name });
        emitCollectionChange('leads', 'deleted', { id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint 1B: PATCH /api/leads/:id/items-costing — Update item costs & overrides
router.patch('/:id/items-costing', async (req, res) => {
    try {
        const { items } = req.body; // Array of { id, baseCost, costOverrideReason, estimatedHours, costStatus }

        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'items must be an array' });
        }

        const existing = await Lead.findOne({ id: req.params.id }).lean();
        if (!existing) return res.status(404).json({ error: 'Lead not found' });

        // Validation: check that all item IDs exist in the lead
        const validItemIds = new Set((existing.items || []).map(i => i.id));
        for (const item of items) {
            if (!validItemIds.has(item.id)) {
                return res.status(404).json({ error: `Item ${item.id} not found in lead` });
            }
        }

        // Validation: check baseCost, costStatus enum
        const validCostStatuses = ['pending', 'reviewed', 'approved'];
        for (const item of items) {
            if (item.baseCost !== undefined && item.baseCost !== null) {
                const cost = parseFloat(item.baseCost);
                if (isNaN(cost)) {
                    return res.status(400).json({ error: `baseCost for item ${item.id} must be a valid number` });
                }
                if (cost < 0 || cost > 100000) {
                    return res.status(400).json({ error: `baseCost for item ${item.id} must be between 0 and 100,000` });
                }
            }
            if (item.costStatus !== undefined && item.costStatus !== null && !validCostStatuses.includes(item.costStatus)) {
                return res.status(400).json({ error: `costStatus must be one of: ${validCostStatuses.join(', ')}` });
            }
        }

        // Update each item in the lead
        const updatedItems = (existing.items || []).map(currentItem => {
            const update = items.find(i => i.id === currentItem.id);
            if (!update) return currentItem;

            const updated = { ...currentItem };
            if (update.baseCost !== undefined) updated.baseCost = parseFloat(update.baseCost);
            if (update.costOverrideReason !== undefined) updated.costOverrideReason = update.costOverrideReason;
            if (update.estimatedHours !== undefined) updated.estimatedHours = update.estimatedHours;
            if (update.costStatus !== undefined) updated.costStatus = update.costStatus;

            // Recalculate margin
            if (updated.baseCost !== undefined && updated.total) {
                updated.margin = updated.total - updated.baseCost;
                updated.marginPercent = updated.total > 0 ? (updated.margin / updated.total) * 100 : 0;
            }

            return updated;
        });

        const doc = await Lead.findOneAndUpdate(
            { id: req.params.id },
            { $set: { items: updatedItems } },
            { new: true, lean: true }
        );
        if (!doc) return res.status(404).json({ error: 'Lead not found' });

        // Recalculate budgeted cost and sync to related projects
        const recalculatedBudget = updatedItems.reduce((sum, item) => {
            return sum + (item.baseCost || 0);
        }, 0);

        const relatedProjects = await Project.find({ leadId: req.params.id }).lean();
        await Project.updateMany(
            { leadId: req.params.id },
            { $set: { budgetedCost: recalculatedBudget } }
        );

        // Emit changes for all related projects
        relatedProjects.forEach(proj => {
            const { _id, __v, createdAt, updatedAt, ...projRest } = proj;
            emitCollectionChange('projects', 'updated', { ...projRest, budgetedCost: recalculatedBudget });
        });

        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        logAudit({ entityType: 'lead', entityId: req.params.id, action: 'costing_updated', userId: req.session?.user?.id, userName: req.session?.user?.name });
        emitCollectionChange('leads', 'updated', rest);
        res.json(rest);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Endpoint 1C: POST /api/leads/:id/costing-review — Approve costing & sync baseCosts to quotation
router.post('/:id/costing-review', async (req, res) => {
    try {
        const { approvedBy, comment, items: incomingItems } = req.body;

        if (!approvedBy) {
            return res.status(400).json({ error: 'approvedBy is required' });
        }

        const approver = await User.findOne({ id: approvedBy }).lean();
        if (!approver) {
            return res.status(404).json({ error: `User ${approvedBy} not found` });
        }

        const canApprove = approver.canApproveCosting || approver.role === 'admin';
        if (!canApprove) {
            return res.status(403).json({ error: 'You do not have permission to approve costing' });
        }

        const existing = await Lead.findOne({ id: req.params.id }).lean();
        if (!existing) return res.status(404).json({ error: 'Lead not found' });

        // Mark costing items as 'approved'
        const updatedCostingItems = (incomingItems || existing.costingItems || []).map(item => ({
            ...item,
            costStatus: 'approved'
        }));

        // Sync baseCosts from costingItems to quotation items
        const approvedItems = updatedCostingItems.filter(c => c.costStatus === 'approved');
        const syncedQuotationItems = (existing.items || []).map(qItem => {
            const costingItem = approvedItems.find(c => c._itemId === qItem.id || c.id === qItem._costingItemId);
            if (costingItem && costingItem.baseCost !== undefined) {
                return {
                    ...qItem,
                    unitCost: costingItem.baseCost,
                    margin: qItem.unitPrice > 0 ? ((qItem.unitPrice - costingItem.baseCost) / qItem.unitPrice) * 100 : 0,
                };
            }
            return qItem;
        });

        // Calculate budgeted cost from approved items
        const budgetedCost = approvedItems.reduce((sum, item) => {
            const qty = item.quantity || 1;
            const cost = item.baseCost || 0;
            return sum + (qty * cost);
        }, 0);

        // Log sync
        const syncLog = {
            timestamp: new Date(),
            direction: 'costing_to_quote',
            itemIds: approvedItems.map(i => i.id),
            changes: { syncedBaseCosts: approvedItems.length },
            userId: approvedBy,
        };

        const doc = await Lead.findOneAndUpdate(
            { id: req.params.id },
            { $set: {
                items: syncedQuotationItems,
                costingItems: updatedCostingItems,
                costingReviewedAt: new Date(),
                costingReviewedBy: approvedBy,
                budgetedCost,
                costingSyncLog: [syncLog, ...(existing.costingSyncLog || [])],
            } },
            { new: true, lean: true }
        );
        if (!doc) return res.status(404).json({ error: 'Lead not found' });

        // Sync budgetedCost to related projects
        const relatedProjects = await Project.find({ leadId: req.params.id }).lean();
        await Project.updateMany(
            { leadId: req.params.id },
            { $set: { budgetedCost } }
        );

        relatedProjects.forEach(proj => {
            const { _id, __v, createdAt, updatedAt, ...projRest } = proj;
            emitCollectionChange('projects', 'updated', { ...projRest, budgetedCost });
        });

        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        logAudit({ entityType: 'lead', entityId: req.params.id, action: 'costing_reviewed', userId: approvedBy, userName: approver.name, changes: { budgetedCost, comment, syncedItems: approvedItems.length } });
        emitCollectionChange('leads', 'updated', rest);

        res.json({
            success: true,
            lead: rest,
            summary: { budgetedCost, itemCount: approvedItems.length, approvedBy: approver.name, syncedToQuotation: syncedQuotationItems.length }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Endpoint: PATCH /api/leads/:id/costing-items — Save costing items changes (baseCost, etc)
router.patch('/:id/costing-items', async (req, res) => {
    try {
        const { items: incomingItems } = req.body;
        if (!incomingItems || !Array.isArray(incomingItems)) {
            return res.status(400).json({ error: 'items array is required' });
        }

        const existing = await Lead.findOne({ id: req.params.id }).lean();
        if (!existing) return res.status(404).json({ error: 'Lead not found' });

        // Update costingItems with changes from CostingReview
        const existingCostingItems = existing.costingItems || [];
        let updatedCostingItems;

        if (existingCostingItems.length === 0) {
            // No costingItems yet — initialize from incoming items (first save from items fallback)
            console.log(`[COSTING-PATCH] No existing costingItems, creating ${incomingItems.length} from incoming`);
            updatedCostingItems = incomingItems.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price || 0,
                baseCost: item.baseCost !== undefined && item.baseCost !== null ? Number(item.baseCost) : undefined,
                costOverrideReason: item.costOverrideReason,
                estimatedHours: item.estimatedHours !== undefined && item.estimatedHours !== null ? Number(item.estimatedHours) : undefined,
                costStatus: item.costStatus || 'pending',
                quantity: item.quantity,
                _lastSyncedAt: new Date(),
            }));
        } else {
            // Merge incoming changes into existing costingItems
            const matchedIds = new Set();
            updatedCostingItems = existingCostingItems.map(costingItem => {
                const incomingItem = incomingItems.find(i => i.id === costingItem.id);
                if (incomingItem) {
                    matchedIds.add(incomingItem.id);
                    console.log(`[COSTING-PATCH] Item ${incomingItem.id}: baseCost ${costingItem.baseCost} → ${incomingItem.baseCost}`);
                    return {
                        ...costingItem,
                        baseCost: incomingItem.baseCost !== undefined && incomingItem.baseCost !== null ? Number(incomingItem.baseCost) : costingItem.baseCost,
                        costOverrideReason: incomingItem.costOverrideReason !== undefined ? incomingItem.costOverrideReason : costingItem.costOverrideReason,
                        estimatedHours: incomingItem.estimatedHours !== undefined && incomingItem.estimatedHours !== null ? Number(incomingItem.estimatedHours) : costingItem.estimatedHours,
                        costStatus: incomingItem.costStatus !== undefined ? incomingItem.costStatus : costingItem.costStatus,
                        _lastSyncedAt: new Date(),
                    };
                }
                return costingItem;
            });
            // Add any incoming items not found in existing costingItems
            for (const item of incomingItems) {
                if (!matchedIds.has(item.id)) {
                    console.log(`[COSTING-PATCH] Adding new costingItem ${item.id}`);
                    updatedCostingItems.push({
                        id: item.id,
                        name: item.name,
                        price: item.price || 0,
                        baseCost: item.baseCost !== undefined && item.baseCost !== null ? Number(item.baseCost) : undefined,
                        costOverrideReason: item.costOverrideReason,
                        estimatedHours: item.estimatedHours !== undefined && item.estimatedHours !== null ? Number(item.estimatedHours) : undefined,
                        costStatus: item.costStatus || 'pending',
                        quantity: item.quantity,
                        _lastSyncedAt: new Date(),
                    });
                }
            }
        }

        // Log sync
        const syncLog = {
            timestamp: new Date(),
            direction: 'costing_edit',
            itemIds: incomingItems.map(i => i.id),
            changes: { editedCostingItems: incomingItems.length },
            userId: req.user?.id || 'system',
        };

        console.log(`[COSTING-PATCH] Saving ${incomingItems.length} items for lead ${req.params.id}`);

        const doc = await Lead.findOneAndUpdate(
            { id: req.params.id },
            { $set: {
                costingItems: updatedCostingItems,
                costingSyncLog: [syncLog, ...(existing.costingSyncLog || [])],
            } },
            { new: true, lean: true }
        );
        if (!doc) return res.status(404).json({ error: 'Lead not found' });

        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        logAudit({ entityType: 'lead', entityId: req.params.id, action: 'costing_items_saved', userId: req.user?.id || 'system', changes: { itemCount: incomingItems.length } });
        emitCollectionChange('leads', 'updated', rest);

        res.json({
            success: true,
            lead: rest,
            syncLog: {
                direction: 'costing_edit',
                itemsAffected: incomingItems.length,
            }
        });
    } catch (err) {
        console.error('[COSTING-PATCH] Error:', err.message);
        res.status(400).json({ error: err.message });
    }
});

// Endpoint: PUT /api/leads/:id/items — Update quotation items & sync to costing
router.put('/:id/items', async (req, res) => {
    try {
        const { items: incomingItems } = req.body;
        if (!incomingItems || !Array.isArray(incomingItems)) {
            return res.status(400).json({ error: 'items array is required' });
        }

        const existing = await Lead.findOne({ id: req.params.id }).lean();
        if (!existing) return res.status(404).json({ error: 'Lead not found' });

        // Update quotation items (quantity, unitPrice)
        const updatedQuotationItems = incomingItems.map(incoming => {
            const existingItem = (existing.items || []).find(i => i.id === incoming.id);
            return {
                ...(existingItem || {}),
                ...incoming,
                // Preserve unitCost from costing if it exists
                unitCost: existingItem?.unitCost || incoming.unitCost || 0,
            };
        });

        // Sync changes to costingItems
        const updatedCostingItems = (existing.costingItems || []).map(costingItem => {
            const quotationItem = updatedQuotationItems.find(q => q.id === costingItem._itemId || q._costingItemId === costingItem.id);
            if (quotationItem) {
                return {
                    ...costingItem,
                    quantity: quotationItem.quantity,
                    price: quotationItem.unitPrice,
                };
            }
            return costingItem;
        });

        // Create costingItems for new quotation items
        const newQuotationItems = updatedQuotationItems.filter(q =>
            !existing.costingItems?.some(c => c._itemId === q.id)
        );
        newQuotationItems.forEach(qItem => {
            updatedCostingItems.push({
                id: qItem.id,
                name: qItem.description,
                quantity: qItem.quantity,
                price: qItem.unitPrice,
                baseCost: qItem.unitCost || 0,
                costStatus: 'pending',
                _itemId: qItem.id,
                _lastSyncedAt: new Date(),
            });
        });

        // Log sync
        const syncLog = {
            timestamp: new Date(),
            direction: 'quote_to_costing',
            itemIds: updatedQuotationItems.map(i => i.id),
            changes: { updatedItems: updatedQuotationItems.length, newItems: newQuotationItems.length },
            userId: req.user?.id || 'system',
        };

        // Recalculate lead.value from updated items
        const recalculatedValue = updatedQuotationItems.reduce((sum, item) => sum + (item.total || 0), 0);

        const doc = await Lead.findOneAndUpdate(
            { id: req.params.id },
            { $set: {
                items: updatedQuotationItems,
                value: recalculatedValue,
                costingItems: updatedCostingItems,
                costingSyncLog: [syncLog, ...(existing.costingSyncLog || [])],
            } },
            { new: true, lean: true }
        );
        if (!doc) return res.status(404).json({ error: 'Lead not found' });

        const { _id, __v, createdAt, updatedAt, ...rest } = doc;
        logAudit({ entityType: 'lead', entityId: req.params.id, action: 'items_updated_from_quotation', userId: req.user?.id || 'system', changes: { itemCount: updatedQuotationItems.length } });
        emitCollectionChange('leads', 'updated', rest);

        res.json({
            success: true,
            lead: rest,
            syncLog: {
                direction: 'quote_to_costing',
                itemsAffected: updatedQuotationItems.length,
            }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Endpoint: GET /api/leads/:id/cost-sync-status — Check sync status
router.get('/:id/cost-sync-status', async (req, res) => {
    try {
        const doc = await Lead.findOne({ id: req.params.id }).lean();
        if (!doc) return res.status(404).json({ error: 'Lead not found' });

        const quotationItems = doc.items || [];
        const costingItems = doc.costingItems || [];
        const syncLog = doc.costingSyncLog || [];

        // Check if items are in sync
        const inSync = quotationItems.every(qItem => {
            const costingItem = costingItems.find(c => c._itemId === qItem.id);
            if (!costingItem) return false;
            return qItem.quantity === costingItem.quantity &&
                   qItem.unitPrice === costingItem.price;
        });

        const lastSync = syncLog[0] || null;

        res.json({
            inSync,
            lastSync: lastSync?.timestamp || null,
            lastSyncDirection: lastSync?.direction || null,
            itemsInQuotation: quotationItems.length,
            itemsInCosting: costingItems.length,
            pendingApproval: costingItems.filter(c => c.costStatus !== 'approved').length,
            budgetedCost: doc.budgetedCost || 0,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
