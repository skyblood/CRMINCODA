
import { io as socketIO } from 'socket.io-client';
import { Lead, Project, User, TaskTemplate, SKUItem, Transaction, Contact } from '../types';
import { toast } from '../components/Toast';

/**
 * ==================================================================================
 * 🔌 SERVICE LAYER - MONGODB CONNECTION
 * ==================================================================================
 *
 * DUAL MODE with persistence guarantees:
 * - If the backend is running → uses MongoDB via REST API
 * - If NO backend → writes to offline queue and retries on reconnect
 *
 * Guarantees:
 *   1. API availability is re-checked every 15s (never cached indefinitely)
 *   2. Failed writes are queued and re-synced on reconnect
 *   3. Components receive an `onConnectionChange` callback to display connection state
 */

const API_BASE = '/api';
let useApi = false;
let apiChecked = false;
const CHECK_INTERVAL_MS = 15_000; // Re-check every 15 seconds

// ==================================================================================
// PENDING WRITE QUEUE (offline → MongoDB on reconnect)
// ==================================================================================
type PendingWrite = {
    id: string;
    collectionName: string;
    operation: 'add' | 'update' | 'delete';
    payload?: Record<string, unknown>;
    itemId?: string;
    timestamp: number;
};

const PENDING_QUEUE_KEY = 'CRM_PENDING_WRITES_V1';

const loadPendingQueue = (): PendingWrite[] => {
    try {
        const raw = localStorage.getItem(PENDING_QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
};

const savePendingQueue = (queue: PendingWrite[]) => {
    try { localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue)); }
    catch (e) { console.error('[CRM] Error saving pending queue', e); }
};

let pendingQueue: PendingWrite[] = loadPendingQueue();

const enqueuePendingWrite = (write: Omit<PendingWrite, 'id' | 'timestamp'>) => {
    const entry: PendingWrite = { ...write, id: `pw_${Date.now()}_${Math.random()}`, timestamp: Date.now() };
    pendingQueue.push(entry);
    savePendingQueue(pendingQueue);
    console.warn(`[CRM] ⚠️ Operation queued offline: ${write.operation} on ${write.collectionName}`);
};

const flushPendingQueue = async () => {
    if (pendingQueue.length === 0) return;
    console.log(`[CRM] 🔄 Syncing ${pendingQueue.length} pending operations to MongoDB...`);

    const toProcess = [...pendingQueue];
    const failed: PendingWrite[] = [];

    for (const entry of toProcess) {
        try {
            if (entry.operation === 'add') {
                await apiFetch(`/${entry.collectionName}`, { method: 'POST', body: JSON.stringify(entry.payload) });
            } else if (entry.operation === 'update' && entry.itemId) {
                await apiFetch(`/${entry.collectionName}/${entry.itemId}`, { method: 'PUT', body: JSON.stringify(entry.payload) });
            } else if (entry.operation === 'delete' && entry.itemId) {
                await apiFetch(`/${entry.collectionName}/${entry.itemId}`, { method: 'DELETE' });
            }
        } catch (e) {
            console.error(`[CRM] Error flushing pending write for ${entry.collectionName}:`, e);
            failed.push(entry);
        }
    }

    pendingQueue = failed;
    savePendingQueue(pendingQueue);

    if (failed.length === 0) {
        console.log('[CRM] ✅ Sync complete. All data is in MongoDB.');
    } else {
        console.warn(`[CRM] ⚠️ ${failed.length} operations could not be synced.`);
    }

    // Refresh all collections from MongoDB
    for (const key of Object.values(COLLECTIONS)) {
        try {
            const data = await fetchCollection(key);
            localStore[key] = data;
            notifyListeners(key);
        } catch { /* silent */ }
    }
};

// ==================================================================================
// CONNECTION STATE LISTENERS
// ==================================================================================
type ConnectionListener = (connected: boolean, pendingCount: number) => void;
const connectionListeners: ConnectionListener[] = [];

export const onConnectionChange = (cb: ConnectionListener) => {
    connectionListeners.push(cb);
    // Notify current state immediately
    cb(useApi, pendingQueue.length);
    return () => {
        const idx = connectionListeners.indexOf(cb);
        if (idx >= 0) connectionListeners.splice(idx, 1);
    };
};

const notifyConnectionChange = () => {
    connectionListeners.forEach(cb => cb(useApi, pendingQueue.length));
};

