
import React, { useState, useMemo } from 'react';
import { Project, User, TimeLog } from '../types';
import { CheckCircle, Clock, ChevronRight, ChevronDown, Save, CheckSquare, Square, XCircle, History, DollarSign, Filter } from 'lucide-react';

interface TimeApprovalManagerProps {
  projects: Project[];
  users: User[];
  onUpdateProject: (project: Project) => void;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

export const TimeApprovalManager: React.FC<TimeApprovalManagerProps> = ({ projects, users, onUpdateProject }) => {
  const now = new Date();
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [filterMonth, setFilterMonth] = useState<number>(0); // 0 = all, 1-12 = specific month
  const [filterYear, setFilterYear] = useState<number>(now.getFullYear());
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedHistoryProjects, setExpandedHistoryProjects] = useState<Record<string, boolean>>({});
  const [rateEdits, setRateEdits] = useState<Record<string, number>>({});
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [selectedPaidIds, setSelectedPaidIds] = useState<string[]>([]);

  // Derive available years from all log dates across all projects
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    projects.forEach(p => {
      [...(p.timeLogs || []), ...((p.tickets || []).flatMap(t => t.timeLogs || []))]
        .forEach(l => { if (l.date) years.add(new Date(l.date).getFullYear()); });
    });
    years.add(now.getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [projects]);

  // Filter predicate: true if log falls within the selected month/year
  const matchesFilter = (log: TimeLog) => {
    if (!log.date) return false;
    const d = new Date(log.date);
    const yearOk = d.getFullYear() === filterYear;
    const monthOk = filterMonth === 0 || (d.getMonth() + 1) === filterMonth;
    return yearOk && monthOk;
  };

  // Helper: Toggle accordion
  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  // Helper: Update rate in local state before saving
  const handleRateChange = (projectId: string, consultantName: string, rate: number) => {
    setRateEdits(prev => ({ ...prev, [`${projectId}_${consultantName}`]: rate }));
  };

  // Helper: Save rate to project
  const saveRate = (project: Project, consultantName: string) => {
    const newRate = rateEdits[`${project.id}_${consultantName}`];
    if (newRate === undefined) return;

    const updatedProject = {
      ...project,
      consultantRates: {
        ...(project.consultantRates || {}),
        [consultantName]: newRate
      }
    };
    onUpdateProject(updatedProject);
    // Clear edit state to show saved value
    const newEdits = { ...rateEdits };
    delete newEdits[`${project.id}_${consultantName}`];
    setRateEdits(newEdits);
  };

  // Helper: Selection Logic
  const toggleLogSelection = (logId: string) => {
      setSelectedLogIds(prev => 
          prev.includes(logId) ? prev.filter(id => id !== logId) : [...prev, logId]
      );
  };

  const toggleSelectAllConsultant = (logIds: string[]) => {
      const allSelected = logIds.every(id => selectedLogIds.includes(id));
      if (allSelected) {
          // Deselect all
          setSelectedLogIds(prev => prev.filter(id => !logIds.includes(id)));
      } else {
          // Select all (adding missing ones)
          const newIds = logIds.filter(id => !selectedLogIds.includes(id));
          setSelectedLogIds(prev => [...prev, ...newIds]);
      }
  };

  // Helper: Approve logs (handles both project.timeLogs and ticket.timeLogs)
  const approveLogs = (project: Project, logsToApprove: TimeLog[], rate: number) => {
    const approveIds = new Set(logsToApprove.map(l => l.id));
    const applyApproval = (log: TimeLog) =>
      approveIds.has(log.id)
        ? { ...log, status: 'approved' as const, approvedRate: rate, approvedCost: log.hours * rate }
        : log;

    const updatedTimeLogs = (project.timeLogs || []).map(applyApproval);
    const updatedTickets = (project.tickets || []).map(ticket => ({
      ...ticket,
      timeLogs: (ticket.timeLogs || []).map(applyApproval)
    }));

    onUpdateProject({ ...project, timeLogs: updatedTimeLogs, tickets: updatedTickets });
    setSelectedLogIds(prev => prev.filter(id => !approveIds.has(id)));
  };

