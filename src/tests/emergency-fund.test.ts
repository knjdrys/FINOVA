/**
 * Emergency fund engine — an explainable reserve built from real data.
 * - monthly essential = average of essential-category spend over the last
 *   up-to-3 COMPLETE months only (never the in-progress month)
 * - target = user-picked multiplier (1..12, default 3) × monthly essential
 * - months covered = current reserve ÷ monthly essential
 * - honest statuses when there is not enough data (never fabricated)
 * - PENDING, foreign-currency, and goal-funding rows never count
 */
import { describe, it, expect } from 'vitest';
import {
  EmergencyFundEngine,
  EF_DEFAULT_MONTHS,
  EF_MAX_MONTHS,
} from '../domain/emergency/EmergencyFundEngine';
import { Category, CurrencyCode, Transaction, UserSettings } from '../types';

/** Local-time ISO date N complete months before the current one. */
const month = (offset: number, day = 15): string => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - offset, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const tx = (over: Partial<Transaction>): Transaction => ({
  id: `tx-${Math.random().toString(36).slice(2, 10)}`,
  userId: 'user-1',
  type: 'EXPENSE',
  amount: 0,
  currency: 'PHP' as CurrencyCode,
  categoryId: 'cat-bills',
  accountId: 'acc-1',
  merchant: 'test',
  date: month(1),
  time: '12:00',
  tags: [],
  status: 'CONFIRMED',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

const settings = (over: Partial<UserSettings> = {}): UserSettings => ({
  userId: 'user-1',
  userName: 'Test',
  currency: 'PHP' as CurrencyCode,
  defaultTrackingPeriod: 'THIS_MONTH',
  budgetCycleMode: 'MONTHLY',
  semiMonthlyCutoffDay: 15,
  minimumReserve: 1000000,
  safeToSpendPeriod: 'END_OF_MONTH',
  darkTheme: false,
  notificationsEnabled: false,
  budgetWarningThreshold: 80,
  autoGenerateCommitmentsFromRecurring: false,
  ...over,
});

const categories: Category[] = [
  { id: 'cat-bills', userId: 'user-1', name: 'Bills', type: 'EXPENSE', icon: 'Zap', color: '#000', isSystem: true, isArchived: false },
  { id: 'cat-groceries', userId: 'user-1', name: 'Groceries', type: 'EXPENSE', icon: 'ShoppingCart', color: '#000', isSystem: true, isArchived: false },
  { id: 'cat-food', userId: 'user-1', name: 'Food', type: 'EXPENSE', icon: 'Utensils', color: '#000', isSystem: true, isArchived: false },
];

/** Three complete months with essential + non-essential spend. */
const threeMonths = (): Transaction[] => [
  // June (offset 3): 300k essential, 50k food
  tx({ categoryId: 'cat-bills', amount: 200000, date: month(3) }),
  tx({ categoryId: 'cat-groceries', amount: 100000, date: month(3) }),
  tx({ categoryId: 'cat-food', amount: 50000, date: month(3) }),
  // July (offset 2): 400k essential, 80k food
  tx({ categoryId: 'cat-bills', amount: 250000, date: month(2) }),
  tx({ categoryId: 'cat-groceries', amount: 150000, date: month(2) }),
  tx({ categoryId: 'cat-food', amount: 80000, date: month(2) }),
  // August (offset 1): 500k essential, 60k food
  tx({ categoryId: 'cat-bills', amount: 300000, date: month(1) }),
  tx({ categoryId: 'cat-groceries', amount: 200000, date: month(1) }),
  tx({ categoryId: 'cat-food', amount: 60000, date: month(1) }),
];

describe('core report math', () => {
  it('averages essential spend over the last 3 complete months and applies the default 3× multiplier', () => {
    const r = EmergencyFundEngine.computeReport(settings(), threeMonths(), categories);
    expect(r.monthsAnalyzed).toBe(3);
    expect(r.monthlyEssentialMinor).toBe(400000); // (300k + 400k + 500k) / 3
    expect(r.monthsMultiplier).toBe(EF_DEFAULT_MONTHS);
    expect(r.targetMinor).toBe(1200000);
    expect(r.currentMinor).toBe(1000000);
    expect(r.remainingMinor).toBe(200000);
    expect(r.status).toBe('BUILDING');
  });

  it('computes months covered, progress, and the ON_TARGET boundary', () => {
    const r = EmergencyFundEngine.computeReport(settings(), threeMonths(), categories);
    expect(r.monthsCovered).toBeCloseTo(2.5, 5);
    expect(r.progressPct).toBe(83);
    const covered = EmergencyFundEngine.computeReport(settings({ minimumReserve: 1200000 }), threeMonths(), categories);
    expect(covered.status).toBe('ON_TARGET');
    expect(covered.remainingMinor).toBe(0);
    expect(covered.progressPct).toBe(100);
  });

  it('never counts the in-progress month', () => {
    const withCurrentMonth = [
      ...threeMonths(),
      tx({ categoryId: 'cat-bills', amount: 9999999, date: month(0, 5) }),
    ];
    const r = EmergencyFundEngine.computeReport(settings(), withCurrentMonth, categories);
    expect(r.monthlyEssentialMinor).toBe(400000); // unchanged
  });
});

describe('user controls', () => {
  it('clamps the multiplier into 1..12', () => {
    expect(EmergencyFundEngine.clampEfMonths(0)).toBe(1);
    expect(EmergencyFundEngine.clampEfMonths(99)).toBe(EF_MAX_MONTHS);
    expect(EmergencyFundEngine.clampEfMonths(undefined)).toBe(EF_DEFAULT_MONTHS);
    const big = EmergencyFundEngine.computeReport(settings({ emergencyFundMonths: 99 }), threeMonths(), categories);
    expect(big.monthsMultiplier).toBe(12);
    expect(big.targetMinor).toBe(4800000);
  });

  it('honors a custom essential-category selection', () => {
    const r = EmergencyFundEngine.computeReport(
      settings({ essentialCategoryIds: ['cat-food'] }),
      threeMonths(),
      categories
    );
    expect(r.monthlyEssentialMinor).toBe(63333); // (50k + 80k + 60k)/3 rounded
    expect(r.essentialCategoryIds).toEqual(['cat-food']);
  });

  it('falls back to bills + groceries when no selection is saved', () => {
    const r = EmergencyFundEngine.computeReport(settings(), threeMonths(), categories);
    expect(r.essentialCategoryIds).toEqual(['cat-bills', 'cat-groceries']);
  });
});

describe('honest statuses (no fabricated numbers)', () => {
  it('NO_ESSENTIAL_DATA when there is no spending at all', () => {
    const r = EmergencyFundEngine.computeReport(settings(), [], categories);
    expect(r.status).toBe('NO_ESSENTIAL_DATA');
    expect(r.monthsAnalyzed).toBe(0);
    expect(r.targetMinor).toBe(0);
    expect(r.monthsCovered).toBeNull();
    expect(r.progressPct).toBe(0);
  });

  it('NO_ESSENTIAL_SPEND when only non-essential categories were spent', () => {
    const r = EmergencyFundEngine.computeReport(
      settings(),
      [tx({ categoryId: 'cat-food', amount: 100000, date: month(1) })],
      categories
    );
    expect(r.status).toBe('NO_ESSENTIAL_SPEND');
    expect(r.monthsAnalyzed).toBe(1);
    expect(r.targetMinor).toBe(0);
  });

  it('ignores partial (empty) months in the average', () => {
    // Only July + August have spend → average over 2 months, not 3.
    const r = EmergencyFundEngine.computeReport(
      settings(),
      [
        tx({ categoryId: 'cat-bills', amount: 250000, date: month(2) }),
        tx({ categoryId: 'cat-groceries', amount: 150000, date: month(2) }),
        tx({ categoryId: 'cat-bills', amount: 300000, date: month(1) }),
        tx({ categoryId: 'cat-groceries', amount: 200000, date: month(1) }),
      ],
      categories
    );
    expect(r.monthsAnalyzed).toBe(2);
    expect(r.monthlyEssentialMinor).toBe(450000); // (400k + 500k)/2
  });
});

describe('invariants', () => {
  it('PENDING, foreign-currency, and goal-funding rows never count', () => {
    const rows = [
      ...threeMonths(),
      tx({ categoryId: 'cat-bills', amount: 888888, date: month(1), status: 'PENDING' }),
      tx({ categoryId: 'cat-bills', amount: 888888, date: month(1), currency: 'USD' }),
      tx({ categoryId: 'cat-transfer', amount: 888888, date: month(1), tags: ['goal-fund'] }),
    ];
    const r = EmergencyFundEngine.computeReport(settings(), rows, categories);
    expect(r.monthlyEssentialMinor).toBe(400000); // unchanged
  });

  it('income never counts toward essential spend', () => {
    const rows = [
      ...threeMonths(),
      tx({ type: 'INCOME', categoryId: 'cat-bills', amount: 5000000, date: month(1) }),
    ];
    const r = EmergencyFundEngine.computeReport(settings(), rows, categories);
    expect(r.monthlyEssentialMinor).toBe(400000);
  });

  it('clamps a negative reserve to zero', () => {
    const r = EmergencyFundEngine.computeReport(settings({ minimumReserve: -50 }), threeMonths(), categories);
    expect(r.currentMinor).toBe(0);
  });
});
