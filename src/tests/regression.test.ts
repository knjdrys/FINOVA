import { describe, it, expect } from 'vitest';
import { DateUtils } from '../domain/date/DateUtils';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { FutureFinanceEngine } from '../domain/future-finance/FutureFinanceEngine';
import { SafeToSpendEngine } from '../domain/safe-to-spend/SafeToSpendEngine';
import { GoalEngine } from '../domain/goal/GoalEngine';
import { AccountEngine } from '../domain/account/AccountEngine';
import {
  Account,
  MoneyCommitment,
  RecurringTransaction,
  SavingsGoal,
  Transaction,
  UserSettings,
} from '../types';

// ---------------------------------------------------------------------------
// Release-Readiness Regression Suite (2026-09-05)
// Locks in the four bugs found during the regression pass plus the invariants
// the audit depends on: month boundaries, currency isolation, archived/deleted
// items, duplicate/idempotent posting, transfer & split conservation,
// goal funding, and safe-to-spend deductions.
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
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  ...extra,
});

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'tx-1',
  userId: 'user-1',
  type: 'EXPENSE',
  amount: 100000,
  currency: 'PHP',
  categoryId: 'cat-food',
  accountId: 'acc-1',
  date: '2026-06-15',
  tags: [],
  status: 'CONFIRMED',
  createdAt: '2026-06-15T10:00:00Z',
  updatedAt: '2026-06-15T10:00:00Z',
  ...over,
});

const commitment = (over: Partial<MoneyCommitment>): MoneyCommitment => ({
  id: 'c-1',
  userId: 'user-1',
  title: 'Electric bill',
  type: 'BILL',
  amount: 200000,
  currency: 'PHP',
  direction: 'OUTFLOW',
  status: 'SCHEDULED',
  dueDate: '2026-06-01',
  accountId: 'acc-1',
  categoryId: 'cat-bills',
  priority: 'ESSENTIAL',
  autoPostEnabled: true,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  ...over,
});

