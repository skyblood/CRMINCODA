
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, FolderKanban, LogOut, Briefcase, Shield, ListPlus, Package, DollarSign, Clock, CheckSquare, Contact as ContactIcon, Database, WifiOff, Download, Upload, HardDrive, TrendingUp, Loader2, Split, Scale, Bell, KeyRound, Webhook, Settings2, Search, Menu, X, Building2, Zap, GitBranch, FileText, Mail, Receipt, BarChart2 } from 'lucide-react';

// Eager load Login for instant interaction
import { Login } from './components/Login';
import { Lead, Project, Task, User, ProjectType, TaskTemplate, SKUItem, Transaction, TemplateItem, TimeLog, Contact, BalanceSheetAccount, BalanceSheetNote, Account, AutomationRule, Pipeline, LineItem } from './types';

// Zustand stores
import { useDataStore, useAuthStore, useUIStore } from './store';

// Error boundary
import { ErrorBoundary } from './components/ErrorBoundary';

// Toast notifications
import { ToastContainer } from './components/Toast';

// Local Services
import {
    subscribeToCollection,
    addDocument,
    updateDocument,
    deleteDocument,
    updateUserAndCascade,
    seedDatabase,
    initializeLocalStore,
    backupLocalData,
    restoreLocalData,
    onConnectionChange,
    refreshCollection
} from './services/apiService';

// --- LAZY LOAD HEAVY COMPONENTS ---
// Lazy-loaded route components — React.lazy only (no React.memo wrapping lazy, incompatible in Safari)
const Dashboard               = React.lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const CRMPipeline             = React.lazy(() => import('./components/CRMPipeline').then(m => ({ default: m.CRMPipeline })));
const ProjectManager          = React.lazy(() => import('./components/ProjectManager').then(m => ({ default: m.ProjectManager })));
const FinanceManager          = React.lazy(() => import('./components/FinanceManager').then(m => ({ default: m.FinanceManager })));
const ProfitabilityReport     = React.lazy(() => import('./components/ProfitabilityReport').then(m => ({ default: m.ProfitabilityReport })));
const ConsultantPortal        = React.lazy(() => import('./components/ConsultantPortal').then(m => ({ default: m.ConsultantPortal })));
const UserManagement          = React.lazy(() => import('./components/UserManagement').then(m => ({ default: m.UserManagement })));
const TemplateManager         = React.lazy(() => import('./components/TemplateManager').then(m => ({ default: m.TemplateManager })));
const SKUManager              = React.lazy(() => import('./components/SKUManager').then(m => ({ default: m.SKUManager })));
const SalesTaskManager        = React.lazy(() => import('./components/SalesTaskManager').then(m => ({ default: m.SalesTaskManager })));
const ContactManager          = React.lazy(() => import('./components/ContactManager').then(m => ({ default: m.ContactManager })));
const TimeApprovalManager     = React.lazy(() => import('./components/TimeApprovalManager').then(m => ({ default: m.TimeApprovalManager })));
const NotificationCenter      = React.lazy(() => import('./components/NotificationCenter').then(m => ({ default: m.NotificationCenter })));
const CommissionsManager      = React.lazy(() => import('./components/CommissionsManager').then(m => ({ default: m.CommissionsManager })));
const BalanceSheet            = React.lazy(() => import('./components/BalanceSheet').then(m => ({ default: m.BalanceSheet })));
const NotificationSettings    = React.lazy(() => import('./components/NotificationSettings').then(m => ({ default: m.NotificationSettings })));
const ApiKeysManager          = React.lazy(() => import('./components/ApiKeysManager').then(m => ({ default: m.ApiKeysManager })));
const CommandPalette          = React.lazy(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })));
const WebhookManager          = React.lazy(() => import('./components/WebhookManager').then(m => ({ default: m.WebhookManager })));
const CustomFieldsManager     = React.lazy(() => import('./components/CustomFieldsManager').then(m => ({ default: m.CustomFieldsManager })));
const PipelineAnalytics       = React.lazy(() => import('./components/PipelineAnalytics').then(m => ({ default: m.PipelineAnalytics })));
const AccountManager          = React.lazy(() => import('./components/AccountManager').then(m => ({ default: m.AccountManager })));
const AutomationManager       = React.lazy(() => import('./components/AutomationManager').then(m => ({ default: m.AutomationManager })));
const PipelineManager         = React.lazy(() => import('./components/PipelineManager').then(m => ({ default: m.PipelineManager })));
const ProposalTemplateManager = React.lazy(() => import('./components/ProposalTemplateManager').then(m => ({ default: m.ProposalTemplateManager })));
const EmailTemplateManager    = React.lazy(() => import('./components/EmailTemplateManager').then(m => ({ default: m.EmailTemplateManager })));
const InvoiceManager          = React.lazy(() => import('./components/InvoiceManager').then(m => ({ default: m.InvoiceManager })));
const FinancialBalanceReport  = React.lazy(() => import('./components/FinancialBalanceReport').then(m => ({ default: m.FinancialBalanceReport })));

// --- MOCK DATA CONSTANTS ---
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth();

const STANDARD_IMPL_ITEMS: TemplateItem[] = [
  { id: 'ti_f1', title: 'Phase 1: Kick Off & Planning', defaultHours: 4, subtasks: ['Kickoff presentation session', 'Project plan reviews', 'Training: Veracode Usage', 'Requirements gathering', 'Executive report: Activities & Phase 1 closure'] },
  { id: 'ti_f2_config', title: 'Phase 2: Initial Basic Configuration', defaultHours: 6, subtasks: ['Platform & Administration walkthrough', 'Additional Administrators configuration', 'User creation on platform', 'Team definition by company', 'Team creation on platform', 'Application Profile definition', 'Application Profile creation on platform'] },
  { id: 'ti_f7_close', title: 'Phase 7: Project Closure', defaultHours: 2, subtasks: ['Validation', 'Final report'] }
];

