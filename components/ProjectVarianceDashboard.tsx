import React, { useMemo } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle, TrendingDown, Clock, User, DollarSign } from 'lucide-react';

interface TimeLog {
  id?: string;
  consultantName: string;
  hours?: number;
  entryCost?: number;
  hourlyCostSnapshot?: number;
  date?: string;
  description?: string;
}

interface ProjectVarianceDashboardProps {
  projectName: string;
  budgetedCost?: number;
  actualCost: number;
  timeLogs: TimeLog[];
}

export const ProjectVarianceDashboard: React.FC<ProjectVarianceDashboardProps> = ({
  projectName,
  budgetedCost,
  actualCost,
  timeLogs
}) => {
  const stats = useMemo(() => {
    const budgeted = budgetedCost || 0;
    const actual = actualCost || 0;
    const variance = budgeted - actual;
    const variancePercent = budgeted > 0 ? (variance / budgeted) * 100 : 0;
    const burnRate = budgeted > 0 ? (actual / budgeted) * 100 : 0;

    // Group by consultant
    const byConsultant: Record<string, { hours: number; entryCost: number }> = {};
    timeLogs.forEach(log => {
      if (!byConsultant[log.consultantName]) {
        byConsultant[log.consultantName] = { hours: 0, entryCost: 0 };
      }
      byConsultant[log.consultantName].hours += log.hours || 0;
      byConsultant[log.consultantName].entryCost += log.entryCost || 0;
    });

    const consultantData = Object.entries(byConsultant)
      .map(([name, { hours, entryCost }]) => ({
        name,
        hours,
        entryCost,
        percentOfBudget: budgeted > 0 ? (entryCost / budgeted) * 100 : 0
      }))
      .sort((a, b) => b.entryCost - a.entryCost);

    return { budgeted, actual, variance, variancePercent, burnRate, consultantData };
  }, [budgetedCost, actualCost, timeLogs]);

  const getVarianceColor = (percent: number) => {
    if (percent >= 0) return 'text-green-700 bg-green-50';
    if (percent >= -20) return 'text-amber-700 bg-amber-50';
    return 'text-red-700 bg-red-50';
  };

  const getBurnRateColor = (burnRate: number) => {
    if (burnRate <= 70) return 'bg-green-100 text-green-800';
    if (burnRate <= 99) return 'bg-amber-100 text-amber-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-bold text-gray-900">Project Budget Tracking</h3>
        <p className="text-sm text-gray-500">{projectName}</p>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Budgeted Cost */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Budgeted Cost</span>
            <DollarSign size={16} className="text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            ${stats.budgeted.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <p className="text-xs text-gray-400 mt-1">Project estimate</p>
        </div>

        {/* Actual Cost */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual Cost</span>
            <DollarSign size={16} className="text-orange-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            ${stats.actual.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <p className="text-xs text-gray-400 mt-1">From timesheets</p>
        </div>

        {/* Variance */}
        <div className={`rounded-lg p-4 shadow-sm border ${getVarianceColor(stats.variancePercent)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide opacity-70">Variance</span>
            {stats.variancePercent >= 0 ? (
              <TrendingUp size={16} />
            ) : (
              <TrendingDown size={16} />
            )}
          </div>
          <div className="text-2xl font-bold">
            ${Math.abs(stats.variance).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <p className="text-xs opacity-70 mt-1">
            {stats.variancePercent >= 0 ? 'Under budget' : 'Over budget'} ({stats.variancePercent.toFixed(1)}%)
          </p>
        </div>

        {/* Burn Rate */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Burn Rate</span>
            <Clock size={16} className="text-purple-600" />
          </div>
          <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${getBurnRateColor(stats.burnRate)}`}>
            {stats.burnRate.toFixed(1)}%
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {stats.burnRate <= 70 ? '✓ Healthy' : stats.burnRate <= 99 ? '⚠ At risk' : '✗ Over budget'}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {stats.budgeted > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Budget Utilization</span>
            <span className="text-sm font-bold text-gray-900">{stats.burnRate.toFixed(1)}%</span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                stats.burnRate <= 70 ? 'bg-green-500' :
                stats.burnRate <= 99 ? 'bg-amber-500' :
                'bg-red-500'
              }`}
              style={{ width: `${Math.min(stats.burnRate, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Consultants Table */}
      {stats.consultantData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <User size={14} /> Consultant Hours & Costs
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Consultant</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-700">Hours</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-700">Cost</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-700">% of Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.consultantData.map(consultant => (
                  <tr key={consultant.name} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-3 font-medium text-gray-900">{consultant.name}</td>
                    <td className="px-6 py-3 text-right text-gray-600">
                      {consultant.hours.toFixed(1)}h
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">
                      ${consultant.entryCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-medium text-gray-700">{consultant.percentOfBudget.toFixed(1)}%</span>
                        {consultant.percentOfBudget < 50 && (
                          <div className="w-2 h-2 rounded-full bg-green-500" title="Normal usage" />
                        )}
                        {consultant.percentOfBudget >= 50 && consultant.percentOfBudget <= 80 && (
                          <div className="w-2 h-2 rounded-full bg-amber-500" title="High usage" />
                        )}
                        {consultant.percentOfBudget > 80 && (
                          <div className="w-2 h-2 rounded-full bg-red-500" title="Very high usage" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr className="font-semibold text-gray-900">
                  <td className="px-6 py-3">TOTAL</td>
                  <td className="px-6 py-3 text-right">
                    {stats.consultantData.reduce((sum, c) => sum + c.hours, 0).toFixed(1)}h
                  </td>
                  <td className="px-6 py-3 text-right">
                    ${stats.actual.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-6 py-3 text-right">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {stats.consultantData.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <Clock size={24} className="mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">No time logs recorded yet.</p>
          <p className="text-xs text-gray-400">Time entries will appear here as consultants log hours.</p>
        </div>
      )}
    </div>
  );
};
