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
  'Rent & Utilities': 'Rent',
  'Office Supplies & Equipment': 'Supplies',
  'Legal & Professional Services': 'Legal & Professional Services',
  'Revenue': 'Other Expenses',
};

export function suggestTaxCategory(mercuryCategoryName) {
  return MERCURY_CATEGORY_TO_TAX_CATEGORY[mercuryCategoryName] || 'Other Expenses';
}
