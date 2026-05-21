
import React, { useState, useMemo } from 'react';
import {
  Scale, TrendingUp, AlertTriangle, CheckCircle, Plus, Trash2,
  Edit2, X, ChevronDown, ChevronUp, FileText, Info, BookOpen,
  BarChart2, Shield,
} from 'lucide-react';
import { BalanceSheetAccount, BalanceSheetNote, BSAccountType, InventoryMethod } from '../types';

// ==================================================================================
// CONSTANTS & DEFINITIONS
// ==================================================================================

interface AccountDef {
  section: 'current_assets' | 'noncurrent_assets' | 'current_liabilities' | 'noncurrent_liabilities' | 'equity';
  label: string;
  isContra: boolean;
  order: number;
}

const ACCOUNT_DEFS: Record<BSAccountType, AccountDef> = {
  // CURRENT ASSETS
  cash_equivalents:            { section: 'current_assets',          label: 'Cash and Cash Equivalents',             isContra: false, order: 1 },
  accounts_receivable:         { section: 'current_assets',          label: 'Accounts Receivable, Gross',            isContra: false, order: 2 },
  allowance_doubtful_accounts: { section: 'current_assets',          label: 'Less: Allowance for Doubtful Accounts', isContra: true,  order: 3 },
  inventory:                   { section: 'current_assets',          label: 'Inventory',                             isContra: false, order: 4 },
  prepaid_expenses:            { section: 'current_assets',          label: 'Prepaid Expenses',                      isContra: false, order: 5 },
  other_current_assets:        { section: 'current_assets',          label: 'Other Current Assets',                  isContra: false, order: 6 },
  // NON-CURRENT ASSETS
  fixed_assets_gross:          { section: 'noncurrent_assets',       label: 'Property, Plant & Equipment, Gross',    isContra: false, order: 1 },
  accumulated_depreciation:    { section: 'noncurrent_assets',       label: 'Less: Accumulated Depreciation',        isContra: true,  order: 2 },
  intangible_assets:           { section: 'noncurrent_assets',       label: 'Intangible Assets',                     isContra: false, order: 3 },
  long_term_investments:       { section: 'noncurrent_assets',       label: 'Long-term Investments',                 isContra: false, order: 4 },
  other_noncurrent_assets:     { section: 'noncurrent_assets',       label: 'Other Non-Current Assets',              isContra: false, order: 5 },
  // CURRENT LIABILITIES
  accounts_payable:            { section: 'current_liabilities',     label: 'Accounts Payable',                      isContra: false, order: 1 },
  accrued_expenses:            { section: 'current_liabilities',     label: 'Accrued Expenses',                      isContra: false, order: 2 },
  unearned_revenue:            { section: 'current_liabilities',     label: 'Unearned Revenue',                      isContra: false, order: 3 },
  current_portion_ltd:         { section: 'current_liabilities',     label: 'Current Portion of Long-term Debt',     isContra: false, order: 4 },
  short_term_debt:             { section: 'current_liabilities',     label: 'Short-term Debt',                       isContra: false, order: 5 },
  other_current_liabilities:   { section: 'current_liabilities',     label: 'Other Current Liabilities',             isContra: false, order: 6 },
  // NON-CURRENT LIABILITIES
  long_term_debt:              { section: 'noncurrent_liabilities',  label: 'Long-term Debt',                        isContra: false, order: 1 },
  deferred_tax_liability:      { section: 'noncurrent_liabilities',  label: 'Deferred Tax Liability',                isContra: false, order: 2 },
  other_noncurrent_liabilities:{ section: 'noncurrent_liabilities',  label: 'Other Non-Current Liabilities',         isContra: false, order: 3 },
  // EQUITY
  common_stock:                { section: 'equity',                  label: 'Common Stock',                          isContra: false, order: 1 },
  apic:                        { section: 'equity',                  label: 'Additional Paid-in Capital (APIC)',      isContra: false, order: 2 },
  retained_earnings:           { section: 'equity',                  label: 'Retained Earnings',                     isContra: false, order: 3 },
  treasury_stock:              { section: 'equity',                  label: 'Less: Treasury Stock',                  isContra: true,  order: 4 },
  other_equity:                { section: 'equity',                  label: 'Other Comprehensive Income',            isContra: false, order: 5 },
};

const SECTION_ORDER: AccountDef['section'][] = [
  'current_assets',
  'noncurrent_assets',
  'current_liabilities',
  'noncurrent_liabilities',
  'equity',
];

const BS_ACCOUNT_TYPES = Object.keys(ACCOUNT_DEFS) as BSAccountType[];

const INVENTORY_METHODS: InventoryMethod[] = ['FIFO', 'LIFO', 'AVERAGE_COST'];

// ==================================================================================
// PROPS INTERFACE
// ==================================================================================

interface BalanceSheetProps {
  accounts: BalanceSheetAccount[];
  notes: BalanceSheetNote[];
  onAddAccount: (a: BalanceSheetAccount) => void;
  onUpdateAccount: (a: BalanceSheetAccount) => void;
  onDeleteAccount: (id: string) => void;
  onAddNote: (n: BalanceSheetNote) => void;
  onUpdateNote: (n: BalanceSheetNote) => void;
  onDeleteNote: (id: string) => void;
  companyName?: string;
}

