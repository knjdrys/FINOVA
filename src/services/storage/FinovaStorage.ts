import {
  Account,
  Budget,
  Category,
  CurrencyCode,
  CURRENCY_CONFIGS,
  MoneyCommitment,
  RecurringTransaction,
  SavingsGoal,
  Transaction,
  UserSettings,
} from '../../types';
import { DateUtils } from '../../domain/date/DateUtils';

export interface FinovaState {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  goals: SavingsGoal[];
  commitments: MoneyCommitment[];
  recurring: RecurringTransaction[];
  /** Notification read-state, persisted by id so re-derivation stays idempotent. */
  readNotificationIds: string[];
  settings: UserSettings;
}

const STORAGE_KEY = 'FINOVA_FINANCIAL_OS_DATA_V4';

/**
 * Per-user storage scoping. Financial data is namespaced by account id so a
 * second user on the same device can never read the first user's data.
 * 'legacy' is the pre-scoping key, auto-migrated once into the first scope.
 */
let activeScope = 'legacy';

export const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat-food', userId: 'user-1', name: 'Food', type: 'EXPENSE', icon: 'Utensils', emoji: '🍔', color: '#EA580C', bgColor: '#FFEDD5', isSystem: true, isArchived: false },
  { id: 'cat-groceries', userId: 'user-1', name: 'Groceries', type: 'EXPENSE', icon: 'ShoppingCart', emoji: '🛒', color: '#059669', bgColor: '#D1FAE5', isSystem: true, isArchived: false },
  { id: 'cat-bills', userId: 'user-1', name: 'Bills', type: 'EXPENSE', icon: 'Zap', emoji: '⚡', color: '#4F46E5', bgColor: '#E0E7FF', isSystem: true, isArchived: false },
  { id: 'cat-subscription', userId: 'user-1', name: 'Subscription', type: 'EXPENSE', icon: 'Tv', emoji: '📺', color: '#DB2777', bgColor: '#FCE7F3', isSystem: true, isArchived: false },
  { id: 'cat-transport', userId: 'user-1', name: 'Transport', type: 'EXPENSE', icon: 'Car', emoji: '🚗', color: '#D97706', bgColor: '#FEF3C7', isSystem: true, isArchived: false },
  { id: 'cat-shopping', userId: 'user-1', name: 'Shopping', type: 'EXPENSE', icon: 'ShoppingBag', emoji: '🛍️', color: '#2563EB', bgColor: '#DBEAFE', isSystem: true, isArchived: false },
  { id: 'cat-health', userId: 'user-1', name: 'Health', type: 'EXPENSE', icon: 'HeartPulse', emoji: '❤️', color: '#DC2626', bgColor: '#FEE2E2', isSystem: true, isArchived: false },
  { id: 'cat-salary', userId: 'user-1', name: 'Salary', type: 'INCOME', icon: 'Briefcase', emoji: '💼', color: '#0D9488', bgColor: '#CCFBF1', isSystem: true, isArchived: false },
  { id: 'cat-freelance', userId: 'user-1', name: 'Freelance', type: 'INCOME', icon: 'Laptop', emoji: '💻', color: '#7C3AED', bgColor: '#EDE9FE', isSystem: true, isArchived: false },
  { id: 'cat-transfer', userId: 'user-1', name: 'Transfer', type: 'EXPENSE', icon: 'ArrowRightLeft', emoji: '🔄', color: '#475569', bgColor: '#F1F5F9', isSystem: true, isArchived: false },
];

// ---------------------------------------------------------------------------
// Demo / showcase data
//
// Everything here is generated RELATIVE TO TODAY the moment it is loaded.
// The old hardcoded May-2026 dates went stale and first-run users saw a
// "dead" app (empty Today, empty timeline, expired budgets). With dynamic
// dates the demo always looks alive: transactions logged today, budgets for
// the current month, bills coming due this week, and recurring items in the
// future.
// ---------------------------------------------------------------------------

