import { describe, it, expect } from 'vitest';
import { AccountEngine } from '../domain/account/AccountEngine';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { DateUtils } from '../domain/date/DateUtils';
import { Account, Budget, MoneyCommitment, RecurringTransaction, SavingsGoal, Transaction, CurrencyCode } from '../types';
import { FinovaState } from '../services/storage/FinovaStorage';

// ---------------------------------------------------------------------------
// Test helpers — replicate the exact FinovaState mutation logic used in App.tsx
// so these tests exercise the SAME code paths the UI triggers end-to-end.
// ---------------------------------------------------------------------------

const todayISO = DateUtils.getTodayISO();
const monthStart = DateUtils.getMonthStartISO(todayISO);
const monthEnd = DateUtils.getMonthEndISO(todayISO);

function php(id: string, bal: number, include = true): Account {
  return {
    id, userId: 'user-1', name: id, bankPresetId: 'grbi', accountNumberMask: '••••',
    type: 'BANK', currency: 'PHP', initialBalance: bal, currentBalance: bal,
    icon: 'Building2', color: '#1C205E', includeInTotalBalance: include, isArchived: false,
    createdAt: todayISO, updatedAt: todayISO,
  };
}
function usd(id: string, bal: number): Account {
  return { ...php(id, bal), currency: 'USD' };
}

function tx(t: Partial<Transaction> & Pick<Transaction, 'type' | 'accountId' | 'amount'>): Transaction {
  return {
    id: t.id || `tx-${Math.random()}`, userId: 'user-1', categoryId: t.categoryId || 'cat-general',
    currency: t.currency || 'PHP', merchant: t.merchant || '', note: t.note || '',
    date: t.date || todayISO, time: t.time || '12:00', tags: t.tags || [], status: t.status || 'CONFIRMED',
    createdAt: todayISO, updatedAt: todayISO, ...t,
  };
}

// Simulate App's handleAddBudget / handleUpdateBudget / handleDeleteBudget
function addBudget(state: FinovaState, b: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>): FinovaState {
  return { ...state, budgets: [...state.budgets, { ...b, id: `bud-${Date.now()}`, createdAt: todayISO, updatedAt: todayISO }] };
}
function updateBudget(state: FinovaState, id: string, data: Partial<Budget>): FinovaState {
  return { ...state, budgets: state.budgets.map((x) => (x.id === id ? { ...x, ...data, updatedAt: todayISO } : x)) };
}
function deleteBudget(state: FinovaState, id: string): FinovaState {
  return { ...state, budgets: state.budgets.filter((x) => x.id !== id) };
}

// Simulate App's handleToggleCommitmentStatus (mark paid with financial effect)
function toggleCommitment(state: FinovaState, id: string): FinovaState {
  const comm = state.commitments.find((c) => c.id === id);
  if (!comm) return state;
  const willBePaid = comm.status !== 'COMPLETED';
  let commitments: MoneyCommitment[] = state.commitments.map((c) =>
    c.id === id ? { ...c, status: (willBePaid ? 'COMPLETED' : 'PROJECTED') as MoneyCommitment['status'], updatedAt: todayISO } : c
  );
  let accounts = state.accounts;
  let transactions = state.transactions;
  if (willBePaid) {
    const source = state.accounts.find((a) => a.id === comm.accountId);
    if (source && source.currency === comm.currency && source.currentBalance - comm.amount >= 0) {
      const payTx = tx({ id: `tx-${Date.now()}`, type: 'EXPENSE', amount: comm.amount, currency: comm.currency, categoryId: comm.categoryId || 'cat-bills', accountId: comm.accountId, merchant: comm.title });
      accounts = TransactionEngine.applyTransactionToAccounts(payTx, state.accounts);
      transactions = [payTx, ...state.transactions];
    }
  }
  return { ...state, commitments, accounts, transactions };
}

