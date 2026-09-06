/**
 * Financial QA matrix — correctness invariants across every money path.
 * - Over-funding can never destroy money (fundableAmount clamp).
 * - Transfers/income delete symmetrically; exact-zero balances allowed, negatives never.
 * - Month-end recurring dates never skip or drift (Jan 31 → Feb 28 → Mar 31).
 * - Budget windows are inclusive on both ends; rollover carries real unused funds.
 * - Multi-currency rows never mix into single-currency aggregates.
 * - Duplicate settlement/auto-post requests post exactly once.
 */
import { describe, it, expect } from 'vitest';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { GoalEngine } from '../domain/goal/GoalEngine';
import { FutureFinanceEngine } from '../domain/future-finance/FutureFinanceEngine';
import { DateUtils } from '../domain/date/DateUtils';
import { Account, Budget, CurrencyCode, SavingsGoal, Transaction } from '../types';

const acc = (id: string, balance: number, currency: CurrencyCode = 'PHP'): Account => ({
  id, userId: 'user-1', name: id, type: 'BANK', currency,
  initialBalance: balance, currentBalance: balance, icon: 'Building2', color: '#000',
  includeInTotalBalance: true, isArchived: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1', userId: 'user-1', type: 'EXPENSE', amount: 100000,
  currency: 'PHP', categoryId: 'cat-food', accountId: 'acc-1',
  date: '2026-09-15', tags: [], status: 'CONFIRMED',
  createdAt: '2026-09-15T10:00:00Z', updatedAt: '2026-09-15T10:00:00Z',
  ...over,
});

