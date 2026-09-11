/**
 * DESTRUCTION TEST — InsightEngine honesty.
 * MoM compared elapsed days vs a full month (fake praise every month-start);
 * blown budgets, cash deficits, and behind-track goals stayed silent.
 */
import { describe, it, expect } from 'vitest';
import { InsightEngine } from '../domain/insight/InsightEngine';
import {
  Account, Budget, Category, SavingsGoal, Transaction, UserSettings,
} from '../types';

const TODAY = '2026-09-05'; // early month: the partial-window trap
const P = (major: number) => Math.round(major * 100);

const baseAcc = (over: Partial<Account> = {}): Account => ({
  id: 'a1', userId: 'user-1', name: 'a1', type: 'BANK', currency: 'PHP',
  initialBalance: P(50000), currentBalance: P(50000), icon: '', color: '',
  includeInTotalBalance: true, isArchived: false,
  createdAt: TODAY, updatedAt: TODAY, ...over,
});

const settings = (): UserSettings => ({
  userId: 'user-1', userName: 'T', currency: 'PHP',
  defaultTrackingPeriod: 'TODAY', budgetCycleMode: 'MONTHLY',
  semiMonthlyCutoffDay: 15, minimumReserve: 0, safeToSpendPeriod: 'END_OF_MONTH',
  darkTheme: false, notificationsEnabled: true, budgetWarningThreshold: 80,
  autoGenerateCommitmentsFromRecurring: true, hasCompletedOnboarding: true,
});

const cat = (id: string): Category => ({
  id, userId: 'user-1', name: id, type: 'EXPENSE', icon: '', emoji: '',
  color: '', bgColor: '', isSystem: false, isArchived: false,
});

let n = 0;
const tx = (over: Partial<Transaction>): Transaction => ({
  id: `t${++n}`, userId: 'user-1', type: 'EXPENSE', status: 'CONFIRMED',
  amount: P(100), currency: 'PHP', date: TODAY, accountId: 'a1',
  categoryId: 'cat-food', note: 'x', tags: [], createdAt: TODAY, updatedAt: TODAY, ...over,
});

const run = (txs: Transaction[], budgets: Budget[] = [], goals: SavingsGoal[] = []) =>
  InsightEngine.generateInsights(
    [baseAcc()], txs, budgets, goals, [], [cat('cat-food')], settings(), TODAY
  );

describe('foreign-currency pool honesty', () => {
  const runWith = (accounts: Account[]) =>
    InsightEngine.generateInsights(accounts, [], [], [], [], [cat('cat-food')], settings(), TODAY);

  it('flags foreign-currency accounts excluded from the spending-limit pool', () => {
    const insights = runWith([
      baseAcc({ id: 'a1', name: 'GRBank' }),
      baseAcc({ id: 'a2', name: 'Wise USD', currency: 'USD' }),
    ]);
    const fx = insights.find((i) => i.id === 'insight-fx-excluded');
    expect(fx).toBeDefined();
    expect(fx?.fact).toContain('Wise USD');
    expect(fx?.calculation).toContain('USD');
    expect(fx?.severity).toBe('NEUTRAL');
  });

  it('stays silent when every included account matches the pool currency', () => {
    const insights = runWith([baseAcc({ id: 'a1' })]);
    expect(insights.some((i) => i.id === 'insight-fx-excluded')).toBe(false);
  });

  it('ignores archived and untracked foreign accounts (already visibly out)', () => {
    const insights = runWith([
      baseAcc({ id: 'a1' }),
      baseAcc({ id: 'a2', currency: 'USD', isArchived: true }),
      baseAcc({ id: 'a3', currency: 'EUR', includeInTotalBalance: false }),
    ]);
    expect(insights.some((i) => i.id === 'insight-fx-excluded')).toBe(false);
  });
});

