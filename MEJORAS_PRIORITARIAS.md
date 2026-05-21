# CRM Incoda — Plan de Mejoras Prioritarias
> Generado: 2026-04-01

## Scores Actuales por Módulo

| Módulo | Score | Estado |
|---|---|---|
| Pipeline / Sales | 9/10 | Sólido |
| Proyectos | 10/10 | Diferenciador |
| Finanzas | 10/10 | Diferenciador |
| Reportes / Analytics | 8/10 | Bueno |
| UX / Mobile | 8/10 | Bueno |
| AI Features | 7/10 | Mejorable |
| Contactos / Cuentas | 4/10 | **Gap crítico** |
| Automatización | 3/10 | **Gap crítico** |

---

## Fase 1 — Quick Wins (1-2 semanas, alto ROI)

### 1.1 Win/Loss reason al cerrar deal
- Agregar campo `closedReason` + `closedNote` al modelo `Lead`
- Modal al mover a `closed-won` o `closed-lost`
- **Impacto**: todos los CRM top lo tienen; permite análisis de por qué se pierden deals

### 1.2 Acciones masivas en Pipeline
- Checkbox multi-select en tabla + kanban
- Bulk: cambiar etapa, asignar responsable, exportar selección
- **Impacto**: productividad del equipo de ventas

### 1.3 Cuota de ventas por rep + leaderboard
- Agregar `salesQuota` mensual/trimestral al modelo `User`
- Widget en Dashboard: % attainment por rep
- **Impacto**: motivación + visibilidad gerencial

### 1.4 AI Next Action por deal
- Nuevo endpoint `/api/aiScore/:id/suggestion`
- Contexto: stage actual + días sin actividad + historial
- Mostrar sugerencia en el card del lead
- **Impacto**: diferenciador vs Pipedrive/HubSpot con su AI

### 1.5 Validación de formularios (zod + react-hook-form)
- Reemplazar `useState` ad-hoc en formularios
- Validación client-side antes de llamar API
- **Impacto**: UX + integridad de datos

---

## Fase 2 — Mejoras Estructurales (2-4 semanas)

### 2.1 Entidad Account/Empresa separada de Contact
- Nuevo modelo `Account` { name, industry, size, website, address }
- `Contact.accountId` FK → Account
- `Lead.accountId` FK → Account
- Vista Account con todos sus deals y contactos
- **Impacto**: gap crítico vs todos los CRM top

### 2.2 Timeline de actividad por Contact/Lead
- Modelo `Activity` { type, note, date, userId, entityId, entityType }
- Feed cronológico en el detalle del lead/contacto
- Log automático en stage changes, notas, emails
- **Impacto**: visibilidad del historial de relación

### 2.3 Motor de Automatización básico
5 triggers + 4 acciones:

**Triggers:**
- Lead cambia de etapa
- Lead lleva N días sin actividad
- Deal cerrado como won
- Nuevo lead asignado
- Campo actualizado

**Acciones:**
- Crear tarea
- Enviar email (template)
- Enviar webhook
- Notificación interna

### 2.4 Importación CSV de leads/contactos
- Endpoint `/api/leads/import` con multer + papaparse
- Mapeo de columnas en UI
- Preview + validación antes de importar

### 2.5 Paginación server-side
- Deuda técnica crítica: hoy carga colecciones completas
- Agregar `?page=1&limit=50&sort=createdAt` a todos los endpoints
- **Impacto**: performance con más de 500 registros

---

## Fase 3 — Diferenciadores Premium (1-2 meses)

### 3.1 Generación de PDF de facturas/propuestas
- Puppeteer o `@react-pdf/renderer`
- Template con datos del proyecto + líneas de item
- **Impacto**: elimina workflow manual fuera del CRM

### 3.2 Google Calendar sync
- OAuth2 con Google
- Crear evento al agendar next-step con fecha
- Ver agenda del rep en Dashboard

### 3.3 PWA + Mobile
- `manifest.json` + service worker
- Vistas simplificadas para móvil (agregar nota, cambiar etapa)
- **Impacto**: uso en campo

### 3.4 Panel AI Insights en Dashboard
- "Top 5 deals para atacar hoy" (basado en score + días sin actividad)
- "Deals en riesgo de estancamiento"
- "Proyectos con riesgo de desviación de budget"

### 3.5 Múltiples pipelines
- `Pipeline` entity con stages configurables por pipeline
- Filtro por pipeline en kanban/tabla

---

## Deuda Técnica Crítica

| Item | Prioridad |
|---|---|
| Prop drilling excesivo en App.tsx (15+ useState) → Zustand/Context | Alta |
| `consultantName` string → `consultantId` FK | Alta |
| Paginación server-side | Alta |
| Tailwind vía CDN (3.5MB) → build con PostCSS | Media |
| Cobertura de tests (hoy: 0%) | Media |
| Concurrencia: last-write-wins → 409 Conflict | Baja |

---

## Fortalezas Únicas (No tocar)

1. **Vertical post-venta completo**: proyectos + horas + rentabilidad + comisiones + balance sheet — ningún CRM genérico lo tiene
2. **Offline-first**: cola de escrituras pendientes con auto-flush
3. **Profundidad financiera**: balance GAAP, historial de salarios, tarifas por consultor
