import React, { useState } from 'react';
import { AutomationRule, AutomationTrigger, AutomationAction } from '../types';
import { Zap, Plus, Edit2, Trash2, X, Save, Info } from 'lucide-react';

interface Props {
  rules: AutomationRule[];
  onAdd: (r: AutomationRule) => void;
  onUpdate: (r: AutomationRule) => void;
  onDelete: (id: string) => void;
}

const TRIGGERS: { value: AutomationTrigger; label: string; description: string }[] = [
  { value: 'stage_changed',  label: 'Stage Changed',       description: 'When a deal moves to a specific stage' },
  { value: 'days_inactive',  label: 'Days Inactive',        description: 'When a deal has no activity for N days' },
  { value: 'deal_won',       label: 'Deal Won',             description: 'When a deal is marked as Closed Won' },
  { value: 'lead_assigned',  label: 'Lead Assigned',        description: 'When a deal is assigned to a rep' },
  { value: 'field_updated',  label: 'Field Updated',        description: 'When any field on a deal is updated' },
];

const ACTIONS: { value: AutomationAction; label: string; description: string }[] = [
  { value: 'create_task',    label: 'Create Task',          description: 'Add a follow-up task to the deal' },
  { value: 'send_email',     label: 'Send Email',           description: 'Send an email using a template' },
  { value: 'send_webhook',   label: 'Send Webhook',         description: 'Trigger an outbound webhook' },
  { value: 'notify',         label: 'Notify Admins',        description: 'Send an in-app notification' },
  { value: 'change_field',   label: 'Update Field',         description: 'Set a field on the deal to a specific value' },
];

const STAGES = ['prospect','qualification','presentation','proposal','negotiation','closed-won','closed-lost'];

const EMPTY_RULE: Omit<AutomationRule, 'id' | 'createdAt'> = {
  name: '',
  enabled: true,
  trigger: 'stage_changed',
  triggerConfig: {},
  action: 'notify',
  actionConfig: {},
};

function TriggerConfigForm({ trigger, config, onChange }: {
  trigger: AutomationTrigger;
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  if (trigger === 'stage_changed') return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Target Stage</label>
      <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none" value={String(config.stage ?? '')} onChange={e => onChange({ ...config, stage: e.target.value })}>
        <option value="">Any stage change</option>
        {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
  if (trigger === 'days_inactive') return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Days without activity</label>
      <input type="number" min={1} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" value={String(config.days ?? 7)} onChange={e => onChange({ ...config, days: Number(e.target.value) })} />
    </div>
  );
  if (trigger === 'field_updated') return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Field name (optional)</label>
      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" value={String(config.field ?? '')} onChange={e => onChange({ ...config, field: e.target.value })} placeholder="e.g. value, probability (leave blank for any field)" />
    </div>
  );
  return null;
}

function ActionConfigForm({ action, config, onChange }: {
  action: AutomationAction;
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  if (action === 'create_task') return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Task Title</label>
        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" value={String(config.taskTitle ?? '')} onChange={e => onChange({ ...config, taskTitle: e.target.value })} placeholder="Follow up with client" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Due in (days)</label>
        <input type="number" min={1} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" value={String(config.dueDays ?? 3)} onChange={e => onChange({ ...config, dueDays: Number(e.target.value) })} />
      </div>
    </div>
  );
  if (action === 'notify') return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Notification Title</label>
      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" value={String(config.title ?? '')} onChange={e => onChange({ ...config, title: e.target.value })} placeholder="e.g. Deal needs attention" />
    </div>
  );
  if (action === 'send_email') return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Email Template ID</label>
      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" value={String(config.templateId ?? '')} onChange={e => onChange({ ...config, templateId: e.target.value })} placeholder="template ID from Templates module" />
    </div>
  );
  if (action === 'change_field') return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Field to update</label>
        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" value={String(config.field ?? '')} onChange={e => onChange({ ...config, field: e.target.value })} placeholder="e.g. probability, assignedToName" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">New value</label>
        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" value={String(config.value ?? '')} onChange={e => onChange({ ...config, value: e.target.value })} placeholder="e.g. 80" />
      </div>
    </div>
  );
  return (
    <p className="text-xs text-gray-400">No additional configuration needed for this action.</p>
  );
}

