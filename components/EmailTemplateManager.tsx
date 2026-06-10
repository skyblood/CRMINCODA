import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Mail, Eye, Save, X, Tag } from 'lucide-react';
import { apiFetch, sanitizeId } from '../services/apiFetch';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  tags: string[];
}

const SAMPLE_LEAD = {
  companyName: 'Acme Corp',
  contactName: 'Jane Smith',
  email: 'jane@acme.com',
  phone: '+1 555-0100',
  value: 25000,
  stage: 'proposal',
  nextStep: 'Send pricing deck',
  expectedCloseDate: '2026-05-31',
};

const MERGE_FIELDS = [
  '{{companyName}}', '{{contactName}}', '{{email}}', '{{phone}}',
  '{{value}}', '{{stage}}', '{{nextStep}}', '{{expectedCloseDate}}',
];

const empty = (): Omit<EmailTemplate, 'id'> => ({ name: '', subject: '', body: '', tags: [] });

export const EmailTemplateManager: React.FC = () => {
  const [templates, setTemplates]         = useState<EmailTemplate[]>([]);
  const [selected, setSelected]           = useState<EmailTemplate | null>(null);
  const [form, setForm]                   = useState(empty());
  const [tagInput, setTagInput]           = useState('');
  const [isNew, setIsNew]                 = useState(false);
  const [preview, setPreview]             = useState<{ subject: string; body: string } | null>(null);
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);

  useEffect(() => { fetchTemplates(); }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/email-templates', { credentials: 'include' });
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  const selectTemplate = (t: EmailTemplate) => {
    setSelected(t);
    setForm({ name: t.name, subject: t.subject, body: t.body, tags: t.tags ?? [] });
    setIsNew(false);
    setPreview(null);
  };

  const startNew = () => {
    setSelected(null);
    setForm(empty());
    setTagInput('');
    setIsNew(true);
    setPreview(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        const res = await apiFetch('/api/email-templates', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const created = await res.json();
        setTemplates(prev => [created, ...prev]);
        setSelected(created);
        setIsNew(false);
      } else if (selected) {
        const res = await apiFetch(`/api/email-templates/${sanitizeId(selected.id)}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const updated = await res.json();
        setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
        setSelected(updated);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    await apiFetch(`/api/email-templates/${sanitizeId(id)}`, { method: 'DELETE', credentials: 'include' });
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (selected?.id === id) { setSelected(null); setIsNew(false); }
  };

  const handlePreview = async () => {
    const res = await apiFetch('/api/email-templates/preview', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: form.subject, body: form.body, lead: SAMPLE_LEAD }),
    });
    const data = await res.json();
    setPreview(data);
  };

  const insertMergeField = (field: string) => {
    setForm(prev => ({ ...prev, body: prev.body + field }));
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));

  const isDirty = selected
    ? form.name !== selected.name || form.subject !== selected.subject || form.body !== selected.body || JSON.stringify(form.tags) !== JSON.stringify(selected.tags)
    : form.name !== '' || form.subject !== '' || form.body !== '';

  return (
    <div className="flex h-full bg-gray-50 min-h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Mail size={16} /> Email Templates</h2>
          <button onClick={startNew} className="p-1 rounded hover:bg-blue-50 text-blue-600" title="New template"><Plus size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-xs text-gray-400 p-4">Loading…</p>}
          {!loading && templates.length === 0 && (
            <p className="text-xs text-gray-400 p-4">No templates yet. Create one.</p>
          )}
          {templates.map(t => (
            <div
              key={t.id}
              onClick={() => selectTemplate(t)}
              className={`px-4 py-3 cursor-pointer border-b border-gray-50 hover:bg-blue-50 transition-colors ${selected?.id === t.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''}`}
            >
              <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
              <p className="text-xs text-gray-400 truncate mt-0.5">{t.subject || <span className="italic">No subject</span>}</p>
              {t.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {t.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected && !isNew ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Mail size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a template or create a new one</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between gap-4">
              <div className="flex-1">
                <input
                  className="w-full text-base font-semibold text-gray-900 border-0 outline-none bg-transparent placeholder-gray-300"
                  placeholder="Template name…"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePreview} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  <Eye size={14} /> Preview
                </button>
                <button
                  onClick={handleSave}
                  disabled={!isDirty || saving || !form.name.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-40"
                >
                  <Save size={14} /> {saving ? 'Saving…' : 'Save'}
                </button>
                {selected && (
                  <button onClick={() => handleDelete(selected.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Subject</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-blue-600"
                  placeholder="e.g. Follow-up: {{companyName}} proposal"
                  value={form.subject}
                  onChange={e => setForm(prev => ({ ...prev, subject: e.target.value }))}
                />
              </div>

              {/* Merge fields */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Insert merge field</label>
                <div className="flex flex-wrap gap-1.5">
                  {MERGE_FIELDS.map(f => (
                    <button key={f} onClick={() => insertMergeField(f)} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-mono">
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Body</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:border-blue-600 resize-none"
                  rows={12}
                  placeholder={"Hi {{contactName}},\n\nThank you for your interest…"}
                  value={form.body}
                  onChange={e => setForm(prev => ({ ...prev, body: e.target.value }))}
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1"><Tag size={11} /> Tags</label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:border-blue-600"
                    placeholder="e.g. follow-up"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  />
                  <button onClick={addTag} className="text-xs px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600">Add</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {form.tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="text-gray-400 hover:text-red-500"><X size={10} /></button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Preview panel */}
      {preview && (
        <div className="w-80 bg-white border-l border-gray-100 flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Eye size={14} /> Preview</span>
            <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            <p className="text-xs text-gray-400 italic">Sample data: {SAMPLE_LEAD.contactName} @ {SAMPLE_LEAD.companyName}</p>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Subject</p>
              <p className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3">{preview.subject || <span className="text-gray-300 italic">Empty</span>}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Body</p>
              <pre className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-sans">{preview.body || <span className="text-gray-300 italic">Empty</span>}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