  // Helper: Reject logs (handles both project.timeLogs and ticket.timeLogs)
  const rejectLogs = (project: Project, logsToReject: TimeLog[]) => {
    const rejectIds = new Set(logsToReject.map(l => l.id));
    const applyRejection = (log: TimeLog) =>
      rejectIds.has(log.id) ? { ...log, status: 'rejected' as const } : log;

    const updatedTimeLogs = (project.timeLogs || []).map(applyRejection);
    const updatedTickets = (project.tickets || []).map(ticket => ({
      ...ticket,
      timeLogs: (ticket.timeLogs || []).map(applyRejection)
    }));

    onUpdateProject({ ...project, timeLogs: updatedTimeLogs, tickets: updatedTickets });
    setSelectedLogIds(prev => prev.filter(id => !rejectIds.has(id)));
  };

  const revertToPending = (project: Project, logId: string) => {
    const revert = (log: TimeLog) =>
      log.id === logId ? { ...log, status: 'pending' as const, approvedRate: undefined, approvedCost: undefined } : log;
    const updatedTimeLogs = (project.timeLogs || []).map(revert);
    const updatedTickets = (project.tickets || []).map(ticket => ({
      ...ticket, timeLogs: (ticket.timeLogs || []).map(revert)
    }));
    onUpdateProject({ ...project, timeLogs: updatedTimeLogs, tickets: updatedTickets });
    setSelectedPaidIds(prev => prev.filter(id => id !== logId));
  };

  // Helper: get all unique pending logs for a project, filtered by month/year
  const getAllPendingLogs = (project: Project): (TimeLog & { ticketTitle?: string })[] => {
    const projectLogIds = new Set((project.timeLogs || []).map(l => l.id));
    const ticketPendingLogs = (project.tickets || []).flatMap(ticket =>
      (ticket.timeLogs || [])
        .filter(l => l.status === 'pending' && !projectLogIds.has(l.id) && matchesFilter(l))
        .map(l => ({ ...l, ticketTitle: ticket.title }))
    );
    const projectPendingLogs = (project.timeLogs || []).filter(l => l.status === 'pending' && matchesFilter(l));
    return [...projectPendingLogs, ...ticketPendingLogs];
  };

  // Helper: get all approved + paid logs for history view, filtered by month/year
  const getAllHistoryLogs = (project: Project): (TimeLog & { ticketTitle?: string })[] => {
    const projectLogIds = new Set((project.timeLogs || []).map(l => l.id));
    const ticketHistoryLogs = (project.tickets || []).flatMap(ticket =>
      (ticket.timeLogs || [])
        .filter(l => (l.status === 'approved' || l.status === 'paid') && !projectLogIds.has(l.id) && matchesFilter(l))
        .map(l => ({ ...l, ticketTitle: ticket.title }))
    );
    const projectHistoryLogs = (project.timeLogs || []).filter(l => (l.status === 'approved' || l.status === 'paid') && matchesFilter(l));
    return [...projectHistoryLogs, ...ticketHistoryLogs];
  };

  // Helper: mark selected logs as paid
  const markAsPaid = (project: Project, logsToPay: TimeLog[]) => {
    const payIds = new Set(logsToPay.map(l => l.id));
    const applyPaid = (log: TimeLog) => payIds.has(log.id) ? { ...log, status: 'paid' as const } : log;
    const updatedTimeLogs = (project.timeLogs || []).map(applyPaid);
    const updatedTickets = (project.tickets || []).map(ticket => ({
      ...ticket,
      timeLogs: (ticket.timeLogs || []).map(applyPaid)
    }));
    onUpdateProject({ ...project, timeLogs: updatedTimeLogs, tickets: updatedTickets });
    setSelectedPaidIds(prev => prev.filter(id => !payIds.has(id)));
  };

