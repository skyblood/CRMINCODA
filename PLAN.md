<!-- /autoplan restore point: /Users/incoda/.gstack/projects/source-Incoda-CRM-BD/main-autoplan-restore-20260405-204603.md -->
# PLAN.md — CRM Incoda Evolution

> Synthesized from MEJORAS_PRIORITARIAS.md, ROADMAP.md, MEJORAS.md
> Date: 2026-04-05 | Branch: main

---

## Problem Statement

CRM Incoda has best-in-class vertical features (projects, finance, consultant portal) scoring 10/10 in those modules. **Most Phase 2-3 features are already implemented as uncommitted code** — 17 new components exist alongside full backend routes for accounts, automations, analytics, AI reports, and calendar. The actual work is: (1) commit + smoke-test what exists, (2) fill genuine remaining gaps (server-side pagination, form validation, win/loss modal, sales quota, tests).

The goal: ship existing code, validate it works end-to-end, then fill real gaps. Not build from scratch.

---

## Current Module Scores

| Module | Score | Status |
|---|---|---|
| Pipeline / Sales | 9/10 | Solid |
| Projects | 10/10 | Differentiator |
| Finance | 10/10 | Differentiator |
| Reports / Analytics | 8/10 | Good |
| UX / Mobile | 8/10 | Good |
| AI Features | 7/10 | Improvable |
| Contacts / Accounts | 4/10 | **Critical Gap** |
| Automation | 3/10 | **Critical Gap** |

---

## What Already Exists (Don't Break)

1. **Full post-sale vertical**: projects + hours + profitability + commissions + balance sheet — no generic CRM has this
2. **Offline-first**: pending writes queue with auto-flush via `localStorage` → `firebaseService.ts`
3. **Financial depth**: GAAP balance, salary history, per-consultant billing rates
4. `createCrudRouter(Model)` — generic REST CRUD factory in `server/routes/crud.js`
5. AI scoring via `/api/aiScore` (Gemini integration)
6. Email notifications on Closed Won (nodemailer + SMTP)
7. RBAC: admin / sales / consultant roles with module-level permission flags
8. Existing models: Lead, User, Project, Pipeline, Account, Activity, AutomationRule, Webhook, Proposal, Notification

---

## Phase 1 — Quick Wins (1-2 weeks, high ROI)

### 1.1 Win/Loss Reason on Deal Close
- Add `closedReason` + `closedNote` fields to `Lead` model
- Modal prompt when moving to `closed-won` or `closed-lost`
- **Impact**: every top CRM has this; enables analysis of why deals are lost

### 1.2 Bulk Actions in Pipeline
- Multi-select checkboxes in kanban + table view
- Bulk: change stage, assign owner, export selection
- **Impact**: sales team productivity

### 1.3 Sales Quota per Rep + Leaderboard
- Add `salesQuota` (monthly/quarterly) to `User` model
- Dashboard widget: % quota attainment per rep
- **Impact**: motivation + management visibility

### 1.4 AI Next Action per Deal
- New endpoint `GET /api/aiScore/:id/suggestion`
- Context: current stage + days since last activity + history
- Show suggestion on lead card
- **Impact**: differentiator vs Pipedrive/HubSpot AI

### 1.5 Form Validation (zod + react-hook-form)
- Replace ad-hoc `useState` validation in all forms
- Client-side inline validation before API call
- Mirror Zod schemas server-side for all endpoints
- **Impact**: UX + data integrity

### 1.6 Drag & Drop Kanban
- Move cards between columns with drag & drop (`@dnd-kit/core`)
- Optimistic UI update + server confirmation
- **Impact**: core UX gap; current kanban requires opening card to change stage

### 1.7 Toast / Feedback System
- `components/Toast.tsx` ya existe — conectar a todos los flujos CRUD (crear, editar, eliminar, error)
- Reemplazar `alert()` y fallos silenciosos con feedback visible al usuario
- **Impact**: UX básico; sin esto los errores de API pasan desapercibidos

---

## Phase 2 — Structural Improvements (2-4 weeks)

### 2.1 Account/Company Entity (Critical Gap Fix)
- `Account` model already exists in `server/models/Account.js`
- Wire up: `Contact.accountId` FK → Account, `Lead.accountId` FK → Account
- Account view showing all its deals and contacts
- **Impact**: critical gap vs all top CRMs

### 2.2 Activity Timeline per Contact/Lead
- `Activity` model already exists in `server/models/Activity.js`
- Chronological feed in lead/contact detail view
- Auto-log on stage changes, notes, emails
- **Impact**: relationship history visibility

### 2.3 Basic Automation Engine
- `AutomationRule` model already exists in `server/models/AutomationRule.js`
- 5 triggers: stage change, N days without activity, closed won, new lead assigned, field updated
- 4 actions: create task, send email (template), send webhook, internal notification
- **Impact**: critical gap; currently 3/10

### 2.4 CSV Import for Leads/Contacts
- Endpoint `POST /api/leads/import` with multer + papaparse
- Column mapping UI with preview + validation before import
- **Impact**: first thing every sales team asks for

### 2.5 Server-Side Pagination (Critical Tech Debt)
- Today all collections load completely — fails at 500+ records
- Add `?page=1&limit=50&sort=createdAt` to all CRUD endpoints
- Frontend: infinite scroll or paginator
- **Impact**: production performance blocker

### 2.6 Pipeline Analytics
- Conversion rate by stage (% leads advancing)
- Win/Loss ratio by manufacturer, partner, country, rep
- Pipeline velocity (avg days Prospect → Closed Won)
- Forecasting: projected revenue by probability × value × close date
- Lead source tracking (inbound, outbound, referral, partner)

### 2.7 Audit Trail
- `createdBy`, `updatedBy`, `updatedAt` on leads, projects, transactions
- Field change log: `{ field, oldValue, newValue, user, timestamp }`
- "Activity" tab in lead detail with change timeline
- `AuditLog` model already exists in `server/models/AuditLog.js`

---

## Phase 3 — Premium Differentiators (1-2 months)

### 3.1 PDF Generation for Invoices/Proposals
- `@react-pdf/renderer` or Puppeteer
- Template with project data + line items
- **Impact**: eliminates manual workflow outside CRM

### 3.2 Google Calendar Sync
- OAuth2 with Google (routes already exist at `server/routes/googleCalendar.js`)
- Create event when scheduling next step with date
- View rep's agenda in Dashboard

