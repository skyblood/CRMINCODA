// server/jobs/mercurySyncScheduler.js
import cron from 'node-cron';
import { listAccounts, listAccountTransactions, upsertMercuryTransactions } from '../services/mercuryApiClient.js';
import MercuryTransaction from '../models/MercuryTransaction.js';

// listAccountTransactions has a MAX_PAGES safety cap (2000 tx) that THROWS
// rather than silently truncating when a date range holds more than that —
// a deliberate earlier hardening so a truncated reconciliation is never
// silently wrong. That means an unbounded (no start/end) call on any busy
// account throws every single night, and the per-account try/catch below
// swallows it into a log line — caching zero rows forever with no visible
// signal. So the nightly job must always pass a bounded window. 60 days is
// wider than ReconciliationTab's own 30-day reconciliation default (this job
// exists to keep the cache broadly fresh, not just cover what a user is
// actively reconciling) while still comfortably staying under the 2000-tx
// cap for realistic transaction volumes.
function defaultSyncWindow() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 60);
    const fmt = (d) => d.toISOString().slice(0, 10);
    return { start: fmt(start), end: fmt(end) };
}

export async function runNightlyMercurySyncJob({
    mercuryListAccounts = listAccounts,
    mercuryListTransactions = listAccountTransactions,
} = {}) {
    if (!process.env.MERCURY_API_TOKEN) return; // inert without a token, same convention as lead enrichment's ANTHROPIC_API_KEY gate

    console.log(`[MercurySync] Running at ${new Date().toISOString()}`);

    let accounts;
    try {
        accounts = await mercuryListAccounts();
    } catch (err) {
        console.error('[MercurySync] Failed to list accounts:', err.message);
        return;
    }

    let synced = 0;
    for (const account of accounts) {
        try {
            const transactions = await mercuryListTransactions(account.id, defaultSyncWindow());
            await upsertMercuryTransactions(account.id, transactions, MercuryTransaction);
            synced += transactions.length;
        } catch (err) {
            console.error(`[MercurySync] Failed to sync account ${account.id}:`, err.message);
        }
    }

    console.log(`[MercurySync] Done. Cached ${synced} transaction(s) across ${accounts.length} account(s).`);
}

export function startMercurySyncScheduler() {
    cron.schedule('0 4 * * *', () => runNightlyMercurySyncJob(), { timezone: 'America/Bogota' });
    console.log('[MercurySync] Scheduled daily at 04:00 America/Bogota');
}
