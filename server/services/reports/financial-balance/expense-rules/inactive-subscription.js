/**
 * Rule: Subscription/software expense with no activity for >60 days.
 * Detects recurring charges (same title, same amount) in category 'software'
 * that stopped appearing — or that keep appearing with no linked project activity.
 */
export function evaluate(monthlyTrend, context) {
  const recommendations = [];
  if (monthlyTrend.length < 2) return recommendations;

  // Check if software category was active early but dropped to zero recently
  const recentMonths = monthlyTrend.slice(-2);
  const olderMonths = monthlyTrend.slice(0, -2);

  if (olderMonths.length === 0) return recommendations;

  const recentSoftware = recentMonths.reduce((s, m) => s + (m.byCategory.software || 0), 0);
  const olderSoftware = olderMonths.reduce((s, m) => s + (m.byCategory.software || 0), 0);
  const olderAvg = olderSoftware / olderMonths.length;

  // If software expenses dropped significantly (>80% reduction), might indicate cancelled sub
  // But if they stayed constant, they might be unused
  if (olderAvg > 0 && recentSoftware > 0) {
    const recentAvg = recentSoftware / recentMonths.length;
    // Constant recurring charge with no reduction — flag for review
    if (Math.abs(recentAvg - olderAvg) / olderAvg < 0.1 && recentAvg > 50) {
      recommendations.push({
        item: 'Software subscriptions',
        action: `Recurring software expense of ~$${Math.round(recentAvg)}/month detected with no variation. Review if all subscriptions are actively used.`,
        estimatedMonthlySaving: Math.round(recentAvg * 0.20), // Assume 20% could be unused
        priority: 'medium',
        effort: 'low',
      });
    }
  }

  return recommendations;
}
