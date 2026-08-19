# MCP CRM — Tools de lectura para la Junta Directiva de IA

**Fecha**: 2026-08-18
**Estado**: Propuesto, pendiente de revisión del usuario

## Contexto

Incoda está construyendo una "Junta Directiva de IA" (skill de Claude Code, sub-proyecto
separado): 8 roles — CEO, CFO, CTO, CMO, COO, Legal, Data y Ventas/BD — que debaten una
decisión de negocio desde 8 perspectivas y entregan una recomendación. Para que el CFO,
Data y Ventas/BD den lecturas basadas en datos reales de Incoda en vez de pedirle al
usuario que pegue números a mano, necesitan poder consultar el CRM.

El MCP `crm-incoda` (`mcp-server/index.js`) ya está registrado en `INCODAPRD/.mcp.json`
y expone una sola tool, `crear_oportunidad`, que llama a `POST /api/v1/leads`. El resto
del backend del CRM (~35 módulos de rutas) vive detrás de `requireAuth` (solo sesión de
navegador) — no es alcanzable por el MCP.

`server/routes/external.js` (`/api/v1/*`) ya es la superficie correcta para esto: auth
por API key (`apiKeyAuth`), scopes por endpoint (`requireScope`), sanitización de query
params, y respuestas ya resumidas/limpias (nunca un dump crudo de Mongo). Ya expone
lectura de `leads`, `pipeline`, `projects`, `contacts`, `users`, `transactions`.

Este spec cubre **solo** la ampliación de esa superficie para que la Junta Directiva
pueda leer: pipeline/forecast, financieros (P&L, balance sheet), caja y cobranza,
estado de conciliación Mercury, metas, y comisiones (con detalle por persona, decisión
explícita del usuario). El skill de la Junta Directiva que consume estas tools es un
sub-proyecto aparte, a diseñar después de que esto esté implementado.

## Objetivo

1. Agregar 6 endpoints de solo lectura a `/api/v1/*`, siguiendo exactamente el patrón
   ya establecido en `external.js`.
2. Agregar 4 scopes nuevos al modelo `ApiKey` y otorgárselos al key que ya usa
   `document-incoda`/`crear_oportunidad`.
3. Agregar 6 tools nuevas a `mcp-server/index.js`, siguiendo el patrón de
   `crear_oportunidad` (fetch + Bearer + manejo de error + texto formateado).

## Fuera de alcance (por ahora)

- El skill de Claude Code que consume estas tools ("Junta Directiva de IA") — sub-proyecto
  separado, con su propio spec.
- Integración directa con la API de Mercury — ya existe `mercuryReconciliation.js` en el
  CRM (vía import de CSV, según `2026-07-28-accounting-ledger-design.md`); este spec solo
  expone su *estado* de conciliación por API key, no cambia cómo se importa.
- Escritura vía las tools nuevas — todas son de solo lectura. `crear_oportunidad` sigue
  siendo la única tool de escritura.
- Endpoints nuevos para módulos no solicitados (webhooks, automations, audit logs, etc.).

## Arquitectura

Sin cambios estructurales: se extiende `external.js` con más `router.get(...)` y
`mcp-server/index.js` con más `server.registerTool(...)`. Cada endpoint nuevo reutiliza
la lógica de agregación que ya existe en su módulo de origen (`ledgerReports.js`,
`reports.js`, `mercuryReconciliation.js`, `goals.js`, `commissions.js`, `aiReports.js`)
en vez de reimplementarla — o bien llama internamente a esas funciones, o bien duplica
el query mínimo necesario si esos módulos no exportan la lógica en una función reusable
(a confirmar durante la implementación, leyendo cada archivo).

Principio de respuesta: **resumen/agregado, nunca volcado crudo** — igual que
`GET /api/v1/pipeline` ya hace con los leads. Ninguna tool nueva devuelve documentos de
Mongo completos con metadatos internos (`_id`, `__v`, timestamps de Mongo).

## Endpoints nuevos (`server/routes/external.js`)

| Endpoint | Envuelve | Scope | Método |
|---|---|---|---|
| `GET /api/v1/pipeline-forecast` | `aiReports.js` → `GET /pipeline-forecast` | `pipeline` (reutilizado) | GET |
| `GET /api/v1/financials/summary` | `ledgerReports.js` → `/pl` + `/balance-sheet` (condensado) | `financials` (nuevo) | GET |
| `GET /api/v1/cash/summary` | `reports.js` → cash-in, ar-aging, dso, top-debtors (condensado) | `cash` (nuevo) | GET |
| `GET /api/v1/cash/mercury-status` | `mercuryReconciliation.js` (estado de conciliación, no transacciones línea por línea) | `cash` (nuevo) | GET |
| `GET /api/v1/goals` | `goals.js` | `goals` (nuevo) | GET |
| `GET /api/v1/commissions/summary` | `commissions.js` (agregado + detalle por persona, según decisión del usuario) | `commissions` (nuevo) | GET |

