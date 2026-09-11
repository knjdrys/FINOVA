/**
 * DESTRUCTION TEST — generated (recurring-derived) commitment lifecycle.
 * Bills derived from recurring rules used to render pay/cancel/reschedule
 * buttons that silently did nothing (handlers only knew state.commitments),
 * overdue occurrences were invisible, and floors drifted off-grid.
 * Every transition below is a pure, tested engine function.
 */
import { describe, it, expect } from 'vitest';
import { FutureFinanceEngine } from '../domain/future-finance/FutureFinanceEngine';
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
  userId: 'user-1', title: 'Internet', amount: P(1699), currency: 'PHP', type: 'EXPENSE',
  categoryId: 'cat-bills', accountId: 'a1', frequency: 'MONTHLY',
  startDate: '2026-09-15', nextOccurrence: '2026-09-15',
  isActive: true, reminderEnabled: true, autoPostEnabled: false,
  createdAt: TODAY, updatedAt: TODAY,
  ...over,
});

let idCounter = 0;
const makeId = (prefix: string) => `${prefix}-test-${++idCounter}`;

const slices = (
  recurring: RecurringTransaction[],
  txs: Transaction[] = [],
  accounts: Account[] = [acc(P(20000))],
  commitments: MoneyCommitment[] = []
) => ({ recurring, commitments, transactions: txs, accounts });

function resolve(recurring: RecurringTransaction[], commitments: MoneyCommitment[], txs: Transaction[]) {
  return FutureFinanceEngine.resolveCommitments(
    recurring, commitments, txs, TODAY, '2026-10-15', TODAY
  );
}

describe('settlement dedupe (paid occurrences never reappear)', () => {
  it('a generated occurrence with a posted settlement is dropped from resolution', () => {
    const recs = [rule({ id: 'r-net' })];
    const before = resolve(recs, [], []);
    expect(before.map((c) => c.id)).toContain('comm-rec-r-net-2026-09-15');

    const settled = FutureFinanceEngine.settleGeneratedOccurrence(
      slices(recs), 'comm-rec-r-net-2026-09-15', TODAY, '10:00', makeId
    );
    expect(settled).not.toBeNull();
    const after = resolve(settled!.recurring, settled!.commitments, settled!.transactions);
    expect(after.map((c) => c.id)).not.toContain('comm-rec-r-net-2026-09-15');
  });
});

