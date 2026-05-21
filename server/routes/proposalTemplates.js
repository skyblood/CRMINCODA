import { Router } from 'express';
import { nanoid } from 'nanoid';
import ProposalTemplate from '../models/ProposalTemplate.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

const MODULE_DETAIL = {
    SAST: { label: 'Static Application Security Testing', color: '#7C3AED', desc: 'Análisis estático de código fuente. Detecta vulnerabilidades OWASP Top 10 / CWE. Soporta 20+ lenguajes.' },
    SCA:  { label: 'Software Composition Analysis',       color: '#2563EB', desc: 'Detección de CVEs en dependencias open source. Genera SBOM. Análisis de licencias.' },
    FIX:  { label: 'Veracode Fix — AI Remediation',       color: '#059669', desc: 'Corrección automática de hallazgos SAST con IA. Propone parches de código en el IDE.' },
    DAST: { label: 'Dynamic Application Security Testing', color: '#D97706', desc: 'Escaneo de aplicaciones web en ejecución. Endpoints REST/SOAP. Autenticación OAuth 2.0.' },
    PF:   { label: 'Policy & Findings Platform',           color: '#DC2626', desc: 'Dashboard ejecutivo centralizado. Gestión de excepciones. Reporting SOC2/PCI-DSS/ISO 27001.' },
};