### 3.3 PWA + Mobile
- `manifest.json` + service worker (extiende la cola offline `CRM_PENDING_WRITES_V1` existente)
- Add to home screen, push notifications via Web Push API
- Simplified mobile views: add note, change stage, log hours
- **Impact**: field use by consultants
- **React Native**: post-PMF, post-validación PWA con Expo

### 3.4 AI Insights Panel in Dashboard
- "Top 5 deals to attack today" (score + days since activity)
- "Deals at risk of stagnation"
- "Projects at risk of budget deviation"
- `AIInsightsPanel.tsx` component already exists

### 3.5 Multiple Pipelines
- `Pipeline` entity with configurable stages per pipeline
- Pipeline filter in kanban/table
- `Pipeline` model already exists in `server/models/Pipeline.js`

### 3.6 Advanced Reporting
- Custom date range filter on all reports
- Filter by consultant, partner, manufacturer, country
- Commission breakdown by rep with monthly comparison
- Profitability drill-down: project → task → consultant
- Save filters as "favorite views"

### 3.7 Consultant Capacity View
- Weekly/monthly table with assigned hours per consultant
- Stoplight: green (<80%), yellow (80-100%), red (>100%)
- Show current load when assigning consultant to project

---

## Phase 4 — Production Hardening

### 4.1 Security & Data Integrity
- **`execChangeField` field whitelist** — `automationService.js` uses unsanitized `$set: { [rule.actionConfig.field]: value }`. Add `const ALLOWED_FIELDS = new Set(Object.keys(Lead.schema.paths))` guard before the update.
- **Concurrency 409 Conflict** — last-write-wins on simultaneous edits. Add `updatedAt` version check on all PUT endpoints + `409 Conflict` response.
- **Password reset self-service** — admin-only today. Token-based reset flow via email (SMTP already configured in `emailService.js`).
- **External API `/api/v1/` rate limiting** — endpoints call `Model.find().lean()` with no limit. Active external consumers confirmed. Add `?limit` enforcement (max 200) and pagination header.
- **`consultantName` → `consultantId` FK** — string denormalization rompe reports cuando cambia el nombre del consultor. Migrar campo en `Lead` y `Project`; actualizar queries de comisiones.

### 4.2 Performance & Indexes
- **MongoDB compound indexes** — `{ stage: 1, createdAt: -1 }` on Lead; `{ projectId: 1 }` on Activity. Currently full collection scans on filtered queries.
- **`mongoose { timestamps: true }`** on all models that lack it.
- **Tailwind CDN → PostCSS build** — 3.5 MB CDN hit on every cold load. Move to PostCSS + purge. Estimated bundle: ~15 KB.
- **Server-side pagination wired on frontend** — `createCrudRouter` already supports `?page=&limit=`. Wire all list views to pass `?page=1&limit=50` so the 500-doc fallback never activates.

### 4.3 Reliability
- **Webhook retry persistence** — `webhookService.js` uses `setTimeout` for retries. Server restart during backoff drops them silently. Add `status: "retrying"` to `WebhookLog` before `setTimeout` so restarts can resume.
- **WebSockets/SSE** — replace 60s notification polling with real-time push via `socket.io` (already installed: `server/socketInstance.js` exists).
- **Error boundaries** — wrap each `React.lazy()` module in an `<ErrorBoundary>` with per-module fallback UI. `components/ErrorBoundary.tsx` already exists.

### 4.4 Developer Experience
- **CI/CD GitHub Actions** — `.github/workflows/ci.yml`: lint + Vitest + `tsc --noEmit` + Vite build on every PR. Estimated: ~3 min pipeline.
- **`Lead.customData` TypeScript type** — add `customData?: Record<string, unknown>` to Lead interface in `types.ts`.
- **`firebaseService.ts` rename** — rename to `apiService.ts`. Update all imports. Purely cosmetic; eliminates confusion for new contributors.
- **DESIGN.md** — create full design system document: colors from `index.html`, spacing, component library. Prevents palette drift at scale.
- **`dev:full` port leak** — `pnpm dev:full` deja puertos huérfanos al hacer Ctrl+C. Migrar a `concurrently --kill-others-on-fail`. Trivial.
- **Swagger/OpenAPI** — documentar `/api/v1/` y rutas internas con `swagger-jsdoc` + `swagger-ui-express`. Necesario antes de onboarding de integraciones externas.

### 4.5 Email Tracking
- Log sent emails per lead (to/from/subject/timestamp) in `EmailTemplate` model (already exists).
- Add open/click status via Resend API webhook or tracking pixel.
- Editable email templates already in `server/models/EmailTemplate.js` — expose send history in the lead detail view.

### 4.6 Dynamic Template Previews
- Templates exist (`ProposalTemplateManager.tsx`, `EmailTemplate` model) but no preview-before-apply UI.
- Add preview pane in `ProposalTemplateManager.tsx` + `EmailTemplate` editor: render merged template with mock data before saving.

---

## Phase 5 — Scale (Requires Sub-Plan)

> **OCEAN WARNING — do not start without a dedicated sub-plan.** Phase 5 items require major schema migrations and separate billing infrastructure. Flag at planning review before any work begins.

### 5.1 Multi-tenant
- `organizationId` field on all collections (Lead, Project, Activity, Account, Pipeline, User, Webhook, AuditLog...).
- Subdomain routing (`org.crm.incoda.io`).
- All queries scoped by `organizationId` — migration script required for existing data.
- Stripe billing integration (subscription tiers).
- Own sub-plan required. Estimated effort: 3-4 sprints minimum.

---

## Technical Debt — Must Address

| Item | Priority | Effort | Fase |
|---|---|---|---|
| `execChangeField` field whitelist (security) | **Critical** | Low | 4.1 |
| Server-side pagination wired en frontend | **Critical** | Medium | 4.2 |
| `consultantName` → `consultantId` FK | **High** | Low | 4.1 |
| Error boundaries por lazy module | High | Low | 4.3 |
| Toast/feedback system errores CRUD | High | Low | 1.7 |
| Tests: commissions, aging, pending queue, CRUD | High | High | test plan |
| `dev:full` → `concurrently` (port leak Ctrl+C) | Medium | Trivial | 4.4 |
| Tailwind CDN (3.5MB) → PostCSS build con purge | Medium | Low | 4.2 |
| `mongoose { timestamps: true }` en todos los modelos | Medium | Trivial | 4.2 |
| WebSockets/SSE reemplazar polling 60s | Medium | Medium | 4.3 |
| CI/CD GitHub Actions (lint + test + build en PR) | Medium | Low | 4.4 |
| Swagger/OpenAPI documentation | Low | Low | 4.4 |
| Concurrency: last-write-wins → 409 Conflict | Low | Medium | 4.1 |