describe('settleGeneratedOccurrence', () => {
  it('posts exactly one EXPENSE, moves money, and advances the floor on-grid', () => {
    const recs = [rule({ id: 'r-net' })];
    const next = FutureFinanceEngine.settleGeneratedOccurrence(
      slices(recs), 'comm-rec-r-net-2026-09-15', TODAY, '10:00', makeId
    );
    expect(next).not.toBeNull();
    expect(next!.transactions).toHaveLength(1);
    const pay = next!.transactions[0];
    expect(pay.type).toBe('EXPENSE');
    expect(pay.amount).toBe(P(1699));
    expect(pay.sourceCommitmentId).toBe('comm-rec-r-net-2026-09-15');
    expect(next!.accounts[0].currentBalance).toBe(P(20000) - P(1699));
    expect(next!.recurring[0].nextOccurrence).toBe('2026-10-15');
    expect(next!.commitments).toHaveLength(0); // no backlog to rescue
  });

  it('settling a later occurrence rescues earlier unpaid ones as manual bills', () => {
    // Floor far behind: Aug 15 (overdue) + Sep 15 both outstanding.
    const recs = [rule({ id: 'r-old', startDate: '2026-06-15', nextOccurrence: '2026-06-15' })];
    const next = FutureFinanceEngine.settleGeneratedOccurrence(
      slices(recs), 'comm-rec-r-old-2026-09-15', TODAY, '10:00', makeId
    );
    expect(next).not.toBeNull();
    // Sep 15 paid via transaction; Aug 15 rescued as a manual bill.
    expect(next!.transactions).toHaveLength(1);
    expect(next!.commitments).toHaveLength(1);
    expect(next!.commitments[0].dueDate).toBe('2026-08-15');
    expect(next!.commitments[0].status).toBe('PROJECTED');
    expect(next!.commitments[0].relatedRecurringTransactionId).toBeUndefined();
    expect(next!.recurring[0].nextOccurrence).toBe('2026-10-15');
  });

  it('is idempotent: a second settle no-ops (double-tap safety)', () => {
    const recs = [rule({ id: 'r-net' })];
    const first = FutureFinanceEngine.settleGeneratedOccurrence(
      slices(recs), 'comm-rec-r-net-2026-09-15', TODAY, '10:00', makeId
    );
    expect(first).not.toBeNull();
    const second = FutureFinanceEngine.settleGeneratedOccurrence(
      { ...slices(recs), ...first! }, 'comm-rec-r-net-2026-09-15', TODAY, '10:00', makeId
    );
    expect(second).toBeNull();
  });

  it('overdraft settles record-only (COMPLETED note, no money moved)', () => {
    const recs = [rule({ id: 'r-net' })];
    const next = FutureFinanceEngine.settleGeneratedOccurrence(
      slices(recs, [], [acc(P(100))]), 'comm-rec-r-net-2026-09-15', TODAY, '10:00', makeId
    );
    expect(next).not.toBeNull();
    expect(next!.transactions).toHaveLength(0);
    expect(next!.accounts[0].currentBalance).toBe(P(100));
    expect(next!.commitments).toHaveLength(1);
    expect(next!.commitments[0].status).toBe('COMPLETED');
    expect(next!.commitments[0].notes).toContain('no balance change');
  });

  it('recurring income settles as INCOME and credits the account', () => {
    const recs = [rule({ id: 'r-pay', title: 'Salary', type: 'INCOME', categoryId: 'cat-salary', amount: P(5000) })];
    const next = FutureFinanceEngine.settleGeneratedOccurrence(
      slices(recs, [], [acc(0)]), 'comm-rec-r-pay-2026-09-15', TODAY, '10:00', makeId
    );
    expect(next).not.toBeNull();
    expect(next!.transactions[0].type).toBe('INCOME');
    expect(next!.accounts[0].currentBalance).toBe(P(5000));
  });

  it('returns null for unknown ids and dead rules', () => {
    const recs = [rule({ id: 'r-net' })];
    expect(
      FutureFinanceEngine.settleGeneratedOccurrence(slices(recs), 'comm-rec-nope-2026-09-15', TODAY, '10:00', makeId)
    ).toBeNull();
    const paused = [rule({ id: 'r-net', isActive: false })];
    expect(
      FutureFinanceEngine.settleGeneratedOccurrence(slices(paused), 'comm-rec-r-net-2026-09-15', TODAY, '10:00', makeId)
    ).toBeNull();
  });
});

describe('cancelGeneratedOccurrence', () => {
  it('skips the rule past the occurrence and rescues earlier backlog', () => {
    const recs = [rule({ id: 'r-old', startDate: '2026-06-15', nextOccurrence: '2026-06-15' })];
    const next = FutureFinanceEngine.cancelGeneratedOccurrence(
      slices(recs), 'comm-rec-r-old-2026-09-15', TODAY, makeId
    );
    expect(next).not.toBeNull();
    expect(next!.recurring[0].nextOccurrence).toBe('2026-10-15');
    // Aug 15 backlog rescued; the cancelled Sep 15 itself is gone, not rescued.
    expect(next!.commitments.map((c) => c.dueDate)).toEqual(['2026-08-15']);
  });

  it('returns null when the occurrence is gone', () => {
    const recs = [rule({ id: 'r-net' })];
    expect(
      FutureFinanceEngine.cancelGeneratedOccurrence(slices(recs), 'comm-rec-nope-2026-09-15', TODAY, makeId)
    ).toBeNull();
  });
});

