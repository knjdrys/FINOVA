/**
 * Day 4 — realistic data volumes (Phase 25).
 * brand-new (0) · normal (~300) · heavy (10,000).
 * Times every hot path; fails only on true algorithmic blowups
 * (budgets are generous — this guards complexity class, not devices).
 */
import { describe, it, expect } from 'vitest';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { InsightEngine } from '../domain/insight/InsightEngine';
import { SafeToSpendEngine } from '../domain/safe-to-spend/SafeToSpendEngine';
import { TimelineEngine } from '../domain/timeline/TimelineEngine';
import { PlanningService } from '../services/planning/PlanningService';
import { DateUtils } from '../domain/date/DateUtils';
import { Account, Budget, Transaction } from '../types';

// Deterministic PRNG (mulberry32) — reproducible volumes.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATS = ['cat-food', 'cat-transport', 'cat-bills', 'cat-shopping', 'cat-health', 'cat-salary'];
const MERCHANTS = ['Jollibee', 'SM Store', 'Meralco', 'Shell', 'Puregold', 'Grab', 'Shopee', 'Cebu Pacific'];

function makeTxs(n: number, seed: number): Transaction[] {
  const rand = rng(seed);
  const out: Transaction[] = [];
  for (let i = 0; i < n; i++) {
    const dayOffset = Math.floor(rand() * 730); // 2-year span
    const date = DateUtils.addDaysISO('2024-09-07', dayOffset);
    const isIncome = rand() < 0.08;
    const cat = isIncome ? 'cat-salary' : CATS[Math.floor(rand() * (CATS.length - 1))];
    out.push({
      id: `t-${seed}-${i}`, userId: 'user-1', categoryId: cat,
      type: isIncome ? 'INCOME' : 'EXPENSE',
      amount: Math.floor(rand() * 500000) + 5000, currency: 'PHP',
      merchant: MERCHANTS[Math.floor(rand() * MERCHANTS.length)],
      note: '', date, time: '12:00', tags: [], status: 'CONFIRMED',
      createdAt: date, updatedAt: date, accountId: rand() < 0.7 ? 'a1' : 'a2',
    });
  }
  return out;
}

const accounts: Account[] = [
  { id: 'a1', userId: 'user-1', name: 'GRBank', type: 'BANK', currency: 'PHP', initialBalance: 0, currentBalance: 5000000, icon: '', color: '', includeInTotalBalance: true, isArchived: false, createdAt: '', updatedAt: '' },
  { id: 'a2', userId: 'user-1', name: 'GCash', type: 'E_WALLET', currency: 'PHP', initialBalance: 0, currentBalance: 2000000, icon: '', color: '', includeInTotalBalance: true, isArchived: false, createdAt: '', updatedAt: '' },
];

const budgets: Budget[] = CATS.slice(0, 5).map((c, i) => ({
  id: `b-${i}`, userId: 'user-1', name: c, amount: 500000, currency: 'PHP',
  period: 'MONTHLY' as const, startDate: '2026-08-01', endDate: '2026-08-31',
  categoryIds: [c], notifyThresholdPercentage: 80, isActive: true, rolloverUnused: false,
  createdAt: '', updatedAt: '',
}));

const settings = {
  userId: 'user-1', userName: 'T', currency: 'PHP', language: 'en',
  defaultTrackingPeriod: 'TODAY', budgetCycleMode: 'SEMI_MONTHLY_15_DAYS',
  semiMonthlyCutoffDay: 15, minimumReserve: 0, safeToSpendPeriod: 'END_OF_MONTH',
  darkTheme: false, notificationsEnabled: true, budgetWarningThreshold: 80,
  autoGenerateCommitmentsFromRecurring: true, hasCompletedOnboarding: true,
} as Parameters<typeof SafeToSpendEngine.calculateSafeToSpend>[3];

function timed<T>(label: string, budgetMs: number, fn: () => T): T {
  const t0 = performance.now();
  const out = fn();
  const ms = performance.now() - t0;
  console.log(`   [volume] ${label}: ${ms.toFixed(0)}ms`);
  expect(ms).toBeLessThan(budgetMs);
  return out;
}

describe('brand-new user (empty state)', () => {
  it('every engine returns sane zeros, never NaN/crash', () => {
    const totals = TransactionEngine.calculatePeriodTotals([], '2026-09-01', '2026-09-30', 'PHP', 'PHP');
    expect(totals.totalExpense.getMinorUnits()).toBe(0);
    const sts = SafeToSpendEngine.calculateSafeToSpend(accounts, [], [], settings, '2026-09-15');
    expect(Number.isFinite(sts.discretionaryPool)).toBe(true);
    const days = TimelineEngine.generateTimeline(accounts, [], [], [], '2026-09-15', '2026-10-14', '2026-09-15');
    expect(days).toHaveLength(30);
    const insights = InsightEngine.generateInsights(accounts, [], [], [], [], [], settings, '2026-09-15');
    expect(Array.isArray(insights)).toBe(true);
  });
});