---

## NOT in Scope (This Plan)

- Stripe billing / subscription management — parte del sub-plan Phase 5
- DIAN electronic invoicing — específico de Colombia, esperar señal de tracción comercial
- Slack/Teams integration — la base de webhooks existe; formatear payloads post-PMF
- Client portal — requiere modelo de auth público; post-PMF

---

## Success Criteria

1. Contacts/Accounts module reaches 8+/10
2. Automation module reaches 7+/10 with `execChangeField` field whitelist security fix live
3. Server-side pagination wired on all list views — no collection-dumps on any endpoint
4. Test coverage: >35% on critical paths (commissions, time approval, auth, automationService)
5. Phase 1 features all ship in ≤2 weeks
6. Phase 4 security items (execChangeField, 409 Conflict, password reset) complete before first external user onboards
7. CI/CD pipeline running (lint + test + build) before Phase 4 hardening ships
8. Webhook retry persistence + MongoDB indexes live before 500+ leads in DB

---

## Decisions (formerly Open Questions)

1. ~~State management~~ — **RESOLVED: no migration.** App.tsx tiene 2 `useState`. Zustand rechazado.
2. **PDF → `@react-pdf/renderer`** — `ProposalPrint.tsx` ya existe; no añadir Chromium (~150 MB) como dependencia. Puppeteer descartado.
3. **Automation triggers → Express middleware (async)** — evaluar reglas de forma async sin bloquear el HTTP response. Worker separado es sobreingeniería a equipo de 5; revisar si triggers superan ~100/día.
4. **CSV import → multer in-memory, límite 10 MB** — correcto hasta ~50K filas. Cambiar a streaming si imports superan regularmente 10K filas.

---

# /autoplan Review

## Phase 1 — CEO Review

### CEO DUAL VOICES — CONSENSUS TABLE [subagent-only — Codex unavailable]
```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   NO      N/A    [subagent-only]
  2. Right problem to solve?           PARTLY  N/A    [subagent-only]
  3. Scope calibration correct?        NO      N/A    [subagent-only]
  4. Alternatives sufficiently explored? NO    N/A    [subagent-only]
  5. Competitive/market risks covered? NO      N/A    [subagent-only]
  6. 6-month trajectory sound?         RISKY   N/A    [subagent-only]
═══════════════════════════════════════════════════════════════
CLAUDE SUBAGENT (CEO — strategic independence):
- Premises: plan diagnoses 4/10 gaps that are already implemented → STALE
- Right problem: "build features" is wrong; "ship + test existing" is right
- Scope: tests + pagination should be gate, not afterthought
- Alternatives: open-source CRM extend never evaluated (dismissed as N/A given vertical depth)
- Competitive: no urgency timeline; HubSpot closing the gap on project features
- 6-month: 600 leads, no pagination, 0 tests → app abandoned → regret
- Highest-leverage action: git add 17 components, smoke-test, commit. Everything else follows.
```

### Section 1 — Problem Restatement
**Examined:** Original problem statement + codebase scan of 17 untracked components + server/index.js registration.
**Finding (HIGH):** Plan frames this as a "build" problem when 80% of Phase 2-3 features exist as uncommitted code. The real problem is: validate + ship existing code AND fill the 4-5 genuinely missing items.
**Auto-decision:** Revise problem statement (done above). New framing: commit audit → smoke test → fill gaps → tests. (P6 bias toward action, P3 pragmatic)

### Section 2 — Error & Rescue Registry
| Failure | Trigger | Rescue |
|---|---|---|
| Uncommitted component has broken import | git add + build | Fix import path, re-run `pnpm build` |
| AutomationService only does CRUD (no trigger execution) | User creates automation, nothing fires | Check `server/automationService.js` — add execution layer if missing |
| Google Calendar OAuth not configured | User tries calendar sync | Requires `GOOGLE_CLIENT_ID/SECRET` in `.env` — gate feature behind OAuth check |
| Collection load timeout (500+ records) | Any list view at scale | Pagination — must ship before user onboarding |
| Commission calculation wrong after refactor | Consultant gets wrong pay | Test file: `tests/commissions.test.ts` (must exist before ship) |
| Offline queue corrupts data | Network interruption + write | Already handled by firebaseService; preserve existing logic |
| Concurrency last-write-wins | Two users edit same lead | 409 Conflict check deferred to TODOS (low risk for 5-person team) |

### Section 3 — Scope Analysis (SELECTIVE EXPANSION)
**In scope (confirmed):**
- Commit + smoke-test 17 existing components
- Server-side pagination (Phase 2.5 — critical, promote to Phase 1)
- Win/Loss close modal (Phase 1.1 — genuinely missing)
- Sales quota widget (Phase 1.3 — genuinely missing)
- Form validation zod+react-hook-form (Phase 1.5 — genuinely missing)
- Drag & drop kanban (Phase 1.6 — genuinely missing)
- Test coverage: commissions, auth, time approval (0% → 30%)

**Borderline (deferred to TODOS.md):**
- automationService.js execution layer (may already exist — needs audit first)
- CSV import endpoint (Phase 2.4) — genuinely missing backend, but lower urgency
- AI Next Action endpoint (Phase 1.4) — check if `/api/aiScore/:id/suggestion` exists

**NOT in scope:**
- Multi-tenant / SaaS
- React Native
- DIAN invoicing
- Slack/Teams integration

### Section 4 — Alternatives Evaluated
| Alternative | Verdict | Rationale |
|---|---|---|
| Extend open-source CRM (Twenty, Formbricks) | Rejected | GAAP balance sheet + post-sale vertical too deep to migrate. Unique data model |
| Pipedrive API wrapper | Rejected | Loses data sovereignty; no offline queue; no custom financial models |
| Ship as-is without tests | Rejected | 0% tests + no pagination = time bomb at 500+ records. P2: boil lakes |
| Tests-first gate (no features until 30% coverage) | TASTE DECISION | Subagent recommends this. Trade-off: slower ship vs safer ship. See taste decisions |

