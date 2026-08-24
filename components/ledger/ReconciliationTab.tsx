// components/ledger/ReconciliationTab.tsx
import React, { useState } from 'react';
import { Upload, CheckCircle, AlertTriangle, HelpCircle, Sparkles } from 'lucide-react';
import { apiFetch } from '../../services/apiFetch';

type ImportResult = {
  matched: { bankRow: Record<string, string>; journalEntryId: string; lineIndex: number }[];
  suggested: { bankRow: Record<string, string>; journalEntryId: string; lineIndex: number; confidence: number; reasons: string[] }[];
  unmatched: { journalEntryId: string; lineIndex: number; date: string; amount: number }[];
  missing: { bankRow: Record<string, string> }[];
  parseErrors: { row: number; message: string }[];
};

export function ReconciliationTab() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const csv = await file.text();
      const res = await apiFetch('/api/mercury-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      if (res.ok) {
        setResult(await res.json());
      } else {
        const body = await res.json().catch(() => ({ error: 'Error desconocido' }));
        setError(body.error || 'No se pudo procesar el CSV.');
      }
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const confirmMatch = async (journalEntryId: string, lineIndex: number) => {
    setError('');
    const res = await apiFetch('/api/mercury-import/confirm-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ journalEntryId, lineIndex }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Error desconocido' }));
      setError(body.error || 'No se pudo marcar la línea como conciliada.');
      return;
    }
    setResult(r => r ? {
      ...r,
      unmatched: r.unmatched.filter(u => !(u.journalEntryId === journalEntryId && u.lineIndex === lineIndex)),
      suggested: r.suggested.filter(s => !(s.journalEntryId === journalEntryId && s.lineIndex === lineIndex)),
    } : r);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Conciliación Mercury</h2>
      <label className="flex items-center gap-2 w-fit cursor-pointer bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-800 mb-6">
        <Upload size={16} /> Subir CSV de Mercury
        <input type="file" accept=".csv" className="hidden" onChange={handleFile} disabled={busy} />
      </label>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-6">{error}</div>
      )}

      {result && (
        <div className="space-y-6">
          {result.parseErrors.length > 0 && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {result.parseErrors.length} fila(s) del CSV no se pudieron leer: {result.parseErrors.map(e => `fila ${e.row}`).join(', ')}
            </div>
          )}

          <div>
            <h3 className="flex items-center gap-2 font-semibold text-green-700 mb-2"><CheckCircle size={16} /> Conciliadas ({result.matched.length})</h3>
            <p className="text-xs text-gray-500">Coinciden automáticamente por fecha y monto con un asiento existente.</p>
          </div>

          {result.suggested.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-purple-700 mb-2"><Sparkles size={16} /> Sugeridas ({result.suggested.length})</h3>
              <p className="text-xs text-gray-500 mb-2">Coinciden parcialmente por monto, fecha y/o descripción — requieren confirmación manual.</p>
              {result.suggested.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-gray-100 py-2 gap-3">
                  <div className="min-w-0">
                    <div>{s.bankRow.Date} — {s.bankRow.Description} — ${s.bankRow.Amount}</div>
                    <div className="text-[11px] text-gray-400 truncate">{Math.round(s.confidence * 100)}% de confianza · {s.reasons.join(', ')}</div>
                  </div>
                  <button onClick={() => confirmMatch(s.journalEntryId, s.lineIndex)} className="text-purple-700 text-xs whitespace-nowrap flex-shrink-0">Confirmar match</button>
                </div>
              ))}
            </div>
          )}

          <div>
            <h3 className="flex items-center gap-2 font-semibold text-amber-700 mb-2"><AlertTriangle size={16} /> Sin conciliar en el libro ({result.unmatched.length})</h3>
            <p className="text-xs text-gray-500 mb-2">Movimientos de Cash en el libro que no aparecieron en el statement del banco — revisar.</p>
            {result.unmatched.map((u, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-gray-100 py-2">
                <span>{new Date(u.date).toLocaleDateString()} — ${Math.abs(u.amount).toLocaleString()}</span>
                <button onClick={() => confirmMatch(u.journalEntryId, u.lineIndex)} className="text-purple-700 text-xs">Marcar como conciliado manualmente</button>
              </div>
            ))}
          </div>

          <div>
            <h3 className="flex items-center gap-2 font-semibold text-red-700 mb-2"><HelpCircle size={16} /> Faltantes en el libro ({result.missing.length})</h3>
            <p className="text-xs text-gray-500 mb-2">Movimientos del banco sin asiento contable — crea el gasto/asiento correspondiente en la pestaña Gastos de la Empresa o Libro Diario.</p>
            {result.missing.map((m, i) => (
              <div key={i} className="text-sm border-b border-gray-100 py-2">
                {m.bankRow.Date} — {m.bankRow.Description} — ${m.bankRow.Amount}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