const recurring = (over: Partial<RecurringTransaction>): RecurringTransaction => ({
  id: 'rec-1',
  userId: 'user-1',
  title: 'Rent',
  amount: 1500000,
  currency: 'PHP',
  type: 'EXPENSE',
  categoryId: 'cat-housing',
  accountId: 'acc-1',
  frequency: 'MONTHLY',
  startDate: '2026-01-31',
  nextOccurrence: '2026-01-31',
  isActive: true,
  reminderEnabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const goal = (over: Partial<SavingsGoal>): SavingsGoal => ({
  id: 'goal-1',
  userId: 'user-1',
  name: 'Emergency fund',
  targetAmount: 10000000,
  currentAmount: 1000000,
  currency: 'PHP',
  targetDate: '2026-12-31',
  priority: 'IMPORTANT',
  status: 'ON_TRACK',
  icon: 'PiggyBank',
  color: '#000',
  isArchived: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const settings = (over: Partial<UserSettings> = {}): UserSettings => ({
  userId: 'user-1',
  userName: 'Test',
  currency: 'PHP',
  defaultTrackingPeriod: 'TODAY',
  budgetCycleMode: 'MONTHLY',
  semiMonthlyCutoffDay: 15,
  minimumReserve: 0,
  safeToSpendPeriod: 'END_OF_MONTH',
  darkTheme: false,
  notificationsEnabled: true,
  budgetWarningThreshold: 80,
  autoGenerateCommitmentsFromRecurring: true,
  ...over,
});

// -------------------------------------------------------------------------
// 1. Month boundaries (regression bug #1: addMonthsISO overflow;
//    regression bug #4: chained recurrence drift on month-end rules)
// -------------------------------------------------------------------------
describe('Regression: month boundaries', () => {
  it('addMonthsISO clamps to last day instead of overflowing', () => {
    expect(DateUtils.addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(DateUtils.addMonthsISO('2028-01-31', 1)).toBe('2028-02-29'); // leap
    expect(DateUtils.addMonthsISO('2026-01-31', 2)).toBe('2026-03-31');
    expect(DateUtils.addMonthsISO('2026-03-31', 1)).toBe('2026-04-30');
    expect(DateUtils.addMonthsISO('2026-01-30', 1)).toBe('2026-02-28');
    expect(DateUtils.addMonthsISO('2026-06-15', 7)).toBe('2027-01-15');
  });

  it('monthly rule anchored on the 31st does not drift across February', () => {
    const rec = recurring({});
    const resolved = FutureFinanceEngine.resolveCommitments(
      [rec], [], [], '2026-01-01', '2026-06-30', '2026-01-01'
    );
    const dates = resolved.map((c) => c.dueDate);
    expect(dates).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30',
    ]);
  });

  it('anchored occurrences return to the 31st after a clamped February (leap year)', () => {
    const rec = recurring({ startDate: '2028-01-31', nextOccurrence: '2028-01-31' });
    const resolved = FutureFinanceEngine.resolveCommitments(
      [rec], [], [], '2028-01-01', '2028-04-30', '2028-01-01'
    );
    expect(resolved.map((c) => c.dueDate)).toEqual([
      '2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30',
    ]);
  });

  it('already-posted occurrences are never regenerated (nextOccurrence floor)', () => {
    // Jan-Mar posted; App advanced nextOccurrence to Apr 30.
    const rec = recurring({ nextOccurrence: '2026-04-30' });
    const resolved = FutureFinanceEngine.resolveCommitments(
      [rec], [], [], '2026-01-01', '2026-06-30', '2026-01-01'
    );
    expect(resolved.map((c) => c.dueDate)).toEqual(['2026-04-30', '2026-05-31', '2026-06-30']);
  });

  it('advanceOccurrence keeps monthly rules clamped', () => {
    expect(FutureFinanceEngine.advanceOccurrence('2026-01-31', 'MONTHLY')).toBe('2026-02-28');
    expect(FutureFinanceEngine.advanceOccurrence('2026-02-28', 'MONTHLY')).toBe('2026-03-28');
    // Chained advance is only used for the single next step after a post;
    // generation itself is anchored, so drift cannot accumulate across a horizon.
  });
});

// -------------------------------------------------------------------------
// 2. Currency isolation (Invariant: currencies never silently combined)
// -------------------------------------------------------------------------
describe('Regression: currency isolation', () => {
  it('cross-currency transfer is rejected by validation', () => {
    const accs = [php('acc-1', 5000000), php('acc-2', 1000000, { currency: 'USD' })];
    const err = TransactionEngine.validateTransaction(
      { type: 'TRANSFER', amount: 100000, currency: 'PHP', accountId: 'acc-1', destinationAccountId: 'acc-2' },
      accs
    );
    expect(err).not.toBeNull();
  });

  it('total balance never sums across currencies', () => {
    const accs = [php('acc-1', 1000000), php('acc-2', 5000000, { currency: 'USD' })];
    const byCur = AccountEngine.getTotalBalanceByCurrency(accs);
    expect(byCur).toEqual({ PHP: 1000000, USD: 5000000 });
    expect(AccountEngine.calculateTotalBalance(accs, 'PHP').getMinorUnits()).toBe(1000000);
  });

  it('auto-post skips a commitment whose currency mismatches its account', () => {
    const accs = [php('acc-1', 5000000)];
    const c = commitment({ currency: 'USD' });
    const res = FutureFinanceEngine.autoPostDueCommitments([c], accs, [], '2026-06-02');
    expect(res.postedCount).toBe(0);
    expect(res.transactions).toHaveLength(0);
  });

  it('safe-to-spend counts only the active currency', () => {
    const accs = [
      php('acc-1', 1000000),
      php('acc-2', 9000000, { currency: 'USD' }),
    ];
    const res = SafeToSpendEngine.calculateSafeToSpend(
      accs, [], [], settings(), '2026-06-15'
    );
    expect(res.totalAvailableBalance).toBe(1000000);
  });
});

// -------------------------------------------------------------------------
// 3. Archived / deleted items
// -------------------------------------------------------------------------
describe('Regression: archived & deleted', () => {
  it('archived accounts are excluded from totals and safe-to-spend', () => {
    const accs = [php('acc-1', 1000000), php('acc-old', 99000000, { isArchived: true })];
    expect(AccountEngine.calculateTotalBalance(accs, 'PHP').getMinorUnits()).toBe(1000000);
    const res = SafeToSpendEngine.calculateSafeToSpend(accs, [], [], settings(), '2026-06-15');
    expect(res.totalAvailableBalance).toBe(1000000);
  });

  it('deleting a transaction fully reverses its effect (no residue)', () => {
    const accs = [php('acc-1', 1000000)];
    const t = tx({ amount: 250000 });
    const applied = TransactionEngine.applyTransactionToAccounts(t, accs);
    expect(applied[0].currentBalance).toBe(750000);
    const reversed = TransactionEngine.reverseTransactionFromAccounts(t, applied);
    expect(reversed[0].currentBalance).toBe(1000000);
  });

  it('editing a transaction does not double-charge (atomic reverse+apply)', () => {
    const base = [php('acc-1', 1000000)];
    const oldTx = tx({ id: 'tx-a', amount: 250000 });
    const newTx = tx({ id: 'tx-a', amount: 400000 });
    // Current state: old tx already applied.
    const current = TransactionEngine.applyTransactionToAccounts(oldTx, base);
    expect(current[0].currentBalance).toBe(750000);
    // Edit: net effect must equal a single 400k expense from base.
    const after = TransactionEngine.updateTransactionInAccounts(oldTx, newTx, current);
    expect(after[0].currentBalance).toBe(600000);
  });

  it('terminal commitments (COMPLETED/CANCELLED/AUTO_POSTED) never re-post', () => {
    const accs = [php('acc-1', 5000000)];
    for (const status of ['COMPLETED', 'CANCELLED', 'AUTO_POSTED'] as const) {
      const c = commitment({ id: `c-${status}`, status });
      const res = FutureFinanceEngine.autoPostDueCommitments([c], accs, [], '2026-06-02');
      expect(res.postedCount).toBe(0);
    }
  });
});

// -------------------------------------------------------------------------
// 4. Duplicates / idempotency
// -------------------------------------------------------------------------
describe('Regression: duplicate protection', () => {
  it('auto-post is idempotent: running twice posts exactly one transaction', () => {
    const accs = [php('acc-1', 5000000)];
    const c = commitment({ id: 'c-dup' });
    const first = FutureFinanceEngine.autoPostDueCommitments([c], accs, [], '2026-06-02');
    expect(first.postedCount).toBe(1);
    expect(first.transactions).toHaveLength(1);
    expect(first.commitments.find((x) => x.id === 'c-dup')!.status).toBe('AUTO_POSTED');

    // Second run on the RESULT (same commitments + posted tx) posts nothing.
    const second = FutureFinanceEngine.autoPostDueCommitments(
      first.commitments, first.accounts, first.transactions, '2026-06-03'
    );
    expect(second.postedCount).toBe(0);
    expect(second.transactions).toHaveLength(1);

    // Even with a re-resolved (fresh-status) commitment, the posted tx id
    // guard prevents a duplicate.
    const reResolved = first.commitments.map((x) => ({ ...x, status: 'OVERDUE' as const }));
    const third = FutureFinanceEngine.autoPostDueCommitments(
      reResolved, first.accounts, first.transactions, '2026-06-04'
    );
    expect(third.postedCount).toBe(0);
  });

  it('resolveCommitments is idempotent and manual wins on id collision', () => {
    const rec = recurring({ id: 'rec-x', startDate: '2026-06-01', nextOccurrence: '2026-06-01' });
    const once = FutureFinanceEngine.resolveCommitments([rec], [], [], '2026-06-01', '2026-06-30', '2026-06-01');
    const twice = FutureFinanceEngine.resolveCommitments([rec], [], [], '2026-06-01', '2026-06-30', '2026-06-01');
    expect(once.map((c) => c.id)).toEqual(twice.map((c) => c.id));
    expect(new Set(once.map((c) => c.id)).size).toBe(once.length);

    const manual = commitment({ id: once[0].id, amount: 999 });
    const merged = FutureFinanceEngine.resolveCommitments([rec], [manual], [], '2026-06-01', '2026-06-30', '2026-06-01');
    expect(merged.find((c) => c.id === once[0].id)!.amount).toBe(999);
  });
});

// -------------------------------------------------------------------------
// 5. Auto-post direction rules (regression bug #2: income blocked)
// -------------------------------------------------------------------------
describe('Regression: auto-post direction rules', () => {
  it('income auto-posts even when the account balance is low', () => {
    const accs = [php('acc-1', 50000)]; // ₱500
    const salary = commitment({
      id: 'c-pay', direction: 'INFLOW', type: 'RECURRING_INCOME',
      amount: 5000000, dueDate: '2026-06-01',
    });
    const res = FutureFinanceEngine.autoPostDueCommitments([salary], accs, [], '2026-06-01');
    expect(res.postedCount).toBe(1);
    expect(res.accounts[0].currentBalance).toBe(5050000);
    expect(res.transactions[0].type).toBe('INCOME');
  });

  it('outflow auto-post is blocked when it would overdraft', () => {
    const accs = [php('acc-1', 100000)]; // ₱1,000
    const bill = commitment({ id: 'c-rent', amount: 5000000, dueDate: '2026-06-01' });
    const res = FutureFinanceEngine.autoPostDueCommitments([bill], accs, [], '2026-06-01');
    expect(res.postedCount).toBe(0);
    expect(res.accounts[0].currentBalance).toBe(100000);
  });

  it('not-yet-due commitments are left alone', () => {
    const accs = [php('acc-1', 5000000)];
    const c = commitment({ id: 'c-later', dueDate: '2026-06-15' });
    const res = FutureFinanceEngine.autoPostDueCommitments([c], accs, [], '2026-06-01');
    expect(res.postedCount).toBe(0);
  });
});

// -------------------------------------------------------------------------
// 6. Transfer & split conservation
// -------------------------------------------------------------------------
describe('Regression: transfer & split invariants', () => {
  it('transfer conserves the combined balance of both accounts', () => {
    const accs = [php('acc-1', 5000000), php('acc-2', 1000000)];
    const t = tx({ type: 'TRANSFER', amount: 2000000, destinationAccountId: 'acc-2' });
    const after = TransactionEngine.applyTransactionToAccounts(t, accs);
    expect(after[0].currentBalance).toBe(3000000);
    expect(after[1].currentBalance).toBe(3000000);
    expect(after.reduce((s, a) => s + a.currentBalance, 0)).toBe(6000000);
  });

  it('split allocations must sum exactly to the parent amount', () => {
    expect(TransactionEngine.validateSplitParts(100000, [
      { categoryId: 'cat-food', amount: 60000 },
      { categoryId: 'cat-transport', amount: 40000 },
    ])).toBeNull();
    expect(TransactionEngine.validateSplitParts(100000, [
      { categoryId: 'cat-food', amount: 60000 },
      { categoryId: 'cat-transport', amount: 39999 },
    ])).not.toBeNull();
  });

  it('category allocations reconstruct the parent total', () => {
    const t = tx({
      amount: 100000,
      splitParts: [
        { categoryId: 'cat-food', amount: 70000 },
        { categoryId: 'cat-bills', amount: 30000 },
      ],
    });
    const alloc = TransactionEngine.getCategoryAllocations(t);
    let sum = 0;
    alloc.forEach((v) => { sum += v; });
    expect(sum).toBe(100000);
  });
});

// -------------------------------------------------------------------------
// 7. Goal funding
// -------------------------------------------------------------------------
describe('Regression: goal funding', () => {
  it('contribution caps at target and completes the goal', () => {
    const g = goal({ targetAmount: 1000000, currentAmount: 900000 });
    const funded = GoalEngine.contribute(g, 500000);
    expect(funded.currentAmount).toBe(1000000);
    expect(funded.status).toBe('COMPLETED');
  });

  it('zero or negative contributions are no-ops', () => {
    const g = goal({});
    expect(GoalEngine.contribute(g, 0).currentAmount).toBe(g.currentAmount);
    expect(GoalEngine.contribute(g, -500).currentAmount).toBe(g.currentAmount);
  });

  it('funding conserves money: account loss equals goal gain', () => {
    const accs = [php('acc-1', 3000000)];
    const g = goal({ currentAmount: 0, targetAmount: 10000000 });
    const amount = 800000;
    const fundTx = tx({ type: 'EXPENSE', amount, categoryId: 'cat-transfer', accountId: 'acc-1' });
    const afterAcc = TransactionEngine.applyTransactionToAccounts(fundTx, accs);
    const afterGoal = GoalEngine.contribute(g, amount);
    expect(afterAcc[0].currentBalance).toBe(2200000);
    expect(afterGoal.currentAmount).toBe(800000);
    // Nothing created or destroyed: account + goal pool is conserved.
    expect(afterAcc[0].currentBalance + afterGoal.currentAmount).toBe(
      accs[0].currentBalance + g.currentAmount
    );
  });
});

// -------------------------------------------------------------------------
// 8. Safe-to-spend deductions
// -------------------------------------------------------------------------
describe('Regression: safe-to-spend', () => {
  it('deducts only same-currency essential commitments and the reserve', () => {
    const accs = [php('acc-1', 1000000)];
    const commitments = [
      commitment({ id: 'c-php', amount: 200000, dueDate: '2026-06-20', priority: 'ESSENTIAL' }),
      commitment({ id: 'c-usd', amount: 999999, dueDate: '2026-06-20', priority: 'ESSENTIAL', currency: 'USD' }),
      commitment({ id: 'c-opt', amount: 50000, dueDate: '2026-06-20', priority: 'OPTIONAL' }),
      commitment({ id: 'c-done', amount: 77000, dueDate: '2026-06-20', priority: 'ESSENTIAL', status: 'COMPLETED' }),
      commitment({ id: 'c-next', amount: 88000, dueDate: '2026-07-10', priority: 'ESSENTIAL' }),
    ];
    const res = SafeToSpendEngine.calculateSafeToSpend(accs, commitments, [], settings({ minimumReserve: 100000 }), '2026-06-15');
    expect(res.totalAvailableBalance).toBe(1000000);
    expect(res.essentialUpcomingCommitments).toBe(200000);
    expect(res.minimumReserve).toBe(100000);
    expect(res.discretionaryPool).toBe(700000);
    expect(res.dailySafeToSpend).toBe(Math.round(700000 / res.remainingDaysInPeriod));
    expect(res.isDeficit).toBe(false);
  });

  it('deficit months report zero daily spend instead of a negative number', () => {
    const accs = [php('acc-1', 100000)];
    const commitments = [commitment({ id: 'c-big', amount: 900000, dueDate: '2026-06-20' })];
    const res = SafeToSpendEngine.calculateSafeToSpend(accs, commitments, [], settings({ minimumReserve: 100000 }), '2026-06-15');
    expect(res.isDeficit).toBe(true);
    expect(res.dailySafeToSpend).toBe(0);
    expect(res.weeklySafeToSpend).toBe(0);
  });
});