### Section 5 — Competitive Risk
**Examined:** HubSpot free tier, Pipedrive, Monday.com vertical expansion trends.
**Finding (MEDIUM):** HubSpot added project-adjacent features in 2024-2025. The differentiation window on post-sale vertical (GAAP + consultant time) is real but not permanent — estimate 12-18 months before clones emerge. Plan has no urgency signal.
**Auto-decision:** Add competitive urgency note to success criteria. (P6 bias toward action)

### Section 6 — Temporal Interrogation
```
HOUR 1:   git add + pnpm build → identify broken imports in 17 components
HOUR 2-4: Fix broken imports, smoke-test each module in browser
HOUR 5-8: Add server-side pagination to leads + projects endpoints
DAY 2:    Add win/loss close modal, sales quota widget
WEEK 1:   Zod validation on critical forms, drag-drop kanban
WEEK 2:   Write tests for commissions + auth + time approval
WEEK 3+:  Polish, AI features, CSV import, advanced reporting
```

### Section 7 — Failure Modes Registry
| Risk | Severity | Probability | Mitigation |
|---|---|---|---|
| Uncommitted code is half-finished | HIGH | MEDIUM | 2-hour audit sprint before committing |
| Pagination ships late → user abandons at 500 records | CRITICAL | HIGH (if skipped) | Promote to Phase 1, ship with first commit |
| Tests never written → regression on commissions | HIGH | HIGH (without mandate) | 30% coverage as hard success criterion |
| Automation rules stored but never executed | HIGH | MEDIUM | Audit automationService.js execution path |
| Google Calendar OAuth blocked by missing env vars | MEDIUM | HIGH | Document required env vars in .env.example |
| Prop drilling causes performance issues at scale | MEDIUM | LOW | App.tsx already has React.memo on lazy components |

### Section 8 — Dream State Delta
**Where this plan (revised) leaves us vs 12-month ideal:**
- ✓ 17 features live and committed (vs. paper plan)
- ✓ Pagination — scalable to 10,000 records
- ✓ Tests — 30% coverage on critical paths
- △ AI features — working but basic (Gemini integration exists, needs prompt engineering)
- △ Mobile/PWA — not started (Q3)
- ✗ Multi-tenant — explicitly deferred (Q4+)
- ✗ Client portal — explicitly deferred (Q4+)

**Gap to 12-month ideal:** ~40% of the vision. Revised plan covers the production-readiness layer. The dream state (client portal, multi-tenant, AI-assisted sales) is a second phase requiring its own plan.

### Section 9 — NOT in Scope
Items auto-deferred to TODOS.md with rationale:
- **Multi-tenant**: Requires `organizationId` on all collections — major schema migration (P2: outside blast radius)
- **React Native**: PWA first; native app is post-PMF work
- **DIAN invoicing**: Colombia-specific; deferred until commercial product phase
- **Slack/Teams integration**: Webhook foundation exists; Slack formatting is Q2 work
- **Concurrency 409 Conflict**: Low risk for 5-person team; defer
- **Password reset self-service**: Admin workaround exists; defer

### Section 10 — What Already Exists (revised)
See "Existing Code Leverage Map" above. Summary: 17 frontend components + full backend routing already implemented. Real build list is 4-5 items.

### CEO Completion Summary
| Dimension | Score | Key Finding |
|---|---|---|
| Problem framing | 6/10 → 9/10 (revised) | Plan was "build from scratch"; reality is "ship existing" |
| Scope calibration | 5/10 → 8/10 (revised) | Phase 2-3 already done; gaps are specific and small |
| Competitive positioning | 7/10 | Vertical depth is real; window is ~12-18 months |
| Technical risk | 6/10 | 0% tests + no pagination = critical risk before scale |
| Strategic clarity | 7/10 | Clear after revision; tests-first vs ship-fast is open |
| Overall | 7/10 | Solid product, strong differentiators, needs test mandate |

**PHASE 1 COMPLETE.** Codex: N/A. Claude subagent: 6 issues. Consensus: [subagent-only]. Premise gate: PASSED.

---

## Phase 2 — Design Review

### DESIGN LITMUS SCORECARD [subagent-only — Codex unavailable]
```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Information hierarchy specified?  1/10    N/A    [subagent-only]
  2. Interaction states covered?       0/10    N/A    [subagent-only]
  3. User journey complete?            3/10    N/A    [subagent-only]
  4. Design specificity sufficient?    2/10    N/A    [subagent-only]
  5. Edge cases addressed?             2/10    N/A    [subagent-only]
  6. Accessibility specified?          0/10    N/A    [subagent-only]
  7. Mobile/responsive designed?       2/10    N/A    [subagent-only]
═══════════════════════════════════════════════════════════════
OVERALL: ~1.4/10 — plan has essentially no design specification.
Expected for an internal tool plan — but must be addressed before implementation.
```

### CLAUDE SUBAGENT (Design — independent review)
Key findings:
- **CRITICAL**: Zero screens define visual hierarchy (what user sees first/second/third)
- **CRITICAL**: No interaction states (loading/empty/error/success) for any feature
- **CRITICAL**: Accessibility entirely absent — no keyboard nav, ARIA, contrast, colorblind fallbacks. Phase 1.6 drag-and-drop requires explicit keyboard handler in @dnd-kit; Phase 3.7 stoplight uses color-only status
- **HIGH**: User journeys break at transitions (after win/loss save, after CSV import success, after OAuth redirect)
- **HIGH**: All UI specs are vague — "modal", "widget", "dashboard". Only concrete spec: Phase 3.7 stoplight colors
- **HIGH**: Edge cases unaddressed: bulk-select-all across unpaginated pages, quota divide-by-zero for 0-deal reps, partial bulk-action failures, 47-char names in kanban cards
- **HIGH**: Mobile Phase 3.3 lists actions with no breakpoint spec or 44×44px touch target requirement

### Design Gap Fixes (auto-decided, added to plan)

**Per-feature interaction state table (all Phase 1-2):**
Every new feature in the plan must specify:
| State | Spec |
|---|---|
| Loading | Skeleton or spinner? Duration threshold? |
| Empty | Primary CTA + warmth copy (not "No items found") |
| Error | Inline error + retry action |
| Success | Toast confirmation or inline feedback? |