function buildModulesTable(modules = []) {
    const rows = modules.map(id => {
        const m = MODULE_DETAIL[id] || { label: id, color: '#410074', desc: '' };
        return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">
                <span style="background:${m.color}20;color:${m.color};font-weight:700;font-size:11px;padding:2px 8px;border-radius:4px">${id}</span>
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151">${m.label}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${m.desc}</td>
        </tr>`;
    }).join('');
    return `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif">
        <thead><tr style="background:#f9fafb">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase">Módulo</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase">Nombre</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase">Descripción</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

function buildItemsTable(items = []) {
    const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const rows = items.map(i => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151">${i.description}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:13px;color:#6b7280">${i.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;color:#6b7280">${fmt(i.unitPrice)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;font-weight:600;color:#111827">${fmt(i.total)}</td>
    </tr>`).join('');
    const total = items.reduce((s, i) => s + i.total, 0);
    return `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif">
        <thead><tr style="background:#f9fafb">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase">Descripción</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#9ca3af;text-transform:uppercase">Cant.</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#9ca3af;text-transform:uppercase">Precio Unit.</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#9ca3af;text-transform:uppercase">Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
            <td colspan="3" style="padding:10px 12px;text-align:right;font-weight:700;font-size:14px;color:#410074;border-top:2px solid #410074">TOTAL</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:14px;color:#410074;border-top:2px solid #410074">${fmt(total)}</td>
        </tr></tfoot>
    </table>`;
}

function injectPlaceholders(html, data) {
    return html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const val = data[key];
        return val !== undefined && val !== null ? String(val) : match;
    });
}

function buildDataMap(lead) {
    const vc = lead.customData?.veracodeConfig ?? {};
    const pc = lead.customData?.proposalContent ?? {};
    const total = (lead.items || []).reduce((s, i) => s + (i.total || 0), 0);
    const baseUrl = process.env.APP_URL || 'http://localhost:5173';

    return {
        // Client
        company_name:   lead.companyName  || '',
        contact_name:   lead.contactName  || '',
        contact_email:  lead.email        || '',
        contact_phone:  lead.phone        || '',
        contact_role:   lead.role         || '',
        country:        lead.country      || '',
        date: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
        ref:            lead.id ? lead.id.slice(-8).toUpperCase() : '',
        expected_close: lead.expectedCloseDate ? new Date(lead.expectedCloseDate).toLocaleDateString('es-ES') : '—',
        deal_value:     '$' + (lead.value || 0).toLocaleString('en-US'),

        // Veracode
        developer_count: vc.developers   ?? '—',
        profile_count:   vc.profiles     ?? '—',
        license_years:   vc.years        ?? '—',
        modules_list:    (vc.modules || []).join(', ') || '—',
        modules_table:   buildModulesTable(vc.modules || []),
        notes:           vc.notes        || '',

        // AI sections
        ai_executive_summary: pc.executiveSummary  || '',
        ai_solution_overview: pc.solutionOverview  || '',
        ai_methodology:       pc.methodology       || '',
        ai_why_blackmoon:     pc.whyBlackmoon      || '',
        ai_next_steps:        pc.nextSteps         || '',

        // Pricing
        items_table:  buildItemsTable(lead.items || []),
        total_value:  '$' + total.toLocaleString('en-US'),

        // Assets
        logo_url: `${baseUrl}/blackmoon-logo.svg`,
    };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET all templates
router.get('/', async (req, res) => {
    try {
        const docs = await ProposalTemplate.find().lean().select('-htmlContent');
        res.json(docs.map(({ _id, __v, ...rest }) => rest));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single (with htmlContent)
router.get('/:id', async (req, res) => {
    try {
        const doc = await ProposalTemplate.findOne({ id: req.params.id }).lean();
        if (!doc) return res.status(404).json({ error: 'Not found' });
        const { _id, __v, ...rest } = doc;
        res.json(rest);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create
router.post('/', async (req, res) => {
    try {
        const { name, description, htmlContent, isDefault, tags } = req.body;
        if (!name || !htmlContent) return res.status(400).json({ error: 'name and htmlContent are required' });

        if (isDefault) await ProposalTemplate.updateMany({}, { $set: { isDefault: false } });

        const doc = await ProposalTemplate.create({
            id: nanoid(), name, description: description || '', htmlContent, isDefault: !!isDefault, tags: tags || [],
        });
        const { _id, __v, ...rest } = doc.toObject();
        res.status(201).json(rest);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// PATCH update
router.patch('/:id', async (req, res) => {
    try {
        const { name, description, htmlContent, isDefault, tags } = req.body;
        if (isDefault) await ProposalTemplate.updateMany({ id: { $ne: req.params.id } }, { $set: { isDefault: false } });

        const update = {};
        if (name !== undefined)        update.name        = name;
        if (description !== undefined) update.description = description;
        if (htmlContent !== undefined) update.htmlContent = htmlContent;
        if (isDefault !== undefined)   update.isDefault   = isDefault;
        if (tags !== undefined)        update.tags        = tags;

        const doc = await ProposalTemplate.findOneAndUpdate({ id: req.params.id }, { $set: update }, { new: true }).lean();
        if (!doc) return res.status(404).json({ error: 'Not found' });
        const { _id, __v, ...rest } = doc;
        res.json(rest);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// DELETE
router.delete('/:id', async (req, res) => {
    try {
        await ProposalTemplate.deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST apply — inject all placeholders for a lead and return rendered HTML
router.post('/:id/apply', async (req, res) => {
    try {
        const { leadId } = req.body;
        if (!leadId) return res.status(400).json({ error: 'leadId is required' });

        const [template, Lead] = await Promise.all([
            ProposalTemplate.findOne({ id: req.params.id }).lean(),
            import('../models/Lead.js').then(m => m.default),
        ]);
        if (!template) return res.status(404).json({ error: 'Template not found' });

        const lead = await Lead.findOne({ id: leadId }).lean();
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        const dataMap = buildDataMap(lead);
        const renderedHtml = injectPlaceholders(template.htmlContent, dataMap);

        res.json({ html: renderedHtml, templateName: template.name });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET default template meta (no htmlContent) — used by ProposalPrint to check if one exists
router.get('/meta/default', async (req, res) => {
    try {
        const doc = await ProposalTemplate.findOne({ isDefault: true }).lean().select('-htmlContent');
        if (!doc) return res.json(null);
        const { _id, __v, ...rest } = doc;
        res.json(rest);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
