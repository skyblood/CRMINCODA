import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Interaction } from '../types';
import { Clock, MessageSquare, Mail, Phone, Users, CheckSquare, GitBranch, Plus, Trash2, Sparkles } from 'lucide-react';
import { apiFetch, sanitizeId } from '../services/apiFetch';

interface LeadContext {
  companyName: string;
  contactName?: string;
  stage?: string;
  nextStep?: string;
  value?: number;
  expectedCloseDate?: string;
}

interface Props {
  entityId: string;
  entityType: 'lead' | 'contact';
  interactions?: Interaction[];
  currentUserId?: string;
  currentUserName?: string;
  leadContext?: LeadContext;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  stage_change: { icon: <GitBranch size={13} />, color: 'bg-blue-100 text-blue-700',   label: 'Stage Change' },
  note:         { icon: <MessageSquare size={13} />, color: 'bg-gray-100 text-gray-600', label: 'Note' },
  email:        { icon: <Mail size={13} />,          color: 'bg-purple-100 text-purple-700', label: 'Email' },
  call:         { icon: <Phone size={13} />,         color: 'bg-green-100 text-green-700',  label: 'Call' },
  meeting:      { icon: <Users size={13} />,         color: 'bg-amber-100 text-amber-700',  label: 'Meeting' },
  task:         { icon: <CheckSquare size={13} />,   color: 'bg-indigo-100 text-indigo-700', label: 'Task' },
};

function interactionToActivity(i: Interaction, entityId: string, entityType: 'lead' | 'contact'): Activity {
  return {
    id: i.id,
    type: i.type as Activity['type'],
    note: i.notes,
    date: i.date,
    userId: '',
    userName: '',
    entityId,
    entityType,
  };
}

export function ActivityTimeline({ entityId, entityType, interactions = [], currentUserId = '', currentUserName = '', leadContext }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<Activity['type']>('note');
  const [saving, setSaving] = useState(false);
  const [draftingEmail, setDraftingEmail] = useState(false);

  const fetchActivities = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/activities?entityId=${sanitizeId(entityId)}&entityType=${entityType}`, { credentials: 'include' });
      if (res.ok) setActivities(await res.json());
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  // Merge server activities with legacy interactions array, deduplicate by id
  const merged: Activity[] = React.useMemo(() => {
    const fromInteractions = interactions.map(i => interactionToActivity(i, entityId, entityType));
    const ids = new Set(activities.map(a => a.id));
    const deduped = fromInteractions.filter(a => !ids.has(a.id));
    return [...activities, ...deduped].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activities, interactions, entityId, entityType]);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      const payload: Partial<Activity> = {
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: noteType,
        note: noteText.trim(),
        date: new Date().toISOString(),
        userId: currentUserId,
        userName: currentUserName || 'User',
        entityId,
        entityType,
      };
      const res = await apiFetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        setActivities(prev => [created, ...prev]);
        setNoteText('');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAIDraft = async () => {
    if (!leadContext) return;
    setDraftingEmail(true);
    try {
      const recentActivities = merged.slice(0, 5).map(a => ({ type: a.type, note: a.note }));
      const res = await apiFetch('/api/ai/email-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...leadContext, recentActivities }),
      });
      if (res.ok) {
        const { draft } = await res.json();
        setNoteText(draft);
      }
    } catch {
      // silent — user can type manually
    } finally {
      setDraftingEmail(false);
    }
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/activities/${sanitizeId(id)}`, { method: 'DELETE', credentials: 'include' });
    setActivities(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Add note form */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="flex gap-2 items-start">
          <select
            value={noteType}
            onChange={e => setNoteType(e.target.value as Activity['type'])}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none flex-shrink-0"
          >
            {(['note','call','email','meeting','task'] as const).map(t => (
              <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
            ))}
          </select>
          {noteType === 'email' ? (
            <textarea
              placeholder="Write email body…"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={4}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 bg-white resize-none"
            />
          ) : (
            <input
              type="text"
              placeholder="Add a note…"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddNote()}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 bg-white"
            />
          )}
          <div className="flex flex-col gap-1 flex-shrink-0">
            {noteType === 'email' && leadContext && (
              <button
                onClick={handleAIDraft}
                disabled={draftingEmail}
                title="Draft with AI (Anthropic)"
                className="flex items-center gap-1 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
              >
                <Sparkles size={12} />
                {draftingEmail ? 'Writing…' : 'AI Draft'}
              </button>
            )}
            <button
              onClick={handleAddNote}
              disabled={saving || !noteText.trim()}
              className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <Plus size={13} /> Add
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-6 text-gray-400 text-sm">Loading timeline…</div>
      ) : merged.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">No activity yet. Add a note above.</div>
      ) : (
        <div className="relative space-y-0">
          {/* Vertical line */}
          <div className="absolute left-4 top-2 bottom-2 w-px bg-gray-200" />
          {merged.map((activity) => {
            const cfg = TYPE_CONFIG[activity.type] ?? TYPE_CONFIG.note;
            return (
              <div key={activity.id} className="flex gap-3 pl-1 pb-4 relative group">
                {/* Dot */}
                <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${cfg.color}`}>
                  {cfg.icon}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.color}`}>{cfg.label}</span>
                    {activity.userName && (
                      <span className="text-[11px] text-gray-500">{activity.userName}</span>
                    )}
                    <span className="text-[11px] text-gray-400 flex items-center gap-0.5 ml-auto">
                      <Clock size={10} />
                      {new Date(activity.date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    {/* Delete only manual entries (not stage_change) */}
                    {activity.type !== 'stage_change' && (
                      <button
                        onClick={() => handleDelete(activity.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition ml-1"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-0.5 break-words">{activity.note}</p>
                  {activity.type === 'stage_change' && activity.metadata && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {String(activity.metadata.previousStage)} → {String(activity.metadata.newStage)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
