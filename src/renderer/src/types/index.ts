// ── Language / settings ────────────────────────────────────
export type Language = 'en' | 'fr' | 'de' | 'ru'

export interface AppSettings {
  language: Language
  currency: string // ISO 4217 code, e.g. 'EUR', 'USD', 'CHF'
  onboarded: boolean // first-run wizard (language + PIN) completed
  prioritySectionEnabled?: boolean // "Special priority" section (Phase 7), default on
}

// ── Banks (user-defined) ───────────────────────────────────
export interface Bank {
  id: string
  name: string
  color: string // hex color used for the badge dot
  createdAt: string
}

// ── Obligations ────────────────────────────────────────────
export type ObligationType = 'subscription' | 'manual_payment'
export type ObligationStatus = 'paid' | 'unpaid' | 'unknown' | 'skipped'
export type ObligationFrequency = 'monthly' | 'quarterly' | 'yearly' | 'once'

export interface Obligation {
  id: string
  name: string
  type: ObligationType
  amount: number | null
  approximateDay: number | null
  yearlyMonth?: number | null // 1-12, the month when a yearly obligation is due
  bankId: string | null // user-defined bank; null = no bank assigned
  notes?: string
  isActive: boolean
  createdAt: string
  frequency?: ObligationFrequency // default "monthly"
  sectionId?: string // custom section id; if absent, grouped by frequency
  parentId?: string // linked parent obligation id; child auto-pays when parent is paid
  // Installment plan (generic — works with any bank):
  isInstallment?: boolean
  totalInstallments?: number // total number of payments in the plan
  originalTotal?: number // original total debt (informational)
  // Effective-dated price changes: from month `from` ('YYYY-MM') the amount is `amount`.
  // Months before the earliest entry use the base `amount` above. The past is never touched.
  amountChanges?: { from: string; amount: number }[]
}

// Payment status of one obligation for one specific month.
// Key: (obligationId, year, month).
export interface ObligationMonth {
  obligationId: string
  year: number
  month: number // 1-12
  status: ObligationStatus
  actualAmount: number | null
  paidDate?: string
  isCarriedOver?: boolean // record created by the "carry debt" action
  carriedFromYear?: number // which year the debt was carried from
  carriedFromMonth?: number // which month the debt was carried from
  carriedAmount?: number // amount of the carried debt (at carry time)
  carriedPaid?: boolean // the carried debt has been settled
}

// ── Income (money coming in, per month) ────────────────────
// Fully independent of obligations: an entry belongs to the month of its
// date, so every month has its own list and total starting from zero.
export interface Income {
  id: string
  date: string // local ISO date 'YYYY-MM-DD'; determines the month it belongs to
  amount: number
  label: string // free-form comment: salary, fee, quick sell, …
  createdAt: string
}

// ── Custom obligation sections ─────────────────────────────
export interface ObligationSection {
  id: string
  name: string
  order: number
  createdAt: string
}

// ── Undo / Redo ────────────────────────────────────────────
export interface HistoryEntry {
  id: string
  timestamp: string
  action: string
  snapshotBefore: Partial<AppData>
  snapshotAfter: Partial<AppData>
}

// ── Change log ─────────────────────────────────────────────
export interface ChangeLogEntry {
  id: string
  timestamp: string
  action: string
  description: string
}

// ── PIN ────────────────────────────────────────────────────
export interface PinSettings {
  enabled: boolean
  pinHash: string | null // SHA-256 hex, never plaintext
  lockoutUntil: string | null // ISO timestamp
  failedAttempts: number
}

export interface PinStatus {
  enabled: boolean
  locked: boolean
  lockoutUntil: string | null
  attemptsLeft: number
}

// ── Backups ────────────────────────────────────────────────
export interface BackupMeta {
  filename: string
  timestamp: string
  size: number
  obligationCount: number
}

// ── Full persisted app data ────────────────────────────────
export interface AppData {
  obligations: Obligation[]
  obligationMonths: ObligationMonth[]
  banks: Bank[]
  incomes: Income[]
  customSections: ObligationSection[]
  undoHistory: HistoryEntry[]
  redoStack: HistoryEntry[]
  changeLog: ChangeLogEntry[]
  pinSettings: PinSettings
  settings: AppSettings
  // Global "Special priority" tag (Phase 7): ids shown in the top display-only
  // section. Does NOT change sectionId/frequency, NOT part of undo snapshots.
  priorityObligationIds: string[]
}
