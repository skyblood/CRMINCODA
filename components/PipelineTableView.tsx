import React from 'react';
import { AlertTriangle, Clock, ChevronUp, ChevronDown, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 50;
import { Lead, SalesStage } from '../types';

// ── Aging thresholds (days) per stage ────────────────────────────────────────
const AGING_THRESHOLDS: Record<string, { yellow: number; red: number }> = {
  prospect:        { yellow: 7,  red: 14 },
  qualification:   { yellow: 10, red: 21 },
  presentation:    { yellow: 7,  red: 14 },
  proposal:        { yellow: 7,  red: 14 },
  negotiation:     { yellow: 5,  red: 10 },
  'closed-won':    { yellow: 30, red: 60 },
  'project-delivered': { yellow: 90, red: 180 },
  'closed-lost':   { yellow: 30, red: 60 },
};

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  qualification: 'Qualification',
  presentation: 'Presentation',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  'closed-won': 'Closed Won',
  'project-delivered': 'Delivered',
  'closed-lost': 'Closed Lost',
};

const STAGE_COLORS: Record<string, string> = {
  prospect: 'bg-gray-100 text-gray-700',
  qualification: 'bg-blue-100 text-blue-700',
  presentation: 'bg-purple-100 text-purple-700',
  proposal: 'bg-yellow-100 text-yellow-700',
  negotiation: 'bg-orange-100 text-orange-700',
  'closed-won': 'bg-green-100 text-green-700',
  'project-delivered': 'bg-teal-100 text-teal-700',
  'closed-lost': 'bg-red-100 text-red-700',
};

function getDaysInCurrentStage(lead: Lead): number {
  if (lead.stageHistory && lead.stageHistory.length > 0) {
    const last = lead.stageHistory[lead.stageHistory.length - 1];
    if (!last.exitedAt) {
      return Math.floor((Date.now() - new Date(last.enteredAt).getTime()) / (1000 * 60 * 60 * 24));
    }
  }
  return 0;
}

function getAgingColor(lead: Lead): 'green' | 'yellow' | 'red' {
  const days = getDaysInCurrentStage(lead);
  const thresholds = AGING_THRESHOLDS[lead.stage] ?? { yellow: 14, red: 30 };
  if (days >= thresholds.red) return 'red';
  if (days >= thresholds.yellow) return 'yellow';
  return 'green';
}

type SortKey = 'companyName' | 'stage' | 'value' | 'probability' | 'expectedCloseDate' | 'daysInStage' | 'nextStepDueDate';

interface Props {
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

export default function PipelineTableView({ leads, onSelectLead, selectedIds = [], onSelectionChange }: Props) {
  const [sortKey, setSortKey] = React.useState<SortKey>('daysInStage');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const [page, setPage] = React.useState(1);

  const toggleOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSelectionChange) return;
    onSelectionChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  };

  const sorted = [...leads].sort((a, b) => {
    let av: string | number = 0;
    let bv: string | number = 0;
    switch (sortKey) {
      case 'companyName': av = a.companyName ?? ''; bv = b.companyName ?? ''; break;
      case 'stage': av = a.stage ?? ''; bv = b.stage ?? ''; break;
      case 'value': av = a.value ?? 0; bv = b.value ?? 0; break;
      case 'probability': av = a.probability ?? 0; bv = b.probability ?? 0; break;
      case 'expectedCloseDate': av = a.expectedCloseDate ?? ''; bv = b.expectedCloseDate ?? ''; break;
      case 'daysInStage': av = getDaysInCurrentStage(a); bv = getDaysInCurrentStage(b); break;
      case 'nextStepDueDate': av = a.nextStepDueDate ?? ''; bv = b.nextStepDueDate ?? ''; break;
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(selectedIds.length === paginated.length ? [] : paginated.map(l => l.id));
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown size={12} className="text-gray-300 ml-1 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-blue-500 ml-1 inline" />
      : <ChevronDown size={12} className="text-blue-500 ml-1 inline" />;
  };

  const th = (label: string, k: SortKey) => (
    <th
      className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
      onClick={() => handleSort(k)}
    >
      {label}<SortIcon k={k} />
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {onSelectionChange && (
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 cursor-pointer"
                  checked={paginated.length > 0 && paginated.every(l => selectedIds.includes(l.id))}
                  onChange={toggleAll}
                />
              </th>
            )}
            {th('Company', 'companyName')}
            {th('Stage', 'stage')}
            {th('Value', 'value')}
            {th('%', 'probability')}
            {th('Close Date', 'expectedCloseDate')}
            {th('Days in Stage', 'daysInStage')}
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Next Step</th>
            {th('Due', 'nextStepDueDate')}
          </tr>
        </thead>
        <tbody>
          {paginated.map(lead => {
            const aging = getAgingColor(lead);
            const days = getDaysInCurrentStage(lead);
            const isOverdue = lead.nextStepDueDate && new Date(lead.nextStepDueDate) < new Date();
            const rowBorder = aging === 'red' ? 'border-l-4 border-l-red-400' : aging === 'yellow' ? 'border-l-4 border-l-yellow-400' : 'border-l-4 border-l-transparent';
            return (
              <tr
                key={lead.id}
                className={`border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors ${rowBorder} ${selectedIds.includes(lead.id) ? 'bg-blue-50' : ''}`}
                onClick={() => onSelectLead(lead)}
              >
                {onSelectionChange && (
                  <td className="px-3 py-2.5 w-8" onClick={e => toggleOne(lead.id, e)}>
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 cursor-pointer"
                      checked={selectedIds.includes(lead.id)}
                      onChange={() => {}}
                    />
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <div className="font-medium text-gray-900">{lead.companyName}</div>
                  <div className="text-xs text-gray-400">{lead.contactName}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLORS[lead.stage] ?? 'bg-gray-100 text-gray-600'}`}>
                    {STAGE_LABELS[lead.stage] ?? lead.stage}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-gray-700">
                  ${(lead.value / 1000).toFixed(1)}k
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${lead.probability}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{lead.probability}%</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                  {lead.expectedCloseDate ? new Date(lead.expectedCloseDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                    aging === 'red' ? 'bg-red-100 text-red-700' :
                    aging === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {aging !== 'green' && <AlertTriangle size={10} />}
                    {days}d
                  </span>
                </td>
                <td className="px-3 py-2.5 max-w-[180px]">
                  <span className="text-xs text-gray-600 truncate block">{lead.nextStep || <span className="text-gray-300 italic">—</span>}</span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {lead.nextStepDueDate ? (
                    <span className={`text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {isOverdue && <Clock size={10} className="inline mr-0.5" />}
                      {new Date(lead.nextStepDueDate).toLocaleDateString()}
                    </span>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">No leads match current filters.</div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-500">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} of {sorted.length} leads
          </span>
          <div className="flex items-center gap-1">
            <button
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
            >
              <ChevronLeft size={16} className="text-gray-600" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | '...')[]>((acc, p, i, arr) => {
                if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '...'
                  ? <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
                  : <button
                      key={p}
                      className={`w-7 h-7 text-xs rounded ${p === safePage ? 'bg-blue-600 text-white font-semibold' : 'text-gray-600 hover:bg-gray-200'}`}
                      onClick={() => setPage(p as number)}
                    >{p}</button>
              )
            }
            <button
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
            >
              <ChevronRight size={16} className="text-gray-600" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
