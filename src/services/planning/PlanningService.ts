import { BudgetEngine } from '../../domain/budget/BudgetEngine';
import { GoalEngine } from '../../domain/goal/GoalEngine';
import { Budget, BudgetInsight, GoalInsight, RiskLevel, SavingsGoal, Transaction } from '../../types';

/**
 * PlanningService — decides WHICH budgets/goals deserve Home attention.
 *
 * Home must stay calm: we surface at most `budgetSlots` + `goalSlots` items,
 * ranked by urgency (risk first, then deadline proximity, then magnitude).
 * Everything else lives in the Plans tab (progressive disclosure).
 */

const RISK_WEIGHT: Record<RiskLevel, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };

export interface HomePlanSelection {
  budgets: BudgetInsight[];
  goals: GoalInsight[];
  /** True when at least one surfaced item carries real risk (drives the section header tone). */
  hasRisk: boolean;
}

export class PlanningService {
  static readonly BUDGET_SLOTS = 2;
  static readonly GOAL_SLOTS = 2;

  /**
   * Selects the most relevant budget/goal insights for the Home screen.
   * - Budgets: active ones only; current-period first, then by risk, days left, % used.
   * - Goals: non-archived, not completed; by risk, days remaining, priority.
   * When nothing is at risk we still show the nearest-deadline items so the section
   * stays useful without becoming noisy.
   */
  static selectHomePlans(
    budgets: Budget[],
    goals: SavingsGoal[],
    transactions: Transaction[],
    referenceDateISO?: string,
    budgetSlots: number = PlanningService.BUDGET_SLOTS,
    goalSlots: number = PlanningService.GOAL_SLOTS
  ): HomePlanSelection {
    const activeBudgets = budgets.filter((b) => b.isActive);
    const budgetInsights = activeBudgets.map((b) =>
      BudgetEngine.getBudgetInsight(b, transactions, referenceDateISO)
    );

    budgetInsights.sort((a, b) => {
      // Current-period budgets outrank past/future windows.
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      const byRisk = RISK_WEIGHT[b.risk] - RISK_WEIGHT[a.risk];
      if (byRisk !== 0) return byRisk;
      if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
      return b.forecast.percentageUsed - a.forecast.percentageUsed;
    });

    const openGoals = goals.filter((g) => !g.isArchived && g.currentAmount < g.targetAmount);
    const goalInsights = openGoals.map((g) => GoalEngine.getGoalInsight(g, referenceDateISO));

    const priorityWeight = (p: SavingsGoal['priority']) =>
      p === 'ESSENTIAL' ? 2 : p === 'IMPORTANT' ? 1 : 0;

    goalInsights.sort((a, b) => {
      const byRisk = RISK_WEIGHT[b.risk] - RISK_WEIGHT[a.risk];
      if (byRisk !== 0) return byRisk;
      const byDays = a.progress.daysRemaining - b.progress.daysRemaining;
      if (byDays !== 0) return byDays;
      return priorityWeight(b.goal.priority) - priorityWeight(a.goal.priority);
    });

    const topBudgets = budgetInsights.slice(0, budgetSlots);
    const topGoals = goalInsights.slice(0, goalSlots);

    const hasRisk =
      topBudgets.some((i) => i.risk !== 'NONE') || topGoals.some((i) => i.risk !== 'NONE');

    return { budgets: topBudgets, goals: topGoals, hasRisk };
  }
}
