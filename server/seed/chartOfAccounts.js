// Default chart of accounts for a small services LLC (cash-basis, Schedule C).
// Seeded idempotently on server startup (see server/index.js) — safe to run
// every boot because it's an upsert-by-code, not an insert.
export const DEFAULT_CHART_OF_ACCOUNTS = [
  { id: 'coa_1000', code: '1000', name: 'Cash — Mercury Checking', type: 'asset' },
  { id: 'coa_1100', code: '1100', name: 'Accounts Receivable (informational)', type: 'asset' },
  { id: 'coa_3000', code: '3000', name: "Owner's Equity", type: 'equity' },
  { id: 'coa_3100', code: '3100', name: "Owner's Draws", type: 'equity' },
  { id: 'coa_4000', code: '4000', name: 'Service Income', type: 'income' },
  { id: 'coa_6000', code: '6000', name: 'Advertising', type: 'expense', taxCategory: 'Advertising' },
  { id: 'coa_6100', code: '6100', name: 'Contract Labor', type: 'expense', taxCategory: 'Contract Labor' },
  { id: 'coa_6200', code: '6200', name: 'Office Expense', type: 'expense', taxCategory: 'Office Expense' },
  { id: 'coa_6300', code: '6300', name: 'Software', type: 'expense', taxCategory: 'Office Expense' },
  { id: 'coa_6400', code: '6400', name: 'Insurance', type: 'expense', taxCategory: 'Insurance' },
  { id: 'coa_6500', code: '6500', name: 'Legal & Professional Services', type: 'expense', taxCategory: 'Legal & Professional Services' },
  { id: 'coa_6600', code: '6600', name: 'Rent', type: 'expense', taxCategory: 'Rent' },
  { id: 'coa_6700', code: '6700', name: 'Supplies', type: 'expense', taxCategory: 'Supplies' },
  { id: 'coa_6800', code: '6800', name: 'Taxes & Licenses', type: 'expense', taxCategory: 'Taxes & Licenses' },
  { id: 'coa_6900', code: '6900', name: 'Travel', type: 'expense', taxCategory: 'Travel' },
  { id: 'coa_7000', code: '7000', name: 'Meals (50% deductible)', type: 'expense', taxCategory: 'Meals' },
  { id: 'coa_7100', code: '7100', name: 'Utilities', type: 'expense', taxCategory: 'Utilities' },
  { id: 'coa_7900', code: '7900', name: 'Other Expenses', type: 'expense', taxCategory: 'Other Expenses' },
];

export const CASH_ACCOUNT_CODE = '1000';
export const INCOME_ACCOUNT_CODE = '4000';

// Maps the legacy operational Transaction.category to a default LedgerAccount
// code — used only when the transaction has no explicit taxCategory set
// (i.e. project/lead expenses recorded from FinanceManager, not from the
// Ledger "Company Expenses" tab).
export const CATEGORY_TO_ACCOUNT_CODE = {
  credit_card:        '7900',
  office:              '6200',
  software:            '6300',
  marketing:           '6000',
  salary:              '6100',
  consultant_payment:  '6100',
  other:               '7900',
};
