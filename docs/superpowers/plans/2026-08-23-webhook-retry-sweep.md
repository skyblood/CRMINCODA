# Webhook Retry Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop webhook retries from stalling indefinitely when the server doesn't restart, by sweeping due retries every 2 minutes instead of only once at server startup.

**Architecture:** `server/webhookService.js` already persists retry state to `WebhookLog` (`status: 'retrying'`, `nextRetryAt`, `retryPayload`) and has `resumePendingRetries()` to replay due ones — but it's only called once, at boot (`server/index.js:420`). Add a `node-cron`-scheduled sweep, mirroring the existing `runDailyInvoiceJob`/`startInvoiceScheduler` split in `server/jobs/invoiceScheduler.js`.

**Tech Stack:** Node.js/Express, Mongoose, `node-cron` (already a dependency), `node:test` + `mongodb-memory-server` for testing.

**Spec:** N/A — bounded fix. Design agreed in conversation; captured in full in this plan's Architecture section and Task 1 below. No separate spec file per `superpowers:brainstorming`'s bounded path.

## Global Constraints

- No schema changes — reuse `WebhookLog.status`/`nextRetryAt`/`retryPayload` exactly as they exist today.
- Do not remove the existing startup call to `resumePendingRetries()` in `server/index.js:420` — it stays, for immediate recovery on boot; the sweep is additive.
- Follow the existing scheduler convention: a plain async function holding the logic, exported separately from the `cron.schedule(...)` wiring, so the logic is testable without mocking `node-cron`.

---

### Task 1: Periodic webhook retry sweep

**Files:**
- Modify: `server/webhookService.js` (add `runWebhookRetrySweep`, `startWebhookRetrySweep`; add `import cron from 'node-cron';` at the top)
- Modify: `server/index.js:420` area (call `startWebhookRetrySweep()` at boot, alongside the existing `resumePendingRetries()` call)
- Test: `tests/webhookRetrySweep.test.ts`

**Interfaces:**
- Consumes: `resumePendingRetries()` (already exported from `server/webhookService.js`, unchanged).
- Produces: `runWebhookRetrySweep(): Promise<void>` — awaits `resumePendingRetries()`, swallows and logs any rejection. `startWebhookRetrySweep(): void` — registers `runWebhookRetrySweep` on a `*/2 * * * *` cron schedule (`America/Bogota` timezone, matching the codebase's existing scheduler convention).

- [ ] **Step 1: Write the failing test**

```ts
// tests/webhookRetrySweep.test.ts
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Webhook from '../server/models/Webhook.js';
import WebhookLog from '../server/models/WebhookLog.js';
import { runWebhookRetrySweep } from '../server/webhookService.js';

let mongoServer;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Webhook.deleteMany({});
  await WebhookLog.deleteMany({});
});

describe('runWebhookRetrySweep', () => {
  it('resumes a retry whose nextRetryAt has already passed', async () => {
    mock.method(globalThis, 'fetch', async () => new Response('ok', { status: 200 }));

    const webhook = await Webhook.create({
      name: 'Test hook',
      url: 'https://example.com/hook',
      events: ['lead.won'],
      isActive: true,
    });
    await WebhookLog.create({
      webhookId: webhook._id,
      webhookName: webhook.name,
      event: 'lead.won',
      url: webhook.url,
      requestBody: '{}',
      status: 'retrying',
      attempt: 1,
      nextRetryAt: new Date(Date.now() - 1000),
      retryPayload: { eventType: 'lead.won', data: { id: 'lead_1' }, triggeredBy: 'system', attempt: 2 },
    });

    await runWebhookRetrySweep();
    // resumePendingRetries deletes the pending log synchronously, then fires
    // the actual retry attempt asynchronously — give it a tick to land.
    await new Promise((r) => setTimeout(r, 50));

    const stillRetrying = await WebhookLog.find({ status: 'retrying' });
    assert.equal(stillRetrying.length, 0);
    const succeeded = await WebhookLog.findOne({ status: 'success' });
    assert.ok(succeeded, 'expected a success log after the resumed retry completed');

    mock.restoreAll();
  });

  it('does nothing when there are no due retries', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch should not be called when nothing is due');
    });

    await runWebhookRetrySweep();

    mock.restoreAll();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx/esm --test tests/webhookRetrySweep.test.ts`
Expected: FAIL — `runWebhookRetrySweep` is not exported from `server/webhookService.js`.

- [ ] **Step 3: Implement `runWebhookRetrySweep` and `startWebhookRetrySweep`**

Add to the top of `server/webhookService.js` (alongside the existing `import crypto from 'crypto';`):

```js
import cron from 'node-cron';
```

Add at the end of `server/webhookService.js`, after `dispatchWebhooks`:

```js
export async function runWebhookRetrySweep() {
  try {
    await resumePendingRetries();
  } catch (e) {
    console.error('[WebhookRetrySweep]', e.message);
  }
}

export function startWebhookRetrySweep() {
  cron.schedule('*/2 * * * *', runWebhookRetrySweep, { timezone: 'America/Bogota' });
  console.log('[WebhookRetrySweep] Scheduled every 2 minutes');
}
```

In `server/index.js`, near line 420 where `resumePendingRetries` is imported and called:

```js
import { resumePendingRetries, startWebhookRetrySweep } from './webhookService.js';
```

and, right after the existing `resumePendingRetries().catch(...)` line inside `start()`:

```js
    resumePendingRetries().catch(e => console.error('[startup] webhook resume failed:', e.message));
    startWebhookRetrySweep();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx/esm --test tests/webhookRetrySweep.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Add the new test file to the test runner glob if needed, then run the full suite**

`tests/webhookRetrySweep.test.ts` already matches the existing `tests/*.test.ts` glob in `package.json`'s `test` script — no config change needed. Run: `pnpm test` — expect all tests (existing + new) to pass.

- [ ] **Step 6: Commit**

```bash
git add server/webhookService.js server/index.js tests/webhookRetrySweep.test.ts
git commit -m "fix: sweep due webhook retries every 2 minutes instead of only at startup"
```
