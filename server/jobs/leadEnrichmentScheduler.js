// server/jobs/leadEnrichmentScheduler.js
import cron from 'node-cron';
import Lead from '../models/Lead.js';
import { enrichLead } from '../services/leadEnrichmentService.js';

const BATCH_SIZE = 50;
const DELAY_MS = 500;

export async function runNightlyEnrichmentJob() {
  console.log(`[LeadEnrichment] Running at ${new Date().toISOString()}`);

  let leads;
  try {
    leads = await Lead.find({
      deleted: { $ne: true },
      email: { $exists: true, $ne: '' },
      'enrichment.status': { $exists: false },
    }).limit(BATCH_SIZE);
  } catch (err) {
    console.error('[LeadEnrichment] Failed to query leads:', err.message);
    return;
  }

  let processed = 0;
  for (const lead of leads) {
    try {
      const result = await enrichLead(lead);
      lead.enrichment = result;
      await lead.save();
      processed++;
    } catch (err) {
      console.error(`[LeadEnrichment] Failed to process lead ${lead.id}:`, err.message);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  console.log(`[LeadEnrichment] Done. Processed: ${processed}`);
}

export function startLeadEnrichmentScheduler() {
  cron.schedule('0 3 * * *', runNightlyEnrichmentJob, { timezone: 'America/Bogota' });
  console.log('[LeadEnrichment] Scheduled daily at 03:00 America/Bogota');
}