// ==================================================================================
// HELPER FUNCTIONS
// ==================================================================================

function signedAmount(a: BalanceSheetAccount): number {
  const def = ACCOUNT_DEFS[a.accountType];
  return def.isContra ? -Math.abs(a.amount) : Math.abs(a.amount);
}

function sectionTotal(accts: BalanceSheetAccount[], section: string): number {
  return accts
    .filter(a => ACCOUNT_DEFS[a.accountType].section === section)
    .reduce((sum, a) => sum + signedAmount(a), 0);
}

function fmtAccounting(value: number, isContra?: boolean): React.ReactNode {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (value < 0 || isContra) {
    return <span className="text-red-600">({formatted})</span>;
  }
  return <span>{formatted}</span>;
}

function fmtChange(curr: number, prior: number): React.ReactNode {
  const diff = curr - prior;
  if (diff === 0) return <span className="text-gray-400 font-mono">—</span>;
  const abs = Math.abs(diff).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (diff > 0) {
    return (
      <span className="text-emerald-600 font-mono flex items-center gap-0.5">
        <TrendingUp size={12} /> {abs}
      </span>
    );
  }
  return (
    <span className="text-red-500 font-mono flex items-center gap-0.5">
      <TrendingUp size={12} className="rotate-180" /> ({abs})
    </span>
  );
}