describe('like-for-like month comparison', () => {
  it('does not praise a "drop" that is just the calendar (Sep 5 vs full August)', () => {
    // August: 3,000 spread across the month. September so far: 500 (on pace!).
    const txs = [
      tx({ date: '2026-08-05', amount: P(1000) }),
      tx({ date: '2026-08-15', amount: P(1000) }),
      tx({ date: '2026-08-25', amount: P(1000) }),
      tx({ date: '2026-09-02', amount: P(500) }),
    ];
    const insights = run(txs);
    // Like-for-like: Sep(500 thru day 5) vs Aug thru day 5 (1000) → down 50%,
    // a REAL drop — but the old code screamed "down 83%" vs the full 3000.
    const down = insights.find((i) => i.id === 'insight-cat-down-cat-food');
    expect(down?.title).toContain('50%');
    expect(down?.title).not.toContain('83%');
  });

  it('ignores future-dated rows in the current-month window', () => {
    const txs = [
      tx({ date: '2026-08-03', amount: P(1000) }),
      tx({ date: '2026-09-20', amount: P(5000) }), // future — not spent yet
    ];
    const insights = run(txs);
    // Current window holds nothing → no comparison card at all.
    expect(insights.find((i) => i.id.startsWith('insight-cat-'))).toBeUndefined();
  });

  it('stays silent on dust (sub-₱100 swings are not trends)', () => {
    const txs = [
      tx({ date: '2026-08-02', amount: P(90) }),
      tx({ date: '2026-09-02', amount: P(50) }),
    ];
    const insights = run(txs);
    expect(insights.find((i) => i.id.startsWith('insight-cat-'))).toBeUndefined();
  });
});

describe('blown budgets speak up', () => {
  it('emits an over-limit card for OVER_BUDGET', () => {
    const b: Budget = {
      id: 'b1', userId: 'u', name: 'Food', amount: P(1000), currency: 'PHP',
      period: 'MONTHLY', categoryIds: ['cat-food'],
      startDate: '2026-09-01', endDate: '2026-09-30',
      isActive: true, rolloverUnused: false, notifyThresholdPercentage: 80,
      createdAt: TODAY, updatedAt: TODAY,
    };
    const insights = run([tx({ date: '2026-09-02', amount: P(2500) })], [b]);
    const card = insights.find((i) => i.id === 'insight-budget-risk-b1');
    expect(card).toBeDefined();
    expect(card?.severity).toBe('ALERT');
    expect(card?.title).toContain('over the limit');
  });
});

describe('behind-track goals speak up', () => {
  it('emits a warning card for a goal at half the expected pace', () => {
    const g: SavingsGoal = {
      id: 'g1', userId: 'u', name: 'Trip', targetAmount: P(12000),
      currentAmount: P(3000), currency: 'PHP', targetDate: '2026-12-05',
      priority: 'ESSENTIAL', status: 'ON_TRACK', icon: '', color: '',
      isArchived: false, createdAt: '2026-06-05', updatedAt: TODAY,
    };
    const insights = run([], [], [g]);
    const card = insights.find((i) => i.id === 'insight-goal-behind-g1');
    expect(card).toBeDefined();
    expect(card?.title).toContain('falling behind');
  });
});

describe('deficit speaks loudest', () => {
  it('emits a top-scored deficit card when obligations exceed money', () => {
    const insights = InsightEngine.generateInsights(
      [baseAcc({ currentBalance: P(1000) })],
      [],
      [],
      [{
        id: 'g1', userId: 'u', name: 'Trip', targetAmount: P(12000),
        currentAmount: 0, currency: 'PHP', targetDate: '2026-10-05',
        priority: 'ESSENTIAL', status: 'ON_TRACK', icon: '', color: '',
        isArchived: false, createdAt: '2026-09-01', updatedAt: TODAY,
      }],
      [{
        id: 'c1', userId: 'u', title: 'Rent', amount: P(15000), currency: 'PHP',
        dueDate: '2026-09-10', type: 'BILL', direction: 'OUTFLOW',
        categoryId: 'cat-food',
        priority: 'ESSENTIAL', status: 'SCHEDULED', accountId: 'a1',
        isAutoGenerated: false, createdAt: TODAY, updatedAt: TODAY,
      }],
      [cat('cat-food')],
      settings(),
      TODAY
    );
    const card = insights.find((i) => i.id === 'insight-safetospend-deficit');
    expect(card).toBeDefined();
    expect(card?.severity).toBe('ALERT');
    expect(card?.score).toBe(100);
    expect(insights[0].id).toBe('insight-safetospend-deficit');
  });
});
