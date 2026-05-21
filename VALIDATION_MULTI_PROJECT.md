# Validación: Multi-Project Conversion (PODER JUDICIAL)

## Prueba Manual en Navegador

### Paso 1: Preparar el Lead
1. Abre http://localhost:5173 → CRM Pipeline
2. Crea un nuevo lead llamado **"PODER JUDICIAL"** con estos items:
   - [ ] **Implementation**: $39,000 (category: `implementation`)
   - [ ] **License**: $28,000 (category: `license`)
   - [ ] **Vendor Support**: $20,500 (category: `vendor_support`)
   - [ ] **Hours Pack**: $15,000 (category: `hours_pack`)

**Total valor**: $102,500

### Paso 2: Mover a Closed Won
1. Arrastra el lead **PODER JUDICIAL** a la columna **"Closed Won"**
2. **VERIFICAR**: Se abre modal titulado "Setup Projects" (plural)

### Paso 3: Validar Modal - 4 Secciones
El modal DEBE mostrar 4 secciones independientes:

- [ ] **IMPLEMENTATION PROJECT** (gris, con selector de template)
- [ ] **SOFTWARE LICENSE** (gris, con selector de template)
- [ ] **SUPPORT CONTRACT** (naranja, con Start Date + End Date requerido)
- [ ] **HOURS PACK** (azul, con Total Hours requerido + Start/End Dates)

**Campos compartidos** (arriba):
- [ ] Lead Consultant (dropdown)
- [ ] Initial Payment / Deposit ($)
- [ ] Won Reason (opcional)
- [ ] Propuesta aceptada (opcional)

### Paso 4: Llenar Formulario
1. **Lead Consultant**: Selecciona "Fabian Rojas" (o cualquiera)
2. **Initial Deposit**: Ingresa `5000`
3. **Support Contract**:
   - Start Date: Hoy o una fecha cualquiera
   - End Date: 30 días desde hoy ✓ (REQUERIDO)
4. **Hours Pack**:
   - Total Hours: `80` ✓ (REQUERIDO)
   - Start Date: Hoy
   - End Date: 6 meses desde hoy ✓ (REQUERIDO)
5. **Templates** (opcionales): Deja en blanco o selecciona si existen

### Paso 5: Crear Proyectos
Haz clic en botón verde **"Start Projects"** (plural)

**RESULTADO ESPERADO:**
- [ ] Alert: "Projects for PODER JUDICIAL created successfully!"
- [ ] Modal se cierra
- [ ] Lead aparece como **Closed Won** en el pipeline

### Paso 6: Verificar en Projects
1. Navega a **Projects** (menú izquierdo)
2. **DEBES VER 4 PROYECTOS NUEVOS:**

| Nombre | Type | Consultant | Status |
|--------|------|-----------|--------|
| IMPLEMENTATION: PODER JUDICIAL | `implementation` | Fabian Rojas | active |
| LICENSE: PODER JUDICIAL | `license` | Fabian Rojas | active |
| SUPPORT: PODER JUDICIAL | `support` | Fabian Rojas | active |
| HOURS_PACK: PODER JUDICIAL | `hours_pack` | Fabian Rojas | active |

**VALIDACIONES:**
- [ ] Proyecto 1 (Implementation): `$5,000` en payments (deposit solo aquí)
- [ ] Proyecto 2 (License): Sin payments (deposit=0)
- [ ] Proyecto 3 (Support): `contractEndDate` visible en detalles
- [ ] Proyecto 4 (Hours Pack): `totalBudgetHours: 80`

### Paso 7: Validar Lead
1. Vuelve al **CRM Pipeline**
2. Busca **PODER JUDICIAL** en la columna **Closed Won**
3. **VERIFICAR:**
   - [ ] Lead existe (no fue duplicado)
   - [ ] `stage: 'closed-won'`
   - [ ] `closedValue: 102,500` (suma de todos los items)
   - [ ] `probability: 100`

---

## Casos de Prueba Adicionales

### Caso A: Lead sin items (backward compatibility)
1. Crea lead sin items
2. Arrastra a Closed Won
3. **ESPERADO**: Modal muestra solo 1 sección: IMPLEMENTATION PROJECT ✓

### Caso B: Validación - Faltar End Date en Support
1. Llena todos menos **Support Contract End Date**
2. Haz clic "Start Projects"
3. **ESPERADO**: Alert "Please enter the contract end date for the Support contract." ✗ No se crean proyectos

### Caso C: Validación - Faltar Hours en Hours Pack
1. Dejas **Total Hours** vacío en Hours Pack
2. Haz clic "Start Projects"
3. **ESPERADO**: Alert "Please enter total hours and end date for the Hours Pack." ✗ No se crean proyectos

### Caso D: Múltiples conversiones (límpialo con refresh)
1. Crea otro lead con 2 items (e.g., implementation + license)
2. Convierte a Closed Won
3. **ESPERADO**: Modal muestra 2 secciones, se crean 2 proyectos
4. En Projects: Debes ver 2 + 4 anteriores = 6 total

---

## Checklist de Éxito ✅

- [ ] Detecta correctamente 4 tipos de proyecto desde items
- [ ] Modal muestra 4 secciones (no 1)
- [ ] Cada sección tiene configuración independiente
- [ ] Se crean 4 proyectos en BD
- [ ] Cada proyecto tiene el `type` correcto
- [ ] Cada proyecto tiene el `name` correcto (TYPE: PODER JUDICIAL)
- [ ] Lead actualizado a `closed-won` exactamente UNA VEZ
- [ ] Deposit solo en primer proyecto ($5,000)
- [ ] Support tiene contractEndDate
- [ ] Hours Pack tiene totalBudgetHours = 80
- [ ] Validaciones funcionan (no permite avanzar sin required fields)
- [ ] Backward compat: Lead sin items → 1 sección

---

## Logs a Revisar

Si algo falla, revisa:

**Browser Console** (F12 → Console):
- Errores JavaScript
- Estado de React (Redux DevTools si está instalado)

**Network Tab** (F12 → Network):
- POST `/api/projects` - Debes ver 4 llamadas exitosas (4 x 201/200)
- PATCH `/api/leads/[leadId]` - Debe ser SOLO 1 llamada

**Server Logs** (terminal con pnpm dev:full):
```
[server] POST /api/projects  ✓
[server] POST /api/projects  ✓
[server] POST /api/projects  ✓
[server] POST /api/projects  ✓
[server] PATCH /api/leads/[id]  ✓
```

---

## Rollback si es necesario

Si algo está mal, los cambios están en estos archivos:

```
components/CRMPipeline.tsx     ← mapping helpers + state + modal
App.tsx                        ← handleLeadToProject + ref
```

Git diff desde plan:
```bash
git diff components/CRMPipeline.tsx
git diff App.tsx
```
