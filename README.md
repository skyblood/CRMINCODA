# CRM Blackmoon

Sistema CRM full-stack para gestión de ventas, proyectos, finanzas y consultoría. Cubre el ciclo completo de un negocio de tecnología: desde la captura de un lead hasta el pago de comisiones.

```
Lead → Calificación → Propuesta → Won → Proyecto → Horas aprobadas → Facturado → Comisión pagada
```

---

## Tabla de Contenidos

1. [Stack Tecnológico](#stack-tecnológico)
2. [Arquitectura](#arquitectura)
3. [Módulos y Funcionalidades](#módulos-y-funcionalidades) *(28 módulos)*
4. [Control de Acceso (RBAC)](#control-de-acceso-rbac)
5. [Persistencia y Modo Offline](#persistencia-y-modo-offline)
6. [Colecciones MongoDB](#colecciones-mongodb)
7. [Seguridad](#seguridad)
8. [Notificaciones por Email](#notificaciones-por-email)
9. [Notificaciones Persistentes](#notificaciones-persistentes)
10. [Webhooks Salientes](#webhooks-salientes)
11. [Búsqueda Global](#búsqueda-global)
12. [Export de Reportes](#export-de-reportes)
13. [API Externa](#api-externa)
14. [Sistema de Diseño](#sistema-de-diseño)
15. [Setup y Ejecución](#setup-y-ejecución)
16. [Tests](#tests)
17. [Agregar un Nuevo Módulo](#agregar-un-nuevo-módulo)

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite 5 |
| Routing | React Router v6 (HashRouter) |
| Estado global | Zustand 5 (`useDataStore` · `useAuthStore` · `useUIStore`) |
| UI / Estilos | Tailwind CSS 3 (PostCSS build) + Lucide React + Recharts |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Backend | Node.js ESM + Express 4 |
| WebSockets | Socket.io 4 (server) + socket.io-client (browser) |
| AI | @anthropic-ai/sdk — claude-haiku-4-5 (lead scoring, risk reports, sales forecast) |
| Base de datos | MongoDB 7 + Mongoose 8 |
| Auth | express-session + bcryptjs |
| Seguridad | Helmet + express-rate-limit |
| Email | Nodemailer + Gmail SMTP |
| Scheduler | node-cron |
| Testing | Vitest 2 + happy-dom |
| Package manager | pnpm |

---

## Arquitectura

Flat file layout — sin subdirectorio `src/`. Los archivos principales están en la raíz del repo:

```
App.tsx                  # Root component: routing, sidebar, lazy imports
store/index.ts           # Tres stores Zustand (data, auth, ui)
components/              # Un archivo por módulo (lazy-loaded)
services/
  firebaseService.ts     # Capa de datos: fetch → Express → MongoDB
  geminiService.ts       # Integración Gemini AI (reporte de riesgo)
server/
  index.js               # Express entry point, registra todas las rutas
  routes/crud.js         # createCrudRouter(Model) — factory CRUD genérico
  emailService.js        # nodemailer + Gmail SMTP
  socketInstance.js      # Socket.io singleton
  auditService.js        # Registro de cambios por entidad
  notificationService.js # Generación automática de notificaciones internas
  webhookService.js      # Despacho de webhooks salientes con retry
  models/                # Esquemas Mongoose
  routes/                # Rutas Express por dominio
  services/              # Servicios auxiliares del backend
index.html               # Overrides de marca en bloque <style>
tailwind.config.js       # Paleta bm-* personalizada
```

### Frontend

- **Estado global**: tres stores Zustand en `store/index.ts` — `useDataStore` (colecciones), `useAuthStore` (usuario/sesión), `useUIStore` (conexión, menú mobile, notificaciones, paleta). Los componentes se suscriben solo a la slice que necesitan.
- **Routing**: `HashRouter` — todas las rutas declaradas en `App.tsx`. Cada ruta protegida redirige a `/` si el usuario no tiene permiso.
- **Code splitting**: cada componente en `components/` usa `React.lazy()` + `Suspense`. Solo se descarga el código del módulo al navegar a él.
- **Estilos**: Tailwind CSS 3 compilado via PostCSS (sin CDN). Paleta `bm-*` en `tailwind.config.js`. Overrides de clase base en el bloque `<style>` de `index.html` con `!important`.
- **Toast UI**: `components/Toast.tsx` — event bus framework-agnóstico. `toast.success/error/warn/info()` llamable desde cualquier lugar, incluyendo `firebaseService.ts`. Auto-dismiss configurable por severidad.
- **Command Palette**: `components/CommandPalette.tsx` — búsqueda global de navegación con `Ctrl+K` / `Cmd+K`.
- **Error Boundary**: `components/ErrorBoundary.tsx` — captura errores de render sin romper la app completa.
- **Capa de datos**: `services/firebaseService.ts` abstrae todos los `fetch`. Los componentes nunca llaman `fetch` directamente. Errores de escritura disparan toast automáticamente.
- **Tiempo real**: `socket.io-client` conecta al server al iniciar. Escucha eventos `collection:change` que el backend emite tras cada mutación (POST/PUT/DELETE). Polling de respaldo reducido a 30 s.
- **Drag & Drop**: `@dnd-kit/core` con `PointerSensor` (umbral 8 px para no interferir con clicks). El Kanban permite arrastrar tarjetas entre columnas de etapa.
- **Mobile**: sidebar como drawer deslizable (`fixed` + `translate-x`) con overlay; layout `md:relative` en escritorio. Header con botón hamburguesa (`md:hidden`).

### Backend

- Corre en puerto 3001; Vite hace proxy de `/api/*` a él durante desarrollo.
- `server/routes/crud.js` exporta `createCrudRouter(Model)` — pasa un modelo Mongoose, obtén REST CRUD completo montado automáticamente.
- MongoDB conecta a `127.0.0.1:27017/crm_blackmoon`; fallback a `mongodb-memory-server` si la DB real no responde.
- Notificaciones de email se disparan server-side cuando un lead pasa a **Closed Won** (fire-and-forget).
- Audit log automático en cada mutación de leads y proyectos.
- `node-cron` ejecuta tareas programadas: reporte mensual de pagos pendientes, limpieza de logs.

### Flujo de datos

```
Componente React
  → firebaseService (fetch + offline queue)
    → Express route
      → Mongoose model
        → MongoDB
          → socket.io broadcast → todos los clientes actualizan Zustand
```

**Modo offline**: si el fetch falla, la escritura se encola en `localStorage` bajo `CRM_PENDING_WRITES_V1`. El service re-chequea cada 15 s y vacía la cola al reconectar.

---

## Módulos y Funcionalidades

### 1. Dashboard

Vista ejecutiva en tiempo real.

- KPI cards: leads activos, revenue pipeline, proyectos en curso, horas pendientes de aprobación
- Gráfico de ingresos vs. gastos mensual (Recharts AreaChart)
- Pipeline por etapa (BarChart) y distribución por tipo de proyecto (PieChart)
- Actividad reciente: últimos leads y proyectos modificados
- Top consultores por horas logueadas en el mes

### 2. CRM Pipeline (Ventas)

Gestión de oportunidades comerciales. Vista Kanban y vista tabla intercambiables.

**Etapas del pipeline**: `Prospect → Qualification → Presentation → Proposal → Negotiation → Closed Won → Project Delivered → Closed Lost`

**Por lead**:
- Datos del cliente: empresa, contacto, email, teléfono, país, industria
- Ítems de cotización con categoría, cantidad, costo, margen y precio unitario
- Campos para licencias: año(s) de licencia y fecha de facturación/pago
- Valor total calculado automáticamente desde los ítems
- Probabilidad de cierre
- Fecha estimada de cierre
- Campos personalizados dinámicos (definidos en Custom Fields Manager)
- Stage history: cuántos días estuvo en cada etapa
- Próximo paso con fecha límite y log de pasos completados
- Log de interacciones (llamadas, emails, reuniones) con notas y fecha
- Log pre-sales: horas invertidas antes del cierre
- **AI Lead Score** (0–100): puntaje generado por claude-haiku-4-5 con explicación de una línea

**Vistas**:
- **Kanban** con drag & drop entre columnas de etapa (`@dnd-kit`)
- **Tabla** (`PipelineTableView`) con ordenamiento y filtros por etapa, país, industria, score
- **Pipeline Analytics** (`PipelineAnalytics`): métricas de conversión por etapa, tiempo promedio, distribución de revenue

**Acciones**:
- Crear/editar lead con modal completo
- Mover de etapa arrastrando o desde el modal
- **Pipeline Path visual** (`PipelinePath`): barra de progreso horizontal con etapas, indicador de probabilidad y tooltip de criterios de entrada — al hacer clic avanza la etapa
- Enviar email al contacto directamente desde el lead
- Exportar CSV filtrado
- **Conversión multi-proyecto**: al pasar a Closed Won, se crean proyectos separados por categoría; cada ítem `hours_pack` genera su propio proyecto con el valor completo como pago
- **Sincronización bidireccional**: los ítems de cotización (`items`) se sincronizan automáticamente con `costingItems` — cambios en uno se reflejan en el otro
- Los line items se preservan íntegramente durante la conversión a proyecto

### 3. Project Manager

Gestión de proyectos post-venta.

**Tipos**: `implementation`, `support`, `consulting`, `license`, `hours_pack`

**Sidebar**: los proyectos activos se agrupan por tipo en cuatro secciones visuales independientes:
- **Implementación** (indigo) — `implementation`, `consulting`
- **Horas** (azul) — `hours_pack`
- **Licencia** (púrpura) — `license`
- **Soporte** (naranja) — `support`

Cada grupo muestra el conteo y solo aparece si tiene proyectos activos.

**Jerarquía**:
```
Proyecto
  └─▶ Tareas (Task)
        └─▶ Subtareas (SubTask)
```

**Por tarea**: asignado, estado (`todo` / `in-progress` / `done`), horas estimadas vs. logueadas, fechas, prioridad, asignación de consultores por subtarea, notas de sesión del PM.

**Time Logs**: log por tarea/subtarea — consultor, horas, fecha, descripción.
Flujo de aprobación: `pending → approved → paid / rejected`

Al registrar horas, el admin selecciona el consultor desde un `<select>` con todos los usuarios. El backend captura `hourlyCostSnapshot` + `entryCost` en ese momento. Si el consultor no tiene tarifa registrada, el log se guarda igual sin costo calculado (no fatal).

**Merge guard de consultor**: los consultores sólo reciben sus propios time logs vía GET (filtrados server-side). El PUT del consultor no puede sobrescribir logs de otros: el backend fusiona los logs de "otros consultores" del estado actual en BD con los del payload antes del `$set`.

**Tickets de soporte** (proyectos `support` / `hours_pack`):
- Título, descripción, área, reportado por, razón out-of-scope, prioridad, estado
- Prioridades: `low`, `medium`, `high`, `critical`
- Estados: `open → in-progress → resolved → closed`

**Tickets de fabricante** (`ManufacturerTickets`): módulo embebido en cada proyecto ganado para rastrear incidencias abiertas con el proveedor/fabricante.
- Campos: título, número de caso del proveedor, nombre del fabricante, fecha de apertura, categoría, prioridad, estado, descripción, resolución
- Categorías: `bug`, `feature-request`, `installation`, `performance`, `other`
- Estados: `open → in-progress → waiting-vendor → waiting-us → resolved → closed`
- Sistema de notas/seguimiento: cada ticket tiene un log de notas con autor, fecha y texto
- No requiere cambios en el backend — persiste en `project.manufacturerTickets[]` vía `updateProject`

**Financiero del proyecto**: pagos recibidos del cliente, tarifas por consultor (`consultantRates`), comisión de fábrica, barra de burn de presupuesto. `budgetedCost` heredado del costeo del lead (calculado individualmente por proyecto, no como total del lead).

**Dashboard de progreso** (proyectos `implementation`): % completado, KPI cards, barra de progreso por fase.

**Otras funciones**: reporte de riesgo IA (Anthropic — `POST /api/ai/risk-report`), cierre de proyecto, aplicar plantilla al crear.

### 4. Portal del Consultor

Vista restringida para usuarios con rol `consultant`.

- Lista de proyectos asignados al consultor autenticado
- Detalle de tareas y subtareas propias
- Notas de sesión del PM en sus subtareas (badge ámbar)
- Log de horas: crear/editar registros, ver estado de aprobación
- Sin acceso a datos financieros ni de otros consultores

### 5. Time Approval Manager

Bandeja de aprobación de horas (admin / sales).

- Lista de todos los time logs con estado `pending`, agrupados por proyecto y consultor
- Filtro por año; mes por defecto en **Todos** (no el mes actual) para que no se pierdan logs de meses anteriores
- Filtro por mes disponible para acotar la vista
- Aprobar/rechazar individualmente o en lote (checkbox por fila + select-all por consultor)
- Revertir a `pending` desde historial
- **Resumen de aprobación**: al seleccionar logs, muestra tarifa editable por consultor y total a aprobar
- **Historial**: tab separado con logs `approved` y `paid`, con opción de marcar como pagado
- **Resumen por consultor** (pestaña Payroll): bloque debajo de la tabla de horas aprobadas que muestra horas totales y monto pendiente por consultor, con total acumulado
- Al aprobar: asignar tarifa de aprobación (`approvedRate`) y costo resultante (`approvedCost = hours × rate`)
- Al aprobar: cambia estado a `approved`, visible en nómina y rentabilidad

### 6. Finance Manager

Central financiera del negocio (solo admin).

| Tab | Contenido |
|---|---|
| Annual Trends | P&L mensual, ingresos vs. gastos, margen bruto/neto, flujo de caja acumulado, Transaction Log |
| Advanced Metrics (KPIs) | Gross/Net margin, utilización, CAC, LTV, rentabilidad por proyecto, inversión pre-sales |
| Accounts Receivable | Cuentas por cobrar: servicios y licencias con progreso de pago por cliente/proyecto |
| Payroll & Payments | Nómina mensual: horas aprobadas listas para pagar, historial de pagos, salarios fijos |
| Expense Log & Analytics | Registro de gastos con categoría, proyecto, lead; gráficos por categoría/proyecto/consultor |

**Transaction Log** (en Annual Trends): lista todas las transacciones con búsqueda, filtros por tipo y categoría.
- Ingresos **cobrados** (fecha pasada): fondo verde suave, badge **Cobrado**
- Ingresos **proyectados** (`billingDate` o `paymentDate` en el futuro): fondo ámbar, badge **⏱ Pendiente cobro**
- Gastos: fondo blanco, badge **Expense**

**Ingresos proyectados**: al convertir un lead a Closed Won, cada line item con `billingDate` genera una `Transaction income` programada. Aparece como ingreso esperado en el año de billing; solo pasa a "cobrado" cuando el `billingDate`/`paymentDate` queda en el pasado.

**Resumen por consultor** (en Payroll): bloque debajo de la tabla de horas aprobadas pendientes de pago; muestra horas totales y monto a pagar por consultor, ordenados de mayor a menor, con total acumulado.

**Métricas**: margen bruto = ingresos − costos directos (horas × tarifa); margen neto = margen bruto − gastos operativos.

### 7. Profitability Report

Rentabilidad por proyecto: revenue, costo de horas, margen, % margen. Vista tabla + gráfico barras agrupadas.

### 8. Commissions Manager

Liquidación de comisiones para el equipo de ventas.

- Configuración de porcentaje de comisión por rol o usuario
- Cálculo automático desde leads `Closed Won` en el periodo
- `budgetedCost` del costeo se incluye en los cálculos de comisión
- Estado de pago por consultor: pendiente / pagado
- Export CSV

### 9. Balance Sheet

Balance general contable por año fiscal.

- Activos, pasivos y patrimonio con cuentas personalizables
- Notas/revelaciones adjuntas al balance
- Variación vs. año anterior

### 10. Contacts

Directorio de contactos comerciales: nombre, empresa, email, teléfono, país, notas.

### 11. SKU / Catálogo de Productos

Catálogo de productos y servicios con costo y precio de venta. Usado como referencia al armar ítems de un lead.

### 12. Template Manager

Plantillas de entrega reutilizables con fases y subtareas predefinidas. Al crear un proyecto `implementation` se puede aplicar una plantilla para auto-generar la estructura de tareas.

### 13. Sales Task Manager

Gestión de tareas del área comercial (no confundir con tareas de proyecto):
- Tareas propias del proceso de ventas: follow-ups, demos, propuestas
- Asignado, prioridad, fecha límite, estado

### 14. User Management

Administración de usuarios (solo admin).

- CRUD de usuarios: nombre, email, rol, permisos por módulo
- Roles: `admin`, `sales`, `consultant`
- Permisos granulares: dashboard, crm, projects, portal, admin
- Tarifa por hora (`hourlyCost`) para cálculos de rentabilidad
- Salario mensual (`monthlySalary`) con historial de cambios
- Contraseña individual (hash bcrypt server-side)

### 15. Notification Center

Centro de notificaciones internas persistidas (MongoDB, TTL 90 días para leídas).

- Notificaciones generadas automáticamente: lead won, tiempo sin actividad, horas pendientes de aprobación
- Marcar como leída / eliminar
- Badge de contador en sidebar

### 16. Notification Settings

Configuración de qué eventos generan notificaciones y a qué usuarios.

### 17. API Keys Manager

Gestión de API keys para acceso externo al CRM.

- Crear / revocar keys con nombre y permisos
- Solo se muestra la key completa en el momento de creación (hash almacenado en DB)
- Las keys autorizan requests a `/api/external/*`

### 18. Webhooks Manager

Configuración de endpoints webhook salientes.

- URL de destino, eventos suscritos, secret de firma HMAC
- Log de entregas (`webhookLogs`, TTL 30 días): status HTTP, payload, timestamp
- Retry automático hasta 3 intentos con backoff exponencial
- Test manual de entrega desde el panel

### 19. Pipeline Analytics

Métricas avanzadas del pipeline de ventas:
- Tasa de conversión por etapa
- Tiempo promedio en cada etapa (días)
- Revenue por industria / país / consultor
- Leads ganados vs. perdidos por periodo

### 20. Custom Fields Manager

Definición de campos personalizados para el formulario de leads.

- Tipos: `text`, `number`, `date`, `select`, `boolean`
- Los campos se guardan en `settings.customFieldDefinitions`
- Los valores se almacenan en `Lead.customData`

### 21. Account Manager

Directorio de cuentas empresariales (nivel firma, por encima de contactos individuales).

- CRUD de cuentas con nombre, industria, tamaño, país, notas
- Asociación con leads y contactos

### 22. Activity Timeline

Historial de actividades unificado por entidad (lead o proyecto).

- Registro de llamadas, emails, reuniones, notas con fecha y tipo
- Vista cronológica embebida en el detalle de cada lead

### 23. AI Insights Panel

Panel de análisis inteligente por oportunidad.

- Usa `@anthropic-ai/sdk` (claude-haiku-4-5) para generar recomendaciones contextuales
- Análisis de riesgo, probabilidad de cierre y próximos pasos sugeridos
- Se activa desde el modal de detalle de un lead

### 24. Automation Manager

Motor de automatizaciones con triggers y acciones configurables.

- Triggers: cambio de etapa, campo modificado, fecha límite, evento webhook
- Acciones: crear notificación, enviar email, disparar webhook saliente, asignar usuario
- Reglas guardadas en colección `automationRules`

### 25. Pipeline Manager

Gestión de pipelines personalizados (ej. Enterprise vs SMB).

- CRUD de pipelines con nombre, color y descripción
- Todas las pipelines comparten las mismas etapas globales (`DEFAULT_STAGES`)
- Filtro de pipeline en la vista Kanban

### 26. Proposal Template Manager

Biblioteca de plantillas de propuestas comerciales reutilizables.

- CRUD de plantillas con nombre, secciones y contenido personalizable
- Se usan como base al generar una propuesta desde un lead (`ProposalPrint`)

### 27. Financial Balance Report

Reporte financiero completo de la compañía (solo admin). Accesible desde la ruta `/financial-balance`.

Llama internamente a `GET /api/reports/financial-balance` y presenta los resultados en secciones:

- **Executive Summary**: cash in, billed pending, total expenses, operating margin, net delta, runway
- **Revenue**: MRR vs one-shot, billed vs collected mensual, DSO, AR aging, top clients, top debtors, concentration risk
- **Margins**: por línea de servicio, por top clients, por proyecto activo
- **Operations**: utilización de consultores, costo de hora facturable, sub/sobreutilizados
- **Pipeline**: velocity, conversión cotización→factura, pipeline ponderado, proyección próximo trimestre
- **Commissions**: committed, paid, pending, exposición próximos 60 días
- **Expenses**: por categoría, tendencia mensual, recomendaciones, benchmarks
- **Cash Forecast 90d**: escenarios pesimista / base / optimista (13 semanas), fecha de crunch proyectada

Requiere sesión con `role: 'admin'` o `permissions.admin: true`.

```
GET /api/reports/financial-balance?from=YYYY-MM-DD&to=YYYY-MM-DD&currency=USD&includeLegacy=false
```

Documentación detallada de cada métrica: [`docs/financial-balance.md`](docs/financial-balance.md)

### 28. Sistema de Costeo (Costing Review)

Módulo de revisión y aprobación de costos antes de convertir un lead en proyecto.

**Flujo**: `Lead con ítems → Costing Review → Aprobación → Conversión a proyecto`

**Por ítem de costeo**:
- Base Cost (costo base editable)
- Sale Price (precio de venta desde la cotización)
- Margen calculado automáticamente: `precio − baseCost` y porcentaje
- Status: `pending` → `approved`
- Horas estimadas y razón de override

**Aprobación**:
- Solo usuarios con `canApproveCosting` o rol `admin` pueden aprobar
- Comentario opcional al aprobar
- **Gate de conversión**: no se puede convertir a proyecto hasta que todos los ítems estén aprobados

**Sincronización**:
- `costingItems` se sincronizan bidireccionalmente con los ítems de cotización del lead
- `budgetedCost` se calcula por proyecto individual (no como total del lead) al momento de la conversión
- Endpoint: `PATCH /api/leads/:id/costing-items` para guardar cambios de costeo

---

## Control de Acceso (RBAC)

| Módulo | admin | sales | consultant |
|---|:---:|:---:|:---:|
| Dashboard | ✓ | ✓ | ✓ |
| CRM Pipeline | ✓ | ✓ | — |
| Pipeline Analytics | ✓ | ✓ | — |
| Pipeline Manager | ✓ | — | — |
| Project Manager | ✓ | ✓ | read-only |
| Consultant Portal | ✓ | — | ✓ |
| Time Approval | ✓ | ✓ | — |
| Finance Manager | ✓ | — | — |
| Balance Sheet | ✓ | — | — |
| Profitability | ✓ | ✓ | — |
| Commissions | ✓ | ✓ | — |
| Contacts / Accounts | ✓ | ✓ | — |
| SKU Catalog | ✓ | ✓ | — |
| Sales Tasks | ✓ | ✓ | — |
| Templates | ✓ | — | — |
| Proposal Templates | ✓ | ✓ | — |
| Automation Manager | ✓ | — | — |
| Notification Settings | ✓ | — | — |
| User Management | ✓ | — | — |
| API Keys / Webhooks | ✓ | — | — |
| Custom Fields | ✓ | — | — |
| Costing Review | ✓ | canApproveCosting | — |

- **admin**: acceso total, bypasa todas las restricciones.
- **sales**: acceso a CRM y proyectos; sin acceso a finanzas ni administración.
- **consultant**: solo ve su portal, sus tareas y sus time logs.

Permisos granulares adicionales configurables por usuario desde User Management.

---

## Persistencia y Modo Offline

#### Online (MongoDB disponible)
Todos los reads/writes van por `fetch('/api/...')` → Express → MongoDB. Socket.io broadcast actualiza todos los clientes en tiempo real.

#### Offline (servidor inalcanzable)
Las escrituras se encolan en `localStorage` bajo `CRM_PENDING_WRITES_V1`. El servicio re-chequea cada 15 s.

#### Reconexión
Al detectar que el backend está disponible, `flushPendingQueue()` despacha la cola en orden y limpia el storage.

---

## Colecciones MongoDB

| Colección | Descripción |
|---|---|
| `users` | Usuarios con rol, permisos, tarifa/salario e historial salarial |
| `leads` | Oportunidades con ítems de cotización, costingItems, etapa, interacciones, logs pre-sales, historial de etapas, próximo paso y datos personalizados |
| `projects` | Proyectos con tareas, subtareas, time logs, tickets de soporte, tickets de fabricante, pagos, tarifas |
| `transactions` | Ingresos y gastos operativos vinculados a proyectos/leads |
| `invoices` | Facturas emitidas a clientes (monto, moneda, fecha, estado, exchangeRateToUSD) |
| `payments` | Pagos recibidos vinculados a facturas (`appliedTo[]` con `invoiceId` + `amountAppliedUSD`) |
| `commissions` | Comisiones calculadas por consultor/deal |
| `contacts` | Directorio de contactos comerciales |
| `skus` | Catálogo de productos/servicios con costo y precio |
| `templates` | Plantillas de entrega con fases y subtareas predefinidas |
| `goals` | Metas de ventas anuales |
| `balanceSheetAccounts` | Entradas del balance general por año fiscal |
| `balanceSheetNotes` | Notas/revelaciones del balance |
| `apiKeys` | API Keys para acceso externo (hash almacenado, no plaintext) |
| `settings` | Configuración global singleton |
| `webhooks` | Configuración de endpoints webhook salientes |
| `webhookLogs` | Historial de entregas — TTL 30 días |
| `notifications` | Notificaciones internas persistidas — TTL 90 días (leídas) |
| `notificationlogs` | Log de notificaciones enviadas por email |
| `auditlogs` | Historial de cambios por entidad (lead/project) — TTL 1 año |
| `emailtemplates` | Plantillas de email personalizables |
| `accounts` | Cuentas empresariales (nivel firma, por encima de contactos) |
| `activities` | Historial de actividades por entidad (lead/proyecto) |
| `automationRules` | Reglas de automatización con triggers y acciones |
| `pipelines` | Definición de pipelines personalizados |
| `proposals` | Propuestas comerciales generadas para leads |
| `proposalTemplates` | Plantillas base para generación de propuestas |
| `userGoals` | Metas y OKRs individuales por usuario |
| `exchangeratecaches` | Caché de tasas de cambio de divisas |

**Estructuras embebidas clave**:

```
Project.tasks[] → Task {
  id, title, assignee, status, estimatedHours, loggedHours
  subtasks: SubTask[] → { id, title, completed, assignees[], comment? }
}

Project.timeLogs[] → TimeLog {
  id, taskId, subtaskId?, consultantName, hours, date, description
  status: 'pending' | 'approved' | 'paid' | 'rejected'
  approvedRate?, approvedCost?
}

Lead.items[] → LineItem {
  id, category, description, quantity, unitCost, margin, unitPrice, total
  years?, licenseYear?, billingDate?, paymentDate?
}

Lead.stageHistory[] → StageHistoryEntry {
  stage, enteredAt, exitedAt?, daysInStage
}

Lead.aiScore         → number | null   (0-100, null = sin puntuar)
Lead.aiScoreReason   → string          (explicación de una línea — claude-haiku-4-5)

Lead.completedNextSteps[] → CompletedNextStep {
  text, dueDate?, completedAt
}

Lead.costingItems[] → CostingItem {
  id, name, price, baseCost?, costStatus: 'pending' | 'approved',
  estimatedHours?, costOverrideReason?, quantity, _lastSyncedAt
}

Lead.costingReview → {
  approvedBy, comment?, approvedAt
}

Lead.costingSyncLog[] → SyncLogEntry {
  timestamp, direction: 'items_to_costing' | 'costing_to_items' | 'costing_edit',
  itemIds[], changes, userId
}

Project.manufacturerTickets[] → ManufacturerTicket {
  id, title, description, caseNumber, manufacturer, openedDate
  status: 'open' | 'in-progress' | 'waiting-vendor' | 'waiting-us' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  category: 'bug' | 'feature-request' | 'installation' | 'performance' | 'other'
  notes: ManufacturerTicketNote[] → { id, date, author, text }
  resolvedDate?, resolution?, createdAt
}
```

---

## Seguridad

- **Autenticación**: sesión con cookie httpOnly + bcrypt para contraseñas
- **Rate limiting**: `express-rate-limit` en todas las rutas API
- **Headers**: `helmet` con CSP, HSTS, X-Frame-Options
- **API Keys externas**: hash SHA-256 almacenado; nunca plaintext en DB
- **Webhooks**: firma HMAC-SHA256 en header `X-Signature` de cada entrega
- **CORS**: origen configurado via `CORS_ORIGIN` en `.env`
- **Sanitización de input**: middleware `server/middleware/sanitize.js`
- **Audit log**: toda mutación en leads/proyectos queda registrada con usuario, timestamp y diff

---

## Notificaciones por Email

#### Lead Won
Cuando un lead pasa a `Closed Won` se envía email automático a:
- Todos los usuarios con rol `admin` o `sales` que tengan permiso CRM
- El correo fijo configurado en `NOTIFY_EMAIL`

#### Reporte mensual de pagos pendientes
`node-cron` ejecuta el primer día de cada mes y envía resumen de cuentas por cobrar.

#### Configuración `.env`
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx   # Gmail App Password
SMTP_FROM=CRM-BLACKMOON <tu_correo@gmail.com>
NOTIFY_EMAIL=soporte@tuempresa.com
```

---

## Notificaciones Persistentes

Notificaciones internas guardadas en MongoDB (colección `notifications`).

#### Endpoints
```
GET    /api/notifications          # listar por usuario
PUT    /api/notifications/:id/read # marcar como leída
DELETE /api/notifications/:id      # eliminar
```

#### Generación automática
- Lead movido a Closed Won
- Lead sin actividad por N días
- Horas de consultor pendientes de aprobación
- Webhook con fallos consecutivos

#### TTL
- Notificaciones **no leídas**: sin expiración
- Notificaciones **leídas**: eliminadas automáticamente a los 90 días

---

## Webhooks Salientes

#### Endpoints
```
GET    /api/webhooks          # listar webhooks configurados
POST   /api/webhooks          # crear webhook
PUT    /api/webhooks/:id      # editar
DELETE /api/webhooks/:id      # eliminar
POST   /api/webhooks/:id/test # test manual
GET    /api/webhooks/:id/logs # historial de entregas
```

#### Payload enviado
```json
{
  "event": "lead.won",
  "timestamp": "2026-03-31T00:00:00Z",
  "data": { ...lead }
}
```

#### Seguridad
Header `X-Signature: sha256=<hmac>` firmado con el secret configurado por webhook.

#### Retry logic
Hasta 3 intentos con backoff exponencial (1 s, 2 s, 4 s). Estado final registrado en `webhookLogs`.

---

## Búsqueda Global

Command Palette (`Ctrl+K` / `Cmd+K`) + endpoint de búsqueda full-text.

```
GET /api/search?q=<término>&collections=leads,projects,contacts,skus,transactions
```

Busca en paralelo en las colecciones indicadas y retorna resultados agrupados por tipo.

---

---

## Export de Reportes

Botón `ExportButton` disponible en: Finance, Profitability, Commissions, Leads y Time Logs.

```
GET /api/export/:collection?format=csv&...filtros
```

Genera CSV con los filtros activos de la vista. Descarga directa desde el browser.

---

## API Externa

Acceso programático para integraciones externas. Requiere API Key en header:

```
Authorization: Bearer <api-key>
```

```
GET  /api/external/leads      # lista de leads
POST /api/external/leads      # crear lead
GET  /api/external/projects   # lista de proyectos
```

---

## Sistema de Diseño

### Paleta Blackmoon (púrpura)

| Token | Hex | Uso |
|---|---|---|
| `bm-950` | `#090812` | Sidebar base, superficies oscuras |
| `bm-900` | `#0F0326` | Sidebar hover, filas alternadas |
| `bm-800` | `#1E0B4B` | Gradiente inicio sidebar |
| `bm-700` | `#25024C` | Gradiente medio |
| `bm-600` | `#410074` | CTA primario, estados activos, links activos |
| `bm-500` | `#6B21A8` | Gradiente fin sidebar (purple-800) |
| `bm-200` | `#B9B7C9` | Texto secundario en fondos oscuros |
| `bm-100` | `#E5E4F0` | Fondos tint, hover states |
| `bm-50`  | `#F5F5F5` | Fondo página, cards claros |

Gradiente sidebar: `linear-gradient(135deg, #090812 → #25024C → #410074)`

### Colores semánticos

- **Éxito**: `#22c55e` (green-500)
- **Advertencia**: `#f59e0b` (amber-500)
- **Error**: `#ef4444` (red-500)
- **Info**: `#3b82f6` (blue-500)

### Patrones UI

- Cards: fondo `white`, borde `gray-200`, `rounded-xl`, sombra `shadow-sm`
- Botón primario: `bg-purple-700` texto blanco, hover `bg-purple-800`
- Inputs: borde `gray-200`, focus `ring-2 ring-blue-200`
- Overrides de Tailwind en bloque `<style>` de `index.html` con `!important`
- **No crear archivos `.css` adicionales** — usar solo `index.html` y `tailwind.config.js`

---

## Setup y Ejecución

### Prerequisitos

- Node.js ≥ 20
- pnpm ≥ 10
- MongoDB 7 corriendo localmente (o accesible via URI)

### Instalación

```bash
git clone <repo>
cd CRM-BD
pnpm install
cp .env.example .env
# Editar .env con tus credenciales
```

### Variables de entorno

```env
# Base de datos
MONGO_URI=mongodb://127.0.0.1:27017/crm_blackmoon

# Seguridad — OBLIGATORIO cambiar en producción
SESSION_SECRET=<genera con el comando de abajo>
CORS_ORIGIN=https://tudominio.com
NODE_ENV=production

# Email (Gmail App Password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
SMTP_FROM=CRM-BLACKMOON <tu_correo@gmail.com>
NOTIFY_EMAIL=soporte@tuempresa.com

# AI — Lead scoring, risk reports y sales forecast (sin esto usa heurística)
ANTHROPIC_API_KEY=
```

Generar `SESSION_SECRET` seguro:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Comandos

```bash
pnpm dev          # Solo frontend (Vite, puerto 5173)
pnpm server       # Solo backend (Express, puerto 3001)
pnpm dev:full     # Ambos concurrentemente — usar para desarrollo full-stack
pnpm build        # tsc + vite build → dist/
pnpm preview      # Previsualizar build de producción
pnpm start        # build + serve (producción)
pnpm test         # Vitest (single run)
pnpm test:watch   # Vitest en modo watch
```

### Credenciales de prueba (seed)

| Nombre | Email | Contraseña | Rol |
|---|---|---|---|
| Fabian Rojas | fabian@blackmoon.com.co | admin1234 | admin |
| Kyle Reese | kyle@tech.com | kyle1234 | sales |
| Sarah Connor | sarah@future.com | sarah1234 | consultant |

> **Cambiar todas las contraseñas antes de exponer la app en producción.**

---

## Tests

Tests en `tests/` con Vitest 2 + happy-dom.

```bash
pnpm test          # ejecutar todos los tests
pnpm test:watch    # modo watch
```

Cobertura actual: utilidades de cálculo financiero, helpers de leads y modelos de datos.

---

## Agregar un Nuevo Módulo

1. Crear `components/YourModule.tsx` con el componente exportado con nombre
2. Agregar lazy import en `App.tsx`:
   ```ts
   const YourModule = React.lazy(() =>
     import('./components/YourModule').then(m => ({ default: m.YourModule }))
   )
   ```
3. Agregar `<Route path="/your-path" element={...} />` en `App.tsx`
4. Agregar link en el sidebar con ícono Lucide y condición de permiso
5. Crear modelo Mongoose en `server/models/YourModel.js`
6. Registrar `app.use('/api/yourmodel', createCrudRouter(YourModel))` en `server/index.js`
7. Agregar la colección a `COLLECTIONS` en `firebaseService.ts` si se necesita suscripción reactiva
