#!/usr/bin/env node
// MCP local (stdio) — no abre puertos ni acepta conexiones de red.
// Claude lo lanza como subproceso y le habla por stdin/stdout.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const CRM_API_URL = process.env.CRM_API_URL || 'http://localhost:8743/api/v1';
const CRM_API_KEY = process.env.CRM_API_KEY;

if (!CRM_API_KEY) {
    console.error('[crm-incoda-mcp] Falta la variable de entorno CRM_API_KEY.');
    process.exit(1);
}

const server = new McpServer({ name: 'crm-incoda', version: '1.0.0' });

server.registerTool(
    'crear_oportunidad',
    {
        title: 'Crear oportunidad en el CRM',
        description: 'Crea una nueva oportunidad (lead) en el pipeline del CRM Incoda.',
        inputSchema: {
            companyName: z.string().describe('Nombre de la empresa'),
            contactName: z.string().describe('Nombre del contacto'),
            email: z.string().optional(),
            phone: z.string().optional(),
            value: z.number().optional().describe('Valor estimado de la oportunidad'),
            stage: z.string().optional().describe("Etapa inicial (default: 'prospect')"),
            description: z.string().optional(),
            manufacturer: z.string().optional(),
            country: z.string().optional().describe('País del cliente (ej: COLOMBIA)'),
            partnerName: z.string().optional().describe('Nombre del partner/canal'),
            projectName: z.string().optional().describe('Nombre de la oportunidad/proyecto'),
        },
    },
    async (input) => {
        const res = await fetch(`${CRM_API_URL}/leads`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${CRM_API_KEY}`,
            },
            body: JSON.stringify(input),
        });

        const data = await res.json();

        if (!res.ok) {
            return {
                content: [{ type: 'text', text: `Error al crear la oportunidad: ${data.error || res.statusText}` }],
                isError: true,
            };
        }

        return {
            content: [{
                type: 'text',
                text: `Oportunidad creada: "${data.companyName}" (id: ${data.id}, etapa: ${data.stage}).`,
            }],
        };
    }
);

async function getJson(path) {
    const res = await fetch(`${CRM_API_URL}${path}`, {
        headers: { Authorization: `Bearer ${CRM_API_KEY}` },
    });
    const data = await res.json();
    if (!res.ok) {
        const err = new Error(data.error || res.statusText);
        err.isApiError = true;
        throw err;
    }
    return data;
}

function readTool(name, title, description, path, formatText) {
    server.registerTool(
        name,
        { title, description },
        async () => {
            try {
                const data = await getJson(path);
                return { content: [{ type: 'text', text: formatText(data) }] };
            } catch (err) {
                return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
            }
        }
    );
}

readTool(
    'leer_pipeline_forecast',
    'Leer forecast del pipeline',
    'Forecast de ingresos a 30/60/90 días generado por IA a partir del pipeline actual de oportunidades.',
    '/pipeline-forecast',
    (d) => `Forecast del pipeline — salud: ${d.health}. 30 días: $${d.d30.toLocaleString()}, 60 días: $${d.d60.toLocaleString()}, 90 días: $${d.d90.toLocaleString()}. ${d.narrative} Riesgo principal: ${d.topRisk} Acción recomendada: ${d.topAction} (${d.meta.activeDeals} negocios activos, win rate ${d.meta.winRate ?? 'N/D'}%).`
);

readTool(
    'leer_financieros',
    'Leer estado financiero',
    'P&L y balance general condensados de Incoda, calculados desde el libro contable en tiempo real.',
    '/financials/summary',
    (d) => `Estado financiero al ${new Date(d.asOf).toLocaleDateString()}: ingresos $${d.totalIncome.toLocaleString()}, gastos $${d.totalExpense.toLocaleString()}, utilidad neta $${d.netIncome.toLocaleString()}. Activos $${d.totalAssets.toLocaleString()}, pasivos $${d.totalLiabilities.toLocaleString()}, patrimonio $${d.totalEquity.toLocaleString()} (balanceado: ${d.balanced ? 'sí' : 'NO — revisar libro contable'}).`
);

readTool(
    'leer_caja',
    'Leer caja y cobranza',
    'Efectivo recibido en los últimos 12 meses, cartera por cobrar (aging), DSO global, y los principales deudores.',
    '/cash/summary',
    (d) => `Caja (últimos 12 meses): $${d.cashInLast12m.toLocaleString()} recibidos en ${d.paymentsCountLast12m} pagos. Cartera por cobrar total: $${d.totalAR.toLocaleString()} (DSO global: ${d.globalDSO} días). Aging: current $${d.arAgingBuckets.current.toLocaleString()}, 1-30 $${d.arAgingBuckets['1-30'].toLocaleString()}, 31-60 $${d.arAgingBuckets['31-60'].toLocaleString()}, 61-90 $${d.arAgingBuckets['61-90'].toLocaleString()}, 90+ $${d.arAgingBuckets['90+'].toLocaleString()}. Mayores deudores: ${d.topDebtors.map(x => `${x.clientName} ($${x.totalOwedUSD.toLocaleString()})`).join(', ') || 'ninguno'}.`
);

readTool(
    'leer_estado_mercury',
    'Leer estado de conciliación Mercury',
    'Cuántos movimientos de la cuenta de caja ya están conciliados contra el extracto de Mercury y cuántos siguen pendientes.',
    '/cash/mercury-status',
    (d) => `Conciliación Mercury: ${d.reconciledCount} movimientos conciliados ($${d.reconciledUSD.toLocaleString()}), ${d.pendingCount} pendientes ($${d.pendingUSD.toLocaleString()}).`
);

readTool(
    'leer_metas',
    'Leer metas de ingresos',
    'Metas de ingresos de Incoda por año, tal como están configuradas en el CRM.',
    '/goals',
    (d) => {
        const years = Object.keys(d);
        if (!years.length) return 'No hay metas configuradas.';
        return `Metas de ingresos: ${years.map(y => `${y}: $${Number(d[y]).toLocaleString()}`).join(', ')}.`;
    }
);

readTool(
    'leer_comisiones',
    'Leer comisiones',
    'Total de comisiones generadas, desglose por persona (BM/Fabian/Spencer), y por estado de pago.',
    '/commissions/summary',
    (d) => {
        const statusLines = Object.entries(d.byStatus).map(([s, amt]) => `${s}: $${amt.toLocaleString()}`).join(', ');
        return `Comisiones (${d.count} registros): total $${d.totalAmountUSD.toLocaleString()}. Por persona — BM: $${d.byPerson.bmRetainedUSD.toLocaleString()}, Fabian: $${d.byPerson.fabianShareUSD.toLocaleString()}, Spencer: $${d.byPerson.spencerShareUSD.toLocaleString()}. Por estado: ${statusLines || 'sin registros'}.`;
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);
