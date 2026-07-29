// components/ledger/ReportsTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { PLReport, BalanceSheetReport } from '../../types';
import { apiFetch } from '../../services/apiFetch';

function formatUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function ReportsTab() {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [pl, setPl] = useState<PLReport | null>(null);
  const [bs, setBs] = useState<BalanceSheetReport | null>(null);

  const fetchReports = useCallback(async () => {
    const [plRes, bsRes] = await Promise.all([
      apiFetch(`/api/ledger-reports/pl?start=${start}&end=${end}`),
      apiFetch(`/api/ledger-reports/balance-sheet?asOf=${end}`),
    ]);
    if (plRes.ok) setPl(await plRes.json());
    if (bsRes.ok) setBs(await bsRes.json());
  }, [start, end]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Reportes Financieros</h2>
      <div className="flex gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className="border border-gray-300 rounded-lg p-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border border-gray-300 rounded-lg p-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Estado de Resultados (P&L)</h3>
          {pl && (
            <>
              <table className="w-full text-sm mb-3">
                <tbody>
                  {pl.byAccount.map(a => (
                    <tr key={a.code} className="border-b border-gray-100">
                      <td className="py-1">{a.name}</td>
                      <td className="py-1 text-right">{formatUSD(a.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between text-sm"><span>Ingresos Totales</span><span>{formatUSD(pl.totalIncome)}</span></div>
              <div className="flex justify-between text-sm"><span>Gastos Totales</span><span>{formatUSD(pl.totalExpense)}</span></div>
              <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-2 mt-2"><span>Utilidad Neta</span><span>{formatUSD(pl.netIncome)}</span></div>
            </>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Balance General</h3>
          {bs && (
            <>
              {!bs.balanced && (
                <div className="text-sm text-red-600 mb-3">⚠ Activos ≠ Pasivos + Patrimonio — revisar asientos.</div>
              )}
              <table className="w-full text-sm mb-3">
                <tbody>
                  {bs.byAccount.map(a => (
                    <tr key={a.code} className="border-b border-gray-100">
                      <td className="py-1">{a.name}</td>
                      <td className="py-1 text-right">{formatUSD(a.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between text-sm"><span>Total Activos</span><span>{formatUSD(bs.totalAssets)}</span></div>
              <div className="flex justify-between text-sm"><span>Total Pasivos</span><span>{formatUSD(bs.totalLiabilities)}</span></div>
              <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-2 mt-2"><span>Total Patrimonio</span><span>{formatUSD(bs.totalEquity)}</span></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
