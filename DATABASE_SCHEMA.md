
# Guía de Esquema de Base de Datos (SQL Migration)

Para migrar la aplicación a una base de datos relacional (PostgreSQL / MySQL), utilice el siguiente esquema sugerido.

## 1. Tablas Principales

### `users`
Tabla de usuarios del sistema (empleados y consultores).
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador único |
| `email` | VARCHAR(255) | Correo (Unique) |
| `name` | VARCHAR(255) | Nombre completo |
| `role` | ENUM | 'admin', 'sales', 'consultant' |
| `hourly_cost` | DECIMAL | Costo hora interno (para reportes) |
| `monthly_salary` | DECIMAL | Salario base (si aplica) |
| `permissions` | JSONB | Permisos de acceso a módulos |

### `leads` (Oportunidades)
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador |
| `company_name` | VARCHAR | Cliente |
| `contact_name` | VARCHAR | Persona de contacto |
| `value` | DECIMAL | Valor estimado |
| `stage` | VARCHAR | 'prospect', 'negotiation', 'closed-won', etc. |
| `probability` | INT | 0-100 |
| `expected_close_date` | DATE | Fecha cierre |
| `items` | JSONB | Array de productos cotizados (Lines Items) |
| `is_deleted` | BOOLEAN | Soft delete |

### `projects`
Proyectos en ejecución (Post-venta).
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador |
| `lead_id` | UUID (FK) | Relación con la venta original |
| `name` | VARCHAR | Nombre del proyecto |
| `status` | ENUM | 'active', 'completed', 'on-hold' |
| `total_budget_hours` | INT | Presupuesto de horas vendidas |
| `start_date` | DATE | Fecha inicio |
| `team_members` | JSONB | Array de IDs de usuarios asignados |

### `tasks`
Tareas dentro de un proyecto.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador |
| `project_id` | UUID (FK) | Proyecto padre |
| `lead_id` | UUID (FK) | Lead padre (si es tarea de ventas) |
| `title` | VARCHAR | Título |
| `assignee_id` | UUID (FK) | Usuario asignado |
| `status` | ENUM | 'todo', 'in-progress', 'done' |
| `estimated_hours` | DECIMAL | Estimación |
| `due_date` | DATE | Vencimiento |

### `time_logs`
Registro de horas trabajadas (Timesheets).
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador |
| `task_id` | UUID (FK) | Tarea relacionada |
| `user_id` | UUID (FK) | Quien reportó el tiempo |
| `hours` | DECIMAL | Horas reportadas |
| `date` | DATE | Fecha del trabajo |
| `description` | TEXT | Detalle |
| `status` | ENUM | 'pending', 'approved', 'paid' |
| `approved_rate` | DECIMAL | Tarifa congelada al aprobar |

### `transactions`
Gastos e ingresos operativos.
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador |
| `type` | ENUM | 'income', 'expense' |
| `category` | VARCHAR | 'software', 'marketing', etc. |
| `amount` | DECIMAL | Monto |
| `date` | DATE | Fecha transacción |
| `project_id` | UUID (FK) | Proyecto relacionado (opcional) |
| `lead_id` | UUID (FK) | Lead relacionado (opcional - Pre-sales) |

## 2. Consideraciones para NoSQL (Firebase/Mongo)

Si opta por NoSQL, mantenga la estructura actual definida en `types.ts`.
*   **Colecciones**: `leads`, `projects`, `users`, `transactions`.
*   **Sub-colecciones**: Recomiendo mover `tasks` y `timeLogs` a sub-colecciones dentro de `projects` para evitar documentos gigantes, ej: `projects/{projectId}/tasks/{taskId}`.
