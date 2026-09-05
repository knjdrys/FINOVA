import { describe, it, expect } from 'vitest';
import { AccountEngine } from '../domain/account/AccountEngine';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { SafeToSpendEngine } from '../domain/safe-to-spend/SafeToSpendEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { TimelineEngine } from '../domain/timeline/TimelineEngine';
import { RiskEngine } from '../domain/risk/RiskEngine';
import {
  Account,
  Budget,
  MoneyCommitment,
  Transaction,
  UserSettings,
} from '../types';

// ---------------------------------------------------------------------------
// Financial Core Invariant Suite
// Guards: balance correctness, transfer conservation, edit/delete reversibility,
// money precision, atomic mutation, multi-currency isolation, budget rollover.
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

const usd = (id: string, balance: number): Account => php(id, balance, { currency: 'USD' });

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'tx-1',
  userId: 'user-1',
  type: 'EXPENSE',
  amount: 100000,
  currency: 'PHP',
  categoryId: 'cat-food',
  accountId: 'acc-1',
  date: '2026-05-15',
  tags: [],
  status: 'CONFIRMED',
  createdAt: '2026-05-15T10:00:00Z',
  updatedAt: '2026-05-15T10:00:00Z',
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

describe('1. Account Balance Correctness', () => {
  it('INV: expense decreases, income increases, transfer conserves total', () => {
    const accs = [php('acc-1', 5000000), php('acc-2', 1000000)];

    const afterExp = TransactionEngine.applyTransactionToAccounts(tx({ type: 'EXPENSE', accountId: 'acc-1', amount: 1000000 }), accs);
    expect(afterExp.find((a) => a.id === 'acc-1')!.currentBalance).toBe(4000000);

    const afterInc = TransactionEngine.applyTransactionToAccounts(tx({ type: 'INCOME', accountId: 'acc-1', amount: 1500000 }), accs);
    expect(afterInc.find((a) => a.id === 'acc-1')!.currentBalance).toBe(6500000);

    const transfer = tx({ type: 'TRANSFER', accountId: 'acc-1', destinationAccountId: 'acc-2', amount: 500000 });
    const before = AccountEngine.calculateTotalBalance(accs).getMinorUnits();
    const after = TransactionEngine.applyTransactionToAccounts(transfer, accs);
    expect(AccountEngine.calculateTotalBalance(after).getMinorUnits()).toBe(before);
    expect(after.find((a) => a.id === 'acc-1')!.currentBalance).toBe(4500000);
    expect(after.find((a) => a.id === 'acc-2')!.currentBalance).toBe(1500000);
  });

  it('INV: archived / excluded accounts are not counted in total', () => {
    const accs = [php('acc-1', 5000000), php('acc-2', 1000000, { includeInTotalBalance: false })];
    expect(AccountEngine.calculateTotalBalance(accs).getMinorUnits()).toBe(5000000);
    const archived = [php('acc-1', 5000000), php('acc-2', 1000000, { isArchived: true })];
    expect(AccountEngine.calculateTotalBalance(archived).getMinorUnits()).toBe(5000000);
  });
});

describe('2. Transaction Edit / Delete Reversibility', () => {
  it('INV: delete reverses exact prior balance (no drift)', () => {
    const accs = [php('acc-1', 5000000)];
    const t = tx({ type: 'EXPENSE', accountId: 'acc-1', amount: 800000 });
    const added = TransactionEngine.applyTransactionToAccounts(t, accs);
    expect(added.find((a) => a.id === 'acc-1')!.currentBalance).toBe(4200000);
    const removed = TransactionEngine.reverseTransactionFromAccounts(t, added);
    expect(removed.find((a) => a.id === 'acc-1')!.currentBalance).toBe(5000000);
  });

  it('INV: update(old->new) is equivalent to reverse(old)+apply(new)', () => {
    const accs = [php('acc-1', 5000000)];
    const oldT = tx({ type: 'EXPENSE', accountId: 'acc-1', amount: 800000, categoryId: 'cat-food' });
    const newT = tx({ type: 'EXPENSE', accountId: 'acc-1', amount: 1200000, categoryId: 'cat-bills' });
    // Current balances already reflect oldT (the real-world state before an edit).
    const withOld = TransactionEngine.applyTransactionToAccounts(oldT, accs);
    expect(withOld.find((a) => a.id === 'acc-1')!.currentBalance).toBe(4200000);
    const updated = TransactionEngine.updateTransactionInAccounts(oldT, newT, withOld);
    expect(updated.find((a) => a.id === 'acc-1')!.currentBalance).toBe(3800000);
  });

  it('INV: transfer reversal restores BOTH accounts exactly', () => {
    const accs = [php('acc-1', 5000000), php('acc-2', 1000000)];
    const transfer = tx({ type: 'TRANSFER', accountId: 'acc-1', destinationAccountId: 'acc-2', amount: 500000 });
    const added = TransactionEngine.applyTransactionToAccounts(transfer, accs);
    const reverted = TransactionEngine.reverseTransactionFromAccounts(transfer, added);
    expect(reverted.find((a) => a.id === 'acc-1')!.currentBalance).toBe(5000000);
    expect(reverted.find((a) => a.id === 'acc-2')!.currentBalance).toBe(1000000);
  });
});

