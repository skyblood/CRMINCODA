
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Lead, SalesStage, Interaction, ProjectType, TaskTemplate, LineItem, SKUCategory, SKUItem, Transaction, ExpenseCategory, TimeLog, User, Task, Contact, StageHistoryEntry, CompletedNextStep, Pipeline } from '../types';
import { MoreHorizontal, Phone, Mail, Calendar, ArrowRightCircle, FileText, MapPin, Briefcase, User as UserIcon, X, StickyNote, Send, CheckCircle2, AlertTriangle, Info, AlertCircle, Plus, Trash2, ShoppingCart, DollarSign, Archive, RotateCcw, Layout, Receipt, Clock, CheckSquare, ListTodo, Save, Contact as ContactIcon, Filter, Download, Upload, FileSpreadsheet, HardDrive, Users, Percent, CreditCard, BadgeCheck, Table2, Flag, History, Shield } from 'lucide-react';
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import PipelineTableView from './PipelineTableView';
import { ActivityTimeline } from './ActivityTimeline';
import { ProposalPrint } from './ProposalPrint';
import { VeracodeQuoteWizard } from './VeracodeQuoteWizard';
import type { VeracodeConfig } from './VeracodeQuoteWizard';
import { PipelinePath } from './PipelinePath';
import { CostingReview } from './CostingReview';
import { CostingSystemGuide } from './CostingSystemGuide';
import { z } from 'zod';

// ── SKUCategory → ProjectType mapping ────────────────────────────────────────
function skuCategoryToProjectType(cat: SKUCategory): ProjectType {
  switch (cat) {
    case 'license':           return 'license';
    case 'vendor_support':
    case 'incoda_support': return 'support';
    case 'implementation':    return 'implementation';
    case 'hours_pack':        return 'hours_pack';
    default:                  return 'implementation';
  }
}

function detectProjectTypes(items: LineItem[]): ProjectType[] {
  if (!items?.length) return ['implementation'];
  const seen = new Set<ProjectType>();
  items.forEach(item => seen.add(skuCategoryToProjectType(item.category)));
  return Array.from(seen);
}

// ── Lead form validation schema ───────────────────────────────────────────────
const NewLeadSchema = z.object({
  companyName:      z.string().min(1, 'Company name is required'),
  contactName:      z.string().min(1, 'Contact name is required'),
  email:            z.union([z.literal(''), z.string().email('Invalid email address')]),
  expectedCloseDate: z.string().min(1, 'Expected close date is required'),
});
type NewLeadErrors = Partial<Record<keyof z.infer<typeof NewLeadSchema>, string>>;

// ── Drag & Drop helpers ──────────────────────────────────────────────────────

const DroppableColumn: React.FC<{ stageKey: string; children: React.ReactNode; className: string }> = ({ stageKey, children, className }) => {
    const { setNodeRef, isOver } = useDroppable({ id: stageKey });
    return (
        <div ref={setNodeRef} className={`${className}${isOver ? ' ring-2 ring-purple-300 ring-inset' : ''}`}>
            {children}
        </div>
    );
};

const DraggableCard: React.FC<{ leadId: string; children: React.ReactNode; className: string; onClick: () => void }> = ({ leadId, children, className, onClick }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: leadId });
    const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined;
    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={onClick}
            {...attributes}
            {...listeners}
            className={`${className}${isDragging ? ' opacity-40 shadow-lg' : ''}`}
        >
            {children}
        </div>
    );
};

interface CRMPipelineProps {
  leads: Lead[];
  templates: TaskTemplate[]; // Received templates
  skuCatalog: SKUItem[]; // Received SKU Catalog
  transactions: Transaction[]; // Received Transactions for Expenses
  updateLead: (lead: Lead) => void;
  onAddLead: (lead: Lead) => void;
  onImportLeads: (newLeads: Lead[], updatedLeads: Lead[]) => void; // New Bulk Import Handler
  onDeleteLead: (id: string) => void; // Soft delete
  onRestoreLead: (id: string) => void; // Restore from trash
  onPermanentDeleteLead: (id: string) => void; // Hard delete
  onConvertToProject: (lead: Lead, assignedConsultant: string, projectType: ProjectType, templateId?: string, initialDeposit?: number, contractStartDate?: string, contractEndDate?: string, packHours?: number, sourceItem?: LineItem) => void;
  onAddTransaction: (transaction: Transaction) => void; // Handler to add expense
  onAddPreSalesLog: (leadId: string, log: TimeLog) => void; // Handler for time logs
  users: User[]; // Needed for selecting who logged time
  currentUser: User; // Current logged-in user for costing approval
  contacts?: Contact[]; // Optional for backward compatibility if not passed immediately
  onAddContact?: (contact: Contact) => void;
  pipelines?: Pipeline[]; // Optional — enables pipeline filter in kanban header
}

// Advanced Stage Configuration with Strategic Elements
const STAGE_CONFIG: { 
    key: SalesStage; 
    label: string; 
    color: string; 
    probability: number;
    criteria: string; 
}[] = [
  { 
      key: 'prospect', 
      label: 'Prospect', 
      color: 'bg-gray-100 border-gray-200', 
      probability: 10,
      criteria: 'Contact identified. Initial outreach made.' 
  },
  { 
      key: 'qualification', 
      label: 'Discovery', 
      color: 'bg-blue-50 border-blue-200', 
      probability: 30,
      criteria: 'BANT confirmed (Budget, Authority, Need, Timing).'
  },
  { 
      key: 'presentation', 
      label: 'Presentation', 
      color: 'bg-indigo-50 border-indigo-200', 
      probability: 50,
      criteria: 'Solution demo delivered. Pain points addressed.'
  },
  { 
      key: 'proposal', 
      label: 'Proposal', 
      color: 'bg-purple-50 border-purple-200', 
      probability: 70,
      criteria: 'Formal quote sent. Terms defined.'
  },
  { 
      key: 'negotiation', 
      label: 'Negotiation', 
      color: 'bg-orange-50 border-orange-200', 
      probability: 90,
      criteria: 'Legal/Procurement review. Final pricing discussions.'
  },
  { 
      key: 'closed-won', 
      label: 'Closed Won', 
      color: 'bg-green-50 border-green-200', 
      probability: 100,
      criteria: 'Contract signed. Project kickoff scheduled.'
  },
  { 
      key: 'project-delivered', 
      label: 'Project Delivered', 
      color: 'bg-teal-50 border-teal-200', 
      probability: 100,
      criteria: 'Implementation/Service complete. Project closed.'
  },
  { 
      key: 'closed-lost', 
      label: 'Closed Lost', 
      color: 'bg-red-50 border-red-200', 
      probability: 0,
      criteria: 'Deal lost.'
  },
];

const SKU_CATEGORIES: { key: SKUCategory; label: string }[] = [
    { key: 'license', label: 'License' },
    { key: 'vendor_support', label: 'Vendor Support' },
    { key: 'incoda_support', label: 'Incoda Support' },
    { key: 'implementation', label: 'Implementation' },
    { key: 'hours_pack', label: 'Hours Pack' },
];

// Mock list of consultants for assignment
const CONSULTANTS = ['Fabian Rojas', 'Kyle Reese', 'T-800', 'John Connor'];

// --- HELPER FUNCTIONS & SUB-COMPONENTS (Defined outside to prevent re-renders) ---

const calculateTotalValue = (items: LineItem[]) => {
    return items.reduce((sum, item) => sum + item.total, 0);
};

// CSV Parser Helper to handle quotes
const parseCSVLine = (text: string) => {
    const result = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"' && text[i+1] === '"') {
             cell += '"'; i++; // Skip next quote
        } else if (char === '"') { 
             inQuotes = !inQuotes; 
        } else if (char === ',' && !inQuotes) { 
             result.push(cell); cell = ''; 
        } else { 
             cell += char; 
        }
    }
    result.push(cell);
    return result.map(c => c.trim());
};

// License year row type
interface LicenseYearRow {
    year: number;
    unitCost: number;
    margin: number;
    unitPrice: number;
    billingDate: string;
}

