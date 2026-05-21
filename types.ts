
/**
 * ==================================================================================
 * 🗄️ DATABASE SCHEMA MAPPING GUIDE
 * ==================================================================================
 * 
 * This file defines the TypeScript interfaces used in the Frontend.
 * Below are recommendations on how to map these to a SQL (Postgres/MySQL) or NoSQL (Mongo/Firebase) database.
 */

/**
 * TABLE: interactions (or stored as JSONB inside 'leads' table)
 * PK: id
 * FK: lead_id (Implicit in context)
 */
export type SalesStage = 'prospect' | 'qualification' | 'presentation' | 'proposal' | 'negotiation' | 'closed-won' | 'project-delivered' | 'closed-lost';

export interface StageHistoryEntry {
  stage: SalesStage;
  enteredAt: string; // ISO datetime
  exitedAt: string | null;
  daysInStage: number;
}

export interface CompletedNextStep {
  text: string;
  dueDate?: string;
  completedAt: string; // ISO datetime
}

export interface Interaction {
  id: string; // UUID
  type: 'email' | 'call' | 'meeting' | 'note'; // ENUM or VARCHAR
  date: string; // DATETIME or ISO String
  notes: string; // TEXT
}

// ── Account / Company ─────────────────────────────────────────────────────────
export interface Account {
  id: string;
  name: string;
  industry?: string;
  size?: string; // '1-10' | '11-50' | '51-200' | '201-500' | '500+'
  website?: string;
  address?: string;
  notes?: string;
  createdAt?: string;
}

// ── Activity Timeline ─────────────────────────────────────────────────────────
export interface Activity {
  id: string;
  type: 'stage_change' | 'note' | 'email' | 'call' | 'meeting' | 'task';
  note: string;
  date: string; // ISO
  userId: string;
  userName: string;
  entityId: string;
  entityType: 'lead' | 'contact';
  metadata?: Record<string, unknown>;
}

// ── Pipeline ───────────────────────────────────────────────────────────────────
export interface Pipeline {
  id: string;
  name: string;
  color?: string;       // hex, e.g. '#410074'
  description?: string;
  isDefault?: boolean;
  stages?: string[];    // overrides default stage list when set
  createdAt?: string;
}

// ── Automation Rules ──────────────────────────────────────────────────────────
export type AutomationTrigger = 'stage_changed' | 'days_inactive' | 'deal_won' | 'lead_assigned' | 'field_updated';
export type AutomationAction  = 'create_task' | 'send_email' | 'send_webhook' | 'notify' | 'change_field';

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  triggerConfig: Record<string, unknown>; // e.g. { stage: 'proposal', days: 7 }
  action: AutomationAction;
  actionConfig: Record<string, unknown>;  // action-specific payload
  createdAt?: string;
}

/**
 * TABLE: sku_catalog
 * PK: id
 */
export type SKUCategory = 'license' | 'vendor_support' | 'incoda_support' | 'implementation' | 'hours_pack';

export interface SKUItem {
  id: string; // UUID
  code: string; // VARCHAR(50) UNIQUE (e.g., "LIC-001")
  name: string; // VARCHAR(255)
  category: SKUCategory; // ENUM
  basePrice: number; // DECIMAL(10, 2)
  description?: string; // TEXT
}

/**
 * SUB-TABLE: lead_items (or JSONB column in leads)
 * Represents a Quote Line Item.
 */
export interface LineItem {
  id: string;
  category: SKUCategory;
  description: string;
  quantity: number; // INT
  unitCost: number;   // DECIMAL - Cost to the company
  margin: number;     // DECIMAL - Target Margin %
  unitPrice: number;  // DECIMAL - Selling Price
  total: number;      // DECIMAL
  // License-specific fields
  years?: number;        // Number of years for license renewal
  licenseYear?: number;  // Year when the license takes effect (e.g., 2026)
  billingDate?: string;  // Invoice / billing date
  paymentDate?: string;  // Date the client actually paid
}

/**
 * TABLE: time_logs
 * PK: id
 * FK: project_id (via taskId or direct link)
 * FK: lead_id (Optional, for Pre-sales)
 * FK: user_id (Implicit via consultantName, better to add explicit userId in DB)
 */
