import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, Loader2, X, Check, AlertCircle } from 'lucide-react';

type FieldType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'url';

interface CustomFieldDef {
  id: string;
  name: string;
  key: string;
  type: FieldType;
  options?: string[];
  defaultValue?: any;
  required: boolean;
  showInKanban: boolean;
  showInTable: boolean;
  appliesTo: 'all' | 'manufacturer' | 'partner';
  appliesToValue?: string;
  order: number;
  isActive: boolean;
}

interface FormState {
  name: string;
  key: string;
  type: FieldType;
  options: string[];
  newOption: string;
  defaultValue: string;
  required: boolean;
  showInKanban: boolean;
  showInTable: boolean;
  appliesTo: 'all' | 'manufacturer' | 'partner';
  appliesToValue: string;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select (single)' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'url', label: 'URL' },
];

const DEFAULT_EXAMPLES: CustomFieldDef[] = [
  {
    id: 'ex1',
    name: 'Contract Value',
    key: 'contract_value',
    type: 'number',
    required: false,
    showInKanban: true,
    showInTable: true,
    appliesTo: 'all',
    order: 0,
    isActive: true,
  },
  {
    id: 'ex2',
    name: 'Lead Source',
    key: 'lead_source',
    type: 'select',
    options: ['Referral', 'Website', 'Cold Outreach', 'Event'],
    required: false,
    showInKanban: false,
    showInTable: true,
    appliesTo: 'all',
    order: 1,
    isActive: true,
  },
  {
    id: 'ex3',
    name: 'Follow-up Date',
    key: 'follow_up_date',
    type: 'date',
    required: false,
    showInKanban: true,
    showInTable: true,
    appliesTo: 'all',
    order: 2,
    isActive: true,
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

const EMPTY_FORM: FormState = {
  name: '',
  key: '',
  type: 'text',
  options: [],
  newOption: '',
  defaultValue: '',
  required: false,
  showInKanban: false,
  showInTable: true,
  appliesTo: 'all',
  appliesToValue: '',
};

export function CustomFieldsManager() {
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDef | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchFields = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const defs: CustomFieldDef[] = data.customFieldDefinitions || [];
      setFields(defs.sort((a, b) => a.order - b.order));
    } catch (e: any) {
      setError('Failed to load settings: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFields(); }, []);

  const saveFields = async (updated: CustomFieldDef[]) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFieldDefinitions: updated }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFields(updated.sort((a, b) => a.order - b.order));
    } catch (e: any) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setEditingField(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (field: CustomFieldDef) => {
    setEditingField(field);
    setForm({
      name: field.name,
      key: field.key,
      type: field.type,
      options: field.options || [],
      newOption: '',
      defaultValue: field.defaultValue != null ? String(field.defaultValue) : '',
      required: field.required,
      showInKanban: field.showInKanban,
      showInTable: field.showInTable,
      appliesTo: field.appliesTo,
      appliesToValue: field.appliesToValue || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Name is required'); return; }
    if (!form.key.trim()) { alert('Key is required'); return; }
    const newField: CustomFieldDef = {
      id: editingField?.id || `field_${Date.now()}`,
      name: form.name.trim(),
      key: form.key.trim(),
      type: form.type,
      options: (form.type === 'select' || form.type === 'multiselect') ? form.options : undefined,
      defaultValue: form.defaultValue || undefined,
      required: form.required,
      showInKanban: form.showInKanban,
      showInTable: form.showInTable,
      appliesTo: form.appliesTo,
      appliesToValue: form.appliesTo !== 'all' ? form.appliesToValue : undefined,
      order: editingField?.order ?? fields.length,
      isActive: editingField?.isActive ?? true,
    };
    let updated: CustomFieldDef[];
    if (editingField) {
      updated = fields.map((f) => (f.id === editingField.id ? newField : f));
    } else {
      updated = [...fields, newField];
    }
    await saveFields(updated);
    setModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    const updated = fields.filter((f) => f.id !== id).map((f, i) => ({ ...f, order: i }));
    await saveFields(updated);
    setDeleteConfirm(null);
  };

  const handleToggleActive = async (id: string) => {
    const updated = fields.map((f) => (f.id === id ? { ...f, isActive: !f.isActive } : f));
    await saveFields(updated);
  };

  const handleMove = async (id: string, dir: 'up' | 'down') => {
    const idx = fields.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const newFields = [...fields];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= newFields.length) return;
    [newFields[idx], newFields[swap]] = [newFields[swap], newFields[idx]];
    const reordered = newFields.map((f, i) => ({ ...f, order: i }));
    await saveFields(reordered);
  };

  const handleAddDefaults = async () => {
    await saveFields(DEFAULT_EXAMPLES);
  };

  const addOption = () => {
    const opt = form.newOption.trim();
    if (!opt || form.options.includes(opt)) return;
    setForm((f) => ({ ...f, options: [...f.options, opt], newOption: '' }));
  };

  const removeOption = (opt: string) => {
    setForm((f) => ({ ...f, options: f.options.filter((o) => o !== opt) }));
  };

  const hasSelectOptions = form.type === 'select' || form.type === 'multiselect';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Custom Fields</h2>
          <p className="text-sm text-gray-500 mt-1">Define extra fields for leads and records</p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Saving...</span>}
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
            style={{ backgroundColor: '#410074' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#25024C')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#410074')}
          >
            <Plus size={16} />
            New Field
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading...
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500 text-sm">{error}</div>
        ) : fields.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm mb-3">No custom fields defined yet.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={openCreate} className="text-sm text-purple-700 underline">Create one</button>
              <span className="text-gray-300">or</span>
              <button
                onClick={handleAddDefaults}
                className="text-sm border border-gray-300 bg-white px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Add default examples
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Order', 'Name', 'Key', 'Type', 'Applies To', 'Required', 'Kanban', 'Table', 'Active', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fields.map((field, idx) => (
                  <tr key={field.id} className={`hover:bg-gray-50/50 transition-colors ${!field.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => handleMove(field.id, 'up')} disabled={idx === 0} className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30 transition-colors">
                          <ChevronUp size={13} className="text-gray-500" />
                        </button>
                        <button onClick={() => handleMove(field.id, 'down')} disabled={idx === fields.length - 1} className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30 transition-colors">
                          <ChevronDown size={13} className="text-gray-500" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{field.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{field.key}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {field.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {field.appliesTo === 'all' ? 'All' : `${field.appliesTo === 'manufacturer' ? 'Manufacturer' : 'Partner'}: ${field.appliesToValue || '—'}`}
                    </td>
                    <td className="px-4 py-3">
                      {field.required ? <Check size={15} className="text-green-600" /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {field.showInKanban ? <Check size={15} className="text-green-600" /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {field.showInTable ? <Check size={15} className="text-green-600" /> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggleActive(field.id)} className="relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors" style={{ backgroundColor: field.isActive ? '#410074' : '#d1d5db' }}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${field.isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(field)} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-700 transition-colors"><Edit2 size={14} /></button>
                        <button onClick={() => setDeleteConfirm(field.id)} className="p-1.5 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-t-2xl md:rounded-xl shadow-2xl p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Delete Field</h3>
            <p className="text-sm text-gray-500 mb-5">This will permanently remove the field definition. Existing data using this key will not be deleted automatically.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border border-gray-300 bg-white rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-t-2xl md:rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-800">{editingField ? 'Edit Field' : 'New Custom Field'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-md"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      key: editingField ? f.key : slugify(name),
                    }));
                  }}
                  placeholder="Contract Value"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>
              {/* Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Key <span className="text-red-500">*</span></label>
                <input
                  value={form.key}
                  onChange={(e) => !editingField && setForm((f) => ({ ...f, key: slugify(e.target.value) }))}
                  readOnly={!!editingField}
                  placeholder="contract_value"
                  className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-100 focus:outline-none ${editingField ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                />
                {editingField && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertCircle size={11} /> Cannot change after creation</p>
                )}
              </div>
              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as FieldType, options: [] }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              {/* Options (for select/multiselect) */}
              {hasSelectOptions && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Options</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      value={form.newOption}
                      onChange={(e) => setForm((f) => ({ ...f, newOption: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                      placeholder="Add option..."
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                    />
                    <button onClick={addOption} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.options.map((opt) => (
                      <span key={opt} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-700">
                        {opt}
                        <button onClick={() => removeOption(opt)} className="hover:text-red-500 transition-colors"><X size={11} /></button>
                      </span>
                    ))}
                    {form.options.length === 0 && <span className="text-xs text-gray-400 italic">No options added yet</span>}
                  </div>
                </div>
              )}
              {/* Toggles */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { key: 'required', label: 'Required' },
                  { key: 'showInKanban', label: 'Show in Kanban' },
                  { key: 'showInTable', label: 'Show in Table' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex flex-col gap-2 cursor-pointer">
                    <span className="text-xs font-medium text-gray-600">{label}</span>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, [key]: !f[key as keyof FormState] }))}
                      className="relative inline-flex h-5 w-9 rounded-full transition-colors self-start"
                      style={{ backgroundColor: (form as any)[key] ? '#410074' : '#d1d5db' }}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${(form as any)[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                ))}
              </div>
              {/* Applies To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Applies To</label>
                <div className="flex gap-4">
                  {(['all', 'manufacturer', 'partner'] as const).map((v) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="appliesTo"
                        value={v}
                        checked={form.appliesTo === v}
                        onChange={() => setForm((f) => ({ ...f, appliesTo: v, appliesToValue: '' }))}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-700 capitalize">{v === 'all' ? 'All' : v === 'manufacturer' ? 'By Manufacturer' : 'By Partner'}</span>
                    </label>
                  ))}
                </div>
                {form.appliesTo !== 'all' && (
                  <input
                    value={form.appliesToValue}
                    onChange={(e) => setForm((f) => ({ ...f, appliesToValue: e.target.value }))}
                    placeholder={`Enter ${form.appliesTo} name...`}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  />
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-300 bg-white rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-60"
                style={{ backgroundColor: '#410074' }}
                onMouseEnter={(e) => !saving && (e.currentTarget.style.backgroundColor = '#25024C')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#410074')}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Saving...' : 'Save Field'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
