# Plan de Responsive Design — CRM Blackmoon

> **Objetivo**: Hacer que toda la aplicacion CRM sea completamente responsive (mobile-first) sin romper la experiencia desktop existente.
> **Estado**: SOLO PLAN — no se realizan cambios de codigo.

---

## Diagnostico Actual

### Lo que YA funciona en mobile
- Sidebar colapsa a menu hamburguesa (`isMobileMenuOpen` en UIStore)
- Dashboard: layout basico OK en 375px
- Viewport meta tag configurado correctamente
- PWA meta tags presentes (apple-mobile-web-app-capable)

### Problemas Detectados
1. **CRM Pipeline (Kanban)**: columnas con scroll horizontal, botones de cambio de vista cortados
2. **Tablas**: ~15 componentes usan `<table>` sin wrapper `overflow-x-auto` consistente
3. **Modales**: anchos fijos (`w-[600px]`, `max-w-2xl`) que desbordan en pantallas <400px
4. **Grids**: algunos usan `grid-cols-3` o `grid-cols-4` sin breakpoints responsive
5. **Formularios**: inputs en fila que no se apilan en mobile
6. **Sidebar derecho/paneles**: layouts de 2 columnas fijas (ej: TemplateManager `w-80` sidebar)
7. **Texto/botones**: tamanios fijos que no escalan
8. **ProposalPrint**: split view `w-1/2` inutilizable en mobile

---

## Fases de Implementacion

### FASE 1: Fundamentos (Prioridad Alta)
> Cambios globales que afectan toda la app

#### 1.1 — App Shell Layout (`App.tsx`)
- **Archivo**: `App.tsx` (lineas ~319-490)
- **Cambio**: Verificar que el layout principal `flex h-screen` maneja correctamente el sidebar drawer en todas las resoluciones
- **Breakpoints**: `md:` (768px) como punto de corte sidebar visible/oculto
- **Patron**: Mobile = sidebar oculto + header con hamburguesa; Desktop = sidebar fijo `w-64`

#### 1.2 — Estilos Base (`index.html`)
- **Archivo**: `index.html`
- **Cambio**: Agregar utilidades CSS responsive globales:
  ```css
  /* Safe area para notch de iPhone */
  body { padding-env: safe-area-inset-top; }
  
  /* Touch targets minimos */
  @media (max-width: 768px) {
    button, a, [role="button"] { min-height: 44px; min-width: 44px; }
  }
  ```

---

### FASE 2: Componentes con Tablas (Prioridad Alta)
> 15+ componentes afectados — usar patron consistente

#### Componentes a modificar:
| Componente | Linea tabla | Tiene overflow-x-auto? |
|---|---|---|
| `Dashboard.tsx` | 585, 695, 753 | Si (584, 694), No (753) |
| `SalesTaskManager.tsx` | 270 | No |
| `SKUManager.tsx` | 136 | No |
| `UserManagement.tsx` | 146 | No |
| `ConsultantPortal.tsx` | 548, 686, 818, 1278 | No |
| `ProjectManager.tsx` | 947, 1077, 1282 | No |
| `PipelineTableView.tsx` | 132 | Si (131) |
| `CustomFieldsManager.tsx` | 289 | Si (288) |
| `TimeApprovalManager.tsx` | 382 | Si (381) |
| `ProposalPrint.tsx` | 613 | No |

#### Patron a aplicar:
```tsx
{/* Envolver TODA tabla en: */}
<div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
  <table className="w-full text-sm min-w-[600px]">
    {/* ... */}
  </table>
</div>
```

#### Alternativa para mobile (tablas simples):
- Convertir tablas de <5 columnas a **card layout** en mobile:
```tsx
{/* Desktop: tabla | Mobile: cards */}
<div className="hidden md:block">
  <table>...</table>
</div>
<div className="md:hidden space-y-3">
  {items.map(item => <MobileCard key={item.id} {...item} />)}
</div>
```

---

### FASE 3: CRM Pipeline / Kanban (Prioridad Alta)
> Modulo mas afectado visualmente

