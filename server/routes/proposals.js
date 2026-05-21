/**
 * /api/proposals
 *
 * POST  /generate          — AI-generate proposal content for a lead
 * GET   /                  — list proposals (filter by ?leadId=)
 * POST  /                  — save a new named proposal snapshot
 * PATCH /:id               — update name / htmlContent / status
 * DELETE /:id              — delete
 */
import { Router } from 'express';
import { nanoid } from 'nanoid';
import Lead from '../models/Lead.js';
import Proposal from '../models/Proposal.js';
import { generateProposalContent, assembleProposalHtml } from '../services/proposalGenerator.js';
import { ensureFolderPath, uploadPDF, createOrVersionTechnicalDoc } from '../services/driveService.js';
import { logAudit } from '../auditService.js';
import { emitCollectionChange } from '../socketInstance.js';

const router = Router();

// ── AI generate ──────────────────────────────────────────────────────────────
router.post('/generate', async (req, res) => {
    try {
        const { leadId, veracodeConfig: bodyConfig } = req.body;
        if (!leadId) return res.status(400).json({ error: 'leadId is required' });

        const lead = await Lead.findOne({ id: leadId }).lean();
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        // Accept veracodeConfig from request body (wizard sends it directly)
        // Fall back to config stored on the lead document
        const veracodeConfig = bodyConfig || lead.customData?.veracodeConfig;
        if (!veracodeConfig || !veracodeConfig.modules?.length) {
            return res.status(400).json({ error: 'No Veracode configuration found. Run the Veracode Quote Wizard first.' });
        }

        // Generate AI content sections
        const content = await generateProposalContent(lead, veracodeConfig);

        // Assemble full HTML proposal document
        const htmlContent = assembleProposalHtml(lead, veracodeConfig, content);

        // Calculate total value from items matching vc_ prefix
        const totalValue = (lead.items || [])
            .filter(i => String(i.id).startsWith('vc_'))
            .reduce((s, i) => s + (i.total || 0), 0);

        // Save as a Proposal document (versioned snapshot)
        const existing = await Proposal.countDocuments({ leadId });
        const projectName = lead.projectName || lead.description || 'Propuesta Veracode';
        const doc = await Proposal.create({
            id: nanoid(),
            leadId,
            name: `${projectName} — v${existing + 1}`,
            htmlContent,
            status: 'draft',
            totalValue,
            version: existing + 1,
            veracodeConfig,
        });

        // Also persist content on the lead for ProposalPrint compatibility
        const updated = await Lead.findOneAndUpdate(
            { id: leadId },
            { $set: { 'customData.proposalContent': content, 'customData.veracodeConfig': veracodeConfig } },
            { new: true, lean: true }
        );

        logAudit({
            entityType: 'lead', entityId: leadId, action: 'proposal_generated',
            userId: req.session?.user?.id, userName: req.session?.user?.name,
            meta: { modules: veracodeConfig.modules, developers: veracodeConfig.developers, proposalId: doc.id },
        });

        const { _id: lId, __v: lV, ...leadRest } = updated;
        emitCollectionChange('leads', 'updated', leadRest);

        const { _id, __v, ...proposalRest } = doc.toObject();
        res.json({ ...proposalRest, htmlContent });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── CRUD ─────────────────────────────────────────────────────────────────────

// GET list (optionally filtered by leadId)
router.get('/', async (req, res) => {
    try {
        const filter = {};
        if (req.query.leadId) filter.leadId = req.query.leadId;
        const docs = await Proposal.find(filter).sort({ createdAt: -1 }).lean().select('-htmlContent');
        res.json(docs.map(({ _id, __v, ...rest }) => rest));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single (with htmlContent)
router.get('/:id', async (req, res) => {
    try {
        const doc = await Proposal.findOne({ id: req.params.id }).lean();
        if (!doc) return res.status(404).json({ error: 'Not found' });
        const { _id, __v, ...rest } = doc;
        res.json(rest);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST save a new proposal snapshot
router.post('/', async (req, res) => {
    try {
        const { leadId, name, htmlContent, templateId, totalValue } = req.body;
        if (!leadId || !name || !htmlContent) {
            return res.status(400).json({ error: 'leadId, name, and htmlContent are required' });
        }

        // Auto-increment version for same lead
        const existing = await Proposal.countDocuments({ leadId });

        const doc = await Proposal.create({
            id: nanoid(), leadId, name, htmlContent,
            status: 'draft',
            templateId: templateId || null,
            totalValue: totalValue || 0,
            version: existing + 1,
        });
        const { _id, __v, ...rest } = doc.toObject();
        res.status(201).json(rest);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// PATCH update name / htmlContent / status
router.patch('/:id', async (req, res) => {
    try {
        const { name, htmlContent, status, totalValue } = req.body;
        const update = {};
        if (name !== undefined)        update.name        = name;
        if (htmlContent !== undefined) update.htmlContent = htmlContent;
        if (status !== undefined)      update.status      = status;
        if (totalValue !== undefined)  update.totalValue  = totalValue;

        const doc = await Proposal.findOneAndUpdate(
            { id: req.params.id }, { $set: update }, { new: true, lean: true }
        );
        if (!doc) return res.status(404).json({ error: 'Not found' });
        const { _id, __v, ...rest } = doc;
        res.json(rest);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// DELETE
router.delete('/:id', async (req, res) => {
    try {
        await Proposal.deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Generate Technical Proposal → Google Drive ───────────────────────────────
// POST /api/proposals/generate-technical
// Builds folder structure ROOT/COUNTRY/CLIENT/PROJECT, creates a versioned
// Google Doc with proposal content, and saves a Proposal record in the DB.
router.post('/generate-technical', async (req, res) => {
    try {
        const { leadId } = req.body;
        if (!leadId) return res.status(400).json({ error: 'leadId is required' });

        const lead = await Lead.findOne({ id: leadId }).lean();
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        const tokens = req.session?.googleTokens;
        if (!tokens?.access_token) {
            return res.status(401).json({ error: 'Debes conectar tu cuenta de Google primero. Ve a Configuración → Google Calendar → Conectar.' });
        }

        const projectName = (lead.projectName || lead.description || 'Sin_Proyecto').trim();
        const country     = (lead.country     || 'Sin_Pais').trim();
        const clientName  = (lead.companyName || 'Sin_Cliente').trim();

        // 1. Ensure folder hierarchy: ROOT / country / client / project
        const folderId = await ensureFolderPath(country, clientName, projectName, tokens);

        // 2. Build HTML content for the proposal
        const htmlContent = buildTechnicalProposalHtml(lead);

        // 3. Create versioned Google Doc
        const { fileId, webViewLink, version, filename } = await createOrVersionTechnicalDoc(
            folderId, projectName, htmlContent, tokens,
        );

        // 4. Persist a Proposal record so it shows in the proposals list
        const doc = await Proposal.create({
            id: nanoid(),
            leadId,
            name: `${projectName} — PT v${version}`,
            htmlContent,
            status: 'draft',
            totalValue: lead.value || 0,
            version,
            driveFileId:  fileId,
            driveFileUrl: webViewLink,
            driveFolderId: folderId,
        });

        logAudit({
            entityType: 'lead', entityId: leadId, action: 'technical_proposal_drive',
            userId: req.session?.user?.id, userName: req.session?.user?.name,
            meta: { driveFileId: fileId, folder: `${country}/${clientName}/${projectName}`, version, filename },
        });

        emitCollectionChange('proposals', 'created', { id: doc.id, leadId, version });

        res.json({ success: true, driveFileUrl: webViewLink, driveFileId: fileId, version, filename, proposalId: doc.id });
    } catch (err) {
        console.error('[Technical Proposal Drive]', err.message);
        res.status(500).json({ error: err.message });
    }
});

/** Builds a styled HTML document for the technical proposal from lead data. */
function buildTechnicalProposalHtml(lead) {
    const today      = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    const projectName = lead.projectName || lead.description || 'Propuesta Técnica';
    const items       = (lead.items || []);

    const itemRows = items.length
        ? items.map(i => `
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;">${i.description || i.id || ''}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">${i.quantity ?? 1}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">$${(i.unitPrice ?? i.unitCost ?? 0).toLocaleString('es-ES')}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">$${(i.total ?? (i.quantity ?? 1) * (i.unitPrice ?? i.unitCost ?? 0)).toLocaleString('es-ES')}</td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="padding:8px 10px;color:#999;">Sin ítems registrados</td></tr>`;

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Propuesta Técnica — ${projectName}</title></head>
<body style="font-family:Arial,sans-serif;color:#222;max-width:800px;margin:0 auto;padding:40px 32px;">

  <div style="border-bottom:4px solid #410074;padding-bottom:16px;margin-bottom:32px;">
    <h1 style="margin:0;font-size:26px;color:#410074;">Propuesta Técnica</h1>
    <p style="margin:4px 0 0;font-size:14px;color:#666;">${today}</p>
  </div>

  <table style="width:100%;margin-bottom:28px;font-size:14px;">
    <tr>
      <td style="width:50%;vertical-align:top;">
        <strong style="color:#410074;">Cliente</strong><br>
        ${lead.companyName || '—'}<br>
        ${lead.contactName || ''}${lead.role ? ` · ${lead.role}` : ''}<br>
        ${lead.email ? `<a href="mailto:${lead.email}">${lead.email}</a><br>` : ''}
        ${lead.phone || ''}
      </td>
      <td style="width:50%;vertical-align:top;">
        <strong style="color:#410074;">Oportunidad</strong><br>
        <strong>Proyecto:</strong> ${projectName}<br>
        <strong>País:</strong> ${lead.country || '—'}<br>
        <strong>Ciudad:</strong> ${lead.city || '—'}<br>
        <strong>Cierre estimado:</strong> ${lead.expectedCloseDate || '—'}<br>
        ${lead.partnerName ? `<strong>Partner:</strong> ${lead.partnerName}` : ''}
      </td>
    </tr>
  </table>

  ${lead.description ? `
  <h2 style="font-size:16px;color:#410074;border-bottom:1px solid #ddd;padding-bottom:6px;">Descripción</h2>
  <p style="font-size:14px;line-height:1.7;">${lead.description}</p>` : ''}

  <h2 style="font-size:16px;color:#410074;border-bottom:1px solid #ddd;padding-bottom:6px;">Alcance / Productos y Servicios</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead>
      <tr style="background:#410074;color:#fff;">
        <th style="padding:8px 10px;text-align:left;">Descripción</th>
        <th style="padding:8px 10px;text-align:center;">Qty</th>
        <th style="padding:8px 10px;text-align:right;">Precio unit.</th>
        <th style="padding:8px 10px;text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr style="background:#f5f0fa;">
        <td colspan="3" style="padding:8px 10px;text-align:right;font-weight:bold;">Valor Total del Deal</td>
        <td style="padding:8px 10px;text-align:right;font-weight:bold;color:#410074;">$${(lead.value || 0).toLocaleString('es-ES')} USD</td>
      </tr>
    </tfoot>
  </table>

  <h2 style="font-size:16px;color:#410074;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:32px;">Términos y Condiciones</h2>
  <ul style="font-size:14px;line-height:1.8;padding-left:20px;">
    <li>Propuesta válida por 30 días a partir de la fecha de emisión.</li>
    <li>Los precios son en dólares americanos (USD) e incluyen licencias y soporte.</li>
    <li>La implementación y servicios profesionales se cotizarán por separado si aplica.</li>
    <li>Sujeto a firma de NDA y aprobación de crédito del cliente.</li>
  </ul>

  <h2 style="font-size:16px;color:#410074;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:32px;">Próximos Pasos</h2>
  <ol style="font-size:14px;line-height:1.8;padding-left:20px;">
    <li>Revisión y aprobación de la propuesta por parte del cliente.</li>
    <li>Firma del acuerdo comercial.</li>
    <li>Kick-off de implementación.</li>
  </ol>

  <div style="margin-top:40px;padding-top:16px;border-top:2px solid #410074;font-size:12px;color:#888;">
    <p>Incoda Consulting · Documento generado automáticamente desde CRM Incoda</p>
  </div>

</body>
</html>`;
}

// ── Google Drive upload ───────────────────────────────────────────────────────
// POST /api/proposals/:id/upload-drive
// Body: { pdfBase64: string, filename: string }
// Creates folder structure ROOT/COUNTRY/CLIENT/PROJECT and uploads the PDF.
router.post('/:id/upload-drive', async (req, res) => {
    try {
        const { pdfBase64, filename } = req.body;
        if (!pdfBase64 || !filename) {
            return res.status(400).json({ error: 'pdfBase64 and filename are required' });
        }

        const proposal = await Proposal.findOne({ id: req.params.id }).lean();
        if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

        const lead = await Lead.findOne({ id: proposal.leadId }).lean();
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        const tokens = req.session?.googleTokens;
        if (!tokens?.access_token) {
            return res.status(401).json({ error: 'Debes conectar tu cuenta de Google primero. Ve a Configuración → Google Calendar → Conectar.' });
        }

        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        const projectName = lead.projectName || lead.description || 'Sin_Proyecto';

        const folderId = await ensureFolderPath(
            lead.country    || 'Sin_Pais',
            lead.companyName || 'Sin_Cliente',
            projectName,
            tokens,
        );

        const { fileId, webViewLink } = await uploadPDF(folderId, filename, pdfBuffer, tokens);

        await Proposal.findOneAndUpdate(
            { id: req.params.id },
            { $set: { driveFileId: fileId, driveFileUrl: webViewLink, driveFolderId: folderId } },
        );

        logAudit({
            entityType: 'proposal', entityId: req.params.id, action: 'uploaded_to_drive',
            userId: req.session?.user?.id, userName: req.session?.user?.name,
            meta: { driveFileId: fileId, folder: `${lead.country}/${lead.companyName}/${projectName}` },
        });

        res.json({ success: true, driveFileUrl: webViewLink, driveFileId: fileId });
    } catch (err) {
        console.error('[Drive upload]', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
