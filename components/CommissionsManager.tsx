
import React, { useMemo, useState } from 'react';
import { Project, Lead, Transaction, User } from '../types';
import {
  DollarSign, TrendingUp, Building2, Users, ChevronDown, ChevronRight,
  CheckCircle, Clock, History, Plus, X, Percent, Wallet, Crown, Split
} from 'lucide-react';

interface CommissionsManagerProps {
  projects: Project[];
  leads: Lead[];
  transactions: Transaction[];
  users: User[];
  onAddTransaction: (t: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

interface PaymentLine {
  key: string;
  label: string;
  amount: number;
  colorClass: string;
  badgeClass: string;
}

interface ProjectCommission {
  project: Project;
  lead: Lead | undefined;
  soldValue: number;
  laborCost: number;
  expenses: number;
  totalCost: number;
  netUtility: number;
  commissionRate: number;
  commissionAmount: number;
  incodaUtility: number;
  bmRetained: number;
  fabianShare: number;
  spencerShare: number;
  paymentLines: PaymentLine[];
}

interface InlineFormState {
  projectId: string;
  recipientKey: string;
  date: string;
  reference: string;
}

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const TODAY = new Date().toISOString().split('T')[0];
const CURRENT_YEAR = new Date().getFullYear();

export const CommissionsManager: React.FC<CommissionsManagerProps> = ({
  projects,
  leads,
  transactions,
  users,
  onAddTransaction,
  onDeleteTransaction,
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [inlineForm, setInlineForm] = useState<InlineFormState | null>(null);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    leads.forEach(l => {
      if (l.expectedCloseDate) years.add(Number(l.expectedCloseDate.substring(0, 4)));
    });
    if (years.size === 0) years.add(CURRENT_YEAR);
    return Array.from(years).sort((a, b) => b - a);
  }, [leads]);

  // Filter projects by associated lead's expectedCloseDate year
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const lead = leads.find(l => l.id === p.leadId);
      if (!lead?.expectedCloseDate) return false;
      return Number(lead.expectedCloseDate.substring(0, 4)) === selectedYear;
    });
  }, [projects, leads, selectedYear]);

  // Compute commission data per project
  const commissionsData = useMemo((): ProjectCommission[] => {
    return filteredProjects.map(project => {
      const lead = leads.find(l => l.id === project.leadId);

      // soldValue — use project.value if available (set at project creation)
      // Otherwise fall back to legacy calculation for backward compatibility
      let soldValue = project.value || 0;

      if (!soldValue && lead) {
        const hasLicenseItems = lead?.items?.some(i => i.category === 'license');
        soldValue = hasLicenseItems
          ? (lead?.items?.reduce((sum, item) =>
              item.category === 'license'
                ? sum + (item.unitPrice * item.quantity - item.unitCost * item.quantity)
                : sum + item.total,
              0) ?? 0)
          : (lead.closedValue || lead.value) || 0;
      }

      // laborCost
      const laborCost = (project.timeLogs || []).reduce((sum, log) => {
        if (log.approvedCost) return sum + log.approvedCost;
        const user = users.find(u => u.name === log.consultantName);
        return sum + log.hours * (user?.hourlyCost ?? 0);
      }, 0);

      // expenses
      const expenseTransactions = transactions.filter(t =>
        t.type === 'expense' &&
        (t.projectId === project.id || (t.leadId && t.leadId === project.leadId))
      );
      const expenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);

      const totalCost = laborCost + expenses + (project.budgetedCost || 0);
      const netUtility = soldValue - totalCost;

      const commissionRate = project.factoryCommissionRate ?? 10;
      const commissionAmount = netUtility > 0 ? netUtility * (commissionRate / 100) : 0;
      const incodaUtility = netUtility - commissionAmount;
      const bmRetained = incodaUtility * 0.40;
      const fabianShare = incodaUtility * 0.30;
      const spencerShare = incodaUtility * 0.30;

      const paymentLines: PaymentLine[] = [
        {
          key: 'Factory Commission',
          label: 'Factory Commission',
          amount: commissionAmount,
          colorClass: 'text-orange-600',
          badgeClass: 'bg-orange-100 text-orange-700',
        },
        {
          key: 'Profit: Fabian Rojas',
          label: 'Profit: Fabian Rojas',
          amount: fabianShare,
          colorClass: 'text-indigo-600',
          badgeClass: 'bg-indigo-100 text-indigo-700',
        },
        {
          key: 'Profit: Spencer',
          label: 'Profit: Spencer',
          amount: spencerShare,
          colorClass: 'text-teal-600',
          badgeClass: 'bg-teal-100 text-teal-700',
        },
      ];

      return {
        project,
        lead,
        soldValue,
        laborCost,
        expenses,
        totalCost,
        netUtility,
        commissionRate,
        commissionAmount,
        incodaUtility,
        bmRetained,
        fabianShare,
        spencerShare,
        paymentLines,
      };
    });
  }, [filteredProjects, leads, transactions, users]);

  // Payment lookup helper
  const isPaid = (projectId: string, recipientKey: string): Transaction | undefined => {
    return transactions.find(
      t =>
        t.projectId === projectId &&
        t.type === 'expense' &&
        t.category === 'consultant_payment' &&
        t.description?.includes(recipientKey)
    );
  };

  // KPI totals
  const kpis = useMemo(() => {
    let totalCommissions = 0;
    let totalBMUtility = 0;
    let totalDistributed = 0;
    let totalPending = 0;

    commissionsData.forEach(d => {
      totalCommissions += d.commissionAmount;
      totalBMUtility += d.incodaUtility;
      totalDistributed += d.fabianShare + d.spencerShare;

      d.paymentLines.forEach(line => {
        const paid = isPaid(d.project.id, line.key);
        if (!paid) totalPending += line.amount;
      });
    });

    return { totalCommissions, totalBMUtility, totalDistributed, totalPending };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commissionsData, transactions]);

  // Commission payment history
  const paymentHistory = useMemo(() => {
    return transactions
      .filter(
        t =>
          t.category === 'consultant_payment' &&
          t.type === 'expense' &&
          (t.description?.includes('Factory Commission') || t.description?.includes('Profit:'))
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  const toggleRow = (id: string) => {
    setExpandedRow(prev => (prev === id ? null : id));
    setInlineForm(null);
  };

  const openForm = (projectId: string, recipientKey: string) => {
    setInlineForm({ projectId, recipientKey, date: TODAY, reference: '' });
  };

  const closeForm = () => setInlineForm(null);

  const handleMarkPaid = (d: ProjectCommission, line: PaymentLine) => {
    if (!inlineForm) return;
    const t: Transaction = {
      id: `comm_${d.project.id}_${line.key.replace(/\s+/g, '_')}_${Date.now()}`,
      title: `Payment: ${line.label} — ${d.project.name}`,
      amount: line.amount,
      date: inlineForm.date,
      type: 'expense',
      category: 'consultant_payment',
      description: line.label,
      projectId: d.project.id,
      isBillable: false,
      ...(inlineForm.reference ? { lineItemId: inlineForm.reference } : {}),
    };
    onAddTransaction(t);
    setInlineForm(null);
  };

  const handleRevert = (projectId: string, recipientKey: string) => {
    const tx = isPaid(projectId, recipientKey);
    if (tx) onDeleteTransaction(tx.id);
  };

  const getProjectName = (projectId: string) => {
    const p = projects.find(pr => pr.id === projectId);
    return p ? p.name : projectId;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Commission Management</h2>
          <p className="text-sm text-gray-500 mt-1">
            Factory commissions and profit distribution by project
          </p>
        </div>

        {/* Year filter */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
          <span className="text-sm text-gray-500 font-medium">Year:</span>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="text-sm font-semibold text-gray-800 bg-transparent outline-none cursor-pointer"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total Factory Commissions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">Total Factory Commissions</span>
            <div className="bg-orange-100 p-2 rounded-lg">
              <Building2 className="w-5 h-5 text-orange-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-orange-600">{fmt(kpis.totalCommissions)}</p>
          <p className="text-xs text-gray-400 mt-1">{commissionsData.length} project(s)</p>
        </div>

        {/* Total Incoda Profit */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">Total Incoda Profit</span>
            <div className="bg-purple-100 p-2 rounded-lg">
              <Wallet className="w-5 h-5 text-purple-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-600">{fmt(kpis.totalBMUtility)}</p>
          <p className="text-xs text-gray-400 mt-1">After factory commission</p>
        </div>

        {/* Total Distributed to Partners */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">Total Distributed to Partners</span>
            <div className="bg-blue-100 p-2 rounded-lg">
              <Split className="w-5 h-5 text-blue-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-blue-600">{fmt(kpis.totalDistributed)}</p>
          <p className="text-xs text-gray-400 mt-1">Fabian + Spencer (60%)</p>
        </div>

        {/* Pending Payment */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">Pending Payment</span>
            <div className="bg-red-100 p-2 rounded-lg">
              <Clock className="w-5 h-5 text-red-500" />
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600">{fmt(kpis.totalPending)}</p>
          <p className="text-xs text-gray-400 mt-1">Unpaid lines</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Percent className="w-4 h-4 text-gray-400" />
            Commissions by Project
          </h3>
        </div>

        {commissionsData.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No projects for year {selectedYear}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-8"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Sold Value</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Profit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Factory Commission</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">BM Profit</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {commissionsData.map(d => {
                  const isExpanded = expandedRow === d.project.id;
                  const paidCount = d.paymentLines.filter(line => isPaid(d.project.id, line.key)).length;
                  const allPaid = paidCount === d.paymentLines.length;
                  const somePaid = paidCount > 0 && !allPaid;

                  return (
                    <React.Fragment key={d.project.id}>
                      {/* Main row */}
                      <tr
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => toggleRow(d.project.id)}
                      >
                        <td className="px-4 py-4 text-gray-400">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4" />
                            : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm font-semibold text-gray-800">{d.project.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {d.commissionRate}% commission · {d.project.startDate ? new Date(d.project.startDate).getFullYear() : '—'}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-gray-600">{d.project.clientName}</p>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-sm font-medium text-gray-800">{fmt(d.soldValue)}</span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className={`text-sm font-medium ${d.netUtility >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {fmt(d.netUtility)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-sm font-semibold text-orange-600">{fmt(d.commissionAmount)}</span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-sm font-semibold text-purple-600">{fmt(d.incodaUtility)}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {allPaid ? (
                            <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">
                              <CheckCircle className="w-3 h-3" /> Paid
                            </span>
                          ) : somePaid ? (
                            <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-medium px-2.5 py-1 rounded-full">
                              <Clock className="w-3 h-3" /> Partial
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-medium px-2.5 py-1 rounded-full">
                              <Clock className="w-3 h-3" /> Pending
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded detail rows */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="px-0 py-0 bg-gray-50">
                            <div className="px-6 py-4 space-y-1">
                              {/* Summary row */}
                              <div className="grid grid-cols-5 gap-3 mb-4 text-xs text-gray-500 bg-white border border-gray-100 rounded-lg px-4 py-3">
                                <div>
                                  <p className="font-medium text-gray-400 uppercase tracking-wide">Labor Cost</p>
                                  <p className="text-sm font-semibold text-gray-700 mt-0.5">{fmt(d.laborCost)}</p>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-400 uppercase tracking-wide">Expenses</p>
                                  <p className="text-sm font-semibold text-gray-700 mt-0.5">{fmt(d.expenses)}</p>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-400 uppercase tracking-wide">Retenido BM (40%)</p>
                                  <p className="text-sm font-semibold text-purple-700 mt-0.5">{fmt(d.bmRetained)}</p>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-400 uppercase tracking-wide">Fabian (30%)</p>
                                  <p className="text-sm font-semibold text-indigo-600 mt-0.5">{fmt(d.fabianShare)}</p>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-400 uppercase tracking-wide">Spencer (30%)</p>
                                  <p className="text-sm font-semibold text-teal-600 mt-0.5">{fmt(d.spencerShare)}</p>
                                </div>
                              </div>

                              {/* Payment sub-rows */}
                              <div className="space-y-2">
                                {d.paymentLines.map(line => {
                                  const paidTx = isPaid(d.project.id, line.key);
                                  const showForm =
                                    inlineForm?.projectId === d.project.id &&
                                    inlineForm?.recipientKey === line.key;

                                  return (
                                    <div key={line.key} className="bg-white border border-gray-100 rounded-lg px-4 py-3">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 min-w-0">
                                          <span className={`text-sm font-medium ${line.colorClass}`}>{line.label}</span>
                                          <span className="text-sm font-semibold text-gray-800">{fmt(line.amount)}</span>
                                          {paidTx && (
                                            <span className="text-xs text-gray-400">
                                              {new Date(paidTx.date).toLocaleDateString('es-MX')}
                                              {paidTx.lineItemId ? ` · Ref: ${paidTx.lineItemId}` : ''}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                          {paidTx ? (
                                            <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">
                                              <CheckCircle className="w-3 h-3" /> Paid
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs font-medium px-2.5 py-1 rounded-full">
                                              <Clock className="w-3 h-3" /> Pending
                                            </span>
                                          )}
                                          {paidTx ? (
                                            <button
                                              onClick={e => { e.stopPropagation(); handleRevert(d.project.id, line.key); }}
                                              className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors"
                                            >
                                              Revert
                                            </button>
                                          ) : (
                                            !showForm && (
                                              <button
                                                onClick={e => { e.stopPropagation(); openForm(d.project.id, line.key); }}
                                                className="text-xs text-white bg-green-500 hover:bg-green-600 px-3 py-1 rounded-lg flex items-center gap-1 transition-colors"
                                              >
                                                <Plus className="w-3 h-3" /> Mark as Paid
                                              </button>
                                            )
                                          )}
                                        </div>
                                      </div>

                                      {/* Inline payment form */}
                                      {showForm && !paidTx && (
                                        <div
                                          className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-end gap-3"
                                          onClick={e => e.stopPropagation()}
                                        >
                                          <div>
                                            <label className="block text-xs text-gray-500 mb-1">Payment Date</label>
                                            <input
                                              type="date"
                                              value={inlineForm!.date}
                                              onChange={e => setInlineForm(f => f ? { ...f, date: e.target.value } : f)}
                                              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-green-300"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs text-gray-500 mb-1">Reference (optional)</label>
                                            <input
                                              type="text"
                                              value={inlineForm!.reference}
                                              onChange={e => setInlineForm(f => f ? { ...f, reference: e.target.value } : f)}
                                              placeholder="Transfer No. / invoice"
                                              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-green-300 w-56"
                                            />
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => handleMarkPaid(d, line)}
                                              className="text-sm text-white bg-green-500 hover:bg-green-600 px-4 py-1.5 rounded-lg flex items-center gap-1 transition-colors font-medium"
                                            >
                                              <CheckCircle className="w-4 h-4" /> Confirm
                                            </button>
                                            <button
                                              onClick={closeForm}
                                              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                                            >
                                              <X className="w-4 h-4" /> Cancel
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <History className="w-4 h-4 text-gray-400" />
          <h3 className="text-base font-semibold text-gray-800">Payment History</h3>
          <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {paymentHistory.length} record(s)
          </span>
        </div>

        {paymentHistory.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No payments recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Project</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Recipient</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paymentHistory.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {new Date(t.date).toLocaleDateString('es-MX')}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-700">
                      {t.projectId ? getProjectName(t.projectId) : '—'}
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <span
                        className={`font-medium ${
                          t.description?.includes('Factory Commission')
                            ? 'text-orange-600'
                            : t.description?.includes('Fabian')
                            ? 'text-indigo-600'
                            : 'text-teal-600'
                        }`}
                      >
                        {t.description ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-sm font-semibold text-gray-800 whitespace-nowrap">
                      {fmt(t.amount)}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-400">
                      {t.lineItemId || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
