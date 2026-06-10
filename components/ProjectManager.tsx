
import React, { useState } from 'react';
import { Project, Task, TimeLog, ProjectType, SubTask, User, SupportTicket, TicketPriority, TicketStatus } from '../types';
import { ManufacturerTickets } from './ManufacturerTickets';
import { Clock, CheckCircle, BarChart2, Plus, AlertCircle, FileText, History, User as UserIcon, Circle, PlayCircle, Edit2, Save, X, TrendingDown, Users, Calendar, Settings, LifeBuoy, Briefcase, List, CheckSquare, UserPlus, Trash2, AlertTriangle, Archive, RefreshCw, Key, Ticket, ShieldAlert, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { generateProjectRiskReport } from '../services/aiService';

interface ProjectManagerProps {
  projects: Project[];
  updateProject: (project: Project) => void;
  users: User[];
  onDeleteProject: (id: string) => void;
  onCloseProject: (project: Project) => void;
  onAddProject: (project: Project) => void;
  isAdmin?: boolean;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ projects, updateProject, users, onDeleteProject, onCloseProject, onAddProject, isAdmin }) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projects[0]?.id || null);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [showSubtaskModal, setShowSubtaskModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectForm, setNewProjectForm] = useState({ name: '', clientName: '', type: 'implementation' as ProjectType, totalBudgetHours: 40, startDate: new Date().toISOString().split('T')[0] });
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  
  const [selectedTaskForSubtasks, setSelectedTaskForSubtasks] = useState<Task | null>(null);
  const [selectedTaskForEdit, setSelectedTaskForEdit] = useState<Task | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  
  const [aiReport, setAiReport] = useState<string>('');
  const [loadingReport, setLoadingReport] = useState(false);

  // Budget Editing State
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState<number>(0);

  // Time logging state
  const [logDetails, setLogDetails] = useState({ taskId: '', hours: 0, description: '', consultantName: '' });

  // New/Edit Task State
  const [taskForm, setTaskForm] = useState({ title: '', assignee: '', estimatedHours: 0, dueDate: '', startDate: '', endDate: '' });

  // Support Ticket State
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [editingTicketHours, setEditingTicketHours] = useState<string | null>(null);
  const [ticketHoursInput, setTicketHoursInput] = useState<string>('');
  const [ticketForm, setTicketForm] = useState({
    receivedDate: new Date().toISOString().split('T')[0],
    title: '',
    description: '',
    area: '',
    reportedBy: '',
    outOfScopeReason: '',
    priority: 'medium' as TicketPriority,
    estimatedHours: 0
  });
  const [ticketLogForm, setTicketLogForm] = useState({ ticketId: '', hours: 0, description: '', date: new Date().toISOString().split('T')[0], consultantName: '' });
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLogOriginalTicketId, setEditingLogOriginalTicketId] = useState<string | null>(null);
  const [editingLogFields, setEditingLogFields] = useState<{ consultantName: string; date: string; status: 'pending' | 'approved' | 'paid' | 'rejected'; hours: number; sourceTicketId: string }>({ consultantName: '', date: '', status: 'pending', hours: 0, sourceTicketId: 'project' });
  const [showTicketLogModal, setShowTicketLogModal] = useState(false);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const isLicenseProject = selectedProject?.type === 'license';
  const isSupportProject = selectedProject?.type === 'support';
  const isHoursPackProject = selectedProject?.type === 'hours_pack';
  const isTicketProject = isSupportProject || isHoursPackProject;

  // Split projects by status
  const activeProjects = projects.filter(p => p.status !== 'completed');
  const completedProjects = projects.filter(p => p.status === 'completed');

  // Returns all unique time logs: project-level + ticket-level (deduplicated by id)
  const getAllTimeLogs = (project: Project): (TimeLog & { ticketTitle?: string; ticketId?: string })[] => {
    const projectLogIds = new Set((project.timeLogs || []).map(l => l.id));
    const ticketLogs = (project.tickets || []).flatMap(ticket =>
      ticket.timeLogs
        .filter(l => !projectLogIds.has(l.id))
        .map(l => ({ ...l, ticketTitle: ticket.title, ticketId: ticket.id }))
    );
    return [...project.timeLogs, ...ticketLogs];
  };

  const calculateTotalHours = (project: Project) => {
    return getAllTimeLogs(project).reduce((acc, log) => acc + log.hours, 0);
  };

  const calculateBudgetBurn = (project: Project) => {
    const used = calculateTotalHours(project);
    return Math.min((used / project.totalBudgetHours) * 100, 100);
  };

  // Group hours by consultant
  const getConsultantHours = (project: Project) => {
    const breakdown: Record<string, number> = {};
    getAllTimeLogs(project).forEach(log => {
        breakdown[log.consultantName] = (breakdown[log.consultantName] || 0) + log.hours;
    });
    return Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  };

  const handleGenerateReport = async () => {
    if (!selectedProject) return;
    setLoadingReport(true);
    const report = await generateProjectRiskReport(selectedProject);
    setAiReport(report);
    setLoadingReport(false);
  };

  const handleDeleteProjectConfirm = () => {
      if (!selectedProject) return;
      onDeleteProject(selectedProject.id);
      setShowDeleteConfirm(false);
      setSelectedProjectId(null);
  };

  const handleDeleteTask = (taskId: string) => {
      if (!selectedProject) return;
      updateProject({ ...selectedProject, tasks: (selectedProject.tasks || []).filter(t => t.id !== taskId) });
  };

  const handleDeleteTimeLog = (logId: string) => {
      if (!selectedProject) return;
      // Check if it's a project-level log or a ticket log
      const isProjectLog = (selectedProject.timeLogs || []).some(l => l.id === logId);
      if (isProjectLog) {
          const updatedTasks = (selectedProject.tasks || []).map(t => ({
              ...t,
              loggedHours: t.loggedHours - ((selectedProject.timeLogs || []).find(l => l.id === logId && l.taskId === t.id)?.hours ?? 0)
          }));
          updateProject({ ...selectedProject, tasks: updatedTasks, timeLogs: (selectedProject.timeLogs || []).filter(l => l.id !== logId) });
      } else {
          const updatedTickets = (selectedProject.tickets || []).map(ticket => ({
              ...ticket,
              timeLogs: (ticket.timeLogs || []).filter(l => l.id !== logId)
          }));
          updateProject({ ...selectedProject, tickets: updatedTickets });
      }
  };

  const handleCloseProjectConfirm = () => {
      if (!selectedProject) return;
      onCloseProject(selectedProject); // Call new parent handler
      setShowCloseConfirm(false);
  };

  const handleReopenProject = () => {
      if (!selectedProject) return;
      if (window.confirm(`Reopen project "${selectedProject.name}"? It will move back to the active list.`)) {
          updateProject({
              ...selectedProject,
              status: 'active'
          });
      }
  };

  const handleAddTimeLog = () => {
    const selectedProject = projects.find(p => p.id === selectedProjectId);
    if (!selectedProject || !logDetails.taskId) return;
    
    const logConsultant = users.find(u => u.name === logDetails.consultantName) || users[0];
    const newLog: TimeLog = {
      id: Date.now().toString(),
      taskId: logDetails.taskId,
      consultantName: logConsultant?.name || 'Admin',
      consultantId: logConsultant?.id,
      hours: Number(logDetails.hours),
      date: new Date().toISOString(),
      description: logDetails.description,
      status: 'pending'
    };

    // Update Project Task Logged Hours
    const updatedTasks = (selectedProject.tasks || []).map(t => 
       t.id === logDetails.taskId ? { ...t, loggedHours: t.loggedHours + newLog.hours } : t
    );

    const updatedProject = {
      ...selectedProject,
      tasks: updatedTasks,
      timeLogs: [...selectedProject.timeLogs, newLog]
    };

    updateProject(updatedProject);
    setShowTimeModal(false);
    setLogDetails({ taskId: '', hours: 0, description: '', consultantName: '' });
  };

  const openAddTaskModal = () => {
      setTaskForm({ title: '', assignee: '', estimatedHours: 0, dueDate: '', startDate: '', endDate: '' });
      setShowTaskModal(true);
  };

  const openEditTaskModal = (task: Task) => {
      setSelectedTaskForEdit(task);
      setTaskForm({ 
          title: task.title, 
          assignee: task.assignee, 
          estimatedHours: task.estimatedHours, 
          dueDate: task.dueDate || '',
          startDate: task.startDate || '',
          endDate: task.endDate || ''
      });
      setShowEditTaskModal(true);
  };

  const handleSaveTask = () => {
    if (!selectedProject || !taskForm.title) return;

    let updatedTasks = [...selectedProject.tasks];

    if (showEditTaskModal && selectedTaskForEdit) {
        // Update Existing
        updatedTasks = updatedTasks.map(t => t.id === selectedTaskForEdit.id ? {
            ...t,
            title: taskForm.title,
            assignee: taskForm.assignee || 'Unassigned',
            estimatedHours: Number(taskForm.estimatedHours),
            dueDate: taskForm.dueDate,
            startDate: taskForm.startDate,
            endDate: taskForm.endDate
        } : t);
    } else {
        // Create New
        const newTask: Task = {
            id: `task_${Date.now()}`,
            title: taskForm.title,
            assignee: taskForm.assignee || 'Unassigned',
            status: 'todo',
            estimatedHours: Number(taskForm.estimatedHours),
            loggedHours: 0,
            dueDate: taskForm.dueDate,
            startDate: taskForm.startDate,
            endDate: taskForm.endDate,
            subtasks: []
        };
        updatedTasks.push(newTask);
    }

    updateProject({
      ...selectedProject,
      tasks: updatedTasks
    });

    setShowTaskModal(false);
    setShowEditTaskModal(false);
  };

  const handleCycleStatus = (task: Task) => {
    if (!selectedProject) return;
    const nextStatus: Record<string, 'todo' | 'in-progress' | 'done'> = {
        'todo': 'in-progress', 'in-progress': 'done', 'done': 'todo'
    };
    const updatedTasks = (selectedProject.tasks || []).map(t => t.id === task.id ? { ...t, status: nextStatus[t.status] } : t);
    updateProject({ ...selectedProject, tasks: updatedTasks });
  };

  const openSubtaskModal = (task: Task) => { setSelectedTaskForSubtasks(task); setShowSubtaskModal(true); };
  
  const handleAddSubtask = () => {
    if (!selectedProject || !selectedTaskForSubtasks || !newSubtaskTitle.trim()) return;
    const newSubtask: SubTask = { id: `st_${Date.now()}`, title: newSubtaskTitle, completed: false };
    const updatedTasks = (selectedProject.tasks || []).map(t => t.id === selectedTaskForSubtasks.id ? { ...t, subtasks: [...(t.subtasks || []), newSubtask] } : t);
    const updatedProject = { ...selectedProject, tasks: updatedTasks };
    updateProject(updatedProject);
    const updatedTask = updatedTasks.find(t => t.id === selectedTaskForSubtasks.id);
    if (updatedTask) setSelectedTaskForSubtasks(updatedTask);
    setNewSubtaskTitle('');
  };

  const toggleSubtask = (subtaskId: string) => {
     if (!selectedProject || !selectedTaskForSubtasks) return;
     const updatedTasks = (selectedProject.tasks || []).map(t => {
         if (t.id === selectedTaskForSubtasks.id) {
             const updatedSubtasks = t.subtasks.map(st => st.id === subtaskId ? { ...st, completed: !st.completed } : st);
             const allSubtasksCompleted = updatedSubtasks.length > 0 && updatedSubtasks.every(st => st.completed);
             const anySubtaskCompleted = updatedSubtasks.some(st => st.completed);
             let newStatus = t.status;
             if (allSubtasksCompleted) newStatus = 'done';
             else if (t.status === 'done' && !allSubtasksCompleted) newStatus = 'in-progress';
             else if (t.status === 'todo' && anySubtaskCompleted) newStatus = 'in-progress';
             return { ...t, subtasks: updatedSubtasks, status: newStatus };
         }
         return t;
     });
     const updatedProject = { ...selectedProject, tasks: updatedTasks };
     updateProject(updatedProject);
    const updatedTask = updatedTasks.find(t => t.id === selectedTaskForSubtasks.id);
    if (updatedTask) setSelectedTaskForSubtasks(updatedTask);
  };

  const handleToggleSubtaskAssignee = (taskId: string, subtaskId: string, consultantName: string) => {
    if (!selectedProject) return;
    const updatedTasks = (selectedProject.tasks || []).map(t =>
      t.id === taskId ? {
        ...t,
        subtasks: t.subtasks.map(st =>
          st.id === subtaskId ? {
            ...st,
            assignees: (st.assignees || []).includes(consultantName)
              ? (st.assignees || []).filter(n => n !== consultantName)
              : [...(st.assignees || []), consultantName]
          } : st
        )
      } : t
    );
    updateProject({ ...selectedProject, tasks: updatedTasks });
    const updatedTask = updatedTasks.find(t => t.id === taskId);
    if (updatedTask) setSelectedTaskForSubtasks(updatedTask);
  };

  const handleSaveSubtaskComment = (taskId: string, subtaskId: string) => {
    if (!selectedProject) return;
    const updatedTasks = (selectedProject.tasks || []).map(t =>
      t.id === taskId ? {
        ...t,
        subtasks: t.subtasks.map(st =>
          st.id === subtaskId ? { ...st, comment: commentDraft.trim() || undefined } : st
        )
      } : t
    );
    updateProject({ ...selectedProject, tasks: updatedTasks });
    const updatedTask = updatedTasks.find(t => t.id === taskId);
    if (updatedTask) setSelectedTaskForSubtasks(updatedTask);
    setEditingCommentId(null);
  };

  const startEditingBudget = () => { if (selectedProject) { setTempBudget(selectedProject.totalBudgetHours); setIsEditingBudget(true); } };
  const saveBudget = () => { if (selectedProject && tempBudget > 0) { updateProject({ ...selectedProject, totalBudgetHours: tempBudget }); setIsEditingBudget(false); } };
  
  const handleAddMember = () => {
    if (!selectedProject || !selectedUserToAdd) return;
    if (!(selectedProject.team || []).includes(selectedUserToAdd)) {
        updateProject({ ...selectedProject, team: [...selectedProject.team, selectedUserToAdd] });
    }
    setShowAddMemberModal(false); setSelectedUserToAdd('');
  };

  // ===================== TICKET HANDLERS =====================

  const handleCreateTicket = () => {
      if (!selectedProject || !ticketForm.title.trim()) return;
      const ticket: SupportTicket = {
          id: `tkt_${Date.now()}`,
          receivedDate: ticketForm.receivedDate,
          title: ticketForm.title,
          description: ticketForm.description,
          area: ticketForm.area,
          reportedBy: ticketForm.reportedBy || users[0]?.name || 'Admin',
          outOfScopeReason: ticketForm.outOfScopeReason,
          status: 'open',
          priority: ticketForm.priority,
          estimatedHours: Number(ticketForm.estimatedHours) || 0,
          hoursLogged: 0,
          createdAt: new Date().toISOString(),
          timeLogs: []
      };
      updateProject({ ...selectedProject, tickets: [...(selectedProject.tickets || []), ticket] });
      setTicketForm({ receivedDate: new Date().toISOString().split('T')[0], title: '', description: '', area: '', reportedBy: '', outOfScopeReason: '', priority: 'medium', estimatedHours: 0 });
      setShowTicketModal(false);
  };

  const handleSaveLogEdit = (logId: string) => {
    // Read the freshest version of the project directly from the props array to avoid
    // stale-closure bugs when a prior updateDocument reconcile fires between edits.
    const freshProject = projects.find(p => p.id === selectedProjectId);
    if (!freshProject) return;

    const { consultantName, date, status, hours, sourceTicketId } = editingLogFields;
    const newHours = Number(hours);
    const newTicketId = sourceTicketId === 'project' ? null : sourceTicketId;

    // Find original log from its current location
    const originalLog = editingLogOriginalTicketId
      ? (freshProject.tickets || []).find(t => t.id === editingLogOriginalTicketId)?.timeLogs.find(l => l.id === logId)
      : (freshProject.timeLogs || []).find(l => l.id === logId);
    if (!originalLog) return;

    const consultantUser = users.find(u => u.name === consultantName);
    const updatedLog: TimeLog = { ...originalLog, consultantName, consultantId: consultantUser?.id, date, status, hours: newHours };

    let updatedTimeLogs = [...freshProject.timeLogs];
    let updatedTickets = [...(freshProject.tickets || [])];

    // Remove from original location
    if (editingLogOriginalTicketId === null) {
      updatedTimeLogs = updatedTimeLogs.filter(l => l.id !== logId);
    } else {
      updatedTickets = updatedTickets.map(t =>
        t.id === editingLogOriginalTicketId
          ? { ...t, timeLogs: (t.timeLogs || []).filter(l => l.id !== logId), hoursLogged: Math.max(0, t.hoursLogged - originalLog.hours) }
          : t
      );
    }

    // Add to new location
    if (newTicketId === null) {
      updatedTimeLogs = [...updatedTimeLogs, updatedLog];
    } else {
      updatedTickets = updatedTickets.map(t =>
        t.id === newTicketId
          ? { ...t, timeLogs: [...t.timeLogs, updatedLog], hoursLogged: t.hoursLogged + newHours }
          : t
      );
    }

    updateProject({ ...freshProject, timeLogs: updatedTimeLogs, tickets: updatedTickets });
    setEditingLogId(null);
  };

  const handleUpdateTicketHours = (ticketId: string) => {
      if (!selectedProject) return;
      const hours = parseFloat(ticketHoursInput);
      if (isNaN(hours) || hours < 0) return;
      const updatedTickets = (selectedProject.tickets || []).map(t =>
          t.id === ticketId ? { ...t, estimatedHours: hours } : t
      );
      updateProject({ ...selectedProject, tickets: updatedTickets });
      setEditingTicketHours(null);
  };

  const handleUpdateTicketStatus = (ticketId: string, newStatus: TicketStatus) => {
      if (!selectedProject) return;
      const updatedTickets = (selectedProject.tickets || []).map(t =>
          t.id === ticketId
              ? { ...t, status: newStatus, resolvedAt: newStatus === 'resolved' || newStatus === 'closed' ? new Date().toISOString() : t.resolvedAt }
              : t
      );
      updateProject({ ...selectedProject, tickets: updatedTickets });
  };

  const handleLogTicketHours = () => {
      const selectedProject = projects.find(p => p.id === selectedProjectId);
      if (!selectedProject || !ticketLogForm.ticketId || ticketLogForm.hours <= 0) return;
      const selectedConsultant = users.find(u => u.name === ticketLogForm.consultantName) || users[0];
      const newLog: TimeLog = {
          id: `tl_tkt_${Date.now()}`,
          consultantName: selectedConsultant?.name || 'Admin',
          consultantId: selectedConsultant?.id,
          hours: Number(ticketLogForm.hours),
          date: ticketLogForm.date,
          description: ticketLogForm.description,
          status: 'pending'
      };
      const updatedTickets = (selectedProject.tickets || []).map(t =>
          t.id === ticketLogForm.ticketId
              ? { ...t, hoursLogged: t.hoursLogged + newLog.hours, timeLogs: [...t.timeLogs, newLog], status: t.status === 'open' ? 'in-progress' as TicketStatus : t.status }
              : t
      );
      // Also add to project timeLogs for budget tracking
      const updatedTimeLogs = [...selectedProject.timeLogs, { ...newLog, taskId: `ticket_${ticketLogForm.ticketId}` }];
      updateProject({ ...selectedProject, tickets: updatedTickets, timeLogs: updatedTimeLogs });
      setShowTicketLogModal(false);
      setTicketLogForm({ ticketId: '', hours: 0, description: '', date: new Date().toISOString().split('T')[0], consultantName: '' });
  };

  const handleDeleteTicket = (ticketId: string) => {
      if (!selectedProject || !window.confirm('Delete this ticket?')) return;
      updateProject({ ...selectedProject, tickets: (selectedProject.tickets || []).filter(t => t.id !== ticketId) });
  };

  const ticketPriorityBadge = (p: TicketPriority) => {
      const cfg = {
          low: 'bg-gray-100 text-gray-600',
          medium: 'bg-blue-100 text-blue-700',
          high: 'bg-orange-100 text-orange-700',
          critical: 'bg-red-100 text-red-700 font-bold'
      };
      return <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${cfg[p]}`}>{p}</span>;
  };

  const ticketStatusBadge = (s: TicketStatus) => {
      const cfg = {
          open: 'bg-yellow-100 text-yellow-700',
          'in-progress': 'bg-blue-100 text-blue-700',
          resolved: 'bg-green-100 text-green-700',
          closed: 'bg-gray-100 text-gray-500'
      };
      return <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${cfg[s]}`}>{s.replace('-', ' ')}</span>;
  };

  // ============================================================

  const getProjectTypeBadge = (type: ProjectType) => {
      switch(type) {
          case 'implementation': return <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded"><Settings size={10} /> Implementation</span>;
          case 'support': return <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700 px-2 py-0.5 rounded"><LifeBuoy size={10} /> Support</span>;
          case 'hours_pack': return <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700 px-2 py-0.5 rounded"><Clock size={10} /> Hours Pack</span>;
          case 'license': return <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-purple-100 text-purple-700 px-2 py-0.5 rounded"><Key size={10} /> License</span>;
          default: return <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-700 px-2 py-0.5 rounded"><Briefcase size={10} /> Consulting</span>;
      }
  };

  if (!projects.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <FileText size={48} className="mb-4 text-gray-300" />
        <p className="text-lg font-medium">No projects found.</p>
        <p className="text-sm">Create a new project from CRM to get started.</p>
      </div>
    );
  }

  const totalLoggedHours = selectedProject ? calculateTotalHours(selectedProject) : 0;
  const remainingHours = selectedProject ? selectedProject.totalBudgetHours - totalLoggedHours : 0;
  const isOverBudget = remainingHours < 0;

  return (
    <div className="h-full flex gap-6">
      {/* Project Sidebar */}
      <div className="w-64 border-r border-gray-200 pr-4 overflow-y-auto flex flex-col gap-6">
        
        {/* Active Projects List */}
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div> Active Projects
                </h3>
                {isAdmin && (
                    <button
                        onClick={() => { setNewProjectForm({ name: '', clientName: '', type: 'implementation', totalBudgetHours: 40, startDate: new Date().toISOString().split('T')[0] }); setShowNewProjectModal(true); }}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                        title="New Project"
                    >
                        <Plus size={16} />
                    </button>
                )}
            </div>
            {activeProjects.length === 0 ? (
                <p className="text-xs text-gray-400 italic px-2">No active projects.</p>
            ) : (() => {
                const groups: { label: string; types: string[]; color: string; dot: string }[] = [
                    { label: 'Implementación', types: ['implementation', 'consulting'], color: 'text-indigo-700', dot: 'bg-indigo-400' },
                    { label: 'Horas', types: ['hours_pack'], color: 'text-blue-700', dot: 'bg-blue-400' },
                    { label: 'Licencia', types: ['license'], color: 'text-purple-700', dot: 'bg-purple-400' },
                    { label: 'Soporte', types: ['support'], color: 'text-orange-700', dot: 'bg-orange-400' },
                ];
                return (
                    <div className="space-y-3">
                        {groups.map(g => {
                            const gProjects = activeProjects.filter(p => g.types.includes(p.type || 'consulting'));
                            if (gProjects.length === 0) return null;
                            return (
                                <div key={g.label}>
                                    <div className={`flex items-center gap-1.5 px-1 mb-1.5`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${g.dot}`}></div>
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${g.color}`}>{g.label} ({gProjects.length})</span>
                                    </div>
                                    <div className="space-y-1">
                                        {gProjects.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => { setSelectedProjectId(p.id); setAiReport(''); setIsEditingBudget(false); }}
                                                className={`w-full text-left p-3 rounded-lg text-sm transition ${
                                                    selectedProjectId === p.id
                                                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                                                    : 'hover:bg-gray-50 text-gray-700 border border-transparent'
                                                }`}
                                            >
                                                <div className="font-semibold truncate mb-1">{p.name}</div>
                                                <span className="text-xs text-gray-500 truncate">{p.clientName}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                );
            })()}
        </div>

        {/* Completed Projects List */}
        <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-400"></div> Completed History
            </h3>
            <div className="space-y-2">
            {completedProjects.length > 0 ? completedProjects.map(p => (
                <button
                key={p.id}
                onClick={() => { setSelectedProjectId(p.id); setAiReport(''); setIsEditingBudget(false); }}
                className={`w-full text-left p-3 rounded-lg text-sm transition ${
                    selectedProjectId === p.id 
                    ? 'bg-gray-100 text-gray-800 border border-gray-300 shadow-sm' 
                    : 'hover:bg-gray-50 text-gray-500 border border-transparent'
                }`}
                >
                <div className="font-semibold truncate mb-1 line-through decoration-gray-400">{p.name}</div>
                <div className="flex justify-between items-center opacity-70">
                    <span className="text-xs truncate max-w-[80px]">{p.clientName}</span>
                    <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded text-gray-600">Closed</span>
                </div>
                </button>
            )) : (
                <p className="text-xs text-gray-400 italic px-2">No completed projects.</p>
            )}
            </div>
        </div>
      </div>

      {/* Project Details */}
      {selectedProject && (
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                 <h1 className="text-2xl font-bold text-gray-900">{selectedProject.name}</h1>
                 {selectedProject.status === 'completed' ? (
                     <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide bg-gray-100 text-gray-600 px-3 py-1 rounded-full border border-gray-300">
                         <Archive size={12} /> Completed
                     </span>
                 ) : (
                     <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide bg-green-100 text-green-700 px-3 py-1 rounded-full border border-green-200">
                         <PlayCircle size={12} /> Active
                     </span>
                 )}
              </div>
              <p className="text-gray-500 flex items-center gap-2">
                  Client: {selectedProject.clientName}
                  <span className="text-gray-300">|</span>
                  {getProjectTypeBadge(selectedProject.type || 'consulting')}
              </p>
            </div>
            
            <div className="flex gap-2">
              <button onClick={handleGenerateReport} className="flex items-center gap-2 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition text-sm font-medium">
                {loadingReport ? 'Thinking...' : 'AI Risk Analysis'}
              </button>
              
              {selectedProject.status !== 'completed' ? (
                  <button 
                    onClick={() => setShowCloseConfirm(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm transition text-sm font-medium"
                  >
                    <CheckCircle size={16} /> Close Project
                  </button>
              ) : (
                  <button 
                    onClick={handleReopenProject}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
                  >
                    <RefreshCw size={16} /> Reopen Project
                  </button>
              )}

              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-white text-gray-400 border border-gray-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
                title="Delete Project"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          {/* Team Section */}
          <div className="mb-6 flex items-center justify-end">
             <div className="flex items-center -space-x-2 mr-3">
                {(selectedProject.team || []).map((member, i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-xs font-bold text-indigo-700" title={member}>
                        {member.charAt(0)}
                    </div>
                ))}
             </div>
             {selectedProject.status !== 'completed' && (
                <button onClick={() => setShowAddMemberModal(true)} className="text-sm text-blue-600 font-medium hover:underline flex items-center gap-1">
                    <UserPlus size={14} /> Add Member
                </button>
             )}
          </div>

          {/* Support / Hours Pack Date Banner */}
          {isTicketProject && (selectedProject.contractStartDate || selectedProject.contractEndDate) && (() => {
              const today = new Date();
              const end = selectedProject.contractEndDate ? new Date(selectedProject.contractEndDate) : null;
              const daysLeft = end ? Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
              const isExpired = daysLeft !== null && daysLeft < 0;
              const isCritical = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
              return (
                  <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between gap-4 ${isExpired ? 'bg-red-50 border-red-200' : isCritical ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'}`}>
                      <div className="flex items-center gap-3">
                          <ShieldAlert size={20} className={isExpired ? 'text-red-600' : isCritical ? 'text-orange-500' : 'text-blue-600'} />
                          <div>
                              <p className={`text-sm font-bold ${isExpired ? 'text-red-800' : isCritical ? 'text-orange-800' : 'text-blue-800'}`}>
                                  {isHoursPackProject ? 'Hours Pack Period' : 'Support Contract Period'}
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                  {selectedProject.contractStartDate && <span>{new Date(selectedProject.contractStartDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                                  {selectedProject.contractStartDate && selectedProject.contractEndDate && <span className="mx-2">→</span>}
                                  {selectedProject.contractEndDate && <span>{new Date(selectedProject.contractEndDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                              </p>
                          </div>
                      </div>
                      {daysLeft !== null && (
                          <span className={`text-sm font-bold px-3 py-1 rounded-full ${isExpired ? 'bg-red-200 text-red-800' : isCritical ? 'bg-orange-200 text-orange-800' : 'bg-blue-200 text-blue-800'}`}>
                              {isExpired ? `Expired ${Math.abs(daysLeft)}d ago` : daysLeft === 0 ? 'Expires today!' : `${daysLeft} days left`}
                          </span>
                      )}
                  </div>
              );
          })()}

          {/* AI Report Section */}
          {aiReport && (
            <div className="mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-xl border border-purple-100 shadow-sm">
               <h4 className="text-sm font-bold text-purple-800 mb-2 flex items-center gap-2">
                 <AlertCircle size={16} /> Gemini Insights
               </h4>
               <p className="text-gray-800 text-sm leading-relaxed">{aiReport}</p>
            </div>
          )}

          {/* Stats Grid - Hidden for License Projects */}
          {!isLicenseProject && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Budget Burn Card */}
                <div className={`p-4 rounded-xl shadow-sm border transition-colors ${isOverBudget ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-gray-500">
                        <Clock size={18} />
                        <span className="text-sm font-medium">Budget Control</span>
                    </div>
                    {!isEditingBudget && selectedProject.status !== 'completed' ? (
                        <button onClick={startEditingBudget} className="text-gray-400 hover:text-blue-600" title="Edit Budget Limit">
                            <Edit2 size={14} />
                        </button>
                    ) : isEditingBudget ? (
                        <div className="flex items-center gap-1">
                            <button onClick={saveBudget} className="text-green-600 hover:text-green-700"><Save size={14}/></button>
                            <button onClick={() => setIsEditingBudget(false)} className="text-gray-400 hover:text-red-500"><X size={14}/></button>
                        </div>
                    ) : null}
                </div>
                
                <div className="flex flex-col gap-1 mb-2">
                    <div className="flex items-end justify-between">
                        <span className="text-2xl font-bold text-gray-900">{totalLoggedHours}</span>
                        <div className="flex items-center gap-1">
                            <span className="text-sm text-gray-400">/</span>
                            {isEditingBudget ? (
                                <input 
                                    type="number" 
                                    className="w-20 text-sm border border-blue-300 rounded px-1 py-0.5"
                                    value={tempBudget}
                                    onChange={(e) => setTempBudget(Number(e.target.value))}
                                    autoFocus
                                />
                            ) : (
                                <span className="text-sm font-semibold text-gray-600">{selectedProject.totalBudgetHours} hrs limit</span>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-1">
                        <span className="text-gray-500">Difference:</span>
                        <span className={`font-bold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                            {remainingHours > 0 ? `${remainingHours.toFixed(1)} hrs remaining` : `${Math.abs(remainingHours).toFixed(1)} hrs OVER`}
                        </span>
                    </div>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div 
                    className={`h-2 rounded-full transition-all ${isOverBudget ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(calculateBudgetBurn(selectedProject), 100)}%` }}
                    ></div>
                </div>
                </div>

                {/* Consultant Breakdown Card */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 text-gray-500 mb-3">
                    <Users size={18} />
                    <span className="text-sm font-medium">Consultant Utilization</span>
                </div>
                <div className="space-y-3 max-h-[100px] overflow-y-auto pr-1">
                    {getConsultantHours(selectedProject).map(([name, hours]) => (
                        <div key={name} className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-700 font-medium truncate w-24">{name}</span>
                            <span className="text-gray-500">{hours} hrs</span>
                        </div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                            <div 
                                className="bg-indigo-400 h-full rounded-full" 
                                style={{ width: `${Math.min((hours / totalLoggedHours) * 100, 100)}%` }}
                            />
                        </div>
                        </div>
                    ))}
                    {getAllTimeLogs(selectedProject).length === 0 && (
                        <p className="text-xs text-gray-400 italic">No hours logged yet.</p>
                    )}
                </div>
                </div>

                {/* Action Card */}
                <div className={`bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center items-center transition ${selectedProject.status === 'completed' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                    onClick={() => selectedProject.status !== 'completed' && setShowTimeModal(true)}
                >
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
                    <Plus size={24} />
                    </div>
                    <span className="font-semibold text-blue-600">Log Time</span>
                    <span className="text-xs text-gray-400 mt-1">Record hours for team</span>
                </div>
            </div>
          )}

          {/* License Specific Banner */}
          {isLicenseProject && (
              <div className="mb-8 bg-purple-50 border border-purple-100 p-4 rounded-xl flex items-center gap-3 text-purple-800 shadow-sm">
                  <div className="p-2 bg-white rounded-lg border border-purple-100 shadow-sm">
                      <Key size={24} className="text-purple-600" />
                  </div>
                  <div>
                      <h4 className="font-bold text-sm">License Delivery Project</h4>
                      <p className="text-xs text-purple-600">This project tracks software license provisioning and delivery tasks. <strong>No hourly consumption is tracked.</strong></p>
                  </div>
              </div>
          )}

          {/* ── IMPLEMENTATION PROGRESS DASHBOARD ── */}
          {selectedProject.type === 'implementation' && (() => {
            const tasks = selectedProject.tasks;
            const totalTasks = tasks.length;
            const doneTasks = tasks.filter(t => t.status === 'done').length;
            const inProgressTasks = tasks.filter(t => t.status === 'in-progress').length;
            const todoTasks = tasks.filter(t => t.status === 'todo').length;
            const overallPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

            const totalSubtasks = tasks.reduce((s, t) => s + (t.subtasks?.length || 0), 0);
            const doneSubtasks = tasks.reduce((s, t) => s + (t.subtasks?.filter(st => st.completed).length || 0), 0);

            const totalEstHours = tasks.reduce((s, t) => s + t.estimatedHours, 0);
            const totalLoggedHrs = tasks.reduce((s, t) => s + t.loggedHours, 0);
            const hoursOverBudget = totalLoggedHrs > totalEstHours;

            return (
              <div className="mb-8">
                {/* Section Header */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <BarChart2 size={18} className="text-indigo-600" /> Implementation Progress Dashboard
                  </h3>
                  <span className={`text-sm font-bold px-3 py-1 rounded-full border ${overallPct === 100 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                    {overallPct}% Complete
                  </span>
                </div>

                {/* Overall progress bar */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Overall Completion</span>
                    <span className="text-sm font-bold text-gray-900">{doneTasks}/{totalTasks} phases complete</span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${overallPct}%`,
                        background: overallPct === 100 ? '#16a34a' : 'linear-gradient(90deg,#4f46e5,#7c3aed)'
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-400">
                    <span>{todoTasks} pending · {inProgressTasks} in progress · {doneTasks} done</span>
                    <span>{totalSubtasks > 0 ? Math.round((doneSubtasks / totalSubtasks) * 100) : 0}% steps done ({doneSubtasks}/{totalSubtasks})</span>
                  </div>
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm text-center">
                    <p className="text-2xl font-black text-indigo-600">{overallPct}%</p>
                    <p className="text-[11px] text-gray-500 mt-1 font-semibold uppercase tracking-wide">Completed</p>
                  </div>
                  <div className="bg-white border border-green-200 rounded-xl p-4 shadow-sm text-center">
                    <p className="text-2xl font-black text-green-600">{doneTasks}<span className="text-base font-medium text-gray-400">/{totalTasks}</span></p>
                    <p className="text-[11px] text-gray-500 mt-1 font-semibold uppercase tracking-wide">Phases Done</p>
                  </div>
                  <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm text-center">
                    <p className="text-2xl font-black text-blue-600">{doneSubtasks}<span className="text-base font-medium text-gray-400">/{totalSubtasks}</span></p>
                    <p className="text-[11px] text-gray-500 mt-1 font-semibold uppercase tracking-wide">Steps Done</p>
                  </div>
                  <div className={`bg-white rounded-xl p-4 shadow-sm text-center border ${hoursOverBudget ? 'border-red-200' : 'border-gray-200'}`}>
                    <p className={`text-2xl font-black ${hoursOverBudget ? 'text-red-600' : 'text-gray-800'}`}>{totalLoggedHrs}h</p>
                    <p className="text-[11px] text-gray-500 mt-1 font-semibold uppercase tracking-wide">of {totalEstHours}h est.</p>
                  </div>
                </div>

                {/* Phase-by-phase cards */}
                <div className="space-y-2">
                  {tasks.map((task, idx) => {
                    const stCount = task.subtasks?.length || 0;
                    const stDone  = task.subtasks?.filter(s => s.completed).length || 0;
                    const stPct   = stCount > 0 ? Math.round((stDone / stCount) * 100) : 0;
                    const hrPct   = task.estimatedHours > 0 ? Math.min((task.loggedHours / task.estimatedHours) * 100, 100) : 0;
                    const over    = task.loggedHours > task.estimatedHours;

                    const cfg = task.status === 'done'
                      ? { bg: 'bg-green-50', border: 'border-green-200', circle: 'bg-green-500 text-white', icon: <CheckCircle size={13} className="text-green-600 shrink-0" /> }
                      : task.status === 'in-progress'
                      ? { bg: 'bg-blue-50', border: 'border-blue-200', circle: 'bg-blue-500 text-white', icon: <PlayCircle size={13} className="text-blue-600 shrink-0" /> }
                      : { bg: 'bg-gray-50', border: 'border-gray-200', circle: 'bg-gray-200 text-gray-500', icon: <Circle size={13} className="text-gray-400 shrink-0" /> };

                    return (
                      <div key={task.id} className={`${cfg.bg} border ${cfg.border} rounded-xl px-4 py-3 flex items-center gap-4`}>
                        {/* Phase number bubble */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${cfg.circle}`}>
                          {idx + 1}
                        </div>

                        {/* Title + status */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {cfg.icon}
                            <span className="font-semibold text-gray-800 text-sm truncate">{task.title}</span>
                          </div>
                          <span className="text-[11px] text-gray-500">Assignee: {task.assignee}</span>
                        </div>

                        {/* Subtask progress */}
                        <div className="w-28 shrink-0">
                          <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                            <span className="flex items-center gap-0.5"><CheckSquare size={9} /> Steps</span>
                            <span>{stDone}/{stCount}</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${stPct}%` }} />
                          </div>
                        </div>

                        {/* Hours progress */}
                        <div className="w-28 shrink-0">
                          <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                            <span className="flex items-center gap-0.5"><Clock size={9} /> Hours</span>
                            <span className={over ? 'text-red-500 font-semibold' : ''}>{task.loggedHours}/{task.estimatedHours}h</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${hrPct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Task Management */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <h3 className="font-semibold text-gray-800">Tasks & Progress</h3>
              <div className="flex items-center gap-3">
                 <span className="text-xs text-gray-500">{(selectedProject.tasks || []).length} tasks</span>
                 {selectedProject.status !== 'completed' && (
                    <button 
                        onClick={openAddTaskModal}
                        className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 flex items-center gap-1"
                    >
                        <Plus size={12} /> Add Task
                    </button>
                 )}
              </div>
            </div>
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3">Task Name</th>
                  <th className="px-4 py-3">Subtasks</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Timeline</th>
                  <th className="px-4 py-3">Status</th>
                  {!isLicenseProject && <th className="px-4 py-3 text-right">Hours (Est / Act)</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(selectedProject.tasks || []).map(task => {
                  const subtaskCount = task.subtasks?.length || 0;
                  const completedSubtasks = task.subtasks?.filter(s => s.completed).length || 0;

                  return (
                    <tr key={task.id} className="hover:bg-gray-50 group">
                      <td className="px-4 py-3 font-medium text-gray-800 group relative">
                          <div className="flex items-center gap-2">
                            <span className="cursor-pointer hover:text-blue-600 hover:underline" onClick={() => openEditTaskModal(task)}>
                                {task.title}
                            </span>
                            <button
                                onClick={() => openSubtaskModal(task)}
                                className="text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition"
                                title="Manage Subtasks"
                            >
                                <List size={14} />
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={() => handleDeleteTask(task.id)}
                                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                                    title="Delete Task"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                          </div>
                          {task.title.startsWith("F") && <span className="ml-0 mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500 border border-gray-200">Phase Item</span>}
                      </td>
                      <td className="px-4 py-3">
                         <div 
                           onClick={() => openSubtaskModal(task)}
                           className="flex flex-col gap-1 cursor-pointer hover:bg-gray-100 rounded px-2 py-1 transition w-fit min-w-[100px]"
                         >
                            <div className="flex items-center gap-1">
                                <CheckSquare size={12} className={completedSubtasks === subtaskCount && subtaskCount > 0 ? "text-green-500" : "text-gray-400"} />
                                <span className="text-xs text-gray-500 font-medium">
                                    {completedSubtasks}/{subtaskCount}
                                </span>
                            </div>
                            {subtaskCount > 0 && (
                                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-green-500 rounded-full transition-all duration-300" style={{ width: `${(completedSubtasks / subtaskCount) * 100}%` }} />
                                </div>
                            )}
                         </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                             {task.assignee.charAt(0)}
                          </div>
                          <span className="truncate max-w-[100px]">{task.assignee}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                         {(task.startDate || task.endDate) ? (
                            <div className="flex flex-col">
                                {task.startDate && <span>{new Date(task.startDate).toLocaleDateString()}</span>}
                                {task.endDate && <span className="text-gray-400 text-[10px]">to {new Date(task.endDate).toLocaleDateString()}</span>}
                            </div>
                         ) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <button 
                           onClick={() => handleCycleStatus(task)}
                           disabled={selectedProject.status === 'completed'}
                           className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors w-28 justify-center ${
                             task.status === 'done' ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' :
                             task.status === 'in-progress' ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200' :
                             'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                           } ${selectedProject.status === 'completed' ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                           {task.status === 'done' && <CheckCircle size={14} />}
                           {task.status === 'in-progress' && <PlayCircle size={14} />}
                           {task.status === 'todo' && <Circle size={14} />}
                           {task.status === 'done' ? 'Done' : task.status === 'in-progress' ? 'In Progress' : 'To Do'}
                        </button>
                      </td>
                      {!isLicenseProject && (
                        <td className="px-4 py-3 text-right group/hours">
                            <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center justify-end gap-2">
                                    <div>
                                        <span className="text-gray-900 font-medium">{task.loggedHours}</span>
                                        <span className="text-gray-400"> / {task.estimatedHours}</span>
                                    </div>
                                    {selectedProject.status !== 'completed' && (
                                        <button onClick={() => openEditTaskModal(task)} className="text-gray-300 hover:text-blue-600 opacity-0 group-hover/hours:opacity-100 transition" title="Edit Estimated Hours"><Edit2 size={12} /></button>
                                    )}
                                </div>
                                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-300 ${task.loggedHours > task.estimatedHours ? 'bg-red-500' : 'bg-blue-500'}`} 
                                        style={{ width: `${Math.min((task.loggedHours / task.estimatedHours) * 100, 100)}%` }} 
                                    />
                                </div>
                            </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Activity Log Section - Only for non-license projects */}
          {!isLicenseProject && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                    <History size={16} className="text-gray-500" />
                    <h3 className="font-semibold text-gray-800">Recent Activity & Hours</h3>
                </div>
                {(() => {
                    const allLogs = getAllTimeLogs(selectedProject);
                    return allLogs.length > 0 ? (
                        <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                            <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Consultant</th>
                            <th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3">Source</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Hours</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {[...allLogs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(log => {
                              const isEditing = editingLogId === log.id;
                              const f = editingLogFields;
                              return (
                              <tr key={log.id} className={`group/log ${isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                {/* DATE */}
                                <td className="px-4 py-3 text-gray-600">
                                  {isEditing
                                    ? <input type="date" className="border border-blue-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 w-32" value={f.date.split('T')[0]} onChange={e => setEditingLogFields(x => ({ ...x, date: e.target.value }))} />
                                    : new Date(log.date).toLocaleDateString()
                                  }
                                </td>
                                {/* CONSULTANT */}
                                <td className="px-4 py-3 text-gray-900 font-medium">
                                  {isEditing
                                    ? <select className="border border-blue-300 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" value={f.consultantName} onChange={e => setEditingLogFields(x => ({ ...x, consultantName: e.target.value }))} autoFocus>
                                        {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                                      </select>
                                    : <div className="flex items-center gap-2">
                                        <span>{log.consultantName}</span>
                                        <button onClick={() => { setEditingLogOriginalTicketId((log as any).ticketId ?? null); setEditingLogFields({ consultantName: log.consultantName, date: log.date.split('T')[0], status: log.status, hours: log.hours, sourceTicketId: (log as any).ticketId ?? 'project' }); setEditingLogId(log.id); }} className="opacity-0 group-hover/log:opacity-100 text-gray-300 hover:text-blue-500 transition" title="Edit row"><Edit2 size={12} /></button>
                                        {isAdmin && <button onClick={() => handleDeleteTimeLog(log.id)} className="opacity-0 group-hover/log:opacity-100 text-gray-300 hover:text-red-500 transition" title="Delete log"><Trash2 size={12} /></button>}
                                      </div>
                                  }
                                </td>
                                {/* DESCRIPTION */}
                                <td className="px-4 py-3 text-gray-600 truncate max-w-xs">{log.description}</td>
                                {/* SOURCE */}
                                <td className="px-4 py-3 text-gray-500 text-xs">
                                  {isEditing
                                    ? <select className="border border-blue-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white max-w-[140px]" value={f.sourceTicketId} onChange={e => setEditingLogFields(x => ({ ...x, sourceTicketId: e.target.value }))}>
                                        <option value="project">Project</option>
                                        {(selectedProject.tickets || []).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                                      </select>
                                    : (log as any).ticketTitle
                                        ? <span className="bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded text-[10px] truncate max-w-[120px] inline-block" title={(log as any).ticketTitle}>🎫 {(log as any).ticketTitle}</span>
                                        : <span className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded text-[10px]">Project</span>
                                  }
                                </td>
                                {/* STATUS */}
                                <td className="px-4 py-3">
                                  {isEditing
                                    ? <select className="border border-blue-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" value={f.status} onChange={e => setEditingLogFields(x => ({ ...x, status: e.target.value as 'pending'|'approved'|'paid' }))}>
                                        <option value="pending">Pending</option>
                                        <option value="approved">Approved</option>
                                        <option value="paid">Paid</option>
                                      </select>
                                    : <>
                                        {log.status === 'paid' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded border border-green-200">Paid</span>}
                                        {log.status === 'approved' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200">Approved</span>}
                                        {log.status === 'pending' && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded border border-yellow-200">Pending</span>}
                                        {log.status === 'rejected' && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded border border-red-200">Rejected</span>}
                                      </>
                                  }
                                </td>
                                {/* HOURS */}
                                <td className="px-4 py-3 text-right font-mono">
                                  {isEditing
                                    ? <div className="flex items-center justify-end gap-1">
                                        <input type="number" min="0" step="0.5" className="w-16 border border-blue-300 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400" value={f.hours} onChange={e => setEditingLogFields(x => ({ ...x, hours: Number(e.target.value) }))} onKeyDown={e => { if (e.key === 'Enter') handleSaveLogEdit(log.id); if (e.key === 'Escape') setEditingLogId(null); }} />
                                        <button onClick={() => handleSaveLogEdit(log.id)} className="text-blue-600 hover:text-blue-800" title="Save"><Check size={14} /></button>
                                        <button onClick={() => setEditingLogId(null)} className="text-gray-400 hover:text-gray-600" title="Cancel"><X size={14} /></button>
                                      </div>
                                    : log.hours
                                  }
                                </td>
                              </tr>
                              );
                            })}
                        </tbody>
                        </table>
                    ) : (
                        <div className="p-8 text-center text-gray-400 text-sm">No hours logged yet.</div>
                    );
                })()}
            </div>
          )}
          {/* ============= SUPPORT TICKETS SECTION ============= */}
          {isTicketProject && (
            <div className="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden">
              <div className="p-4 border-b border-orange-100 bg-orange-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LifeBuoy size={16} className="text-orange-600" />
                  <h3 className="font-semibold text-orange-900">{isHoursPackProject ? 'Hours Pack Tickets' : 'Support Tickets'}</h3>
                  <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-medium">
                    {(selectedProject.tickets || []).length} total
                  </span>
                </div>
                {selectedProject.status !== 'completed' && (
                  <button
                    onClick={() => setShowTicketModal(true)}
                    className="flex items-center gap-1.5 text-sm bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 font-medium"
                  >
                    <Plus size={14} /> New Ticket
                  </button>
                )}
              </div>

              {(selectedProject.tickets || []).length === 0 ? (
                <div className="p-10 text-center text-gray-400">
                  <LifeBuoy size={32} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No support tickets yet.</p>
                  <p className="text-xs mt-1">Create a ticket to track support requests.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {(selectedProject.tickets || []).sort((a, b) => {
                    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
                    const statusOrder = { open: 0, 'in-progress': 1, resolved: 2, closed: 3 };
                    if (a.status !== b.status) return statusOrder[a.status] - statusOrder[b.status];
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                  }).map(ticket => (
                    <div key={ticket.id} className="hover:bg-gray-50 transition">
                      <div
                        className="p-4 flex items-start justify-between gap-3 cursor-pointer"
                        onClick={() => setExpandedTicketId(expandedTicketId === ticket.id ? null : ticket.id)}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="mt-0.5">
                            {expandedTicketId === ticket.id ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-semibold text-gray-900 text-sm">{ticket.title}</span>
                              {ticketPriorityBadge(ticket.priority)}
                              {ticketStatusBadge(ticket.status)}
                            </div>
                            <p className="text-xs text-gray-500 truncate">{ticket.description}</p>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                              <span className="flex items-center gap-1"><UserIcon size={10} /> {ticket.reportedBy}</span>
                              <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(ticket.createdAt).toLocaleDateString()}</span>
                              <span className="flex items-center gap-1"><Clock size={10} /> {ticket.hoursLogged}h logged</span>
                              {editingTicketHours === ticket.id ? (
                                <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <span className="text-gray-400">/ est:</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    className="w-16 border border-blue-300 rounded px-1 py-0.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    value={ticketHoursInput}
                                    onChange={e => setTicketHoursInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleUpdateTicketHours(ticket.id); if (e.key === 'Escape') setEditingTicketHours(null); }}
                                    autoFocus
                                  />
                                  <button onClick={() => handleUpdateTicketHours(ticket.id)} className="text-blue-600 hover:text-blue-800"><Check size={12} /></button>
                                  <button onClick={() => setEditingTicketHours(null)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 group/est">
                                  <span>/ {ticket.estimatedHours}h est</span>
                                  {selectedProject.status !== 'completed' && (
                                    <button
                                      onClick={e => { e.stopPropagation(); setTicketHoursInput(String(ticket.estimatedHours)); setEditingTicketHours(ticket.id); }}
                                      className="opacity-0 group-hover/est:opacity-100 text-gray-300 hover:text-blue-500 transition"
                                      title="Edit estimated hours"
                                    ><Edit2 size={10} /></button>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            className="text-xs border border-gray-200 rounded p-1 bg-white"
                            value={ticket.status}
                            onClick={e => e.stopPropagation()}
                            onChange={e => handleUpdateTicketStatus(ticket.id, e.target.value as TicketStatus)}
                          >
                            <option value="open">Open</option>
                            <option value="in-progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                          </select>
                          <button
                            onClick={e => { e.stopPropagation(); setTicketLogForm({ ...ticketLogForm, ticketId: ticket.id }); setShowTicketLogModal(true); }}
                            className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-1 rounded hover:bg-blue-100 flex items-center gap-1"
                          >
                            <Plus size={10} /> Hours
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteTicket(ticket.id); }}
                            className="text-gray-300 hover:text-red-500 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded: time logs for this ticket */}
                      {expandedTicketId === ticket.id && (ticket.timeLogs || []).length > 0 && (
                        <div className="px-12 pb-4">
                          <table className="w-full text-xs border border-gray-100 rounded-lg overflow-hidden">
                            <thead className="bg-gray-50 text-gray-500">
                              <tr>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Consultant</th>
                                <th className="px-3 py-2 text-left">Description</th>
                                <th className="px-3 py-2 text-right">Hours</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {(ticket.timeLogs || []).map(log => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 text-gray-500">{new Date(log.date).toLocaleDateString()}</td>
                                  <td className="px-3 py-2 text-gray-700">{log.consultantName}</td>
                                  <td className="px-3 py-2 text-gray-600 truncate max-w-xs">{log.description}</td>
                                  <td className="px-3 py-2 text-right font-mono text-gray-800">{log.hours}h</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* ===================================================== */}

          {/* ============= MANUFACTURER TICKETS SECTION ============= */}
          <ManufacturerTickets
            project={selectedProject}
            updateProject={updateProject}
          />

        </div>
      )}

      {/* Subtask Modal, Add Member Modal, Time Log Modal, Task Modal */}
       {showSubtaskModal && selectedTaskForSubtasks && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl shrink-0">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <CheckSquare size={18} className="text-blue-600" /> Task Checklist
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">{selectedTaskForSubtasks.title}</p>
                  </div>
                  <button onClick={() => setShowSubtaskModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>

                {/* Scrollable list */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {selectedTaskForSubtasks.subtasks && selectedTaskForSubtasks.subtasks.length > 0 ? (
                    selectedTaskForSubtasks.subtasks.map(subtask => (
                      <div key={subtask.id} className="border border-gray-200 rounded-xl p-3">
                        {/* Title row */}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleSubtask(subtask.id)}
                            className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition ${subtask.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent hover:border-blue-400'}`}
                          >
                            <CheckCircle size={12} fill="currentColor" />
                          </button>
                          <span className={`flex-1 text-sm font-medium ${subtask.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                            {subtask.title}
                          </span>
                        </div>

                        {/* Assignees row */}
                        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap pl-8">
                          <Users size={11} className="text-gray-400 shrink-0" />
                          {(subtask.assignees || []).length === 0 && (
                            <span className="text-[11px] text-gray-400 italic">No assignees</span>
                          )}
                          {(subtask.assignees || []).map(name => (
                            <span
                              key={name}
                              onClick={() => handleToggleSubtaskAssignee(selectedTaskForSubtasks.id, subtask.id, name)}
                              className="inline-flex items-center gap-1 text-[11px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full cursor-pointer hover:bg-red-100 hover:text-red-600 border border-indigo-200 hover:border-red-200 transition"
                              title="Click to remove"
                            >
                              {name} <X size={8} />
                            </span>
                          ))}
                          <select
                            className="text-[11px] text-gray-500 border border-dashed border-gray-300 rounded-full px-2 py-0.5 bg-transparent cursor-pointer hover:border-gray-400 outline-none"
                            value=""
                            onChange={e => {
                              if (e.target.value) handleToggleSubtaskAssignee(selectedTaskForSubtasks.id, subtask.id, e.target.value);
                            }}
                          >
                            <option value="">+ Assign consultant</option>
                            {(selectedProject?.team || [])
                              .filter(name => !(subtask.assignees || []).includes(name))
                              .map(name => (
                                <option key={name} value={name}>{name}</option>
                              ))
                            }
                          </select>
                        </div>

                        {/* Comment row */}
                        <div className="mt-2 pl-8">
                          {editingCommentId === subtask.id ? (
                            <div className="flex gap-2 items-start">
                              <textarea
                                autoFocus
                                rows={2}
                                className="flex-1 border border-blue-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                                placeholder="Instructions for consultants in this session..."
                                value={commentDraft}
                                onChange={e => setCommentDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSaveSubtaskComment(selectedTaskForSubtasks.id, subtask.id); if (e.key === 'Escape') setEditingCommentId(null); }}
                              />
                              <div className="flex flex-col gap-1 shrink-0">
                                <button onClick={() => handleSaveSubtaskComment(selectedTaskForSubtasks.id, subtask.id)} className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700" title="Save (Ctrl+Enter)"><Check size={12} /></button>
                                <button onClick={() => setEditingCommentId(null)} className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg"><X size={12} /></button>
                              </div>
                            </div>
                          ) : subtask.comment ? (
                            <div
                              onClick={() => { setEditingCommentId(subtask.id); setCommentDraft(subtask.comment || ''); }}
                              className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-amber-100 transition group"
                              title="Click to edit"
                            >
                              <AlertCircle size={11} className="text-amber-500 mt-0.5 shrink-0" />
                              <span className="text-[11px] text-amber-800 flex-1">{subtask.comment}</span>
                              <Edit2 size={10} className="text-amber-400 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditingCommentId(subtask.id); setCommentDraft(''); }}
                              className="text-[11px] text-gray-400 hover:text-blue-600 flex items-center gap-1 transition"
                            >
                              <Plus size={10} /> Add session instructions
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-400 italic text-center py-8">No steps added yet.</p>
                  )}
                </div>

                {/* Add step footer */}
                <div className="p-5 border-t border-gray-100 shrink-0">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                      placeholder="Add a new step..."
                      value={newSubtaskTitle}
                      onChange={e => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddSubtask()}
                    />
                    <button
                      onClick={handleAddSubtask}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                      disabled={!newSubtaskTitle.trim()}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
          </div>
      )}
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Add Team Member</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Select User</label>
                        <select className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white" value={selectedUserToAdd} onChange={(e) => setSelectedUserToAdd(e.target.value)}>
                            <option value="">Select a user...</option>
                            {users.filter(u => !selectedProject?.team.includes(u.name)).map(u => (<option key={u.id} value={u.name}>{u.name}</option>))}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={() => setShowAddMemberModal(false)} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
                    <button onClick={handleAddMember} disabled={!selectedUserToAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">Add Member</button>
                </div>
            </div>
        </div>
      )}
      {showTimeModal && selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Log Time</h3>
              <div className="space-y-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Consultant</label>
                    <select className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white" value={logDetails.consultantName} onChange={(e) => setLogDetails({...logDetails, consultantName: e.target.value})}>
                       <option value="">Select consultant...</option>
                       {users.map(u => (<option key={u.id} value={u.name}>{u.name}</option>))}
                    </select>
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Task</label>
                    <select className="w-full border border-gray-300 rounded-lg p-2 text-sm" value={logDetails.taskId} onChange={(e) => setLogDetails({...logDetails, taskId: e.target.value})}>
                       <option value="">Select a task...</option>
                       {(selectedProject.tasks || []).map(t => (<option key={t.id} value={t.id}>{t.title}</option>))}
                    </select>
                 </div>
                 <div><label className="block text-sm font-medium text-gray-700 mb-1">Hours Spent</label><input type="number" className="w-full border border-gray-300 rounded-lg p-2 text-sm" min="0.5" step="0.5" value={logDetails.hours} onChange={(e) => setLogDetails({...logDetails, hours: Number(e.target.value)})} /></div>
                 <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea className="w-full border border-gray-300 rounded-lg p-2 text-sm" rows={3} placeholder="What did you work on?" value={logDetails.description} onChange={(e) => setLogDetails({...logDetails, description: e.target.value})} /></div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                 <button onClick={() => setShowTimeModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">Cancel</button>
                 <button onClick={handleAddTimeLog} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm" disabled={!logDetails.consultantName || !logDetails.taskId || logDetails.hours <= 0}>Save Log</button>
              </div>
           </div>
        </div>
      )}
      {(showTaskModal || showEditTaskModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">{showEditTaskModal ? 'Edit Task' : 'Add New Task'}</h3>
              <div className="space-y-4">
                 <div><label className="block text-sm font-medium text-gray-700 mb-1">Task Title</label><input type="text" className="w-full border border-gray-300 rounded-lg p-2 text-sm" placeholder="e.g. Database Migration" value={taskForm.title} onChange={(e) => setTaskForm({...taskForm, title: e.target.value})} /></div>
                 <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
                        <select className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white" value={taskForm.assignee} onChange={(e) => setTaskForm({...taskForm, assignee: e.target.value})}>
                          <option value="">Select User</option>
                          {users.map(user => (<option key={user.id} value={user.name}>{user.name}</option>))}
                        </select>
                     </div>
                     {!isLicenseProject && (
                        <div><label className="block text-sm font-medium text-gray-700 mb-1">Est. Hours</label><input type="number" className="w-full border border-gray-300 rounded-lg p-2 text-sm" min="0" step="0.5" value={taskForm.estimatedHours} onChange={(e) => setTaskForm({...taskForm, estimatedHours: Number(e.target.value)})} /></div>
                     )}
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label><div className="relative"><input type="date" className="w-full border border-gray-300 rounded-lg p-2 text-sm" value={taskForm.startDate} onChange={(e) => setTaskForm({...taskForm, startDate: e.target.value})} /></div></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">End Date</label><div className="relative"><input type="date" className="w-full border border-gray-300 rounded-lg p-2 text-sm" value={taskForm.endDate} onChange={(e) => setTaskForm({...taskForm, endDate: e.target.value})} /></div></div>
                 </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                 <button onClick={() => { setShowTaskModal(false); setShowEditTaskModal(false); }} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
                 <button onClick={handleSaveTask} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">{showEditTaskModal ? 'Save Changes' : 'Create Task'}</button>
              </div>
           </div>
        </div>
      )}

      {/* Create Ticket Modal */}
      {showTicketModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><LifeBuoy size={18} className="text-orange-600" /> New Support Ticket</h3>
              <button onClick={() => setShowTicketModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {/* Row 1: Date received + Priority + Estimated Hours */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Received <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-orange-100 outline-none"
                    value={ticketForm.receivedDate}
                    onChange={e => setTicketForm({ ...ticketForm, receivedDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                    value={ticketForm.priority}
                    onChange={e => setTicketForm({ ...ticketForm, priority: e.target.value as TicketPriority })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Hours</label>
                  <input
                    type="number"
                    min="0" step="0.5"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-orange-100 outline-none"
                    placeholder="0"
                    value={ticketForm.estimatedHours || ''}
                    onChange={e => setTicketForm({ ...ticketForm, estimatedHours: Number(e.target.value) })}
                  />
                </div>
              </div>
              {/* Row 2: Area + Executed By (consultant) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Area <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-orange-100 outline-none"
                    placeholder="e.g. Security, DevOps, IT..."
                    value={ticketForm.area}
                    onChange={e => setTicketForm({ ...ticketForm, area: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Executed By <span className="text-red-500">*</span></label>
                  <select
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-orange-100 outline-none"
                    value={ticketForm.reportedBy}
                    onChange={e => setTicketForm({ ...ticketForm, reportedBy: e.target.value })}
                  >
                    <option value="">— Select consultant —</option>
                    {users.filter(u => u.role === 'consultant' || u.role === 'admin').map(u => (
                      <option key={u.id} value={u.name}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Row 3: Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Request Description <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-orange-100 outline-none"
                  placeholder="Brief description of the request"
                  value={ticketForm.title}
                  onChange={e => setTicketForm({ ...ticketForm, title: e.target.value })}
                />
              </div>
              {/* Row 4: Full description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Detail</label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-orange-100 outline-none"
                  rows={3}
                  placeholder="Steps to reproduce, expected vs actual behavior, context..."
                  value={ticketForm.description}
                  onChange={e => setTicketForm({ ...ticketForm, description: e.target.value })}
                />
              </div>
              {/* Row 5: Out of scope / additional support / solution */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Out of Scope Reason / Additional Support Required / Solution</label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-orange-100 outline-none"
                  rows={3}
                  placeholder="Reason why this is out of scope, what additional support is needed, or the applied solution..."
                  value={ticketForm.outOfScopeReason}
                  onChange={e => setTicketForm({ ...ticketForm, outOfScopeReason: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowTicketModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
              <button
                onClick={handleCreateTicket}
                disabled={!ticketForm.title.trim() || !ticketForm.area.trim() || !ticketForm.reportedBy}
                className="px-6 py-2 bg-orange-600 text-white rounded-lg font-semibold text-sm hover:bg-orange-700 disabled:opacity-50"
              >
                Create Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Hours to Ticket Modal */}
      {showTicketLogModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Clock size={18} className="text-blue-600" /> Log Hours to Ticket</h3>
              <button onClick={() => setShowTicketLogModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Consultant</label>
                <select
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                  value={ticketLogForm.consultantName}
                  onChange={e => setTicketLogForm({ ...ticketLogForm, consultantName: e.target.value })}
                >
                  <option value="">Select consultant...</option>
                  {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                    value={ticketLogForm.date}
                    onChange={e => setTicketLogForm({ ...ticketLogForm, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
                  <input
                    type="number"
                    min="0.25"
                    step="0.25"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                    placeholder="0.0"
                    value={ticketLogForm.hours || ''}
                    onChange={e => setTicketLogForm({ ...ticketLogForm, hours: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Description</label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                  rows={3}
                  placeholder="What was done to resolve this issue?"
                  value={ticketLogForm.description}
                  onChange={e => setTicketLogForm({ ...ticketLogForm, description: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowTicketLogModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
              <button
                onClick={handleLogTicketHours}
                disabled={ticketLogForm.hours <= 0 || !ticketLogForm.description.trim() || !ticketLogForm.consultantName}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Save Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Project Deletion */}
      {showDeleteConfirm && selectedProject && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
                  <div className="flex flex-col items-center text-center">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                          <AlertTriangle size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Project?</h3>
                      <p className="text-sm text-gray-500 mb-6">
                          Are you sure you want to permanently delete <strong>{selectedProject.name}</strong>? This action cannot be undone and all associated tasks and logs will be lost.
                      </p>
                      <div className="flex gap-3 w-full">
                          <button 
                              onClick={() => setShowDeleteConfirm(false)}
                              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
                          >
                              Cancel
                          </button>
                          <button 
                              onClick={handleDeleteProjectConfirm}
                              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
                          >
                              Delete Project
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* New Project Modal */}
      {showNewProjectModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Briefcase size={18} /> New Project</h3>
                      <button onClick={() => setShowNewProjectModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                          <input required type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" placeholder="e.g. Internal ERP Migration" value={newProjectForm.name} onChange={e => setNewProjectForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
                          <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" placeholder="e.g. Incoda Internal" value={newProjectForm.clientName} onChange={e => setNewProjectForm(f => ({ ...f, clientName: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                              <select className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white" value={newProjectForm.type} onChange={e => setNewProjectForm(f => ({ ...f, type: e.target.value as ProjectType }))}>
                                  <option value="implementation">Implementation</option>
                                  <option value="support">Support</option>
                                  <option value="consulting">Consulting</option>
                                  <option value="hours_pack">Hours Pack</option>
                                  <option value="license">License</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Budget Hours</label>
                              <input type="number" min="1" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" value={newProjectForm.totalBudgetHours} onChange={e => setNewProjectForm(f => ({ ...f, totalBudgetHours: Number(e.target.value) }))} />
                          </div>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                          <input type="date" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" value={newProjectForm.startDate} onChange={e => setNewProjectForm(f => ({ ...f, startDate: e.target.value }))} />
                      </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                      <button type="button" onClick={() => setShowNewProjectModal(false)} className="px-4 py-2 text-gray-600 text-sm">Cancel</button>
                      <button
                          type="button"
                          disabled={!newProjectForm.name.trim()}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                          onClick={() => {
                              if (!newProjectForm.name.trim()) return;
                              const proj: Project = {
                                  id: `proj_${Date.now()}`,
                                  name: newProjectForm.name.trim(),
                                  clientName: newProjectForm.clientName.trim() || newProjectForm.name.trim(),
                                  type: newProjectForm.type,
                                  startDate: new Date(newProjectForm.startDate).toISOString(),
                                  status: 'active',
                                  totalBudgetHours: newProjectForm.totalBudgetHours,
                                  team: [],
                                  tasks: [],
                                  timeLogs: [],
                                  tickets: [],
                                  payments: [],
                                  factoryCommissionRate: 10,
                              };
                              onAddProject(proj);
                              setShowNewProjectModal(false);
                              setSelectedProjectId(proj.id);
                          }}
                      >
                          <Save size={16} /> Create Project
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Confirmation Modal for Closing Project */}
      {showCloseConfirm && selectedProject && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
                  <div className="flex flex-col items-center text-center">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4 text-green-600">
                          <CheckCircle size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">Close Project?</h3>
                      <p className="text-sm text-gray-500 mb-6">
                          You are about to mark <strong>{selectedProject.name}</strong> as completed. This will also update the Opportunity status to <strong>Project Delivered</strong>.
                      </p>
                      <div className="flex gap-3 w-full">
                          <button 
                              onClick={() => setShowCloseConfirm(false)}
                              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
                          >
                              Cancel
                          </button>
                          <button 
                              onClick={handleCloseProjectConfirm}
                              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition"
                          >
                              Confirm Close
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
