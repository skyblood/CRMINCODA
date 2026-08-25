// components/ledger/ReconciliationTab.tsx
import React, { useState, useEffect } from 'react';
import { Upload, CheckCircle, AlertTriangle, HelpCircle, Sparkles, RefreshCw, Undo2 } from 'lucide-react';
import { apiFetch } from '../../services/apiFetch';

type ImportResult = {
  matched: { bankRow: Record<string, string>; journalEntryId: string; lineIndex: number }[];
  suggested: { bankRow: Record<string, string>; journalEntryId: string; lineIndex: number; confidence: number; reasons: string[] }[];
  unmatched: { journalEntryId: string; lineIndex: number; date: string; amount: number }[];
  missing: { bankRow: Record<string, string> & { mercuryTransactionId?: string; mercurySuggestedTaxCategory?: string; dashboardLink?: string } }[];
  parseErrors: { row: number; message: string }[];
};

type MercuryAccount = { id: string; name: string; type: string };

// Approved this session, in memory only — the backend has no "approved"
// list of its own (once approved, a row simply disappears from `missing`
// on the next sync since its JournalEntry now matches). Kept here purely
// so the user has a short window to click "Deshacer" without re-syncing.
type ApprovedRow = { mercuryTransactionId: string; bankRow: Record<string, string>; taxCategory: string };

