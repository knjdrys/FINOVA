/**
 * Merchant smart categorization + duplicate-entry hints.
 * - Suggestion only when evidence is unambiguous: ≥3 past CONFIRMED uses of
 *   the same merchant (same type + currency) and a UNIQUE winning category.
 * - Split expenses teach each allocated category; goal-funding reservations
 *   never teach; pending / foreign rows never count.
 * - Duplicate = same merchant + amount + day (a hint, never a block).
 */
import { describe, it, expect } from 'vitest';
import {
  suggestCategoryForMerchant,
  findPossibleDuplicate,
  normalizeMerchant,
} from '../domain/transaction/MerchantCategorizer';
import { CurrencyCode, Transaction } from '../types';

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${Math.random().toString(36).slice(2, 10)}`,
  userId: 'user-1',
  type: 'EXPENSE',
  amount: 10000,
  currency: 'PHP' as CurrencyCode,
  categoryId: 'cat-groceries',
  accountId: 'acc-1',
  merchant: 'S&R',
  date: '2026-08-10',
  time: '10:00',
  tags: [],
  status: 'CONFIRMED',
  createdAt: '2026-08-10T10:00:00Z',
  updatedAt: '2026-08-10T10:00:00Z',
  ...over,
});

const history = (n: number, categoryId: string): Transaction[] =>
  Array.from({ length: n }, () => tx({ categoryId }));

describe('normalizeMerchant', () => {
  it('is case, trim, and whitespace-insensitive', () => {
    expect(normalizeMerchant('  s&R  ')).toBe('s&r');
    expect(normalizeMerchant('  SR   Express ')).toBe('sr express');
    expect(normalizeMerchant('G  Cash')).toBe(normalizeMerchant('g cash'));
  });
});

describe('suggestCategoryForMerchant', () => {
  it('suggests the unique winner after enough history', () => {
    const sug = suggestCategoryForMerchant('S&R', [...history(3, 'cat-groceries')], 'EXPENSE', 'PHP');
    expect(sug).not.toBeNull();
    expect(sug!.categoryId).toBe('cat-groceries');
    expect(sug!.matchCount).toBe(3);
  });

  it('matches merchants case/whitespace-insensitively', () => {
    const txs = history(3, 'cat-groceries').map((t) => ({ ...t, merchant: '  s&R ' }));
    const sug = suggestCategoryForMerchant('S&R', txs, 'EXPENSE', 'PHP');
    expect(sug?.categoryId).toBe('cat-groceries');
  });

  it('refuses to suggest below the 3-use threshold', () => {
    expect(suggestCategoryForMerchant('S&R', history(2, 'cat-groceries'), 'EXPENSE', 'PHP')).toBeNull();
  });

  it('refuses when no category is a unique winner (a tie)', () => {
    const txs = [...history(3, 'cat-groceries'), ...history(3, 'cat-food')];
    expect(suggestCategoryForMerchant('S&R', txs, 'EXPENSE', 'PHP')).toBeNull();
  });

  it('picks the winner in a lopsided split', () => {
    const txs = [...history(5, 'cat-groceries'), ...history(2, 'cat-food')];
    const sug = suggestCategoryForMerchant('S&R', txs, 'EXPENSE', 'PHP');
    expect(sug?.categoryId).toBe('cat-groceries');
    expect(sug?.matchCount).toBe(5);
  });

  it('teaches from split expenses per allocated category', () => {
    const txs = Array.from({ length: 3 }, () =>
      tx({
        amount: 20000,
        categoryId: 'cat-groceries',
        splitParts: [
          { categoryId: 'cat-groceries', amount: 14000 },
          { categoryId: 'cat-bills', amount: 6000 },
        ],
      })
    );
    const sug = suggestCategoryForMerchant('S&R', txs, 'EXPENSE', 'PHP');
    expect(sug?.categoryId).toBe('cat-groceries');
    expect(sug?.matchCount).toBe(3);
  });

  it('never learns from goal-funding reservations or pending rows', () => {
    const txs = [
      ...history(2, 'cat-groceries'),
      tx({ tags: ['goal-fund'], categoryId: 'cat-transfer' }),
      tx({ status: 'PENDING' }),
    ];
    // only 2 real uses remain → below threshold
    expect(suggestCategoryForMerchant('S&R', txs, 'EXPENSE', 'PHP')).toBeNull();
  });

  it('never mixes currencies or types', () => {
    const usd = history(3, 'cat-groceries').map((t) => ({ ...t, currency: 'USD' as CurrencyCode }));
    expect(suggestCategoryForMerchant('S&R', usd, 'EXPENSE', 'PHP')).toBeNull();
    const income = history(3, 'cat-salary').map((t) => ({ ...t, type: 'INCOME' as const }));
    expect(suggestCategoryForMerchant('S&R', income, 'EXPENSE', 'PHP')).toBeNull();
  });

  it('works for INCOME rows (salary from a named payee)', () => {
    const txs = history(3, 'cat-salary').map((t) => ({ ...t, type: 'INCOME' as const, merchant: 'Acme Corp' }));
    const sug = suggestCategoryForMerchant('Acme Corp', txs, 'INCOME', 'PHP');
    expect(sug?.categoryId).toBe('cat-salary');
  });
});

describe('findPossibleDuplicate', () => {
  it('flags same merchant + amount + day', () => {
    const existing = tx({ merchant: 'Jollibee', amount: 25000, date: '2026-09-09' });
    const found = findPossibleDuplicate(
      { merchant: 'jollibee', amount: 25000, date: '2026-09-09' },
      [existing]
    );
    expect(found?.id).toBe(existing.id);
  });

  it('does not flag different days, amounts, or merchants', () => {
    const base = tx({ merchant: 'Jollibee', amount: 25000, date: '2026-09-09' });
    expect(findPossibleDuplicate({ merchant: 'Jollibee', amount: 25000, date: '2026-09-08' }, [base])).toBeNull();
    expect(findPossibleDuplicate({ merchant: 'Jollibee', amount: 24999, date: '2026-09-09' }, [base])).toBeNull();
    expect(findPossibleDuplicate({ merchant: 'McDo', amount: 25000, date: '2026-09-09' }, [base])).toBeNull();
  });

  it('needs a non-trivial merchant and a positive amount', () => {
    const base = tx({ merchant: 'ab', amount: 25000, date: '2026-09-09' });
    expect(findPossibleDuplicate({ merchant: 'ab', amount: 25000, date: '2026-09-09' }, [base])).toBeNull();
    expect(findPossibleDuplicate({ merchant: 'Jollibee', amount: 0, date: '2026-09-09' }, [base])).toBeNull();
  });

  it('ignores the transaction being edited', () => {
    const base = tx({ id: 'tx-edit', merchant: 'Jollibee', amount: 25000, date: '2026-09-09' });
    expect(
      findPossibleDuplicate({ merchant: 'Jollibee', amount: 25000, date: '2026-09-09', excludeId: 'tx-edit' }, [base])
    ).toBeNull();
  });

  it('ignores pending rows', () => {
    const base = tx({ merchant: 'Jollibee', amount: 25000, date: '2026-09-09', status: 'PENDING' });
    expect(findPossibleDuplicate({ merchant: 'Jollibee', amount: 25000, date: '2026-09-09' }, [base])).toBeNull();
  });
});
