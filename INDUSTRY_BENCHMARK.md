# Benchmark vs. Salesforce — CRM Blackmoon

> Fecha: 2026-04-02 | Versión CRM: 2.0.0

---

## Resumen Ejecutivo

| Área | Blackmoon | Salesforce | Gap |
|------|-----------|------------|-----|
| Sales Core | 40% | 100% | -60% |
| Inteligencia Artificial | 71% | 100% | -29% |
| Automatización | 43% | 100% | -57% |
| Analytics & Reporting | 50% | 100% | -50% |
| Integraciones | 50% | 100% | -50% |
| UX & Productividad | 44% | 100% | -56% |
| Seguridad & Compliance | 63% | 100% | -37% |
| Finanzas & Facturación | 63% | 100% | -37% |
| **PROMEDIO GLOBAL** | **48%** | **100%** | **-52%** |

---

## Análisis Detallado por Área

### 1. Sales Core

| Feature | Salesforce | Blackmoon | Estado |
|---------|-----------|-----------|--------|
| Leads / Oportunidades / Cuentas / Contactos | ✅ | ✅ | Parity |
| Pipeline Kanban + Vista Lista | ✅ | ✅ | Parity |
| Forecasting colaborativo | ✅ | ⚠️ Básico | Parcial |
| Opportunity Splits (comisiones multi-vendedor) | ✅ | ⚠️ Básico | Parcial |
| Territory Management | ✅ | ❌ | Gap |
| Account Hierarchy (cuentas padre/hijo) | ✅ | ❌ | Gap |
| Duplicate Management automático | ✅ | ❌ | Gap |
| Email-to-Lead / Web-to-Lead (captura externa) | ✅ | ❌ | Gap |
| Approval Processes (flujos de aprobación) | ✅ | ❌ | Gap |
| Assignment Rules automáticas | ✅ | ⚠️ Manual | Parcial |

### 2. Inteligencia Artificial

| Feature | Salesforce | Blackmoon | Estado |
|---------|-----------|-----------|--------|
| AI Score de Leads/Oportunidades | ✅ Einstein | ✅ Gemini/Anthropic | Parity |
| AI Insights Panel | ✅ Einstein | ✅ Anthropic SDK | Parity |
| Forecasting predictivo con IA | ✅ | ✅ Anthropic | Parity |
| Next Best Action | ✅ | ❌ | Gap |
| Generación de emails / resúmenes con GPT | ✅ Einstein GPT | ❌ | Gap |
| Activity Capture automático (email/cal sync) | ✅ | ❌ | Gap |
| Conversation Intelligence (análisis de llamadas) | ✅ | ❌ | Gap |

### 3. Automatización

| Feature | Salesforce | Blackmoon | Estado |
|---------|-----------|-----------|--------|
| Automation Rules (triggers básicos) | ✅ | ✅ | Parity |
| Scheduled tasks (cron) | ✅ | ✅ node-cron | Parity |
| Webhooks salientes | ✅ | ✅ | Parity |
| Flow Builder visual (no-code) | ✅ | ❌ | Gap |
| Approval Processes (multi-nivel) | ✅ | ❌ | Gap |
| SLA Escalations automáticas | ✅ | ❌ | Gap |
| Auto-assignment de leads por reglas | ✅ | ❌ | Gap |
| Screen Flows (formularios guiados) | ✅ | ❌ | Gap |

### 4. Analytics & Reporting

| Feature | Salesforce | Blackmoon | Estado |
|---------|-----------|-----------|--------|
| Dashboard configurable | ✅ | ✅ | Parity |
| Pipeline Analytics | ✅ | ✅ | Parity |
| Reporte de Rentabilidad | ✅ | ✅ | Parity |
| Balance Sheet | ✅ | ✅ | Parity |
| Forecasting avanzado (trend + AI) | ✅ | ❌ | Gap |
| Activity Reports (por rep/equipo) | ✅ | ❌ | Gap |
| Scheduled Report Delivery (email) | ✅ | ❌ | Gap |
| BI / Tableau integration | ✅ | ❌ | Gap |

### 5. Integraciones

| Feature | Salesforce | Blackmoon | Estado |
|---------|-----------|-----------|--------|
| Google Calendar | ✅ | ✅ | Parity |
| API Keys REST | ✅ | ✅ | Parity |
| Email (SMTP / nodemailer) | ✅ | ✅ | Parity |
| Webhooks salientes | ✅ | ✅ | Parity |
| Slack nativo | ✅ | ❌ | Gap |
| Microsoft 365 / Teams | ✅ | ❌ | Gap |
| Outlook / Gmail sync bidireccional | ✅ | ❌ | Gap |
| Marketplace de integraciones (AppExchange) | ✅ | ❌ | Gap |

### 6. UX & Productividad

