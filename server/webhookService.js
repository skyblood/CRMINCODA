import crypto from 'crypto';
import Webhook from './models/Webhook.js';
import WebhookLog from './models/WebhookLog.js';

async function sendWebhook(webhook, eventType, data, triggeredBy, attempt = 1) {
  const payload = JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    data,
    metadata: { crmVersion: '1.0.0', triggeredBy: triggeredBy || 'system' }
  });

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'BlackMoon-CRM/1.0',
    ...Object.fromEntries(webhook.headers || [])
  };

  if (webhook.secret) {
    const hmac = crypto.createHmac('sha256', webhook.secret).update(payload).digest('hex');
    headers['X-Blackmoon-Signature'] = `sha256=${hmac}`;
  }

  const start = Date.now();
  let responseStatus = 0;
  let responseBody = '';
  let success = false;
  let errorMsg = '';

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(10000)
    });
    responseStatus = res.status;
    responseBody = (await res.text()).slice(0, 1000);
    success = res.ok;

    webhook.lastTriggeredAt = new Date();
    webhook.lastStatus = responseStatus;
    webhook.failCount = res.ok ? 0 : (webhook.failCount + 1);
    await webhook.save();

    if (!res.ok && attempt < webhook.retryPolicy.maxRetries) {
      const delay = webhook.retryPolicy.retryDelayMs * Math.pow(2, attempt - 1);
      const nextRetryAt = new Date(Date.now() + delay);
      await WebhookLog.create({
        webhookId: webhook._id, webhookName: webhook.name, event: eventType,
        url: webhook.url, requestBody: payload.slice(0, 5000),
        responseStatus, attempt, status: 'retrying', nextRetryAt,
        retryPayload: { eventType, data, triggeredBy, attempt: attempt + 1 },
        duration: Date.now() - start,
      });
      setTimeout(() => sendWebhook(webhook, eventType, data, triggeredBy, attempt + 1), delay);
    }
    if (webhook.failCount >= webhook.autoDisableAfter) {
      webhook.isActive = false;
      webhook.disabledAt = new Date();
      webhook.disabledReason = `Auto-disabled after ${webhook.failCount} consecutive failures`;
      await webhook.save();
    }
  } catch (err) {
    errorMsg = err.message;
    webhook.failCount = (webhook.failCount || 0) + 1;
    webhook.lastTriggeredAt = new Date();
    webhook.lastStatus = 0;
    await webhook.save();
    // Auto-disable check also applies to network exceptions (timeout, DNS failure)
    if (webhook.failCount >= webhook.autoDisableAfter) {
      webhook.isActive = false;
      webhook.disabledAt = new Date();
      webhook.disabledReason = `Auto-disabled after ${webhook.failCount} consecutive failures`;
      await webhook.save();
    }
    if (attempt < webhook.retryPolicy.maxRetries) {
      const delay = webhook.retryPolicy.retryDelayMs * Math.pow(2, attempt - 1);
      const nextRetryAt = new Date(Date.now() + delay);
      await WebhookLog.create({
        webhookId: webhook._id, webhookName: webhook.name, event: eventType,
        url: webhook.url, requestBody: payload.slice(0, 5000),
        attempt, status: 'retrying', nextRetryAt, error: errorMsg,
        retryPayload: { eventType, data, triggeredBy, attempt: attempt + 1 },
        duration: Date.now() - start,
      });
      setTimeout(() => sendWebhook(webhook, eventType, data, triggeredBy, attempt + 1), delay);
      return;
    }
  }

  await WebhookLog.create({
    webhookId: webhook._id, webhookName: webhook.name, event: eventType,
    url: webhook.url, requestBody: payload.slice(0, 5000),
    responseStatus, responseBody, success, attempt,
    status: success ? 'success' : 'failed',
    duration: Date.now() - start,
    error: errorMsg || undefined,
  });
}

export async function resumePendingRetries() {
  try {
    const pending = await WebhookLog.find({ status: 'retrying', nextRetryAt: { $lte: new Date() } }).limit(100);
    for (const log of pending) {
      const { eventType, data, triggeredBy, attempt } = log.retryPayload || {};
      const webhook = await (await import('./models/Webhook.js')).default.findById(log.webhookId);
      if (!webhook?.isActive || !eventType) { await WebhookLog.deleteOne({ _id: log._id }); continue; }
      await WebhookLog.deleteOne({ _id: log._id });
      sendWebhook(webhook, eventType, data, triggeredBy, attempt || 2).catch(e => console.error('[WebhookResume]', e.message));
    }
    if (pending.length) console.log(`[WebhookResume] Resumed ${pending.length} pending retries`);
  } catch (e) {
    console.error('[WebhookResume]', e.message);
  }
}

export async function dispatchWebhooks(eventType, data, triggeredBy) {
  try {
    const webhooks = await Webhook.find({ isActive: true, events: eventType });
    for (const wh of webhooks) {
      sendWebhook(wh, eventType, data, triggeredBy).catch(e => console.error('[Webhook]', e.message));
    }
  } catch (e) {
    console.error('[WebhookDispatch]', e.message);
  }
}
