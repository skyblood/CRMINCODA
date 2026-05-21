/**
 * Proposal Generator — AI Agent (Claude Sonnet)
 * Generates a professional B2B technical proposal tailored to each Veracode implementation.
 * Called from POST /api/proposals/generate
 */
import Anthropic from '@anthropic-ai/sdk';

let client = null;
const getClient = () => {
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
};

const MODULE_NAMES = {
    SAST: 'Static Application Security Testing (SAST)',
    SCA:  'Software Composition Analysis (SCA)',
    FIX:  'Veracode Fix — AI-Powered Remediation',
    DAST: 'Dynamic Application Security Testing (DAST)',
    PF:   'Policy & Findings Platform',
    VRM:  'Vulnerability Risk Management (VRM)',
};

const CICD_LABELS = {
    'azure-devops':   'Azure DevOps',
    'github-actions': 'GitHub Actions',
    'gitlab-ci':      'GitLab CI/CD',
    'jenkins':        'Jenkins',
    'bitbucket':      'Bitbucket Pipelines',
};

/**
 * Generates structured proposal content using Claude.
 *
 * @param {object} lead - Lead document from MongoDB
 * @param {object} veracodeConfig - { developers, profiles, modules, years, notes, cicdPlatform }
 * @returns {Promise<ProposalContent>}
 */
