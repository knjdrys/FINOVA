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
  { id: 'cat-general', userId: 'user-1', name: 'General', type: 'EXPENSE', icon: 'CircleDollarSign', emoji: '💵', color: '#64748B', bgColor: '#F1F5F9', isSystem: true, isArchived: false },
  { id: 'cat-salary', userId: 'user-1', name: 'Salary', type: 'INCOME', icon: 'Briefcase', emoji: '💼', color: '#0D9488', bgColor: '#CCFBF1', isSystem: true, isArchived: false },
  { id: 'cat-freelance', userId: 'user-1', name: 'Freelance', type: 'INCOME', icon: 'Laptop', emoji: '💻', color: '#7C3AED', bgColor: '#EDE9FE', isSystem: true, isArchived: false },
  { id: 'cat-transfer', userId: 'user-1', name: 'Transfer', type: 'EXPENSE', icon: 'ArrowRightLeft', emoji: '🔄', color: '#475569', bgColor: '#F1F5F9', isSystem: true, isArchived: false },
];

export const DEMO_ACCOUNTS: Account[] = [
  {
    id: 'acc-bpi',
    userId: 'user-1',
    name: 'BPI Savings (Main Payroll)',
    bankPresetId: 'bpi',
    accountNumberMask: '•••• 4829',
    type: 'BANK',
    currency: 'PHP',
    initialBalance: 9722100, // 97,221.00
    currentBalance: 9722100,
    icon: 'Building2',
    color: '#B91C1C',
    includeInTotalBalance: true,
    isArchived: false,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'acc-gcash',
    userId: 'user-1',
    name: 'GCash Wallet',
    bankPresetId: 'gcash',
    accountNumberMask: '•••• 0917',
    type: 'E_WALLET',
    currency: 'PHP',
    initialBalance: 1118000, // 11,180.00
    currentBalance: 1118000,
    icon: 'Smartphone',
    color: '#0284C7',
    includeInTotalBalance: true,
    isArchived: false,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  },
];

export const DEMO_SETTINGS: UserSettings = {
  userId: 'user-1',
  userName: 'Juan Dela Cruz',
  currency: 'PHP',
  language: 'en',
  defaultTrackingPeriod: 'TODAY',
  budgetCycleMode: 'SEMI_MONTHLY_15_DAYS',
  semiMonthlyCutoffDay: 15,
  minimumReserve: 2500000, // 25,000.00
  safeToSpendPeriod: 'END_OF_MONTH',
  darkTheme: false,
  notificationsEnabled: true,
  budgetWarningThreshold: 80,
  autoGenerateCommitmentsFromRecurring: true,
  hasCompletedOnboarding: true,
};

export const DEMO_BUDGETS: Budget[] = [
  {
    id: 'bud-food',
    userId: 'user-1',
    name: 'Food & Dining',
    amount: 3000000, // 30,000
    period: 'MONTHLY',
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    categoryIds: ['cat-food'],
    notifyThresholdPercentage: 80,
    isActive: true,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'bud-groceries',
    userId: 'user-1',
    name: 'Groceries & Household',
    amount: 2500000, // 25,000
    period: 'MONTHLY',
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    categoryIds: ['cat-groceries'],
    notifyThresholdPercentage: 80,
    isActive: true,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  },
];

export const DEMO_GOALS: SavingsGoal[] = [
  {
    id: 'goal-emergency',
    userId: 'user-1',
    name: 'Emergency Fund',
    targetAmount: 30000000, // 300,000
    currentAmount: 18500000, // 185,000
    targetDate: '2026-11-30',
    priority: 'ESSENTIAL',
    status: 'ON_TRACK',
    icon: 'Shield',
    color: '#059669',
    isArchived: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  },
];

export const DEMO_COMMITMENTS: MoneyCommitment[] = [
  {
    id: 'comm-electric',
    userId: 'user-1',
    title: 'Meralco / Power Utility Bill',
    type: 'BILL',
    amount: 1450000,
    currency: 'PHP',
    direction: 'OUTFLOW',
    status: 'PROJECTED',
    dueDate: '2026-05-20',
    accountId: 'acc-bpi',
    categoryId: 'cat-bills',
    priority: 'ESSENTIAL',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  },
];

