import React, { useState, useEffect } from 'react';
import { Bell, AlertCircle, ShieldAlert, Clock, CheckCircle2, Mail, Trophy } from 'lucide-react';

export const NOTIF_SETTINGS_KEY = 'NOTIF_SETTINGS_V1';

export interface NotifSettings {
  taskAlerts: boolean;
  contractAlerts: boolean;
}

export const defaultNotifSettings: NotifSettings = {
  taskAlerts: true,
  contractAlerts: true,
};

export function loadNotifSettings(): NotifSettings {
  try {
    const raw = localStorage.getItem(NOTIF_SETTINGS_KEY);
    if (!raw) return defaultNotifSettings;
    return { ...defaultNotifSettings, ...JSON.parse(raw) };
  } catch {
    return defaultNotifSettings;
  }
}

export const NOTIF_SETTINGS_EVENT = 'notif-settings-changed';

function saveNotifSettings(s: NotifSettings) {
  localStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent(NOTIF_SETTINGS_EVENT));
}

interface ToggleRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  badge?: string;
}

function ToggleRow({ icon, title, description, enabled, onChange, badge }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${enabled ? 'text-blue-500' : 'text-gray-300'}`}>{icon}</div>
        <div>
          <div className="flex items-center gap-2">
            <p className={`text-sm font-semibold ${enabled ? 'text-gray-800' : 'text-gray-400'}`}>{title}</p>
            {badge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-medium">{badge}</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-blue-500' : 'bg-gray-200'}`}
        aria-label={enabled ? 'Desactivar' : 'Activar'}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}

export const NotificationSettings: React.FC = () => {
  const [settings, setSettings] = useState<NotifSettings>(loadNotifSettings);
  const [emailLeadWon, setEmailLeadWon] = useState(true);
  const [saved, setSaved] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailLoading, setEmailLoading] = useState(true);

  // Load server-side email settings
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setEmailLeadWon(data.emailLeadWon !== false);
        setEmailLoading(false);
      })
      .catch(() => setEmailLoading(false));
  }, []);

  // Save frontend notification settings to localStorage
  useEffect(() => {
    saveNotifSettings(settings);
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [settings]);

  function update(key: keyof NotifSettings, value: boolean) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  async function updateEmailLeadWon(value: boolean) {
    setEmailLeadWon(value);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailLeadWon: value }),
      });
      setEmailSaved(true);
      setTimeout(() => setEmailSaved(false), 1500);
    } catch {
      // revert on error
      setEmailLeadWon(!value);
    }
  }

  const anySaved = saved || emailSaved;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-xl bg-blue-50">
          <Bell size={22} className="text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configuración de Notificaciones</h1>
          <p className="text-sm text-gray-500">Habilita o deshabilita cada tipo de alerta y correo automático.</p>
        </div>
        {anySaved && (
          <span className="ml-auto flex items-center gap-1 text-xs text-green-600 font-medium">
            <CheckCircle2 size={14} /> Guardado
          </span>
        )}
      </div>

      {/* In-app alerts */}
      <div className="space-y-3 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Alertas en la app</p>

        <ToggleRow
          icon={<Clock size={18} />}
          title="Tareas vencidas o por vencer"
          description="Muestra alertas cuando una tarea de un lead llega a su fecha límite o está vencida."
          enabled={settings.taskAlerts}
          onChange={v => update('taskAlerts', v)}
        />

        <ToggleRow
          icon={<ShieldAlert size={18} />}
          title="Vencimiento de contratos"
          description="Muestra alertas cuando un contrato de soporte expira o está próximo a expirar (≤ 30 días)."
          enabled={settings.contractAlerts}
          onChange={v => update('contractAlerts', v)}
        />
      </div>

      {/* Email notifications */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Notificaciones por correo</p>

        {emailLoading ? (
          <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm text-sm text-gray-400">Cargando...</div>
        ) : (
          <ToggleRow
            icon={<Trophy size={18} />}
            title="Lead ganado — correo a administradores"
            description="Envía un correo automático a todos los administradores cuando un lead pasa a Closed Won."
            enabled={emailLeadWon}
            onChange={updateEmailLeadWon}
            badge="Email"
          />
        )}
      </div>

      {/* Info box */}
      <div className="mt-6 flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
        <AlertCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">
          Las alertas de app se aplican de inmediato. El correo de lead ganado requiere que el servidor tenga SMTP configurado en el <code className="font-mono bg-amber-100 px-0.5 rounded">.env</code>.
        </p>
      </div>
    </div>
  );
};