  // Group pending logs by Project -> Consultant
  const pendingGroups = projects.map(project => {
    const pendingLogs = getAllPendingLogs(project);
    if (pendingLogs.length === 0) return null;

    const byConsultant: Record<string, (TimeLog & { ticketTitle?: string })[]> = {};
    pendingLogs.forEach(log => {
      if (!byConsultant[log.consultantName]) byConsultant[log.consultantName] = [];
      byConsultant[log.consultantName].push(log);
    });

    return {
      project,
      consultants: Object.entries(byConsultant).map(([name, logs]) => ({
        name,
        logs,
        totalHours: logs.reduce((sum, l) => sum + l.hours, 0)
      }))
    };
  }).filter(Boolean);

  // Group approved/paid logs by Project -> Consultant for history view
  const historyGroups = projects.map(project => {
    const historyLogs = getAllHistoryLogs(project);
    if (historyLogs.length === 0) return null;

    const byConsultant: Record<string, (TimeLog & { ticketTitle?: string })[]> = {};
    historyLogs.forEach(log => {
      if (!byConsultant[log.consultantName]) byConsultant[log.consultantName] = [];
      byConsultant[log.consultantName].push(log);
    });

    return {
      project,
      consultants: Object.entries(byConsultant).map(([name, logs]) => ({
        name,
        logs,
        approvedLogs: logs.filter(l => l.status === 'approved'),
        paidLogs: logs.filter(l => l.status === 'paid'),
        totalHours: logs.reduce((sum, l) => sum + l.hours, 0),
        totalCost: logs.reduce((sum, l) => sum + (l.approvedCost || 0), 0)
      }))
    };
  }).filter(Boolean);

