/**
 * Goal-withdrawal semantics — the exact mirror of goal funding.
 * - withdrawableAmount clamps at the saved amount (never negative savings).
 * - withdraw is the pure inverse of contribute (round-trip returns to start).
 * - A COMPLETED goal that drops below target reverts to ON_TRACK.
 * - Unlinked withdrawal is a `goal-withdraw` reservation: the destination
 *   balance rises and goal progress drops, but period income totals stay
 *   untouched — saved money coming home is not earned income.
 * - Linked withdrawal is a true TRANSFER (source credited out, destination
 *   credited in) with the same exclusion everywhere.
 */
import { describe, it, expect } from 'vitest';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { GoalEngine } from '../domain/goal/GoalEngine';
import { Account, CurrencyCode, SavingsGoal, Transaction } from '../types';

const acc = (id: string, balance: number): Account => ({
  id, userId: 'user-1', name: id, type: 'BANK', currency: 'PHP',
  initialBalance: balance, currentBalance: balance, icon: 'Building2', color: '#000',
  includeInTotalBalance: true, isArchived: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

const goal = (over: Partial<SavingsGoal> = {}): SavingsGoal => ({
  id: 'goal-1', userId: 'user-1', name: 'Laptop Fund',
  targetAmount: 5000000, currentAmount: 1000000, currency: 'PHP' as CurrencyCode,
  targetDate: '2027-06-01', priority: 'NORMAL', status: 'ON_TRACK',
  icon: 'Laptop', color: '#059669', isArchived: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

const withdrawTx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-withdraw', userId: 'user-1', type: 'INCOME', amount: 400000,
  currency: 'PHP' as CurrencyCode, categoryId: 'cat-transfer', accountId: 'acc-dest',
  date: '2026-09-15', tags: ['goal-withdraw'], status: 'CONFIRMED',
  createdAt: '2026-09-15T10:00:00Z', updatedAt: '2026-09-15T10:00:00Z',
  ...over,
});

describe('withdrawableAmount clamps at the saved amount', () => {
  it('returns the requested amount when the goal can cover it', () => {
    expect(GoalEngine.withdrawableAmount(goal(), 400000)).toBe(400000);
  });

  it('caps a larger request at the saved amount', () => {
    expect(GoalEngine.withdrawableAmount(goal(), 9999999)).toBe(1000000);
  });

  it('returns zero for non-positive requests and empty goals', () => {
    expect(GoalEngine.withdrawableAmount(goal(), 0)).toBe(0);
    expect(GoalEngine.withdrawableAmount(goal(), -5000)).toBe(0);
    expect(GoalEngine.withdrawableAmount(goal({ currentAmount: 0 }), 1000)).toBe(0);
  });
});

describe('withdraw is the pure inverse of contribute', () => {
  it('round-trips: contribute then withdraw returns to the starting amount', () => {
    const start = goal();
    const funded = GoalEngine.contribute(start, 750000);
    expect(funded.currentAmount).toBe(1750000);
    const back = GoalEngine.withdraw(funded, 750000);
    expect(back.currentAmount).toBe(start.currentAmount);
  });

  it('never drives savings below zero', () => {
    const g = GoalEngine.withdraw(goal(), 2000000);
    expect(g.currentAmount).toBe(0);
  });

  it('is a no-op for zero or negative amounts (same object, no mutation)', () => {
    const g = goal();
    expect(GoalEngine.withdraw(g, 0)).toBe(g);
    expect(GoalEngine.withdraw(g, -100)).toBe(g);
  });
});

describe('status re-evaluation on withdrawal', () => {
  it('a COMPLETED goal that drops below target reverts to ON_TRACK', () => {
    const completed = goal({ currentAmount: 5000000, status: 'COMPLETED' });
    const after = GoalEngine.withdraw(completed, 100000);
    expect(after.status).toBe('ON_TRACK');
    expect(after.currentAmount).toBe(4900000);
  });

  it('stays COMPLETED when the withdrawal keeps it at or above target', () => {
    const completed = goal({ currentAmount: 6000000, status: 'COMPLETED' });
    const after = GoalEngine.withdraw(completed, 999999);
    expect(after.status).toBe('COMPLETED');
  });
});

describe('unlinked withdrawal is an excluded reservation', () => {
  it('credits the destination account but period income stays untouched', () => {
    const accounts = [acc('acc-dest', 500000)];
    const tx = withdrawTx();
    const next = TransactionEngine.applyTransactionToAccounts(tx, accounts);
    expect(next[0].currentBalance).toBe(900000);

    const totals = TransactionEngine.calculatePeriodTotals([tx], '2026-09-01', '2026-09-30');
    expect(totals.totalIncome.getMinorUnits()).toBe(0);
    expect(totals.totalExpense.getMinorUnits()).toBe(0);
    expect(TransactionEngine.getCategoryAllocations(tx).size).toBe(0);
  });

  it('the withdrawal plus the goal delta conserves the amount', () => {
    const before = goal();
    const after = GoalEngine.withdraw(before, GoalEngine.withdrawableAmount(before, 400000));
    const gDelta = after.currentAmount - before.currentAmount; // -400000
    const aDelta = 900000 - 500000; // +400000 on the destination
    expect(gDelta + aDelta).toBe(0);
  });
});

describe('linked withdrawal is a true transfer', () => {
  it('moves both balances and stays out of every aggregate', () => {
    const accounts = [acc('acc-save', 1000000), acc('acc-dest', 100000)];
    const tx = withdrawTx({ type: 'TRANSFER', accountId: 'acc-save', destinationAccountId: 'acc-dest' });
    const next = TransactionEngine.applyTransactionToAccounts(tx, accounts);
    expect(next.find((a) => a.id === 'acc-save')!.currentBalance).toBe(600000);
    expect(next.find((a) => a.id === 'acc-dest')!.currentBalance).toBe(500000);

    const totals = TransactionEngine.calculatePeriodTotals([tx], '2026-09-01', '2026-09-30');
    expect(totals.totalIncome.getMinorUnits()).toBe(0);
    expect(totals.totalExpense.getMinorUnits()).toBe(0);
  });
});

describe('guards did not over-exclude', () => {
  it('a real income still counts in period totals', () => {
    const pay = withdrawTx({ id: 'tx-pay', tags: [], categoryId: 'cat-salary', amount: 1500000 });
    const totals = TransactionEngine.calculatePeriodTotals([pay], '2026-09-01', '2026-09-30');
    expect(totals.totalIncome.getMinorUnits()).toBe(1500000);
  });
});