type DemoTxSpec = {
  id: string;
  type: 'EXPENSE' | 'INCOME';
  amount: number; // minor units
  categoryId: string;
  accountId: string;
  merchant: string;
  subtitle?: string;
  note?: string;
  date: string;
  time: string;
  tags: string[];
  sourceCommitmentId?: string;
};

/** Build a complete demo state anchored to `todayISO` (defaults to now). */
export function buildDemoState(todayISO: string = DateUtils.getTodayISO()): FinovaState {
  // Anchored to the demo's own calendar (not the wall clock) so the generated
  // state is a pure, reproducible function of `todayISO` — same input, same
  // state, forever. Keeps tests deterministic and demo data stable.
  const nowISO = `${todayISO}T12:00:00Z`;
  const day = (offset: number): string => DateUtils.addDaysISO(todayISO, offset);
  // `monthOffset, dayOfMonth` — e.g. on(-1, 30) = 30th of last month.
  const on = (monthOffset: number, dayOfMonth: number): string => {
    const ref = DateUtils.parseISO(todayISO);
    const d = new Date(ref.getFullYear(), ref.getMonth() + monthOffset, dayOfMonth);
    return DateUtils.formatISO(d);
  };
  const dayOfMonth = DateUtils.parseISO(todayISO).getDate();

  const monthStart = DateUtils.getMonthStartISO(todayISO);
  const monthEnd = DateUtils.getMonthEndISO(todayISO);
  const goalTargetDate = DateUtils.addMonthsISO(todayISO, 6);

  const bpi = 'acc-demo-bpi';
  const gcash = 'acc-demo-gcash';

  // --- Transactions -------------------------------------------------------
  // Salary is booked on the 15th of every month. The 15th of THIS month only
  // exists in history once today has reached it; last month's 30th always
  // gives a recent income entry either way.
  const txSpecs: DemoTxSpec[] = [
    { id: 'dt-salary-prev', type: 'INCOME', amount: 4_500_000, categoryId: 'cat-salary', accountId: bpi, merchant: 'Monthly Salary', subtitle: 'Payroll — Acme Holdings', note: 'Salary for last month', date: on(-1, 30), time: '08:00', tags: ['salary'] },
    ...((dayOfMonth >= 15
      ? [{ id: 'dt-salary-cur', type: 'INCOME' as const, amount: 4_500_000, categoryId: 'cat-salary', accountId: bpi, merchant: 'Monthly Salary', subtitle: 'Payroll — Acme Holdings', note: '15th payroll', date: on(0, 15), time: '08:00', tags: ['salary'] }]
      : []) as DemoTxSpec[]),
    { id: 'dt-freelance', type: 'INCOME', amount: 850_000, categoryId: 'cat-freelance', accountId: gcash, merchant: 'Freelance Payout', subtitle: 'Brand logo project', date: day(-5), time: '16:20', tags: ['freelance'] },
    // Two complete months of history (salary + essentials each month) so the
    // emergency fund, cash-flow trend, and month-over-month insights have
    // real data on first load. Last month is covered by the 30-day window
    // below — adding it again would double-book salary and utility bills.
    // Balances derive from this ledger, so everything still adds up.
    { id: 'dt-salary-m2', type: 'INCOME', amount: 4_500_000, categoryId: 'cat-salary', accountId: bpi, merchant: 'Monthly Salary', subtitle: 'Payroll — Acme Holdings', date: on(-2, 15), time: '08:00', tags: ['salary'] },
    { id: 'dt-meralco-m2', type: 'EXPENSE', amount: 142_0000, categoryId: 'cat-bills', accountId: bpi, merchant: 'Meralco', subtitle: 'Power bill', date: on(-2, 20), time: '11:25', tags: ['bills', 'utility'] },
    { id: 'dt-fiber-m2', type: 'EXPENSE', amount: 9_0100, categoryId: 'cat-bills', accountId: gcash, merchant: 'Globe Home Fiber', subtitle: 'Monthly internet', date: on(-2, 12), time: '09:15', tags: ['bills', 'utility'] },
    { id: 'dt-grocery-m2', type: 'EXPENSE', amount: 31_0000, categoryId: 'cat-groceries', accountId: bpi, merchant: 'Puregold Market', subtitle: 'Weekly groceries', date: on(-2, 9), time: '18:20', tags: ['groceries'] },
    { id: 'dt-shopee-m2', type: 'EXPENSE', amount: 22_0000, categoryId: 'cat-shopping', accountId: gcash, merchant: 'Shopee', subtitle: 'Home essentials', date: on(-2, 25), time: '21:40', tags: ['shopping'] },
    { id: 'dt-salary-m3', type: 'INCOME', amount: 4_500_000, categoryId: 'cat-salary', accountId: bpi, merchant: 'Monthly Salary', subtitle: 'Payroll — Acme Holdings', date: on(-3, 15), time: '08:00', tags: ['salary'] },
    { id: 'dt-meralco-m3', type: 'EXPENSE', amount: 135_0000, categoryId: 'cat-bills', accountId: bpi, merchant: 'Meralco', subtitle: 'Power bill', date: on(-3, 20), time: '11:25', tags: ['bills', 'utility'] },
    { id: 'dt-fiber-m3', type: 'EXPENSE', amount: 9_0100, categoryId: 'cat-bills', accountId: gcash, merchant: 'Globe Home Fiber', subtitle: 'Monthly internet', date: on(-3, 12), time: '09:15', tags: ['bills', 'utility'] },
    { id: 'dt-grocery-m3', type: 'EXPENSE', amount: 29_5000, categoryId: 'cat-groceries', accountId: bpi, merchant: 'Viva Merchandising', subtitle: 'Monthly staples', date: on(-3, 10), time: '16:30', tags: ['groceries'] },
    // Today — so the Today view is never empty on first load
    { id: 'dt-coffee', type: 'EXPENSE', amount: 320_00, categoryId: 'cat-food', accountId: bpi, merchant: 'Third Wave Coffee', subtitle: 'Morning coffee & pastry', date: day(0), time: '09:05', tags: ['food'] },
    { id: 'dt-lunch', type: 'EXPENSE', amount: 185_00, categoryId: 'cat-food', accountId: gcash, merchant: 'Jollibee', subtitle: 'Lunch', date: day(0), time: '12:40', tags: ['food', 'lunch'] },
    { id: 'dt-ride', type: 'EXPENSE', amount: 60_00, categoryId: 'cat-transport', accountId: gcash, merchant: 'Angkas', subtitle: 'Ride to office', date: day(0), time: '14:15', tags: ['transport'] },
    // Yesterday & last few days
    { id: 'dt-grocery-1', type: 'EXPENSE', amount: 650_00, categoryId: 'cat-groceries', accountId: bpi, merchant: 'Puregold Market', subtitle: 'Weekly groceries', date: day(-1), time: '18:20', tags: ['groceries'] },
    { id: 'dt-load', type: 'EXPENSE', amount: 250_00, categoryId: 'cat-bills', accountId: gcash, merchant: 'GCash Load', subtitle: 'Prepaid load', date: day(-1), time: '20:10', tags: ['load'] },
    { id: 'dt-condo-dues', type: 'EXPENSE', amount: 3_500_00, categoryId: 'cat-bills', accountId: bpi, merchant: 'Condo Association Dues', subtitle: 'Monthly dues — paid', note: 'Settled from Bills', date: day(-2), time: '10:00', tags: ['bills'], sourceCommitmentId: 'dt-comm-condo' },
    { id: 'dt-shopping-1', type: 'EXPENSE', amount: 1_250_00, categoryId: 'cat-shopping', accountId: bpi, merchant: 'SM Supermall', subtitle: 'Clothes', date: day(-2), time: '15:45', tags: ['shopping'] },
    { id: 'dt-fiber', type: 'EXPENSE', amount: 901_00, categoryId: 'cat-bills', accountId: gcash, merchant: 'Globe Home Fiber', subtitle: 'Monthly internet', date: day(-4), time: '09:15', tags: ['bills', 'utility'] },
    { id: 'dt-netflix', type: 'EXPENSE', amount: 615_00, categoryId: 'cat-subscription', accountId: bpi, merchant: 'Netflix', subtitle: 'Premium plan', date: day(-6), time: '12:00', tags: ['subscription'] },
    { id: 'dt-pharmacy', type: 'EXPENSE', amount: 1_450_00, categoryId: 'cat-health', accountId: gcash, merchant: 'Watsons', subtitle: 'Medicines', date: day(-7), time: '19:30', tags: ['health'] },
    { id: 'dt-grocery-2', type: 'EXPENSE', amount: 2_850_00, categoryId: 'cat-groceries', accountId: bpi, merchant: 'Landers', subtitle: 'Bulk grocery run', date: day(-9), time: '17:05', tags: ['groceries'] },
    { id: 'dt-foodpd', type: 'EXPENSE', amount: 1_180_00, categoryId: 'cat-food', accountId: gcash, merchant: 'Foodpanda', subtitle: 'Family dinner delivery', date: day(-11), time: '19:55', tags: ['food'] },
    { id: 'dt-commute', type: 'EXPENSE', amount: 450_00, categoryId: 'cat-transport', accountId: gcash, merchant: 'LRT + Jeepney', subtitle: 'Weekly commute', date: day(-13), time: '07:50', tags: ['transport'] },
    { id: 'dt-meralco', type: 'EXPENSE', amount: 14_500_00, categoryId: 'cat-bills', accountId: bpi, merchant: 'Meralco', subtitle: 'Power bill', date: day(-15), time: '11:25', tags: ['bills', 'utility'] },
    { id: 'dt-shopee', type: 'EXPENSE', amount: 2_350_00, categoryId: 'cat-shopping', accountId: gcash, merchant: 'Shopee', subtitle: 'Home essentials', date: day(-18), time: '21:40', tags: ['shopping'] },
    { id: 'dt-grocery-3', type: 'EXPENSE', amount: 3_200_00, categoryId: 'cat-groceries', accountId: bpi, merchant: 'Viva Merchandising', subtitle: 'Monthly staples', date: day(-20), time: '16:30', tags: ['groceries'] },
    { id: 'dt-salon', type: 'EXPENSE', amount: 990_00, categoryId: 'cat-health', accountId: gcash, merchant: 'Salon & Barber', subtitle: 'Haircut', date: day(-23), time: '14:00', tags: ['health'] },
    { id: 'dt-water', type: 'EXPENSE', amount: 6_500_00, categoryId: 'cat-bills', accountId: bpi, merchant: 'Manila Water', subtitle: 'Water bill', date: day(-26), time: '10:35', tags: ['bills', 'utility'] },
  ];

  const transactions: Transaction[] = txSpecs.map((s) => ({
    id: s.id,
    userId: 'user-1',
    type: s.type,
    amount: s.amount,
    currency: 'PHP',
    categoryId: s.categoryId,
    accountId: s.accountId,
    merchant: s.merchant,
    subtitle: s.subtitle,
    note: s.note,
    date: s.date,
    time: s.time,
    tags: s.tags,
    status: 'CONFIRMED',
    sourceCommitmentId: s.sourceCommitmentId,
    createdAt: `${s.date}T${s.time}:00Z`,
    updatedAt: `${s.date}T${s.time}:00Z`,
  }));

  // Balances are derived from the ledger above so demo numbers always add up.
  const netOf = (acc: string): number =>
    txSpecs
      .filter((s) => s.accountId === acc)
      .reduce((sum, s) => sum + (s.type === 'INCOME' ? s.amount : -s.amount), 0);
  const bpiStart = 5_000_000; // 50,000.00
  const gcashStart = 1_000_000; // 10,000.00

  const accounts: Account[] = [
    {
      id: bpi,
      userId: 'user-1',
      name: 'BPI Savings (Main Payroll)',
      bankPresetId: 'bpi',
      accountNumberMask: '•••• 4829',
      type: 'BANK',
      currency: 'PHP',
      initialBalance: bpiStart,
      currentBalance: bpiStart + netOf(bpi),
      icon: 'Building2',
      color: '#B91C1C',
      includeInTotalBalance: true,
      isArchived: false,
      createdAt: day(-100),
      updatedAt: nowISO,
    },
    {
      id: gcash,
      userId: 'user-1',
      name: 'GCash Wallet',
      bankPresetId: 'gcash',
      accountNumberMask: '•••• 0917',
      type: 'E_WALLET',
      currency: 'PHP',
      initialBalance: gcashStart,
      currentBalance: gcashStart + netOf(gcash),
      icon: 'Smartphone',
      color: '#0284C7',
      includeInTotalBalance: true,
      isArchived: false,
      createdAt: day(-100),
      updatedAt: nowISO,
    },
  ];

  // --- Budgets (current month only — never expired) -----------------------
  const budgets: Budget[] = [
    {
      id: 'dt-bud-food', userId: 'user-1', name: 'Food & Dining', amount: 3_000_000,
      currency: 'PHP', period: 'MONTHLY', startDate: monthStart, endDate: monthEnd,
      categoryIds: ['cat-food'], notifyThresholdPercentage: 80, isActive: true,
      createdAt: nowISO, updatedAt: nowISO,
    },
    {
      id: 'dt-bud-groceries', userId: 'user-1', name: 'Groceries & Household', amount: 2_500_000,
      currency: 'PHP', period: 'MONTHLY', startDate: monthStart, endDate: monthEnd,
      categoryIds: ['cat-groceries'], notifyThresholdPercentage: 80, isActive: true,
      createdAt: nowISO, updatedAt: nowISO,
    },
    {
      id: 'dt-bud-transport', userId: 'user-1', name: 'Transport', amount: 800_000,
      currency: 'PHP', period: 'MONTHLY', startDate: monthStart, endDate: monthEnd,
      categoryIds: ['cat-transport'], notifyThresholdPercentage: 80, isActive: true,
      createdAt: nowISO, updatedAt: nowISO,
    },
  ];

  // --- Savings goal ---------------------------------------------------------
  const goals: SavingsGoal[] = [
    {
      id: 'dt-goal-emergency',
      userId: 'user-1',
      name: 'Emergency Fund',
      targetAmount: 30_000_000, // 300,000
      currentAmount: 18_500_000, // 185,000
      targetDate: goalTargetDate,
      priority: 'ESSENTIAL',
      status: 'ON_TRACK',
      icon: 'Shield',
      color: '#059669',
      isArchived: false,
      createdAt: nowISO,
      updatedAt: nowISO,
    },
  ];

  // --- Bills & expected income ---------------------------------------------
  const nextPayday = dayOfMonth >= 15 ? on(1, 15) : on(0, 15);
  const commitments: MoneyCommitment[] = [
    {
      id: 'dt-comm-condo', userId: 'user-1', title: 'Condo Association Dues', type: 'BILL',
      amount: 3_500_00, currency: 'PHP', direction: 'OUTFLOW', status: 'COMPLETED',
      dueDate: day(-2), accountId: bpi, categoryId: 'cat-bills', priority: 'ESSENTIAL',
      createdAt: nowISO, updatedAt: nowISO,
    },
    {
      id: 'dt-comm-meralco', userId: 'user-1', title: 'Meralco / Power Bill', type: 'BILL',
      amount: 12_800_00, currency: 'PHP', direction: 'OUTFLOW', status: 'PROJECTED',
      dueDate: day(3), accountId: bpi, categoryId: 'cat-bills', priority: 'ESSENTIAL',
      notes: 'Estimate based on last month\u2019s usage.',
      createdAt: nowISO, updatedAt: nowISO,
    },
    {
      id: 'dt-comm-fiber', userId: 'user-1', title: 'Globe Home Fiber', type: 'SUBSCRIPTION',
      amount: 2_990_00, currency: 'PHP', direction: 'OUTFLOW', status: 'PROJECTED',
      dueDate: day(14), accountId: gcash, categoryId: 'cat-bills', priority: 'IMPORTANT',
      createdAt: nowISO, updatedAt: nowISO,
    },
    {
      id: 'dt-comm-netflix', userId: 'user-1', title: 'Netflix', type: 'SUBSCRIPTION',
      amount: 615_00, currency: 'PHP', direction: 'OUTFLOW', status: 'PROJECTED',
      dueDate: day(24), accountId: bpi, categoryId: 'cat-subscription', priority: 'OPTIONAL',
      relatedRecurringTransactionId: 'dt-rec-netflix',
      createdAt: nowISO, updatedAt: nowISO,
    },
    {
      id: 'dt-comm-spotify', userId: 'user-1', title: 'Spotify Premium', type: 'SUBSCRIPTION',
      amount: 485_00, currency: 'PHP', direction: 'OUTFLOW', status: 'PROJECTED',
      dueDate: day(9), accountId: gcash, categoryId: 'cat-subscription', priority: 'OPTIONAL',
      createdAt: nowISO, updatedAt: nowISO,
    },
    {
      id: 'dt-comm-payday', userId: 'user-1', title: 'Payday — 15th payroll', type: 'EXPECTED_INCOME',
      amount: 4_500_000, currency: 'PHP', direction: 'INFLOW', status: 'PROJECTED',
      dueDate: nextPayday, accountId: bpi, categoryId: 'cat-salary', priority: 'ESSENTIAL',
      isAutoGenerated: true, relatedRecurringTransactionId: 'dt-rec-salary',
      createdAt: nowISO, updatedAt: nowISO,
    },
  ];

  // --- Recurring rules -------------------------------------------------------
  const recurring: RecurringTransaction[] = [
    {
      id: 'dt-rec-salary', userId: 'user-1', title: 'Monthly Salary', amount: 4_500_000,
      currency: 'PHP', type: 'INCOME', categoryId: 'cat-salary', accountId: bpi,
      frequency: 'MONTHLY', startDate: on(-1, 30), nextOccurrence: nextPayday,
      isActive: true, reminderEnabled: true, autoPostEnabled: true,
      createdAt: nowISO, updatedAt: nowISO,
    },
    {
      id: 'dt-rec-netflix', userId: 'user-1', title: 'Netflix', amount: 615_00,
      currency: 'PHP', type: 'EXPENSE', categoryId: 'cat-subscription', accountId: bpi,
      frequency: 'MONTHLY', startDate: day(-6), nextOccurrence: day(24),
      isActive: true, reminderEnabled: true, autoPostEnabled: false,
      createdAt: nowISO, updatedAt: nowISO,
    },
    {
      id: 'dt-rec-water', userId: 'user-1', title: 'Manila Water Bill', amount: 1_200_00,
      currency: 'PHP', type: 'EXPENSE', categoryId: 'cat-bills', accountId: bpi,
      frequency: 'MONTHLY', startDate: day(-26), nextOccurrence: on(1, 3),
      isActive: true, reminderEnabled: true, autoPostEnabled: false,
      createdAt: nowISO, updatedAt: nowISO,
    },
  ];

  return {
    accounts,
    transactions,
    categories: INITIAL_CATEGORIES,
    budgets,
    goals,
    commitments,
    recurring,
    readNotificationIds: [],
    settings: {
      userId: 'user-1',
      userName: 'Juan Dela Cruz',
      currency: 'PHP',
      language: 'en',
      defaultTrackingPeriod: 'TODAY',
      budgetCycleMode: 'SEMI_MONTHLY_15_DAYS',
      semiMonthlyCutoffDay: 15,
      minimumReserve: 2_500_000, // 25,000.00 safety cushion
      safeToSpendPeriod: 'END_OF_MONTH',
      darkTheme: prefersDarkOS(),
      notificationsEnabled: true,
      budgetWarningThreshold: 80,
      autoGenerateCommitmentsFromRecurring: true,
      hasCompletedOnboarding: true,
    },
  };
}

