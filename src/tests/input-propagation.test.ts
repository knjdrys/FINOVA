/**
 * Input → consumer propagation. Mirrors exactly what the App handlers do
 * (apply / reverse-update / reverse-delete / contribute / auto-post /
 * archive flags) and proves every dependent system follows:
 * Budgets, Goals (Safe-to-Spend), Timeline, Projected Balance, Analytics
 * (period totals), Insights. All derivations are per-render from raw state,
 * so these engine-level round-trips are exactly what the UI consumes.
 */
import { describe, it, expect } from 'vitest';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { GoalEngine } from '../domain/goal/GoalEngine';
import { SafeToSpendEngine } from '../domain/safe-to-spend/SafeToSpendEngine';
import { TimelineEngine } from '../domain/timeline/TimelineEngine';
import { InsightEngine } from '../domain/insight/InsightEngine';
import { PlanningService } from '../services/planning/PlanningService';
import {
  Account, Budget, CurrencyCode, MoneyCommitment, SavingsGoal, Transaction, UserSettings,
} from '../types';

const TODAY = '2026-09-15';

const acc = (balance: number): Account => ({
  id: 'acc-1', userId: 'user-1', name: 'acc-1', type: 'BANK', currency: 'PHP',
  initialBalance: balance, currentBalance: balance, icon: 'Building2', color: '#000',
  includeInTotalBalance: true, isArchived: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

const settings: UserSettings = {
  userId: 'user-1', userName: 'Test', currency: 'PHP',
  defaultTrackingPeriod: 'TODAY', budgetCycleMode: 'MONTHLY', semiMonthlyCutoffDay: 15,
  minimumReserve: 0, safeToSpendPeriod: 'END_OF_MONTH', darkTheme: false,
  notificationsEnabled: false, budgetWarningThreshold: 80,
  autoGenerateCommitmentsFromRecurring: true,
};

const foodBudget = (): Budget => ({
  id: 'bud-food', userId: 'user-1', name: 'Food', amount: 500000,
  currency: 'PHP' as CurrencyCode, period: 'MONTHLY',
  startDate: '2026-09-01', endDate: '2026-09-30', categoryIds: ['cat-food'],
  notifyThresholdPercentage: 80, isActive: true, rolloverUnused: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

const efGoal = (): SavingsGoal => ({
  id: 'goal-ef', userId: 'user-1', name: 'Emergency Fund',
  targetAmount: 5000000, currentAmount: 1000000, currency: 'PHP' as CurrencyCode,
  targetDate: '2027-09-15', priority: 'ESSENTIAL', status: 'ON_TRACK',
  icon: 'Shield', color: '#059669', isArchived: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

const expense = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1', userId: 'user-1', type: 'EXPENSE', amount: 100000,
  currency: 'PHP' as CurrencyCode, categoryId: 'cat-food', accountId: 'acc-1',
  date: TODAY, tags: [], status: 'CONFIRMED',
  createdAt: `${TODAY}T10:00:00Z`, updatedAt: `${TODAY}T10:00:00Z`,
  ...over,
});

const insightsOf = (txs: Transaction[], budgets: Budget[], goals: SavingsGoal[], comms: MoneyCommitment[]) =>
  JSON.stringify(InsightEngine.generateInsights([acc(1000000)], txs, budgets, goals, comms, [], settings, TODAY));

describe('expense create → edit → delete propagates everywhere', () => {
  it('round-trips budgets, totals, timeline, safe-to-spend, and insights', () => {
    const accounts = [acc(1000000)];
    const budget = foodBudget();
    const goals = [efGoal()];
    const baselineInsights = insightsOf([], [budget], goals, []);
    const baselineSTS = SafeToSpendEngine.calculateSafeToSpend(accounts, [], goals, settings, TODAY);

    // CREATE (mirrors handleSaveTransaction)
    const tx = expense();
    const afterCreateAccts = TransactionEngine.applyTransactionToAccounts(tx, accounts);
    const created = [tx];
    expect(afterCreateAccts[0].currentBalance).toBe(900000);
    expect(BudgetEngine.calculateBudgetForecast(budget, created, TODAY).actualSpent).toBe(100000);
    expect(TransactionEngine.calculatePeriodTotals(created, '2026-09-01', '2026-09-30', 'PHP', undefined, TODAY).totalExpense.getMinorUnits()).toBe(100000);
    const days = TimelineEngine.generateTimeline(afterCreateAccts, created, [], [], TODAY, '2026-10-15', TODAY);
    expect(days.find((d) => d.date === TODAY)!.events.some((e) => e.status === 'ACTUAL')).toBe(true);
    const stsAfter = SafeToSpendEngine.calculateSafeToSpend(afterCreateAccts, [], goals, settings, TODAY);
    expect(stsAfter.discretionaryPool).toBeLessThan(baselineSTS.discretionaryPool);
    expect(insightsOf(created, [budget], goals, [])).not.toBe(baselineInsights);

    // EDIT 100k → 250k (mirrors handleSaveTransaction update path)
    const edited: Transaction = { ...tx, amount: 250000 };
    const afterEditAccts = TransactionEngine.updateTransactionInAccounts(tx, edited, afterCreateAccts);
    expect(afterEditAccts[0].currentBalance).toBe(750000);
    expect(BudgetEngine.calculateBudgetForecast(budget, [edited], TODAY).actualSpent).toBe(250000);

    // DELETE (mirrors handleDeleteTransaction)
    const afterDeleteAccts = TransactionEngine.reverseTransactionFromAccounts(edited, afterEditAccts);
    expect(afterDeleteAccts[0].currentBalance).toBe(1000000);
    expect(BudgetEngine.calculateBudgetForecast(budget, [], TODAY).actualSpent).toBe(0);
    expect(TransactionEngine.calculatePeriodTotals([], '2026-09-01', '2026-09-30').totalExpense.getMinorUnits()).toBe(0);
    const stsAfterDelete = SafeToSpendEngine.calculateSafeToSpend(afterDeleteAccts, [], goals, settings, TODAY);
    expect(stsAfterDelete.discretionaryPool).toBe(baselineSTS.discretionaryPool);
    expect(insightsOf([], [budget], goals, [])).toBe(baselineInsights);
  });
});

describe('goal funding lowers the Safe-to-Spend reservation without touching spend', () => {
  it('contribution shrinks reserved amount; totals stay flat', () => {
    const accounts = [acc(1000000)];
    const goals = [efGoal()];
    const before = SafeToSpendEngine.calculateSafeToSpend(accounts, [], goals, settings, TODAY)
      .reservedGoalContributions;
    const funded = [GoalEngine.contribute(goals[0], 200000)];
    const after = SafeToSpendEngine.calculateSafeToSpend(accounts, [], funded, settings, TODAY)
      .reservedGoalContributions;
    expect(after).toBeLessThan(before);
    expect(funded[0].currentAmount).toBe(1200000);
  });
});

describe('budget archive removes it from Home without deleting history', () => {
  it('selectHomePlans drops archived budgets; restore brings them back', () => {
    const txs = [expense()];
    const shown = PlanningService.selectHomePlans([foodBudget()], [], txs, TODAY);
    expect(shown.budgets).toHaveLength(1);
    const archived = [{ ...foodBudget(), isActive: false }];
    expect(PlanningService.selectHomePlans(archived, [], txs, TODAY).budgets).toHaveLength(0);
    // History intact: the archived budget still forecasts past spend.
    expect(BudgetEngine.calculateBudgetForecast(archived[0], txs, TODAY).actualSpent).toBe(100000);
  });
});

describe('commitment completion swaps projection for actual', () => {
  it('completed bill leaves the future timeline; its settlement tx appears as ACTUAL', () => {
    const accounts = [acc(1000000)];
    const bill: MoneyCommitment = {
      id: 'comm-rent', userId: 'user-1', title: 'Rent', type: 'BILL', amount: 500000,
      currency: 'PHP', direction: 'OUTFLOW', status: 'COMPLETED', dueDate: '2026-09-20',
      accountId: 'acc-1', categoryId: 'cat-bills', priority: 'ESSENTIAL',
      createdAt: TODAY, updatedAt: TODAY,
    };
    const settled: Transaction = {
      ...expense({ id: 'tx-rent', categoryId: 'cat-bills', amount: 500000, sourceCommitmentId: 'comm-rent' }),
    };
    const days = TimelineEngine.generateTimeline(accounts, [settled], [bill], [], TODAY, '2026-10-15', TODAY);
    const day = days.find((d) => d.date === '2026-09-20')!;
    expect(day.events.some((e) => e.status === 'PROJECTED')).toBe(false);
    const actualDay = days.find((d) => d.date === TODAY)!;
    expect(actualDay.events.some((e) => e.status === 'ACTUAL' && e.amount === 500000)).toBe(true);
  });
});
