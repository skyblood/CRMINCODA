import cron from 'node-cron';
import Invoice from '../models/Invoice.js';
import NotificationLog from '../models/NotificationLog.js';
import Settings from '../models/Settings.js';
import Lead from '../models/Lead.js';
import { notifyAdmins } from '../notificationService.js';
import { recalculateInvoiceStatus } from '../services/invoiceStatusService.js';

/**
 * Daily invoice scheduler.
 * - Marks overdue invoices
 * - Sends collection reminders at -5, 0, +7, +15, +30 days
 * - Sends internal alerts for overdue + threshold breaches
 * - Uses findOneAndUpdate upsert for idempotency (CEO finding #9)
 */

const REMINDER_SCHEDULE = [
  { dayOffset: -5, type: 'reminder_before_due', label: '5 días antes del vencimiento' },
  { dayOffset: 0,  type: 'reminder_due_today',  label: 'Vence hoy' },
  { dayOffset: 7,  type: 'escalation_7d',       label: '7 días vencida' },
  { dayOffset: 15, type: 'escalation_15d',       label: '15 días vencida' },
  { dayOffset: 30, type: 'escalation_30d',       label: '30 días vencida' },
];

async function runDailyInvoiceJob() {
  console.log(`[InvoiceScheduler] Running at ${new Date().toISOString()}`);

  try {
    const settings = await Settings.findOneAndUpdate(
      { id: 'global' },
      { $set: { lastSchedulerRun: new Date() } },
      { upsert: true, new: true }
    );

    if (!settings.schedulerEnabled) {
      console.log('[InvoiceScheduler] Disabled in settings. Skipping.');
      return;
    }

    const threshold = settings.collectionAlertThresholdUSD || 5000;

    // 1. Mark overdue invoices
    const now = new Date();
    const overdueInvoices = await Invoice.find({
      status: { $in: ['issued', 'partially_paid'] },
      dueDate: { $lt: now },
      deleted: { $ne: true },
    });

    for (const inv of overdueInvoices) {
      await recalculateInvoiceStatus(inv._id.toString());
    }

    // 2. Process reminders for open invoices
    const openInvoices = await Invoice.find({
      status: { $in: ['issued', 'partially_paid', 'overdue'] },
      deleted: { $ne: true },
      suppressReminders: { $ne: true },
    }).lean();

    let remindersSent = 0;
    let remindersSkipped = 0;

    for (const inv of openInvoices) {
      if (!inv.dueDate) continue;

      // Check client-level kill switch
      if (inv.clientId) {
        const lead = await Lead.findOne({ id: inv.clientId }).lean();
        if (lead?.suppressCollectionReminders) {
          if (!lead.suppressCollectionUntil || new Date(lead.suppressCollectionUntil) > now) {
            continue;
          }
        }
      }

      const dueDate = new Date(inv.dueDate);
      const daysDiff = Math.floor((now - dueDate) / 86400000);

      for (const rule of REMINDER_SCHEDULE) {
        // Check if this reminder should fire today
        if (daysDiff !== rule.dayOffset) continue;

        // Idempotent check via findOneAndUpdate upsert
        const result = await NotificationLog.findOneAndUpdate(
          {
            invoiceId: inv._id.toString(),
            type: rule.type,
          },
          {
            $setOnInsert: {
              invoiceId: inv._id.toString(),
              type: rule.type,
              recipientEmail: inv.clientEmail || '',
              sentAt: now,
              success: true,
              invoiceNumber: inv.invoiceNumber,
              clientName: inv.clientName,
            },
          },
          { upsert: true, new: false }
        );

        // If result is null, the document was just inserted (first time)
        if (!result) {
          remindersSent++;
          console.log(`  [Reminder] ${inv.invoiceNumber} — ${rule.label} → ${inv.clientEmail || 'no email'}`);

          // Send email (fire-and-forget)
          if (inv.clientEmail) {
            try {
              const { sendEmail } = await import('../emailService.js');
              await sendEmail({
                to: inv.clientEmail,
                subject: `[Incoda] ${rule.label} — Factura ${inv.invoiceNumber}`,
                body: `Estimado/a ${inv.clientName},\n\n` +
                  `Le recordamos que la factura ${inv.invoiceNumber} por ${inv.currency} ${inv.balance?.toLocaleString()} ` +
                  `${rule.dayOffset <= 0 ? 'ha vencido' : `vence el ${dueDate.toISOString().split('T')[0]}`}.\n\n` +
                  `Referencia: ${inv.invoiceNumber}\nMonto pendiente: ${inv.currency} ${inv.balance?.toLocaleString()}\n\n` +
                  `Saludos,\nIncoda`,
              });
            } catch (emailErr) {
              await NotificationLog.findOneAndUpdate(
                { invoiceId: inv._id.toString(), type: rule.type },
                { $set: { success: false, error: emailErr.message } }
              );
            }
          }

          // Update invoice reminder tracking
          await Invoice.findByIdAndUpdate(inv._id, {
            $set: { lastReminderSentAt: now },
            $inc: { reminderCount: 1 },
          });
        } else {
          remindersSkipped++;
        }
      }

      // 3. Internal alert: overdue + above threshold
      if (daysDiff > 0 && (inv.balanceUSD || 0) >= threshold) {
        const alertResult = await NotificationLog.findOneAndUpdate(
          {
            invoiceId: inv._id.toString(),
            type: 'internal_threshold_alert',
          },
          {
            $setOnInsert: {
              invoiceId: inv._id.toString(),
              type: 'internal_threshold_alert',
              sentAt: now,
              success: true,
              invoiceNumber: inv.invoiceNumber,
              clientName: inv.clientName,
            },
          },
          { upsert: true, new: false }
        );

        if (!alertResult) {
          notifyAdmins({
            type: 'collection_threshold',
            title: `⚠ Deuda alta: ${inv.clientName}`,
            message: `Factura ${inv.invoiceNumber} — USD ${inv.balanceUSD?.toLocaleString()} vencida (${daysDiff} días)`,
            severity: 'error',
            relatedModel: 'invoice',
            relatedId: inv._id.toString(),
            route: '/invoices',
          }).catch(() => {});
        }
      }
    }

    console.log(`[InvoiceScheduler] Done. Reminders sent: ${remindersSent}, skipped (idempotent): ${remindersSkipped}`);
  } catch (err) {
    console.error('[InvoiceScheduler] Error:', err.message);
  }
}

