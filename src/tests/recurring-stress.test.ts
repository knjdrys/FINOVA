/**
 * Day 4 — recurring + future-money stress (idempotency + date correctness).
 * Frequencies, same-day storms, missed/cancelled/edited events, auto-post
 * double-fire, planned expenses, timeline projection math.
 */
import { describe, it, expect } from 'vitest';
import { FutureFinanceEngine } from '../domain/future-finance/FutureFinanceEngine';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { TimelineEngine } from '../domain/timeline/TimelineEngine';
import { UnifiedEntry } from '../domain/entry/UnifiedEntry';
import { DateUtils } from '../domain/date/DateUtils';
import { Account, MoneyCommitment, RecurringTransaction, Transaction } from '../types';

const TODAY = '2026-09-15';
const P = (major: number) => Math.round(major * 100);

const acc = (balance: number): Account => ({
  id: 'a1', userId: 'user-1', name: 'a1', type: 'BANK', currency: 'PHP',
  initialBalance: balance, currentBalance: balance, icon: '', color: '',
  includeInTotalBalance: true, isArchived: false,
  createdAt: TODAY, updatedAt: TODAY,
});

const rule = (over: Partial<RecurringTransaction> & { id: string }): RecurringTransaction => ({
  userId: 'user-1', title: 'rule', amount: P(1000), currency: 'PHP', type: 'EXPENSE',
  categoryId: 'cat-bills', accountId: 'a1', frequency: 'MONTHLY',
  startDate: '2026-09-01', nextOccurrence: '2026-09-01',
  isActive: true, reminderEnabled: true, autoPostEnabled: true,
  createdAt: TODAY, updatedAt: TODAY,
  ...over,
});

const commitment = (over: Partial<MoneyCommitment> & { id: string }): MoneyCommitment => ({
  userId: 'user-1', title: 'bill', type: 'BILL', amount: P(1000), currency: 'PHP',
  direction: 'OUTFLOW', status: 'PROJECTED', dueDate: TODAY,
  accountId: 'a1', categoryId: 'cat-bills', priority: 'ESSENTIAL',
  autoPostEnabled: true, createdAt: TODAY, updatedAt: TODAY,
  ...over,
});

/** Mirrors the App auto-post updater: resolve → filter due → post → merge. */
function autoPostPass(
  accounts: Account[], commitments: MoneyCommitment[], recurring: RecurringTransaction[], txs: Transaction[]
) {
  const resolved = FutureFinanceEngine.resolveCommitments(
    recurring, commitments, txs, TODAY, DateUtils.addDaysISO(TODAY, 30), TODAY
  );
  const due = resolved.filter(
    (c) => c.autoPostEnabled && c.dueDate <= TODAY &&
      c.status !== 'COMPLETED' && c.status !== 'CANCELLED' && c.status !== 'AUTO_POSTED'
  );
  if (due.length === 0) return { accounts, commitments, recurring, txs, posted: 0 };
  const result = FutureFinanceEngine.autoPostDueCommitments(due, accounts, txs, TODAY);
  if (result.postedCount === 0) return { accounts, commitments, recurring, txs, posted: 0 };
  const postedIds = new Set(result.commitments.filter((c) => c.status === 'AUTO_POSTED').map((c) => c.id));
  const postedRecs = new Set(
    result.commitments.filter((c) => postedIds.has(c.id) && c.relatedRecurringTransactionId)
      .map((c) => c.relatedRecurringTransactionId as string)
  );
  return {
    accounts: result.accounts,
    commitments: commitments.map((c) =>
      postedIds.has(c.id) ? { ...c, status: 'AUTO_POSTED' as const } : c),
    recurring: recurring.map((r) =>
      postedRecs.has(r.id)
        ? { ...r, nextOccurrence: FutureFinanceEngine.advanceOccurrence(r.nextOccurrence, r.frequency) }
        : r),
    txs: result.transactions,
    posted: result.postedCount,
  };
}