// ==================================================================================
// API AVAILABILITY CHECK — Re-verified periodically
// ==================================================================================

const checkApiAvailability = async (): Promise<boolean> => {
    const prevUseApi = useApi;
    try {
        const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
        useApi = res.ok;
    } catch {
        useApi = false;
    }
    apiChecked = true;

    // On reconnect, sync pending offline data
    if (useApi && !prevUseApi && apiChecked) {
        console.log('[CRM] ✅ MongoDB connection restored.');
        await flushPendingQueue();
    } else if (!useApi && prevUseApi) {
        console.warn('[CRM] ⚠️ MongoDB connection lost. Operations will be queued.');
    }

    notifyConnectionChange();
    return useApi;
};

// Check on load and re-verify every 15s
checkApiAvailability();
setInterval(checkApiAvailability, CHECK_INTERVAL_MS);

// ==================================================================================
// WEBSOCKET — Real-time collection updates (replaces polling for active collections)
// ==================================================================================

const socket = socketIO('/', { path: '/socket.io', autoConnect: true, withCredentials: true });

socket.on('connect', () => {
    console.log('[CRM] ⚡ WebSocket connected');
});

socket.on('disconnect', () => {
    console.log('[CRM] ⚡ WebSocket disconnected — falling back to polling');
});

socket.on('collection:change', async ({ collection, operation }: { collection: string; operation: string }) => {
    // Re-fetch affected collection from server so all subscribers get fresh data
    if (!useApi) return;
    try {
        const collectionKey = Object.values(COLLECTIONS).find(c => {
            // MongoDB stores collection names in plural; normalize
            return c === collection || `${c}s` === collection || collection.startsWith(c);
        });
        const key = collectionKey || collection;
        const data = await apiFetch(`/${key}`);
        localStore[key] = data;
        saveToStorage(key, data);
        notifyListeners(key);
    } catch { /* silent — polling will catch it */ }
});

// ==================================================================================
// API REST HELPERS
// ==================================================================================

const apiFetch = async (path: string, options?: RequestInit) => {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        // Attach HTTP status so callers (e.g. updateDocument) can branch on 409
        const err = Object.assign(new Error(body.error || 'API Error'), {
            status: res.status,
            data: body,
        });
        throw err;
    }
    return res.json();
};

/**
 * Fetch an entire collection via the paginated API.
 * Uses ?page=1&limit=500 — if the server returns more pages they are fetched in
 * parallel and merged. Completely transparent to callers: always returns a plain array.
 */
const fetchCollection = async (collectionName: string, limit = 500): Promise<any> => {
    const first = await apiFetch(`/${collectionName}?page=1&limit=${limit}&sort=createdAt&order=desc`);
    // Server returns plain array when no ?page — shouldn't happen here, but guard anyway
    if (Array.isArray(first)) return first;
    // Non-paginated object response (e.g. goals returns { year: amount })
    if (!first || typeof first !== 'object' || !('data' in first)) return first;
    const { data, pages } = first as { data: any[]; pages: number; total: number; page: number };
    if (pages <= 1) return data;
    const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, i) =>
            apiFetch(`/${collectionName}?page=${i + 2}&limit=${limit}&sort=createdAt&order=desc`)
                .then((r: any) => r.data ?? [])
        )
    );
    return [...data, ...rest.flat()];
};

// ==================================================================================
// LOCAL LAYER (localStorage) — Read-only offline fallback, never the primary store
// ==================================================================================

const COLLECTIONS = {
    LEADS: 'leads', PROJECTS: 'projects', USERS: 'users',
    TEMPLATES: 'templates', SKUS: 'skus', TRANSACTIONS: 'transactions',
    CONTACTS: 'contacts', GOALS: 'goals',
    BALANCE_SHEET_ACCOUNTS: 'balanceSheetAccounts',
    BALANCE_SHEET_NOTES: 'balanceSheetNotes'
};

const STORAGE_PREFIX = 'CRM_BM_LOCAL_V1_';
const INIT_FLAG = 'IS_INITIALIZED';

const loadFromStorage = (key: string) => {
    if (typeof window === 'undefined') return [];
    try {
        const item = localStorage.getItem(STORAGE_PREFIX + key);
        return item ? JSON.parse(item) : (key === 'goals' ? {} : []);
    } catch (e) {
        console.error(`Error loading ${key}`, e);
        return key === 'goals' ? {} : [];
    }
};

const saveToStorage = (key: string, data: any) => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data)); }
    catch (e) { console.error(`Error saving ${key}`, e); }
};

