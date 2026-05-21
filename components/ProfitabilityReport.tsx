
import React, { useMemo, useState } from 'react';
import { Project, Lead, Transaction, User } from '../types';
import { DollarSign, TrendingUp, TrendingDown, Search, Download, Briefcase, AlertCircle, ChevronDown, ChevronRight, User as UserIcon, Receipt, Trash2, Percent, Factory, Split, Wallet, Crown, Target, BarChart2, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Cell } from 'recharts';

interface ProfitabilityReportProps {
  projects: Project[];
  leads: Lead[];
  transactions: Transaction[];
  users: User[];
  onDeleteProject: (id: string) => void;
  onUpdateProject: (project: Project) => void;
  onRefresh: () => Promise<void>;
}

/**
 * Component: ProfitabilityReport
 * Displays a detailed financial breakdown per project.
 * 
 * MODES:
 * 1. CLOSED WON (Projects): Based on actual Time Logs and Expenses.
 * 2. NEGOTIATION (Leads): Based on Simulated Cost (40% of Deal) and Pre-sales Expenses.
 */
export const ProfitabilityReport: React.FC<ProfitabilityReportProps> = ({ projects, leads, transactions, users, onDeleteProject, onUpdateProject, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'closed_won' | 'negotiation'>('closed_won');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    leads.filter(l => l.expectedCloseDate).forEach(l => {
      years.add(l.expectedCloseDate.substring(0, 4));
    });
    return ['all', ...Array.from(years).sort((a, b) => Number(b) - Number(a))];
  }, [leads]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setLastRefreshed(new Date());
    setRefreshing(false);
  };
  
  const toggleExpand = (id: string) => {
      setExpandedRow(prev => prev === id ? null : id);
  };

  // --- 1. DATA ENGINE: CLOSED WON (ACTUAL PROJECTS) ---
  const closedWonData = useMemo(() => {
    return projects.map(project => {
        // REVENUE
        const lead = leads.find(l => l.id === project.leadId);

        // Use project.value if available (it was stored at project creation time)
        // Otherwise fall back to recalculating from lead items (for backward compatibility)
        let soldValue = project.value || 0;

        if (!soldValue && lead) {
            // Backward compatibility: recalculate from lead items if project.value is not set
            const typeCategories: Record<string, string[]> = {
                'implementation': ['implementation'],
                'license': ['license'],
                'support': ['vendor_support', 'incoda_support'],
                'hours_pack': ['hours_pack'],
            };
            const matchingCategories = typeCategories[project.type] || [];
            const hasMatchingItems = lead?.items?.some(i => matchingCategories.includes(i.category));
            soldValue = hasMatchingItems
                ? lead.items!
                    .filter(i => matchingCategories.includes(i.category))
                    .reduce((sum, item) => {
                        if (item.category === 'license') {
                            return sum + ((item.unitPrice || 0) * (item.quantity || 0) - (item.unitCost || 0) * (item.quantity || 0));
                        }
                        return sum + (item.total || 0);
                    }, 0)
                : lead.closedValue || lead.value || 0;
        }

        // LABOR COST (ACTUAL) — includes both project-level and ticket-level time logs
        const projectLogIds = new Set((project.timeLogs || []).map((l: any) => l.id));
        const ticketLogs = (project.tickets || []).flatMap((t: any) =>
            (t.timeLogs || []).filter((l: any) => !projectLogIds.has(l.id))
        );
        const allLogs = [...(project.timeLogs || []), ...ticketLogs];

        const laborBreakdown: Record<string, { hours: number, cost: number }> = {};
        const laborCost = allLogs.reduce((sum: number, log: any) => {
            let cost = 0;
            if (log.approvedCost) {
                cost = log.approvedCost;
            } else {
                const user = users.find(u => u.name === log.consultantName);
                const rate = user?.hourlyCost || 0;
                cost = log.hours * rate;
            }

            if (!laborBreakdown[log.consultantName]) {
                laborBreakdown[log.consultantName] = { hours: 0, cost: 0 };
            }
            laborBreakdown[log.consultantName].hours += log.hours;
            laborBreakdown[log.consultantName].cost += cost;

            return sum + cost;
        }, 0);
        const laborDetails = Object.entries(laborBreakdown).map(([name, data]) => ({ name, ...data }));

        // EXPENSES (ACTUAL)
        const expenseItems = transactions.filter(t => 
            t.type === 'expense' && 
            (t.projectId === project.id || (t.leadId && t.leadId === project.leadId))
        );
        const totalExpenses = expenseItems.reduce((sum, t) => sum + t.amount, 0);

        // UTILITY — use budgetedCost from costing review
        const totalCost = laborCost + totalExpenses;
        const netUtility = soldValue - (project.budgetedCost || 0);
        
        // FACTORY COMMISSION
        const rate = project.factoryCommissionRate !== undefined ? project.factoryCommissionRate : 10;
        const commissionAmount = netUtility > 0 ? netUtility * (rate / 100) : 0;
        
        // INCODA UTILITY & SPLIT
        const incodaUtility = netUtility - commissionAmount;
        const bmRetained = incodaUtility * 0.40;
        const fabianShare = incodaUtility * 0.30;
        const spencerShare = incodaUtility * 0.30;

        // MARGINS
        const finalMarginPercent = soldValue > 0 ? (incodaUtility / soldValue) * 100 : 0;

        return {
            id: project.id,
            originalRef: project,
            type: 'project',
            clientName: project.clientName,
            projectName: project.name,
            status: project.status,
            soldValue,
            budgetedCost: project.budgetedCost || 0,  // Snapshot from costing review
            costDetail: { labor: laborCost, expenses: totalExpenses },
            detailsList: { labor: laborDetails, expenses: expenseItems },
            totalCost,
            netUtility,
            currentCommissionRate: rate,
            commissionAmount,
            incodaUtility,
            bmRetained,
            fabianShare,
            spencerShare,
            finalMarginPercent
        };
    }).sort((a, b) => b.soldValue - a.soldValue);
  }, [projects, leads, transactions, users]);

  // --- 2. DATA ENGINE: NEGOTIATION (FORECAST LEADS) ---
  const negotiationData = useMemo(() => {
      const forecastLeads = leads.filter(l => l.stage === 'negotiation' && !l.deleted);

      return forecastLeads.map(lead => {
          // REVENUE (ESTIMATED) — always use item totals (sell price) when available
          const hasItems = lead.items && lead.items.length > 0;
          const soldValue = hasItems
              ? lead.items!.reduce((sum, item) => sum + (item.total || 0), 0)
              : (lead.value || 0);

          // BASE COST — use unitCost only when it differs from unitPrice (real cost data),
          // otherwise fall back to 40% simulation (unitCost === unitPrice means cost wasn't set)
          const hasRealCosts = hasItems && lead.items!.some(i =>
              (i.unitCost || 0) > 0 && i.unitCost !== i.unitPrice
          );
          const estimatedProductCost = hasRealCosts
              ? lead.items!.reduce((sum, item) => sum + ((item.unitCost || 0) * (item.quantity || 0)), 0)
              : soldValue * 0.40;
          
          // PRE-SALES EXPENSES (ACTUAL SPENT SO FAR)
          const expenseItems = transactions.filter(t => t.type === 'expense' && t.leadId === lead.id);
          const preSalesExpenses = expenseItems.reduce((sum, t) => sum + t.amount, 0);

          const totalCost = estimatedProductCost + preSalesExpenses;
          const netUtility = soldValue - totalCost;

          // FACTORY COMMISSION (DEFAULT 10% FOR FORECAST)
          const rate = 10; 
          const commissionAmount = netUtility > 0 ? netUtility * (rate / 100) : 0;

          // INCODA UTILITY & SPLIT
          const incodaUtility = netUtility - commissionAmount;
          const bmRetained = incodaUtility * 0.40;
          const fabianShare = incodaUtility * 0.30;
          const spencerShare = incodaUtility * 0.30;

          const finalMarginPercent = soldValue > 0 ? (incodaUtility / soldValue) * 100 : 0;

          return {
            id: lead.id,
            originalRef: lead,
            type: 'lead',
            clientName: lead.companyName,
            projectName: lead.description || 'New Opportunity',
            status: 'negotiation',
            soldValue,
            costDetail: { labor: estimatedProductCost, expenses: preSalesExpenses }, // 'labor' field used for Simulated Cost here
            detailsList: { labor: [], expenses: expenseItems }, 
            totalCost,
            netUtility,
            currentCommissionRate: rate,
            commissionAmount,
            incodaUtility,
            bmRetained,
            fabianShare,
            spencerShare,
            finalMarginPercent
        };
      }).sort((a, b) => b.soldValue - a.soldValue);
  }, [leads, transactions]);

  // --- FILTER & SELECT DATA ---
  const displayData = useMemo(() => {
      const source = activeTab === 'closed_won' ? closedWonData : negotiationData;
      return source.filter(item => {
        const matchesSearch = item.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.projectName.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;
        if (selectedYear === 'all') return true;
        // Always filter by lead's expectedCloseDate year
        const leadRef = item.type === 'project'
          ? leads.find(l => l.id === (item.originalRef as Project).leadId)
          : (item.originalRef as Lead);
        return leadRef?.expectedCloseDate?.startsWith(selectedYear) ?? false;
      });
  }, [activeTab, closedWonData, negotiationData, searchTerm, selectedYear]);

  // --- AGGREGATED STATS ---
  const totals = useMemo(() => {
      return displayData.reduce((acc, curr) => ({
          revenue: acc.revenue + curr.soldValue,
          cost: acc.cost + curr.totalCost,
          netUtility: acc.netUtility + curr.netUtility,
          commission: acc.commission + curr.commissionAmount,
          incodaUtility: acc.incodaUtility + curr.incodaUtility,
          bmRetained: acc.bmRetained + curr.bmRetained,
          fabianShare: acc.fabianShare + curr.fabianShare,
          spencerShare: acc.spencerShare + curr.spencerShare
      }), { revenue: 0, cost: 0, netUtility: 0, commission: 0, incodaUtility: 0, bmRetained: 0, fabianShare: 0, spencerShare: 0 });
  }, [displayData]);

  const totalFinalMargin = totals.revenue > 0 ? (totals.incodaUtility / totals.revenue) * 100 : 0;

  // --- BENCHMARK ANALYSIS (NEW) ---
  const benchmarkAnalysis = useMemo(() => {
      let licRev = 0, licUtil = 0;
      let servRev = 0, servUtil = 0;

      displayData.forEach(item => {
          let isLicense = false;

          // IMPROVED LOGIC: Correctly determine if item is License or Service
          if (item.type === 'project') {
              // For Projects, trust the explicit type
              isLicense = (item.originalRef as Project).type === 'license';
          } else {
              // For Leads (Forecast), infer from content
              // Heuristic: If >50% of the deal value is from License SKUs, treat as License deal.
              const lead = item.originalRef as Lead;
              const licenseValue = lead.items
                  ? lead.items.filter(i => i.category === 'license').reduce((sum, i) => sum + i.total, 0)
                  : 0;
              
              isLicense = lead.value > 0 && (licenseValue / lead.value) > 0.5;
          }
          
          if (isLicense) {
              licRev += item.soldValue;
              licUtil += item.incodaUtility;
          } else {
              servRev += item.soldValue;
              servUtil += item.incodaUtility;
          }
      });

      // Calculate Weighted Average Margins
      const licMargin = licRev > 0 ? (licUtil / licRev) * 100 : 0;
      const servMargin = servRev > 0 ? (servUtil / servRev) * 100 : 0;

      return [
          { 
              name: 'Licensing', 
              actual: Number(licMargin.toFixed(1)), 
              target: 20, 
              revenue: licRev 
          },
          { 
              name: 'Services (Impl/Cons)', 
              actual: Number(servMargin.toFixed(1)), 
              target: 40, 
              revenue: servRev 
          }
      ];
  }, [displayData]);

  const handleUpdateCommissionRate = (item: any, newRate: number) => {
      if (item.type === 'project') {
          onUpdateProject({ ...item.originalRef, factoryCommissionRate: newRate });
      } else {
          // For leads, we don't persist this yet as it's a forecast
          alert("Commission rate editing is only available for active projects (Closed Won).");
      }
  };

  // CSV Export
  const handleExportCSV = () => {
      const headers = [
          "Type", "Client", "Project/Deal", "Value", "Total Cost", "Net Utility", 
          "Factory Comm %", "Factory Comm $", "BM Utility", 
          "BM Net (40%)", "Fabian (30%)", "Spencer (30%)", "Margin %"
      ];
      
      const rows = displayData.map(d => [
          activeTab === 'closed_won' ? "Project" : "Forecast",
          `"${d.clientName}"`,
          `"${d.projectName}"`,
          d.soldValue,
          d.totalCost,
          d.netUtility,
          d.currentCommissionRate,
          d.commissionAmount,
          d.incodaUtility,
          d.bmRetained,
          d.fabianShare,
          d.spencerShare,
          d.finalMarginPercent.toFixed(2)
      ]);
      
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `profitability_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <TrendingUp className="text-green-600" /> Profitability & Distribution
                </h1>
                <p className="text-gray-500 text-sm">Revenue analysis and partner dividend split (40% BM / 30% F / 30% S).</p>
            </div>
            <div className="flex gap-3 items-center">
                <select
                    value={selectedYear}
                    onChange={(e) => { setSelectedYear(e.target.value); setExpandedRow(null); }}
                    className="border border-gray-300 rounded-lg text-sm px-3 py-2 focus:ring-2 focus:ring-blue-100 outline-none bg-white text-gray-700"
                >
                    {availableYears.map(y => (
                        <option key={y} value={y}>{y === 'all' ? 'All Years' : y}</option>
                    ))}
                </select>
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search..."
                        className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2 shadow-sm disabled:opacity-60 transition"
                    title="Fetch latest values from database"
                >
                    <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? 'Updating...' : 'Update'}
                </button>
                <button onClick={handleExportCSV} className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2 shadow-sm">
                    <Download size={16} /> Export
                </button>
            </div>
        </div>

        {lastRefreshed && (
            <p className="text-xs text-green-600 flex items-center gap-1">
                <RefreshCw size={11} /> Last updated: {lastRefreshed.toLocaleTimeString()}
            </p>
        )}

        {/* TABS */}
        <div className="flex border-b border-gray-200">
            <button 
                onClick={() => { setActiveTab('closed_won'); setExpandedRow(null); }}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition flex items-center gap-2 ${activeTab === 'closed_won' ? 'border-green-600 text-green-700 bg-green-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                <Briefcase size={16} /> Executed Projects (Closed Won)
            </button>
            <button 
                onClick={() => { setActiveTab('negotiation'); setExpandedRow(null); }}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition flex items-center gap-2 ${activeTab === 'negotiation' ? 'border-orange-500 text-orange-700 bg-orange-50/50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                <Target size={16} /> Pipeline Forecast (Negotiation)
            </button>
        </div>
      </div>

      {/* BENCHMARK CHART (NEW SECTION) */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <BarChart2 className="text-blue-600" size={20} /> Margin Benchmarks vs Actuals
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
              <div className="lg:col-span-2 h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={benchmarkAnalysis} layout="vertical" margin={{top: 5, right: 30, left: 20, bottom: 5}}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                          <XAxis type="number" domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                          <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 12, fontWeight: 600}} />
                          <Tooltip 
                              cursor={{fill: '#f8fafc'}}
                              contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                              formatter={(value: number, name: string) => [`${value}%`, name]}
                          />
                          <Legend wrapperStyle={{paddingTop: '10px'}} />
                          
                          {/* Target Bar */}
                          <Bar dataKey="target" name="Min. Target" fill="#e2e8f0" barSize={20} radius={[0, 4, 4, 0]} />
                          
                          {/* Actual Bar (Colored dynamically) */}
                          <Bar dataKey="actual" name="Actual Utility" barSize={20} radius={[0, 4, 4, 0]}>
                              {benchmarkAnalysis.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.actual >= entry.target ? '#22c55e' : '#ef4444'} />
                              ))}
                          </Bar>
                      </BarChart>
                  </ResponsiveContainer>
              </div>
              <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
                      <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-semibold text-gray-700">Licensing</span>
                          <span className="text-xs text-gray-500">Target: 20%</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                          <span className={`text-2xl font-bold ${benchmarkAnalysis[0].actual >= 20 ? 'text-green-600' : 'text-red-600'}`}>
                              {benchmarkAnalysis[0].actual}%
                          </span>
                          {benchmarkAnalysis[0].actual < 20 && (
                              <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={10} /> Below Target</span>
                          )}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">Based on ${benchmarkAnalysis[0].revenue.toLocaleString()} revenue</div>
                  </div>

                  <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
                      <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-semibold text-gray-700">Services</span>
                          <span className="text-xs text-gray-500">Target: 40%</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                          <span className={`text-2xl font-bold ${benchmarkAnalysis[1].actual >= 40 ? 'text-green-600' : 'text-red-600'}`}>
                              {benchmarkAnalysis[1].actual}%
                          </span>
                          {benchmarkAnalysis[1].actual < 40 && (
                              <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={10} /> Below Target</span>
                          )}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">Based on ${benchmarkAnalysis[1].revenue.toLocaleString()} revenue</div>
                  </div>
              </div>
          </div>
      </div>

      {/* KPI GRID (Dynamic based on Tab) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Row 1: High Level */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
              <p className="text-xs font-bold text-gray-500 uppercase">{activeTab === 'closed_won' ? 'Realized Revenue' : 'Projected Revenue'}</p>
              <p className={`text-xl font-bold mt-1 ${activeTab === 'closed_won' ? 'text-blue-600' : 'text-gray-700'}`}>${totals.revenue.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
              <p className="text-xs font-bold text-gray-500 uppercase">Factory Comm.</p>
              <p className="text-xl font-bold text-orange-500 mt-1">${totals.commission.toLocaleString()}</p>
          </div>
          <div className="bg-gray-900 p-4 rounded-xl shadow-md border border-gray-800 col-span-2 flex items-center justify-between">
              <div>
                  <p className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
                      <DollarSign size={12} className="text-green-400" /> Total Incoda Utility
                  </p>
                  <p className="text-3xl font-bold text-white mt-1">
                      ${totals.incodaUtility.toLocaleString()}
                  </p>
              </div>
              <div className="text-right">
                  <p className="text-xs font-bold text-gray-400 uppercase">Avg Margin (Blended)</p>
                  <p className={`text-xl font-bold mt-1 ${totalFinalMargin >= 20 ? 'text-green-400' : 'text-yellow-400'}`}>
                      {totalFinalMargin.toFixed(1)}%
                  </p>
              </div>
          </div>

          {/* Row 2: Distribution Split */}
          <div className="bg-green-50 p-4 rounded-xl border border-green-100 relative overflow-hidden">
              <div className="flex items-center gap-2 mb-1">
                  <Wallet size={16} className="text-green-600" />
                  <p className="text-xs font-bold text-green-800 uppercase">BM Net (30%)</p>
              </div>
              <p className="text-2xl font-bold text-green-700">${totals.bmRetained.toLocaleString()}</p>
              <div className="absolute right-0 top-0 p-2 opacity-10"><Wallet size={64} /></div>
          </div>
          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 relative overflow-hidden">
              <div className="flex items-center gap-2 mb-1">
                  <UserIcon size={16} className="text-indigo-600" />
                  <p className="text-xs font-bold text-indigo-800 uppercase">Fabian (30%)</p>
              </div>
              <p className="text-2xl font-bold text-indigo-700">${totals.fabianShare.toLocaleString()}</p>
              <div className="absolute right-0 top-0 p-2 opacity-10"><UserIcon size={64} /></div>
          </div>
          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 relative overflow-hidden">
              <div className="flex items-center gap-2 mb-1">
                  <Crown size={16} className="text-purple-600" />
                  <p className="text-xs font-bold text-purple-800 uppercase">Spencer (30%)</p>
              </div>
              <p className="text-2xl font-bold text-purple-700">${totals.spencerShare.toLocaleString()}</p>
              <div className="absolute right-0 top-0 p-2 opacity-10"><Crown size={64} /></div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col justify-center items-center text-gray-400 text-xs text-center">
              <Split size={24} className="mb-1 opacity-50" />
              <p>{activeTab === 'closed_won' ? 'Actual distribution based on execution.' : 'Projected distribution if deals close.'}</p>
          </div>
      </div>

      {/* DETAIL TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                      <tr>
                          <th className="p-4 w-10"></th>
                          <th className="p-4">Client / {activeTab === 'closed_won' ? 'Project' : 'Opportunity'}</th>
                          <th className="p-4 text-right">Sold Value</th>
                          <th className="p-4 text-right text-gray-500">Base Cost</th>
                          <th className="p-4 text-right text-gray-500">
                              {activeTab === 'closed_won' ? 'Costs (Actual)' : 'Costs (Simulated)'}
                          </th>
                          <th className="p-4 text-right">Net Utility</th>
                          <th className="p-4 text-right text-orange-600">Factory Comm.</th>
                          <th className="p-4 text-right font-bold text-gray-900 bg-gray-50">Total BM Utility</th>
                          <th className="p-4 text-center">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {displayData.map(row => (
                          <React.Fragment key={row.id}>
                              <tr 
                                className={`hover:bg-gray-50 transition cursor-pointer ${expandedRow === row.id ? 'bg-blue-50/50' : ''}`}
                                onClick={() => toggleExpand(row.id)}
                              >
                                  <td className="p-4 text-center">
                                      {expandedRow === row.id ? <ChevronDown size={16} className="text-blue-500" /> : <ChevronRight size={16} className="text-gray-400" />}
                                  </td>
                                  <td className="p-4">
                                      <div className="font-bold text-gray-900">{row.clientName}</div>
                                      <div className="text-xs text-gray-500 flex items-center gap-1">
                                          {activeTab === 'closed_won' ? <Briefcase size={12} /> : <Target size={12} />} 
                                          {row.projectName}
                                      </div>
                                  </td>
                                  <td className="p-4 text-right font-medium text-blue-600">
                                      ${row.soldValue.toLocaleString()}
                                  </td>
                                  <td className="p-4 text-right text-gray-600">
                                      -${((row as any).budgetedCost || 0).toLocaleString()}
                                  </td>
                                  <td className="p-4 text-right text-red-500">
                                      -${row.totalCost.toLocaleString()}
                                  </td>
                                  <td className="p-4 text-right font-medium">
                                      ${row.netUtility.toLocaleString()}
                                  </td>
                                  <td className="p-4 text-right text-orange-600">
                                      <div className="flex flex-col items-end gap-1">
                                          {activeTab === 'closed_won' ? (
                                              <div className="flex items-center bg-orange-50 border border-orange-200 rounded overflow-hidden" onClick={e => e.stopPropagation()}>
                                                  <input 
                                                      type="number" 
                                                      min="0" max="100"
                                                      className="w-10 text-xs bg-transparent text-right font-bold text-orange-700 focus:outline-none p-0.5"
                                                      value={row.currentCommissionRate}
                                                      onChange={(e) => handleUpdateCommissionRate(row, Number(e.target.value))}
                                                  />
                                                  <span className="text-[10px] text-orange-500 pr-1">%</span>
                                              </div>
                                          ) : (
                                              <span className="text-xs text-gray-400 font-medium">{row.currentCommissionRate}% (Def)</span>
                                          )}
                                          <span>${row.commissionAmount.toLocaleString()}</span>
                                      </div>
                                  </td>
                                  <td className="p-4 text-right bg-gray-50">
                                      <div className="flex flex-col items-end">
                                          <span className={`font-bold text-base ${row.incodaUtility >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                              ${row.incodaUtility.toLocaleString()}
                                          </span>
                                          <span className="text-[10px] text-gray-500">{row.finalMarginPercent.toFixed(1)}% margin</span>
                                      </div>
                                  </td>
                                  <td className="p-4 text-center">
                                      {activeTab === 'closed_won' && (
                                          <button 
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (window.confirm('Are you sure you want to delete this project?')) {
                                                      onDeleteProject(row.id);
                                                  }
                                              }}
                                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                          >
                                              <Trash2 size={16} />
                                          </button>
                                      )}
                                  </td>
                              </tr>
                              
                              {/* EXPANDED ROW FOR DETAILS */}
                              {expandedRow === row.id && (
                                  <tr className="bg-gray-50">
                                      <td colSpan={8} className="p-0">
                                          <div className="p-6">
                                              
                                              {/* 1. DISTRIBUTION BREAKDOWN (NEW) */}
                                              <div className="mb-6">
                                                  <h4 className="text-xs font-bold text-gray-700 uppercase mb-3 flex items-center gap-2">
                                                      <Split size={14} className="text-blue-600" /> Dividend Distribution ({activeTab === 'closed_won' ? 'Actual' : 'Projected'})
                                                  </h4>
                                                  <div className="flex gap-4">
                                                      <div className="flex-1 bg-white border border-green-200 rounded-lg p-3 shadow-sm">
                                                          <p className="text-xs text-gray-500 font-medium">Incoda Net (40%)</p>
                                                          <p className="text-lg font-bold text-green-700">${row.bmRetained.toLocaleString()}</p>
                                                      </div>
                                                      <div className="flex-1 bg-white border border-indigo-200 rounded-lg p-3 shadow-sm">
                                                          <p className="text-xs text-gray-500 font-medium">Fabian (30%)</p>
                                                          <p className="text-lg font-bold text-indigo-700">${row.fabianShare.toLocaleString()}</p>
                                                      </div>
                                                      <div className="flex-1 bg-white border border-purple-200 rounded-lg p-3 shadow-sm">
                                                          <p className="text-xs text-gray-500 font-medium">Spencer (30%)</p>
                                                          <p className="text-lg font-bold text-purple-700">${row.spencerShare.toLocaleString()}</p>
                                                      </div>
                                                  </div>
                                              </div>

                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-gray-200 pt-6">
                                                  {/* 2. COST BREAKDOWN */}
                                                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                                                      <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                                                          <UserIcon size={14} className="text-blue-500" />
                                                          <h4 className="text-xs font-bold text-gray-700 uppercase">
                                                              {activeTab === 'closed_won' ? 'Labor Cost (Hours)' : 'Est. Product/Service Cost'}
                                                          </h4>
                                                      </div>
                                                      
                                                      {activeTab === 'closed_won' ? (
                                                          <table className="w-full text-xs text-left">
                                                              <thead className="text-gray-500 bg-gray-50/50">
                                                                  <tr>
                                                                      <th className="px-3 py-2">Consultant</th>
                                                                      <th className="px-3 py-2 text-right">Hours</th>
                                                                      <th className="px-3 py-2 text-right">Cost</th>
                                                                  </tr>
                                                              </thead>
                                                              <tbody className="divide-y divide-gray-100">
                                                                  {row.detailsList.labor.length > 0 ? (
                                                                      row.detailsList.labor.map((detail: any, i: number) => (
                                                                          <tr key={i} className="hover:bg-gray-50">
                                                                              <td className="px-3 py-2 font-medium">{detail.name}</td>
                                                                              <td className="px-3 py-2 text-right">{detail.hours}</td>
                                                                              <td className="px-3 py-2 text-right text-red-600">-${detail.cost.toLocaleString()}</td>
                                                                          </tr>
                                                                      ))
                                                                  ) : (
                                                                      <tr><td colSpan={3} className="p-3 text-center text-gray-400 italic">No labor costs recorded.</td></tr>
                                                                  )}
                                                              </tbody>
                                                              <tfoot className="bg-gray-50 font-semibold text-gray-700 border-t border-gray-200">
                                                                  <tr>
                                                                      <td colSpan={2} className="px-3 py-2 text-right">Total:</td>
                                                                      <td className="px-3 py-2 text-right">-${row.costDetail.labor.toLocaleString()}</td>
                                                                  </tr>
                                                              </tfoot>
                                                          </table>
                                                      ) : (
                                                          <div className="p-4 text-center">
                                                              <p className="text-sm text-gray-600 mb-1">{row.type === 'lead' && row.originalRef?.items?.some((i: any) => (i.unitCost || 0) > 0 && i.unitCost !== i.unitPrice) ? 'Base Cost (from items)' : 'Simulated Cost (40% of Deal)'}</p>
                                                              <p className="text-lg font-bold text-red-600">-${row.costDetail.labor.toLocaleString()}</p>
                                                              <p className="text-xs text-gray-400 mt-2">{row.type === 'lead' && row.originalRef?.items?.some((i: any) => (i.unitCost || 0) > 0 && i.unitCost !== i.unitPrice) ? 'Actual cost from item unit costs' : 'Standard estimation for forecasting'}</p>
                                                          </div>
                                                      )}
                                                  </div>

                                                  {/* 3. EXPENSES */}
                                                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                                                      <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                                                          <Receipt size={14} className="text-orange-500" />
                                                          <h4 className="text-xs font-bold text-gray-700 uppercase">
                                                              {activeTab === 'closed_won' ? 'Operational Expenses' : 'Pre-sales Expenses'}
                                                          </h4>
                                                      </div>
                                                      <table className="w-full text-xs text-left">
                                                          <thead className="text-gray-500 bg-gray-50/50">
                                                              <tr>
                                                                  <th className="px-3 py-2">Item</th>
                                                                  <th className="px-3 py-2 text-right">Amount</th>
                                                              </tr>
                                                          </thead>
                                                          <tbody className="divide-y divide-gray-100">
                                                              {row.detailsList.expenses.length > 0 ? (
                                                                  row.detailsList.expenses.map((item: any, i: number) => (
                                                                      <tr key={i} className="hover:bg-gray-50">
                                                                          <td className="px-3 py-2 text-gray-800">{item.title}</td>
                                                                          <td className="px-3 py-2 text-right text-red-600">-${item.amount.toLocaleString()}</td>
                                                                      </tr>
                                                                  ))
                                                              ) : (
                                                                  <tr><td colSpan={2} className="p-3 text-center text-gray-400 italic">No expenses recorded.</td></tr>
                                                              )}
                                                          </tbody>
                                                          <tfoot className="bg-gray-50 font-semibold text-gray-700 border-t border-gray-200">
                                                              <tr>
                                                                  <td className="px-3 py-2 text-right">Total:</td>
                                                                  <td className="px-3 py-2 text-right">-${row.costDetail.expenses.toLocaleString()}</td>
                                                              </tr>
                                                          </tfoot>
                                                      </table>
                                                  </div>
                                              </div>
                                          </div>
                                      </td>
                                  </tr>
                              )}
                          </React.Fragment>
                      ))}
                      {displayData.length === 0 && (
                          <tr><td colSpan={8} className="p-8 text-center text-gray-400 italic">No data found for this category.</td></tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};