describe('frequency generation counts', () => {
  it('WEEKLY yields 5 occurrences in September 2026', () => {
    const gen = FutureFinanceEngine.generateFromRecurring(
      [rule({ id: 'r-w', frequency: 'WEEKLY', startDate: '2026-09-01', nextOccurrence: '2026-09-01' })],
      '2026-09-01', '2026-09-30'
    );
    expect(gen.map((c) => c.dueDate)).toEqual(
      ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']);
  });

  it('BIWEEKLY yields Sep 1/15/29', () => {
    const gen = FutureFinanceEngine.generateFromRecurring(
      [rule({ id: 'r-b', frequency: 'BIWEEKLY', startDate: '2026-09-01', nextOccurrence: '2026-09-01' })],
      '2026-09-01', '2026-09-30'
    );
    expect(gen.map((c) => c.dueDate)).toEqual(['2026-09-01', '2026-09-15', '2026-09-29']);
  });

  it('YEARLY yields exactly one occurrence in the target year', () => {
    const gen = FutureFinanceEngine.generateFromRecurring(
      [rule({ id: 'r-y', frequency: 'YEARLY', startDate: '2025-01-15', nextOccurrence: '2026-01-15' })],
      '2026-01-01', '2026-12-31'
    );
    expect(gen.map((c) => c.dueDate)).toEqual(['2026-01-15']);
  });

  it('MONTHLY on the 31st never drifts: Jan31 → Feb28 → Mar31 → Apr30', () => {
    const gen = FutureFinanceEngine.generateFromRecurring(
      [rule({ id: 'r-31', frequency: 'MONTHLY', startDate: '2026-01-31', nextOccurrence: '2026-01-31' })],
      '2026-01-01', '2026-04-30'
    );
    expect(gen.map((c) => c.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
});

describe('double-fire idempotency (StrictMode / re-fire)', () => {
  it('second identical pass posts nothing and advances nothing', () => {
    const accounts = [acc(P(20000))];
    // startDate anchors the grid: Aug 15 → Sep 15 (today) is on-grid.
    const recs = [rule({ id: 'r-net', amount: P(1699), startDate: '2026-08-15', nextOccurrence: TODAY })];
    const first = autoPostPass(accounts, [], recs, []);
    expect(first.posted).toBe(1);
    expect(first.txs).toHaveLength(1);
    expect(first.recurring[0].nextOccurrence).toBe('2026-10-15');

    const second = autoPostPass(first.accounts, first.commitments, first.recurring, first.txs);
    expect(second.posted).toBe(0);
    expect(second.txs).toHaveLength(1);
    expect(second.recurring[0].nextOccurrence).toBe('2026-10-15');
    expect(second.accounts[0].currentBalance).toBe(first.accounts[0].currentBalance);
  });

  it('stale rules post the current occurrence only — no backlog dump; rerun adds nothing', () => {
    // No-backlog policy: months before today never materialize (horizon starts
    // today), so a stale rule posts exactly the current on-grid occurrence.
    const accounts = [acc(P(2500))];
    const recs = [rule({ id: 'r-old', amount: P(1000), startDate: '2026-06-15', nextOccurrence: '2026-06-15' })];
    const first = autoPostPass(accounts, [], recs, []);
    // Anchored grid from Jun 15: only Sep 15 falls in [today, today+30].
    expect(first.posted).toBe(1);
    expect(first.accounts[0].currentBalance).toBe(P(1500));
    const second = autoPostPass(first.accounts, first.commitments, first.recurring, first.txs);
    expect(second.posted).toBe(0);
    expect(second.txs).toHaveLength(first.txs.length);
  });
});

describe('cancelled / edited events', () => {
  it('CANCELLED and COMPLETED commitments are never auto-posted', () => {
    const accounts = [acc(P(20000))];
    const comms = [
      commitment({ id: 'c-cancel', status: 'CANCELLED' }),
      commitment({ id: 'c-done', status: 'COMPLETED' }),
    ];
    const result = FutureFinanceEngine.autoPostDueCommitments(comms, accounts, [], TODAY);
    expect(result.postedCount).toBe(0);
    expect(result.transactions).toHaveLength(0);
  });

  it('editing a rule amount flows into newly generated commitments', () => {
    // On-grid: Sep 15 start → Oct 15 occurrence.
    const edited = rule({ id: 'r-net', amount: P(1999), startDate: '2026-09-15', nextOccurrence: '2026-10-15' });
    const gen = FutureFinanceEngine.generateFromRecurring([edited], '2026-10-01', '2026-10-31');
    expect(gen).toHaveLength(1);
    expect(gen[0].amount).toBe(P(1999));
    expect(gen[0].id).toBe('comm-rec-r-net-2026-10-15');
  });

  it('pausing a rule removes its future occurrences immediately', () => {
    const paused = rule({ id: 'r-net', isActive: false, nextOccurrence: TODAY });
    expect(FutureFinanceEngine.generateFromRecurring([paused], TODAY, '2026-12-31')).toEqual([]);
  });
});

describe('planned expenses stay projected', () => {
  it('a planned payload creates a PROJECTED commitment: timeline shows it, balances do not move', () => {
    const payload = UnifiedEntry.buildPlannedPayload({
      title: 'Laptop', amount: P(45000), currency: 'PHP',
      categoryId: 'cat-shopping', accountId: 'a1', dueDate: '2026-09-25',
    });
    const planned = commitment({ ...payload, id: 'c-plan', status: 'PROJECTED' });
    const accounts = [acc(P(50000))];

    const days = TimelineEngine.generateTimeline(accounts, [], [planned], [], TODAY, '2026-09-30', TODAY);
    const day25 = days.find((d) => d.date === '2026-09-25');
    expect(day25?.events.some((e) => e.status === 'PROJECTED')).toBe(true);
    // Balances move only via real transactions.
    expect(accounts[0].currentBalance).toBe(P(50000));
    expect(TransactionEngine.calculatePeriodTotals([], TODAY, '2026-09-30', 'PHP').totalExpense.getMinorUnits()).toBe(0);
  });
});

describe('timeline projection math', () => {
  it('same-day salary INFLOW + bill OUTFLOW net correctly in order', () => {
    const accounts = [acc(P(10000))];
    const comms = [
      commitment({ id: 'c-pay', title: 'Salary', direction: 'INFLOW', type: 'EXPECTED_INCOME', amount: P(20000), dueDate: '2026-09-20' }),
      commitment({ id: 'c-rent', title: 'Rent', amount: P(5000), dueDate: '2026-09-20' }),
    ];
    const days = TimelineEngine.generateTimeline(accounts, [], comms, [], TODAY, '2026-09-25', TODAY);
    const day20 = days.find((d) => d.date === '2026-09-20');
    expect(day20?.totalInflow).toBe(P(20000));
    expect(day20?.totalOutflow).toBe(P(5000));
    expect(day20?.netAmount).toBe(P(15000));
    expect(day20?.projectedEndOfDayBalance).toBe(P(10000) + P(15000));
  });
});
