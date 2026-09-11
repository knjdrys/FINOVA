/**
 * Transaction capabilities — split / edit / delete / filter invariants.
 * Guards the FINOVA financial invariants for this wave:
 *   - split allocations must equal the parent amount (never lost, never doubled)
 *   - budgets & filters attribute split money per-category via the single source of truth
 *   - editing a transaction reverses the old effect and applies the new one atomically
 *   - deleting reverses the full effect (including transfers)
 *   - filters honor type / category(split-aware) / account(both sides) / amount / date / sort
 * All dates are fixed for determinism.
 */
import { describe, it, expect } from 'vitest';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { Account, Budget, CurrencyCode, SplitPart, Transaction } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const php = (id: string, balance: number, extra: Partial<Account> = {}): Account => ({
  id,
  userId: 'user-1',
  name: id,
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
  ...extra,
});

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'tx-1',
  userId: 'user-1',
  type: 'EXPENSE',
  amount: 100000,
  currency: 'PHP' as CurrencyCode,
  categoryId: 'cat-food',
  accountId: 'acc-1',
  date: '2026-09-15',
  tags: [],
  status: 'CONFIRMED',
  createdAt: '2026-09-15T10:00:00Z',
  updatedAt: '2026-09-15T10:00:00Z',
  ...over,
});

