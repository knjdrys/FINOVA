import { GoalProgress, GoalStatus, SavingsGoal } from '../../types';
import { DateUtils } from '../date/DateUtils';
import { MoneyValue } from '../money/MoneyValue';

export class GoalEngine {
  /**
   * Calculates detailed savings goal progress, timelines, and required savings velocity.
   */
  public static calculateGoalProgress(goal: SavingsGoal, referenceDateISO?: string): GoalProgress {
    const todayISO = referenceDateISO || DateUtils.getTodayISO();
    const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
    const progressPercentage = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;

    const daysRemaining = Math.max(1, DateUtils.daysBetween(todayISO, goal.targetDate));
    const weeksRemaining = Math.max(1, daysRemaining / 7);
    const monthsRemaining = Math.max(1, daysRemaining / 30.4375);

    const requiredDailySaving = Math.round(remainingAmount / daysRemaining);
    const requiredWeeklySaving = Math.round(remainingAmount / weeksRemaining);
    const requiredMonthlySaving = Math.round(remainingAmount / monthsRemaining);

    // Calculate elapsed time from goal creation to target date
    const totalGoalDays = Math.max(1, DateUtils.daysBetween(goal.createdAt.substring(0, 10), goal.targetDate));
    const elapsedDays = Math.max(1, DateUtils.daysBetween(goal.createdAt.substring(0, 10), todayISO));
    const expectedProgressPct = (elapsedDays / totalGoalDays) * 100;

    let status: GoalStatus = 'ON_TRACK';
    let isOnTrack = true;
    let explanation = '';

    if (goal.currentAmount >= goal.targetAmount) {
      status = 'COMPLETED';
      isOnTrack = true;
      explanation = 'Goal target achieved! 🎉';
    } else if (progressPercentage >= expectedProgressPct) {
      status = 'ON_TRACK';
      isOnTrack = true;
      explanation = `Ahead of schedule! Saving ${MoneyValue.fromMinorUnits(requiredMonthlySaving).format()}/month will complete by ${DateUtils.formatDisplayDate(goal.targetDate, { fullYear: true })}.`;
    } else if (progressPercentage >= expectedProgressPct * 0.75) {
      status = 'SLIGHTLY_BEHIND';
      isOnTrack = false;
      explanation = `Slightly behind schedule (${progressPercentage.toFixed(0)}% vs ${expectedProgressPct.toFixed(0)}% expected). Need ${MoneyValue.fromMinorUnits(requiredWeeklySaving).format()}/week to catch up.`;
    } else {
      status = 'AT_RISK';
      isOnTrack = false;
      explanation = `At risk. Requires ${MoneyValue.fromMinorUnits(requiredMonthlySaving).format()}/month across ${Math.ceil(monthsRemaining)} months remaining.`;
    }

    return {
      goalId: goal.id,
      goalName: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      remainingAmount,
      progressPercentage: Math.min(100, Math.round(progressPercentage)),
      daysRemaining,
      requiredDailySaving,
      requiredWeeklySaving,
      requiredMonthlySaving,
      status,
      isOnTrack,
      explanation,
    };
  }

  /**
   * Aggregates total reserved goal contributions across all active goals for Safe-to-Spend allocation.
   */
  public static calculateMonthlyGoalCommitments(goals: SavingsGoal[], referenceDateISO?: string): MoneyValue {
    const activeGoals = goals.filter((g) => !g.isArchived && g.currentAmount < g.targetAmount);
    let totalMonthlyRequired = 0;

    for (const goal of activeGoals) {
      const progress = this.calculateGoalProgress(goal, referenceDateISO);
      totalMonthlyRequired += progress.requiredMonthlySaving;
    }

    return MoneyValue.fromMinorUnits(totalMonthlyRequired);
  }
}
