import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import { dispatchWebhooks } from '../webhookService.js';
import { notifyAdmins, createNotification } from '../notificationService.js';

/**
 * Recalculates an invoice's payment state from the Payment collection.
 * Uses aggregation for correctness, then atomic update.
 * Called after every Payment create/update/delete.
 */
export async function recalculateInvoiceStatus(invoiceId) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) return null;

  // Administrative states are not overridden
  if (invoice.status === 'void' || invoice.status === 'draft') {
    return invoice;
  }

  // Aggregate payments applied to this invoice
  const [agg] = await Payment.aggregate([
    { $unwind: '$appliedTo' },
    { $match: { 'appliedTo.invoiceId': invoiceId } },
    {
      $group: {
        _id: null,
        paidAmount: { $sum: '$appliedTo.amountApplied' },
        paidAmountUSD: { $sum: '$appliedTo.amountAppliedUSD' },
      },
    },
  ]);

  const paidAmount = agg?.paidAmount || 0;
  const paidAmountUSD = agg?.paidAmountUSD || 0;
  const balance = invoice.total - paidAmount;
  const balanceUSD = invoice.totalUSD - paidAmountUSD;

  // Derive status
  let newStatus;
  if (paidAmount >= invoice.total) {
    newStatus = 'paid';
  } else if (paidAmount > 0 && paidAmount < invoice.total) {
    newStatus = 'partially_paid';
  } else if (invoice.dueDate && new Date(invoice.dueDate) < new Date() && paidAmount < invoice.total) {
    newStatus = 'overdue';
  } else {
    newStatus = 'issued';
  }

  const previousStatus = invoice.status;
  const statusChanged = previousStatus !== newStatus;

  // Atomic update
  const updated = await Invoice.findByIdAndUpdate(
    invoiceId,
    {
      $set: {
        paidAmount,
        paidAmountUSD,
        balance,
        balanceUSD,
        status: newStatus,
      },
    },
    { new: true }
  );

  // Side effects on status change
  if (statusChanged && updated) {
    // Webhook
    dispatchWebhooks(`invoice.${newStatus}`, {
      invoiceId,
      invoiceNumber: updated.invoiceNumber,
      previousStatus,
      newStatus,
      paidAmount,
      total: updated.total,
      balance,
      currency: updated.currency,
    }, 'system').catch(() => {});

    // Internal notifications
    if (newStatus === 'paid') {
      notifyAdmins({
        type: 'invoice_paid',
        title: `Factura pagada: ${updated.invoiceNumber}`,
        message: `${updated.clientName} — ${updated.currency} ${updated.total.toLocaleString()}`,
        severity: 'success',
        relatedModel: 'invoice',
        relatedId: invoiceId,
        route: '/invoices',
      }).catch(() => {});
    } else if (newStatus === 'overdue') {
      notifyAdmins({
        type: 'invoice_overdue',
        title: `Factura vencida: ${updated.invoiceNumber}`,
        message: `${updated.clientName} — saldo pendiente: ${updated.currency} ${balance.toLocaleString()}`,
        severity: 'warning',
        relatedModel: 'invoice',
        relatedId: invoiceId,
        route: '/invoices',
      }).catch(() => {});
    }
  }

  return updated;
}

/**
 * Recalculates status for all invoices linked to a set of invoice IDs.
 * Used when a payment with multiple allocations is updated/deleted.
 */
export async function recalculateMultipleInvoices(invoiceIds) {
  const results = [];
  for (const id of invoiceIds) {
    const result = await recalculateInvoiceStatus(id);
    if (result) results.push(result);
  }
  return results;
}

/**
 * Generates the next sequential invoice number.
 * Uses atomic findOneAndUpdate to prevent race conditions.
 */
export async function getNextInvoiceNumber() {
  // Import Settings inline to avoid circular deps
  const Settings = (await import('../models/Settings.js')).default;

  const settings = await Settings.findOneAndUpdate(
    { id: 'global' },
    { $inc: { invoiceCounterNextNumber: 1 } },
    { new: false, upsert: true }
  );

  const prefix = settings?.invoiceCounterPrefix || 'BMI';
  const year = new Date().getFullYear();
  const num = settings?.invoiceCounterNextNumber || 1;
  return `${prefix}-${year}-${String(num).padStart(4, '0')}`;
}