Cada handler sigue el molde exacto de los existentes en `external.js`:

```js
router.get('/ruta', requireScope('scope'), async (req, res) => {
    try {
        // ...query + agregación...
        res.json({ ...resumen });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
```

Se añade también cada ruta nueva a la lista de `endpoints` del discovery endpoint
(`GET /api/v1/`).

## Modelo de datos — cambios

Sin modelos nuevos. Un solo cambio de datos: agregar `financials`, `cash`, `goals`,
`commissions` al array `scopes` del documento `ApiKey` existente que usa
`INCODAPRD/.crm-incoda.env` (operación en Mongo, no cambio de esquema — `scopes` ya es
`[String]` libre en `models/ApiKey.js`).

## Componentes — `mcp-server/index.js`

6 tools nuevas, cada una con el mismo esqueleto que `crear_oportunidad` (fetch GET en
vez de POST, sin body):

- `leer_pipeline_forecast`
- `leer_financieros`
- `leer_caja`
- `leer_estado_mercury`
- `leer_metas`
- `leer_comisiones`

Cada tool: `title` y `description` en español, sin `inputSchema` (son GET sin parámetros
por ahora — si algún endpoint termina necesitando filtros como `?period=`, se agrega
como parámetro opcional de la tool). El texto de retorno debe ser una síntesis legible
(no JSON crudo pegado) para que el rol que la invoque no tenga que re-parsear — mismo
criterio que ya usa `crear_oportunidad` en su mensaje de confirmación.

## Flujo de datos

1. Un rol de la Junta Directiva (CFO, Data, Ventas/BD, CEO/COO) invoca su tool
   correspondiente durante el debate.
2. La tool del MCP hace `fetch` a `CRM_API_URL` con el `Bearer ${CRM_API_KEY}`.
3. `apiKeyAuth` valida el key, revisa el scope requerido, aplica rate limit.
4. El endpoint agrega/resume desde Mongo y responde JSON limpio.
5. La tool MCP formatea la respuesta como texto y la devuelve a Claude.

Sin cambios en `apiKeyAuth`, `requireAuth`, ni en el flujo de sesión de navegador —
el `/api/v1/*` sigue siendo la única superficie tocada.

## Manejo de errores y validaciones

- Igual que los endpoints existentes: `try/catch` → `500` con `{ error: err.message }`
  en fallos de query; `401`/`403` ya los maneja `apiKeyAuth`/`requireScope` sin cambios.
- Si el key en `.crm-incoda.env` no tiene el scope nuevo todavía (antes de que se le
  agregue en Mongo), la tool MCP debe devolver el error tal cual venga del CRM
  (`isError: true`, texto del error) — no hay que agregar manejo especial, el patrón de
  `crear_oportunidad` ya cubre esto.
- `commissions/summary` incluye detalle por persona por decisión explícita del usuario
  (2026-08-18). Nota de seguridad para el sub-proyecto del skill: cualquier registro en
  disco de lo que la Junta Directiva leyó debe tratar esos datos con el mismo cuidado
  que credenciales — no está en alcance de este spec, pero condiciona el diseño del
  siguiente.

## Plan de pruebas

Seguir la convención existente de `pnpm test` (`node --test` sobre `tests/*.test.ts`).
Si ya existen tests de `external.js` (a confirmar en el plan de implementación), usarlos
como plantilla para los 6 endpoints nuevos: request con key válido/scope correcto →
200 + forma esperada; key sin el scope → 403; sin key → 401.

## Estado de despliegue (post-implementación)

Las migraciones 004 y 005 sólo se han corrido contra el Mongo local de desarrollo
(`mongodb://127.0.0.1:27017/crm_incoda`, que tiene 0 documentos `ApiKey`). La base de
datos de producción real (desplegada vía Docker + Cloudflare Tunnel a `crm.incoda.biz`,
según el historial de git de este repo) nunca fue alcanzada desde ninguna sesión que
construyó esta feature. En consecuencia, `POST /api/v1/leads`, los 6 endpoints GET
nuevos y las tools MCP correspondientes están inertes en producción hasta que ambas
migraciones se corran ahí manualmente con credenciales de producción. La migración 004
ahora requiere pasar la API key en texto plano como argumento de línea de comandos (ver
`server/migrations/004-add-board-scopes-to-api-keys.js`).
