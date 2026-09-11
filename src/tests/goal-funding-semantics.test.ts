/**
 * Goal-funding semantics — the no-double-count invariant.
 * - Linked goal (same-currency account): funding is a TRANSFER. Both balances
 *   move, income/expense aggregates ignore it, goal progress increases.
 * - Unlinked goal: funding is a `goal-fund` reservation. The source balance
 *   drops and goal progress increases, but period totals, budget forecasts,
 *   and category analytics all exclude it.
 * Either way: account delta + goal delta == amount AND spend delta == 0.
 */
import { describe, it, expect } from 'vitest';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { GoalEngine } from '../domain/goal/GoalEngine';
import { Account, Budget, CurrencyCode, SavingsGoal, Transaction } from '../types';

const acc = (id: string, balance: number): Account => ({
  id, userId: 'user-1', name: id, type: 'BANK', currency: 'PHP',
  initialBalance: balance, currentBalance: balance, icon: 'Building2', color: '#000',
  includeInTotalBalance: true, isArchived: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

const goal = (over: Partial<SavingsGoal> = {}): SavingsGoal => ({
  id: 'goal-1', userId: 'user-1', name: 'Emergency Fund',
  targetAmount: 5000000, currentAmount: 1000000, currency: 'PHP' as CurrencyCode,
  targetDate: '2027-06-01', priority: 'ESSENTIAL', status: 'ON_TRACK',
  icon: 'Shield', color: '#059669', isArchived: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

const fundTx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-fund', userId: 'user-1', type: 'EXPENSE', amount: 200000,
  currency: 'PHP' as CurrencyCode, categoryId: 'cat-transfer', accountId: 'acc-src',
  date: '2026-09-15', tags: ['goal-fund'], status: 'CONFIRMED',
  createdAt: '2026-09-15T10:00:00Z', updatedAt: '2026-09-15T10:00:00Z',
  ...over,
});

const wholeBudget = (): Budget => ({
  id: 'bud-all', userId: 'user-1', name: 'All spending', amount: 2000000,
  currency: 'PHP' as CurrencyCode, period: 'MONTHLY',
  startDate: '2026-09-01', endDate: '2026-09-30', categoryIds: [],
  notifyThresholdPercentage: 80, isActive: true, rolloverUnused: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

describe('linked goal funding is a transfer (no spend anywhere)', () => {
  it('moves both balances, leaves income/expense totals untouched', () => {
    const accounts = [acc('acc-src', 1000000), acc('acc-save', 100000)];
    const tx = fundTx({ type: 'TRANSFER', destinationAccountId: 'acc-save' });
    const next = TransactionEngine.applyTransactionToAccounts(tx, accounts);
    expect(next.find((a) => a.id === 'acc-src')!.currentBalance).toBe(800000);
    expect(next.find((a) => a.id === 'acc-save')!.currentBalance).toBe(300000);
    const totals = TransactionEngine.calculatePeriodTotals([tx], '2026-09-01', '2026-09-30');
    expect(totals.totalExpense.getMinorUnits()).toBe(0);
    expect(totals.totalIncome.getMinorUnits()).toBe(0);
    expect(TransactionEngine.getCategoryAllocations(tx).size).toBe(0);
  });
});

describe('unlinked goal funding is an excluded reservation', () => {
  it('drops the source balance and raises goal progress, with zero spend delta', () => {
    const accounts = [acc('acc-src', 1000000)];
    const tx = fundTx();
    const next = TransactionEngine.applyTransactionToAccounts(tx, accounts);
    expect(next[0].currentBalance).toBe(800000);

    const g = GoalEngine.contribute(goal(), 200000);
    expect(g.currentAmount).toBe(1200000);

    const totals = TransactionEngine.calculatePeriodTotals([tx], '2026-09-01', '2026-09-30');
    expect(totals.totalExpense.getMinorUnits()).toBe(0);
    expect(TransactionEngine.getCategoryAllocations(tx).size).toBe(0);
    const forecast = BudgetEngine.calculateBudgetForecast(wholeBudget(), [tx], '2026-09-15');
    expect(forecast.actualSpent).toBe(0);
  });

  it('a normal expense still counts everywhere (guards did not over-exclude)', () => {
    const spend = fundTx({ id: 'tx-spend', tags: [], categoryId: 'cat-food', amount: 50000 });
    const totals = TransactionEngine.calculatePeriodTotals([spend], '2026-09-01', '2026-09-30', 'PHP', undefined, '2026-09-30');
    expect(totals.totalExpense.getMinorUnits()).toBe(50000);
    expect(TransactionEngine.getCategoryAllocations(spend).get('cat-food')).toBe(50000);
  });
});
