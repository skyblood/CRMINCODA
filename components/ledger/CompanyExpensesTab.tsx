// components/ledger/CompanyExpensesTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import type { Transaction, TaxCategory } from '../../types';
import { apiFetch } from '../../services/apiFetch';

export const TAX_CATEGORIES: TaxCategory[] = [
  'Advertising', 'Contract Labor', 'Office Expense', 'Insurance',
  'Legal & Professional Services', 'Rent', 'Supplies', 'Taxes & Licenses',
  'Travel', 'Meals', 'Utilities', 'Other Expenses',
];

export function CompanyExpensesTab() {
  const [expenses, setExpenses] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', amount: 0, date: new Date().toISOString().split('T')[0], taxCategory: 'Office Expense' as TaxCategory, description: '' });
  const [error, setError] = useState('');

  const fetchExpenses = useCallback(async () => {
    const res = await apiFetch('/api/transactions');
    if (res.ok) {
      const all: Transaction[] = await res.json();
      setExpenses(all.filter(t => t.type === 'expense' && !t.projectId && !t.leadId && t.taxCategory));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const resetForm = () => {
    setForm({ title: '', amount: 0, date: new Date().toISOString().split('T')[0], taxCategory: 'Office Expense', description: '' });
    setShowForm(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await apiFetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `tx_${Date.now()}`,
        title: form.title,
        amount: form.amount,
        amountUSD: form.amount,
        currency: 'USD',
        exchangeRateToUSD: 1,
        date: form.date,
        dateObj: new Date(form.date),
        type: 'expense',
        category: 'other',
        taxCategory: form.taxCategory,
        description: form.description,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Error desconocido' }));
      setError(body.error);
      return;
    }
    resetForm();
    fetchExpenses();
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Cargando gastos...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Gastos de la Empresa</h2>
          <p className="text-xs text-gray-500">Gastos generales no ligados a un proyecto o cliente (renta, seguros, suscripciones...). Para gastos de proyecto, usa Finance.</p>
        </div>
        <button onClick={() => { setError(''); setShowForm(true); }} className="flex items-center gap-1 bg-purple-700 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-purple-800">
          <Plus size={16} /> Nuevo Gasto
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Título</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Monto (USD)</label>
            <input required type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
            <input required type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Categoría (Schedule C)</label>
            <select required value={form.taxCategory} onChange={e => setForm({ ...form, taxCategory: e.target.value as TaxCategory })} className="w-full border border-gray-300 rounded-lg p-2 text-sm">
              {TAX_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
          </div>
          {error && <div className="col-span-2 text-sm text-red-600">{error}</div>}
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Guardar</button>
            <button type="button" onClick={resetForm} className="text-gray-500 text-sm px-3 py-2">Cancelar</button>
          </div>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-4">Fecha</th><th className="py-2 pr-4">Título</th><th className="py-2 pr-4">Categoría</th><th className="py-2 pr-4">Monto</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map(exp => (
            <tr key={exp.id} className="border-b border-gray-100">
              <td className="py-2 pr-4">{exp.date}</td>
              <td className="py-2 pr-4">{exp.title}</td>
              <td className="py-2 pr-4">{exp.taxCategory}</td>
              <td className="py-2 pr-4">${exp.amount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
