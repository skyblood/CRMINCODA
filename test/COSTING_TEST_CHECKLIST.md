# Costing System: Manual Test Checklist & Demo Scenarios

## Overview

This document provides manual testing instructions and three pre-built demo scenarios for testing the costing system end-to-end.

**Prerequisites:**
- Backend running on port 3001 (`pnpm server`)
- Frontend running on port 5173 (`pnpm dev`)
- MongoDB running locally on default port
- At least one admin user and one consultant user created

---

## DEMO SCENARIOS

### Scenario 1: Under-Budget Project (40% Margin)
**Context:** Sales quoted a $50k implementation deal. Finance discovers internal cost is only $30k, leaving healthy 40% margin.

**Setup Data:**
```
Lead: Acme Corp - Implementation Project
Items:
  - Implementation: $50,000 (sale price)
  - Training: $10,000 (sale price)
  Total: $60,000

Costs (set by finance):
  - Implementation base cost: $30,000
  - Training base cost: $5,000
  Total cost: $35,000

Margin: $25,000 (41.7%)
```

**Test Steps:**
1. Create lead "Acme Corp Implementation" with 2 items ($50k impl + $10k training)
2. Move to "Proposal" stage
3. Open "Costing Review" modal
4. Enter base costs: $30k for implementation, $5k for training
5. Set costStatus to "approved" for both items
6. Verify margin calculation: $25k total, 41.7% on total
7. Click "Mark as Reviewed" (finance role only)
8. Confirm approval toast appears
9. Verify lead shows "Costing Reviewed" badge in card

**Expected Outcome:** Healthy margin flagged in green (≥30%).

---

### Scenario 2: At-Budget Project (15% Margin — Yellow Zone)
**Context:** Deal has acceptable but thin margins. Finance should approve with caution.

**Setup Data:**
```
Lead: GlobalTech - Support Contract
Items:
  - Annual Support: $40,000 (sale price)

Costs (set by finance):
  - Annual Support base cost: $34,000

Margin: $6,000 (15%)
```

**Test Steps:**
1. Create lead "GlobalTech Support Contract" with 1 item ($40k)
2. Move to "Proposal" stage
3. Open "Costing Review"
4. Enter base cost: $34k
5. Set costStatus to "approved"
6. Verify margin displays: $6k (15%) in amber/yellow color
7. Add comment: "Thin margin - Monitor closely during execution"
8. Click "Mark as Reviewed"
9. Verify approval recorded

**Expected Outcome:** Margin in amber (15-30%), comment saved, approval gate enforced.

---

### Scenario 3: Over-Budget Project (LOSS — Red Zone)
**Context:** Sales quoted aggressively. Internal cost analysis reveals deal loses money. Finance must reject.

**Setup Data:**
```
Lead: TechStartup - Custom Development
Items:
  - Development Phase 1: $100,000 (sale price)
  - Development Phase 2: $50,000 (sale price)
  Total: $150,000

Costs (discovered by finance):
  - Phase 1 actual cost: $80,000 (consultant timesheet avg)
  - Phase 2 estimated: $90,000 (consultant shortage risk)
  Total cost: $170,000

Result: -$20,000 LOSS (-13.3%)
```

**Test Steps:**
1. Create lead "TechStartup Development" with 2 items ($100k phase1 + $50k phase2)
2. Move to "Proposal" stage
3. Open "Costing Review"
4. Enter base costs: $80k, $90k
5. Verify margin displays: -$20k LOSS (-13.3%) in RED
6. Try to approve without changing costs → should work (warning only)
7. Add comment: "HOLD - Renegotiate pricing or defer Phase 2"
8. Mark as "Reviewed" (not fully approved)
9. Block conversion to project until sales renegotiates
10. Once renegotiated, re-enter costs and approve

**Expected Outcome:** Red negative margin, comment captures risk, approval recorded, user warned.

---

## VALIDATION ERROR TEST CASES

### Test 1: Invalid Base Cost (Negative)
**Action:** Try to set baseCost = -$1,000  
**Expected:** Error toast: "baseCost must be between 0 and 100,000"  
**Actual:** ____

### Test 2: Invalid Base Cost (Too High)
**Action:** Try to set baseCost = $100,001  
**Expected:** Error toast: "baseCost must be between 0 and 100,000"  
**Actual:** ____

### Test 3: Invalid Cost Status
**Action:** Try to set costStatus = "invalid_status"  
**Expected:** Error toast: "costStatus must be one of: pending, reviewed, approved"  
**Actual:** ____

### Test 4: Non-Existent Item
**Action:** Manually craft request to set cost for non-existent item  
**Expected:** Error toast: "Item not found in this lead"  
**Actual:** ____

### Test 5: Consultant Trying to Approve
**Action:** Log in as consultant, open Costing Review, try to click "Mark as Reviewed"  
**Expected:** Button disabled + amber warning: "Only finance/admin users can approve costing"  
**Actual:** ____

