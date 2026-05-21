
import React, { useState, useMemo, useEffect } from 'react';
import { Lead, Project, SKUCategory, User } from '../types';
import { AIInsightsPanel } from './AIInsightsPanel';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, Line, ComposedChart, LabelList
} from 'recharts';

import { TrendingUp, DollarSign, Briefcase, CheckCircle2, AlertTriangle, Calendar, Target, ArrowUpRight, Edit2, Save, X, Trophy, Users, Globe, Filter, Package, GitMerge } from 'lucide-react';

interface UserGoal { userId: string; userName: string; year: number; target: number; type: string; }

interface DashboardProps {
  leads: Lead[];
  projects: Project[];
  goals: Record<number, number>;
  onUpdateGoal: (year: number, amount: number) => void;
  users?: User[];
  currentUser?: User;
}

export const Dashboard: React.FC<DashboardProps> = ({ leads, projects, goals, onUpdateGoal, users = [], currentUser }) => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [partnerMetric, setPartnerMetric] = useState<'value' | 'count'>('value');
  const [partnerManufacturerFilter, setPartnerManufacturerFilter] = useState<string>('all');
  const [countryMetric, setCountryMetric] = useState<'value' | 'count'>('value');
  const [userGoals, setUserGoals] = useState<UserGoal[]>([]);
  const [editingGoalUserId, setEditingGoalUserId] = useState<string | null>(null);
  const [tempGoalTarget, setTempGoalTarget] = useState<number>(0);

  // Goal Editing State
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTarget, setTempTarget] = useState<number>(0);

  useEffect(() => {
    fetch(`/api/user-goals?year=${selectedYear}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setUserGoals)
      .catch(() => {});
  }, [selectedYear]);

  const annualTarget = goals[selectedYear] || 1000000;

  // --- DATA FILTERING BY YEAR ---
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
        if (!l.expectedCloseDate) return false;
        return new Date(l.expectedCloseDate).getFullYear() === selectedYear;
    });
  }, [leads, selectedYear]);

  // KPIs for the selected year
  const totalPipelineValue = filteredLeads
    .filter(l => l.stage !== 'closed-won' && l.stage !== 'closed-lost')
    .reduce((acc, l) => acc + l.value, 0);
  
  const weightedPipelineValue = filteredLeads
    .filter(l => l.stage !== 'closed-won' && l.stage !== 'closed-lost')
    .reduce((acc, l) => acc + (l.value * (l.probability / 100)), 0);

  const closedWonLeads = filteredLeads.filter(l => l.stage === 'closed-won');
  const totalClosedWon = closedWonLeads.reduce((acc, l) => acc + (l.closedValue || l.value), 0);
  
  const activeProjectsValue = projects
    .filter(p => new Date(p.startDate).getFullYear() === selectedYear)
    .reduce((acc, p) => acc + (p.totalBudgetHours * 150), 0);
  
  const winRate = closedWonLeads.length > 0 
    ? (closedWonLeads.length / filteredLeads.filter(l => l.stage === 'closed-won' || l.stage === 'closed-lost').length) * 100 
    : 0;

  const targetProgress = Math.min((totalClosedWon / annualTarget) * 100, 100);
  const targetGap = annualTarget - totalClosedWon;
  const pipelineCoverage = targetGap > 0 ? (weightedPipelineValue / targetGap) * 100 : 100;

  // Forecast data (filtered by year)
  const forecastChartData = useMemo(() => {
    const openLeads = filteredLeads.filter(l => l.stage !== 'closed-won' && l.stage !== 'closed-lost');
    const grouped: Record<string, { name: string, total: number, weighted: number }> = {};

    openLeads.forEach(lead => {
      const date = new Date(lead.expectedCloseDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'short' });

      if (!grouped[key]) grouped[key] = { name: label, total: 0, weighted: 0 };
      grouped[key].total += lead.value;
      grouped[key].weighted += (lead.value * (lead.probability / 100));
    });

    return Object.keys(grouped).sort().map(key => grouped[key]);
  }, [filteredLeads]);

  const funnelData = ['prospect', 'qualification', 'presentation', 'proposal', 'negotiation', 'closed-won'].map(stageKey => {
    const count = filteredLeads.filter(l => l.stage === stageKey).length;
    const value = filteredLeads.filter(l => l.stage === stageKey).reduce((a, b) => a + b.value, 0);
    return { name: stageKey.charAt(0).toUpperCase() + stageKey.slice(1), count, value };
  });

  // Revenue Breakdown By Product Category
  const revenueByProduct = useMemo(() => {
    const data = [
      { name: 'Licenses', value: 0, color: '#8b5cf6' }, // Purple
      { name: 'Implementation', value: 0, color: '#3b82f6' }, // Blue
      { name: 'Vendor Support', value: 0, color: '#f97316' }, // Orange
      { name: 'Incoda Support', value: 0, color: '#f59e0b' }, // Amber
      { name: 'Consulting Hours', value: 0, color: '#10b981' } // Emerald
    ];

    closedWonLeads.forEach(lead => {
      if (lead.items && lead.items.length > 0) {
        lead.items.forEach(item => {
          if (item.category === 'license') data[0].value += item.total;
          else if (item.category === 'implementation') data[1].value += item.total;
          else if (item.category === 'vendor_support') data[2].value += item.total;
          else if (item.category === 'incoda_support') data[3].value += item.total;
          else if (item.category === 'hours_pack') data[4].value += item.total;
        });
      }
    });

    return data.filter(d => d.value > 0);
  }, [closedWonLeads]);

  // --- PIPELINE TOTAL POR AÑO ---
  const pipelineByYear = useMemo(() => {
    const yearMap: Record<number, number> = {};
    leads.filter(l => l.expectedCloseDate && !l.deleted).forEach(lead => {
      const year = new Date(lead.expectedCloseDate).getFullYear();
      yearMap[year] = (yearMap[year] || 0) + (lead.value || 0);
    });
    return Object.keys(yearMap).map(Number).sort().map(year => ({ year: String(year), total: yearMap[year] }));
  }, [leads]);

  // --- FABRICANTES DISPONIBLES (para filtro) ---
  const manufacturerOptions = useMemo(() => {
    const set = new Set<string>();
    leads.filter(l => !l.deleted && l.manufacturer).forEach(l => set.add(l.manufacturer!));
    return Array.from(set).sort();
  }, [leads]);

  // --- PARTNERS + FABRICANTE POR MÉTRICA ---
  const partnerChartData = useMemo(() => {
    const filtered = leads.filter(l =>
      !l.deleted &&
      (partnerManufacturerFilter === 'all' || l.manufacturer === partnerManufacturerFilter)
    );

    const map: Record<string, { partner: string; count: number; value: number; manufacturers: Set<string> }> = {};
    filtered.forEach(l => {
      const key = l.partnerName || 'Sin Partner';
      if (!map[key]) map[key] = { partner: key, count: 0, value: 0, manufacturers: new Set() };
      map[key].count += 1;
      map[key].value += l.value || 0;
      if (l.manufacturer) map[key].manufacturers.add(l.manufacturer);
    });

    return Object.values(map)
      .map(d => ({ ...d, manufacturers: Array.from(d.manufacturers).join(', ') || '—' }))
      .sort((a, b) => (partnerMetric === 'value' ? b.value - a.value : b.count - a.count));
  }, [leads, partnerMetric, partnerManufacturerFilter]);

  const PARTNER_COLORS = ['#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1'];

  // --- LEADS POR PAÍS ---
  const countryChartData = useMemo(() => {
    const map: Record<string, { country: string; count: number; value: number }> = {};
    leads.filter(l => !l.deleted).forEach(l => {
      const key = l.country?.trim() || 'Unknown';
      if (!map[key]) map[key] = { country: key, count: 0, value: 0 };
      map[key].count += 1;
      map[key].value += l.value || 0;
    });
    return Object.values(map).sort((a, b) =>
      countryMetric === 'value' ? b.value - a.value : b.count - a.count
    );
  }, [leads, countryMetric]);

  const leaderboard = useMemo(() => {
    return users.map(u => {
      const wonLeads = filteredLeads.filter(l => l.stage === 'closed-won' && (l as any).assignedTo === u.id);
      const revenue = wonLeads.reduce((acc, l) => acc + (l.closedValue || l.value), 0);
      const goal = userGoals.find(g => g.userId === u.id);
      return { user: u, revenue, deals: wonLeads.length, goalTarget: goal?.target ?? 0 };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [users, filteredLeads, userGoals]);

  const saveUserGoal = async (userId: string, userName: string, target: number) => {
    const updated = await fetch('/api/user-goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId, userName, year: selectedYear, target, type: 'revenue' }),
    }).then(r => r.json());
    setUserGoals(prev => {
      const filtered = prev.filter(g => g.userId !== userId);
      return [...filtered, updated];
    });
    setEditingGoalUserId(null);
  };

  const handleSaveTarget = () => {
    onUpdateGoal(selectedYear, tempTarget);
    setIsEditingTarget(false);
  };

  const COLORS = { total: '#94a3b8', weighted: '#4f46e5', pie: ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981'] };

  return (
    <div className="space-y-6 pb-8">
      {/* AI INSIGHTS */}
      <AIInsightsPanel leads={leads} projects={projects} />

      {/* HEADER WITH YEAR FILTER */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
         <div>
            <h2 className="text-xl font-bold text-gray-800">Sales Intelligence</h2>
            <p className="text-xs text-gray-500">Analytics filtered by closing year.</p>
         </div>
         <div className="flex items-center gap-3">
             <Filter size={16} className="text-gray-400" />
             <select 
                className="bg-gray-50 border border-gray-200 rounded-lg text-sm px-3 py-2 font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100"
                value={selectedYear}
                onChange={(e) => {
                    setSelectedYear(Number(e.target.value));
                    setIsEditingTarget(false);
                }}
             >
                <option value={2023}>Year 2023</option>
                <option value={2024}>Year 2024</option>
                <option value={2025}>Year 2025</option>
                <option value={2026}>Year 2026</option>
                <option value={2027}>Year 2027</option>
                <option value={2028}>Year 2028</option>
             </select>
         </div>
      </div>

      {/* KPI GRID - Adjusted to 4 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {/* Year-Specific Goal Card */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
                <div>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                        Goal {selectedYear}
                        {!isEditingTarget && (
                            <button onClick={() => { setTempTarget(annualTarget); setIsEditingTarget(true); }} className="text-gray-300 hover:text-blue-500 transition">
                                <Edit2 size={10} />
                            </button>
                        )}
                    </p>
                    {isEditingTarget ? (
                        <div className="flex items-center gap-1 mt-1">
                            <input 
                                type="number" 
                                className="w-24 border border-blue-300 rounded text-sm px-1 py-0.5"
                                value={tempTarget}
                                onChange={(e) => setTempTarget(Number(e.target.value))}
                                autoFocus
                            />
                            <button onClick={handleSaveTarget} className="text-green-600 hover:bg-green-50 rounded p-0.5"><Save size={14} /></button>
                            <button onClick={() => setIsEditingTarget(false)} className="text-red-500 hover:bg-red-50 rounded p-0.5"><X size={14} /></button>
                        </div>
                    ) : (
                        <div className="flex items-baseline gap-1 mt-1">
                            <h3 className="text-2xl font-bold text-gray-900">{Math.round(targetProgress)}%</h3>
                            <span className="text-xs text-gray-400">of goal</span>
                        </div>
                    )}
                </div>
                <div className="p-2 bg-yellow-50 text-yellow-600 rounded-lg"><Trophy size={20} /></div>
            </div>
            <div className="space-y-2">
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all duration-1000 ${targetProgress >= 100 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${targetProgress}%` }}></div>
                </div>
                <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-600 font-medium">${(totalClosedWon/1000).toFixed(0)}k</span>
                    <span className="text-gray-400">Target: ${(annualTarget/1000).toFixed(0)}k</span>
                </div>
            </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
           <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Weighted Pipeline {selectedYear}</p>
           <h3 className="text-2xl font-bold text-gray-900 mt-1">${Math.round(weightedPipelineValue).toLocaleString()}</h3>
           <div className="text-[10px] text-gray-400 mt-1">Total Raw: ${totalPipelineValue.toLocaleString()}</div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
           <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Revenue Closed</p>
           <h3 className="text-2xl font-bold text-gray-900 mt-1">${totalClosedWon.toLocaleString()}</h3>
           <div className="flex items-center gap-1 text-green-600 text-[10px] font-bold mt-1">
              <ArrowUpRight size={12} /> {Math.round(winRate)}% Win Rate
           </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
           <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Active Projects {selectedYear}</p>
           <h3 className="text-2xl font-bold text-gray-900 mt-1">{projects.filter(p => new Date(p.startDate).getFullYear() === selectedYear).length}</h3>
           <div className="text-[10px] text-gray-400 mt-1">Estimated Delivery: ${activeProjectsValue.toLocaleString()}</div>
        </div>
      </div>

      {/* AI INSIGHTS PANEL */}
      {(() => {
        const activeLeads = leads.filter(l => !l.deleted && l.stage !== 'closed-won' && l.stage !== 'closed-lost' && l.aiScore !== null && l.aiScore !== undefined);
        const topDeals = [...activeLeads].sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0)).slice(0, 5);
        const now = Date.now();
        const atRisk = [...activeLeads]
          .filter(l => {
            const daysToClose = l.expectedCloseDate ? Math.ceil((new Date(l.expectedCloseDate).getTime() - now) / 86400000) : null;
            const lastInteraction = l.interactions?.length ? l.interactions[l.interactions.length - 1].date : null;
            const daysSilent = lastInteraction ? Math.floor((now - new Date(lastInteraction).getTime()) / 86400000) : 999;
            return (daysToClose !== null && daysToClose < 21 && (l.aiScore ?? 100) < 60) || daysSilent > 14;
          })
          .sort((a, b) => (a.aiScore ?? 0) - (b.aiScore ?? 0))
          .slice(0, 3);
        if (topDeals.length === 0) return null;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 p-5 rounded-xl shadow-sm">
              <h3 className="text-sm font-bold text-indigo-800 flex items-center gap-2 mb-3">
                <Target size={16} className="text-indigo-600" /> Top 5 Deals to Focus Today
              </h3>
              <div className="space-y-2">
                {topDeals.map(l => (
                  <div key={l.id} className="bg-white rounded-lg p-3 border border-indigo-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-sm font-semibold text-gray-800">{l.companyName}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{(l as any).aiNextAction || l.aiScoreReason}</div>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${(l.aiScore ?? 0) >= 67 ? 'bg-green-100 text-green-700' : (l.aiScore ?? 0) >= 34 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                        {l.aiScore}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {atRisk.length > 0 && (
              <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 p-5 rounded-xl shadow-sm">
                <h3 className="text-sm font-bold text-red-700 flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-red-500" /> At-Risk Deals
                </h3>
                <div className="space-y-2">
                  {atRisk.map(l => {
                    const daysToClose = l.expectedCloseDate ? Math.ceil((new Date(l.expectedCloseDate).getTime() - now) / 86400000) : null;
                    const lastInteraction = l.interactions?.length ? l.interactions[l.interactions.length - 1].date : null;
                    const daysSilent = lastInteraction ? Math.floor((now - new Date(lastInteraction).getTime()) / 86400000) : null;
                    return (
                      <div key={l.id} className="bg-white rounded-lg p-3 border border-red-100">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-sm font-semibold text-gray-800">{l.companyName}</div>
                            <div className="text-xs text-red-500 mt-0.5">
                              {daysToClose !== null && daysToClose < 21 ? `Closes in ${daysToClose}d · ` : ''}
                              {daysSilent !== null ? `${daysSilent}d since last contact` : 'No interactions'}
                            </div>
                          </div>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full ml-2 flex-shrink-0 bg-red-100 text-red-700">{l.aiScore}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* PIPELINE TOTAL POR AÑO */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <TrendingUp size={18} className="text-blue-600" /> Pipeline Funnel by Year
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Total lead value aggregated by expected close year</p>
        </div>

        {pipelineByYear.length > 0 ? (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineByYear} margin={{ top: 24, right: 20, left: 10, bottom: 0 }} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 13, fontWeight: 700, fill: '#374151' }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v >= 1000000 ? (v/1000000).toFixed(1)+'M' : (v/1000).toFixed(0)+'k'}`} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)', fontSize: 12 }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Pipeline Total']}
                  labelFormatter={(label) => `Year ${label}`}
                />
                <Bar dataKey="total" name="Pipeline Total" fill="#4f46e5" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="total" position="top" formatter={(v: number) => `$${v >= 1000000 ? (v/1000000).toFixed(1)+'M' : (v/1000).toFixed(0)+'k'}`} style={{ fontSize: 11, fontWeight: 700, fill: '#4f46e5' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-400 border border-dashed border-gray-100 rounded-lg">
            No pipeline data recorded.
          </div>
        )}
      </div>

      {/* NEW SECTION: Product Breakdown */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              <Package size={18} className="text-indigo-600" /> Revenue by Product Line ({selectedYear})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="h-[300px] w-full">
                  {revenueByProduct.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                              <Pie
                                  data={revenueByProduct}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={100}
                                  paddingAngle={5}
                                  dataKey="value"
                              >
                                  {revenueByProduct.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                              </Pie>
                              <Tooltip 
                                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                              />
                          </PieChart>
                      </ResponsiveContainer>
                  ) : (
                      <div className="h-full flex items-center justify-center text-gray-400 border border-dashed border-gray-100 rounded-lg">No sales data found for {selectedYear}.</div>
                  )}
              </div>
              <div className="space-y-4">
                  {revenueByProduct.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100 hover:bg-gray-100 transition">
                          <div className="flex items-center gap-3">
                              <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></div>
                              <span className="font-medium text-gray-700">{item.name}</span>
                          </div>
                          <div className="text-right">
                              <div className="font-bold text-gray-900">${item.value.toLocaleString()}</div>
                              <div className="text-xs text-gray-500">
                                  {totalClosedWon > 0 ? ((item.value / totalClosedWon) * 100).toFixed(1) : 0}% of revenue
                              </div>
                          </div>
                      </div>
                  ))}
                  {revenueByProduct.length === 0 && (
                      <p className="text-center text-gray-400 text-sm">Close opportunities to see the product breakdown.</p>
                  )}
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-6">Monthly Distribution ({selectedYear})</h3>
          <div className="h-[300px] w-full">
            {forecastChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecastChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                  <Bar dataKey="total" name="Total Value" barSize={40} fill={COLORS.total} radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="weighted" name="Weighted Forecast" stroke={COLORS.weighted} strokeWidth={3} dot={{r: 4, fill: COLORS.weighted}} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400">No data for this year.</div>}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6">Pipeline Funnel {selectedYear}</h3>
            <div className="space-y-4">
                {funnelData.map((stage, idx) => {
                    const maxVal = Math.max(...funnelData.map(d => d.count));
                    const widthPerc = maxVal > 0 ? (stage.count / maxVal) * 100 : 0;
                    return (
                    <div key={stage.name} className="relative">
                        <div className="flex justify-between text-xs mb-1 text-gray-600 font-medium"><span>{stage.name}</span><span>{stage.count} deals</span></div>
                        <div className="w-full bg-gray-50 rounded-r-lg h-8 flex items-center relative overflow-hidden">
                            <div className={`h-full rounded-r-lg transition-all duration-500 opacity-80 ${idx === funnelData.length -1 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.max(widthPerc, 5)}%`, opacity: 1 - (idx * 0.1) }}></div>
                            <span className="absolute right-2 text-xs font-bold text-gray-500">${(stage.value / 1000).toFixed(0)}k</span>
                        </div>
                    </div>
                    )
                })}
            </div>
        </div>
      </div>

      {/* PARTNERS & FABRICANTES */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <GitMerge size={18} className="text-indigo-600" /> Sales by Partner
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">All leads grouped by partner and manufacturer</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="bg-gray-50 border border-gray-200 rounded-lg text-xs px-3 py-2 text-gray-600 outline-none focus:ring-2 focus:ring-indigo-100"
              value={partnerManufacturerFilter}
              onChange={e => setPartnerManufacturerFilter(e.target.value)}
            >
              <option value="all">All manufacturers</option>
              {manufacturerOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              <button
                onClick={() => setPartnerMetric('value')}
                className={`px-3 py-2 transition ${partnerMetric === 'value' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                $ Total
              </button>
              <button
                onClick={() => setPartnerMetric('count')}
                className={`px-3 py-2 transition ${partnerMetric === 'count' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                # Count
              </button>
            </div>
          </div>
        </div>

        {partnerChartData.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={partnerChartData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickFormatter={partnerMetric === 'value'
                      ? (v: number) => `$${v >= 1000000 ? (v/1000000).toFixed(1)+'M' : (v/1000).toFixed(0)+'k'}`
                      : (v: number) => String(v)
                    }
                  />
                  <YAxis type="category" dataKey="partner" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#374151', fontWeight: 600 }} width={110} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)', fontSize: 12 }}
                    formatter={(value: number) => [
                      partnerMetric === 'value' ? `$${value.toLocaleString()}` : `${value} leads`,
                      partnerMetric === 'value' ? 'Total Value' : 'Count'
                    ]}
                  />
                  <Bar dataKey={partnerMetric} radius={[0, 6, 6, 0]}>
                    {partnerChartData.map((_, idx) => (
                      <Cell key={idx} fill={PARTNER_COLORS[idx % PARTNER_COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey={partnerMetric}
                      position="right"
                      formatter={(v: number) => partnerMetric === 'value'
                        ? `$${v >= 1000000 ? (v/1000000).toFixed(1)+'M' : (v/1000).toFixed(0)+'k'}`
                        : String(v)
                      }
                      style={{ fontSize: 11, fontWeight: 700, fill: '#374151' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="pb-3 font-semibold">Partner</th>
                    <th className="pb-3 font-semibold text-center">Leads</th>
                    <th className="pb-3 font-semibold text-right">Total Value</th>
                    <th className="pb-3 font-semibold text-right">Manufacturers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {partnerChartData.map((row, idx) => (
                    <tr key={row.partner} className="hover:bg-gray-50 transition">
                      <td className="py-3 flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PARTNER_COLORS[idx % PARTNER_COLORS.length] }} />
                        <span className="font-medium text-gray-800">{row.partner}</span>
                      </td>
                      <td className="py-3 text-center">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">{row.count}</span>
                      </td>
                      <td className="py-3 text-right font-bold text-gray-900">${row.value.toLocaleString()}</td>
                      <td className="py-3 text-right text-xs text-gray-400 max-w-[140px] truncate">{row.manufacturers}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200">
                  <tr>
                    <td className="pt-3 font-bold text-gray-700 text-sm">Total</td>
                    <td className="pt-3 text-center font-bold text-gray-700">{partnerChartData.reduce((a, b) => a + b.count, 0)}</td>
                    <td className="pt-3 text-right font-bold text-indigo-700">${partnerChartData.reduce((a, b) => a + b.value, 0).toLocaleString()}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-gray-400 border border-dashed border-gray-100 rounded-lg">
            No partner data recorded.
          </div>
        )}
      </div>
      {/* LEADS BY COUNTRY */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Globe size={18} className="text-indigo-600" /> Leads by Country
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">All leads grouped by country (all years)</p>
          </div>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            <button
              onClick={() => setCountryMetric('value')}
              className={`px-3 py-2 transition ${countryMetric === 'value' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              $ Total
            </button>
            <button
              onClick={() => setCountryMetric('count')}
              className={`px-3 py-2 transition ${countryMetric === 'count' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              # Count
            </button>
          </div>
        </div>

        {countryChartData.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={countryChartData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickFormatter={countryMetric === 'value'
                      ? (v: number) => `$${v >= 1000000 ? (v/1000000).toFixed(1)+'M' : (v/1000).toFixed(0)+'k'}`
                      : (v: number) => String(v)
                    }
                  />
                  <YAxis type="category" dataKey="country" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#374151', fontWeight: 600 }} width={110} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)', fontSize: 12 }}
                    formatter={(value: number) => [
                      countryMetric === 'value' ? `$${value.toLocaleString()}` : `${value} leads`,
                      countryMetric === 'value' ? 'Total Value' : 'Count'
                    ]}
                  />
                  <Bar dataKey={countryMetric} radius={[0, 6, 6, 0]}>
                    {countryChartData.map((_, idx) => (
                      <Cell key={idx} fill={PARTNER_COLORS[idx % PARTNER_COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey={countryMetric}
                      position="right"
                      formatter={(v: number) => countryMetric === 'value'
                        ? `$${v >= 1000000 ? (v/1000000).toFixed(1)+'M' : (v/1000).toFixed(0)+'k'}`
                        : String(v)
                      }
                      style={{ fontSize: 11, fontWeight: 700, fill: '#374151' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="pb-3 font-semibold">Country</th>
                    <th className="pb-3 font-semibold text-center">Leads</th>
                    <th className="pb-3 font-semibold text-right">Total Value</th>
                    <th className="pb-3 font-semibold text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {countryChartData.map((row, idx) => {
                    const totalValue = countryChartData.reduce((a, b) => a + b.value, 0);
                    return (
                      <tr key={row.country} className="hover:bg-gray-50 transition">
                        <td className="py-3 flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PARTNER_COLORS[idx % PARTNER_COLORS.length] }} />
                          <span className="font-medium text-gray-800">{row.country}</span>
                        </td>
                        <td className="py-3 text-center">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">{row.count}</span>
                        </td>
                        <td className="py-3 text-right font-bold text-gray-900">${row.value.toLocaleString()}</td>
                        <td className="py-3 text-right text-xs text-gray-500 font-medium">
                          {totalValue > 0 ? ((row.value / totalValue) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-gray-200">
                  <tr>
                    <td className="pt-3 font-bold text-gray-700 text-sm">Total</td>
                    <td className="pt-3 text-center font-bold text-gray-700">{countryChartData.reduce((a, b) => a + b.count, 0)}</td>
                    <td className="pt-3 text-right font-bold text-indigo-700">${countryChartData.reduce((a, b) => a + b.value, 0).toLocaleString()}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-gray-400 border border-dashed border-gray-100 rounded-lg">
            No country data recorded.
          </div>
        )}
      </div>

      {/* TEAM LEADERBOARD */}
      {users.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Trophy size={18} className="text-yellow-500" /> Team Leaderboard {selectedYear}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Revenue closed-won by rep — click quota to edit</p>
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="pb-2 text-left w-6">#</th>
                <th className="pb-2 text-left">Rep</th>
                <th className="pb-2 text-right">Deals</th>
                <th className="pb-2 text-right">Revenue</th>
                <th className="pb-2 text-right">Quota {selectedYear}</th>
                <th className="pb-2 text-right">Attainment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leaderboard.map((row, idx) => {
                const attainment = row.goalTarget > 0 ? Math.min((row.revenue / row.goalTarget) * 100, 999) : null;
                const isMe = currentUser?.id === row.user.id;
                return (
                  <tr key={row.user.id} className={`transition ${isMe ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <td className="py-3 text-xs font-bold text-gray-300">#{idx + 1}</td>
                    <td className="py-3">
                      <span className={`font-medium ${isMe ? 'text-blue-700' : 'text-gray-800'}`}>
                        {row.user.name}{isMe && <span className="ml-1 text-[10px] text-blue-400">(you)</span>}
                      </span>
                    </td>
                    <td className="py-3 text-right text-gray-600">{row.deals}</td>
                    <td className="py-3 text-right font-bold text-gray-900">${row.revenue.toLocaleString()}</td>
                    <td className="py-3 text-right">
                      {editingGoalUserId === row.user.id ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            className="w-24 border border-blue-300 rounded text-xs px-1.5 py-0.5 text-right"
                            value={tempGoalTarget}
                            onChange={e => setTempGoalTarget(Number(e.target.value))}
                            autoFocus
                          />
                          <button onClick={() => saveUserGoal(row.user.id, row.user.name, tempGoalTarget)} className="text-green-600 hover:bg-green-50 rounded p-0.5"><Save size={12} /></button>
                          <button onClick={() => setEditingGoalUserId(null)} className="text-red-400 hover:bg-red-50 rounded p-0.5"><X size={12} /></button>
                        </span>
                      ) : (
                        <button
                          className="text-gray-500 hover:text-blue-600 text-xs font-mono"
                          onClick={() => { setEditingGoalUserId(row.user.id); setTempGoalTarget(row.goalTarget); }}
                        >
                          {row.goalTarget > 0 ? `$${row.goalTarget.toLocaleString()}` : <span className="text-gray-300 italic">— set</span>}
                        </button>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {attainment !== null ? (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${attainment >= 100 ? 'bg-green-100 text-green-700' : attainment >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                          {attainment.toFixed(0)}%
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {leaderboard.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">No reps found. Users will appear here once created.</div>
          )}
        </div>
      )}
    </div>
  );
};
