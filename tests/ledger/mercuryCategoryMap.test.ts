// tests/ledger/mercuryCategoryMap.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { suggestTaxCategory, MERCURY_CATEGORY_TO_TAX_CATEGORY } from '../../server/seed/mercuryCategoryMap.js';

describe('suggestTaxCategory', () => {
  it('maps a known Mercury category name to the correct tax category', () => {
    assert.equal(suggestTaxCategory('Payroll'), 'Contract Labor');
    assert.equal(suggestTaxCategory('Legal & Professional Services'), 'Legal & Professional Services');
    assert.equal(suggestTaxCategory('Travel & Transportation'), 'Travel');
  });

  it('falls back to Other Expenses for an unrecognized name', () => {
    assert.equal(suggestTaxCategory('Some Brand New Category Mercury Just Added'), 'Other Expenses');
  });

  it('falls back to Other Expenses for null or undefined', () => {
    assert.equal(suggestTaxCategory(null), 'Other Expenses');
    assert.equal(suggestTaxCategory(undefined), 'Other Expenses');
  });

  it('every value in the map is a real TaxCategory the UI already knows about', () => {
    const KNOWN_TAX_CATEGORIES = [
      'Advertising', 'Contract Labor', 'Office Expense', 'Insurance',
      'Legal & Professional Services', 'Rent', 'Supplies', 'Taxes & Licenses',
      'Travel', 'Meals', 'Utilities', 'Other Expenses',
    ];
    for (const taxCategory of Object.values(MERCURY_CATEGORY_TO_TAX_CATEGORY)) {
      assert.ok(KNOWN_TAX_CATEGORIES.includes(taxCategory), `${taxCategory} is not a known TaxCategory`);
    }
  });
});
