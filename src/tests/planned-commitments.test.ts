/**
 * Planned expenses, commitments, timeline separation, payday income.
 * - Settlement is direction-aware: OUTFLOW → EXPENSE, INFLOW → INCOME.
 * - Marking paid twice never posts twice (sourceCommitmentId idempotency).
 * - Future commitments never touch actual balances; the timeline labels
 *   ACTUAL vs SCHEDULED/PROJECTED and projects without mutating accounts.
 * - Planned expenses complete exactly once through the same settlement path.
 */
import { describe, it, expect } from 'vitest';
import { FutureFinanceEngine } from '../domain/future-finance/FutureFinanceEngine';
import { TimelineEngine } from '../domain/timeline/TimelineEngine';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { Account, CurrencyCode, MoneyCommitment } from '../types';

const TODAY = '2026-09-15';

const acc = (id: string, balance: number): Account => ({
  id, userId: 'user-1', name: id, type: 'BANK', currency: 'PHP',
  initialBalance: balance, currentBalance: balance, icon: 'Building2', color: '#000',
  includeInTotalBalance: true, isArchived: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

const comm = (over: Partial<MoneyCommitment> = {}): MoneyCommitment => ({
  id: 'comm-1', userId: 'user-1', title: 'New shoes', type: 'PLANNED_EXPENSE',
  amount: 300000, currency: 'PHP' as CurrencyCode, direction: 'OUTFLOW',
  status: 'PROJECTED', dueDate: '2026-09-20', accountId: 'acc-1',
  categoryId: 'cat-shopping', priority: 'ESSENTIAL',
  createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z',
  ...over,
});

describe('direction-aware settlement', () => {
  it('builds EXPENSE for outflow, INCOME for inflow (payday never posts as expense)', () => {
    const out = FutureFinanceEngine.buildSettlementTransaction(comm(), TODAY, '10:00');
    expect(out.type).toBe('EXPENSE');
    expect(out.tags).toEqual(['bill-paid']);

    const payday = FutureFinanceEngine.buildSettlementTransaction(
      comm({ id: 'comm-pay', title: 'Payday', type: 'EXPECTED_INCOME', direction: 'INFLOW', categoryId: 'cat-salary', amount: 2000000 }),
      TODAY, '09:00'
    );
    expect(payday.type).toBe('INCOME');
    expect(payday.tags).toEqual(['income-received']);
    expect(payday.sourceCommitmentId).toBe('comm-pay');
  });

  it('settling inflow credits the account; settling outflow debits it', () => {
    const accounts = [acc('acc-1', 500000)];
    const credited = TransactionEngine.applyTransactionToAccounts(
      { ...FutureFinanceEngine.buildSettlementTransaction(comm({ direction: 'INFLOW', amount: 2000000 }), TODAY, '09:00'), id: 't1', createdAt: TODAY, updatedAt: TODAY },
      accounts
    );
    expect(credited[0].currentBalance).toBe(2500000);

    const debited = TransactionEngine.applyTransactionToAccounts(
      { ...FutureFinanceEngine.buildSettlementTransaction(comm(), TODAY, '10:00'), id: 't2', createdAt: TODAY, updatedAt: TODAY },
      accounts
    );
    expect(debited[0].currentBalance).toBe(200000);
  });

  it('a completed planned expense settles exactly once through auto-post', () => {
    const accounts = [acc('acc-1', 1000000)];
    const due = [{ ...comm(), dueDate: TODAY, autoPostEnabled: true }];
    const first = FutureFinanceEngine.autoPostDueCommitments(due, accounts, [], TODAY);
    expect(first.postedCount).toBe(1);
    const second = FutureFinanceEngine.autoPostDueCommitments(due, first.accounts, first.transactions, TODAY);
    expect(second.postedCount).toBe(0);
    expect(second.transactions).toHaveLength(1);
  });
});

describe('actual vs projected separation', () => {
  it('future commitments appear as PROJECTED and never mutate balances', () => {
    const accounts = [acc('acc-1', 1000000)];
    const before = accounts[0].currentBalance;
    const days = TimelineEngine.generateTimeline(accounts, [], [comm()], [], TODAY, '2026-10-15', TODAY);
    expect(accounts[0].currentBalance).toBe(before);

    const futureDay = days.find((d) => d.date === '2026-09-20');
    expect(futureDay).toBeDefined();
    expect(futureDay!.events.some((e) => e.status === 'PROJECTED' && e.title === 'New shoes')).toBe(true);
    expect(futureDay!.events.some((e) => e.status === 'ACTUAL')).toBe(false);
    // Projection accounts for it without touching the real balance.
    expect(futureDay!.projectedEndOfDayBalance).toBe(before - 300000);
  });

  it('payday projects as INFLOW on the timeline', () => {
    const accounts = [acc('acc-1', 1000000)];
    const days = TimelineEngine.generateTimeline(
      accounts, [],
      [comm({ id: 'comm-pay', title: 'Payday', type: 'EXPECTED_INCOME', direction: 'INFLOW', amount: 2000000, dueDate: '2026-09-30' })],
      [], TODAY, '2026-10-15', TODAY
    );
    const payDay = days.find((d) => d.date === '2026-09-30');
    expect(payDay!.events.some((e) => e.direction === 'INFLOW' && e.status === 'PROJECTED')).toBe(true);
  });
});
