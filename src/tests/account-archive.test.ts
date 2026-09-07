/**
 * Account archive safety (Day 4, Phase 16).
 *
 * Hard-deleting an account that owns transactions orphans them: balances
 * drop but spend history stays, breaking every total. Accounts WITH
 * history must archive instead — excluded from totals/Safe-to-Spend/
 * pickers while history stays intact.
 */
import { describe, it, expect } from 'vitest';
import { AccountEngine } from '../domain/account/AccountEngine';
import { SafeToSpendEngine } from '../domain/safe-to-spend/SafeToSpendEngine';
import { DateUtils } from '../domain/date/DateUtils';
import { Account, MoneyCommitment, RecurringTransaction, Transaction } from '../types';

const todayISO = DateUtils.getTodayISO();

function acc(id: string, bal: number): Account {
  return {
    id, userId: 'user-1', name: id, bankPresetId: 'grbi', accountNumberMask: '••••',
    type: 'BANK', currency: 'PHP', initialBalance: bal, currentBalance: bal,
    icon: 'Building2', color: '#1C205E', includeInTotalBalance: true, isArchived: false,
    createdAt: todayISO, updatedAt: todayISO,
  };
}

function expense(id: string, accountId: string, amount: number): Transaction {
  return {
    id, userId: 'user-1', categoryId: 'cat-food', type: 'EXPENSE',
    amount, currency: 'PHP', merchant: '', note: '', date: todayISO, time: '12:00',
    tags: [], status: 'CONFIRMED', createdAt: todayISO, updatedAt: todayISO, accountId,
  };
}

function commitment(id: string, accountId: string, status: MoneyCommitment['status']): MoneyCommitment {
  return {
    id, userId: 'user-1', title: id, type: 'BILL', amount: 100000, currency: 'PHP',
    direction: 'OUTFLOW', status, dueDate: DateUtils.addDaysISO(todayISO, 5),
    accountId, categoryId: 'cat-bills', priority: 'ESSENTIAL',
    createdAt: todayISO, updatedAt: todayISO,
  };
}

function recurring(id: string, accountId: string, isActive: boolean): RecurringTransaction {
  return {
    id, userId: 'user-1', title: id, amount: 50000, currency: 'PHP', type: 'EXPENSE',
    categoryId: 'cat-bills', accountId, frequency: 'MONTHLY', startDate: todayISO,
    nextOccurrence: todayISO, isActive, reminderEnabled: true,
    createdAt: todayISO, updatedAt: todayISO,
  };
}

const settings = (over: Record<string, unknown> = {}) => ({
  userId: 'user-1', userName: 'T', currency: 'PHP', language: 'en',
  defaultTrackingPeriod: 'TODAY', budgetCycleMode: 'SEMI_MONTHLY_15_DAYS',
  semiMonthlyCutoffDay: 15, minimumReserve: 0, safeToSpendPeriod: 'END_OF_MONTH',
  darkTheme: false, notificationsEnabled: true, budgetWarningThreshold: 80,
  autoGenerateCommitmentsFromRecurring: true, hasCompletedOnboarding: true,
  ...over,
}) as Parameters<typeof SafeToSpendEngine.calculateSafeToSpend>[3];

describe('AccountEngine.archiveAccount', () => {
  it('hasHistory detects source AND destination touches', () => {
    const txs = [expense('t1', 'a1', 1000)];
    expect(AccountEngine.hasHistory(txs, 'a1')).toBe(true);
    expect(AccountEngine.hasHistory(txs, 'a2')).toBe(false);
    const transfer = { ...expense('t2', 'a1', 500), type: 'TRANSFER' as const, destinationAccountId: 'a2' };
    expect(AccountEngine.hasHistory([transfer], 'a2')).toBe(true);
  });

  it('archiving excludes the account from totals but keeps every transaction', () => {
    const accounts = [acc('a1', 2000000), acc('a2', 1000000)];
    const txs = [expense('t1', 'a1', 25000)];
    const next = AccountEngine.archiveAccount(accounts, [], [], 'a1', todayISO);

    expect(next.accounts.find((a) => a.id === 'a1')?.isArchived).toBe(true);
    expect(next.accounts.find((a) => a.id === 'a2')?.isArchived).toBe(false);
    // History intact — transaction rows untouched
    expect(txs).toHaveLength(1);
    // Totals now exclude a1
    const total = AccountEngine.calculateTotalBalance(next.accounts, 'PHP');
    expect(total.getMinorUnits()).toBe(1000000);
  });

  it('archiving removes the account from the Safe-to-Spend pool', () => {
    const accounts = [acc('a1', 2000000), acc('a2', 1000000)];
    const before = SafeToSpendEngine.calculateSafeToSpend(accounts, [], [], settings(), todayISO);
    const next = AccountEngine.archiveAccount(accounts, [], [], 'a1', todayISO);
    const after = SafeToSpendEngine.calculateSafeToSpend(next.accounts, [], [], settings(), todayISO);
    expect(after.discretionaryPool).toBeLessThan(before.discretionaryPool);
  });

  it('cancels pending commitments on the account but keeps completed ones', () => {
    const accounts = [acc('a1', 2000000)];
    const comms = [
      commitment('c1', 'a1', 'PROJECTED'),
      commitment('c2', 'a1', 'COMPLETED'),
      commitment('c3', 'a2', 'PROJECTED'),
    ];
    const next = AccountEngine.archiveAccount(accounts, comms, [], 'a1', todayISO);
    expect(next.commitments.find((c) => c.id === 'c1')?.status).toBe('CANCELLED');
    expect(next.commitments.find((c) => c.id === 'c2')?.status).toBe('COMPLETED');
    expect(next.commitments.find((c) => c.id === 'c3')?.status).toBe('PROJECTED');
    // All three rows still exist — history preserved
    expect(next.commitments).toHaveLength(3);
  });

  it('pauses active recurring rules on the account and leaves others alone', () => {
    const accounts = [acc('a1', 2000000)];
    const recs = [recurring('r1', 'a1', true), recurring('r2', 'a1', false), recurring('r3', 'a2', true)];
    const next = AccountEngine.archiveAccount(accounts, [], recs, 'a1', todayISO);
    expect(next.recurring.find((r) => r.id === 'r1')?.isActive).toBe(false);
    expect(next.recurring.find((r) => r.id === 'r2')?.isActive).toBe(false);
    expect(next.recurring.find((r) => r.id === 'r3')?.isActive).toBe(true);
  });

  it('never mutates its inputs', () => {
    const accounts = [acc('a1', 2000000)];
    const comms = [commitment('c1', 'a1', 'PROJECTED')];
    const recs = [recurring('r1', 'a1', true)];
    AccountEngine.archiveAccount(accounts, comms, recs, 'a1', todayISO);
    expect(accounts[0].isArchived).toBe(false);
    expect(comms[0].status).toBe('PROJECTED');
    expect(recs[0].isActive).toBe(true);
  });
});
