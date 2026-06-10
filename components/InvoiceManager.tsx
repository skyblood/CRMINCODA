import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Search, Filter, Eye, Send, Ban, DollarSign, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import type { Invoice, InvoiceStatus } from '../types';
import { apiFetch, sanitizeId } from '../services/apiFetch';

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  draft:          { label: 'Borrador',  color: '#6B7280', bg: '#F3F4F6', icon: FileText },
  issued:         { label: 'Emitida',   color: '#3B82F6', bg: '#EFF6FF', icon: Send },
  partially_paid: { label: 'Pago Parcial', color: '#F59E0B', bg: '#FFFBEB', icon: DollarSign },
  paid:           { label: 'Pagada',    color: '#10B981', bg: '#ECFDF5', icon: CheckCircle },
  overdue:        { label: 'Vencida',   color: '#EF4444', bg: '#FEF2F2', icon: AlertCircle },
  void:           { label: 'Anulada',   color: '#9CA3AF', bg: '#F9FAFB', icon: XCircle },
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      <Icon size={12} /> {cfg.label}
    </span>
  );
}

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
}

export function InvoiceManager() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await apiFetch(`/api/invoices?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data);
      }
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const filtered = invoices.filter(inv => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      inv.invoiceNumber?.toLowerCase().includes(term) ||
      inv.clientName?.toLowerCase().includes(term) ||
      inv.notes?.toLowerCase().includes(term)
    );
  });

  const handleIssue = async (id: string) => {
    try {
      const res = await apiFetch(`/api/invoices/${sanitizeId(id)}/issue`, { method: 'POST' });
      if (res.ok) fetchInvoices();
    } catch (err) {
      console.error('Failed to issue invoice:', err);
    }
  };

  const handleVoid = async (id: string) => {
    const reason = prompt('Razón de anulación:');
    if (!reason) return;
    try {
      const res = await apiFetch(`/api/invoices/${sanitizeId(id)}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) fetchInvoices();
      else {
        const err = await res.json();
        alert(err.error);
      }
    } catch (err) {
      console.error('Failed to void invoice:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este borrador?')) return;
    try {
      const res = await apiFetch(`/api/invoices/${sanitizeId(id)}`, { method: 'DELETE' });
      if (res.ok) fetchInvoices();
    } catch (err) {
      console.error('Failed to delete invoice:', err);
    }
  };

  // Summary stats
  const stats = {
    total: invoices.length,
    open: invoices.filter(i => ['issued', 'partially_paid', 'overdue'].includes(i.status)).length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
    totalAR: invoices.filter(i => ['issued', 'partially_paid', 'overdue'].includes(i.status)).reduce((s, i) => s + (i.balanceUSD || 0), 0),
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText size={28} /> Facturas
          </h1>
          <p className="text-sm mt-1" style={{ color: '#B9B7C9' }}>
            {stats.open} abiertas · {stats.overdue} vencidas · AR: {formatCurrency(stats.totalAR)}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium"
          style={{ backgroundColor: '#7C3AED' }}
        >
          <Plus size={18} /> Nueva Factura
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por número, cliente..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-600 bg-gray-800 text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-600 bg-gray-800 text-white text-sm"
          >
            <option value="all">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="issued">Emitida</option>
            <option value="partially_paid">Pago Parcial</option>
            <option value="paid">Pagada</option>
            <option value="overdue">Vencida</option>
            <option value="void">Anulada</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando facturas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {invoices.length === 0 ? 'No hay facturas aún. Crea la primera.' : 'Sin resultados para el filtro actual.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-gray-300 text-left">
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Emisión</th>
                <th className="px-4 py-3 font-medium">Vencimiento</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Saldo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filtered.map(inv => (
                <tr key={inv._id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-purple-300">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-white">{inv.clientName}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-medium">
                    {formatCurrency(inv.total, inv.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium" style={{ color: inv.balance > 0 ? '#F59E0B' : '#10B981' }}>
                    {formatCurrency(inv.balance, inv.currency)}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSelectedInvoice(inv)} className="p-1 rounded hover:bg-gray-700" title="Ver detalle">
                        <Eye size={16} className="text-gray-400" />
                      </button>
                      {inv.status === 'draft' && (
                        <>
                          <button onClick={() => handleIssue(inv._id!)} className="p-1 rounded hover:bg-gray-700" title="Emitir">
                            <Send size={16} className="text-blue-400" />
                          </button>
                          <button onClick={() => handleDelete(inv._id!)} className="p-1 rounded hover:bg-gray-700" title="Eliminar">
                            <XCircle size={16} className="text-red-400" />
                          </button>
                        </>
                      )}
                      {['issued', 'partially_paid', 'overdue'].includes(inv.status) && (
                        <button onClick={() => handleVoid(inv._id!)} className="p-1 rounded hover:bg-gray-700" title="Anular">
                          <Ban size={16} className="text-gray-400" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateInvoiceModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchInvoices(); }}
        />
      )}

      {/* Detail Slide-over */}
      {selectedInvoice && (
        <InvoiceDetailPanel
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onRefresh={fetchInvoices}
        />
      )}
    </div>
  );
}

// ── Create Invoice Modal ─────────────────────────────────────────────────────
function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    clientName: '', clientEmail: '', clientId: '', projectId: '',
    currency: 'USD', subtotal: 0, taxRate: 0, notes: '',
    lineItems: [{ description: '', quantity: 1, unitPrice: 0, amount: 0 }],
  });
  const [saving, setSaving] = useState(false);

  const handleLineItemChange = (idx: number, field: string, value: string | number) => {
    const items = [...form.lineItems];
    (items[idx] as any)[field] = value;
    if (field === 'quantity' || field === 'unitPrice') {
      items[idx].amount = Number(items[idx].quantity) * Number(items[idx].unitPrice);
    }
    const subtotal = items.reduce((s, li) => s + li.amount, 0);
    setForm({ ...form, lineItems: items, subtotal });
  };

  const addLineItem = () => {
    setForm({ ...form, lineItems: [...form.lineItems, { description: '', quantity: 1, unitPrice: 0, amount: 0 }] });
  };

  const total = form.subtotal + form.subtotal * (form.taxRate / 100);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: form.clientName,
          clientEmail: form.clientEmail,
          clientId: form.clientId || form.clientName,
          projectId: form.projectId || undefined,
          currency: form.currency,
          subtotal: form.subtotal,
          taxRate: form.taxRate,
          taxAmount: form.subtotal * (form.taxRate / 100),
          total,
          lineItems: form.lineItems.filter(li => li.description),
          notes: form.notes,
        }),
      });
      if (res.ok) onCreated();
      else {
        const err = await res.json();
        alert(err.error);
      }
    } catch (err) {
      console.error('Failed to create invoice:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 border border-gray-700" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-white mb-4">Nueva Factura</h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Cliente</label>
            <input type="text" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-gray-800 text-white text-sm" placeholder="Nombre del cliente" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input type="email" value={form.clientEmail} onChange={e => setForm({ ...form, clientEmail: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-gray-800 text-white text-sm" placeholder="email@cliente.com" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Moneda</label>
            <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-gray-800 text-white text-sm">
              <option value="USD">USD</option>
              <option value="COP">COP</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Impuesto (%)</label>
            <input type="number" value={form.taxRate} onChange={e => setForm({ ...form, taxRate: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-gray-800 text-white text-sm" min={0} max={100} />
          </div>
        </div>

        {/* Line Items */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Líneas</label>
          {form.lineItems.map((li, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
              <input type="text" placeholder="Descripción" value={li.description}
                onChange={e => handleLineItemChange(idx, 'description', e.target.value)}
                className="col-span-5 px-2 py-1.5 rounded border border-gray-600 bg-gray-800 text-white text-sm" />
              <input type="number" placeholder="Cant" value={li.quantity} min={1}
                onChange={e => handleLineItemChange(idx, 'quantity', Number(e.target.value))}
                className="col-span-2 px-2 py-1.5 rounded border border-gray-600 bg-gray-800 text-white text-sm" />
              <input type="number" placeholder="Precio" value={li.unitPrice} min={0}
                onChange={e => handleLineItemChange(idx, 'unitPrice', Number(e.target.value))}
                className="col-span-3 px-2 py-1.5 rounded border border-gray-600 bg-gray-800 text-white text-sm" />
              <div className="col-span-2 flex items-center justify-end text-sm text-gray-300">
                {formatCurrency(li.amount, form.currency)}
              </div>
            </div>
          ))}
          <button onClick={addLineItem} className="text-sm text-purple-400 hover:text-purple-300">+ Agregar línea</button>
        </div>

        {/* Totals */}
        <div className="border-t border-gray-700 pt-3 mb-4 space-y-1 text-sm">
          <div className="flex justify-between text-gray-300">
            <span>Subtotal</span><span>{formatCurrency(form.subtotal, form.currency)}</span>
          </div>
          {form.taxRate > 0 && (
            <div className="flex justify-between text-gray-300">
              <span>Impuesto ({form.taxRate}%)</span><span>{formatCurrency(form.subtotal * form.taxRate / 100, form.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-white font-bold text-base">
            <span>Total</span><span>{formatCurrency(total, form.currency)}</span>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Notas</label>
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-gray-800 text-white text-sm" rows={2} />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving || !form.clientName || total <= 0}
            className="px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50" style={{ backgroundColor: '#7C3AED' }}>
            {saving ? 'Creando...' : 'Crear Factura'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Invoice Detail Panel ─────────────────────────────────────────────────────
function InvoiceDetailPanel({ invoice, onClose, onRefresh }: { invoice: Invoice; onClose: () => void; onRefresh: () => void }) {
  const [payments, setPayments] = useState<any[]>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentData, setPaymentData] = useState({ amount: 0, method: 'wire_transfer', reference: '', currency: invoice.currency, notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch(`/api/invoices/${sanitizeId(invoice._id)}/payments`)
      .then(r => r.json())
      .then(setPayments)
      .catch(() => {});
  }, [invoice._id]);

  const handleRegisterPayment = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/invoices/${sanitizeId(invoice._id)}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: paymentData.amount,
          method: paymentData.method,
          reference: paymentData.reference,
          currency: paymentData.currency,
          notes: paymentData.notes,
          paymentDate: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        setShowPaymentForm(false);
        setPaymentData({ amount: 0, method: 'wire_transfer', reference: '', currency: invoice.currency, notes: '' });
        onRefresh();
        // Refresh payments
        const pRes = await apiFetch(`/api/invoices/${sanitizeId(invoice._id)}/payments`);
        if (pRes.ok) setPayments(await pRes.json());
      } else {
        const err = await res.json();
        alert(err.error);
      }
    } catch (err) {
      console.error('Failed to register payment:', err);
    } finally {
      setSaving(false);
    }
  };

  const canRegisterPayment = ['issued', 'partially_paid', 'overdue'].includes(invoice.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg bg-gray-900 h-full overflow-y-auto border-l border-gray-700 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">{invoice.invoiceNumber}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <StatusBadge status={invoice.status} />
            <span className="text-sm text-gray-400">{invoice.currency}</span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Cliente</span>
              <p className="text-white">{invoice.clientName}</p>
            </div>
            <div>
              <span className="text-gray-400">Email</span>
              <p className="text-white">{invoice.clientEmail || '—'}</p>
            </div>
            <div>
              <span className="text-gray-400">Emisión</span>
              <p className="text-white">{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString() : '—'}</p>
            </div>
            <div>
              <span className="text-gray-400">Vencimiento</span>
              <p className="text-white">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}</p>
            </div>
          </div>

          {/* Amounts */}
          <div className="bg-gray-800 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Total</span><span className="text-white font-bold">{formatCurrency(invoice.total, invoice.currency)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Pagado</span><span className="text-green-400">{formatCurrency(invoice.paidAmount || 0, invoice.currency)}</span></div>
            <div className="flex justify-between border-t border-gray-700 pt-2"><span className="text-gray-400">Saldo</span><span className="text-yellow-400 font-bold">{formatCurrency(invoice.balance || 0, invoice.currency)}</span></div>
            {invoice.currency !== 'USD' && (
              <div className="flex justify-between text-xs text-gray-500"><span>Saldo USD</span><span>{formatCurrency(invoice.balanceUSD || 0, 'USD')}</span></div>
            )}
          </div>

          {/* Line Items */}
          {invoice.lineItems?.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-2">Líneas</h3>
              <div className="space-y-1">
                {invoice.lineItems.map((li, idx) => (
                  <div key={idx} className="flex justify-between text-sm bg-gray-800 px-3 py-2 rounded">
                    <span className="text-white">{li.description} <span className="text-gray-500">x{li.quantity}</span></span>
                    <span className="text-gray-300">{formatCurrency(li.amount, invoice.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-400">Pagos ({payments.length})</h3>
              {canRegisterPayment && (
                <button onClick={() => setShowPaymentForm(true)} className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1">
                  <Plus size={14} /> Registrar Pago
                </button>
              )}
            </div>
            {payments.length === 0 ? (
              <p className="text-sm text-gray-500">Sin pagos registrados</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p: any) => (
                  <div key={p._id} className="bg-gray-800 rounded-lg p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white font-medium">{formatCurrency(p.amount, p.currency)}</span>
                      <span className="text-gray-400">{new Date(p.paymentDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>{p.method}</span>
                      {p.reference && <span>Ref: {p.reference}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment Form */}
          {showPaymentForm && (
            <div className="bg-gray-800 rounded-lg p-4 border border-purple-500/30">
              <h4 className="text-sm font-medium text-white mb-3">Registrar Pago</h4>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Monto</label>
                    <input type="number" value={paymentData.amount} min={0}
                      onChange={e => setPaymentData({ ...paymentData, amount: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded border border-gray-600 bg-gray-700 text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Método</label>
                    <select value={paymentData.method} onChange={e => setPaymentData({ ...paymentData, method: e.target.value })}
                      className="w-full px-3 py-2 rounded border border-gray-600 bg-gray-700 text-white text-sm">
                      <option value="wire_transfer">Transferencia</option>
                      <option value="stripe">Stripe</option>
                      <option value="mercury">Mercury</option>
                      <option value="cash">Efectivo</option>
                      <option value="check">Cheque</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Referencia</label>
                  <input type="text" value={paymentData.reference} placeholder="# transacción, # cheque..."
                    onChange={e => setPaymentData({ ...paymentData, reference: e.target.value })}
                    className="w-full px-3 py-2 rounded border border-gray-600 bg-gray-700 text-white text-sm" />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowPaymentForm(false)} className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white">Cancelar</button>
                  <button onClick={handleRegisterPayment} disabled={saving || paymentData.amount <= 0}
                    className="px-3 py-1.5 rounded text-sm text-white font-medium disabled:opacity-50" style={{ backgroundColor: '#7C3AED' }}>
                    {saving ? 'Guardando...' : 'Registrar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-1">Notas</h3>
              <p className="text-sm text-gray-300">{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
