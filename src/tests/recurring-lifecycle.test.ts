/**
 * Recurring lifecycle — generation, consent, idempotent auto-post, downstream.
 * - Inactive / ended rules generate nothing.
 * - Explicit autoPostEnabled wins; legacy rules fall back to reminderEnabled.
 * - Auto-post run twice posts once (sourceCommitmentId idempotency).
 * - Posted occurrences flow into budgets + analytics exactly once.
 * - Recurring income posts INCOME, not expense.
 */
import { describe, it, expect } from 'vitest';
import { FutureFinanceEngine } from '../domain/future-finance/FutureFinanceEngine';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { Account, Budget, CurrencyCode, RecurringTransaction } from '../types';

const TODAY = '2026-09-15';

const acc = (id: string, balance: number): Account => ({
  id, userId: 'user-1', name: id, type: 'BANK', currency: 'PHP',
  initialBalance: balance, currentBalance: balance, icon: 'Building2', color: '#000',
  includeInTotalBalance: true, isArchived: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

const rule = (over: Partial<RecurringTransaction> = {}): RecurringTransaction => ({
  id: 'rec-net', userId: 'user-1', title: 'Internet', amount: 169900,
  currency: 'PHP' as CurrencyCode, type: 'EXPENSE', categoryId: 'cat-bills',
  accountId: 'acc-1', frequency: 'MONTHLY', startDate: '2026-09-15',
  nextOccurrence: '2026-09-15', isActive: true, reminderEnabled: true,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

const wholeBudget = (): Budget => ({
  id: 'bud-all', userId: 'user-1', name: 'All spending', amount: 2000000,
  currency: 'PHP' as CurrencyCode, period: 'MONTHLY',
  startDate: '2026-09-01', endDate: '2026-09-30', categoryIds: [],
  notifyThresholdPercentage: 80, isActive: true, rolloverUnused: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

describe('generation respects lifecycle state', () => {
  it('skips paused rules and rules that already ended', () => {
    expect(FutureFinanceEngine.generateFromRecurring([rule({ isActive: false })], TODAY, '2026-10-15')).toEqual([]);
    expect(FutureFinanceEngine.generateFromRecurring([rule({ endDate: '2026-09-01' })], TODAY, '2026-10-15')).toEqual([]);
  });

  it('generates the monthly occurrence with a deterministic id', () => {
    const gen = FutureFinanceEngine.generateFromRecurring([rule()], TODAY, '2026-10-15');
    expect(gen.length).toBeGreaterThan(0);
    expect(gen[0].id).toBe('comm-rec-rec-net-2026-09-15');
    expect(gen[0].status).toBe('PROJECTED');
  });

  it('explicit auto-post consent wins; legacy falls back to reminder', () => {
    const off = FutureFinanceEngine.generateFromRecurring(
      [rule({ autoPostEnabled: false, reminderEnabled: true })], TODAY, '2026-10-15'
    );
    expect(off[0].autoPostEnabled).toBe(false);
    const legacy = FutureFinanceEngine.generateFromRecurring(
      [rule({ autoPostEnabled: undefined, reminderEnabled: true })], TODAY, '2026-10-15'
    );
    expect(legacy[0].autoPostEnabled).toBe(true);
  });
});

describe('roll-forward on resume', () => {
  it('advances a stale nextOccurrence to today without a backlog', () => {
    const rolled = FutureFinanceEngine.rollForwardNextOccurrence(
      rule({ nextOccurrence: '2026-06-15', frequency: 'MONTHLY' }), TODAY
    );
    expect(rolled).toBe(TODAY);
  });

  it('leaves a current nextOccurrence untouched', () => {
    expect(FutureFinanceEngine.rollForwardNextOccurrence(rule(), TODAY)).toBe('2026-09-15');
  });
});

describe('auto-post is idempotent and flows downstream once', () => {
  it('running twice posts exactly one transaction; budgets see it once', () => {
    const accounts = [acc('acc-1', 1000000)];
    const gen = FutureFinanceEngine.generateFromRecurring([rule({ autoPostEnabled: true })], TODAY, '2026-10-15');
    const due = gen.filter((c) => c.dueDate <= TODAY);

    const first = FutureFinanceEngine.autoPostDueCommitments(due, accounts, [], TODAY);
    expect(first.postedCount).toBe(1);
    expect(first.transactions).toHaveLength(1);

    const second = FutureFinanceEngine.autoPostDueCommitments(due, first.accounts, first.transactions, TODAY);
    expect(second.postedCount).toBe(0);
    expect(second.transactions).toHaveLength(1);

    const forecast = BudgetEngine.calculateBudgetForecast(wholeBudget(), second.transactions, TODAY);
    expect(forecast.actualSpent).toBe(169900);
    const totals = TransactionEngine.calculatePeriodTotals(second.transactions, '2026-09-01', '2026-09-30', 'PHP', undefined, TODAY);
    expect(totals.totalExpense.getMinorUnits()).toBe(169900);
  });

  it('recurring income posts INCOME and skips the overdraft block', () => {
    const accounts = [acc('acc-1', 0)];
    const gen = FutureFinanceEngine.generateFromRecurring(
      [rule({ id: 'rec-pay', title: 'Salary', type: 'INCOME', categoryId: 'cat-salary', amount: 2000000, autoPostEnabled: true })],
      TODAY, '2026-10-15'
    );
    const result = FutureFinanceEngine.autoPostDueCommitments(
      gen.filter((c) => c.dueDate <= TODAY), accounts, [], TODAY
    );
    expect(result.postedCount).toBe(1);
    expect(result.transactions[0].type).toBe('INCOME');
    expect(result.accounts[0].currentBalance).toBe(2000000);
  });
});