**Named component patterns (replacing vague terms):**
- "modal prompt" (1.1) → `Dialog` with `Select` (reason) + `Textarea` (note) + `Button[variant=destructive]`
- "Dashboard widget" (1.3) → `Card` with `ProgressBar` + `Table[5-row]`
- "column mapping UI" (2.4) → `Sheet` (right drawer) with `Combobox` per column
- "simplified mobile views" (3.3) → `BottomSheet` with action buttons

**Accessibility additions:**
- Phase 1.6 drag-and-drop: `@dnd-kit` keyboard preset required (`KeyboardSensor` + `useSensor`)
- Phase 3.7 stoplight: add icon (CheckCircle/AlertCircle/XCircle) alongside color — never color-only status
- All new modals: `role="dialog"`, `aria-labelledby`, focus trap, `Escape` to close
- Form validation (1.5): `aria-describedby` linking error messages to inputs

**Journey-end specs required:**
- Phase 1.1: After close → card moves to won/lost column with animation; toast "Deal closed"
- Phase 2.4: After import → redirect to leads list with filter showing imported records; toast "N leads imported"
- Phase 3.2: OAuth success → redirect back to settings with calendar connected state; failure → inline error with retry

**Missing DESIGN.md:** Flag — no design system document exists. Auto-decision: defer full DESIGN.md to TODOS.md; add per-feature specs inline (P3 pragmatic — internal tool at early stage).

### Design Completion Summary
| Dimension | Initial | Gap Added to Plan |
|---|---|---|
| Information hierarchy | 1/10 | Requires per-screen hierarchy spec before implementation |
| Interaction states | 0/10 | 4-state table added as requirement |
| Journey completeness | 3/10 | 3 journey-end specs added |
| Design specificity | 2/10 | Named component patterns added |
| Edge cases | 2/10 | 6 specific edge cases documented |
| Accessibility | 0/10 | @dnd-kit keyboard, ARIA, colorblind fallbacks added |
| Mobile/responsive | 2/10 | Touch targets + BottomSheet pattern added |

**PHASE 2 COMPLETE.** Claude subagent: 7 issues (3 critical, 4 high). Consensus: [subagent-only]. Passing to Phase 3.

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 1 | CEO | Revise problem statement to "ship+test existing" | Mechanical | P6 (bias toward action) | Codebase scan proved 17 components exist | Keep "build from scratch" framing |
| 2 | CEO | Promote pagination to Phase 1 (was Phase 2.5) | Mechanical | P2 (boil lakes) | Critical blocker at 500+ records; low effort | Leave in Phase 2 |
| 3 | CEO | Reject open-source CRM migration | Mechanical | P4 (DRY — reuse unique code) | GAAP vertical too deep to migrate | Evaluate Twenty CRM |
| 4 | CEO | Tests-first vs ship-fast | **TASTE** | P3 vs P1 conflict | Subagent: tests as prerequisite gate. Counter: ship existing first then add tests | N/A — surfaced at final gate |
| 5 | CEO | Defer automationService execution audit to Phase 1.0 | Mechanical | P6 (action) | Must verify before committing automation features | Skip audit |
| 6 | CEO | Reject multi-tenant | Mechanical | P2 (outside blast radius) | Schema migration for organizationId is a separate product phase | Include in this plan |
| 7 | Design | Add 4-state interaction table as implementation requirement | Mechanical | P1 (completeness) | 0/10 on interaction states — missing before any build | Defer to implementation |
| 8 | Design | Add @dnd-kit keyboard sensor + ARIA requirements | Mechanical | P1 (completeness) | Accessibility spec missing; @dnd-kit requires explicit setup | Skip accessibility |
| 9 | Design | Defer DESIGN.md to TODOS.md | Mechanical | P3 (pragmatic) | Internal tool, per-feature specs sufficient at this stage | Create full design system now |
| 10 | Design | Named component patterns over vague terms | Mechanical | P5 (explicit over clever) | "modal" is not a spec; Dialog+Select+Textarea is | Keep vague |
| 11 | Eng | Remove Zustand migration from tech debt | Mechanical | P4 (DRY) | App.tsx has 2 useState (not 15+) — non-problem | Keep in plan |
| 12 | Eng | Pagination = frontend opt-in, not new backend | Mechanical | P4 (DRY) | createCrudRouter already implemented with ?page | Build new pagination |
| 13 | Eng | Global pagination fallback 500→50 | **TASTE** | P1 vs P3 | Breaking change vs safe migration. Surfaced at gate | Leave at 500 |
| 14 | Eng | Add execChangeField field whitelist (security) | Mechanical | P1 (completeness) | Unsanitized $set field is data corruption risk | Defer security fix |
| 15 | Eng | Add createCrudRouter role guard for DELETE | Mechanical | P1 (completeness) | Any auth user can delete any rule/webhook | Leave unguarded |
| 16 | Eng | DnD kanban: 4-6 days not 1-2 | Mechanical | P3 (pragmatic) | Keyboard, touch, cross-column, collision detection all needed | Keep 1-2d estimate |
| 17 | DX | Reprioritize Swagger/OpenAPI to Phase 2 | Mechanical | P1 (completeness) | Active external consumers exist; Low priority is wrong | Keep as Low |
| 18 | DX | Add pagination to /api/v1/ list endpoints | Mechanical | P2 (boil lakes) | external.js has no limit — full collection dump | Leave unbounded |
| 19 | DX | Add {error,code,hint} error shape | Mechanical | P5 (explicit) | Raw Mongoose errors are not developer-friendly | Keep raw errors |
| 20 | DX | Add docs/webhooks.md payload contracts | Mechanical | P1 (completeness) | Solid implementation, zero documentation | Defer docs |

---

## Phase 3 — Eng Review

### Architecture ASCII Diagram