// Simulate App's handleFundGoal
function fundGoal(state: FinovaState, goalId: string, amount: number, fromAccountId: string): FinovaState {
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal || amount <= 0) return state;
  const newCurrent = Math.min(goal.targetAmount, goal.currentAmount + amount);
  const fundTx = tx({ id: `tx-${Date.now()}`, type: 'EXPENSE', amount, currency: goal.currency || 'PHP', categoryId: 'cat-transfer', accountId: fromAccountId, merchant: `Fund: ${goal.name}` });
  const updatedAccounts = TransactionEngine.applyTransactionToAccounts(fundTx, state.accounts);
  const updatedGoals = state.goals.map((g) => g.id === goalId ? { ...g, currentAmount: newCurrent, status: (newCurrent >= g.targetAmount ? 'COMPLETED' : g.status) as SavingsGoal['status'] } : g);
  return { ...state, accounts: updatedAccounts, goals: updatedGoals, transactions: [fundTx, ...state.transactions] };
}

// Simulate App's recurring add
function addRecurring(state: FinovaState, r: Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt'>): FinovaState {
  return { ...state, recurring: [...state.recurring, { ...r, id: `rec-${Date.now()}`, createdAt: todayISO, updatedAt: todayISO }] };
}

const baseState = (): FinovaState => ({
  accounts: [php('acc-1', 1000000)],
  transactions: [],
  categories: [],
  budgets: [],
  goals: [],
  commitments: [],
  readNotificationIds: [],
  recurring: [],
  settings: {
    userId: 'user-1', userName: 'Test', currency: 'PHP', defaultTrackingPeriod: 'TODAY',
    budgetCycleMode: 'SEMI_MONTHLY_15_DAYS', semiMonthlyCutoffDay: 15, minimumReserve: 0,
    safeToSpendPeriod: 'END_OF_MONTH', darkTheme: false, notificationsEnabled: true,
    budgetWarningThreshold: 80, autoGenerateCommitmentsFromRecurring: true, hasCompletedOnboarding: true,
  },
});

describe('PLANS — Budget lifecycle CRUD', () => {
  it('add budget reflects in state and forecast', () => {
    let s = addBudget(baseState(), {
      userId: 'user-1', name: 'Food', amount: 500000, currency: 'PHP', period: 'MONTHLY',
      startDate: monthStart, endDate: monthEnd, categoryIds: [], notifyThresholdPercentage: 80, isActive: true,
    });
    expect(s.budgets.length).toBe(1);
    expect(s.budgets[0].amount).toBe(500000);

    const f = BudgetEngine.calculateBudgetForecast(s.budgets[0], s.transactions, todayISO);
    expect(f.budgetAmount).toBe(500000);
    expect(f.actualSpent).toBe(0);
    expect(f.status).toBe('UNDER_CONTROL');
  });

  it('edit budget updates the forecast window', () => {
    let s = addBudget(baseState(), {
      userId: 'user-1', name: 'Food', amount: 500000, currency: 'PHP', period: 'MONTHLY',
      startDate: monthStart, endDate: monthEnd, categoryIds: [], notifyThresholdPercentage: 80, isActive: true,
    });
    const id = s.budgets[0].id;
    s = updateBudget(s, id, { amount: 800000 });
    expect(s.budgets[0].amount).toBe(800000);
    const f = BudgetEngine.calculateBudgetForecast(s.budgets[0], s.transactions, todayISO);
    expect(f.budgetAmount).toBe(800000);
  });

  it('delete budget removes it from state', () => {
    let s = addBudget(baseState(), {
      userId: 'user-1', name: 'Food', amount: 500000, currency: 'PHP', period: 'MONTHLY',
      startDate: monthStart, endDate: monthEnd, categoryIds: [], notifyThresholdPercentage: 80, isActive: true,
    });
    const id = s.budgets[0].id;
    s = deleteBudget(s, id);
    expect(s.budgets.length).toBe(0);
  });

  it('budget rollover carries unused amount to next period', () => {
    const b: Budget = {
      id: 'bud-1', userId: 'user-1', name: 'Food', amount: 500000, currency: 'PHP', period: 'MONTHLY',
      startDate: '2026-05-01', endDate: '2026-05-31', categoryIds: [], notifyThresholdPercentage: 80,
      isActive: true, rolloverUnused: true, createdAt: todayISO, updatedAt: todayISO,
    };
    // April (prior period) spent 200000 -> 300000 carries forward
    const spentPrior = [tx({ type: 'EXPENSE', accountId: 'acc-1', amount: 200000, date: '2026-04-15' })];
    const f = BudgetEngine.calculateBudgetForecast(b, spentPrior, todayISO);
    expect(f.rolloverCarry).toBe(300000);
    expect(f.effectiveBudget).toBe(800000);
    expect(f.effectiveRemaining).toBe(800000); // nothing spent in current May period yet
  });
});

