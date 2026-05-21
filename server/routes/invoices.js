import { Router } from 'express';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import { deepSanitize } from '../middleware/sanitize.js';
import { emitCollectionChange } from '../socketInstance.js';
import { recalculateInvoiceStatus, getNextInvoiceNumber } from '../services/invoiceStatusService.js';
import { convertToUSD } from '../services/exchangeRateService.js';
import { dispatchWebhooks } from '../webhookService.js';

const router = Router();

// ── GET ALL with filters ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = { deleted: { $ne: true } };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.projectId) filter.projectId = req.query.projectId;
    if (req.query.from || req.query.to) {
      filter.issueDate = {};
      if (req.query.from) filter.issueDate.$gte = new Date(req.query.from);
      if (req.query.to) filter.issueDate.$lte = new Date(req.query.to);
    }

    const sort = req.query.sort || 'createdAt';
    const order = req.query.order === 'asc' ? 1 : -1;

    const docs = await Invoice.find(filter).sort({ [sort]: order }).limit(500).lean();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET next invoice number ──────────────────────────────────────────────────
router.get('/next-number', async (_req, res) => {
  try {
    const number = await getNextInvoiceNumber();
    res.json({ invoiceNumber: number });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET BY ID with payments ──────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).lean();
    if (!invoice || invoice.deleted) return res.status(404).json({ error: 'Not found' });

    const payments = await Payment.find({ 'appliedTo.invoiceId': req.params.id }).lean();
    res.json({ ...invoice, payments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREATE ───────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const data = deepSanitize(req.body, true);

    // Auto-generate invoice number if not provided
    if (!data.invoiceNumber) {
      data.invoiceNumber = await getNextInvoiceNumber();
    }

    // Calculate USD amounts if not provided
    if (data.total && data.currency && !data.totalUSD) {
      const fx = await convertToUSD(data.total, data.currency);
      data.totalUSD = fx.amountUSD;
      data.exchangeRateToUSD = fx.exchangeRateToUSD;
    }

    // Set initial balance
    data.balance = data.total || 0;
    data.balanceUSD = data.totalUSD || 0;

    // If issueDate is provided, start as issued
    if (data.issueDate && !data.status) {
      data.status = 'issued';
    }

    data.createdBy = req.session?.user?.id || 'system';

    const doc = await Invoice.create(data);
    emitCollectionChange('invoices', 'created', doc.toObject());
    res.status(201).json(doc.toObject());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── UPDATE ───────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice || invoice.deleted) return res.status(404).json({ error: 'Not found' });
    if (invoice.status === 'void') return res.status(400).json({ error: 'Cannot edit a voided invoice' });

    const { clientUpdatedAt, ...updateData } = deepSanitize(req.body, true);
    delete updateData._id;
    delete updateData.__v;
    delete updateData.createdAt;

    // Recalculate USD if total or currency changed
    if (updateData.total !== undefined || updateData.currency !== undefined) {
      const total = updateData.total ?? invoice.total;
      const currency = updateData.currency ?? invoice.currency;
      const fx = await convertToUSD(total, currency);
      updateData.totalUSD = fx.amountUSD;
      updateData.exchangeRateToUSD = fx.exchangeRateToUSD;
    }

    // Concurrency check
    const query = { _id: req.params.id };
    if (clientUpdatedAt) {
      query.updatedAt = new Date(clientUpdatedAt);
    }

    const doc = await Invoice.findOneAndUpdate(query, { $set: updateData }, { new: true, lean: true });
    if (!doc) {
      if (clientUpdatedAt) {
        const current = await Invoice.findById(req.params.id).lean();
        return res.status(409).json({ error: 'Conflict: modified by another session.', current });
      }
      return res.status(404).json({ error: 'Not found' });
    }

    // Recalculate status (total may have changed)
    await recalculateInvoiceStatus(req.params.id);

    emitCollectionChange('invoices', 'updated', doc);
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── ISSUE (draft → issued) ──────────────────────────────────────────────────
router.post('/:id/issue', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    if (invoice.status !== 'draft') {
      return res.status(400).json({ error: `Cannot issue invoice in status "${invoice.status}"` });
    }

    const updates = {
      status: 'issued',
      issueDate: invoice.issueDate || new Date(),
    };
    if (!invoice.dueDate) {
      const Settings = (await import('../models/Settings.js')).default;
      const settings = await Settings.findOne({ id: 'global' }).lean();
      const dueDays = settings?.invoiceDefaultDueDays || 30;
      updates.dueDate = new Date(Date.now() + dueDays * 86400000);
    }

    const doc = await Invoice.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, lean: true });

    dispatchWebhooks('invoice.issued', {
      invoiceId: doc._id,
      invoiceNumber: doc.invoiceNumber,
      clientName: doc.clientName,
      total: doc.total,
      currency: doc.currency,
      dueDate: doc.dueDate,
    }, req.session?.user?.id || 'system').catch(() => {});

    emitCollectionChange('invoices', 'updated', doc);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── VOID ─────────────────────────────────────────────────────────────────────
router.post('/:id/void', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    if (invoice.status === 'void') return res.status(400).json({ error: 'Already voided' });

    // Guard: no payments applied
    const paymentCount = await Payment.countDocuments({ 'appliedTo.invoiceId': req.params.id });
    if (paymentCount > 0) {
      return res.status(400).json({
        error: `Cannot void: ${paymentCount} payment(s) applied. Remove payments first.`,
      });
    }

    const doc = await Invoice.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: 'void',
          voidedAt: new Date(),
          voidedBy: req.session?.user?.id || 'system',
          voidReason: req.body.reason || '',
        },
      },
      { new: true, lean: true }
    );

    emitCollectionChange('invoices', 'updated', doc);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SOFT DELETE (draft only) ─────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    if (invoice.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft invoices can be deleted' });
    }

    await Invoice.findByIdAndUpdate(req.params.id, {
      $set: { deleted: true, deletedAt: new Date(), deletedBy: req.session?.user?.id || 'system' },
    });

    emitCollectionChange('invoices', 'deleted', { _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── REGISTER PAYMENT against invoice ─────────────────────────────────────────
router.post('/:id/payments', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'void' || invoice.status === 'draft') {
      return res.status(400).json({ error: `Cannot register payment on ${invoice.status} invoice` });
    }

    const data = deepSanitize(req.body, true);

    // Convert to USD
    const currency = data.currency || invoice.currency;
    const fx = await convertToUSD(data.amount, currency);

    const payment = await Payment.create({
      clientId: invoice.clientId,
      clientName: invoice.clientName,
      paymentDate: data.paymentDate || new Date(),
      amount: data.amount,
      currency,
      amountUSD: fx.amountUSD,
      exchangeRateToUSD: fx.exchangeRateToUSD,
      exchangeRateSource: data.exchangeRateSource || (fx.source === 'identity' ? 'manual' : 'auto'),
      method: data.method || 'wire_transfer',
      reference: data.reference,
      appliedTo: [{
        invoiceId: req.params.id,
        amountApplied: data.amount,
        amountAppliedUSD: fx.amountUSD,
      }],
      createdBy: req.session?.user?.id || 'system',
      notes: data.notes,
    });

    // Recalculate invoice status
    const updated = await recalculateInvoiceStatus(req.params.id);

    dispatchWebhooks('payment.registered', {
      paymentId: payment._id,
      invoiceId: req.params.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: data.amount,
      currency,
      amountUSD: fx.amountUSD,
      newInvoiceStatus: updated?.status,
    }, req.session?.user?.id || 'system').catch(() => {});

    emitCollectionChange('payments', 'created', payment.toObject());
    emitCollectionChange('invoices', 'updated', updated?.toObject());

    res.status(201).json(payment.toObject());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── LIST PAYMENTS for invoice ────────────────────────────────────────────────
router.get('/:id/payments', async (req, res) => {
  try {
    const payments = await Payment.find({ 'appliedTo.invoiceId': req.params.id })
      .sort({ paymentDate: -1 }).lean();
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREATE FROM QUOTE ────────────────────────────────────────────────────────
router.post('/from-quote/:quoteId', async (req, res) => {
  try {
    const Lead = (await import('../models/Lead.js')).default;
    const lead = await Lead.findOne({ id: req.params.quoteId }).lean();
    if (!lead) return res.status(404).json({ error: 'Quote/Lead not found' });

    const lineItems = (lead.items || []).map(item => ({
      description: item.description || item.category || '',
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || 0,
      amount: item.total || (item.quantity || 1) * (item.unitPrice || 0),
      skuId: item.skuId,
    }));

    const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
    const currency = req.body.currency || 'USD';
    const taxRate = req.body.taxRate || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    const fx = await convertToUSD(total, currency);
    const invoiceNumber = await getNextInvoiceNumber();

    const doc = await Invoice.create({
      invoiceNumber,
      clientId: lead.id,
      clientName: lead.companyName,
      clientEmail: lead.email,
      projectId: req.body.projectId,
      quoteId: lead.id,
      subtotal,
      taxRate,
      taxAmount,
      total,
      currency,
      totalUSD: fx.amountUSD,
      exchangeRateToUSD: fx.exchangeRateToUSD,
      lineItems,
      status: 'draft',
      balance: total,
      balanceUSD: fx.amountUSD,
      createdBy: req.session?.user?.id || 'system',
    });

    emitCollectionChange('invoices', 'created', doc.toObject());
    res.status(201).json(doc.toObject());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