| Feature | Salesforce | Blackmoon | Estado |
|---------|-----------|-----------|--------|
| Command Palette (⌘K) | ✅ | ✅ | Parity |
| Toast / Notificaciones | ✅ | ✅ | Parity |
| Drag & Drop Kanban | ✅ | ✅ DnD Kit | Parity |
| Error Boundary | ✅ | ✅ | Parity |
| Mobile App nativa (iOS/Android) | ✅ | ❌ | Gap |
| Colaboración social (Chatter/feed) | ✅ | ❌ | Gap |
| Pipeline Path visual (barra de progreso por etapa) | ✅ | ❌ | Gap |
| List View Filters guardados por usuario | ✅ | ❌ | Gap |
| App Builder drag & drop | ✅ | ❌ | Gap |

### 7. Seguridad & Compliance

| Feature | Salesforce | Blackmoon | Estado |
|---------|-----------|-----------|--------|
| RBAC (roles) | ✅ | ✅ 3 roles | Parity |
| Session Auth | ✅ | ✅ | Parity |
| Bcrypt passwords | ✅ | ✅ | Parity |
| Audit Log | ✅ | ✅ | Parity |
| Field-level Security (permisos por campo) | ✅ | ✅ Role-based | Parity |
| Multi-Factor Authentication (MFA) | ✅ | ❌ | Gap |
| Record Sharing Rules (visibilidad granular) | ✅ | ❌ | Gap |
| Shield Platform Encryption | ✅ | ❌ | Gap |

### 8. Finanzas & Facturación

| Feature | Salesforce | Blackmoon | Estado |
|---------|-----------|-----------|--------|
| Finance Manager | ✅ | ✅ | Parity |
| Balance Sheet | ✅ | ✅ | Parity |
| Transactions | ✅ | ✅ | Parity |
| SKU / Catálogo de productos | ✅ | ✅ | Parity |
| CPQ / Quote Wizard | ✅ | ✅ básico | Parcial |
| Comisiones | ✅ | ✅ | Parity |
| Multi-currency | ✅ | ❌ | Gap |
| Revenue Recognition | ✅ | ❌ | Gap |
| Subscription Management | ✅ | ❌ | Gap |

---

## Roadmap de Mejoras Priorizadas

### 🔴 Alta Prioridad — Impacto inmediato en ventas

#### 1. MFA (Multi-Factor Authentication)
- **Qué**: TOTP (Google Authenticator) + código por email en login
- **Por qué**: Seguridad crítica, requerido por empresas medianas
- **Cómo**: `speakeasy` npm + QR code en UserManagement, flag `mfaEnabled` en User model
- **Esfuerzo**: 2-3 días

#### 2. Duplicate Management
- **Qué**: Detectar leads/contactos duplicados al crear/editar (por email, teléfono, empresa)
- **Por qué**: Datos limpios = forecast preciso = no contactar 2 veces al mismo prospecto
- **Cómo**: Middleware en `server/routes/leads.js` y `contacts.js` con match por email; modal de confirmación en frontend
- **Esfuerzo**: 2 días

#### 3. Email-to-Lead / Web-to-Lead
- **Qué**: Formulario embebible (script externo) que crea leads vía API pública; parsing de emails entrantes
- **Por qué**: Captura automática de prospectos desde sitio web o campañas
- **Cómo**: Endpoint público `/api/external/lead` (ya existe `routes/external.js`) + widget JS embebible
- **Esfuerzo**: 2-3 días

#### 4. AI Forecasting Predictivo ✅ IMPLEMENTADO
- **Qué**: Predicción de revenue a 30/60/90 días con health badge, top risk y top action usando Claude
- **Cómo**: `GET /api/ai/pipeline-forecast` (self-contained MongoDB aggregation + Claude Haiku) + card en `PipelineAnalytics.tsx`
- **Archivos**: `server/routes/aiReports.js`, `components/PipelineAnalytics.tsx`

#### 5. Approval Processes
- **Qué**: Flujo de aprobación configurable (ej: descuentos >20% requieren aprobación de manager)
- **Por qué**: Control de ventas y cumplimiento de políticas comerciales
- **Cómo**: Nuevo modelo `ApprovalRequest` + notificaciones vía Socket.io ya existente; UI en modal
- **Esfuerzo**: 3-4 días

---

### 🟡 Media Prioridad — Aumentan productividad del equipo

#### 6. Activity Reports por Rep / Equipo
- **Qué**: Reporte de actividades (llamadas, emails, reuniones) por vendedor y período
- **Por qué**: KPIs del equipo de ventas que todo manager necesita
- **Cómo**: Ampliar `analytics.js` con MongoDB aggregation pipeline sobre Activities; nuevo tab en Dashboard
- **Esfuerzo**: 1-2 días

#### 7. Pipeline Path Visual
- **Qué**: Barra de progreso horizontal con etapas del pipeline (como Salesforce Path)
- **Por qué**: Guía visual al vendedor — sabe exactamente en qué etapa está y qué debe hacer
- **Cómo**: Componente `PipelinePath.tsx` con stages configurables desde `PipelineManager`
- **Esfuerzo**: 1 día

