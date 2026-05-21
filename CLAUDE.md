# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |

---

# Project: CRM Incoda

## Commands

```bash
pnpm dev          # Vite frontend only (port 5173)
pnpm server       # Express backend only (port 3001)
pnpm dev:full     # Both concurrently — use this for full-stack development
pnpm build        # tsc + vite build → dist/
pnpm start        # build + serve (production)
```

**Setup**: copy `.env.example` → `.env` and fill in MongoDB URI and Gmail SMTP credentials.

## Architecture

Flat file layout — no `src/` subdirectory. Key files live at the repo root:

```
App.tsx                  # Root component: state, routing, sidebar nav
components/              # One file per module (lazy-loaded via React.lazy)
services/
  firebaseService.ts     # Data layer (despite the name, this talks to MongoDB)
  geminiService.ts       # AI integration
server/
  index.js               # Express entry point, registers all routes
  routes/crud.js         # createCrudRouter(Model) — generic CRUD factory
  emailService.js        # nodemailer + Gmail SMTP
  models/                # Mongoose schemas
index.html               # Brand CSS overrides live here in a <style> block
```

### Frontend (React 18 + TypeScript + Vite 5)

- **Routing**: `HashRouter` from react-router-dom v6; all routes declared in `App.tsx`.
- **State**: Lifted entirely into `App.tsx` via `useState`; passed down as props — no Redux/Zustand.
- **Styling**: Tailwind CSS loaded via CDN (no PostCSS/build step). Brand color overrides are injected as `!important` rules inside a `<style>` tag in `index.html` — not in any `.css` file.
- **Charts**: Recharts. **Icons**: Lucide React.
- **Code splitting**: every component in `components/` is wrapped in `React.lazy()` + `Suspense`.

### Data Layer (`services/firebaseService.ts`)

Dual-mode service — the name is a historical artifact; it now calls MongoDB:

- **Online**: routes all reads/writes through `fetch('/api/...')` → Express → MongoDB.
- **Offline**: queues writes in `localStorage` under key `CRM_PENDING_WRITES_V1`; re-checks backend every 15 s and flushes the queue on reconnect.
- Components call `addDocument`, `updateDocument`, `deleteDocument`, `subscribeToCollection` — they never import `fetch` directly.

### Backend (Express 4 + Mongoose 8, ESM)

- Runs on port 3001; Vite proxies `/api/*` to it during development.
- `server/routes/crud.js` exports `createCrudRouter(Model)` — pass a Mongoose model, get full REST CRUD mounted automatically.
- MongoDB connects to `127.0.0.1:27017 / crm_incoda`; falls back to `mongodb-memory-server` if the real DB is unreachable.
- Email notifications fire server-side when a lead transitions to **Closed Won** (fire-and-forget, never blocks the API response).

### Auth & RBAC

- Session cookie authentication; passwords hashed with bcrypt server-side.
- Three roles: **admin**, **sales**, **consultant**.
- Module-level permission flags stored per user; admin bypasses all restrictions.
- `ConsultantPortal.tsx` is the restricted view for consultant-role users.

## Key Patterns

- **Adding a new module**: create `components/YourModule.tsx`, add a lazy import + `<Route>` in `App.tsx`, add sidebar link with a Lucide icon, add a Mongoose model + `createCrudRouter` call in `server/index.js`.
- **Brand palette**: edit the `<style>` block in `index.html` — Tailwind utility overrides use `!important`. Do not create separate CSS files.
- **Offline safety**: any write that might fail should go through `firebaseService` functions so the offline queue handles it automatically.
