import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Lead, LineItem } from '../types';
import type { VeracodeConfig } from './VeracodeQuoteWizard';
import { Save, Edit3, Eye, ChevronDown, Check, Trash2, FileText } from 'lucide-react';

interface ProposalContent {
  executiveSummary: string;
  solutionOverview: string;
  methodology: string;
  whyBlackmoon: string;
  nextSteps: string;
  generatedAt?: string;
}

interface SavedProposal {
  id: string;
  leadId: string;
  name: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  version: number;
  totalValue: number;
  createdAt: string;
}

const VERACODE_MODULE_DETAIL: Record<string, { label: string; technical: string; color: string }> = {
  SAST: { label: 'Static Application Security Testing', technical: 'Análisis estático de código fuente. Detecta vulnerabilidades OWASP Top 10 / CWE sin ejecutar la aplicación. Integra con IDE, CI/CD (Jenkins, GitHub Actions, Azure DevOps). Soporta 20+ lenguajes.', color: '#7C3AED' },
  SCA:  { label: 'Software Composition Analysis',       technical: 'Detección de CVEs en dependencias open source. Genera SBOM (Software Bill of Materials). Análisis de licencias. Políticas de bloqueo en pipelines CI/CD.', color: '#2563EB' },
  FIX:  { label: 'Veracode Fix — AI Remediation',       technical: 'Corrección automática de hallazgos SAST con IA generativa. Propone parches de código directamente en el IDE del desarrollador. Reducción del tiempo de remediación hasta 80%.', color: '#059669' },
  DAST: { label: 'Dynamic Application Security Testing', technical: 'Escaneo de aplicaciones web en ejecución simulando ataques externos (black-box). Cobertura de endpoints REST/SOAP. Autenticación OAuth 2.0. Integración con JIRA.', color: '#D97706' },
  PF:   { label: 'Policy & Findings Platform',           technical: 'Dashboard ejecutivo centralizado. Gestión de excepciones y hallazgos. Reporting de cumplimiento (SOC2, PCI-DSS, ISO 27001). API REST completa para integraciones custom.', color: '#DC2626' },
};

interface Props {
  lead: Lead;
  onClose: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const CATEGORY_LABELS: Record<string, string> = {
  license: 'Software License',
  vendor_support: 'Vendor Support',
  blackmoon_support: 'Blackmoon Support',
  implementation: 'Implementation',
  hours_pack: 'Hours Pack',
};

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export function ProposalPrint({ lead, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [proposalContent, setProposalContent] = useState<ProposalContent | null>(
    (lead.customData as any)?.proposalContent ?? null
  );
  const [templateHtml, setTemplateHtml] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editHtml, setEditHtml] = useState('');
  const [livePreview, setLivePreview] = useState('');

  // Save proposal
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [proposalName, setProposalName] = useState('');
  const [savingProposal, setSavingProposal] = useState(false);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);

