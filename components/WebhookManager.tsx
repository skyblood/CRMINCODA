import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Play, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Eye, EyeOff, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

const WEBHOOK_EVENTS = [
  { key: 'lead.created', label: 'Lead Created', group: 'Leads' },
  { key: 'lead.stage_changed', label: 'Stage Changed', group: 'Leads' },
  { key: 'lead.closed_won', label: 'Closed Won', group: 'Leads' },
  { key: 'lead.closed_lost', label: 'Closed Lost', group: 'Leads' },
  { key: 'project.created', label: 'Project Created', group: 'Projects' },
  { key: 'project.completed', label: 'Project Completed', group: 'Projects' },
  { key: 'timelog.approved', label: 'Time Log Approved', group: 'Time Logs' },
  { key: 'timelog.rejected', label: 'Time Log Rejected', group: 'Time Logs' },
  { key: 'ticket.created', label: 'Ticket Created', group: 'Tickets' },
  { key: 'ticket.resolved', label: 'Ticket Resolved', group: 'Tickets' },
  { key: 'transaction.created', label: 'Transaction Created', group: 'Finance' },
];

const EVENT_GROUPS = Array.from(new Set(WEBHOOK_EVENTS.map((e) => e.group)));

interface Webhook {
  _id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastTriggeredAt?: string;
  lastStatus?: number;
  failCount: number;
  retryPolicy: { maxRetries: number; retryDelayMs: number };
  secret?: string;
}

interface WebhookLog {
  _id: string;
  triggeredAt: string;
  event: string;
  statusCode: number;
  durationMs: number;
  attempt: number;
  success: boolean;
}

interface FormState {
  name: string;
  url: string;
  events: string[];
  secret: string;
  maxRetries: number;
  retryDelaySeconds: number;
}

const EMPTY_FORM: FormState = {
  name: '',
  url: '',
  events: [],
  secret: '',
  maxRetries: 3,
  retryDelaySeconds: 5,
};

function statusColor(code?: number): string {
  if (!code) return 'text-gray-400';
  if (code >= 200 && code < 300) return 'text-green-600';
  if (code >= 400 && code < 500) return 'text-yellow-600';
  return 'text-red-600';
}