export interface TimeLog {
  id: string; // UUID
  taskId?: string; // FK -> tasks.id
  subtaskId?: string; // FK -> subtasks.id (for subtask-level hour logging)
  leadId?: string; // FK -> leads.id (Pre-sales logging)
  consultantName: string; // VARCHAR — snapshot of name at log time
  consultantId?: string;  // FK -> users.id — stable reference that survives name changes
  hours: number; // DECIMAL(5, 2)
  date: string; // DATE
  description: string; // TEXT

  // APPROVAL FLOW
  status: 'pending' | 'approved' | 'paid' | 'rejected'; // ENUM
  approvedRate?: number; // DECIMAL - Snapshot of rate at time of approval
  approvedCost?: number; // DECIMAL - Calculated final cost
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  assignees?: string[]; // consultant names assigned to this subtask
  comment?: string;     // instructions / session notes for consultants
}

/**
 * TABLE: tasks
 * PK: id
 * FK: project_id (Usually implicit in parent object, explicit in DB)
 * FK: assignee_id (User)
 */
export interface Task {
  id: string; // UUID
  title: string; // VARCHAR
  assignee: string; // VARCHAR (Should reference Users table)
  status: 'todo' | 'in-progress' | 'done'; // ENUM
  estimatedHours: number; // DECIMAL
  loggedHours: number; // DECIMAL (Computed or Cache Column)
  dueDate?: string; // DATE
  startDate?: string; // DATE
  endDate?: string; // DATE
  subtasks: SubTask[]; // JSONB or separate table 'subtasks'
  priority?: 'low' | 'medium' | 'high'; 
  type?: 'call' | 'email' | 'meeting' | 'todo';
}

/**
 * TABLE: contacts
 * PK: id
 */
export interface Contact {
  id: string; // UUID
  name: string; // VARCHAR
  email: string; // VARCHAR
  phone: string; // VARCHAR
  role: string; // VARCHAR
  companyName: string; // VARCHAR
  notes?: string; // TEXT
  lastContacted?: string; // DATETIME
  accountId?: string; // FK -> accounts.id
  type?: 'client' | 'partner' | 'other'; // contact classification
}

/**
 * TABLE: leads (Opportunities)
 * PK: id
 */
export interface Lead {
  id: string; // UUID
  companyName: string; // VARCHAR
  contactName: string; // VARCHAR
  email: string; // VARCHAR
  phone: string;     
  city: string;      
  country: string;   
  role: string;      
  description?: string;
  projectName?: string;
  manufacturer?: string;
  
  // FINANCIALS
  value: number; // DECIMAL - Estimated Revenue
  closedValue?: number; // DECIMAL - Actual Revenue
  budgetedCost?: number; // DECIMAL - Total cost from costing review (sum of item baseCosts)

  items: LineItem[]; // JSONB or Relation to `lead_items`
  stage: SalesStage; // ENUM / VARCHAR
  probability: number; // INT (0-100)
  expectedCloseDate: string; // DATE
  
  // RELATIONS
  dealType?: 'license' | 'services';
  partnerName?: string;
  accountId?: string; // FK -> accounts.id
  pipelineId?: string; // FK -> pipelines.id
  interactions: Interaction[]; // JSONB or Relation to `interactions`
  documents: string[]; // JSONB (Array of URLs)
  preSalesTimeLogs: TimeLog[]; // Relation to `time_logs` where lead_id is set
  tasks: Task[]; // Relation to `tasks` where lead_id is set
  deleted?: boolean; // BOOLEAN (Soft Delete flag)

  // PIPELINE VELOCITY & NEXT STEP
  stageHistory?: StageHistoryEntry[];
  nextStep?: string;
  nextStepDueDate?: string;
  completedNextSteps?: CompletedNextStep[];

  // Custom fields defined by admin (key → value)
  customData?: Record<string, unknown>;

  // AI Lead Scoring
  aiScore?: number | null;
  aiScoreReason?: string;
  aiNextAction?: string; // AI-suggested next action for this deal

