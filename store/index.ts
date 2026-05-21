/**
 * ==================================================================================
 * 🗃️ ZUSTAND GLOBAL STORES
 * ==================================================================================
 *
 * Three focused stores to eliminate prop-drilling in App.tsx:
 *   - useDataStore  → all collection data (leads, projects, users, …)
 *   - useAuthStore  → currentUser + isAuthenticated
 *   - useUIStore    → connection status, palette, notification badge
 *
 * Components subscribe ONLY to the slice they need — unrelated state changes
 * do NOT trigger re-renders in components that don't use that slice.
 * ==================================================================================
 */
import { create } from 'zustand';
import {
    Lead, Project, User, TaskTemplate, SKUItem,
    Transaction, Contact, BalanceSheetAccount, BalanceSheetNote,
    Account, AutomationRule, Pipeline,
} from '../types';

// ---- DATA STORE ----------------------------------------------------------------

interface DataState {
    leads: Lead[];
    projects: Project[];
    users: User[];
    taskTemplates: TaskTemplate[];
    skuCatalog: SKUItem[];
    transactions: Transaction[];
    contacts: Contact[];
    goals: Record<number, number>;
    balanceSheetAccounts: BalanceSheetAccount[];
    balanceSheetNotes: BalanceSheetNote[];
    accounts: Account[];
    automationRules: AutomationRule[];
    pipelines: Pipeline[];

    setLeads: (v: Lead[]) => void;
    setProjects: (v: Project[]) => void;
    setUsers: (v: User[]) => void;
    setTaskTemplates: (v: TaskTemplate[]) => void;
    setSkuCatalog: (v: SKUItem[]) => void;
    setTransactions: (v: Transaction[]) => void;
    setContacts: (v: Contact[]) => void;
    setGoals: (v: Record<number, number>) => void;
    setBalanceSheetAccounts: (v: BalanceSheetAccount[]) => void;
    setBalanceSheetNotes: (v: BalanceSheetNote[]) => void;
    setAccounts: (v: Account[]) => void;
    setAutomationRules: (v: AutomationRule[]) => void;
    setPipelines: (v: Pipeline[]) => void;
}

export const useDataStore = create<DataState>()((set) => ({
    leads: [],
    projects: [],
    users: [],
    taskTemplates: [],
    skuCatalog: [],
    transactions: [],
    contacts: [],
    goals: {},
    balanceSheetAccounts: [],
    balanceSheetNotes: [],
    accounts: [],
    automationRules: [],
    pipelines: [],

    setLeads: (leads) => set({ leads }),
    setProjects: (projects) => set({ projects }),
    setUsers: (users) => set({ users }),
    setTaskTemplates: (taskTemplates) => set({ taskTemplates }),
    setSkuCatalog: (skuCatalog) => set({ skuCatalog }),
    setTransactions: (transactions) => set({ transactions }),
    setContacts: (contacts) => set({ contacts }),
    setGoals: (goals) => set({ goals }),
    setBalanceSheetAccounts: (balanceSheetAccounts) => set({ balanceSheetAccounts }),
    setBalanceSheetNotes: (balanceSheetNotes) => set({ balanceSheetNotes }),
    setAccounts: (accounts) => set({ accounts }),
    setAutomationRules: (automationRules) => set({ automationRules }),
    setPipelines: (pipelines) => set({ pipelines }),
}));

// ---- AUTH STORE ----------------------------------------------------------------

interface AuthState {
    currentUser: User | null;
    isAuthenticated: boolean;
    setCurrentUser: (user: User | null) => void;
    setIsAuthenticated: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
    currentUser: null,
    isAuthenticated: false,
    setCurrentUser: (currentUser) => set({ currentUser }),
    setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
}));

// ---- UI STORE ------------------------------------------------------------------

interface UIState {
    dbConnected: boolean;
    pendingWrites: number;
    isCommandPaletteOpen: boolean;
    unreadNotifications: number;
    isMobileMenuOpen: boolean;
    setDbConnected: (v: boolean) => void;
    setPendingWrites: (v: number) => void;
    setIsCommandPaletteOpen: (v: boolean) => void;
    setUnreadNotifications: (v: number) => void;
    setIsMobileMenuOpen: (v: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
    dbConnected: false,
    pendingWrites: 0,
    isCommandPaletteOpen: false,
    unreadNotifications: 0,
    isMobileMenuOpen: false,
    setDbConnected: (dbConnected) => set({ dbConnected }),
    setPendingWrites: (pendingWrites) => set({ pendingWrites }),
    setIsCommandPaletteOpen: (isCommandPaletteOpen) => set({ isCommandPaletteOpen }),
    setUnreadNotifications: (unreadNotifications) => set({ unreadNotifications }),
    setIsMobileMenuOpen: (isMobileMenuOpen) => set({ isMobileMenuOpen }),
}));
