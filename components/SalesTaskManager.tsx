
import React, { useState, useMemo } from 'react';
import { Lead, Task, User, SubTask } from '../types';
import { CheckCircle2, Circle, Calendar, User as UserIcon, Search, Filter, Plus, Briefcase, Mail, Phone, MessageSquare, ArrowUpRight, Clock, CheckSquare, List, X, Trash2, CheckCircle } from 'lucide-react';

interface SalesTaskManagerProps {
  leads: Lead[];
  users: User[];
  updateLead: (lead: Lead) => void;
}

export const SalesTaskManager: React.FC<SalesTaskManagerProps> = ({ leads, users, updateLead }) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'todo' | 'done'>('todo');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State for New Task
  const [showModal, setShowModal] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({
      title: '',
      leadId: '',
      assignee: '',
      dueDate: new Date().toISOString().split('T')[0],
      priority: 'medium' as 'low' | 'medium' | 'high',
      type: 'todo' as 'call' | 'email' | 'meeting' | 'todo'
  });

  // Modal State for Subtasks (To-Do List)
  const [showSubtaskModal, setShowSubtaskModal] = useState(false);
  const [selectedTaskForSubtasks, setSelectedTaskForSubtasks] = useState<{ task: Task, leadId: string } | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Aggregated Tasks Logic
  const allTasks = useMemo(() => {
      const tasks: (Task & { leadName: string, leadId: string, leadStage: string })[] = [];
      leads.forEach(lead => {
          if (lead.tasks && lead.tasks.length > 0) {
              lead.tasks.forEach(task => {
                  tasks.push({
                      ...task,
                      leadName: lead.companyName,
                      leadId: lead.id,
                      leadStage: lead.stage
                  });
              });
          }
      });
      return tasks.sort((a, b) => new Date(a.dueDate || '').getTime() - new Date(b.dueDate || '').getTime());
  }, [leads]);

  const filteredTasks = allTasks.filter(task => {
      const matchesStatus = filterStatus === 'all' 
          ? true 
          : filterStatus === 'done' ? task.status === 'done' : task.status !== 'done';
      const matchesAssignee = filterAssignee === 'all' || task.assignee === filterAssignee;
      const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            task.leadName.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesStatus && matchesAssignee && matchesSearch;
  });

  const handleToggleStatus = (leadId: string, taskId: string, currentStatus: string) => {
      const lead = leads.find(l => l.id === leadId);
      if (!lead) return;

      const newStatus = currentStatus === 'done' ? 'todo' : 'done';
      const updatedTasks = lead.tasks.map(t => t.id === taskId ? { ...t, status: newStatus as 'todo'|'done' } : t);
      
      updateLead({ ...lead, tasks: updatedTasks });
  };

  const handleAddTask = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTaskForm.leadId || !newTaskForm.title) return;

      const lead = leads.find(l => l.id === newTaskForm.leadId);
      if (!lead) return;

      const newTask: Task = {
          id: `tsk_sales_${Date.now()}`,
          title: newTaskForm.title,
          assignee: newTaskForm.assignee || 'Unassigned',
          status: 'todo',
          estimatedHours: 0,
          loggedHours: 0,
          dueDate: newTaskForm.dueDate,
          priority: newTaskForm.priority,
          type: newTaskForm.type,
          subtasks: []
      };

      updateLead({
          ...lead,
          tasks: [...(lead.tasks || []), newTask]
      });

      setShowModal(false);
      setNewTaskForm({
          title: '',
          leadId: '',
          assignee: '',
          dueDate: new Date().toISOString().split('T')[0],
          priority: 'medium',
          type: 'todo'
      });
  };

  // --- SUBTASK HANDLERS ---

  const openSubtaskModal = (task: Task, leadId: string) => {
      setSelectedTaskForSubtasks({ task, leadId });
      setShowSubtaskModal(true);
      setNewSubtaskTitle('');
  };

  const handleAddSubtask = () => {
      if (!selectedTaskForSubtasks || !newSubtaskTitle.trim()) return;
      const { leadId, task } = selectedTaskForSubtasks;
      
      const lead = leads.find(l => l.id === leadId);
      if (!lead) return;

      const newSubtask: SubTask = {
          id: `st_${Date.now()}`,
          title: newSubtaskTitle,
          completed: false
      };

      const updatedTasks = lead.tasks.map(t => {
          if (t.id === task.id) {
              return { ...t, subtasks: [...(t.subtasks || []), newSubtask] };
          }
          return t;
      });

      updateLead({ ...lead, tasks: updatedTasks });
      
      // Update local state to show changes immediately in modal
      const updatedTask = updatedTasks.find(t => t.id === task.id);
      if (updatedTask) setSelectedTaskForSubtasks({ leadId, task: updatedTask });
      
      setNewSubtaskTitle('');
  };

  const handleToggleSubtask = (subtaskId: string) => {
      if (!selectedTaskForSubtasks) return;
      const { leadId, task } = selectedTaskForSubtasks;

      const lead = leads.find(l => l.id === leadId);
      if (!lead) return;

      const updatedTasks = lead.tasks.map(t => {
          if (t.id === task.id) {
              const updatedSubtasks = t.subtasks.map(st => 
                  st.id === subtaskId ? { ...st, completed: !st.completed } : st
              );
              return { ...t, subtasks: updatedSubtasks };
          }
          return t;
      });

      updateLead({ ...lead, tasks: updatedTasks });

      // Update local state
      const updatedTask = updatedTasks.find(t => t.id === task.id);
      if (updatedTask) setSelectedTaskForSubtasks({ leadId, task: updatedTask });
  };

  const handleDeleteSubtask = (subtaskId: string) => {
      if (!selectedTaskForSubtasks) return;
      const { leadId, task } = selectedTaskForSubtasks;

      const lead = leads.find(l => l.id === leadId);
      if (!lead) return;

      const updatedTasks = lead.tasks.map(t => {
          if (t.id === task.id) {
              return { ...t, subtasks: t.subtasks.filter(st => st.id !== subtaskId) };
          }
          return t;
      });

      updateLead({ ...lead, tasks: updatedTasks });

      // Update local state
      const updatedTask = updatedTasks.find(t => t.id === task.id);
      if (updatedTask) setSelectedTaskForSubtasks({ leadId, task: updatedTask });
  };


  const getTypeIcon = (type?: string) => {
      switch(type) {
          case 'call': return <Phone size={14} className="text-green-600" />;
          case 'email': return <Mail size={14} className="text-blue-600" />;
          case 'meeting': return <Calendar size={14} className="text-purple-600" />;
          default: return <CheckSquare size={14} className="text-gray-600" />;
      }
  };

  const getPriorityColor = (priority?: string) => {
      switch(priority) {
          case 'high': return 'bg-red-100 text-red-700 border-red-200';
          case 'low': return 'bg-gray-100 text-gray-700 border-gray-200';
          default: return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="text-blue-600" /> Sales Tasks
          </h1>
          <p className="text-gray-500 text-sm">Global view of all follow-ups and to-dos across opportunities.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 shadow-sm"
        >
          <Plus size={18} /> New Task
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
              <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
              <input 
                  type="text" 
                  placeholder="Search tasks or leads..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
              />
          </div>
          
          <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-400" />
              <select 
                  className="border border-gray-300 rounded-lg p-2 text-sm bg-white focus:outline-none"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
              >
                  <option value="todo">Pending</option>
                  <option value="done">Completed</option>
                  <option value="all">All Status</option>
              </select>
          </div>

          <div className="flex items-center gap-2">
              <UserIcon size={16} className="text-gray-400" />
              <select 
                  className="border border-gray-300 rounded-lg p-2 text-sm bg-white focus:outline-none"
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
              >
                  <option value="all">All Assignees</option>
                  {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
          </div>
      </div>

      {/* Task List */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-1">
              {filteredTasks.length > 0 ? (
                  <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[560px]">
                      <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10 border-b border-gray-100">
                          <tr>
                              <th className="px-6 py-3 w-10"></th>
                              <th className="px-6 py-3 font-medium">Task / Activity</th>
                              <th className="px-6 py-3 font-medium">Related Opportunity</th>
                              <th className="px-6 py-3 font-medium">Due Date</th>
                              <th className="px-6 py-3 font-medium">Assignee</th>
                              <th className="px-6 py-3 font-medium">Priority</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                          {filteredTasks.map(task => {
                              const isOverdue = task.dueDate && task.dueDate < today && task.status !== 'done';
                              const subtasks = task.subtasks || [];
                              const completedSubtasks = subtasks.filter(st => st.completed).length;
                              const totalSubtasks = subtasks.length;

                              return (
                                  <tr key={`${task.leadId}_${task.id}`} className={`hover:bg-gray-50 transition group ${task.status === 'done' ? 'bg-gray-50/50' : ''}`}>
                                      <td className="px-6 py-4 text-center">
                                          <button 
                                              onClick={() => handleToggleStatus(task.leadId, task.id, task.status)}
                                              className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                                                  task.status === 'done' 
                                                      ? 'bg-green-500 border-green-500 text-white' 
                                                      : 'border-gray-300 text-transparent hover:border-blue-500'
                                              }`}
                                          >
                                              <CheckCircle2 size={14} fill="currentColor" />
                                          </button>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className={`font-medium text-gray-900 flex items-center gap-2 ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                                              {getTypeIcon(task.type)}
                                              {task.title}
                                          </div>
                                          {/* Subtask Button */}
                                          <div className="mt-1">
                                              <button 
                                                onClick={() => openSubtaskModal(task, task.leadId)}
                                                className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border transition ${
                                                    totalSubtasks > 0 
                                                        ? 'bg-gray-100 text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600' 
                                                        : 'text-gray-400 border-transparent hover:bg-gray-100'
                                                }`}
                                              >
                                                  <List size={12} />
                                                  {totalSubtasks > 0 ? (
                                                      <span>To-Do: {completedSubtasks}/{totalSubtasks}</span>
                                                  ) : (
                                                      <span className="opacity-0 group-hover:opacity-100">Add To-Do List</span>
                                                  )}
                                              </button>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="flex flex-col">
                                              <span className="font-medium text-blue-600 hover:underline cursor-pointer flex items-center gap-1">
                                                  <Briefcase size={12} /> {task.leadName}
                                              </span>
                                              <span className="text-xs text-gray-400 capitalize bg-gray-100 px-1.5 rounded w-fit mt-0.5">
                                                  {task.leadStage}
                                              </span>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className={`flex items-center gap-1.5 ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                              <Calendar size={14} />
                                              {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No date'}
                                              {isOverdue && <span className="text-[10px] bg-red-100 px-1 rounded">LATE</span>}
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <div className="flex items-center gap-2">
                                              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                                                  {task.assignee.charAt(0)}
                                              </div>
                                              <span className="text-gray-600">{task.assignee}</span>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4">
                                          <span className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(task.priority)} capitalize`}>
                                              {task.priority || 'medium'}
                                          </span>
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
                  </div>
              ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                      <CheckSquare size={48} className="mb-4 opacity-20" />
                      <p>No tasks found matching your filters.</p>
                  </div>
              )}
          </div>
      </div>

      {/* Add Task Modal */}
      {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
              <div className="bg-white rounded-t-2xl md:rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Create Sales Task</h3>
                  <form onSubmit={handleAddTask} className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Related Opportunity</label>
                          <select 
                              required
                              className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                              value={newTaskForm.leadId}
                              onChange={(e) => setNewTaskForm({...newTaskForm, leadId: e.target.value})}
                          >
                              <option value="">-- Select Lead --</option>
                              {leads.filter(l => l.stage !== 'closed-lost' && l.stage !== 'closed-won').map(l => (
                                  <option key={l.id} value={l.id}>{l.companyName}</option>
                              ))}
                          </select>
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Task / Activity</label>
                          <input 
                              required
                              type="text" 
                              className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                              placeholder="e.g. Follow up call regarding proposal"
                              value={newTaskForm.title}
                              onChange={(e) => setNewTaskForm({...newTaskForm, title: e.target.value})}
                          />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                              <select 
                                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                                  value={newTaskForm.type}
                                  onChange={(e) => setNewTaskForm({...newTaskForm, type: e.target.value as any})}
                              >
                                  <option value="todo">To Do</option>
                                  <option value="call">Call</option>
                                  <option value="email">Email</option>
                                  <option value="meeting">Meeting</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                              <select 
                                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                                  value={newTaskForm.priority}
                                  onChange={(e) => setNewTaskForm({...newTaskForm, priority: e.target.value as any})}
                              >
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                              </select>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                              <input 
                                  required
                                  type="date" 
                                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                                  value={newTaskForm.dueDate}
                                  onChange={(e) => setNewTaskForm({...newTaskForm, dueDate: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
                              <select 
                                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                                  value={newTaskForm.assignee}
                                  onChange={(e) => setNewTaskForm({...newTaskForm, assignee: e.target.value})}
                              >
                                  <option value="">Unassigned</option>
                                  {users.map(u => (
                                      <option key={u.id} value={u.name}>{u.name}</option>
                                  ))}
                              </select>
                          </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                          <button 
                              type="button" 
                              onClick={() => setShowModal(false)}
                              className="px-4 py-2 text-gray-600 text-sm"
                          >
                              Cancel
                          </button>
                          <button 
                              type="submit" 
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                          >
                              Create Task
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Subtask / To-Do List Modal */}
      {showSubtaskModal && selectedTaskForSubtasks && (
          <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
              <div className="bg-white rounded-t-2xl md:rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">Task To-Do List</h3>
                        <p className="text-xs text-gray-500">{selectedTaskForSubtasks.task.title}</p>
                      </div>
                      <button onClick={() => setShowSubtaskModal(false)} className="text-gray-400 hover:text-gray-600">
                          <X size={20} />
                      </button>
                  </div>
                  <div className="p-6">
                      <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto">
                          {selectedTaskForSubtasks.task.subtasks && selectedTaskForSubtasks.task.subtasks.length > 0 ? (
                              selectedTaskForSubtasks.task.subtasks.map(subtask => (
                                  <div key={subtask.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded border border-transparent hover:border-gray-100 transition group">
                                      <button 
                                          onClick={() => handleToggleSubtask(subtask.id)}
                                          className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition ${subtask.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent hover:border-blue-400'}`}
                                      >
                                          <CheckCircle size={12} fill="currentColor" />
                                      </button>
                                      <span className={`text-sm flex-1 ${subtask.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                          {subtask.title}
                                      </span>
                                      <button 
                                          onClick={() => handleDeleteSubtask(subtask.id)}
                                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                                      >
                                          <Trash2 size={14} />
                                      </button>
                                  </div>
                              ))
                          ) : (
                              <p className="text-sm text-gray-400 italic text-center py-4">No checklist items yet.</p>
                          )}
                      </div>
                      <div className="flex gap-2 border-t pt-4">
                          <input 
                              type="text" 
                              className="flex-1 border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                              placeholder="Add a check item..."
                              value={newSubtaskTitle}
                              onChange={(e) => setNewSubtaskTitle(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
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
    </div>
  );
};
