/**
 * Operations section of the financial balance report.
 *
 * Exports: computeOperations(db, params) → { consultantUtilization, billableHourCost, underutilized, overutilized }
 */
import Project from '../../../models/Project.js';
import User from '../../../models/User.js';

// Standard: 160 billable hours/month (8h × 20 days)
const STANDARD_MONTHLY_HOURS = 160;

export async function computeOperations(_db, params) {
  const { from, to } = params;

  const fromTs = from.getTime();
  const toTs = to.getTime();
  const monthsInRange = Math.max(1, Math.round((toTs - fromTs) / (30 * 86400000)));

  const projects = await Project.find({}).lean();
  const users = await User.find({}).lean();

  const consultantMap = {};
  for (const u of users) {
    if (u.role === 'consultant' || u.hourlyCost > 0) {
      consultantMap[u.id] = {
        id: u.id,
        name: u.name,
        hourlyCost: u.hourlyCost || 0,
        monthlySalary: u.monthlySalary || 0,
        billableHours: 0,
        totalHours: 0,
        revenue: 0,
      };
    }
  }

  // Aggregate timeLogs from all projects within the date range
  for (const project of projects) {
    const timeLogs = project.timeLogs || [];
    for (const log of timeLogs) {
      if (log.status !== 'approved' && log.status !== 'paid') continue;

      const logDate = log.date ? new Date(log.date) : null;
      if (!logDate || logDate < from || logDate > to) continue;

      const consultantId = log.odooEmployeeId || log.odooConsultantId || log.consultantId || log.userId;
      if (!consultantId) continue;

      // Auto-register consultants found in logs but not in User collection
      if (!consultantMap[consultantId]) {
        consultantMap[consultantId] = {
          id: consultantId,
          name: log.consultantName || consultantId,
          hourlyCost: 0,
          monthlySalary: 0,
          billableHours: 0,
          totalHours: 0,
          revenue: 0,
        };
      }

      const hours = log.hours || 0;
      const rate = (project.consultantRates && project.consultantRates[consultantId]) || 0;

      consultantMap[consultantId].totalHours += hours;
      if (log.isBillable !== false) {
        consultantMap[consultantId].billableHours += hours;
        consultantMap[consultantId].revenue += hours * rate;
      }
    }
  }

  const availableHours = STANDARD_MONTHLY_HOURS * monthsInRange;

  const consultantUtilization = Object.values(consultantMap).map(c => {
    const utilPct = availableHours > 0 ? Math.round((c.billableHours / availableHours) * 100) : 0;
    const effectiveHourlyCost = c.billableHours > 0
      ? (c.monthlySalary * monthsInRange) / c.billableHours
      : 0;

    return {
      consultantId: c.id,
      name: c.name,
      billableHours: c.billableHours,
      totalHours: c.totalHours,
      availableHours,
      utilizationPct: utilPct,
      hourlyCost: c.hourlyCost,
      effectiveHourlyCost: Math.round(effectiveHourlyCost * 100) / 100,
      revenue: c.revenue,
    };
  }).sort((a, b) => b.billableHours - a.billableHours);

  // Global billable hour cost
  const totalSalaries = Object.values(consultantMap).reduce((s, c) => s + c.monthlySalary * monthsInRange, 0);
  const totalBillableHours = Object.values(consultantMap).reduce((s, c) => s + c.billableHours, 0);
  const billableHourCost = totalBillableHours > 0 ? Math.round(totalSalaries / totalBillableHours * 100) / 100 : 0;

  // Under/over-utilized (thresholds: <50% underutilized, >90% overutilized)
  const underutilized = consultantUtilization
    .filter(c => c.utilizationPct < 50 && c.availableHours > 0)
    .map(c => ({ name: c.name, utilizationPct: c.utilizationPct, billableHours: c.billableHours }));

  const overutilized = consultantUtilization
    .filter(c => c.utilizationPct > 90)
    .map(c => ({ name: c.name, utilizationPct: c.utilizationPct, billableHours: c.billableHours }));

  return {
    consultantUtilization,
    billableHourCost,
    underutilized,
    overutilized,
  };
}
