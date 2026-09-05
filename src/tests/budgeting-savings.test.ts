/**
 * Budgeting & savings usefulness — engine + selection tests.
 * Covers: goal contribution logic, planned-vs-actual, goal risk detection,
 * budget forecasting risk levels, and PlanningService most-relevant selection.
 * All dates are fixed for determinism.
 */
import { describe, it, expect } from 'vitest';
import { GoalEngine } from '../domain/goal/GoalEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { PlanningService } from '../services/planning/PlanningService';
import { Budget, CurrencyCode, SavingsGoal, Transaction } from '../types';

const TODAY = '2026-09-01';

function mkGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: `goal-${Math.random().toString(36).slice(2, 8)}`,
    userId: 'user-1',
    name: 'Emergency Fund',
    targetAmount: 1000000, // ₱10,000.00
    currentAmount: 0,
    currency: 'PHP' as CurrencyCode,
    targetDate: '2026-12-31',
    priority: 'ESSENTIAL',
    status: 'ON_TRACK',
    icon: 'Target',
    color: '#059669',
    isArchived: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: `bud-${Math.random().toString(36).slice(2, 8)}`,
    userId: 'user-1',
    name: 'Food',
    amount: 500000, // ₱5,000.00
    currency: 'PHP' as CurrencyCode,
    period: 'MONTHLY',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    categoryIds: ['cat-food'],
    notifyThresholdPercentage: 80,
    isActive: true,
    rolloverUnused: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function mkTx(amount: number, date: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    userId: 'user-1',
    accountId: 'acc-1',
    categoryId: 'cat-food',
    type: 'EXPENSE',
    amount,
    currency: 'PHP' as CurrencyCode,
    merchant: 'Test',
    note: '',
    date,
    time: '12:00',
    tags: [],
    status: 'CONFIRMED',
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* GoalEngine — contribution logic                                     */
/* ------------------------------------------------------------------ */

describe('GoalEngine.contribute — contribution logic', () => {
  it('adds the amount and keeps the goal in progress when below target', () => {
    const goal = mkGoal({ currentAmount: 100000 });
    const next = GoalEngine.contribute(goal, 50000);
    expect(next.currentAmount).toBe(150000);
    expect(next.status).toBe('ON_TRACK');
  });

  it('clamps at the target and flips status to COMPLETED when fully funded', () => {
    const goal = mkGoal({ currentAmount: 900000 });
    const next = GoalEngine.contribute(goal, 200000);
    expect(next.currentAmount).toBe(1000000);
    expect(next.status).toBe('COMPLETED');
  });

  it('ignores zero and negative contributions (no-op, same object)', () => {
    const goal = mkGoal({ currentAmount: 100000 });
    expect(GoalEngine.contribute(goal, 0)).toBe(goal);
    expect(GoalEngine.contribute(goal, -5000)).toBe(goal);
  });

  it('does not mutate the original goal', () => {
    const goal = mkGoal({ currentAmount: 100000 });
    GoalEngine.contribute(goal, 50000);
    expect(goal.currentAmount).toBe(100000);
  });
});

/* ------------------------------------------------------------------ */
/* GoalEngine — planned vs actual + risk detection                     */
/* ------------------------------------------------------------------ */

describe('GoalEngine.getGoalInsight — planned vs actual + risk', () => {
  it('flags HIGH risk when far behind the even-pace plan', () => {
    // Created 2026-03-01, target 2026-09-30 (~213d). At 2026-09-01 ~86% of the
    // plan time has elapsed but only 10% saved → AT_RISK → HIGH.
    const goal = mkGoal({
      createdAt: '2026-03-01T00:00:00.000Z',
      targetDate: '2026-09-30',
      currentAmount: 100000,
    });
    const insight = GoalEngine.getGoalInsight(goal, TODAY);
    expect(insight.risk).toBe('HIGH');
    expect(insight.progress.status).toBe('AT_RISK');
    expect(insight.variance).toBeLessThan(0); // behind the planned curve
    expect(insight.paceRatio).toBeLessThan(1);
  });

  it('flags MEDIUM risk when slightly behind pace', () => {
    // Created 2026-06-01, target 2026-12-01 (183d). At 2026-09-01 ~50% elapsed;
    // 40% saved sits in the 75–100% band → SLIGHTLY_BEHIND → MEDIUM.
    const goal = mkGoal({
      createdAt: '2026-06-01T00:00:00.000Z',
      targetDate: '2026-12-01',
      currentAmount: 400000,
    });
    const insight = GoalEngine.getGoalInsight(goal, TODAY);
    expect(insight.progress.status).toBe('SLIGHTLY_BEHIND');
    expect(insight.risk).toBe('MEDIUM');
    expect(insight.variance).toBeLessThan(0);
  });

  it('reports no risk and positive variance when ahead of the planned curve', () => {
    const goal = mkGoal({
      createdAt: '2026-06-01T00:00:00.000Z',
      targetDate: '2026-12-01',
      currentAmount: 600000,
    });
    const insight = GoalEngine.getGoalInsight(goal, TODAY);
    expect(insight.risk).toBe('NONE');
    expect(insight.variance).toBeGreaterThan(0);
    expect(insight.paceRatio).toBeGreaterThan(1);
  });

  it('treats a completed goal as risk-free regardless of pace', () => {
    const goal = mkGoal({
      createdAt: '2026-03-01T00:00:00.000Z',
      targetDate: '2026-09-30',
      currentAmount: 1000000,
    });
    const insight = GoalEngine.getGoalInsight(goal, TODAY);
    expect(insight.isCompleted).toBe(true);
    expect(insight.risk).toBe('NONE');
  });

  it('computes expected contribution from the even-pace plan', () => {
    // 92 of 183 days elapsed → expected ≈ 50.3% of 1,000,000.
    const goal = mkGoal({
      createdAt: '2026-06-01T00:00:00.000Z',
      targetDate: '2026-12-01',
      currentAmount: 400000,
    });
    const insight = GoalEngine.getGoalInsight(goal, TODAY);
    expect(insight.expectedContributionToDate).toBeGreaterThan(480000);
    expect(insight.expectedContributionToDate).toBeLessThan(530000);
    expect(insight.variance).toBe(400000 - insight.expectedContributionToDate);
  });
});

/* ------------------------------------------------------------------ */
/* BudgetEngine — forecasting + risk detection                         */
/* ------------------------------------------------------------------ */

describe('BudgetEngine.getBudgetInsight — forecast + risk levels', () => {
  it('HIGH when actual spend already exceeds the budget', () => {
    const budget = mkBudget();
    const txs = [mkTx(600000, '2026-09-15')];
    const insight = BudgetEngine.getBudgetInsight(budget, txs, '2026-09-15');
    expect(insight.isOverBudget).toBe(true);
    expect(insight.risk).toBe('HIGH');
    expect(insight.forecast.status).toBe('OVER_BUDGET');
    expect(insight.projectedOverspend).toBeGreaterThan(0);
  });

  it('MEDIUM when the run-rate projects an overrun', () => {
    // 300k spent by day 15 of 30 → pace projects 580k > 500k budget.
    const budget = mkBudget();
    const txs = [mkTx(300000, '2026-09-15')];
    const insight = BudgetEngine.getBudgetInsight(budget, txs, '2026-09-15');
    expect(insight.forecast.status).toBe('AT_RISK');
    expect(insight.isAtRisk).toBe(true);
    expect(insight.risk).toBe('MEDIUM');
  });

  it('LOW when near the notify threshold but pace is safe', () => {
    // 400k of 500k (80%) spent on day 29 → projection stays under, threshold hit.
    const budget = mkBudget();
    const txs = [mkTx(400000, '2026-09-29')];
    const insight = BudgetEngine.getBudgetInsight(budget, txs, '2026-09-29');
    expect(insight.forecast.status).toBe('NEAR_LIMIT');
    expect(insight.isNearLimit).toBe(true);
    expect(insight.risk).toBe('LOW');
    expect(insight.daysLeft).toBe(1);
    expect(insight.dailyAllowanceRemaining).toBe(100000);
  });

  it('NONE when comfortably under budget', () => {
    const budget = mkBudget();
    const txs = [mkTx(100000, '2026-09-10')];
    const insight = BudgetEngine.getBudgetInsight(budget, txs, '2026-09-10');
    expect(insight.risk).toBe('NONE');
    expect(insight.isCurrent).toBe(true);
    expect(insight.projectedOverspend).toBe(0);
  });

  it('marks budgets outside their window as not current', () => {
    const budget = mkBudget({ startDate: '2026-10-01', endDate: '2026-10-31' });
    const insight = BudgetEngine.getBudgetInsight(budget, [], '2026-09-15');
    expect(insight.isCurrent).toBe(false);
  });

  it('folds rollover carry into the effective budget', () => {
    // August: 200k spent of 500k → 300k carries into September.
    const budget = mkBudget({ rolloverUnused: true });
    const txs = [
      mkTx(200000, '2026-08-15'),
      mkTx(700000, '2026-09-15'),
    ];
    const insight = BudgetEngine.getBudgetInsight(budget, txs, '2026-09-15');
    expect(insight.forecast.rolloverCarry).toBe(300000);
    expect(insight.forecast.effectiveBudget).toBe(800000);
    // 700k of 800k effective → under, but pace projects over → MEDIUM not HIGH.
    expect(insight.isOverBudget).toBe(false);
    expect(insight.risk).toBe('MEDIUM');
  });
});

/* ------------------------------------------------------------------ */
/* PlanningService — most-relevant selection for Home                  */
/* ------------------------------------------------------------------ */

describe('PlanningService.selectHomePlans — clean, relevant Home', () => {
  it('caps Home at 2 budgets and 2 goals', () => {
    const budgets = [1, 2, 3, 4].map((n) => mkBudget({ name: `B${n}` }));
    const goals = [1, 2, 3, 4].map((n) => mkGoal({ name: `G${n}` }));
    const sel = PlanningService.selectHomePlans(budgets, goals, [], TODAY);
    expect(sel.budgets.length).toBe(2);
    expect(sel.goals.length).toBe(2);
  });

  it('ranks the riskiest budget first', () => {
    // Safe budget tracks a category with no spending; risky one blows past its cap.
    const safe = mkBudget({ name: 'Safe', categoryIds: ['cat-safe'] });
    const risky = mkBudget({ name: 'Risky', amount: 200000 });
    const txs = [mkTx(600000, '2026-09-15', { categoryId: 'cat-food' })];
    const sel = PlanningService.selectHomePlans([safe, risky], [], txs, '2026-09-15');
    expect(sel.budgets[0].budget.name).toBe('Risky');
    expect(sel.budgets[0].risk).toBe('HIGH');
    expect(sel.hasRisk).toBe(true);
  });

  it('ranks the riskiest goal first', () => {
    const healthy = mkGoal({ name: 'Healthy', currentAmount: 900000, targetDate: '2026-09-15' });
    const struggling = mkGoal({
      name: 'Struggling',
      currentAmount: 50000,
      createdAt: '2026-03-01T00:00:00.000Z',
      targetDate: '2026-09-30',
    });
    const sel = PlanningService.selectHomePlans([], [healthy, struggling], [], TODAY);
    expect(sel.goals[0].goal.name).toBe('Struggling');
    expect(sel.goals[0].risk).toBe('HIGH');
  });

  it('excludes archived and fully-funded goals, and inactive budgets', () => {
    const goals = [
      mkGoal({ name: 'Archived', isArchived: true }),
      mkGoal({ name: 'Funded', currentAmount: 1000000 }),
      mkGoal({ name: 'Open' }),
    ];
    const budgets = [mkBudget({ name: 'Off', isActive: false }), mkBudget({ name: 'On' })];
    const sel = PlanningService.selectHomePlans(budgets, goals, [], TODAY);
    expect(sel.goals.map((g) => g.goal.name)).toEqual(['Open']);
    expect(sel.budgets.map((b) => b.budget.name)).toEqual(['On']);
  });

  it('prefers current-period budgets over future windows', () => {
    const current = mkBudget({ name: 'Current' });
    const future = mkBudget({ name: 'Future', startDate: '2026-10-01', endDate: '2026-10-31' });
    const sel = PlanningService.selectHomePlans([future, current], [], [], TODAY);
    expect(sel.budgets[0].budget.name).toBe('Current');
  });

  it('stays calm — no risk flag when everything is on track', () => {
    const budget = mkBudget();
    const goal = mkGoal({
      currentAmount: 600000,
      createdAt: '2026-06-01T00:00:00.000Z',
      targetDate: '2026-12-01',
    });
    // Mid-month, modest pace: 150k of 500k by day 15 projects to ~290k → UNDER_CONTROL.
    const sel = PlanningService.selectHomePlans([budget], [goal], [mkTx(150000, '2026-09-15')], '2026-09-15');
    expect(sel.hasRisk).toBe(false);
    expect(sel.budgets[0].risk).toBe('NONE');
    expect(sel.goals[0].risk).toBe('NONE');
  });

  it('returns empty selection when there is nothing to show', () => {
    const sel = PlanningService.selectHomePlans([], [], [], TODAY);
    expect(sel.budgets).toEqual([]);
    expect(sel.goals).toEqual([]);
    expect(sel.hasRisk).toBe(false);
  });
});