const VERACODE_IMPL_ITEMS: TemplateItem[] = [
  {
    id: 'vc_f1', title: 'Phase 1: Kick Off', defaultHours: 4,
    subtasks: [
      'Presentation & project kickoff session',
      'InnTech project plan review',
      'Training: Veracode Usage',
      'Requirements gathering',
      'Executive report: Activities & Phase 1 closure'
    ]
  },
  {
    id: 'vc_f2', title: 'Phase 2: Initial Basic Configuration', defaultHours: 16,
    subtasks: [
      'Platform & Administration walkthrough',
      'Additional Administrators configuration',
      'User creation on platform',
      'Team definition by company',
      'Team creation on platform',
      'Application Profile definition',
      'Application Profile creation on platform',
      'Business Units definition & creation (BU name assignment)',
      'Team assignment to Business Units',
      'First Application Security Policy creation (name & description)',
      'Scan rules & norms definition for security policy',
      'SSO-LDAP integration: enable SSO module (Veracode support request)',
      'SSO-LDAP integration: create LDAP application',
      'SSO-LDAP integration: share Microsoft Entra ID URLs (Login, Identifier, Logout)',
      'Veracode API credentials: generate API ID & API Key',
      'ISM integration: machine delivery for agent installation (Linux/Windows)',
      'ISM integration: Veracode Gateway creation (name & description)',
      'ISM integration: Endpoint creation (ISM agent)',
      'ISM integration: download agent installer & KEY',
      'ISM integration: agent installation & configuration',
      'Deliverable: Activities & Phase 2 closure'
    ]
  },
  {
    id: 'vc_f3', title: 'Phase 3: SAST', defaultHours: 12,
    subtasks: [
      'Scan target definition',
      'SAST scan configuration (name, description, criticality, BU, Teams, Owners, Policy)',
      'SAST integration review',
      'Mitigation process walkthrough',
      'Findings review & correction approach — SAST',
      'Re-scan to validate remediations — SAST',
      'Integration & adjustment tests',
      'Optimization: refine configuration to reduce false positives',
      'Executive report: Activities & Phase 3 closure'
    ]
  },
  {
    id: 'vc_f4', title: 'Phase 4: SCA', defaultHours: 10,
    subtasks: [
      'SCA integration & automation configuration',
      'SCA Workspace creation',
      'Agent creation & token generation',
      'Agent installation & configuration',
      'Initial SCA scan launch',
      'Findings review & correction approach — SCA',
      'Re-scan to validate remediations — SCA',
      'Integration & adjustment tests',
      'Executive report: Activities & Phase 4 closure'
    ]
  },
  {
    id: 'vc_f5', title: 'Phase 5: DAST & DAST Essentials', defaultHours: 10,
    subtasks: [
      'DAST integration configuration (API / WEB)',
      'DAST creation (name, URL/APP method — CSV or URLs)',
      'Authentication methods, variables & scan controls configuration',
      'Scan scheduling',
      'DAST Essentials: scan type selection (quick / full scan)',
      'Executive report: Activities & Phase 5 closure'
    ]
  },
  {
    id: 'vc_f6', title: 'Phase 6: FIX, Reporting & Monitoring', defaultHours: 8,
    subtasks: [
      'Developer tools configuration & first use (IDE)',
      'Veracode Fix: vulnerability management & correction process',
      'Remediation prioritization criteria (severity & impact)',
      'Continuous results monitoring (automated & manual scans)',
      'Automated reporting setup',
      'Executive report: Activities & Phase 6 closure'
    ]
  },
  {
    id: 'vc_f7', title: 'Phase 7: Project Closure', defaultHours: 3,
    subtasks: [
      'Deliverables validation',
      'Final report & documentation',
      'Closing session'
    ]
  }
];

const INITIAL_TEMPLATES: TaskTemplate[] = [
  { id: 'tpl_impl_std', name: 'Standard Implementation', type: 'implementation', description: 'Full 7-phase Veracode implementation.', items: STANDARD_IMPL_ITEMS },
  { id: 'tpl_veracode_impl_v1', name: 'Veracode Full Implementation (7 Phases)', type: 'implementation', description: 'Complete 7-phase Veracode deployment: Kick Off, Initial Config, SAST, SCA, DAST, FIX/Reporting, and Project Closure. Total: 63h estimated.', items: VERACODE_IMPL_ITEMS },
  { id: 'tpl_hours_pack_v2', name: 'Hours Pack (50h)', type: 'support', description: 'Standard structure for Hours Pack projects.', items: [{ id: 'ti_hp_exec', title: 'Hours Pack Execution', defaultHours: 46, subtasks: ['Ticket resolution', 'Consulting sessions'] }] }
];

const INITIAL_SKUS: SKUItem[] = [
    { id: 'sku_1', code: 'DYN-URL', name: 'DYN License', category: 'license', basePrice: 25000 },
    { id: 'sku_7', code: 'PACK-100H', name: '100h Pack', category: 'hours_pack', basePrice: 15000 }
];

// DEMO USERS with Costs
const INITIAL_USERS: (User & { password?: string })[] = [
  { id: 'u1', name: 'Fabian Rojas', email: 'fabian@blackmoon.com.co', role: 'admin', permissions: { dashboard: true, crm: true, projects: true, portal: true, admin: true }, monthlySalary: 5000, hourlyCost: 50, password: 'admin1234' },
  { id: 'u2', name: 'Sarah Connor', email: 'sarah@future.com', role: 'consultant', permissions: { dashboard: false, crm: false, projects: false, portal: true, admin: false }, monthlySalary: 0, hourlyCost: 90, password: 'sarah1234' },
  { id: 'u3', name: 'Kyle Reese', email: 'kyle@tech.com', role: 'sales', permissions: { dashboard: true, crm: true, projects: false, portal: false, admin: false }, monthlySalary: 3000, hourlyCost: 0, password: 'kyle1234' }
];

// DEMO LEADS (One Won, One Loss, One Negotiation)
const INITIAL_LEADS: Lead[] = [
   {
       id: 'lead_demo_1',
       companyName: 'Cyberdyne Systems',
       contactName: 'Miles Dyson',
       email: 'miles@cyberdyne.com',
       phone: '555-0700',
       city: 'San Francisco',
       country: 'USA',
       role: 'CTO',
       description: 'Skynet Core Implementation - High Value',
       value: 120000,
       closedValue: 120000,
       partnerName: 'Microsoft',
       manufacturer: 'Microsoft',
       items: [],
       stage: 'closed-won',
       probability: 100,
       expectedCloseDate: `${CURRENT_YEAR}-05-15`,
       interactions: [], documents: [], preSalesTimeLogs: [], tasks: []
   },
   {
       id: 'lead_demo_2',
       companyName: 'Stark Industries',
       contactName: 'Tony Stark',
       email: 'tony@stark.com',
       phone: '555-9999',
       city: 'New York',
       country: 'USA',
       role: 'CEO',
       description: 'Iron Man Suit Security Audit',
       value: 85000,
       partnerName: 'AWS',
       manufacturer: 'AWS',
       items: [],
       stage: 'negotiation',
       probability: 80,
       expectedCloseDate: `${CURRENT_YEAR}-${String(CURRENT_MONTH + 2).padStart(2,'0')}-28`,
       interactions: [], documents: [], preSalesTimeLogs: [], tasks: []
   },
   {
       id: 'lead_demo_3',
       companyName: 'Wayne Enterprises',
       contactName: 'Lucius Fox',
       email: 'lucius@wayne.com',
       phone: '555-6666',
       city: 'Gotham',
       country: 'USA',
       role: 'CTO',
       description: 'Batcave Network Infrastructure',
       value: 250000,
       partnerName: 'Palo Alto',
       manufacturer: 'Palo Alto',
       items: [],
       stage: 'closed-lost',
       probability: 0,
       expectedCloseDate: `${CURRENT_YEAR}-03-10`,
       interactions: [], documents: [], preSalesTimeLogs: [], tasks: [],
       deleted: true
   },
];

