import React, { useState } from 'react';
import { Project, ManufacturerTicket, ManufacturerTicketNote, ManufacturerTicketStatus, ManufacturerTicketCategory, TicketPriority } from '../types';
import { Plus, ChevronDown, ChevronRight, X, Edit2, Save, Trash2, MessageSquare, Factory, Check } from 'lucide-react';

interface Props {
  project: Project;
  updateProject: (project: Project) => void;
}

const STATUS_LABELS: Record<ManufacturerTicketStatus, { label: string; cls: string }> = {
  'open':           { label: 'Abierto',          cls: 'bg-blue-100 text-blue-700' },
  'in-progress':    { label: 'En progreso',       cls: 'bg-indigo-100 text-indigo-700' },
  'waiting-vendor': { label: 'Esperando vendor',  cls: 'bg-yellow-100 text-yellow-700' },
  'waiting-us':     { label: 'Esperando nosotros',cls: 'bg-orange-100 text-orange-700' },
  'resolved':       { label: 'Resuelto',          cls: 'bg-green-100 text-green-700' },
  'closed':         { label: 'Cerrado',           cls: 'bg-gray-100 text-gray-600' },
};

const PRIORITY_LABELS: Record<TicketPriority, { label: string; cls: string }> = {
  low:      { label: 'Baja',     cls: 'bg-gray-100 text-gray-600' },
  medium:   { label: 'Media',    cls: 'bg-yellow-100 text-yellow-700' },
  high:     { label: 'Alta',     cls: 'bg-orange-100 text-orange-700' },
  critical: { label: 'Crítica',  cls: 'bg-red-100 text-red-700' },
};

const CATEGORY_LABELS: Record<ManufacturerTicketCategory, string> = {
  'bug':             'Bug / Error',
  'feature-request': 'Solicitud de feature',
  'installation':    'Instalación',
  'performance':     'Performance',
  'other':           'Otro',
};

const EMPTY_FORM = {
  title: '',
  description: '',
  caseNumber: '',
  manufacturer: '',
  openedDate: new Date().toISOString().split('T')[0],
  status: 'open' as ManufacturerTicketStatus,
  priority: 'medium' as TicketPriority,
  category: 'bug' as ManufacturerTicketCategory,
  resolution: '',
};