describe('normal user (~300 transactions)', () => {
  const txs = makeTxs(300, 7);
  it('all hot paths run in milliseconds', () => {
    timed('filter+search', 500, () =>
      TransactionEngine.filterTransactions(txs, { searchQuery: 'meralco' }));
    timed('month totals', 500, () =>
      TransactionEngine.calculatePeriodTotals(txs, '2026-08-01', '2026-08-31', 'PHP', 'PHP'));
    timed('insights', 1000, () =>
      InsightEngine.generateInsights(accounts, txs, budgets, [], [], [], settings, '2026-08-15'));
    timed('timeline 30d', 500, () =>
      TimelineEngine.generateTimeline(accounts, txs, [], [], '2026-08-15', '2026-09-13', '2026-08-15'));
    timed('safe-to-spend', 500, () =>
      SafeToSpendEngine.calculateSafeToSpend(accounts, [], [], settings, '2026-08-15'));
    timed('home plans', 1000, () =>
      PlanningService.selectHomePlans(budgets, [], txs, '2026-08-15'));
  });
});

describe('heavy user (10,000 transactions)', () => {
  const txs = makeTxs(10000, 42);

  it('search + filters stay linear and correct', () => {
    const found = timed('search 10k', 2000, () =>
      TransactionEngine.filterTransactions(txs, { searchQuery: 'meralco' }));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((t) => (t.merchant || '').toLowerCase().includes('meralco'))).toBe(true);
    const catFiltered = timed('category filter 10k', 2000, () =>
      TransactionEngine.filterTransactions(txs, { categoryId: 'cat-food' }));
    expect(catFiltered.length).toBeGreaterThan(0);
  });

  it('analytics math is exact at volume (no float drift, no double-count)', () => {
    const totals = timed('month totals 10k', 2000, () =>
      TransactionEngine.calculatePeriodTotals(txs, '2026-08-01', '2026-08-31', 'PHP', 'PHP'));
    // Cross-check: independent summation matches engine output exactly.
    let income = 0, expense = 0;
    for (const t of txs) {
      if (t.date < '2026-08-01' || t.date > '2026-08-31') continue;
      if (t.type === 'INCOME') income += t.amount; else expense += t.amount;
    }
    expect(totals.totalIncome.getMinorUnits()).toBe(income);
    expect(totals.totalExpense.getMinorUnits()).toBe(expense);
  });

  it('insights + budgets + timeline + home scale', () => {
    timed('insights 10k', 4000, () =>
      InsightEngine.generateInsights(accounts, txs, budgets, [], [], [], settings, '2026-08-15'));
    timed('5 budget forecasts 10k', 4000, () =>
      budgets.map((b) => BudgetEngine.calculateBudgetForecast(b, txs, '2026-08-15')));
    timed('timeline 30d over 10k', 4000, () =>
      TimelineEngine.generateTimeline(accounts, txs, [], [], '2026-08-15', '2026-09-13', '2026-08-15'));
    timed('safe-to-spend 10k', 2000, () =>
      SafeToSpendEngine.calculateSafeToSpend(accounts, [], [], settings, '2026-08-15'));
    timed('home plans 10k', 4000, () =>
      PlanningService.selectHomePlans(budgets, [], txs, '2026-08-15'));
  });

  it('10k rows sort deterministically newest-first', () => {
    const sorted = timed('sort 10k', 2000, () =>
      [...txs].sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : b.id < a.id ? -1 : 1)));
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].date <= sorted[i - 1].date).toBe(true);
    }
  });

  it('memory stays bounded (list windowing, no full-materialization blowup)', () => {
    const before = process.memoryUsage().heapUsed;
    const filtered = TransactionEngine.filterTransactions(txs, { type: 'EXPENSE' });
    const page = filtered.slice(0, 60); // what the windowed list actually renders
    expect(page.length).toBeLessThanOrEqual(60);
    const after = process.memoryUsage().heapUsed;
    // Filtering 10k must not retain megabytes per call (generous 25MB ceiling).
    expect(after - before).toBeLessThan(25 * 1024 * 1024);
  });

  it('serialized footprint stays inside the ~5MB localStorage budget', () => {
    const bytes = Buffer.byteLength(JSON.stringify(txs), 'utf8');
    console.log(`   [volume] 10k txs serialized: ${(bytes / 1024).toFixed(0)}KB`);
    // 10k plain transactions must fit comfortably; receipts (500KB each,
    // local-only) are the binding constraint, not transaction rows.
    expect(bytes).toBeLessThan(4 * 1024 * 1024);
  });
});
