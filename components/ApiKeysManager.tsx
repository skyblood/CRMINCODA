import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Copy, Check, RefreshCw, ShieldCheck, ShieldOff, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { apiFetch, sanitizeId } from '../services/apiFetch';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  createdBy?: string;
}

const ALL_SCOPES = ['leads', 'pipeline', 'projects', 'contacts', 'users', 'transactions', 'financials', 'cash', 'goals', 'commissions', 'leads:write'];

const SCOPE_LABELS: Record<string, string> = {
  leads: 'Leads',
  pipeline: 'Pipeline',
  projects: 'Projects',
  contacts: 'Contacts',
  users: 'Users',
  transactions: 'Transactions',
  financials: 'Financials',
  cash: 'Cash',
  goals: 'Goals',
  commissions: 'Commissions',
  'leads:write': 'Leads (write)',
};

export const ApiKeysManager: React.FC = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState<string[]>([...ALL_SCOPES]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch('/api/apikeys');
      setKeys(await r.json());
    } catch { setError('Error cargando claves'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!newName.trim()) { setError('Ingresa un nombre para la clave.'); return; }
    setError('');
    try {
      const r = await apiFetch('/api/apikeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), scopes: newScopes }),
      });
      const data = await r.json();
      if (data.error) { setError(data.error); return; }
      setNewKey(data.plainKey);
      setNewName('');
      setNewScopes([...ALL_SCOPES]);
      setCreating(false);
      load();
    } catch { setError('Error creando clave'); }
  };

  const toggleActive = async (key: ApiKey) => {
    await apiFetch(`/api/apikeys/${sanitizeId(key.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !key.active }),
    });
    load();
  };

  const deleteKey = async (id: string) => {
    if (!confirm('¿Eliminar esta clave permanentemente?')) return;
    await apiFetch(`/api/apikeys/${sanitizeId(id)}`, { method: 'DELETE' });
    load();
  };

  const copyKey = () => {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleScope = (scope: string) => {
    setNewScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-50">
            <Key size={22} className="text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">API Keys</h1>
            <p className="text-sm text-gray-500">Gestiona el acceso externo al CRM (Claude COWORK, integraciones).</p>
          </div>
        </div>
        <button
          onClick={() => { setCreating(true); setNewKey(null); setError(''); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#410074' }}
        >
          <Plus size={15} /> Nueva clave
        </button>
      </div>

      {/* New key revealed */}
      {newKey && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Check size={16} className="text-green-600" />
            <p className="text-sm font-bold text-green-800">Clave creada — cópiala ahora, no se mostrará de nuevo.</p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 bg-white border border-green-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 break-all">
              {showKey ? newKey : newKey.replace(/./g, '•').slice(0, 40) + '…'}
            </code>
            <button onClick={() => setShowKey(v => !v)} className="p-2 text-gray-400 hover:text-gray-700">
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button onClick={copyKey} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-100 hover:bg-green-200 text-green-800 text-xs font-medium">
              {copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {creating && (
        <div className="mb-6 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
          <p className="text-sm font-semibold text-gray-800 mb-3">Nueva API Key</p>
          <input
            type="text"
            placeholder="Nombre (ej: Claude COWORK)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-purple-300"
            autoFocus
          />
          <p className="text-xs text-gray-500 mb-2 font-medium">Permisos (scopes):</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {ALL_SCOPES.map(scope => (
              <button
                key={scope}
                onClick={() => toggleScope(scope)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  newScopes.includes(scope)
                    ? 'bg-purple-100 border-purple-300 text-purple-800'
                    : 'bg-gray-50 border-gray-200 text-gray-400'
                }`}
              >
                {SCOPE_LABELS[scope]}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={create} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#410074' }}>
              Crear
            </button>
            <button onClick={() => { setCreating(false); setError(''); }} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Keys list */}
      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Cargando...</div>
      ) : keys.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
          <Key size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400">No hay API keys. Crea una para conectar integraciones externas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map(key => (
            <div key={key.id} className={`flex items-center gap-4 p-4 bg-white rounded-xl border shadow-sm transition-opacity ${!key.active ? 'opacity-50' : ''}`}>
              <div className={`p-2 rounded-lg ${key.active ? 'bg-purple-50' : 'bg-gray-100'}`}>
                {key.active ? <ShieldCheck size={18} className="text-purple-600" /> : <ShieldOff size={18} className="text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800 truncate">{key.name}</p>
                  {!key.active && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">Revocada</span>}
                </div>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{key.keyPrefix}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {key.scopes.map(s => (
                    <span key={s} className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-100">{SCOPE_LABELS[s] || s}</span>
                  ))}
                </div>
              </div>
              <div className="text-right text-xs text-gray-400 shrink-0">
                <p>{key.lastUsedAt ? `Usado: ${new Date(key.lastUsedAt).toLocaleDateString()}` : 'Nunca usado'}</p>
                <p className="mt-0.5">Creado: {new Date(key.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleActive(key)}
                  title={key.active ? 'Revocar' : 'Activar'}
                  className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  onClick={() => deleteKey(key.id)}
                  title="Eliminar"
                  className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* API reference */}
      <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-100">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle size={14} className="text-gray-500" />
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Referencia rápida</p>
        </div>
        <div className="space-y-1">
          {[
            ['GET', '/api/v1/', 'Discovery — lista endpoints disponibles'],
            ['GET', '/api/v1/leads', 'Todos los leads activos [?stage= &manufacturer=]'],
            ['GET', '/api/v1/leads/:id', 'Lead por ID'],
            ['POST', '/api/v1/leads', 'Crear lead (requiere scope leads:write)'],
            ['GET', '/api/v1/pipeline', 'Resumen del pipeline (conteos y valores por etapa)'],
            ['GET', '/api/v1/pipeline-forecast', 'Forecast del pipeline por etapa'],
            ['GET', '/api/v1/projects', 'Proyectos [?status= &type=]'],
            ['GET', '/api/v1/projects/:id', 'Proyecto completo con tickets y logs'],
            ['GET', '/api/v1/contacts', 'Contactos'],
            ['GET', '/api/v1/users', 'Usuarios (sin contraseñas)'],
            ['GET', '/api/v1/transactions', 'Transacciones'],
            ['GET', '/api/v1/financials/summary', 'Resumen financiero (P&L)'],
            ['GET', '/api/v1/cash/summary', 'Posición de caja'],
            ['GET', '/api/v1/cash/mercury-status', 'Estado de la cuenta Mercury'],
            ['GET', '/api/v1/goals', 'Metas de ingresos'],
            ['GET', '/api/v1/commissions/summary', 'Resumen de comisiones'],
          ].map(([method, path, desc]) => (
            <div key={path} className="flex items-start gap-2 text-xs">
              <span className="font-mono font-bold text-purple-600 shrink-0">{method}</span>
              <span className="font-mono text-gray-700 shrink-0">{path}</span>
              <span className="text-gray-400">— {desc}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Autenticación: <code className="font-mono bg-gray-100 px-1 rounded">Authorization: Bearer crm_bm_…</code>
            &nbsp;ó&nbsp;
            <code className="font-mono bg-gray-100 px-1 rounded">X-API-Key: crm_bm_…</code>
          </p>
        </div>
      </div>
    </div>
  );
};
