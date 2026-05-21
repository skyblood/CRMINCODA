# Antes vs Después: Multi-Project Conversion

## Escenario: PODER JUDICIAL con 4 categorías de items

### ANTES (Bug)

```
┌─────────────────────────────────────────────────────┐
│ Lead: PODER JUDICIAL                                │
│ Items:                                              │
│   • Implementation: $39,000                         │
│   • License: $28,000                                │
│   • Vendor Support: $20,500                         │
│   • Hours Pack: $15,000                             │
│ TOTAL: $102,500                                     │
└─────────────────────────────────────────────────────┘
         ↓ Arrastra a "Closed Won"
         
┌─────────────────────────────────────────────────────┐
│ Modal: Setup Project (singular)                     │
├─────────────────────────────────────────────────────┤
│ Project Type:                                       │
│ [▼ Implementation ◄─── HARDCODED DEFAULT]          │
│                                                     │
│ Task Template:                                      │
│ [▼ No Template (Blank Project)]                     │
│                                                     │
│ Lead Consultant: [Fabian Rojas]                     │
│ Deposit: [5000]                                     │
│ Won Reason: [Best Solution]                         │
│                                                     │
│ [Cancel] [Start Project] ◄─── Singular             │
└─────────────────────────────────────────────────────┘
         ↓ Click "Start Project"
         
❌ RESULTADO: SOLO SE CREA 1 PROYECTO
   
   Projects creados:
   • IMPLEMENTATION: PODER JUDICIAL ✓
   • LICENSE: PODER JUDICIAL ✗ NO CREADO
   • SUPPORT: PODER JUDICIAL ✗ NO CREADO
   • HOURS_PACK: PODER JUDICIAL ✗ NO CREADO
   
   3 DE 4 ITEMS IGNORADOS 🚫
```

---

### DESPUÉS (Fixed)

```
┌─────────────────────────────────────────────────────┐
│ Lead: PODER JUDICIAL                                │
│ Items:                                              │
│   • Implementation: $39,000                         │
│   • License: $28,000                                │
│   • Vendor Support: $20,500                         │
│   • Hours Pack: $15,000                             │
│ TOTAL: $102,500                                     │
└─────────────────────────────────────────────────────┘
         ↓ Arrastra a "Closed Won"
         
System.detectProjectTypes(lead.items)
  → ['implementation', 'license', 'support', 'hours_pack']
  
┌──────────────────────────────────────────────────────┐
│ Modal: Setup Projects (plural)                       │
├──────────────────────────────────────────────────────┤
│                    ┌─ SHARED FIELDS ─┐              │
│                    │ Consultant: [Dr. X]            │
│                    │ Deposit: [5000]                │
│                    │ Won Reason: [...]              │
│                    │ Propuesta: [...]               │
│                    └────────────────┘               │
│                                                      │
│ ┌─ IMPLEMENTATION PROJECT ────────────────────────┐ │
│ │ Template: [▼ No Template (Blank Project)]      │ │
│ └────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ SOFTWARE LICENSE ──────────────────────────────┐ │
│ │ Template: [▼ No Template (Blank Project)]      │ │
│ └────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ SUPPORT CONTRACT ──────────────────────────────┐ │
│ │ Template: [▼ No Template (Blank Project)]      │ │
│ │ Start Date: [2026-04-07]                       │ │
│ │ End Date: [2027-04-07] *                       │ │
│ └────────────────────────────────────────────────┘ │
│                                                      │
│ ┌─ HOURS PACK ────────────────────────────────────┐ │
│ │ Template: [▼ No Template (Blank Project)]      │ │
│ │ Total Hours: [80] *                            │ │
│ │ Start Date: [2026-04-07]                       │ │
│ │ End Date: [2026-10-07] *                       │ │
│ └────────────────────────────────────────────────┘ │
│                                                      │
│ [Cancel] [Start Projects] ◄─── Plural             │
└──────────────────────────────────────────────────────┘
         ↓ Fill required fields → Click "Start Projects"

✅ RESULTADO: SE CREAN 4 PROYECTOS

   Loop en confirmConversion:
   
   Iteración 1: onConvertToProject(lead, 'Fabian', 'implementation', 
                  template=undefined, deposit=5000, ...)
   → crea: IMPLEMENTATION: PODER JUDICIAL
   
   Iteración 2: onConvertToProject(lead, 'Fabian', 'license',
                  template=undefined, deposit=0, ...)
   → crea: LICENSE: PODER JUDICIAL
   
   Iteración 3: onConvertToProject(lead, 'Fabian', 'support',
                  template=undefined, deposit=0, contractEndDate='2027-04-07', ...)
   → crea: SUPPORT: PODER JUDICIAL
   
   Iteración 4: onConvertToProject(lead, 'Fabian', 'hours_pack',
                  template=undefined, deposit=0, packHours=80, ...)
   → crea: HOURS_PACK: PODER JUDICIAL
   
   Lead.update() ✓ (deduped - solo una vez)
   
   Projects en BD:
   ✅ IMPLEMENTATION: PODER JUDICIAL (type='implementation', deposit=$5000)
   ✅ LICENSE: PODER JUDICIAL (type='license', deposit=$0)
   ✅ SUPPORT: PODER JUDICIAL (type='support', contractEndDate set)
   ✅ HOURS_PACK: PODER JUDICIAL (type='hours_pack', totalBudgetHours=80)
```

