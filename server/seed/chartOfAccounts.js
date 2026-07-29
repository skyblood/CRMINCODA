// Default chart of accounts for a small services LLC (cash-basis, Schedule C).
// Seeded idempotently on server startup (see server/index.js) — safe to run
// every boot because it's an upsert-by-code, not an insert.
import LedgerAccount from '../models/LedgerAccount.js';

// normalBalance is set explicitly here (rather than relying on LedgerAccount's
// pre('validate') hook to derive it from `type`) because ensureChartOfAccountsSeeded()
// below uses updateOne({...}, {upsert: true}) — Mongoose only runs document
// middleware like pre('validate') for .save()/.create()/.insertMany(), not for
// updateOne()/upsert. Without this, every account seeded via the real startup
// path (as opposed to test fixtures using insertMany) ends up with normalBalance
// unset, which silently breaks the balance-sheet sign logic in ledgerReports.js.
export const DEFAULT_CHART_OF_ACCOUNTS = [
  { id: 'coa_1000', code: '1000', name: 'Cash — Mercury Checking', type: 'asset', normalBalance: 'debit' },
  { id: 'coa_1100', code: '1100', name: 'Accounts Receivable (informational)', type: 'asset', normalBalance: 'debit' },
  { id: 'coa_3000', code: '3000', name: "Owner's Equity", type: 'equity', normalBalance: 'credit' },
  { id: 'coa_3100', code: '3100', name: "Owner's Draws", type: 'equity', normalBalance: 'credit' },
  { id: 'coa_4000', code: '4000', name: 'Service Income', type: 'income', normalBalance: 'credit' },
  { id: 'coa_6000', code: '6000', name: 'Advertising', type: 'expense', normalBalance: 'debit', taxCategory: 'Advertising' },
  { id: 'coa_6100', code: '6100', name: 'Contract Labor', type: 'expense', normalBalance: 'debit', taxCategory: 'Contract Labor' },
  { id: 'coa_6200', code: '6200', name: 'Office Expense', type: 'expense', normalBalance: 'debit', taxCategory: 'Office Expense' },
  { id: 'coa_6300', code: '6300', name: 'Software', type: 'expense', normalBalance: 'debit', taxCategory: 'Office Expense' },
  { id: 'coa_6400', code: '6400', name: 'Insurance', type: 'expense', normalBalance: 'debit', taxCategory: 'Insurance' },
  { id: 'coa_6500', code: '6500', name: 'Legal & Professional Services', type: 'expense', normalBalance: 'debit', taxCategory: 'Legal & Professional Services' },
  { id: 'coa_6600', code: '6600', name: 'Rent', type: 'expense', normalBalance: 'debit', taxCategory: 'Rent' },
  { id: 'coa_6700', code: '6700', name: 'Supplies', type: 'expense', normalBalance: 'debit', taxCategory: 'Supplies' },
  { id: 'coa_6800', code: '6800', name: 'Taxes & Licenses', type: 'expense', normalBalance: 'debit', taxCategory: 'Taxes & Licenses' },
  { id: 'coa_6900', code: '6900', name: 'Travel', type: 'expense', normalBalance: 'debit', taxCategory: 'Travel' },
  { id: 'coa_7000', code: '7000', name: 'Meals (50% deductible)', type: 'expense', normalBalance: 'debit', taxCategory: 'Meals' },
  { id: 'coa_7100', code: '7100', name: 'Utilities', type: 'expense', normalBalance: 'debit', taxCategory: 'Utilities' },
  { id: 'coa_7900', code: '7900', name: 'Other Expenses', type: 'expense', normalBalance: 'debit', taxCategory: 'Other Expenses' },
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

/**
 * Upsert-by-code seeding, safe to call on every server start. Only inserts
 * accounts that don't already exist by `code`; never overwrites an existing
 * account (the user may have renamed/edited it from the UI).
 */
export async function ensureChartOfAccountsSeeded() {
    for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
        await LedgerAccount.updateOne(
            { code: account.code },
            { $setOnInsert: account },
            { upsert: true },
        );
    }
}