// Clean Zero-State Template
export const CLEAN_ZERO_STATE: FinovaState = {
  accounts: [
    {
      id: 'acc-main',
      userId: 'user-1',
      name: 'Primary Wallet',
      type: 'E_WALLET',
      currency: 'PHP',
      initialBalance: 0,
      currentBalance: 0,
      icon: 'Smartphone',
      color: '#059669',
      includeInTotalBalance: true,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  transactions: [],
  categories: INITIAL_CATEGORIES,
  budgets: [],
  goals: [],
  commitments: [],
  recurring: [],
  readNotificationIds: [],
  settings: {
    userId: 'user-1',
    userName: 'FINOVA User',
    currency: 'PHP',
    language: 'en',
    defaultTrackingPeriod: 'TODAY',
    budgetCycleMode: 'SEMI_MONTHLY_15_DAYS',
    semiMonthlyCutoffDay: 15,
    minimumReserve: 0,
    safeToSpendPeriod: 'END_OF_MONTH',
    darkTheme: prefersDarkOS(),
    notificationsEnabled: true,
    budgetWarningThreshold: 80,
    autoGenerateCommitmentsFromRecurring: true,
    hasCompletedOnboarding: false,
  },
};

/**
 * Fresh installs follow the OS color scheme until the user picks otherwise
 * in Settings → Appearance. Guarded for non-DOM (test) environments.
 */
export function prefersDarkOS(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export class FinovaStorage {
  /** Point storage at a user's namespace. Call on login/logout transitions. */
  public static setScopeForUser(user: { id: string; isGuest?: boolean } | null): void {
    activeScope = user ? (user.isGuest ? 'guest' : `u:${user.id}`) : 'none';
  }

  public static getScope(): string {
    return activeScope;
  }

  /** Remove a user's stored data entirely (used on sign-out wipe). */
  public static wipeForUser(userId: string): void {
    localStorage.removeItem(`${STORAGE_KEY}:u:${userId}`);
  }

  private static scopedKey(): string {
    return activeScope === 'legacy' ? STORAGE_KEY : `${STORAGE_KEY}:${activeScope}`;
  }

  public static loadState(): FinovaState {
    try {
      const key = FinovaStorage.scopedKey();
      let serialized = localStorage.getItem(key);
      // One-time migration: the first scoped user inherits pre-scoping data.
      // Guarded by a device flag so a wiped namespace can never re-pull the
      // legacy (guest) data after the migration already happened once.
      if (!serialized && activeScope !== 'legacy' && activeScope !== 'none' && !localStorage.getItem(`${STORAGE_KEY}:migrated`)) {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) {
          localStorage.setItem(key, legacy);
          localStorage.setItem(`${STORAGE_KEY}:migrated`, '1');
          serialized = legacy;
        }
      }
      if (serialized) {
        const parsed = JSON.parse(serialized);
        const loadedSettings = { ...CLEAN_ZERO_STATE.settings, ...(parsed.settings || {}) };
        // Deep-clone fallback arrays: returning references into the shared
        // CLEAN_ZERO_STATE singleton lets one caller's in-place mutation
        // leak into the next caller's "clean" state.
        return structuredClone({
          accounts: parsed.accounts || CLEAN_ZERO_STATE.accounts,
          transactions: parsed.transactions || [],
          categories: parsed.categories || INITIAL_CATEGORIES,
          budgets: parsed.budgets || [],
          goals: parsed.goals || [],
          commitments: parsed.commitments || [],
          recurring: parsed.recurring || [],
          readNotificationIds: parsed.readNotificationIds || [],
          settings: loadedSettings,
        });
      }
    } catch (e) {
      console.warn('FinovaStorage load error, falling back to clean state', e);
    }

    return structuredClone(CLEAN_ZERO_STATE);
  }

  public static saveState(state: FinovaState): void {
    try {
      localStorage.setItem(FinovaStorage.scopedKey(), JSON.stringify(state));
    } catch (e) {
      console.error('FinovaStorage save error', e);
    }
  }

  public static resetToCleanSlate(currency: CurrencyCode = 'PHP', userName: string = 'FINOVA User'): FinovaState {
    const clean: FinovaState = {
      ...CLEAN_ZERO_STATE,
      accounts: [
        {
          id: 'acc-1',
          userId: 'user-1',
          name: 'Primary Wallet',
          type: 'E_WALLET',
          currency,
          initialBalance: 0,
          currentBalance: 0,
          icon: 'Smartphone',
          color: '#059669',
          includeInTotalBalance: true,
          isArchived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      transactions: [],
      budgets: [],
      goals: [],
      commitments: [],
      recurring: [],
      settings: {
        ...CLEAN_ZERO_STATE.settings,
        userName,
        currency,
        hasCompletedOnboarding: true,
      },
    };
    this.saveState(clean);
    return clean;
  }

  public static loadDemoShowcaseData(): FinovaState {
    // Dynamic demo: dates anchor to today so the showcase always looks alive.
    const demo = buildDemoState();
    this.saveState(demo);
    return demo;
  }

  public static setGlobalCurrency(state: FinovaState, newCurrency: CurrencyCode): FinovaState {
    const updatedState: FinovaState = {
      ...state,
      settings: {
        ...state.settings,
        currency: newCurrency,
      },
      accounts: state.accounts.map((a) => ({ ...a, currency: newCurrency })),
      transactions: state.transactions.map((t) => ({ ...t, currency: newCurrency })),
      commitments: state.commitments.map((c) => ({ ...c, currency: newCurrency })),
    };
    this.saveState(updatedState);
    return updatedState;
  }

  public static exportToCSV(transactions: Transaction[], categories: Category[], accounts: Account[]): string {
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const accMap = new Map(accounts.map((a) => [a.id, a.name]));

    // RFC-4180 cell: quote when needed, double any embedded quotes.
    // Previously category/account names were quoted WITHOUT escaping, so a
    // name containing a quote or comma corrupted the whole row.
    // Formula-injection guard: a leading = + - @ (or tab/CR) turns a cell
    // into a formula when the CSV is opened in Excel/Sheets. Neutralize it
    // with a leading apostrophe so user-entered names/notes can't execute.
    const cell = (value: string | number): string => {
      let s = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const headers = ['ID', 'Date', 'Time', 'Type', 'Amount', 'Currency', 'Category', 'Account', 'Destination Account', 'Merchant', 'Subtitle', 'Note', 'Status'];
    const rows = transactions.map((t) => {
      const multiplier = CURRENCY_CONFIGS[t.currency]?.minorUnitMultiplier ?? 100;
      const formattedAmount = (t.amount / multiplier).toFixed(multiplier === 1 ? 0 : 2);
      return [
        cell(t.id),
        cell(t.date),
        cell(t.time || ''),
        cell(t.type),
        cell(formattedAmount),
        cell(t.currency),
        cell(catMap.get(t.categoryId) || t.categoryId),
        cell(accMap.get(t.accountId) || t.accountId),
        cell(t.destinationAccountId ? accMap.get(t.destinationAccountId) || t.destinationAccountId : ''),
        cell(t.merchant || ''),
        cell(t.subtitle || ''),
        cell(t.note || ''),
        cell(t.status),
      ];
    });

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}