---

## Comparación Detallada

### 1. Detección de Tipos

| Aspecto | Antes | Después |
|---------|-------|---------|
| ¿Cómo se elige tipo? | Dropdown en modal (default: implementation) | Auto-detección desde `lead.items` |
| ¿Se detectan todos? | NO - solo uno seleccionado | SÍ - todos los items mapeados |
| ¿Si no hay items? | Muestra solo implementation | Fallback a ['implementation'] |
| Cambio de tipo | User debe cambiar dropdown | No disponible (auto) |

### 2. Estado (React)

**ANTES:**
```
selectedProjectType: 'implementation' (1 valor)
selectedTemplateId: '' (1 valor)
contractStartDate: '2026-04-07' (1 valor)
contractEndDate: '' (1 valor)
packHours: 0 (1 valor)
packStartDate: '2026-04-07' (1 valor)
packEndDate: '' (1 valor)
+ availableTemplates (computed)
```
Total: **8 state variables** (solo para 1 proyecto)

**DESPUÉS:**
```
detectedProjectTypes: ['implementation', 'license', 'support', 'hours_pack'] (array)
perTypeConfig: {
  implementation: { templateId: '', ... },
  license: { templateId: '', ... },
  support: { templateId: '', contractStartDate: '', contractEndDate: '', ... },
  hours_pack: { templateId: '', packHours: 80, packStartDate: '', packEndDate: '', ... }
} (map)
```
Total: **2 state variables** (escalables a N proyectos)

### 3. Validación

**ANTES:**
```typescript
if (selectedProjectType === 'support' && !contractEndDate) alert(...);
if (selectedProjectType === 'hours_pack' && (!packHours || !packEndDate)) alert(...);
```
- Valida solo el tipo seleccionado
- No previene crear otros proyectos incompletos

**DESPUÉS:**
```typescript
for (const type of detectedProjectTypes) {
  const cfg = perTypeConfig[type];
  if (type === 'support' && !cfg.contractEndDate) alert(...); return;
  if (type === 'hours_pack' && (!cfg.packHours || !cfg.packEndDate)) alert(...); return;
}
```
- Valida TODOS los tipos antes de crear nada
- Todo o nada: si falta 1 campo en 1 tipo, no se crea ninguno

### 4. Creación de Proyectos

**ANTES:**
```typescript
onConvertToProject(
  leadToConvert, selectedConsultant, selectedProjectType,  // Solo 1 tipo
  selectedTemplateId, initialDeposit,
  selectedProjectType === 'support' ? contractStartDate : ...,
  ...
);
// Se llama 1 vez → crea 1 proyecto
```

**DESPUÉS:**
```typescript
detectedProjectTypes.forEach((type, idx) => {
  const cfg = perTypeConfig[type];
  onConvertToProject(
    leadToConvert, selectedConsultant, type,  // Tipo distinto cada iteración
    cfg.templateId || undefined,
    idx === 0 ? initialDeposit : 0,  // Deposit solo en primero
    type === 'support' ? cfg.contractStartDate : ...,
    ...
  );
});
// Se llama N veces → crea N proyectos
```

### 5. UI Modal

**ANTES:**
- 1 campo "Project Type" (dropdown)
- 1 campo "Task Template"
- Paneles condicionales (support/hours_pack)
- Tamaño: max-w-lg (pequeño)

**DESPUÉS:**
- 4+ secciones independientes (una per tipo)
- Cada sección: template selector + campos específicos
- Scroll si hay muchos tipos
- Tamaño: max-w-2xl, max-h-[85vh] (más grande, scrolleable)

### 6. Lead Update

**ANTES:**
```typescript
updateDocument('leads', lead.id, { stage: 'closed-won', ... });
alert(`Project for ${lead.companyName} created successfully!`);
// Called once (1 proyecto = 1 llamada)
```

