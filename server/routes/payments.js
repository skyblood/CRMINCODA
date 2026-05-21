import { Router } from 'express';
import Payment from '../models/Payment.js';
import { deepSanitize } from '../middleware/sanitize.js';
import { emitCollectionChange } from '../socketInstance.js';
import { recalculateInvoiceStatus, recalculateMultipleInvoices } from '../services/invoiceStatusService.js';
import { convertToUSD } from '../services/exchangeRateService.js';
import { dispatchWebhooks } from '../webhookService.js';

const router = Router();

// ── GET ALL with filters ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.method) filter.method = req.query.method;
    if (req.query.from || req.query.to) {
      filter.paymentDate = {};
      if (req.query.from) filter.paymentDate.$gte = new Date(req.query.from);
      if (req.query.to) filter.paymentDate.$lte = new Date(req.query.to);
    }
    if (req.query.invoiceId) {
      filter['appliedTo.invoiceId'] = req.query.invoiceId;
    }

    const docs = await Payment.find(filter).sort({ paymentDate: -1 }).limit(500).lean();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET BY ID ────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const doc = await Payment.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREATE ───────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const data = deepSanitize(req.body, true);

    // Convert to USD if not provided
    if (data.amount && data.currency && !data.amountUSD) {
      const fx = await convertToUSD(data.amount, data.currency);
      data.amountUSD = fx.amountUSD;
      data.exchangeRateToUSD = fx.exchangeRateToUSD;
      if (!data.exchangeRateSource) {
        data.exchangeRateSource = fx.source === 'identity' ? 'manual' : 'auto';
      }
    }

    // Calculate USD for each allocation
    if (data.appliedTo?.length) {
      for (const alloc of data.appliedTo) {
        if (!alloc.amountAppliedUSD) {
          const fx = await convertToUSD(alloc.amountApplied, data.currency || 'USD');
          alloc.amountAppliedUSD = fx.amountUSD;
        }
      }
    }

    data.createdBy = req.session?.user?.id || 'system';

    const doc = await Payment.create(data);

    // Recalculate all affected invoices
    const invoiceIds = (doc.appliedTo || []).map(a => a.invoiceId);
    await recalculateMultipleInvoices(invoiceIds);

    dispatchWebhooks('payment.registered', {
      paymentId: doc._id,
      amount: doc.amount,
      currency: doc.currency,
      amountUSD: doc.amountUSD,
      invoiceIds,
    }, data.createdBy).catch(() => {});

    emitCollectionChange('payments', 'created', doc.toObject());
    res.status(201).json(doc.toObject());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── UPDATE ───────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const existing = await Payment.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const data = deepSanitize(req.body, true);
    delete data._id;
    delete data.__v;
    delete data.createdAt;

    // Recalculate USD if amount or currency changed
    if (data.amount !== undefined || data.currency !== undefined) {
      const amount = data.amount ?? existing.amount;
      const currency = data.currency ?? existing.currency;
      const fx = await convertToUSD(amount, currency);
      data.amountUSD = fx.amountUSD;
      data.exchangeRateToUSD = fx.exchangeRateToUSD;
    }

    // Recalculate allocation USD
    if (data.appliedTo?.length) {
      const currency = data.currency || existing.currency;
      for (const alloc of data.appliedTo) {
        if (!alloc.amountAppliedUSD) {
          const fx = await convertToUSD(alloc.amountApplied, currency);
          alloc.amountAppliedUSD = fx.amountUSD;
        }
      }
    }

    const doc = await Payment.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, lean: true });

    // Recalculate all affected invoices (old + new allocations)
    const oldInvoiceIds = (existing.appliedTo || []).map(a => a.invoiceId);
    const newInvoiceIds = (doc.appliedTo || []).map(a => a.invoiceId);
    const allInvoiceIds = [...new Set([...oldInvoiceIds, ...newInvoiceIds])];
    await recalculateMultipleInvoices(allInvoiceIds);

    emitCollectionChange('payments', 'updated', doc);
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Payment.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    const invoiceIds = (doc.appliedTo || []).map(a => a.invoiceId);

    await Payment.findByIdAndDelete(req.params.id);

    // Recalculate all affected invoices
    await recalculateMultipleInvoices(invoiceIds);

    emitCollectionChange('payments', 'deleted', { _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
