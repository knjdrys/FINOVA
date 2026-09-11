/**
 * Reconciliation laws: correcting a drifted balance records an ordinary
 * INCOME/EXPENSE row (so every money-direction and edit/delete law holds),
 * tagged `adjustment` so no analytic mistakes bookkeeping for activity.
 */
import { describe, expect, it } from 'vitest';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { Account, Budget, Transaction } from '../types';

const acc = (over: Partial<Account> = {}): Account => ({
  id: 'a', userId: 'u', name: 'Wallet', type: 'CASH', currency: 'PHP',
  initialBalance: 0, currentBalance: 1000, icon: 'x', color: '#000',
  includeInTotalBalance: true, isArchived: false, createdAt: '', updatedAt: '', ...over,
});

const adjustment = (type: 'INCOME' | 'EXPENSE', amount: number): Transaction => ({
  id: 'tx-adj', userId: 'u', type, amount, currency: 'PHP',
  categoryId: 'cat-transfer', accountId: 'a', merchant: 'Balance adjustment',
  date: '2026-09-11', tags: ['adjustment'], status: 'CONFIRMED', createdAt: '', updatedAt: '',
});

describe('adjustment markers', () => {
  it('flags adjustment rows without disturbing goal-funding detection', () => {
    expect(TransactionEngine.isBalanceAdjustment(adjustment('EXPENSE', 5))).toBe(true);
    expect(TransactionEngine.isGoalFunding(adjustment('EXPENSE', 5))).toBe(false);
    expect(TransactionEngine.isBookkeeping(adjustment('INCOME', 5))).toBe(true);
    expect(TransactionEngine.isBookkeeping({ tags: [] })).toBe(false);
  });

  it('attributes adjustments to no category', () => {
    expect(TransactionEngine.getCategoryAllocations(adjustment('EXPENSE', 5)).size).toBe(0);
  });
});

describe('reconciliation moves balances like real money', () => {
  it('a downward adjustment reduces the balance by exactly the drift', () => {
    const next = TransactionEngine.applyTransactionToAccounts(adjustment('EXPENSE', 250), [acc()]);
    expect(next[0].currentBalance).toBe(750);
  });

  it('an upward adjustment increases the balance by exactly the drift', () => {
    const next = TransactionEngine.applyTransactionToAccounts(adjustment('INCOME', 400), [acc()]);
    expect(next[0].currentBalance).toBe(1400);
  });

  it('deleting an adjustment reverses it in full (audit trail preserved)', () => {
    const adj = adjustment('EXPENSE', 250);
    const applied = TransactionEngine.applyTransactionToAccounts(adj, [acc()]);
    const reversed = TransactionEngine.reverseTransactionFromAccounts(adj, applied);
    expect(reversed[0].currentBalance).toBe(1000);
  });
});

describe('adjustments never pollute analytics', () => {
  const budget: Budget = {
    id: 'b', userId: 'u', name: 'Food', amount: 10000, currency: 'PHP',
    period: 'MONTHLY', startDate: '2026-09-01', endDate: '2026-09-30',
    categoryIds: [], notifyThresholdPercentage: 80, isActive: true,
    createdAt: '', updatedAt: '',
  };

  it('budget spend ignores adjustments', () => {
    const real = { ...adjustment('EXPENSE', 300), id: 'tx-real', categoryId: 'cat-food', tags: [] as string[] };
    const forecast = BudgetEngine.calculateBudgetForecast(
      budget, [real, adjustment('EXPENSE', 5000)], '2026-09-11'
    );
    expect(forecast.actualSpent).toBe(300);
  });
});
