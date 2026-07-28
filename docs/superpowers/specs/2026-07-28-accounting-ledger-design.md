# Módulo de Contabilidad (Libro Mayor) — Diseño

**Fecha**: 2026-07-28
**Estado**: Aprobado, pendiente de plan de implementación

## Contexto

INCODA USA LLC es una LLC de Florida de un solo miembro (formada 11 jun 2026, EIN
42-3217356), tributando por defecto como disregarded entity (Schedule C) — la
clasificación fiscal definitiva (Schedule C vs. elección S-Corp) aún no está decidida.
El dueño usa una cuenta Mercury para el banco de la empresa y no quiere contratar un
CPA todavía, pero quiere tener control contable real dentro del CRM, sin depender de
QuickBooks u otra herramienta externa.

El CRM (CRMINCODA) ya tiene una capa financiera operativa sólida: `Transaction`,
`Invoice`, `Payment`, `Commission`, y un `BalanceSheetAccount` de entrada manual por
año. Lo que falta frente a QuickBooks: un plan de cuentas real, conciliación bancaria,
categorización fiscal (Schedule C), P&L y Balance Sheet calculados (no digitados a
mano), y tracking de pagos a contratistas para 1099-NEC.

## Objetivo

Agregar un libro contable de partida doble real, visible y editable por el usuario,
que conviva con la capa operativa existente sin romperla, y que resuelva:

1. Categorización de gastos lista para impuestos (Schedule C).
2. Conciliación de la cuenta Mercury vía importación de CSV.
3. P&L y Balance Sheet generados automáticamente desde los movimientos reales.
4. Reporte de pagos a contratistas para 1099-NEC (umbral $600/año).

## Fuera de alcance (por ahora)

- Integración directa con la API de Mercury (se hace vía CSV manual; API queda como
  posible fase futura).
- Contabilidad de base devengado (accrual) — se usa cash-basis, estándar para
  Schedule C de una LLC pequeña.
- Nómina formal tipo S-Corp para el dueño (aplica solo si más adelante se elige
  tributar como S-Corp).
- E-filing de 1099 — el reporte solo agrega los datos para que se puedan generar
  externamente (IRS FIRE, Track1099, etc.) o dárselos a un CPA/software de impuestos.

## Arquitectura

Dos capas conviven:

1. **Capa operativa (sin cambios de fondo)**: `Transaction`, `Invoice`, `Payment`,
   `Commission` siguen siendo la fuente de verdad para costeo de proyectos,
   facturación y rentabilidad interna (`FinanceManager.tsx`, `ProfitabilityReport.tsx`,
   etc.).
2. **Capa contable nueva (Libro Mayor)**: `LedgerAccount` (plan de cuentas) +
   `JournalEntry` (asientos débito/crédito). Se generan automáticamente cuando pasa
   algo con impacto financiero real (gasto, pago recibido, pago a consultor), pero el
   Libro Diario es una pantalla real, visible y editable — no un detalle de
   implementación escondido. El usuario puede ver cualquier asiento, crear asientos
   manuales (ajustes, saldos de apertura, correcciones) y anular asientos, siempre
   con la restricción de que débitos = créditos.

**Base contable: cash-basis.** Una factura emitida no genera asiento; el asiento se
genera cuando el dinero realmente entra o sale. Esto evita modelar Cuentas por Cobrar
dentro del libro contable — eso lo sigue trackeando `Invoice.status` operativamente.

## Modelo de datos

### `LedgerAccount` (nuevo, `server/models/LedgerAccount.js`)

| Campo | Tipo | Notas |
|---|---|---|
| `code` | String | Ej. 1000, 4000, 6200. Único. |
| `name` | String | Ej. "Cash — Mercury Checking". |
| `type` | enum | `asset`, `liability`, `equity`, `income`, `expense`. |
| `normalBalance` | enum | `debit`/`credit`, derivado de `type`. |
| `taxCategory` | String | Línea de Schedule C (solo cuentas `expense`). |
| `isActive` | Boolean | Desactivar en vez de borrar si tiene movimientos. |

Se siembra con un plan de cuentas estándar para LLC de servicios: Cash, Accounts
Receivable (informativo, no usado por el libro cash-basis), Owner's Equity, Owner's
Draws, Service Income, y gastos mapeados a líneas de Schedule C (Advertising,
Contract Labor, Office Expense, Software, Insurance, Legal & Professional, Rent,
Supplies, Taxes & Licenses, Travel, Meals (50%), Utilities, Other). Editable después
desde la UI.

