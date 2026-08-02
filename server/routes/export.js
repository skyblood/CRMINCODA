import { Router } from 'express';
import Transaction from '../models/Transaction.js';
import Project from '../models/Project.js';
import Lead from '../models/Lead.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';

const router = Router();

// Admin guard
router.use((req, res, next) => {
  if (!req.session?.user?.permissions?.admin) return res.status(403).json({ error: 'Admin required' });
  next();
});

// Helper: convert rows to CSV string
function toCSV(headers, rows) {
  const escape = (val) => {
    const s = val == null ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(','));
  }
  return '\uFEFF' + lines.join('\n');
}

function setCsvHeaders(res, filename) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
}

// GET /api/export/finance/expenses
router.get('/finance/expenses', async (req, res) => {
  try {
    const { year, month } = req.query;
    const query = { type: 'expense' };
    if (year || month) {
      // filter by date string prefix
      const prefix = year && month
        ? `${year}-${String(month).padStart(2, '0')}`
        : year || '';
      if (prefix) query.date = { $regex: `^${prefix}` };
    }
    const docs = await Transaction.find(query).lean();
    const headers = ['date', 'category', 'title', 'amount', 'description', 'projectId'];
    const rows = docs.map(d => ({
      date: d.date || '',
      category: d.category || '',
      title: d.title || '',
      amount: d.amount || 0,
      description: d.description || '',
      projectId: d.projectId || ''
    }));
    setCsvHeaders(res, 'expenses.csv');
    res.send(toCSV(headers, rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/finance/pl
router.get('/finance/pl', async (req, res) => {
  try {
    const { year, month } = req.query;
    const matchStage = {};
    if (year || month) {
      const prefix = year && month
        ? `${year}-${String(month).padStart(2, '0')}`
        : year || '';
      if (prefix) matchStage.date = { $regex: `^${prefix}` };
    }
    const docs = await Transaction.find(matchStage).lean();

    // Group by year-month
    const byMonth = {};
    for (const d of docs) {
      const key = (d.date || '').slice(0, 7) || 'unknown';
      if (!byMonth[key]) byMonth[key] = { income: 0, expenses: 0 };
      if (d.type === 'income') byMonth[key].income += d.amount || 0;
      else if (d.type === 'expense') byMonth[key].expenses += d.amount || 0;
    }

    const headers = ['month', 'income', 'expenses', 'margin', 'margin_pct'];
    const rows = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => {
      const margin = v.income - v.expenses;
      const margin_pct = v.income > 0 ? ((margin / v.income) * 100).toFixed(2) : '0.00';
      return { month, income: v.income, expenses: v.expenses, margin, margin_pct };
    });
    setCsvHeaders(res, 'pl.csv');
    res.send(toCSV(headers, rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/profitability
router.get('/profitability', async (req, res) => {
  try {
    const { year } = req.query;
    const projects = await Project.find().lean();
    // Fetch all invoice payment totals per project in bulk
    const allInvoices = await Invoice.find({ deleted: { $ne: true } }).lean();
    const invoicesByProject = Object.create(null);
    for (const inv of allInvoices) {
      if (inv.projectId) {
        if (!invoicesByProject[inv.projectId]) invoicesByProject[inv.projectId] = [];
        invoicesByProject[inv.projectId].push(inv);
      }
    }
    const headers = ['project', 'type', 'status', 'income', 'cost', 'margin', 'margin_pct'];
    const rows = projects.map(p => {
      const projectInvoices = invoicesByProject[p.id] || invoicesByProject[p._id?.toString()] || [];
      const income = projectInvoices.reduce((s, inv) => s + (inv.paidAmount || 0), 0);
      const cost = (p.timeLogs || [])
        .filter(l => l.status === 'approved')
        .reduce((s, l) => s + ((l.hours || 0) * (l.approvedCost || 0)), 0);
      const margin = income - cost;
      const margin_pct = income > 0 ? ((margin / income) * 100).toFixed(2) : '0.00';
      return {
        project: p.name,
        type: p.type || '',
        status: p.status || '',
        income,
        cost,
        margin,
        margin_pct
      };
    }).filter(r => {
      if (!year) return true;
      // include all (project has no direct year field easily); return all
      return true;
    });
    setCsvHeaders(res, 'profitability.csv');
    res.send(toCSV(headers, rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/commissions
router.get('/commissions', async (req, res) => {
  try {
    const { year } = req.query;
    const query = { stage: 'closed-won', deleted: { $ne: true } };
    if (year) query.expectedCloseDate = { $regex: `^${year}` };
    const leads = await Lead.find(query).lean();
    const headers = ['company', 'closedValue', 'bm_40', 'fabian_30', 'spencer_30', 'total'];
    const rows = leads.map(l => {
      const val = l.closedValue || l.value || 0;
      const bm_40 = +(val * 0.4).toFixed(2);
      const fabian_30 = +(val * 0.3).toFixed(2);
      const spencer_30 = +(val * 0.3).toFixed(2);
      const total = bm_40 + fabian_30 + spencer_30;
      return { company: l.companyName, closedValue: val, bm_40, fabian_30, spencer_30, total };
    });
    setCsvHeaders(res, 'commissions.csv');
    res.send(toCSV(headers, rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/leads
router.get('/leads', async (req, res) => {
  try {
    const { year } = req.query;
    const query = { deleted: { $ne: true } };
    if (year) query.expectedCloseDate = { $regex: `^${year}` };
    const leads = await Lead.find(query).lean();
    const headers = ['company', 'contact', 'stage', 'value', 'probability', 'expectedCloseDate', 'country', 'partner'];
    const rows = leads.map(l => ({
      company: l.companyName,
      contact: l.contactName,
      stage: l.stage || '',
      value: l.value || 0,
      probability: l.probability || 0,
      expectedCloseDate: l.expectedCloseDate || '',
      country: l.country || '',
      partner: l.partnerName || ''
    }));
    setCsvHeaders(res, 'leads.csv');
    res.send(toCSV(headers, rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/timelogs
router.get('/timelogs', async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    const project = await Project.findOne({ id: projectId }).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const headers = ['consultant', 'task', 'date', 'hours', 'status', 'approvedRate', 'approvedCost'];
    const rows = (project.timeLogs || []).map(l => ({
      consultant: l.consultantName || l.consultant || '',
      task: l.task || l.description || '',
      date: l.date || '',
      hours: l.hours || 0,
      status: l.status || '',
      approvedRate: l.approvedRate || 0,
      approvedCost: l.approvedCost || 0
    }));
    setCsvHeaders(res, `timelogs_${projectId}.csv`);
    res.send(toCSV(headers, rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
