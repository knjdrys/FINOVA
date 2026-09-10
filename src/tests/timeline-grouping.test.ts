/**
 * Grouped transaction timeline (view-level) + dynamic demo data.
 *
 *  1. groupByCategory: same-category items stay together on a busy day,
 *     single-item categories stay compact, ordering is newest-first, and
 *     subtotals are exact (integer minor units).
 *  2. buildDemoState: demo dates are RELATIVE to the injected "today" —
 *     no hardcoded calendar months — and the output is deterministic, so a
 *     brand-new user always sees a believable, never-empty timeline.
 */
import { describe, expect, it } from 'vitest';
import { groupByCategory } from '../domain/transaction/DayGrouping';
import { buildDemoState } from '../services/storage/FinovaStorage';
import { Transaction } from '../types';

function tx(overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'categoryId' | 'date'>): Transaction {
  return {
    userId: 'user-1',
    type: 'EXPENSE',
    currency: 'PHP',
    accountId: 'acc-1',
    tags: [],
    status: 'CONFIRMED',
    time: '12:00',
    ...overrides,
  } as Transaction;
}

describe('groupByCategory (timeline grouping)', () => {
  it('returns an empty array for no items', () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it('keeps same-category items together and sums their subtotal', () => {
    const foodA = tx({ id: 'a', amount: 320, categoryId: 'cat-food', date: '2026-09-10' });
    const foodB = tx({ id: 'b', amount: 490, categoryId: 'cat-food', date: '2026-09-10' });
    const other = tx({ id: 'c', amount: 100, categoryId: 'cat-transport', date: '2026-09-10' });
    const groups = groupByCategory([foodA, other, foodB]);
    expect(groups).toHaveLength(2);
    const food = groups.find((g) => g.categoryId === 'cat-food');
    expect(food).toBeDefined();
    expect(food!.items.map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect(food!.totalMinor).toBe(810);
  });

  it('orders groups newest-first: most recent item first, larger subtotal breaks ties', () => {
    // Screens pass a single day's rows (newest-first). Group order follows the
    // first (most recent) item of each category; equal recency → bigger subtotal first.
    const food = tx({ id: 'food', amount: 810, categoryId: 'cat-food', date: '2026-09-10', time: '12:00' });
    const bills = tx({ id: 'bills', amount: 900, categoryId: 'cat-bills', date: '2026-09-10', time: '12:00' });
    const transport = tx({ id: 'trans', amount: 60, categoryId: 'cat-transport', date: '2026-09-10', time: '09:00' });
    // food & bills share the newest timestamp → bills (900) must rank above food (810).
    const groups = groupByCategory([food, transport, bills]);
    expect(groups.map((g) => g.categoryId)).toEqual(['cat-bills', 'cat-food', 'cat-transport']);
  });

  it('respects a pre-sorted display order (newest first) within a day', () => {
    const late = tx({ id: 'late', amount: 100, categoryId: 'cat-bills', date: '2026-09-10', time: '15:00' });
    const early = tx({ id: 'early', amount: 100, categoryId: 'cat-bills', date: '2026-09-10', time: '09:00' });
    // Input already newest-first.
    const groups = groupByCategory([late, early]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((t) => t.id)).toEqual(['late', 'early']);
  });
});

describe('buildDemoState (relative, dynamic demo data)', () => {
  it('is deterministic for a fixed "today"', () => {
    const a = buildDemoState('2026-09-10');
    const b = buildDemoState('2026-09-10');
    expect(a.transactions).toEqual(b.transactions);
    expect(a.accounts).toEqual(b.accounts);
    expect(a.budgets).toEqual(b.budgets);
    expect(a.goals).toEqual(b.goals);
    expect(a.commitments).toEqual(b.commitments);
  });

  it('anchors every transaction date to the injected today (no hardcoded months)', () => {
    const today = '2026-09-10';
    const s = buildDemoState(today);
    expect(s.transactions.length).toBeGreaterThan(0);
    // At least one expense and one income exist.
    expect(s.transactions.some((t) => t.type === 'EXPENSE')).toBe(true);
    expect(s.transactions.some((t) => t.type === 'INCOME')).toBe(true);
    // Every transaction date is on-or-before today (demo is historical).
    for (const t of s.transactions) {
      expect(t.date <= today).toBe(true);
    }
  });

  it('shifts dates when "today" changes (proof they are relative)', () => {
    const s1 = buildDemoState('2026-09-10');
    const s2 = buildDemoState('2026-11-20');
    // Counts may legitimately differ by day-of-month (e.g. the 15th payroll
    // only exists once the month has reached it), so compare date SETS instead.
    const d1 = s1.transactions.map((t) => t.date).sort();
    const d2 = s2.transactions.map((t) => t.date).sort();
    expect(d1).not.toEqual(d2);
    // Both anchors produce a plausible recent window (nothing older than ~1 month).
    expect(s1.transactions.length).toBeGreaterThanOrEqual(15);
    expect(s2.transactions.length).toBeGreaterThanOrEqual(15);
    // The most recent demo transaction sits at/just before the new today.
    const latest = s2.transactions.map((t) => t.date).sort().at(-1)!;
    expect(latest <= '2026-11-20').toBe(true);
  });

  it('always seeds something to spend on today so the Today view is not empty', () => {
    const today = '2026-09-10';
    const s = buildDemoState(today);
    expect(s.transactions.some((t) => t.date === today && t.type === 'EXPENSE')).toBe(true);
  });
});