  // WIN / LOSS ANALYSIS
  wonReason?: string;      // Why this deal was won (Best Price | Best Solution | Relationship | References | Speed | Support | Other)
  lostReason?: string;     // Price | Competitor | No Budget | No Decision | Timeline | Other
  lostNote?: string;       // Free-text details on loss
  competitor?: string;     // Competitor that won the deal (if lost)

  // ASSIGNMENT
  assignedTo?: string;     // FK -> users.id
  assignedToName?: string; // Snapshot of name at assignment time

  // Timestamps (set by Mongoose { timestamps: true })
  updatedAt?: string; // ISO — used for optimistic concurrency check
}

/**
 * TABLE: payments
 * PK: id
 * FK: project_id
 */
export interface PaymentRecord {
  id: string;
  amount: number; // DECIMAL
  date: string; // DATE
  reference?: string; // VARCHAR (Invoice # or Trans ID)
}

export type ProjectType = 'implementation' | 'support' | 'consulting' | 'license' | 'hours_pack';

/**
 * TABLE: support_tickets
 * PK: id
 * FK: project_id (Implicit via Project.tickets[])
 */
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketStatus = 'open' | 'in-progress' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;                    // UUID
  receivedDate: string;          // DATE — Date received
  title: string;                 // VARCHAR — short title / subject
  description: string;           // TEXT — Request description
  area: string;                  // VARCHAR — Area (department / team)
  reportedBy: string;            // VARCHAR — User (consultant / contact name)
  outOfScopeReason: string;      // TEXT — Out-of-scope reason / additional support / solution
  status: TicketStatus;          // ENUM — Status
  priority: TicketPriority;      // ENUM
  estimatedHours: number;        // DECIMAL — hours budgeted for this ticket
  hoursLogged: number;           // DECIMAL — total hours across all logs (computed)
  createdAt: string;             // DATETIME
  resolvedAt?: string;           // DATETIME
  timeLogs: TimeLog[];           // Embedded logs for this ticket
}

/**
 * TABLE: manufacturer_tickets
 * PK: id
 * FK: project_id (Implicit via Project.manufacturerTickets[])
 */
export type ManufacturerTicketStatus = 'open' | 'in-progress' | 'waiting-vendor' | 'waiting-us' | 'resolved' | 'closed';
export type ManufacturerTicketCategory = 'bug' | 'feature-request' | 'installation' | 'performance' | 'other';

export interface ManufacturerTicketNote {
  id: string;
  date: string;
  author: string;
  text: string;
}

export interface ManufacturerTicket {
  id: string;
  title: string;
  description: string;
  caseNumber: string;           // Manufacturer's case/ticket reference
  manufacturer: string;         // Manufacturer name
  openedDate: string;           // DATE — when we opened the ticket with the manufacturer
  status: ManufacturerTicketStatus;
  priority: TicketPriority;
  category: ManufacturerTicketCategory;
  notes: ManufacturerTicketNote[];
  resolvedDate?: string;
  resolution?: string;
  createdAt: string;
}

/**
 * TABLE: projects
 * PK: id
 * FK: lead_id (One-to-One usually)
 */
export interface Project {
  id: string; // UUID
  leadId?: string; // FK -> leads.id (optional for admin-created projects)
  name: string;
  clientName: string;
  type: ProjectType;
  startDate: string; // DATE
  status: 'active' | 'completed' | 'on-hold';

  // Support Contract — dates & ticket tracking
  contractStartDate?: string; // DATE — for support / hours_pack projects
  contractEndDate?: string;   // DATE — for support / hours_pack projects
  tickets?: SupportTicket[];  // Relation to support tickets
  manufacturerTickets?: ManufacturerTicket[]; // Tickets opened with the manufacturer

  // BUDGET
  totalBudgetHours: number; // INT
  team: string[]; // JSONB (Array of User Names) or Relation `project_members`
  tasks: Task[]; // Relation to `tasks`
  items?: LineItem[]; // Line items from the lead that make up this project (for reference)

