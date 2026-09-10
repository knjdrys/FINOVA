export type CurrencyCode =
  | 'PHP'
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'PKR'
  | 'INR'
  | 'JPY'
  | 'CAD'
  | 'AUD'
  | 'SGD'
  | 'AED'
  | 'SAR'
  | 'BRL'
  | 'CNY'
  | 'KRW'
  | 'IDR'
  | 'MYR'
  | 'THB'
  | 'VND'
  | 'MXN'
  | 'ZAR'
  | 'TRY'
  | 'CHF'
  | 'HKD'
  | 'NZD';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  minorUnitMultiplier: number;
  formatPrefix: boolean;
}

export const ALL_CURRENCIES: CurrencyConfig[] = [
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso (PHP)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'USD', symbol: '$', name: 'US Dollar (USD)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'EUR', symbol: '€', name: 'Euro (EUR)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'GBP', symbol: '£', name: 'British Pound (GBP)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee (PKR)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee (INR)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen (JPY)', minorUnitMultiplier: 1, formatPrefix: true },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar (CAD)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar (AUD)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar (SGD)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham (AED)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal (SAR)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real (BRL)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan (CNY)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won (KRW)', minorUnitMultiplier: 1, formatPrefix: true },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah (IDR)', minorUnitMultiplier: 1, formatPrefix: true },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit (MYR)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'THB', symbol: '฿', name: 'Thai Baht (THB)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong (VND)', minorUnitMultiplier: 1, formatPrefix: true },
  { code: 'MXN', symbol: 'Mex$', name: 'Mexican Peso (MXN)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand (ZAR)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira (TRY)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc (CHF)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar (HKD)', minorUnitMultiplier: 100, formatPrefix: true },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar (NZD)', minorUnitMultiplier: 100, formatPrefix: true },
];

export const CURRENCY_CONFIGS: Record<CurrencyCode, CurrencyConfig> = ALL_CURRENCIES.reduce(
  (acc, curr) => {
    acc[curr.code] = curr;
    return acc;
  },
  {} as Record<CurrencyCode, CurrencyConfig>
);

export type AccountType = 'CASH' | 'BANK' | 'E_WALLET' | 'CREDIT_CARD' | 'SAVINGS' | 'INVESTMENT' | 'OTHER';

export interface BankPreset {
  id: string;
  name: string;
  type: AccountType;
  icon: string;
  color: string;
  bgColor?: string;
  logoUrl?: string;
  country?: string;
}

export const POPULAR_BANKS_AND_WALLETS: BankPreset[] = [
  { id: 'bpi', name: 'BPI (Bank of the Philippine Islands)', type: 'BANK', icon: 'Building2', color: '#B91C1C', bgColor: '#FEE2E2', country: 'PH' },
  { id: 'bdo', name: 'BDO Unibank', type: 'BANK', icon: 'Building2', color: '#1D4ED8', bgColor: '#DBEAFE', country: 'PH' },
  { id: 'grbi', name: 'GRBank', type: 'BANK', icon: 'Building2', color: '#1C205E', bgColor: '#E0E7FF', logoUrl: '/assets/grbi-logo.png', country: 'PH' },
  { id: 'gcash', name: 'GCash', type: 'E_WALLET', icon: 'Smartphone', color: '#0284C7', bgColor: '#E0F2FE', country: 'PH' },
  { id: 'maya', name: 'Maya (PayMaya)', type: 'E_WALLET', icon: 'Smartphone', color: '#16A34A', bgColor: '#DCFCE7', country: 'PH' },
  { id: 'metrobank', name: 'Metrobank', type: 'BANK', icon: 'Building2', color: '#1E40AF', bgColor: '#DBEAFE', country: 'PH' },
  { id: 'unionbank', name: 'UnionBank of the Philippines', type: 'BANK', icon: 'Building2', color: '#EA580C', bgColor: '#FFEDD5', country: 'PH' },
  { id: 'landbank', name: 'Landbank', type: 'BANK', icon: 'Building2', color: '#15803D', bgColor: '#DCFCE7', country: 'PH' },
  { id: 'rcbc', name: 'RCBC', type: 'BANK', icon: 'Building2', color: '#2563EB', bgColor: '#DBEAFE', country: 'PH' },
  { id: 'securitybank', name: 'Security Bank', type: 'BANK', icon: 'Building2', color: '#047857', bgColor: '#D1FAE5', country: 'PH' },
  { id: 'meezan', name: 'Meezan Bank', type: 'BANK', icon: 'Building2', color: '#132B1F', bgColor: '#E6F4EA', country: 'PK' },
  { id: 'nayapay', name: 'NayaPay Wallet', type: 'E_WALLET', icon: 'Smartphone', color: '#10B981', bgColor: '#D1FAE5', country: 'PK' },
  { id: 'chase', name: 'Chase Bank', type: 'BANK', icon: 'Building2', color: '#1E3A8A', bgColor: '#DBEAFE', country: 'US' },
  { id: 'bofa', name: 'Bank of America', type: 'BANK', icon: 'Building2', color: '#DC2626', bgColor: '#FEE2E2', country: 'US' },
  { id: 'hsbc', name: 'HSBC', type: 'BANK', icon: 'Building2', color: '#DC2626', bgColor: '#FEE2E2', country: 'GLOBAL' },
  { id: 'cash', name: 'Cash on Hand / Personal Wallet', type: 'CASH', icon: 'Wallet', color: '#059669', bgColor: '#D1FAE5', country: 'GLOBAL' },
];

