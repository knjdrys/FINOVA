/**
 * DESTRUCTION TEST — goal money integrity.
 * Goals could be funded but never withdrawn (money locked), archiving a
 * funded goal stranded its reservation, progress was hand-editable (desync),
 * and reconciliation rows leaked into income/expense totals.
 */
import { describe, it, expect } from 'vitest';
import { GoalEngine } from '../domain/goal/GoalEngine';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { Budget, SavingsGoal, Transaction } from '../types';

const P = (major: number) => Math.round(major * 100);

const goal = (over: Partial<SavingsGoal> = {}): SavingsGoal => ({
  id: 'g1', userId: 'user-1', name: 'EF', targetAmount: P(10000), currentAmount: P(4000),
  currency: 'PHP', targetDate: '2026-12-31', priority: 'ESSENTIAL', status: 'ON_TRACK',
  icon: 'Target', color: '#059669', isArchived: false,
  createdAt: '2026-09-01', updatedAt: '2026-09-01',
  ...over,
});

const tx = (over: Partial<Transaction> & { id: string }): Transaction => ({
  userId: 'user-1', type: 'EXPENSE', amount: P(100), currency: 'PHP',
  categoryId: 'cat-shopping', accountId: 'a1', date: '2026-09-10', time: '10:00',
  tags: [], status: 'CONFIRMED', createdAt: '2026-09-10', updatedAt: '2026-09-10',
  ...over,
});

describe('GoalEngine.withdraw', () => {
  it('decrements progress, floored at zero', () => {
    expect(GoalEngine.withdraw(goal(), P(1500)).currentAmount).toBe(P(2500));
    expect(GoalEngine.withdraw(goal(), P(99999)).currentAmount).toBe(0);
  });

  it('ignores non-positive amounts (pure no-op)', () => {
    const g = goal();
    expect(GoalEngine.withdraw(g, 0)).toBe(g);
    expect(GoalEngine.withdraw(g, -5)).toBe(g);
  });

  it('reopens a COMPLETED goal when progress drops below target', () => {
    const done = goal({ currentAmount: P(10000), status: 'COMPLETED' });
    const next = GoalEngine.withdraw(done, P(100));
    expect(next.currentAmount).toBe(P(9900));
    expect(next.status).toBe('ON_TRACK');
  });

  it('fund ↔ withdraw round-trips exactly', () => {
    const g = goal({ currentAmount: 0 });
    const funded = GoalEngine.contribute(g, P(333));
    expect(funded.currentAmount).toBe(P(333));
    const back = GoalEngine.withdraw(funded, P(333));
    expect(back.currentAmount).toBe(0);
  });
});

describe('bookkeeping classification', () => {
  it('goal withdrawals are bookkeeping (never income)', () => {
    const w = tx({ id: 'w', type: 'INCOME', tags: ['goal-withdraw'] });
    expect(TransactionEngine.isGoalWithdrawal(w)).toBe(true);
    expect(TransactionEngine.isBookkeeping(w)).toBe(true);
  });

  it('period totals exclude reservations, withdrawals, and adjustments', () => {
    const txs = [
      tx({ id: 'spend', type: 'EXPENSE', amount: P(100) }),
      tx({ id: 'earn', type: 'INCOME', amount: P(500) }),
      tx({ id: 'fund', type: 'EXPENSE', amount: P(1000), tags: ['goal-fund'] }),
      tx({ id: 'wd', type: 'INCOME', amount: P(1000), tags: ['goal-withdraw'] }),
      tx({ id: 'adj', type: 'INCOME', amount: P(777), tags: ['adjustment'] }),
    ];
    const totals = TransactionEngine.calculatePeriodTotals(txs, '2026-09-01', '2026-09-30', 'PHP', 'PHP');
    expect(totals.totalExpense.getMinorUnits()).toBe(P(100));
    expect(totals.totalIncome.getMinorUnits()).toBe(P(500));
    expect(totals.netCashFlow.getMinorUnits()).toBe(P(400));
  });

  it('split/category attribution ignores withdrawals', () => {
    const w = tx({ id: 'w', type: 'INCOME', tags: ['goal-withdraw'] });
    expect(TransactionEngine.getCategoryAllocations(w).size).toBe(0);
  });
});

describe('budget forecast currency isolation', () => {
  const budget = (over: Partial<Budget> = {}): Budget => ({
    id: 'b1', userId: 'user-1', name: 'Shop', amount: P(1000), currency: 'PHP',
    categoryIds: [], startDate: '2026-09-01', endDate: '2026-09-30',
    isActive: true, rolloverUnused: false, notifyThresholdPercentage: 80,
    createdAt: '2026-09-01', updatedAt: '2026-09-01',
    ...over,
  });

  it('ignores expenses in other currencies (no FX summing)', () => {
    const txs = [
      tx({ id: 'php', amount: P(100), currency: 'PHP' }),
      tx({ id: 'usd', amount: P(100), currency: 'USD' }),
    ];
    const forecast = BudgetEngine.calculateBudgetForecast(budget(), txs, '2026-09-15');
    expect(forecast.actualSpent).toBe(P(100));
  });
});