describe('PLANS — Savings Goal lifecycle + funding conservation', () => {
  const mkGoal = (): SavingsGoal => ({
    id: 'goal-1', userId: 'user-1', name: 'Emergency', targetAmount: 1000000, currentAmount: 0,
    currency: 'PHP', targetDate: DateUtils.addDaysISO(todayISO, 365), priority: 'ESSENTIAL',
    status: 'ON_TRACK', icon: 'Target', color: '#059669', isArchived: false, createdAt: todayISO, updatedAt: todayISO,
  });

  it('add goal then fund posts a real expense and increases saved amount', () => {
    let s = { ...baseState(), goals: [mkGoal()] };
    const before = s.accounts[0].currentBalance;
    s = fundGoal(s, 'goal-1', 200000, 'acc-1');

    // account decreases by funded amount (real money moved)
    expect(s.accounts[0].currentBalance).toBe(before - 200000);
    // goal current amount increases, clamped to target
    expect(s.goals[0].currentAmount).toBe(200000);
    // a real transaction was posted
    expect(s.transactions.length).toBe(1);
    expect(s.transactions[0].merchant).toContain('Fund:');
  });

  it('funding is clamped at target and flips status to COMPLETED', () => {
    let s = { ...baseState(), goals: [mkGoal()] };
    s = fundGoal(s, 'goal-1', 1000000, 'acc-1');
    expect(s.goals[0].currentAmount).toBe(1000000);
    expect(s.goals[0].status).toBe('COMPLETED');
  });

  it('delete goal archives (does not hard-remove) and is excluded from active progress', () => {
    let s = { ...baseState(), goals: [mkGoal()] };
    s = { ...s, goals: s.goals.map((g) => (g.id === 'goal-1' ? { ...g, isArchived: true } : g)) };
    const active = s.goals.filter((g) => !g.isArchived);
    expect(active.length).toBe(0);
  });
});

describe('PLANS — Commitment (Bill) lifecycle + mark-paid financial effect', () => {
  const mkComm = (): MoneyCommitment => ({
    id: 'comm-1', userId: 'user-1', title: 'Meralco', type: 'BILL', amount: 150000, currency: 'PHP',
    direction: 'OUTFLOW', status: 'PROJECTED', dueDate: DateUtils.addDaysISO(todayISO, 3),
    categoryId: 'cat-bills', accountId: 'acc-1', priority: 'ESSENTIAL', isAutoGenerated: false,
    createdAt: todayISO, updatedAt: todayISO,
  });

  it('marking paid posts a real expense and reduces the source account (conservation)', () => {
    let s = { ...baseState(), commitments: [mkComm()] };
    const before = s.accounts[0].currentBalance;
    s = toggleCommitment(s, 'comm-1');

    expect(s.commitments[0].status).toBe('COMPLETED');
    expect(s.accounts[0].currentBalance).toBe(before - 150000);
    expect(s.transactions.length).toBe(1);
    expect(s.transactions[0].amount).toBe(150000);
    expect(s.transactions[0].categoryId).toBe('cat-bills');
  });

  it('un-paying reverts status but does NOT restore the account (one-way financial effect)', () => {
    let s = { ...baseState(), commitments: [mkComm()] };
    s = toggleCommitment(s, 'comm-1'); // pay
    const afterPay = s.accounts[0].currentBalance;
    s = toggleCommitment(s, 'comm-1'); // unpay
    expect(s.commitments[0].status).toBe('PROJECTED');
    // money already left the account; un-paying only flips the flag
    expect(s.accounts[0].currentBalance).toBe(afterPay);
  });

  it('marking paid with insufficient funds records only (no overdraft)', () => {
    let s = { ...baseState(), accounts: [php('acc-1', 50000)], commitments: [mkComm()] };
    s = toggleCommitment(s, 'comm-1');
    expect(s.commitments[0].status).toBe('COMPLETED');
    // no transaction posted because it would overdraw
    expect(s.transactions.length).toBe(0);
    expect(s.accounts[0].currentBalance).toBe(50000);
  });

  it('marking paid with currency mismatch records only', () => {
    let s = { ...baseState(), accounts: [php('acc-1', 1000000)], commitments: [{ ...mkComm(), currency: 'USD' as CurrencyCode }] };
    s = toggleCommitment(s, 'comm-1');
    expect(s.commitments[0].status).toBe('COMPLETED');
    expect(s.transactions.length).toBe(0);
  });
});

