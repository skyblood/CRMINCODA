import { Router } from 'express';
import SKU from '../models/SKU.js';
import { createCrudRouter } from './crud.js';

const router = Router();

// Generic CRUD endpoints
const crudRouter = createCrudRouter(SKU);
router.use('/', crudRouter);

// Endpoint 1A: PATCH /api/skus/:id/costing — Update suggested base cost
router.patch('/:id/costing', async (req, res) => {
    try {
        const { suggestedBaseCost, costUnit, costNotes, costLastUpdatedBy } = req.body;

        // Validate RBAC (only admin, sales_manager, finance can edit costing)
        // For now, allow all (TODO: add session.user.role check)

        // Validation: suggestedBaseCost
        if (suggestedBaseCost !== undefined && suggestedBaseCost !== null) {
            const cost = parseFloat(suggestedBaseCost);
            if (isNaN(cost)) {
                return res.status(400).json({ error: 'suggestedBaseCost must be a valid number' });
            }
            if (cost < 0 || cost > 100000) {
                return res.status(400).json({ error: 'Cost must be between 0 and 100,000' });
            }
        }

        // Validation: costUnit enum
        const validCostUnits = ['hora', 'licencia', 'fijo'];
        if (costUnit !== undefined && costUnit !== null && !validCostUnits.includes(costUnit)) {
            return res.status(400).json({ error: `costUnit must be one of: ${validCostUnits.join(', ')}` });
        }

        const updateData = {};
        if (suggestedBaseCost !== undefined) updateData.suggestedBaseCost = parseFloat(suggestedBaseCost);
        if (costUnit !== undefined) updateData.costUnit = costUnit;
        if (costNotes !== undefined) updateData.costNotes = costNotes;
        updateData.costLastUpdatedAt = new Date();
        if (costLastUpdatedBy) updateData.costLastUpdatedBy = costLastUpdatedBy;

        const doc = await SKU.findOneAndUpdate(
            { id: req.params.id },
            { $set: updateData },
            { new: true, lean: true }
        );
        if (!doc) return res.status(404).json({ error: 'SKU not found' });

        const { _id, __v, ...rest } = doc;
        res.json(rest);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

export default router;
