import React, { useState } from 'react';
import { Pipeline } from '../types';
import { GitBranch, Plus, Edit2, Trash2, X, Save, Star } from 'lucide-react';

interface Props {
  pipelines: Pipeline[];
  onAdd: (p: Pipeline) => void;
  onUpdate: (p: Pipeline) => void;
  onDelete: (id: string) => void;
}

const COLORS = ['#410074', '#1d4ed8', '#047857', '#b45309', '#be123c', '#0369a1', '#7c3aed'];

const DEFAULT_STAGES = ['prospect', 'qualification', 'presentation', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];

const EMPTY: Omit<Pipeline, 'id' | 'createdAt'> = {
  name: '',
  color: '#410074',
  description: '',
  isDefault: false,
};

function PipelineForm({ initial, onSave, onCancel }: {
  initial: Omit<Pipeline, 'id' | 'createdAt'>;
  onSave: (data: Omit<Pipeline, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Pipeline Name *</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Enterprise Sales"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="w-10 h-8 rounded border border-gray-200 cursor-pointer"
              value={form.color ?? '#410074'}
              onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
            />
            <div className="flex gap-1.5 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, color: c }))}
                  className={`w-5 h-5 rounded-full border-2 transition ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Set as Default</label>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={form.isDefault ?? false}
              onChange={e => setForm(p => ({ ...p, isDefault: e.target.checked }))}
            />
            <span className="text-sm text-gray-600">Default pipeline for new deals</span>
          </label>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Description</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            value={form.description ?? ''}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Brief description of this pipeline's purpose"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1 border-t border-gray-100">
        <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200 transition">
          <X size={14} /> Cancel
        </button>
        <button
          onClick={() => form.name.trim() && onSave(form)}
          disabled={!form.name.trim()}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition"
        >
          <Save size={14} /> Save Pipeline
        </button>
      </div>
    </div>
  );
}

export function PipelineManager({ pipelines, onAdd, onUpdate, onDelete }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const handleAdd = (data: Omit<Pipeline, 'id' | 'createdAt'>) => {
    onAdd({ ...data, id: `pl_${Date.now()}`, createdAt: new Date().toISOString() });
    setShowForm(false);
  };

  const handleUpdate = (pipeline: Pipeline, data: Omit<Pipeline, 'id' | 'createdAt'>) => {
    onUpdate({ ...pipeline, ...data });
    setEditId(null);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#1E0B4B,#6B21A8)' }}>
            <GitBranch size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Pipelines</h1>
            <p className="text-xs text-gray-500">{pipelines.length} pipeline{pipelines.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          <Plus size={15} /> New Pipeline
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-3">
        {/* Info about default stages */}
        <div className="bg-gray-100 border border-gray-200 rounded-xl p-3 text-xs text-gray-600">
          <strong>Default stages</strong> (shared across all pipelines):{' '}
          {DEFAULT_STAGES.map((s, i) => (
            <span key={s}>
              <span className="font-medium">{s}</span>
              {i < DEFAULT_STAGES.length - 1 && ' → '}
            </span>
          ))}
        </div>

        {showForm && (
          <PipelineForm initial={EMPTY} onSave={handleAdd} onCancel={() => setShowForm(false)} />
        )}

        {pipelines.length === 0 && !showForm ? (
          <div className="text-center py-16 text-gray-400">
            <GitBranch size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No custom pipelines yet</p>
            <p className="text-sm mt-1">Create pipelines to segment your sales process (e.g. Enterprise vs SMB).</p>
          </div>
        ) : (
          pipelines.map(pipeline => (
            <div key={pipeline.id}>
              {editId === pipeline.id ? (
                <PipelineForm
                  initial={{ name: pipeline.name, color: pipeline.color, description: pipeline.description, isDefault: pipeline.isDefault }}
                  onSave={data => handleUpdate(pipeline, data)}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4 shadow-sm">
                  {/* Color swatch */}
                  <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: pipeline.color ?? '#410074' }}>
                    <GitBranch size={14} className="text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm">{pipeline.name}</p>
                      {pipeline.isDefault && (
                        <span className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 font-medium">
                          <Star size={9} /> Default
                        </span>
                      )}
                    </div>
                    {pipeline.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{pipeline.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setEditId(pipeline.id)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => onDelete(pipeline.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
