/**
 * Unified entry — Planned + Repeat domain integration.
 * - Planned builds a PROJECTED OUTFLOW commitment and never touches balances.
 * - Repeat maps to the right frequency and starts at the given date.
 * - Validation rejects bad planned input and transfers-that-repeat.
 */
import { describe, it, expect } from 'vitest';
import { UnifiedEntry } from '../domain/entry/UnifiedEntry';
import { Account } from '../types';

const acc = (balance: number): Account => ({
  id: 'acc-1',
  userId: 'user-1',
  name: 'acc-1',
  type: 'BANK',
  currency: 'PHP',
  initialBalance: balance,
  currentBalance: balance,
  icon: 'Building2',
  color: '#000',
  includeInTotalBalance: true,
  isArchived: false,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
});

describe('UnifiedEntry planned payload', () => {
  it('creates a PROJECTED OUTFLOW commitment that moves no money', () => {
    const c = UnifiedEntry.buildPlannedPayload({
      title: 'New shoes',
      amount: 300000,
      currency: 'PHP',
      categoryId: 'cat-shopping',
      accountId: 'acc-1',
      dueDate: '2026-09-20',
    });
    expect(c.type).toBe('PLANNED_EXPENSE');
    expect(c.status).toBe('PROJECTED');
    expect(c.direction).toBe('OUTFLOW');
    expect(c.dueDate).toBe('2026-09-20');
    expect(c.amount).toBe(300000);
  });

  it('rejects untitled, zero-amount, account-less, and dateless plans', () => {
    const base = { title: 'X', amount: 1000, currency: 'PHP' as const, categoryId: 'c', accountId: 'a', dueDate: '2026-09-20' };
    expect(UnifiedEntry.validatePlanned({ ...base, title: '  ' })).toMatch(/title/i);
    expect(UnifiedEntry.validatePlanned({ ...base, amount: 0 })).toMatch(/amount/i);
    expect(UnifiedEntry.validatePlanned({ ...base, accountId: '' })).toMatch(/account/i);
    expect(UnifiedEntry.validatePlanned({ ...base, dueDate: '' })).toMatch(/date/i);
    expect(UnifiedEntry.validatePlanned(base)).toBeNull();
  });
});

describe('UnifiedEntry repeat payload', () => {
  it('maps each repeat option to the matching frequency', () => {
    const base = { title: 'Internet', amount: 169900, currency: 'PHP' as const, type: 'EXPENSE' as const, categoryId: 'cat-bills', accountId: 'acc-1', startDate: '2026-09-10' };
    expect(UnifiedEntry.buildRecurringPayload({ ...base, repeat: 'MONTHLY' }).frequency).toBe('MONTHLY');
    expect(UnifiedEntry.buildRecurringPayload({ ...base, repeat: 'WEEKLY' }).frequency).toBe('WEEKLY');
    expect(UnifiedEntry.buildRecurringPayload({ ...base, repeat: 'BIWEEKLY' }).frequency).toBe('BIWEEKLY');
    expect(UnifiedEntry.buildRecurringPayload({ ...base, repeat: 'YEARLY' }).frequency).toBe('YEARLY');
  });

  it('starts the rule on the chosen date and keeps it active', () => {
    const r = UnifiedEntry.buildRecurringPayload({
      title: 'Rent', amount: 500000, currency: 'PHP', type: 'EXPENSE',
      categoryId: 'cat-bills', accountId: 'acc-1', startDate: '2026-09-10', repeat: 'MONTHLY',
    });
    expect(r.startDate).toBe('2026-09-10');
    expect(r.nextOccurrence).toBe('2026-09-10');
    expect(r.isActive).toBe(true);
  });

  it('rejects transfers-that-repeat and overdrawing rules', () => {
    const accounts = [acc(100000)];
    expect(
      UnifiedEntry.validateRepeat(
        { title: 'T', amount: 50000, currency: 'PHP', type: 'TRANSFER', categoryId: 'c', accountId: 'acc-1', startDate: '2026-09-10', repeat: 'MONTHLY' },
        accounts
      )
    ).toMatch(/cannot repeat/i);
    expect(
      UnifiedEntry.validateRepeat(
        { title: 'Big', amount: 500000, currency: 'PHP', type: 'EXPENSE', categoryId: 'c', accountId: 'acc-1', startDate: '2026-09-10', repeat: 'MONTHLY' },
        accounts
      )
    ).toMatch(/exceed|insufficient|overdraw|balance/i);
  });
});
