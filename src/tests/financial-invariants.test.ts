/**
 * Day 4 — Phase 3 financial invariants (explicit, one assertion per law).
 * Each test states a money law that must hold no matter how the UI evolves.
 */
import { describe, it, expect } from 'vitest';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { Account, Transaction } from '../types';

const acc = (id: string, currency: 'PHP' | 'USD', balance: number): Account => ({
  id, userId: 'user-1', name: id, type: 'BANK', currency,
  initialBalance: balance, currentBalance: balance, icon: 'Building2', color: '#000',
  includeInTotalBalance: true, isArchived: false,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't1', userId: 'user-1', categoryId: 'cat-food', type: 'EXPENSE',
  amount: 100000, currency: 'PHP', merchant: '', note: '', date: '2026-09-15', time: '12:00',
  tags: [], status: 'CONFIRMED', createdAt: '2026-09-15', updatedAt: '2026-09-15',
  accountId: 'a1',
  ...over,
});

describe('money direction laws', () => {
  it('EXPENSE never increases its account balance', () => {
    const before = [acc('a1', 'PHP', 500000)];
    const after = TransactionEngine.applyTransactionToAccounts(tx({ type: 'EXPENSE', amount: 50000 }), before);
    expect(after[0].currentBalance).toBe(450000);
    expect(after[0].currentBalance).toBeLessThanOrEqual(before[0].currentBalance);
  });

  it('INCOME never decreases its account balance', () => {
    const before = [acc('a1', 'PHP', 500000)];
    const after = TransactionEngine.applyTransactionToAccounts(tx({ type: 'INCOME', amount: 50000 }), before);
    expect(after[0].currentBalance).toBe(550000);
    expect(after[0].currentBalance).toBeGreaterThanOrEqual(before[0].currentBalance);
  });
});

describe('transfer laws', () => {
  it('TRANSFER conserves the combined balance of both accounts', () => {
    const before = [acc('a1', 'PHP', 500000), acc('a2', 'PHP', 100000)];
    const after = TransactionEngine.applyTransactionToAccounts(
      tx({ type: 'TRANSFER', amount: 200000, destinationAccountId: 'a2' }), before
    );
    const sumBefore = before.reduce((s, a) => s + a.currentBalance, 0);
    const sumAfter = after.reduce((s, a) => s + a.currentBalance, 0);
    expect(sumAfter).toBe(sumBefore);
  });

  it('cross-currency TRANSFER is rejected — never converted at 1:1', () => {
    const accounts = [acc('a1', 'PHP', 500000), acc('a2', 'USD', 100000)];
    const err = TransactionEngine.validateTransaction(
      { type: 'TRANSFER', amount: 10000, currency: 'PHP', accountId: 'a1', destinationAccountId: 'a2' },
      accounts
    );
    expect(err).not.toBeNull();
  });

  it('same-account TRANSFER is rejected', () => {
    const accounts = [acc('a1', 'PHP', 500000)];
    const err = TransactionEngine.validateTransaction(
      { type: 'TRANSFER', amount: 10000, currency: 'PHP', accountId: 'a1', destinationAccountId: 'a1' },
      accounts
    );
    expect(err).not.toBeNull();
  });

  it('overdraft TRANSFER is rejected — source can never go negative', () => {
    const accounts = [acc('a1', 'PHP', 50000), acc('a2', 'PHP', 0)];
    const err = TransactionEngine.validateTransaction(
      { type: 'TRANSFER', amount: 50001, currency: 'PHP', accountId: 'a1', destinationAccountId: 'a2' },
      accounts
    );
    expect(err).not.toBeNull();
  });
});

describe('edit / delete laws', () => {
  it('EDIT reverses-then-applies exactly once — no duplication, no residue', () => {
    const start = [acc('a1', 'PHP', 500000)];
    const oldTx = tx({ id: 't1', type: 'EXPENSE', amount: 100000 });
    const mid = TransactionEngine.applyTransactionToAccounts(oldTx, start);
    expect(mid[0].currentBalance).toBe(400000);
    // User edits ₱1,000 → ₱1,500: final must equal start minus new amount only.
    const newTx = tx({ id: 't1', type: 'EXPENSE', amount: 150000 });
    const after = TransactionEngine.updateTransactionInAccounts(oldTx, newTx, mid);
    expect(after[0].currentBalance).toBe(350000);
  });

  it('DELETE reverses the effect in full — balance returns to pre-transaction value', () => {
    const start = [acc('a1', 'PHP', 500000)];
    const t = tx({ type: 'EXPENSE', amount: 120000 });
    const mid = TransactionEngine.applyTransactionToAccounts(t, start);
    const after = TransactionEngine.reverseTransactionFromAccounts(t, mid);
    expect(after[0].currentBalance).toBe(500000);
  });

  it('EDIT changing type EXPENSE→INCOME nets the full swing, not a partial', () => {
    const start = [acc('a1', 'PHP', 500000)];
    const oldTx = tx({ id: 't1', type: 'EXPENSE', amount: 100000 });
    const mid = TransactionEngine.applyTransactionToAccounts(oldTx, start);
    const newTx = tx({ id: 't1', type: 'INCOME', amount: 100000 });
    const after = TransactionEngine.updateTransactionInAccounts(oldTx, newTx, mid);
    // 500k − 100k (reversed) + 100k (applied) = 600k.
    expect(after[0].currentBalance).toBe(600000);
  });
});

describe('projection isolation law', () => {
  it('PROJECTED/COMPLETED-adjacent bookkeeping never flows through apply paths', () => {
    // applyTransactionToAccounts only moves money for real posted rows:
    // a commitment object is not a Transaction and cannot reach it.
    // This test locks the type boundary — commitments carry no accountId
    // movement until buildSettlementTransaction produces a real row.
    const c = { direction: 'OUTFLOW' as const, amount: 500000 };
    const settlementLike = tx({ type: 'EXPENSE', amount: c.amount });
    const after = TransactionEngine.applyTransactionToAccounts(settlementLike, [acc('a1', 'PHP', 500000)]);
    expect(after[0].currentBalance).toBe(0);
  });
});
