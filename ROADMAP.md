# ROADMAP — CRM Incoda

Producto actual: CRM full-stack con pipeline de ventas, gestión de proyectos, finanzas y portal de consultoría.
Objetivo: evolucionar de herramienta interna a producto comercializable y escalable.

---

## Prioridad 1 — Fundamentos del Producto (corto plazo)

### 1.1 Analytics del Pipeline
El módulo más crítico que falta. Sin datos de conversión, el CRM es solo un registro.

- **Tasa de conversión por etapa** — % leads que avanzan de cada etapa a la siguiente
- **Win/Loss ratio** por fabricante, partner, país y vendedor
- **Pipeline velocity** — días promedio en pasar de Prospect a Closed Won
- **Forecasting** — proyección de ingresos esperados basada en probabilidad × valor × fecha de cierre
- **Lead source tracking** — origen del lead (inbound, outbound, referral, partner)

### 1.2 Audit Trail
Sin historial de cambios el CRM no es confiable para equipos > 2 personas.

- Registrar `createdBy`, `updatedBy`, `updatedAt` en leads, proyectos y transacciones
- Log de cambios de campo: `{ field, oldValue, newValue, user, timestamp }`
- Tab "Activity" en la ficha del lead con timeline de cambios
- Útil para compliance, disputas de comisiones y handoffs de clientes

### 1.3 Validación de Formularios
Actualmente los formularios aceptan datos inválidos silenciosamente.

- Librería `react-hook-form` + `zod` para schemas de validación
- Errores inline en tiempo real (no al submit)
- Quote builder: validar que margen no sea negativo, que precio ≥ costo
- Validación server-side espejada con los mismos schemas Zod

### 1.4 Drag & Drop en Kanban
El Kanban actual requiere abrir la ficha para cambiar etapa.

- Mover tarjetas entre columnas con drag & drop (`@dnd-kit/core`)
- Actualización optimista en UI + confirmación del servidor
- Animación fluida al soltar

---

## Prioridad 2 — Madurez Operacional (mediano plazo)

### 2.1 Capacidad y Asignación de Consultores
No hay visibilidad de quién tiene espacio para nuevos proyectos.

- **Vista de carga** — tabla semana/mes con horas asignadas por consultor
- Semáforo: verde (< 80% ocupado), amarillo (80-100%), rojo (> 100%)
- Al asignar un consultor a un proyecto, mostrar su carga actual
- KPI: horas disponibles vs. horas vendidas en el período

### 2.2 Plantillas Dinámicas
Hoy las plantillas son estáticas y parcialmente hardcodeadas.

- UI para crear, editar y clonar plantillas desde el Template Manager
- Definir fases, tareas, subtareas, horas estimadas y asignaciones por defecto
- Preview de la estructura antes de aplicar a un proyecto
- Importar/exportar plantillas como JSON

### 2.3 Reportes con Filtros Avanzados
Los reportes actuales tienen filtro solo por año.

- Filtro por rango de fechas personalizado en todos los reportes
- Filtro por consultor, partner, fabricante, país
- Desglose de comisiones por vendedor con comparativa mensual
- Rentabilidad: drill-down de proyecto → tarea → consultor
- Guardar filtros como "vista favorita"

### 2.4 Campos Condicionales en Custom Fields
Los custom fields existen pero son planos.

- Lógica condicional: mostrar campo X solo si campo Y tiene valor Z
- Validación por tipo (regex para URLs, min/max para numbers)
- Campos requeridos condicionalmente por etapa del pipeline
- Visibilidad diferenciada por rol (solo admin ve ciertos campos)

### 2.5 Bulk Operations
Sin operaciones en lote, los equipos con volumen pierden tiempo.

- Aprobación masiva de time logs por consultor o por proyecto
- Cambio de etapa en lote para leads seleccionados
- Reasignación masiva de tareas al reemplazar un consultor
- Export seleccionado (solo los leads/proyectos marcados)

---

## Prioridad 3 — Canales y Comunicación (mediano plazo)

### 3.1 Integración Slack / Teams
El equipo no vive en el CRM, vive en el chat.

- Webhook saliente a Slack con mensaje formateado (no solo JSON raw)
- Canal configurable por tipo de evento
- Acciones desde Slack: aprobar una hora, ver resumen de un lead
- Alertas proactivas: "Lead sin actividad > 7 días", "Proyecto a punto de exceder presupuesto"

