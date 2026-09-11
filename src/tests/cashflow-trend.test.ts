/**
 * Monthly cash-flow trend: buckets land in the right month (oldest → newest),
 * bookkeeping and transfers never pollute income/expense, and foreign
 * currencies stay out like every other analytic.
 */
import { describe, expect, it } from 'vitest';
import { getMonthlyCashFlow } from '../domain/insight/InsightEngine';
import { Transaction } from '../types';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: `tx-${Math.random()}`, userId: 'u', type: 'EXPENSE', amount: 100,
  currency: 'PHP', categoryId: 'cat-food', accountId: 'a', date: '2026-09-05',
  tags: [], status: 'CONFIRMED', createdAt: '', updatedAt: '', ...over,
});

describe('getMonthlyCashFlow', () => {
  it('returns six buckets ending with the reference month, oldest first', () => {
    const out = getMonthlyCashFlow([], 'PHP', '2026-09-11');
    expect(out).toHaveLength(6);
    expect(out.map((b) => b.monthStartISO)).toEqual([
      '2026-04-01', '2026-05-01', '2026-06-01',
      '2026-07-01', '2026-08-01', '2026-09-01',
    ]);
    expect(out[5].monthIndex0).toBe(8); // September
    expect(out[5].year).toBe(2026);
  });

  it('attributes income and expense to the transaction month', () => {
    const out = getMonthlyCashFlow(
      [
        tx({ type: 'INCOME', amount: 5000, date: '2026-09-01' }),
        tx({ type: 'EXPENSE', amount: 2000, date: '2026-09-15' }),
        tx({ type: 'EXPENSE', amount: 700, date: '2026-08-20' }),
      ],
      'PHP', '2026-09-11'
    );
    const sep = out[5];
    expect(sep.income).toBe(5000);
    expect(sep.expense).toBe(2000);
    expect(sep.net).toBe(3000);
    expect(sep.hasActivity).toBe(true);
    expect(out[4].expense).toBe(700);
    expect(out[0].hasActivity).toBe(false);
  });

  it('excludes goal funding, adjustments, transfers, and pending rows', () => {
    const out = getMonthlyCashFlow(
      [
        tx({ type: 'EXPENSE', amount: 999, tags: ['goal-fund'] }),
        tx({ type: 'EXPENSE', amount: 999, tags: ['adjustment'] }),
        tx({ type: 'INCOME', amount: 999, tags: ['adjustment'] }),
        tx({ type: 'TRANSFER', amount: 999 }),
        tx({ type: 'INCOME', amount: 999, status: 'PENDING' }),
        tx({ type: 'INCOME', amount: 50 }),
      ],
      'PHP', '2026-09-11'
    );
    expect(out[5].income).toBe(50);
    expect(out[5].expense).toBe(0);
  });

  it('never mixes currencies', () => {
    const out = getMonthlyCashFlow(
      [tx({ type: 'INCOME', amount: 1000, currency: 'USD' })],
      'PHP', '2026-09-11'
    );
    expect(out[5].hasActivity).toBe(false);
  });
});
