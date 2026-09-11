/**
 * DESTRUCTION TEST — Safe-to-Spend integrity.
 * Overdue bills used to be excluded from the deduction (only today..periodEnd
 * counted), overstating safety; AUTO_POSTED bills were deducted a second time
 * even though their money had already left the balance.
 */
import { describe, it, expect } from 'vitest';
import { SafeToSpendEngine } from '../domain/safe-to-spend/SafeToSpendEngine';
import { AccountEngine } from '../domain/account/AccountEngine';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { Account, MoneyCommitment, Transaction, UserSettings } from '../types';

const TODAY = '2026-09-15';
const P = (major: number) => Math.round(major * 100);

const settings = (over: Partial<UserSettings> = {}): UserSettings => ({
  userId: 'user-1', userName: 'Test', currency: 'PHP',
  defaultTrackingPeriod: 'TODAY', budgetCycleMode: 'MONTHLY',
  semiMonthlyCutoffDay: 15, minimumReserve: 0, safeToSpendPeriod: 'END_OF_MONTH',
  darkTheme: false, notificationsEnabled: true, budgetWarningThreshold: 80,
  autoGenerateCommitmentsFromRecurring: true,
  hasCompletedOnboarding: true,
  ...over,
});

const acc = (balance: number): Account => ({
  id: 'a1', userId: 'user-1', name: 'a1', type: 'BANK', currency: 'PHP',
  initialBalance: P(20000), currentBalance: balance, icon: '', color: '',
  includeInTotalBalance: true, isArchived: false,
  createdAt: TODAY, updatedAt: TODAY,
});

const bill = (over: Partial<MoneyCommitment> & { id: string }): MoneyCommitment => ({
  userId: 'user-1', title: 'Bill', type: 'BILL', amount: P(1000), currency: 'PHP',
  direction: 'OUTFLOW', status: 'PROJECTED', dueDate: TODAY,
  accountId: 'a1', categoryId: 'cat-bills', priority: 'ESSENTIAL',
  createdAt: TODAY, updatedAt: TODAY,
  ...over,
});

describe('obligation scope', () => {
  it('OVERDUE bills reduce safe-to-spend (still owed)', () => {
    const base = SafeToSpendEngine.calculateSafeToSpend([acc(P(20000))], [], [], settings(), TODAY);
    const withOverdue = SafeToSpendEngine.calculateSafeToSpend(
      [acc(P(20000))],
      [bill({ id: 'c-od', status: 'OVERDUE', dueDate: '2026-09-01' })],
      [],
      settings(),
      TODAY
    );
    expect(withOverdue.essentialUpcomingCommitments).toBe(P(1000));
    expect(withOverdue.discretionaryPool).toBe(base.discretionaryPool - P(1000));
  });

  it('AUTO_POSTED bills are NOT deducted again (money already left)', () => {
    // Balance already reflects the posted payment; deducting again double-counts.
    const res = SafeToSpendEngine.calculateSafeToSpend(
      [acc(P(20000) - P(1000))],
      [bill({ id: 'c-ap', status: 'AUTO_POSTED', dueDate: '2026-09-10' })],
      [],
      settings(),
      TODAY
    );
    expect(res.essentialUpcomingCommitments).toBe(0);
    expect(res.discretionaryPool).toBe(P(19000));
  });

  it('upcoming + overdue combine; future-beyond-period excluded', () => {
    const res = SafeToSpendEngine.calculateSafeToSpend(
      [acc(P(20000))],
      [
        bill({ id: 'c-od', status: 'OVERDUE', dueDate: '2026-09-01', amount: P(500) }),
        bill({ id: 'c-up', dueDate: '2026-09-20', amount: P(700) }),
        bill({ id: 'c-next', dueDate: '2026-10-05', amount: P(9999) }),
      ],
      [],
      settings(),
      TODAY
    );
    expect(res.essentialUpcomingCommitments).toBe(P(1200));
  });
});

describe('archive preserves settled history', () => {
  it('AUTO_POSTED commitments survive account archival (money moved — history)', () => {
    const bills = [
      bill({ id: 'c-ap', status: 'AUTO_POSTED' }),
      bill({ id: 'c-proj', status: 'PROJECTED' }),
    ];
    const out = AccountEngine.archiveAccount([acc(P(1))], bills, [], 'a1', TODAY);
    expect(out.commitments.find((c) => c.id === 'c-ap')!.status).toBe('AUTO_POSTED');
    expect(out.commitments.find((c) => c.id === 'c-proj')!.status).toBe('CANCELLED');
  });
});

describe('balance reconstruction oracle', () => {
  const mkTx = (over: Partial<Transaction> & { id: string }): Transaction => ({
    userId: 'user-1', type: 'EXPENSE', amount: P(100), currency: 'PHP',
    categoryId: 'cat-shopping', accountId: 'a1', date: '2026-09-10', time: '10:00',
    tags: [], status: 'CONFIRMED', createdAt: '2026-09-10', updatedAt: '2026-09-10',
    ...over,
  });

  it('stored balances always equal initial + replayed history (all mutation paths)', () => {
    let accounts = [
      { ...acc(0), id: 'a1', initialBalance: P(5000), currentBalance: P(5000) },
      { ...acc(0), id: 'a2', initialBalance: P(1000), currentBalance: P(1000) },
    ];
    let txs: Transaction[] = [];
    const apply = (t: Transaction) => {
      accounts = TransactionEngine.applyTransactionToAccounts(t, accounts);
      txs = [t, ...txs];
    };

    // Income, expense, transfer (both legs), goal-fund reservation, adjustment.
    apply(mkTx({ id: 't1', type: 'INCOME', amount: P(2000), accountId: 'a1' }));
    apply(mkTx({ id: 't2', type: 'EXPENSE', amount: P(300), accountId: 'a1' }));
    apply(mkTx({ id: 't3', type: 'TRANSFER', amount: P(700), accountId: 'a1', destinationAccountId: 'a2' }));
    apply(mkTx({ id: 't4', type: 'EXPENSE', amount: P(400), accountId: 'a2', tags: ['goal-fund'] }));
    apply(mkTx({ id: 't5', type: 'INCOME', amount: P(50), accountId: 'a2', tags: ['adjustment'] }));
    // Edit (reverse-then-apply) and delete (reverse).
    const edited = { ...txs.find((t) => t.id === 't2')!, amount: P(500) };
    accounts = TransactionEngine.updateTransactionInAccounts(txs.find((t) => t.id === 't2')!, edited, accounts);
    txs = txs.map((t) => (t.id === 't2' ? edited : t));
    const condemned = txs.find((t) => t.id === 't1')!;
    accounts = TransactionEngine.reverseTransactionFromAccounts(condemned, accounts);
    txs = txs.filter((t) => t.id !== 't1');
    // A PENDING row must not move the oracle (nor the stored balance — apply
    // is never called for pending in the app; oracle skips it by status).
    const pending = mkTx({ id: 't6', amount: P(9999), accountId: 'a1', status: 'PENDING' });
    txs = [pending, ...txs];

    const oracle = AccountEngine.calculateReconciledBalances(accounts, txs);
    for (const a of accounts) {
      expect(oracle.get(a.id)).toBe(a.currentBalance);
    }
    // Spot-check the arithmetic: a1 = 5000 - 500 - 700 = 3800; a2 = 1000 + 700 - 400 + 50 = 1350.
    expect(accounts.find((a) => a.id === 'a1')!.currentBalance).toBe(P(3800));
    expect(accounts.find((a) => a.id === 'a2')!.currentBalance).toBe(P(1350));
  });
});