```
                       CRM Incoda — Component Architecture
═══════════════════════════════════════════════════════════════════════

  Browser
  ┌─────────────────────────────────────────────────────────────────┐
  │  App.tsx (2 useState)                                           │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
  │  │Dashboard │ │CRMPipeline│ │AccountMgr│ │AutomationManager │  │
  │  │ (lazy)  │ │  (lazy)  │ │  (lazy)  │ │    (lazy)        │  │
  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │
  │       │             │             │                  │           │
  │       └─────────────┴─────────────┴──────────────────┘           │
  │                              │                                   │
  │                   firebaseService.ts                             │
  │              (offline queue + fetch wrapper)                    │
  └──────────────────────────┬──────────────────────────────────────┘
                             │ /api/*
  ┌──────────────────────────▼──────────────────────────────────────┐
  │  Express 4 (server/index.js)                                    │
  │  Auth middleware → sanitize → fieldFilter → rate-limit          │
  │                                                                  │
  │  createCrudRouter(Model) × 15 models                           │
  │  ┌────────────┐ ┌─────────────┐ ┌──────────────────────────┐   │
  │  │/api/leads  │ │/api/accounts│ │/api/automations (CRUD    │   │
  │  │(custom     │ │(generic     │ │ only — no hook to         │   │
  │  │ hooks)     │ │ CRUD)       │ │ evaluateRules ← ⚠️ CHECK) │   │
  │  └─────┬──────┘ └─────────────┘ └──────────────────────────┘   │
  │         │                                                        │
  │  automationService.js                                           │
  │  evaluateRules(trigger, context)                                │
  │  ├── execCreateTask → Lead.$push.tasks                          │
  │  ├── execSendEmail → emailService                               │
  │  ├── execSendWebhook → webhookService                           │
  │  └── execChangeField → Lead.$set[field] ← ⚠️ UNSANITIZED FIELD │
  └─────────────────────────┬───────────────────────────────────────┘
                             │
  ┌──────────────────────────▼──────────────────────────────────────┐
  │  MongoDB (127.0.0.1:27017/crm_incoda)                       │
  │  Collections: leads, accounts, automationrules, webhooks...     │
  └─────────────────────────────────────────────────────────────────┘

  KEY GAPS:
  ⚠️  leads.js → evaluateRules call: UNVERIFIED (automation may be inert)
  ⚠️  execChangeField: unsanitized field name → potential data corruption
  ⚠️  Frontend never passes ?page=1 → 500-doc fallback always active
  ⚠️  createCrudRouter DELETE: no ownership check (any auth user can delete)
```

### ENG DUAL VOICES — CONSENSUS TABLE [subagent-only — Codex unavailable]
```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               MOSTLY  N/A    [subagent-only]
  2. Test coverage sufficient?         NO      N/A    [subagent-only]
  3. Performance risks addressed?      NO      N/A    [subagent-only]
  4. Security threats covered?         NO      N/A    [subagent-only]
  5. Error paths handled?              PARTLY  N/A    [subagent-only]
  6. Deployment risk manageable?       YES     N/A    [subagent-only]
═══════════════════════════════════════════════════════════════
```

### Section 1 — Architecture (Findings)

**[CRITICAL] (confidence: 8/10) `server/routes/automations.js` — evaluateRules wiring unverified**
Route is `createCrudRouter(AutomationRule)` — stores rules only. `automationService.js:evaluateRules` is fully implemented but call-sites in `server/routes/leads.js` are unverified. If not called, every automation rule is inert despite UI appearing to work.
**Auto-fix:** Add explicit pre-ship checklist item: verify `leads.js` calls `evaluateRules` on stage change, assignment, and field update.

**[HIGH] (confidence: 9/10) `createCrudRouter` — Frontend never passes `?page=1`**
`crud.js:62-63` shows: when no `?page` param → returns up to 500 documents (backward-compat). All existing fetch calls in `firebaseService.ts` omit `?page`. Result: pagination is implemented server-side but never activated client-side. 500-doc fallback hits MongoDB full-scan on every list load.
**Auto-fix:** All `subscribeToCollection` calls in `firebaseService.ts` must append `?page=1&limit=50`. Reduce backward-compat fallback from 500→100.
**TASTE DECISION:** Global fallback reduction (500→50, forces all clients to paginate) vs opt-in per-collection. Surfaced at final gate.

**[HIGH] (confidence: 7/10) `server/automationService.js:execChangeField` — unsanitized field**
`$set: { [rule.actionConfig.field]: rule.actionConfig.value }` — field name comes from DB with no whitelist validation against Lead schema fields. Admin-created rule with `field: "__proto__"` or `field: "password"` could corrupt documents or elevate data.
**Auto-fix:** Add `const ALLOWED_FIELDS = new Set(Object.keys(Lead.schema.paths))` and guard: `if (!ALLOWED_FIELDS.has(rule.actionConfig.field)) return;`

**[MEDIUM] (confidence: 8/10) `createCrudRouter` DELETE — no ownership/role check**
Any authenticated user (role: sales) can DELETE any AutomationRule, Webhook, EmailTemplate via `DELETE /api/automations/:id`. No role check in generic router.
**Auto-fix:** Pass optional `deleteGuard: (req) => boolean` to `createCrudRouter` options; for sensitive models, require `req.user.role === 'admin'`.

**[MEDIUM] (confidence: 6/10) App.tsx useState count: 2 (not 15+)**
Code scan shows 2 useState, not 15+. Zustand migration item in plan is likely stale/wrong.
**Auto-fix:** Remove Zustand migration from technical debt table. Verify with `grep -c useState App.tsx`.

### Section 2 — Code Quality

**[HIGH] Plan's "prop drilling" diagnosis is stale.** App.tsx has 2 useState — not 15+. The technical debt item should be removed or re-verified. Auto-decision: remove from plan (P4 DRY — don't fix non-problems).

**[HIGH] Pagination fix is smaller than plan implies.** `createCrudRouter` already has pagination. The work is: update `firebaseService.ts` to pass `?page=1&limit=50` on all list calls + update frontend components to handle paginated responses `{ data: [], page, pages, total }`. Not a new backend feature — a frontend integration task.

**[MEDIUM] `execChangeField` security: one-line fix.** The field whitelist is a 3-line addition to `automationService.js`. Plan should call this out explicitly as a security fix, not just a "nice to have."

### Section 3 — Test Review (NEVER SKIP)

**Runtime:** Node.js. Framework: Vitest 2.1.9 (configured, `pnpm test` works). One existing test: `tests/business.test.ts`.

**Test diagram — highest-risk codepaths mapped to coverage:**