Para gastos de proyecto/lead (que usan la `category` operativa existente:
`credit_card`, `office`, `software`, `marketing`, `salary`, `consultant_payment`,
`other`, no `taxCategory`), `ledgerPostingService` usa una tabla de mapeo fija
`category → code de LedgerAccount` (ej. `software` → cuenta "Software", `salary` →
"Contract Labor" o "Owner's Draws" según corresponda). Esta tabla se define junto con
el plan de cuentas semilla y es la que se usa cuando `taxCategory` no viene seteado
explícitamente.

### `JournalEntry` (nuevo, `server/models/JournalEntry.js`)

| Campo | Tipo | Notas |
|---|---|---|
| `date` | Date | |
| `memo` | String | |
| `source` | enum | `manual`, `expense`, `payment`, `payroll`, `commission`, `import`, `opening_balance`. |
| `sourceId` | String | Referencia al documento que lo originó, si aplica. |
| `lines` | Array | `{ accountId, debit, credit, memo, entityId, currency, amountUSD }`. |
| `status` | enum | `posted`, `void`. |

Validación dura (schema + capa de servicio): `sum(debit) === sum(credit)` por asiento,
calculado sobre `amountUSD` para que multi-moneda no rompa el balance.

### Cambios a modelos existentes

- `Transaction`: agregar `taxCategory` (opcional, obligatorio solo para gastos
  generales de empresa) y `postingStatus` (`posted`/`failed`/`n/a`).

## Componentes

**Backend**

- `server/models/LedgerAccount.js`, `server/models/JournalEntry.js` — nuevos.
- `server/services/ledgerPostingService.js` — nuevo. Funciones puras: `postExpense(tx)`,
  `postPaymentReceived(payment)`, `postConsultantPayment(tx)`,
  `postCommissionPaid(commission)`. Cada una crea y guarda un `JournalEntry` de forma
  independiente — **sin transacciones multi-documento de Mongo** (ver nota de
  infraestructura abajo). Si el posteo falla, la operación original igual queda
  guardada (no bloquea el flujo operativo); se marca `postingStatus: 'failed'` en el
  doc de origen para reintento manual desde Ledger.

  **Punto de enganche: middleware de Mongoose, no las rutas Express.** Se usa
  `TransactionSchema.post('save', ...)`, `PaymentSchema.post('save', ...)`,
  `CommissionSchema.post('findOneAndUpdate', ...)` (para el cambio a
  `status: 'paid'`), envueltos en try/catch interno que nunca relanza el error. Se
  eligió esto en vez de insertar llamadas dentro de `transactions.js`/`payments.js`/
  `invoices.js` porque: (a) `commissions.js` usa el `createCrudRouter` genérico —no
  hay código propio en la ruta donde enganchar—, y (b) evita tocar lógica ya
  delicada en `invoices.js` (recálculo de estado de factura, webhooks). El hook debe
  capturar sus propios errores; nunca debe hacer que el `save()`/`findOneAndUpdate()`
  original falle.

  > **Nota de infraestructura — por qué no hay atomicidad de base de datos**: se
  > confirmó (`grep -rn "startSession" server/`) que el código actual no usa
  > transacciones de Mongo en ningún lado. Tanto Mongo en producción
  > (`127.0.0.1:27017`, standalone) como `mongodb-memory-server` en tests
  > (`tests/financial-balance/setup.js`, también standalone) corren sin replica set.
  > `session.startTransaction()` falla en Mongo standalone con
  > `Transaction numbers are only allowed on a replica set member or mongos`. Por
  > eso el posteo contable es deliberadamente *best-effort*, no atómico —
  > consistente con el manejo de errores ya definido más abajo.

- `server/routes/ledger.js` — nuevo. Endpoints: plan de cuentas (CRUD), asientos
  (list/create/void), trial balance, P&L (`?start&end`), Balance Sheet (`?asOf`),
  import CSV de Mercury, conciliación, reporte 1099 (`?year`). Cada mutación llama
  `emitCollectionChange('ledgerAccounts'|'journalEntries', ...)` (igual que
  `payments.js`/`invoices.js`) para que la UI se actualice en vivo por socket —
  `transactions.js` hoy no lo hace y no debe tomarse como referencia. Agregar las
  nuevas rutas de escritura a los arrays `dataRoutes`/`readRoutes` de rate-limiting en
  `server/index.js`, igual que el resto de módulos de datos.

**Frontend**

- `components/Ledger.tsx` — nuevo módulo, nueva entrada en sidebar. Restringido vía
  un nuevo flag `permissions.finance` en el objeto `User.permissions` (que ya sigue
  el patrón `{dashboard, crm, projects, portal, admin}`), con `role === 'admin'`
  siempre con bypass — igual convención que el resto de módulos, no un chequeo
  aislado de solo `role`.