export function WebhookManager() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { status: number | null; error?: string } | null>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<string, WebhookLog[]>>({});
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchWebhooks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/webhooks');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setWebhooks(Array.isArray(data) ? data : data.data || []);
    } catch (e: any) {
      setError('Failed to load webhooks: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWebhooks(); }, []);

  const openCreate = () => {
    setEditingWebhook(null);
    setForm(EMPTY_FORM);
    setShowSecret(false);
    setModalOpen(true);
  };

  const openEdit = (wh: Webhook) => {
    setEditingWebhook(wh);
    setForm({
      name: wh.name,
      url: wh.url,
      events: [...wh.events],
      secret: wh.secret || '',
      maxRetries: wh.retryPolicy?.maxRetries ?? 3,
      retryDelaySeconds: (wh.retryPolicy?.retryDelayMs ?? 5000) / 1000,
    });
    setShowSecret(false);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Name is required'); return; }
    if (!form.url.trim()) { alert('URL is required'); return; }
    if (!form.url.startsWith('https://')) { alert('URL must start with https://'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        url: form.url,
        events: form.events,
        secret: form.secret || undefined,
        retryPolicy: { maxRetries: form.maxRetries, retryDelayMs: form.retryDelaySeconds * 1000 },
      };
      if (editingWebhook) {
        const res = await fetch(`/api/webhooks/${editingWebhook._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        const res = await fetch('/api/webhooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      setModalOpen(false);
      fetchWebhooks();
    } catch (e: any) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (wh: Webhook) => {
    try {
      const res = await fetch(`/api/webhooks/${wh._id}/toggle`, { method: 'PATCH' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchWebhooks();
    } catch (e: any) {
      alert('Toggle failed: ' + e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleteConfirm(null);
      fetchWebhooks();
    } catch (e: any) {
      alert('Delete failed: ' + e.message);
    }
  };

  const handleTest = async (id: string) => {
    setTestResults((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await fetch(`/api/webhooks/${id}/test`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      setTestResults((prev) => ({ ...prev, [id]: { status: json.status || res.status } }));
      setTimeout(() => setTestResults((prev) => { const n = { ...prev }; delete n[id]; return n; }), 3000);
    } catch (e: any) {
      setTestResults((prev) => ({ ...prev, [id]: { status: null, error: e.message } }));
      setTimeout(() => setTestResults((prev) => { const n = { ...prev }; delete n[id]; return n; }), 3000);
    }
  };

  const handleLogs = async (id: string) => {
    if (expandedLogs[id]) {
      setExpandedLogs((prev) => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    setLoadingLogs((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/webhooks/${id}/logs`);
      const data = await res.json();
      setExpandedLogs((prev) => ({ ...prev, [id]: Array.isArray(data) ? data : data.data || [] }));
    } catch {
      setExpandedLogs((prev) => ({ ...prev, [id]: [] }));
    } finally {
      setLoadingLogs((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const toggleEvent = (key: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(key) ? f.events.filter((e) => e !== key) : [...f.events, key],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Webhook Manager</h2>
          <p className="text-sm text-gray-500 mt-1">Configure outbound webhooks for CRM events</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
          style={{ backgroundColor: '#410074' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#25024C')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#410074')}
        >
          <Plus size={16} />
          New Webhook
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading webhooks...
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500 text-sm">{error}</div>
        ) : webhooks.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No webhooks configured yet.{' '}
            <button onClick={openCreate} className="text-purple-700 underline">Create one</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Name', 'URL', 'Events', 'Status', 'Last Fired', 'Last Status', 'Fails', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {webhooks.map((wh) => {
                  const testResult = testResults[wh._id];
                  const logsOpen = !!expandedLogs[wh._id];
                  return (
                    <React.Fragment key={wh._id}>
                      <tr className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{wh.name}</td>
                        <td className="px-4 py-3">
                          <span className="w-40 truncate block text-gray-500 font-mono text-xs" title={wh.url}>{wh.url}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                            {wh.events.length}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {wh.isActive ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" /> Disabled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {wh.lastTriggeredAt ? new Date(wh.lastTriggeredAt).toLocaleString() : '—'}
                        </td>
                        <td className={`px-4 py-3 text-xs font-mono font-semibold ${statusColor(wh.lastStatus)}`}>
                          {wh.lastStatus || '—'}
                        </td>
                        <td className={`px-4 py-3 text-xs font-semibold ${wh.failCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {wh.failCount}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {/* Toggle */}
                            <button onClick={() => handleToggle(wh)} title={wh.isActive ? 'Disable' : 'Enable'} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-700 transition-colors">
                              {wh.isActive ? <ToggleRight size={16} className="text-green-600" /> : <ToggleLeft size={16} />}
                            </button>
                            {/* Edit */}
                            <button onClick={() => openEdit(wh)} title="Edit" className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-700 transition-colors">
                              <Edit2 size={14} />
                            </button>
                            {/* Test */}
                            <button onClick={() => handleTest(wh._id)} title="Test" className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-blue-600 transition-colors">
                              <Play size={14} />
                            </button>
                            {/* Logs */}
                            <button onClick={() => handleLogs(wh._id)} title="Logs" className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-700 transition-colors">
                              {loadingLogs[wh._id] ? <Loader2 size={14} className="animate-spin" /> : logsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            {/* Delete */}
                            <button onClick={() => setDeleteConfirm(wh._id)} title="Delete" className="p-1.5 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                          {/* Inline test result */}
                          {testResult !== undefined && (
                            <div className="mt-1">
                              {testResult === null ? (
                                <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Testing...</span>
                              ) : testResult.error ? (
                                <span className="text-xs text-red-500 flex items-center gap-1"><XCircle size={11} /> Error</span>
                              ) : testResult.status && testResult.status >= 200 && testResult.status < 300 ? (
                                <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={11} /> {testResult.status} OK</span>
                              ) : (
                                <span className="text-xs text-red-500 flex items-center gap-1"><XCircle size={11} /> {testResult.status}</span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                      {/* Logs inline */}
                      {logsOpen && (
                        <tr>
                          <td colSpan={8} className="px-4 py-0 bg-gray-50/70">
                            <div className="py-3">
                              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Recent Logs</p>
                              {expandedLogs[wh._id].length === 0 ? (
                                <p className="text-xs text-gray-400">No logs yet.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-400">
                                      {['Time', 'Event', 'Status', 'Duration', 'Attempt', 'Result'].map((h) => (
                                        <th key={h} className="text-left py-1 pr-4 font-medium">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {expandedLogs[wh._id].slice(0, 20).map((log) => (
                                      <tr key={log._id}>
                                        <td className="py-1.5 pr-4 text-gray-500 whitespace-nowrap">{new Date(log.triggeredAt).toLocaleString()}</td>
                                        <td className="py-1.5 pr-4 font-mono text-gray-700">{log.event}</td>
                                        <td className={`py-1.5 pr-4 font-mono font-semibold ${statusColor(log.statusCode)}`}>{log.statusCode}</td>
                                        <td className="py-1.5 pr-4 text-gray-500">{log.durationMs}ms</td>
                                        <td className="py-1.5 pr-4 text-gray-500">#{log.attempt}</td>
                                        <td className="py-1.5">
                                          {log.success ? (
                                            <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
                                              <CheckCircle2 size={10} /> Success
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                                              <XCircle size={10} /> Failed
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirm Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Delete Webhook</h3>
            <p className="text-sm text-gray-500 mb-5">Are you sure? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border border-gray-300 bg-white rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-800">{editingWebhook ? 'Edit Webhook' : 'New Webhook'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-md"><XCircle size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="My Webhook"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>
              {/* URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL <span className="text-red-500">*</span></label>
                <input
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://example.com/webhook"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
                {form.url && !form.url.startsWith('https://') && (
                  <p className="text-xs text-red-500 mt-1">URL must start with https://</p>
                )}
              </div>
              {/* Events */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Events</label>
                <div className="space-y-3">
                  {EVENT_GROUPS.map((group) => (
                    <div key={group}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{group}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {WEBHOOK_EVENTS.filter((e) => e.group === group).map((ev) => (
                          <label key={ev.key} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.events.includes(ev.key)}
                              onChange={() => toggleEvent(ev.key)}
                              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                            <span className="text-sm text-gray-700">{ev.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Secret */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Signing Secret</label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={form.secret}
                    onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                    placeholder="Optional secret for HMAC signature"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  />
                  <button type="button" onClick={() => setShowSecret((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {/* Retry policy */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Retries</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={form.maxRetries}
                    onChange={(e) => setForm((f) => ({ ...f, maxRetries: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retry Delay (s)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.retryDelaySeconds}
                    onChange={(e) => setForm((f) => ({ ...f, retryDelaySeconds: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  />
                </div>
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
                {saving ? 'Saving...' : 'Save Webhook'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