const budget = (over: Partial<Budget> = {}): Budget => ({
  id: 'bud-1',
  userId: 'user-1',
  name: 'Food',
  amount: 500000,
  currency: 'PHP' as CurrencyCode,
  period: 'MONTHLY',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  categoryIds: ['cat-food'],
  notifyThresholdPercentage: 80,
  isActive: true,
  rolloverUnused: false,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

const split = (categoryId: string, amount: number): SplitPart => ({ categoryId, amount });

// ---------------------------------------------------------------------------
// 1. Split validation — the allocations-must-equal-parent invariant
// ---------------------------------------------------------------------------

describe('TransactionEngine.validateSplitParts', () => {
  it('accepts a balanced split', () => {
    expect(TransactionEngine.validateSplitParts(100000, [split('cat-food', 60000), split('cat-transport', 40000)])).toBeNull();
  });

  it('accepts a non-split (undefined / empty)', () => {
    expect(TransactionEngine.validateSplitParts(100000, undefined)).toBeNull();
    expect(TransactionEngine.validateSplitParts(100000, [])).toBeNull();
  });

  it('rejects a single-part "split"', () => {
    expect(TransactionEngine.validateSplitParts(100000, [split('cat-food', 100000)])).toMatch(/at least two/i);
  });

  it('rejects unassigned remainder', () => {
    expect(TransactionEngine.validateSplitParts(100000, [split('cat-food', 60000), split('cat-bills', 30000)])).toMatch(
      /unassigned/i
    );
  });

  it('rejects parts exceeding the total', () => {
    expect(TransactionEngine.validateSplitParts(100000, [split('cat-food', 70000), split('cat-bills', 50000)])).toMatch(
      /exceed/i
    );
  });

  it('rejects parts without a category or with zero amount', () => {
    expect(TransactionEngine.validateSplitParts(100000, [split('', 50000), split('cat-bills', 50000)])).toMatch(/category/i);
    expect(TransactionEngine.validateSplitParts(100000, [split('cat-food', 0), split('cat-bills', 100000)])).toMatch(/zero/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Category allocations — single source of truth
// ---------------------------------------------------------------------------

describe('TransactionEngine.getCategoryAllocations', () => {
  it('returns per-category amounts for a split, summing to the parent', () => {
    const t = tx({ amount: 100000, splitParts: [split('cat-food', 60000), split('cat-transport', 40000)] });
    const alloc = TransactionEngine.getCategoryAllocations(t);
    expect(alloc.get('cat-food')).toBe(60000);
    expect(alloc.get('cat-transport')).toBe(40000);
    let sum = 0;
    alloc.forEach((v) => (sum += v));
    expect(sum).toBe(t.amount);
  });

  it('merges repeated categories within one split', () => {
    const t = tx({ amount: 90000, splitParts: [split('cat-food', 50000), split('cat-food', 40000)] });
    expect(TransactionEngine.getCategoryAllocations(t).get('cat-food')).toBe(90000);
  });

  it('falls back to the single category for a normal expense', () => {
    const alloc = TransactionEngine.getCategoryAllocations(tx({ amount: 25000, categoryId: 'cat-bills' }));
    expect(alloc.size).toBe(1);
    expect(alloc.get('cat-bills')).toBe(25000);
  });

  it('returns nothing for income and transfers (not category spend)', () => {
    expect(TransactionEngine.getCategoryAllocations(tx({ type: 'INCOME' })).size).toBe(0);
    expect(TransactionEngine.getCategoryAllocations(tx({ type: 'TRANSFER', destinationAccountId: 'acc-2' })).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Budget attribution — split money flows into the right budgets, once
// ---------------------------------------------------------------------------

describe('Budget attribution with splits', () => {
  const splitTx = tx({
    id: 'tx-split',
    amount: 100000,
    categoryId: 'cat-food',
    splitParts: [split('cat-food', 60000), split('cat-transport', 40000)],
  });

  it('charges each category budget only its allocated share', () => {
    const food = budget({ id: 'bud-food', categoryIds: ['cat-food'] });
    const transport = budget({ id: 'bud-transport', name: 'Transport', categoryIds: ['cat-transport'], amount: 200000 });

    const foodForecast = BudgetEngine.calculateBudgetForecast(food, [splitTx], '2026-09-15');
    const transportForecast = BudgetEngine.calculateBudgetForecast(transport, [splitTx], '2026-09-15');

    expect(foodForecast.actualSpent).toBe(60000);
    expect(transportForecast.actualSpent).toBe(40000);
  });

  it('never double-counts a split against a whole-transaction budget', () => {
    const everything = budget({ id: 'bud-all', name: 'All spending', categoryIds: [], amount: 2000000 });
    const f = BudgetEngine.calculateBudgetForecast(everything, [splitTx], '2026-09-15');
    expect(f.actualSpent).toBe(100000); // parent total once, not 60k+40k+100k
  });

  it('ignores budgets whose categories are not part of the split', () => {
    const bills = budget({ id: 'bud-bills', name: 'Bills', categoryIds: ['cat-bills'] });
    const f = BudgetEngine.calculateBudgetForecast(bills, [splitTx], '2026-09-15');
    expect(f.actualSpent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Editing — reverse old effect, apply new effect atomically
// ---------------------------------------------------------------------------

describe('TransactionEngine.updateTransactionInAccounts', () => {
  it('moves the balance delta when only the amount changes', () => {
    const accounts = [php('acc-1', 1000000)];
    const oldT = tx({ amount: 100000 });
    const applied = TransactionEngine.applyTransactionToAccounts(oldT, accounts);
    expect(applied[0].currentBalance).toBe(900000);

    const newT = tx({ amount: 250000 });
    const updated = TransactionEngine.updateTransactionInAccounts(oldT, newT, applied);
    // 900k reversed back to 1M, then -250k.
    expect(updated[0].currentBalance).toBe(750000);
  });

  it('handles an expense edited into a transfer across accounts', () => {
    const accounts = [php('acc-1', 1000000), php('acc-2', 500000)];
    const oldT = tx({ amount: 200000 });
    const applied = TransactionEngine.applyTransactionToAccounts(oldT, accounts);

    const newT = tx({ amount: 200000, type: 'TRANSFER', destinationAccountId: 'acc-2' });
    const updated = TransactionEngine.updateTransactionInAccounts(oldT, newT, applied);

    expect(updated.find((a) => a.id === 'acc-1')!.currentBalance).toBe(800000);
    expect(updated.find((a) => a.id === 'acc-2')!.currentBalance).toBe(700000);
    // Conservation: total money unchanged by a transfer edit.
    expect(updated.reduce((s, a) => s + a.currentBalance, 0)).toBe(1500000);
  });

  it('handles a transfer edited to a different destination', () => {
    const accounts = [php('acc-1', 1000000), php('acc-2', 0), php('acc-3', 0)];
    const oldT = tx({ type: 'TRANSFER', amount: 300000, destinationAccountId: 'acc-2' });
    const applied = TransactionEngine.applyTransactionToAccounts(oldT, accounts);
    expect(applied.find((a) => a.id === 'acc-2')!.currentBalance).toBe(300000);

    const newT = tx({ type: 'TRANSFER', amount: 300000, destinationAccountId: 'acc-3' });
    const updated = TransactionEngine.updateTransactionInAccounts(oldT, newT, applied);
    expect(updated.find((a) => a.id === 'acc-2')!.currentBalance).toBe(0);
    expect(updated.find((a) => a.id === 'acc-3')!.currentBalance).toBe(300000);
    expect(updated.find((a) => a.id === 'acc-1')!.currentBalance).toBe(700000);
  });
});

// ---------------------------------------------------------------------------
// 5. Deletion — full reversal, including split + transfer effects
// ---------------------------------------------------------------------------

describe('TransactionEngine.reverseTransactionFromAccounts', () => {
  it('restores the exact prior balance for a split expense', () => {
    const accounts = [php('acc-1', 1000000)];
    const t = tx({ amount: 100000, splitParts: [split('cat-food', 60000), split('cat-bills', 40000)] });
    const applied = TransactionEngine.applyTransactionToAccounts(t, accounts);
    const reverted = TransactionEngine.reverseTransactionFromAccounts(t, applied);
    expect(reverted[0].currentBalance).toBe(1000000);
  });

  it('restores both sides of a transfer', () => {
    const accounts = [php('acc-1', 1000000), php('acc-2', 100000)];
    const t = tx({ type: 'TRANSFER', amount: 400000, destinationAccountId: 'acc-2' });
    const applied = TransactionEngine.applyTransactionToAccounts(t, accounts);
    const reverted = TransactionEngine.reverseTransactionFromAccounts(t, applied);
    expect(reverted.find((a) => a.id === 'acc-1')!.currentBalance).toBe(1000000);
    expect(reverted.find((a) => a.id === 'acc-2')!.currentBalance).toBe(100000);
  });
});

// ---------------------------------------------------------------------------
// 6. Search & filtering — every control the Transactions screen exposes
// ---------------------------------------------------------------------------

describe('TransactionEngine.filterTransactions', () => {
  const food = tx({ id: 'tx-a', amount: 50000, categoryId: 'cat-food', date: '2026-09-02', merchant: 'Jollibee' });
  const splitT = tx({
    id: 'tx-b',
    amount: 120000,
    categoryId: 'cat-food',
    date: '2026-09-10',
    merchant: 'SM Mall run',
    splitParts: [split('cat-food', 70000), split('cat-clothes', 50000)],
  });
  const salary = tx({ id: 'tx-c', type: 'INCOME', amount: 4000000, categoryId: 'cat-salary', date: '2026-09-01', merchant: 'Acme Payroll' });
  const move = tx({ id: 'tx-d', type: 'TRANSFER', amount: 300000, categoryId: 'cat-general', accountId: 'acc-1', destinationAccountId: 'acc-2', date: '2026-08-28' });
  const all = [food, splitT, salary, move];

  it('type filter isolates each kind (default sort: newest first)', () => {
    expect(TransactionEngine.filterTransactions(all, { type: 'EXPENSE' }).map((t) => t.id)).toEqual(['tx-b', 'tx-a']);
    expect(TransactionEngine.filterTransactions(all, { type: 'INCOME' }).map((t) => t.id)).toEqual(['tx-c']);
    expect(TransactionEngine.filterTransactions(all, { type: 'TRANSFER' }).map((t) => t.id)).toEqual(['tx-d']);
    expect(TransactionEngine.filterTransactions(all, { type: 'ALL' })).toHaveLength(4);
  });

  it('category filter matches a split through any of its parts', () => {
    expect(TransactionEngine.filterTransactions(all, { categoryId: 'cat-clothes' }).map((t) => t.id)).toEqual(['tx-b']);
    expect(TransactionEngine.filterTransactions(all, { categoryId: 'cat-food' }).map((t) => t.id)).toEqual(['tx-b', 'tx-a']);
  });

  it('account filter matches either side of a transfer', () => {
    expect(TransactionEngine.filterTransactions(all, { accountId: 'acc-2' }).map((t) => t.id)).toEqual(['tx-d']);
    expect(TransactionEngine.filterTransactions(all, { accountId: 'acc-1' }).map((t) => t.id)).toEqual(['tx-b', 'tx-a', 'tx-c', 'tx-d']);
  });

  it('date range is inclusive on both bounds', () => {
    expect(TransactionEngine.filterTransactions(all, { startDate: '2026-09-02', endDate: '2026-09-10' }).map((t) => t.id)).toEqual([
      'tx-b',
      'tx-a',
    ]);
  });

  it('amount range filters in minor units', () => {
    expect(TransactionEngine.filterTransactions(all, { minAmount: 100000, maxAmount: 500000 }).map((t) => t.id)).toEqual([
      'tx-b',
      'tx-d',
    ]);
  });

  it('text search covers merchant and note', () => {
    expect(TransactionEngine.filterTransactions(all, { searchQuery: 'jollibee' }).map((t) => t.id)).toEqual(['tx-a']);
    expect(TransactionEngine.filterTransactions(all, { searchQuery: 'payroll' }).map((t) => t.id)).toEqual(['tx-c']);
  });

  it('text search covers subtitle, tags, and category/account names', () => {
    const sub = tx({ id: 'tx-s', subtitle: 'Birthday gift', merchant: undefined, note: undefined, tags: [] });
    expect(TransactionEngine.filterTransactions([sub], { searchQuery: 'birthday' }).map((t) => t.id)).toEqual(['tx-s']);
    const names = {
      categoryNames: new Map([['cat-food', 'Food'], ['cat-salary', 'Salary']]),
      accountNames: new Map([['acc-1', 'BPI Savings']]),
    };
    expect(TransactionEngine.filterTransactions(all, { searchQuery: 'salary', ...names }).map((t) => t.id)).toEqual(['tx-c']);
    expect(TransactionEngine.filterTransactions(all, { searchQuery: 'bpi', ...names })).toHaveLength(4);
  });

  it('numeric search matches amounts exactly (no substring traps)', () => {
    // tx-a = 500.00; tx-b = 1200.00; tx-c = 40000.00; tx-d = 3000.00
    expect(TransactionEngine.filterTransactions(all, { searchQuery: '500' }).map((t) => t.id)).toEqual(['tx-a']);
    expect(TransactionEngine.filterTransactions(all, { searchQuery: '500.00' }).map((t) => t.id)).toEqual(['tx-a']);
    expect(TransactionEngine.filterTransactions(all, { searchQuery: '50' })).toHaveLength(0);
    expect(TransactionEngine.filterTransactions(all, { searchQuery: '00' })).toHaveLength(0);
  });

  it('sorts by amount and date', () => {
    expect(TransactionEngine.filterTransactions(all, { sortBy: 'HIGHEST_AMOUNT' }).map((t) => t.id)).toEqual([
      'tx-c',
      'tx-d',
      'tx-b',
      'tx-a',
    ]);
    expect(TransactionEngine.filterTransactions(all, { sortBy: 'OLDEST' }).map((t) => t.id)).toEqual(['tx-d', 'tx-c', 'tx-a', 'tx-b']);
  });

  it('combines filters (expenses, this month, under ₱1,000)', () => {
    const ids = TransactionEngine.filterTransactions(all, {
      type: 'EXPENSE',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      maxAmount: 99999,
    }).map((t) => t.id);
    expect(ids).toEqual(['tx-a']);
  });
});

// ---------------------------------------------------------------------------
// 7. Transfer pre-flight validation (improved transfer UX guardrails)
// ---------------------------------------------------------------------------

describe('TransactionEngine.validateTransaction for transfers', () => {
  it('rejects same-account transfers', () => {
    const accounts = [php('acc-1', 1000000)];
    const err = TransactionEngine.validateTransaction(
      { type: 'TRANSFER', amount: 100000, currency: 'PHP', accountId: 'acc-1', destinationAccountId: 'acc-1' },
      accounts
    );
    expect(err).toMatch(/differ/i);
  });

  it('rejects cross-currency transfers (no silent FX)', () => {
    const accounts = [php('acc-1', 1000000), php('acc-2', 100, { currency: 'USD' })];
    const err = TransactionEngine.validateTransaction(
      { type: 'TRANSFER', amount: 100000, currency: 'PHP', accountId: 'acc-1', destinationAccountId: 'acc-2' },
      accounts
    );
    expect(err).toMatch(/currenc/i);
  });

  it('rejects overdrawing the source', () => {
    const accounts = [php('acc-1', 50000), php('acc-2', 0)];
    const err = TransactionEngine.validateTransaction(
      { type: 'TRANSFER', amount: 100000, currency: 'PHP', accountId: 'acc-1', destinationAccountId: 'acc-2' },
      accounts
    );
    expect(err).toMatch(/overdraw/i);
  });

  it('accepts a valid transfer', () => {
    const accounts = [php('acc-1', 500000), php('acc-2', 0)];
    expect(
      TransactionEngine.validateTransaction(
        { type: 'TRANSFER', amount: 100000, currency: 'PHP', accountId: 'acc-1', destinationAccountId: 'acc-2' },
        accounts
      )
    ).toBeNull();
  });
});
