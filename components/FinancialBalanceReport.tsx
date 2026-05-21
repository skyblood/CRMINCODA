
import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, AlertCircle,
  ChevronDown, ChevronRight, RefreshCw, Loader2, Calendar, ChevronsUpDown,
  Banknote, Clock, Users, Target, Wallet, Receipt, BarChart2, Activity
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, BarChart, Cell
} from 'recharts';
import { ExportButton } from './ExportButton';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinancialBalanceData {
  meta: {
    generatedAt: string;
    from: string;
    to: string;
    currency: string;
    dataQualityWarnings: string[];
  };
  executiveSummary: {
    cashIn: number;
    billedPending: number;
    totalExpenses: number;
    operatingMargin: number;
    netDelta: number;
    runwayMonths: number;
  };
  revenue: {
    mrrVsOneShot: { recurring: number; oneShot: number };
    billedVsCollectedMonthly: Array<{ month: string; billed: number; collected: number }>;
    dso: { global: number; byClient: Array<{ clientName: string; dso: number; totalPaidUSD: number }> };
    arAging: { '0-30': number; '31-60': number; '61-90': number; '90+': number };
    topClientsByRevenue: Array<{ clientName: string; totalUSD: number }>;
    topDebtors: Array<{ clientName: string; totalOwedUSD: number }>;
    concentrationRisk: { topClientPct: number; top3Pct: number; herfindahlIndex: number };
  };
  margins: {
    byServiceLine: Array<{ serviceLine: string; revenue: number; cost: number; margin: number; marginPct: number }>;
    byTopClients: Array<{ clientName: string; revenue: number; cost: number; margin: number; marginPct: number }>;
    byActiveProject: Array<{ projectName: string; clientName: string; revenue: number; cost: number; margin: number; marginPct: number }>;
  };
  operations: {
    consultantUtilization: Array<{
      name: string; billableHours: number; availableHours: number;
      utilizationPct: number; effectiveHourlyCost: number;
    }>;
    billableHourCost: number;
  };
  pipeline: {
    velocity: number;
    quoteToInvoiceConversion: number;
    weightedPipelineValue: number;
    expectedNextQuarter: number;
    pipelineByStage: Array<{ stage: string; count: number; totalValue: number; weightedValue: number }>;
  };
  commissions: {
    committed: number;
    paid: number;
    pending: number;
    exposureNext60Days: number;
  };
  expenses: {
    byCategory: Array<{ category: string; totalUSD: number }>;
    monthlyTrend: Array<{ month: string; total: number; byCategory: Record<string, number> }>;
    recommendations: Array<{ item: string; action: string; estimatedMonthlySaving: number; priority: string; effort: string }>;
    benchmarks: { costPerConsultant: number; costPerClient: number; overheadRatio: number };
  };
  cashForecast90d: {
    pessimistic: Array<{ week: number; weekStart: string; cashPosition: number }>;
    base: Array<{ week: number; weekStart: string; cashPosition: number }>;
    optimistic: Array<{ week: number; weekStart: string; cashPosition: number }>;
    cashCrunchDate: string | null;
  };
  alerts: Array<{ type: string; severity: string; message: string }>;
  dataToClean: Array<{ type: string; id: string; issue: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtNum = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-50 border-red-200 text-red-800',
  high: 'bg-orange-50 border-orange-200 text-orange-800',
  medium: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  low: 'bg-blue-50 border-blue-200 text-blue-800',
};

const AGING_COLORS = ['#3B82F6', '#F59E0B', '#F97316', '#EF4444'];

// ── Collapsible Section ───────────────────────────────────────────────────────

const Section: React.FC<{ title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }> = ({
  title, icon, defaultOpen = false, children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
        {icon}
        <span className="font-semibold text-gray-800 flex-1">{title}</span>
        {open ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
};

// ── CSV helper (client-side table export) ─────────────────────────────────────

function downloadCSV(headers: string[], rows: (string | number)[][], filename: string) {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Main Component ────────────────────────────────────────────────────────────

export const FinancialBalanceReport: React.FC = () => {
  const [data, setData] = useState<FinancialBalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date range
  const today = new Date();
  const twelveMonthsAgo = new Date(today);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const [dateFrom, setDateFrom] = useState(twelveMonthsAgo.toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(today.toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('USD');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo, currency });
      const res = await fetch(`/api/reports/financial-balance?${params}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, currency]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Loading / Error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-purple-600" />
        <span className="ml-3 text-gray-500">Loading financial balance...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-red-600">{error || 'No data available'}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  const { executiveSummary: es, revenue, margins, operations, pipeline, commissions, expenses, cashForecast90d, alerts, dataToClean } = data;

  // ── AR Aging chart data ───────────────────────────────────────────────────
  const agingData = [
    { bucket: '0-30d', amount: revenue.arAging['0-30'] },
    { bucket: '31-60d', amount: revenue.arAging['31-60'] },
    { bucket: '61-90d', amount: revenue.arAging['61-90'] },
    { bucket: '90+d', amount: revenue.arAging['90+'] },
  ];

  // ── Forecast chart data ───────────────────────────────────────────────────
  const forecastData = cashForecast90d.base.map((b, i) => ({
    week: `W${b.week}`,
    pessimistic: cashForecast90d.pessimistic[i]?.cashPosition ?? 0,
    base: b.cashPosition,
    optimistic: cashForecast90d.optimistic[i]?.cashPosition ?? 0,
  }));

  return (
    <div className="space-y-6">
      {/* ── Header + Controls ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Balance</h1>
          <p className="text-sm text-gray-500">
            {new Date(data.meta.from).toLocaleDateString()} — {new Date(data.meta.to).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            <span className="text-gray-400">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <select value={currency} onChange={e => setCurrency(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
            <option value="USD">USD</option>
            <option value="COP">COP</option>
          </select>
          <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Alerts ─────────────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.low}`}>
              {a.severity === 'critical' ? <AlertCircle size={18} /> : <AlertTriangle size={18} />}
              <span className="text-sm font-medium">{a.message}</span>
              <span className="ml-auto text-xs uppercase opacity-70">{a.severity}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Executive Summary Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard icon={<Banknote size={20} className="text-green-500" />} label="Cash In" value={fmt(es.cashIn)} />
        <SummaryCard icon={<Receipt size={20} className="text-blue-500" />} label="Billed Pending" value={fmt(es.billedPending)} />
        <SummaryCard icon={<Wallet size={20} className="text-red-500" />} label="Total Expenses" value={fmt(es.totalExpenses)} />
        <SummaryCard icon={<TrendingUp size={20} className="text-purple-500" />} label="Operating Margin" value={fmtPct(es.operatingMargin)} />
        <SummaryCard icon={es.netDelta >= 0 ? <TrendingUp size={20} className="text-green-500" /> : <TrendingDown size={20} className="text-red-500" />}
          label="Net Delta" value={fmt(es.netDelta)} positive={es.netDelta >= 0} />
        <SummaryCard icon={<Clock size={20} className="text-amber-500" />} label="Runway" value={`${fmtNum(es.runwayMonths)} mo`} />
      </div>

      {/* ── Data Quality Warnings ──────────────────────────────────────────── */}
      {data.meta.dataQualityWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <strong>Data quality:</strong> {data.meta.dataQualityWarnings.join(' | ')}
        </div>
      )}

      {/* ── Revenue Section ────────────────────────────────────────────────── */}
      <Section title="Revenue" icon={<DollarSign size={18} className="text-green-600" />} defaultOpen>
        {/* Billed vs Collected chart */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Billed vs Collected (Monthly)</h3>
            <button onClick={() => downloadCSV(
              ['Month', 'Billed', 'Collected'],
              revenue.billedVsCollectedMonthly.map(r => [r.month, r.billed, r.collected]),
              'billed-vs-collected.csv'
            )} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <DollarSign size={12} /> CSV
            </button>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={revenue.billedVsCollectedMonthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Bar dataKey="billed" name="Billed" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              <Line dataKey="collected" name="Collected" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* MRR vs One-Shot */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Revenue Mix</h3>
            <div className="flex gap-4">
              <div className="flex-1 text-center p-3 bg-purple-50 rounded-lg">
                <p className="text-xs text-gray-500">Recurring (MRR)</p>
                <p className="text-lg font-bold text-purple-700">{fmt(revenue.mrrVsOneShot.recurring)}</p>
              </div>
              <div className="flex-1 text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-gray-500">One-Shot</p>
                <p className="text-lg font-bold text-blue-700">{fmt(revenue.mrrVsOneShot.oneShot)}</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Collection Efficiency</h3>
            <div className="flex gap-4">
              <div className="flex-1 text-center p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-gray-500">DSO (Global)</p>
                <p className="text-lg font-bold text-green-700">{fmtNum(revenue.dso.global)} days</p>
              </div>
              <div className="flex-1 text-center p-3 bg-amber-50 rounded-lg">
                <p className="text-xs text-gray-500">Concentration (#1)</p>
                <p className="text-lg font-bold text-amber-700">{fmtPct(revenue.concentrationRisk.topClientPct)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* AR Aging chart */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Accounts Receivable Aging</h3>
            <button onClick={() => downloadCSV(
              ['Bucket', 'Amount'],
              agingData.map(r => [r.bucket, r.amount]),
              'ar-aging.csv'
            )} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <DollarSign size={12} /> CSV
            </button>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={agingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Bar dataKey="amount" name="Outstanding" radius={[4, 4, 0, 0]}>
                {agingData.map((_, i) => <Cell key={i} fill={AGING_COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Clients + Top Debtors tables */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DataTable
            title="Top Clients by Revenue"
            headers={['Client', 'Revenue']}
            rows={revenue.topClientsByRevenue.map(r => [r.clientName, fmt(r.totalUSD)])}
            filename="top-clients-revenue.csv"
          />
          <DataTable
            title="Top Debtors"
            headers={['Client', 'Balance']}
            rows={revenue.topDebtors.map(r => [r.clientName, fmt(r.totalOwedUSD)])}
            filename="top-debtors.csv"
          />
        </div>

        {/* DSO by Client */}
        <DataTable
          title="DSO by Client"
          headers={['Client', 'DSO (days)', 'Total Paid']}
          rows={revenue.dso.byClient.map(r => [r.clientName, fmtNum(r.dso), fmt(r.totalPaidUSD)])}
          filename="dso-by-client.csv"
        />
      </Section>

      {/* ── Margins Section ────────────────────────────────────────────────── */}
      <Section title="Margins" icon={<BarChart2 size={18} className="text-purple-600" />}>
        <DataTable
          title="By Service Line"
          headers={['Type', 'Revenue', 'Cost', 'Margin', 'Margin %']}
          rows={margins.byServiceLine.map(r => [r.serviceLine, fmt(r.revenue), fmt(r.cost), fmt(r.margin), fmtPct(r.marginPct)])}
          filename="margins-by-service.csv"
        />
        <DataTable
          title="By Top Clients"
          headers={['Client', 'Revenue', 'Cost', 'Margin', 'Margin %']}
          rows={margins.byTopClients.map(r => [r.clientName, fmt(r.revenue), fmt(r.cost), fmt(r.margin), fmtPct(r.marginPct)])}
          filename="margins-by-client.csv"
        />
        <DataTable
          title="By Active Project"
          headers={['Project', 'Client', 'Revenue', 'Cost', 'Margin', 'Margin %']}
          rows={margins.byActiveProject.map(r => [r.projectName, r.clientName, fmt(r.revenue), fmt(r.cost), fmt(r.margin), fmtPct(r.marginPct)])}
          filename="margins-by-project.csv"
        />
      </Section>

      {/* ── Operations Section ─────────────────────────────────────────────── */}
      <Section title="Operations" icon={<Users size={18} className="text-blue-600" />}>
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-600">
            Avg Billable Hour Cost: <strong>{fmt(operations.billableHourCost)}</strong>
          </p>
        </div>
        <DataTable
          title="Consultant Utilization"
          headers={['Consultant', 'Billable Hours', 'Available Hours', 'Utilization', 'Eff. Hourly Cost']}
          rows={operations.consultantUtilization.map(r => [
            r.name, fmtNum(r.billableHours), fmtNum(r.availableHours),
            fmtPct(r.utilizationPct), fmt(r.effectiveHourlyCost),
          ])}
          filename="consultant-utilization.csv"
          rowClassName={(row) => {
            const pct = parseFloat(row[3]);
            if (pct > 90) return 'bg-red-50';
            if (pct < 50) return 'bg-yellow-50';
            return '';
          }}
        />
      </Section>

      {/* ── Pipeline Section ───────────────────────────────────────────────── */}
      <Section title="Pipeline" icon={<Target size={18} className="text-indigo-600" />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <MiniCard label="Velocity" value={`${fmtNum(pipeline.velocity)} days`} />
          <MiniCard label="Quote-to-Invoice" value={fmtPct(pipeline.quoteToInvoiceConversion)} />
          <MiniCard label="Weighted Pipeline" value={fmt(pipeline.weightedPipelineValue)} />
          <MiniCard label="Expected (90d)" value={fmt(pipeline.expectedNextQuarter)} />
        </div>
        <DataTable
          title="Pipeline by Stage"
          headers={['Stage', 'Count', 'Value', 'Weighted']}
          rows={pipeline.pipelineByStage.map(r => [r.stage, r.count, fmt(r.totalValue), fmt(r.weightedValue)])}
          filename="pipeline-by-stage.csv"
        />
      </Section>

      {/* ── Commissions Section ────────────────────────────────────────────── */}
      <Section title="Commissions" icon={<Wallet size={18} className="text-orange-600" />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MiniCard label="Committed" value={fmt(commissions.committed)} />
          <MiniCard label="Paid" value={fmt(commissions.paid)} />
          <MiniCard label="Pending" value={fmt(commissions.pending)} />
          <MiniCard label="Exposure (60d)" value={fmt(commissions.exposureNext60Days)} />
        </div>
      </Section>

      {/* ── Expenses Section ───────────────────────────────────────────────── */}
      <Section title="Expenses" icon={<Receipt size={18} className="text-red-600" />}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <MiniCard label="Cost / Consultant" value={fmt(expenses.benchmarks.costPerConsultant)} />
          <MiniCard label="Cost / Client" value={fmt(expenses.benchmarks.costPerClient)} />
          <MiniCard label="Overhead Ratio" value={fmtPct(expenses.benchmarks.overheadRatio)} />
        </div>
        <DataTable
          title="Expenses by Category"
          headers={['Category', 'Total']}
          rows={expenses.byCategory.map(r => [r.category, fmt(r.totalUSD)])}
          filename="expenses-by-category.csv"
        />
        {expenses.recommendations.length > 0 && (
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">Recommendations</h3>
            <ul className="space-y-2">
              {expenses.recommendations.map((r, i) => (
                <li key={i} className="text-sm text-blue-700 flex items-start gap-2">
                  <span className={`inline-block px-1.5 py-0.5 text-xs rounded ${
                    r.priority === 'high' ? 'bg-red-100 text-red-700' : r.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                  }`}>{r.priority}</span>
                  <span><strong>{r.item}:</strong> {r.action} (est. save {fmt(r.estimatedMonthlySaving)}/mo)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* ── Cash Forecast Section ──────────────────────────────────────────── */}
      <Section title="Cash Forecast (90 days)" icon={<Activity size={18} className="text-emerald-600" />}>
        {cashForecast90d.cashCrunchDate && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 mb-4">
            <AlertCircle size={16} className="inline mr-2" />
            <strong>Cash crunch projected:</strong> {cashForecast90d.cashCrunchDate}
          </div>
        )}
        <div className="bg-gray-50 rounded-lg p-4">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Line dataKey="pessimistic" name="Pessimistic" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
              <Line dataKey="base" name="Base" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 2 }} />
              <Line dataKey="optimistic" name="Optimistic" stroke="#10B981" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* ── Data to Clean ──────────────────────────────────────────────────── */}
      {dataToClean && dataToClean.length > 0 && (
        <Section title={`Data to Clean (${dataToClean.length})`} icon={<AlertTriangle size={18} className="text-amber-600" />}>
          <DataTable
            title=""
            headers={['Type', 'ID', 'Issue']}
            rows={dataToClean.map(r => [r.type, r.id, r.issue])}
            filename="data-to-clean.csv"
          />
        </Section>
      )}
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SummaryCard: React.FC<{ icon: React.ReactNode; label: string; value: string; positive?: boolean }> = ({
  icon, label, value, positive,
}) => (
  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2">
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
    </div>
    <p className={`text-xl font-bold ${positive === false ? 'text-red-600' : positive === true ? 'text-green-600' : 'text-gray-900'}`}>
      {value}
    </p>
  </div>
);

const MiniCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-gray-50 rounded-lg p-3 text-center">
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-lg font-bold text-gray-800">{value}</p>
  </div>
);

const DataTable: React.FC<{
  title: string;
  headers: string[];
  rows: (string | number)[][];
  filename: string;
  rowClassName?: (row: string[]) => string;
}> = ({ title, headers, rows, filename, rowClassName }) => (
  <div className="bg-gray-50 rounded-lg p-4">
    <div className="flex items-center justify-between mb-3">
      {title && <h3 className="text-sm font-semibold text-gray-700">{title}</h3>}
      <button onClick={() => downloadCSV(headers, rows, filename)}
        className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 ml-auto">
        <DollarSign size={12} /> CSV
      </button>
    </div>
    {rows.length === 0 ? (
      <p className="text-sm text-gray-400 italic">No data</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {headers.map((h, i) => (
                <th key={i} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={`border-b border-gray-100 hover:bg-gray-100 transition-colors ${rowClassName ? rowClassName(row.map(String)) : ''}`}>
                {row.map((cell, j) => (
                  <td key={j} className="py-2 px-3 text-gray-700">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