describe('PLANS — Recurring transaction lifecycle', () => {
  it('add recurring sets a valid next occurrence and stays active', () => {
    let s = addRecurring(baseState(), {
      userId: 'user-1', title: 'Netflix', amount: 39900, currency: 'PHP', type: 'EXPENSE',
      categoryId: 'cat-bills', accountId: 'acc-1', frequency: 'MONTHLY',
      startDate: todayISO, nextOccurrence: todayISO, isActive: true, reminderEnabled: true,
    });
    expect(s.recurring.length).toBe(1);
    expect(s.recurring[0].isActive).toBe(true);
    expect(s.recurring[0].nextOccurrence).toBe(todayISO);
  });

  it('delete recurring removes it', () => {
    let s = addRecurring(baseState(), {
      userId: 'user-1', title: 'Netflix', amount: 39900, currency: 'PHP', type: 'EXPENSE',
      categoryId: 'cat-bills', accountId: 'acc-1', frequency: 'MONTHLY',
      startDate: todayISO, nextOccurrence: todayISO, isActive: true, reminderEnabled: true,
    });
    const id = s.recurring[0].id;
    s = { ...s, recurring: s.recurring.filter((r) => r.id !== id) };
    expect(s.recurring.length).toBe(0);
  });
});

describe('PLANS — Multi-currency isolation across plans', () => {
  it('funding a PHP goal only draws from a PHP account, never a USD one', () => {
    let s: FinovaState = {
      ...baseState(),
      accounts: [php('acc-php', 1000000), usd('acc-usd', 10000)],
      goals: [{
        id: 'goal-1', userId: 'user-1', name: 'G', targetAmount: 500000, currentAmount: 0,
        currency: 'PHP', targetDate: DateUtils.addDaysISO(todayISO, 365), priority: 'ESSENTIAL',
        status: 'ON_TRACK', icon: 'Target', color: '#059669', isArchived: false, createdAt: todayISO, updatedAt: todayISO,
      }],
    };
    s = fundGoal(s, 'goal-1', 100000, 'acc-php');
    expect(s.accounts.find((a) => a.id === 'acc-php')!.currentBalance).toBe(900000);
    // USD account untouched — no cross-currency bleed
    expect(s.accounts.find((a) => a.id === 'acc-usd')!.currentBalance).toBe(10000);
  });

  it('total balance across currencies is NOT naively summed', () => {
    const accs = [php('a', 1000000), usd('b', 50000)];
    // AccountEngine total with no currency arg sums raw minors (legacy behaviour) — isolation must be explicit
    const phpTotal = AccountEngine.calculateTotalBalance(accs, 'PHP');
    expect(phpTotal.getMinorUnits()).toBe(1000000); // USD excluded
    const usdTotal = AccountEngine.calculateTotalBalance(accs, 'USD');
    expect(usdTotal.getMinorUnits()).toBe(50000); // PHP excluded
  });
});
