
import React, { useState, useMemo, useEffect } from 'react';
import { Project, User, Lead, Transaction, ExpenseCategory, PaymentRecord, Invoice } from '../types';
import { DollarSign, TrendingUp, TrendingDown, Users, Plus, Calendar, Save, PieChart, Wallet, Filter, CheckCircle, Clock, History, FileText, Search, BarChart2, Activity, Target, ArrowUpRight, ArrowDownRight, Percent, Edit2, X, Link as LinkIcon, Briefcase, Trash2, Layers, CreditCard, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, Cell, PieChart as RePieChart, Pie, Legend } from 'recharts';

interface FinanceManagerProps {
  projects: Project[];
  users: User[];
  leads: Lead[];
  transactions: Transaction[];
  onAddTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onUpdateTransaction: (t: Transaction) => void;
  onUpdateProject: (p: Project) => void;
  onUpdateUser: (u: User) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 
  'July', 'August', 'September', 'October', 'November', 'December'
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

export const FinanceManager: React.FC<FinanceManagerProps> = ({ projects, users, leads, transactions, onAddTransaction, onDeleteTransaction, onUpdateTransaction, onUpdateProject, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'metrics' | 'expenses' | 'payroll' | 'receivables'>('overview');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showCCImportModal, setShowCCImportModal] = useState(false);
  const [ccImportRows, setCCImportRows] = useState<{ date: string; description: string; amount: number }[]>([]);
  const [ccImportError, setCCImportError] = useState('');
  const [ccImportConsultantId, setCCImportConsultantId] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  
  // Invoice-based payment totals (Clean Cut: replaces project.payments)
  const [invoicePaymentTotals, setInvoicePaymentTotals] = useState<Record<string, number>>({});
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/invoices?status=paid&status=partially_paid&status=issued&status=overdue');
        if (!res.ok) return;
        const invoices: Invoice[] = await res.json();
        const totals: Record<string, number> = {};
        for (const inv of invoices) {
          if (inv.projectId) {
            totals[inv.projectId] = (totals[inv.projectId] || 0) + (inv.paidAmount || 0);
          }
        }
        setInvoicePaymentTotals(totals);
      } catch { /* silent — fall back to 0 */ }
    })();
  }, []);

  // Payment History / Revert State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyProjectId, setHistoryProjectId] = useState<string | null>(null);

  // Delete Confirmation State
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Transaction | null>(null);
  const [editLeadId, setEditLeadId] = useState('');
  const [editConsultantId, setEditConsultantId] = useState('');

  // Time Filters
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(-1); // -1 = All Year, 0 = Jan, 11 = Dec

  // Dynamic year range from actual data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const now = new Date().getFullYear();
    // Always include current year and ±2 years
    for (let y = now - 2; y <= now + 3; y++) years.add(y);
    // Add years from transactions
    transactions.forEach(t => {
      if (t.licenseYear) years.add(t.licenseYear);
      if (t.billingDate) years.add(new Date(t.billingDate).getFullYear());
      years.add(new Date(t.date).getFullYear());
    });
    // Add years from license items on leads
    leads.forEach(l => l.items?.forEach(i => {
      if (i.licenseYear) years.add(i.licenseYear);
    }));
    // Add years from project payments
    projects.forEach(p => p.payments?.forEach(pay => years.add(new Date(pay.date).getFullYear())));
    return Array.from(years).sort((a, b) => a - b);
  }, [transactions, leads, projects]);

  // History Filter
  const [minHoursFilter, setMinHoursFilter] = useState<number>(0);

  // Expense Form State
  const [expenseLinkType, setExpenseLinkType] = useState<'general' | 'project' | 'lead'>('general');
  const [newExpense, setNewExpense] = useState({
    title: '',
    amount: 0,
    category: 'credit_card' as ExpenseCategory,
    date: new Date().toISOString().split('T')[0],
    description: '',
    projectId: '',
    leadId: '',
    consultantId: '',
    isBillable: false
  });

  // Payment Form State
  const [selectedProjectForPayment, setSelectedProjectForPayment] = useState<string>('');
  const [newPayment, setNewPayment] = useState({
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    reference: ''
  });
  
  // Payroll Selection State
  const [selectedPayableLogs, setSelectedPayableLogs] = useState<string[]>([]);

  // Salary Edit State (Temporary map to hold new values/dates)
  const [salaryEdits, setSalaryEdits] = useState<Record<string, { amount: number, date: string }>>({});
  const [txLogSearch, setTxLogSearch] = useState('');
  const [txLogTypeFilter, setTxLogTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [txLogCategoryFilter, setTxLogCategoryFilter] = useState<string>('all');

  // Derived State for History Modal
  const historyProject = projects.find(p => p.id === historyProjectId);

  // --- DATA PROCESSING & AGGREGATION BY MONTH ---

  // Helper to get salary for a specific user at a specific date
  const getSalaryForDate = (user: User, date: Date) => {
      // If no history, assume current salary applies retroactively (legacy behavior fallback) or 0
      if (!user.salaryHistory || user.salaryHistory.length === 0) {
          return user.monthlySalary || 0;
      }

      // Sort history descending by date
      const sortedHistory = [...user.salaryHistory].sort((a, b) => 
          new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()
      );

      // Find the first record where effectiveDate <= target date
      const match = sortedHistory.find(record => new Date(record.effectiveDate) <= date);

      return match ? match.amount : 0; // If date is before first record, salary is 0 (or could default to first record)
  };

  const monthlyStats = useMemo(() => {
    // Initialize 12 months structure
    const stats = Array.from({ length: 12 }, (_, i) => ({
      monthIndex: i,
      name: MONTHS[i].substring(0, 3), // Jan, Feb...
      income: 0,
      fixedPayroll: 0,
      variablePayroll: 0,
      operationalExpenses: 0,
      totalExpenses: 0,
      netProfit: 0
    }));

    // 1. Process Income (Payments)
    projects.forEach(p => {
        if(p.payments) {
            p.payments.forEach(pay => {
                const date = new Date(pay.date);
                if (date.getFullYear() === selectedYear) {
                    const m = date.getMonth();
                    stats[m].income += pay.amount;
                }
            });
        }
    });

    // 2. Process Variable Payroll (Time Logs - Approved/Paid)
    // We use actual approved cost if available, otherwise estimate
    projects.forEach(p => {
      (p.timeLogs || []).forEach(log => {
        // Only count towards financial stats if it's approved or paid
        if (log.status === 'approved' || log.status === 'paid') {
            const date = new Date(log.date);
            if (date.getFullYear() === selectedYear) {
              const m = date.getMonth();
              stats[m].variablePayroll += (log.approvedCost || 0);
            }
        }
      });
    });

    // 3. Process Fixed Payroll (Salaries) - DATE SENSITIVE
    users.forEach(u => {
      if (u.role === 'admin' || u.role === 'sales' || u.role === 'consultant') {
         stats.forEach(month => {
             // Calculate salary for the 28th of each month
             const monthDate = new Date(selectedYear, month.monthIndex, 28);
             const salaryForMonth = getSalaryForDate(u, monthDate);
             month.fixedPayroll += salaryForMonth;
         });
      }
    });

    // 4. Process Operational Expenses + License Income (Transactions)
    transactions.forEach(t => {
      if (t.type === 'expense') {
        const date = new Date(t.date);
        if (date.getFullYear() === selectedYear) {
          stats[date.getMonth()].operationalExpenses += t.amount;
        }
      } else if (t.type === 'income') {
        if (t.lineItemId) {
          // License transaction: billingDate is REQUIRED to assign to a fiscal year
          // Without billingDate the revenue is "unscheduled" and excluded from calculations
          const billingDateStr = t.billingDate || (leads.find(l => l.id === t.leadId)?.items.find(i => i.id === t.lineItemId)?.billingDate);
          if (!billingDateStr) return; // no billing date → skip (unscheduled)
          const lead = leads.find(l => l.id === t.leadId);
          const lineItem = lead?.items.find(i => i.id === t.lineItemId);
          // Fiscal year: lineItem.licenseYear → t.licenseYear → year of billingDate
          const fiscalYear = lineItem?.licenseYear ?? t.licenseYear ?? new Date(billingDateStr).getFullYear();
          if (fiscalYear === selectedYear) {
            const vendorCost = lineItem ? lineItem.unitCost * lineItem.quantity : 0;
            const incodaMargin = t.amount - vendorCost;
            const incomeDate = new Date(billingDateStr);
            stats[incomeDate.getMonth()].income += incodaMargin;
          }
        } else {
          // Regular income: use paymentDate → billingDate → date
          const incomeDate = new Date(t.paymentDate || t.billingDate || t.date);
          if (incomeDate.getFullYear() === selectedYear) {
            stats[incomeDate.getMonth()].income += t.amount;
          }
        }
      }
    });

    // 5. Calculate Totals
    stats.forEach(month => {
      month.totalExpenses = month.fixedPayroll + month.variablePayroll + month.operationalExpenses;
      month.netProfit = month.income - month.totalExpenses;
    });

    return stats;
  }, [leads, projects, users, transactions, selectedYear]);

  // --- FILTERED TOTALS FOR CARDS ---
  
  const currentViewStats = useMemo(() => {
      if (selectedMonth === -1) {
          return monthlyStats.reduce((acc, curr) => ({
              income: acc.income + curr.income,
              expenses: acc.expenses + curr.totalExpenses,
              profit: acc.profit + curr.netProfit,
              margin: 0
          }), { income: 0, expenses: 0, profit: 0, margin: 0 });
      } else {
          const m = monthlyStats[selectedMonth];
          return {
              income: m.income,
              expenses: m.totalExpenses,
              profit: m.netProfit,
              margin: 0
          };
      }
  }, [monthlyStats, selectedMonth]);

  const profitMargin = currentViewStats.income > 0 
      ? (currentViewStats.profit / currentViewStats.income) * 100 
      : 0;

  // --- ADVANCED METRICS CALCULATION ---
  const advancedMetrics = useMemo(() => {
    // 1. Profitability
    const totalRevenue = currentViewStats.income;
    const directLaborCosts = monthlyStats.reduce((sum, m) => sum + m.variablePayroll, 0); // Approx delivery cost
    const totalExpenses = currentViewStats.expenses;
    
    // Delivery Margin per Project — only projects whose lead closed in selectedYear
    const fiscalProjects = projects.filter(p => {
        const lead = leads.find(l => l.id === p.leadId);
        if (!lead?.expectedCloseDate) return true;
        return new Date(lead.expectedCloseDate).getFullYear() === selectedYear;
    });

    const projectProfitability = fiscalProjects.map(p => {
        // Service/implementation payments — scoped to selectedYear
        const serviceRevenue = p.payments?.reduce((sum, pay) => {
            const d = new Date(pay.date);
            return d.getFullYear() === selectedYear ? sum + pay.amount : sum;
        }, 0) || 0;

        // License income — scoped to selectedYear fiscal year
        const licenseRevenue = transactions
            .filter(t => t.type === 'income' && t.lineItemId && t.leadId === p.leadId)
            .reduce((sum, t) => {
                const lead = leads.find(l => l.id === t.leadId);
                const lineItem = lead?.items.find(i => i.id === t.lineItemId);
                const fiscalYear = lineItem?.licenseYear ?? t.licenseYear ?? new Date(t.billingDate || t.paymentDate || t.date).getFullYear();
                if (fiscalYear !== selectedYear) return sum;
                const vendorCost = lineItem ? lineItem.unitCost * lineItem.quantity : 0;
                return sum + (t.amount - vendorCost);
            }, 0);

        const revenue = serviceRevenue + licenseRevenue;

        // Labor cost — only hours logged in selectedYear
        const laborCost = p.timeLogs
            .filter(log => new Date(log.date).getFullYear() === selectedYear)
            .reduce((sum, log) => sum + (log.approvedCost || 0), 0);

        // Direct expenses linked to project or lead — only in selectedYear
        const projectExpenses = transactions
            .filter(t =>
                (t.projectId === p.id || (t.leadId && t.leadId === p.leadId)) &&
                t.type === 'expense' &&
                new Date(t.date).getFullYear() === selectedYear
            )
            .reduce((sum, t) => sum + t.amount, 0);

        const totalDirectCost = laborCost + projectExpenses;
        const margin = revenue > 0 ? ((revenue - totalDirectCost) / revenue) * 100 : 0;
        const profit = revenue - totalDirectCost;

        return { name: p.name, revenue, laborCost, otherCost: projectExpenses, margin, profit };
    }).sort((a, b) => b.profit - a.profit);

    // Aggregated Gross / Net Margin
    const totalProjectExpenses = projectProfitability.reduce((acc, p) => acc + p.otherCost, 0);
    const totalDirectCosts = directLaborCosts + totalProjectExpenses;

    const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalDirectCosts) / totalRevenue) * 100 : 0;
    const netMargin = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0;

    // Billable Utilization — hours logged in selectedYear only
    const consultants = users.filter(u => u.role === 'consultant');
    const totalCapacityHours = consultants.length * 160 * 12;
    const totalBilledHours = fiscalProjects.reduce((sum, p) =>
        sum + p.timeLogs
            .filter(l => new Date(l.date).getFullYear() === selectedYear)
            .reduce((acc, l) => acc + l.hours, 0),
    0);
    const utilizationRate = totalCapacityHours > 0 ? (totalBilledHours / totalCapacityHours) * 100 : 0;

    // 2. Efficiency — scoped to selected fiscal year via expectedCloseDate
    const fiscalLeads = leads.filter(l => {
        if (!l.expectedCloseDate) return false;
        return new Date(l.expectedCloseDate).getFullYear() === selectedYear;
    });
    const closedWon = fiscalLeads.filter(l => l.stage === 'closed-won' || l.stage === 'project-delivered').length;
    const totalLeads = fiscalLeads.length;
    const conversionRate = totalLeads > 0 ? (closedWon / totalLeads) * 100 : 0;

    const avgBillableRate = totalBilledHours > 0 ? totalRevenue / totalBilledHours : 0; // Simplified

    // Cost Overrun
    const overrunProjects = projects.filter(p => {
        const used = (p.timeLogs || []).reduce((acc, l) => acc + l.hours, 0);
        return used > p.totalBudgetHours;
    });

    // 3. Cash Flow / Liquidity
    const cashFlowRatio = totalExpenses > 0 ? totalRevenue / totalExpenses : 1; // > 1 is good
    
    // 4. Growth — scoped to selectedYear
    const marketingSpend = transactions
        .filter(t => t.category === 'marketing' && new Date(t.date).getFullYear() === selectedYear)
        .reduce((acc, t) => acc + t.amount, 0);
    const newClients = fiscalProjects.length;
    const cac = newClients > 0 ? marketingSpend / newClients : 0;

    const uniqueClients = new Set(fiscalProjects.map(p => p.clientName)).size;
    const ltv = uniqueClients > 0 ? totalRevenue / uniqueClients : 0;

    return {
        grossMargin,
        netMargin,
        projectProfitability,
        utilizationRate,
        conversionRate,
        avgBillableRate,
        overrunCount: overrunProjects.length,
        cashFlowRatio,
        cac,
        ltv,
        marketingSpend
    };
  }, [currentViewStats, monthlyStats, projects, users, leads, transactions, selectedYear]);

  // --- PRE-SALES STATS (LEAD EXPENSES) — scoped to selected fiscal year ---
  const presalesStats = useMemo(() => {
      const stats: Record<string, number> = {};
      transactions.forEach(t => {
          if (t.leadId && t.type === 'expense') {
              const lead = leads.find(l => l.id === t.leadId);
              if (!lead) return;
              const closeYear = lead.expectedCloseDate ? new Date(lead.expectedCloseDate).getFullYear() : null;
              if (closeYear !== selectedYear) return;
              const name = lead.companyName;
              stats[name] = (stats[name] || 0) + t.amount;
          }
      });

      return Object.entries(stats)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10); // Top 10 leads by spend
  }, [transactions, leads, selectedYear]);


  // --- RECEIVABLES DATA — filtered to selected fiscal year ---
  const receivablesData = useMemo(() => {
    return projects.filter(project => {
        const lead = leads.find(l => l.id === project.leadId);
        if (!lead?.expectedCloseDate) return true; // keep if no date (can't determine year)
        return new Date(lead.expectedCloseDate).getFullYear() === selectedYear;
    }).map(project => {
        const lead = leads.find(l => l.id === project.leadId);

        // For license items: receivable = Incoda margin (Sell Price - Cost) only
        // For non-license items: receivable = full sell price
        let contractValue = project.value || 0;

        if (!contractValue && lead && lead.items && lead.items.length > 0) {
            contractValue = lead.items.reduce((sum, item) => {
                if (item.category === 'license') {
                    return sum + (item.unitPrice * item.quantity - item.unitCost * item.quantity);
                }
                return sum + item.total;
            }, 0);
        } else if (!contractValue && lead) {
            contractValue = lead.closedValue || lead.value || 0;
        }

        // Calculate Billable Expenses (Added to Receivable)
        const billableExpenses = transactions
            .filter(t => t.projectId === project.id && t.type === 'expense' && t.isBillable)
            .reduce((sum, t) => sum + t.amount, 0);

        // Total Receivable = Contract (margin-adjusted) + Billable Expenses
        const totalReceivableValue = contractValue + billableExpenses;
        
        const totalPaid = invoicePaymentTotals[project.id] || 0;
        const balanceDue = totalReceivableValue - totalPaid;
        const progress = totalReceivableValue > 0 ? (totalPaid / totalReceivableValue) * 100 : 0;

        const isLicense = lead?.items?.some(i => i.category === 'license') ?? false;

        return {
            projectId: project.id,
            projectName: project.name,
            clientName: project.clientName,
            contractValue,
            billableExpenses,
            totalReceivableValue,
            totalPaid,
            balanceDue,
            progress,
            isLicense
        };
    }).sort((a, b) => b.balanceDue - a.balanceDue);
  }, [projects, leads, transactions, selectedYear, invoicePaymentTotals]);

  // --- PAYROLL DATA: PAYABLE & HISTORY ---
  const payableApprovedLogs = useMemo(() => {
      const list: {
          id: string, projectId: string, projectName: string, consultantName: string,
          hours: number, rate: number, totalCost: number, date: string
      }[] = [];

      projects.forEach(p => {
          (p.timeLogs || []).filter(l => {
              if (l.status !== 'approved') return false;
              const logYear = new Date(l.date).getFullYear();
              return logYear === selectedYear;
          }).forEach(l => {
              list.push({
                  id: l.id,
                  projectId: p.id,
                  projectName: p.name,
                  consultantName: l.consultantName,
                  hours: l.hours,
                  rate: l.approvedRate || 0,
                  totalCost: l.approvedCost || 0,
                  date: l.date
              });
          });
      });
      return list;
  }, [projects, selectedYear]);

  const paidTimeLogsHistory = useMemo(() => {
      const list: { 
          id: string, date: string, consultantName: string, projectName: string, 
          hours: number, rate: number, totalCost: number 
      }[] = [];

      projects.forEach(p => {
          (p.timeLogs || []).filter(l => l.status === 'paid').forEach(l => {
              const d = new Date(l.date);
              // Year/Month filter
              if (d.getFullYear() === selectedYear && (selectedMonth === -1 || d.getMonth() === selectedMonth)) {
                   // Min Hours Filter
                   if (l.hours >= minHoursFilter) {
                       list.push({
                           id: l.id,
                           date: l.date,
                           consultantName: l.consultantName,
                           projectName: p.name,
                           hours: l.hours,
                           rate: l.approvedRate || 0,
                           totalCost: l.approvedCost || 0
                       });
                   }
              }
          });
      });
      return list.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [projects, selectedYear, selectedMonth, minHoursFilter]);

  const payrollHistory = useMemo(() => {
      const list: { name: string, type: string, hours: number, cost: number, rate: string }[] = [];
      
      // Fixed Salaries (Correct Calculation using History)
      users.filter(u => ['admin', 'sales', 'consultant'].includes(u.role)).forEach(u => {
        let totalCost = 0;
        let lastRate = 0;

        if (selectedMonth === -1) {
            // Annual Sum
            for (let i = 0; i < 12; i++) {
                const date = new Date(selectedYear, i, 28);
                const salary = getSalaryForDate(u, date);
                totalCost += salary;
                if (i === 11) lastRate = salary; // Show end of year salary
            }
        } else {
            // Specific Month
            const date = new Date(selectedYear, selectedMonth, 28);
            totalCost = getSalaryForDate(u, date);
            lastRate = totalCost;
        }

        if (totalCost > 0) {
            list.push({
                name: u.name,
                type: 'Employee (Fixed)',
                hours: selectedMonth === -1 ? 160 * 12 : 160,
                rate: `$${lastRate.toLocaleString()}/mo`,
                cost: totalCost
            });
        }
      });

      // Variable (Paid Logs)
      const consultantPaid: Record<string, number> = {};
      projects.forEach(p => {
          (p.timeLogs || []).filter(l => l.status === 'paid').forEach(log => {
             const d = new Date(log.date);
             if (d.getFullYear() === selectedYear && (selectedMonth === -1 || d.getMonth() === selectedMonth)) {
                 consultantPaid[log.consultantName] = (consultantPaid[log.consultantName] || 0) + (log.approvedCost || 0);
             }
          });
      });

      Object.entries(consultantPaid).forEach(([name, cost]) => {
          list.push({
              name: name,
              type: 'Contractor (Paid)',
              hours: 0, // Simplified for summary
              rate: 'Varies',
              cost: cost
          });
      });

      return list;
  }, [users, projects, selectedYear, selectedMonth]);

  // --- FILTERED TRANSACTIONS ---
  const filteredTransactions = useMemo(() => {
      return transactions.filter(t => {
          const d = new Date(t.date);
          return t.type === 'expense' && d.getFullYear() === selectedYear && (selectedMonth === -1 || d.getMonth() === selectedMonth);
      });
  }, [transactions, selectedYear, selectedMonth]);

  // --- EXPENSE ANALYTICS (GRAPHS) ---
  const expenseAnalytics = useMemo(() => {
      // 1. By Category
      const byCategory: Record<string, number> = {};
      filteredTransactions.forEach(t => {
          const label = t.category.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
          byCategory[label] = (byCategory[label] || 0) + t.amount;
      });
      const categoryData = Object.entries(byCategory)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

      // 2. By Project (Assignment)
      const byProject: Record<string, number> = {};
      filteredTransactions.forEach(t => {
          let label = 'General / Overhead';
          if (t.projectId) {
              const proj = projects.find(p => p.id === t.projectId);
              label = proj ? proj.name : 'Unknown Project';
          } else if (t.leadId) {
              const lead = leads.find(l => l.id === t.leadId);
              label = lead ? `Pre-sales: ${lead.companyName}` : 'Pre-sales (Unknown)';
          }
          byProject[label] = (byProject[label] || 0) + t.amount;
      });
      const projectData = Object.entries(byProject)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

      // 3. By Consultant
      const byConsultant: Record<string, number> = {};
      filteredTransactions.forEach(t => {
          if (!t.consultantId) return;
          const consultant = users.find(u => u.id === t.consultantId);
          const label = consultant ? consultant.name : 'Unknown';
          byConsultant[label] = (byConsultant[label] || 0) + t.amount;
      });
      const consultantData = Object.entries(byConsultant)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

      return { categoryData, projectData, consultantData };
  }, [filteredTransactions, projects, leads, users]);


  // --- HANDLERS ---

  const handleOpenExpenseModal = () => {
    let defaultDate = new Date().toISOString().split('T')[0];
    const now = new Date();
    if (now.getFullYear() !== selectedYear) {
        defaultDate = `${selectedYear}-01-01`;
    }
    if (selectedMonth !== -1) {
        const m = String(selectedMonth + 1).padStart(2, '0');
        if (selectedYear === now.getFullYear() && selectedMonth === now.getMonth()) {
             defaultDate = now.toISOString().split('T')[0];
        } else {
             defaultDate = `${selectedYear}-${m}-01`;
        }
    }
    setExpenseLinkType('general');
    setNewExpense({
        title: '',
        amount: 0,
        category: 'credit_card',
        date: defaultDate,
        description: '',
        projectId: '',
        leadId: '',
        consultantId: '',
        isBillable: false
    });
    setShowExpenseModal(true);
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    onAddTransaction({
        id: `tx_${Date.now()}`,
        title: newExpense.title,
        amount: Number(newExpense.amount),
        date: newExpense.date,
        type: 'expense',
        category: newExpense.category,
        description: newExpense.description,
        projectId: expenseLinkType === 'project' ? newExpense.projectId : undefined,
        leadId: expenseLinkType === 'lead' ? newExpense.leadId : undefined,
        isBillable: expenseLinkType === 'project' ? newExpense.isBillable : false,
        consultantId: newExpense.category === 'credit_card' ? newExpense.consultantId || undefined : undefined
    });
    setShowExpenseModal(false);
  };

  const handleDeleteExpense = (id: string) => {
      setExpenseToDelete(id);
  };

  const confirmDeleteExpense = () => {
      if (expenseToDelete) {
          onDeleteTransaction(expenseToDelete);
          setExpenseToDelete(null);
      }
  };

  const handleProcessPayroll = () => {
      if (selectedPayableLogs.length === 0) return;

      const logsToPay = payableApprovedLogs.filter(l => selectedPayableLogs.includes(l.id));
      const totalAmount = logsToPay.reduce((acc, l) => acc + l.totalCost, 0);

      // 1. Create Expense Transaction
      onAddTransaction({
          id: `tx_pay_${Date.now()}`,
          title: `Consultant Payment (${logsToPay.length} items)`,
          amount: totalAmount,
          date: new Date().toISOString().split('T')[0],
          type: 'expense',
          category: 'consultant_payment',
          description: `Paid to: ${[...new Set(logsToPay.map(l => l.consultantName))].join(', ')}`,
          logIds: logsToPay.map(l => l.id)
      });

      // 2. Update Time Logs status to 'paid'
      // Need to grouping by project to call onUpdateProject efficiently
      const logsByProject: Record<string, string[]> = {};
      logsToPay.forEach(l => {
          if (!logsByProject[l.projectId]) logsByProject[l.projectId] = [];
          logsByProject[l.projectId].push(l.id);
      });

      Object.entries(logsByProject).forEach(([projectId, logIds]) => {
          const project = projects.find(p => p.id === projectId);
          if (project) {
              const updatedLogs = (project.timeLogs || []).map(l => 
                  logIds.includes(l.id) ? { ...l, status: 'paid' as const } : l
              );
              onUpdateProject({ ...project, timeLogs: updatedLogs });
          }
      });

      setSelectedPayableLogs([]);
      alert(`Successfully processed payment of $${totalAmount.toLocaleString()}`);
  };

  const handleRevertToPending = (logId: string) => {
      const project = projects.find(p => (p.timeLogs || []).some(l => l.id === logId));
      if (!project) return;
      onUpdateProject({
          ...project,
          timeLogs: (project.timeLogs || []).map(l =>
              l.id === logId ? { ...l, status: 'pending' as const, approvedRate: undefined, approvedCost: undefined } : l
          )
      });
      setSelectedPayableLogs(prev => prev.filter(id => id !== logId));
  };

  const handleReversePayment = (logId: string) => {
      // Find the transaction that covers this log
      const tx = transactions.find(t => t.logIds?.includes(logId));
      const affectedLogIds: string[] = tx?.logIds ?? [logId];

      // Delete the expense transaction
      if (tx) onDeleteTransaction(tx.id);

      // Revert all logs in the group back to 'approved'
      const logsByProject: Record<string, string[]> = {};
      affectedLogIds.forEach(id => {
          const project = projects.find(p => (p.timeLogs || []).some(l => l.id === id));
          if (project) {
              if (!logsByProject[project.id]) logsByProject[project.id] = [];
              logsByProject[project.id].push(id);
          }
      });

      Object.entries(logsByProject).forEach(([projectId, ids]) => {
          const project = projects.find(p => p.id === projectId);
          if (project) {
              onUpdateProject({
                  ...project,
                  timeLogs: (project.timeLogs || []).map(l =>
                      ids.includes(l.id) ? { ...l, status: 'approved' as const } : l
                  )
              });
          }
      });
  };

   const handleOpenPaymentModal = (projectId?: string) => {
      setSelectedProjectForPayment(projectId || (projects[0]?.id || ''));
      setNewPayment({
          amount: 0,
          date: new Date().toISOString().split('T')[0],
          reference: ''
      });
      setShowPaymentModal(true);
  };

  const handleSavePayment = (e: React.FormEvent) => {
      e.preventDefault();
      const project = projects.find(p => p.id === selectedProjectForPayment);
      if (!project) return;

      const payment: PaymentRecord = {
          id: `pmt_${Date.now()}`,
          amount: Number(newPayment.amount),
          date: newPayment.date,
          reference: newPayment.reference
      };

      const updatedProject = {
          ...project,
          payments: [...(project.payments || []), payment]
      };

      onUpdateProject(updatedProject);
      setShowPaymentModal(false);
  };

  const handleOpenPaymentHistory = (projectId: string) => {
      setHistoryProjectId(projectId);
      setShowHistoryModal(true);
  };

  const handleDeletePayment = (paymentId: string) => {
      if (!historyProject) return;
      if (!window.confirm('Are you sure you want to revert this payment? This action cannot be undone.')) return;

      const updatedPayments = historyProject.payments.filter(p => p.id !== paymentId);
      const updatedProject = {
          ...historyProject,
          payments: updatedPayments
      };

      onUpdateProject(updatedProject);
  };

  // Prepare salary edits
  const initSalaryEdit = (user: User) => {
      const currentSalary = user.monthlySalary || 0;
      setSalaryEdits(prev => ({
          ...prev,
          [user.id]: { 
              amount: currentSalary, 
              date: new Date().toISOString().split('T')[0] 
          }
      }));
  };

  const updateSalaryEdit = (userId: string, field: 'amount' | 'date', value: any) => {
      setSalaryEdits(prev => ({
          ...prev,
          [userId]: { ...prev[userId], [field]: value }
      }));
  };

  const handleSaveSalaryChange = (user: User) => {
     const edit = salaryEdits[user.id];
     if (!edit) return;

     // Update user: current salary (for easy access) AND history
     const updatedHistory = [
         ...(user.salaryHistory || []),
         { amount: edit.amount, effectiveDate: edit.date }
     ];

     const updatedUser = { 
         ...user, 
         monthlySalary: edit.amount,
         salaryHistory: updatedHistory
     };
     
     onUpdateUser(updatedUser);
     
     // Remove from edits to show saved state
     const newEdits = { ...salaryEdits };
     delete newEdits[user.id];
     setSalaryEdits(newEdits);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      
      {/* HEADER & FILTERS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="text-green-600" /> Annual Financial Overview
          </h1>
          <p className="text-gray-500 text-sm">Track income, payroll, and expenses by month.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
            {/* Fiscal Year selector */}
            <div className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-lg border-2 border-blue-200 shadow-sm">
                <span className="text-xs font-bold text-blue-700 uppercase tracking-wide mr-1">Fiscal Year</span>
                <button
                    onClick={() => setSelectedYear(y => {
                        const idx = availableYears.indexOf(y);
                        return idx > 0 ? availableYears[idx - 1] : y;
                    })}
                    className="text-blue-400 hover:text-blue-700 transition p-0.5 rounded hover:bg-blue-50"
                    title="Previous Year"
                >
                    <ChevronLeft size={16} />
                </button>
                <select
                    className="bg-transparent text-blue-800 font-bold text-sm py-0.5 px-1 focus:outline-none cursor-pointer"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                    {availableYears.map(y => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
                <button
                    onClick={() => setSelectedYear(y => {
                        const idx = availableYears.indexOf(y);
                        return idx < availableYears.length - 1 ? availableYears[idx + 1] : y;
                    })}
                    className="text-blue-400 hover:text-blue-700 transition p-0.5 rounded hover:bg-blue-50"
                    title="Next Year"
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* Month filter */}
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm">
                <Filter size={14} className="text-gray-400" />
                <select
                    className="bg-transparent text-sm text-gray-700 focus:outline-none"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                    <option value={-1}>Full Year</option>
                    {MONTHS.map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                    ))}
                </select>
            </div>

            <button
                onClick={() => { setCCImportRows([]); setCCImportError(''); setCCImportConsultantId(''); setShowCCImportModal(true); }}
                className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-1 text-sm font-medium shadow-sm"
            >
                <CreditCard size={16} /> Import CC
            </button>
            <button
                onClick={handleOpenExpenseModal}
                className="bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition flex items-center gap-1 text-sm font-medium shadow-sm"
            >
                <Plus size={16} /> Expense
            </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 overflow-x-auto">
              <button onClick={() => setActiveTab('overview')} className={`px-6 py-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === 'overview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Annual Trends</button>
              <button onClick={() => setActiveTab('metrics')} className={`px-6 py-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === 'metrics' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Advanced Metrics (KPIs)</button>
              <button onClick={() => setActiveTab('receivables')} className={`px-6 py-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === 'receivables' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Accounts Receivable</button>
              <button onClick={() => setActiveTab('payroll')} className={`px-6 py-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === 'payroll' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Payroll & Payments</button>
              <button onClick={() => setActiveTab('expenses')} className={`px-6 py-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeTab === 'expenses' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Expense Log & Analytics</button>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
              {/* [Other Tabs Hidden for Brevity - Keeping Structure] */}
              
              {activeTab === 'overview' && (
                  <div className="space-y-6">
                      {/* FISCAL YEAR BANNER */}
                      <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5">
                          <div className="flex items-center gap-2">
                              <Calendar size={15} className="text-blue-600" />
                              <span className="text-sm font-semibold text-blue-800">
                                  Fiscal Year {selectedYear}
                                  {selectedMonth >= 0 && <span className="font-normal text-blue-600"> — {MONTHS[selectedMonth]}</span>}
                              </span>
                          </div>
                          <div className="flex items-center gap-1">
                              <button
                                  onClick={() => setSelectedYear(y => { const idx = availableYears.indexOf(y); return idx > 0 ? availableYears[idx - 1] : y; })}
                                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-100 transition"
                              >
                                  <ChevronLeft size={14} /> {availableYears[availableYears.indexOf(selectedYear) - 1] ?? ''}
                              </button>
                              <span className="text-blue-300 text-xs">|</span>
                              <button
                                  onClick={() => setSelectedYear(y => { const idx = availableYears.indexOf(y); return idx < availableYears.length - 1 ? availableYears[idx + 1] : y; })}
                                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-100 transition"
                              >
                                  {availableYears[availableYears.indexOf(selectedYear) + 1] ?? ''} <ChevronRight size={14} />
                              </button>
                          </div>
                      </div>

                      {/* KPI CARDS */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                             <div className="flex justify-between items-start mb-2">
                                 <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">
                                    {selectedMonth === -1 ? 'Annual Revenue' : `${MONTHS[selectedMonth]} Revenue`}
                                 </p>
                                 <div className="p-2 bg-green-50 text-green-600 rounded-lg"><TrendingUp size={20} /></div>
                             </div>
                             <h3 className="text-2xl font-bold text-gray-900">${currentViewStats.income.toLocaleString()}</h3>
                          </div>

                          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                             <div className="flex justify-between items-start mb-2">
                                 <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">
                                    {selectedMonth === -1 ? 'Annual Expenses' : `${MONTHS[selectedMonth]} Expenses`}
                                 </p>
                                 <div className="p-2 bg-red-50 text-red-600 rounded-lg"><TrendingDown size={20} /></div>
                             </div>
                             <h3 className="text-2xl font-bold text-gray-900">${currentViewStats.expenses.toLocaleString()}</h3>
                          </div>

                          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                             <div className="flex justify-between items-start mb-2">
                                 <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Net Profit</p>
                                 <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Wallet size={20} /></div>
                             </div>
                             <h3 className={`text-2xl font-bold ${currentViewStats.profit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                                 ${currentViewStats.profit.toLocaleString()}
                             </h3>
                          </div>

                          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                             <div className="flex justify-between items-start mb-2">
                                 <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Profit Margin</p>
                                 <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><PieChart size={20} /></div>
                             </div>
                             <h3 className="text-2xl font-bold text-gray-900">{profitMargin.toFixed(1)}%</h3>
                             <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                                <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.min(Math.max(profitMargin, 0), 100)}%` }}></div>
                             </div>
                          </div>
                      </div>

                      <div className="h-[400px] w-full">
                          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                              <Calendar size={18} className="text-gray-500"/> Financial Performance ({selectedYear})
                          </h3>
                          <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={monthlyStats} margin={{top: 20, right: 30, left: 20, bottom: 5}}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                  <XAxis dataKey="name" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                                  <YAxis tickFormatter={(val) => `$${val/1000}k`} axisLine={false} tickLine={false} />
                                  <Tooltip
                                    cursor={{fill: '#f8fafc'}}
                                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                    formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                                  />
                                  <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} />
                                  <Bar dataKey="income" name="Income" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={20} />
                                  <Bar dataKey="totalExpenses" name="Total Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                              </ComposedChart>
                          </ResponsiveContainer>
                      </div>

                      {/* TRANSACTION LOG */}
                      {(() => {
                          const logTx = transactions
                              .filter(t => {
                                  const d = new Date(t.date);
                                  if (d.getFullYear() !== selectedYear) return false;
                                  if (selectedMonth >= 0 && d.getMonth() !== selectedMonth) return false;
                                  if (txLogTypeFilter !== 'all' && t.type !== txLogTypeFilter) return false;
                                  if (txLogCategoryFilter !== 'all' && t.category !== txLogCategoryFilter) return false;
                                  if (txLogSearch) {
                                      const q = txLogSearch.toLowerCase();
                                      return (
                                          t.title.toLowerCase().includes(q) ||
                                          (t.description || '').toLowerCase().includes(q) ||
                                          t.category.toLowerCase().includes(q)
                                      );
                                  }
                                  return true;
                              })
                              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                          const allCategories = Array.from(new Set(transactions.map(t => t.category))).sort();
                          const totalInLog = logTx.reduce((s, t) => t.type === 'income' ? s + t.amount : s - t.amount, 0);

                          return (
                              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                  {/* Header */}
                                  <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <FileText size={16} className="text-gray-400 shrink-0" />
                                          <h3 className="text-sm font-semibold text-gray-800 whitespace-nowrap">
                                              Transaction Log
                                          </h3>
                                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                                              {logTx.length} transactions
                                          </span>
                                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${totalInLog >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                              Balance: ${totalInLog.toLocaleString()}
                                          </span>
                                      </div>
                                      {/* Filters */}
                                      <div className="flex items-center gap-2 flex-wrap">
                                          <div className="relative">
                                              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                              <input
                                                  type="text"
                                                  placeholder="Search..."
                                                  value={txLogSearch}
                                                  onChange={e => setTxLogSearch(e.target.value)}
                                                  className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-300 w-40"
                                              />
                                          </div>
                                          <select
                                              value={txLogTypeFilter}
                                              onChange={e => setTxLogTypeFilter(e.target.value as any)}
                                              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-1 focus:ring-blue-300"
                                          >
                                              <option value="all">All types</option>
                                              <option value="income">Income</option>
                                              <option value="expense">Expenses</option>
                                          </select>
                                          <select
                                              value={txLogCategoryFilter}
                                              onChange={e => setTxLogCategoryFilter(e.target.value)}
                                              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-1 focus:ring-blue-300"
                                          >
                                              <option value="all">All categories</option>
                                              {allCategories.map(c => (
                                                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                                              ))}
                                          </select>
                                      </div>
                                  </div>

                                  {/* Table */}
                                  {logTx.length === 0 ? (
                                      <div className="py-10 text-center text-gray-400 text-sm">
                                          No transactions for this period
                                      </div>
                                  ) : (
                                      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                                          <table className="w-full text-sm text-left min-w-[700px]">
                                              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide sticky top-0 z-10">
                                                  <tr>
                                                      <th className="px-4 py-2.5 font-medium">Date</th>
                                                      <th className="px-4 py-2.5 font-medium">Description</th>
                                                      <th className="px-4 py-2.5 font-medium">Category</th>
                                                      <th className="px-4 py-2.5 font-medium">Project / Lead</th>
                                                      <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                                                      <th className="px-4 py-2.5 font-medium text-center">Tipo</th>
                                                  </tr>
                                              </thead>
                                              <tbody className="divide-y divide-gray-100">
                                                  {logTx.map(t => {
                                                      const linkedProject = projects.find(p => p.id === t.projectId);
                                                      const linkedLead = leads.find(l => l.id === t.leadId);
                                                      // Projected = income with a future billingDate or paymentDate
                                                      const today = new Date();
                                                      today.setHours(0, 0, 0, 0);
                                                      const isProjected = t.type === 'income' && (
                                                          (t.billingDate && new Date(t.billingDate + 'T12:00:00') > today) ||
                                                          (t.paymentDate && new Date(t.paymentDate + 'T12:00:00') > today)
                                                      );
                                                      return (
                                                          <tr key={t.id} className={`hover:bg-gray-50 transition ${isProjected ? 'bg-amber-50/30' : t.type === 'income' ? 'bg-green-50/20' : ''}`}>
                                                              <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                                                                  {new Date(t.date + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                              </td>
                                                              <td className="px-4 py-2.5 max-w-[220px]">
                                                                  <p className="font-medium text-gray-800 truncate">{t.title}</p>
                                                                  {t.description && (
                                                                      <p className="text-xs text-gray-400 truncate">{t.description}</p>
                                                                  )}
                                                              </td>
                                                              <td className="px-4 py-2.5">
                                                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                                                                      {t.category.replace(/_/g, ' ')}
                                                                  </span>
                                                              </td>
                                                              <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[160px]">
                                                                  {linkedProject
                                                                      ? <span className="flex items-center gap-1"><Briefcase size={11} /> {linkedProject.name}</span>
                                                                      : linkedLead
                                                                      ? <span className="flex items-center gap-1"><Users size={11} /> {linkedLead.companyName}</span>
                                                                      : <span className="text-gray-300">—</span>}
                                                              </td>
                                                              <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                                                                  <span className={isProjected ? 'text-amber-600' : t.type === 'income' ? 'text-green-600' : 'text-red-500'}>
                                                                      {t.type === 'income' ? '+' : '-'}${t.amount.toLocaleString()}
                                                                  </span>
                                                              </td>
                                                              <td className="px-4 py-2.5 text-center">
                                                                  {isProjected ? (
                                                                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1 justify-center">
                                                                          <Clock size={10} /> Pendiente cobro
                                                                      </span>
                                                                  ) : (
                                                                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                                                          {t.type === 'income' ? 'Cobrado' : 'Expense'}
                                                                      </span>
                                                                  )}
                                                              </td>
                                                          </tr>
                                                      );
                                                  })}
                                              </tbody>
                                              <tfoot className="sticky bottom-0 bg-gray-50 border-t-2 border-gray-200">
                                                  <tr>
                                                      <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-gray-600">
                                                          Total ({logTx.length} registros)
                                                      </td>
                                                      <td className="px-4 py-2.5 text-right font-bold whitespace-nowrap">
                                                          <span className={totalInLog >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                              {totalInLog >= 0 ? '+' : ''}${totalInLog.toLocaleString()}
                                                          </span>
                                                      </td>
                                                      <td />
                                                  </tr>
                                              </tfoot>
                                          </table>
                                      </div>
                                  )}
                              </div>
                          );
                      })()}
                  </div>
              )}

              {activeTab === 'metrics' && (
                  <div className="space-y-8">
                      {/* Section 1: Profitability */}
                      <div>
                          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                              <PieChart className="text-purple-600" size={20} /> Profitability Metrics
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                              <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                                  <p className="text-xs font-bold text-purple-700 uppercase mb-1">Gross Margin</p>
                                  <p className="text-2xl font-bold text-gray-900">{advancedMetrics.grossMargin.toFixed(1)}%</p>
                                  <p className="text-xs text-gray-500 mt-1">Efficiency of labor/resources</p>
                              </div>
                              <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                                  <p className="text-xs font-bold text-indigo-700 uppercase mb-1">Net Margin</p>
                                  <p className="text-2xl font-bold text-gray-900">{advancedMetrics.netMargin.toFixed(1)}%</p>
                                  <p className="text-xs text-gray-500 mt-1">After all expenses</p>
                              </div>
                              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                                  <p className="text-xs font-bold text-blue-700 uppercase mb-1">Billable Utilization</p>
                                  <p className="text-2xl font-bold text-gray-900">{advancedMetrics.utilizationRate.toFixed(1)}%</p>
                                  <p className="text-xs text-gray-500 mt-1">Hours billed / Total capacity</p>
                              </div>
                               <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                                  <p className="text-xs font-bold text-emerald-700 uppercase mb-1">Cash Flow Ratio</p>
                                  <p className="text-2xl font-bold text-gray-900">{advancedMetrics.cashFlowRatio.toFixed(2)}</p>
                                  <p className="text-xs text-gray-500 mt-1">Revenue / Expenses (Target {'>'} 1)</p>
                              </div>
                          </div>
                      </div>

                      {/* Section 2: Project Profitability Table */}
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          <div className="p-4 bg-gray-50 border-b border-gray-100">
                              <h4 className="font-bold text-gray-700 text-sm">Delivery Margin by Project (Revenue vs Cost)</h4>
                          </div>
                          <div className="max-h-[300px] overflow-y-auto">
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                                      <tr>
                                          <th className="px-4 py-2">Project</th>
                                          <th className="px-4 py-2 text-right">Revenue</th>
                                          <th className="px-4 py-2 text-right">Labor Cost</th>
                                          <th className="px-4 py-2 text-right">Expenses (Incl. Pre-sales)</th>
                                          <th className="px-4 py-2 text-right">Total Profit</th>
                                          <th className="px-4 py-2 text-right">Margin</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                      {advancedMetrics.projectProfitability.map((p, idx) => (
                                          <tr key={idx} className="hover:bg-gray-50">
                                              <td className="px-4 py-2 font-medium text-gray-800">{p.name}</td>
                                              <td className="px-4 py-2 text-right text-gray-600">${p.revenue.toLocaleString()}</td>
                                              <td className="px-4 py-2 text-right text-red-500">-${p.laborCost.toLocaleString()}</td>
                                              <td className="px-4 py-2 text-right text-orange-500">-${p.otherCost.toLocaleString()}</td>
                                              <td className="px-4 py-2 text-right font-bold text-gray-800">${p.profit.toLocaleString()}</td>
                                              <td className="px-4 py-2 text-right">
                                                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${p.margin > 30 ? 'bg-green-100 text-green-700' : p.margin > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                      {p.margin.toFixed(1)}%
                                                  </span>
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>

                      {/* Section 2.5: Pre-sales Investment Chart (NEW) */}
                      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                          <div className="flex justify-between items-center mb-4">
                              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                  <Target className="text-purple-600" size={20} /> Pre-sales Investment (Top Opportunities)
                              </h3>
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Customer Acquisition Cost</span>
                          </div>
                          <div className="h-[300px] w-full">
                              {presalesStats.length > 0 ? (
                                  <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={presalesStats} margin={{top: 20, right: 30, left: 20, bottom: 5}}>
                                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                          <XAxis dataKey="name" tick={{fontSize: 12}} axisLine={false} tickLine={false} />
                                          <YAxis tickFormatter={(val) => `$${val}`} axisLine={false} tickLine={false} />
                                          <Tooltip 
                                              cursor={{fill: '#f8fafc'}}
                                              contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Spent']}
                                          />
                                          <Bar dataKey="value" name="Investment" fill="#9333ea" radius={[4, 4, 0, 0]} barSize={40}>
                                              {presalesStats.map((_, index) => (
                                                  <Cell key={`cell-${index}`} fillOpacity={0.8} />
                                              ))}
                                          </Bar>
                                      </BarChart>
                                  </ResponsiveContainer>
                              ) : (
                                  <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                      <p>No pre-sales expenses recorded yet.</p>
                                  </div>
                              )}
                          </div>
                      </div>

                       {/* Section 3: Efficiency & Growth */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                  <Activity className="text-orange-600" size={20} /> Efficiency Metrics
                              </h3>
                              <div className="space-y-3">
                                  <div className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg">
                                      <span className="text-sm text-gray-600">Sales Conversion Rate</span>
                                      <span className="font-bold text-gray-900">{advancedMetrics.conversionRate.toFixed(1)}%</span>
                                  </div>
                                  <div className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg">
                                      <span className="text-sm text-gray-600">Avg Billable Rate</span>
                                      <span className="font-bold text-gray-900">${advancedMetrics.avgBillableRate.toFixed(2)}/hr</span>
                                  </div>
                                   <div className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg">
                                      <span className="text-sm text-gray-600">Project Cost Overruns</span>
                                      <span className={`font-bold ${advancedMetrics.overrunCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                          {advancedMetrics.overrunCount} Projects
                                      </span>
                                  </div>
                              </div>
                          </div>

                          <div>
                              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                  <TrendingUp className="text-green-600" size={20} /> Growth Metrics
                              </h3>
                              <div className="space-y-3">
                                  <div className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg">
                                      <span className="text-sm text-gray-600">Customer Acquisition Cost (CAC)</span>
                                      <span className="font-bold text-gray-900">${advancedMetrics.cac.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                                  </div>
                                  <div className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg">
                                      <span className="text-sm text-gray-600">Lifetime Value (LTV Estimate)</span>
                                      <span className="font-bold text-gray-900">${advancedMetrics.ltv.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                                  </div>
                                   <div className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg">
                                      <span className="text-sm text-gray-600">Marketing Spend (YTD)</span>
                                      <span className="font-bold text-gray-900">${advancedMetrics.marketingSpend.toLocaleString()}</span>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {activeTab === 'receivables' && (
                  <div>
                      <div className="flex justify-between items-center mb-6">
                         <h3 className="text-lg font-bold text-gray-800">Accounts Receivable</h3>
                         <button
                           onClick={() => handleOpenPaymentModal()}
                           className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
                         >
                            <Plus size={16} /> Record Payment
                         </button>
                      </div>

                      {/* SECTION 1 — SERVICIOS */}
                      {(() => {
                          const serviceRows = receivablesData.filter(r => !r.isLicense);
                          if (serviceRows.length === 0) return null;
                          return (
                              <div className="mb-8">
                                  <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                                      <Briefcase size={14} /> Services
                                  </h4>
                                  <table className="w-full text-left text-sm border-collapse">
                                      <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                                          <tr>
                                              <th className="p-4 font-medium">Project</th>
                                              <th className="p-4 font-medium">Client</th>
                                              <th className="p-4 text-right">Total Receivable (Contract + Exp)</th>
                                              <th className="p-4 text-right">Total Paid</th>
                                              <th className="p-4 text-right">Balance Due</th>
                                              <th className="p-4 w-48 text-center">Payment Progress</th>
                                              <th className="p-4 text-right">Actions</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                          {serviceRows.map(r => (
                                              <tr key={r.projectId} className="hover:bg-gray-50">
                                                  <td className="p-4 font-medium text-gray-900">{r.projectName}</td>
                                                  <td className="p-4 text-gray-600">{r.clientName}</td>
                                                  <td className="p-4 text-right text-gray-900">
                                                      <div className="flex flex-col items-end">
                                                          <span>${r.totalReceivableValue.toLocaleString()}</span>
                                                          {r.billableExpenses > 0 && (
                                                              <span className="text-[10px] text-orange-600 font-medium">(Incl. ${r.billableExpenses.toLocaleString()} exp)</span>
                                                          )}
                                                      </div>
                                                  </td>
                                                  <td className="p-4 text-right text-green-600 font-medium">${r.totalPaid.toLocaleString()}</td>
                                                  <td className="p-4 text-right">
                                                      <span className={`font-bold ${r.balanceDue > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                                          ${r.balanceDue.toLocaleString()}
                                                      </span>
                                                  </td>
                                                  <td className="p-4">
                                                      <div className="flex items-center gap-2">
                                                          <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                                                              <div className="bg-green-500 h-full rounded-full" style={{ width: `${r.progress}%` }}></div>
                                                          </div>
                                                          <span className="text-xs text-gray-500 w-10 text-right">{r.progress.toFixed(0)}%</span>
                                                      </div>
                                                  </td>
                                                  <td className="p-4 text-right space-x-2">
                                                      <button
                                                        onClick={() => handleOpenPaymentHistory(r.projectId)}
                                                        className="text-gray-500 hover:text-gray-700 p-1.5 hover:bg-gray-100 rounded transition"
                                                        title="View Payment History"
                                                      >
                                                        <History size={16} />
                                                      </button>
                                                      <button
                                                        onClick={() => handleOpenPaymentModal(r.projectId)}
                                                        className="text-blue-600 hover:text-blue-800 text-xs font-medium border border-blue-200 bg-blue-50 px-3 py-1 rounded"
                                                      >
                                                        Add Payment
                                                      </button>
                                                  </td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>
                          );
                      })()}

                      {/* SECTION 2 — PROYECTOS DE LICENCIAS */}
                      {(() => {
                          const licenseRows = receivablesData.filter(r => r.isLicense);
                          if (licenseRows.length === 0) return null;
                          return (
                              <div className="mb-8">
                                  <h4 className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                                      <CreditCard size={14} /> License Projects
                                      <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">Year {selectedYear}</span>
                                  </h4>
                                  <table className="w-full text-left text-sm border-collapse">
                                      <thead className="bg-purple-50 text-purple-700 border-b border-purple-100">
                                          <tr>
                                              <th className="p-4 font-medium">Project</th>
                                              <th className="p-4 font-medium">Client</th>
                                              <th className="p-4 text-right">Incoda Margin {selectedYear}</th>
                                              <th className="p-4 text-right">Total Paid</th>
                                              <th className="p-4 text-right">Balance Due</th>
                                              <th className="p-4 w-48 text-center">Payment Progress</th>
                                              <th className="p-4 text-right">Actions</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                          {licenseRows.map(r => {
                                              const proj = projects.find(p => p.id === r.projectId);
                                              const lead = proj ? leads.find(l => l.id === proj.leadId) : null;
                                              const yearMargin = lead?.items
                                                  ?.filter(i => i.category === 'license' && i.licenseYear === selectedYear)
                                                  .reduce((sum, i) => sum + (i.unitPrice * i.quantity - i.unitCost * i.quantity), 0) ?? 0;
                                              const yearBalance = yearMargin - r.totalPaid;
                                              const yearProgress = yearMargin > 0 ? Math.min((r.totalPaid / yearMargin) * 100, 100) : 0;
                                              return (
                                              <tr key={r.projectId} className="hover:bg-purple-50/30">
                                                  <td className="p-4 font-medium text-gray-900">{r.projectName}</td>
                                                  <td className="p-4 text-gray-600">{r.clientName}</td>
                                                  <td className="p-4 text-right">
                                                      {yearMargin > 0
                                                          ? <span className="font-semibold text-purple-700">${yearMargin.toLocaleString()}</span>
                                                          : <span className="text-gray-400 text-xs">No license {selectedYear}</span>}
                                                  </td>
                                                  <td className="p-4 text-right text-green-600 font-medium">${r.totalPaid.toLocaleString()}</td>
                                                  <td className="p-4 text-right">
                                                      <span className={`font-bold ${yearBalance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                                          ${Math.max(yearBalance, 0).toLocaleString()}
                                                      </span>
                                                  </td>
                                                  <td className="p-4">
                                                      <div className="flex items-center gap-2">
                                                          <div className="flex-1 bg-purple-200 rounded-full h-2 overflow-hidden">
                                                              <div className="bg-purple-500 h-full rounded-full" style={{ width: `${yearProgress}%` }}></div>
                                                          </div>
                                                          <span className="text-xs text-gray-500 w-10 text-right">{yearProgress.toFixed(0)}%</span>
                                                      </div>
                                                  </td>
                                                  <td className="p-4 text-right space-x-2">
                                                      <button
                                                        onClick={() => handleOpenPaymentHistory(r.projectId)}
                                                        className="text-gray-500 hover:text-gray-700 p-1.5 hover:bg-gray-100 rounded transition"
                                                        title="View Payment History"
                                                      >
                                                        <History size={16} />
                                                      </button>
                                                      <button
                                                        onClick={() => handleOpenPaymentModal(r.projectId)}
                                                        className="text-purple-600 hover:text-purple-800 text-xs font-medium border border-purple-200 bg-purple-50 px-3 py-1 rounded"
                                                      >
                                                        Add Payment
                                                      </button>
                                                  </td>
                                              </tr>
                                              );
                                          })}
                                      </tbody>
                                  </table>
                              </div>
                          );
                      })()}

                  </div>
              )}

              {activeTab === 'payroll' && (
                  <div className="space-y-8">
                      {/* Section 1: Ready for Payment */}
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <CheckCircle size={18} className="text-blue-600"/> Approved Hours (Ready for Payment)
                                </h3>
                                <p className="text-sm text-gray-500">Select hours to process and pay consultants.</p>
                            </div>
                            <button 
                                onClick={handleProcessPayroll}
                                disabled={selectedPayableLogs.length === 0}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                <DollarSign size={16} /> Process Payment
                            </button>
                        </div>

                        {payableApprovedLogs.length > 0 ? (
                             <table className="w-full text-left text-sm bg-white rounded-lg overflow-hidden border border-blue-100">
                                <thead className="bg-blue-100/50 text-blue-800">
                                    <tr>
                                        <th className="p-3 w-10">
                                            <input 
                                              type="checkbox" 
                                              onChange={(e) => {
                                                  if(e.target.checked) setSelectedPayableLogs(payableApprovedLogs.map(l => l.id));
                                                  else setSelectedPayableLogs([]);
                                              }}
                                              checked={selectedPayableLogs.length === payableApprovedLogs.length && payableApprovedLogs.length > 0}
                                            />
                                        </th>
                                        <th className="p-3 font-medium">Date</th>
                                        <th className="p-3 font-medium">Consultant</th>
                                        <th className="p-3 font-medium">Project</th>
                                        <th className="p-3 text-right">Hours</th>
                                        <th className="p-3 text-right">Approved Rate</th>
                                        <th className="p-3 text-right">Total Cost</th>
                                        <th className="p-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-blue-50">
                                    {payableApprovedLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-blue-50/30 group">
                                            <td className="p-3">
                                                <input
                                                  type="checkbox"
                                                  checked={selectedPayableLogs.includes(log.id)}
                                                  onChange={(e) => {
                                                      if(e.target.checked) setSelectedPayableLogs([...selectedPayableLogs, log.id]);
                                                      else setSelectedPayableLogs(selectedPayableLogs.filter(id => id !== log.id));
                                                  }}
                                                />
                                            </td>
                                            <td className="p-3 text-gray-600">{new Date(log.date).toLocaleDateString()}</td>
                                            <td className="p-3 font-medium text-gray-900">{log.consultantName}</td>
                                            <td className="p-3 text-gray-600">{log.projectName}</td>
                                            <td className="p-3 text-right">{log.hours}</td>
                                            <td className="p-3 text-right text-gray-500">${log.rate}</td>
                                            <td className="p-3 text-right font-bold text-blue-700">${log.totalCost.toLocaleString()}</td>
                                            <td className="p-3 text-right">
                                                <button
                                                    onClick={() => handleRevertToPending(log.id)}
                                                    className="opacity-0 group-hover:opacity-100 transition text-xs text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2 py-1 rounded whitespace-nowrap"
                                                    title="Revertir a pendiente"
                                                >
                                                    → Pendiente
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                             </table>
                        ) : (
                            <div className="text-center py-6 text-gray-400 bg-white rounded-lg border border-dashed border-gray-200">
                                No approved hours waiting for payment.
                            </div>
                        )}

                        {/* Summary by consultant */}
                        {payableApprovedLogs.length > 0 && (() => {
                            const byConsultant: Record<string, { hours: number; total: number }> = {};
                            payableApprovedLogs.forEach(log => {
                                if (!byConsultant[log.consultantName]) byConsultant[log.consultantName] = { hours: 0, total: 0 };
                                byConsultant[log.consultantName].hours += log.hours;
                                byConsultant[log.consultantName].total += log.totalCost;
                            });
                            const grandTotal = Object.values(byConsultant).reduce((s, v) => s + v.total, 0);
                            return (
                                <div className="mt-4 bg-white border border-blue-100 rounded-lg overflow-hidden">
                                    <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                                        <Users size={14} className="text-blue-600" />
                                        <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">Resumen por consultor</span>
                                    </div>
                                    <div className="divide-y divide-gray-50">
                                        {Object.entries(byConsultant).sort((a, b) => b[1].total - a[1].total).map(([name, data]) => (
                                            <div key={name} className="flex items-center justify-between px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-gray-800">{name}</span>
                                                    <span className="text-xs text-gray-400">{data.hours.toFixed(1)} h</span>
                                                </div>
                                                <span className="text-sm font-bold text-blue-700">${data.total.toLocaleString()}</span>
                                            </div>
                                        ))}
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50">
                                            <span className="text-sm font-bold text-gray-700">Total pendiente</span>
                                            <span className="text-sm font-bold text-blue-800">${grandTotal.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Processed Payment History Table (Detailed Logs) */}
                        <div className="mt-8 border-t border-blue-200 pt-6">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                    <History size={16} /> Paid Hours History
                                </h4>
                                <div className="flex items-center gap-2">
                                     <label className="text-xs text-gray-500 font-medium">Min. Hours Filter:</label>
                                     <input 
                                        type="number" 
                                        min="0"
                                        className="w-20 border border-gray-300 rounded p-1 text-xs"
                                        value={minHoursFilter}
                                        onChange={(e) => setMinHoursFilter(Number(e.target.value))}
                                     />
                                </div>
                            </div>

                            {paidTimeLogsHistory.length > 0 ? (
                                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-h-[400px] overflow-y-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 text-gray-500 border-b border-gray-100 sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3 font-medium">Date</th>
                                                <th className="px-4 py-3 font-medium">Consultant</th>
                                                <th className="px-4 py-3 font-medium">Project</th>
                                                <th className="px-4 py-3 text-right font-medium">Hours</th>
                                                <th className="px-4 py-3 text-right font-medium">Rate</th>
                                                <th className="px-4 py-3 text-right font-medium">Paid</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {paidTimeLogsHistory.map(l => (
                                                <tr key={l.id} className="hover:bg-gray-50 group">
                                                    <td className="px-4 py-3 text-gray-600">{new Date(l.date).toLocaleDateString()}</td>
                                                    <td className="px-4 py-3 font-medium text-gray-800">{l.consultantName}</td>
                                                    <td className="px-4 py-3 text-gray-500">{l.projectName}</td>
                                                    <td className="px-4 py-3 text-right font-mono">{l.hours}</td>
                                                    <td className="px-4 py-3 text-right text-gray-400 text-xs">${l.rate}/h</td>
                                                    <td className="px-4 py-3 text-right font-bold text-gray-700">
                                                        ${l.totalCost.toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            onClick={() => handleReversePayment(l.id)}
                                                            className="opacity-0 group-hover:opacity-100 transition text-xs text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2 py-1 rounded flex items-center gap-1 whitespace-nowrap"
                                                            title="Reversar pago"
                                                        >
                                                            <RefreshCw size={11} /> Reversar
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-6 text-center text-gray-400 bg-gray-50 rounded-lg border border-gray-100 italic">
                                    No paid logs matching filter criteria found.
                                </div>
                            )}
                        </div>
                      </div>

                      {/* Section 2: Historical / Fixed Payroll */}
                      <div>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800">Fixed Salaries & Payroll Summary</h3>
                            <button 
                                onClick={() => setShowSalaryModal(true)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100"
                            >
                                <Edit2 size={14} /> Manage Base Salaries
                            </button>
                        </div>
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-gray-50 text-gray-500">
                                <tr>
                                    <th className="p-3 font-medium">Employee / Consultant</th>
                                    <th className="p-3 font-medium">Type</th>
                                    <th className="p-3 text-right">Rate / Salary (Effective)</th>
                                    <th className="p-3 text-right">Total Cost ({selectedMonth === -1 ? 'Annual' : MONTHS[selectedMonth]})</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {payrollHistory.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="p-3 font-medium text-gray-900 flex items-center gap-2">
                                            <Users size={16} className="text-gray-400" /> {item.name}
                                        </td>
                                        <td className="p-3 text-gray-500">{item.type}</td>
                                        <td className="p-3 text-right text-gray-500">{item.rate}</td>
                                        <td className="p-3 text-right font-bold text-gray-800">${item.cost.toLocaleString()}</td>
                                    </tr>
                                ))}
                                <tr className="bg-gray-50 font-bold border-t border-gray-200">
                                    <td colSpan={3} className="p-3 text-right">Total Payroll (Fixed + Paid Variable):</td>
                                    <td className="p-3 text-right text-blue-600">
                                        ${payrollHistory.reduce((a, b) => a + b.cost, 0).toLocaleString()}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                      </div>
                  </div>
              )}

              {/* EXPENSES TAB */}
              {activeTab === 'expenses' && (
                  <div className="space-y-8">
                      {/* ANALYTICS SECTION */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          
                          {/* Left: Spend by Category (Pie) */}
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                              <div className="flex items-center justify-between mb-2">
                                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                      <PieChart size={18} className="text-purple-600" /> Spend by Category
                                  </h3>
                                  <span className="text-sm font-bold text-gray-700">
                                      ${expenseAnalytics.categoryData.reduce((s, d) => s + d.value, 0).toLocaleString()}
                                  </span>
                              </div>
                              <div className="h-[250px]">
                                  {expenseAnalytics.categoryData.length > 0 ? (
                                      <ResponsiveContainer width="100%" height="100%">
                                          <RePieChart>
                                              <Pie
                                                  data={expenseAnalytics.categoryData}
                                                  cx="50%"
                                                  cy="50%"
                                                  innerRadius={60}
                                                  outerRadius={80}
                                                  fill="#8884d8"
                                                  paddingAngle={2}
                                                  dataKey="value"
                                              >
                                                  {expenseAnalytics.categoryData.map((_, index) => (
                                                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                  ))}
                                              </Pie>
                                              <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                                              <Legend
                                                  layout="vertical"
                                                  verticalAlign="middle"
                                                  align="right"
                                                  wrapperStyle={{fontSize: '11px'}}
                                                  formatter={(value: string, _: unknown, index: number) => {
                                                      const item = expenseAnalytics.categoryData[index];
                                                      return `${value} — $${item?.value.toLocaleString() ?? 0}`;
                                                  }}
                                              />
                                          </RePieChart>
                                      </ResponsiveContainer>
                                  ) : (
                                      <div className="h-full flex items-center justify-center text-gray-400 text-sm">No expense data for this period.</div>
                                  )}
                              </div>
                          </div>

                          {/* Right: Spend by Project (Bar) */}
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                              <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                                  <Layers size={18} className="text-blue-600" /> Expense Allocation by Project
                              </h3>
                              <div className="h-[250px]">
                                  {expenseAnalytics.projectData.length > 0 ? (
                                      <ResponsiveContainer width="100%" height="100%">
                                          <BarChart data={expenseAnalytics.projectData} layout="vertical" margin={{top: 5, right: 30, left: 40, bottom: 5}}>
                                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                                              <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(val) => `$${val/1000}k`} tick={{fontSize: 10}} />
                                              <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{fontSize: 11, fontWeight: 500}} />
                                              <Tooltip 
                                                  cursor={{fill: '#f9fafb'}}
                                                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Expense']}
                                              />
                                              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                                          </BarChart>
                                      </ResponsiveContainer>
                                  ) : (
                                      <div className="h-full flex items-center justify-center text-gray-400 text-sm">No project expenses linked.</div>
                                  )}
                              </div>
                          </div>
                      </div>

                      {/* Spend by Consultant (full-width bar chart) */}
                      {expenseAnalytics.consultantData.length > 0 && (
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                              <div className="flex items-center justify-between mb-2">
                                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                      <Users size={18} className="text-indigo-600" /> Spend by Consultant
                                  </h3>
                                  <span className="text-sm font-bold text-gray-700">
                                      ${expenseAnalytics.consultantData.reduce((s, d) => s + d.value, 0).toLocaleString()}
                                  </span>
                              </div>
                              <div className="h-[220px]">
                                  <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={expenseAnalytics.consultantData} layout="vertical" margin={{top: 5, right: 30, left: 60, bottom: 5}}>
                                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                                          <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(val) => `$${val >= 1000 ? (val/1000).toFixed(1) + 'k' : val}`} tick={{fontSize: 10}} />
                                          <YAxis dataKey="name" type="category" width={110} axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600}} />
                                          <Tooltip
                                              cursor={{fill: '#eef2ff'}}
                                              contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Total Gastos']}
                                          />
                                          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                                              {expenseAnalytics.consultantData.map((_, index) => (
                                                  <Cell key={`cell-c-${index}`} fill={COLORS[index % COLORS.length]} />
                                              ))}
                                          </Bar>
                                      </BarChart>
                                  </ResponsiveContainer>
                              </div>
                          </div>
                      )}

                      {/* SUMMARY CARDS */}
                      <div className="grid grid-cols-4 gap-4">
                          <div className="bg-red-50 border border-red-100 p-4 rounded-lg">
                              <p className="text-xs text-red-600 font-bold uppercase">Total Expenses</p>
                              <p className="text-xl font-bold text-red-700 mt-1">
                                  ${filteredTransactions.reduce((acc, t) => acc + t.amount, 0).toLocaleString()}
                              </p>
                          </div>
                          <div className="bg-purple-50 border border-purple-100 p-4 rounded-lg">
                              <p className="text-xs text-purple-600 font-bold uppercase">Top Category</p>
                              <p className="text-sm font-bold text-purple-800 mt-1 truncate">
                                  {expenseAnalytics.categoryData[0]?.name || 'N/A'}
                              </p>
                              <p className="text-xs text-purple-500">
                                  ${expenseAnalytics.categoryData[0]?.value.toLocaleString() || 0}
                              </p>
                          </div>
                          <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg">
                              <p className="text-xs text-blue-600 font-bold uppercase">Highest Spender (Project)</p>
                              <p className="text-sm font-bold text-blue-800 mt-1 truncate">
                                  {expenseAnalytics.projectData[0]?.name || 'N/A'}
                              </p>
                              <p className="text-xs text-blue-500">
                                  ${expenseAnalytics.projectData[0]?.value.toLocaleString() || 0}
                              </p>
                          </div>
                          <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg">
                              <p className="text-xs text-indigo-600 font-bold uppercase">Top Consultant</p>
                              <p className="text-sm font-bold text-indigo-800 mt-1 truncate">
                                  {expenseAnalytics.consultantData[0]?.name || 'N/A'}
                              </p>
                              <p className="text-xs text-indigo-500">
                                  ${expenseAnalytics.consultantData[0]?.value.toLocaleString() || 0}
                              </p>
                          </div>
                      </div>

                      <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-bold text-gray-800">Operational Expenses Log</h3>
                      </div>
                      <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-gray-50 text-gray-500">
                                <tr>
                                    <th className="p-3 font-medium">Date</th>
                                    <th className="p-3 font-medium">Title</th>
                                    <th className="p-3 font-medium">Project Link</th>
                                    <th className="p-3 font-medium">Category</th>
                                    <th className="p-3 font-medium">Description</th>
                                    <th className="p-3 font-medium">Consultant</th>
                                    <th className="p-3 text-right">Amount</th>
                                    <th className="p-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredTransactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => {
                                    const linkedProject = t.projectId ? projects.find(p => p.id === t.projectId) : null;
                                    const linkedLead = t.leadId ? leads.find(l => l.id === t.leadId) : null;

                                    const linkedConsultant = t.consultantId ? users.find(u => u.id === t.consultantId) : null;

                                    return (
                                        <tr key={t.id} className="hover:bg-gray-50">
                                            <td className="p-3 text-gray-600">{new Date(t.date).toLocaleDateString()}</td>
                                            <td className="p-3 font-medium text-gray-900">{t.title}</td>
                                            <td className="p-3">
                                                {linkedProject ? (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit">
                                                            <Briefcase size={12} /> {linkedProject.name}
                                                        </span>
                                                        {t.isBillable && (
                                                            <span className="text-[10px] text-orange-600 font-bold ml-1">
                                                                (Billable to Client)
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : linkedLead ? (
                                                    <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded w-fit font-medium">
                                                        <Target size={12} /> {linkedLead.companyName} (Pre-sales)
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-400">General</span>
                                                )}
                                            </td>
                                            <td className="p-3"><span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs capitalize">{t.category.replace('_', ' ')}</span></td>
                                            <td className="p-3 text-gray-500 truncate max-w-xs">{t.description}</td>
                                            <td className="p-3">
                                                {linkedConsultant ? (
                                                    <span className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit font-medium">
                                                        <Users size={12} /> {linkedConsultant.name}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-right font-medium text-red-600">-${t.amount.toLocaleString()}</td>
                                            <td className="p-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => { setExpenseToEdit(t); setEditLeadId(t.leadId || ''); setEditConsultantId(t.consultantId || ''); }}
                                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                                                        title="Assign to Lead"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteExpense(t.id)}
                                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                                        title="Delete Expense"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                  </div>
              )}
          </div>
      </div>

      {/* Edit Expense — Assign to Lead Modal */}
      {expenseToEdit && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Edit2 size={18} /> Editar Expense</h3>
                      <button onClick={() => setExpenseToEdit(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                  </div>
                  <p className="text-sm text-gray-500 mb-1 truncate font-medium">{expenseToEdit.title}</p>
                  <p className="text-xs text-gray-400 mb-4">${expenseToEdit.amount.toLocaleString()} · {expenseToEdit.date}</p>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Target size={14} /> Asignar a Lead (Pre-sales)</label>
                          <select
                              className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                              value={editLeadId}
                              onChange={e => setEditLeadId(e.target.value)}
                          >
                              <option value="">— Sin asignar —</option>
                              {leads.filter(l => l.stage !== 'closed-lost').map(l => (
                                  <option key={l.id} value={l.id}>{l.companyName} ({l.stage})</option>
                              ))}
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Users size={14} /> Consultant (opcional)</label>
                          <select
                              className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                              value={editConsultantId}
                              onChange={e => setEditConsultantId(e.target.value)}
                          >
                              <option value="">— Sin asignar —</option>
                              {users.filter(u => ['admin', 'sales', 'consultant'].includes(u.role)).map(u => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                          </select>
                      </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                      <button type="button" onClick={() => setExpenseToEdit(null)} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
                      <button
                          type="button"
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2"
                          onClick={() => {
                              onUpdateTransaction({ ...expenseToEdit, leadId: editLeadId || undefined, consultantId: editConsultantId || undefined });
                              setExpenseToEdit(null);
                          }}
                      >
                          <Save size={16} /> Guardar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Delete Confirmation Modal */}
      {expenseToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
                  <div className="flex flex-col items-center text-center">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                          <Trash2 size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Expense?</h3>
                      <p className="text-sm text-gray-500 mb-6">
                          Are you sure you want to remove this expense record? This action cannot be undone.
                      </p>
                      <div className="flex gap-3 w-full">
                          <button 
                              onClick={() => setExpenseToDelete(null)}
                              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
                          >
                              Cancel
                          </button>
                          <button 
                              onClick={confirmDeleteExpense}
                              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
                          >
                              Delete
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Modals for Expense */}
      {showExpenseModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Register New Expense</h3>
                  <form onSubmit={handleSaveExpense} className="space-y-4">
                      {/* Form content */}
                       <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Expense Title</label>
                          <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" value={newExpense.title} onChange={e => setNewExpense({...newExpense, title: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                              <input required type="number" min="0" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: Number(e.target.value)})} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                              <input required type="date" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})} />
                          </div>
                      </div>
                      
                      {/* LINK TYPE SELECTOR (New) */}
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Expense Context</label>
                          <div className="flex gap-2 mb-3">
                              <button 
                                type="button" 
                                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition ${expenseLinkType === 'general' ? 'bg-gray-100 text-gray-800 border-gray-300' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                onClick={() => setExpenseLinkType('general')}
                              >
                                  General
                              </button>
                              <button 
                                type="button" 
                                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition ${expenseLinkType === 'project' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                onClick={() => setExpenseLinkType('project')}
                              >
                                  Project
                              </button>
                              <button 
                                type="button" 
                                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition ${expenseLinkType === 'lead' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                onClick={() => setExpenseLinkType('lead')}
                              >
                                  Pre-sales
                              </button>
                          </div>

                          {/* Dynamic Dropdowns based on context */}
                          {expenseLinkType === 'project' && (
                              <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                                  <label className="block text-xs font-medium text-blue-800 mb-1 flex items-center gap-1">
                                     <Briefcase size={12} /> Select Active Project
                                  </label>
                                  <select 
                                    className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white mb-2"
                                    value={newExpense.projectId}
                                    onChange={(e) => setNewExpense({...newExpense, projectId: e.target.value})}
                                  >
                                     <option value="">-- Choose Project --</option>
                                     {projects.map(p => (
                                         <option key={p.id} value={p.id}>{p.name}</option>
                                     ))}
                                  </select>
                                  <div className="flex items-center gap-2 mt-2">
                                      <input 
                                        type="checkbox" 
                                        id="isBillable"
                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        checked={newExpense.isBillable}
                                        onChange={(e) => setNewExpense({...newExpense, isBillable: e.target.checked})}
                                      />
                                      <label htmlFor="isBillable" className="text-xs text-gray-700">
                                          Billable to Client? (Affects AR)
                                      </label>
                                  </div>
                              </div>
                          )}

                          {expenseLinkType === 'lead' && (
                              <div className="bg-purple-50/50 p-3 rounded-lg border border-purple-100">
                                  <label className="block text-xs font-medium text-purple-800 mb-1 flex items-center gap-1">
                                     <Target size={12} /> Select Opportunity (Lead)
                                  </label>
                                  <select 
                                    className="w-full border border-purple-200 rounded-lg p-2 text-sm bg-white"
                                    value={newExpense.leadId}
                                    onChange={(e) => setNewExpense({...newExpense, leadId: e.target.value})}
                                  >
                                     <option value="">-- Choose Lead --</option>
                                     {leads.filter(l => l.stage !== 'closed-lost').map(l => (
                                         <option key={l.id} value={l.id}>{l.companyName} ({l.stage})</option>
                                     ))}
                                  </select>
                                  <p className="text-[10px] text-purple-600 mt-1">
                                      Expenses linked here will be tracked as Customer Acquisition Cost.
                                  </p>
                              </div>
                          )}
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                          <select className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white" value={newExpense.category} onChange={e => setNewExpense({...newExpense, category: e.target.value as ExpenseCategory, consultantId: ''})}>
                              <option value="credit_card">Credit Card</option>
                              <option value="office">Office Supplies</option>
                              <option value="software">Software/SaaS</option>
                              <option value="marketing">Marketing</option>
                              <option value="salary">Salary</option>
                              <option value="other">Other</option>
                          </select>
                      </div>
                      {newExpense.category === 'credit_card' && (
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Users size={14} /> Consultant (opcional)</label>
                              <select
                                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                                  value={newExpense.consultantId}
                                  onChange={e => setNewExpense({...newExpense, consultantId: e.target.value})}
                              >
                                  <option value="">— Sin asignar —</option>
                                  {users.map(u => (
                                      <option key={u.id} value={u.id}>{u.name}</option>
                                  ))}
                              </select>
                          </div>
                      )}
                      <div className="flex justify-end gap-3 pt-2">
                          <button type="button" onClick={() => setShowExpenseModal(false)} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
                          <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 flex items-center gap-2"><Save size={16} /> Save Expense</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {showCCImportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><CreditCard size={20} /> Import Credit Card Expenses</h3>
                      <button onClick={() => setShowCCImportModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">Upload a CSV with columns: <code className="bg-gray-100 px-1 rounded">Transaction Date</code>, <code className="bg-gray-100 px-1 rounded">Description</code>, <code className="bg-gray-100 px-1 rounded">Amount</code>. Negative amounts will be converted automatically.</p>
                  <input
                      type="file"
                      accept=".csv"
                      className="w-full border border-gray-300 rounded-lg p-2 text-sm mb-3"
                      onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = ev => {
                              try {
                                  const text = ev.target?.result as string;
                                  const lines = text.trim().split('\n');
                                  const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                                  const dateIdx = header.findIndex(h => h.toLowerCase().includes('date'));
                                  const descIdx = header.findIndex(h => h.toLowerCase().includes('description'));
                                  const amtIdx = header.findIndex(h => h.toLowerCase().includes('amount'));
                                  if (dateIdx === -1 || descIdx === -1 || amtIdx === -1) {
                                      setCCImportError('CSV must have columns: Transaction Date, Description, Amount');
                                      setCCImportRows([]);
                                      return;
                                  }
                                  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
                                      const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
                                      const rawDate = cols[dateIdx] || '';
                                      const parts = rawDate.split('/');
                                      const isoDate = parts.length === 3
                                          ? `${parts[2].padStart(4,'0')}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`
                                          : rawDate;
                                      const rawAmt = parseFloat(cols[amtIdx].replace(/[^0-9.-]/g, '')) || 0;
                                      return { date: isoDate, description: cols[descIdx] || '', amount: Math.abs(rawAmt) };
                                  });
                                  setCCImportError('');
                                  setCCImportRows(rows);
                              } catch {
                                  setCCImportError('Error parsing CSV. Please check the file format.');
                                  setCCImportRows([]);
                              }
                          };
                          reader.readAsText(file);
                      }}
                  />
                  {ccImportError && <p className="text-red-600 text-sm mb-3">{ccImportError}</p>}
                  {ccImportRows.length > 0 && (
                      <div className="mb-4">
                          <p className="text-sm font-medium text-gray-700 mb-2">{ccImportRows.length} transactions found — preview:</p>
                          <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                              <table className="w-full text-xs">
                                  <thead className="bg-gray-50 sticky top-0">
                                      <tr>
                                          <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                                          <th className="px-3 py-2 text-left font-medium text-gray-600">Description</th>
                                          <th className="px-3 py-2 text-right font-medium text-gray-600">Amount</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                      {ccImportRows.map((r, i) => (
                                          <tr key={i} className="hover:bg-gray-50">
                                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.date}</td>
                                              <td className="px-3 py-2 text-gray-800">{r.description}</td>
                                              <td className="px-3 py-2 text-right font-medium text-red-600">${r.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  )}
                  <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Users size={14} /> Asignar a usuario</label>
                      <select
                          className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                          value={ccImportConsultantId}
                          onChange={e => setCCImportConsultantId(e.target.value)}
                      >
                          <option value="">— Sin asignar —</option>
                          {users.map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                      </select>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                      <button type="button" onClick={() => setShowCCImportModal(false)} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
                      {ccImportRows.length > 0 && (
                          <button
                              type="button"
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2"
                              onClick={() => {
                                  ccImportRows.forEach((r, i) => {
                                      onAddTransaction({
                                          id: `tx_cc_${Date.now()}_${i}`,
                                          title: r.description,
                                          amount: r.amount,
                                          date: r.date,
                                          type: 'expense',
                                          category: 'credit_card',
                                          description: '',
                                          consultantId: ccImportConsultantId || undefined
                                      });
                                  });
                                  setShowCCImportModal(false);
                                  setCCImportRows([]);
                                  setCCImportConsultantId('');
                              }}
                          >
                              <Save size={16} /> Import {ccImportRows.length} Expenses
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )}

      {showPaymentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Record Client Payment</h3>
                  <form onSubmit={handleSavePayment} className="space-y-4">
                      {/* Form content */}
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Project / Invoice</label>
                          <select 
                            className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                            value={selectedProjectForPayment}
                            onChange={e => setSelectedProjectForPayment(e.target.value)}
                          >
                             {receivablesData.map(r => (
                                 <option key={r.projectId} value={r.projectId}>
                                     {r.projectName} - Bal: ${r.balanceDue.toLocaleString()}
                                 </option>
                             ))}
                          </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid ($)</label>
                              <input required type="number" min="0" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" value={newPayment.amount} onChange={e => setNewPayment({...newPayment, amount: Number(e.target.value)})} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                              <input required type="date" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" value={newPayment.date} onChange={e => setNewPayment({...newPayment, date: e.target.value})} />
                          </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                          <button type="button" onClick={() => setShowPaymentModal(false)} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
                          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2"><CheckCircle size={16} /> Confirm Payment</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Payment History & Revert Modal */}
      {showHistoryModal && historyProject && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                      <div>
                          <h3 className="text-lg font-bold text-gray-900">Payment History</h3>
                          <p className="text-sm text-gray-500">{historyProject.name}</p>
                      </div>
                      <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-gray-600">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="max-h-[400px] overflow-y-auto">
                      {historyProject.payments && historyProject.payments.length > 0 ? (
                          <table className="w-full text-left text-sm">
                              <thead className="bg-gray-50 text-gray-500 sticky top-0">
                                  <tr>
                                      <th className="p-3 font-medium">Date</th>
                                      <th className="p-3 font-medium">Reference</th>
                                      <th className="p-3 text-right">Amount</th>
                                      <th className="p-3 text-center">Action</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {historyProject.payments.map(payment => (
                                      <tr key={payment.id} className="hover:bg-gray-50">
                                          <td className="p-3 text-gray-600">{new Date(payment.date).toLocaleDateString()}</td>
                                          <td className="p-3 text-gray-800">{payment.reference || '-'}</td>
                                          <td className="p-3 text-right font-medium text-green-600">${payment.amount.toLocaleString()}</td>
                                          <td className="p-3 text-center">
                                              <button 
                                                  onClick={() => handleDeletePayment(payment.id)}
                                                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition"
                                                  title="Revert Payment"
                                              >
                                                  <Trash2 size={16} />
                                              </button>
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      ) : (
                          <p className="text-center py-8 text-gray-400 italic">No payments recorded for this project.</p>
                      )}
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                      <button 
                          onClick={() => setShowHistoryModal(false)}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                      >
                          Close
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      {showSalaryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-6">
                  <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                      <div>
                          <h3 className="text-lg font-bold text-gray-900">Manage Fixed Salaries</h3>
                          <p className="text-xs text-gray-500">Changes here apply from the effective date onwards, preserving historical data.</p>
                      </div>
                      <button onClick={() => { setShowSalaryModal(false); setSalaryEdits({}); }} className="text-gray-400 hover:text-gray-600">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="max-h-[500px] overflow-y-auto space-y-4">
                      {users.filter(u => ['admin', 'sales', 'consultant'].includes(u.role)).map(user => {
                          const isEditing = salaryEdits[user.id] !== undefined;
                          
                          return (
                          <div key={user.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                              <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 font-bold">
                                          {user.name.charAt(0)}
                                      </div>
                                      <div>
                                          <p className="font-bold text-gray-900">{user.name}</p>
                                          <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                                      </div>
                                  </div>
                                  
                                  {!isEditing ? (
                                      <button 
                                        onClick={() => initSalaryEdit(user)}
                                        className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-xs font-medium border border-blue-200"
                                      >
                                          Edit Salary
                                      </button>
                                  ) : (
                                      <div className="flex gap-2">
                                          <button onClick={() => handleSaveSalaryChange(user)} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200" title="Save Change">
                                              <Save size={16} />
                                          </button>
                                          <button onClick={() => { const newEdits = {...salaryEdits}; delete newEdits[user.id]; setSalaryEdits(newEdits); }} className="p-1.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300" title="Cancel">
                                              <X size={16} />
                                          </button>
                                      </div>
                                  )}
                              </div>

                              {isEditing ? (
                                  <div className="grid grid-cols-2 gap-4 mt-3 bg-white p-3 rounded border border-blue-200">
                                      <div>
                                          <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">New Amount ($)</label>
                                          <input 
                                              type="number" 
                                              min="0"
                                              className="w-full border border-gray-300 rounded p-1.5 text-sm"
                                              value={salaryEdits[user.id].amount}
                                              onChange={(e) => updateSalaryEdit(user.id, 'amount', Number(e.target.value))}
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Effective Date</label>
                                          <input 
                                              type="date" 
                                              className="w-full border border-gray-300 rounded p-1.5 text-sm"
                                              value={salaryEdits[user.id].date}
                                              onChange={(e) => updateSalaryEdit(user.id, 'date', e.target.value)}
                                          />
                                      </div>
                                  </div>
                              ) : (
                                  <div className="flex items-center gap-4 text-sm mt-1">
                                      <div className="flex items-center gap-1">
                                          <span className="text-gray-500">Current:</span>
                                          <span className="font-bold text-gray-900">${(user.monthlySalary || 0).toLocaleString()}</span>
                                      </div>
                                      {user.salaryHistory && user.salaryHistory.length > 0 && (
                                          <div className="text-xs text-gray-400 italic">
                                              Last changed: {new Date(user.salaryHistory[user.salaryHistory.length-1].effectiveDate).toLocaleDateString()}
                                          </div>
                                      )}
                                  </div>
                              )}
                          </div>
                      )})}
                  </div>

                  <div className="mt-6 flex justify-end">
                      <button 
                        onClick={() => setShowSalaryModal(false)}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
                      >
                          Done
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
