
import React, { useState } from 'react';
import { TaskTemplate, ProjectType, TemplateItem } from '../types';
import { Plus, Trash2, Save, FileText, Settings, LifeBuoy, Briefcase, ChevronRight, List, Edit2, X, Check, CheckSquare, Copy, Key } from 'lucide-react';

interface TemplateManagerProps {
  templates: TaskTemplate[];
  onAddTemplate: (template: TaskTemplate) => void;
  onUpdateTemplate: (template: TaskTemplate) => void;
  onDeleteTemplate: (id: string) => void;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({ templates, onAddTemplate, onUpdateTemplate, onDeleteTemplate }) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(templates[0]?.id || null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSubtaskModal, setShowSubtaskModal] = useState(false);
  
  // State for new item input
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemHours, setNewItemHours] = useState(2);

  // State for editing item
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemHours, setEditItemHours] = useState(0);

  // State for Subtask management
  const [activeItemForSubtasks, setActiveItemForSubtasks] = useState<TemplateItem | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // State for creating new template
  const [newTemplateForm, setNewTemplateForm] = useState({
    name: '',
    type: 'implementation' as ProjectType,
    description: ''
  });

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const newTemplate: TaskTemplate = {
      id: `tpl_${Date.now()}`,
      name: newTemplateForm.name,
      type: newTemplateForm.type,
      description: newTemplateForm.description,
      items: []
    };
    onAddTemplate(newTemplate);
    setSelectedTemplateId(newTemplate.id);
    setShowCreateModal(false);
    setNewTemplateForm({ name: '', type: 'implementation', description: '' });
  };

  const handleDuplicateTemplate = () => {
    if (!selectedTemplate) return;

    // Create deep copy of items with new IDs
    const newItems = selectedTemplate.items.map((item, index) => ({
      ...item,
      id: `ti_${Date.now()}_${index}`,
      subtasks: [...(item.subtasks || [])]
    }));

    const newTemplate: TaskTemplate = {
      ...selectedTemplate,
      id: `tpl_${Date.now()}`,
      name: `${selectedTemplate.name} (Copy)`,
      items: newItems
    };

    onAddTemplate(newTemplate);
    setSelectedTemplateId(newTemplate.id);
  };

  const handleAddItem = () => {
    if (!selectedTemplate || !newItemTitle.trim()) return;

    const newItem: TemplateItem = {
      id: `ti_${Date.now()}`,
      title: newItemTitle,
      defaultHours: Number(newItemHours),
      subtasks: []
    };

    const updatedTemplate = {
      ...selectedTemplate,
      items: [...selectedTemplate.items, newItem]
    };

    onUpdateTemplate(updatedTemplate);
    setNewItemTitle('');
    setNewItemHours(2);
  };

  const startEditingItem = (item: TemplateItem) => {
    setEditingItemId(item.id);
    setEditItemTitle(item.title);
    setEditItemHours(item.defaultHours);
  };

  const cancelEditingItem = () => {
    setEditingItemId(null);
    setEditItemTitle('');
    setEditItemHours(0);
  };

  const saveEditedItem = () => {
    if (!selectedTemplate || !editingItemId) return;

    const updatedItems = selectedTemplate.items.map(item => 
      item.id === editingItemId 
        ? { ...item, title: editItemTitle, defaultHours: Number(editItemHours) }
        : item
    );

    const updatedTemplate = {
      ...selectedTemplate,
      items: updatedItems
    };

    onUpdateTemplate(updatedTemplate);
    cancelEditingItem();
  };

  const handleDeleteItem = (itemId: string) => {
    if (!selectedTemplate) return;
    if (!window.confirm("Remove this task from the template?")) return;
    
    const updatedTemplate = {
      ...selectedTemplate,
      items: selectedTemplate.items.filter(i => i.id !== itemId)
    };
    onUpdateTemplate(updatedTemplate);
  };

  // Subtask Handlers
  const handleOpenSubtasks = (item: TemplateItem) => {
      setActiveItemForSubtasks(item);
      setShowSubtaskModal(true);
  };

  const handleAddSubtaskToTemplate = () => {
      if (!selectedTemplate || !activeItemForSubtasks || !newSubtaskTitle.trim()) return;

      const updatedItems = selectedTemplate.items.map(item => {
          if (item.id === activeItemForSubtasks.id) {
              return { 
                  ...item, 
                  subtasks: [...(item.subtasks || []), newSubtaskTitle] 
              };
          }
          return item;
      });

      const updatedTemplate = { ...selectedTemplate, items: updatedItems };
      onUpdateTemplate(updatedTemplate);
      
      // Update local state to reflect changes in modal
      const updatedItem = updatedItems.find(i => i.id === activeItemForSubtasks.id);
      if (updatedItem) setActiveItemForSubtasks(updatedItem);
      
      setNewSubtaskTitle('');
  };

  const handleRemoveSubtaskFromTemplate = (indexToRemove: number) => {
      if (!selectedTemplate || !activeItemForSubtasks) return;

      const updatedItems = selectedTemplate.items.map(item => {
          if (item.id === activeItemForSubtasks.id && item.subtasks) {
              return { 
                  ...item, 
                  subtasks: item.subtasks.filter((_, idx) => idx !== indexToRemove)
              };
          }
          return item;
      });

      const updatedTemplate = { ...selectedTemplate, items: updatedItems };
      onUpdateTemplate(updatedTemplate);

      const updatedItem = updatedItems.find(i => i.id === activeItemForSubtasks.id);
      if (updatedItem) setActiveItemForSubtasks(updatedItem);
  };

  const getProjectTypeBadge = (type: ProjectType) => {
    switch(type) {
        case 'implementation': return <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded"><Settings size={10} /> Implementation</span>;
        case 'support': return <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700 px-2 py-0.5 rounded"><LifeBuoy size={10} /> Support</span>;
        case 'license': return <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-purple-100 text-purple-700 px-2 py-0.5 rounded"><Key size={10} /> License</span>;
        default: return <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-700 px-2 py-0.5 rounded"><Briefcase size={10} /> Consulting</span>;
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full gap-0 md:gap-6">
      {/* Sidebar List */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-200 pb-4 md:pb-0 pr-0 md:pr-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">Task Templates</h2>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"
            title="Create New Template"
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {templates.map(tpl => (
            <div 
              key={tpl.id}
              onClick={() => setSelectedTemplateId(tpl.id)}
              className={`p-4 rounded-xl cursor-pointer border transition-all ${
                selectedTemplateId === tpl.id 
                  ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-100' 
                  : 'bg-white border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className={`font-semibold ${selectedTemplateId === tpl.id ? 'text-blue-700' : 'text-gray-800'}`}>
                  {tpl.name}
                </h3>
                {getProjectTypeBadge(tpl.type)}
              </div>
              <p className="text-xs text-gray-500 mb-3 line-clamp-2">{tpl.description || 'No description'}</p>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1"><List size={12} /> {tpl.items.length} Tasks</span>
                <ChevronRight size={14} className={selectedTemplateId === tpl.id ? 'text-blue-500' : 'text-gray-300'} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-white rounded-xl shadow-sm border border-gray-200">
        {selectedTemplate ? (
          <div className="flex flex-col h-full">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  {selectedTemplate.name}
                </h2>
                <p className="text-sm text-gray-500 mt-1">{selectedTemplate.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleDuplicateTemplate}
                  className="text-blue-500 hover:text-blue-700 p-2 hover:bg-blue-50 rounded-lg transition"
                  title="Duplicate Template"
                >
                  <Copy size={18} />
                </button>
                <button 
                  onClick={() => {
                     if(window.confirm('Delete this template?')) onDeleteTemplate(selectedTemplate.id);
                  }}
                  className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition"
                  title="Delete Template"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            {/* Task List */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedTemplate.items.length > 0 ? (
                <div className="space-y-2">
                  {selectedTemplate.items.map((item, index) => (
                    <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg border ${editingItemId === item.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:shadow-sm group'}`}>
                      
                      {editingItemId === item.id ? (
                        // Edit Mode
                        <div className="flex items-center gap-3 w-full">
                           <span className="text-xs font-mono text-gray-400 w-6">{index + 1}.</span>
                           <input 
                              type="text"
                              className="flex-1 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none"
                              value={editItemTitle}
                              onChange={(e) => setEditItemTitle(e.target.value)}
                              autoFocus
                           />
                           <div className="flex items-center gap-1">
                              <input 
                                type="number"
                                className="w-16 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none"
                                min="0.5" step="0.5"
                                value={editItemHours}
                                onChange={(e) => setEditItemHours(Number(e.target.value))}
                              />
                              <span className="text-xs text-gray-500">hrs</span>
                           </div>
                           <div className="flex items-center gap-1 ml-2">
                              <button onClick={saveEditedItem} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200">
                                <Check size={14} />
                              </button>
                              <button onClick={cancelEditingItem} className="p-1.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">
                                <X size={14} />
                              </button>
                           </div>
                        </div>
                      ) : (
                        // View Mode
                        <>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-gray-400 w-6">{index + 1}.</span>
                            <span className="text-gray-800 font-medium">{item.title}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            {item.subtasks && item.subtasks.length > 0 && (
                                <span className="text-xs flex items-center gap-1 text-green-600 bg-green-50 px-2 py-0.5 rounded">
                                    <CheckSquare size={10} /> {item.subtasks.length}
                                </span>
                            )}
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                              {item.defaultHours} hrs
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                <button 
                                  onClick={() => handleOpenSubtasks(item)}
                                  className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                                  title="Manage Subtasks"
                                >
                                  <List size={14} />
                                </button>
                                <button 
                                  onClick={() => startEditingItem(item)}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                  title="Edit Task"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                  title="Remove Task"
                                >
                                  <Trash2 size={14} />
                                </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                  <FileText size={48} className="mb-4" />
                  <p>No tasks defined in this template yet.</p>
                </div>
              )}
            </div>

            {/* Add Task Form */}
            <div className="p-6 border-t border-gray-100 bg-gray-50">
               <h4 className="text-sm font-bold text-gray-700 mb-3">Add Task to Template</h4>
               <div className="flex gap-3">
                 <input 
                   type="text" 
                   className="flex-1 border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                   placeholder="Task title..."
                   value={newItemTitle}
                   onChange={(e) => setNewItemTitle(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                 />
                 <div className="w-24 relative">
                   <input 
                      type="number" 
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                      placeholder="Hrs"
                      min="0.5" step="0.5"
                      value={newItemHours}
                      onChange={(e) => setNewItemHours(Number(e.target.value))}
                   />
                   <span className="absolute right-2 top-2.5 text-xs text-gray-400">hrs</span>
                 </div>
                 <button 
                   onClick={handleAddItem}
                   disabled={!newItemTitle.trim()}
                   className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                 >
                   <Plus size={18} /> Add
                 </button>
               </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            Select a template to view details
          </div>
        )}
      </div>

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl md:rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Template</h2>
            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                <input 
                  required
                  type="text" 
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                  placeholder="e.g. Rapid Implementation"
                  value={newTemplateForm.name}
                  onChange={e => setNewTemplateForm({...newTemplateForm, name: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Type</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white"
                  value={newTemplateForm.type}
                  onChange={e => setNewTemplateForm({...newTemplateForm, type: e.target.value as ProjectType})}
                >
                  <option value="implementation">Implementation</option>
                  <option value="support">Support</option>
                  <option value="consulting">Consulting</option>
                  <option value="license">License</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea 
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                  rows={3}
                  value={newTemplateForm.description}
                  onChange={e => setNewTemplateForm({...newTemplateForm, description: e.target.value})}
                />
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button 
                  type="button" 
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subtask Manager Modal */}
      {showSubtaskModal && activeItemForSubtasks && (
          <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
              <div className="bg-white rounded-t-2xl md:rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">Template Subtasks</h3>
                        <p className="text-xs text-gray-500">{activeItemForSubtasks.title}</p>
                      </div>
                      <button onClick={() => setShowSubtaskModal(false)} className="text-gray-400 hover:text-gray-600">
                          <X size={20} />
                      </button>
                  </div>
                  <div className="p-6">
                      <p className="text-sm text-gray-500 mb-4">
                          Define standard checklist items for this task. These will be copied to every new project using this template.
                      </p>
                      
                      {/* List */}
                      <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto">
                          {activeItemForSubtasks.subtasks && activeItemForSubtasks.subtasks.length > 0 ? (
                              activeItemForSubtasks.subtasks.map((subtask, idx) => (
                                  <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-100 hover:border-gray-200 transition">
                                      <div className="flex items-center gap-3">
                                          <div className="w-5 h-5 rounded border border-gray-300 bg-white" />
                                          <span className="text-sm text-gray-800">{subtask}</span>
                                      </div>
                                      <button 
                                          onClick={() => handleRemoveSubtaskFromTemplate(idx)}
                                          className="text-gray-400 hover:text-red-500 p-1"
                                      >
                                          <Trash2 size={14} />
                                      </button>
                                  </div>
                              ))
                          ) : (
                              <div className="text-center py-6 bg-gray-50 rounded border border-dashed border-gray-200 text-gray-400 text-sm italic">
                                  No subtasks defined.
                              </div>
                          )}
                      </div>

                      {/* Add Input */}
                      <div className="flex gap-2 border-t pt-4">
                          <input 
                              type="text" 
                              className="flex-1 border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                              placeholder="New subtask title..."
                              value={newSubtaskTitle}
                              onChange={(e) => setNewSubtaskTitle(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddSubtaskToTemplate()}
                          />
                          <button 
                              onClick={handleAddSubtaskToTemplate}
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