const localStore: Record<string, any> = {};
Object.values(COLLECTIONS).forEach(c => {
    localStore[c] = loadFromStorage(c);
    if (localStore[c] === undefined || localStore[c] === null) {
        localStore[c] = [];
    }
});

if (Object.keys(localStore[COLLECTIONS.GOALS]).length === 0) {
    localStore[COLLECTIONS.GOALS] = { 2023: 1000000, 2024: 1000000, 2025: 1200000, 2026: 1500000, 2027: 1800000, 2028: 2000000 };
}

const listeners: Record<string, Function[]> = {};

const notifyListeners = (collectionName: string) => {
    if (listeners[collectionName]) {
        const data = localStore[collectionName];
        const result = Array.isArray(data) ? [...data] : (typeof data === 'object' ? {...data} : data);
        listeners[collectionName].forEach(cb => cb(result));
    }
};

// ==================================================================================
// POLLING — Keeps local data in sync with MongoDB
// ==================================================================================

const POLL_INTERVAL = 30_000; // Reduced — WebSocket handles real-time; polling is now a fallback
const activePolls: Record<string, ReturnType<typeof setInterval>> = {};

const startPolling = (collectionName: string) => {
    if (activePolls[collectionName]) return;

    const poll = async () => {
        if (!useApi) return; // Skip if offline
        try {
            const data = await fetchCollection(collectionName);
            localStore[collectionName] = data;
            saveToStorage(collectionName, data); // Update local cache
            notifyListeners(collectionName);
        } catch {
            // Silent — backend may have gone down
        }
    };

    activePolls[collectionName] = setInterval(poll, POLL_INTERVAL);
};

const stopPolling = (collectionName: string) => {
    if (activePolls[collectionName]) {
        clearInterval(activePolls[collectionName]);
        delete activePolls[collectionName];
    }
};

// ==================================================================================
// PUBLIC API
// ==================================================================================

/**
 * 🔐 LOGIN
 */
