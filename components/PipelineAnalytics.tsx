import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend, LineChart, Line, ReferenceLine,
} from 'recharts';
import { TrendingUp, Target, Award, Clock, ChevronDown, Sparkles, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { fetchPipelineAnalytics } from '../services/apiService';

const BM600 = '#410074';
const STAGE_ORDER = [
    'prospect', 'qualification', 'presentation', 'proposal', 'negotiation',
    'closed-won', 'project-delivered', 'closed-lost',
];
const STAGE_LABELS: Record<string, string> = {
    'prospect': 'Prospect', 'qualification': 'Qualification', 'presentation': 'Presentation',
    'proposal': 'Proposal', 'negotiation': 'Negotiation', 'closed-won': 'Won',
    'project-delivered': 'Delivered', 'closed-lost': 'Lost',
};
const STAGE_COLORS: Record<string, string> = {
    'prospect': '#94a3b8', 'qualification': '#60a5fa', 'presentation': '#a78bfa',
    'proposal': '#f59e0b', 'negotiation': '#f97316', 'closed-won': '#22c55e',
    'project-delivered': '#10b981', 'closed-lost': '#ef4444',
};

const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000   ? `$${(n / 1_000).toFixed(0)}K`
    : `$${n.toFixed(0)}`;

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const PipelineAnalytics: React.FC = () => {
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [aiForecast, setAiForecast] = useState<any>(null);
    const [aiForecastLoading, setAiForecastLoading] = useState(false);

    const handleGenerateForecast = async () => {
        setAiForecastLoading(true);
        try {
            const res = await fetch('/api/ai/pipeline-forecast', { credentials: 'include' });
            if (res.ok) setAiForecast(await res.json());
        } catch {
            // silent
        } finally {
            setAiForecastLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchPipelineAnalytics(year)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [year]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
            </div>
        );
    }
    if (!data) {
        return <div className="p-8 text-gray-500">Failed to load analytics.</div>;
    }

    // Sort funnel
    const funnel = STAGE_ORDER
        .map(s => data.stageCounts.find((d: any) => d._id === s))
        .filter(Boolean)
        .map((d: any) => ({ ...d, label: STAGE_LABELS[d._id] || d._id, color: STAGE_COLORS[d._id] || BM600 }));

    // Monthly forecast
    const forecast = (data.monthlyForecast || []).map((d: any) => ({
        label: `${MONTH_NAMES[d._id.month]} ${d._id.year !== currentYear ? d._id.year : ''}`.trim(),
        weighted: Math.round(d.weightedValue),
        total: Math.round(d.totalValue),
        count: d.count,
    }));

    // Top manufacturers
    const manufacturers = (data.topManufacturers || []).map((d: any) => ({
        name: d._id,
        won: d.won,
        lost: d.lost,
        winRate: d.won + d.lost > 0 ? Math.round((d.won / (d.won + d.lost)) * 100) : 0,
        value: d.totalValue,
    }));

    // Avg days per stage
    const avgDays = STAGE_ORDER
        .map(s => data.avgDaysPerStage.find((d: any) => d._id === s))
        .filter(Boolean)
        .map((d: any) => ({ label: STAGE_LABELS[d._id] || d._id, days: Math.round(d.avgDays) }));

    const { won, lost, winRate } = data.winLoss;

    const LOSS_COLORS = ['#ef4444','#f97316','#f59e0b','#8b5cf6','#3b82f6','#10b981','#6b7280'];
    const lossReasons = (data.lossReasons || []).map((d: any, i: number) => ({
        name: d._id, value: d.count, totalValue: d.totalValue, color: LOSS_COLORS[i % LOSS_COLORS.length],
    }));

    return (
        <div className="space-y-6 p-4 md:p-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Pipeline Analytics</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Conversion rates, win/loss analysis and revenue forecast</p>
                </div>
                <div className="relative">
                    <select
                        value={year}
                        onChange={e => setYear(Number(e.target.value))}
                        className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                    >
                        {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard icon={<Award className="w-5 h-5 text-green-600" />} label="Win Rate" value={winRate !== null ? `${winRate}%` : '—'} sub={`${won} won / ${lost} lost`} color="green" />
                <KPICard icon={<Target className="w-5 h-5 text-purple-600" />} label="Pipeline Deals" value={funnel.filter((f: any) => !['closed-won','closed-lost','project-delivered'].includes(f._id)).reduce((s: number, f: any) => s + f.count, 0)} sub="active opportunities" color="purple" />
                <KPICard icon={<TrendingUp className="w-5 h-5 text-blue-600" />} label="Pipeline Value" value={fmt(funnel.reduce((s: number, f: any) => s + f.totalValue, 0))} sub="total across all stages" color="blue" />
                <KPICard icon={<Clock className="w-5 h-5 text-amber-600" />} label="Avg Deal Time" value={avgDays.length ? `${Math.round(avgDays.reduce((s: any, d: any) => s + d.days, 0) / avgDays.length)}d` : '—'} sub="avg days per stage" color="amber" />
            </div>

            {/* AI Forecast Card */}
            <div className="bg-white border border-purple-200 rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-purple-600" />
                        <span className="text-sm font-bold text-gray-800">AI Pipeline Forecast</span>
                        <span className="text-[10px] text-gray-400">Powered by Claude</span>
                        {aiForecast && (
                            <span className="text-[10px] text-gray-400">· {new Date(aiForecast.generatedAt).toLocaleTimeString()}</span>
                        )}
                    </div>
                    <button
                        onClick={handleGenerateForecast}
                        disabled={aiForecastLoading}
                        className="flex items-center gap-1.5 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        <Sparkles size={11} className={aiForecastLoading ? 'animate-pulse' : ''} />
                        {aiForecastLoading ? 'Analyzing…' : aiForecast ? 'Refresh' : 'Generate Forecast'}
                    </button>
                </div>

                {!aiForecast && !aiForecastLoading && (
                    <p className="text-xs text-gray-400 text-center py-6">Click "Generate Forecast" to get an AI-powered revenue prediction based on your live pipeline data.</p>
                )}

                {aiForecastLoading && (
                    <div className="flex items-center justify-center py-8 gap-2 text-purple-600 text-sm">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600" />
                        Analyzing pipeline data…
                    </div>
                )}

                {aiForecast && !aiForecastLoading && (() => {
                    const healthConfig = {
                        Healthy:  { icon: <CheckCircle size={13} />, cls: 'bg-green-100 text-green-700 border-green-200' },
                        'At Risk': { icon: <AlertTriangle size={13} />, cls: 'bg-amber-100 text-amber-700 border-amber-200' },
                        Critical: { icon: <XCircle size={13} />,    cls: 'bg-red-100 text-red-700 border-red-200' },
                    } as const;
                    const hk = (aiForecast.health as keyof typeof healthConfig) in healthConfig ? aiForecast.health as keyof typeof healthConfig : 'At Risk';
                    const hc = healthConfig[hk];
                    return (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 flex-wrap">
                                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${hc.cls}`}>
                                    {hc.icon} {aiForecast.health}
                                </span>
                                <span className="text-[11px] text-gray-400">Win rate: {aiForecast.meta?.winRate !== null ? `${aiForecast.meta.winRate}%` : 'N/A'} · {aiForecast.meta?.activeDeals} active deals · Weighted: {fmt(aiForecast.meta?.weightedPipeline ?? 0)}</span>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                {([['30d', aiForecast.d30], ['60d', aiForecast.d60], ['90d', aiForecast.d90]] as [string, number][]).map(([label, val]) => (
                                    <div key={label} className="text-center bg-purple-50 rounded-xl p-3 border border-purple-100">
                                        <p className="text-[10px] text-purple-500 font-semibold uppercase tracking-wide mb-1">Next {label}</p>
                                        <p className="text-lg font-bold text-purple-800">{fmt(val)}</p>
                                        <p className="text-[10px] text-purple-400">est. revenue</p>
                                    </div>
                                ))}
                            </div>

                            {aiForecast.narrative && (
                                <p className="text-xs text-gray-600 leading-relaxed border-l-2 border-purple-200 pl-3">{aiForecast.narrative}</p>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {aiForecast.topRisk && (
                                    <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg p-2.5">
                                        <AlertTriangle size={12} className="text-red-500 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-0.5">Top Risk</p>
                                            <p className="text-xs text-red-700">{aiForecast.topRisk}</p>
                                        </div>
                                    </div>
                                )}
                                {aiForecast.topAction && (
                                    <div className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-lg p-2.5">
                                        <CheckCircle size={12} className="text-green-500 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide mb-0.5">Top Action</p>
                                            <p className="text-xs text-green-700">{aiForecast.topAction}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Funnel */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">Conversion Funnel</h2>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 16 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tickFormatter={n => String(n)} />
                            <YAxis dataKey="label" type="category" width={90} tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(v: any) => [v, 'Leads']} />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                {funnel.map((f: any, i: number) => (
                                    <Cell key={i} fill={f.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Win/Loss Pie */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">Win / Loss Ratio</h2>
                    {won + lost > 0 ? (
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie data={[{ name: 'Won', value: won }, { name: 'Lost', value: lost }]} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                    <Cell fill="#22c55e" />
                                    <Cell fill="#ef4444" />
                                </Pie>
                                <Legend />
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-60 text-gray-400 text-sm">No closed deals yet</div>
                    )}
                </div>

                {/* Loss Reasons */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">Loss Reasons</h2>
                    {lossReasons.length > 0 ? (
                        <>
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie data={lossReasons} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                                        {lossReasons.map((r: any, i: number) => <Cell key={i} fill={r.color} />)}
                                    </Pie>
                                    <Tooltip formatter={(v: any, n: string, p: any) => [v, p.payload.name]} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="mt-2 space-y-1">
                                {lossReasons.map((r: any) => (
                                    <div key={r.name} className="flex items-center justify-between text-xs text-gray-600">
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: r.color }} />{r.name}</span>
                                        <span className="font-semibold">{r.value} deals · {fmt(r.totalValue)}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-60 text-gray-400 text-sm">No loss data yet — reasons captured when marking deals lost</div>
                    )}
                </div>

                {/* Monthly Forecast */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 lg:col-span-2">
                    <h2 className="text-sm font-semibold text-gray-700 mb-1">Monthly Revenue Forecast</h2>
                    <p className="text-xs text-gray-400 mb-4">Weighted by probability — blue bars show probability-adjusted value</p>
                    {forecast.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={forecast}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(v: any, name: string) => [fmt(v), name === 'weighted' ? 'Weighted' : 'Full Value']} />
                                <Legend />
                                <Bar dataKey="total" name="Full Value" fill="#e9d5ff" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="weighted" name="Weighted" fill={BM600} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No forecast data — set expected close dates on leads</div>
                    )}
                </div>

                {/* Avg Days Per Stage */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">Avg Days per Stage</h2>
                    {avgDays.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={avgDays}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(v: any) => [`${v} days`, 'Avg Days']} />
                                <Bar dataKey="days" fill={BM600} radius={[4, 4, 0, 0]} />
                                <ReferenceLine y={14} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '2 weeks', fontSize: 10, fill: '#f59e0b' }} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No stage history data yet</div>
                    )}
                </div>

                {/* Win Rate by Manufacturer */}
                {manufacturers.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <h2 className="text-sm font-semibold text-gray-700 mb-4">Win Rate by Manufacturer</h2>
                        <div className="space-y-3">
                            {manufacturers.map((m: any) => (
                                <div key={m.name}>
                                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                                        <span className="font-medium">{m.name}</span>
                                        <span>{m.won}W / {m.lost}L — <span className="font-semibold text-green-600">{m.winRate}%</span></span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${m.winRate}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const COLOR_MAP: Record<string, string> = {
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
};

const KPICard: React.FC<{ icon: React.ReactNode; label: string; value: any; sub: string; color: string }> = ({ icon, label, value, sub, color }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className={`inline-flex p-2 rounded-lg ${COLOR_MAP[color]} mb-2`}>{icon}</div>
        <div className="text-xl font-bold text-gray-900">{value}</div>
        <div className="text-xs font-medium text-gray-500">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
);

export default PipelineAnalytics;