  // Saved proposals list
  const [savedProposals, setSavedProposals] = useState<SavedProposal[]>([]);
  const [showProposalList, setShowProposalList] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  // Fetch default template + saved proposals list on mount
  useEffect(() => {
    const init = async () => {
      // Fetch saved proposals (no htmlContent)
      try {
        const r = await fetch(`/api/proposals?leadId=${lead.id}`, { credentials: 'include' });
        if (r.ok) setSavedProposals(await r.json());
      } catch { /* ignore */ }
      setLoadingList(false);

      // Fetch default template
      try {
        const res = await fetch('/api/proposal-templates/meta/default', { credentials: 'include' });
        if (res.ok) {
          const meta = await res.json();
          if (meta?.id) {
            setTemplateId(meta.id);
            const applyRes = await fetch(`/api/proposal-templates/${meta.id}/apply`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ leadId: lead.id }),
            });
            if (applyRes.ok) {
              const { html } = await applyRes.json();
              setTemplateHtml(html);
            }
          }
        }
      } catch { /* fall back to React layout */ }
      setLoadingTemplate(false);
    };
    init();
  }, [lead.id]);

  // Debounce live preview in edit mode
  useEffect(() => {
    const t = setTimeout(() => setLivePreview(editHtml), 300);
    return () => clearTimeout(t);
  }, [editHtml]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editMode) onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, editMode]);

  const handleGenerateAI = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leadId: lead.id }),
      });
      if (!res.ok) { const err = await res.json(); alert(err.error || 'Error generando propuesta'); return; }
      const { content } = await res.json();
      setProposalContent(content);

      // Re-apply template with fresh AI content
      if (templateId) {
        const applyRes = await fetch(`/api/proposal-templates/${templateId}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ leadId: lead.id }),
        });
        if (applyRes.ok) {
          const { html } = await applyRes.json();
          setTemplateHtml(html);
          if (editMode) { setEditHtml(html); setLivePreview(html); }
        }
      }
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setGenerating(false); }
  };

  const handlePrint = () => {
    const content = editMode ? livePreview : templateHtml;
    if (content) {
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(content);
      win.document.close();
      win.focus();
      win.print();
      win.close();
      return;
    }
    if (!ref.current) return;
    ref.current.classList.add('crm-print-target');
    window.print();
    ref.current.classList.remove('crm-print-target');
  };

  const enterEditMode = () => {
    const html = templateHtml || '';
    setEditHtml(html);
    setLivePreview(html);
    setEditMode(true);
  };

  const handleSaveProposal = async () => {
    const html = editMode ? editHtml : (templateHtml || '');
    if (!html) return;
    const name = proposalName.trim() || `Propuesta v${savedProposals.length + 1} — ${lead.companyName}`;
    setSavingProposal(true);
    try {
      const total = lead.items.reduce((s, i) => s + i.total, 0);
      if (activeProposalId) {
        // Update existing
        const res = await fetch(`/api/proposals/${activeProposalId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name, htmlContent: html, totalValue: total }),
        });
        if (res.ok) {
          setSavedProposals(prev => prev.map(p => p.id === activeProposalId ? { ...p, name } : p));
        }
      } else {
        const res = await fetch('/api/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ leadId: lead.id, name, htmlContent: html, templateId, totalValue: total }),
        });
        if (res.ok) {
          const saved = await res.json();
          setActiveProposalId(saved.id);
          setSavedProposals(prev => [{ ...saved }, ...prev]);
        }
      }
      setShowSaveForm(false);
      setProposalName('');
    } finally { setSavingProposal(false); }
  };

  const loadProposal = async (p: SavedProposal) => {
    const res = await fetch(`/api/proposals/${p.id}`, { credentials: 'include' });
    if (!res.ok) return;
    const full = await res.json();
    setTemplateHtml(full.htmlContent);
    setActiveProposalId(p.id);
    setShowProposalList(false);
    if (editMode) { setEditHtml(full.htmlContent); setLivePreview(full.htmlContent); }
  };

  const deleteProposal = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('¿Eliminar esta propuesta guardada?')) return;
    await fetch(`/api/proposals/${id}`, { method: 'DELETE', credentials: 'include' });
    setSavedProposals(prev => prev.filter(p => p.id !== id));
    if (activeProposalId === id) setActiveProposalId(null);
  };

  const updateStatus = async (id: string, status: SavedProposal['status']) => {
    const res = await fetch(`/api/proposals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });
    if (res.ok) setSavedProposals(prev => prev.map(p => p.id === id ? { ...p, status } : p));
  };

  const hasVeracode = !!(lead.customData as any)?.veracodeConfig;
  const currentHtml = editMode ? livePreview : templateHtml;

  const grouped = lead.items.reduce<Record<string, LineItem[]>>((acc, item) => {
    const key = item.category || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const subtotal = lead.items.reduce((s, i) => s + i.total, 0);
  const totalCost = lead.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const grossMargin = subtotal > 0 ? ((subtotal - totalCost) / subtotal) * 100 : 0;

  // ── Edit mode layout ──────────────────────────────────────────────────────
  if (editMode) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
        {/* Edit toolbar */}
        <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-700 text-sm">Editar Propuesta</span>
            <span className="text-xs text-gray-400">{lead.companyName}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowSaveForm(v => !v); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg font-medium"
              style={{ background: '#410074' }}
            >
              <Save size={13} /> Guardar
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg font-medium"
            >
              Print / PDF
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200"
            >
              <Eye size={13} className="inline mr-1" />Vista previa
            </button>
          </div>
        </div>

        {/* Save form inline */}
        {showSaveForm && (
          <div className="bg-purple-50 border-b border-purple-200 px-4 py-2 flex items-center gap-3 flex-shrink-0">
            <input
              autoFocus
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"
              placeholder={`Propuesta v${savedProposals.length + 1} — ${lead.companyName}`}
              value={proposalName}
              onChange={e => setProposalName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveProposal(); if (e.key === 'Escape') setShowSaveForm(false); }}
            />
            <button onClick={handleSaveProposal} disabled={savingProposal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50"
              style={{ background: '#410074' }}>
              {savingProposal ? '...' : <><Check size={13} /> Confirmar</>}
            </button>
          </div>
        )}

        {/* Split: HTML editor | live preview */}
        <div className="flex-1 flex overflow-hidden">
          <textarea
            className="w-1/2 h-full p-4 font-mono text-xs bg-gray-900 text-green-300 resize-none outline-none border-r border-gray-700"
            value={editHtml}
            onChange={e => setEditHtml(e.target.value)}
            spellCheck={false}
          />
          <div className="w-1/2 h-full overflow-auto bg-white">
            {livePreview ? (
              <iframe
                srcDoc={livePreview}
                className="w-full h-full border-0"
                title="Live preview"
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300 text-sm">
                Vista previa aparecerá aquí
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Preview mode layout ───────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-auto py-8 px-4">
      <div ref={ref} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 no-print">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-700">Proposal Preview</span>

            {/* Saved proposals dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowProposalList(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                <FileText size={12} />
                {loadingList ? '...' : `${savedProposals.length} guardada${savedProposals.length !== 1 ? 's' : ''}`}
                <ChevronDown size={11} />
              </button>
              {showProposalList && (
                <div className="absolute left-0 top-8 z-10 w-80 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Propuestas guardadas
                  </div>
                  {savedProposals.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-gray-400 text-center">No hay propuestas guardadas aún</div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto">
                      {savedProposals.map(p => (
                        <div
                          key={p.id}
                          className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 ${activeProposalId === p.id ? 'bg-purple-50' : ''}`}
                          onClick={() => loadProposal(p)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate">{p.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status]}`}>
                                {p.status}
                              </span>
                              <span className="text-[10px] text-gray-400">v{p.version}</span>
                              <span className="text-[10px] text-gray-400">{new Date(p.createdAt).toLocaleDateString('es-ES')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <select
                              value={p.status}
                              onClick={e => e.stopPropagation()}
                              onChange={e => { e.stopPropagation(); updateStatus(p.id, e.target.value as any); }}
                              className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white outline-none"
                            >
                              <option value="draft">draft</option>
                              <option value="sent">sent</option>
                              <option value="accepted">accepted</option>
                              <option value="rejected">rejected</option>
                            </select>
                            <button onClick={e => deleteProposal(p.id, e)} className="text-gray-300 hover:text-red-500 p-0.5">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 items-center">
            {hasVeracode && (
              <button
                onClick={handleGenerateAI}
                disabled={generating}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg transition font-medium disabled:opacity-60"
                style={{ background: '#410074' }}
                title="Genera secciones técnicas personalizadas con Claude AI"
              >
                {generating ? (
                  <><span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full" /> Generando...</>
                ) : (
                  <>{proposalContent ? '↻ Regenerar con IA' : '✦ Generar propuesta técnica'}</>
                )}
              </button>
            )}

            {/* Edit button — only when template is loaded */}
            {templateHtml && (
              <button
                onClick={enterEditMode}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium"
              >
                <Edit3 size={13} /> Editar
              </button>
            )}

            {/* Save proposal */}
            <div className="relative">
              <button
                onClick={() => setShowSaveForm(v => !v)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg font-medium"
                style={{ background: '#0ea5e9' }}
              >
                <Save size={13} /> Guardar
              </button>
              {showSaveForm && (
                <div className="absolute right-0 top-10 z-10 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-600">Nombre de la propuesta</p>
                  <input
                    autoFocus
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"
                    placeholder={`Propuesta v${savedProposals.length + 1} — ${lead.companyName}`}
                    value={proposalName}
                    onChange={e => setProposalName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveProposal(); if (e.key === 'Escape') setShowSaveForm(false); }}
                  />
                  {activeProposalId && (
                    <p className="text-[10px] text-purple-600">Actualizará la propuesta cargada actualmente</p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={handleSaveProposal} disabled={savingProposal}
                      className="flex-1 py-1.5 text-sm text-white rounded-lg disabled:opacity-50 font-medium"
                      style={{ background: '#410074' }}>
                      {savingProposal ? '...' : <><Check size={13} className="inline mr-1" />Guardar</>}
                    </button>
                    <button onClick={() => setShowSaveForm(false)} className="px-3 py-1.5 text-sm text-gray-500 border rounded-lg hover:bg-gray-50">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handlePrint}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Print / Save PDF
            </button>
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200 transition">
              Close
            </button>
          </div>
        </div>

        {/* Template-based preview */}
        {loadingTemplate ? (
          <div className="flex items-center justify-center h-96 text-gray-400 text-sm">Cargando template...</div>
        ) : currentHtml ? (
          <iframe
            srcDoc={currentHtml}
            className="w-full border-0 rounded-b-2xl"
            style={{ minHeight: '80vh' }}
            title="Proposal template preview"
            sandbox="allow-same-origin"
          />
        ) : null}

        {/* React fallback layout — shown only when no template */}
        {!loadingTemplate && !currentHtml && <div className="p-10 space-y-8 text-gray-800">
          {/* Header with logo */}
          <div className="flex items-start justify-between">
            <div>
              <img
                src="/blackmoon-logo.svg"
                alt="Blackmoon Consulting"
                style={{ height: 52, width: 'auto' }}
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = 'none';
                  el.insertAdjacentHTML('afterend', '<div style="font-size:22px;font-weight:900;color:#410074;letter-spacing:-0.5px">BLACKMOON<div style="font-size:9px;color:#7C3AED;letter-spacing:3px;font-weight:400">CONSULTING</div></div>');
                }}
              />
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold text-gray-900">{new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              <div className="text-gray-400 text-xs mt-0.5">Ref: {lead.id.slice(-8).toUpperCase()}</div>
              {proposalContent?.generatedAt && (
                <div className="text-gray-300 text-xs mt-0.5">IA: {new Date(proposalContent.generatedAt).toLocaleDateString()}</div>
              )}
            </div>
          </div>

          {/* Client info */}
          <div className="bg-gray-50 rounded-xl p-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Client</p>
              <p className="font-semibold text-gray-900">{lead.companyName}</p>
              <p className="text-gray-600">{lead.contactName}</p>
              <p className="text-gray-400">{lead.email}</p>
              <p className="text-gray-400">{lead.phone}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Proposal Details</p>
              <p className="text-gray-600">Expected Close: <span className="font-medium text-gray-800">{lead.expectedCloseDate ? new Date(lead.expectedCloseDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</span></p>
              <p className="text-gray-600">Type: <span className="font-medium text-gray-800 capitalize">{lead.dealType || 'Standard'}</span></p>
              {lead.manufacturer && <p className="text-gray-600">Vendor: <span className="font-medium text-gray-800">{lead.manufacturer}</span></p>}
              {lead.partnerName && <p className="text-gray-600">Partner: <span className="font-medium text-gray-800">{lead.partnerName}</span></p>}
            </div>
          </div>

          {/* AI-generated sections */}
          {proposalContent && (() => {
            const sections: { title: string; key: keyof ProposalContent }[] = [
              { title: 'Resumen Ejecutivo',       key: 'executiveSummary' },
              { title: 'Visión General de la Solución', key: 'solutionOverview' },
              { title: 'Metodología de Implementación', key: 'methodology' },
              { title: 'Por qué Blackmoon Consulting',  key: 'whyBlackmoon' },
              { title: 'Próximos Pasos',           key: 'nextSteps' },
            ];
            return (
              <div className="space-y-5">
                {sections.map(({ title, key }) => proposalContent[key] ? (
                  <div key={key}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#410074' }}>{title}</p>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{String(proposalContent[key])}</p>
                  </div>
                ) : null)}
                <hr className="border-gray-100" />
              </div>
            );
          })()}

          {/* Veracode Technical Scope */}
          {(lead.customData as any)?.veracodeConfig && (() => {
            const vc = (lead.customData as any).veracodeConfig as VeracodeConfig;
            return (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Alcance Técnico — Plataforma Veracode</p>
                <div className="grid grid-cols-3 gap-3 text-xs text-center">
                  <div className="rounded-xl p-3 border border-gray-200">
                    <p className="text-2xl font-black" style={{ color: '#410074' }}>{vc.developers}</p>
                    <p className="text-gray-500 mt-0.5">Desarrolladores</p>
                  </div>
                  <div className="rounded-xl p-3 border border-gray-200">
                    <p className="text-2xl font-black" style={{ color: '#410074' }}>{vc.profiles}</p>
                    <p className="text-gray-500 mt-0.5">Perfiles Veracode</p>
                  </div>
                  <div className="rounded-xl p-3 border border-gray-200">
                    <p className="text-2xl font-black" style={{ color: '#410074' }}>{vc.years}</p>
                    <p className="text-gray-500 mt-0.5">Año{vc.years > 1 ? 's' : ''} de licencia</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {vc.modules.map(id => {
                    const detail = VERACODE_MODULE_DETAIL[id];
                    if (!detail) return null;
                    return (
                      <div key={id} className="rounded-lg p-3 border-l-4" style={{ borderColor: detail.color, background: detail.color + '08' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-black px-2 py-0.5 rounded text-white" style={{ background: detail.color }}>{id}</span>
                          <span className="text-xs font-semibold text-gray-700">{detail.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">{detail.technical}</p>
                      </div>
                    );
                  })}
                </div>
                {vc.notes && (
                  <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">
                    <span className="font-semibold text-gray-700">Notas de alcance: </span>{vc.notes}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Line items table */}
          {lead.items.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Scope of Services</p>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase">Description</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Qty</th>
                    <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Unit Price</th>
                    <th className="text-right py-2 pl-4 text-xs font-semibold text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([cat, items]) => (
                    <React.Fragment key={cat}>
                      <tr>
                        <td colSpan={4} className="pt-4 pb-1">
                          <span className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: '#E5E4F0', color: '#410074' }}>
                            {CATEGORY_LABELS[cat] || cat}
                          </span>
                        </td>
                      </tr>
                      {items.map(item => (
                        <tr key={item.id} className="border-b border-gray-100">
                          <td className="py-2 pr-4 text-gray-700">{item.description}</td>
                          <td className="py-2 px-2 text-center text-gray-600">{item.quantity}</td>
                          <td className="py-2 px-2 text-right text-gray-600">{fmt(item.unitPrice)}</td>
                          <td className="py-2 pl-4 text-right font-medium text-gray-800">{fmt(item.total)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 flex justify-end">
                <div className="w-64 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600 border-t border-gray-200 pt-2">
                    <span>Subtotal</span><span className="font-medium">{fmt(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>Gross Margin</span><span>{grossMargin.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t-2 border-gray-900 pt-2" style={{ color: '#410074' }}>
                    <span>Total</span><span>{fmt(subtotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm">No line items in this proposal.</div>
          )}

          {lead.description && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Scope Notes</p>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{lead.description}</p>
            </div>
          )}

          <div className="border-t border-gray-100 pt-6 text-xs text-gray-400 flex justify-between">
            <span>Blackmoon Consulting · This proposal is valid for 30 days from the date above.</span>
            <span style={{ color: '#410074' }}>blackmoon.com</span>
          </div>
        </div>}
      </div>
    </div>
  );
}