export interface Account {
  id: string;
  userId: string;
  name: string;
  bankPresetId?: string;
  accountNumberMask?: string;
  type: AccountType;
  currency: CurrencyCode;
  initialBalance: number;
  currentBalance: number;
  icon: string;
  color: string;
  includeInTotalBalance: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER';
export type TransactionStatus = 'CONFIRMED' | 'PENDING' | 'CLEARED';

export interface SplitPart {
  categoryId: string;
  /** Minor units. Allocations must sum exactly to the parent amount (FINOVA invariant). */
  amount: number;
}

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  categoryId: string;
  accountId: string;
  destinationAccountId?: string;
  merchant?: string;
  subtitle?: string;
  note?: string;
  date: string;
  time?: string;
  tags: string[];
  status: TransactionStatus;
  /** Links an auto-posted or manually-settled transaction back to the commitment it fulfilled. */
  sourceCommitmentId?: string;
  /** When set, the expense is divided across categories. Sum must equal `amount`. */
  splitParts?: SplitPart[];
  /** Compressed receipt image stored locally as a data URL (no cloud bucket dependency). */
  receiptDataUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type CategoryType = 'EXPENSE' | 'INCOME';

export interface Category {
  id: string;
  userId: string;
  name: string;
  type: CategoryType;
  icon: string;
  emoji?: string;
  color: string;
  bgColor?: string;
  isSystem: boolean;
  isArchived: boolean;
}

export type BudgetPeriod = 'MONTHLY' | 'WEEKLY' | 'CUSTOM' | 'SEMI_MONTHLY_15_DAYS';
export type BudgetHealth = 'UNDER_CONTROL' | 'ON_TRACK' | 'NEAR_LIMIT' | 'AT_RISK' | 'OVER_BUDGET';

export interface Budget {
  id: string;
  userId: string;
  name: string;
  amount: number;
  currency?: CurrencyCode;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
  categoryIds: string[];
  notifyThresholdPercentage: number;
  isActive: boolean;
  /** When true, unused budget from the previous period carries forward into the next period. */
  rolloverUnused?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetForecast {
  budgetId: string;
  budgetName: string;
  budgetAmount: number;
  actualSpent: number;
  remainingAmount: number;
  percentageUsed: number;
  rolloverCarry?: number;
  effectiveBudget?: number;
  effectiveRemaining?: number;
  elapsedDays: number;
  remainingDays: number;
  totalDaysInPeriod: number;
  avgDailySpent: number;
  projectedRemainingSpent: number;
  projectedMonthEndSpent: number;
  projectedVariance: number;
  status: BudgetHealth;
  explanation: string;
}

export type GoalPriority = 'ESSENTIAL' | 'IMPORTANT' | 'OPTIONAL';
export type GoalStatus = 'ON_TRACK' | 'SLIGHTLY_BEHIND' | 'AT_RISK' | 'COMPLETED';

export interface SavingsGoal {
  id: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency?: CurrencyCode;
  targetDate: string;
  accountId?: string;
  priority: GoalPriority;
  status: GoalStatus;
  icon: string;
  color: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoalProgress {
  goalId: string;
  goalName: string;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  progressPercentage: number;
  daysRemaining: number;
  requiredDailySaving: number;
  requiredWeeklySaving: number;
  requiredMonthlySaving: number;
  status: GoalStatus;
  isOnTrack: boolean;
  explanation: string;
}

export type RiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

/** Human-readable, actionable insight for a single savings goal — used by Home/Plans. */
export interface GoalInsight {
  goal: SavingsGoal;
  progress: GoalProgress;
  /** Money that *should* have been contributed by today given an even pace since creation. */
  expectedContributionToDate: number;
  /** currentAmount - expectedContributionToDate (positive = ahead, negative = behind). */
  variance: number;
  /** Share of the requirement actually met (0–1+). */
  paceRatio: number;
  actualContributionRate: number; // minor units / month so far
  requiredRate: number; // requiredMonthlySaving
  risk: RiskLevel;
  isCompleted: boolean;
}

export type BudgetRiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

/** Human-readable, actionable insight for a single budget — used by Home/Plans. */
export interface BudgetInsight {
  budget: Budget;
  forecast: BudgetForecast;
  isCurrent: boolean;
  isOverBudget: boolean;
  isAtRisk: boolean;
  isNearLimit: boolean;
  risk: RiskLevel;
  /** Minor units projected to overspend (0 if under). */
  projectedOverspend: number;
  /** Days left in the active budget window. */
  daysLeft: number;
  /** Per-day spend allowed to stay within the effective budget. */
  dailyAllowanceRemaining: number;
}

export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurringTransaction {
  id: string;
  userId: string;
  title: string;
  amount: number;
  currency?: CurrencyCode;
  type: TransactionType;
  categoryId: string;
  accountId: string;
  destinationAccountId?: string;
  frequency: RecurringFrequency;
  startDate: string;
  nextOccurrence: string;
  endDate?: string;
  isActive: boolean;
  reminderEnabled: boolean;
  /**
   * Explicit consent to auto-post due occurrences as real transactions.
   * Undefined = legacy behavior (falls back to reminderEnabled) so rules
   * created before this flag existed keep working unchanged.
   */
  autoPostEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CommitmentDirection = 'INFLOW' | 'OUTFLOW';
export type CommitmentType =
  | 'BILL'
  | 'SUBSCRIPTION'
  | 'RECURRING_EXPENSE'
  | 'RECURRING_INCOME'
  | 'SAVINGS_CONTRIBUTION'
  | 'DEBT_PAYMENT'
  | 'PLANNED_EXPENSE'
  | 'EXPECTED_INCOME'
  | 'CUSTOM';

export type CommitmentPriority = 'ESSENTIAL' | 'IMPORTANT' | 'OPTIONAL';
export type CommitmentStatus = 'PROJECTED' | 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED' | 'AUTO_POSTED';

export interface MoneyCommitment {
  id: string;
  userId: string;
  title: string;
  type: CommitmentType;
  amount: number;
  currency: CurrencyCode;
  direction: CommitmentDirection;
  status: CommitmentStatus;
  dueDate: string;
  accountId: string;
  categoryId: string;
  goalId?: string;
  relatedRecurringTransactionId?: string;
  priority: CommitmentPriority;
  notes?: string;
  isAutoGenerated?: boolean;
  /** When true, the commitment is automatically posted as a real transaction on/after its due date. */
  autoPostEnabled?: boolean;
  /** ISO timestamp of the last automatic post, if any. */
  lastAutoPostedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationKind =
  | 'OVERDUE_COMMITMENT'
  | 'UPCOMING_COMMITMENT'
  | 'RECURRING_UPCOMING'
  | 'AUTO_POSTED'
  | 'CASHFLOW_RISK'
  | 'BUDGET_ALERT'
  | 'GOAL_ALERT';

export type NotificationSeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

/** Internal sections of the Plans screen (deep-linkable from Home alerts). */
export type PlansSection = 'TIMELINE' | 'BUDGETS' | 'GOALS' | 'BILLS' | 'RECURRING';

/**
 * Per-notification lifecycle meta, persisted by stable id.
 * - lastShownAt: when this id first appeared in the in-app feed (cooldown anchor).
 * - lastOsSentAt: when we last surfaced it as an OS notification (spam gate).
 */
export interface NotificationMeta {
  lastShownAt: string;
  lastOsSentAt?: string;
}

/** User-controlled notification behavior (Settings → Notifications). */
export interface NotificationPreferences {
  /** Master switch — mirrors settings.notificationsEnabled; false silences everything. */
  enabled: boolean;
  /** In-app feed categories. */
  bills: boolean;
  recurring: boolean;
  budgetRisk: boolean;
  cashFlowRisk: boolean;
  goalRisk: boolean;
  /** OS-level notifications (only while the app is open — see browserNotify docs). */
  osNotifications: boolean;
  /** Days before a due commitment to first alert (default 2). */
  billLeadDays: number;
  /** Minimum hours between OS re-notifications of the same id (default 24). */
  cooldownHours: number;
}

export interface Notification {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  /**
   * Feed priority 1 (act now) .. 4 (FYI). Derived from severity + kind +
   * urgency; the feed sorts by this, not by severity alone.
   */
  priority: number;
  title: string;
  body: string;
  relatedCommitmentId?: string;
  relatedTransactionId?: string;
  relatedBudgetId?: string;
  relatedGoalId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface TimelineDayEvent {
  id: string;
  type: 'TRANSACTION' | 'COMMITMENT' | 'GOAL_TARGET';
  title: string;
  amount: number;
  direction: CommitmentDirection;
  status: 'ACTUAL' | 'SCHEDULED' | 'PROJECTED' | 'OVERDUE';
  categoryId: string;
  accountId: string;
  accountName?: string;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
}

export interface TimelineDay {
  date: string;
  dayLabel: string;
  isToday: boolean;
  isPast: boolean;
  events: TimelineDayEvent[];
  totalInflow: number;
  totalOutflow: number;
  netAmount: number;
  projectedEndOfDayBalance: number;
}

export interface SafeToSpendResult {
  totalAvailableBalance: number;
  essentialUpcomingCommitments: number;
  reservedGoalContributions: number;
  minimumReserve: number;
  discretionaryPool: number;
  remainingDaysInPeriod: number;
  dailySafeToSpend: number;
  weeklySafeToSpend: number;
  periodLabel: string;
  periodEndDate: string;
  isDeficit: boolean;
  is15DayCycle?: boolean;
  cycleInfo?: {
    cycleLabel: string;
    startDate: string;
    endDate: string;
    totalCycleBudget?: number;
    cycleAllocatedSpent?: number;
  };
  explanation: {
    steps: Array<{ label: string; amount: number; isDeduction: boolean; description: string }>;
    summary: string;
  };
}

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CashFlowRisk {
  id: string;
  severity: RiskSeverity;
  date: string;
  title: string;
  description: string;
  projectedBalance: number;
  minimumReserve: number;
  primaryCause: string;
  recommendedAction: string;
}

export interface WhatIfSimulationInput {
  title: string;
  amount: number;
  type: 'EXPENSE' | 'INCOME' | 'RECURRING_EXPENSE' | 'RECURRING_INCOME';
  frequency?: RecurringFrequency;
  date: string;
  categoryId: string;
  accountId: string;
}

export interface WhatIfSimulationResult {
  input: WhatIfSimulationInput;
  baseSafeToSpendDaily: number;
  simulatedSafeToSpendDaily: number;
  safeToSpendDelta: number;
  baseMonthEndProjectedBalance: number;
  simulatedMonthEndProjectedBalance: number;
  balanceDelta: number;
  affectedBudgets: Array<{
    budgetId: string;
    budgetName: string;
    originalProjectedSpent: number;
    simulatedProjectedSpent: number;
    budgetAmount: number;
    wasOverBudget: boolean;
    willBeOverBudget: boolean;
  }>;
  affectedGoals: Array<{
    goalId: string;
    goalName: string;
    impactDescription: string;
  }>;
  newRisks: CashFlowRisk[];
  verdict: 'SAFE' | 'CAUTION' | 'HIGH_RISK';
  summarySentence: string;
}

export interface FinancialInsight {
  id: string;
  category: 'SAVINGS' | 'BUDGET' | 'SPENDING' | 'CASH_FLOW' | 'COMMITMENT';
  title: string;
  fact: string;
  calculation: string;
  interpretation: string;
  severity: 'POSITIVE' | 'NEUTRAL' | 'WARNING' | 'ALERT';
  score: number;
  iconName: string;
  createdAt: string;
}

export type TrackingPeriodPreference = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH';
export type BudgetCycleMode = 'MONTHLY' | 'SEMI_MONTHLY_15_DAYS' | 'WEEKLY';

export interface UserSettings {
  userId: string;
  userName: string;
  currency: CurrencyCode;
  /** UI language. Optional: settings persisted before i18n lack it — callers fall back to 'en'. */
  language?: 'en' | 'fil';
  defaultTrackingPeriod: TrackingPeriodPreference;
  budgetCycleMode: BudgetCycleMode;
  semiMonthlyCutoffDay: number; // e.g. 15 for 1st-15th & 16th-end
  minimumReserve: number;
  safeToSpendPeriod: 'END_OF_MONTH' | 'NEXT_PAYCHECK' | 'CUSTOM_DATE';
  customPaycheckDay?: number;
  darkTheme: boolean;
  notificationsEnabled: boolean;
  budgetWarningThreshold: number;
  autoGenerateCommitmentsFromRecurring: boolean;
  hasCompletedOnboarding?: boolean;
  /** First-run checklist dismissed (device-local guidance, not cloud-synced). */
  hasDismissedChecklist?: boolean;
  lastBackupDate?: string;
  /**
   * Emergency-fund parameters (see EmergencyFundEngine). Both optional — the
   * engine applies defaults (3 months; bills + groceries as essentials).
   */
  emergencyFundMonths?: number;
  essentialCategoryIds?: string[];
}
