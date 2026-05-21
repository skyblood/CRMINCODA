/**
 * Rule: Detect potential duplicate licenses by similar expense titles.
 * Compares software/license expenses with similar names (Levenshtein or substring match).
 */
export function evaluate(monthlyTrend) {
  // This rule operates on raw transaction data, but we only have aggregated monthly data here.
  // For now, return empty — this rule will be fully effective when we add
  // per-transaction detail to the monthly trend data.
  // Keeping the file as a placeholder so the rule engine structure is complete.
  return [];
}