describe('3. Atomic / Positive Mutations Only', () => {
  it('INV: applyTransactionToAccounts never mutates the input array (immutability)', () => {
    const accs = [php('acc-1', 5000000)];
    const snapshot = JSON.stringify(accs);
    TransactionEngine.applyTransactionToAccounts(tx({ accountId: 'acc-1' }), accs);
    expect(JSON.stringify(accs)).toBe(snapshot);
  });

  it('INV: validateTransaction blocks overdrafts and cross-currency transfers', () => {
    const accs = [php('acc-1', 500000), usd('acc-2', 500000)];
    expect(TransactionEngine.validateTransaction({ type: 'EXPENSE', amount: 600000, currency: 'PHP', accountId: 'acc-1' }, accs))
      .toBe('This would overdraw the source account.');
    expect(TransactionEngine.validateTransaction({ type: 'TRANSFER', amount: 100, currency: 'PHP', accountId: 'acc-1', destinationAccountId: 'acc-2' }, accs))
      .toBe('Transfers between different currencies are not supported.');
    expect(TransactionEngine.validateTransaction({ type: 'EXPENSE', amount: 100, currency: 'PHP', accountId: 'acc-1' }, accs))
      .toBeNull();
  });
});

describe('4. Money Precision', () => {
  it('INV: sums stay integer minor units (no float drift)', () => {
    const accs = [php('acc-1', 0)];
    let running = accs;
    // 0.01 units * 1000 = 10.00, repeated to stress float
    for (let i = 0; i < 1000; i++) {
      running = TransactionEngine.applyTransactionToAccounts(tx({ id: `t${i}`, type: 'EXPENSE', accountId: 'acc-1', amount: 1 }), running);
    }
    expect(running.find((a) => a.id === 'acc-1')!.currentBalance).toBe(-1000);
  });
});

describe('5. Date / Time Handling', () => {
  it('INV: transactions on the boundary date are included in period totals', () => {
    const list = [
      tx({ date: '2026-05-01' }),
      tx({ date: '2026-05-31' }),
      tx({ date: '2026-06-01' }),
    ];
    const totals = TransactionEngine.calculatePeriodTotals(list, '2026-05-01', '2026-05-31');
    expect(totals.transactionCount).toBe(2);
  });

  it('INV: PENDING transactions are excluded from totals', () => {
    const list = [tx({ status: 'PENDING' }), tx({ status: 'CONFIRMED' })];
    const totals = TransactionEngine.calculatePeriodTotals(list, '2026-05-01', '2026-05-31');
    expect(totals.transactionCount).toBe(1);
  });
});

