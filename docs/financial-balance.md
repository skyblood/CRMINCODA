# Financial Balance Report — Technical Documentation

## Endpoint

```
GET /api/reports/financial-balance
```

**Auth**: Admin only (`permissions.admin === true`).

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | ISO date | 12 months ago | Start of reporting period |
| `to` | ISO date | Today | End of reporting period |
| `currency` | String | `USD` | Target currency for display |
| `includeLegacy` | Boolean | `false` | Include `legacy_migration` records |

### Example

```bash
curl -b cookies.txt "http://localhost:3001/api/reports/financial-balance?from=2025-01-01&to=2025-12-31&currency=USD"
```

---

## Response Shape

```
{
  meta, executiveSummary, revenue, margins, operations,
  pipeline, commissions, expenses, alerts, cashForecast90d, dataToClean
}
```

Full type definition: see `server/services/reports/financial-balance/index.js`.

---

## How Each Metric Is Calculated

### Executive Summary

| Metric | Formula | Source |
|--------|---------|--------|
| `cashIn` | Total payments collected (all time) minus total expenses (all time). If negative, shows 0. | Payment.amountUSD, Transaction.amountUSD |
| `billedPending` | Sum of `balanceUSD` on all open invoices (status: issued, partially_paid, overdue) | Invoice.balanceUSD |
| `totalExpenses` | Sum of all expense transactions in the period | Transaction (type=expense, dateObj in range) |
| `operatingMargin` | `(totalBilled - totalExpenses) / totalBilled * 100` | Invoice.totalUSD, Transaction |
| `netDelta` | `totalCollected - totalExpenses` in the period | Payment.amountUSD, Transaction.amountUSD |
| `runwayMonths` | `currentCash / monthlyExpenseAvg` | Derived |
| `topAlerts` | Deterministic rules (see Alerts section below) | Multiple sources |

### Revenue

#### mrrVsOneShot
- **Recurring**: Invoices linked to projects with `type: 'hours_pack'` (matched via `$lookup` on `projectId`)
- **One-shot**: Everything else (implementation, license, etc.)
- Amounts in USD using `totalUSD` stored at invoice creation time.

#### billedVsCollectedMonthly
- **Billed**: `Invoice.totalUSD` grouped by `issueDate` month
- **Collected**: `Payment.amountUSD` grouped by `paymentDate` month
- Both filtered to the `from`/`to` range.

#### DSO (Days Sales Outstanding)
- **Weighted by amount**, not simple average.
- Formula: `sum((paymentDate - issueDate) * amountAppliedUSD) / sum(amountAppliedUSD)`
- Per-client and global.
- Only considers payments with `$lookup` to their linked invoice.
- If a client has zero payments, they don't appear in DSO (no data to calculate from). Their overdue invoices appear in AR Aging and Top Debtors instead.

**Limitation**: DSO is backward-looking. A client who just started paying will have a misleading DSO.

#### arAging
- Buckets: `0-30`, `31-60`, `61-90`, `90+` days overdue.
- Calculated as `floor((now - dueDate) / 86400000)` for each open invoice.
- Only invoices with `status` in `[issued, partially_paid, overdue]`.
- Amount: `balanceUSD` (remaining unpaid amount).

**Limitation**: Invoices without `dueDate` default to 0 days overdue (bucket `0-30`).

#### topClientsByRevenue
- Top 10 clients by `sum(totalUSD)` of invoices in the period.

#### topDebtors
- Top 10 clients by `sum(balanceUSD)` of open invoices (not period-filtered).

#### concentrationRisk
- `topClientPct`: Revenue share of the #1 client.
- `top3Pct`: Revenue share of the top 3 clients.
- `herfindahlIndex`: Sum of squared revenue shares (HHI). Higher = more concentrated.
- Alert triggered if `topClientPct > 40%`.

---

### Margins

Mirrors the logic in `ProfitabilityReport.tsx`:

#### Revenue per project
- For license items: `(sellPrice - costPrice) * quantity` (margin, not full price)
- For service items: `sellPrice * quantity`
- Fallback: `lead.value` if no items

#### Cost per project
- **Labor**: `sum(hours * consultantRate)` for approved/paid timeLogs
- **Expenses**: `sum(amountUSD)` of transactions linked by `projectId` or `leadId`

#### Margin
- `margin = revenue - cost`
- `marginPct = (margin / revenue) * 100`

Grouped by: `byServiceLine` (project.type), `byTopClients`, `byActiveProject`.

---

### Operations

#### consultantUtilization
- Available hours: `160 hours/month * monthsInRange` (8h * 20 working days)
- Billable hours: sum of `timeLogs.hours` where `status = approved|paid` and `isBillable !== false`
- `utilizationPct = billableHours / availableHours * 100`

#### billableHourCost
- `totalSalaries / totalBillableHours` across all consultants
- `totalSalaries = sum(monthlySalary * monthsInRange)` from User model

#### effectiveHourlyCost (per consultant)
- `(monthlySalary * monthsInRange) / billableHours`
- Measures the real cost per billable hour including idle time

#### Thresholds
- **Underutilized**: `< 50%` utilization
- **Overutilized**: `> 90%` utilization (burnout risk)

**Limitation**: TimeLogs are embedded in Projects, not a separate collection. The query iterates all projects and filters logs by date range. This scales fine for < 100 projects but would benefit from a separate TimeLogs collection at scale.

---

### Pipeline

#### velocity
- Average days from `lead.createdAt` to `lead.closedAt` for leads that reached `closed_won` in the period.
- Returns 0 if no deals closed in the period.

#### quoteToInvoiceConversion
- `(leads at closed_won / leads that reached proposal or beyond) * 100`
- "Reached proposal or beyond" = has `items[]` and stage in `[proposal, negotiation, closed_won, closed_lost]`

#### weightedPipelineValue
- `sum(lead.value * stageProbability)` for active leads
- Stage probabilities: new=5%, contacted=10%, qualified=20%, proposal=40%, negotiation=60%

#### expectedNextQuarter
- Same as weightedPipelineValue but filtered to leads with `expectedCloseDate` within 90 days

---

### Commissions

Source: `Commission` collection (created by migration 002 from Projects, updated going forward).

| Metric | Formula |
|--------|---------|
| `committed` | Sum of `amountUSD` for non-cancelled commissions |
| `paid` | Sum of `paidAmountUSD` |
| `pending` | `committed - paid` |
| `exposureNext60Days` | Sum of unpaid balance on `pending` or `approved` commissions |

Commission calculation (at creation time):
1. `netUtility = revenue - laborCost - expenses`
2. `commission = netUtility > 0 ? netUtility * (rate / 100) : 0`
3. Split: BM 40% / Fabian 30% / Spencer 30% of `(netUtility - commission)`

---

### Expenses

#### byCategory
- MongoDB aggregation: group transactions (type=expense) by `category`, sum `amountUSD`.

#### monthlyTrend
- Grouped by `dateObj` month and category.
- Shape: `{ month, total, byCategory: { cat: amount } }`

#### recommendations
- Deterministic rules engine. Each rule is a separate file in `expense-rules/`:
  - **growing-category.js**: Flags categories with >15% MoM growth for 3+ consecutive months
  - **inactive-subscription.js**: Flags constant software charges (~0% variation) suggesting unused subscriptions
  - **duplicate-licenses.js**: Placeholder for detecting similar-named software charges

#### benchmarks
- `costPerConsultant`: Monthly expense average / number of consultants
- `costPerClient`: Total expenses / distinct active clients (in period)
- `overheadRatio`: `totalExpenses / totalRevenue * 100`

---

### Cash Forecast (90 days)

Three scenarios, each producing 13 weekly projections:

#### Starting position
- `currentCash = totalCollected (all time) - totalExpenses (all time)`