#### 8. List View Filters Guardados
- **Qué**: Guardar filtros de vista por usuario (ej: "Mis leads este mes", "Deals >$50k")
- **Por qué**: Agilidad diaria — cada vendedor tiene su vista personalizada sin reconfigurar
- **Cómo**: Modelo `SavedView` (colección + filtros + userId) + selector en tablas de leads/contactos/pipeline
- **Esfuerzo**: 2 días

#### 9. Scheduled Report Delivery
- **Qué**: Envío automático de reportes por email (diario/semanal/mensual)
- **Por qué**: Managers reciben KPIs sin tener que entrar al CRM
- **Cómo**: `node-cron` (ya existe) + `nodemailer` (ya existe) + nueva ruta `reports/schedule`; config en UI
- **Esfuerzo**: 2 días

#### 10. Slack Integration
- **Qué**: Notificaciones en canal Slack al cerrar un deal, asignar lead, vencer una tarea
- **Por qué**: El equipo de ventas vive en Slack, no quiere abrir el CRM para cada alerta
- **Cómo**: Webhook saliente a Slack API desde `automationService.js`; configurar URL en `WebhookManager`
- **Esfuerzo**: 1 día

---

### 🟢 Baja Prioridad — Completitud a largo plazo

#### 11. Account Hierarchy (Cuentas padre/hijo)
- **Cómo**: Campo `parentAccount` (ObjectId ref) en `Account.js` + vista de árbol en `AccountManager`
- **Esfuerzo**: 2 días

#### 12. Field-Level Security ✅ IMPLEMENTADO
- **Qué**: Strips sensitive fields from API responses based on role (consultant/sales/admin)
- **Cómo**: `server/middleware/fieldFilter.js` — overrides `res.json` per resource; applied to `/api/leads`, `/api/users`, `/api/projects`
- **Restricciones**: Leads → consultants no ven value/probability; Users → sales no ven salarios; Projects → consultants no ven payments/commissions
- **Archivos**: `server/middleware/fieldFilter.js`, `server/index.js`

#### 13. AI Next Best Action ✅ IMPLEMENTADO
- **Cómo**: Nueva card **"Next Best Action"** en `AIInsightsPanel.tsx` — muestra acción IA (`aiNextAction`) o heurística por etapa para los top 5 deals activos; botón **Refresh** llama a `POST /api/leads/score-all` para regenerar con Claude
- **Archivos**: `components/AIInsightsPanel.tsx`

#### 14. AI Generación de Emails ✅ IMPLEMENTADO
- **Qué**: Redactar emails de seguimiento con IA basado en el contexto del lead/oportunidad
- **Cómo**: Botón **✦ AI Draft** en ActivityTimeline (visible al seleccionar tipo `Email`) → llama a `POST /api/ai/email-draft` con contexto del lead (empresa, etapa, próximo paso, historial de actividades) → Claude genera el borrador en el textarea
- **Archivos**: `server/routes/aiReports.js`, `components/ActivityTimeline.tsx`, `components/CRMPipeline.tsx`

#### 15. Multi-Currency
- **Cómo**: Campo `currency` + `exchangeRate` en Lead/Transaction; conversión automática en reportes
- **Esfuerzo**: 3 días

#### 16. Auto-Assignment Rules
- **Cómo**: Ampliar `AutomationRule` model con acción `assign`; lógica round-robin en `automationService.js`
- **Esfuerzo**: 2 días

---

## Plan de Implementación Sugerido (Sprints de 1 semana)

```
Sprint 1:  MFA + Duplicate Management
Sprint 2:  Email-to-Lead + AI Forecasting Predictivo
Sprint 3:  Approval Processes + Activity Reports
Sprint 4:  Pipeline Path + Saved Views + Slack Integration
Sprint 5:  Field-Level Security + Account Hierarchy + Auto-Assignment
Sprint 6:  AI Next Best Action + AI Email Generation + Multi-Currency
```

> Implementando Sprint 1-4 el score global sube de **46% → ~72%** vs Salesforce.

---

## Ventajas Competitivas de Blackmoon vs Salesforce

| Ventaja | Detalle |
|---------|---------|
| **Costo** | $0 vs $75–300/user/mes |
| **IA Dual nativa** | Gemini + Anthropic SDK integrados (Salesforce cobra Einstein aparte) |
| **Finance nativo** | Balance Sheet + P&L integrado (Salesforce Revenue Cloud = módulo adicional) |
| **Personalizable** | Código propio, sin límites de AppExchange ni licencias |
| **No vendor lock-in** | MongoDB propio, exportación total de datos |
| **Español nativo** | UI pensada para mercado hispanohablante desde el inicio |
| **Tiempo real** | Socket.io nativo (Salesforce Streaming API requiere config adicional) |