describe('rescheduleGeneratedOccurrence', () => {
  it('forward move: the rule jumps, the occurrence is consumed (no duplicate)', () => {
    const recs = [rule({ id: 'r-net' })];
    const next = FutureFinanceEngine.rescheduleGeneratedOccurrence(
      slices(recs), 'comm-rec-r-net-2026-09-15', '2026-09-20', TODAY, makeId
    );
    expect(next).not.toBeNull();
    expect(next!.recurring[0].nextOccurrence).toBe('2026-09-20');
    expect(next!.commitments).toHaveLength(0);
    // The next emitted occurrence is Oct 15 (first anchored date >= Sep 20).
    const after = resolve(next!.recurring, next!.commitments, []);
    expect(after[0].dueDate).toBe('2026-10-15');
  });

  it('backward move: the occurrence truly moves to a manual bill, series continues', () => {
    const recs = [rule({ id: 'r-net' })];
    const next = FutureFinanceEngine.rescheduleGeneratedOccurrence(
      slices(recs), 'comm-rec-r-net-2026-09-15', '2026-09-10', TODAY, makeId
    );
    expect(next).not.toBeNull();
    expect(next!.commitments).toHaveLength(1);
    expect(next!.commitments[0].dueDate).toBe('2026-09-10');
    expect(next!.commitments[0].status).toBe('PROJECTED');
    // Rule continues past the moved occurrence — Sep 15 does not regenerate.
    expect(next!.recurring[0].nextOccurrence).toBe('2026-10-15');
    const after = resolve(next!.recurring, next!.commitments, []);
    expect(after.filter((c) => c.dueDate === '2026-09-15')).toHaveLength(0);
  });
});

describe('reopenBillForDeletedPayment', () => {
  const payTx = (over: Partial<Transaction> = {}): Transaction => ({
    id: 'tx-pay', userId: 'user-1', type: 'EXPENSE', amount: P(1699), currency: 'PHP',
    categoryId: 'cat-bills', accountId: 'a1', merchant: 'Internet', date: '2026-09-15',
    time: '10:00', tags: ['bill-paid'], status: 'CONFIRMED',
    sourceCommitmentId: 'c-bill', createdAt: TODAY, updatedAt: TODAY,
    ...over,
  });
  const manual = (over: Partial<MoneyCommitment> = {}): MoneyCommitment => ({
    id: 'c-bill', userId: 'user-1', title: 'Internet', type: 'BILL', amount: P(1699),
    currency: 'PHP', direction: 'OUTFLOW', status: 'COMPLETED', dueDate: '2026-09-15',
    accountId: 'a1', categoryId: 'cat-bills', priority: 'ESSENTIAL',
    createdAt: TODAY, updatedAt: TODAY,
    ...over,
  });

  it('deleting a manual payment reopens the bill as PROJECTED', () => {
    const next = FutureFinanceEngine.reopenBillForDeletedPayment([manual()], payTx(), makeId);
    expect(next[0].status).toBe('PROJECTED');
  });

  it('clears the record-only note on reopen', () => {
    const noted = manual({ notes: 'Marked paid (no balance change — insufficient funds or currency mismatch).' });
    const next = FutureFinanceEngine.reopenBillForDeletedPayment([noted], payTx(), makeId);
    expect(next[0].status).toBe('PROJECTED');
    expect(next[0].notes).toBeUndefined();
  });

  it('deleting a generated-occurrence payment rebuilds the bill from the payment', () => {
    const tx = payTx({ sourceCommitmentId: 'comm-rec-r-x-2026-09-15' });
    const next = FutureFinanceEngine.reopenBillForDeletedPayment([], tx, makeId);
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe('PROJECTED');
    expect(next[0].amount).toBe(P(1699));
    expect(next[0].dueDate).toBe('2026-09-15');
    expect(next[0].title).toBe('Internet');
    expect(next[0].autoPostEnabled).toBe(false); // must never silently re-post
  });

  it('leaves CANCELLED bills and unlinked transactions alone', () => {
    const cancelled = manual({ status: 'CANCELLED' });
    expect(FutureFinanceEngine.reopenBillForDeletedPayment([cancelled], payTx(), makeId)).toEqual([cancelled]);
    const plain: Transaction = { ...payTx(), sourceCommitmentId: undefined };
    expect(FutureFinanceEngine.reopenBillForDeletedPayment([manual()], plain, makeId)).toEqual([manual()]);
  });
});

