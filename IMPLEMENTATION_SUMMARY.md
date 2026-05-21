# Implementación: Multi-Project Conversion (PODER JUDICIAL)

## Problema
Cuando un oportunidad (Lead) ganada tiene múltiples categorías de items (Implementation + License + Support + Hours Pack), el sistema **solo creaba 1 proyecto** con el tipo seleccionado en un dropdown. Los otros items se ignoraban.

### Ejemplo: PODER JUDICIAL
- Items: 1x Implementation + 1x License + 1x Vendor Support + 1x Hours Pack
- **Antes**: Solo se creaba 1 proyecto (defaulting a Implementation)
- **Después**: Se crean 4 proyectos, uno por cada tipo detectado

---

## Solución

### 1. Auto-Detección de Tipos (`CRMPipeline.tsx` líneas 15-29)

```typescript
function skuCategoryToProjectType(cat: SKUCategory): ProjectType {
  switch (cat) {
    case 'license'           → 'license'
    case 'vendor_support'    → 'support'
    case 'incoda_support' → 'support'
    case 'implementation'    → 'implementation'
    case 'hours_pack'        → 'hours_pack'
  }
}

function detectProjectTypes(items: LineItem[]): ProjectType[] {
  // Retorna array deduplicado de tipos detectados
  // Si no hay items: fallback a ['implementation']
}
```

**Mapeo:**
| SKU Category | → | Project Type | Notas |
|--------------|---|--------------|-------|
| `implementation` | → | `implementation` | Servicios de implementación |
| `license` | → | `license` | Software/Licencias |
| `vendor_support` | → | `support` | Soporte de terceros |
| `incoda_support` | → | `support` | Soporte propio |
| `hours_pack` | → | `hours_pack` | Bolsa de horas |

---

### 2. Refactor de Estado (`CRMPipeline.tsx` líneas 703-732)

**ANTES:**
```typescript
const [selectedProjectType, setSelectedProjectType] = useState<ProjectType>('implementation');
const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
const [contractStartDate, setContractStartDate] = useState<string>(...);
const [contractEndDate, setContractEndDate] = useState<string>('');
const [packHours, setPackHours] = useState<number>(0);
const [packStartDate, setPackStartDate] = useState<string>(...);
const [packEndDate, setPackEndDate] = useState<string>('');
```

**DESPUÉS:**
```typescript
type PerTypeConfig = {
  templateId: string;
  contractStartDate: string;
  contractEndDate: string;
  packHours: number;
  packStartDate: string;
  packEndDate: string;
};

const [detectedProjectTypes, setDetectedProjectTypes] = useState<ProjectType[]>(['implementation']);
const [perTypeConfig, setPerTypeConfig] = useState<Record<string, PerTypeConfig>>({});

// Helper para actualizar estado per-tipo
const setTypeField = <K extends keyof PerTypeConfig>(
  type: ProjectType, field: K, value: PerTypeConfig[K]
) => setPerTypeConfig(prev => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
```

**Ventaja**: Escalable a N tipos sin más state variables.

---

### 3. Inicialización Modal (`CRMPipeline.tsx` líneas 1034-1038)

Cuando se arrastra a **Closed Won**:

```typescript
if (newStage === 'closed-won') {
    const types = detectProjectTypes(updatedLead.items);  // ← Auto-detección
    setDetectedProjectTypes(types);
    setPerTypeConfig(Object.fromEntries(
        types.map(t => [t, defaultPerTypeConfig()])
    ));
    // ... resto del setup
    setShowConvertModal(true);
}
```

---

### 4. Loop en Confirmación (`CRMPipeline.tsx` líneas 1115-1128)

```typescript
// Valida TODOS los tipos
for (const type of detectedProjectTypes) {
  const cfg = perTypeConfig[type];
  if (type === 'support' && !cfg.contractEndDate) {
    alert('Please enter the contract end date...');
    return;  // No avanza si falta algo
  }
  if (type === 'hours_pack' && (!cfg.packHours || !cfg.packEndDate)) {
    alert('Please enter total hours...');
    return;
  }
}

// Crea UN proyecto por cada tipo
detectedProjectTypes.forEach((type, idx) => {
  const cfg = perTypeConfig[type];
  onConvertToProject(
    leadToConvert,
    selectedConsultant,
    type,                      // ← Tipo distinto cada iteración
    cfg.templateId || undefined,
    idx === 0 ? initialDeposit : 0,  // ← Deposit solo en el primero
    type === 'support' ? cfg.contractStartDate : ...,
    type === 'support' ? cfg.contractEndDate : ...,
    type === 'hours_pack' ? cfg.packHours : undefined,
  );
});
```

**Puntos clave:**
- Validación antes de crear cualquier proyecto (todo o nada)
- Deposit solo en el primer proyecto
- Cada tipo lleva sus propios parámetros (contractDates, packHours, etc.)

---

### 5. UI Modal Rediseñada (`CRMPipeline.tsx` líneas 2647-2798)