const INITIAL_PROJECTS: Project[] = [
    {
        id: 'proj_demo_1',
        leadId: 'lead_demo_1',
        name: 'IMPLEMENTATION: Cyberdyne Systems',
        clientName: 'Cyberdyne Systems',
        type: 'implementation',
        startDate: new Date(`${CURRENT_YEAR}-06-01`).toISOString(),
        status: 'active',
        totalBudgetHours: 63,
        team: ['Sarah Connor'],
        tasks: [
            { id: 'task_1', title: 'Phase 1: Kick Off', assignee: 'Sarah Connor', status: 'done', estimatedHours: 4, loggedHours: 4, subtasks: [] },
            { id: 'task_2', title: 'Phase 2: Initial Config', assignee: 'Sarah Connor', status: 'in-progress', estimatedHours: 16, loggedHours: 8, subtasks: [] },
            { id: 'task_3', title: 'Phase 3: SAST', assignee: 'Sarah Connor', status: 'todo', estimatedHours: 12, loggedHours: 0, subtasks: [] },
        ],
        timeLogs: [
            { id: 'log_1', taskId: 'task_1', consultantName: 'Sarah Connor', consultantId: 'u2', hours: 4, date: `${CURRENT_YEAR}-06-05`, description: 'Kickoff session completed', status: 'approved', approvedRate: 90, approvedCost: 360 },
            { id: 'log_2', taskId: 'task_2', consultantName: 'Sarah Connor', consultantId: 'u2', hours: 8, date: `${CURRENT_YEAR}-06-15`, description: 'Initial config in progress', status: 'pending' },
        ],
        payments: [{ id: 'pmt_1', amount: 60000, date: `${CURRENT_YEAR}-06-01`, reference: 'INV-001 Initial Payment' }],
        factoryCommissionRate: 10,
    }
];

const INITIAL_TRANSACTIONS: Transaction[] = [
    { id: 'tx1', title: 'Cyberdyne Implementation Payment', amount: 60000, date: `${CURRENT_YEAR}-06-01`, type: 'income', category: 'other', projectId: 'proj_demo_1', description: 'Initial payment for Skynet project' },
    { id: 'tx2', title: 'AWS Cloud Hosting', amount: 1200, date: `${CURRENT_YEAR}-06-15`, type: 'expense', category: 'software', description: 'Monthly cloud hosting' },
    { id: 'tx3', title: 'Office Supplies', amount: 350, date: `${CURRENT_YEAR}-06-20`, type: 'expense', category: 'office', description: 'Printer ink and paper' },
    { id: 'tx4', title: 'Stark Industries Consulting', amount: 15000, date: `${CURRENT_YEAR}-07-01`, type: 'income', category: 'other', leadId: 'lead_demo_2', description: 'Pre-sales consulting fee' },
    { id: 'tx5', title: 'Client Dinner', amount: 450, date: `${CURRENT_YEAR}-10-15`, type: 'expense', category: 'marketing', leadId: 'lead_demo_3', description: 'Executive dinner with Lucius Fox' },
];

// ── Shared UI helpers ────────────────────────────────────────────────────────