const goal = (current: number, target = 5000000): SavingsGoal => ({
  id: 'goal-1', userId: 'user-1', name: 'EF', targetAmount: target, currentAmount: current,
  currency: 'PHP', targetDate: '2027-09-15', priority: 'ESSENTIAL', status: 'ON_TRACK',
  icon: 'Shield', color: '#059669', isArchived: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

describe('over-funding clamp (money must never vanish)', () => {
  it('fundableAmount caps at the remaining need', () => {
    expect(GoalEngine.fundableAmount(goal(4900000), 500000)).toBe(100000);
    expect(GoalEngine.fundableAmount(goal(5000000), 500000)).toBe(0);
    expect(GoalEngine.fundableAmount(goal(0), -100)).toBe(0);
    expect(GoalEngine.fundableAmount(goal(0), 200000)).toBe(200000);
  });

  it('clamped funding conserves money exactly (account + goal deltas == moved)', () => {
    const accounts = [acc('acc-1', 1000000)];
    const fundable = GoalEngine.fundableAmount(goal(4900000), 500000);
    const ftx = tx({ id: 'tx-f', amount: fundable, categoryId: 'cat-transfer', tags: ['goal-fund'] });
    const next = TransactionEngine.applyTransactionToAccounts(ftx, accounts);
    const g = GoalEngine.contribute(goal(4900000), fundable);
    expect(1000000 - next[0].currentBalance + (g.currentAmount - 4900000)).toBe(2 * fundable);
    expect(g.currentAmount).toBe(5000000);
    expect(next[0].currentBalance).toBe(900000);
  });
});

describe('symmetric delete + zero/negative guards', () => {
  it('deleting income reverses the credit; deleting a transfer restores both sides', () => {
    const accounts = [acc('acc-1', 1000000), acc('acc-2', 500000)];
    const inc = tx({ id: 't-i', type: 'INCOME', amount: 200000 });
    const applied = TransactionEngine.applyTransactionToAccounts(inc, accounts);
    expect(TransactionEngine.reverseTransactionFromAccounts(inc, applied)).toEqual(accounts.map((a) => expect.objectContaining({ currentBalance: a.currentBalance })));

    const tr = tx({ id: 't-t', type: 'TRANSFER', amount: 300000, destinationAccountId: 'acc-2' });
    const moved = TransactionEngine.applyTransactionToAccounts(tr, accounts);
    expect(moved[0].currentBalance).toBe(700000);
    expect(moved[1].currentBalance).toBe(800000);
    const back = TransactionEngine.reverseTransactionFromAccounts(tr, moved);
    expect(back[0].currentBalance).toBe(1000000);
    expect(back[1].currentBalance).toBe(500000);
  });

  it('exact-zero balance is allowed; one centavo more is rejected', () => {
    const accounts = [acc('acc-1', 100000)];
    expect(
      TransactionEngine.validateTransaction({ type: 'EXPENSE', amount: 100000, currency: 'PHP', accountId: 'acc-1' }, accounts)
    ).toBeNull();
    expect(
      TransactionEngine.validateTransaction({ type: 'EXPENSE', amount: 100001, currency: 'PHP', accountId: 'acc-1' }, accounts)
    ).toMatch(/exceed|insufficient|overdraw|balance/i);
  });
});

describe('month boundaries + recurring month-end anchoring', () => {
  it('Jan 31 monthly rule hits Feb 28 then Mar 31 (no skip, no drift)', () => {
    expect(FutureFinanceEngine.occurrenceAt('2026-01-31', 'MONTHLY', 1)).toBe('2026-02-28');
    expect(FutureFinanceEngine.occurrenceAt('2026-01-31', 'MONTHLY', 2)).toBe('2026-03-31');
    expect(DateUtils.addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('budget windows include both boundary days', () => {
    const b: Budget = {
      id: 'b', userId: 'user-1', name: 'Sep', amount: 1000000, currency: 'PHP', period: 'MONTHLY',
      startDate: '2026-09-01', endDate: '2026-09-30', categoryIds: [], notifyThresholdPercentage: 80,
      isActive: true, rolloverUnused: false, createdAt: 'x', updatedAt: 'x',
    };
    const txs = [tx({ id: 'a', date: '2026-09-01' }), tx({ id: 'b', date: '2026-09-30' })];
    expect(BudgetEngine.calculateBudgetForecast(b, txs, '2026-09-30').actualSpent).toBe(200000);
  });

  it('rollover carries genuinely unused funds forward', () => {
    const b: Budget = {
      id: 'b', userId: 'user-1', name: 'Food', amount: 500000, currency: 'PHP', period: 'MONTHLY',
      startDate: '2026-09-01', endDate: '2026-09-30', categoryIds: ['cat-food'],
      notifyThresholdPercentage: 80, isActive: true, rolloverUnused: true, createdAt: 'x', updatedAt: 'x',
    };
    // August spent 300k of 500k → 200k should carry into September's window math.
    const carry = BudgetEngine.calculateRolloverCarry(
      { ...b, startDate: '2026-09-01', endDate: '2026-09-30' },
      [tx({ id: 'aug', date: '2026-08-10', amount: 300000 })]
    );
    expect(carry).toBe(200000);
  });
});

describe('multi-currency isolation', () => {
  it('period totals ignore other currencies when filtered', () => {
    const txs = [tx({ id: 'p', currency: 'PHP' }), tx({ id: 'u', currency: 'USD', amount: 50000 })];
    const php = TransactionEngine.calculatePeriodTotals(txs, '2026-09-01', '2026-09-30', 'PHP', 'PHP');
    expect(php.totalExpense.getMinorUnits()).toBe(100000);
    expect(php.totalExpense.getCurrency()).toBe('PHP');
  });
});

describe('duplicate-request safety', () => {
  it('settling the same commitment twice banks one transaction', () => {
    const accounts = [acc('acc-1', 1000000)];
    const c = {
      id: 'comm-d', userId: 'user-1', title: 'Rent', type: 'BILL' as const, amount: 500000,
      currency: 'PHP' as CurrencyCode, direction: 'OUTFLOW' as const, status: 'PROJECTED' as const,
      dueDate: '2026-09-15', accountId: 'acc-1', categoryId: 'cat-bills', priority: 'ESSENTIAL' as const,
      autoPostEnabled: true, createdAt: 'x', updatedAt: 'x',
    };
    const once = FutureFinanceEngine.autoPostDueCommitments([c], accounts, [], '2026-09-15');
    const twice = FutureFinanceEngine.autoPostDueCommitments([c], once.accounts, once.transactions, '2026-09-15');
    expect(once.transactions).toHaveLength(1);
    expect(twice.transactions).toHaveLength(1);
    expect(twice.accounts[0].currentBalance).toBe(500000);
  });
});
