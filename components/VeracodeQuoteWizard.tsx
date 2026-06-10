import React, { useState, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { LineItem, SKUCategory, Lead } from '../types';
import { X, ChevronRight, ChevronLeft, Code2, Package, Zap, Globe, Settings, Check, Users, Layout, Calendar, Shield, Download, ExternalLink, Loader, GitBranch } from 'lucide-react';
import { apiFetch, sanitizeId, sanitizeHttpsUrl } from '../services/apiFetch';

export interface VeracodeConfig {
  developers: number;
  profiles: number;
  modules: string[];
  years: number;
  notes: string;
  cicdPlatform: string;
}

// ── CI/CD Platforms ────────────────────────────────────────────────────────────
const CICD_PLATFORMS = [
  { id: 'azure-devops',    label: 'Azure DevOps',         emoji: '🔷' },
  { id: 'github-actions',  label: 'GitHub Actions',        emoji: '⚫' },
  { id: 'gitlab-ci',       label: 'GitLab CI/CD',          emoji: '🦊' },
  { id: 'jenkins',         label: 'Jenkins',               emoji: '🔧' },
  { id: 'bitbucket',       label: 'Bitbucket Pipelines',   emoji: '🔵' },
];

// ── Module catalog ────────────────────────────────────────────────────────────
const MODULES = [
  {
    id: 'SAST',
    label: 'Static Application Security Testing',
    desc: 'Análisis estático del código fuente. Detecta vulnerabilidades (OWASP Top 10, CWE) sin ejecutar la aplicación.',
    technical: 'Integra con IDE, CI/CD (Jenkins, GitHub Actions, Azure DevOps). Soporta 20+ lenguajes. Genera hallazgos con trazabilidad de flujo.',
    unit: 'developer' as const,
    icon: Code2,
    color: '#7C3AED',
    bg: 'bg-purple-50 border-purple-200',
    selected_bg: 'bg-purple-100 border-purple-400',
  },
  {
    id: 'SCA',
    label: 'Software Composition Analysis',
    desc: 'Detección de vulnerabilidades (CVEs) en dependencias y librerías open source.',
    technical: 'Genera SBOM (Software Bill of Materials). Análisis de licencias. Políticas de bloqueo en pipelines CI/CD.',
    unit: 'developer' as const,
    icon: Package,
    color: '#2563EB',
    bg: 'bg-blue-50 border-blue-200',
    selected_bg: 'bg-blue-100 border-blue-400',
  },
  {
    id: 'FIX',
    label: 'Veracode Fix — AI Remediation',
    desc: 'Corrección automática de hallazgos SAST con inteligencia artificial. Add-on de SAST.',
    technical: 'Motor de IA generativa que propone parches de código en el IDE del desarrollador. Reducción del tiempo de remediación hasta 80%.',
    unit: 'developer' as const,
    icon: Zap,
    color: '#059669',
    bg: 'bg-emerald-50 border-emerald-200',
    selected_bg: 'bg-emerald-100 border-emerald-400',
  },
  {
    id: 'DAST',
    label: 'Dynamic Application Security Testing',
    desc: 'Escaneo de aplicaciones web en ejecución simulando ataques externos (black-box).',
    technical: 'Cobertura de endpoints REST/SOAP. Autenticación OAuth 2.0. Integración con JIRA. Escaneo programado y bajo demanda.',
    unit: 'profile' as const,
    icon: Globe,
    color: '#D97706',
    bg: 'bg-amber-50 border-amber-200',
    selected_bg: 'bg-amber-100 border-amber-400',
  },
  {
    id: 'PF',
    label: 'Policy & Findings Platform',
    desc: 'Plataforma centralizada para gestión de políticas de seguridad y hallazgos en toda la organización.',
    technical: 'Dashboard ejecutivo. Gestión de excepciones. Reporting de cumplimiento (SOC2, PCI-DSS, ISO 27001). API REST completa.',
    unit: 'flat' as const,
    icon: Settings,
    color: '#DC2626',
    bg: 'bg-red-50 border-red-200',
    selected_bg: 'bg-red-100 border-red-400',
  },
  {
    id: 'VRM',
    label: 'Vulnerability Risk Management',
    desc: 'Gestión centralizada de riesgo de vulnerabilidades con scoring priorizado y SLAs de remediación.',
    technical: 'Integración con ticketing (JIRA, ServiceNow). Scoring CVSS/EPSS. Dashboard de riesgo para CISO. SLAs de remediación configurables por severidad.',
    unit: 'flat' as const,
    icon: Shield,
    color: '#0F172A',
    bg: 'bg-slate-50 border-slate-200',
    selected_bg: 'bg-slate-100 border-slate-400',
  },
];

// Default pricing (USD, per unit, annual)
const BASE: Record<string, { price: number; cost: number }> = {
  SAST: { price: 180,  cost: 90   },
  SCA:  { price: 90,   cost: 45   },
  FIX:  { price: 60,   cost: 30   },
  DAST: { price: 600,  cost: 300  },
  PF:   { price: 3500, cost: 1750 },
  VRM:  { price: 8000, cost: 4000 },
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

interface EditableItem {
  moduleId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
}

interface Props {
  lead?: Lead;
  existingConfig?: VeracodeConfig;
  onGenerate: (items: LineItem[], config: VeracodeConfig) => void;
  onClose: () => void;
}

export function VeracodeQuoteWizard({ lead, existingConfig, onGenerate, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [cicdPlatform, setCicdPlatform] = useState(existingConfig?.cicdPlatform ?? '');
  const [modules, setModules] = useState<string[]>(existingConfig?.modules ?? ['SAST', 'SCA']);
  const [developers, setDevelopers] = useState(existingConfig?.developers ?? 50);
  const [profiles, setProfiles] = useState(existingConfig?.profiles ?? 5);
  const [years, setYears] = useState(existingConfig?.years ?? 1);
  const [notes, setNotes] = useState(existingConfig?.notes ?? '');

  // Step 2 — editable items
  const generated = useMemo<EditableItem[]>(() => modules.map(id => {
    const mod = MODULES.find(m => m.id === id)!;
    const base = BASE[id];
    const qty = mod.unit === 'developer' ? developers
              : mod.unit === 'profile'   ? profiles
              : 1;
    return {
      moduleId: id,
      description: `Veracode ${id} — ${mod.label}${years > 1 ? ` (${years} yr)` : ''}`,
      quantity: qty,
      unitPrice: base.price * years,
      unitCost: base.cost * years,
    };
  }), [modules, developers, profiles, years]);

  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const itemsToShow = step === 2 ? editableItems : generated;
  const subtotal = itemsToShow.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  // Step 3 — proposal generation state
  const [generating, setGenerating] = useState(false);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [proposalHtml, setProposalHtml] = useState<string | null>(null);
  // Sanitized once; used in both dangerouslySetInnerHTML and srcDoc so Veracode can
  // trace that untrusted HTML always passes through DOMPurify before any DOM sink.
  const sanitizedProposalHtml = useMemo(() => DOMPurify.sanitize(proposalHtml ?? ''), [proposalHtml]);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [uploadingDrive, setUploadingDrive] = useState(false);
  const proposalRef = useRef<HTMLDivElement>(null);

  const toggleModule = (id: string) => {
    setModules(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const goToStep2 = () => {
    setEditableItems(generated.map(g => ({ ...g })));
    setStep(2);
  };

  const updateItem = (idx: number, field: 'unitPrice' | 'quantity', value: number) => {
    setEditableItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const buildConfig = (): VeracodeConfig => ({
    developers, profiles, modules, years, notes, cicdPlatform,
  });

  const buildLineItems = (): LineItem[] => editableItems.map(item => ({
    id: `vc_${item.moduleId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    category: 'license' as SKUCategory,
    description: item.description,
    quantity: item.quantity,
    unitCost: item.unitCost,
    margin: item.unitPrice > 0 ? ((item.unitPrice - item.unitCost) / item.unitPrice) * 100 : 0,
    unitPrice: item.unitPrice,
    total: item.quantity * item.unitPrice,
    years,
  }));

  const handleConfirmAndGenerate = async () => {
    const config = buildConfig();
    const lineItems = buildLineItems();
    onGenerate(lineItems, config);

    if (!lead) return;
    setStep(3);
    setGenerating(true);
    setGenerateError(null);

    try {
      const res = await apiFetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leadId: lead.id, veracodeConfig: config }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setProposalId(data.id ?? data._id ?? null);
      setProposalHtml(data.htmlContent ?? '');
    } catch (err: any) {
      setGenerateError(err.message ?? 'Error generando propuesta');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!proposalRef.current) return;
    const html2pdf = (window as any).html2pdf;
    if (!html2pdf) {
      alert('html2pdf no está cargado. Verifica el CDN en index.html.');
      return;
    }
    const filename = `Propuesta_Veracode_${(lead?.companyName ?? 'cliente').replace(/\s+/g, '_')}_${(lead?.projectName ?? 'proyecto').replace(/\s+/g, '_')}.pdf`;
    html2pdf().set({
      margin: 10,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(proposalRef.current).save();
  };

  const handleUploadDrive = async () => {
    if (!proposalRef.current || !proposalId || !lead) return;
    const html2pdf = (window as any).html2pdf;
    if (!html2pdf) {
      alert('html2pdf no está cargado.');
      return;
    }
    setUploadingDrive(true);
    try {
      const blob: Blob = await html2pdf().set({
        margin: 10,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(proposalRef.current).outputPdf('blob');

      const reader = new FileReader();
      const pdfBase64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const filename = `Propuesta_Veracode_${(lead.companyName ?? 'cliente').replace(/\s+/g, '_')}_${(lead.projectName ?? 'proyecto').replace(/\s+/g, '_')}.pdf`;
      const res = await apiFetch(`/api/proposals/${sanitizeId(proposalId)}/upload-drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pdfBase64, filename }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setDriveUrl(data.driveFileUrl ?? null);
    } catch (err: any) {
      alert(`Error al subir a Drive: ${err.message}`);
    } finally {
      setUploadingDrive(false);
    }
  };

  const totalSteps = lead ? 3 : 2;
  const progressPct = step === 1 ? 33 : step === 2 ? 66 : 100;
  const stepLabel = step === 1 ? 'Plataforma & Módulos' : step === 2 ? 'Revisar cotización' : 'Propuesta técnica';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#410074' }}>
              <Settings size={16} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">
                Cotización Veracode
                {lead && <span className="text-gray-400 font-normal ml-1">— {lead.companyName}</span>}
              </p>
              <p className="text-xs text-gray-400">Paso {step} de {totalSteps} — {stepLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded hover:bg-gray-100 transition">
            <X size={18} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div className="h-1 transition-all duration-300" style={{ width: `${progressPct}%`, background: '#410074' }} />
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <div className="space-y-5">

              {/* CI/CD Platform Selector */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <GitBranch size={12} /> Plataforma CI/CD de integración
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {CICD_PLATFORMS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCicdPlatform(p.id)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 text-[10px] font-semibold transition ${
                        cicdPlatform === p.id
                          ? 'border-purple-500 bg-purple-50 text-purple-800'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                    >
                      <span className="text-xl">{p.emoji}</span>
                      <span className="text-center leading-tight">{p.label}</span>
                    </button>
                  ))}
                </div>
                {!cicdPlatform && (
                  <p className="text-[10px] text-amber-600 mt-1">Selecciona una plataforma para personalizar la propuesta técnica.</p>
                )}
              </div>

              {/* Module selector */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Módulos a licenciar</p>
                <div className="space-y-2">
                  {MODULES.map(mod => {
                    const Icon = mod.icon;
                    const selected = modules.includes(mod.id);
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => toggleModule(mod.id)}
                        className={`w-full text-left rounded-xl border-2 px-4 py-3 transition ${selected ? mod.selected_bg : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selected ? 'opacity-100' : 'opacity-50'}`} style={{ background: mod.color + '20' }}>
                            <Icon size={16} style={{ color: mod.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black tracking-wide" style={{ color: mod.color }}>{mod.id}</span>
                              <span className="text-sm font-semibold text-gray-800">{mod.label}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{mod.desc}</p>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${selected ? 'border-transparent' : 'border-gray-300'}`}
                            style={selected ? { background: mod.color } : {}}
                          >
                            {selected && <Check size={11} className="text-white" strokeWidth={3} />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Config row */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                    <Users size={12} /> Desarrolladores
                  </label>
                  <input
                    type="number" min={1}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-center font-bold text-gray-800 outline-none focus:ring-2 focus:ring-purple-200"
                    value={developers}
                    onChange={e => setDevelopers(Math.max(1, Number(e.target.value)))}
                  />
                  <p className="text-[10px] text-gray-400 mt-1 text-center">aplica a SAST/SCA/FIX</p>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                    <Layout size={12} /> Perfiles Veracode
                  </label>
                  <input
                    type="number" min={1}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-center font-bold text-gray-800 outline-none focus:ring-2 focus:ring-purple-200"
                    value={profiles}
                    onChange={e => setProfiles(Math.max(1, Number(e.target.value)))}
                  />
                  <p className="text-[10px] text-gray-400 mt-1 text-center">aplica a DAST</p>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                    <Calendar size={12} /> Término
                  </label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-center font-bold text-gray-800 outline-none focus:ring-2 focus:ring-purple-200"
                    value={years}
                    onChange={e => setYears(Number(e.target.value))}
                  >
                    <option value={1}>1 año</option>
                    <option value={2}>2 años</option>
                    <option value={3}>3 años</option>
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1 text-center">precio anual × años</p>
                </div>
              </div>

              {/* Live preview total */}
              {modules.length > 0 && (
                <div className="rounded-xl p-3 flex items-center justify-between text-sm" style={{ background: '#F5F0FF' }}>
                  <span className="text-gray-600">Valor estimado ({modules.length} módulo{modules.length > 1 ? 's' : ''})</span>
                  <span className="font-black text-lg" style={{ color: '#410074' }}>{fmt(generated.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}</span>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div className="space-y-4">
              {cicdPlatform && (
                <div className="flex items-center gap-2 text-xs bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-purple-700">
                  <GitBranch size={12} />
                  <span>CI/CD: <strong>{CICD_PLATFORMS.find(p => p.id === cicdPlatform)?.label}</strong></span>
                </div>
              )}
              <p className="text-xs text-gray-400">Ajusta precios si es necesario antes de confirmar. Los costos internos no aparecen en la propuesta.</p>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200 text-xs text-gray-500 uppercase">
                    <th className="text-left py-2">Descripción</th>
                    <th className="text-center py-2 w-20">Cant.</th>
                    <th className="text-right py-2 w-28">Precio Unit.</th>
                    <th className="text-right py-2 w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {editableItems.map((item, idx) => {
                    const mod = MODULES.find(m => m.id === item.moduleId);
                    return (
                      <tr key={item.moduleId} className="border-b border-gray-100">
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black px-1.5 py-0.5 rounded" style={{ background: (mod?.color ?? '#410074') + '20', color: mod?.color ?? '#410074' }}>{item.moduleId}</span>
                            <span className="text-gray-700 text-xs truncate max-w-[160px]">{item.description}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-1">
                          <input
                            type="number" min={1}
                            className="w-16 border border-gray-200 rounded px-2 py-1 text-xs text-center outline-none focus:ring-1 focus:ring-purple-300"
                            value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', Math.max(1, Number(e.target.value)))}
                          />
                        </td>
                        <td className="py-2.5 pl-1">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-gray-400">$</span>
                            <input
                              type="number" min={0}
                              className="w-24 border border-gray-200 rounded px-2 py-1 text-xs text-right outline-none focus:ring-1 focus:ring-purple-300"
                              value={item.unitPrice}
                              onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))}
                            />
                          </div>
                        </td>
                        <td className="py-2.5 text-right font-semibold text-gray-800 text-xs">
                          {fmt(item.quantity * item.unitPrice)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Total */}
              <div className="flex justify-end">
                <div className="rounded-xl px-5 py-3 text-right" style={{ background: '#F5F0FF' }}>
                  <p className="text-xs text-gray-500 mb-0.5">{developers} devs · {profiles} perfiles · {years} año{years > 1 ? 's' : ''}</p>
                  <p className="text-2xl font-black" style={{ color: '#410074' }}>{fmt(subtotal)}</p>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Notas de alcance (aparecen en la propuesta)</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200 resize-none"
                  rows={3}
                  placeholder="Ej: Incluye onboarding de 2 días, soporte de configuración de pipelines CI/CD..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ── STEP 3 — Proposal Generation ── */}
          {step === 3 && (
            <div className="space-y-4">
              {generating && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                  <Loader size={32} className="animate-spin" style={{ color: '#410074' }} />
                  <p className="text-sm font-medium">Generando propuesta técnica con IA…</p>
                  <p className="text-xs text-gray-400">Esto puede tomar 10–30 segundos</p>
                </div>
              )}

              {generateError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                  <p className="font-semibold mb-1">Error al generar propuesta</p>
                  <p>{generateError}</p>
                </div>
              )}

              {proposalHtml && !generating && (
                <div className="space-y-3">
                  {/* Action buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleDownloadPDF}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg font-medium transition"
                      style={{ background: '#410074' }}
                    >
                      <Download size={15} /> Descargar PDF
                    </button>
                    {!driveUrl ? (
                      <button
                        onClick={handleUploadDrive}
                        disabled={uploadingDrive}
                        className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        {uploadingDrive ? <Loader size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                        {uploadingDrive ? 'Subiendo…' : 'Subir a Google Drive'}
                      </button>
                    ) : (
                      <a
                        href={(() => {
                          try {
                            const sanitized = sanitizeHttpsUrl(driveUrl);
                            if (!sanitized.startsWith('https://drive.google.com/')) {
                              return '#';
                            }
                            return sanitized;
                          } catch {
                            return '#';
                          }
                        })()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 text-sm border border-green-200 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition"
                      >
                        <ExternalLink size={14} /> Ver en Google Drive
                      </a>
                    )}
                  </div>

                  {/* Lead info summary */}
                  {lead && (
                    <div className="flex items-center gap-4 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                      <span>📁 <strong>{lead.country}</strong> / <strong>{lead.companyName}</strong> / <strong>{(lead as any).projectName || 'Sin proyecto'}</strong></span>
                    </div>
                  )}

                  {/* Proposal HTML preview */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-b border-gray-200 flex items-center justify-between">
                      <span>Vista previa de la propuesta</span>
                      <span className="text-gray-400">Scroll para ver completa</span>
                    </div>
                    {/* Hidden div keeps ref for html2pdf PDF export — content sanitized with DOMPurify */}
                    <div ref={proposalRef} dangerouslySetInnerHTML={{ __html: sanitizedProposalHtml }} className="sr-only" aria-hidden="true" />
                    <div className="max-h-64 overflow-y-auto">
                      <iframe
                        srcDoc={sanitizedProposalHtml}
                        className="w-full border-0"
                        style={{ minHeight: '240px' }}
                        title="Proposal preview"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          {step > 1 && step < 3 ? (
            <button onClick={() => setStep(s => (s - 1) as 1 | 2)} className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200 transition">
              <ChevronLeft size={15} /> Atrás
            </button>
          ) : <div />}

          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg border border-gray-200 transition">
              {step === 3 ? 'Cerrar' : 'Cancelar'}
            </button>
            {step === 1 && (
              <button
                onClick={goToStep2}
                disabled={modules.length === 0}
                className="flex items-center gap-1.5 px-5 py-2 text-sm text-white rounded-lg disabled:opacity-40 transition font-medium"
                style={{ background: '#410074' }}
              >
                Revisar cotización <ChevronRight size={15} />
              </button>
            )}
            {step === 2 && (
              <button
                onClick={handleConfirmAndGenerate}
                className="flex items-center gap-1.5 px-5 py-2 text-sm text-white rounded-lg transition font-medium"
                style={{ background: '#410074' }}
              >
                <Check size={15} /> {lead ? 'Guardar & Generar Propuesta' : 'Generar cotización'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