### Test 6: User Not Found
**Action:** Craft approval request with non-existent user ID  
**Expected:** Error toast: "User not found"  
**Actual:** ____

---

## ROLE-BASED ACCESS CONTROL TESTS

| User Role | Can View Modal | Can Edit Costs | Can Click "Mark as Reviewed" | Notes |
|-----------|---|---|---|---|
| **Admin** | ✅ | ✅ | ✅ | Full access |
| **Sales** | ✅ | ❌ | ❌ | Read-only; button disabled |
| **Consultant** | ✅ | ❌ | ❌ | Read-only; button disabled |
| **Finance** | ✅ | ✅ | ✅ | (if canApproveCosting=true) |

**Test:** Create users for each role, verify RBAC enforcement.

---

## SNAPSHOT & TIME LOG TESTS

### Test: Consultant Hourly Cost Snapshot
**Setup:**
1. Set Consultant A hourly cost to $100
2. Create project, log 10 hours under Consultant A
3. Update Consultant A hourly cost to $200
4. Log 5 more hours under Consultant A

**Expected:**
- First 10 hours snapshot: $100/hr = $1,000 entryCost
- Next 5 hours snapshot: $200/hr = $1,000 entryCost
- Total actual cost = $2,000

**Actual:** ____

---

## CONVERSION TO PROJECT TEST

**Scenario:** After costing review approved, convert lead to project.

**Steps:**
1. Complete Scenario 1 (Under-Budget) through approval
2. Click "Convert to Project" button on lead card
3. Select template and assign consultant
4. Verify project created with:
   - All items converted to tasks
   - Base costs preserved in project.items
   - costingReviewedAt timestamp set
   - costingReviewedBy set to approver

**Expected:** Project visible in Projects module with costing metadata.

---

## LOADING & ERROR STATES TEST

### Test: Network Delay Simulation
1. Open DevTools > Network tab
2. Set throttle to "Slow 3G"
3. Open Costing Review modal
4. Click "Save Changes"
5. Verify "Saving..." spinner appears
6. Verify button disabled during save
7. Wait for response
8. Verify success toast appears after 3s

**Expected:** Smooth loading state, no double-submit possible.

### Test: Save Error Recovery
1. Introduce bad base cost (e.g., $100,001)
2. Click "Save Changes"
3. Verify red error toast appears with message
4. Fix the value
5. Click "Save Changes" again
6. Verify success

**Expected:** Error handled gracefully, user can retry.

---

## INTEGRATION TEST EXECUTION

Run integration tests:
```bash
bun test test/costing.integration.test.ts
```

**Expected Output:**
- ✅ SKU Costing Endpoint (7 tests)
- ✅ User Hourly Cost Endpoint (9 tests)
- ✅ Lead Items Costing Endpoint (7 tests)
- ✅ Lead Costing Review Endpoint (7 tests)
- ✅ End-to-End Costing Workflow (1 test)

---

## SIGN-OFF CHECKLIST

Once all tests pass, sign off below:

- [ ] Scenario 1 (Under-Budget) tested and working
- [ ] Scenario 2 (At-Budget) tested and working
- [ ] Scenario 3 (Over-Budget) tested and working
- [ ] All validation errors caught and displayed
- [ ] RBAC enforced (consultant cannot approve)
- [ ] Snapshots captured correctly in timeLogs
- [ ] Project conversion preserves costing metadata
- [ ] Integration tests pass (bun test)
- [ ] No console errors or warnings
- [ ] Modal loading states work correctly
- [ ] Error recovery works (edit and retry)

**Tester:** ________________  
**Date:** ________________  
**Notes:** ________________

---

## TROUBLESHOOTING

### Modal doesn't open
- Check that `activeLead` is set in CRMPipeline state
- Verify CostingReview component is imported
- Check browser console for errors

### "Mark as Reviewed" button disabled
- Verify currentUser.canApproveCosting = true
- Check that user role is 'admin' or has explicit canApproveCosting set
- Check User model schema for field definition

### Costs not saved
- Check server is running on port 3001
- Verify MongoDB connection
- Check server console for validation errors
- Check browser Network tab for 400/404 responses

### Snapshot not captured
- Verify consultant exists in User collection before timeLog created
- Check Project.js processes timeLogs in PUT handler
- Verify hourlyCostSnapshot field added to schema

---

## DEMO SCRIPT (5 min)

```
1. Open CRM, show lead in Proposal stage
2. Click "Review Costs" → modal opens, shows items with prices
3. Finance enters base costs, clicks Save
4. Costs recalculate → shows margin % and $ amount
5. For over-budget deal: show RED margin, comment "Hold - renegotiate"
6. For healthy deal: show GREEN margin, click "Mark as Reviewed"
7. Approval toast confirms → lead now has "Costing Reviewed" badge
8. Convert to project → show costing preserved in project details
9. "We now have full cost visibility before committing to a deal."
```