**DESPUÉS:**
```typescript
if (!convertedLeadIds.current.has(lead.id)) {  // Dedup check
  convertedLeadIds.current.add(lead.id);
  updateDocument('leads', lead.id, { stage: 'closed-won', ... });
  alert(`Projects for ${lead.companyName} created successfully!`);
}
// Called N times (1 lead update, 4 project creates)
// Pero updateDocument solo se ejecuta 1 vez gracias al dedup
```

---

## Flujo de Ejecución Comparativo

### ANTES
```
Lead drag to "Closed Won"
  ↓
handleStageChange() → setShowConvertModal(true)
  ↓
User selects: Implementation (from dropdown)
  ↓
User clicks "Start Project"
  ↓
confirmConversion() → onConvertToProject(lead, 'fabian', 'implementation', ...)
  ↓
App.tsx handleLeadToProject():
  - Creates: proj_[timestamp]: IMPLEMENTATION: PODER JUDICIAL
  - Updates: lead.stage = 'closed-won'
  ↓
Result: 1 proyecto, otros 3 items ignorados ❌
```

### DESPUÉS
```
Lead drag to "Closed Won"
  ↓
handleStageChange():
  - const types = detectProjectTypes(lead.items)  // ['impl', 'lic', 'supp', 'hours']
  - setDetectedProjectTypes(types)
  - setPerTypeConfig(init 4 configs)
  - setShowConvertModal(true)
  ↓
Modal abre con 4 secciones:
  [IMPLEMENTATION] [LICENSE] [SUPPORT] [HOURS_PACK]
  ↓
User fills: Support endDate, Hours amount, etc.
  ↓
User clicks "Start Projects"
  ↓
confirmConversion() validates ALL types, then:
  forEach(type of detectedProjectTypes) {
    onConvertToProject(lead, 'fabian', type, ...)
  }
  ↓
App.tsx handleLeadToProject() called 4 times:
  1. Creates: proj_[t]_implementation + dedup update lead
  2. Creates: proj_[t]_license (no lead update - already deduped)
  3. Creates: proj_[t]_support (no lead update)
  4. Creates: proj_[t]_hours_pack (no lead update)
  ↓
Result: 4 proyectos, 1 lead update, 0 items ignorados ✅
```

---

## Impacto en BD

### ANTES: PODER JUDICIAL ganado

**Leads:**
```json
{
  "id": "lead_xyz",
  "companyName": "PODER JUDICIAL",
  "stage": "closed-won",
  "items": [
    { "category": "implementation", ... },
    { "category": "license", ... },
    { "category": "vendor_support", ... },
    { "category": "hours_pack", ... }
  ]
}
```

**Projects:**
```json
[
  {
    "id": "proj_123",
    "name": "IMPLEMENTATION: PODER JUDICIAL",
    "type": "implementation",
    "leadId": "lead_xyz"
  }
  // 3 items nunca se convirtieron a proyectos
]
```

### DESPUÉS: PODER JUDICIAL ganado

**Leads:** (igual, pero ahora los items SÍ se procesan)

**Projects:**
```json
[
  {
    "id": "proj_123_implementation",
    "name": "IMPLEMENTATION: PODER JUDICIAL",
    "type": "implementation",
    "leadId": "lead_xyz",
    "payments": [{ amount: 5000, ... }]
  },
  {
    "id": "proj_124_license",
    "name": "LICENSE: PODER JUDICIAL",
    "type": "license",
    "leadId": "lead_xyz"
  },
  {
    "id": "proj_125_support",
    "name": "SUPPORT: PODER JUDICIAL",
    "type": "support",
    "leadId": "lead_xyz",
    "contractEndDate": "2027-04-07"
  },
  {
    "id": "proj_126_hours_pack",
    "name": "HOURS_PACK: PODER JUDICIAL",
    "type": "hours_pack",
    "leadId": "lead_xyz",
    "totalBudgetHours": 80
  }
]
```

---

## Conclusión

| Métrica | Antes | Después |
|---------|-------|---------|
| Proyectos creados por lead con 4 items | 1 ❌ | 4 ✅ |
| Items procesados | 1/4 (25%) ❌ | 4/4 (100%) ✅ |
| State complexity | 8 variables | 2 variables |
| Validación | Parcial | Completa |
| Deposit logic | Simple (1 proyecto) | Smart (1er proyecto) |
| Template per-tipo | No | Sí |
| Support dates | Global | Per-tipo |
| Hours config | Global | Per-tipo |
| Lead updates | 1 (naive) | 1 (deduped) |