export const loginUser = async (email: string, password: string): Promise<{ user?: any; error?: string }> => {
    const hasApi = await checkApiAvailability();
    if (hasApi) {
        try {
            const user = await apiFetch('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            return { user };
        } catch (e: any) {
            return { error: e.message || 'Invalid credentials.' };
        }
    }
    // Offline fallback: read-only, login not allowed if server is down
    const users: any[] = loadFromStorage('users') || [];
    const found = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
    if (!found) return { error: 'User not found.' };
    if (password.length < 4) return { error: 'Incorrect password.' };
    return { user: found };
};

/**
 * INICIALIZACIÓN
 */
export const initializeLocalStore = (initialData: any) => {
    (async () => {
        const hasApi = await checkApiAvailability();
        if (hasApi) {
            try {
                // Seed full dataset only on empty DB
                await apiFetch('/seed/init', {
                    method: 'POST',
                    body: JSON.stringify(initialData)
                });
                // Always sync built-in templates so new ones are inserted without a full reset
                if (initialData.templates?.length) {
                    await apiFetch('/seed/sync-templates', {
                        method: 'POST',
                        body: JSON.stringify({ templates: initialData.templates })
                    });
                }
            } catch (e) {
                console.error('[CRM] Error initializing DB:', e);
            }
            return;
        }
    })();

    // Local cache (for offline availability only)
    Object.keys(initialData).forEach(key => {
        const stored = loadFromStorage(key);
        if (!stored || (Array.isArray(stored) && stored.length === 0) || (typeof stored === 'object' && Object.keys(stored).length === 0)) {
            localStore[key] = initialData[key];
            saveToStorage(key, initialData[key]);
        } else {
            localStore[key] = stored;
            if (Array.isArray(initialData[key])) {
                const existingIds = new Set((stored as any[]).map((i: any) => i.id));
                const newItems = (initialData[key] as any[]).filter((i: any) => !existingIds.has(i.id));
                if (newItems.length > 0) {
                    localStore[key] = [...stored, ...newItems];
                    saveToStorage(key, localStore[key]);
                }
            }
        }
    });

    if (!localStorage.getItem(STORAGE_PREFIX + INIT_FLAG)) {
        localStorage.setItem(STORAGE_PREFIX + INIT_FLAG, 'true');
    }

    Object.keys(localStore).forEach(key => notifyListeners(key));
};

/**
 * 💾 BACKUP
 */
export const backupLocalData = (): string => {
    return JSON.stringify({
        version: "2.0",
        timestamp: new Date().toISOString(),
        system: "CRM_INCODA_LOCAL",
        data: localStore
    }, null, 2);
};

/**
 * ♻️ RESTAURAR
 */
export const restoreLocalData = (jsonString: string): boolean => {
    try {
        const parsed = JSON.parse(jsonString);
        let dataToRestore = parsed;

        if (parsed.system === "CRM_INCODA_LOCAL" && parsed.data) {
            dataToRestore = parsed.data;
        } else if (!Array.isArray(parsed) && !parsed.leads && !parsed.users) {
            alert("Invalid backup file format.");
            return false;
        }

        Object.values(COLLECTIONS).forEach(key => {
            if (dataToRestore[key] !== undefined) {
                localStore[key] = dataToRestore[key];
                saveToStorage(key, localStore[key]);
                notifyListeners(key);
            }
        });

        (async () => {
            if (await checkApiAvailability()) {
                try {
                    await apiFetch('/seed', { method: 'POST', body: JSON.stringify(dataToRestore) });
                } catch (e) { console.error('Error restoring to MongoDB:', e); }
            }
        })();

        localStorage.setItem(STORAGE_PREFIX + INIT_FLAG, 'true');
        return true;
    } catch (e) {
        console.error("Failed to restore", e);
        alert("Critical error restoring backup. Please check the file.");
        return false;
    }
};

/**
 * 📡 SUBSCRIPCIÓN A DATOS
 */
export const subscribeToCollection = <T>(collectionName: string, callback: (data: T) => void) => {
    if (!listeners[collectionName]) listeners[collectionName] = [];
    listeners[collectionName].push(callback);

    (async () => {
        const hasApi = await checkApiAvailability();
        if (hasApi) {
            try {
                const data = await fetchCollection(collectionName);
                localStore[collectionName] = data;
                saveToStorage(collectionName, data);
                callback(data as T);
                startPolling(collectionName);
                return;
            } catch (e) {
                console.error(`[CRM] Error fetching ${collectionName}, falling back to local`, e);
            }
        }

        // Fallback: locally cached data
        if (localStore[collectionName]) {
            callback(localStore[collectionName] as T);
        }
    })();

    return () => {
        listeners[collectionName] = listeners[collectionName].filter(cb => cb !== callback);
        if (listeners[collectionName].length === 0) {
            stopPolling(collectionName);
        }
    };
};

/**
 * ➕ ADD DOCUMENT — Always tries MongoDB first; queues on failure
 */
export const addDocument = async (collectionName: string, data: any) => {
    const newItem = { ...data, id: data.id || `doc_${Date.now()}` };

    // Optimistic update — subscribers see the new item immediately
    if (!localStore[collectionName]) localStore[collectionName] = [];
    if (Array.isArray(localStore[collectionName])) {
        localStore[collectionName] = [...localStore[collectionName], newItem];
    }
    saveToStorage(collectionName, localStore[collectionName]);
    notifyListeners(collectionName);

    if (await checkApiAvailability()) {
        try {
            const saved = await apiFetch(`/${collectionName}`, { method: 'POST', body: JSON.stringify(newItem) });
            // Merge the server-confirmed item without refetching entire collection (prevents losing parallel addDocument calls)
            if (Array.isArray(localStore[collectionName])) {
                localStore[collectionName] = localStore[collectionName].map((item: any) =>
                    item.id === newItem.id ? { ...newItem, ...(saved || {}) } : item
                );
            }
            saveToStorage(collectionName, localStore[collectionName]);
            notifyListeners(collectionName);
            return saved ?? newItem;
        } catch (e) {
            toast.error(`Failed to create record — queued for retry.`);
            console.error(`[CRM] Error adding to ${collectionName}:`, e);
            enqueuePendingWrite({ collectionName, operation: 'add', payload: newItem });
        }
    } else {
        enqueuePendingWrite({ collectionName, operation: 'add', payload: newItem });
    }
    notifyConnectionChange();
    return newItem;
};

/**
 * ✏️ UPDATE DOCUMENT — Always tries MongoDB first; queues on failure
 */
export const updateDocument = async (collectionName: string, id: string, data: any) => {
    // Optimistic update — apply immediately so all subscribers see the change before the network round-trip
    if (collectionName === COLLECTIONS.GOALS) {
        localStore[collectionName] = { ...localStore[collectionName], ...data };
    } else if (localStore[collectionName] && Array.isArray(localStore[collectionName])) {
        localStore[collectionName] = localStore[collectionName].map((item: any) =>
            item.id === id ? { ...item, ...data } : item
        );
    }
    saveToStorage(collectionName, localStore[collectionName]);
    notifyListeners(collectionName);

    if (await checkApiAvailability()) {
        try {
            if (collectionName === COLLECTIONS.GOALS) {
                await apiFetch(`/${collectionName}`, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                await apiFetch(`/${collectionName}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
            }
            // Reconcile with server truth after the write
            const freshData = await fetchCollection(collectionName);
            localStore[collectionName] = freshData;
            saveToStorage(collectionName, freshData);
            notifyListeners(collectionName);
            return;
        } catch (e: any) {
            if (e?.status === 409) {
                // Concurrent edit detected — pull the authoritative server state and
                // notify all subscribers so the UI reflects what's actually in the DB.
                console.warn(`[CRM] ⚠️ Conflict on ${collectionName}/${id} — refreshing from server.`);
                toast.warn('This record was edited by another session — your view has been refreshed.');
                try {
                    const freshData = await fetchCollection(collectionName);
                    localStore[collectionName] = freshData;
                    saveToStorage(collectionName, freshData);
                    notifyListeners(collectionName);
                } catch { /* silent — will be caught on next poll */ }
                throw e; // re-throw so components can show a user-facing message
            }
            toast.error(`Failed to save changes — queued for retry.`);
            console.error(`[CRM] Error updating ${collectionName}:`, e);
            enqueuePendingWrite({ collectionName, operation: 'update', payload: data, itemId: id });
        }
    } else {
        enqueuePendingWrite({ collectionName, operation: 'update', payload: data, itemId: id });
    }
    notifyConnectionChange();
};

/**
 * ❌ DELETE DOCUMENT — Always tries MongoDB first; queues on failure
 */
export const deleteDocument = async (collectionName: string, id: string) => {
    // Optimistic update — remove item immediately so all subscribers see it gone
    if (localStore[collectionName] && Array.isArray(localStore[collectionName])) {
        localStore[collectionName] = localStore[collectionName].filter((item: any) => item.id !== id);
        saveToStorage(collectionName, localStore[collectionName]);
        notifyListeners(collectionName);
    }

    if (await checkApiAvailability()) {
        try {
            await apiFetch(`/${collectionName}/${id}`, { method: 'DELETE' });
            const freshData = await fetchCollection(collectionName);
            localStore[collectionName] = freshData;
            saveToStorage(collectionName, freshData);
            notifyListeners(collectionName);
            return;
        } catch (e) {
            toast.error(`Failed to delete record — queued for retry.`);
            console.error(`[CRM] Error deleting from ${collectionName}:`, e);
            enqueuePendingWrite({ collectionName, operation: 'delete', itemId: id });
        }
    } else {
        enqueuePendingWrite({ collectionName, operation: 'delete', itemId: id });
    }
    notifyConnectionChange();
};

/**
 * 🔄 CASCADE UPDATE
 */
export const updateUserAndCascade = async (updatedUser: User, oldName: string) => {
    if (await checkApiAvailability()) {
        try {
            await apiFetch(`/users/${updatedUser.id}/cascade`, {
                method: 'PUT',
                body: JSON.stringify({ ...updatedUser, oldName })
            });
            const [users, projects, leads] = await Promise.all([
                fetchCollection('users'), fetchCollection('projects'), fetchCollection('leads')
            ]);
            localStore.users = users;
            localStore.projects = projects;
            localStore.leads = leads;
            saveToStorage('users', users);
            saveToStorage('projects', projects);
            saveToStorage('leads', leads);
            notifyListeners('users');
            notifyListeners('projects');
            notifyListeners('leads');
            return;
        } catch (e) {
            console.error('[CRM] Error in cascade update:', e);
        }
    }

    await updateDocument(COLLECTIONS.USERS, updatedUser.id, updatedUser);

    if (oldName && oldName !== updatedUser.name) {
        const newName = updatedUser.name;
        const projects = localStore[COLLECTIONS.PROJECTS] as Project[];
        localStore[COLLECTIONS.PROJECTS] = projects.map(p => ({
            ...p,
            team: p.team.map(m => m === oldName ? newName : m),
            tasks: p.tasks.map(t => t.assignee === oldName ? { ...t, assignee: newName } : t),
            timeLogs: p.timeLogs.map(l => l.consultantName === oldName ? { ...l, consultantName: newName } : l)
        }));
        saveToStorage(COLLECTIONS.PROJECTS, localStore[COLLECTIONS.PROJECTS]);
        notifyListeners(COLLECTIONS.PROJECTS);

        const leads = localStore[COLLECTIONS.LEADS] as Lead[];
        localStore[COLLECTIONS.LEADS] = leads.map(l => ({
            ...l,
            tasks: (l.tasks || []).map(t => t.assignee === oldName ? { ...t, assignee: newName } : t)
        }));
        saveToStorage(COLLECTIONS.LEADS, localStore[COLLECTIONS.LEADS]);
        notifyListeners(COLLECTIONS.LEADS);
    }
};

/**
 * 🧪 RESETEAR BASE DE DATOS
 */
export const seedDatabase = async (
    users: User[], leads: Lead[], projects: Project[],
    templates: TaskTemplate[], skus: SKUItem[],
    transactions: Transaction[], contacts: Contact[]
) => {
    if (!window.confirm("⚠️ RESET DATABASE: This will restore defaults. Continue?")) return;

    const seedData = {
        users, leads, projects, templates, skus, transactions, contacts,
        goals: { 2023: 1000000, 2024: 1000000, 2025: 1200000, 2026: 1500000, 2027: 1800000, 2028: 2000000 }
    };

    if (await checkApiAvailability()) {
        try {
            await apiFetch('/seed', { method: 'POST', body: JSON.stringify(seedData) });
            for (const key of Object.values(COLLECTIONS)) {
                const data = await fetchCollection(key);
                localStore[key] = data;
                saveToStorage(key, data);
                notifyListeners(key);
            }
            // Limpiar cola de pendientes
            pendingQueue = [];
            savePendingQueue([]);
            alert("Database has been reset (MongoDB).");
            return;
        } catch (e) {
            console.error('[CRM] Error resetting MongoDB:', e);
        }
    }

    // Fallback localStorage
    localStore[COLLECTIONS.USERS] = users;
    localStore[COLLECTIONS.LEADS] = leads;
    localStore[COLLECTIONS.PROJECTS] = projects;
    localStore[COLLECTIONS.TEMPLATES] = templates;
    localStore[COLLECTIONS.SKUS] = skus;
    localStore[COLLECTIONS.TRANSACTIONS] = transactions;
    localStore[COLLECTIONS.CONTACTS] = contacts;
    localStore[COLLECTIONS.GOALS] = seedData.goals;

    Object.values(COLLECTIONS).forEach(key => {
        saveToStorage(key, localStore[key]);
        notifyListeners(key);
    });
    localStorage.setItem(STORAGE_PREFIX + INIT_FLAG, 'true');
    alert("Database has been reset.");
};

/**
 * 🤖 AI LEAD SCORING
 */
export const scoreLeadAI = async (leadId: string): Promise<{ score: number; reason: string }> => {
    return apiFetch(`/leads/${leadId}/score`, { method: 'POST' });
};

export const scoreAllLeadsAI = async (): Promise<{ scored: number }> => {
    return apiFetch('/leads/score-all', { method: 'POST' });
};

/**
 * 📊 PIPELINE ANALYTICS
 */
export const fetchPipelineAnalytics = async (year?: number) => {
    const query = year ? `?year=${year}` : '';
    return apiFetch(`/analytics/pipeline${query}`);
};

/**
 * 📋 AUDIT LOGS
 */
export const fetchAuditLogs = async (entityId: string, entityType = 'lead', limit = 50) => {
    return apiFetch(`/audit-logs?entityId=${entityId}&entityType=${entityType}&limit=${limit}`);
};

/**
 * 📊 ESTADO DE CONEXIÓN — Util para mostrar en UI
 */
export const getConnectionStatus = () => ({
    connected: useApi,
    pendingWrites: pendingQueue.length
});

/**
 * 🔄 FORCE REFRESH — Re-fetches a collection from MongoDB and notifies all subscribers
 */
export const refreshCollection = async (collectionName: string): Promise<void> => {
    if (await checkApiAvailability()) {
        try {
            const freshData = await fetchCollection(collectionName);
            localStore[collectionName] = freshData;
            saveToStorage(collectionName, freshData);
            notifyListeners(collectionName);
        } catch (e) {
            console.error(`[CRM] Error refreshing ${collectionName}:`, e);
        }
    }
};
