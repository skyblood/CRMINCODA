
# Documentación de Arquitectura - CRM BlackMoon

Esta aplicación es un sistema integral de gestión que combina CRM (Ventas), Gestión de Proyectos y Finanzas. Está construida como una **Single Page Application (SPA)** utilizando React y Vite.

## 🏗️ Estructura del Proyecto

### 1. Frontend (React + TypeScript)
La aplicación sigue una arquitectura basada en componentes funcionales y Hooks.

*   **`App.tsx`**: Componente raíz. Maneja:
    *   **Enrutamiento**: `react-router-dom` para la navegación entre módulos.
    *   **Estado Global**: Suscripción a `firebaseService` para obtener datos y pasarlos a los componentes hijos.
    *   **Autenticación**: Gestión básica de sesión de usuario.
*   **`components/`**: Contiene las vistas principales.
    *   `CRMPipeline`: Tablero Kanban para gestión de oportunidades.
    *   `ProjectManager`: Gestión de ejecución, Gantt simplificado y control de horas.
    *   `FinanceManager`: Dashboard financiero, nómina y flujo de caja.
    *   `ProfitabilityReport`: Motor de cálculo de márgenes y comisiones.
*   **`types.ts`**: Define el "Contrato de Datos". Todas las interfaces TypeScript que modelan el negocio están aquí.

### 2. Capa de Datos (Data Layer)
Actualmente, la aplicación utiliza el patrón **Repository/Service** simulado en `services/firebaseService.ts`.

*   **Abstracción**: Los componentes de React **NO** saben que los datos están en `localStorage`. Solo llaman a funciones como `addDocument('leads', data)`.
*   **Persistencia Actual**: `localStorage` del navegador.
*   **Sincronización**: Sistema Pub/Sub simple (`subscribeToCollection`) que actualiza la UI automáticamente cuando los datos cambian.

## 🔄 Flujo de Datos Principal

1.  **Lectura**: `App.tsx` se suscribe a todas las colecciones al inicio. Cuando recibe datos, actualiza su `useState` y los pasa como `props` a los módulos.
2.  **Escritura**: Un componente (ej. `CRMPipeline`) llama a `addDocument`.
3.  **Procesamiento**: `firebaseService` guarda el dato en `localStorage` y emite una notificación.
4.  **Actualización**: Los suscriptores (App.tsx) reciben la nueva lista y React repinta la interfaz.

## 🧩 Módulos Clave

### A. Ventas (CRM)
*   **Entidad Principal**: `Lead`
*   **Flujo**: Prospect -> Qualification -> Proposal -> Negotiation -> Closed Won.
*   **Logica**: Al ganar un Lead (`Closed Won`), se dispara `onConvertToProject`, clonando los datos del Lead hacia un nuevo `Project`.

### B. Proyectos
*   **Entidad Principal**: `Project`, `Task`, `TimeLog`.
*   **Relación**: 1 Lead -> 1 Project.
*   **Control**: Se comparan `loggedHours` vs `estimatedHours` para alertas de presupuesto.

### C. Finanzas
*   **Entidad Principal**: `Transaction`, `PaymentRecord`.
*   **Calculos**:
    *   *Nómina Variable*: Suma de `TimeLog` aprobados * Costo Hora Consultor.
    *   *Margen*: (Ingresos Proyecto - Costos Laborales - Gastos Directos) / Ingresos.

## 🛠️ Tecnologías
*   **Framework**: React 18
*   **Lenguaje**: TypeScript
*   **Estilos**: Tailwind CSS
*   **Gráficos**: Recharts
*   **Iconos**: Lucide React