export async function generateProposalContent(lead, veracodeConfig) {
    const ai = getClient();

    const moduleList = (veracodeConfig.modules || [])
        .map(id => `  • ${id}: ${MODULE_NAMES[id] || id}`)
        .join('\n');

    const cicdLabel = CICD_LABELS[veracodeConfig.cicdPlatform] || veracodeConfig.cicdPlatform || 'No especificada';
    const hasVRM = (veracodeConfig.modules || []).includes('VRM');

    const prompt = `Eres un consultor senior de ciberseguridad de Blackmoon Consulting especializado en Veracode.
Redacta una propuesta técnica profesional en ESPAÑOL para la siguiente oportunidad de negocio.

DATOS DEL CLIENTE:
- Empresa: ${lead.companyName}
- Proyecto: ${lead.projectName || lead.description || 'Implementación Veracode'}
- Contacto: ${lead.contactName} (${lead.role || 'Decision Maker'})
- País: ${lead.country || 'Latinoamérica'}
- Industria/Descripción: ${lead.description || 'No especificada'}
- Valor del deal: $${(lead.value || 0).toLocaleString()} USD

CONFIGURACIÓN VERACODE PROPUESTA:
- Módulos:
${moduleList}
- Desarrolladores: ${veracodeConfig.developers}
- Perfiles de aplicación: ${veracodeConfig.profiles}
- Término de licencia: ${veracodeConfig.years} año(s)
- Plataforma CI/CD: ${cicdLabel}
${veracodeConfig.notes ? `- Notas adicionales: ${veracodeConfig.notes}` : ''}

Genera las siguientes secciones. Sé específico, profesional y orientado al valor de negocio.
Máximo 3 párrafos por sección. NO uses markdown con asteriscos. Usa texto plano con saltos de línea.
La sección cicdIntegration debe incluir pasos ESPECÍFICOS para ${cicdLabel} (nombres de tareas/plugins/YAML keys reales).
${hasVRM ? 'La sección vrmDetails debe explicar cómo VRM centraliza el riesgo y los SLAs de remediación para este cliente.' : ''}

Responde ÚNICAMENTE con JSON válido (sin markdown, sin explicaciones fuera del JSON):
{
  "executiveSummary": "<resumen ejecutivo 2-3 párrafos: problema de seguridad en AppSec, por qué Veracode+Blackmoon es la solución, ROI esperado>",
  "solutionOverview": "<visión general: qué módulos y por qué fueron seleccionados para el contexto de ${lead.companyName}>",
  "cicdIntegration": "<pasos de integración con ${cicdLabel}: instalación de plugin/extensión, configuración de pipeline YAML/stages, política de quality gate, variables de entorno requeridas>",
  ${hasVRM ? '"vrmDetails": "<cómo VRM gestiona el riesgo: scoring CVSS/EPSS, dashboards para CISO, SLAs por severidad, integración con ticketing>",\n  ' : ''}"methodology": "<fases: Discovery, Onboarding, Integración ${cicdLabel}, Capacitación, Go-Live — duración y entregables>",
  "whyBlackmoon": "<por qué Blackmoon: expertise regional, certificaciones Veracode, casos de éxito (sin nombres), soporte post-implementación>",
  "nextSteps": "<3-4 acciones numeradas para avanzar al cierre>"
}`;

    try {
        const message = await ai.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }],
        });

        const text = message.content[0].text
            .trim()
            .replace(/^```json\s*|^```\s*|```$/gm, '')
            .trim();

        const parsed = JSON.parse(text);

        return {
            executiveSummary: String(parsed.executiveSummary || ''),
            solutionOverview: String(parsed.solutionOverview || ''),
            cicdIntegration:  String(parsed.cicdIntegration  || ''),
            vrmDetails:       String(parsed.vrmDetails       || ''),
            methodology:      String(parsed.methodology      || ''),
            whyBlackmoon:     String(parsed.whyBlackmoon     || ''),
            nextSteps:        String(parsed.nextSteps        || ''),
            generatedAt:      new Date().toISOString(),
        };
    } catch (err) {
        console.error('[ProposalGenerator] Claude error:', err.message);
        const cicdLabel = CICD_LABELS[veracodeConfig.cicdPlatform] || veracodeConfig.cicdPlatform || 'CI/CD';
        return {
            executiveSummary: `${lead.companyName} requiere una solución de Application Security Testing para proteger su activo de software. Blackmoon Consulting propone la implementación de la plataforma Veracode con ${veracodeConfig.modules.join(', ')} para ${veracodeConfig.developers} desarrolladores.`,
            solutionOverview: `La solución incluye ${veracodeConfig.modules.length} módulo(s) de Veracode diseñados para cubrir el ciclo completo de seguridad en el desarrollo de software (DevSecOps).`,
            cicdIntegration:  `La integración con ${cicdLabel} requiere la instalación del plugin oficial de Veracode y la configuración de las variables de entorno VERACODE_API_ID y VERACODE_API_KEY en el pipeline.`,
            vrmDetails:       veracodeConfig.modules.includes('VRM') ? 'VRM centraliza la gestión de vulnerabilidades con scoring CVSS/EPSS, SLAs configurables por severidad y dashboards para el CISO.' : '',
            methodology:      `Fase 1: Discovery y configuración inicial (1-2 semanas). Fase 2: Onboarding y primera ejecución de scans (1-2 semanas). Fase 3: Integración con ${cicdLabel} (2-3 semanas). Fase 4: Capacitación y Go-Live.`,
            whyBlackmoon:     'Blackmoon Consulting es el partner autorizado de Veracode con mayor experiencia en Latinoamérica, ofreciendo implementación certificada y soporte técnico continuo en español.',
            nextSteps:        '1. Revisión de la propuesta con el equipo técnico.\n2. Demo técnica de los módulos seleccionados.\n3. Firma de contrato y kick-off de implementación.',
            generatedAt:      new Date().toISOString(),
        };
    }
}

/**
 * Assembles a styled HTML document from generated proposal content sections.
 *
 * @param {object} lead
 * @param {object} veracodeConfig
 * @param {object} content - Result from generateProposalContent
 * @returns {string} Full HTML string ready for PDF rendering
 */
export function assembleProposalHtml(lead, veracodeConfig, content) {
    const cicdLabel = CICD_LABELS[veracodeConfig.cicdPlatform] || veracodeConfig.cicdPlatform || '';
    const projectName = lead.projectName || lead.description || 'Implementación Veracode';
    const today = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    const moduleRows = (veracodeConfig.modules || []).map(id => {
        const name = MODULE_NAMES[id] || id;
        return `<tr><td style="padding:6px 12px;font-weight:bold;color:#410074;">${id}</td><td style="padding:6px 12px;color:#333;">${name}</td></tr>`;
    }).join('');

    const section = (title, body, color = '#410074') => body ? `
        <div style="margin-bottom:28px;">
            <h2 style="font-size:15px;font-weight:700;color:${color};border-bottom:2px solid ${color};padding-bottom:6px;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">${title}</h2>
            <p style="font-size:13px;color:#333;line-height:1.7;white-space:pre-line;">${body}</p>
        </div>` : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #1a1a1a; }
  .page { max-width: 780px; margin: 0 auto; padding: 40px 48px; }
  .header { background: #410074; color: white; padding: 32px 48px 24px; }
  .header h1 { font-size: 22px; margin: 0 0 4px; }
  .header p { font-size: 12px; margin: 0; opacity: 0.8; }
  .meta-bar { background: #f5f0ff; border-left: 4px solid #410074; padding: 12px 16px; margin-bottom: 28px; font-size: 12px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  table th { background: #f5f0ff; padding: 8px 12px; text-align: left; font-size: 12px; color: #410074; }
  table tr:nth-child(even) { background: #fafafa; }
  .footer { margin-top: 40px; border-top: 1px solid #eee; padding-top: 16px; font-size: 11px; color: #999; text-align: center; }
</style>
</head>
<body>
<div class="header">
  <h1>Propuesta Técnica Veracode</h1>
  <p>${lead.companyName} — ${projectName} | ${today}</p>
</div>
<div class="page">
  <div class="meta-bar">
    <strong>Cliente:</strong> ${lead.companyName} &nbsp;|&nbsp;
    <strong>Contacto:</strong> ${lead.contactName} &nbsp;|&nbsp;
    <strong>País:</strong> ${lead.country || 'N/A'} &nbsp;|&nbsp;
    <strong>CI/CD:</strong> ${cicdLabel || 'N/A'} &nbsp;|&nbsp;
    <strong>Desarrolladores:</strong> ${veracodeConfig.developers} &nbsp;|&nbsp;
    <strong>Término:</strong> ${veracodeConfig.years} año(s)
  </div>

  <div style="margin-bottom:28px;">
    <h2 style="font-size:15px;font-weight:700;color:#410074;border-bottom:2px solid #410074;padding-bottom:6px;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em;">Módulos Licenciados</h2>
    <table><thead><tr><th>Módulo</th><th>Descripción</th></tr></thead><tbody>${moduleRows}</tbody></table>
  </div>

  ${section('Resumen Ejecutivo', content.executiveSummary)}
  ${section('Visión General de la Solución', content.solutionOverview)}
  ${content.cicdIntegration ? section(`Integración con ${cicdLabel}`, content.cicdIntegration, '#1d4ed8') : ''}
  ${content.vrmDetails ? section('Vulnerability Risk Management (VRM)', content.vrmDetails, '#0f172a') : ''}
  ${section('Metodología de Implementación', content.methodology)}
  ${section('¿Por qué Blackmoon Consulting?', content.whyBlackmoon)}
  ${section('Próximos Pasos', content.nextSteps, '#059669')}

  <div class="footer">
    Preparado por Blackmoon Consulting · Documento confidencial · ${today}
  </div>
</div>
</body>
</html>`;
}