export const DEMO_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    userId: 'user-1',
    type: 'EXPENSE',
    amount: 1000000, // 10,000.00
    currency: 'PHP',
    categoryId: 'cat-food',
    accountId: 'acc-bpi',
    merchant: 'Food',
    subtitle: 'Grocery',
    note: 'Imtiaz Stores | BPI Savings | Groceries',
    date: '2026-05-17',
    time: '11:45',
    tags: ['food', 'groceries'],
    status: 'CONFIRMED',
    createdAt: '2026-05-17T11:45:00Z',
    updatedAt: '2026-05-17T11:45:00Z',
  },
  {
    id: 'tx-2',
    userId: 'user-1',
    type: 'EXPENSE',
    amount: 118000, // 1,180.00
    currency: 'PHP',
    categoryId: 'cat-groceries',
    accountId: 'acc-gcash',
    merchant: 'Groceries',
    subtitle: 'POS Transaction at Supermarket Store',
    note: 'Puregold Market | GCash | Other',
    date: '2026-05-13',
    time: '18:20',
    tags: ['groceries', 'pos'],
    status: 'CONFIRMED',
    createdAt: '2026-05-13T18:20:00Z',
    updatedAt: '2026-05-13T18:20:00Z',
  },
  {
    id: 'tx-3',
    userId: 'user-1',
    type: 'EXPENSE',
    amount: 90100, // 901.00
    currency: 'PHP',
    categoryId: 'cat-bills',
    accountId: 'acc-gcash',
    merchant: 'Bills',
    subtitle: 'Monthly Telecom Fiber Top-up',
    note: 'Globe Telecom | GCash | Utilities',
    date: '2026-05-12',
    time: '09:15',
    tags: ['bills', 'utility'],
    status: 'CONFIRMED',
    createdAt: '2026-05-12T09:15:00Z',
    updatedAt: '2026-05-12T09:15:00Z',
  },
  {
    id: 'tx-4',
    userId: 'user-1',
    type: 'EXPENSE',
    amount: 9632000, // 96,320.00
    currency: 'PHP',
    categoryId: 'cat-shopping',
    accountId: 'acc-bpi',
    merchant: 'Tech & Electronics',
    subtitle: 'Gadgets & Home Studio',
    note: 'Digital Store | BPI Savings | Shopping',
    date: '2026-05-08',
    time: '14:30',
    tags: ['tech', 'shopping'],
    status: 'CONFIRMED',
    createdAt: '2026-05-08T14:30:00Z',
    updatedAt: '2026-05-08T14:30:00Z',
  },
];

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
    userName: 'PALDO User',
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
        // System seeds are code-owned: backfill any the stored state predates
        // (e.g. cat-general) without touching the user's own rows.
        const storedCategories: Category[] = Array.isArray(parsed.categories)
          ? parsed.categories
          : INITIAL_CATEGORIES;
        const knownIds = new Set(storedCategories.map((c) => c.id));
        const backfilledCategories = [
          ...storedCategories,
          ...INITIAL_CATEGORIES.filter((seed) => seed.isSystem && !knownIds.has(seed.id)),
        ];
        // Deep-clone fallback arrays: returning references into the shared
        // CLEAN_ZERO_STATE singleton lets one caller's in-place mutation
        // leak into the next caller's "clean" state.
        return structuredClone({
          accounts: parsed.accounts || CLEAN_ZERO_STATE.accounts,
          transactions: parsed.transactions || [],
          categories: backfilledCategories,
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

  public static resetToCleanSlate(currency: CurrencyCode = 'PHP', userName: string = 'PALDO User'): FinovaState {
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
    const demo: FinovaState = {
      accounts: DEMO_ACCOUNTS,
      transactions: DEMO_TRANSACTIONS,
      categories: INITIAL_CATEGORIES,
      budgets: DEMO_BUDGETS,
      goals: DEMO_GOALS,
      commitments: DEMO_COMMITMENTS,
      recurring: [],
      readNotificationIds: [],
      settings: DEMO_SETTINGS,
    };
    this.saveState(demo);
    return demo;
  }

  /**
   * Currency-change gate. There is no FX engine, so switching currency after
   * money exists would silently rewrite what every amount MEANS (₱50,000
   * becoming $50,000). The app therefore locks the currency once any
   * financial data exists; changing it is only safe on a clean slate.
   */
  public static canChangeGlobalCurrency(state: FinovaState): boolean {
    if (state.transactions.length > 0) return false;
    if (state.budgets.length > 0) return false;
    if (state.goals.length > 0) return false;
    if (state.commitments.length > 0) return false;
    if (state.recurring.length > 0) return false;
    return state.accounts.every((a) => a.initialBalance === 0 && a.currentBalance === 0);
  }

  public static setGlobalCurrency(state: FinovaState, newCurrency: CurrencyCode): FinovaState {
    if (state.settings.currency === newCurrency) return state;
    // Defense in depth: callers check canChangeGlobalCurrency first (to
    // explain the lock), but the relabel itself never runs on live data.
    if (!FinovaStorage.canChangeGlobalCurrency(state)) return state;
    const updatedState: FinovaState = {
      ...state,
      settings: {
        ...state.settings,
        currency: newCurrency,
      },
      accounts: state.accounts.map((a) => ({ ...a, currency: newCurrency })),
      transactions: state.transactions.map((t) => ({ ...t, currency: newCurrency })),
      budgets: state.budgets.map((b) => ({ ...b, currency: newCurrency })),
      goals: state.goals.map((g) => ({ ...g, currency: newCurrency })),
      commitments: state.commitments.map((c) => ({ ...c, currency: newCurrency })),
      recurring: state.recurring.map((r) => ({ ...r, currency: newCurrency })),
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