```
Codepath                                          Test exists?  Priority
─────────────────────────────────────────────── ─────────────  ────────
automationService.evaluateRules(trigger,ctx)     NO            P0
  └── stage_change trigger + execCreateTask       NO            P0
  └── inactivity trigger (cron path)              NO            P0
  └── execChangeField with invalid field          NO            P0 (security)

crud.js pagination
  └── ?page=1&limit=50 returns paginated obj      NO            P1
  └── ?page missing → 500 fallback                NO            P1
  └── parseInt(NaN) guard                         NO            P1

firebaseService offline queue
  └── enqueuePendingWrite on fetch failure        NO            P1
  └── flushPendingQueue on reconnect              NO            P1

server/routes/auth.js
  └── login success → session cookie              NO            P1
  └── login failure → 401                         NO            P1
  └── RBAC: sales cannot access admin routes      NO            P1

commissions (business.test.ts)
  └── commission calculation                      PARTIAL       P2
```

**Test plan artifact:**

```
tests/automationService.test.ts  [NEW — P0]
  describe('evaluateRules')
    it('fires execCreateTask on stage_change trigger')
    it('fires execSendEmail on closed_won trigger')
    it('skips disabled rules')
    it('rejects unsanitized field in execChangeField')
    it('handles concurrent trigger evaluation (no double-fire)')

tests/crud.pagination.test.ts  [NEW — P1]
  describe('createCrudRouter pagination')
    it('returns paginated response when ?page=1 passed')
    it('returns array (backward-compat) when no ?page param')
    it('limits fallback to 500 max')
    it('handles parseInt(NaN) gracefully → page 1')
    it('returns {data,page,pages,total} shape')

tests/offlineQueue.test.ts  [NEW — P1]
  describe('firebaseService offline queue')
    it('enqueues write when fetch fails')
    it('flushes queue on reconnect')
    it('does not duplicate writes on multiple retries')

tests/auth.test.ts  [NEW — P1]
  describe('auth routes')
    it('login success returns session cookie')
    it('login failure returns 401')
    it('sales role blocked from /api/users')
    it('consultant role blocked from /api/transactions')
```

**Coverage target: these 4 files → ~35% coverage on critical paths.**
`pnpm test` uses `vitest run` — no additional config needed.

### Section 4 — Performance

**[HIGH] 500-doc fallback on every list component.** Until frontend passes `?page=1`, every page load does a MongoDB full-scan returning 500 leads, 500 projects, etc. At 500 records each, that's ~2MB JSON per navigation. Fix: the frontend pagination integration is the single most impactful performance fix.

**[MEDIUM] No index on `Lead.stage` or `Lead.assignedToId`.** With 500+ leads, `Model.find(filter)` in `createCrudRouter` scans full collection when filtering by stage. Add compound index `{ stage: 1, createdAt: -1 }` to Lead schema.

### Failure Modes Registry (updated)

| Risk | Severity | Mitigations in Plan? |
|---|---|---|
| evaluateRules never called → automation inert | CRITICAL | ⚠️ Not in plan — add pre-ship audit |
| execChangeField unsanitized field → data corruption | HIGH | ⚠️ Not in plan — add security fix |
| Frontend 500-doc fallback → performance at scale | HIGH | Partially — pagination in plan but frontend integration not explicit |
| DnD kanban underestimated (1-2d → 4-6d) | HIGH | ⚠️ Plan underestimates by 3x |
| Tests never written → regression on commissions | HIGH | In plan as success criterion |
| createCrudRouter DELETE — any user deletes any rule | MEDIUM | ⚠️ Not in plan — add role guard |
| Offline queue corrupts on concurrent writes | MEDIUM | Existing code handles; preserve |

### Eng Completion Summary
| Dimension | Score | Key Finding |
|---|---|---|
| Architecture | 7/10 | Sound overall; automation wiring unverified |
| Test coverage | 1/10 → target 35% | 4 test files needed; vitest ready |
| Performance | 4/10 → 8/10 with fix | Frontend pagination integration is the fix |
| Security | 5/10 | execChangeField field whitelist needed; DELETE role guard needed |
| Error handling | 6/10 | Offline queue solid; pagination NaN guard minor |
| Deployment | 8/10 | ESM + Mongoose 8 + Vite 5 stack is current; no CI/CD yet |

**PHASE 3 COMPLETE.** Claude subagent: 8 issues. Code scan: confirmed 5. Consensus: [subagent-only].
Codex unavailable. Passing to Phase 3.5 (DX Review — 14 DX-scope matches detected).

---

### Plan Corrections (auto-applied)

1. **Remove "15+ useState → Zustand" from technical debt** — App.tsx has 2 useState (verified)
2. **Pagination work = frontend integration, not backend build** — `createCrudRouter` already supports it
3. **Add automationService wiring audit as Phase 1.0 step**
4. **Add `execChangeField` field whitelist as security fix**
5. **DnD kanban = 4-6 days, not 1-2**

---

## Phase 3.5 — DX Review

### DX DUAL VOICES — CONSENSUS TABLE [subagent-only — Codex unavailable]
```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Getting started < 5 min?          NO      N/A    [subagent-only]
  2. API/CLI naming guessable?         MOSTLY  N/A    [subagent-only]
  3. Error messages actionable?        NO      N/A    [subagent-only]
  4. Docs findable & complete?         NO      N/A    [subagent-only]
  5. Upgrade path safe?                NO      N/A    [subagent-only]
  6. Dev environment friction-free?    PARTLY  N/A    [subagent-only]
  7. Webhook DX documented?            NO      N/A    [subagent-only]
  8. Escape hatches available?         PARTLY  N/A    [subagent-only]
═══════════════════════════════════════════════════════════════
```

### Developer Journey Map
| Stage | Experience Today | Target |
|---|---|---|
| 1. Discover | Nothing public. Must be given CRM admin access. | `GET /api/v1/` discovery endpoint returns OpenAPI schema |
| 2. Auth | Guess `Authorization: Bearer crm_bm_...` from code comments | `docs/api-quickstart.md` with copy-paste curl example |
| 3. First call | Succeeds but returns 500 leads — no pagination visible | `?page=1&limit=50` in example; `X-Total-Count` header |
| 4. Error | Raw `{ error: "Cast to ObjectId failed..." }` | `{ error, code, hint }` shape on all errors |
| 5. Webhook | HMAC algorithm undocumented. Payload shape unknown. | `docs/webhooks.md` per-event payload contract |
| 6. Upgrade | Breaking changes with no warning | `Deprecation` header + `CHANGELOG-api.md` |
| 7. Debug | No request ID in responses | Add `x-request-id` header to all responses |
| 8. Scale | `/api/v1/leads` dumps entire collection | Pagination added to all `/api/v1/` list endpoints |
| 9. Retry | Webhook server restart during backoff = silent drop | Persistent retry queue (DB-backed, not setTimeout) |

