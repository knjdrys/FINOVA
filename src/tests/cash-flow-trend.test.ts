/**
 * Cash-flow trend — income vs expense over the last 6 months.
 * - Current month is always flagged partial (never a fabricated full month)
 * - reservation-aware: goal-fund spend and goal-withdraw income are excluded
 * - PENDING and foreign-currency rows never count
 * - hasTrendData is the "enough real data" gate (Phase 12)
 */
import { describe, it, expect } from 'vitest';
import { buildCashFlowTrend, hasTrendData } from '../domain/insight/CashFlowTrend';
import { CurrencyCode, Transaction } from '../types';

const month = (offset: number, day = 10): string => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - offset, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${Math.random().toString(36).slice(2, 10)}`,
  userId: 'user-1',
  type: 'INCOME',
  amount: 1000000,
  currency: 'PHP' as CurrencyCode,
  categoryId: 'cat-salary',
  accountId: 'acc-1',
  merchant: 'test',
  date: month(1),
  time: '09:00',
  tags: [],
  status: 'CONFIRMED',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

describe('buildCashFlowTrend', () => {
  it('returns 6 points oldest → newest, current month flagged partial', () => {
    const points = buildCashFlowTrend([], 'PHP', 6);
    expect(points).toHaveLength(6);
    expect(points.every((p, i) => (i === points.length - 1 ? !p.complete : p.complete))).toBe(true);
  });

  it('sums income and expense per month for the matching currency', () => {
    const txs = [
      tx({ amount: 2000000, date: month(2) }), // income 20k, 2 months ago
      tx({ type: 'EXPENSE', amount: 800000, categoryId: 'cat-food', date: month(2) }), // 8k spend
      tx({ amount: 1500000, date: month(1) }),
      tx({ type: 'EXPENSE', amount: 500000, categoryId: 'cat-food', date: month(1) }),
    ];
    const points = buildCashFlowTrend(txs, 'PHP', 6);
    const p2 = points.find((p) => p.complete && p.incomeMinor === 2000000)!;
    expect(p2.expenseMinor).toBe(800000);
    const p1 = points.find((p) => p.complete && p.incomeMinor === 1500000)!;
    expect(p1.expenseMinor).toBe(500000);
  });

  it('excludes goal-fund spend and goal-withdraw income', () => {
    const txs = [
      tx({ type: 'EXPENSE', amount: 900000, categoryId: 'cat-transfer', tags: ['goal-fund'], date: month(1) }),
      tx({ amount: 700000, categoryId: 'cat-transfer', tags: ['goal-withdraw'], date: month(1) }),
    ];
    const points = buildCashFlowTrend(txs, 'PHP', 6);
    const p = points[points.length - 2];
    expect(p.incomeMinor).toBe(0);
    expect(p.expenseMinor).toBe(0);
  });

  it('never counts PENDING or foreign-currency rows', () => {
    const txs = [
      tx({ status: 'PENDING', date: month(1) }),
      tx({ currency: 'USD', date: month(1) }),
      tx({ type: 'EXPENSE', currency: 'USD', amount: 400000, date: month(1) }),
    ];
    const points = buildCashFlowTrend(txs, 'PHP', 6);
    for (const p of points) {
      expect(p.incomeMinor).toBe(0);
      expect(p.expenseMinor).toBe(0);
    }
  });

  it('honors the months parameter', () => {
    expect(buildCashFlowTrend([], 'PHP', 3)).toHaveLength(3);
    expect(buildCashFlowTrend([], 'PHP', 12)).toHaveLength(12);
  });
});

describe('hasTrendData', () => {
  it('is false with no data at all', () => {
    expect(hasTrendData(buildCashFlowTrend([], 'PHP'))).toBe(false);
  });

  it('is false when only the partial current month has activity', () => {
    const txs = [tx({ date: month(0, 2) }), tx({ type: 'EXPENSE', amount: 10000, categoryId: 'cat-food', date: month(0, 2) })];
    expect(hasTrendData(buildCashFlowTrend(txs, 'PHP'))).toBe(false);
  });

  it('is true once a complete month has real activity', () => {
    const txs = [tx({ type: 'EXPENSE', amount: 10000, categoryId: 'cat-food', date: month(1) })];
    expect(hasTrendData(buildCashFlowTrend(txs, 'PHP'))).toBe(true);
  });
});