describe('6. Multi-Currency Isolation (CRITICAL)', () => {
  const mixed = [php('acc-php', 1000000), usd('acc-usd', 50000)]; // ₱10,000 + $500

  it('INV: total balance never sums PHP and USD together', () => {
    const totalPhp = AccountEngine.calculateTotalBalance(mixed, 'PHP').getMinorUnits();
    const totalUsd = AccountEngine.calculateTotalBalance(mixed, 'USD').getMinorUnits();
    expect(totalPhp).toBe(1000000);
    expect(totalUsd).toBe(50000);
    expect(totalPhp + totalUsd).not.toBe(AccountEngine.calculateTotalBalance(mixed).getMinorUnits());
  });

  it('INV: SafeToSpend isolates by currency (PHP commitment does not affect USD pool)', () => {
    const commitments: MoneyCommitment[] = [{
      id: 'c1', userId: 'user-1', title: 'Bill', type: 'BILL', amount: 200000, currency: 'PHP',
      direction: 'OUTFLOW', status: 'PROJECTED', dueDate: '2026-05-20', accountId: 'acc-php',
      categoryId: 'cat-bills', priority: 'ESSENTIAL', createdAt: '', updatedAt: '',
    }];
    const phpRes = SafeToSpendEngine.calculateSafeToSpend(mixed, commitments, [], settings({ currency: 'PHP' }), '2026-05-15');
    const usdRes = SafeToSpendEngine.calculateSafeToSpend(mixed, commitments, [], settings({ currency: 'USD' }), '2026-05-15');
    expect(phpRes.essentialUpcomingCommitments).toBe(200000);
    expect(usdRes.essentialUpcomingCommitments).toBe(0); // PHP commitment ignored in USD context
    expect(phpRes.totalAvailableBalance).toBe(1000000);
    expect(usdRes.totalAvailableBalance).toBe(50000);
  });

  it('INV: Timeline running balance is currency-scoped', () => {
    const timeline = TimelineEngine.generateTimeline(mixed, [], [], [], '2026-05-15', '2026-05-20', '2026-05-15');
    // running balance starts from the first account's currency (PHP) only
    expect(timeline[0].projectedEndOfDayBalance).toBe(1000000);
  });

  it('INV: RiskEngine overdue total is currency-scoped', () => {
    const overdue: MoneyCommitment[] = [
      { id: 'c1', userId: 'user-1', title: 'PHP bill', type: 'BILL', amount: 100000, currency: 'PHP', direction: 'OUTFLOW', status: 'SCHEDULED', dueDate: '2026-05-01', accountId: 'acc-php', categoryId: 'cat-bills', priority: 'ESSENTIAL', createdAt: '', updatedAt: '' },
      { id: 'c2', userId: 'user-1', title: 'USD bill', type: 'BILL', amount: 50000, currency: 'USD', direction: 'OUTFLOW', status: 'SCHEDULED', dueDate: '2026-05-01', accountId: 'acc-usd', categoryId: 'cat-bills', priority: 'ESSENTIAL', createdAt: '', updatedAt: '' },
    ];
    const risks = RiskEngine.detectCashFlowRisks(mixed, [], overdue, [], settings({ currency: 'PHP' }), '2026-05-15');
    expect(risks.some((r) => r.title.includes('1 Overdue'))).toBe(true);
    // the overdue risk total must be PHP-only (100000), not cross-summed
    expect(risks.find((r) => r.title.includes('Overdue'))!.projectedBalance).toBe(0);
  });
});

describe('7. Budget Rollover', () => {
  const budget = (over: Partial<Budget> = {}): Budget => ({
    id: 'b1', userId: 'user-1', name: 'Food', amount: 3000000, period: 'MONTHLY',
    startDate: '2026-05-01', endDate: '2026-05-31', categoryIds: ['cat-food'],
    notifyThresholdPercentage: 80, isActive: true, createdAt: '', updatedAt: '',
    ...over,
  });

  it('INV: without rollover, prior underspend is NOT carried forward', () => {
    const f = BudgetEngine.calculateBudgetForecast(budget(), [], '2026-05-15');
    expect(f.budgetAmount).toBe(3000000);
  });

  it('INV: with rollover, prior period underspend IS carried forward', () => {
    const prevTx = [tx({ date: '2026-04-15', categoryId: 'cat-food', amount: 1000000 })]; // spent 1,000 of 3,000 => 2,000 unused
    const f = BudgetEngine.calculateBudgetForecast(budget({ rolloverUnused: true }), prevTx, '2026-05-15');
    expect(f.budgetAmount).toBe(5000000); // 3,000 + 2,000 carry
  });

  it('INV: rollover never produces negative carry on prior overspend', () => {
    const prevTx = [tx({ date: '2026-04-15', categoryId: 'cat-food', amount: 4000000 })]; // overspent
    const f = BudgetEngine.calculateBudgetForecast(budget({ rolloverUnused: true }), prevTx, '2026-05-15');
    expect(f.budgetAmount).toBe(3000000); // carry clamped to 0
  });
});

describe('8. Cross-Engine Conservation', () => {
  it('INV: transfer summed across accounts == 0 net change to global money', () => {
    const accs = [php('acc-1', 5000000), php('acc-2', 2000000)];
    const transfer = tx({ type: 'TRANSFER', accountId: 'acc-1', destinationAccountId: 'acc-2', amount: 1234500 });
    const before = accs.reduce((s, a) => s + a.currentBalance, 0);
    const after = TransactionEngine.applyTransactionToAccounts(transfer, accs).reduce((s, a) => s + a.currentBalance, 0);
    expect(after).toBe(before);
  });

  it('INV: period totals exclude transfers from income/expense', () => {
    const list = [tx({ type: 'TRANSFER', accountId: 'acc-1', destinationAccountId: 'acc-2' })];
    const totals = TransactionEngine.calculatePeriodTotals(list, '2026-05-01', '2026-05-31');
    expect(totals.totalIncome.getMinorUnits()).toBe(0);
    expect(totals.totalExpense.getMinorUnits()).toBe(0);
    expect(totals.netCashFlow.getMinorUnits()).toBe(0);
  });
});
