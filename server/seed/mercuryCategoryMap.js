// Mercury's categoryData.name is a free-text, per-account label the user
// assigns/edits from Mercury's own dashboard — not a fixed enum (verified
// against a real production API response: mercuryCategory, the documented
// fixed enum, came back null; categoryData.name carried the real value,
// e.g. "Payroll"). This map is a best-effort suggestion; unknown names
// fall back to 'Other Expenses' rather than throwing, since new or
// user-renamed categories are expected to appear over time.
export const MERCURY_CATEGORY_TO_TAX_CATEGORY = {
  'Payroll': 'Contract Labor',
  'Bank Fees': 'Other Expenses',
  'Payment Processing Fees': 'Other Expenses',
  'Travel & Transportation': 'Travel',
  // Mercury's 'Rent & Utilities' bundles two Schedule C lines (Rent, line 20b,
  // and Utilities, line 25) with no reliable signal here to split them —
  // mapping to either specific line risks confidently mis-filing a real
  // utility bill onto Rent (or vice versa). 'Other Expenses' is the
  // intentional safe fallback used throughout this feature; a row that lands
  // there is easy to catch and fix, unlike one silently posted to the wrong
  // specific line. See Finding 4 of the final review.
  'Rent & Utilities': 'Other Expenses',
  'Office Supplies & Equipment': 'Supplies',
  'Legal & Professional Services': 'Legal & Professional Services',
  // No entry for 'Revenue': incoming Mercury transactions are rejected by
  // POST /approve's sign guard (mtx.amount must be negative) before this map
  // is ever consulted for one, so a dedicated mapping here would be
  // misleading — it falls through to the 'Other Expenses' default below,
  // which is moot since a Revenue-categorized row can never reach approval.
};

export function suggestTaxCategory(mercuryCategoryName) {
  return MERCURY_CATEGORY_TO_TAX_CATEGORY[mercuryCategoryName] || 'Other Expenses';
}
