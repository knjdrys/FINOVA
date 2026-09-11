/**
 * DESTRUCTION TEST — What-If simulation honesty.
 * Recurring sims used to charge twice (immediate tx + same-date commitment);
 * goal impact quoted target/12 regardless of horizon; income sims spoke of
 * "spending" and listed phantom budget impacts.
 */
import { describe, it, expect } from 'vitest';
import { WhatIfEngine } from '../domain/what-if/WhatIfEngine';
import { Account, Budget, Category, SavingsGoal, Transaction, UserSettings } from '../types';

const TODAY = '2026-09-15';
const P = (major: number) => Math.round(major * 100);

const acc = (): Account => ({
  id: 'a1', userId: 'user-1', name: 'a1', type: 'BANK', currency: 'PHP',
  initialBalance: P(20000), currentBalance: P(20000), icon: '', color: '',
  includeInTotalBalance: true, isArchived: false,
  createdAt: TODAY, updatedAt: TODAY,
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

const sim = (
  type: 'EXPENSE' | 'INCOME' | 'RECURRING_EXPENSE' | 'RECURRING_INCOME',
  amount: number,
  over: { budgets?: Budget[]; goals?: SavingsGoal[]; transactions?: Transaction[] } = {}
) =>
  WhatIfEngine.simulateScenario(
    { title: 'Sim', amount, type, date: TODAY, categoryId: 'cat-shopping', accountId: 'a1' },
    [acc()],
    over.transactions ?? [],
    over.budgets ?? [],
    over.goals ?? [],
    [],
    [cat('cat-shopping')],
    settings(),
    TODAY
  );

describe('recurring sims charge once', () => {
  it('RECURRING_EXPENSE projects a single obligation (no immediate double-charge)', () => {
    const r = sim('RECURRING_EXPENSE', P(1000));
    // Month-end projection drops by exactly one charge, not two.
    expect(r.baseMonthEndProjectedBalance - r.simulatedMonthEndProjectedBalance).toBe(P(1000));
  });
});

describe('income sims', () => {
  it('income raises Safe-to-Spend, speaks of income, and lists no phantom budgets', () => {
    const whole: Budget = {
      id: 'b1', userId: 'u', name: 'All', amount: P(5000), currency: 'PHP',
      period: 'MONTHLY', categoryIds: [], startDate: '2026-09-01', endDate: '2026-09-30',
      isActive: true, rolloverUnused: false, notifyThresholdPercentage: 80,
      createdAt: TODAY, updatedAt: TODAY,
    };
    const r = sim('INCOME', P(5000), { budgets: [whole] });
    expect(r.safeToSpendDelta).toBeGreaterThan(0);
    expect(r.verdict).toBe('SAFE');
    expect(r.summarySentence).toContain('income');
    expect(r.affectedBudgets).toHaveLength(0);
  });
});

describe('goal impact uses the real required pace', () => {
  it('quotes requiredMonthlySaving for the goal horizon, not target/12', () => {
    const goal: SavingsGoal = {
      id: 'g1', userId: 'u', name: 'Trip', targetAmount: P(12000), currentAmount: 0,
      currency: 'PHP', targetDate: '2026-12-15', priority: 'ESSENTIAL', status: 'ON_TRACK',
      icon: '', color: '', isArchived: false, createdAt: '2026-09-15', updatedAt: TODAY,
    };
    // A 20,000 wipeout forces a deficit so goal impact triggers.
    const r = sim('EXPENSE', P(20000), { goals: [goal] });
    expect(r.verdict).toBe('HIGH_RISK');
    expect(r.affectedGoals).toHaveLength(1);
    // ~3 months remain: required pace ≈ 4,01x/mo — target/12 would say 1,000.
    expect(r.affectedGoals[0].impactDescription).toContain('4,01');
    expect(r.affectedGoals[0].impactDescription).not.toContain('1,000.00');
  });
});