// Mirrors CompanyExpensesTab.tsx's own hardcoded list — the Schedule C
// categories a user can pick from when approving a Mercury row.
const TAX_CATEGORIES = [
  'Advertising', 'Contract Labor', 'Office Expense', 'Insurance',
  'Legal & Professional Services', 'Rent', 'Supplies', 'Taxes & Licenses',
  'Travel', 'Meals', 'Utilities', 'Other Expenses',
];

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export function ReconciliationTab() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<MercuryAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [{ start, end }, setDateRange] = useState(defaultDateRange());
  const [syncing, setSyncing] = useState(false);
  const [accountsError, setAccountsError] = useState('');
  const [approvedRows, setApprovedRows] = useState<ApprovedRow[]>([]);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});

  const categoryFor = (bankRow: Record<string, string>) => {
    const id = bankRow.mercuryTransactionId;
    if (id && categoryOverrides[id]) return categoryOverrides[id];
    return bankRow.mercurySuggestedTaxCategory || 'Other Expenses';
  };

  useEffect(() => {
    apiFetch('/api/mercury-import/accounts')
      .then(async res => {
        if (!res.ok) {
          setAccountsError('No se pudieron cargar las cuentas de Mercury — revisa la configuración de MERCURY_API_TOKEN.');
          return [];
        }
        setAccountsError('');
        return res.json();
      })
      .then((list: MercuryAccount[]) => {
        setAccounts(list);
        if (list.length > 0) setAccountId(list[0].id);
      })
      .catch(() => {
        setAccounts([]);
        setAccountsError('No se pudieron cargar las cuentas de Mercury — revisa la configuración de MERCURY_API_TOKEN.');
      });
  }, []);

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

  const handleSync = async () => {
    if (!accountId) return;
    setBusy(true);
    setSyncing(true);
    setError('');
    try {
      const res = await apiFetch('/api/mercury-import/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, start, end }),
      });
      if (res.ok) {
        setResult(await res.json());
      } else {
        const body = await res.json().catch(() => ({ error: 'Error desconocido' }));
        setError(body.error || 'No se pudo sincronizar con Mercury.');
      }
    } finally {
      setBusy(false);
      setSyncing(false);
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

  const approveMissing = async (mercuryTransactionId: string, bankRow: Record<string, string>) => {
    setError('');
    const res = await apiFetch('/api/mercury-import/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mercuryTransactionId, taxCategory: categoryFor(bankRow) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Error desconocido' }));
      setError(body.error || 'No se pudo aprobar el gasto.');
      return;
    }
    const body = await res.json().catch(() => ({ taxCategory: categoryFor(bankRow) }));
    setResult(r => r ? {
      ...r,
      missing: r.missing.filter(m => m.bankRow.mercuryTransactionId !== mercuryTransactionId),
    } : r);
    setApprovedRows(rows => [{ mercuryTransactionId, bankRow, taxCategory: body.taxCategory }, ...rows]);
  };

  const [bulkApproving, setBulkApproving] = useState(false);

  const approveAllMissing = async () => {
    if (!result) return;
    const eligible = result.missing.filter(m => m.bankRow.mercuryTransactionId && Number(m.bankRow.Amount) < 0);
    if (eligible.length === 0) return;

    setBulkApproving(true);
    setError('');
    try {
      // The server caps /approve-many at 100 items per call — chunk here and
      // send sequential requests, accumulating results across all batches.
      // If a LATER batch's request itself fails (network blip, expired
      // session, etc.), earlier batches have already posted real
      // Transaction/JournalEntry records — we must not discard those results
      // by bailing out early. Instead, record that the batch-level request
      // failed and stop sending further batches, but always fall through to
      // apply whatever allResults were actually accumulated so the UI
      // reflects reality (approved rows move out of "Faltantes") rather than
      // implying nothing happened.
      const allResults: any[] = [];
      let batchRequestFailed = false;
      for (let i = 0; i < eligible.length; i += 100) {
        const batch = eligible.slice(i, i + 100);
        let res: Response;
        try {
          res = await apiFetch('/api/mercury-import/approve-many', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: batch.map(m => ({ mercuryTransactionId: m.bankRow.mercuryTransactionId, taxCategory: categoryFor(m.bankRow) })),
            }),
          });
        } catch {
          batchRequestFailed = true;
          break;
        }
        if (!res.ok) {
          batchRequestFailed = true;
          break;
        }
        const body = await res.json();
        allResults.push(...body.results);
      }

      const approvedIds = new Set(allResults.filter((r: any) => r.status === 'approved').map((r: any) => r.mercuryTransactionId));
      const failedResults = allResults.filter((r: any) => r.status === 'error');

      const newlyApproved: ApprovedRow[] = eligible
        .filter(m => approvedIds.has(m.bankRow.mercuryTransactionId))
        .map(m => {
          const r = allResults.find((x: any) => x.mercuryTransactionId === m.bankRow.mercuryTransactionId);
          return { mercuryTransactionId: m.bankRow.mercuryTransactionId!, bankRow: m.bankRow, taxCategory: r.taxCategory };
        });

      setResult(r => r ? { ...r, missing: r.missing.filter(m => !approvedIds.has(m.bankRow.mercuryTransactionId)) } : r);
      setApprovedRows(rows => [...newlyApproved, ...rows]);

      if (batchRequestFailed) {
        setError(
          `${newlyApproved.length} aprobados, pero una parte del lote falló al conectar con el servidor — revisa e intentá de nuevo con las filas restantes.`
        );
      } else if (failedResults.length > 0) {
        setError(`${failedResults.length} de ${eligible.length} no se pudieron aprobar: ${failedResults.map((r: any) => r.error).join('; ')}`);
      }
    } finally {
      setBulkApproving(false);
    }
  };

  const undoApprove = async (mercuryTransactionId: string) => {
    setError('');
    const res = await apiFetch('/api/mercury-import/unapprove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mercuryTransactionId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Error desconocido' }));
      setError(body.error || 'No se pudo deshacer la aprobación.');
      return;
    }
    setApprovedRows(rows => rows.filter(r => r.mercuryTransactionId !== mercuryTransactionId));
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Conciliación Mercury</h2>
      <div className="flex flex-wrap items-end gap-3 mb-6">
        {accounts.length > 0 && (
          <>
            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Cuenta Mercury</label>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                disabled={busy}
              >
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Desde</label>
              <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={start} onChange={e => setDateRange(r => ({ ...r, start: e.target.value }))} disabled={busy} />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-500 mb-1">Hasta</label>
              <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={end} onChange={e => setDateRange(r => ({ ...r, end: e.target.value }))} disabled={busy} />
            </div>
            <button
              onClick={handleSync}
              disabled={busy || !accountId}
              className="flex items-center gap-2 bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-800 disabled:opacity-50"
            >
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} /> Sincronizar con Mercury
            </button>
          </>
        )}
        <label className="flex items-center gap-2 w-fit cursor-pointer bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200">
          <Upload size={16} /> Subir CSV de Mercury
          <input type="file" accept=".csv" className="hidden" onChange={handleFile} disabled={busy} />
        </label>
      </div>

      {accountsError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-6">{accountsError}</div>
      )}

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
            {result.missing.some(m => m.bankRow.mercuryTransactionId && Number(m.bankRow.Amount) < 0) && (
              <button
                onClick={approveAllMissing}
                disabled={bulkApproving}
                className="text-xs text-white bg-purple-700 hover:bg-purple-800 disabled:opacity-50 rounded-lg px-3 py-1.5 mb-3"
              >
                {bulkApproving ? 'Aprobando...' : `Aprobar todas (${result.missing.filter(m => m.bankRow.mercuryTransactionId && Number(m.bankRow.Amount) < 0).length})`}
              </button>
            )}
            {result.missing.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-gray-100 py-2 gap-3">
                <div className="min-w-0">
                  <div>{m.bankRow.Date} — {m.bankRow.Description} — ${m.bankRow.Amount}</div>
                  {m.bankRow.mercuryTransactionId && (
                    <div className="flex items-center gap-2 mt-1">
                      <select
                        className="text-[11px] border border-gray-200 rounded px-1 py-0.5 text-gray-600"
                        value={categoryFor(m.bankRow)}
                        onChange={e => setCategoryOverrides(prev => ({ ...prev, [m.bankRow.mercuryTransactionId!]: e.target.value }))}
                      >
                        {TAX_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {m.bankRow.dashboardLink && (
                        <a href={m.bankRow.dashboardLink} target="_blank" rel="noreferrer" className="text-[11px] text-purple-600 hover:underline">Ver en Mercury ↗</a>
                      )}
                    </div>
                  )}
                </div>
                {m.bankRow.mercuryTransactionId && Number(m.bankRow.Amount) < 0 && (
                  <button
                    onClick={() => approveMissing(m.bankRow.mercuryTransactionId!, m.bankRow)}
                    className="text-purple-700 text-xs whitespace-nowrap flex-shrink-0"
                  >
                    Aprobar
                  </button>
                )}
              </div>
            ))}
          </div>

          {approvedRows.length > 0 && (
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-green-700 mb-2"><CheckCircle size={16} /> Aprobados recientemente ({approvedRows.length})</h3>
              <p className="text-xs text-gray-500 mb-2">Gastos creados y contabilizados en esta sesión — "Deshacer" anula el asiento y borra el gasto.</p>
              {approvedRows.map(r => (
                <div key={r.mercuryTransactionId} className="flex items-center justify-between text-sm border-b border-gray-100 py-2 gap-3">
                  <div className="min-w-0">
                    <div>{r.bankRow.Date} — {r.bankRow.Description} — ${r.bankRow.Amount}</div>
                    <div className="text-[11px] text-gray-400">{r.taxCategory}</div>
                  </div>
                  <button
                    onClick={() => undoApprove(r.mercuryTransactionId)}
                    className="flex items-center gap-1 text-red-600 text-xs whitespace-nowrap flex-shrink-0"
                  >
                    <Undo2 size={12} /> Deshacer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