#### 3.1 — `CRMPipeline.tsx`
- **Problema**: Columnas Kanban con ancho fijo desbordando
- **Solucion**:
  - Mobile: mostrar **una columna a la vez** con tabs/selector de etapa
  - Tablet: scroll horizontal con snap points
  - Desktop: todas las columnas visibles
- **Patron**:
  ```tsx
  {/* Mobile: selector de etapa + lista vertical */}
  <div className="md:hidden">
    <select onChange={setActiveStage}>...</select>
    <div className="space-y-3">{filteredLeads.map(...)}</div>
  </div>
  
  {/* Desktop: kanban horizontal */}
  <div className="hidden md:flex gap-4 overflow-x-auto">
    {stages.map(stage => <KanbanColumn />)}
  </div>
  ```

#### 3.2 — `PipelineManager.tsx`
- **Problema**: Panel lateral de detalle + columnas = demasiado contenido horizontal
- **Solucion**: En mobile, detalle abre como **BottomSheet** o modal fullscreen

#### 3.3 — Botones de vista (Kanban/Table/Analytics)
- **Problema**: Botones cortados en 375px
- **Solucion**: Usar iconos sin texto en mobile, texto completo en desktop
  ```tsx
  <button>
    <Icon size={18} />
    <span className="hidden sm:inline ml-1">{label}</span>
  </button>
  ```

---

### FASE 4: Modales y Formularios (Prioridad Media)

#### 4.1 — Patron de Modal Responsive
Aplicar a TODOS los modales (~12 componentes):
```tsx
<div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
  <div className="bg-white w-full md:max-w-lg md:rounded-xl rounded-t-xl 
                  max-h-[90vh] md:max-h-[80vh] overflow-y-auto">
    {/* Mobile: bottom sheet | Desktop: centered modal */}
  </div>
</div>
```

#### Componentes con modales a actualizar:
- `ContactManager.tsx` (linea 170)
- `CustomFieldsManager.tsx` (lineas 350, 364)
- `TemplateManager.tsx` (lineas 400, 462)
- `SalesTaskManager.tsx` (lineas 372, 479)
- `CRMPipeline.tsx` (modal de lead)
- `ProjectManager.tsx` (modales de proyecto/tarea)
- `CommandPalette.tsx` (linea 215 — ya funciona bien)
- `NotificationCenter.tsx` (dropdown)

#### 4.2 — Formularios
- Inputs en `flex` row → `flex flex-col sm:flex-row`
- Botones de accion → `flex flex-col-reverse sm:flex-row` (primario arriba en mobile)
- Labels: siempre visibles, nunca solo placeholder

---

### FASE 5: Grids y Cards (Prioridad Media)