#### Weekly outflow
- `monthlyExpenseAvg / 4` based on last 3 months of expenses

#### Inflows

| Scenario | Invoice inflows | Pipeline inflows |
|----------|----------------|-----------------|
| **Pessimistic** | Open invoices, each expected to pay at `issueDate + clientDSO` | None |
| **Base** | Same as pessimistic | + 50% of weighted pipeline value |
| **Optimistic** | Same as pessimistic | + 80% of weighted pipeline value |

#### cashCrunchDate
- First week where the **base** scenario's cash position goes negative.
- `null` if cash never goes negative in 90 days.

**Assumption**: Pipeline inflows that would convert beyond 90 days are capped at the 90-day boundary.

**Limitation**: Does not account for seasonality in expenses or revenue. Uses flat monthly average.

---

## Alerts

Deterministic alerts generated from data:

| Alert | Severity | Trigger |
|-------|----------|---------|
| Concentration risk | high | Top client > 40% of revenue |
| Cash crunch | critical | Base forecast goes negative within 90 days |
| AR 90+ overdue | high | Any amount in the 90+ aging bucket |
| Overutilized consultants | medium | Any consultant > 90% utilization |
| High pending commissions | medium | Pending commissions > $10,000 |
| Low runway | critical | Runway < 3 months |

---

## Data Quality Warnings

Automatically detected and reported in `meta.dataQualityWarnings`:

- Invoices missing `exchangeRateToUSD` (defaulting to 1.0)
- Expenses missing `amountUSD` (using raw `amount` as USD)
- Open invoices valued at issue-time exchange rate, not current market rate

---

## Architecture

```
server/services/reports/financial-balance/
  index.js              # Orchestrator — runs sections in parallel
  revenue.js            # MRR, billed/collected, DSO, aging, concentration
  margins.js            # By service line, by client, by active project
  operations.js         # Consultant utilization, billable hour cost
  pipeline.js           # Velocity, conversion, weighted value
  commissions.js        # Committed, paid, pending, exposure
  expenses.js           # By category, trends, benchmarks, rules engine
  forecast.js           # 90-day 3-scenario cash projection
  expense-rules/
    growing-category.js     # >15% MoM growth rule
    inactive-subscription.js # Constant charge detection
    duplicate-licenses.js    # Similar name detection (placeholder)
```

Each section exports a pure function `(db, params) => Promise<result>`. The orchestrator runs them with `Promise.all` for maximum parallelism.

---

## Adding a New Expense Rule

1. Create `server/services/reports/financial-balance/expense-rules/your-rule.js`
2. Export `evaluate(monthlyTrend, context)` returning an array of recommendations:
   ```js
   { item, action, estimatedMonthlySaving, priority: 'high'|'medium'|'low', effort: 'low'|'medium'|'high' }
   ```
3. Import it in `expenses.js` inside the `computeExpenseRecommendations` function
4. Add a test in `tests/financial-balance/financial-balance.test.js`

---

## Known Limitations

1. **Transaction.date is still a string** — `dateObj` (Date) was added alongside it for aggregation. Both are kept for backward compatibility. Future cleanup: deprecate the string `date` field.

2. **TimeLogs are embedded in Projects** — Operations section iterates all projects. If project count exceeds ~100, consider extracting TimeLogs to a separate collection.

3. **No real-time exchange rates for open invoices** — AR aging and billing metrics use the exchange rate stored at invoice creation time. For accurate multi-currency reporting of open invoices, a reference rate update mechanism is needed.

4. **Commission model is project-level, not per-consultant** — The `Commission` collection stores one record per project. Per-consultant commission tracking would require extending the model.

5. **Expense rules operate on aggregated monthly data** — The duplicate-licenses rule needs per-transaction detail to compare titles. Currently a placeholder.

6. **Forecast assumes flat expense rate** — No seasonality modeling. Uses average of last 3 months.
