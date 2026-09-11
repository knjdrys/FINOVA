/**
 * HARDENING §5/§6 — calendar boundaries the stress suite didn't pin:
 * leap-day anchoring, year-boundary generation, and direction-aware
 * auto-post categories.
 */
import { describe, it, expect } from 'vitest';
import { FutureFinanceEngine } from '../domain/future-finance/FutureFinanceEngine';
import { Account, MoneyCommitment, RecurringTransaction } from '../types';

const P = (major: number) => Math.round(major * 100);

const acc = (): Account => ({
  id: 'a1', userId: 'user-1', name: 'a1', type: 'BANK', currency: 'PHP',
  initialBalance: P(100000), currentBalance: P(100000), icon: '', color: '',
  includeInTotalBalance: true, isArchived: false,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
});

const rule = (over: Partial<RecurringTransaction> & { id: string }): RecurringTransaction => ({
  userId: 'user-1', title: 'rule', amount: P(1000), currency: 'PHP', type: 'EXPENSE',
  categoryId: 'cat-bills', accountId: 'a1', frequency: 'MONTHLY',
  startDate: '2026-09-01', nextOccurrence: '2026-09-01',
  isActive: true, reminderEnabled: true, autoPostEnabled: true,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
  ...over,
});

describe('leap-day anchoring', () => {
  it('a Feb-29 rule lands Feb 28 in non-leap years and never skips February', () => {
    expect(FutureFinanceEngine.occurrenceAt('2024-02-29', 'MONTHLY', 1)).toBe('2024-03-29');
    expect(FutureFinanceEngine.occurrenceAt('2024-02-29', 'MONTHLY', 12)).toBe('2025-02-28');
    expect(FutureFinanceEngine.occurrenceAt('2024-02-29', 'YEARLY', 1)).toBe('2025-02-28');
    const gen = FutureFinanceEngine.generateFromRecurring(
      [rule({ id: 'r-leap', startDate: '2024-02-29', nextOccurrence: '2025-02-01' })],
      '2025-02-01',
      '2025-03-31'
    );
    expect(gen.map((c) => c.dueDate)).toEqual(['2025-02-28', '2025-03-29']);
  });
});

describe('year boundary', () => {
  it('weekly generation crosses Dec → Jan without gaps or dupes', () => {
    const gen = FutureFinanceEngine.generateFromRecurring(
      [rule({ id: 'r-yb', frequency: 'WEEKLY', startDate: '2026-12-28', nextOccurrence: '2026-12-28' })],
      '2026-12-28',
      '2027-01-12'
    );
    expect(gen.map((c) => c.dueDate)).toEqual(['2026-12-28', '2027-01-04', '2027-01-11']);
    const ids = gen.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('monthly Dec-31 rule continues to Jan-31', () => {
    expect(FutureFinanceEngine.occurrenceAt('2026-12-31', 'MONTHLY', 1)).toBe('2027-01-31');
    expect(FutureFinanceEngine.nextAnchoredAfter('2026-12-31', 'MONTHLY', '2026-12-31')).toBe('2027-01-31');
  });
});

describe('auto-post fallback categories follow direction', () => {
  const bare = (over: Partial<MoneyCommitment> & { id: string }): MoneyCommitment => ({
    userId: 'user-1', title: 'x', type: 'BILL', amount: P(500), currency: 'PHP',
    direction: 'OUTFLOW', status: 'PROJECTED', dueDate: '2026-09-15',
    accountId: 'a1', categoryId: '', priority: 'ESSENTIAL',
    autoPostEnabled: true, createdAt: '2026-09-15', updatedAt: '2026-09-15',
    ...over,
  });

  it('paydays fall back to Salary, bills to Bills', () => {
    const out = FutureFinanceEngine.autoPostDueCommitments(
      [
        bare({ id: 'c-in', direction: 'INFLOW', type: 'EXPECTED_INCOME', title: 'Payday' }),
        bare({ id: 'c-out', direction: 'OUTFLOW', title: 'Bill' }),
      ],
      [acc()],
      [],
      '2026-09-15'
    );
    expect(out.postedCount).toBe(2);
    const byId = new Map(out.transactions.map((t) => [t.sourceCommitmentId, t]));
    expect(byId.get('c-in')?.categoryId).toBe('cat-salary');
    expect(byId.get('c-in')?.type).toBe('INCOME');
    expect(byId.get('c-out')?.categoryId).toBe('cat-bills');
    expect(byId.get('c-out')?.type).toBe('EXPENSE');
  });
});
