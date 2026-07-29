// components/ledger/JournalTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Ban } from 'lucide-react';
import type { LedgerAccount, JournalEntry, JournalLine } from '../../types';
import { apiFetch, sanitizeId } from '../../services/apiFetch';

type DraftLine = { accountId: string; side: 'debit' | 'credit'; amount: string };

function formatUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function JournalTab() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { accountId: '', side: 'debit', amount: '' },
    { accountId: '', side: 'credit', amount: '' },
  ]);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    const [entriesRes, accountsRes] = await Promise.all([
      apiFetch('/api/journal-entries'),
      apiFetch('/api/ledger-accounts'),
    ]);
    if (entriesRes.ok) setEntries(await entriesRes.json());
    if (accountsRes.ok) setAccounts(await accountsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const accountsById = Object.fromEntries(accounts.map(a => [a.id, a]));

  // Only count lines that would actually be included in the submitted payload
  // (accountId set and amount > 0) — otherwise the UI can show "Balanceado"
  // for a set of lines that differs from what handleSubmit actually POSTs.
  const submittableLines = draftLines.filter(l => l.accountId && Number(l.amount) > 0);
  const totalDebit = submittableLines.filter(l => l.side === 'debit').reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const totalCredit = submittableLines.filter(l => l.side === 'credit').reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const isBalanced = submittableLines.length >= 2 && Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const addLine = () => setDraftLines([...draftLines, { accountId: '', side: 'debit', amount: '' }]);
  const updateLine = (i: number, patch: Partial<DraftLine>) => {
    setDraftLines(draftLines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  };

  const resetForm = () => {
    setMemo(''); setDraftLines([{ accountId: '', side: 'debit', amount: '' }, { accountId: '', side: 'credit', amount: '' }]);
    setShowForm(false); setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) { setError('Los débitos deben ser iguales a los créditos.'); return; }
    const lines: Partial<JournalLine>[] = submittableLines
      .map(l => ({
        accountId: l.accountId,
        debit: l.side === 'debit' ? Number(l.amount) : 0,
        credit: l.side === 'credit' ? Number(l.amount) : 0,
        currency: 'USD',
        exchangeRateToUSD: 1,
        amountUSD: Number(l.amount),
      }));
    const res = await apiFetch('/api/journal-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, memo, source: 'manual', lines }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Error desconocido' }));
      setError(body.error);
      return;
    }
    resetForm();
    fetchAll();
  };

  const voidEntry = async (id: string) => {
    await apiFetch(`/api/journal-entries/${sanitizeId(id)}/void`, { method: 'POST' });
    fetchAll();
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Cargando libro diario...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Libro Diario</h2>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 bg-purple-700 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-purple-800">
          <Plus size={16} /> Asiento Manual
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex gap-3 mb-3">
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="border border-gray-300 rounded-lg p-2 text-sm" />
            <input placeholder="Memo" value={memo} onChange={e => setMemo(e.target.value)} className="flex-1 border border-gray-300 rounded-lg p-2 text-sm" />
          </div>
          {draftLines.map((line, i) => (
            <div key={i} className="flex gap-2 mb-2 items-center">
              <select value={line.accountId} onChange={e => updateLine(i, { accountId: e.target.value })} className="border border-gray-300 rounded-lg p-2 text-sm flex-1">
                <option value="">-- Cuenta --</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
              <select value={line.side} onChange={e => updateLine(i, { side: e.target.value as 'debit' | 'credit' })} className="border border-gray-300 rounded-lg p-2 text-sm">
                <option value="debit">Débito</option>
                <option value="credit">Crédito</option>
              </select>
              <input type="number" min="0" step="0.01" value={line.amount} onChange={e => updateLine(i, { amount: e.target.value })} className="border border-gray-300 rounded-lg p-2 text-sm w-32" placeholder="Monto" />
            </div>
          ))}
          <button type="button" onClick={addLine} className="text-sm text-purple-700 mb-3">+ Agregar línea</button>
          <div className="text-sm mb-3">
            Débitos: {formatUSD(totalDebit)} — Créditos: {formatUSD(totalCredit)} — {isBalanced ? <span className="text-green-600">Balanceado</span> : <span className="text-red-600">Descuadrado</span>}
          </div>
          {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={!isBalanced} className="bg-purple-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg">Guardar Asiento</button>
            <button type="button" onClick={resetForm} className="text-gray-500 text-sm px-3 py-2">Cancelar</button>
          </div>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-4">Fecha</th><th className="py-2 pr-4">Memo</th><th className="py-2 pr-4">Origen</th><th className="py-2 pr-4">Líneas</th><th className="py-2 pr-4">Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr key={entry._id} className={`border-b border-gray-100 align-top ${entry.status === 'void' ? 'opacity-40' : ''}`}>
              <td className="py-2 pr-4">{new Date(entry.date).toLocaleDateString()}</td>
              <td className="py-2 pr-4">{entry.memo || '—'}</td>
              <td className="py-2 pr-4 capitalize">{entry.source}</td>
              <td className="py-2 pr-4">
                {entry.lines.map((l, idx) => (
                  <div key={idx}>{accountsById[l.accountId]?.name || l.accountId}: {l.debit > 0 ? `Db ${formatUSD(l.amountUSD)}` : `Cr ${formatUSD(l.amountUSD)}`}</div>
                ))}
              </td>
              <td className="py-2 pr-4 capitalize">{entry.status}</td>
              <td className="py-2">
                {entry.status === 'posted' && entry._id && (
                  <button onClick={() => voidEntry(entry._id!)} className="text-gray-400 hover:text-red-600" title="Anular"><Ban size={14} /></button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
