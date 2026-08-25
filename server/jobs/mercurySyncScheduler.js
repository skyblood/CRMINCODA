// server/jobs/mercurySyncScheduler.js
import cron from 'node-cron';
import { listAccounts, listAccountTransactions, mapMercuryTransactionToUpsert } from '../services/mercuryApiClient.js';
import MercuryTransaction from '../models/MercuryTransaction.js';

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
            const transactions = await mercuryListTransactions(account.id);
            await Promise.all(transactions.map(t => MercuryTransaction.updateOne(
                { mercuryAccountId: account.id, mercuryTransactionId: t.id },
                { $set: mapMercuryTransactionToUpsert(account.id, t) },
                { upsert: true }
            )));
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
