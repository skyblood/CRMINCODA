/**
 * Rule: Category growing >15% MoM for 3+ consecutive months.
 */
export function evaluate(monthlyTrend) {
  const recommendations = [];
  if (monthlyTrend.length < 3) return recommendations;

  // Collect all categories across months
  const categories = new Set();
  for (const m of monthlyTrend) {
    for (const cat of Object.keys(m.byCategory)) categories.add(cat);
  }

  for (const category of categories) {
    let consecutiveGrowthMonths = 0;
    let lastAmount = 0;
    let avgGrowthRate = 0;
    let growthRates = [];

    for (let i = 0; i < monthlyTrend.length; i++) {
      const amount = monthlyTrend[i].byCategory[category] || 0;
      if (i > 0 && lastAmount > 0) {
        const growthRate = ((amount - lastAmount) / lastAmount) * 100;
        if (growthRate > 15) {
          consecutiveGrowthMonths++;
          growthRates.push(growthRate);
        } else {
          consecutiveGrowthMonths = 0;
          growthRates = [];
        }
      }
      lastAmount = amount;
    }

    if (consecutiveGrowthMonths >= 3) {
      avgGrowthRate = Math.round(growthRates.reduce((s, r) => s + r, 0) / growthRates.length);
      const currentMonthly = lastAmount;
      const estimatedSaving = Math.round(currentMonthly * 0.15);

      recommendations.push({
        item: `${category} expenses`,
        action: `Category "${category}" grew >15% MoM for ${consecutiveGrowthMonths} consecutive months (avg ${avgGrowthRate}% growth). Review for cost optimization.`,
        estimatedMonthlySaving: estimatedSaving,
        priority: 'high',
        effort: 'low',
      });
    }
  }

  return recommendations;
}