**TTHW today:** ~3 days (requires admin access + code archaeology)
**TTHW target:** <15 minutes (docs + copy-paste example)

### DX Scorecard
| Dimension | Score | Key Gap |
|---|---|---|
| Getting started / TTHW | 1/10 | No onboarding path exists |
| API naming consistency | 7/10 | RESTful, mostly consistent |
| Error messages | 3/10 | Raw Mongoose errors, no `code`/`hint` |
| Documentation | 1/10 | Zero public docs, Swagger listed as "Low" |
| Upgrade path | 2/10 | No versioning strategy, no Deprecation header |
| Dev environment | 6/10 | CLAUDE.md has setup; .env.example exists |
| Webhook DX | 4/10 | Implementation solid, zero documentation |
| Escape hatches (scopes) | 5/10 | API key scopes exist, not documented |
| **Overall** | **3.6/10** | **Critical: docs + pagination + error shape** |

### DX Findings (auto-decided)

**[CRITICAL] `/api/v1/` list endpoints have NO pagination**
`server/routes/external.js` calls `Model.find().lean()` directly — bypasses `createCrudRouter` entirely. Active external consumer ("Claude COWORK" per code comment) gets full collection dump on every poll. Different bug from internal pagination: this is the external API surface.
**Auto-fix:** Add `?page=&limit=` to all `/api/v1/` list handlers using same backward-compat pattern as `createCrudRouter`. Ship before any external consumers scale.

**[CRITICAL] No onboarding docs — TTHW is days**
No `docs/` directory, no API quickstart. Developer must have admin access before seeing the API exists.
**Auto-fix (reprioritize):** Swagger/OpenAPI moved from "Low" → **Phase 2**. Minimum: static `openapi.yaml` + `docs/api-quickstart.md` with copy-paste Bearer auth example.

**[HIGH] Error responses are raw Mongoose exceptions**
`server/routes/external.js` — all error handlers return `{ error: err.message }`. Scope-check failures return `403 Forbidden` with no body.
**Auto-fix:** Add `{ error, code, hint }` response shape. `requireScope` middleware returns `{ error: "Missing scope: leads:read", hint: "Contact admin to update API key scopes." }`

**[HIGH] Webhook contract undocumented**
`server/webhookService.js` implementation is solid (HMAC-SHA256, exponential backoff, auto-disable, WebhookLog). Zero documentation on: event names, payload shape per event, signature header algorithm, auto-disable conditions.
**Auto-fix:** Add `docs/webhooks.md`: per-event payload contracts, `X-Incoda-Signature` verification example, retry policy, auto-disable threshold.

**[HIGH] Webhook retry is setTimeout-based (not persistent)**
Server restart during backoff window silently drops pending retries. No entry in `WebhookLog` for in-flight retries.
**Auto-fix:** Deferred to TODOS.md (persistent retry queue requires queue infrastructure). Near-term: save pending-retry state to `WebhookLog.status = "retrying"` before setTimeout so restarts can resume.

**[HIGH] No API versioning strategy**
`"version": "1.0"` returned as string. Field renames in Mongoose models silently break integrations. No `Deprecated` response header.
**Auto-fix:** Add `CHANGELOG-api.md`. Add `Deprecation: date=2027-01-01` header when deprecating fields. Document field-stripping behavior (`_id`, `__v` removed) in openapi.yaml.

### DX Implementation Checklist
- [ ] Move Swagger/OpenAPI to Phase 2 (not Low priority)
- [ ] Add `?page=&limit=` to all `/api/v1/` list endpoints
- [ ] Add `{ error, code, hint }` error shape to external routes
- [ ] Create `docs/api-quickstart.md` with copy-paste curl examples
- [ ] Create `docs/webhooks.md` with per-event payload contracts
- [ ] Add `Deprecation` header support to external routes
- [ ] Save webhook retry state to WebhookLog before setTimeout

**PHASE 3.5 COMPLETE.** DX overall: 3.6/10 → target 7/10. TTHW: ~3 days → <15 min.
Claude subagent: 6 issues (2 critical, 4 high). Consensus: [subagent-only].
Passing to Phase 4 (Final Approval Gate).

---

### Cross-Phase Themes

**Theme 1: "The plan describes what's needed; the codebase already built most of it."**
Flagged independently in CEO (phantom gaps), Eng (pagination already in createCrudRouter), and DX (webhook implementation solid but undocumented). High-confidence signal: the implementation is ahead of the plan. The real work is **documentation, integration, testing, and the last 20%** — not building from scratch.

**Theme 2: "Zero documentation at every layer."**
CEO flagged no urgency signal. Design flagged no DESIGN.md. Eng flagged 0% test coverage. DX flagged no API docs, no webhook docs, no quickstart. Consistent across all 4 phases. Root cause: internal tool built fast; documentation deferred repeatedly.

**Theme 3: "Pagination/performance is more urgent than any new feature."**
CEO flagged tests+pagination as prerequisite gate. Eng confirmed 500-doc fallback active on all internal lists. DX confirmed external API has no pagination at all. Three independent voices, same finding. This is the production readiness blocker.

**No cross-phase disagreements** — all three reviewers converged on the same diagnosis.

---

## GSTACK REVIEW REPORT

| Review | Via | Runs | Status | Key Findings |
|--------|-----|------|--------|--------------|
| CEO Review | /autoplan | 1 | issues_open | 6 issues: phantom gaps, stale premises, no urgency signal, tests-first TASTE |
| Eng Review | /autoplan | 1 | issues_open | 8 issues: automation wiring unverified, security gap in execChangeField, DnD underestimated |
| Design Review | /autoplan | 1 | issues_open | 7 issues: 0/10 interaction states, 0/10 accessibility, vague UI specs throughout |
| DX Review | /autoplan | 1 | issues_open | 6 issues: TTHW 3 days, /api/v1/ unbounded, zero docs, raw error messages |
| Dual Voices | /autoplan | 4 | subagent-only | Codex unavailable. Claude subagent ran all 4 phases. |

**VERDICT:** 4/4 phases complete. 20 auto-decided, 2 taste decisions, 0 user challenges.
Run `/ship` when ready to commit plan + create PR.
