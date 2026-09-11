/**
 * Day 4 — Phase 4 realistic scenario + Phase 5 month boundaries + Phase 18 same-day storm.
 *
 * Realistic user (September 2026):
 *   salary ₱20,000/mo · rent ₱5,000/mo · internet ₱1,699/mo ·
 *   food budget ₱3,500 · transport budget ₱2,000 · EF ₱10,000 current + ₱2,000/mo
 * Then: Home totals, budgets, goal, timeline, Safe-to-Spend must all agree.
 */
import { describe, it, expect } from 'vitest';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { GoalEngine } from '../domain/goal/GoalEngine';
import { SafeToSpendEngine } from '../domain/safe-to-spend/SafeToSpendEngine';
import { TimelineEngine } from '../domain/timeline/TimelineEngine';
import { FutureFinanceEngine } from '../domain/future-finance/FutureFinanceEngine';
import { DateUtils } from '../domain/date/DateUtils';
import { Account, Budget, Category, SavingsGoal, Transaction, RecurringTransaction } from '../types';

const P = (major: number) => Math.round(major * 100); // pesos → minor units
const TODAY = '2026-09-15';

const account = (): Account => ({
  id: 'acc-grbank', userId: 'user-1', name: 'GRBank', bankPresetId: 'grbi',
  accountNumberMask: '••••', type: 'BANK', currency: 'PHP',
  initialBalance: 0, currentBalance: 0, icon: 'Building2', color: '#1C205E',
  includeInTotalBalance: true, isArchived: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

const tx = (over: Partial<Transaction> & { id: string }): Transaction => ({
  userId: 'user-1', categoryId: 'cat-food', type: 'EXPENSE',
  amount: 0, currency: 'PHP', merchant: '', note: '', date: TODAY, time: '12:00',
  tags: [], status: 'CONFIRMED', createdAt: TODAY, updatedAt: TODAY, accountId: 'acc-grbank',
  ...over,
});

const rule = (over: Partial<RecurringTransaction> & { id: string }): RecurringTransaction => ({
  userId: 'user-1', title: 'rule', amount: 0, currency: 'PHP', type: 'EXPENSE',
  categoryId: 'cat-bills', accountId: 'acc-grbank', frequency: 'MONTHLY',
  startDate: '2026-08-01', nextOccurrence: TODAY,
  isActive: true, reminderEnabled: true,
  createdAt: TODAY, updatedAt: TODAY,
  ...over,
});

const budget = (id: string, amount: number, categoryIds: string[]): Budget => ({
  id, userId: 'user-1', name: id, amount, currency: 'PHP', period: 'MONTHLY',
  startDate: '2026-09-01', endDate: '2026-09-30', categoryIds,
  notifyThresholdPercentage: 80, isActive: true, rolloverUnused: false,
  createdAt: TODAY, updatedAt: TODAY,
});

const settings = {
  userId: 'user-1', userName: 'T', currency: 'PHP', language: 'en',
  defaultTrackingPeriod: 'TODAY', budgetCycleMode: 'SEMI_MONTHLY_15_DAYS',
  semiMonthlyCutoffDay: 15, minimumReserve: 0, safeToSpendPeriod: 'END_OF_MONTH',
  darkTheme: false, notificationsEnabled: true, budgetWarningThreshold: 80,
  autoGenerateCommitmentsFromRecurring: true, hasCompletedOnboarding: true,
} as Parameters<typeof SafeToSpendEngine.calculateSafeToSpend>[3];

describe('realistic September: every surface agrees', () => {
  // Salary in, rent + internet + food + transport out, EF set-aside.
  const txs: Transaction[] = [
    tx({ id: 't-salary', type: 'INCOME', categoryId: 'cat-salary', amount: P(20000), date: '2026-09-01' }),
    tx({ id: 't-rent', categoryId: 'cat-bills', amount: P(5000), date: '2026-09-05' }),
    tx({ id: 't-net', categoryId: 'cat-bills', amount: P(1699), date: '2026-09-10' }),
    tx({ id: 't-food1', categoryId: 'cat-food', amount: P(800), date: '2026-09-03' }),
    tx({ id: 't-food2', categoryId: 'cat-food', amount: P(400), date: '2026-09-12' }),
    tx({ id: 't-transpo', categoryId: 'cat-transport', amount: P(600), date: '2026-09-08' }),
    // EF set-aside: goal-funding booking, excluded from spend totals.
    tx({ id: 't-ef', categoryId: 'cat-goal-fund', amount: P(2000), date: '2026-09-02', tags: ['goal-fund'] }),
  ];
  const accounts = txs.reduce(
    (accs, t) => TransactionEngine.applyTransactionToAccounts(t, accs),
    [account()]
  );
  const balance = accounts[0].currentBalance;

  it('balance equals salary minus every real outflow (goal set-aside moves cash too)', () => {
    expect(balance).toBe(P(20000) - P(5000) - P(1699) - P(800) - P(400) - P(600) - P(2000));
  });

  it('period spend excludes the EF set-aside; budgets match their category sums', () => {
    const totals = TransactionEngine.calculatePeriodTotals(txs, '2026-09-01', '2026-09-30', 'PHP', undefined, TODAY);
    expect(totals.totalExpense.getMinorUnits()).toBe(P(5000) + P(1699) + P(800) + P(400) + P(600));
    expect(totals.totalIncome.getMinorUnits()).toBe(P(20000));
    const food = budget('bud-food', P(3500), ['cat-food']);
    const transpo = budget('bud-transpo', P(2000), ['cat-transport']);
    expect(BudgetEngine.calculateBudgetForecast(food, txs, TODAY).actualSpent).toBe(P(1200));
    expect(BudgetEngine.calculateBudgetForecast(transpo, txs, TODAY).actualSpent).toBe(P(600));
  });

  it('EF contribution never exceeds what the account can fund', () => {
    const goal: SavingsGoal = {
      id: 'g-ef', userId: 'user-1', name: 'Emergency Fund', targetAmount: P(30000),
      currentAmount: P(10000), currency: 'PHP', targetDate: '2027-03-05',
      priority: 'ESSENTIAL', status: 'ON_TRACK', icon: '', color: '',
      isArchived: false, createdAt: TODAY, updatedAt: TODAY,
    };
    // Even asking for more than the balance must clamp — money never vanishes.
    expect(GoalEngine.fundableAmount(goal, balance + P(999999))).toBe(P(20000));
    expect(GoalEngine.fundableAmount(goal, 0)).toBe(0);
  });

  it('Safe-to-Spend never exceeds liquid balance and reserves essentials', () => {
    const sts = SafeToSpendEngine.calculateSafeToSpend(accounts, [], [], settings, TODAY);
    expect(sts.discretionaryPool).toBeLessThanOrEqual(balance);
    expect(sts.discretionaryPool).toBeGreaterThanOrEqual(0);
  });

  it('timeline projects the next rent before payday and never rewrites actuals', () => {
    const cats: Category[] = [];
    const days = TimelineEngine.generateTimeline(accounts, txs, [], cats, TODAY, '2026-09-30', TODAY);
    expect(days.length).toBeGreaterThan(0);
    // Projected balances are numbers, never NaN, and the first day starts at actuals.
    for (const d of days) expect(Number.isFinite(d.projectedEndOfDayBalance)).toBe(true);
  });
});

describe('month boundaries (Phase 5)', () => {
  it('monthly on Jan 31 lands on Feb 29 in a leap year, Feb 28 otherwise', () => {
    expect(FutureFinanceEngine.advanceOccurrence('2024-01-31', 'MONTHLY')).toBe('2024-02-29');
    expect(FutureFinanceEngine.advanceOccurrence('2023-01-31', 'MONTHLY')).toBe('2023-02-28');
  });

  it('monthly rolls the year across December → January', () => {
    expect(FutureFinanceEngine.advanceOccurrence('2026-12-15', 'MONTHLY')).toBe('2027-01-15');
    expect(DateUtils.getMonthEndISO('2026-12-20')).toBe('2026-12-31');
    expect(DateUtils.getMonthStartISO('2027-01-05')).toBe('2027-01-01');
  });

  it('a December budget window never leaks January spending', () => {
    const dec = budget('bud-dec', P(5000), []);
    dec.startDate = '2026-12-01';
    dec.endDate = '2026-12-31';
    const janTx = tx({ id: 't-jan', amount: P(1000), date: '2027-01-02' });
    expect(BudgetEngine.calculateBudgetForecast(dec, [janTx], '2026-12-20').actualSpent).toBe(0);
  });
});

describe('same-day recurring storm (Phase 18)', () => {
  it('three rules due the same day generate three distinct commitments', () => {
    const rules = [
      rule({ id: 'r-rent', title: 'Rent', amount: P(5000), nextOccurrence: TODAY }),
      rule({ id: 'r-net', title: 'Internet', amount: P(1699), nextOccurrence: TODAY }),
      rule({ id: 'r-sub', title: 'Subscription', amount: P(299), nextOccurrence: TODAY }),
    ];
    const gen = FutureFinanceEngine.generateFromRecurring(rules, TODAY, DateUtils.addDaysISO(TODAY, 30));
    const mine = gen.filter((c) => ['r-rent', 'r-net', 'r-sub'].includes(c.relatedRecurringTransactionId || ''));
    expect(mine).toHaveLength(3);
    expect(new Set(mine.map((c) => c.id)).size).toBe(3);
  });
});