// Shared Input Component for Items
const ItemInputRow = ({
    skuCatalog,
    newItemInput,
    setNewItemInput,
    onAddItems
}: {
    skuCatalog: SKUItem[],
    newItemInput: Partial<LineItem>,
    setNewItemInput: React.Dispatch<React.SetStateAction<Partial<LineItem>>>,
    onAddItems: (items: LineItem[]) => void
}) => {
    const currentYear = new Date().getFullYear();
    const isLicense = newItemInput.category === 'license';

    const [licenseRows, setLicenseRows] = React.useState<LicenseYearRow[]>([
        { year: currentYear, unitCost: 0, margin: 20, unitPrice: 0, billingDate: '' }
    ]);

    const handleSKUSelection = (skuId: string) => {
        if (!skuId) return;
        const sku = skuCatalog.find(s => s.id === skuId);
        if (sku) {
            const cost = sku.basePrice;
            const margin = 20;
            const sellingPrice = Number((cost * (1 + margin / 100)).toFixed(2));
            setNewItemInput(prev => ({ ...prev, category: sku.category, description: sku.name, unitCost: cost, margin, unitPrice: sellingPrice }));
            if (sku.category === 'license') {
                setLicenseRows(prev => prev.map((r, i) => ({ ...r, unitCost: cost, margin, unitPrice: sellingPrice })));
            }
        }
    };

    const handleNumYearsChange = (n: number) => {
        if (n < 1 || n > 15) return;
        const base = licenseRows[0] || { year: currentYear, unitCost: 0, margin: 20, unitPrice: 0, billingDate: '' };
        const newRows: LicenseYearRow[] = Array.from({ length: n }, (_, i) =>
            licenseRows[i] || { ...base, year: base.year + i, billingDate: '' }
        );
        setLicenseRows(newRows);
    };

    const handleRowChange = (idx: number, field: keyof LicenseYearRow, value: string | number) => {
        const updated = [...licenseRows];
        updated[idx] = { ...updated[idx], [field]: value };
        if (field === 'unitCost' || field === 'margin') {
            const cost = field === 'unitCost' ? Number(value) : updated[idx].unitCost;
            const margin = field === 'margin' ? Number(value) : updated[idx].margin;
            updated[idx].unitPrice = Number((cost * (1 + margin / 100)).toFixed(2));
        } else if (field === 'unitPrice') {
            const unitPrice = Number(value);
            const cost = updated[idx].unitCost;
            updated[idx].margin = cost > 0 ? Number(((unitPrice - cost) / cost * 100).toFixed(2)) : 0;
        }
        setLicenseRows(updated);
    };

    const handleAdd = () => {
        if (!newItemInput.description) return;
        if (isLicense) {
            const items: LineItem[] = licenseRows
                .filter(r => r.unitPrice > 0)
                .map((r, i) => ({
                    id: `li_${Date.now()}_${i}`,
                    category: 'license' as SKUCategory,
                    description: newItemInput.description!,
                    quantity: 1,
                    unitCost: r.unitCost,
                    margin: r.margin,
                    unitPrice: r.unitPrice,
                    total: r.unitPrice,
                    licenseYear: r.year,
                    billingDate: r.billingDate || undefined,
                    years: licenseRows.length,
                }));
            if (items.length === 0) return;
            onAddItems(items);
            setLicenseRows([{ year: currentYear, unitCost: 0, margin: 20, unitPrice: 0, billingDate: '' }]);
            setNewItemInput({ category: 'license', description: '', quantity: 1, unitCost: 0, margin: 20, unitPrice: 0 });
        } else {
            if (!newItemInput.unitPrice) return;
            const qty = newItemInput.quantity || 1;
            const price = newItemInput.unitPrice || 0;
            onAddItems([{
                id: `li_${Date.now()}`,
                category: newItemInput.category as SKUCategory || 'implementation',
                description: newItemInput.description!,
                quantity: qty,
                unitCost: newItemInput.unitCost || 0,
                margin: newItemInput.margin || 0,
                unitPrice: price,
                total: qty * price,
            }]);
            setNewItemInput({ category: newItemInput.category, description: '', quantity: 1, unitCost: 0, margin: 20, unitPrice: 0 });
        }
    };

    return (
        <div className="space-y-3 mb-4 p-3 bg-white rounded border border-gray-200">
            {/* SKU Catalog selector */}
            <div className="flex gap-2 mb-2">
                <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block font-bold text-blue-600">Load from Catalog</label>
                    <select className="w-full border border-blue-200 bg-blue-50 rounded p-1.5 text-xs" onChange={(e) => handleSKUSelection(e.target.value)} value="">
                        <option value="">Select from Catalog...</option>
                        {skuCatalog.map(sku => (
                            <option key={sku.id} value={sku.id}>[{sku.code}] {sku.name} (${sku.basePrice.toLocaleString()})</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Category + Description */}
            <div className="overflow-x-auto -mx-1">
            <div className="grid grid-cols-12 gap-2 items-end min-w-[600px] px-1">
                <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">Category</label>
                    <select className="w-full border border-gray-300 rounded p-1.5 text-xs" value={newItemInput.category}
                        onChange={(e) => setNewItemInput({ ...newItemInput, category: e.target.value as SKUCategory })}>
                        {SKU_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                </div>
                <div className={isLicense ? 'col-span-10' : 'col-span-3'}>
                    <label className="text-xs text-gray-500 mb-1 block">Description</label>
                    <textarea className="w-full border border-gray-300 rounded p-1.5 text-xs focus:ring-2 focus:ring-blue-100 outline-none resize-y min-h-[34px]"
                        placeholder="Details..." rows={1} value={newItemInput.description}
                        onChange={(e) => setNewItemInput({ ...newItemInput, description: e.target.value })} />
                </div>
                {/* Non-license pricing fields */}
                {!isLicense && (
                    <>
                        <div className="col-span-1">
                            <label className="text-xs text-gray-500 mb-1 block">Qty</label>
                            <input type="number" min="1" className="w-full border border-gray-300 rounded p-1.5 text-xs"
                                value={newItemInput.quantity}
                                onChange={(e) => setNewItemInput({ ...newItemInput, quantity: Number(e.target.value) })} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs text-gray-500 mb-1 block font-semibold">Vendor Price ($)</label>
                            <input type="number" min="0" className="w-full border border-gray-300 rounded p-1.5 text-xs bg-gray-50"
                                value={newItemInput.unitCost}
                                onChange={(e) => {
                                    const cost = Number(e.target.value);
                                    setNewItemInput({ ...newItemInput, unitCost: cost, unitPrice: Number((cost * (1 + (newItemInput.margin || 0) / 100)).toFixed(2)) });
                                }} />
                        </div>
                        <div className="col-span-1">
                            <label className="text-xs text-gray-500 mb-1 block font-semibold">Margin %</label>
                            <input type="number" min="0" className="w-full border border-gray-300 rounded p-1.5 text-xs"
                                value={newItemInput.margin}
                                onChange={(e) => {
                                    const margin = Number(e.target.value);
                                    setNewItemInput({ ...newItemInput, margin, unitPrice: Number(((newItemInput.unitCost || 0) * (1 + margin / 100)).toFixed(2)) });
                                }} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs text-gray-500 mb-1 block text-green-700 font-bold">Selling Price ($)</label>
                            <input type="number" min="0" className="w-full border border-green-300 bg-green-50 text-green-800 font-bold rounded p-1.5 text-xs"
                                value={newItemInput.unitPrice}
                                onChange={(e) => {
                                    const unitPrice = Number(e.target.value);
                                    const cost = newItemInput.unitCost || 0;
                                    setNewItemInput({ ...newItemInput, unitPrice, margin: Number((cost > 0 ? ((unitPrice - cost) / cost) * 100 : 0).toFixed(2)) });
                                }} />
                        </div>
                        <div className="col-span-1">
                            <button type="button" onClick={handleAdd}
                                className="w-full bg-blue-600 text-white rounded p-1.5 text-xs font-medium hover:bg-blue-700 h-[28px] mt-auto">
                                Add
                            </button>
                        </div>
                    </>
                )}
            </div>
            </div>

            {/* License multi-year section */}
            {isLicense && (
                <div className="mt-2 border border-purple-200 bg-purple-50/60 rounded-lg p-3">
                    <div className="flex items-center gap-3 mb-3">
                        <label className="text-xs font-bold text-purple-800">Number of years:</label>
                        <input type="number" min="1" max="15" value={licenseRows.length}
                            onChange={(e) => handleNumYearsChange(Number(e.target.value))}
                            className="w-16 border border-purple-300 rounded p-1 text-xs text-center font-bold text-purple-800 bg-white" />
                        <span className="text-xs text-purple-600">license year(s)</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse min-w-[520px]">
                            <thead>
                                <tr className="bg-purple-100 text-purple-700">
                                    <th className="p-2 text-center font-semibold w-20">Year</th>
                                    <th className="p-2 text-right font-semibold">Vendor Price ($)</th>
                                    <th className="p-2 text-right font-semibold w-20">Margin %</th>
                                    <th className="p-2 text-right font-semibold text-green-700">Sell Price ($)</th>
                                    <th className="p-2 text-left font-semibold">Billing Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-purple-100">
                                {licenseRows.map((row, idx) => (
                                    <tr key={idx} className="bg-white">
                                        <td className="p-1.5">
                                            <input type="number" min="2020" max="2099" value={row.year}
                                                className="w-full border border-purple-200 rounded p-1 text-center text-xs font-bold text-purple-800"
                                                onChange={(e) => handleRowChange(idx, 'year', Number(e.target.value))} />
                                        </td>
                                        <td className="p-1.5">
                                            <input type="number" min="0" value={row.unitCost}
                                                className="w-full border border-gray-200 rounded p-1 text-right text-xs bg-gray-50"
                                                onChange={(e) => handleRowChange(idx, 'unitCost', Number(e.target.value))} />
                                        </td>
                                        <td className="p-1.5">
                                            <input type="number" min="0" value={row.margin}
                                                className="w-full border border-gray-200 rounded p-1 text-right text-xs"
                                                onChange={(e) => handleRowChange(idx, 'margin', Number(e.target.value))} />
                                        </td>
                                        <td className="p-1.5">
                                            <input type="number" min="0" value={row.unitPrice}
                                                className="w-full border border-green-200 rounded p-1 text-right text-xs font-bold text-green-700 bg-green-50"
                                                onChange={(e) => handleRowChange(idx, 'unitPrice', Number(e.target.value))} />
                                        </td>
                                        <td className="p-1.5">
                                            <input type="date" value={row.billingDate}
                                                className="w-full border border-gray-200 rounded p-1 text-xs"
                                                onChange={(e) => handleRowChange(idx, 'billingDate', e.target.value)} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t-2 border-purple-200">
                                <tr className="bg-purple-100 font-bold text-purple-900 text-xs">
                                    <td className="p-2">{licenseRows.length} year(s)</td>
                                    <td className="p-2 text-right">${licenseRows.reduce((s, r) => s + r.unitCost, 0).toLocaleString()}</td>
                                    <td></td>
                                    <td className="p-2 text-right text-green-700">${licenseRows.reduce((s, r) => s + r.unitPrice, 0).toLocaleString()}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <button type="button" onClick={handleAdd}
                        className="mt-3 w-full bg-purple-600 text-white rounded p-2 text-xs font-bold hover:bg-purple-700 transition">
                        + Add {licenseRows.length} license year(s)
                    </button>
                </div>
            )}
        </div>
    );
};

// Shared Items Table with Inline Editing
const ItemsTable = ({ items, onDelete, onUpdate }: { items: LineItem[], onDelete: (id: string) => void, onUpdate?: (item: LineItem) => void }) => {
    
    const handleChange = (id: string, field: keyof LineItem, value: string | number) => {
        if (!onUpdate) return;
        const item = items.find(i => i.id === id);
        if (!item) return;

        // Create new item with updated value
        let newItem = { ...item, [field]: value };
        
        // Recalculate Logic
        if (field === 'unitCost' || field === 'margin' || field === 'quantity') {
             const numValue = Number(value);
             const cost = field === 'unitCost' ? numValue : newItem.unitCost;
             const margin = field === 'margin' ? numValue : newItem.margin;
             const qty = field === 'quantity' ? numValue : newItem.quantity;

             // Formula: Selling Price = Cost * (1 + Margin/100)
             const unitPrice = cost * (1 + (margin / 100));

             newItem.unitCost = cost;
             newItem.margin = margin;
             newItem.quantity = qty;
             newItem.unitPrice = Number(unitPrice.toFixed(2));
             newItem.total = qty * newItem.unitPrice;
        } else if (field === 'unitPrice') {
             // Back-calculate margin from sell price
             const unitPrice = Number(value);
             const cost = newItem.unitCost;
             const margin = cost > 0 ? ((unitPrice - cost) / cost) * 100 : 0;
             newItem.unitPrice = Number(unitPrice.toFixed(2));
             newItem.margin = Number(margin.toFixed(2));
             newItem.total = newItem.quantity * newItem.unitPrice;
        }
        
        onUpdate(newItem);
    };

    return (
        <div className="bg-white rounded border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-gray-100 text-gray-500 text-xs">
                    <tr>
                        <th className="px-3 py-2 text-left">Category</th>
                        <th className="px-3 py-2 text-left w-64">Description</th>
                        <th className="px-3 py-2 text-right w-16">Qty/Hrs</th>
                        <th className="px-3 py-2 text-right w-24">Cost</th>
                        <th className="px-3 py-2 text-right w-20">Margin %</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">Sell Price</th>
                        <th className="px-3 py-2 text-right font-bold text-blue-700">Total</th>
                        <th className="px-3 py-2 text-center w-16 text-purple-700 font-bold">Year</th>
                        <th className="px-3 py-2"></th>
                    </tr>
                </thead>
                <tbody>
                    {items.length > 0 ? items.map(item => (
                        <tr key={item.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 align-top">
                            <td className="px-3 py-2 text-gray-600 text-xs pt-3">{SKU_CATEGORIES.find(c => c.key === item.category)?.label}</td>
                            <td className="px-3 py-2">
                                {onUpdate ? (
                                    <textarea 
                                        className="w-full bg-transparent border border-transparent focus:border-blue-300 rounded p-1 text-xs text-gray-800 resize-y focus:bg-white min-h-[32px]"
                                        value={item.description}
                                        onChange={(e) => handleChange(item.id, 'description', e.target.value)}
                                        rows={1}
                                    />
                                ) : (
                                    <div className="text-gray-800 text-xs py-1 whitespace-pre-wrap">{item.description}</div>
                                )}
                            </td>
                            
                            {/* Editable Quantity */}
                            <td className="px-3 py-2 text-right pt-3">
                                {onUpdate ? (
                                    <input 
                                        type="number" 
                                        min="1"
                                        className="w-full text-right bg-transparent border-b border-gray-200 focus:border-blue-500 focus:outline-none p-1 text-xs"
                                        value={item.quantity}
                                        onChange={(e) => handleChange(item.id, 'quantity', Number(e.target.value))}
                                    />
                                ) : (
                                    item.quantity
                                )}
                            </td>

                            {/* Editable Cost */}
                            <td className="px-3 py-2 text-right text-xs pt-3">
                                {onUpdate ? (
                                    <input 
                                        type="number" 
                                        min="0"
                                        className="w-full text-right bg-transparent border-b border-gray-200 focus:border-blue-500 focus:outline-none p-1 text-xs text-gray-500"
                                        value={item.unitCost}
                                        onChange={(e) => handleChange(item.id, 'unitCost', Number(e.target.value))}
                                    />
                                ) : (
                                    `$${item.unitCost?.toLocaleString() || 0}`
                                )}
                            </td>

                            {/* Editable Margin */}
                            <td className="px-3 py-2 text-right text-xs pt-3">
                                {onUpdate ? (
                                    <input 
                                        type="number" 
                                        className="w-full text-right bg-transparent border-b border-gray-200 focus:border-blue-500 focus:outline-none p-1 text-xs text-gray-500"
                                        value={item.margin}
                                        onChange={(e) => handleChange(item.id, 'margin', Number(e.target.value))}
                                    />
                                ) : (
                                    `${item.margin || 0}%`
                                )}
                            </td>

                            <td className="px-3 py-2 text-right text-xs pt-3">
                                {onUpdate ? (
                                    <input
                                        type="number"
                                        min="0"
                                        className="w-full text-right bg-transparent border-b border-green-300 focus:border-green-600 focus:outline-none p-1 text-xs text-green-700 font-bold"
                                        value={item.unitPrice}
                                        onChange={(e) => handleChange(item.id, 'unitPrice', Number(e.target.value))}
                                    />
                                ) : (
                                    <span className="text-gray-700 font-medium">${item.unitPrice.toLocaleString()}</span>
                                )}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-blue-600 text-xs pt-3">${item.total.toLocaleString()}</td>
                            <td className="px-3 py-2 text-center text-xs pt-3">
                                {item.category === 'license' ? (
                                    onUpdate ? (
                                        <input
                                            type="number"
                                            min="2020"
                                            max="2099"
                                            placeholder={String(new Date().getFullYear())}
                                            className="w-16 text-center bg-transparent border-b border-purple-300 focus:border-purple-600 focus:outline-none p-1 text-xs text-purple-700 font-semibold"
                                            value={item.licenseYear ?? ''}
                                            onChange={(e) => handleChange(item.id, 'licenseYear', e.target.value === '' ? '' : Number(e.target.value))}
                                        />
                                    ) : (
                                        <span className="text-purple-700 font-semibold">{item.licenseYear ?? '—'}</span>
                                    )
                                ) : (
                                    <span className="text-gray-300">—</span>
                                )}
                            </td>
                            <td className="px-3 py-2 text-center pt-3">
                                <button
                                    type="button"
                                    onClick={() => onDelete(item.id)}
                                    className="text-red-300 hover:text-red-500"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </td>
                        </tr>
                    )) : (
                        <tr><td colSpan={9} className="text-center py-4 text-gray-400 text-xs italic">No items added.</td></tr>
                    )}
                    {items.length > 0 && (() => {
                        const totalRevenue = calculateTotalValue(items);
                        const totalCost = items.reduce((s, i) => s + (i.unitCost * i.quantity), 0);
                        const totalProfit = totalRevenue - totalCost;
                        return (
                            <>
                                <tr className="bg-gray-50 font-bold border-t border-gray-200 text-xs">
                                    <td colSpan={3} className="px-3 py-1.5 text-right text-gray-500 font-normal">Total Cost:</td>
                                    <td className="px-3 py-1.5 text-right text-gray-600">${totalCost.toLocaleString()}</td>
                                    <td colSpan={5}></td>
                                </tr>
                                <tr className="bg-gray-50 font-bold border-t border-gray-100 text-xs">
                                    <td colSpan={3} className="px-3 py-1.5 text-right text-gray-500 font-normal">Margin:</td>
                                    <td className="px-3 py-1.5 text-right text-emerald-600">${totalProfit.toLocaleString()}</td>
                                    <td colSpan={5}></td>
                                </tr>
                                <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                                    <td colSpan={6} className="px-3 py-2 text-right text-gray-700">Total Deal Value:</td>
                                    <td className="px-3 py-2 text-right text-blue-700 text-lg">${totalRevenue.toLocaleString()}</td>
                                    <td colSpan={2}></td>
                                </tr>
                            </>
                        );
                    })()}
                </tbody>
            </table>
        </div>
    );
};

interface ServiceAllocation {
    id: string;
    userId: string;
    consultantName: string;
    hours: number;
    rate: number;
    cost: number;
}

export const CRMPipeline: React.FC<CRMPipelineProps> = ({ leads, templates, skuCatalog, transactions, updateLead, onAddLead, onImportLeads, onDeleteLead, onRestoreLead, onPermanentDeleteLead, onConvertToProject, onAddTransaction, onAddPreSalesLog, users, currentUser, contacts = [], onAddContact, pipelines = [] }) => {
  const [activePipelineId, setActivePipelineId] = useState<string>('all');
  const [showProposalPrint, setShowProposalPrint] = useState(false);
  const [showVeracodeWizard, setShowVeracodeWizard] = useState(false);
  const [generatingDriveProposal, setGeneratingDriveProposal] = useState(false);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [editedLead, setEditedLead] = useState<Lead | null>(null); // Buffer state for edits
  const [isDirty, setIsDirty] = useState(false); // Track if changes are made

  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [interactionType, setInteractionType] = useState<'note' | 'email' | 'call' | 'meeting'>('note');
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'pipeline' | 'archive' | 'trash'>('pipeline');
  const [pipelineLayout, setPipelineLayout] = useState<'kanban' | 'table'>('kanban');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [pendingLostLead, setPendingLostLead] = useState<{ lead: Lead; stage: SalesStage } | null>(null);
  const [lostReason, setLostReason] = useState('');
  const [lostNote, setLostNote] = useState('');
  const [lostCompetitor, setLostCompetitor] = useState('');

  // Next Step form (in lead detail modal)
  const [nextStepText, setNextStepText] = useState('');
  const [nextStepDueDateInput, setNextStepDueDateInput] = useState('');

  // Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<{new: Lead[], updated: Lead[]} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter State
  const [selectedPartner, setSelectedPartner] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Lead Detail Tabs
  const [activeDetailTab, setActiveDetailTab] = useState<'info' | 'quote' | 'tasks' | 'history' | 'expenses' | 'hours' | 'activity' | 'costing'>('info');

  // Costing Review Modal
  const [showCostingReview, setShowCostingReview] = useState(false);
  const [isSavingCosting, setIsSavingCosting] = useState(false);

  // Costing System Guide
  const [showCostingGuide, setShowCostingGuide] = useState(false);

  // Mobile Kanban Stage Selector
  const [mobileStage, setMobileStage] = useState<SalesStage>('prospect');
  
  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
      isOpen: boolean;
      action: 'soft_delete' | 'hard_delete';
      leadId: string;
      leadName: string;
  }>({ isOpen: false, action: 'soft_delete', leadId: '', leadName: '' });

  // Project Conversion Modal State
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [leadToConvert, setLeadToConvert] = useState<Lead | null>(null);
  const [selectedConsultant, setSelectedConsultant] = useState(CONSULTANTS[0]);
  const [initialDeposit, setInitialDeposit] = useState<number>(0);
  const [wonReason, setWonReason] = useState<string>('');
  const [leadProposals, setLeadProposals] = useState<{ id: string; name: string; status: string; version: number; totalValue: number }[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<string>('');

  // Per-type project configuration
  type PerTypeConfig = {
    templateId: string;
    contractStartDate: string;
    contractEndDate: string;
    packHours: number;
    packStartDate: string;
    packEndDate: string;
  };
  const TODAY = new Date().toISOString().split('T')[0];
  const defaultPerTypeConfig = (): PerTypeConfig => ({
    templateId: '',
    contractStartDate: TODAY,
    contractEndDate: '',
    packHours: 0,
    packStartDate: TODAY,
    packEndDate: '',
  });

  const [detectedProjectTypes, setDetectedProjectTypes] = useState<ProjectType[]>(['implementation']);
  const [perTypeConfig, setPerTypeConfig] = useState<Record<string, PerTypeConfig>>({});
  const [hoursPackItems, setHoursPackItems] = useState<LineItem[]>([]);
  const [perItemConfig, setPerItemConfig] = useState<Record<string, PerTypeConfig>>({});

  const setTypeField = <K extends keyof PerTypeConfig>(type: ProjectType, field: K, value: PerTypeConfig[K]) =>
    setPerTypeConfig(prev => ({ ...prev, [type]: { ...prev[type], [field]: value } }));

  const setItemField = <K extends keyof PerTypeConfig>(itemId: string, field: K, value: PerTypeConfig[K]) =>
    setPerItemConfig(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));

  // Form State
  const [newLeadForm, setNewLeadForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    city: '',
    country: '', // New field
    role: '',
    description: '', // New Field
    projectName: '', // Veracode project name for Drive folder
    partnerName: '',
    manufacturer: '', // New field
    expectedCloseDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0], // Default +30 days
    partnerContactName: '',
    partnerContactPhone: '',
    partnerContactEmail: '',
    partnerContactRole: '',
  });
  const [newLeadErrors, setNewLeadErrors] = useState<NewLeadErrors>({});
  
  // NEW: State for Resource/Service Allocation in Lead Form with detailed Cost/Margin
  const [serviceForm, setServiceForm] = useState({
      userId: '',
      hours: 0,
      cost: 0, // Costo Hora Interno
      margin: 30, // Margen por defecto 30%
      rate: 0 // Precio Venta (Calculado)
  });
  
  // Array to hold multiple allocations before generating the single line item
  const [serviceAllocations, setServiceAllocations] = useState<ServiceAllocation[]>([]);
  
  const [saveAsContact, setSaveAsContact] = useState(false); // Checkbox state for new contact creation

  // Expense Form State (for adding expenses to a lead)
  const [newExpenseForm, setNewExpenseForm] = useState({
      title: '',
      amount: 0,
      category: 'other' as ExpenseCategory,
      date: new Date().toISOString().split('T')[0],
      description: ''
  });

  // Time Log Form State
  const [newTimeLogForm, setNewTimeLogForm] = useState({
      consultantName: users[0]?.name || '',
      hours: 0,
      date: new Date().toISOString().split('T')[0],
      description: ''
  });

  // New Task Form State
  const [newTaskForm, setNewTaskForm] = useState({
      title: '',
      dueDate: new Date().toISOString().split('T')[0],
      priority: 'medium' as 'low'|'medium'|'high',
      assignee: ''
  });

  // Line Items State for New Lead
  const [newLeadItems, setNewLeadItems] = useState<LineItem[]>([]);
  
  // Item Input State (Shared for New Lead & Edit Lead)
  const [newItemInput, setNewItemInput] = useState<Partial<LineItem>>({
      category: 'license',
      description: '',
      quantity: 1,
      unitCost: 0,
      margin: 20, // Default 20% margin
      unitPrice: 0 // Calculated
  });

  // Unique Partners for Filter
  const uniquePartners = useMemo(() => {
      const partners = new Set<string>();
      leads.forEach(l => {
          if (l.partnerName && l.partnerName.trim() !== '') {
              partners.add(l.partnerName);
          }
      });
      return Array.from(partners).sort();
  }, [leads]);

  // Available years derived from all leads (for the year selector)
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(new Date().getFullYear());
    leads.forEach(l => {
      if (l.expectedCloseDate) {
        const y = new Date(l.expectedCloseDate).getFullYear();
        if (!isNaN(y)) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [leads]);

  // Filtered Leads
  const activeLeads = leads.filter(l => {
    if (l.deleted) return false;
    if (selectedPartner !== 'all' && l.partnerName !== selectedPartner) return false;
    if (activePipelineId !== 'all' && l.pipelineId !== activePipelineId) return false;
    const closeYear = l.expectedCloseDate ? new Date(l.expectedCloseDate).getFullYear() : null;
    return closeYear === selectedYear;
  });
  const deletedLeads = leads.filter(l => {
    if (!l.deleted) return false;
    if (selectedPartner !== 'all' && l.partnerName !== selectedPartner) return false;
    const closeYear = l.expectedCloseDate ? new Date(l.expectedCloseDate).getFullYear() : null;
    return closeYear === selectedYear;
  });

  // Calculate Selling Price whenever Cost or Margin changes in the ADD FORM
  useEffect(() => {
    fetch('/api/email-templates', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setEmailTemplates)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const cost = Number(newItemInput.unitCost) || 0;
    const margin = Number(newItemInput.margin) || 0;
    // Formula: Cost * (1 + Margin/100)
    const sellingPrice = cost * (1 + (margin / 100));
    setNewItemInput(prev => ({ ...prev, unitPrice: Number(sellingPrice.toFixed(2)) }));
  }, [newItemInput.unitCost, newItemInput.margin]);


  // NOTE: calculateTotalValue, handleSKUSelection logic has been moved to ItemInputRow component or helper

  const handleSelectContact = (contactId: string) => {
      const selected = contacts.find(c => c.id === contactId);
      if (selected) {
          setNewLeadForm(prev => ({
              ...prev,
              companyName: selected.companyName || prev.companyName,
              contactName: selected.name,
              email: selected.email,
              phone: selected.phone,
              role: selected.role
          }));
      }
  };

  // Helper to re-calculate the single "Professional Services" line item based on multiple allocations
  const syncServiceLineItem = (allocations: ServiceAllocation[]) => {
      if (allocations.length === 0) {
          // If no allocations, remove the service line item if it exists
          setNewLeadItems(prev => prev.filter(i => i.id !== 'consolidated-services'));
          return;
      }

      // Calculate aggregated values
      const totalHours = allocations.reduce((sum, a) => sum + a.hours, 0);
      const totalRevenue = allocations.reduce((sum, a) => sum + (a.hours * a.rate), 0);
      const totalCost = allocations.reduce((sum, a) => sum + (a.hours * a.cost), 0);
      
      const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0; // Gross Margin %

      // Construct description
      const description = "Professional Services (Consolidated):\n" + 
          allocations.map(a => `- ${a.consultantName}: ${a.hours}hrs @ $${a.rate}/hr`).join("\n");

      // Create/Update the single line item
      const lineItem: LineItem = {
          id: 'consolidated-services', // Fixed ID to enforce singleton pattern
          category: 'implementation',
          description: description,
          quantity: 1, // Treat as 1 Service Package
          unitCost: totalCost,
          margin: Number(margin.toFixed(2)),
          unitPrice: totalRevenue,
          total: totalRevenue
      };

      setNewLeadItems(prev => {
          const otherItems = prev.filter(i => i.id !== 'consolidated-services');
          return [...otherItems, lineItem];
      });
  };

  const handleServiceUserChange = (userId: string) => {
      const user = users.find(u => u.id === userId);
      const cost = user?.hourlyCost || 0;
      // Recalculate rate based on current margin state
      const rate = cost * (1 + (serviceForm.margin / 100));
      
      setServiceForm(prev => ({
          ...prev,
          userId,
          cost,
          rate: Number(rate.toFixed(2))
      }));
  };

  const handleServiceCostChange = (newCost: number) => {
      const rate = newCost * (1 + (serviceForm.margin / 100));
      setServiceForm(prev => ({
          ...prev,
          cost: newCost,
          rate: Number(rate.toFixed(2))
      }));
  };

  const handleServiceMarginChange = (newMargin: number) => {
      const rate = serviceForm.cost * (1 + (newMargin / 100));
      setServiceForm(prev => ({
          ...prev,
          margin: newMargin,
          rate: Number(rate.toFixed(2))
      }));
  };

  const handleServiceRateChange = (newRate: number) => {
      // If Cost is 0, avoid division by zero or negative logic, just set rate
      let newMargin = 0;
      if (serviceForm.cost > 0) {
          newMargin = ((newRate / serviceForm.cost) - 1) * 100;
      }
      setServiceForm(prev => ({
          ...prev,
          rate: newRate,
          margin: Number(newMargin.toFixed(2))
      }));
  };

  const handleAddAllocationToForm = () => {
      const user = users.find(u => u.id === serviceForm.userId);
      if(!user || serviceForm.hours <= 0 || serviceForm.rate < 0) return;

      const newAllocation: ServiceAllocation = {
          id: `alloc_${Date.now()}`,
          userId: user.id,
          consultantName: user.name,
          hours: Number(serviceForm.hours),
          rate: Number(serviceForm.rate),
          cost: Number(serviceForm.cost) // Use the edited cost from form, not just default user cost
      };

      const updatedAllocations = [...serviceAllocations, newAllocation];
      setServiceAllocations(updatedAllocations);
      
      // Trigger the sync to main items
      syncServiceLineItem(updatedAllocations);

      // Reset form but keep margin/cost settings potentially
      setServiceForm({ ...serviceForm, userId: '', hours: 0 });
  };

  const handleRemoveAllocation = (allocId: string) => {
      const updatedAllocations = serviceAllocations.filter(a => a.id !== allocId);
      setServiceAllocations(updatedAllocations);
      syncServiceLineItem(updatedAllocations);
  };

  const handleAddItemToForm = (items: LineItem[]) => {
      setNewLeadItems(prev => [...prev, ...items]);
  };

  const handleUpdateItemInNewForm = (updatedItem: LineItem) => {
      setNewLeadItems(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
  };

  const handleRemoveItemFromForm = (id: string) => {
      setNewLeadItems(newLeadItems.filter(i => i.id !== id));
      
      // If the user manually removes the consolidated item from the main table, we should clear the allocations too
      if (id === 'consolidated-services') {
          setServiceAllocations([]);
      }
  };

  const handleStageChange = (lead: Lead, newStage: SalesStage) => {
    // Intercept closed-lost to collect loss reason first
    if (newStage === 'closed-lost') {
        setLostReason('');
        setLostNote('');
        setLostCompetitor('');
        setPendingLostLead({ lead, stage: newStage });
        return;
    }

    const stageConfig = STAGE_CONFIG.find(s => s.key === newStage);
    const newProb = stageConfig ? stageConfig.probability : lead.probability;

    const updatedLead = {
        ...lead,
        stage: newStage,
        probability: newProb
    };

    if (newStage === 'closed-won') {
        if (!updatedLead.closedValue) updatedLead.closedValue = updatedLead.value;
    }

    updateLead(updatedLead);

    if (newStage === 'closed-won') {
        const types = detectProjectTypes(updatedLead.items);
        setDetectedProjectTypes(types);
        setPerTypeConfig(Object.fromEntries(types.map(t => [t, defaultPerTypeConfig()])) as Record<string, PerTypeConfig>);
        // Extract individual hours_pack items
        const hpItems = (updatedLead.items || []).filter(i => i.category === 'hours_pack');
        setHoursPackItems(hpItems);
        setPerItemConfig(Object.fromEntries(hpItems.map(i => [i.id, defaultPerTypeConfig()])) as Record<string, PerTypeConfig>);
        setLeadToConvert(updatedLead);
        setInitialDeposit(0);
        setSelectedProposalId('');
        // Load saved proposals for this lead
        fetch(`/api/proposals?leadId=${updatedLead.id}`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : [])
            .then(list => setLeadProposals(list))
            .catch(() => setLeadProposals([]));
        setShowConvertModal(true);
    }
  };

  const confirmLostStageChange = () => {
    if (!pendingLostLead) return;
    const { lead } = pendingLostLead;
    const stageConfig = STAGE_CONFIG.find(s => s.key === 'closed-lost');
    updateLead({
        ...lead,
        stage: 'closed-lost',
        probability: stageConfig?.probability ?? 0,
        lostReason,
        lostNote,
        competitor: lostCompetitor,
    } as Lead);
    setPendingLostLead(null);
  };

  // Drag & Drop — 8px distance threshold so normal clicks still work
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const draggedLead = activeLeads.find(l => l.id === active.id);
    const targetStage = STAGE_CONFIG.find(s => s.key === over.id);
    if (draggedLead && targetStage && draggedLead.stage !== targetStage.key) {
        handleStageChange(draggedLead, targetStage.key as SalesStage);
    }
  };

  // Trigger Deletion (Opens Modal)
  const requestDelete = (lead: Lead, action: 'soft_delete' | 'hard_delete') => {
      setConfirmModal({
          isOpen: true,
          action: action,
          leadId: lead.id,
          leadName: lead.companyName
      });
  };

  // Execute Deletion (Confirmed)
  const executeDelete = () => {
      if (confirmModal.action === 'soft_delete') {
          onDeleteLead(confirmModal.leadId);
          setActiveLead(null); // Close detail modal if open
      } else {
          onPermanentDeleteLead(confirmModal.leadId);
      }
      setConfirmModal({ ...confirmModal, isOpen: false });
  };

  const confirmConversion = () => {
    if (!leadToConvert) return;

    // FIX #3: Warning — costing incomplete check (Approach A: warning, not blocking)
    const unconstedItems = leadToConvert.items?.filter(
      item => (item as any).unitCost === undefined || (item as any).unitCost === null || (item as any).unitCost === 0
    ) ?? [];
    if (unconstedItems.length > 0) {
      const proceed = window.confirm(
        `⚠️ ${unconstedItems.length} ítem(s) sin costo base definido.\n` +
        `El ProjectBudget quedará incompleto.\n\n` +
        `¿Convertir de todos modos? Finance revisará después.`
      );
      if (!proceed) return;
      // TODO: Auditar esta conversión sin costing completo en audit log
    }

    // Validate per-type required fields
    for (const type of detectedProjectTypes) {
      if (type === 'hours_pack') {
        // For hours_pack: validate each individual item
        for (const item of hoursPackItems) {
          const cfg = perItemConfig[item.id];
          if (!cfg.packHours || !cfg.packEndDate) {
            alert(`Please enter hours and end date for Hours Pack: ${item.description}`);
            return;
          }
        }
      } else {
        const cfg = perTypeConfig[type];
        if (type === 'support' && !cfg.contractEndDate) {
          alert('Please enter the contract end date for the Support contract.');
          return;
        }
      }
    }

    // Create projects: 1 per hours_pack item, 1 per other type
    let depositUsed = false;

    // Hours Pack: create 1 project per item (without deposit — each uses its own value)
    if (detectedProjectTypes.includes('hours_pack')) {
      // Use items from leadToConvert directly (not from state which may be stale)
      const hpItemsToConvert = (leadToConvert.items || []).filter(i => i.category === 'hours_pack');
      hpItemsToConvert.forEach((item) => {
        const cfg = perItemConfig[item.id];
        // Hours pack items never get the deposit — they use their full item value
        onConvertToProject(
          leadToConvert,
          selectedConsultant,
          'hours_pack',
          cfg.templateId || undefined,
          0,  // ← No deposit for hours_pack items, they use sourceItem.total
          cfg.packStartDate,
          cfg.packEndDate,
          cfg.packHours,
          item,  // ← Pass the LineItem so the project can use its name and value
        );
      });
    }

    // Other types: create 1 project per type (with deposit on first if applicable)
    detectedProjectTypes
      .filter(t => t !== 'hours_pack')
      .forEach((type, idx) => {
        const cfg = perTypeConfig[type];
        const deposit = !depositUsed && idx === 0 ? initialDeposit : 0;
        if (deposit > 0) depositUsed = true;
        onConvertToProject(
          leadToConvert,
          selectedConsultant,
          type,
          cfg.templateId || undefined,
          deposit,
          type === 'support' ? cfg.contractStartDate : undefined,
          type === 'support' ? cfg.contractEndDate : undefined,
          undefined,
        );
      });

    if (wonReason) updateLead({ ...leadToConvert, wonReason });
    if (selectedProposalId) {
      fetch(`/api/proposals/${selectedProposalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'accepted' }),
      }).catch(() => {});
    }

    setShowConvertModal(false);
    setLeadToConvert(null);
    setWonReason('');
    setInitialDeposit(0);
    setLeadProposals([]);
    setSelectedProposalId('');
    setDetectedProjectTypes(['implementation']);
    setPerTypeConfig({});
    setHoursPackItems([]);
    setPerItemConfig({});
  };

  const handleGenerateDriveProposal = async () => {
      if (!activeLead) return;
      if (!activeLead.country || !activeLead.companyName) {
          alert('El lead debe tener País y Nombre de Empresa antes de generar la propuesta en Drive.');
          return;
      }
      setGeneratingDriveProposal(true);
      try {
          const res = await fetch('/api/proposals/generate-technical', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ leadId: activeLead.id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error al generar propuesta');
          const openDrive = window.confirm(
              `✅ Propuesta Técnica v${data.version} creada en Google Drive.\n\n¿Abrir el documento ahora?`
          );
          if (openDrive) window.open(data.driveFileUrl, '_blank');
      } catch (err: any) {
          alert(`Error: ${err.message}`);
      } finally {
          setGeneratingDriveProposal(false);
      }
  };

  const handleLocalInfoChange = (field: keyof Lead, value: any) => {
      if (!editedLead) return;
      setEditedLead({ ...editedLead, [field]: value });
      setIsDirty(true);
  };

  const handleSaveChanges = () => {
      if (!editedLead) return;
      // For closed-won/delivered leads: if the user didn't explicitly set closedValue
      // (or it's outdated vs value), keep them in sync so Profitability reflects the right number
      const isClosedStage = editedLead.stage === 'closed-won' || editedLead.stage === 'project-delivered';
      const toSave = (isClosedStage && !editedLead.closedValue)
          ? { ...editedLead, closedValue: editedLead.value }
          : editedLead;
      updateLead(toSave);
      setActiveLead(toSave);
      setEditedLead(toSave);
      setIsDirty(false);
  };

  const handleDiscardChanges = () => {
      if (!activeLead) return;
      setEditedLead({ ...activeLead });
      setIsDirty(false);
  };

  const handleCloseModal = () => {
      if (isDirty && !window.confirm('You have unsaved changes. Discard and close?')) return;
      setActiveLead(null);
      setIsDirty(false);
  };

  const handleReactivateLead = (lead: Lead) => {
      if(window.confirm('Reactivate this opportunity? It will be moved to Prospect stage.')) {
          const updatedLead: Lead = {
              ...lead,
              stage: 'prospect',
              probability: 10
          };
          updateLead(updatedLead);
      }
  };

  const handleAddNote = () => {
    if (!activeLead || !noteText.trim()) return;

    const newInteraction: Interaction = {
        id: Date.now().toString(),
        type: interactionType,
        date: new Date().toISOString(),
        notes: noteText
    };

    const updatedLead = {
        ...activeLead,
        interactions: [newInteraction, ...activeLead.interactions]
    };

    updateLead(updatedLead);
    setActiveLead(updatedLead); // Update local state to show immediately
    setEditedLead(updatedLead); // Keep edit sync
    setNoteText('');
  };

  const handleAddTaskToLead = (e: React.FormEvent) => {
      e.preventDefault();
      if(!activeLead) return;

      const newTask: Task = {
          id: `tsk_${Date.now()}`,
          title: newTaskForm.title,
          assignee: newTaskForm.assignee || 'Unassigned',
          status: 'todo',
          estimatedHours: 0,
          loggedHours: 0,
          dueDate: newTaskForm.dueDate,
          priority: newTaskForm.priority,
          type: 'todo',
          subtasks: []
      };

      const updatedLead = {
          ...activeLead,
          tasks: [...(activeLead.tasks || []), newTask]
      };

      updateLead(updatedLead);
      setActiveLead(updatedLead);
      setEditedLead(updatedLead);
      setNewTaskForm({ title: '', dueDate: new Date().toISOString().split('T')[0], priority: 'medium', assignee: '' });
  };

  const handleToggleTaskStatus = (taskId: string) => {
      if(!activeLead || !activeLead.tasks) return;
      
      const updatedTasks = activeLead.tasks.map(t => {
          if (t.id === taskId) {
              return { ...t, status: (t.status === 'done' ? 'todo' : 'done') as 'todo'|'done' };
          }
          return t;
      });

      const updatedLead = { ...activeLead, tasks: updatedTasks };
      updateLead(updatedLead);
      setActiveLead(updatedLead);
      setEditedLead(updatedLead);
  };

  const handleAddExpenseToLead = (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeLead) return;

      const transaction: Transaction = {
          id: `tx_lead_${Date.now()}`,
          title: newExpenseForm.title,
          amount: Number(newExpenseForm.amount),
          category: newExpenseForm.category,
          date: newExpenseForm.date,
          description: newExpenseForm.description,
          type: 'expense',
          leadId: activeLead.id // Link to this lead
      };

      onAddTransaction(transaction);
      
      // Reset form
      setNewExpenseForm({
          title: '',
          amount: 0,
          category: 'other',
          date: new Date().toISOString().split('T')[0],
          description: ''
      });
  };

  const handleAddTimeLogToLead = (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeLead) return;

      // Find user to get rate if available, though cost calculation happens later in aggregation usually. 
      // For now we just store the log.
      const user = users.find(u => u.name === newTimeLogForm.consultantName);
      const rate = user?.hourlyCost || 0;

      const log: TimeLog = {
          id: `log_lead_${Date.now()}`,
          leadId: activeLead.id,
          consultantName: newTimeLogForm.consultantName,
          hours: Number(newTimeLogForm.hours),
          date: newTimeLogForm.date,
          description: newTimeLogForm.description,
          status: 'pending',
          approvedRate: rate,
          approvedCost: Number(newTimeLogForm.hours) * rate
      };

      onAddPreSalesLog(activeLead.id, log);
      
      // Update local activeLead state instantly to reflect UI change
      const updatedLead = {
          ...activeLead,
          preSalesTimeLogs: [...(activeLead.preSalesTimeLogs || []), log]
      };
      
      setActiveLead(updatedLead);
      setEditedLead(updatedLead);

      // Reset form
      setNewTimeLogForm({
          consultantName: users[0]?.name || '',
          hours: 0,
          date: new Date().toISOString().split('T')[0],
          description: ''
      });
  };

  const handleSaveCostingItems = async (items: any[]) => {
    if (!activeLead) return;
    setIsSavingCosting(true);
    try {
      const response = await fetch(`/api/leads/${activeLead.id}/costing-items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save costing items');
      const { lead } = data;
      setActiveLead(lead);
      setEditedLead(lead);
      updateLead(lead);  // Sync to parent App component
    } finally {
      setIsSavingCosting(false);
    }
  };

  const handleReviewCosting = async (approvedBy: string, comment: string) => {
    if (!activeLead) return;
    setIsSavingCosting(true);
    try {
      const response = await fetch(`/api/leads/${activeLead.id}/costing-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy, comment })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to approve costing');
      const { lead } = data;
      setActiveLead(lead);
      setEditedLead(lead);
      updateLead(lead);  // Update parent App component's leads array with budgetedCost
      setShowCostingReview(false);
    } catch (err: any) {
      throw err;
    } finally {
      setIsSavingCosting(false);
    }
  };

  const handleSubmitNewLead = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = NewLeadSchema.safeParse(newLeadForm);
    if (!validation.success) {
      const errs: NewLeadErrors = {};
      validation.error.issues.forEach(issue => {
        const field = issue.path[0] as keyof NewLeadErrors;
        if (!errs[field]) errs[field] = issue.message;
      });
      setNewLeadErrors(errs);
      return;
    }
    setNewLeadErrors({});
    const lead: Lead = {
      id: Date.now().toString(),
      companyName: newLeadForm.companyName,
      contactName: newLeadForm.contactName,
      email: newLeadForm.email,
      phone: newLeadForm.phone,
      city: newLeadForm.city,
      country: newLeadForm.country, // New field
      role: newLeadForm.role,
      description: newLeadForm.description, // New field
      projectName: newLeadForm.projectName,
      partnerName: newLeadForm.partnerName,
      manufacturer: newLeadForm.manufacturer, // New field
      value: calculateTotalValue(newLeadItems),
      items: newLeadItems,
      stage: 'prospect',
      probability: 10,
      expectedCloseDate: newLeadForm.expectedCloseDate,
      interactions: [],
      documents: [],
      preSalesTimeLogs: [],
      tasks: [],
      deleted: false
    };

    onAddLead(lead);

    // Save client contact
    if (saveAsContact && onAddContact) {
        const exists = contacts.some(c => c.email === newLeadForm.email);
        if (!exists) {
            onAddContact({
                id: `cnt_${Date.now()}`,
                name: newLeadForm.contactName,
                email: newLeadForm.email,
                phone: newLeadForm.phone,
                role: newLeadForm.role,
                companyName: newLeadForm.companyName,
                lastContacted: new Date().toISOString(),
                type: 'client',
            });
        }
    }

    // Save partner contact if partner name provided
    if (newLeadForm.partnerContactName.trim() && onAddContact) {
        const exists = contacts.some(c => c.email === newLeadForm.partnerContactEmail && c.type === 'partner');
        if (!exists) {
            onAddContact({
                id: `cnt_partner_${Date.now()}`,
                name: newLeadForm.partnerContactName,
                email: newLeadForm.partnerContactEmail,
                phone: newLeadForm.partnerContactPhone,
                role: newLeadForm.partnerContactRole,
                companyName: newLeadForm.partnerName,
                lastContacted: new Date().toISOString(),
                type: 'partner',
            });
        }
    }

    alert('New opportunity created successfully!');

    setShowNewLeadModal(false);
    setNewLeadForm({
        companyName: '', contactName: '', email: '', phone: '', city: '', country: '', role: '', description: '', projectName: '', partnerName: '', manufacturer: '',
        expectedCloseDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0],
        partnerContactName: '', partnerContactPhone: '', partnerContactEmail: '', partnerContactRole: '',
    });
    setSaveAsContact(false);
    setNewLeadErrors({});
    setNewLeadItems([]);
    setNewItemInput({ category: 'license', description: '', quantity: 1, unitCost: 0, margin: 20, unitPrice: 0 });
    setServiceForm({ userId: '', hours: 0, cost: 0, margin: 30, rate: 0 });
    setServiceAllocations([]);
  };

  // Logic to add items to existing lead
  const handleAddItemToActiveLead = (items: LineItem[]) => {
      if (!activeLead) return;
      const updatedItems = [...activeLead.items, ...items];
      const updatedLead = {
          ...activeLead,
          items: updatedItems,
          value: calculateTotalValue(updatedItems)
      };
      updateLead(updatedLead);
      setActiveLead(updatedLead);
      setEditedLead(updatedLead);
      setNewItemInput({ category: 'license', description: '', quantity: 1, unitCost: 0, margin: 20, unitPrice: 0 });
  };

  // Logic to UPDATE existing item in active lead (Recalculate values)
  const handleUpdateItemInActiveLead = (updatedItem: LineItem) => {
      if (!activeLead) return;
      
      const updatedItems = activeLead.items.map(i => i.id === updatedItem.id ? updatedItem : i);
      const updatedLead = {
          ...activeLead,
          items: updatedItems,
          value: calculateTotalValue(updatedItems)
      };
      updateLead(updatedLead);
      setActiveLead(updatedLead);
      setEditedLead(updatedLead);
  };

  const handleRemoveItemFromActiveLead = (itemId: string) => {
      if (!activeLead) return;
      const updatedItems = activeLead.items.filter(i => i.id !== itemId);
      const updatedLead = {
          ...activeLead,
          items: updatedItems,
          value: calculateTotalValue(updatedItems)
      };
      updateLead(updatedLead);
      setActiveLead(updatedLead);
      setEditedLead(updatedLead);
  };

  // CSV Export Function
  const handleExportCSV = () => {
      if (activeLeads.length === 0) {
          alert('No leads to export in current view.');
          return;
      }

      // 1. Define Headers
      const headers = [
          "ID", "Company", "Contact Name", "Email", "Phone", "Role", 
          "City", "Country", "Partner", "Manufacturer", "Description", 
          "Stage", "Probability (%)", "Value", "Close Date"
      ];

      // 2. Map Rows
      const rows = activeLeads.map(lead => [
          lead.id,
          `"${(lead.companyName || '').replace(/"/g, '""')}"`, // Handle commas/quotes
          `"${(lead.contactName || '').replace(/"/g, '""')}"`,
          lead.email || '',
          lead.phone || '',
          `"${(lead.role || '').replace(/"/g, '""')}"`,
          `"${(lead.city || '').replace(/"/g, '""')}"`,
          `"${(lead.country || '').replace(/"/g, '""')}"`,
          `"${(lead.partnerName || '').replace(/"/g, '""')}"`,
          `"${(lead.manufacturer || '').replace(/"/g, '""')}"`,
          `"${(lead.description || '').replace(/"/g, '""')}"`,
          lead.stage,
          lead.probability,
          lead.value,
          lead.expectedCloseDate
      ]);

      // 3. Construct CSV Content
      const csvContent = [
          headers.join(','), 
          ...rows.map(row => row.join(','))
      ].join('\n');

      // 4. Trigger Download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `pipeline_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // CSV Import Function - PHASE 1: Parse and Prepare
  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          const text = e.target?.result as string;
          if (!text) return;

          try {
              const lines = text.split('\n').filter(line => line.trim() !== '');
              // Assume row 0 is header: "ID", "Company", ...
              // We'll skip it and assume standard order from export
              
              const newLeadsToImport: Lead[] = [];
              const updatedLeadsToImport: Lead[] = [];

              for (let i = 1; i < lines.length; i++) {
                  const cols = parseCSVLine(lines[i]);
                  if (cols.length < 5) continue; // Skip malformed rows

                  const [
                      csvIdRaw, company, contactName, email, phone, role, 
                      city, country, partner, manufacturer, description, 
                      stage, probStr, valueStr, closeDate
                  ] = cols;

                  const csvId = csvIdRaw ? csvIdRaw.trim() : '';

                  // Check if ID exists in current leads to UPDATE instead of ADD
                  // Logic: If the ID is found in the system, we treat it as an update.
                  // If the ID is NOT found, but provided in CSV, we create a NEW lead with that ID (migrating data).
                  // If no ID is provided in CSV, we generate a new one.
                  const existingLead = leads.find(l => l.id === csvId);
                  
                  const finalId = existingLead ? existingLead.id : (csvId ? csvId : `imp_${Date.now()}_${i}`);
                  
                  const leadData: Lead = {
                      id: finalId,
                      companyName: company || 'Unknown Company',
                      contactName: contactName || 'Unknown Contact',
                      email: email || '',
                      phone: phone || '',
                      role: role || '',
                      city: city || '',
                      country: country || '',
                      partnerName: partner || '',
                      manufacturer: manufacturer || '',
                      description: description || '',
                      stage: (stage as SalesStage) || 'prospect',
                      probability: Number(probStr) || 10,
                      value: Number(valueStr) || 0,
                      expectedCloseDate: closeDate || new Date().toISOString().split('T')[0],
                      // Preserve existing complex arrays if updating, else init empty
                      items: existingLead ? existingLead.items : [],
                      interactions: existingLead ? existingLead.interactions : [],
                      documents: existingLead ? existingLead.documents : [],
                      preSalesTimeLogs: existingLead ? existingLead.preSalesTimeLogs : [],
                      tasks: existingLead ? existingLead.tasks : [],
                      deleted: false
                  };

                  if (existingLead) {
                      updatedLeadsToImport.push(leadData);
                  } else {
                      newLeadsToImport.push(leadData);
                  }
              }
              
              // Instead of executing immediately, set state and show confirmation modal
              setImportData({ new: newLeadsToImport, updated: updatedLeadsToImport });
              setShowImportModal(true);

          } catch (err) {
              console.error(err);
              alert('Error parsing CSV file. Please ensure format matches Export.');
          }
          
          // Reset input so onChange fires again if same file selected later
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
  };

  // Confirm Import Execution
  const handleConfirmImport = () => {
      if (importData) {
          onImportLeads(importData.new, importData.updated);
          setShowImportModal(false);
          setImportData(null);
      }
  };

  // ── Aging helpers ─────────────────────────────────────────────────────────
  const AGING_THRESHOLDS: Record<string, { yellow: number; red: number }> = {
    prospect:        { yellow: 7,  red: 14 },
    qualification:   { yellow: 10, red: 21 },
    presentation:    { yellow: 7,  red: 14 },
    proposal:        { yellow: 7,  red: 14 },
    negotiation:     { yellow: 5,  red: 10 },
    'closed-won':    { yellow: 30, red: 60 },
    'project-delivered': { yellow: 90, red: 180 },
    'closed-lost':   { yellow: 30, red: 60 },
  };

  const getDaysInStage = (lead: Lead): number => {
    if (lead.stageHistory && lead.stageHistory.length > 0) {
      const last = lead.stageHistory[lead.stageHistory.length - 1];
      if (!last.exitedAt) {
        return Math.floor((Date.now() - new Date(last.enteredAt).getTime()) / (1000 * 60 * 60 * 24));
      }
    }
    return 0;
  };

  const getAgingStatus = (lead: Lead): 'green' | 'yellow' | 'red' => {
    const days = getDaysInStage(lead);
    const t = AGING_THRESHOLDS[lead.stage] ?? { yellow: 14, red: 30 };
    if (days >= t.red) return 'red';
    if (days >= t.yellow) return 'yellow';
    return 'green';
  };

  const isRotten = (lead: Lead) => {
      if (lead.stage === 'closed-won' || lead.stage === 'closed-lost') return false;
      const today = new Date();
      today.setHours(0,0,0,0);
      const closeDate = new Date(lead.expectedCloseDate);
      return closeDate < today;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">Sales Pipeline</h2>
            <p className="text-sm text-gray-500">Manage opportunities from qualification to closure.</p>
        </div>
        <div className="flex gap-3">
             {/* Year Filter */}
             <div className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm h-[38px] overflow-hidden">
               <button
                 onClick={() => setSelectedYear(y => { const idx = availableYears.indexOf(y); return availableYears[Math.min(idx + 1, availableYears.length - 1)]; })}
                 className="px-2 h-full text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition"
               >‹</button>
               <span className="px-3 text-sm font-semibold text-blue-700 min-w-[52px] text-center">{selectedYear}</span>
               <button
                 onClick={() => setSelectedYear(y => { const idx = availableYears.indexOf(y); return availableYears[Math.max(idx - 1, 0)]; })}
                 className="px-2 h-full text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition"
               >›</button>
             </div>

             {/* Pipeline Filter */}
             {pipelines.length > 0 && (
               <div className="relative">
                 <select
                   className="appearance-none bg-white border border-gray-200 text-gray-700 py-2 pl-3 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-sm h-[38px]"
                   value={activePipelineId}
                   onChange={e => setActivePipelineId(e.target.value)}
                 >
                   <option value="all">All Pipelines</option>
                   {pipelines.map(p => (
                     <option key={p.id} value={p.id}>{p.name}</option>
                   ))}
                 </select>
               </div>
             )}

             {/* Partner Filter */}
             <div className="relative">
                 <select
                    className="appearance-none bg-white border border-gray-200 text-gray-700 py-2 pl-3 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-sm h-[38px]"
                    value={selectedPartner}
                    onChange={(e) => setSelectedPartner(e.target.value)}
                 >
                    <option value="all">All Partners</option>
                    {uniquePartners.map(p => (
                        <option key={p} value={p}>{p}</option>
                    ))}
                 </select>
                 <Filter size={14} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
             </div>

             {/* Layout Toggle (only on active pipeline) */}
             {viewMode === 'pipeline' && (
               <div className="bg-gray-100 p-1 rounded-lg flex text-sm h-[38px]">
                 <button
                   onClick={() => setPipelineLayout('kanban')}
                   className={`px-2 sm:px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${pipelineLayout === 'kanban' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                 >
                   <Layout size={14} />
                   <span className="hidden sm:inline">Kanban</span>
                 </button>
                 <button
                   onClick={() => setPipelineLayout('table')}
                   className={`px-2 sm:px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${pipelineLayout === 'table' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                 >
                   <Table2 size={14} />
                   <span className="hidden sm:inline">Table</span>
                 </button>
               </div>
             )}

             {/* View Toggle */}
             <div className="bg-gray-100 p-1 rounded-lg flex text-sm h-[38px]">
                <button
                  onClick={() => setViewMode('pipeline')}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition ${viewMode === 'pipeline' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Layout size={16} /> Active
                </button>
                 <button
                  onClick={() => setViewMode('archive')}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition ${viewMode === 'archive' ? 'bg-white shadow text-red-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Archive size={16} /> Lost
                </button>
                <button
                  onClick={() => setViewMode('trash')}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition ${viewMode === 'trash' ? 'bg-white shadow text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Trash2 size={16} /> Trash
                </button>
             </div>

            {/* Hidden File Input for Import */}
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".csv"
                onChange={handleImportCSV} 
            />

            {/* Import Button */}
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 transition flex items-center gap-2 shadow-sm h-[38px]"
                title="Import leads from CSV"
            >
                <Upload size={16} /> Import
            </button>

            {/* Export Button */}
            <button 
                onClick={handleExportCSV}
                className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 transition flex items-center gap-2 shadow-sm h-[38px]"
                title="Export current view to CSV"
            >
                <Download size={16} /> Export
            </button>

            <button 
            onClick={() => setShowNewLeadModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 shadow-sm h-[38px]"
            >
            <span>+</span> New Opportunity
            </button>
        </div>
      </div>

      {viewMode === 'pipeline' && pipelineLayout === 'table' ? (
        /* TABLE VIEW */
        <div className="flex-1 overflow-auto pb-4 relative">
          <PipelineTableView
            leads={activeLeads}
            onSelectLead={(lead) => {
              setActiveLead(lead);
              setEditedLead(JSON.parse(JSON.stringify(lead)));
              setIsDirty(false);
              setNextStepText(lead.nextStep || '');
              setNextStepDueDateInput(lead.nextStepDueDate || '');
              setActiveDetailTab('info');
            }}
            selectedIds={selectedLeadIds}
            onSelectionChange={setSelectedLeadIds}
          />
          {/* BULK ACTION BAR */}
          {selectedLeadIds.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-gray-700">
              <span className="text-sm font-semibold text-gray-300">{selectedLeadIds.length} selected</span>
              <div className="w-px h-5 bg-gray-600" />
              <select
                className="bg-gray-800 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-600 outline-none cursor-pointer hover:bg-gray-700"
                defaultValue=""
                onChange={async (e) => {
                  const stage = e.target.value;
                  if (!stage) return;
                  await fetch('/api/leads/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ids: selectedLeadIds, action: 'change_stage', payload: { stage } }) });
                  setSelectedLeadIds([]);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>Change stage…</option>
                {['prospect','qualification','presentation','proposal','negotiation','closed-won','closed-lost'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ')}</option>
                ))}
              </select>
              <select
                className="bg-gray-800 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-600 outline-none cursor-pointer hover:bg-gray-700"
                defaultValue=""
                onChange={async (e) => {
                  const userId = e.target.value;
                  if (!userId) return;
                  const user = users.find(u => u.id === userId);
                  await fetch('/api/leads/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ids: selectedLeadIds, action: 'assign_owner', payload: { assignedTo: userId, assignedToName: user?.name || '' } }) });
                  setSelectedLeadIds([]);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>Assign to…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button
                className="text-sm text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-gray-800 transition"
                onClick={async () => {
                  if (!confirm(`Delete ${selectedLeadIds.length} leads?`)) return;
                  await fetch('/api/leads/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ids: selectedLeadIds, action: 'delete' }) });
                  setSelectedLeadIds([]);
                }}
              >
                Delete
              </button>
              <button
                className="text-sm text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition"
                onClick={() => setSelectedLeadIds([])}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      ) : viewMode === 'pipeline' ? (
        /* KANBAN BOARD VIEW */
        <>
          {/* Mobile: Stage Selector + Vertical List */}
          <div className="md:hidden flex-1 flex flex-col pb-4">
            <select
              value={mobileStage}
              onChange={(e) => setMobileStage(e.target.value as SalesStage)}
              className="mb-3 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {STAGE_CONFIG.filter(s => s.key !== 'closed-lost').map(stage => (
                <option key={stage.key} value={stage.key}>
                  {stage.label} ({activeLeads.filter(l => l.stage === stage.key).length})
                </option>
              ))}
            </select>
            <div className="flex-1 overflow-y-auto space-y-3">
              {activeLeads
                .filter(l => l.stage === mobileStage)
                .map(lead => (
                  <div
                    key={lead.id}
                    onClick={() => {
                      setActiveLead(lead);
                      setEditedLead(JSON.parse(JSON.stringify(lead)));
                      setIsDirty(false);
                      setNextStepText(lead.nextStep || '');
                      setNextStepDueDateInput(lead.nextStepDueDate || '');
                      setActiveDetailTab('info');
                    }}
                    className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition cursor-pointer"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-semibold text-gray-800 text-sm">{lead.companyName}</h4>
                      <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">${lead.value?.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-gray-600 mb-2">{lead.contactName}</p>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar size={12} />
                      {new Date(lead.expectedCloseDate).toLocaleDateString()}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Desktop: Kanban Board */}
          <div className="hidden md:flex flex-1 overflow-x-auto pb-4">
            <DndContext sensors={dndSensors} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 min-w-[1500px] h-full">
            {STAGE_CONFIG.filter(s => s.key !== 'closed-lost').map((stage) => (
                <DroppableColumn key={stage.key} stageKey={stage.key} className={`flex-1 min-w-[240px] rounded-xl flex flex-col ${stage.color} border bg-opacity-50`}>
                {/* Column Header */}
                <div className="p-3 border-b border-gray-200/50">
                    <div className="flex justify-between items-center mb-1">
                        <h3 className="font-bold text-gray-800 uppercase text-xs tracking-wider">{stage.label}</h3>
                        <span className="text-[10px] font-bold text-gray-500 bg-white/60 px-1.5 py-0.5 rounded border border-gray-100">
                            {activeLeads.filter((l) => l.stage === stage.key).length}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-2">
                        <span className="font-medium">Prob: {stage.probability}%</span>
                    </div>
                    
                    <div className="group relative">
                        <div className="text-[10px] text-gray-400 flex items-center gap-1 cursor-help hover:text-blue-600 transition-colors">
                            <Info size={10} /> 
                            <span className="truncate">Criteria: {stage.criteria}</span>
                        </div>
                        <div className="absolute z-10 left-0 top-full mt-1 hidden group-hover:block bg-gray-800 text-white text-xs p-2 rounded shadow-lg w-48">
                            <p className="font-semibold mb-1">Required to exit:</p>
                            {stage.criteria}
                        </div>
                    </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto space-y-3 p-3">
                    {activeLeads
                    .filter((l) => l.stage === stage.key)
                    .map((lead) => {
                        const rotten = isRotten(lead);
                        const aging = getAgingStatus(lead);
                        const daysInStage = getDaysInStage(lead);
                        const agingBorderClass = aging === 'red' ? 'border-l-4 border-l-red-400' : aging === 'yellow' ? 'border-l-4 border-l-yellow-400' : 'border-l-4 border-l-transparent';
                        const nextStepOverdue = lead.nextStepDueDate && new Date(lead.nextStepDueDate) < new Date();
                        return (
                            <DraggableCard
                            key={lead.id}
                            leadId={lead.id}
                            onClick={() => {
                                setActiveLead(lead);
                                setEditedLead(JSON.parse(JSON.stringify(lead))); // Deep copy for editing buffer
                                setIsDirty(false);
                                setNextStepText(lead.nextStep || '');
                                setNextStepDueDateInput(lead.nextStepDueDate || '');
                                setActiveDetailTab('info');
                            }}
                            className={`bg-white p-3 rounded-lg shadow-sm border hover:shadow-md transition cursor-grab active:cursor-grabbing group relative flex flex-col gap-2 ${
                                rotten ? 'border-red-400 ring-1 ring-red-100' : 'border-gray-100'
                            } ${agingBorderClass}`}
                            >
                                {rotten && (
                                    <div className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 shadow-sm border border-red-200" title="Expired Close Date">
                                        <AlertTriangle size={12} />
                                    </div>
                                )}

                                <div className="flex justify-between items-start">
                                    <span className="font-bold text-sm text-gray-800 line-clamp-1" title={lead.companyName}>{lead.companyName}</span>
                                    <span className="text-xs font-bold text-gray-700">${(lead.value / 1000).toFixed(1)}k</span>
                                </div>

                                {lead.partnerName && (
                                    <span className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded border border-orange-100 w-fit">
                                        via {lead.partnerName}
                                    </span>
                                )}

                                {/* Brief Description on Card */}
                                {lead.description && (
                                    <p className="text-[10px] text-gray-500 line-clamp-2 leading-tight bg-gray-50 p-1.5 rounded border border-gray-100 italic">
                                        {lead.description}
                                    </p>
                                )}

                                {/* Next Step badge */}
                                {lead.nextStep && (
                                    <div className={`flex items-center gap-1 text-[10px] px-1.5 py-1 rounded border w-fit max-w-full ${
                                        nextStepOverdue ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-100'
                                    }`}>
                                        <Flag size={9} className="flex-shrink-0" />
                                        <span className="truncate">{lead.nextStep}</span>
                                        {lead.nextStepDueDate && <span className="flex-shrink-0 ml-1 opacity-70">{new Date(lead.nextStepDueDate).toLocaleDateString()}</span>}
                                    </div>
                                )}

                                <p className="text-xs text-gray-500 line-clamp-1 flex items-center gap-1">
                                    <UserIcon size={10} /> {lead.contactName}
                                </p>

                                <div className="flex items-center justify-between mt-1 pt-2 border-t border-gray-50">
                                    <div className={`flex items-center gap-1 text-[10px] ${rotten ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                                        <Calendar size={10} />
                                        <span>{new Date(lead.expectedCloseDate).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                        {/* Aging indicator */}
                                        {daysInStage > 0 && (
                                            <span className={`flex-shrink-0 flex items-center gap-0.5 text-[10px] font-medium px-1 py-0.5 rounded ${
                                                aging === 'red' ? 'bg-red-100 text-red-600' :
                                                aging === 'yellow' ? 'bg-yellow-100 text-yellow-600' :
                                                'text-gray-300'
                                            }`} title={`${daysInStage} days in this stage`}>
                                                <Clock size={9} />{daysInStage}d
                                            </span>
                                        )}
                                        {/* AI Score badge */}
                                        {lead.aiScore !== null && lead.aiScore !== undefined && (
                                            <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                                                lead.aiScore >= 67 ? 'bg-green-50 text-green-700 border-green-200' :
                                                lead.aiScore >= 34 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                'bg-red-50 text-red-600 border-red-200'
                                            }`} title={lead.aiScoreReason || 'AI Score'}>
                                                AI {lead.aiScore}
                                            </span>
                                        )}
                                        {lead.aiNextAction && (
                                            <span
                                                className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 min-w-0 truncate cursor-default"
                                                title={lead.aiNextAction}
                                            >
                                                ⚡ {lead.aiNextAction}
                                            </span>
                                        )}
                                        <div className="flex-shrink-0 flex items-center gap-1 text-[10px] text-gray-400">
                                            <Mail size={10} />
                                            <span>{lead.interactions.length}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="absolute top-8 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <select 
                                        className="text-[10px] bg-white border border-gray-200 rounded px-1 py-0.5 shadow-sm cursor-pointer outline-none hover:border-blue-400"
                                        value={lead.stage}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => handleStageChange(lead, e.target.value as SalesStage)}
                                    >
                                        {STAGE_CONFIG.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                    </select>
                                </div>
                                
                                {lead.stage === 'closed-won' && (
                                    <button
                                        onClick={(e) => {
                                        e.stopPropagation();
                                        // Use activeLead if it matches the current card (to get latest edits)
                                        // Otherwise use the card's lead object
                                        const leadToUse = (activeLead && activeLead.id === lead.id) ? activeLead : lead;
                                        setLeadToConvert(leadToUse);
                                        // Re-detect project types from current lead items
                                        const types = detectProjectTypes(leadToUse.items);
                                        setDetectedProjectTypes(types);
                                        setPerTypeConfig(Object.fromEntries(types.map(t => [t, defaultPerTypeConfig()])) as Record<string, PerTypeConfig>);
                                        // Extract individual hours_pack items
                                        const hpItems = (leadToUse.items || []).filter(i => i.category === 'hours_pack');
                                        setHoursPackItems(hpItems);
                                        setPerItemConfig(Object.fromEntries(hpItems.map(i => [i.id, defaultPerTypeConfig()])) as Record<string, PerTypeConfig>);
                                        setInitialDeposit(0);
                                        setSelectedProposalId('');
                                        fetch(`/api/proposals?leadId=${leadToUse.id}`, { credentials: 'include' })
                                            .then(r => r.ok ? r.json() : [])
                                            .then(list => setLeadProposals(list))
                                            .catch(() => setLeadProposals([]));
                                        setShowConvertModal(true);
                                        }}
                                        className="mt-1 w-full text-center text-[10px] bg-green-50 text-green-700 py-1 rounded border border-green-100 hover:bg-green-100 transition-colors"
                                    >
                                        Convert to Project
                                    </button>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveLead(lead);
                                        setShowVeracodeWizard(true);
                                    }}
                                    className="mt-1 w-full text-center text-[10px] bg-purple-50 text-purple-700 py-1 rounded border border-purple-100 hover:bg-purple-100 transition-colors flex items-center justify-center gap-1"
                                >
                                    <Shield size={9} /> Generar Propuesta Veracode
                                </button>
                            </DraggableCard>
                        );
                    })}
                </div>
                </DroppableColumn>
            ))}
            </div>
            </DndContext>
            </div>
        </>
      ) : viewMode === 'trash' ? (
        /* TRASH VIEW */
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                <Trash2 size={18} className="text-gray-600" />
                <h3 className="font-bold text-gray-900">Deleted Opportunities (Trash)</h3>
            </div>
            <div className="overflow-y-auto h-full">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                        <tr>
                            <th className="px-6 py-4 font-medium">Company</th>
                            <th className="px-6 py-4 font-medium">Description</th>
                            <th className="px-6 py-4 font-medium text-right">Value</th>
                            <th className="px-6 py-4 font-medium">Stage when Deleted</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {deletedLeads.length > 0 ? (
                            deletedLeads.map(lead => (
                                <tr key={lead.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-bold text-gray-900">{lead.companyName}</td>
                                    <td className="px-6 py-4 text-gray-600 truncate max-w-xs">{lead.description || '-'}</td>
                                    <td className="px-6 py-4 text-right font-medium text-gray-900">${lead.value.toLocaleString()}</td>
                                    <td className="px-6 py-4"><span className="capitalize px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-500">{lead.stage}</span></td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                                        <button 
                                            onClick={() => onRestoreLead(lead.id)}
                                            className="text-xs flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1.5 rounded hover:bg-green-100 border border-green-200 transition"
                                            title="Restore"
                                        >
                                            <RotateCcw size={14} /> Restore
                                        </button>
                                        <button 
                                            onClick={() => requestDelete(lead, 'hard_delete')}
                                            className="text-xs flex items-center gap-1 bg-red-50 text-red-700 px-3 py-1.5 rounded hover:bg-red-100 border border-red-200 transition"
                                            title="Delete Permanently"
                                        >
                                            <Trash2 size={14} /> Delete Forever
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} className="p-12 text-center text-gray-400">
                                    Trash is empty.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      ) : (
        /* LOST ARCHIVE TABLE VIEW */
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1">
            <div className="p-4 border-b border-gray-100 bg-red-50 flex items-center gap-2">
                <Archive size={18} className="text-red-500" />
                <h3 className="font-bold text-red-900">Closed Lost Opportunities</h3>
            </div>
            <div className="overflow-y-auto h-full">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                        <tr>
                            <th className="px-6 py-4 font-medium">Company</th>
                            <th className="px-6 py-4 font-medium">Description</th>
                            <th className="px-6 py-4 font-medium text-right">Value</th>
                            <th className="px-6 py-4 font-medium text-right">Close Date</th>
                            <th className="px-6 py-4 font-medium">Last Interaction</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {activeLeads.filter(l => l.stage === 'closed-lost').length > 0 ? (
                            activeLeads.filter(l => l.stage === 'closed-lost').map(lead => (
                                <tr key={lead.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div 
                                            className="font-bold text-gray-900 cursor-pointer hover:text-blue-600"
                                            onClick={() => { setActiveLead(lead); setEditedLead(JSON.parse(JSON.stringify(lead))); setIsDirty(false); setNextStepText(lead.nextStep || ''); setNextStepDueDateInput(lead.nextStepDueDate || ''); setActiveDetailTab('info'); }}
                                        >
                                            {lead.companyName}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 truncate max-w-xs">{lead.description || '-'}</td>
                                    <td className="px-6 py-4 text-right font-medium text-gray-900">${lead.value.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right text-gray-500">{new Date(lead.expectedCloseDate).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 text-gray-500 text-xs truncate max-w-[200px]">
                                        {lead.interactions.length > 0 
                                            ? lead.interactions[0].notes 
                                            : <span className="italic text-gray-400">No notes</span>
                                        }
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => handleReactivateLead(lead)}
                                            className="text-xs flex items-center gap-1 bg-white border border-gray-300 px-2 py-1 rounded hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition ml-auto"
                                        >
                                            <RotateCcw size={12} /> Reactivate
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} className="p-12 text-center text-gray-400">
                                    No lost opportunities found in archive.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* Import Confirmation Modal */}
      {showImportModal && importData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-200">
                  <div className="p-6 border-b flex items-center gap-3 bg-gray-50 rounded-t-xl">
                      <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                          <FileSpreadsheet size={24} />
                      </div>
                      <div>
                          <h3 className="text-lg font-bold text-gray-900">Confirm CSV Import</h3>
                          <p className="text-sm text-gray-500">Review data before processing</p>
                      </div>
                  </div>
                  
                  <div className="p-6 space-y-4">
                      <div className="flex gap-4">
                          <div className="flex-1 bg-green-50 border border-green-100 p-4 rounded-xl text-center">
                              <p className="text-xs font-bold text-green-600 uppercase tracking-wide">New Opportunities</p>
                              <p className="text-3xl font-bold text-green-700 mt-1">{importData.new.length}</p>
                          </div>
                          <div className="flex-1 bg-blue-50 border border-blue-100 p-4 rounded-xl text-center">
                              <p className="text-xs font-bold text-blue-600 uppercase tracking-wide">Updates to Existing</p>
                              <p className="text-3xl font-bold text-blue-700 mt-1">{importData.updated.length}</p>
                          </div>
                      </div>
                      
                      <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="flex items-start gap-2">
                              <Info size={16} className="mt-0.5 text-blue-500 shrink-0" />
                              <span>
                                  Clicking confirm will merge this data into your active pipeline. 
                                  {importData.updated.length > 0 && " Existing records with matching IDs will be updated."}
                              </span>
                          </p>
                      </div>
                  </div>

                  <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3">
                      <button 
                          onClick={() => { setShowImportModal(false); setImportData(null); }}
                          className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={handleConfirmImport}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 shadow-sm flex items-center gap-2"
                      >
                          <CheckCircle2 size={16} /> Confirm Import
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Confirmation Modal (Generic for Delete/Action) */}
      {confirmModal.isOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
                  <div className="flex flex-col items-center text-center">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                          <Trash2 size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">
                          {confirmModal.action === 'soft_delete' ? 'Move to Trash?' : 'Delete Permanently?'}
                      </h3>
                      <p className="text-sm text-gray-500 mb-6">
                          Are you sure you want to delete <strong>{confirmModal.leadName}</strong>?
                          {confirmModal.action === 'hard_delete' && " This action cannot be undone."}
                      </p>
                      <div className="flex gap-3 w-full">
                          <button 
                              onClick={() => setConfirmModal({...confirmModal, isOpen: false})}
                              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
                          >
                              Cancel
                          </button>
                          <button 
                              onClick={executeDelete}
                              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
                          >
                              Confirm
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* New Lead Modal */}
      {showNewLeadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <h2 className="text-xl font-bold text-gray-900">New Sales Opportunity</h2>
              <button onClick={() => setShowNewLeadModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmitNewLead} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Briefcase size={16} /> Opportunity Details
                  </h3>
                  <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company / Client Name</label>
                        <input type="text" className={`w-full border rounded-lg p-2.5 text-sm ${newLeadErrors.companyName ? 'border-red-400 focus:ring-red-300' : 'border-gray-300'}`} placeholder="e.g. Acme Corp" value={newLeadForm.companyName} onChange={e => { setNewLeadForm({...newLeadForm, companyName: e.target.value.toUpperCase()}); setNewLeadErrors(prev => ({...prev, companyName: undefined})); }} />
                        {newLeadErrors.companyName && <p className="text-xs text-red-500 mt-1">{newLeadErrors.companyName}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" placeholder="e.g. Cloud Migration Phase 1" value={newLeadForm.description} onChange={e => setNewLeadForm({...newLeadForm, description: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Project Name <span className="text-purple-600 text-xs">(Veracode / Drive folder)</span></label>
                        <input type="text" className="w-full border border-purple-200 rounded-lg p-2.5 text-sm focus:ring-purple-300" placeholder="e.g. DevSecOps 2025" value={newLeadForm.projectName} onChange={e => setNewLeadForm({...newLeadForm, projectName: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" value={newLeadForm.city} onChange={e => setNewLeadForm({...newLeadForm, city: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" value={newLeadForm.country} onChange={e => setNewLeadForm({...newLeadForm, country: e.target.value})} />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Partner (Optional)</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" placeholder="Referral partner" value={newLeadForm.partnerName} onChange={e => setNewLeadForm({...newLeadForm, partnerName: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer (Optional)</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" placeholder="Technology vendor" value={newLeadForm.manufacturer} onChange={e => setNewLeadForm({...newLeadForm, manufacturer: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Expected Close Date</label>
                        <input type="date" className={`w-full border rounded-lg p-2.5 text-sm ${newLeadErrors.expectedCloseDate ? 'border-red-400' : 'border-gray-300'}`} value={newLeadForm.expectedCloseDate} onChange={e => { setNewLeadForm({...newLeadForm, expectedCloseDate: e.target.value}); setNewLeadErrors(prev => ({...prev, expectedCloseDate: undefined})); }} />
                        {newLeadErrors.expectedCloseDate && <p className="text-xs text-red-500 mt-1">{newLeadErrors.expectedCloseDate}</p>}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <UserIcon size={16} /> Contact Person
                  </h3>
                  {contacts && contacts.length > 0 && (
                      <div className="mb-4">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Select Existing Contact</label>
                          <select 
                              className="w-full border border-blue-200 bg-blue-50 rounded-lg p-2 text-sm"
                              onChange={(e) => handleSelectContact(e.target.value)}
                              defaultValue=""
                          >
                              <option value="" disabled>-- Load from Directory --</option>
                              {contacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.companyName})</option>)}
                          </select>
                      </div>
                  )}
                  <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                        <input type="text" className={`w-full border rounded-lg p-2.5 text-sm ${newLeadErrors.contactName ? 'border-red-400' : 'border-gray-300'}`} placeholder="e.g. John Smith" value={newLeadForm.contactName} onChange={e => { setNewLeadForm({...newLeadForm, contactName: e.target.value}); setNewLeadErrors(prev => ({...prev, contactName: undefined})); }} />
                        {newLeadErrors.contactName && <p className="text-xs text-red-500 mt-1">{newLeadErrors.contactName}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                        <input type="email" className={`w-full border rounded-lg p-2.5 text-sm ${newLeadErrors.email ? 'border-red-400' : 'border-gray-300'}`} placeholder="john@company.com" value={newLeadForm.email} onChange={e => { setNewLeadForm({...newLeadForm, email: e.target.value}); setNewLeadErrors(prev => ({...prev, email: undefined})); }} />
                        {newLeadErrors.email && <p className="text-xs text-red-500 mt-1">{newLeadErrors.email}</p>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                            <input type="tel" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" placeholder="+1 555..." value={newLeadForm.phone} onChange={e => setNewLeadForm({...newLeadForm, phone: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title / Role</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" placeholder="CTO" value={newLeadForm.role} onChange={e => setNewLeadForm({...newLeadForm, role: e.target.value})} />
                        </div>
                    </div>
                    <div className="flex items-center mt-2">
                        <input 
                            id="saveContact" 
                            type="checkbox" 
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            checked={saveAsContact}
                            onChange={(e) => setSaveAsContact(e.target.checked)}
                        />
                        <label htmlFor="saveContact" className="ml-2 text-sm text-gray-600">Save to Contact Directory</label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Partner Contact Section */}
              <div className="border-t border-amber-100 pt-5">
                <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Users size={16} /> Contact Partner
                  {newLeadForm.partnerName.trim() && (
                    <span className="ml-2 text-xs font-normal bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full normal-case">
                      {newLeadForm.partnerName}
                    </span>
                  )}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                    <input
                      type="text"
                      readOnly
                      className="w-full border border-amber-100 bg-amber-50 rounded-lg p-2.5 text-sm text-amber-800 cursor-default"
                      value={newLeadForm.partnerName || '—'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      className="w-full border border-amber-200 rounded-lg p-2.5 text-sm"
                      placeholder="e.g. María García"
                      value={newLeadForm.partnerContactName}
                      onChange={e => setNewLeadForm({...newLeadForm, partnerContactName: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      className="w-full border border-amber-200 rounded-lg p-2.5 text-sm"
                      placeholder="+57 300..."
                      value={newLeadForm.partnerContactPhone}
                      onChange={e => setNewLeadForm({...newLeadForm, partnerContactPhone: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      className="w-full border border-amber-200 rounded-lg p-2.5 text-sm"
                      placeholder="partner@company.com"
                      value={newLeadForm.partnerContactEmail}
                      onChange={e => setNewLeadForm({...newLeadForm, partnerContactEmail: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Job Title / Role</label>
                    <input
                      type="text"
                      className="w-full border border-amber-200 rounded-lg p-2.5 text-sm"
                      placeholder="e.g. Channel Manager"
                      value={newLeadForm.partnerContactRole}
                      onChange={e => setNewLeadForm({...newLeadForm, partnerContactRole: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              {/* Resource Allocation Section */}
              <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Clock size={16} /> Resource Allocation & Services
                  </h3>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-4">
                      <div className="grid grid-cols-12 gap-3 items-end mb-3">
                          <div className="col-span-8">
                              <label className="block text-xs font-bold text-indigo-800 mb-1">Select Consultant</label>
                              <select 
                                  className="w-full border border-indigo-200 rounded p-2 text-sm bg-white"
                                  value={serviceForm.userId}
                                  onChange={(e) => handleServiceUserChange(e.target.value)}
                              >
                                  <option value="">-- Choose Consultant --</option>
                                  {users.filter(u => u.role === 'consultant' || u.role === 'admin').map(u => (
                                      <option key={u.id} value={u.id}>{u.name}</option>
                                  ))}
                              </select>
                          </div>
                          <div className="col-span-4">
                              <label className="block text-xs font-bold text-indigo-800 mb-1">Hours</label>
                              <input 
                                  type="number" 
                                  min="0"
                                  className="w-full border border-indigo-200 rounded p-2 text-sm"
                                  value={serviceForm.hours}
                                  onChange={(e) => setServiceForm({...serviceForm, hours: Number(e.target.value)})}
                              />
                          </div>
                      </div>
                      
                      {/* Cost, Margin, Price Row */}
                      <div className="grid grid-cols-12 gap-3 items-end mb-3 bg-white/50 p-2 rounded-lg border border-indigo-100">
                          <div className="col-span-4">
                              <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Hourly Cost (Internal)</label>
                              <div className="relative">
                                  <span className="absolute left-2 top-2 text-gray-400 text-xs">$</span>
                                  <input 
                                      type="number" 
                                      min="0"
                                      className="w-full border border-gray-200 rounded pl-5 p-2 text-sm bg-gray-50 text-gray-600"
                                      value={serviceForm.cost}
                                      onChange={(e) => handleServiceCostChange(Number(e.target.value))}
                                  />
                              </div>
                          </div>
                          <div className="col-span-4">
                              <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">Margin %</label>
                              <div className="relative">
                                  <Percent size={12} className="absolute left-2 top-2.5 text-gray-400" />
                                  <input 
                                      type="number" 
                                      className="w-full border border-gray-200 rounded pl-6 p-2 text-sm"
                                      value={serviceForm.margin}
                                      onChange={(e) => handleServiceMarginChange(Number(e.target.value))}
                                  />
                              </div>
                          </div>
                          <div className="col-span-4">
                              <label className="block text-[10px] font-bold text-indigo-700 mb-1 uppercase">Hourly Rate (Client)</label>
                              <div className="relative">
                                  <span className="absolute left-2 top-2 text-indigo-500 text-xs">$</span>
                                  <input 
                                      type="number" 
                                      min="0"
                                      className="w-full border border-indigo-300 rounded pl-5 p-2 text-sm font-bold text-indigo-900"
                                      value={serviceForm.rate}
                                      onChange={(e) => handleServiceRateChange(Number(e.target.value))}
                                  />
                              </div>
                          </div>
                      </div>

                      <div className="flex justify-end">
                          <button 
                              type="button"
                              onClick={handleAddAllocationToForm}
                              disabled={!serviceForm.userId || serviceForm.hours <= 0}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1 shadow-sm"
                          >
                              <Plus size={14} /> Add Consultant
                          </button>
                      </div>
                      
                      {/* Mini Table for Allocations */}
                      {serviceAllocations.length > 0 && (
                          <div className="mt-4 bg-white rounded border border-indigo-100 overflow-hidden">
                              <table className="w-full text-xs text-left">
                                  <thead className="bg-indigo-100/50 text-indigo-900 font-semibold">
                                      <tr>
                                          <th className="p-2">Consultant</th>
                                          <th className="p-2 text-right">Hours</th>
                                          <th className="p-2 text-right">Rate</th>
                                          <th className="p-2 text-right">Subtotal</th>
                                          <th className="p-2"></th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-indigo-50">
                                      {serviceAllocations.map(alloc => (
                                          <tr key={alloc.id}>
                                              <td className="p-2 flex items-center gap-1">
                                                  <Users size={12} className="text-indigo-400" />
                                                  {alloc.consultantName}
                                              </td>
                                              <td className="p-2 text-right">{alloc.hours}</td>
                                              <td className="p-2 text-right">${alloc.rate}</td>
                                              <td className="p-2 text-right font-medium">${(alloc.hours * alloc.rate).toLocaleString()}</td>
                                              <td className="p-2 text-right">
                                                  <button 
                                                      onClick={() => handleRemoveAllocation(alloc.id)}
                                                      className="text-red-400 hover:text-red-600"
                                                  >
                                                      <X size={14} />
                                                  </button>
                                              </td>
                                          </tr>
                                      ))}
                                      <tr className="bg-indigo-50 font-bold">
                                          <td className="p-2 text-right">Total:</td>
                                          <td className="p-2 text-right">{serviceAllocations.reduce((acc, a) => acc + a.hours, 0)} hrs</td>
                                          <td className="p-2"></td>
                                          <td className="p-2 text-right">${serviceAllocations.reduce((acc, a) => acc + (a.hours * a.rate), 0).toLocaleString()}</td>
                                          <td></td>
                                      </tr>
                                  </tbody>
                              </table>
                          </div>
                      )}

                      <p className="text-[10px] text-indigo-500 mt-2">
                          Add multiple consultants here. This will generate a single consolidated line item in the Products & Scope section below.
                      </p>
                  </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <ShoppingCart size={16} /> Products & Scope
                  </h3>
                  
                  <ItemInputRow
                      skuCatalog={skuCatalog}
                      newItemInput={newItemInput}
                      setNewItemInput={setNewItemInput}
                      onAddItems={handleAddItemToForm}
                  />

                  <ItemsTable 
                      items={newLeadItems} 
                      onDelete={handleRemoveItemFromForm}
                      onUpdate={handleUpdateItemInNewForm}
                  />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowNewLeadModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm transition">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition shadow-sm">Create Opportunity</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project Setup Modal (For Conversion) */}
      {showConvertModal && leadToConvert && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <CheckCircle2 className="text-green-600" /> Setup Projects
                  </h3>
                  <div className="space-y-4">
                      <p className="text-sm text-gray-600">
                          Converting <strong>{leadToConvert.companyName}</strong> to projects. Please define initial parameters.
                      </p>

                      {/* Shared fields */}
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Lead Consultant</label>
                          <select className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white" value={selectedConsultant} onChange={(e) => setSelectedConsultant(e.target.value)}>
                              {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                          </select>
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Initial Payment / Deposit ($)</label>
                          <input
                              type="number"
                              min="0"
                              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                              value={initialDeposit}
                              onChange={(e) => setInitialDeposit(Number(e.target.value))}
                          />
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                              Won Reason <span className="text-gray-400 font-normal">(optional)</span>
                          </label>
                          <select className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white" value={wonReason} onChange={(e) => setWonReason(e.target.value)}>
                              <option value="">Select reason…</option>
                              <option value="Best Price">Best Price</option>
                              <option value="Best Solution">Best Solution / Features</option>
                              <option value="Relationship">Existing Relationship</option>
                              <option value="References">References / Case Studies</option>
                              <option value="Speed">Faster Delivery</option>
                              <option value="Support">Better Support Offer</option>
                              <option value="Other">Other</option>
                          </select>
                      </div>

                      {/* Proposal accepted */}
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                              Propuesta aceptada <span className="text-gray-400 font-normal">(opcional)</span>
                          </label>
                          {leadProposals.length === 0 ? (
                              <p className="text-xs text-gray-400 py-1">No hay propuestas guardadas para este lead.</p>
                          ) : (
                              <select
                                  className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white"
                                  value={selectedProposalId}
                                  onChange={e => setSelectedProposalId(e.target.value)}
                              >
                                  <option value="">Ninguna / No especificar</option>
                                  {leadProposals.map(p => (
                                      <option key={p.id} value={p.id}>
                                          {p.name} — v{p.version}{p.totalValue ? ` · $${p.totalValue.toLocaleString('en-US')}` : ''}
                                      </option>
                                  ))}
                              </select>
                          )}
                      </div>

                      <hr className="my-4" />

                      {/* Per-type configuration sections */}
                      {detectedProjectTypes.map((type) => {
                          const cfg = perTypeConfig[type];
                          const typeLabel: Record<ProjectType, string> = {
                              implementation: 'Implementation Project',
                              support: 'Support Contract',
                              hours_pack: 'Hours Pack',
                              license: 'Software License',
                              consulting: 'Consulting / Audit',
                          };
                          const typeTemplates = templates.filter(t => t.type === type);
                          return (
                              <div key={type} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                                  <p className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                                      {typeLabel[type]}
                                  </p>

                                  <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">Task Template</label>
                                      <select
                                          className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white"
                                          value={cfg.templateId}
                                          onChange={e => setTypeField(type, 'templateId', e.target.value)}
                                      >
                                          <option value="">No Template (Blank Project)</option>
                                          {typeTemplates.map(t => (
                                              <option key={t.id} value={t.id}>{t.name}</option>
                                          ))}
                                      </select>
                                  </div>

                                  {type === 'support' && (
                                      <div className="border border-orange-200 bg-orange-50 rounded-lg p-3 space-y-3">
                                          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                                              📋 Support Contract Period
                                          </p>
                                          <div className="grid grid-cols-2 gap-3">
                                              <div>
                                                  <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                                                  <input
                                                      type="date"
                                                      className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white"
                                                      value={cfg.contractStartDate}
                                                      onChange={e => setTypeField(type, 'contractStartDate', e.target.value)}
                                                  />
                                              </div>
                                              <div>
                                                  <label className="block text-xs font-medium text-gray-700 mb-1">End Date <span className="text-red-500">*</span></label>
                                                  <input
                                                      type="date"
                                                      className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white"
                                                      value={cfg.contractEndDate}
                                                      min={cfg.contractStartDate}
                                                      onChange={e => setTypeField(type, 'contractEndDate', e.target.value)}
                                                  />
                                              </div>
                                          </div>
                                      </div>
                                  )}

                                  {type === 'hours_pack' && hoursPackItems.length > 0 && (
                                      <div className="space-y-3">
                                          {hoursPackItems.map((item, itemIdx) => {
                                              const itemCfg = perItemConfig[item.id];
                                              return (
                                                  <div key={item.id} className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-3">
                                                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                                                          🕐 Hours Pack {itemIdx + 1} — {item.description} ({item.quantity}h @ ${item.unitPrice.toLocaleString()})
                                                      </p>
                                                      <div>
                                                          <label className="block text-xs font-medium text-gray-700 mb-1">Total Hours <span className="text-red-500">*</span></label>
                                                          <input
                                                              type="number"
                                                              min="1"
                                                              className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white"
                                                              placeholder="e.g. 50"
                                                              value={itemCfg.packHours || ''}
                                                              onChange={e => setItemField(item.id, 'packHours', Number(e.target.value))}
                                                          />
                                                      </div>
                                                      <div className="grid grid-cols-2 gap-3">
                                                          <div>
                                                              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                                                              <input
                                                                  type="date"
                                                                  className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white"
                                                                  value={itemCfg.packStartDate}
                                                                  onChange={e => setItemField(item.id, 'packStartDate', e.target.value)}
                                                              />
                                                          </div>
                                                          <div>
                                                              <label className="block text-xs font-medium text-gray-700 mb-1">End Date <span className="text-red-500">*</span></label>
                                                              <input
                                                                  type="date"
                                                                  className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white"
                                                                  value={itemCfg.packEndDate}
                                                                  min={itemCfg.packStartDate}
                                                                  onChange={e => setItemField(item.id, 'packEndDate', e.target.value)}
                                                              />
                                                          </div>
                                                      </div>
                                                  </div>
                                              );
                                          })}
                                      </div>
                                  )}
                              </div>
                          );
                      })}

                      <div className="flex justify-end gap-3 mt-6">
                          <button onClick={() => setShowConvertModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg text-sm">Cancel</button>
                          <button onClick={confirmConversion} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700">Start Projects</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Lead Detail Modal */}
      {activeLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{activeLead.companyName}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                   <UserIcon size={14} /> {activeLead.contactName}
                   <span className="text-gray-300">|</span>
                   <Briefcase size={14} /> {activeLead.role}
                </div>
              </div>
              <div className="flex items-center gap-2">
                  <button
                      onClick={handleSaveChanges}
                      disabled={!isDirty}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${isDirty ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                      title={isDirty ? 'Save pending changes' : 'No changes to save'}
                  >
                      <Save size={16} /> Save
                  </button>
                  {isDirty && (
                      <button
                          onClick={handleDiscardChanges}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 border border-gray-200 transition"
                          title="Discard changes"
                      >
                          <RotateCcw size={14} /> Discard
                      </button>
                  )}
                  <div className="w-px h-8 bg-gray-300 mx-1"></div>
                  <button
                      onClick={() => setShowProposalPrint(true)}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-blue-700 border border-gray-200 rounded-lg hover:bg-blue-50 transition"
                      title="Export Proposal PDF"
                  >
                      <FileText size={15} /> PDF
                  </button>
                  <button
                      onClick={handleGenerateDriveProposal}
                      disabled={generatingDriveProposal}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                      style={{ background: '#410074' }}
                      title="Generar Propuesta Técnica en Google Drive"
                  >
                      <HardDrive size={15} />
                      {generatingDriveProposal ? 'Generando…' : 'Propuesta Drive'}
                  </button>
                  <button
                      onClick={() => requestDelete(activeLead, 'soft_delete')}
                      className="text-gray-400 hover:text-red-600 p-2 rounded hover:bg-red-50 transition"
                      title="Move to Trash"
                  >
                      <Trash2 size={20} />
                  </button>
                  <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 p-2 rounded hover:bg-gray-100 transition">
                    <X size={24} />
                  </button>
              </div>
            </div>
            {/* Pipeline Path */}
            <PipelinePath
              currentStage={activeLead.stage}
              onStageChange={(stage) => handleStageChange(activeLead, stage)}
            />
            {/* Unsaved changes banner */}
            {isDirty && (
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2 text-amber-800 text-xs font-medium">
                <AlertTriangle size={13} className="text-amber-500" />
                You have unsaved changes — click <strong className="mx-1">Save</strong> to apply them across the entire application.
              </div>
            )}
            
            {/* Modal Tabs */}
            <div className="flex border-b border-gray-200 px-6 overflow-x-auto">
                <button onClick={() => setActiveDetailTab('info')} className={`py-3 px-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeDetailTab === 'info' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Details & Notes</button>
                <button onClick={() => setActiveDetailTab('quote')} className={`py-3 px-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeDetailTab === 'quote' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Products & Quote</button>
                <button onClick={() => setActiveDetailTab('costing')} className={`py-3 px-4 text-sm font-medium border-b-2 transition whitespace-nowrap flex items-center gap-1 ${activeDetailTab === 'costing' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}><DollarSign size={14} /> Costing</button>
                <button onClick={() => setActiveDetailTab('tasks')} className={`py-3 px-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeDetailTab === 'tasks' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Tasks / Next Steps</button>
                <button onClick={() => setActiveDetailTab('history')} className={`py-3 px-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeDetailTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Stage History</button>
                <button onClick={() => setActiveDetailTab('activity')} className={`py-3 px-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeDetailTab === 'activity' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Activity</button>
                <button onClick={() => setActiveDetailTab('hours')} className={`py-3 px-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeDetailTab === 'hours' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Pre-sales Time</button>
                <button onClick={() => setActiveDetailTab('expenses')} className={`py-3 px-4 text-sm font-medium border-b-2 transition whitespace-nowrap ${activeDetailTab === 'expenses' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Pre-sales Expenses</button>
            </div>

            <div className="p-6 space-y-6">
              {activeDetailTab === 'activity' && (
                <ActivityTimeline
                  entityId={activeLead.id}
                  entityType="lead"
                  interactions={activeLead.interactions}
                  leadContext={{
                    companyName: activeLead.companyName,
                    contactName: activeLead.contactName,
                    stage: activeLead.stage,
                    nextStep: activeLead.nextStep,
                    value: activeLead.value,
                    expectedCloseDate: activeLead.expectedCloseDate,
                  }}
                />
              )}

              {activeDetailTab === 'info' && (
                <>
                    {/* INFO Tab Content */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-3 text-sm text-gray-700"><Mail className="text-gray-400" size={16} /> <a href={`mailto:${activeLead.email}`} className="hover:text-blue-600 hover:underline">{activeLead.email}</a></div>
                        <div className="flex items-center gap-3 text-sm text-gray-700"><Phone className="text-gray-400" size={16} /> <span>{activeLead.phone}</span></div>
                        <div className="flex items-center gap-3 text-sm text-gray-700"><MapPin className="text-gray-400" size={16} /> <span>{activeLead.city}, {activeLead.country}</span></div>
                        <div className="flex items-center gap-3 text-sm text-gray-700"><Briefcase className="text-gray-400" size={16} /> <span>{activeLead.role}</span></div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <h4 className="text-sm font-bold text-gray-800 mb-3">Edit Details</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Company</label>
                                <input type="text" className="w-full border rounded p-1 text-sm" value={editedLead?.companyName || ''} onChange={e => handleLocalInfoChange('companyName', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Contact Name</label>
                                <input type="text" className="w-full border rounded p-1 text-sm" value={editedLead?.contactName || ''} onChange={e => handleLocalInfoChange('contactName', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Email</label>
                                <input type="email" className="w-full border rounded p-1 text-sm" value={editedLead?.email || ''} onChange={e => handleLocalInfoChange('email', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Phone</label>
                                <input type="text" className="w-full border rounded p-1 text-sm" value={editedLead?.phone || ''} onChange={e => handleLocalInfoChange('phone', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">City</label>
                                <input type="text" className="w-full border rounded p-1 text-sm" value={editedLead?.city || ''} onChange={e => handleLocalInfoChange('city', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Country</label>
                                <input type="text" className="w-full border rounded p-1 text-sm" value={editedLead?.country || ''} onChange={e => handleLocalInfoChange('country', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Role / Position</label>
                                <input type="text" className="w-full border rounded p-1 text-sm" value={editedLead?.role || ''} onChange={e => handleLocalInfoChange('role', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Manufacturer</label>
                                <input type="text" className="w-full border rounded p-1 text-sm" value={editedLead?.manufacturer || ''} onChange={e => handleLocalInfoChange('manufacturer', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Partner</label>
                                <input type="text" className="w-full border rounded p-1 text-sm" value={editedLead?.partnerName || ''} onChange={e => handleLocalInfoChange('partnerName', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Expected Close</label>
                                <input type="date" className="w-full border rounded p-1 text-sm" value={editedLead?.expectedCloseDate || ''} onChange={e => handleLocalInfoChange('expectedCloseDate', e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Deal Value ($)</label>
                                <input type="number" min="0" className="w-full border rounded p-1 text-sm" value={editedLead?.value || 0} onChange={e => handleLocalInfoChange('value', Number(e.target.value))} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Probability (%)</label>
                                <input type="number" min="0" max="100" className="w-full border rounded p-1 text-sm" value={editedLead?.probability || 0} onChange={e => handleLocalInfoChange('probability', Number(e.target.value))} />
                            </div>
                            {editedLead?.stage === 'closed-won' || editedLead?.stage === 'project-delivered' ? (
                              <div className="col-span-2">
                                <label className="text-xs text-gray-500 block mb-1">Closed Value — Revenue ($) <span className="text-blue-500 font-medium">· used in Profitability</span></label>
                                <input type="number" min="0" className="w-full border border-blue-200 rounded p-1 text-sm focus:ring-2 focus:ring-blue-100 outline-none" value={editedLead?.closedValue ?? editedLead?.value ?? 0} onChange={e => handleLocalInfoChange('closedValue', Number(e.target.value))} />
                              </div>
                            ) : null}
                            <div className="col-span-2">
                                <label className="text-xs text-gray-500 block mb-1">Description</label>
                                <textarea className="w-full border rounded p-1 text-sm" rows={2} value={editedLead?.description || ''} onChange={e => handleLocalInfoChange('description', e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm uppercase tracking-wide">
                            <StickyNote size={16} /> Activity & Notes
                        </h3>
                        <div className="flex gap-2 mb-1">
                            {(['note','email','call','meeting'] as const).map(t => (
                                <button key={t} onClick={() => setInteractionType(t)}
                                    className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize transition ${interactionType === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                    {t}
                                </button>
                            ))}
                            {interactionType === 'email' && emailTemplates.length > 0 && (
                                <select
                                    className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none bg-white text-gray-600"
                                    defaultValue=""
                                    onChange={e => {
                                        const tpl = emailTemplates.find(t => t.id === e.target.value);
                                        if (tpl && activeLead) {
                                            const merged = tpl.body
                                                .replace(/\{\{companyName\}\}/g, activeLead.companyName || '')
                                                .replace(/\{\{contactName\}\}/g, activeLead.contactName || '')
                                                .replace(/\{\{value\}\}/g, activeLead.value ? `$${activeLead.value.toLocaleString()}` : '')
                                                .replace(/\{\{nextStep\}\}/g, activeLead.nextStep || '');
                                            setNoteText(merged);
                                        }
                                        e.target.value = '';
                                    }}
                                >
                                    <option value="" disabled>Use template…</option>
                                    {emailTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <textarea
                                className="flex-1 border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                                placeholder={interactionType === 'email' ? 'Email body (or select a template above)…' : interactionType === 'call' ? 'Call notes…' : interactionType === 'meeting' ? 'Meeting notes…' : 'Add a note regarding this deal...'}
                                rows={3}
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                            />
                            <button
                                onClick={handleAddNote}
                                disabled={!noteText.trim()}
                                className="bg-gray-900 text-white px-4 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                            {activeLead.interactions && activeLead.interactions.length > 0 ? (
                                activeLead.interactions.map((interaction, i) => (
                                    <div key={i} className="bg-gray-50 p-3 rounded-lg text-sm border border-gray-100">
                                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                                            <span className="font-bold text-gray-600 uppercase">{interaction.type}</span>
                                            <span>{new Date(interaction.date).toLocaleString()}</span>
                                        </div>
                                        <p className="text-gray-800 whitespace-pre-wrap">{interaction.notes}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-400 italic">No notes added yet.</p>
                            )}
                        </div>
                    </div>
                </>
              )}

              {activeDetailTab === 'quote' && (
                  <>
                      <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex justify-between items-center mb-4">
                          <div>
                              <p className="text-sm text-blue-800 font-bold">Total Deal Value</p>
                              <p className="text-2xl font-bold text-blue-900">${calculateTotalValue(activeLead.items).toLocaleString()}</p>
                          </div>
                          <button
                              onClick={() => setShowVeracodeWizard(true)}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg font-medium transition hover:opacity-90"
                              style={{ background: '#410074' }}
                              title="Generar cotización Veracode"
                          >
                              <Shield size={14} /> Cotización Veracode
                          </button>
                      </div>
                      
                      <h4 className="text-sm font-bold text-gray-700 mb-2">Add Product / Service</h4>
                      <ItemInputRow
                          skuCatalog={skuCatalog}
                          newItemInput={newItemInput}
                          setNewItemInput={setNewItemInput}
                          onAddItems={handleAddItemToActiveLead}
                      />

                      <h4 className="text-sm font-bold text-gray-700 mb-2 mt-6">Current Items</h4>
                      <ItemsTable
                          items={activeLead.items}
                          onDelete={handleRemoveItemFromActiveLead}
                          onUpdate={handleUpdateItemInActiveLead}
                      />

                      {/* PANEL LICENCIAS — solo visible cuando el lead está cerrado-ganado y tiene items de licencia */}
                      {activeLead.stage === 'closed-won' && activeLead.items.some(i => i.category === 'license') && (
                          <div className="mt-6 border border-green-200 bg-green-50 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-4">
                                  <CreditCard size={16} className="text-green-700" />
                                  <h4 className="text-sm font-bold text-green-800">Billing Details — Licenses</h4>
                                  <span className="ml-auto text-xs text-green-600">Applies to License items only</span>
                              </div>
                              {/* Multi-year validation warning */}
                              {(() => {
                                  const licItems = activeLead.items.filter(i => i.category === 'license');
                                  const missing = licItems.filter(i => !i.billingDate);
                                  if (licItems.length >= 2 && missing.length > 0) {
                                      return (
                                          <div className="mb-3 flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
                                              <AlertTriangle size={14} className="text-yellow-500 mt-0.5 shrink-0" />
                                              <span>
                                                  <strong>{missing.length} license(s)</strong> without a Billing Date. Without this date they will not be included in the corresponding Fiscal Year.
                                              </span>
                                          </div>
                                      );
                                  }
                                  return null;
                              })()}

                              <div className="space-y-3">
                                  {activeLead.items.filter(i => i.category === 'license').map(item => {
                                      const vendorCost = item.unitCost * item.quantity;
                                      const incodaMargin = item.unitPrice * item.quantity - vendorCost;
                                      const marginPct = vendorCost > 0 ? (incodaMargin / vendorCost * 100).toFixed(1) : '0';
                                      const missingDate = !item.billingDate;
                                      return (
                                          <div key={item.id} className={`bg-white border rounded-lg p-3 ${missingDate ? 'border-yellow-300 bg-yellow-50/30' : 'border-green-100'}`}>
                                              {/* Header: description + year badge + warning */}
                                              <div className="flex items-center gap-2 mb-3">
                                                  <p className="text-xs font-bold text-gray-800 flex-1">{item.description || 'License'}</p>
                                                  {item.licenseYear && (
                                                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">Year {item.licenseYear}</span>
                                                  )}
                                                  {missingDate && (
                                                      <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                                                          <AlertTriangle size={11} /> No date
                                                      </span>
                                                  )}
                                              </div>
                                              {/* Financial breakdown */}
                                              <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                                                  <div className="bg-gray-50 rounded p-2 text-center">
                                                      <p className="text-gray-500 mb-0.5">Sell Price</p>
                                                      <p className="font-bold text-gray-800">${(item.unitPrice * item.quantity).toLocaleString()}</p>
                                                  </div>
                                                  <div className="bg-orange-50 rounded p-2 text-center">
                                                      <p className="text-orange-500 mb-0.5">Vendor Cost</p>
                                                      <p className="font-bold text-orange-700">${vendorCost.toLocaleString()}</p>
                                                  </div>
                                                  <div className="bg-green-50 rounded p-2 text-center">
                                                      <p className="text-green-600 mb-0.5">Incoda Margin</p>
                                                      <p className="font-bold text-green-700">${incodaMargin.toLocaleString()}</p>
                                                      <p className="text-green-500 text-[10px]">{marginPct}%</p>
                                                  </div>
                                              </div>
                                              {/* Dates */}
                                              <div className="grid grid-cols-2 gap-3">
                                                  <div>
                                                      <label className="text-xs text-gray-500 font-medium block mb-1">Billing Date</label>
                                                      <input
                                                          type="date"
                                                          className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none"
                                                          value={item.billingDate ?? ''}
                                                          onChange={e => handleUpdateItemInActiveLead({ ...item, billingDate: e.target.value })}
                                                      />
                                                  </div>
                                                  <div>
                                                      <label className="text-xs text-gray-500 font-medium block mb-1">Payment Date</label>
                                                      <input
                                                          type="date"
                                                          className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-green-300 focus:border-green-400 outline-none"
                                                          value={item.paymentDate ?? ''}
                                                          onChange={e => handleUpdateItemInActiveLead({ ...item, paymentDate: e.target.value })}
                                                      />
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>

                              {/* Botón generar cobros */}
                              <button
                                  onClick={() => {
                                      const allLicenseItems = activeLead.items.filter(i => i.category === 'license');
                                      const licenseItems = allLicenseItems.filter(i => i.billingDate);
                                      const missingCount = allLicenseItems.length - licenseItems.length;
                                      if (licenseItems.length === 0) {
                                          alert('Please complete the Billing Date for each license before generating charges.');
                                          return;
                                      }
                                      if (missingCount > 0) {
                                          const proceed = window.confirm(
                                              `${missingCount} license(s) have no Billing Date and will not be included in the Fiscal Year.\n\nGenerate only the charges with an assigned date (${licenseItems.length})?`
                                          );
                                          if (!proceed) return;
                                      }
                                      // Evitar duplicados: verificar si ya existe una transaction para este lineItemId
                                      const existingLineItemIds = new Set(
                                          transactions.filter(t => t.lineItemId).map(t => t.lineItemId)
                                      );
                                      let created = 0;
                                      licenseItems.forEach(item => {
                                          if (existingLineItemIds.has(item.id)) return; // ya existe
                                          const tx: Transaction = {
                                              id: `tx_lic_${item.id}_${Date.now()}`,
                                              title: `License: ${item.description || 'No description'} — ${activeLead.companyName}`,
                                              amount: item.total,
                                              date: item.billingDate!,
                                              type: 'income',
                                              category: 'service' as ExpenseCategory,
                                              description: `${item.years ? item.years + ' year(s)' : ''} | Billing: ${item.billingDate}${item.paymentDate ? ' | Payment: ' + item.paymentDate : ''}`,
                                              leadId: activeLead.id,
                                              lineItemId: item.id,
                                              billingDate: item.billingDate,
                                              paymentDate: item.paymentDate,
                                              years: item.years,
                                              licenseYear: item.licenseYear,
                                              isPaid: !!item.paymentDate,
                                          };
                                          onAddTransaction(tx);
                                          created++;
                                      });
                                      if (created > 0) {
                                          alert(`${created} license charge(s) generated in the Finance module.`);
                                      } else {
                                          alert('Charges for these licenses have already been generated.');
                                      }
                                  }}
                                  className="mt-4 w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2.5 rounded-lg transition"
                              >
                                  <BadgeCheck size={16} /> Generate Charges in Finance
                              </button>
                          </div>
                      )}
                  </>
              )}

              {activeDetailTab === 'costing' && (
                  <div className="space-y-4">
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-4">
                              <div>
                                  <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                                      <DollarSign size={16} /> Item Costing Review
                                  </h3>
                                  <p className="text-xs text-blue-700 mt-1">Review and approve base costs for each item before converting to project.</p>
                              </div>
                              <div className="flex gap-2">
                                  <button
                                      onClick={() => setShowCostingGuide(true)}
                                      className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 flex items-center gap-2"
                                      title="Learn how to use the costing system"
                                  >
                                      <span>?</span> Help
                                  </button>
                                  <button
                                      onClick={() => setShowCostingReview(true)}
                                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
                                  >
                                      <DollarSign size={14} /> Review Costing
                                  </button>
                              </div>
                          </div>
                          <div className="text-sm text-blue-800">
                              <p><strong>Items:</strong> {activeLead.items.length}</p>
                              <p><strong>Total Value:</strong> ${calculateTotalValue(activeLead.items).toLocaleString()}</p>
                              <p className="mt-2 text-xs">
                                  {activeLead.items.filter((i: any) => (i as any).unitCost === undefined || (i as any).unitCost === null || (i as any).unitCost === 0).length} items need costing review.
                              </p>
                          </div>
                      </div>
                  </div>
              )}

              {activeDetailTab === 'history' && (
                  <div className="space-y-3">
                      <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2"><History size={15} /> Stage Journey</h4>
                      {activeLead.stageHistory && activeLead.stageHistory.length > 0 ? (
                          <div className="relative pl-4 border-l-2 border-gray-200 space-y-4">
                              {activeLead.stageHistory.map((entry, idx) => {
                                  const isCurrent = !entry.exitedAt;
                                  const days = entry.exitedAt
                                      ? entry.daysInStage
                                      : Math.floor((Date.now() - new Date(entry.enteredAt).getTime()) / (1000 * 60 * 60 * 24));
                                  const stageCfg = STAGE_CONFIG.find(s => s.key === entry.stage);
                                  return (
                                      <div key={idx} className="relative">
                                          <div className={`absolute -left-[21px] top-1 w-3.5 h-3.5 rounded-full border-2 ${isCurrent ? 'bg-blue-500 border-blue-300' : 'bg-white border-gray-300'}`} />
                                          <div className={`p-3 rounded-lg border text-sm ${isCurrent ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                                              <div className="flex items-center justify-between">
                                                  <span className="font-semibold text-gray-800">{stageCfg?.label ?? entry.stage}</span>
                                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isCurrent ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{days}d {isCurrent ? '— current' : ''}</span>
                                              </div>
                                              <p className="text-xs text-gray-400 mt-1">
                                                  Entered {new Date(entry.enteredAt).toLocaleDateString()}
                                                  {entry.exitedAt && ` → ${new Date(entry.exitedAt).toLocaleDateString()}`}
                                              </p>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      ) : (
                          <p className="text-sm text-gray-400 italic">No stage history yet. History is tracked from the next stage change.</p>
                      )}
                  </div>
              )}

              {activeDetailTab === 'tasks' && (
                  <div className="space-y-4">
                      {/* ── Next Step section ────────────────────────────── */}
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                          <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2"><Flag size={14} /> Next Step</h4>
                          <div className="flex gap-2">
                              <input
                                  type="text"
                                  className="flex-1 border border-blue-200 rounded p-2 text-sm bg-white"
                                  placeholder="What's the next action? (e.g. Schedule demo, Send proposal...)"
                                  value={nextStepText}
                                  onChange={e => setNextStepText(e.target.value)}
                              />
                              <input
                                  type="date"
                                  className="border border-blue-200 rounded p-2 text-sm bg-white"
                                  value={nextStepDueDateInput}
                                  onChange={e => setNextStepDueDateInput(e.target.value)}
                              />
                              <button
                                  type="button"
                                  onClick={() => {
                                      if (!editedLead) return;
                                      const prev = activeLead?.nextStep;
                                      // Archive previous nextStep if it existed
                                      const completed: CompletedNextStep[] = [...(editedLead.completedNextSteps || [])];
                                      if (prev && prev.trim()) {
                                          completed.push({ text: prev, dueDate: editedLead.nextStepDueDate, completedAt: new Date().toISOString() });
                                      }
                                      const updated = { ...editedLead, nextStep: nextStepText, nextStepDueDate: nextStepDueDateInput, completedNextSteps: completed };
                                      setEditedLead(updated);
                                      setActiveLead(updated);
                                      setIsDirty(true);
                                  }}
                                  className="bg-blue-600 text-white px-4 rounded text-sm hover:bg-blue-700 whitespace-nowrap"
                              >
                                  Set
                              </button>
                          </div>
                          {activeLead.completedNextSteps && activeLead.completedNextSteps.length > 0 && (
                              <div className="mt-3 space-y-1">
                                  <p className="text-xs font-semibold text-blue-700 mb-1">Completed Steps</p>
                                  {activeLead.completedNextSteps.slice(-5).reverse().map((cs, i) => (
                                      <div key={i} className="flex items-start gap-2 text-xs text-gray-500 bg-white rounded px-2 py-1 border border-blue-100">
                                          <CheckCircle2 size={11} className="text-green-500 mt-0.5 flex-shrink-0" />
                                          <span className="line-through flex-1">{cs.text}</span>
                                          <span className="text-gray-300 flex-shrink-0">{new Date(cs.completedAt).toLocaleDateString()}</span>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>

                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <h4 className="text-sm font-bold text-gray-800 mb-3">Add Follow-up / Task</h4>
                          <form onSubmit={handleAddTaskToLead} className="flex flex-col gap-3">
                              <div className="flex gap-2">
                                  <input 
                                      type="text" 
                                      className="flex-1 border border-gray-300 rounded p-2 text-sm" 
                                      placeholder="Task title..." 
                                      value={newTaskForm.title} 
                                      onChange={e => setNewTaskForm({...newTaskForm, title: e.target.value})} 
                                      required
                                  />
                                  <input 
                                      type="date" 
                                      className="border border-gray-300 rounded p-2 text-sm" 
                                      value={newTaskForm.dueDate} 
                                      onChange={e => setNewTaskForm({...newTaskForm, dueDate: e.target.value})} 
                                      required
                                  />
                              </div>
                              <div className="flex gap-2">
                                  <select 
                                      className="border border-gray-300 rounded p-2 text-sm bg-white"
                                      value={newTaskForm.assignee}
                                      onChange={e => setNewTaskForm({...newTaskForm, assignee: e.target.value})}
                                  >
                                      <option value="">Unassigned</option>
                                      {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                                  </select>
                                  <select 
                                      className="border border-gray-300 rounded p-2 text-sm bg-white"
                                      value={newTaskForm.priority}
                                      onChange={e => setNewTaskForm({...newTaskForm, priority: e.target.value as any})}
                                  >
                                      <option value="low">Low Priority</option>
                                      <option value="medium">Medium Priority</option>
                                      <option value="high">High Priority</option>
                                  </select>
                                  <button type="submit" className="bg-blue-600 text-white px-4 rounded text-sm hover:bg-blue-700 ml-auto">Add Task</button>
                              </div>
                          </form>
                      </div>

                      <div className="space-y-2">
                          {activeLead.tasks && activeLead.tasks.length > 0 ? (
                              activeLead.tasks.map(task => (
                                  <div key={task.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                                      <button 
                                          onClick={() => handleToggleTaskStatus(task.id)}
                                          className={`w-5 h-5 rounded border flex items-center justify-center ${task.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent'}`}
                                      >
                                          <CheckCircle2 size={12} fill="currentColor" />
                                      </button>
                                      <div className="flex-1">
                                          <p className={`text-sm font-medium ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{task.title}</p>
                                          <p className="text-xs text-gray-500">
                                              Due: {new Date(task.dueDate!).toLocaleDateString()} • {task.assignee}
                                          </p>
                                      </div>
                                      <span className={`text-[10px] px-2 py-0.5 rounded capitalize border ${task.priority === 'high' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                          {task.priority}
                                      </span>
                                  </div>
                              ))
                          ) : (
                              <p className="text-sm text-gray-400 text-center py-4">No tasks pending for this lead.</p>
                          )}
                      </div>
                  </div>
              )}

              {activeDetailTab === 'expenses' && (
                  <div className="space-y-4">
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <h4 className="text-sm font-bold text-gray-800 mb-3">Log Pre-sales Expense</h4>
                          <form onSubmit={handleAddExpenseToLead} className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <input type="text" placeholder="Expense Title" className="border rounded p-2 text-sm" value={newExpenseForm.title} onChange={e => setNewExpenseForm({...newExpenseForm, title: e.target.value})} required />
                                  <input type="number" placeholder="Amount" className="border rounded p-2 text-sm" value={newExpenseForm.amount || ''} onChange={e => setNewExpenseForm({...newExpenseForm, amount: Number(e.target.value)})} required />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <select className="border rounded p-2 text-sm bg-white" value={newExpenseForm.category} onChange={e => setNewExpenseForm({...newExpenseForm, category: e.target.value as any})}>
                                      <option value="other">Other</option>
                                      <option value="marketing">Marketing</option>
                                      <option value="software">Software</option>
                                      <option value="credit_card">Credit Card</option>
                                  </select>
                                  <input type="date" className="border rounded p-2 text-sm" value={newExpenseForm.date} onChange={e => setNewExpenseForm({...newExpenseForm, date: e.target.value})} required />
                              </div>
                              <button type="submit" className="w-full bg-red-600 text-white rounded p-2 text-sm hover:bg-red-700">Add Expense</button>
                          </form>
                      </div>
                      
                      <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-gray-50 text-gray-500">
                                  <tr>
                                      <th className="p-2">Date</th>
                                      <th className="p-2">Title</th>
                                      <th className="p-2 text-right">Amount</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {transactions.filter(t => t.leadId === activeLead.id).length > 0 ? (
                                      transactions.filter(t => t.leadId === activeLead.id).map(t => (
                                          <tr key={t.id} className="border-t border-gray-100">
                                              <td className="p-2 text-gray-600">{new Date(t.date).toLocaleDateString()}</td>
                                              <td className="p-2">{t.title}</td>
                                              <td className="p-2 text-right text-red-600">-${t.amount}</td>
                                          </tr>
                                      ))
                                  ) : (
                                      <tr><td colSpan={3} className="p-4 text-center text-gray-400">No expenses logged.</td></tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              )}

              {activeDetailTab === 'hours' && (
                  <div className="space-y-4">
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <h4 className="text-sm font-bold text-gray-800 mb-3">Log Pre-sales Hours</h4>
                          <form onSubmit={handleAddTimeLogToLead} className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <select className="border rounded p-2 text-sm bg-white" value={newTimeLogForm.consultantName} onChange={e => setNewTimeLogForm({...newTimeLogForm, consultantName: e.target.value})}>
                                      {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                                  </select>
                                  <input type="number" placeholder="Hours" step="0.5" className="border rounded p-2 text-sm" value={newTimeLogForm.hours || ''} onChange={e => setNewTimeLogForm({...newTimeLogForm, hours: Number(e.target.value)})} required />
                              </div>
                              <input type="text" placeholder="Description of activity" className="w-full border rounded p-2 text-sm" value={newTimeLogForm.description} onChange={e => setNewTimeLogForm({...newTimeLogForm, description: e.target.value})} />
                              <button type="submit" className="w-full bg-blue-600 text-white rounded p-2 text-sm hover:bg-blue-700">Log Time</button>
                          </form>
                      </div>

                      <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm text-left">
                              <thead className="bg-gray-50 text-gray-500">
                                  <tr>
                                      <th className="p-2">Date</th>
                                      <th className="p-2">Consultant</th>
                                      <th className="p-2">Description</th>
                                      <th className="p-2 text-right">Hours</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {activeLead.preSalesTimeLogs && activeLead.preSalesTimeLogs.length > 0 ? (
                                      activeLead.preSalesTimeLogs.map(log => (
                                          <tr key={log.id} className="border-t border-gray-100">
                                              <td className="p-2 text-gray-600">{new Date(log.date).toLocaleDateString()}</td>
                                              <td className="p-2 font-medium">{log.consultantName}</td>
                                              <td className="p-2 text-gray-600 truncate max-w-xs">{log.description}</td>
                                              <td className="p-2 text-right">{log.hours}</td>
                                          </tr>
                                      ))
                                  ) : (
                                      <tr><td colSpan={4} className="p-4 text-center text-gray-400">No time logged.</td></tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WIN/LOSS REASON MODAL */}
      {pendingLostLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Why was this deal lost?</h2>
              <p className="text-sm text-gray-500 mt-1">{pendingLostLead.lead.companyName} — ${pendingLostLead.lead.value.toLocaleString()}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Loss Reason *</label>
                <select
                  value={lostReason}
                  onChange={e => setLostReason(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200"
                >
                  <option value="">Select reason…</option>
                  <option value="Price">Price — too expensive</option>
                  <option value="Competitor">Competitor won the deal</option>
                  <option value="No Budget">No budget / budget cut</option>
                  <option value="No Decision">No decision / stalled</option>
                  <option value="Timeline">Timeline mismatch</option>
                  <option value="Fit">Poor product fit</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Competitor (optional)</label>
                <input
                  type="text"
                  placeholder="Which competitor?"
                  value={lostCompetitor}
                  onChange={e => setLostCompetitor(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Notes (optional)</label>
                <textarea
                  rows={3}
                  placeholder="Any additional context…"
                  value={lostNote}
                  onChange={e => setLostNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200 resize-none"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setPendingLostLead(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmLostStageChange}
                disabled={!lostReason}
                className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Mark as Lost
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proposal PDF Print Modal */}
      {showProposalPrint && activeLead && (
        <ProposalPrint lead={activeLead} onClose={() => setShowProposalPrint(false)} />
      )}

      {/* Veracode Quote Wizard */}
      {showVeracodeWizard && activeLead && (
        <VeracodeQuoteWizard
          lead={activeLead}
          existingConfig={(activeLead.customData as any)?.veracodeConfig as VeracodeConfig | undefined}
          onGenerate={async (items, config) => {
            const mergedItems = [...(activeLead.items || []).filter(i => !i.id.startsWith('vc_')), ...items];
            const updated = {
              ...activeLead,
              items: mergedItems,
              customData: { ...(activeLead.customData || {}), veracodeConfig: config },
            };

            // Sync items to backend (bidirectional sync: quotation → costing)
            try {
              const response = await fetch(`/api/leads/${activeLead.id}/items`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ items: mergedItems })
              });
              const data = await response.json();
              if (response.ok && data.lead) {
                // Update with synced data from backend (which includes costingItems)
                updateLead(data.lead);
                setActiveLead(data.lead);
                setEditedLead(data.lead);
              } else {
                throw new Error(data.error || 'Failed to sync items');
              }
            } catch (err: any) {
              console.error('Error syncing items to costing:', err);
              // Still update locally even if sync fails
              updateLead(updated);
              setActiveLead(updated);
              setEditedLead(updated);
            }

            setShowVeracodeWizard(false);
          }}
          onClose={() => setShowVeracodeWizard(false)}
        />
      )}

      {/* Costing Review Modal */}
      {showCostingReview && activeLead && (
        <CostingReview
          leadId={activeLead.id}
          items={((activeLead as any).costingItems || []).length > 0
            ? (activeLead as any).costingItems.map((item: any) => ({
                id: item.id,
                name: item.name || item.description,
                price: item.price || 0,
                baseCost: item.baseCost,
                costOverrideReason: item.costOverrideReason,
                estimatedHours: item.estimatedHours,
                costStatus: item.costStatus || 'pending',
                quantity: item.quantity,
              }))
            : (activeLead.items || []).map((item: any) => ({
                id: item.id,
                name: item.description || item.name,
                price: item.unitPrice || item.total || item.price || 0,
                baseCost: item.unitCost || item.baseCost,
                costOverrideReason: item.costOverrideReason,
                estimatedHours: item.estimatedHours,
                costStatus: item.costStatus || 'pending',
                quantity: item.quantity,
              }))}
          onSave={handleSaveCostingItems}
          onReview={handleReviewCosting}
          onClose={() => setShowCostingReview(false)}
          currentUserId={currentUser.id}
          canApproveCosting={(currentUser as any).canApproveCosting || currentUser.role === 'admin' || false}
        />
      )}

      {/* Costing System Guide */}
      {showCostingGuide && (
        <CostingSystemGuide onClose={() => setShowCostingGuide(false)} />
      )}
    </div>
  );
};