function RuleForm({ initial, onSave, onCancel }: {
  initial: Omit<AutomationRule, 'id' | 'createdAt'>;
  onSave: (data: Omit<AutomationRule, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Rule Name *</label>
        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Notify on proposal stage" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">When (Trigger)</label>
          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none" value={form.trigger} onChange={e => setForm(p => ({ ...p, trigger: e.target.value as AutomationTrigger, triggerConfig: {} }))}>
            {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <p className="text-xs text-gray-400">{TRIGGERS.find(t => t.value === form.trigger)?.description}</p>
          <TriggerConfigForm trigger={form.trigger} config={form.triggerConfig} onChange={c => setForm(p => ({ ...p, triggerConfig: c }))} />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Then (Action)</label>
          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none" value={form.action} onChange={e => setForm(p => ({ ...p, action: e.target.value as AutomationAction, actionConfig: {} }))}>
            {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <p className="text-xs text-gray-400">{ACTIONS.find(a => a.value === form.action)?.description}</p>
          <ActionConfigForm action={form.action} config={form.actionConfig} onChange={c => setForm(p => ({ ...p, actionConfig: c }))} />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1 border-t border-gray-100">
        <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200 transition">
          <X size={14} /> Cancel
        </button>
        <button onClick={() => form.name.trim() && onSave(form)} disabled={!form.name.trim()} className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition">
          <Save size={14} /> Save Rule
        </button>
      </div>
    </div>
  );
}

export function AutomationManager({ rules, onAdd, onUpdate, onDelete }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const handleAdd = (data: Omit<AutomationRule, 'id' | 'createdAt'>) => {
    onAdd({ ...data, id: `rule_${Date.now()}`, createdAt: new Date().toISOString() });
    setShowForm(false);
  };

  const handleUpdate = (rule: AutomationRule, data: Omit<AutomationRule, 'id' | 'createdAt'>) => {
    onUpdate({ ...rule, ...data });
    setEditId(null);
  };

  const toggleEnabled = (rule: AutomationRule) => onUpdate({ ...rule, enabled: !rule.enabled });

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#1E0B4B,#6B21A8)' }}>
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Automations</h1>
            <p className="text-xs text-gray-500">{rules.filter(r => r.enabled).length} active of {rules.length} rules</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
          <Plus size={15} /> New Rule
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-3">
        {/* Info banner */}
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
          <Info size={14} className="mt-0.5 flex-shrink-0" />
          <span>Automations run server-side when triggers fire. Stage change and assignment triggers are instant. <strong>Days inactive</strong> is checked every hour.</span>
        </div>

        {showForm && (
          <RuleForm initial={EMPTY_RULE} onSave={handleAdd} onCancel={() => setShowForm(false)} />
        )}

        {rules.length === 0 && !showForm ? (
          <div className="text-center py-16 text-gray-400">
            <Zap size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No automation rules yet</p>
            <p className="text-sm mt-1">Create your first rule to automate repetitive tasks.</p>
          </div>
        ) : (
          rules.map(rule => (
            <div key={rule.id}>
              {editId === rule.id ? (
                <RuleForm
                  initial={{ name: rule.name, enabled: rule.enabled, trigger: rule.trigger, triggerConfig: rule.triggerConfig, action: rule.action, actionConfig: rule.actionConfig }}
                  onSave={data => handleUpdate(rule, data)}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <div className={`bg-white border rounded-xl px-4 py-3 flex items-center gap-4 transition ${rule.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                  {/* Toggle */}
                  <button
                    onClick={() => toggleEnabled(rule)}
                    title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                    className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors ${rule.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${rule.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{rule.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      <span className="font-medium text-blue-700">{TRIGGERS.find(t => t.value === rule.trigger)?.label}</span>
                      {!!rule.triggerConfig.stage && <span className="text-gray-400"> → {String(rule.triggerConfig.stage)}</span>}
                      {!!rule.triggerConfig.days && <span className="text-gray-400"> after {String(rule.triggerConfig.days)} days</span>}
                      <span className="text-gray-400 mx-1">→</span>
                      <span className="font-medium text-purple-700">{ACTIONS.find(a => a.value === rule.action)?.label}</span>
                      {!!rule.actionConfig.taskTitle && <span className="text-gray-400">: "{String(rule.actionConfig.taskTitle)}"</span>}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setEditId(rule.id)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition"><Edit2 size={13} /></button>
                    <button onClick={() => onDelete(rule.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition"><Trash2 size={13} /></button>
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