### 3.2 Calendario Integrado
Las fechas de cierre y próximos pasos no tienen contexto de agenda.

- Vista calendario con próximos pasos de todos los leads
- Sincronización bidireccional con Google Calendar via OAuth
- Crear evento de Google Cal directamente desde el next step de un lead
- Vista semanal del equipo con todas las actividades

### 3.3 Email Tracking Básico
Se envían emails pero no se sabe si se leen.

- Log de emails enviados por lead (via SMTP con pixel de tracking o Resend API)
- Estado del email en la ficha del lead: Enviado / Abierto / Respondido
- Plantillas de email editables desde admin (no hardcodeadas en código)
- Respuestas recibidas vinculadas al lead automáticamente

---

## Prioridad 4 — Producto Comercializable (largo plazo)

### 4.1 Multi-tenant
Para vender el CRM como SaaS a múltiples empresas.

- Modelo de datos con `organizationId` en todas las colecciones
- Subdominios por tenant: `empresa1.crm.com`
- Plan de precios: Starter (3 usuarios), Pro (10), Enterprise (ilimitado)
- Billing via Stripe + portal de facturación self-service
- Aislamiento de datos por tenant (índices MongoDB con `organizationId`)

### 4.2 Mobile App (React Native / PWA)
El consultor en campo necesita loggear horas desde el celular.

- PWA primero: `manifest.json` + Service Worker para uso offline instalable
- Push notifications nativas (Web Push API)
- Luego: React Native con Expo para iOS/Android con la misma API
- Casos de uso mobile-first: loggear horas, ver next steps, aprobar tiempo

### 4.3 AI-Assisted Sales
IA integrada en el flujo de ventas, no solo en reportes.

- **Lead scoring automático** — puntuación 0-100 basada en tamaño, industria, interacciones y velocidad de avance
- **Sugerencia de próximo paso** — Gemini lee el historial del lead y sugiere la acción más probable de convertir
- **Resumen de lead** — al abrir una ficha, IA genera un párrafo de contexto del deal
- **Draft de propuesta** — genera borrador de propuesta en PDF basado en el quote builder
- **Detección de riesgo de churn** — alerta si un proyecto tiene señales de cliente insatisfecho

### 4.4 Portal de Cliente
El cliente ve el estado de su proyecto sin acceder al CRM interno.

- URL única por proyecto: `crm.com/portal/{token}`
- Ve: progreso de fases, horas consumidas vs. contratadas, documentos, tickets abiertos
- Puede crear tickets directamente desde el portal
- No requiere cuenta — acceso por token firmado
- Notificaciones por email cuando hay actualizaciones en su proyecto

### 4.5 Facturación Electrónica
Cierre del ciclo de caja dentro del mismo sistema.

- Generar facturas en PDF directamente desde el quote builder
- Integración con DIAN (Colombia) para facturación electrónica
- Estados de factura: Borrador → Enviada → Pagada → Vencida
- Recordatorios automáticos de cobro (3, 7, 15 días post-vencimiento)
- Reconciliación automática con los pagos registrados en Finance Manager

---

## Deuda Técnica a Resolver

| Item | Impacto | Esfuerzo |
|---|---|---|
| Migrar `firebaseService.ts` a un nombre descriptivo (`apiService.ts`) | Bajo | Bajo |
| WebSockets / SSE para reemplazar el polling de 60s en notificaciones | Alto | Medio |
| Paginación server-side en leads/proyectos (hoy carga todo) | Alto | Medio |
| Tests E2E con Playwright (login → crear lead → cerrar deal) | Alto | Alto |
| Docker Compose para setup local con un solo comando | Medio | Bajo |
| CI/CD con GitHub Actions (lint + test + build en cada PR) | Alto | Bajo |
| Documentación de la API REST (Swagger/OpenAPI auto-generado) | Medio | Bajo |

---

## Resumen de Priorización

```
Q1 (ahora)      → Analytics pipeline + Audit trail + Validación de forms + Drag & drop Kanban
Q2              → Capacidad consultores + Reportes avanzados + Bulk ops + Slack integration
Q3              → Calendario + Email tracking + Plantillas dinámicas
Q4+             → Multi-tenant + PWA + AI scoring + Portal cliente + Facturación
```
