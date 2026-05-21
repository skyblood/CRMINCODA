import React, { useMemo, useState } from 'react';
import { Lead, Project } from '../types';
import { Zap, AlertTriangle, TrendingDown, DollarSign, Clock, Target, RefreshCw, ChevronRight } from 'lucide-react';

interface Props {
  leads: Lead[];
  projects: Project[];
}

const ACTIVE_STAGES = new Set(['prospect', 'qualification', 'presentation', 'proposal', 'negotiation']);

// Stage-specific fallback actions when aiNextAction is missing
const STAGE_PLAYBOOK: Record<string, string> = {
  prospect:      'Schedule a discovery call to identify pain points and decision maker',
  qualification: 'Send BANT questionnaire — confirm budget, authority, need and timeline',
  presentation:  'Prepare and schedule a tailored product demo for key stakeholders',
  proposal:      'Follow up on the sent proposal — confirm all stakeholders have reviewed it',
  negotiation:   'Schedule a final call to address remaining objections and agree on terms',
};

const STAGE_COLORS: Record<string, string> = {
  prospect:      'bg-gray-100 text-gray-600 border-gray-200',
  qualification: 'bg-blue-50 text-blue-700 border-blue-200',
  presentation:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  proposal:      'bg-purple-50 text-purple-700 border-purple-200',
  negotiation:   'bg-orange-50 text-orange-700 border-orange-200',
};

function daysSince(dateStr?: string): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function dealScore(lead: Lead): number {
  const aiBonus   = (lead.aiScore ?? 50) * 0.4;
  const recency   = Math.max(0, 30 - daysSince(lead.updatedAt)) * 0.5;
  const valueBonus = Math.min(20, (lead.value / 50_000) * 5);
  const probBonus  = (lead.probability ?? 50) * 0.05;
  return aiBonus + recency + valueBonus + probBonus;
}