  // FINANCIALS
  value?: number; // DECIMAL — Contract value (from lead items or sourceItem)
  budgetedCost?: number; // DECIMAL — Snapshot from Lead's costing review
  timeLogs: TimeLog[]; // Relation to `time_logs`
  payments: PaymentRecord[]; // Relation to `payments`
  consultantRates?: Record<string, number>; // JSONB (Specific rates for this project: { "UserA": 50, "UserB": 90 })
  factoryCommissionRate?: number; // DECIMAL (Percentage, e.g. 10 for 10%)

  // Timestamps (set by Mongoose { timestamps: true })
  updatedAt?: string; // ISO — used for optimistic concurrency check
}

export interface DashboardStats {
  totalPipelineValue: number;
  conversionRate: number;
  activeProjects: number;
  totalBillableHours: number;
}

export type UserRole = 'admin' | 'sales' | 'consultant';

export interface ModulePermissions {
  dashboard: boolean; 
  crm: boolean;
  projects: boolean;
  portal: boolean;
  admin: boolean;
}

export interface SalaryRecord {
  amount: number;
  effectiveDate: string; // ISO Date
}

/**
 * TABLE: users
 * PK: id
 */
export interface User {
  id: string; // UUID
  name: string; // VARCHAR
  email: string; // VARCHAR UNIQUE
  role: UserRole; // ENUM
  avatar?: string; // URL
  permissions: ModulePermissions; // JSONB
  
  // FINANCE
  hourlyCost?: number; // DECIMAL (Default Cost Rate for Contractors)
  monthlySalary?: number; // DECIMAL (Current Salary for Employees)
  salaryHistory?: SalaryRecord[]; // JSONB (History of salary changes)
  salesQuota?: number; // DECIMAL (Monthly sales revenue target in $)
}

// TEMPLATE INTERFACES
export interface TemplateItem {
  id: string;
  title: string;
  defaultHours: number;
  subtasks?: string[]; 
}

export interface TaskTemplate {
  id: string;
  name: string;
  type: ProjectType;
  description?: string;
  items: TemplateItem[]; // JSONB
}

// ==================================================================================
// BALANCE SHEET — Statement of Financial Position (US GAAP / FASB ASC 205)
// ==================================================================================

export type BSAccountType =
  // Current Assets
  | 'cash_equivalents' | 'accounts_receivable' | 'allowance_doubtful_accounts'
  | 'inventory' | 'prepaid_expenses' | 'other_current_assets'
  // Non-Current Assets
  | 'fixed_assets_gross' | 'accumulated_depreciation'
  | 'intangible_assets' | 'long_term_investments' | 'other_noncurrent_assets'
  // Current Liabilities
  | 'accounts_payable' | 'accrued_expenses' | 'unearned_revenue'
  | 'current_portion_ltd' | 'short_term_debt' | 'other_current_liabilities'
  // Non-Current Liabilities
  | 'long_term_debt' | 'deferred_tax_liability' | 'other_noncurrent_liabilities'
  // Equity
  | 'common_stock' | 'apic' | 'retained_earnings' | 'treasury_stock' | 'other_equity';

export type InventoryMethod = 'FIFO' | 'LIFO' | 'AVERAGE_COST';

/**
 * TABLE: balance_sheet_accounts
 * PK: id
 * Stores one row per account per year snapshot.
 */
export interface BalanceSheetAccount {
  id: string;                    // UUID
  accountType: BSAccountType;    // Determines section placement
  name: string;                  // Display label (can be customized)
  year: number;                  // Fiscal year this snapshot belongs to
  amount: number;                // Positive value (contra sign applied in logic)
  inventoryMethod?: InventoryMethod; // Only for inventory accounts
  notes?: string;                // Footnote text for this line item
}

/**
 * TABLE: balance_sheet_notes
 * General notes / disclosures attached to a full period Balance Sheet.
 */
export interface BalanceSheetNote {
  id: string;
  year: number;
  title: string;   // e.g. "Note 1 - Summary of Significant Accounting Policies"
  body: string;
}

// FINANCE TRANSACTIONS
export type ExpenseCategory = 'credit_card' | 'office' | 'software' | 'marketing' | 'salary' | 'consultant_payment' | 'other';

/**
 * TABLE: transactions (Operational Expenses)
 * PK: id
 * FK: project_id (Optional)
 * FK: lead_id (Optional)
 */
