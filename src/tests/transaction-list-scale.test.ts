/**
 * Long-list behavior — 500 deterministic transactions.
 * Filtering, split-aware category match, sorting, and summary math
 * (goal-fund excluded) must hold at realistic volumes.
 */
import { describe, it, expect } from 'vitest';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { Transaction, CurrencyCode } from '../types';

const CATS = ['cat-food', 'cat-bills', 'cat-transport'];

function build500(): Transaction[] {
  const out: Transaction[] = [];
  for (let i = 0; i < 500; i++) {
    const day = String((i % 28) + 1).padStart(2, '0');
    const isSplit = i % 10 === 0;
    out.push({
      id: `tx-${i}`,
      userId: 'user-1',
      type: i % 25 === 0 ? 'INCOME' : 'EXPENSE',
      amount: 10000 + (i % 7) * 1000,
      currency: 'PHP' as CurrencyCode,
      categoryId: CATS[i % CATS.length],
      accountId: 'acc-1',
      date: `2026-09-${day}`,
      tags: i % 50 === 1 ? ['goal-fund'] : [],
      status: 'CONFIRMED',
      ...(isSplit
        ? { splitParts: [{ categoryId: 'cat-food', amount: 6000 }, { categoryId: 'cat-transport', amount: 4000 + (i % 7) * 1000 }] }
        : {}),
      createdAt: `2026-09-${day}T10:00:00Z`,
      updatedAt: `2026-09-${day}T10:00:00Z`,
    });
  }
  // Repair split totals so every split sums exactly to its parent.
  return out.map((t) =>
    t.splitParts
      ? { ...t, splitParts: [{ categoryId: 'cat-food', amount: 6000 }, { categoryId: 'cat-transport', amount: t.amount - 6000 }] }
      : t
  );
}

describe('long transaction lists', () => {
  const all = build500();

  it('filters by type and search across all rows', () => {
    const income = TransactionEngine.filterTransactions(all, { type: 'INCOME' });
    expect(income.length).toBe(20);
    expect(income.every((t) => t.type === 'INCOME')).toBe(true);
  });

  it('category filter is split-aware at volume', () => {
    const food = TransactionEngine.filterTransactions(all, { categoryId: 'cat-food' });
    // Every 10th row is a split containing cat-food; plus every 3rd row's main category.
    expect(food.length).toBeGreaterThan(150);
    expect(food.every((t) => t.categoryId === 'cat-food' || (t.splitParts || []).some((p) => p.categoryId === 'cat-food'))).toBe(true);
  });

  it('summary math excludes goal-funding across the full list', () => {
    const spend = all
      .filter((t) => t.type === 'EXPENSE' && !TransactionEngine.isGoalFunding(t))
      .reduce((s, t) => s + t.amount, 0);
    const raw = all.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
    expect(raw - spend).toBeGreaterThan(0);
    const totals = TransactionEngine.calculatePeriodTotals(all, '2026-09-01', '2026-09-30', 'PHP', 'PHP', '2026-09-30');
    expect(totals.totalExpense.getMinorUnits()).toBe(spend);
    expect(totals.transactionCount).toBe(all.filter((t) => !TransactionEngine.isGoalFunding(t)).length);
  });

  it('sorts newest-first deterministically', () => {
    const sorted = TransactionEngine.filterTransactions(all, { sortBy: 'NEWEST' });
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].date >= sorted[i].date).toBe(true);
    }
  });
});
