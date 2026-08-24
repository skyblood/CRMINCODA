// server/jobs/leadEnrichmentScheduler.js
import cron from 'node-cron';
import Lead from '../models/Lead.js';
import { enrichLead } from '../services/leadEnrichmentService.js';

const BATCH_SIZE = 50;
const DELAY_MS = 500;

export async function runNightlyEnrichmentJob() {
  console.log(`[LeadEnrichment] Running at ${new Date().toISOString()}`);
  try {
    const leads = await Lead.find({
      deleted: { $ne: true },
      email: { $exists: true, $ne: '' },
      'enrichment.status': { $exists: false },
    }).limit(BATCH_SIZE);

    let processed = 0;
    for (const lead of leads) {
      const result = await enrichLead(lead);
      lead.enrichment = result;
      await lead.save();
      processed++;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    console.log(`[LeadEnrichment] Done. Processed: ${processed}`);
  } catch (err) {
    console.error('[LeadEnrichment] Error:', err.message);
  }
}

export function startLeadEnrichmentScheduler() {
  cron.schedule('0 3 * * *', runNightlyEnrichmentJob, { timezone: 'America/Bogota' });
  console.log('[LeadEnrichment] Scheduled daily at 03:00 America/Bogota');
}