export interface Transaction {
  id: string; // UUID
  title: string; // VARCHAR
  amount: number; // DECIMAL
  date: string; // DATE
  type: 'income' | 'expense'; // ENUM
  category: ExpenseCategory; // ENUM
  description?: string; // TEXT

  // LINKING
  projectId?: string;    // FK -> projects.id
  leadId?: string;       // FK -> leads.id
  lineItemId?: string;   // FK -> lead LineItem (license tracking)
  consultantId?: string; // FK -> users.id (Credit Card expenses only)
  logIds?: string[];     // IDs of TimeLog entries covered by this consultant_payment

  isBillable?: boolean; // BOOLEAN

  // License billing fields
  billingDate?: string; // Invoice / billing date
  paymentDate?: string; // Date the client actually paid
  years?: number;       // License term in years
  licenseYear?: number; // Fiscal year this charge applies to (e.g. 2026)
  isPaid?: boolean;     // Whether the client has already paid
}

// ==================================================================================
// INVOICE & PAYMENT ENGINE — Facturado vs Cobrado
// ==================================================================================

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void';
export type PaymentMethod = 'wire_transfer' | 'stripe' | 'mercury' | 'cash' | 'check' | 'other';
export type NotificationLogType =
  | 'reminder_before_due'
  | 'reminder_due_today'
  | 'escalation_7d'
  | 'escalation_15d'
  | 'escalation_30d'
  | 'internal_overdue_alert'
  | 'internal_threshold_alert'
  | 'internal_payment_received';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number; // quantity * unitPrice
  skuId?: string;
}

/**
 * TABLE: invoices
 * PK: id (or _id)
 * FK: clientId, projectId
 */
export interface Invoice {
  _id?: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  projectId?: string;
  quoteId?: string;

  // Dates
  issueDate?: string;
  dueDate?: string;

  // Amounts
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string; // ISO 4217 (e.g. 'USD', 'COP', 'EUR')

  // Multi-currency reporting
  totalUSD: number;
  exchangeRateToUSD: number; // totalUSD = total / exchangeRateToUSD

  // Line items
  lineItems: InvoiceLineItem[];

  // Status — hybrid model
  status: InvoiceStatus;

  // Derived payment tracking
  paidAmount: number;
  paidAmountUSD: number;
  balance: number;
  balanceUSD: number;

  // Metadata
  notes?: string;
  internalNotes?: string;
  language?: 'es' | 'en';

  // Notification control
  lastReminderSentAt?: string;
  reminderCount?: number;
  suppressReminders?: boolean;

  // Soft delete
  deleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;

  // Audit
  createdBy?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;

  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentAllocation {
  invoiceId: string;
  amountApplied: number;
  amountAppliedUSD: number;
}

/**
 * TABLE: payments (new collection, replaces project.payments[])
 * PK: id (or _id)
 * FK: clientId, appliedTo[].invoiceId
 */
export interface Payment {
  _id?: string;
  clientId: string;
  clientName?: string;

  paymentDate: string;
  amount: number;
  currency: string; // ISO 4217
  amountUSD: number;
  exchangeRateToUSD: number;
  exchangeRateSource?: 'auto' | 'manual' | 'legacy_migration';

  method: PaymentMethod;
  reference?: string;

  appliedTo: PaymentAllocation[];

  isLegacyMigration?: boolean;
  createdBy?: string;
  notes?: string;

  createdAt?: string;
  updatedAt?: string;
}

/**
 * TABLE: notification_logs (idempotent reminder tracking)
 * PK: id (or _id)
 * FK: invoiceId
 */
export interface NotificationLogEntry {
  _id?: string;
  invoiceId: string;
  type: NotificationLogType;
  recipientEmail?: string;
  recipientUserId?: string;
  sentAt: string;
  success: boolean;
  error?: string;
  templateUsed?: string;
  invoiceNumber?: string;
  clientName?: string;
  createdAt?: string;
}

/**
 * TABLE: exchange_rate_cache
 * Cached FX rates from frankfurter.app with 24h TTL
 */
export interface ExchangeRateCacheEntry {
  _id?: string;
  pair: string; // e.g. 'COP_USD'
  rate: number;
  fetchedAt: string;
}