#### 5.1 — Dashboard (`Dashboard.tsx`)
- **Linea 201**: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` — YA responsive
- **Linea 307**: `grid-cols-1 md:grid-cols-2` — YA responsive
- **Linea 357**: Verificar grid de pipeline stages
- **Charts (Recharts)**: Agregar `<ResponsiveContainer>` si no esta, reducir margenes en mobile

#### 5.2 — ConsultantPortal (`ConsultantPortal.tsx`)
- Tabs superiores: scroll horizontal en mobile con `overflow-x-auto whitespace-nowrap`
- Cards de proyecto: single column en mobile

#### 5.3 — ProposalPrint (`ProposalPrint.tsx`)
- **Linea 322**: `w-1/2` split view → fullscreen en mobile con toggle editor/preview
- **Linea 343**: Preview modal → fullscreen en mobile

---

### FASE 6: Layouts de Dos Paneles (Prioridad Media)

#### 6.1 — TemplateManager (`TemplateManager.tsx`)
- **Problema**: `w-80` sidebar fijo + contenido
- **Solucion mobile**: sidebar como panel colapsable o tabs
  ```tsx
  <div className="flex flex-col md:flex-row h-full">
    <div className="md:w-80 md:border-r border-b md:border-b-0">
      {/* Lista de templates */}
    </div>
    <div className="flex-1">
      {/* Detalle del template */}
    </div>
  </div>
  ```

#### 6.2 — ProposalTemplateManager (`ProposalTemplateManager.tsx`)
- Mismo patron que TemplateManager

#### 6.3 — AccountManager / FinanceManager
- Verificar layouts de dos columnas y aplicar patron flex-col/flex-row

---

### FASE 7: Navegacion y Header (Prioridad Baja)

#### 7.1 — Header Bar
- Search icon en lugar de barra completa en mobile
- Notificaciones: dropdown alineado a la derecha sin desbordar
- User menu: fullwidth en mobile

#### 7.2 — NavLink labels
- Verificar que labels largos no rompan el sidebar
- Truncar con `truncate` si necesario

---

### FASE 8: Detalles Finales (Prioridad Baja)

#### 8.1 — Touch targets
- Botones de accion en tablas (edit/delete): minimo 44x44px
- Iconos de accion: agregar padding touch area

#### 8.2 — Tipografia responsive
- Titulos: `text-xl md:text-2xl`
- Subtitulos: `text-base md:text-lg`
- Body: mantener `text-sm`

#### 8.3 — Spacing responsive
- Padding de pagina: `p-4 md:p-6`
- Gaps: `gap-3 md:gap-6`

#### 8.4 — Login Page
- **ISSUE-005 diferido**: Logo recortado ("ACK ULTING" visible) — corregir sizing del logo
- Formulario centrado, max-width en desktop, fullwidth en mobile

---

## Breakpoints a Usar (Tailwind defaults)

| Prefijo | Min-width | Dispositivo |
|---|---|---|
| (default) | 0px | Mobile portrait |
| `sm:` | 640px | Mobile landscape |
| `md:` | 768px | Tablet |
| `lg:` | 1024px | Desktop |
| `xl:` | 1280px | Desktop grande |

---

## Archivos Afectados (Resumen)

### Criticos (Fase 1-3)
1. `App.tsx` — shell layout + sidebar
2. `index.html` — estilos globales responsive
3. `components/CRMPipeline.tsx` — kanban mobile
4. `components/PipelineManager.tsx` — panel detalle
5. `components/PipelineTableView.tsx` — tabla pipeline

### Importantes (Fase 4-6)
6. `components/Dashboard.tsx` — charts + tablas
7. `components/ContactManager.tsx` — modal + tabla
8. `components/CustomFieldsManager.tsx` — modales
9. `components/TemplateManager.tsx` — layout 2 paneles
10. `components/SalesTaskManager.tsx` — modal + tabla
11. `components/ConsultantPortal.tsx` — tabs + tablas
12. `components/ProjectManager.tsx` — modales + tablas
13. `components/ProposalPrint.tsx` — split view
14. `components/ProposalTemplateManager.tsx` — 2 paneles
15. `components/SKUManager.tsx` — tabla
16. `components/UserManagement.tsx` — tabla
17. `components/TimeApprovalManager.tsx` — tabla

### Menores (Fase 7-8)
18. `components/NotificationCenter.tsx` — dropdown
19. `components/CommandPalette.tsx` — ya funciona bien
20. `components/Login.tsx` — logo + form

---

## Criterios de Aceptacion

- [ ] Todas las paginas visualmente correctas en 375px (iPhone SE)
- [ ] Todas las paginas visualmente correctas en 768px (iPad)
- [ ] Sidebar funciona como drawer en mobile, fijo en desktop
- [ ] Tablas con scroll horizontal o card-view en mobile
- [ ] Modales no desbordan la pantalla
- [ ] Touch targets minimo 44x44px
- [ ] No scroll horizontal involuntario en ninguna pagina
- [ ] Kanban usable en mobile (selector de etapa o scroll con snap)
- [ ] Formularios legibles y usables en mobile
- [ ] Logo login no cortado
- [ ] Performance: no degradacion visible en mobile

---

## Orden de Ejecucion Sugerido

```
Fase 1 (fundamentos)     →  ~2h
Fase 2 (tablas)           →  ~3h  (15 componentes, cambio repetitivo)
Fase 3 (kanban/pipeline)  →  ~4h  (cambio UX significativo)
Fase 4 (modales/forms)    →  ~3h  (12 modales)
Fase 5 (grids/cards)      →  ~2h
Fase 6 (2 paneles)        →  ~2h
Fase 7 (nav/header)       →  ~1h
Fase 8 (detalles)         →  ~1h
```

**Total estimado: 8 fases, ~20 archivos afectados**