describe('anchored floors (no month-end drift)', () => {
  it('nextAnchoredAfter walks the grid: Jan 31 → Feb 28 → Mar 31', () => {
    expect(FutureFinanceEngine.nextAnchoredAfter('2026-01-31', 'MONTHLY', '2026-01-31')).toBe('2026-02-28');
    expect(FutureFinanceEngine.nextAnchoredAfter('2026-01-31', 'MONTHLY', '2026-02-28')).toBe('2026-03-31');
    expect(FutureFinanceEngine.nextAnchoredAfter('2026-01-31', 'MONTHLY', '2026-03-31')).toBe('2026-04-30');
  });

  it('skipFloor never swallows an occurrence from an off-grid floor', () => {
    // Rescheduled to Sep 16 (off-grid): first emitted is Oct 15; skip lands past it.
    const r = rule({ id: 'r-skip', startDate: '2026-08-15', nextOccurrence: '2026-09-16' });
    expect(FutureFinanceEngine.skipFloor(r)).toBe('2026-11-15');
    // Chained +1-month math would have produced Oct 16 and swallowed Oct 15.
  });

  it('firstAnchoredOnOrAfter returns the true next occurrence for display', () => {
    expect(FutureFinanceEngine.firstAnchoredOnOrAfter('2026-08-15', 'MONTHLY', '2026-09-15')).toBe('2026-09-15');
    expect(FutureFinanceEngine.firstAnchoredOnOrAfter('2026-08-15', 'MONTHLY', '2026-09-16')).toBe('2026-10-15');
  });

  it('resume rolls to the on-grid occurrence (no chained drift)', () => {
    const r = rule({ id: 'r-res', startDate: '2026-01-31', nextOccurrence: '2026-01-31', isActive: false });
    // Chained math would land Mar 28; anchored lands on the real Mar 31 occurrence.
    expect(FutureFinanceEngine.rollForwardNextOccurrence(r, '2026-03-15')).toBe('2026-03-31');
  });

  it('ancient untouched daily rules still generate (fast-seek, no guard trip)', () => {
    const r = rule({ id: 'r-old-daily', frequency: 'DAILY', startDate: '2020-01-01', nextOccurrence: '2020-01-01' });
    const gen = FutureFinanceEngine.generateFromRecurring([r], TODAY, '2026-10-15');
    // 31-day lookback + 30-day horizon of daily occurrences, no gaps at the seam.
    expect(gen.length).toBeGreaterThan(50);
    expect(gen[0].dueDate).toBe('2026-08-15');
    expect(gen.map((c) => c.dueDate)).toContain(TODAY);
  });
});

describe('materializeGenerated', () => {
  it('drops the rule link, keeps the money, disables auto-post', () => {
    const recs = [rule({ id: 'r-net', autoPostEnabled: true })];
    const gen = resolve(recs, [], []).find((c) => c.id === 'comm-rec-r-net-2026-09-15')!;
    const copy = FutureFinanceEngine.materializeGenerated(gen, 'comm-copy', 'PROJECTED', '2026-09-15T00:00:00.000Z');
    expect(copy.relatedRecurringTransactionId).toBeUndefined();
    expect(copy.isAutoGenerated).toBe(false);
    expect(copy.autoPostEnabled).toBe(false);
    expect(copy.amount).toBe(gen.amount);
    expect(copy.accountId).toBe(gen.accountId);
    expect(copy.dueDate).toBe(gen.dueDate);
  });
});

describe('commitment timestamps are full ISO datetimes', () => {
  it('recomputeStatus and autoPost stamp datetimes, not bare dates', () => {
    const overdue = FutureFinanceEngine.recomputeStatus(
      {
        id: 'c', userId: 'u', title: 't', type: 'BILL', amount: 1, currency: 'PHP',
        direction: 'OUTFLOW', status: 'PROJECTED', dueDate: '2026-09-01',
        accountId: 'a1', categoryId: 'cat-bills', priority: 'ESSENTIAL',
        createdAt: TODAY, updatedAt: TODAY,
      },
      TODAY
    );
    expect(overdue.updatedAt).toContain('T');
    const result = FutureFinanceEngine.autoPostDueCommitments(
      [{ ...overdue, status: 'PROJECTED', dueDate: TODAY, autoPostEnabled: true }],
      [acc(P(99999))], [], TODAY
    );
    expect(result.transactions[0].createdAt).toContain('T');
    expect(result.commitments[0].updatedAt).toContain('T');
  });
});
