import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Star, Trash2, Eye, Plus, X, Check, Info } from 'lucide-react';
import DOMPurify from 'dompurify';
import { apiFetch, sanitizeId } from '../services/apiFetch';

interface Template {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  tags: string[];
  createdAt: string;
}

const PLACEHOLDERS = [
  { group: 'Cliente', items: ['{{company_name}}', '{{contact_name}}', '{{contact_email}}', '{{contact_phone}}', '{{contact_role}}', '{{country}}', '{{date}}', '{{ref}}', '{{expected_close}}', '{{deal_value}}'] },
  { group: 'Veracode', items: ['{{developer_count}}', '{{profile_count}}', '{{license_years}}', '{{modules_list}}', '{{modules_table}}', '{{notes}}'] },
  { group: 'IA (requiere generar antes)', items: ['{{ai_executive_summary}}', '{{ai_solution_overview}}', '{{ai_methodology}}', '{{ai_why_incoda}}', '{{ai_next_steps}}'] },
  { group: 'Precios', items: ['{{items_table}}', '{{total_value}}'] },
  { group: 'Assets', items: ['{{logo_url}}'] },
];

export function ProposalTemplateManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newHtml, setNewHtml] = useState('');
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/proposal-templates', { credentials: 'include' });
      if (res.ok) setTemplates(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!newName) setNewName(file.name.replace(/\.[^.]+$/, ''));
    const reader = new FileReader();
    reader.onload = ev => setNewHtml(String(ev.target?.result ?? ''));
    reader.readAsText(file, 'utf-8');
  };

  const handleSave = async () => {
    if (!newName.trim() || !newHtml.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/proposal-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName, description: newDesc, htmlContent: newHtml, isDefault: newIsDefault }),
      });
      if (!res.ok) { alert((await res.json()).error); return; }
      setShowForm(false);
      setNewName(''); setNewDesc(''); setNewHtml(''); setNewIsDefault(false);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } finally { setSaving(false); }
  };

  const setDefault = async (id: string) => {
    await apiFetch(`/api/proposal-templates/${sanitizeId(id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ isDefault: true }),
    });
    load();
  };

  const deleteTemplate = async (id: string) => {
    if (!window.confirm('¿Eliminar este template?')) return;
    await apiFetch(`/api/proposal-templates/${sanitizeId(id)}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const previewTemplate = async (id: string) => {
    // Preview raw HTML (no lead data)
    const res = await apiFetch(`/api/proposal-templates/${sanitizeId(id)}`, { credentials: 'include' });
    if (res.ok) {
      const t = await res.json();
      setPreviewHtml(t.htmlContent);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Templates de Propuesta</h1>
          <p className="text-sm text-gray-500 mt-0.5">Sube archivos HTML con <code className="bg-gray-100 px-1 rounded text-xs">{'{{}}'}</code> para propuestas personalizadas</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg font-medium transition hover:opacity-90"
          style={{ background: '#410074' }}
        >
          <Plus size={15} /> Nuevo template
        </button>
      </div>

      {/* Placeholders reference */}
      <details className="border border-gray-200 rounded-xl overflow-hidden">
        <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-50 select-none">
          <Info size={14} className="text-blue-500" /> Variables disponibles (haz clic para ver)
        </summary>
        <div className="px-4 pb-4 pt-2 grid grid-cols-2 gap-4 border-t border-gray-100">
          {PLACEHOLDERS.map(group => (
            <div key={group.group}>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{group.group}</p>
              <div className="space-y-1">
                {group.items.map(p => (
                  <code key={p} className="block text-xs bg-gray-50 border border-gray-200 px-2 py-1 rounded text-purple-700 font-mono">{p}</code>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>

      {/* Upload form */}
      {showForm && (
        <div className="border-2 border-purple-200 rounded-xl p-5 bg-purple-50 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-800">Subir template HTML</p>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Nombre *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"
                value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Ej: Propuesta Estándar Veracode"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Descripción</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"
                value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Descripción opcional"
              />
            </div>
          </div>

          {/* File upload */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Archivo HTML *</label>
            <div
              className="border-2 border-dashed border-purple-300 rounded-xl p-6 text-center cursor-pointer hover:border-purple-500 hover:bg-white transition"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={24} className="mx-auto mb-2 text-purple-400" />
              <p className="text-sm text-gray-600">Arrastra o haz clic para subir</p>
              <p className="text-xs text-gray-400 mt-1">Formato: <strong>.html</strong> con variables <code>{'{{}}'}</code></p>
              {newHtml && <p className="text-xs text-green-600 mt-2 font-medium">✓ Archivo cargado ({(newHtml.length / 1024).toFixed(1)} KB)</p>}
            </div>
            <input ref={fileRef} type="file" accept=".html,.htm" className="hidden" onChange={handleFileUpload} />
          </div>

          {/* Or paste HTML directly */}
          {!newHtml && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">O pega el HTML directamente</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-purple-200 resize-none"
                rows={6}
                placeholder="<!DOCTYPE html><html>..."
                value={newHtml}
                onChange={e => setNewHtml(e.target.value)}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" className="rounded" checked={newIsDefault} onChange={e => setNewIsDefault(e.target.checked)} />
              Establecer como template predeterminado
            </label>
            <button
              onClick={handleSave}
              disabled={saving || !newName.trim() || !newHtml.trim()}
              className="flex items-center gap-2 px-5 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40 transition"
              style={{ background: '#410074' }}
            >
              {saving ? '...' : <><Check size={14} /> Guardar template</>}
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <FileText size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm">No hay templates. Sube el primero.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className={`border rounded-xl p-4 flex items-center gap-4 bg-white ${t.isDefault ? 'border-purple-400 shadow-sm' : 'border-gray-200'}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${t.isDefault ? 'bg-purple-100' : 'bg-gray-100'}`}>
                <FileText size={18} style={{ color: t.isDefault ? '#410074' : '#9ca3af' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 text-sm truncate">{t.name}</p>
                  {t.isDefault && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: '#410074' }}>
                      <Star size={9} /> DEFAULT
                    </span>
                  )}
                </div>
                {t.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{t.description}</p>}
                <p className="text-xs text-gray-400 mt-0.5">Creado: {new Date(t.createdAt).toLocaleDateString('es-ES')}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => previewTemplate(t.id)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Vista previa">
                  <Eye size={16} />
                </button>
                {!t.isDefault && (
                  <button onClick={() => setDefault(t.id)} className="p-2 text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 rounded-lg transition" title="Establecer como default">
                    <Star size={16} />
                  </button>
                )}
                <button onClick={() => deleteTemplate(t.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Eliminar">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raw HTML preview modal */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <p className="font-semibold text-gray-700 text-sm">Vista previa (sin datos de lead)</p>
              <button onClick={() => setPreviewHtml(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-auto p-1">
              <iframe
                srcDoc={DOMPurify.sanitize(previewHtml ?? '')}
                className="w-full h-full rounded-lg border-0"
                style={{ minHeight: '600px' }}
                title="Template preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
