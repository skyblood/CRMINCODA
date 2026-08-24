// components/ledger/TenNinetyNineTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { NineninenineRow } from '../../types';
import { apiFetch } from '../../services/apiFetch';

export function TenNinetyNineTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<NineninenineRow[]>([]);

  const fetchRows = useCallback(async () => {
    const res = await apiFetch(`/api/ledger-reports/1099?year=${year}`);
    if (res.ok) setRows(await res.json());
  }, [year]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Reporte 1099-NEC</h2>
      <p className="text-xs text-gray-500 mb-4">
        Suma de pagos a contratistas (cuenta Contract Labor) por año. No presenta el 1099 ante el IRS —
        usa estos datos con un CPA o un servicio de e-filing (Track1099, IRS FIRE).
      </p>
      <div className="flex items-center gap-3 mb-4">
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="border border-gray-300 rounded-lg p-2 text-sm w-28" />
        <a
          href={`/api/ledger-reports/1099/export?year=${year}`}
          className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2"
        >
          Exportar CSV
        </a>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-4">Contratista</th>
            <th className="py-2 pr-4">Total Pagado (USD)</th>
            <th className="py-2 pr-4">¿Cruza $600?</th>
            <th className="py-2 pr-4">W-9</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.entityId} className="border-b border-gray-100">
              <td className="py-2 pr-4">{r.name}</td>
              <td className="py-2 pr-4">${r.totalUSD.toLocaleString()}</td>
              <td className="py-2 pr-4">{r.crossesThreshold ? <span className="text-amber-700 font-medium">Sí — requiere 1099-NEC</span> : 'No'}</td>
              <td className="py-2 pr-4">
                {r.hasTIN
                  ? <span className="text-green-700">✓</span>
                  : <span className="text-red-700 font-medium">Sin W-9</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
