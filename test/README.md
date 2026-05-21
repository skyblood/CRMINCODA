# Costing System Test Suite

Complete testing infrastructure for the CRM-BD costing system including unit tests, integration tests, manual test scenarios, and demo data.

## Files

- **costing.integration.test.ts** — Automated integration tests for all costing endpoints
- **COSTING_TEST_CHECKLIST.md** — Manual testing guide with 3 demo scenarios and validation test cases
- **seed-costing-demo.ts** — Seed script to populate demo users and leads
- **README.md** — This file

---

## Quick Start

### 1. Seed Demo Data

Populate database with test users and demo leads:

```bash
pnpm server  # Terminal 1 — ensure backend is running
npx ts-node test/seed-costing-demo.ts  # Terminal 2
```

Output:
```
🌱 Seeding Costing Demo Data...

📝 Creating demo users...
  ✅ Alice Chen - Finance (admin)
     canApproveCosting: true
  ✅ Bob Martinez - Sales (sales)
  ✅ Carol Smith - Senior Consultant (consultant)

📋 Creating demo leads...
  ✅ Acme Corporation
     Sale: $60,000 | Cost: $35,000 | Margin: 41.7%
  ✅ GlobalTech Solutions
     Sale: $40,000 | Cost: $34,000 | Margin: 15.0%
  ✅ TechStartup Innovations
     Sale: $150,000 | Cost: $170,000 | Margin: -13.3%
  ✅ Enterprise Corp
     Sale: $105,000 | Cost: $0 | Margin: 100.0%
```

### 2. Run Integration Tests

```bash
bun test test/costing.integration.test.ts
```

Runs 31 tests across 5 test suites:
- ✅ SKU Costing Endpoint (7 tests)
- ✅ User Hourly Cost Endpoint (9 tests)
- ✅ Lead Items Costing Endpoint (7 tests)
- ✅ Lead Costing Review Endpoint (7 tests)
- ✅ End-to-End Costing Workflow (1 test)

### 3. Manual Testing

Open CRM in browser:
```bash
pnpm dev:full  # Frontend + Backend
```

Then follow **COSTING_TEST_CHECKLIST.md** for:
- 3 complete demo scenarios with expected outcomes
- 6 validation error test cases
- 9 role-based access control tests
- 3 advanced integration tests
- Sign-off checklist

---

## Demo Scenarios

### Scenario 1: Under-Budget (40% Margin — HEALTHY ✅)
**Lead:** Acme Corporation  
**Deal:** $60,000 sale | $35,000 cost | $25,000 margin (41.7%)  
**Test:** Margin shows GREEN, approval succeeds  
**Demo Time:** 1 min

### Scenario 2: At-Budget (15% Margin — YELLOW ⚠️)
**Lead:** GlobalTech Solutions  
**Deal:** $40,000 sale | $34,000 cost | $6,000 margin (15%)  
**Test:** Margin shows AMBER, approval succeeds with comment  
**Demo Time:** 1 min

### Scenario 3: Over-Budget (-13.3% LOSS — RED 🚫)
**Lead:** TechStartup Innovations  
**Deal:** $150,000 sale | $170,000 cost | -$20,000 loss  
**Test:** Margin shows RED, approval recorded but user warned  
**Demo Time:** 1 min

---

## Test Structure

### Integration Tests (`costing.integration.test.ts`)

Each endpoint tested for:
- ✅ Happy path — valid inputs accepted
- ✅ Boundary conditions — 0, 100,000
- ❌ Validation errors — negative, too high, invalid types
- ❌ Not found errors — non-existent resources
- 🔐 Role-based access control — only admin can approve

**Endpoints Covered:**
1. `PATCH /api/skus/:id/costing` — SKU cost configuration
2. `PATCH /api/users/:id/hourly-cost` — Consultant hourly rates
3. `PATCH /api/leads/:id/items-costing` — Individual item cost review
4. `POST /api/leads/:id/costing-review` — Finance approval gate

### Manual Tests (`COSTING_TEST_CHECKLIST.md`)