export function AIInsightsPanel({ leads, projects }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const activeLeads = useMemo(
    () => leads.filter(l => !l.deleted && ACTIVE_STAGES.has(l.stage)),
    [leads]
  );

  const top5 = useMemo(
    () => [...activeLeads].sort((a, b) => dealScore(b) - dealScore(a)).slice(0, 5),
    [activeLeads]
  );

  // NBA: top leads sorted by urgency (no action defined > stale > high value)
  const nbaLeads = useMemo(() => {
    return [...activeLeads]
      .sort((a, b) => {
        const aHasAction = !!a.aiNextAction;
        const bHasAction = !!b.aiNextAction;
        if (!aHasAction && bHasAction) return -1; // no action = higher priority
        if (aHasAction && !bHasAction) return 1;
        return dealScore(b) - dealScore(a);
      })
      .slice(0, 5);
  }, [activeLeads]);

  const atRisk = useMemo(() => {
    const now = Date.now();
    return activeLeads.filter(l => {
      const stale = daysSince(l.updatedAt) > 7;
      const closeSoon = l.expectedCloseDate
        ? (new Date(l.expectedCloseDate).getTime() - now) / 86_400_000 < 45
        : false;
      return stale && closeSoon;
    }).slice(0, 5);
  }, [activeLeads]);

  const budgetRisk = useMemo(() => {
    return projects
      .filter(p => p.status === 'active')
      .map(p => {
        const logged = p.timeLogs?.reduce((s, l) => s + l.hours, 0) ?? 0;
        const budget = p.totalBudgetHours ?? 0;
        const pct = budget > 0 ? (logged / budget) * 100 : 0;
        return { ...p, pct, logged, budget };
      })
      .filter(p => p.pct >= 75)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [projects]);

  const handleRefreshActions = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/leads/score-all', { method: 'POST', credentials: 'include' });
      setLastRefreshed(new Date());
    } catch {
      // silent — scores will refresh on next app load
    } finally {
      setRefreshing(false);
    }
  };

  const hasData = top5.length > 0 || atRisk.length > 0 || budgetRisk.length > 0;
  if (!hasData) return null;

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 0 }).format(n);
  const stageLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ');

  return (
    <div className="space-y-4">
      {/* ── Next Best Action (NBA) Card ── */}
      {nbaLeads.length > 0 && (
        <div className="bg-white border border-purple-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target size={15} className="text-purple-600" />
              <span className="text-sm font-bold text-gray-800">Next Best Action</span>
              <span className="text-[10px] text-gray-400 font-normal">AI-powered playbook</span>
            </div>
            <button
              onClick={handleRefreshActions}
              disabled={refreshing}
              title="Refresh AI actions for all active deals"
              className="flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-800 disabled:opacity-40 transition px-2 py-1 rounded-lg hover:bg-purple-50 border border-purple-100"
            >
              <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Scoring…' : lastRefreshed ? `Refreshed ${Math.round((Date.now() - lastRefreshed.getTime()) / 60000)}m ago` : 'Refresh'}
            </button>
          </div>

          <div className="space-y-2.5">
            {nbaLeads.map(lead => {
              const action = lead.aiNextAction || STAGE_PLAYBOOK[lead.stage] || 'Follow up with the contact';
              const stageCls = STAGE_COLORS[lead.stage] ?? 'bg-gray-100 text-gray-600 border-gray-200';
              const isAI = !!lead.aiNextAction;
              return (
                <div key={lead.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="text-xs font-semibold text-gray-800 truncate max-w-[140px]">{lead.companyName}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${stageCls}`}>
                        {stageLabel(lead.stage)}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto">{fmt(lead.value)}</span>
                    </div>
                    <div className="flex items-start gap-1">
                      <ChevronRight size={11} className={`mt-0.5 flex-shrink-0 ${isAI ? 'text-purple-500' : 'text-gray-400'}`} />
                      <p className={`text-xs leading-snug ${isAI ? 'text-purple-800 font-medium' : 'text-gray-600'}`}>
                        {action}
                      </p>
                    </div>
                    {!isAI && (
                      <p className="text-[10px] text-gray-400 mt-0.5 ml-3.5">Stage heuristic — click Refresh for AI</p>
                    )}
                  </div>
                  {lead.aiScore != null && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                      lead.aiScore >= 70 ? 'bg-green-100 text-green-700' :
                      lead.aiScore >= 40 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {lead.aiScore}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Bottom 3 cards row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Top 5 deals */}
        {top5.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={15} className="text-amber-500" />
              <span className="text-sm font-bold text-gray-800">Top Deals to Attack</span>
            </div>
            <div className="space-y-2">
              {top5.map((lead, i) => (
                <div key={lead.id} className="flex items-start gap-2 text-xs">
                  <span className="w-5 h-5 rounded-full bg-amber-50 text-amber-600 font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{lead.companyName}</p>
                    <p className="text-gray-500">{stageLabel(lead.stage)} · {fmt(lead.value)}</p>
                  </div>
                  {lead.aiScore != null && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${lead.aiScore >= 70 ? 'bg-green-100 text-green-700' : lead.aiScore >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {lead.aiScore}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deals at risk */}
        {atRisk.length > 0 && (
          <div className="bg-white border border-orange-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-orange-500" />
              <span className="text-sm font-bold text-gray-800">Deals at Risk</span>
            </div>
            <div className="space-y-2">
              {atRisk.map(lead => {
                const daysLeft = lead.expectedCloseDate
                  ? Math.ceil((new Date(lead.expectedCloseDate).getTime() - Date.now()) / 86_400_000)
                  : null;
                const stale = daysSince(lead.updatedAt);
                return (
                  <div key={lead.id} className="text-xs">
                    <p className="font-semibold text-gray-800 truncate">{lead.companyName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1 text-orange-600">
                        <Clock size={10} /> {stale}d no activity
                      </span>
                      {daysLeft !== null && (
                        <span className={`flex items-center gap-1 ${daysLeft <= 14 ? 'text-red-600' : 'text-gray-400'}`}>
                          <TrendingDown size={10} /> closes in {daysLeft}d
                        </span>
                      )}
                      <span className="ml-auto font-medium text-gray-600">{fmt(lead.value)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Projects budget risk */}
        {budgetRisk.length > 0 && (
          <div className="bg-white border border-red-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={15} className="text-red-500" />
              <span className="text-sm font-bold text-gray-800">Projects Over Budget Risk</span>
            </div>
            <div className="space-y-2">
              {budgetRisk.map(p => (
                <div key={p.id} className="text-xs">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-800 truncate max-w-[60%]">{p.clientName}</p>
                    <span className={`font-bold ${p.pct >= 90 ? 'text-red-600' : 'text-orange-600'}`}>{p.pct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${p.pct >= 90 ? 'bg-red-500' : 'bg-orange-400'}`}
                      style={{ width: `${Math.min(p.pct, 100)}%` }}
                    />
                  </div>
                  <p className="text-gray-400 mt-0.5">{p.logged.toFixed(1)}h / {p.budget}h budgeted</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