  const totalApprovedHours = historyGroups.reduce((s, g) =>
    s + g!.consultants.reduce((cs, c) => cs + c.approvedLogs.reduce((ls, l) => ls + l.hours, 0), 0), 0);
  const totalApprovedCost = historyGroups.reduce((s, g) =>
    s + g!.consultants.reduce((cs, c) => cs + c.approvedLogs.reduce((ls, l) => ls + (l.approvedCost || 0), 0), 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CheckCircle className="text-blue-600" /> Time Approval Center
          </h1>
          <p className="text-gray-500 text-sm">Review, rate, and approve consultant hours for payment.</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${activeTab === 'pending' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <Clock size={15} />
          Pending Approval
          {pendingGroups.length > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{pendingGroups.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${activeTab === 'history' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <History size={15} />
          Approval History
          {historyGroups.length > 0 && (
            <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">{historyGroups.length}</span>
          )}
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
        <Filter size={15} className="text-gray-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter:</span>
        <select
          value={filterMonth}
          onChange={e => { setFilterMonth(Number(e.target.value)); setSelectedLogIds([]); setSelectedPaidIds([]); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value={0}>All months</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={filterYear}
          onChange={e => { setFilterYear(Number(e.target.value)); setSelectedLogIds([]); setSelectedPaidIds([]); }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {availableYears.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400 ml-1">
          {filterMonth === 0 ? `All of ${filterYear}` : `${MONTHS[filterMonth - 1]} ${filterYear}`}
        </span>
      </div>

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Summary KPIs */}
          {historyGroups.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Pending to Pay (hours)</p>
                <p className="text-3xl font-black text-indigo-700">{totalApprovedHours.toFixed(1)}h</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Pending to Pay (cost)</p>
                <p className="text-3xl font-black text-indigo-700">${totalApprovedCost.toLocaleString()}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {historyGroups.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <History size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No approved hours yet.</p>
                <p className="text-sm">Approved logs will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {historyGroups.map((group) => group && (
                  <div key={group.project.id} className="bg-white">
                    <div
                      className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition"
                      onClick={() => setExpandedHistoryProjects(prev => ({ ...prev, [group.project.id]: !prev[group.project.id] }))}
                    >
                      <div className="flex items-center gap-3">
                        {expandedHistoryProjects[group.project.id] ? <ChevronDown size={20} className="text-gray-400" /> : <ChevronRight size={20} className="text-gray-400" />}
                        <div>
                          <h3 className="font-bold text-gray-900">{group.project.name}</h3>
                          <p className="text-xs text-gray-500">{group.project.clientName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {group.consultants.some(c => c.approvedLogs.length > 0) && (
                          <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                            {group.consultants.reduce((s, c) => s + c.approvedLogs.length, 0)} approved (unpaid)
                          </span>
                        )}
                        {group.consultants.some(c => c.paidLogs.length > 0) && (
                          <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                            {group.consultants.reduce((s, c) => s + c.paidLogs.length, 0)} paid
                          </span>
                        )}
                      </div>
                    </div>

                    {expandedHistoryProjects[group.project.id] && (
                      <div className="bg-gray-50 p-4 space-y-4 border-t border-gray-100">
                        {group.consultants.map(c => {
                          const approvedForConsultant = c.approvedLogs.map(l => l.id);
                          const allApprovedSelected = approvedForConsultant.length > 0 && approvedForConsultant.every(id => selectedPaidIds.includes(id));
                          const selectedForThisConsultant = c.approvedLogs.filter(l => selectedPaidIds.includes(l.id));

                          return (
                            <div key={c.name} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                              <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
                                <div>
                                  <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                    {c.name}
                                    <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                      {c.totalHours.toFixed(1)}h total · ${c.totalCost.toLocaleString()}
                                    </span>
                                  </h4>
                                </div>
                                {c.approvedLogs.length > 0 && (
                                  <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 p-2 rounded-lg">
                                    <div className="text-sm text-amber-800">
                                      Selected: <span className="font-bold">
                                        {selectedForThisConsultant.reduce((s, l) => s + l.hours, 0).toFixed(1)}h
                                        · ${selectedForThisConsultant.reduce((s, l) => s + (l.approvedCost || 0), 0).toLocaleString()}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => markAsPaid(group.project, selectedForThisConsultant)}
                                      disabled={selectedForThisConsultant.length === 0}
                                      className="flex items-center gap-1 bg-green-600 text-white px-3 py-1 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                    >
                                      <DollarSign size={14} /> Mark as Paid
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                  <thead className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                                    <tr>
                                      <th className="px-3 py-2 w-10 text-center">
                                        {c.approvedLogs.length > 0 && (
                                          <button
                                            onClick={() => {
                                              if (allApprovedSelected) {
                                                setSelectedPaidIds(prev => prev.filter(id => !approvedForConsultant.includes(id)));
                                              } else {
                                                const toAdd = approvedForConsultant.filter(id => !selectedPaidIds.includes(id));
                                                setSelectedPaidIds(prev => [...prev, ...toAdd]);
                                              }
                                            }}
                                            className="text-gray-400 hover:text-green-600"
                                          >
                                            {allApprovedSelected ? <CheckSquare size={16} className="text-green-600" /> : <Square size={16} />}
                                          </button>
                                        )}
                                      </th>
                                      <th className="px-3 py-2">Date</th>
                                      <th className="px-3 py-2">Task</th>
                                      <th className="px-3 py-2">Description</th>
                                      <th className="px-3 py-2 text-right">Hours</th>
                                      <th className="px-3 py-2 text-right">Rate</th>
                                      <th className="px-3 py-2 text-right">Cost</th>
                                      <th className="px-3 py-2 text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {c.logs.map(log => {
                                      const taskTitle = (log as any).ticketTitle
                                        ? undefined
                                        : (group.project.tasks || []).find(t => t.id === log.taskId)?.title;
                                      const isApproved = log.status === 'approved';
                                      const isSelected = selectedPaidIds.includes(log.id);

                                      return (
                                        <tr key={log.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 ${isSelected ? 'bg-green-50/30' : ''}`}>
                                          <td className="px-3 py-2 text-center">
                                            {isApproved ? (
                                              <input
                                                type="checkbox"
                                                className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                                checked={isSelected}
                                                onChange={() => setSelectedPaidIds(prev =>
                                                  prev.includes(log.id) ? prev.filter(id => id !== log.id) : [...prev, log.id]
                                                )}
                                              />
                                            ) : null}
                                          </td>
                                          <td className="px-3 py-2 text-gray-600">{new Date(log.date).toLocaleDateString()}</td>
                                          <td className="px-3 py-2 font-medium">
                                            {(log as any).ticketTitle
                                              ? <span className="text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded text-xs">🎫 {(log as any).ticketTitle}</span>
                                              : <span className="text-gray-800">{taskTitle || '—'}</span>
                                            }
                                          </td>
                                          <td className="px-3 py-2 text-gray-600 truncate max-w-xs">{log.description}</td>
                                          <td className="px-3 py-2 text-right font-mono">{log.hours}</td>
                                          <td className="px-3 py-2 text-right font-mono text-gray-500">${log.approvedRate ?? '—'}</td>
                                          <td className="px-3 py-2 text-right font-mono font-semibold text-indigo-700">${(log.approvedCost || 0).toLocaleString()}</td>
                                          <td className="px-3 py-2 text-center">
                                            {log.status === 'paid'
                                              ? <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">Paid</span>
                                              : <div className="flex items-center justify-center gap-1">
                                                  <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">Approved</span>
                                                  <button
                                                    onClick={() => revertToPending(group.project, log.id)}
                                                    className="text-[10px] text-orange-600 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded whitespace-nowrap"
                                                    title="Revertir a pendiente"
                                                  >
                                                    → Pendiente
                                                  </button>
                                                </div>
                                            }
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PENDING TAB ── */}
      {activeTab === 'pending' && <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {pendingGroups.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Clock size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No pending hours to review.</p>
            <p className="text-sm">All logged time has been approved.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingGroups.map((group) => group && (
              <div key={group.project.id} className="bg-white">
                {/* Project Header */}
                <div 
                  className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => toggleProject(group.project.id)}
                >
                  <div className="flex items-center gap-3">
                    {expandedProjects[group.project.id] ? <ChevronDown size={20} className="text-gray-400" /> : <ChevronRight size={20} className="text-gray-400" />}
                    <div>
                      <h3 className="font-bold text-gray-900">{group.project.name}</h3>
                      <p className="text-xs text-gray-500">{group.project.clientName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                     <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {group.consultants.length} Consultants Pending
                     </span>
                  </div>
                </div>

                {/* Consultant List (Expanded) */}
                {expandedProjects[group.project.id] && (
                  <div className="bg-gray-50 p-4 space-y-4 border-t border-gray-100">
                    {group.consultants.map(c => {
                      const user = users.find(u => u.name === c.name);
                      // Determine current rate
                      const projectRate = group.project.consultantRates?.[c.name];
                      const defaultRate = user?.hourlyCost || 0;
                      const displayRate = rateEdits[`${group.project.id}_${c.name}`] ?? projectRate ?? defaultRate;
                      
                      const isEdited = rateEdits[`${group.project.id}_${c.name}`] !== undefined;

                      // Calculate totals based on selection
                      const selectedLogsForConsultant = c.logs.filter(l => selectedLogIds.includes(l.id));
                      const selectedHours = selectedLogsForConsultant.reduce((sum, l) => sum + l.hours, 0);
                      const selectedCost = selectedHours * displayRate;
                      
                      const allLogsSelected = c.logs.every(l => selectedLogIds.includes(l.id));

                      return (
                        <div key={c.name} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
                            <div>
                              <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                {c.name}
                                <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                  {c.totalHours} hrs total pending
                                </span>
                              </h4>
                            </div>

                            {/* Rate Setting & Approval Actions */}
                            <div className="flex items-center gap-4 bg-blue-50 p-2 rounded-lg border border-blue-100">
                               <div className="flex items-center gap-2">
                                  <label className="text-xs font-semibold text-blue-800">Hourly Rate:</label>
                                  <div className="relative">
                                     <span className="absolute left-2 top-1.5 text-xs text-gray-500">$</span>
                                     <input 
                                       type="number" 
                                       className="w-20 pl-5 pr-2 py-1 text-sm border border-blue-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
                                       value={displayRate}
                                       onChange={(e) => handleRateChange(group.project.id, c.name, Number(e.target.value))}
                                     />
                                  </div>
                                  {isEdited && (
                                    <button 
                                      onClick={() => saveRate(group.project, c.name)}
                                      className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                                      title="Save Rate for Project"
                                    >
                                      <Save size={16} />
                                    </button>
                                  )}
                               </div>
                               <div className="h-6 w-px bg-blue-200"></div>
                               <div className="text-sm text-blue-900">
                                  Approve Cost: <span className="font-bold">${selectedCost.toLocaleString()}</span>
                               </div>
                               <button
                                  onClick={() => approveLogs(group.project, selectedLogsForConsultant, displayRate)}
                                  disabled={selectedLogsForConsultant.length === 0}
                                  className="ml-2 bg-blue-600 text-white px-3 py-1 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1"
                                >
                                  <CheckCircle size={14} />
                                  {selectedLogsForConsultant.length > 0 ? `Approve Selected` : 'Select logs'}
                               </button>
                               <button
                                  onClick={() => rejectLogs(group.project, selectedLogsForConsultant)}
                                  disabled={selectedLogsForConsultant.length === 0}
                                  className="bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded text-sm font-medium hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1"
                                >
                                  <XCircle size={14} />
                                  Reject Selected
                               </button>
                            </div>
                          </div>

                          {/* Logs Details Table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                              <thead className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                                <tr>
                                  <th className="px-3 py-2 w-10 text-center">
                                      <button 
                                        onClick={() => toggleSelectAllConsultant(c.logs.map(l => l.id))}
                                        className="text-gray-400 hover:text-blue-600"
                                      >
                                          {allLogsSelected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                                      </button>
                                  </th>
                                  <th className="px-3 py-2">Date</th>
                                  <th className="px-3 py-2">Task</th>
                                  <th className="px-3 py-2">Description</th>
                                  <th className="px-3 py-2 text-right">Hours</th>
                                  <th className="px-3 py-2 w-10"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.logs.map(log => {
                                  const taskTitle = (log as any).ticketTitle
                                    ? undefined
                                    : (group.project.tasks || []).find(t => t.id === log.taskId)?.title;
                                  const isSelected = selectedLogIds.includes(log.id);

                                  return (
                                    <tr key={log.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 ${isSelected ? 'bg-blue-50/30' : ''}`}>
                                      <td className="px-3 py-2 text-center">
                                          <input
                                            type="checkbox"
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                            checked={isSelected}
                                            onChange={() => toggleLogSelection(log.id)}
                                          />
                                      </td>
                                      <td className="px-3 py-2 text-gray-600">{new Date(log.date).toLocaleDateString()}</td>
                                      <td className="px-3 py-2 font-medium">
                                        {(log as any).ticketTitle
                                          ? <span className="text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded text-xs">🎫 {(log as any).ticketTitle}</span>
                                          : <span className="text-gray-800">{taskTitle || '—'}</span>
                                        }
                                      </td>
                                      <td className="px-3 py-2 text-gray-600 truncate max-w-md">{log.description}</td>
                                      <td className="px-3 py-2 text-right font-mono">{log.hours}</td>
                                      <td className="px-3 py-2 text-center">
                                        <button
                                          onClick={() => rejectLogs(group.project, [log])}
                                          className="text-gray-300 hover:text-red-500 transition"
                                          title="Reject this entry"
                                        >
                                          <XCircle size={15} />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>}

    </div>
  );
};