function ratioColor(value: number, thresholds: { green: number; yellow: number }, higherIsBetter = true): string {
  if (higherIsBetter) {
    if (value >= thresholds.green) return 'text-emerald-600';
    if (value >= thresholds.yellow) return 'text-amber-500';
    return 'text-red-500';
  } else {
    if (value <= thresholds.green) return 'text-emerald-600';
    if (value <= thresholds.yellow) return 'text-amber-500';
    return 'text-red-500';
  }
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ==================================================================================
// COMPONENT
// ==================================================================================

export const BalanceSheet: React.FC<BalanceSheetProps> = ({
  accounts,
  notes,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  companyName = 'INCODA CONSULTING',
}) => {
  const currentCalendarYear = new Date().getFullYear();

  // --- STATE ---
  const [selectedYear, setSelectedYear] = useState<number>(currentCalendarYear);
  const [compareYear, setCompareYear] = useState<number | null>(currentCalendarYear - 1);
  const [showVertical, setShowVertical] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAccount, setNewAccount] = useState<Partial<BalanceSheetAccount>>({
    year: currentCalendarYear,
    amount: 0,
  });
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editingNoteData, setEditingNoteData] = useState<Partial<BalanceSheetNote>>({});
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNote, setNewNote] = useState<Partial<BalanceSheetNote>>({ year: currentCalendarYear, title: '', body: '' });
  const [hoveredAccount, setHoveredAccount] = useState<string | null>(null);

  // Year selector range: from oldest account year to current+1
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (let y = currentCalendarYear - 5; y <= currentCalendarYear + 1; y++) years.add(y);
    accounts.forEach(a => years.add(a.year));
    return Array.from(years).sort((a, b) => b - a);
  }, [accounts, currentCalendarYear]);

  // --- COMPUTED DATA ---
  const getAccountsForYear = (year: number) => accounts.filter(a => a.year === year);

  const computeTotals = (yearAccts: BalanceSheetAccount[]) => {
    const totalCurrentAssets      = sectionTotal(yearAccts, 'current_assets');
    const totalNonCurrentAssets   = sectionTotal(yearAccts, 'noncurrent_assets');
    const totalAssets              = totalCurrentAssets + totalNonCurrentAssets;
    const totalCurrentLiabilities = sectionTotal(yearAccts, 'current_liabilities');
    const totalNonCurrentLiab     = sectionTotal(yearAccts, 'noncurrent_liabilities');
    const totalLiabilities         = totalCurrentLiabilities + totalNonCurrentLiab;
    const totalEquity              = sectionTotal(yearAccts, 'equity');
    const totalLiabAndEquity       = totalLiabilities + totalEquity;
    const isBalanced               = Math.abs(totalAssets - totalLiabAndEquity) < 0.01;
    return {
      totalCurrentAssets,
      totalNonCurrentAssets,
      totalAssets,
      totalCurrentLiabilities,
      totalNonCurrentLiab,
      totalLiabilities,
      totalEquity,
      totalLiabAndEquity,
      isBalanced,
    };
  };

  const currYearAccts = useMemo(() => getAccountsForYear(selectedYear), [accounts, selectedYear]);
  const priorYearAccts = useMemo(() => compareYear ? getAccountsForYear(compareYear) : [], [accounts, compareYear]);

  const curr = useMemo(() => computeTotals(currYearAccts), [currYearAccts]);
  const prior = useMemo(() => compareYear ? computeTotals(priorYearAccts) : null, [priorYearAccts, compareYear]);

  // Section accounts sorted
  const getSectionAccounts = (yearAccts: BalanceSheetAccount[], section: AccountDef['section']) => {
    return yearAccts
      .filter(a => ACCOUNT_DEFS[a.accountType].section === section)
      .sort((a, b) => ACCOUNT_DEFS[a.accountType].order - ACCOUNT_DEFS[b.accountType].order);
  };

  // Find prior-year counterpart by accountType (first match)
  const findPrior = (accountType: BSAccountType): BalanceSheetAccount | undefined => {
    return priorYearAccts.find(a => a.accountType === accountType);
  };

  // Computed sub-lines
  const netAR = useMemo(() => {
    const ar = currYearAccts.filter(a => a.accountType === 'accounts_receivable').reduce((s, a) => s + a.amount, 0);
    const allow = currYearAccts.filter(a => a.accountType === 'allowance_doubtful_accounts').reduce((s, a) => s + a.amount, 0);
    return ar - allow;
  }, [currYearAccts]);

  const netPPE = useMemo(() => {
    const gross = currYearAccts.filter(a => a.accountType === 'fixed_assets_gross').reduce((s, a) => s + a.amount, 0);
    const accum = currYearAccts.filter(a => a.accountType === 'accumulated_depreciation').reduce((s, a) => s + a.amount, 0);
    return gross - accum;
  }, [currYearAccts]);

  const priorNetAR = useMemo(() => {
    if (!prior) return 0;
    const ar = priorYearAccts.filter(a => a.accountType === 'accounts_receivable').reduce((s, a) => s + a.amount, 0);
    const allow = priorYearAccts.filter(a => a.accountType === 'allowance_doubtful_accounts').reduce((s, a) => s + a.amount, 0);
    return ar - allow;
  }, [priorYearAccts, prior]);

  const priorNetPPE = useMemo(() => {
    if (!prior) return 0;
    const gross = priorYearAccts.filter(a => a.accountType === 'fixed_assets_gross').reduce((s, a) => s + a.amount, 0);
    const accum = priorYearAccts.filter(a => a.accountType === 'accumulated_depreciation').reduce((s, a) => s + a.amount, 0);
    return gross - accum;
  }, [priorYearAccts, prior]);

  // Ratios
  const ratios = useMemo(() => {
    const cashAmt = currYearAccts.filter(a => a.accountType === 'cash_equivalents').reduce((s, a) => s + a.amount, 0);
    const currentRatio = curr.totalCurrentLiabilities > 0
      ? curr.totalCurrentAssets / curr.totalCurrentLiabilities : 0;
    const quickRatio = curr.totalCurrentLiabilities > 0
      ? (cashAmt + netAR) / curr.totalCurrentLiabilities : 0;
    const debtToEquity = curr.totalEquity > 0
      ? curr.totalLiabilities / curr.totalEquity : 0;
    const equityRatio = curr.totalAssets > 0
      ? (curr.totalEquity / curr.totalAssets) * 100 : 0;
    return { currentRatio, quickRatio, debtToEquity, equityRatio };
  }, [currYearAccts, curr, netAR]);

  // Notes for selected year
  const yearNotes = useMemo(() => notes.filter(n => n.year === selectedYear), [notes, selectedYear]);

  // ---- HANDLERS ----
  const handleStartEdit = (a: BalanceSheetAccount) => {
    setEditingAccount(a.id);
    setEditAmount(String(a.amount));
  };

  const handleSaveEdit = (a: BalanceSheetAccount) => {
    const parsed = parseFloat(editAmount);
    if (!isNaN(parsed)) {
      onUpdateAccount({ ...a, amount: parsed });
    }
    setEditingAccount(null);
    setEditAmount('');
  };

  const handleCancelEdit = () => {
    setEditingAccount(null);
    setEditAmount('');
  };

  const handleAddAccount = () => {
    if (!newAccount.accountType || !newAccount.year || newAccount.amount === undefined) return;
    const def = ACCOUNT_DEFS[newAccount.accountType];
    const acct: BalanceSheetAccount = {
      id: generateId(),
      accountType: newAccount.accountType,
      name: newAccount.name || def.label,
      year: newAccount.year,
      amount: newAccount.amount,
      inventoryMethod: newAccount.inventoryMethod,
      notes: newAccount.notes,
    };
    onAddAccount(acct);
    setShowAddModal(false);
    setNewAccount({ year: selectedYear, amount: 0 });
  };

  const handleAddNote = () => {
    if (!newNote.title || !newNote.body) return;
    const n: BalanceSheetNote = {
      id: generateId(),
      year: newNote.year ?? selectedYear,
      title: newNote.title,
      body: newNote.body,
    };
    onAddNote(n);
    setShowAddNote(false);
    setNewNote({ year: selectedYear, title: '', body: '' });
  };

  const handleSaveNote = (n: BalanceSheetNote) => {
    onUpdateNote({ ...n, ...editingNoteData });
    setEditingNote(null);
    setEditingNoteData({});
  };

  // ---- RENDER HELPERS ----

  const showCompare = compareYear !== null;
  const colCount = 1 + (showCompare ? 2 : 0) + (showVertical ? 1 : 0);

  const renderAmountCell = (
    acct: BalanceSheetAccount,
    totalAssets: number,
    isPrior = false
  ) => {
    const def = ACCOUNT_DEFS[acct.accountType];
    const val = signedAmount(acct);

    if (!isPrior && editingAccount === acct.id) {
      return (
        <td className="px-3 py-1 text-right font-mono">
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              value={editAmount}
              onChange={e => setEditAmount(e.target.value)}
              className="w-28 text-right border border-blue-400 rounded px-1 py-0.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveEdit(acct);
                if (e.key === 'Escape') handleCancelEdit();
              }}
            />
            <button onClick={() => handleSaveEdit(acct)} className="text-emerald-600 hover:text-emerald-700">
              <CheckCircle size={14} />
            </button>
            <button onClick={handleCancelEdit} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
        </td>
      );
    }

    return (
      <td className={`px-3 py-1 text-right font-mono text-sm ${def.isContra ? 'text-red-600' : 'text-gray-800'}`}>
        {def.isContra
          ? <span>({Math.abs(val).toLocaleString('en-US', { maximumFractionDigits: 0 })})</span>
          : <span>{val.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
        }
      </td>
    );
  };

  const renderVerticalCell = (amount: number, base: number) => {
    if (!showVertical || base === 0) return null;
    const pct = (amount / base) * 100;
    return (
      <td className="px-3 py-1 text-right text-xs text-gray-400 font-mono w-16">
        {pct.toFixed(1)}%
      </td>
    );
  };

  const renderAccountRow = (
    acct: BalanceSheetAccount,
    totalAssetsForYear: number,
    totalLEForYear: number,
    isAsset: boolean,
  ) => {
    const def = ACCOUNT_DEFS[acct.accountType];
    const priorAcct = findPrior(acct.accountType);
    const currVal = signedAmount(acct);
    const priorVal = priorAcct ? signedAmount(priorAcct) : 0;
    const base = isAsset ? totalAssetsForYear : totalLEForYear;
    const isHovered = hoveredAccount === acct.id;

    return (
      <tr
        key={acct.id}
        className={`group transition-colors ${def.isContra ? 'bg-red-50' : 'hover:bg-blue-50'}`}
        onMouseEnter={() => setHoveredAccount(acct.id)}
        onMouseLeave={() => setHoveredAccount(null)}
      >
        {/* Account Name */}
        <td className="px-4 py-1 text-sm">
          <div className="flex items-center gap-2 pl-4">
            <span className={`${def.isContra ? 'text-red-600 italic' : 'text-gray-700'}`}>
              {acct.name}
            </span>
            {/* Inventory badge */}
            {acct.accountType === 'inventory' && acct.inventoryMethod && (
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                {acct.inventoryMethod === 'AVERAGE_COST' ? 'AVG' : acct.inventoryMethod}
              </span>
            )}
            {/* Notes indicator */}
            {acct.notes && (
              <span title={acct.notes} className="text-amber-500 cursor-help">
                <Info size={12} />
              </span>
            )}
            {/* Edit / Delete on hover */}
            {isHovered && editingAccount !== acct.id && (
              <div className="flex items-center gap-1 ml-auto">
                <button
                  onClick={() => handleStartEdit(acct)}
                  className="text-blue-400 hover:text-blue-600 transition-colors"
                  title="Edit amount"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  onClick={() => onDeleteAccount(acct.id)}
                  className="text-red-400 hover:text-red-600 transition-colors"
                  title="Delete account"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        </td>

        {/* Current Year Amount */}
        {renderAmountCell(acct, totalAssetsForYear)}

        {/* Prior Year Amount */}
        {showCompare && (
          <td className={`px-3 py-1 text-right font-mono text-sm text-gray-500`}>
            {priorAcct
              ? def.isContra
                ? <span className="text-red-400">({Math.abs(priorVal).toLocaleString('en-US', { maximumFractionDigits: 0 })})</span>
                : <span>{priorVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              : <span className="text-gray-300">—</span>
            }
          </td>
        )}

        {/* YoY Change */}
        {showCompare && (
          <td className="px-3 py-1 text-right text-xs">
            {priorAcct ? fmtChange(currVal, priorVal) : null}
          </td>
        )}

        {/* Vertical % */}
        {showVertical && renderVerticalCell(currVal, base)}
      </tr>
    );
  };

  // Computed net line (e.g., Net AR, PP&E net)
  const renderComputedLine = (label: string, value: number, priorValue?: number, base = curr.totalAssets) => (
    <tr className="bg-gray-50 border-t border-dashed border-gray-200">
      <td className="px-4 py-0.5 text-xs italic text-gray-500 pl-8">{label}</td>
      <td className="px-3 py-0.5 text-right font-mono text-xs text-gray-500 italic">
        {value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </td>
      {showCompare && (
        <td className="px-3 py-0.5 text-right font-mono text-xs text-gray-400 italic">
          {priorValue !== undefined ? priorValue.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
        </td>
      )}
      {showCompare && (
        <td className="px-3 py-0.5 text-right text-xs">
          {priorValue !== undefined ? fmtChange(value, priorValue) : null}
        </td>
      )}
      {showVertical && (
        <td className="px-3 py-0.5 text-right text-xs text-gray-300 font-mono">
          {base > 0 ? ((value / base) * 100).toFixed(1) + '%' : ''}
        </td>
      )}
    </tr>
  );

  // Subtotal row
  const renderSubtotal = (
    label: string,
    currValue: number,
    priorValue?: number,
    colorClass = 'bg-blue-50',
    base = curr.totalAssets,
  ) => (
    <tr className={`${colorClass} border-t border-gray-300`}>
      <td className="px-4 py-1.5 text-sm font-semibold text-gray-800 pl-4">{label}</td>
      <td className="px-3 py-1.5 text-right font-mono text-sm font-semibold text-gray-800 border-t border-gray-400">
        {currValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </td>
      {showCompare && (
        <td className="px-3 py-1.5 text-right font-mono text-sm text-gray-500 border-t border-gray-300">
          {priorValue !== undefined ? priorValue.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
        </td>
      )}
      {showCompare && (
        <td className="px-3 py-1.5 text-right text-xs">
          {priorValue !== undefined ? fmtChange(currValue, priorValue) : null}
        </td>
      )}
      {showVertical && (
        <td className="px-3 py-1.5 text-right text-xs font-mono text-gray-400">
          {base > 0 ? ((currValue / base) * 100).toFixed(1) + '%' : ''}
        </td>
      )}
    </tr>
  );

  // Grand total row (double underline style)
  const renderGrandTotal = (
    label: string,
    currValue: number,
    priorValue?: number,
    colorClass = 'bg-blue-100',
    base = curr.totalAssets,
  ) => (
    <tr className={`${colorClass}`}>
      <td className="px-4 py-2 text-sm font-bold text-gray-900 uppercase tracking-wide pl-4">{label}</td>
      <td className="px-3 py-2 text-right font-mono text-sm font-bold text-gray-900 border-t-2 border-b-2 border-gray-800">
        {currValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </td>
      {showCompare && (
        <td className="px-3 py-2 text-right font-mono text-sm font-semibold text-gray-600 border-t-2 border-b-2 border-gray-400">
          {priorValue !== undefined ? priorValue.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
        </td>
      )}
      {showCompare && (
        <td className="px-3 py-2 text-right text-xs border-t-2 border-b-2 border-transparent">
          {priorValue !== undefined ? fmtChange(currValue, priorValue) : null}
        </td>
      )}
      {showVertical && (
        <td className="px-3 py-2 text-right text-xs font-mono text-gray-400">
          {base > 0 ? ((currValue / base) * 100).toFixed(1) + '%' : '—'}
        </td>
      )}
    </tr>
  );

  // Section header row
  const renderSectionHeader = (label: string) => (
    <tr className="bg-gray-100 border-t border-gray-200">
      <td
        colSpan={1 + (showCompare ? 3 : 0) + (showVertical ? 1 : 0) + 1}
        className="px-4 py-1.5 text-xs font-bold text-gray-500 uppercase tracking-widest"
      >
        {label}
      </td>
    </tr>
  );

  // Major heading (ASSETS / LIABILITIES AND SHAREHOLDERS' EQUITY)
  const renderMajorHeading = (label: string) => (
    <tr className="bg-gray-700">
      <td
        colSpan={1 + (showCompare ? 3 : 0) + (showVertical ? 1 : 0) + 1}
        className="px-4 py-2 text-sm font-bold text-white uppercase tracking-widest"
      >
        {label}
      </td>
    </tr>
  );

  // Column headers
  const renderTableHeader = () => (
    <thead>
      <tr className="bg-gray-50 border-b-2 border-gray-200">
        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-64">
          Account
        </th>
        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
          {selectedYear}
        </th>
        {showCompare && compareYear && (
          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {compareYear}
          </th>
        )}
        {showCompare && (
          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Change
          </th>
        )}
        {showVertical && (
          <th className="px-3 py-2 text-right text-xs font-semibold text-indigo-500 uppercase tracking-wider w-16">
            %
          </th>
        )}
      </tr>
    </thead>
  );

  // ==================================================================================
  // MAIN RENDER
  // ==================================================================================

  const currAssetAccounts   = getSectionAccounts(currYearAccts, 'current_assets');
  const ncAssetAccounts     = getSectionAccounts(currYearAccts, 'noncurrent_assets');
  const currLiabAccounts    = getSectionAccounts(currYearAccts, 'current_liabilities');
  const ncLiabAccounts      = getSectionAccounts(currYearAccts, 'noncurrent_liabilities');
  const equityAccounts      = getSectionAccounts(currYearAccts, 'equity');

  const difference = Math.abs(curr.totalAssets - curr.totalLiabAndEquity);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Out-of-Balance Banner */}
      {!curr.isBalanced && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-300 rounded-lg px-4 py-3 text-red-700">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <div>
            <span className="font-semibold">Balance Sheet is Out of Balance. </span>
            <span className="text-sm">
              Assets ({curr.totalAssets.toLocaleString('en-US', { maximumFractionDigits: 0 })}) ≠ Liabilities + Equity ({curr.totalLiabAndEquity.toLocaleString('en-US', { maximumFractionDigits: 0 })}). Difference: {difference.toLocaleString('en-US', { maximumFractionDigits: 0 })}. Period cannot be closed until balanced.
            </span>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

        {/* ── HEADER ── */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-6 py-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-1">
            <Scale size={22} className="text-blue-300" />
            <h1 className="text-xl font-bold text-white tracking-wide">{companyName}</h1>
          </div>
          <p className="text-blue-200 font-semibold text-base">Statement of Financial Position</p>
          <p className="text-gray-300 text-sm mt-0.5">As of December 31, {selectedYear}</p>
          <p className="text-gray-400 text-xs mt-1 italic">In accordance with US GAAP — FASB ASC 205</p>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-3">
          {/* Year selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 font-medium">Fiscal Year:</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Compare Year */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 font-medium">Compare:</label>
            <input
              type="checkbox"
              checked={compareYear !== null}
              onChange={e => setCompareYear(e.target.checked ? selectedYear - 1 : null)}
              className="rounded"
            />
            {compareYear !== null && (
              <select
                value={compareYear}
                onChange={e => setCompareYear(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {availableYears.filter(y => y !== selectedYear).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
          </div>

          {/* Vertical Analysis toggle */}
          <button
            onClick={() => setShowVertical(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${showVertical ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            <BarChart2 size={13} />
            Vertical Analysis %
          </button>

          {/* Notes toggle */}
          <button
            onClick={() => setShowNotes(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${showNotes ? 'bg-amber-500 text-white shadow-sm' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            <BookOpen size={13} />
            Notes {yearNotes.length > 0 && <span className="ml-0.5 bg-amber-200 text-amber-800 rounded-full px-1.5 py-0 text-xs">{yearNotes.length}</span>}
          </button>

          {/* Add Account */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm ml-auto"
          >
            <Plus size={13} />
            Add Account
          </button>

          {/* Balance Status Badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold ${curr.isBalanced ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
            {curr.isBalanced
              ? <><CheckCircle size={14} /> Balanced</>
              : <><AlertTriangle size={14} /> Out of Balance ({difference.toLocaleString('en-US', { maximumFractionDigits: 0 })})</>
            }
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div className="flex gap-0">

          {/* Balance Sheet Table */}
          <div className="flex-1 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              {renderTableHeader()}
              <tbody>

                {/* ═══════════════════════════ ASSETS ═══════════════════════════ */}
                {renderMajorHeading('Assets')}

                {/* Current Assets */}
                {renderSectionHeader('Current Assets')}
                {currAssetAccounts.map(a =>
                  renderAccountRow(a, curr.totalAssets, curr.totalLiabAndEquity, true)
                )}
                {/* Net AR computed line */}
                {currYearAccts.some(a => a.accountType === 'accounts_receivable') &&
                  currYearAccts.some(a => a.accountType === 'allowance_doubtful_accounts') &&
                  renderComputedLine(
                    'Net Accounts Receivable',
                    netAR,
                    prior ? priorNetAR : undefined,
                    curr.totalAssets,
                  )
                }
                {renderSubtotal(
                  'Total Current Assets',
                  curr.totalCurrentAssets,
                  prior?.totalCurrentAssets,
                  'bg-blue-50',
                  curr.totalAssets,
                )}

                {/* Non-Current Assets */}
                {renderSectionHeader('Non-Current Assets')}
                {ncAssetAccounts.map(a =>
                  renderAccountRow(a, curr.totalAssets, curr.totalLiabAndEquity, true)
                )}
                {/* PP&E net computed line */}
                {currYearAccts.some(a => a.accountType === 'fixed_assets_gross') &&
                  currYearAccts.some(a => a.accountType === 'accumulated_depreciation') &&
                  renderComputedLine(
                    'PP&E, net',
                    netPPE,
                    prior ? priorNetPPE : undefined,
                    curr.totalAssets,
                  )
                }
                {renderSubtotal(
                  'Total Non-Current Assets',
                  curr.totalNonCurrentAssets,
                  prior?.totalNonCurrentAssets,
                  'bg-gray-50',
                  curr.totalAssets,
                )}

                {/* TOTAL ASSETS */}
                {renderGrandTotal(
                  'Total Assets',
                  curr.totalAssets,
                  prior?.totalAssets,
                  'bg-blue-100',
                  curr.totalAssets,
                )}

                {/* Spacer */}
                <tr><td colSpan={1 + (showCompare ? 3 : 0) + (showVertical ? 1 : 0) + 1} className="py-2 bg-gray-50"></td></tr>

                {/* ═══════════════════════ LIABILITIES & EQUITY ═══════════════════════ */}
                {renderMajorHeading("Liabilities and Shareholders' Equity")}

                {/* Current Liabilities */}
                {renderSectionHeader('Current Liabilities')}
                {currLiabAccounts.map(a =>
                  renderAccountRow(a, curr.totalAssets, curr.totalLiabAndEquity, false)
                )}
                {renderSubtotal(
                  'Total Current Liabilities',
                  curr.totalCurrentLiabilities,
                  prior?.totalCurrentLiabilities,
                  'bg-red-50',
                  curr.totalLiabAndEquity,
                )}

                {/* Non-Current Liabilities */}
                {renderSectionHeader('Non-Current Liabilities')}
                {ncLiabAccounts.map(a =>
                  renderAccountRow(a, curr.totalAssets, curr.totalLiabAndEquity, false)
                )}
                {renderSubtotal(
                  'Total Non-Current Liabilities',
                  curr.totalNonCurrentLiab,
                  prior?.totalNonCurrentLiab,
                  'bg-gray-50',
                  curr.totalLiabAndEquity,
                )}

                {/* TOTAL LIABILITIES */}
                {renderGrandTotal(
                  'Total Liabilities',
                  curr.totalLiabilities,
                  prior?.totalLiabilities,
                  'bg-red-100',
                  curr.totalLiabAndEquity,
                )}

                {/* Equity */}
                {renderSectionHeader("Shareholders' Equity")}
                {equityAccounts.map(a =>
                  renderAccountRow(a, curr.totalAssets, curr.totalLiabAndEquity, false)
                )}
                {renderSubtotal(
                  "Total Shareholders' Equity",
                  curr.totalEquity,
                  prior?.totalEquity,
                  'bg-emerald-50',
                  curr.totalLiabAndEquity,
                )}

                {/* TOTAL LIABILITIES AND EQUITY */}
                {renderGrandTotal(
                  "Total Liabilities and Shareholders' Equity",
                  curr.totalLiabAndEquity,
                  prior?.totalLiabAndEquity,
                  'bg-blue-100',
                  curr.totalLiabAndEquity,
                )}

                {/* Balance Check Row */}
                <tr className={curr.isBalanced ? 'bg-emerald-50' : 'bg-red-50'}>
                  <td
                    colSpan={1 + (showCompare ? 3 : 0) + (showVertical ? 1 : 0) + 1}
                    className="px-4 py-2 text-xs text-center"
                  >
                    {curr.isBalanced ? (
                      <span className="text-emerald-700 font-semibold flex items-center justify-center gap-2">
                        <CheckCircle size={14} />
                        Assets ({curr.totalAssets.toLocaleString('en-US', { maximumFractionDigits: 0 })}) = Liabilities + Equity ({curr.totalLiabAndEquity.toLocaleString('en-US', { maximumFractionDigits: 0 })}) — Balanced
                      </span>
                    ) : (
                      <span className="text-red-700 font-semibold flex items-center justify-center gap-2">
                        <AlertTriangle size={14} />
                        Assets ({curr.totalAssets.toLocaleString('en-US', { maximumFractionDigits: 0 })}) ≠ Liabilities + Equity ({curr.totalLiabAndEquity.toLocaleString('en-US', { maximumFractionDigits: 0 })}) — Difference: {difference.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </td>
                </tr>

              </tbody>
            </table>
          </div>

          {/* ── RATIOS SIDEBAR ── */}
          <div className="w-52 flex-shrink-0 border-l border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-1.5 mb-4">
              <Shield size={14} className="text-indigo-500" />
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Financial Ratios</h3>
            </div>

            {/* Current Ratio */}
            <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200 shadow-xs">
              <div className="text-xs text-gray-500 mb-1 font-medium">Current Ratio</div>
              <div className={`text-xl font-bold font-mono ${ratioColor(ratios.currentRatio, { green: 2.0, yellow: 1.0 })}`}>
                {ratios.currentRatio.toFixed(2)}x
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Target: &gt; 2.0x</div>
              <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${ratios.currentRatio >= 2.0 ? 'bg-emerald-400' : ratios.currentRatio >= 1.0 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${Math.min((ratios.currentRatio / 3) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Quick Ratio */}
            <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200 shadow-xs">
              <div className="text-xs text-gray-500 mb-1 font-medium">Quick Ratio</div>
              <div className={`text-xl font-bold font-mono ${ratioColor(ratios.quickRatio, { green: 1.0, yellow: 0.5 })}`}>
                {ratios.quickRatio.toFixed(2)}x
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Target: &gt; 1.0x</div>
              <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${ratios.quickRatio >= 1.0 ? 'bg-emerald-400' : ratios.quickRatio >= 0.5 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${Math.min((ratios.quickRatio / 2) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Debt-to-Equity */}
            <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200 shadow-xs">
              <div className="text-xs text-gray-500 mb-1 font-medium">Debt-to-Equity</div>
              <div className={`text-xl font-bold font-mono ${ratioColor(ratios.debtToEquity, { green: 1.0, yellow: 2.0 }, false)}`}>
                {ratios.debtToEquity.toFixed(2)}x
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Lower is better</div>
              <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${ratios.debtToEquity <= 1.0 ? 'bg-emerald-400' : ratios.debtToEquity <= 2.0 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${Math.min((ratios.debtToEquity / 4) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Equity Ratio */}
            <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200 shadow-xs">
              <div className="text-xs text-gray-500 mb-1 font-medium">Equity Ratio</div>
              <div className={`text-xl font-bold font-mono ${ratioColor(ratios.equityRatio, { green: 50, yellow: 30 })}`}>
                {ratios.equityRatio.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Target: &gt; 50%</div>
              <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${ratios.equityRatio >= 50 ? 'bg-emerald-400' : ratios.equityRatio >= 30 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${Math.min(ratios.equityRatio, 100)}%` }}
                />
              </div>
            </div>

            {/* Totals summary */}
            <div className="mt-6 space-y-2 text-xs text-gray-600 border-t border-gray-200 pt-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Assets</span>
                <span className="font-mono font-semibold text-gray-800">{curr.totalAssets.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Liabilities</span>
                <span className="font-mono font-semibold text-red-600">{curr.totalLiabilities.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Equity</span>
                <span className="font-mono font-semibold text-emerald-600">{curr.totalEquity.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── NOTES PANEL ── */}
        {showNotes && (
          <div className="border-t border-gray-200 bg-amber-50 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-amber-600" />
                <h2 className="text-base font-bold text-gray-800">Notes to Financial Statements</h2>
                <span className="text-xs text-gray-500 italic">— Fiscal Year {selectedYear}</span>
              </div>
              <button
                onClick={() => { setShowAddNote(true); setNewNote({ year: selectedYear, title: '', body: '' }); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-md hover:bg-amber-600 transition-colors"
              >
                <Plus size={13} />
                Add Note
              </button>
            </div>

            {yearNotes.length === 0 && !showAddNote && (
              <p className="text-sm text-gray-400 italic">No notes for {selectedYear}. Click "Add Note" to add disclosures.</p>
            )}

            <div className="space-y-4">
              {yearNotes.map(note => (
                <div key={note.id} className="bg-white rounded-lg border border-amber-200 p-4 shadow-xs">
                  {editingNote === note.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editingNoteData.title ?? note.title}
                        onChange={e => setEditingNoteData(d => ({ ...d, title: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-amber-400"
                        placeholder="Note title..."
                      />
                      <textarea
                        value={editingNoteData.body ?? note.body}
                        onChange={e => setEditingNoteData(d => ({ ...d, body: e.target.value }))}
                        rows={4}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
                        placeholder="Note body..."
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveNote(note)}
                          className="px-3 py-1 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingNote(null); setEditingNoteData({}); }}
                          className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <h3 className="font-semibold text-gray-800 text-sm">{note.title}</h3>
                        <div className="flex gap-1.5 ml-3">
                          <button
                            onClick={() => { setEditingNote(note.id); setEditingNoteData({ title: note.title, body: note.body }); }}
                            className="text-gray-400 hover:text-blue-500 transition-colors"
                            title="Edit note"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => onDeleteNote(note.id)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete note"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap">{note.body}</p>
                    </>
                  )}
                </div>
              ))}

              {/* Add Note Inline Form */}
              {showAddNote && (
                <div className="bg-white rounded-lg border border-amber-300 p-4 shadow-xs">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">New Note</h4>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newNote.title ?? ''}
                      onChange={e => setNewNote(n => ({ ...n, title: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                      placeholder="e.g., Note 1 – Summary of Significant Accounting Policies"
                    />
                    <textarea
                      value={newNote.body ?? ''}
                      onChange={e => setNewNote(n => ({ ...n, body: e.target.value }))}
                      rows={4}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
                      placeholder="Disclosure text..."
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddNote}
                        className="px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded hover:bg-amber-600"
                      >
                        Save Note
                      </button>
                      <button
                        onClick={() => setShowAddNote(false)}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ==================================================================================
          ADD ACCOUNT MODAL
      ================================================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Plus size={16} className="text-emerald-600" />
                <h2 className="font-bold text-gray-800">Add Balance Sheet Account</h2>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Account Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                  Account Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={newAccount.accountType ?? ''}
                  onChange={e => setNewAccount(n => ({ ...n, accountType: e.target.value as BSAccountType }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">— Select account type —</option>
                  {/* Grouped by section */}
                  {(['current_assets', 'noncurrent_assets', 'current_liabilities', 'noncurrent_liabilities', 'equity'] as const).map(section => {
                    const sectionLabels: Record<string, string> = {
                      current_assets: 'Current Assets',
                      noncurrent_assets: 'Non-Current Assets',
                      current_liabilities: 'Current Liabilities',
                      noncurrent_liabilities: 'Non-Current Liabilities',
                      equity: "Shareholders' Equity",
                    };
                    const types = BS_ACCOUNT_TYPES.filter(t => ACCOUNT_DEFS[t].section === section);
                    return (
                      <optgroup key={section} label={sectionLabels[section]}>
                        {types.map(t => (
                          <option key={t} value={t}>{ACCOUNT_DEFS[t].label}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              {/* Custom Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                  Custom Name <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newAccount.name ?? ''}
                  onChange={e => setNewAccount(n => ({ ...n, name: e.target.value }))}
                  placeholder={newAccount.accountType ? ACCOUNT_DEFS[newAccount.accountType].label : 'Defaults to account label'}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Two-column: Fiscal Year + Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                    Fiscal Year <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={newAccount.year ?? currentCalendarYear}
                    onChange={e => setNewAccount(n => ({ ...n, year: parseInt(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    min={1900}
                    max={2100}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={newAccount.amount ?? 0}
                    onChange={e => setNewAccount(n => ({ ...n, amount: parseFloat(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    min={0}
                    step={0.01}
                  />
                  {newAccount.accountType && ACCOUNT_DEFS[newAccount.accountType].isContra && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <Info size={11} /> Enter the absolute value. Contra sign applied automatically.
                    </p>
                  )}
                </div>
              </div>

              {/* Inventory Method — only for inventory */}
              {newAccount.accountType === 'inventory' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                    Inventory Method
                  </label>
                  <select
                    value={newAccount.inventoryMethod ?? ''}
                    onChange={e => setNewAccount(n => ({ ...n, inventoryMethod: e.target.value as InventoryMethod }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-400"
                  >
                    <option value="">— Select method —</option>
                    {INVENTORY_METHODS.map(m => (
                      <option key={m} value={m}>
                        {m === 'AVERAGE_COST' ? 'Average Cost (Weighted)' : m}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
                  Footnote / Notes <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={newAccount.notes ?? ''}
                  onChange={e => setNewAccount(n => ({ ...n, notes: e.target.value }))}
                  rows={2}
                  placeholder="Optional disclosure or note for this line..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAccount}
                disabled={!newAccount.accountType || newAccount.amount === undefined}
                className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