const NavLink: React.FC<{ to: string; icon: React.ElementType; label: string }> = ({ to, icon: Icon, label }) => {
  const location = useLocation();
  const { setIsMobileMenuOpen } = useUIStore();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
  return (
    <Link
      to={to}
      onClick={() => setIsMobileMenuOpen(false)}
      style={isActive ? { background: 'linear-gradient(135deg, #410074 0%, #25024C 100%)' } : {}}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
        isActive
          ? 'text-white shadow-lg shadow-purple-900/40'
          : 'text-bm-200 hover:text-white hover:bg-bm-800'
      }`}
    >
      <Icon size={20} className={isActive ? 'text-purple-200' : ''} />
      <span className="font-medium">{label}</span>
      {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-300" />}
    </Link>
  );
};

const LoadingSpinner = () => (
    <div className="h-full w-full flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3 text-gray-400">
            <Loader2 size={32} className="animate-spin text-blue-500" />
            <p className="text-sm font-medium">Loading Module...</p>
        </div>
    </div>
);

// ── Sidebar — subscribes only to UIStore + AuthStore ────────────────────────

const Sidebar: React.FC<{ restoreInputRef: React.RefObject<HTMLInputElement> }> = ({ restoreInputRef }) => {
    const { currentUser, setCurrentUser, setIsAuthenticated } = useAuthStore();
    const { dbConnected, pendingWrites, isMobileMenuOpen, setIsMobileMenuOpen } = useUIStore();


    if (!currentUser) return null;

    const handleLogout = () => {
        setIsAuthenticated(false);
        setCurrentUser(null);
    };

    const handleDownloadBackup = async () => {
        try {
            const data = await backupLocalData();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `crm_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            alert('Error generating backup. Please try again.');
            console.error('[CRM] Backup error:', e);
        }
    };

    const LOGO_URL = "/blackmoon-logo.svg";

    return (
        <>
        {/* Mobile overlay backdrop */}
        {isMobileMenuOpen && (
            <div
                className="fixed inset-0 z-30 bg-black/50 md:hidden"
                onClick={() => setIsMobileMenuOpen(false)}
            />
        )}
        <aside
            className={`fixed inset-y-0 left-0 z-40 w-72 text-white flex flex-col shadow-2xl transition-transform duration-300 ease-in-out md:relative md:w-64 md:shrink-0 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
            style={{ background: '#090812' }}
        >
            <div className="p-6 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(185,183,201,0.1)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-white shadow-md ring-2 ring-purple-500/30">
                    <img src={LOGO_URL} alt="Logo" className="w-full h-full object-cover transform hover:scale-110 transition duration-300" />
                </div>
                <div>
                    <span className="text-base font-bold tracking-tight leading-tight text-white">CRM BLACKMOON</span>
                    <div className="w-8 h-0.5 mt-1 rounded-full" style={{ background: 'linear-gradient(90deg, #410074, #B9B7C9)' }} />
                </div>
            </div>
            <div className="px-6 pb-3">
                {dbConnected ? (
                    <div className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded" style={{ background: 'rgba(65,0,116,0.3)', color: '#E5E4F0', border: '1px solid rgba(185,183,201,0.2)' }}>
                        <HardDrive size={10} className="animate-pulse" style={{ color: '#B9B7C9' }} />
                        <span>MongoDB Connected</span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[10px] bg-yellow-900/50 text-yellow-200 px-3 py-1.5 rounded border border-yellow-800">
                            <WifiOff size={10} className="text-yellow-400" />
                            <span>Offline — Local Cache</span>
                        </div>
                        {pendingWrites > 0 && (
                            <div className="flex items-center gap-2 text-[10px] bg-red-900/50 text-red-200 px-3 py-1.5 rounded border border-red-800">
                                <Loader2 size={10} className="animate-spin text-red-400" />
                                <span>{pendingWrites} pending sync</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto custom-scrollbar">
                {currentUser.permissions.dashboard && <NavLink to="/" icon={LayoutDashboard} label="Dashboard" />}
                {currentUser.permissions.crm && (
                    <>
                        <NavLink to="/crm" icon={Users} label="CRM & Sales" />
                        <NavLink to="/contacts" icon={ContactIcon} label="Contacts" />
                        <NavLink to="/accounts" icon={Building2} label="Accounts" />
                        <NavLink to="/sales-tasks" icon={CheckSquare} label="Sales Tasks" />
                    </>
                )}
                {currentUser.permissions.projects && <NavLink to="/projects" icon={FolderKanban} label="Projects" />}
                {currentUser.permissions.portal && (
                    <div className="pt-4 mt-4" style={{ borderTop: '1px solid rgba(185,183,201,0.1)' }}>
                        <p className="px-4 text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#B9B7C9' }}>My Workspace</p>
                        <NavLink to="/portal" icon={Briefcase} label="Consultant Portal" />
                    </div>
                )}
                {currentUser.permissions.admin && (
                    <div className="pt-4 mt-4" style={{ borderTop: '1px solid rgba(185,183,201,0.1)' }}>
                        <p className="px-4 text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#B9B7C9' }}>System</p>
                        <NavLink to="/pipeline-analytics" icon={TrendingUp} label="Analytics" />
                        <NavLink to="/profitability" icon={TrendingUp} label="Profitability" />
                        <NavLink to="/commissions" icon={Split} label="Commissions" />
                        <NavLink to="/balance-sheet" icon={Scale} label="Balance Sheet" />
                        <NavLink to="/financial-balance" icon={BarChart2} label="Financial Balance" />
                        <NavLink to="/invoices" icon={Receipt} label="Invoices" />
                        <NavLink to="/finance" icon={DollarSign} label="Finance" />
                        <NavLink to="/approval" icon={Clock} label="Time Approval" />
                        <NavLink to="/admin" icon={Shield} label="Administration" />
                        <NavLink to="/notification-settings" icon={Bell} label="Notifications" />
                        <NavLink to="/api-keys" icon={KeyRound} label="API Keys" />
                        <NavLink to="/webhooks" icon={Webhook} label="Webhooks" />
                        <NavLink to="/custom-fields" icon={Settings2} label="Custom Fields" />
                        <NavLink to="/automations" icon={Zap} label="Automations" />
                        <NavLink to="/pipelines" icon={GitBranch} label="Pipelines" />
                        <NavLink to="/proposal-templates" icon={FileText} label="Proposal Templates" />
                        <NavLink to="/email-templates"   icon={Mail}     label="Email Templates" />
                        <NavLink to="/templates" icon={ListPlus} label="Task Templates" />
                        <NavLink to="/skus" icon={Package} label="Products & SKUs" />
                    </div>
                )}
            </nav>
            <div className="p-4 space-y-2" style={{ borderTop: '1px solid rgba(185,183,201,0.1)' }}>
                {currentUser.role === 'admin' && (
                    <div className="mb-2 pb-2 space-y-1" style={{ borderBottom: '1px solid rgba(185,183,201,0.1)' }}>
                        <button onClick={handleDownloadBackup} className="flex items-center gap-3 text-xs hover:text-white w-full px-4 py-2 transition-colors rounded-lg" style={{ color: '#B9B7C9' }} onMouseEnter={e => (e.currentTarget.style.background='#0F0326')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                            <Download size={14} /><span>Backup Data</span>
                        </button>
                        <input type="file" ref={restoreInputRef} className="hidden" accept=".json" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                const success = restoreLocalData(event.target?.result as string);
                                if (success) {
                                    alert('System successfully restored from backup! The page will now refresh.');
                                    window.location.reload();
                                }
                            };
                            reader.readAsText(file);
                            e.target.value = '';
                        }} />
                        <button onClick={() => restoreInputRef.current?.click()} className="flex items-center gap-3 text-xs text-green-400 hover:text-white w-full px-4 py-2 transition-colors rounded-lg" onMouseEnter={e => (e.currentTarget.style.background='#0F0326')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                            <Upload size={14} /><span>Restore Data</span>
                        </button>
                        <button
                            onClick={() => seedDatabase(INITIAL_USERS, INITIAL_LEADS, INITIAL_PROJECTS, INITIAL_TEMPLATES, INITIAL_SKUS, INITIAL_TRANSACTIONS, [])}
                            className="flex items-center gap-3 text-xs text-yellow-500 hover:text-white w-full px-4 py-2 transition-colors rounded-lg"
                            onMouseEnter={e => (e.currentTarget.style.background='#0F0326')}
                            onMouseLeave={e => (e.currentTarget.style.background='')}
                        >
                            <Database size={14} /><span>Reset to Defaults</span>
                        </button>
                    </div>
                )}
                <button onClick={handleLogout} className="flex items-center gap-3 hover:text-white w-full px-4 py-2 transition-colors rounded-lg" style={{ color: '#B9B7C9' }} onMouseEnter={e => (e.currentTarget.style.background='#0F0326')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <LogOut size={18} /><span>Sign Out</span>
                </button>
            </div>
        </aside>
        </>
    );
};

// ── Header — subscribes only to UIStore + AuthStore ──────────────────────────

const Header: React.FC = () => {
    const { currentUser } = useAuthStore();
    const { unreadNotifications, setIsCommandPaletteOpen, isMobileMenuOpen, setIsMobileMenuOpen } = useUIStore();
    const { leads, projects } = useDataStore();

    if (!currentUser) return null;

    return (
        <header className="h-14 md:h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-2 md:gap-3">
                <button
                    className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 -ml-1"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    aria-label="Toggle menu"
                >
                    {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
                <span className="hidden md:block text-gray-400 text-sm font-medium">Workspace</span>
                <span className="hidden md:block text-gray-300">/</span>
                <div className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full font-medium border border-gray-200">
                    {currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)} View
                </div>
            </div>
            <div className="flex items-center gap-3 md:gap-6">
                <button
                    onClick={() => setIsCommandPaletteOpen(true)}
                    title="Search (⌘K)"
                    className="flex items-center gap-2 px-2 md:px-3 py-1.5 text-sm text-gray-400 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 hover:text-gray-600 transition-colors"
                >
                    <Search size={14} />
                    <span className="hidden md:inline">Search</span>
                    <kbd className="hidden md:inline text-xs bg-white border border-gray-200 rounded px-1 py-0.5 text-gray-400">⌘K</kbd>
                </button>
                <div className="relative">
                    <ErrorBoundary moduleName="Notifications">
                        <Suspense fallback={<div className="w-6 h-6 rounded-full bg-gray-100 animate-pulse" />}>
                            <NotificationCenter leads={leads} projects={projects} />
                        </Suspense>
                    </ErrorBoundary>
                    {unreadNotifications > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center pointer-events-none">
                            {unreadNotifications > 9 ? '9+' : unreadNotifications}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 md:gap-3 border-l border-gray-200 pl-3 md:pl-6 h-8">
                    <div className="w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center font-bold text-sm shadow-sm text-white" style={{ background: 'linear-gradient(135deg, #410074 0%, #25024C 100%)', border: '2px solid #B9B7C9' }}>
                        {currentUser.name.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                    <div className="hidden sm:block">
                        <h2 className="text-gray-900 text-sm font-bold leading-none">{currentUser.name}</h2>
                        <p className="text-gray-400 text-xs capitalize mt-1">{currentUser.role}</p>
                    </div>
                </div>
            </div>
        </header>
    );
};

// ── AppRoutes — subscribes to DataStore, renders all routes with stable callbacks ──

const AppRoutes: React.FC = () => {
    const {
        leads, projects, users, taskTemplates, skuCatalog,
        transactions, contacts, goals,
        balanceSheetAccounts, balanceSheetNotes,
        accounts, automationRules, pipelines,
    } = useDataStore();
    const { currentUser } = useAuthStore();

    // Prevent duplicate lead update when converting to multiple projects
    const convertedLeadIds = useRef<Set<string>>(new Set());

    if (!currentUser) return null;

    // ── Stable CRUD callbacks (won't cause child re-renders on unrelated state changes) ──
    const handleUpdateGoal      = useCallback((year: number, amount: number) => updateDocument('goals', '', { [year]: amount }), []);
    const handleUpdateLead      = useCallback((l: Lead) => updateDocument('leads', l.id, l), []);
    const handleAddLead         = useCallback((l: Lead) => addDocument('leads', l), []);
    const handleDeleteLead      = useCallback((id: string) => updateDocument('leads', id, { deleted: true }), []);
    const handleRestoreLead     = useCallback((id: string) => updateDocument('leads', id, { deleted: false }), []);
    const handlePermanentDelete = useCallback((id: string) => deleteDocument('leads', id), []);
    const handleImportLeads     = useCallback(async (newLeads: Lead[], updatedLeads: Lead[]) => {
        const all = [...newLeads, ...updatedLeads];
        if (all.length === 0) return;
        try {
            const res = await fetch('/api/leads/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ leads: all }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Import failed');
            await refreshCollection('leads');
        } catch (err) {
            console.error('[Import]', err);
            // Fallback: individual upserts
            newLeads.forEach(l => addDocument('leads', l));
            updatedLeads.forEach(l => updateDocument('leads', l.id, l));
        }
    }, []);
    const handleAddTransaction  = useCallback((t: Transaction) => addDocument('transactions', t), []);
    const handleDeleteTransaction = useCallback((id: string) => deleteDocument('transactions', id), []);
    const handleUpdateTransaction = useCallback((t: Transaction) => updateDocument('transactions', t.id, t), []);
    const handleAddPreSalesLog  = useCallback((id: string, log: TimeLog) => {
        const lead = leads.find(l => l.id === id);
        if (lead) updateDocument('leads', id, { preSalesTimeLogs: [...(lead.preSalesTimeLogs || []), log] });
    }, [leads]);
    const handleAddContact        = useCallback((c: Contact) => addDocument('contacts', c), []);
    const handleUpdateContact     = useCallback((c: Contact) => updateDocument('contacts', c.id, c), []);
    const handleDeleteContact     = useCallback((id: string) => deleteDocument('contacts', id), []);
    const handleAddCrmAccount     = useCallback((a: Account) => addDocument('accounts', a), []);
    const handleUpdateCrmAccount  = useCallback((a: Account) => updateDocument('accounts', a.id, a), []);
    const handleDeleteCrmAccount  = useCallback((id: string) => deleteDocument('accounts', id), []);
    const handleAddAutomation     = useCallback((r: AutomationRule) => addDocument('automations', r), []);
    const handleUpdateAutomation  = useCallback((r: AutomationRule) => updateDocument('automations', r.id, r), []);
    const handleDeleteAutomation  = useCallback((id: string) => deleteDocument('automations', id), []);
    const handleAddPipeline       = useCallback((p: Pipeline) => addDocument('pipelines', p), []);
    const handleUpdatePipeline    = useCallback((p: Pipeline) => updateDocument('pipelines', p.id, p), []);
    const handleDeletePipeline    = useCallback((id: string) => deleteDocument('pipelines', id), []);
    const handleUpdateProject   = useCallback((p: Project) => updateDocument('projects', p.id, p), []);
    const handleAddProject      = useCallback((p: Project) => addDocument('projects', p), []);
    const handleDeleteProject   = useCallback((id: string) => deleteDocument('projects', id), []);
    const handleCloseProject    = useCallback((p: Project) => {
        updateDocument('projects', p.id, { ...p, status: 'completed' });
        if (p.leadId) updateDocument('leads', p.leadId, { stage: 'project-delivered' });
    }, []);
    const handleUpdateUser      = useCallback((u: User) => {
        const oldName = users.find(old => old.id === u.id)?.name || '';
        updateUserAndCascade(u, oldName);
    }, [users]);
    const handleAddUser         = useCallback((u: User) => addDocument('users', u), []);
    const handleDeleteUser      = useCallback((id: string) => deleteDocument('users', id), []);
    const handleAddTemplate     = useCallback((t: TaskTemplate) => addDocument('templates', t), []);
    const handleUpdateTemplate  = useCallback((t: TaskTemplate) => updateDocument('templates', t.id, t), []);
    const handleDeleteTemplate  = useCallback((id: string) => deleteDocument('templates', id), []);
    const handleAddSKU          = useCallback((s: SKUItem) => addDocument('skus', s), []);
    const handleUpdateSKU       = useCallback((s: SKUItem) => updateDocument('skus', s.id, s), []);
    const handleDeleteSKU       = useCallback((id: string) => deleteDocument('skus', id), []);
    const handleAddAccount      = useCallback((a: BalanceSheetAccount) => addDocument('balanceSheetAccounts', a), []);
    const handleUpdateAccount   = useCallback((a: BalanceSheetAccount) => updateDocument('balanceSheetAccounts', a.id, a), []);
    const handleDeleteAccount   = useCallback((id: string) => deleteDocument('balanceSheetAccounts', id), []);
    const handleAddNote         = useCallback((n: BalanceSheetNote) => addDocument('balanceSheetNotes', n), []);
    const handleUpdateNote      = useCallback((n: BalanceSheetNote) => updateDocument('balanceSheetNotes', n.id, n), []);
    const handleDeleteNote      = useCallback((id: string) => deleteDocument('balanceSheetNotes', id), []);
    const handleRefreshFinancials = useCallback(async () => {
        await Promise.all([refreshCollection('leads'), refreshCollection('projects'), refreshCollection('transactions')]);
    }, []);

    // Lead → Project conversion
    const handleLeadToProject = useCallback((
        lead: Lead, consultant: string, type: ProjectType,
        templateId?: string, deposit?: number,
        contractStartDate?: string, contractEndDate?: string, packHours?: number,
        sourceItem?: LineItem,
    ) => {
        const template = taskTemplates.find(t => t.id === templateId);
        const projectTasks: Task[] = template ? template.items.map((ti, idx) => ({
            id: `task_init_${idx}_${Date.now()}`,
            title: ti.title,
            assignee: consultant,
            status: 'todo',
            estimatedHours: ti.defaultHours,
            loggedHours: 0,
            subtasks: (ti.subtasks || []).map((st, sidx) => ({ id: `st_init_${idx}_${sidx}`, title: st, completed: false }))
        })) : [];

        // Calculate contract value for this project type from lead items
        // Special case: if sourceItem is provided (hours_pack by item), use its value
        let typeValue: number;
        let projectName: string;
        let projectItems: LineItem[] = [];
        let projectBudgetedCost: number | undefined;

        if (sourceItem) {
            // For individual hours_pack items
            typeValue = sourceItem.total;
            projectName = `HOURS_PACK: ${lead.companyName} — ${sourceItem.description}`;
            projectItems = [sourceItem];
            // Calculate budgetedCost for this specific hours_pack item from costingItems
            const costingItem = (lead as any).costingItems?.find((ci: any) => ci.id === sourceItem.id);
            projectBudgetedCost = costingItem?.baseCost || sourceItem.unitCost || 0;
        } else {
            // For type-based projects (implementation, license, support)
            const typeCategories: Record<ProjectType, string[]> = {
                'implementation': ['implementation'],
                'license': ['license'],
                'support': ['vendor_support', 'blackmoon_support'],
                'hours_pack': ['hours_pack'],
                'consulting': ['consulting'],
            };
            const matchingCategories = typeCategories[type] || [];
            const matchingItems = (lead.items || []).filter(i => matchingCategories.includes(i.category));
            projectItems = matchingItems;
            typeValue = matchingItems.length
                ? matchingItems
                    .reduce((sum, item) => {
                        if (item.category === 'license') {
                            return sum + (item.unitPrice * item.quantity - item.unitCost * item.quantity);
                        }
                        return sum + item.total;
                    }, 0)
                : 0;
            projectName = `${type.toUpperCase()}: ${lead.companyName}`;
            // Calculate budgetedCost for this type's items from costingItems
            projectBudgetedCost = matchingItems.reduce((sum, item) => {
                const costingItem = (lead as any).costingItems?.find((ci: any) => ci.id === item.id);
                return sum + (costingItem?.baseCost || item.unitCost || 0);
            }, 0) || undefined;
        }

        // Only use deposit if explicitly provided (actual initial payment from client)
        // Do not auto-create a payment for the contract value — payments are tracked separately
        const initialPaymentAmount = deposit || 0;

        const newProject: Project = {
            id: `proj_${Date.now()}_${type}${sourceItem ? `_${sourceItem.id}` : ''}`,
            leadId: lead.id,
            name: projectName,
            clientName: lead.companyName,
            type,
            value: typeValue,  // Store the contract value for later reference in reports
            budgetedCost: projectBudgetedCost,  // Calculate specific budgetedCost for this project based on its items
            items: projectItems,  // Include the line items that make up this project
            startDate: new Date().toISOString(),
            status: 'active',
            totalBudgetHours: type === 'hours_pack' && packHours
                ? packHours
                : projectTasks.reduce((acc, t) => acc + t.estimatedHours, 0) || 40,
            team: [consultant],
            tasks: projectTasks,
            timeLogs: [],
            tickets: [],
            payments: initialPaymentAmount > 0
                ? [{ id: `pmt_init_${Date.now()}`, amount: initialPaymentAmount, date: new Date().toISOString(), reference: deposit ? 'Initial Deposit' : 'Contract Value' }]
                : [],
            factoryCommissionRate: 10,
            ...((type === 'support' || type === 'hours_pack') && contractStartDate ? { contractStartDate } : {}),
            ...((type === 'support' || type === 'hours_pack') && contractEndDate  ? { contractEndDate }  : {}),
        };

        addDocument('projects', newProject);

        // Only update the lead stage once, even if this function is called multiple times
        if (!convertedLeadIds.current.has(lead.id)) {
            convertedLeadIds.current.add(lead.id);
            updateDocument('leads', lead.id, { stage: 'closed-won', closedValue: lead.closedValue || lead.value, probability: 100 });
            alert(`Projects for ${lead.companyName} created successfully!`);
        }
    }, [taskTemplates]);

    const perm = currentUser.permissions;
    const isAdmin = currentUser.role === 'admin';

    return (
        <Suspense fallback={<LoadingSpinner />}>
            <Routes>
                {/* Dashboard */}
                <Route path="/" element={
                    perm.dashboard
                        ? <ErrorBoundary moduleName="Dashboard"><Dashboard leads={leads} projects={projects} goals={goals} onUpdateGoal={handleUpdateGoal} users={users} currentUser={currentUser} /></ErrorBoundary>
                        : <Navigate to="/portal" replace />
                } />

                {/* CRM & Sales */}
                <Route path="/crm" element={
                    perm.crm
                        ? <ErrorBoundary moduleName="CRM Pipeline"><CRMPipeline leads={leads} templates={taskTemplates} skuCatalog={skuCatalog} updateLead={handleUpdateLead} onAddLead={handleAddLead} onImportLeads={handleImportLeads} onDeleteLead={handleDeleteLead} onRestoreLead={handleRestoreLead} onPermanentDeleteLead={handlePermanentDelete} onConvertToProject={handleLeadToProject} transactions={transactions} onAddTransaction={handleAddTransaction} onAddPreSalesLog={handleAddPreSalesLog} users={users} currentUser={currentUser} contacts={contacts} onAddContact={handleAddContact} pipelines={pipelines} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/contacts" element={
                    perm.crm
                        ? <ErrorBoundary moduleName="Contacts"><ContactManager contacts={contacts} onAddContact={handleAddContact} onUpdateContact={handleUpdateContact} onDeleteContact={handleDeleteContact} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/accounts" element={
                    perm.crm
                        ? <ErrorBoundary moduleName="Accounts"><AccountManager accounts={accounts} contacts={contacts} leads={leads} onAdd={handleAddCrmAccount} onUpdate={handleUpdateCrmAccount} onDelete={handleDeleteCrmAccount} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/sales-tasks" element={
                    perm.crm
                        ? <ErrorBoundary moduleName="Sales Tasks"><SalesTaskManager leads={leads} users={users} updateLead={handleUpdateLead} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />

                {/* Projects */}
                <Route path="/projects" element={
                    perm.projects
                        ? <ErrorBoundary moduleName="Project Manager"><ProjectManager projects={projects} updateProject={handleUpdateProject} users={users} onDeleteProject={handleDeleteProject} onCloseProject={handleCloseProject} onAddProject={handleAddProject} isAdmin={isAdmin} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />

                {/* Portal */}
                <Route path="/portal" element={
                    perm.portal
                        ? <ErrorBoundary moduleName="Consultant Portal"><ConsultantPortal projects={projects} updateProject={handleUpdateProject} currentUser={currentUser} users={users} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />

                {/* Admin & System */}
                <Route path="/finance" element={
                    perm.admin
                        ? <ErrorBoundary moduleName="Finance Manager"><FinanceManager projects={projects} users={users} leads={leads} transactions={transactions} onAddTransaction={handleAddTransaction} onDeleteTransaction={handleDeleteTransaction} onUpdateTransaction={handleUpdateTransaction} onUpdateProject={handleUpdateProject} onUpdateUser={(u) => updateDocument('users', u.id, u)} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/profitability" element={
                    perm.admin
                        ? <ErrorBoundary moduleName="Profitability"><ProfitabilityReport projects={projects} leads={leads} transactions={transactions} users={users} onDeleteProject={handleDeleteProject} onUpdateProject={handleUpdateProject} onRefresh={handleRefreshFinancials} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/pipeline-analytics" element={
                    perm.admin
                        ? <ErrorBoundary moduleName="Pipeline Analytics"><PipelineAnalytics /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/commissions" element={
                    perm.admin
                        ? <ErrorBoundary moduleName="Commissions"><CommissionsManager projects={projects} leads={leads} transactions={transactions} users={users} onAddTransaction={handleAddTransaction} onDeleteTransaction={handleDeleteTransaction} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/invoices" element={
                    perm.admin
                        ? <ErrorBoundary moduleName="Invoices"><InvoiceManager /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/financial-balance" element={
                    perm.admin
                        ? <ErrorBoundary moduleName="Financial Balance"><FinancialBalanceReport /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/balance-sheet" element={
                    perm.admin
                        ? <ErrorBoundary moduleName="Balance Sheet"><BalanceSheet accounts={balanceSheetAccounts} notes={balanceSheetNotes} onAddAccount={handleAddAccount} onUpdateAccount={handleUpdateAccount} onDeleteAccount={handleDeleteAccount} onAddNote={handleAddNote} onUpdateNote={handleUpdateNote} onDeleteNote={handleDeleteNote} companyName="Blackmoon Consulting" /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/approval" element={
                    perm.admin
                        ? <ErrorBoundary moduleName="Time Approval"><TimeApprovalManager projects={projects} users={users} onUpdateProject={handleUpdateProject} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/admin" element={
                    perm.admin
                        ? <ErrorBoundary moduleName="User Management"><UserManagement users={users} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/notification-settings" element={perm.admin ? <ErrorBoundary moduleName="Notification Settings"><NotificationSettings /></ErrorBoundary> : <Navigate to="/" />} />
                <Route path="/api-keys"     element={perm.admin ? <ErrorBoundary moduleName="API Keys"><ApiKeysManager /></ErrorBoundary> : <Navigate to="/" />} />
                <Route path="/webhooks"     element={perm.admin ? <ErrorBoundary moduleName="Webhooks"><WebhookManager /></ErrorBoundary> : <Navigate to="/" />} />
                <Route path="/custom-fields" element={perm.admin ? <ErrorBoundary moduleName="Custom Fields"><CustomFieldsManager /></ErrorBoundary> : <Navigate to="/" />} />
                <Route path="/automations"  element={perm.admin ? <ErrorBoundary moduleName="Automations"><AutomationManager rules={automationRules} onAdd={handleAddAutomation} onUpdate={handleUpdateAutomation} onDelete={handleDeleteAutomation} /></ErrorBoundary> : <Navigate to="/" />} />
                <Route path="/pipelines"   element={perm.admin ? <ErrorBoundary moduleName="Pipelines"><PipelineManager pipelines={pipelines} onAdd={handleAddPipeline} onUpdate={handleUpdatePipeline} onDelete={handleDeletePipeline} /></ErrorBoundary> : <Navigate to="/" />} />
                <Route path="/proposal-templates" element={perm.admin ? <ErrorBoundary moduleName="Proposal Templates"><ProposalTemplateManager /></ErrorBoundary> : <Navigate to="/" />} />
                <Route path="/email-templates"   element={perm.admin ? <ErrorBoundary moduleName="Email Templates"><EmailTemplateManager /></ErrorBoundary> : <Navigate to="/" />} />
                <Route path="/templates"    element={
                    perm.admin
                        ? <ErrorBoundary moduleName="Templates"><TemplateManager templates={taskTemplates} onAddTemplate={handleAddTemplate} onUpdateTemplate={handleUpdateTemplate} onDeleteTemplate={handleDeleteTemplate} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />
                <Route path="/skus"         element={
                    perm.admin
                        ? <ErrorBoundary moduleName="SKU Catalog"><SKUManager skus={skuCatalog} onAddSKU={handleAddSKU} onUpdateSKU={handleUpdateSKU} onDeleteSKU={handleDeleteSKU} /></ErrorBoundary>
                        : <Navigate to="/" />
                } />

                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </Suspense>
    );
};

// ── App — orchestrates store subscriptions and auth, renders shell ────────────

const App: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const restoreInputRef = useRef<HTMLInputElement>(null);

    // Auth
    const { isAuthenticated, currentUser, setCurrentUser, setIsAuthenticated } = useAuthStore();

    // Data store setters (stable Zustand references — safe in dependency arrays)
    const setLeads              = useDataStore(s => s.setLeads);
    const setProjects           = useDataStore(s => s.setProjects);
    const setUsers              = useDataStore(s => s.setUsers);
    const setTaskTemplates      = useDataStore(s => s.setTaskTemplates);
    const setSkuCatalog         = useDataStore(s => s.setSkuCatalog);
    const setTransactions       = useDataStore(s => s.setTransactions);
    const setContacts           = useDataStore(s => s.setContacts);
    const setGoals              = useDataStore(s => s.setGoals);
    const setBalanceSheetAccounts = useDataStore(s => s.setBalanceSheetAccounts);
    const setBalanceSheetNotes  = useDataStore(s => s.setBalanceSheetNotes);
    const setAccounts           = useDataStore(s => s.setAccounts);
    const setAutomationRules    = useDataStore(s => s.setAutomationRules);
    const setPipelines          = useDataStore(s => s.setPipelines);
    const users                 = useDataStore(s => s.users); // needed for Login

    // UI store
    const { setDbConnected, setPendingWrites, setIsCommandPaletteOpen, isCommandPaletteOpen, setUnreadNotifications } = useUIStore();

    // 1. Seed DB and start subscriptions
    useEffect(() => {
        localStorage.removeItem('CRM_SESSION_USER');
        initializeLocalStore({
            leads: INITIAL_LEADS, projects: INITIAL_PROJECTS, users: INITIAL_USERS,
            templates: INITIAL_TEMPLATES, skus: INITIAL_SKUS, transactions: INITIAL_TRANSACTIONS,
            contacts: [], goals: { [CURRENT_YEAR]: 1000000, [CURRENT_YEAR + 1]: 1200000 }
        });
        setLoading(false);
    }, []);

    useEffect(() => {
        // Zustand setters are stable — this effect runs only once
        const unsubs = [
            subscribeToCollection<Lead[]>('leads',                 setLeads),
            subscribeToCollection<Project[]>('projects',           setProjects),
            subscribeToCollection<User[]>('users',                 setUsers),
            subscribeToCollection<TaskTemplate[]>('templates',     setTaskTemplates),
            subscribeToCollection<SKUItem[]>('skus',               setSkuCatalog),
            subscribeToCollection<Transaction[]>('transactions',   setTransactions),
            subscribeToCollection<Contact[]>('contacts',           setContacts),
            subscribeToCollection<Record<number,number>>('goals',  setGoals),
            subscribeToCollection<BalanceSheetAccount[]>('balanceSheetAccounts', setBalanceSheetAccounts),
            subscribeToCollection<BalanceSheetNote[]>('balanceSheetNotes',       setBalanceSheetNotes),
            subscribeToCollection<Account[]>('accounts',           setAccounts),
            subscribeToCollection<AutomationRule[]>('automations', setAutomationRules),
            subscribeToCollection<Pipeline[]>('pipelines',         setPipelines),
            onConnectionChange((connected, pending) => { setDbConnected(connected); setPendingWrites(pending); }),
        ];
        return () => unsubs.forEach(fn => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 2. Cmd+K → command palette
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setIsCommandPaletteOpen(!useUIStore.getState().isCommandPaletteOpen); }
            if (e.key === 'Escape') setIsCommandPaletteOpen(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [setIsCommandPaletteOpen]);

    // 3. Poll unread notification count every 60 s
    useEffect(() => {
        const poll = async () => {
            try {
                const res = await fetch('/api/notifications/unread-count');
                if (res.ok) { const d = await res.json(); setUnreadNotifications(d.count ?? 0); }
            } catch { /* offline */ }
        };
        poll();
        const iv = setInterval(poll, 60_000);
        return () => clearInterval(iv);
    }, [setUnreadNotifications]);

    const handleLogin = useCallback((user: User) => {
        setCurrentUser(user);
        setIsAuthenticated(true);
    }, [setCurrentUser, setIsAuthenticated]);

    if (loading) return <div className="h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-medium">Loading CRM...</div>;
    if (!isAuthenticated || !currentUser) return <Login users={users} onLogin={handleLogin} />;

    return (
        <Router>
            <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
                <Sidebar restoreInputRef={restoreInputRef} />
                <main className="flex-1 min-w-0 overflow-auto bg-gray-50">
                    <Header />
                    <div className="p-4 md:p-8 h-[calc(100vh-56px)] md:h-[calc(100vh-64px)] overflow-y-auto">
                        <AppRoutes />
                    </div>
                </main>
            </div>
            {isCommandPaletteOpen && (
                <ErrorBoundary moduleName="Command Palette">
                    <Suspense fallback={null}>
                        <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} />
                    </Suspense>
                </ErrorBoundary>
            )}
            <ToastContainer />
        </Router>
    );
};

export default App;
