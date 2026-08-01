// components/Ledger.tsx
import React, { useState } from 'react';
import { BookOpen, ListTree, Wallet, FileBarChart, Landmark, FileSpreadsheet } from 'lucide-react';
import { ChartOfAccountsTab } from './ledger/ChartOfAccountsTab';
import { JournalTab } from './ledger/JournalTab';
import { CompanyExpensesTab } from './ledger/CompanyExpensesTab';
import { ReportsTab } from './ledger/ReportsTab';
import { ReconciliationTab } from './ledger/ReconciliationTab';
import { TenNinetyNineTab } from './ledger/TenNinetyNineTab';

type TabKey = 'accounts' | 'journal' | 'expenses' | 'reports' | 'reconciliation' | '1099';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'expenses', label: 'Gastos de la Empresa', icon: Wallet },
  { key: 'journal', label: 'Libro Diario', icon: BookOpen },
  { key: 'accounts', label: 'Plan de Cuentas', icon: ListTree },
  { key: 'reconciliation', label: 'Conciliación Mercury', icon: Landmark },
  { key: 'reports', label: 'P&L / Balance Sheet', icon: FileBarChart },
  { key: '1099', label: 'Reporte 1099', icon: FileSpreadsheet },
];

export function Ledger() {
  const [activeTab, setActiveTab] = useState<TabKey>('expenses');

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 bg-white px-6 pt-4">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Contabilidad</h1>
        <div className="flex gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition ${activeTab === tab.key ? 'border-purple-700 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-white">
        {activeTab === 'expenses' && <CompanyExpensesTab />}
        {activeTab === 'journal' && <JournalTab />}
        {activeTab === 'accounts' && <ChartOfAccountsTab />}
        {activeTab === 'reconciliation' && <ReconciliationTab />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === '1099' && <TenNinetyNineTab />}
      </div>
    </div>
  );
}
