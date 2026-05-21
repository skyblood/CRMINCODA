/**
 * Pipeline section of the financial balance report.
 *
 * Exports: computePipeline(db, params) → { velocity, quoteToInvoiceConversion, weightedPipelineValue, expectedNextQuarter }
 */
import Lead from '../../../models/Lead.js';
import Invoice from '../../../models/Invoice.js';

// Stage → probability mapping (standard sales pipeline)
const STAGE_PROBABILITY = {
  new: 0.05,
  contacted: 0.10,
  qualified: 0.20,
  proposal: 0.40,
  negotiation: 0.60,
  closed_won: 1.0,
  closed_lost: 0,
};

export async function computePipeline(_db, params) {
  const { from, to } = params;

  const leads = await Lead.find({ deleted: { $ne: true } }).lean();

  // ── Velocity ───────────────────────────────────────────────────────────
  // Average days from lead creation to closed_won, for leads closed in the period
  const wonLeads = leads.filter(l => {
    if (l.stage !== 'closed_won') return false;
    const closeDate = l.closedAt || l.updatedAt;
    return closeDate && new Date(closeDate) >= from && new Date(closeDate) <= to;
  });

  let velocity = 0;
  if (wonLeads.length > 0) {
    const totalDays = wonLeads.reduce((sum, l) => {
      const created = new Date(l.createdAt);
      const closed = new Date(l.closedAt || l.updatedAt);
      return sum + Math.max(0, (closed - created) / 86400000);
    }, 0);
    velocity = Math.round(totalDays / wonLeads.length);
  }

  // ── Quote to Invoice Conversion ────────────────────────────────────────
  // Leads that reached negotiation or beyond in the period
  const qualifiedStages = ['proposal', 'negotiation', 'closed_won', 'closed_lost'];
  const quotedLeads = leads.filter(l => {
    const hasItems = l.items?.length > 0;
    return hasItems && qualifiedStages.includes(l.stage);
  });

  const invoicedLeads = leads.filter(l => l.stage === 'closed_won');
  const quoteToInvoiceConversion = quotedLeads.length > 0
    ? Math.round((invoicedLeads.length / quotedLeads.length) * 100)
    : 0;

  // ── Weighted Pipeline Value ────────────────────────────────────────────
  const activeStages = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];
  const pipelineLeads = leads.filter(l => activeStages.includes(l.stage));

  let weightedPipelineValue = 0;
  const pipelineByStage = {};

  for (const lead of pipelineLeads) {
    const value = lead.value || 0;
    const prob = STAGE_PROBABILITY[lead.stage] || 0;
    const weighted = value * prob;
    weightedPipelineValue += weighted;

    if (!pipelineByStage[lead.stage]) {
      pipelineByStage[lead.stage] = { stage: lead.stage, count: 0, totalValue: 0, weightedValue: 0 };
    }
    pipelineByStage[lead.stage].count++;
    pipelineByStage[lead.stage].totalValue += value;
    pipelineByStage[lead.stage].weightedValue += weighted;
  }

  weightedPipelineValue = Math.round(weightedPipelineValue);

  // ── Expected Next Quarter ──────────────────────────────────────────────
  // Leads with expectedCloseDate in the next 90 days, weighted by probability
  const now = new Date();
  const next90 = new Date(now.getTime() + 90 * 86400000);

  const expectedNextQuarter = pipelineLeads
    .filter(l => {
      if (!l.expectedCloseDate) return false;
      const d = new Date(l.expectedCloseDate);
      return d >= now && d <= next90;
    })
    .reduce((sum, l) => {
      const prob = STAGE_PROBABILITY[l.stage] || 0;
      return sum + (l.value || 0) * prob;
    }, 0);

  return {
    velocity,
    quoteToInvoiceConversion,
    weightedPipelineValue,
    pipelineByStage: Object.values(pipelineByStage),
    expectedNextQuarter: Math.round(expectedNextQuarter),
    activeDeals: pipelineLeads.length,
    wonInPeriod: wonLeads.length,
  };
}
