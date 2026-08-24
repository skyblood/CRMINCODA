
import React, { useState, useMemo, useEffect } from 'react';
import { Project, TimeLog, Task, SubTask, User, SupportTicket, TicketPriority, TicketStatus } from '../types';
import { Clock, Calendar, CheckCircle2, Briefcase, Plus, History, UserCheck, Circle, PlayCircle, List, CheckSquare, X, CheckCircle, BarChart2, LifeBuoy, ChevronDown, ChevronRight, AlertCircle, Edit2, Check, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { apiFetch } from '../services/apiFetch';

interface ConsultantPortalProps {
  projects: Project[];
  updateProject: (project: Project) => void;
  users: User[];
  currentUser: User;
}

export const ConsultantPortal: React.FC<ConsultantPortalProps> = ({ projects, updateProject, currentUser, users }) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showSubtaskModal, setShowSubtaskModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedTaskForSubtasks, setSelectedTaskForSubtasks] = useState<Task | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  
  // Form State
  const [logForm, setLogForm] = useState({
    hours: 0,
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  // New Task State
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    estimatedHours: 0,
    hoursToLog: 0,
    logDate: new Date().toISOString().split('T')[0],
    logDescription: ''
  });

  // Support Ticket State
  const [showOpenTicketModal, setShowOpenTicketModal] = useState(false);
  const [showTicketHoursModal, setShowTicketHoursModal] = useState(false);
  const [ticketForHours, setTicketForHours] = useState<SupportTicket | null>(null);
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
  const [ticketLogForm, setTicketLogForm] = useState({ hours: 0, description: '', date: new Date().toISOString().split('T')[0] });

  // Subtask-level hour logging
  const [subtaskLogTarget, setSubtaskLogTarget] = useState<{ taskId: string; subtaskId: string } | null>(null);
  const [subtaskLogForm, setSubtaskLogForm] = useState({ hours: 0, date: new Date().toISOString().split('T')[0], description: '' });
  const [expandedSubtaskId, setExpandedSubtaskId] = useState<string | null>(null);

  // Tax profile (Datos fiscales)
  const [taxProfile, setTaxProfile] = useState<{ legalName: string; tinLast4: string; tinType: string; address: any; w9SubmittedAt: string | null } | null>(null);
  const [taxForm, setTaxForm] = useState({ legalName: '', tin: '', tinType: 'SSN', line1: '', city: '', state: '', zip: '', country: 'US' });
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxError, setTaxError] = useState('');

  useEffect(() => {
    apiFetch('/api/tax-profile/me').then(async (r) => {
      if (r.ok) setTaxProfile(await r.json());
    });
  }, []);

  // Filter projects where the current user is in the team
  const myProjects = projects.filter(p => (p.team || []).includes(currentUser.name));
  const selectedProject = myProjects.find(p => p.id === selectedProjectId);

  // Get all time logs across all projects for this user to show history
  const myHistory = projects.flatMap(p =>
    (p.timeLogs || []).filter(log => log.consultantName === currentUser.name).map(log => ({
      ...log,
      projectName: p.name
    }))
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // All logs (project + ticket) across every project, deduplicated
  const allMyLogs = useMemo(() => {
    return projects.flatMap(p => {
      const projLogIds = new Set((p.timeLogs || []).map((l: any) => l.id));
      const ticketLogs = (p.tickets || []).flatMap((t: any) =>
        (t.timeLogs || []).filter((l: any) => !projLogIds.has(l.id))
      );
      return [...(p.timeLogs || []), ...ticketLogs].filter(
        (l: any) => l.consultantName === currentUser.name
      );
    });
  }, [projects, currentUser.name]);

  const hourlyRate = currentUser.hourlyCost || 0;

  const earningsStats = useMemo(() => {
    const calc = (logs: any[]) =>
      logs.reduce((sum: number, l: any) => sum + (l.approvedCost ?? l.hours * hourlyRate), 0);
    const pending  = allMyLogs.filter((l: any) => l.status === 'pending');
    const approved = allMyLogs.filter((l: any) => l.status === 'approved');
    const paid     = allMyLogs.filter((l: any) => l.status === 'paid');
    const rejected = allMyLogs.filter((l: any) => l.status === 'rejected');
    return {
      hoursPending:  pending.reduce((s: number, l: any) => s + l.hours, 0),
      hoursApproved: approved.reduce((s: number, l: any) => s + l.hours, 0),
      hoursPaid:     paid.reduce((s: number, l: any) => s + l.hours, 0),
      hoursRejected: rejected.reduce((s: number, l: any) => s + l.hours, 0),
      amountPending:  calc(pending),
      amountApproved: calc(approved),
      amountPaid:     calc(paid),
      totalHours:     allMyLogs.reduce((s: number, l: any) => s + l.hours, 0),
    };
  }, [allMyLogs, hourlyRate]);

  // Chart Data: Total Hours Per Project
  const consultantStats = useMemo(() => {
    return myProjects.map(project => {
      const totalHours = project.timeLogs
        .filter(log => log.consultantName === currentUser.name)
        .reduce((sum, log) => sum + log.hours, 0);
      
      return {
        name: project.name,
        shortName: project.name.length > 15 ? project.name.substring(0, 15) + '...' : project.name,
        hours: totalHours
      };
    }).filter(p => p.hours > 0); 
  }, [myProjects, currentUser.name]);

  const handleOpenLogModal = (taskId: string) => {
    setSelectedTaskId(taskId);
    setShowLogModal(true);
  };

  const handleOpenSubtaskModal = (task: Task) => {
    setSelectedTaskForSubtasks(task);
    setShowSubtaskModal(true);
  };

  const handleSubmitLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !selectedTaskId) return;

    const newLog: TimeLog = {
      id: Date.now().toString(),
      taskId: selectedTaskId,
      consultantName: currentUser.name,
      consultantId: currentUser.id,
      hours: Number(logForm.hours),
      date: logForm.date,
      description: logForm.description,
      status: 'pending' // Default status for new logs from portal
    };

    // Update Task Logged Hours
    const updatedTasks = selectedProject.tasks.map(t => 
      t.id === selectedTaskId ? { ...t, loggedHours: t.loggedHours + newLog.hours } : t
    );

    // Update Project
    const updatedProject = {
      ...selectedProject,
      tasks: updatedTasks,
      timeLogs: [...selectedProject.timeLogs, newLog]
    };

    updateProject(updatedProject);
    setShowLogModal(false);
    setLogForm({ hours: 0, description: '', date: new Date().toISOString().split('T')[0] });
  };

  const handleCreateTask = () => {
    if (!selectedProject || !newTaskForm.title.trim()) return;
    const taskId = `task_${Date.now()}`;
    const newTask: Task = {
      id: taskId,
      title: newTaskForm.title.trim(),
      assignee: currentUser.name,
      status: newTaskForm.hoursToLog > 0 ? 'in-progress' : 'todo',
      estimatedHours: Number(newTaskForm.estimatedHours) || 0,
      loggedHours: newTaskForm.hoursToLog > 0 ? Number(newTaskForm.hoursToLog) : 0,
      subtasks: []
    };
    let updatedTimeLogs = [...selectedProject.timeLogs];
    if (newTaskForm.hoursToLog > 0 && newTaskForm.logDescription.trim()) {
      const log: TimeLog = {
        id: `tl_${Date.now()}`,
        taskId,
        consultantName: currentUser.name,
        consultantId: currentUser.id,
        hours: Number(newTaskForm.hoursToLog),
        date: newTaskForm.logDate,
        description: newTaskForm.logDescription,
        status: 'pending'
      };
      updatedTimeLogs = [...updatedTimeLogs, log];
    }
    updateProject({
      ...selectedProject,
      tasks: [...selectedProject.tasks, newTask],
      timeLogs: updatedTimeLogs
    });
    setNewTaskForm({ title: '', estimatedHours: 0, hoursToLog: 0, logDate: new Date().toISOString().split('T')[0], logDescription: '' });
    setShowNewTaskModal(false);
  };

  // Subtask Logic
  const handleAddSubtask = () => {
    if (!selectedProject || !selectedTaskForSubtasks || !newSubtaskTitle.trim()) return;

    const newSubtask: SubTask = {
        id: `st_${Date.now()}`,
        title: newSubtaskTitle,
        completed: false
    };

    const updatedTasks = selectedProject.tasks.map(t => {
        if (t.id === selectedTaskForSubtasks.id) {
            return { ...t, subtasks: [...(t.subtasks || []), newSubtask] };
        }
        return t;
    });

    const updatedProject = { ...selectedProject, tasks: updatedTasks };
    updateProject(updatedProject);
    
    const updatedTask = updatedTasks.find(t => t.id === selectedTaskForSubtasks.id);
    if (updatedTask) setSelectedTaskForSubtasks(updatedTask);
    setNewSubtaskTitle('');
  };

  const toggleSubtask = (subtaskId: string) => {
     if (!selectedProject || !selectedTaskForSubtasks) return;

     const updatedTasks = selectedProject.tasks.map(t => {
         if (t.id === selectedTaskForSubtasks.id) {
             const updatedSubtasks = t.subtasks.map(st => 
                 st.id === subtaskId ? { ...st, completed: !st.completed } : st
             );

             // Calculate new status based on subtasks
             const allSubtasksCompleted = updatedSubtasks.length > 0 && updatedSubtasks.every(st => st.completed);
             const anySubtaskCompleted = updatedSubtasks.some(st => st.completed);
             
             let newStatus = t.status;
             
             if (allSubtasksCompleted) {
                 newStatus = 'done';
             } else if (t.status === 'done' && !allSubtasksCompleted) {
                 // Revert to in-progress if unchecked
                 newStatus = 'in-progress';
             } else if (t.status === 'todo' && anySubtaskCompleted) {
                 // Auto move to in-progress if started
                 newStatus = 'in-progress';
             }

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
    const updatedTasks = selectedProject.tasks.map(t =>
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

  const handleLogSubtaskHours = (taskId: string, subtaskId: string) => {
    if (!selectedProject || subtaskLogForm.hours <= 0) return;
    const newLog: TimeLog = {
      id: `tl_st_${Date.now()}`,
      taskId,
      subtaskId,
      consultantName: currentUser.name,
      consultantId: currentUser.id,
      hours: Number(subtaskLogForm.hours),
      date: subtaskLogForm.date,
      description: subtaskLogForm.description,
      status: 'pending'
    };
    const updatedTasks = selectedProject.tasks.map(t =>
      t.id === taskId ? { ...t, loggedHours: t.loggedHours + newLog.hours } : t
    );
    updateProject({
      ...selectedProject,
      tasks: updatedTasks,
      timeLogs: [...selectedProject.timeLogs, newLog]
    });
    setSubtaskLogTarget(null);
    setSubtaskLogForm({ hours: 0, date: new Date().toISOString().split('T')[0], description: '' });
    const updatedTask = updatedTasks.find(t => t.id === taskId);
    if (updatedTask) setSelectedTaskForSubtasks(updatedTask);
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

  const handleOpenTicket = () => {
    if (!selectedProject || !ticketForm.title.trim()) return;
    const ticket: SupportTicket = {
      id: `tkt_${Date.now()}`,
      receivedDate: ticketForm.receivedDate,
      title: ticketForm.title,
      description: ticketForm.description,
      area: ticketForm.area,
      reportedBy: ticketForm.reportedBy || currentUser.name,
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
    setShowOpenTicketModal(false);
  };

  const handleLogTicketHours = () => {
    if (!selectedProject || !ticketForHours || ticketLogForm.hours <= 0) return;
    const newLog: TimeLog = {
      id: `tl_tkt_${Date.now()}`,
      consultantName: currentUser.name,
      consultantId: currentUser.id,
      hours: Number(ticketLogForm.hours),
      date: ticketLogForm.date,
      description: ticketLogForm.description,
      status: 'pending'
    };
    const updatedTickets = (selectedProject.tickets || []).map(t =>
      t.id === ticketForHours.id
        ? {
            ...t,
            hoursLogged: t.hoursLogged + newLog.hours,
            timeLogs: [...t.timeLogs, newLog],
            status: t.status === 'open' ? 'in-progress' as TicketStatus : t.status
          }
        : t
    );
    const updatedTimeLogs = [...selectedProject.timeLogs, { ...newLog, taskId: `ticket_${ticketForHours.id}` }];
    updateProject({ ...selectedProject, tickets: updatedTickets, timeLogs: updatedTimeLogs });
    setShowTicketHoursModal(false);
    setTicketLogForm({ hours: 0, description: '', date: new Date().toISOString().split('T')[0] });
    setTicketForHours(null);
  };

  const submitTaxProfile = async () => {
    setTaxSaving(true);
    setTaxError('');
    try {
      const res = await apiFetch('/api/tax-profile/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName: taxForm.legalName,
          tin: taxForm.tin,
          tinType: taxForm.tinType,
          address: { line1: taxForm.line1, city: taxForm.city, state: taxForm.state, zip: taxForm.zip, country: taxForm.country },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setTaxError(body.error || 'No se pudo guardar');
        return;
      }
      setTaxProfile(await res.json());
      setTaxForm(f => ({ ...f, tin: '' }));
    } finally {
      setTaxSaving(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200"><Clock size={9} /> Pending</span>;
      case 'approved': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200"><CheckCircle size={9} /> Approved</span>;
      case 'paid':     return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200"><CheckCircle2 size={9} /> Paid</span>;
      case 'rejected': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-600 border border-red-200"><AlertCircle size={9} /> Rejected</span>;
      default:         return <span className="text-[10px] text-gray-400">{status}</span>;
    }
  };

  const priorityColor = (p: TicketPriority) => ({
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700 font-bold'
  }[p]);

  const statusColor = (s: TicketStatus) => ({
    open: 'bg-yellow-100 text-yellow-700',
    'in-progress': 'bg-blue-100 text-blue-700',
    resolved: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-500'
  }[s]);

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
           <h1 className="text-2xl font-bold text-gray-900">Consultant Portal</h1>
           <p className="text-gray-500 flex items-center gap-2 mt-1">
             <UserCheck size={16} className="text-green-600" /> 
             Logged in as <span className="font-semibold text-gray-800">{currentUser.name}</span>
           </p>
        </div>
        <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg font-medium text-sm">
           {myProjects.length} Active Projects
        </div>
      </header>

      {/* ── CONSULTANT DASHBOARD ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Total Paid */}
        <div className="bg-white rounded-xl border border-green-200 shadow-sm p-5 flex flex-col gap-1" style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Total Paid</span>
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
              <CheckCircle2 size={14} className="text-white" />
            </div>
          </div>
          <p className="text-3xl font-black text-green-700">${earningsStats.amountPaid.toLocaleString()}</p>
          <p className="text-xs text-green-600">{earningsStats.hoursPaid}h paid</p>
        </div>

        {/* Approved (pending payment) */}
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 flex flex-col gap-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Approved</span>
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <CheckCircle size={14} className="text-white" />
            </div>
          </div>
          <p className="text-3xl font-black text-blue-700">${earningsStats.amountApproved.toLocaleString()}</p>
          <p className="text-xs text-blue-500">{earningsStats.hoursApproved}h approved</p>
        </div>

        {/* Pending Approval */}
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-5 flex flex-col gap-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Pending</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <Clock size={14} className="text-white" />
            </div>
          </div>
          <p className="text-3xl font-black text-amber-700">{earningsStats.hoursPending}h</p>
          <p className="text-xs text-amber-600">pending approval</p>
        </div>

      </div>

      {/* CHART SECTION */}
      {consultantStats.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
           <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
             <BarChart2 size={18} className="text-blue-600" /> Performance Overview: Executed Hours per Project
           </h3>
           <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={consultantStats} margin={{top: 10, right: 30, left: 0, bottom: 0}}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="shortName" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                    <Tooltip 
                        cursor={{fill: '#f8fafc'}}
                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                        formatter={(value: number) => [`${value} hrs`, 'Executed']}
                    />
                    <Bar dataKey="hours" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={40} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Project List */}
        <div className="lg:col-span-1 space-y-4">
           <h3 className="font-bold text-gray-700 uppercase text-xs tracking-wider">My Projects</h3>
           {myProjects.length > 0 ? (
             myProjects.map(project => (
               <div 
                 key={project.id}
                 onClick={() => setSelectedProjectId(project.id)}
                 className={`p-4 rounded-xl cursor-pointer border transition-all ${
                   selectedProjectId === project.id 
                     ? 'bg-blue-600 text-white border-blue-600 shadow-lg scale-[1.02]' 
                     : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-800 shadow-sm'
                 }`}
               >
                 <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-lg">{project.name}</h4>
                    {selectedProjectId === project.id && <CheckCircle2 size={20} className="text-blue-200" />}
                 </div>
                 <p className={`text-sm mb-3 ${selectedProjectId === project.id ? 'text-blue-100' : 'text-gray-500'}`}>
                   {project.clientName}
                 </p>
                 <div className="flex items-center gap-2 text-xs opacity-80">
                   <Clock size={14} />
                   <span>{(project.tasks || []).filter(t => t.status !== 'done').length} Pending Tasks</span>
                 </div>
               </div>
             ))
           ) : (
             <div className="p-8 bg-white rounded-xl text-center text-gray-400">
               No projects assigned to you.
             </div>
           )}
           
           {/* Recent History (Visible always in left col for context) */}
           <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-8">
              <h3 className="font-bold text-gray-700 text-sm mb-4 flex items-center gap-2">
                <History size={16} /> My Recent Logs
              </h3>
              <div className="space-y-3">
                 {myHistory.slice(0, 5).map(log => (
                   <div key={log.id} className="text-sm border-b border-gray-50 pb-2 last:border-0">
                      <div className="flex justify-between font-medium text-gray-800">
                         <span>{log.hours} hrs</span>
                         <span className="text-xs text-gray-400">{new Date(log.date).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{log.projectName}</p>
                      <p className="text-xs text-gray-400 italic truncate">{log.description}</p>
                   </div>
                 ))}
                 {myHistory.length === 0 && <p className="text-xs text-gray-400">No time logged yet.</p>}
              </div>
           </div>
        </div>

        {/* Right Column: Task List & Actions */}
        <div className="lg:col-span-2">
           {selectedProject ? (
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">
                <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                   <div>
                     <h2 className="text-xl font-bold text-gray-800">{selectedProject.name}</h2>
                     <p className="text-sm text-gray-500">Select a task to log your hours</p>
                   </div>
                   <button
                     onClick={() => setShowNewTaskModal(true)}
                     className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-medium shadow-sm"
                   >
                     <Plus size={14} /> New Task
                   </button>
                </div>
                
                <div className="p-0">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 font-medium">Task</th>
                        <th className="px-6 py-4 font-medium">Progress</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                       {(selectedProject.tasks || []).map(task => {
                         const subtaskCount = task.subtasks?.length || 0;
                         const completedSubtasks = task.subtasks?.filter(s => s.completed).length || 0;
                         
                         return (
                         <tr key={task.id} className="hover:bg-gray-50 transition">
                           <td className="px-6 py-4">
                             <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">{task.title}</span>
                                <button 
                                   onClick={() => handleOpenSubtaskModal(task)}
                                   className="text-gray-300 hover:text-blue-500"
                                   title="View Checklist"
                                >
                                   <List size={14} />
                                </button>
                             </div>
                             <div className="text-xs text-gray-400 mt-1">Assignee: {task.assignee}</div>
                             
                             {/* Subtask Indicator */}
                             {subtaskCount > 0 && (
                                <div 
                                    onClick={() => handleOpenSubtaskModal(task)}
                                    className="inline-flex items-center gap-1 mt-2 cursor-pointer text-xs text-gray-500 hover:text-blue-600 bg-gray-100 px-2 py-0.5 rounded border border-transparent hover:border-blue-100"
                                >
                                    <CheckSquare size={12} /> {completedSubtasks}/{subtaskCount} steps
                                </div>
                             )}
                           </td>
                           <td className="px-6 py-4">
                             <div className="flex flex-col gap-3">
                                {/* Hours Progress */}
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="flex items-center gap-1 text-blue-600 font-medium"><Clock size={10} /> Time</span>
                                        <span className="text-gray-500">{task.loggedHours}/{task.estimatedHours}h</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-blue-500 rounded-full" 
                                            style={{ width: `${Math.min((task.loggedHours / task.estimatedHours) * 100, 100)}%` }} 
                                        />
                                    </div>
                                </div>

                                {/* Checklist Progress */}
                                {subtaskCount > 0 && (
                                    <div className="flex flex-col gap-1">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="flex items-center gap-1 text-green-600 font-medium"><CheckSquare size={10} /> Steps</span>
                                            <span className="text-gray-500">{completedSubtasks}/{subtaskCount}</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-green-500 rounded-full" 
                                                style={{ width: `${(completedSubtasks / subtaskCount) * 100}%` }} 
                                            />
                                        </div>
                                    </div>
                                )}
                             </div>
                           </td>
                           <td className="px-6 py-4">
                             {task.status === 'done' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                                  <CheckCircle2 size={14} /> Done
                                </span>
                              )}
                              {task.status === 'in-progress' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                  <PlayCircle size={14} /> In Progress
                                </span>
                              )}
                              {task.status === 'todo' && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                  <Circle size={14} /> To Do
                                </span>
                              )}
                           </td>
                           <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => handleOpenLogModal(task.id)}
                                className="bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ml-auto"
                              >
                                <Plus size={14} /> Log Time
                              </button>
                           </td>
                         </tr>
                       )})}
                    </tbody>
                  </table>
                </div>

                {/* ── MY HOURS STATUS ── */}
                {(() => {
                  const projectLogIds = new Set((selectedProject.timeLogs || []).map((l: any) => l.id));
                  const ticketLogs = (selectedProject.tickets || []).flatMap((t: any) =>
                    (t.timeLogs || [])
                      .filter((l: any) => !projectLogIds.has(l.id) && l.consultantName === currentUser.name)
                      .map((l: any) => ({ ...l, _source: t.title }))
                  );
                  const myLogs = [
                    ...(selectedProject.timeLogs || [])
                      .filter((l: any) => l.consultantName === currentUser.name)
                      .map((l: any) => {
                        const task = (selectedProject.tasks || []).find((t: any) => t.id === l.taskId);
                        return { ...l, _source: task?.title || 'Project' };
                      }),
                    ...ticketLogs,
                  ].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  if (myLogs.length === 0) return null;


                  const pending  = myLogs.filter((l: any) => l.status === 'pending').reduce((s: number, l: any) => s + l.hours, 0);
                  const approved = myLogs.filter((l: any) => l.status === 'approved').reduce((s: number, l: any) => s + l.hours, 0);
                  const paid     = myLogs.filter((l: any) => l.status === 'paid').reduce((s: number, l: any) => s + l.hours, 0);

                  return (
                    <div className="border-t border-gray-100">
                      {/* Summary strip */}
                      <div className="px-6 py-3 bg-gray-50 flex items-center gap-6 text-xs">
                        <span className="font-semibold text-gray-600 flex items-center gap-1.5"><History size={13} /> My Hours</span>
                        <span className="flex items-center gap-1 text-amber-600 font-medium"><Clock size={11} /> {pending}h pending</span>
                        <span className="flex items-center gap-1 text-blue-600 font-medium"><CheckCircle size={11} /> {approved}h approved</span>
                        <span className="flex items-center gap-1 text-green-600 font-medium"><CheckCircle2 size={11} /> {paid}h paid</span>
                      </div>
                      {/* Log rows */}
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-y border-gray-100 text-gray-500 text-xs">
                          <tr>
                            <th className="px-6 py-2 text-left font-medium">Date</th>
                            <th className="px-6 py-2 text-left font-medium">Task / Source</th>
                            <th className="px-6 py-2 text-left font-medium">Description</th>
                            <th className="px-6 py-2 text-center font-medium">Hours</th>
                            <th className="px-6 py-2 text-center font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {myLogs.map((log: any) => (
                            <tr key={log.id} className="hover:bg-gray-50 transition">
                              <td className="px-6 py-3 text-gray-500 whitespace-nowrap">{new Date(log.date).toLocaleDateString()}</td>
                              <td className="px-6 py-3 text-gray-700 font-medium max-w-[160px] truncate">{log._source}</td>
                              <td className="px-6 py-3 text-gray-400 italic max-w-[200px] truncate">{log.description || '—'}</td>
                              <td className="px-6 py-3 text-center font-bold text-gray-800">{log.hours}h</td>
                              <td className="px-6 py-3 text-center">{statusBadge(log.status)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
             </div>
           ) : (
             <div className="h-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 p-10">
                <Briefcase size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-medium">Select a project to view tasks</p>
                <p className="text-sm">Choose from the list on the left</p>
             </div>
           )}
        </div>
      </div>

      {/* Support Tickets Panel — visible only for support projects */}
      {selectedProject?.type === 'support' && (
        <div className="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden">
          <div className="p-5 border-b border-orange-100 bg-orange-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LifeBuoy size={18} className="text-orange-600" />
              <h3 className="font-bold text-orange-900">Support Tickets — {selectedProject.name}</h3>
              <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full font-medium">
                {(selectedProject.tickets || []).filter(t => t.status === 'open' || t.status === 'in-progress').length} open
              </span>
            </div>
            <button
              onClick={() => setShowOpenTicketModal(true)}
              className="flex items-center gap-1.5 text-sm bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 font-medium"
            >
              <Plus size={14} /> Open Ticket
            </button>
          </div>

          {(selectedProject.tickets || []).length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <LifeBuoy size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No tickets yet. Open one to report an issue.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {(selectedProject.tickets || []).sort((a, b) => {
                const ord = { open: 0, 'in-progress': 1, resolved: 2, closed: 3 };
                return ord[a.status] - ord[b.status];
              }).map(ticket => (
                <div key={ticket.id}>
                  <div
                    className="p-4 flex items-start justify-between gap-3 cursor-pointer hover:bg-gray-50 transition"
                    onClick={() => setExpandedTicketId(expandedTicketId === ticket.id ? null : ticket.id)}
                  >
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {expandedTicketId === ticket.id ? <ChevronDown size={16} className="mt-0.5 text-gray-400 shrink-0" /> : <ChevronRight size={16} className="mt-0.5 text-gray-400 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-semibold text-gray-900 text-sm">{ticket.title}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${priorityColor(ticket.priority)}`}>{ticket.priority}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${statusColor(ticket.status)}`}>{ticket.status.replace('-', ' ')}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{ticket.description}</p>
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                          <Clock size={10} /> {ticket.hoursLogged}h logged
                          {editingTicketHours === ticket.id ? (
                            <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <span>/ est:</span>
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
                          <Calendar size={10} /> {new Date(ticket.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setTicketForHours(ticket); setShowTicketHoursModal(true); }}
                      className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 flex items-center gap-1 shrink-0 font-medium"
                    >
                      <Plus size={10} /> Log Hours
                    </button>
                  </div>

                  {expandedTicketId === ticket.id && (
                    <div className="px-10 pb-4">
                      {ticket.description && (
                        <p className="text-sm text-gray-600 mb-3 bg-gray-50 p-3 rounded-lg border border-gray-100">{ticket.description}</p>
                      )}
                      {(() => {
                        const myTicketLogs = (ticket.timeLogs || []).filter(
                          (l: any) => l.consultantName === currentUser.name
                        );
                        return myTicketLogs.length > 0 ? (
                          <table className="w-full text-xs border border-gray-100 rounded-lg overflow-hidden">
                            <thead className="bg-gray-50 text-gray-500">
                              <tr>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Description</th>
                                <th className="px-3 py-2 text-right">Hours</th>
                                <th className="px-3 py-2 text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {myTicketLogs.map((log: any) => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{new Date(log.date).toLocaleDateString()}</td>
                                  <td className="px-3 py-2 text-gray-600">{log.description}</td>
                                  <td className="px-3 py-2 text-right font-mono font-medium text-gray-800">{log.hours}h</td>
                                  <td className="px-3 py-2 text-right">{statusBadge(log.status)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-xs text-gray-400 italic">No hours logged for this ticket yet.</p>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Datos fiscales */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Datos fiscales</h3>
        <p className="text-xs text-gray-500 mb-4">
          Necesarios para tu 1099-NEC. Se guardan cifrados — nunca se muestran completos una vez guardados.
        </p>
        {taxProfile?.tinLast4 && (
          <p className="text-sm text-gray-700 mb-3">
            TIN actual: termina en <span className="font-mono">••••{taxProfile.tinLast4}</span>
            {taxProfile.w9SubmittedAt && <> — actualizado el {new Date(taxProfile.w9SubmittedAt).toLocaleDateString()}</>}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <input className="border border-gray-300 rounded-lg p-2 text-sm col-span-2" placeholder="Nombre legal"
            value={taxForm.legalName} onChange={e => setTaxForm(f => ({ ...f, legalName: e.target.value }))} />
          <input className="border border-gray-300 rounded-lg p-2 text-sm" type="password"
            placeholder={taxProfile?.tinLast4 ? `Reemplazar TIN (termina en ${taxProfile.tinLast4})` : 'TIN (SSN o EIN, 9 dígitos)'}
            value={taxForm.tin} onChange={e => setTaxForm(f => ({ ...f, tin: e.target.value }))} />
          <select className="border border-gray-300 rounded-lg p-2 text-sm"
            value={taxForm.tinType} onChange={e => setTaxForm(f => ({ ...f, tinType: e.target.value }))}>
            <option value="SSN">SSN</option>
            <option value="EIN">EIN</option>
          </select>
          <input className="border border-gray-300 rounded-lg p-2 text-sm col-span-2" placeholder="Dirección"
            value={taxForm.line1} onChange={e => setTaxForm(f => ({ ...f, line1: e.target.value }))} />
          <input className="border border-gray-300 rounded-lg p-2 text-sm" placeholder="Ciudad"
            value={taxForm.city} onChange={e => setTaxForm(f => ({ ...f, city: e.target.value }))} />
          <input className="border border-gray-300 rounded-lg p-2 text-sm" placeholder="Estado"
            value={taxForm.state} onChange={e => setTaxForm(f => ({ ...f, state: e.target.value }))} />
          <input className="border border-gray-300 rounded-lg p-2 text-sm" placeholder="Zip"
            value={taxForm.zip} onChange={e => setTaxForm(f => ({ ...f, zip: e.target.value }))} />
        </div>
        {taxError && <p className="text-xs text-red-600 mt-2">{taxError}</p>}
        <button
          onClick={submitTaxProfile}
          disabled={taxSaving}
          className="mt-4 bg-gray-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {taxSaving ? 'Guardando…' : 'Guardar datos fiscales'}
        </button>
      </div>

      {/* New Task Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Plus size={18} className="text-indigo-600" /> New Task
              </h3>
              <button onClick={() => setShowNewTaskModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                  placeholder="Task description..."
                  value={newTaskForm.title}
                  onChange={e => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Hours</label>
                <input
                  type="number"
                  min="0" step="0.5"
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                  placeholder="0"
                  value={newTaskForm.estimatedHours || ''}
                  onChange={e => setNewTaskForm({ ...newTaskForm, estimatedHours: Number(e.target.value) })}
                />
              </div>

              <div className="border-t border-dashed border-gray-200 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
                  <Clock size={12} /> Log initial hours (optional — will be submitted for approval)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                      value={newTaskForm.logDate}
                      onChange={e => setNewTaskForm({ ...newTaskForm, logDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
                    <input
                      type="number"
                      min="0" step="0.25"
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                      placeholder="0.0"
                      value={newTaskForm.hoursToLog || ''}
                      onChange={e => setNewTaskForm({ ...newTaskForm, hoursToLog: Number(e.target.value) })}
                    />
                  </div>
                </div>
                {newTaskForm.hoursToLog > 0 && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">What did you work on? <span className="text-red-500">*</span></label>
                    <textarea
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-100 outline-none"
                      rows={2}
                      placeholder="Briefly describe the work done..."
                      value={newTaskForm.logDescription}
                      onChange={e => setNewTaskForm({ ...newTaskForm, logDescription: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowNewTaskModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
              <button
                onClick={handleCreateTask}
                disabled={!newTaskForm.title.trim() || (newTaskForm.hoursToLog > 0 && !newTaskForm.logDescription.trim())}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Ticket Modal */}
      {showOpenTicketModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><LifeBuoy size={18} className="text-orange-600" /> Open Support Ticket</h3>
              <button onClick={() => setShowOpenTicketModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {/* Row 1: Date + Priority + Estimated Hours */}
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
              {/* Row 2: Area + Executed By */}
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
                    value={ticketForm.reportedBy || currentUser.name}
                    onChange={e => setTicketForm({ ...ticketForm, reportedBy: e.target.value })}
                  >
                    <option value="">— Select consultant —</option>
                    {users.filter(u => u.role === 'consultant' || u.role === 'admin').map(u => (
                      <option key={u.id} value={u.name}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Row 3: Request description (title) */}
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
              {/* Row 4: Detail */}
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
              {/* Row 5: Out of scope / solution */}
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
              <button onClick={() => setShowOpenTicketModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
              <button
                onClick={handleOpenTicket}
                disabled={!ticketForm.title.trim() || !ticketForm.area.trim() || !ticketForm.reportedBy}
                className="px-6 py-2 bg-orange-600 text-white rounded-lg font-semibold text-sm hover:bg-orange-700 disabled:opacity-50"
              >
                Open Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Hours to Ticket Modal */}
      {showTicketHoursModal && ticketForHours && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Clock size={18} className="text-blue-600" /> Log Hours</h3>
                <p className="text-xs text-gray-500 mt-0.5">Ticket: {ticketForHours.title}</p>
              </div>
              <button onClick={() => { setShowTicketHoursModal(false); setTicketForHours(null); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">What did you do?</label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                  rows={3}
                  placeholder="Describe the work done on this ticket..."
                  value={ticketLogForm.description}
                  onChange={e => setTicketLogForm({ ...ticketLogForm, description: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowTicketHoursModal(false); setTicketForHours(null); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
              <button
                onClick={handleLogTicketHours}
                disabled={ticketLogForm.hours <= 0 || !ticketLogForm.description.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Submit Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtask Modal (Consultant) */}
      {showSubtaskModal && selectedTaskForSubtasks && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <CheckSquare size={18} className="text-blue-600" /> Phase Steps
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">{selectedTaskForSubtasks.title}</p>
              </div>
              <button onClick={() => { setShowSubtaskModal(false); setSubtaskLogTarget(null); setExpandedSubtaskId(null); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Subtask list — scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {selectedTaskForSubtasks.subtasks && selectedTaskForSubtasks.subtasks.length > 0 ? (
                selectedTaskForSubtasks.subtasks.map(subtask => {
                  const subtaskLogs = (selectedProject?.timeLogs || []).filter((l: any) => l.subtaskId === subtask.id);
                  const totalHours = subtaskLogs.reduce((s: number, l: any) => s + l.hours, 0);
                  const isExpanded = expandedSubtaskId === subtask.id;
                  const isLogging = subtaskLogTarget?.subtaskId === subtask.id;

                  return (
                    <div key={subtask.id} className="border border-gray-200 rounded-xl overflow-hidden">

                      {/* Main row */}
                      <div className="p-3 flex items-start gap-3">
                        <button
                          onClick={() => toggleSubtask(subtask.id)}
                          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition ${subtask.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent hover:border-blue-400'}`}
                        >
                          <CheckCircle size={12} fill="currentColor" />
                        </button>

                        <div className="flex-1 min-w-0">
                          {/* Title row */}
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm font-medium ${subtask.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                              {subtask.title}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              {totalHours > 0 && (
                                <span className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                                  {totalHours}h logged
                                </span>
                              )}
                              <button
                                onClick={() => setExpandedSubtaskId(isExpanded ? null : subtask.id)}
                                className="text-gray-400 hover:text-gray-600 p-0.5"
                                title={isExpanded ? 'Collapse' : 'Show logs'}
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            </div>
                          </div>

                          {/* Session instructions (comment from PM) */}
                          {subtask.comment && (
                            <div className="flex items-start gap-1.5 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                              <AlertCircle size={11} className="text-amber-500 mt-0.5 shrink-0" />
                              <span className="text-[11px] text-amber-800">{subtask.comment}</span>
                            </div>
                          )}

                          {/* Assignees + Log Hours row */}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <Users size={11} className="text-gray-400 shrink-0" />
                            {(subtask.assignees || []).length === 0 && (
                              <span className="text-[11px] text-gray-400 italic">No assignees</span>
                            )}
                            {(subtask.assignees || []).map(name => (
                              <span
                                key={name}
                                onClick={() => handleToggleSubtaskAssignee(selectedTaskForSubtasks.id, subtask.id, name)}
                                className="inline-flex items-center gap-1 text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full cursor-pointer hover:bg-red-100 hover:text-red-600 border border-purple-200 hover:border-red-200 transition"
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
                              <option value="">+ Add</option>
                              {(selectedProject?.team || [])
                                .filter(name => !(subtask.assignees || []).includes(name))
                                .map(name => (
                                  <option key={name} value={name}>{name}</option>
                                ))
                              }
                            </select>

                            <button
                              onClick={() => {
                                setSubtaskLogTarget(isLogging ? null : { taskId: selectedTaskForSubtasks.id, subtaskId: subtask.id });
                                setSubtaskLogForm({ hours: 0, date: new Date().toISOString().split('T')[0], description: '' });
                              }}
                              className="ml-auto text-[11px] bg-blue-50 text-blue-600 border border-blue-200 px-2.5 py-0.5 rounded-full hover:bg-blue-100 flex items-center gap-1 font-medium"
                            >
                              <Plus size={10} /> Log Hours
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Inline log form */}
                      {isLogging && (
                        <div className="px-4 pb-3 bg-blue-50 border-t border-blue-100">
                          <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide pt-2 pb-1.5">
                            Log hours — {currentUser.name}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="date"
                              className="border border-blue-200 rounded-lg p-2 text-xs outline-none bg-white"
                              value={subtaskLogForm.date}
                              onChange={e => setSubtaskLogForm({ ...subtaskLogForm, date: e.target.value })}
                            />
                            <input
                              type="number"
                              min="0.25" step="0.25"
                              placeholder="Hours"
                              className="border border-blue-200 rounded-lg p-2 text-xs outline-none bg-white"
                              value={subtaskLogForm.hours || ''}
                              onChange={e => setSubtaskLogForm({ ...subtaskLogForm, hours: Number(e.target.value) })}
                            />
                            <div className="flex gap-1">
                              <input
                                type="text"
                                placeholder="Description"
                                className="flex-1 border border-blue-200 rounded-lg p-2 text-xs outline-none bg-white min-w-0"
                                value={subtaskLogForm.description}
                                onChange={e => setSubtaskLogForm({ ...subtaskLogForm, description: e.target.value })}
                              />
                              <button
                                onClick={() => handleLogSubtaskHours(selectedTaskForSubtasks.id, subtask.id)}
                                disabled={subtaskLogForm.hours <= 0}
                                className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 shrink-0"
                              >
                                Save
                              </button>
                              <button onClick={() => setSubtaskLogTarget(null)} className="px-2 py-1 text-gray-400 hover:text-gray-600 rounded-lg shrink-0">
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Expanded logs table */}
                      {isExpanded && subtaskLogs.length > 0 && (
                        <div className="border-t border-gray-100">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-500">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">Date</th>
                                <th className="px-3 py-2 text-left font-medium">Consultant</th>
                                <th className="px-3 py-2 text-left font-medium">Description</th>
                                <th className="px-3 py-2 text-right font-medium">Hours</th>
                                <th className="px-3 py-2 text-center font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {subtaskLogs.map((log: any) => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{new Date(log.date).toLocaleDateString()}</td>
                                  <td className="px-3 py-2 text-gray-700 font-medium">{log.consultantName}</td>
                                  <td className="px-3 py-2 text-gray-400 italic max-w-[180px] truncate">{log.description || '—'}</td>
                                  <td className="px-3 py-2 text-right font-bold text-gray-800">{log.hours}h</td>
                                  <td className="px-3 py-2 text-center">{statusBadge(log.status)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {isExpanded && subtaskLogs.length === 0 && (
                        <div className="px-4 pb-3 border-t border-gray-50">
                          <p className="text-xs text-gray-400 italic pt-2">No hours logged on this step yet.</p>
                        </div>
                      )}
                    </div>
                  );
                })
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

      {/* Log Time Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
             <div className="p-6 border-b border-gray-100">
               <h3 className="text-lg font-bold text-gray-900">Log Hours</h3>
               <p className="text-sm text-gray-500">
                 Task: {(selectedProject?.tasks || []).find(t => t.id === selectedTaskId)?.title}
               </p>
             </div>
             
             <form onSubmit={handleSubmitLog} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                      <div className="relative">
                        <Calendar size={16} className="absolute left-3 top-3 text-gray-400" />
                        <input 
                           type="date" 
                           required
                           className="w-full border border-gray-300 rounded-lg pl-9 p-2.5 text-sm"
                           value={logForm.date}
                           onChange={e => setLogForm({...logForm, date: e.target.value})}
                        />
                      </div>
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
                      <div className="relative">
                        <Clock size={16} className="absolute left-3 top-3 text-gray-400" />
                        <input 
                           type="number" 
                           required
                           min="0.25" step="0.25"
                           className="w-full border border-gray-300 rounded-lg pl-9 p-2.5 text-sm"
                           placeholder="0.0"
                           value={logForm.hours}
                           onChange={e => setLogForm({...logForm, hours: Number(e.target.value)})}
                        />
                      </div>
                   </div>
                </div>

                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Description of Work</label>
                   <textarea 
                      required
                      className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                      rows={3}
                      placeholder="What did you accomplish?"
                      value={logForm.description}
                      onChange={e => setLogForm({...logForm, description: e.target.value})}
                   />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                   <button 
                     type="button" 
                     onClick={() => setShowLogModal(false)}
                     className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm transition"
                   >
                     Cancel
                   </button>
                   <button 
                     type="submit" 
                     className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition"
                   >
                     Submit Log
                   </button>
                </div>
             </form>
           </div>
        </div>
      )}
    </div>
  );
};
