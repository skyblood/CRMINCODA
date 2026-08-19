/**
 * AI Reports — Anthropic Claude (server-side).
 * Keeps ANTHROPIC_API_KEY secure; frontend never sees it.
 *
 * POST /api/ai/risk-report    → project risk analysis
 * POST /api/ai/sales-forecast → pipeline revenue forecast
 */
import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import Lead from '../models/Lead.js';

const router = Router();

let client = null;
export const getClient = () => {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
};

// ─── PROJECT RISK REPORT ──────────────────────────────────────────────────────
router.post('/risk-report', async (req, res) => {
    const project = req.body;
    if (!project || !project.id) return res.status(400).json({ error: 'Project data required' });

    const ai = getClient();
    if (!ai) return res.status(503).json({ error: 'AI not configured — set ANTHROPIC_API_KEY' });

    try {
        const tasks = project.tasks || [];
        const timeLogs = project.timeLogs || [];
        const tickets = project.tickets || [];

        const totalTasks = tasks.length;
        const doneTasks = tasks.filter(t => t.status === 'done').length;
        const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

        const loggedHours = timeLogs.reduce((s, l) => s + (l.hours || 0), 0);
        const budgetHours = project.totalBudgetHours || 0;
        const burnPct = budgetHours > 0 ? Math.round((loggedHours / budgetHours) * 100) : 0;

        // Clean Cut: fetch from Invoice/Payment collections instead of project.payments
        const Payment = (await import('../models/Payment.js')).default;
        const Invoice = (await import('../models/Invoice.js')).default;
        const projectInvoices = await Invoice.find({ projectId: project.id || project._id?.toString() }).lean();
        const invoiceIds = projectInvoices.map(inv => inv._id.toString());
        const projectPayments = invoiceIds.length > 0
            ? await Payment.aggregate([
                { $unwind: '$appliedTo' },
                { $match: { 'appliedTo.invoiceId': { $in: invoiceIds } } },
                { $group: { _id: null, total: { $sum: '$appliedTo.amountApplied' } } },
            ])
            : [];
        const totalReceived = projectPayments[0]?.total || 0;

        const daysSinceStart = project.startDate
            ? Math.floor((Date.now() - new Date(project.startDate).getTime()) / 86_400_000)
            : null;

        const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in-progress').length;

        const prompt = `You are a senior project manager analyzing risk for a B2B technology services project. Provide a concise but actionable risk report in clear, plain language (no markdown headers, just paragraphs).

Project data:
- Name: ${project.name}
- Client: ${project.clientName}
- Type: ${project.type}
- Status: ${project.status}
- Days since start: ${daysSinceStart ?? 'unknown'}
- Team size: ${(project.team || []).length} people (${(project.team || []).join(', ') || 'unassigned'})

Progress:
- Tasks: ${doneTasks}/${totalTasks} done (${completionPct}%)
- Hours logged: ${loggedHours.toFixed(1)} / ${budgetHours} budgeted (${burnPct}% burn)

Financial:
- Payments received: $${totalReceived.toLocaleString()}
- Factory commission: ${project.factoryCommissionRate || 0}%

${tickets.length > 0 ? `Support tickets: ${openTickets} open / ${tickets.length} total` : ''}

Analyze:
1. RISK LEVEL: Overall risk (Low / Medium / High / Critical) with a 1-sentence justification.
2. SCHEDULE RISK: Is the project on track? Any overrun signs?
3. BUDGET RISK: Is the team burning hours too fast or slow relative to progress?
4. TEAM RISK: Any concerns about team size or assignment?
5. TOP 3 RECOMMENDATIONS: Concrete actions the PM should take this week.

Keep the full report under 350 words. Be direct and specific.`;

        const message = await ai.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            messages: [{ role: 'user', content: prompt }],
        });

        const report = message.content[0].text.trim();
        res.json({ report });
    } catch (err) {
        console.error('[AI Risk Report] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── SALES FORECAST ───────────────────────────────────────────────────────────
router.post('/sales-forecast', async (req, res) => {
    const { leads } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) {
        return res.status(400).json({ error: 'leads array required' });
    }

    const ai = getClient();
    if (!ai) return res.status(503).json({ error: 'AI not configured — set ANTHROPIC_API_KEY' });

    try {
        const activeLeads = leads.filter(l => !['closed-won', 'closed-lost'].includes(l.stage));
        const totalPipeline = activeLeads.reduce((s, l) => s + (l.value || 0), 0);
        const weightedValue = activeLeads.reduce((s, l) => s + (l.value || 0) * ((l.probability || 0) / 100), 0);

        const byStage = activeLeads.reduce((acc, l) => {
            acc[l.stage] = (acc[l.stage] || 0) + 1;
            return acc;
        }, {});

        const staleLeads = activeLeads.filter(l => {
            if (!l.interactions?.length) return true;
            const last = new Date(l.interactions[l.interactions.length - 1].date);
            return (Date.now() - last.getTime()) > 14 * 86_400_000;
        }).length;

        const prompt = `You are a B2B sales forecasting analyst. Analyze this pipeline and provide a concise forecast. Plain text only, no markdown.

Pipeline snapshot (${activeLeads.length} active opportunities):
- Total pipeline value: $${totalPipeline.toLocaleString()}
- Weighted pipeline (probability-adjusted): $${Math.round(weightedValue).toLocaleString()}
- Stage distribution: ${Object.entries(byStage).map(([k, v]) => `${v} in ${k}`).join(', ')}
- Stale leads (no activity 14+ days): ${staleLeads}

Provide:
1. FORECAST: Expected revenue for the next 30/60/90 days (use the weighted values as baseline).
2. PIPELINE HEALTH: Overall assessment (Healthy / At Risk / Critical) with reason.
3. KEY RISKS: Top 2 risks that could miss the forecast.
4. TOP ACTION: The single most impactful thing to do this week to improve the forecast.

Keep under 250 words. Be specific with numbers.`;

        const message = await ai.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 450,
            messages: [{ role: 'user', content: prompt }],
        });

        const forecast = message.content[0].text.trim();
        res.json({ forecast });
    } catch (err) {
        console.error('[AI Sales Forecast] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── PIPELINE FORECAST (shared logic) ─────────────────────────────────────────
export async function computePipelineForecast(ai) {
    const ACTIVE = ['prospect', 'qualification', 'presentation', 'proposal', 'negotiation'];
    const CLOSED = ['closed-won', 'closed-lost'];

    const [activeLeads, closedLeads] = await Promise.all([
        Lead.find({ deleted: { $ne: true }, stage: { $in: ACTIVE } }).lean(),
        Lead.find({
            deleted: { $ne: true },
            stage: { $in: CLOSED },
            updatedAt: { $gte: new Date(Date.now() - 365 * 86_400_000) },
        }).lean(),
    ]);

    const totalPipeline = activeLeads.reduce((s, l) => s + (l.value || 0), 0);
    const weightedPipeline = activeLeads.reduce((s, l) => s + (l.value || 0) * ((l.probability || 0) / 100), 0);

    const won = closedLeads.filter(l => l.stage === 'closed-won').length;
    const lost = closedLeads.filter(l => l.stage === 'closed-lost').length;
    const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;

    const wonRevenue = closedLeads
        .filter(l => l.stage === 'closed-won')
        .reduce((s, l) => s + (l.closedValue || l.value || 0), 0);

    const byStage = ACTIVE.map(s => ({
        stage: s,
        count: activeLeads.filter(l => l.stage === s).length,
        value: activeLeads.filter(l => l.stage === s).reduce((a, l) => a + (l.value || 0), 0),
    })).filter(s => s.count > 0);

    const now = Date.now();
    const closing30 = activeLeads.filter(l => l.expectedCloseDate && (new Date(l.expectedCloseDate).getTime() - now) <= 30 * 86_400_000 && (new Date(l.expectedCloseDate).getTime() - now) > 0);
    const closing60 = activeLeads.filter(l => l.expectedCloseDate && (new Date(l.expectedCloseDate).getTime() - now) <= 60 * 86_400_000 && (new Date(l.expectedCloseDate).getTime() - now) > 0);
    const closing90 = activeLeads.filter(l => l.expectedCloseDate && (new Date(l.expectedCloseDate).getTime() - now) <= 90 * 86_400_000 && (new Date(l.expectedCloseDate).getTime() - now) > 0);

    const stale = activeLeads.filter(l => {
        if (!l.interactions?.length) return true;
        const last = new Date(l.interactions[l.interactions.length - 1].date);
        return (now - last.getTime()) > 14 * 86_400_000;
    }).length;

    const prompt = `You are a B2B revenue forecasting analyst. Analyze this pipeline data and produce a structured forecast.

PIPELINE SNAPSHOT (${activeLeads.length} active deals):
- Total pipeline value: $${Math.round(totalPipeline).toLocaleString()}
- Probability-weighted value: $${Math.round(weightedPipeline).toLocaleString()}
- Historical win rate (last 12 months): ${winRate !== null ? winRate + '%' : 'insufficient data'} (${won} won / ${lost} lost)
- Revenue closed last 12 months: $${Math.round(wonRevenue).toLocaleString()}
- Stale deals (no activity 14+ days): ${stale} / ${activeLeads.length}

Stage distribution:
${byStage.map(s => `  ${s.stage}: ${s.count} deals, $${Math.round(s.value / 1000)}K`).join('\n')}

Closing within timeframes:
- Next 30 days: ${closing30.length} deals worth $${Math.round(closing30.reduce((s, l) => s + (l.value || 0), 0) / 1000)}K
- Next 60 days: ${closing60.length} deals worth $${Math.round(closing60.reduce((s, l) => s + (l.value || 0), 0) / 1000)}K
- Next 90 days: ${closing90.length} deals worth $${Math.round(closing90.reduce((s, l) => s + (l.value || 0), 0) / 1000)}K

Apply the historical win rate to the closing-period values to estimate likely revenue. If insufficient data, use weighted values with a 10-15% haircut.

Respond ONLY with valid JSON, no markdown:
{
  "health": "Healthy|At Risk|Critical",
  "d30": <integer USD>,
  "d60": <integer USD>,
  "d90": <integer USD>,
  "narrative": "<2-3 sentences summarizing the forecast outlook>",
  "topRisk": "<1 sentence — biggest risk to hitting the forecast>",
  "topAction": "<1 imperative sentence — most impactful action this week>"
}`;

    const message = await ai.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text.trim().replace(/^```json\s*|^```\s*|```$/gm, '').trim();
    const parsed = JSON.parse(raw);

    return {
        health: parsed.health || 'At Risk',
        d30: Math.max(0, parseInt(parsed.d30) || 0),
        d60: Math.max(0, parseInt(parsed.d60) || 0),
        d90: Math.max(0, parseInt(parsed.d90) || 0),
        narrative: String(parsed.narrative || ''),
        topRisk: String(parsed.topRisk || ''),
        topAction: String(parsed.topAction || ''),
        meta: { activeDeals: activeLeads.length, weightedPipeline: Math.round(weightedPipeline), winRate },
        generatedAt: new Date().toISOString(),
    };
}

router.get('/pipeline-forecast', async (req, res) => {
    const ai = getClient();
    if (!ai) return res.status(503).json({ error: 'AI not configured — set ANTHROPIC_API_KEY' });

    try {
        const forecast = await computePipelineForecast(ai);
        res.json(forecast);
    } catch (err) {
        console.error('[AI Pipeline Forecast] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── EMAIL DRAFT ──────────────────────────────────────────────────────────────
router.post('/email-draft', async (req, res) => {
    const { companyName, contactName, stage, nextStep, value, expectedCloseDate, recentActivities } = req.body;
    if (!companyName) return res.status(400).json({ error: 'companyName required' });

    const ai = getClient();
    if (!ai) return res.status(503).json({ error: 'AI not configured — set ANTHROPIC_API_KEY' });

    try {
        const activitiesSummary = (recentActivities || [])
            .slice(0, 5)
            .map(a => `- [${a.type}] ${a.note}`)
            .join('\n') || 'No recent activity logged.';

        const prompt = `You are a B2B sales professional writing a follow-up email. Write a concise, professional email in the same language the sales context suggests (use Spanish if names/company suggest Latin American market).

Lead context:
- Company: ${companyName}
- Contact: ${contactName || 'unknown'}
- Pipeline stage: ${stage}
- Deal value: ${value ? `$${Number(value).toLocaleString()}` : 'unknown'}
- Expected close: ${expectedCloseDate || 'not set'}
- Next step: ${nextStep || 'not defined'}

Recent activity:
${activitiesSummary}

Write a follow-up email that:
1. References the last interaction naturally
2. Moves the deal forward based on the current stage
3. Has a clear, specific call-to-action aligned to the next step
4. Is brief (under 150 words)
5. Uses a warm but professional tone

Output ONLY the email body — no subject line, no labels, no explanation. Start directly with the greeting.`;

        const message = await ai.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 400,
            messages: [{ role: 'user', content: prompt }],
        });

        const draft = message.content[0].text.trim();
        res.json({ draft });
    } catch (err) {
        console.error('[AI Email Draft] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
