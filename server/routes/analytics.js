/**
 * Pipeline Analytics — MongoDB aggregation endpoints.
 * GET /api/analytics/pipeline?year=2025
 */
import { Router } from 'express';
import Lead from '../models/Lead.js';

const router = Router();

router.get('/pipeline', async (req, res) => {
    try {
        const yearFilter = req.query.year ? parseInt(req.query.year) : null;

        const baseMatch = { deleted: { $ne: true } };
        if (yearFilter) {
            baseMatch.expectedCloseDate = {
                $gte: `${yearFilter}-01-01`,
                $lte: `${yearFilter}-12-31`,
            };
        }

        const [
            stageCounts,
            winLoss,
            avgDaysPerStage,
            monthlyForecast,
            topManufacturers,
            lossReasons,
        ] = await Promise.all([

            // 1. Funnel — count + total value per stage
            Lead.aggregate([
                { $match: baseMatch },
                { $group: {
                    _id: '$stage',
                    count: { $sum: 1 },
                    totalValue: { $sum: { $ifNull: ['$value', 0] } },
                    avgProbability: { $avg: { $ifNull: ['$probability', 0] } },
                }},
            ]),

            // 2. Win/Loss ratio
            Lead.aggregate([
                { $match: { ...baseMatch, stage: { $in: ['closed-won', 'closed-lost'] } } },
                { $group: {
                    _id: '$stage',
                    count: { $sum: 1 },
                    totalValue: { $sum: { $ifNull: ['$closedValue', '$value', 0] } },
                }},
            ]),

            // 3. Average days per stage (from stageHistory)
            Lead.aggregate([
                { $match: baseMatch },
                { $unwind: '$stageHistory' },
                { $match: { 'stageHistory.exitedAt': { $ne: null } } },
                { $group: {
                    _id: '$stageHistory.stage',
                    avgDays: { $avg: '$stageHistory.daysInStage' },
                    count: { $sum: 1 },
                }},
            ]),

            // 4. Monthly forecast — expected revenue by close month
            Lead.aggregate([
                { $match: {
                    ...baseMatch,
                    stage: { $nin: ['closed-won', 'closed-lost'] },
                    expectedCloseDate: { $exists: true, $ne: '' },
                }},
                { $addFields: {
                    closeDateParsed: { $dateFromString: { dateString: '$expectedCloseDate', onError: null } },
                    weightedValue: { $multiply: [
                        { $ifNull: ['$value', 0] },
                        { $divide: [{ $ifNull: ['$probability', 0] }, 100] }
                    ]},
                }},
                { $match: { closeDateParsed: { $ne: null } } },
                { $group: {
                    _id: {
                        year:  { $year: '$closeDateParsed' },
                        month: { $month: '$closeDateParsed' },
                    },
                    weightedValue: { $sum: '$weightedValue' },
                    totalValue:    { $sum: '$value' },
                    count:         { $sum: 1 },
                }},
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),

            // 5. Win rate by manufacturer
            Lead.aggregate([
                { $match: { stage: { $in: ['closed-won', 'closed-lost'] }, manufacturer: { $exists: true, $ne: '' } } },
                { $group: {
                    _id: '$manufacturer',
                    won:  { $sum: { $cond: [{ $eq: ['$stage', 'closed-won'] }, 1, 0] } },
                    lost: { $sum: { $cond: [{ $eq: ['$stage', 'closed-lost'] }, 1, 0] } },
                    totalValue: { $sum: { $ifNull: ['$closedValue', '$value', 0] } },
                }},
                { $sort: { totalValue: -1 } },
                { $limit: 10 },
            ]),

            // 6. Loss reasons breakdown
            Lead.aggregate([
                { $match: { deleted: { $ne: true }, stage: 'closed-lost', lostReason: { $exists: true, $ne: '' } } },
                { $group: { _id: '$lostReason', count: { $sum: 1 }, totalValue: { $sum: { $ifNull: ['$value', 0] } } } },
                { $sort: { count: -1 } },
            ]),
        ]);

        // Compute win rate
        const wonCount  = winLoss.find(d => d._id === 'closed-won')?.count  || 0;
        const lostCount = winLoss.find(d => d._id === 'closed-lost')?.count || 0;
        const winRate   = wonCount + lostCount > 0
            ? Math.round((wonCount / (wonCount + lostCount)) * 100)
            : null;

        res.json({
            stageCounts,
            winLoss: { won: wonCount, lost: lostCount, winRate },
            avgDaysPerStage,
            monthlyForecast,
            topManufacturers,
            lossReasons,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