Organized by test type:
- **Scenario Tests** — Full workflows with expected outcomes
- **Validation Tests** — Error cases and user feedback
- **RBAC Tests** — Role permissions and access control
- **Snapshot Tests** — Time log cost capture
- **Conversion Tests** — Lead → Project with costing metadata
- **Loading Tests** — Network delays and error recovery

---

## Key Validations

### Input Validation (Backend)

| Endpoint | Field | Rules |
|----------|-------|-------|
| SKU costing | suggestedBaseCost | 0 ≤ x ≤ 100,000 |
| SKU costing | costUnit | 'hora' \| 'licencia' \| 'fijo' |
| User hourly-cost | hourlyCost | 0 ≤ x ≤ 100,000 |
| Lead items-costing | baseCost | 0 ≤ x ≤ 100,000 |
| Lead items-costing | costStatus | 'pending' \| 'reviewed' \| 'approved' |

### Role Enforcement (Frontend + Backend)

| Action | Requires | Where |
|--------|----------|-------|
| View costing modal | Any role | Frontend renders for all |
| Edit base costs | (none) | Frontend allows all; backend validates |
| Approve costing | canApproveCosting = true | Backend: 403 if false |
| See "Mark as Reviewed" button | canApproveCosting = true | Frontend: button disabled if false |

### Data Persistence

| Data | Snapshot At | Used For |
|------|------------|----------|
| Consultant hourly cost | When timeLog created | Calculating entryCost = hours × hourlyCostSnapshot |
| Approval decision | When POST costing-review | costingReviewedAt, costingReviewedBy stored on lead |
| Cost review | When PATCH items-costing | baseCost, costStatus stored on item |

---

## Troubleshooting

### "ECONNREFUSED" when running tests
**Fix:** Start backend first: `pnpm server`

### Seed data fails with 400
**Cause:** Users/leads may already exist in DB  
**Fix:** Either use unique IDs or drop database: `mongo crm_blackmoon --eval "db.dropDatabase()"`

### Modal doesn't open in UI
**Check:**
1. Backend running on port 3001 ✅
2. `currentUser` prop passed to CRMPipeline ✅
3. `activeLead` set in state ✅
4. Browser console for errors

### "Mark as Reviewed" button disabled
**Check:**
1. User role is 'admin' (has canApproveCosting=true by default) ✅
2. Or explicitly set canApproveCosting=true in User record ✅
3. Verify passed as prop to CostingReview component ✅

---

## Performance & Load Testing

For stress testing with many leads/items:

```bash
# Generate 100 test leads with 5 items each
for i in {1..100}; do
  curl -X POST http://localhost:3001/api/leads \
    -H 'Content-Type: application/json' \
    -d '{"id":"stress_'$i'","companyName":"Company'$i'","contactName":"Contact'$i'","email":"contact'$i'@example.com","stage":"proposal","items":[...]}'
done
```

Then run integration tests to verify no N+1 queries or timeouts.

---

## CI/CD Integration

Add to GitHub Actions or equivalent:

```yaml
- name: Run Costing Tests
  run: |
    bun test test/costing.integration.test.ts --bail
```

Should complete in < 10 seconds for all 31 tests.

---

## FAQ

**Q: Can consultants see costing data?**  
A: Yes, they can VIEW the modal but cannot EDIT costs or APPROVE. Button is disabled with a warning.

**Q: What happens if approval user doesn't exist?**  
A: API returns 404: "User not found". Error toast shown to user.

**Q: Are costs recalculated when hourly rates change?**  
A: No — we use snapshots. Old timeLogs keep their captured rate. Only NEW logs get new rate.

**Q: Can I approve without setting all item costs?**  
A: Yes, approval gate only checks that approver has permission, not completeness. But UI shows warning.

**Q: How do I test with my own data?**  
A: Skip seed script, manually add leads in UI, then open costing modal and test.

---

## Sign-Off

Once all tests pass locally, team lead signs off before pushing to main:

```
Name: _________________
Date: __________________
Tests Passed: [ ] Unit [ ] Integration [ ] Manual Scenarios
Ready for: [ ] Staging [ ] Production
```
