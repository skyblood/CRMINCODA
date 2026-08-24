// GET /api/health — structured health check with per-dependency probes.
// Mongo is the only "critical" dependency (the app can't function without
// it); SMTP and Anthropic are "optional" — a fresh deployment that hasn't
// configured them yet shouldn't show as perpetually degraded, so an
// unconfigured optional dependency is reported informationally and excluded
// from the overall status computation.
import { Router } from 'express';
import mongoose from 'mongoose';
import { getTransporter } from '../emailService.js';

const router = Router();
const CACHE_MS = 30000;
let cache = null; // { result, expiresAt }

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ]);
}

export function checkMongo() {
  const start = Date.now();
  return { healthy: mongoose.connection.readyState === 1, latencyMs: Date.now() - start, tier: 'critical' };
}

// transporterGetter is injectable so tests can exercise the real timeout/error
// handling below against a fake transporter, without needing to mock the
// emailService module's ESM export (mock.method can't redefine a live ESM
// binding after the first restore — see tests/health.test.ts for detail).
export async function checkSmtp(transporterGetter = getTransporter, timeoutMs = 5000) {
  const start = Date.now();
  const transporter = transporterGetter();
  if (!transporter) return { configured: false, healthy: null, latencyMs: 0, tier: 'optional' };
  try {
    await withTimeout(transporter.verify(), timeoutMs);
    return { configured: true, healthy: true, latencyMs: Date.now() - start, tier: 'optional' };
  } catch (err) {
    return { configured: true, healthy: false, latencyMs: Date.now() - start, tier: 'optional', error: err.message };
  }
}

export function checkAnthropic() {
  const configured = !!process.env.ANTHROPIC_API_KEY;
  return { configured, healthy: configured ? true : null, latencyMs: 0, tier: 'optional' };
}

export async function runChecks({ smtpProbe = checkSmtp, mongoProbe = checkMongo, anthropicProbe = checkAnthropic } = {}) {
  const [mongo, smtp, anthropic] = await Promise.all([
    Promise.resolve(mongoProbe()),
    smtpProbe(),
    Promise.resolve(anthropicProbe()),
  ]);
  const checks = { mongo, smtp, anthropic };

  let status = 'ok';
  if (!mongo.healthy) {
    status = 'down';
  } else if (Object.values(checks).some(c => c.tier === 'optional' && c.configured && !c.healthy)) {
    status = 'degraded';
  }

  return { status, checks, timestamp: new Date().toISOString() };
}

export async function getHealthWithCache(overrides) {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }
  const result = await runChecks(overrides);
  cache = { result, expiresAt: Date.now() + CACHE_MS };
  return result;
}

// Exported for tests only — lets a test clear the in-memory cache between cases.
export function _resetHealthCache() {
  cache = null;
}

router.get('/', async (_req, res) => {
  try {
    res.json(await getHealthWithCache());
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

export default router;