**ANTES:**
```
┌─ Project Type ────────┐
│ [Dropdown: select 1]  │
├─ Template ───────────┤
│ [Dropdown]            │
├─ Lead Consultant ────┤
├─ Deposit ────────────┤
├─ Won Reason ──────────┤
└─ Conditional Panel ──┘
```

**DESPUÉS:**
```
┌─ Setup Projects ──────────────────────┐
│ Lead Consultant [Dropdown]            │
│ Initial Deposit [$]                   │
│ Won Reason [Dropdown]                 │
│ Propuesta [Dropdown]                  │
├───────────────────────────────────────┤
│ ┌─ IMPLEMENTATION PROJECT ────────┐   │
│ │ Template [Dropdown]             │   │
│ └─────────────────────────────────┘   │
│ ┌─ SOFTWARE LICENSE ──────────────┐   │
│ │ Template [Dropdown]             │   │
│ └─────────────────────────────────┘   │
│ ┌─ SUPPORT CONTRACT ──────────────┐   │
│ │ Template [Dropdown]             │   │
│ │ Start Date [Date Input]         │   │
│ │ End Date [Date Input] *         │   │
│ └─────────────────────────────────┘   │
│ ┌─ HOURS PACK ────────────────────┐   │
│ │ Template [Dropdown]             │   │
│ │ Total Hours [Number] *          │   │
│ │ Start/End Date [Date] *         │   │
│ └─────────────────────────────────┘   │
│ [Cancel] [Start Projects]             │
└───────────────────────────────────────┘
```

Cada sección:
- Independiente (scroll si hay muchas)
- Template selector per-tipo
- Campos específicos del tipo (Support: fechas, Hours: horas+fechas)

---

### 6. Deduplicación de Lead Update (`App.tsx` líneas 544, 664-670)

**Problema**: Si se llama `handleLeadToProject()` 4 veces (una por cada tipo), no queremos actualizar el lead 4 veces.

**Solución - Ref antipattern pero efectivo:**

```typescript
// En AppRoutes component
const convertedLeadIds = useRef<Set<string>>(new Set());

// En handleLeadToProject callback
addDocument('projects', newProject);  // ← Siempre: crea el proyecto

// Only update lead ONCE
if (!convertedLeadIds.current.has(lead.id)) {
    convertedLeadIds.current.add(lead.id);  // Mark as processed
    updateDocument('leads', lead.id, {
        stage: 'closed-won',
        closedValue: lead.closedValue || lead.value,
        probability: 100
    });
    alert(`Projects for ${lead.companyName} created successfully!`);
}
```

**Por qué funciona:**
- `convertedLeadIds` es un Set que persiste entre renders
- Primera llamada (lead_123) → no está en Set → UPDATE lead + agregar a Set
- Segunda/tercera/cuarta llamada → ya está en Set → solo crea proyecto
- Efecto: 1 lead update + 4 project creates ✓

---

## Cambios de Archivos

| Archivo | Líneas | Cambio |
|---------|--------|--------|
| `components/CRMPipeline.tsx` | 15-29 | Mapping helpers (skuCategoryToProjectType, detectProjectTypes) |
| `components/CRMPipeline.tsx` | 703-732 | State refactor: detectedProjectTypes + perTypeConfig |
| `components/CRMPipeline.tsx` | 1034-1038 | Modal trigger: init per-type config |
| `components/CRMPipeline.tsx` | 1099-1148 | confirmConversion: loop + validate per-tipo |
| `components/CRMPipeline.tsx` | 1631 | ✂️ Remove `availableTemplates` computed |
| `components/CRMPipeline.tsx` | 2647-2798 | Modal JSX: multi-section layout |
| `App.tsx` | 544 | Add `convertedLeadIds` ref |
| `App.tsx` | 640 | Change project ID: include type `proj_${Date.now()}_${type}` |
| `App.tsx` | 664-670 | Deduplication: only update lead if not already converted |

**Líneas totales:** ~150 líneas modificadas / 100 líneas nuevas

---

## Backward Compatibility ✅

**Caso: Lead sin items**
```typescript
if (!items?.length) return ['implementation'];  // Fallback
```

Lead vacío → Modal muestra 1 sección (Implementation) → Funciona como antes.

---

## Testing

Ver `VALIDATION_MULTI_PROJECT.md` para:
- Pasos exactos de prueba manual
- Casos edge (validaciones)
- Checklist de verificación
- Logs a revisar si falla

---

## Rollback

Si algo sale mal:
```bash
git checkout components/CRMPipeline.tsx App.tsx
```

Ambos cambios son forward-only (no afectan datos previos).

---

## Métricas

| Métrica | Antes | Después |
|---------|-------|---------|
| Máx proyectos por lead convertido | 1 | N (detectados) |
| State variables por modal | 8+ | 2 + 1 helper |
| Llamadas `onConvertToProject` | 1 | N |
| Lead updates | 1 | 1 (deduped) |
| Secciones en modal | 1 | N |
| Templates por tipo | global | per-tipo |
