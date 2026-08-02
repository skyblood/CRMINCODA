/**
 * Margins section of the financial balance report.
 *
 * Exports: computeMargins(db, params) → { byServiceLine, byTopClients, byActiveProject }
 */
import Invoice from '../../../models/Invoice.js';
import Project from '../../../models/Project.js';
import Lead from '../../../models/Lead.js';
import Transaction from '../../../models/Transaction.js';

/**
 * Calculates sold value for a project.
 * Mirrors ProfitabilityReport.tsx logic:
 *   1. Use project.value if stored at creation time
 *   2. Fallback: recalculate from lead items matching the project type
 *   3. Final fallback: lead.closedValue or lead.value
 */
function calcSoldValue(project, lead) {
  // Prefer project-level value (set at project creation, avoids double-counting
  // when multiple projects share the same lead)
  if (project.value) return project.value;

  if (!lead) return 0;

  const typeCategories = {
    implementation: ['implementation'],
    license: ['license'],
    support: ['vendor_support', 'incoda_support'],
    hours_pack: ['hours_pack'],
  };
  const matchingCats = typeCategories[project.type] || [];

  if (lead.items?.length && matchingCats.length) {
    const matching = lead.items.filter(i => matchingCats.includes(i.category));
    if (matching.length) {
      let total = 0;
      for (const item of matching) {
        if (item.category === 'license') {
          const cost = item.costPrice || item.unitCost || 0;
          const sell = item.sellPrice || item.unitPrice || 0;
          total += (sell - cost) * (item.quantity || 1);
        } else {
          total += (item.total || (item.sellPrice || item.unitPrice || 0) * (item.quantity || 1));
        }
      }
      if (total > 0) return total;
    }
  }

  return lead.closedValue || lead.value || 0;
}

/**
 * Calculates labor cost from project timeLogs
 */
function calcLaborCost(project) {
  const timeLogs = project.timeLogs || [];
  let cost = 0;
  for (const log of timeLogs) {
    if (log.status === 'approved' || log.status === 'paid') {
      const consultantId = log.odooEmployeeId || log.odooConsultantId || log.consultantId || log.userId;
      const rate = (project.consultantRates && project.consultantRates[consultantId]) || 0;
      cost += (log.hours || 0) * rate;
    }
  }
  return cost;
}

export async function computeMargins(_db, params) {
  const { from, to } = params;

  const projects = await Project.find({}).lean();
  const leads = await Lead.find({}).lean();
  const expenses = await Transaction.find({
    type: 'expense',
    dateObj: { $gte: from, $lte: to },
  }).lean();

  const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));
  const expenseByProject = {};
  for (const e of expenses) {
    const key = e.projectId || '_unassigned';
    expenseByProject[key] = (expenseByProject[key] || 0) + (e.amountUSD || e.amount || 0);
  }

  // Build per-project profitability
  const projectData = projects.map(project => {
    const lead = leadMap[project.leadId];
    const soldValue = calcSoldValue(project, lead);
    const laborCost = calcLaborCost(project);
    const projectExpenses = (expenseByProject[project.id] || 0);
    const totalCost = laborCost + projectExpenses;
    const margin = soldValue - totalCost;
    const marginPct = soldValue > 0 ? (margin / soldValue) * 100 : 0;

    return {
      projectId: project.id,
      projectName: project.name,
      clientName: project.clientName,
      type: project.type || 'implementation',
      status: project.status,
      soldValue,
      laborCost,
      expenses: projectExpenses,
      totalCost,
      margin,
      marginPct,
    };
  });

  // ── By Service Line ────────────────────────────────────────────────────
  const serviceLineMap = {};
  for (const p of projectData) {
    const line = p.type.toLowerCase();
    if (!serviceLineMap[line]) {
      serviceLineMap[line] = { serviceLine: line, revenue: 0, cost: 0, margin: 0, projectCount: 0 };
    }
    serviceLineMap[line].revenue += p.soldValue;
    serviceLineMap[line].cost += p.totalCost;
    serviceLineMap[line].margin += p.margin;
    serviceLineMap[line].projectCount++;
  }
  const byServiceLine = Object.values(serviceLineMap).map(sl => ({
    ...sl,
    marginPct: sl.revenue > 0 ? Math.round(sl.margin / sl.revenue * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue);

  // ── By Top Clients ─────────────────────────────────────────────────────
  const clientMap = Object.create(null);
  for (const p of projectData) {
    const key = p.clientName;
    if (!clientMap[key]) {
      clientMap[key] = { clientName: key, revenue: 0, cost: 0, margin: 0, projectCount: 0 };
    }
    clientMap[key].revenue += p.soldValue;
    clientMap[key].cost += p.totalCost;
    clientMap[key].margin += p.margin;
    clientMap[key].projectCount++;
  }
  const byTopClients = Object.values(clientMap).map(c => ({
    ...c,
    marginPct: c.revenue > 0 ? Math.round(c.margin / c.revenue * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // ── By Active Project ──────────────────────────────────────────────────
  const byActiveProject = projectData
    .filter(p => p.status === 'active')
    .sort((a, b) => b.soldValue - a.soldValue)
    .slice(0, 15)
    .map(p => ({
      projectId: p.projectId,
      projectName: p.projectName,
      clientName: p.clientName,
      type: p.type,
      revenue: p.soldValue,
      cost: p.totalCost,
      margin: p.margin,
      marginPct: Math.round(p.marginPct),
    }));

  return { byServiceLine, byTopClients, byActiveProject };
}