export const ManufacturerTickets: React.FC<Props> = ({ project, updateProject }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [noteText, setNoteText] = useState('');
  const [noteAuthor, setNoteAuthor] = useState('');
  const [addingNoteFor, setAddingNoteFor] = useState<string | null>(null);

  const tickets = project.manufacturerTickets || [];

  const save = (updated: ManufacturerTicket[]) =>
    updateProject({ ...project, manufacturerTickets: updated });

  const handleCreate = () => {
    if (!form.title.trim()) return;
    const ticket: ManufacturerTicket = {
      id: crypto.randomUUID(),
      title: form.title,
      description: form.description,
      caseNumber: form.caseNumber,
      manufacturer: form.manufacturer,
      openedDate: form.openedDate,
      status: form.status,
      priority: form.priority,
      category: form.category,
      notes: [],
      resolution: form.resolution || undefined,
      createdAt: new Date().toISOString(),
    };
    save([...tickets, ticket]);
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  const handleUpdate = (id: string) => {
    save(tickets.map(t => t.id === id ? {
      ...t,
      title: form.title,
      description: form.description,
      caseNumber: form.caseNumber,
      manufacturer: form.manufacturer,
      openedDate: form.openedDate,
      status: form.status,
      priority: form.priority,
      category: form.category,
      resolution: form.resolution || undefined,
      resolvedDate: (form.status === 'resolved' || form.status === 'closed') && !t.resolvedDate
        ? new Date().toISOString().split('T')[0]
        : t.resolvedDate,
    } : t));
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    save(tickets.filter(t => t.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const startEdit = (ticket: ManufacturerTicket) => {
    setForm({
      title: ticket.title,
      description: ticket.description,
      caseNumber: ticket.caseNumber,
      manufacturer: ticket.manufacturer,
      openedDate: ticket.openedDate,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      resolution: ticket.resolution || '',
    });
    setEditingId(ticket.id);
    setExpandedId(ticket.id);
  };

  const handleAddNote = (ticketId: string) => {
    if (!noteText.trim()) return;
    const note: ManufacturerTicketNote = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      author: noteAuthor.trim() || 'Admin',
      text: noteText.trim(),
    };
    save(tickets.map(t => t.id === ticketId ? { ...t, notes: [...t.notes, note] } : t));
    setNoteText('');
    setNoteAuthor('');
    setAddingNoteFor(null);
  };

  const handleDeleteNote = (ticketId: string, noteId: string) => {
    save(tickets.map(t => t.id === ticketId ? { ...t, notes: t.notes.filter(n => n.id !== noteId) } : t));
  };

  const openCount = tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed').length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-purple-200 overflow-hidden mb-6">
      {/* Header */}
      <div className="p-4 border-b border-purple-100 bg-purple-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Factory size={16} className="text-purple-600" />
          <h3 className="font-semibold text-purple-900">Tickets con Fabricante</h3>
          <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full font-medium">
            {tickets.length} total
          </span>
          {openCount > 0 && (
            <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
              {openCount} abiertos
            </span>
          )}
        </div>
        {project.status !== 'completed' && (
          <button
            onClick={() => { setShowForm(true); setForm(EMPTY_FORM); setEditingId(null); }}
            className="flex items-center gap-1.5 text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 font-medium"
          >
            <Plus size={14} /> Nuevo Ticket
          </button>
        )}
      </div>

      {/* New Ticket Form */}
      {showForm && (
        <div className="p-4 bg-purple-50 border-b border-purple-100">
          <TicketForm
            form={form}
            setForm={setForm}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            submitLabel="Crear ticket"
          />
        </div>
      )}

      {/* Empty state */}
      {tickets.length === 0 && !showForm && (
        <div className="p-10 text-center text-gray-400">
          <Factory size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Sin tickets con el fabricante.</p>
          <p className="text-xs mt-1">Registrá issues, bugs o pedidos abiertos con el vendor.</p>
        </div>
      )}

      {/* Ticket list */}
      {tickets.length > 0 && (
        <div className="divide-y divide-gray-100">
          {[...tickets].sort((a, b) => {
            const s = { open: 0, 'in-progress': 1, 'waiting-vendor': 2, 'waiting-us': 3, resolved: 4, closed: 5 };
            const p = { critical: 0, high: 1, medium: 2, low: 3 };
            if (a.status !== b.status) return s[a.status] - s[b.status];
            return p[a.priority] - p[b.priority];
          }).map(ticket => {
            const expanded = expandedId === ticket.id;
            const editing = editingId === ticket.id;
            const st = STATUS_LABELS[ticket.status];
            const pr = PRIORITY_LABELS[ticket.priority];
            return (
              <div key={ticket.id}>
                {/* Row */}
                <div
                  className="p-4 flex items-start justify-between gap-3 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => setExpandedId(expanded ? null : ticket.id)}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-gray-900 text-sm">{ticket.title}</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${pr.cls}`}>{pr.label}</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                        {ticket.caseNumber && <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">#{ticket.caseNumber}</span>}
                        {ticket.manufacturer && <span>{ticket.manufacturer}</span>}
                        <span>{CATEGORY_LABELS[ticket.category]}</span>
                        <span>Abierto: {new Date(ticket.openedDate).toLocaleDateString('es-AR')}</span>
                        {ticket.notes.length > 0 && (
                          <span className="flex items-center gap-0.5"><MessageSquare size={10} /> {ticket.notes.length}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => startEdit(ticket)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                      title="Editar"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(ticket.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                      title="Eliminar"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div className="px-12 pb-5 bg-gray-50 border-t border-gray-100">
                    {editing ? (
                      <div className="pt-4">
                        <TicketForm
                          form={form}
                          setForm={setForm}
                          onSubmit={() => handleUpdate(ticket.id)}
                          onCancel={() => setEditingId(null)}
                          submitLabel="Guardar cambios"
                        />
                      </div>
                    ) : (
                      <div className="pt-4 space-y-3">
                        {ticket.description && (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
                        )}
                        {ticket.resolution && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <p className="text-xs font-semibold text-green-700 mb-1">Resolución</p>
                            <p className="text-sm text-green-900 whitespace-pre-wrap">{ticket.resolution}</p>
                          </div>
                        )}

                        {/* Notes */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Seguimiento</p>
                          {ticket.notes.length === 0 && (
                            <p className="text-xs text-gray-400 italic">Sin notas.</p>
                          )}
                          <div className="space-y-2">
                            {ticket.notes.map(note => (
                              <div key={note.id} className="bg-white border border-gray-200 rounded-lg p-3 flex justify-between items-start gap-2">
                                <div>
                                  <p className="text-xs text-gray-400 mb-1">
                                    <span className="font-semibold text-gray-600">{note.author}</span> · {new Date(note.date).toLocaleDateString('es-AR')}
                                  </p>
                                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.text}</p>
                                </div>
                                <button
                                  onClick={() => handleDeleteNote(ticket.id, note.id)}
                                  className="text-gray-300 hover:text-red-500 shrink-0"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Add note */}
                          {addingNoteFor === ticket.id ? (
                            <div className="mt-2 space-y-2">
                              <input
                                type="text"
                                className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                                placeholder="Tu nombre"
                                value={noteAuthor}
                                onChange={e => setNoteAuthor(e.target.value)}
                              />
                              <textarea
                                className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                                rows={3}
                                placeholder="Escribí la nota de seguimiento..."
                                value={noteText}
                                onChange={e => setNoteText(e.target.value)}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleAddNote(ticket.id)}
                                  disabled={!noteText.trim()}
                                  className="flex items-center gap-1 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                                >
                                  <Check size={12} /> Agregar
                                </button>
                                <button
                                  onClick={() => { setAddingNoteFor(null); setNoteText(''); setNoteAuthor(''); }}
                                  className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-200"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddingNoteFor(ticket.id)}
                              className="mt-2 flex items-center gap-1 text-xs text-purple-600 hover:underline"
                            >
                              <MessageSquare size={12} /> Agregar nota
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Shared form sub-component ───────────────────────────────────────────────

interface FormProps {
  form: typeof EMPTY_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}

const TicketForm: React.FC<FormProps> = ({ form, setForm, onSubmit, onCancel, submitLabel }) => {
  const f = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Título *</label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            placeholder="Descripción corta del problema"
            value={form.title}
            onChange={f('title')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nro. de caso (vendor)</label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg p-2 text-sm font-mono"
            placeholder="ej. INC-12345"
            value={form.caseNumber}
            onChange={f('caseNumber')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Fabricante</label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            placeholder="ej. Microsoft, SAP..."
            value={form.manufacturer}
            onChange={f('manufacturer')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Fecha apertura</label>
          <input
            type="date"
            className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            value={form.openedDate}
            onChange={f('openedDate')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Categoría</label>
          <select className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white" value={form.category} onChange={f('category')}>
            {(Object.entries(CATEGORY_LABELS) as [ManufacturerTicketCategory, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Prioridad</label>
          <select className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white" value={form.priority} onChange={f('priority')}>
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
          <select className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white" value={form.status} onChange={f('status')}>
            {(Object.entries(STATUS_LABELS) as [ManufacturerTicketStatus, { label: string; cls: string }][]).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
        <textarea
          className="w-full border border-gray-300 rounded-lg p-2 text-sm"
          rows={3}
          placeholder="Detallá el problema reportado al fabricante..."
          value={form.description}
          onChange={f('description')}
        />
      </div>
      {(form.status === 'resolved' || form.status === 'closed') && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Resolución</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            rows={2}
            placeholder="¿Cómo se resolvió?"
            value={form.resolution}
            onChange={f('resolution')}
          />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
          Cancelar
        </button>
        <button
          onClick={onSubmit}
          disabled={!form.title.trim()}
          className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
};
