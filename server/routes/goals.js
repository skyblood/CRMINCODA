import { Router } from 'express';
import Goal from '../models/Goal.js';

const router = Router();

// GET ALL - Retorna como objeto { year: amount }
router.get('/', async (_req, res) => {
    try {
        const docs = await Goal.find().lean();
        const goalsObj = {};
        docs.forEach(g => { goalsObj[g.year] = g.amount; });
        res.json(goalsObj);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE/UPSERT - Recibe { year: amount, year2: amount2 }
router.put('/', async (req, res) => {
    try {
        for (const [year, amount] of Object.entries(req.body)) {
            await Goal.findOneAndUpdate(
                { year: parseInt(year) },
                { year: parseInt(year), amount },
                { upsert: true }
            );
        }
        // Retornar estado actualizado
        const docs = await Goal.find().lean();
        const goalsObj = {};
        docs.forEach(g => { goalsObj[g.year] = g.amount; });
        res.json(goalsObj);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

export default router;
