// components/ledger/ChartOfAccountsTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, X } from 'lucide-react';
import type { LedgerAccount, LedgerAccountType } from '../../types';
import { apiFetch, sanitizeId } from '../../services/apiFetch';

const TYPE_LABELS: Record<LedgerAccountType, string> = {
  asset: 'Activo', liability: 'Pasivo', equity: 'Patrimonio', income: 'Ingreso', expense: 'Gasto',
};

export function ChartOfAccountsTab() {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', name: '', type: 'expense' as LedgerAccountType, taxCategory: '' });

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiFetch('/api/ledger-accounts');
      if (res.ok) setAccounts(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const resetForm = () => { setForm({ code: '', name: '', type: 'expense', taxCategory: '' }); setEditingId(null); setShowForm(false); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await apiFetch(`/api/ledger-accounts/${sanitizeId(editingId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    } else {
      await apiFetch('/api/ledger-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id: `la_${Date.now()}` }),
      });
    }
    resetForm();
    fetchAccounts();
  };

  const startEdit = (account: LedgerAccount) => {
    setForm({ code: account.code, name: account.name, type: account.type, taxCategory: account.taxCategory || '' });
    setEditingId(account.id);
    setShowForm(true);
  };

  const toggleActive = async (account: LedgerAccount) => {
    await apiFetch(`/api/ledger-accounts/${sanitizeId(account.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !account.isActive }),
    });
    fetchAccounts();
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Cargando plan de cuentas...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Plan de Cuentas</h2>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1 bg-purple-700 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-purple-800">
          <Plus size={16} /> Nueva Cuenta
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Código</label>
            <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="border border-gray-300 rounded-lg p-2 text-sm w-24" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="border border-gray-300 rounded-lg p-2 text-sm w-56" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as LedgerAccountType })} className="border border-gray-300 rounded-lg p-2 text-sm">
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {form.type === 'expense' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Categoría Schedule C</label>
              <input value={form.taxCategory} onChange={e => setForm({ ...form, taxCategory: e.target.value })} className="border border-gray-300 rounded-lg p-2 text-sm w-56" placeholder="ej. Office Expense" />
            </div>
          )}
          <button type="submit" className="bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-800">Guardar</button>
          <button type="button" onClick={resetForm} className="text-gray-500 text-sm px-3 py-2"><X size={16} /></button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-4">Código</th><th className="py-2 pr-4">Nombre</th><th className="py-2 pr-4">Tipo</th><th className="py-2 pr-4">Naturaleza</th><th className="py-2 pr-4">Categoría Fiscal</th><th className="py-2 pr-4">Activa</th><th></th>
          </tr>
        </thead>
        <tbody>
          {[...accounts].sort((a, b) => a.code.localeCompare(b.code)).map(account => (
            <tr key={account.id} className={`border-b border-gray-100 ${!account.isActive ? 'opacity-50' : ''}`}>
              <td className="py-2 pr-4 font-mono">{account.code}</td>
              <td className="py-2 pr-4">{account.name}</td>
              <td className="py-2 pr-4">{TYPE_LABELS[account.type]}</td>
              <td className="py-2 pr-4 capitalize">{account.normalBalance}</td>
              <td className="py-2 pr-4">{account.taxCategory || '—'}</td>
              <td className="py-2 pr-4">
                <input type="checkbox" checked={account.isActive} onChange={() => toggleActive(account)} />
              </td>
              <td className="py-2"><button onClick={() => startEdit(account)} className="text-gray-400 hover:text-purple-700"><Edit2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