- `components/FinanceManager.tsx` — se quita la opción `general` (no ligada a
  proyecto/lead) del modal de "Agregar Gasto"; el componente sigue siendo el único
  lugar para gastos de proyecto/lead.

## Flujo de datos

- **Gasto de la empresa** (nuevo, en Ledger → pestaña "Gastos de la Empresa"): un
  submit crea `Transaction` (sin `projectId`/`leadId`, `taxCategory` obligatorio) y
  llama a `postExpense()` → `JournalEntry`: Debit [cuenta de gasto según
  `taxCategory`], Credit Cash.
- **Gasto de proyecto/lead** (flujo existente sin cambios de UI): al guardar, el
  backend también llama a `postExpense()` con la cuenta mapeada por `category` —
  sigue apareciendo en costeo de proyecto y ahora también en el Libro Diario.
- **Pago recibido de cliente** (`Payment`, existente): al guardar, `postPaymentReceived()`
  → Debit Cash, Credit Service Income. La emisión de la factura no postea nada.
- **Pago a consultor** (`Transaction` category=`consultant_payment`):
  `postConsultantPayment()` → Debit Contract Labor, Credit Cash, con
  `entityId=consultantId` en la línea — alimenta el reporte 1099.
- **Conciliación Mercury** (CSV, nuevo): se compara el CSV importado contra las
  líneas de la cuenta Cash por monto+fecha → cada línea queda `matched` (automático),
  `unmatched` (revisión manual) o `missing` (existe en el banco pero no en el libro →
  se ofrece crear el asiento/gasto faltante). Se compara el saldo conciliado contra
  el saldo final del statement.
- **Reportes**: P&L = suma de cuentas `income`/`expense` en un rango de fechas
  (asientos `posted`). Balance Sheet = saldo de cada cuenta a una fecha (valida
  Activos = Pasivos + Patrimonio como chequeo de integridad). 1099 = agrupación por
  `entityId` en cuentas `Contract Labor`, marcando quién cruza $600/año.

## Manejo de errores y validaciones

- Invariante de partida doble enforced en schema y servicio; rechazo con desglose de
  la diferencia si no cuadra.
- Ningún asiento posteado se borra — se anula (`status: 'void'`) o se revierte con un
  asiento contrario, preservando el historial para auditoría.
- El posteo contable nunca bloquea la operación original que lo origina (ver
  `postingStatus: 'failed'` arriba).
- Import de Mercury: detección de duplicados por hash (fecha+monto+descripción);
  filas corruptas se listan como error por fila sin abortar el resto del archivo.
- Cierre de período: un mes conciliado bloquea edición de sus asientos salvo
  reapertura explícita.
- Balance Sheet muestra una alerta visible si Activos ≠ Pasivos + Patrimonio, en vez
  de números silenciosamente incorrectos.
- Módulo Ledger completo restringido a rol `admin` vía el sistema de permisos
  existente.

## Plan de pruebas

El runner real del proyecto es el test runner nativo de Node (`node --import
tsx/esm --test tests/*.test.ts`, ver `package.json`), no vitest pese a estar como
devDependency. Los tests de integración usan `mongodb-memory-server` standalone,
siguiendo el patrón ya existente en `tests/financial-balance/setup.js`
(`setupTestDB`/`teardownTestDB`/`clearCollections`/`seedTestData`) — los tests nuevos
de Ledger deben extender ese mismo setup (agregar `LedgerAccount`/`JournalEntry` a
`clearCollections`) en vez de crear un harness paralelo.

- Unitarias `ledgerPostingService`: asientos balanceados en mono-moneda,
  multi-moneda (vía `ExchangeRateCache` existente), y montos negativos (reembolsos).
- Unitarias schema `JournalEntry`: rechaza asientos descuadrados, acepta balanceados.
- Unitarias parser CSV Mercury: archivo válido, filas corruptas, duplicados.
- Integración: crear gasto vía API → verificar `JournalEntry` correcto y reflejo en
  P&L.
- Integración (ciclo completo): sembrar plan de cuentas, postear movimientos mixtos,
  verificar trial balance en cero y P&L/Balance Sheet contra fixture esperado.
- Integración (conciliación): CSV de muestra → verificar matched/unmatched/missing.
- Integración (1099): varios consultores con pagos variados → verificar umbral $600.
- Manual en navegador: asiento manual descuadrado (debe bloquear guardar), import de
  CSV real de Mercury, generación de P&L/Balance Sheet verificados a mano, y
  confirmar que roles `sales`/`consultant` no acceden al módulo.