/**
 * Start the scheduler.
 * Runs daily at 08:00 AM Colombia time.
 * On startup, checks if last run was >24h ago and runs immediately if so.
 */
export function startInvoiceScheduler() {
  // Daily at 8 AM Colombia (UTC-5)
  cron.schedule('0 8 * * *', runDailyInvoiceJob, {
    timezone: 'America/Bogota',
  });
  console.log('[InvoiceScheduler] Scheduled daily at 08:00 America/Bogota');

  // Startup catch-up
  (async () => {
    try {
      const settings = await Settings.findOne({ id: 'global' }).lean();
      const lastRun = settings?.lastSchedulerRun;
      const hoursSinceRun = lastRun ? (Date.now() - new Date(lastRun).getTime()) / 3600000 : Infinity;

      if (hoursSinceRun > 24) {
        console.log(`[InvoiceScheduler] Last run was ${Math.round(hoursSinceRun)}h ago. Running catch-up...`);
        await runDailyInvoiceJob();
      }
    } catch (err) {
      console.error('[InvoiceScheduler] Catch-up check failed:', err.message);
    }
  })();
}

// Export for health endpoint
export async function getSchedulerHealth() {
  const settings = await Settings.findOne({ id: 'global' }).lean();
  const lastRun = settings?.lastSchedulerRun;
  const hoursSinceRun = lastRun ? (Date.now() - new Date(lastRun).getTime()) / 3600000 : null;

  return {
    lastRun,
    hoursSinceRun: hoursSinceRun ? Math.round(hoursSinceRun * 10) / 10 : null,
    healthy: hoursSinceRun !== null && hoursSinceRun < 25,
    enabled: settings?.schedulerEnabled !== false,
  };
}
