# Análisis de Mejoras — CRM Blackmoon

> Generado: 2026-03-31

---

## 🔴 Alta Prioridad (Impacto inmediato en producción)

### 1. Prop drilling masivo en App.tsx
**Problema**: 15+ `useState` en App.tsx, todo el estado global pasado como props hacia abajo. A medida que crecen los módulos, cada cambio de estado re-renderiza el árbol completo.
**Mejora**: Migrar a **React Context + useReducer** (o Zustand). Un `LeadsContext`, `ProjectsContext`, `UserContext` elimina el prop drilling y aísla re-renders.
**Impacto**: Rendimiento, mantenibilidad.

### 2. Sin paginación en la API
**Problema**: `GET /api/leads`, `GET /api/projects`, etc. devuelven **todos** los documentos. Con 500+ leads la respuesta excede 1 MB y el render inicial se degrada.
**Mejora**: Agregar `?page=&limit=&sort=` a los routers de CRUD. El frontend carga la primera página y pagina o hace scroll infinito.
**Impacto**: Performance en producción real.

### 3. `consultantName` como string libre
**Problema**: `TimeLog.consultantName` es un `string` en lugar de `userId`. Si el nombre del consultor cambia, todos los logs históricos quedan inconsistentes.
**Mejora**: Agregar `consultantId: string` a `TimeLog` y hacer join en el servidor. Mantener `consultantName` como campo snapshot (igual que ya se hace con `approvedRate`).
**Impacto**: Integridad de datos financieros.

### 4. Sin boundary de errores en el frontend
**Problema**: Un error JS en cualquier componente lazy desmonta toda la app sin feedback útil al usuario.
**Mejora**: Envolver cada `<Suspense>` con un `<ErrorBoundary>` que muestre un panel de "módulo no disponible" con botón de retry.
**Impacto**: Experiencia de usuario en errores.

### 5. Concurrencia / last-write-wins
**Problema**: Si dos usuarios editan el mismo lead simultáneamente, el segundo PUT silenciosamente sobrescribe al primero.
**Mejora**: Agregar campo `updatedAt` (timestamp) al modelo y verificar en el PUT del servidor (`If-Match` o check de versión). Devolver `409 Conflict` si hay divergencia.
**Impacto**: Integridad de datos en equipos.

---

## 🟡 Media Prioridad (Calidad y escala)

### 6. Cero tests
**Problema**: No hay archivos de test, ni `vitest`/`jest` en devDependencies. Cambios en lógica crítica (comisiones, aprobación de horas, aging) no tienen regresión.
**Mejora**: Agregar Vitest + Testing Library. Priorizar:
- Cálculo de comisiones
- Lógica de aging por etapa
- Flush de pending queue
- Endpoints CRUD (supertest)

### 7. Sin paginación / búsqueda server-side en la API externa
**Problema**: El endpoint `/api/v1/` hereda las mismas limitaciones que la API interna.
**Mejora**: Documentar y versionar la API externa. Agregar OpenAPI/Swagger básico para los consumidores de la API.

### 8. Sin useMemo / useCallback en componentes grandes
**Problema**: CRMPipeline, ProjectManager y Dashboard son componentes de miles de líneas que reciben arrays de leads/projects como props. Sin memoización, cada keystroke en App.tsx los re-renderiza.
**Mejora**: `useMemo` para derivaciones (leads filtrados, KPIs calculados). `useCallback` para handlers pasados como props estables.

### 9. dev:full usa `&` en lugar de `concurrently`
**Problema**: `node server/index.js & vite` en macOS/Linux no mata el proceso de node al hacer Ctrl+C; queda huérfano ocupando el puerto 3001.
**Mejora**: Instalar `concurrently` y cambiar el script a:
```json
"dev:full": "concurrently \"node server/index.js\" \"vite\""
```

### 10. Tailwind vía CDN sin purge
**Problema**: El bundle de Tailwind CDN pesa ~3.5 MB. En producción se sirve completo.
**Mejora**: Instalar Tailwind como devDependency con PostCSS y configurar `content` para purge. Reducción esperada: ~95% del CSS.

### 11. Ausencia de sistema de toasts / feedback
**Problema**: No hay feedback visual cuando una operación CRUD falla (error 500, timeout). El usuario no sabe si su acción se ejecutó.
**Mejora**: Un contexto `ToastContext` global con `toast.success()` / `toast.error()` que se conecte a los handlers de `firebaseService`.

### 12. Adjuntos sin endpoint de subida
**Problema**: `Lead.documents` almacena URLs, pero no hay endpoint `POST /api/upload`. Los documentos se agregan pegando URLs manualmente.
**Mejora**: Agregar `multer` + almacenamiento en S3/Cloudflare R2 (o local en dev). Endpoint `POST /api/upload` devuelve la URL pública.

---

## 🟢 Baja Prioridad (Calidad a largo plazo)

### 13. `any` en PendingWrite.payload
```typescript
payload?: any; // ← en firebaseService.ts
```
Tipar como `Record<string, unknown>` para capturar errores en tiempo de compilación.

### 14. Sin `createdAt` / `updatedAt` en la mayoría de modelos
Mongoose no agrega timestamps automáticamente salvo que se configure `{ timestamps: true }` en el schema. Agregar a todos los modelos facilita auditoría y ordenamiento.

### 15. Sin reset de contraseña self-service
Solo un admin puede cambiar contraseñas vía `/api/auth/set-password`. Agregar un flujo de "olvidé mi contraseña" con token firmado por email (puede usar el SMTP ya configurado).

### 16. Cálculos financieros solo en frontend
Márgenes, totales de cotización y KPIs de comisiones se calculan en el cliente. Deberían tener un endpoint de validación server-side para evitar manipulación y garantizar consistencia en exports/reportes.

### 17. Lead.customData no tipado en la interfaz
```typescript
// En types.ts: Lead no tiene customData definido
customData?: Record<string, unknown>; // ← agregar
```

### 18. Sin audit log de acciones de admin
Acciones destructivas (borrar lead, rechazar horas, cambiar rol de usuario) no quedan registradas. Agregar una colección `auditLogs` con `{userId, action, target, before, after, timestamp}`.

---

## Resumen de quick wins (bajo esfuerzo, alto impacto)

| # | Mejora | Esfuerzo | Impacto |
|---|--------|----------|---------|
| 9 | Cambiar `dev:full` a `concurrently` | 5 min | Alto |
| 13 | Tipar `payload` en PendingWrite | 10 min | Medio |
| 17 | Agregar `customData` a Lead interface | 10 min | Medio |
| 14 | Activar `timestamps: true` en schemas Mongoose | 30 min | Alto |
| 4 | ErrorBoundary por módulo lazy | 1h | Alto |
| 11 | ToastContext global | 2h | Alto |
| 9 | Paginación básica en CRUD | 3h | Alto |
