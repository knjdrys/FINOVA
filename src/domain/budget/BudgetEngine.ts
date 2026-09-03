import { Budget, BudgetForecast, BudgetHealth, Transaction } from '../../types';
import { DateUtils } from '../date/DateUtils';
import { MoneyValue } from '../money/MoneyValue';

export class BudgetEngine {
  /**
   * Calculates actual spending and predictive run-rate forecast for a given budget.
   */
  public static calculateBudgetForecast(
    budget: Budget,
    transactions: Transaction[],
    referenceDateISO?: string
  ): BudgetForecast {
    const todayISO = referenceDateISO || DateUtils.getTodayISO();
    const currency = transactions[0]?.currency || 'PKR';

    // Sum actual expenses within budget date range and matching category filter
    let actualSpent = 0;
    for (const tx of transactions) {
      if (tx.type !== 'EXPENSE' || tx.status === 'PENDING') continue;
      if (!DateUtils.isDateInRange(tx.date, budget.startDate, budget.endDate)) continue;

      if (budget.categoryIds.length === 0 || budget.categoryIds.includes(tx.categoryId)) {
        actualSpent += tx.amount;
      }
    }

    const totalDaysInPeriod = Math.max(1, DateUtils.daysBetween(budget.startDate, budget.endDate) + 1);
    
    // Calculate elapsed days clamped between 1 and totalDaysInPeriod
    const daysFromStart = Math.max(1, DateUtils.daysBetween(budget.startDate, todayISO) + 1);
    const elapsedDays = Math.min(totalDaysInPeriod, daysFromStart);
    
    // Remaining days from today to endDate
    const daysToEnd = Math.max(0, DateUtils.daysBetween(todayISO, budget.endDate));
    const remainingDays = Math.max(1, daysToEnd);

    const remainingAmount = budget.amount - actualSpent;
    const percentageUsed = budget.amount > 0 ? (actualSpent / budget.amount) * 100 : 0;

    // Daily run-rate projection
    const avgDailySpent = Math.round(actualSpent / elapsedDays);
    const projectedRemainingSpent = Math.round(avgDailySpent * (remainingDays - 1));
    const projectedMonthEndSpent = actualSpent + projectedRemainingSpent;
    const projectedVariance = budget.amount - projectedMonthEndSpent;

    // Determine status
    let status: BudgetHealth = 'UNDER_CONTROL';
    let explanation = '';

    const budgetMoney = MoneyValue.fromMinorUnits(budget.amount, currency);
    const spentMoney = MoneyValue.fromMinorUnits(actualSpent, currency);
    const projectedMoney = MoneyValue.fromMinorUnits(projectedMonthEndSpent, currency);
    const varianceMoney = MoneyValue.fromMinorUnits(Math.abs(projectedVariance), currency);

    if (actualSpent > budget.amount) {
      status = 'OVER_BUDGET';
      explanation = `Exceeded budget limit by ${MoneyValue.fromMinorUnits(actualSpent - budget.amount, currency).format()}. Total spent: ${spentMoney.format()} / ${budgetMoney.format()}.`;
    } else if (projectedMonthEndSpent > budget.amount) {
      status = 'AT_RISK';
      explanation = `At current pace (${MoneyValue.fromMinorUnits(avgDailySpent, currency).format()}/day), projected to exceed budget by ~${varianceMoney.format()}. Total projected: ${projectedMoney.format()}.`;
    } else if (percentageUsed >= budget.notifyThresholdPercentage) {
      status = 'NEAR_LIMIT';
      explanation = `Spent ${percentageUsed.toFixed(0)}% of budget (${spentMoney.format()} of ${budgetMoney.format()}).`;
    } else if (percentageUsed >= 50) {
      status = 'ON_TRACK';
      explanation = `Spending is on track. Projected month-end: ${projectedMoney.format()} with ~${varianceMoney.format()} remaining buffer.`;
    } else {
      status = 'UNDER_CONTROL';
      explanation = `Comfortably within limit. ${MoneyValue.fromMinorUnits(remainingAmount, currency).format()} remaining.`;
    }

    return {
      budgetId: budget.id,
      budgetName: budget.name,
      budgetAmount: budget.amount,
      actualSpent,
      remainingAmount,
      percentageUsed: Math.round(percentageUsed),
      elapsedDays,
      remainingDays,
      totalDaysInPeriod,
      avgDailySpent,
      projectedRemainingSpent,
      projectedMonthEndSpent,
      projectedVariance,
      status,
      explanation,
    };
  }

  /**
   * Calculates overall status across all active budgets.
   */
  public static calculateAllBudgetsSummary(
    budgets: Budget[],
    transactions: Transaction[],
    referenceDateISO?: string
  ): {
    totalBudgeted: MoneyValue;
    totalActualSpent: MoneyValue;
    totalProjectedSpent: MoneyValue;
    overallStatus: BudgetHealth;
    forecasts: BudgetForecast[];
  } {
    const activeBudgets = budgets.filter((b) => b.isActive);
    const forecasts = activeBudgets.map((b) => this.calculateBudgetForecast(b, transactions, referenceDateISO));
    const currency = transactions[0]?.currency || 'PKR';

    const totalBudgetedMinor = forecasts.reduce((sum, f) => sum + f.budgetAmount, 0);
    const totalActualSpentMinor = forecasts.reduce((sum, f) => sum + f.actualSpent, 0);
    const totalProjectedSpentMinor = forecasts.reduce((sum, f) => sum + f.projectedMonthEndSpent, 0);

    let overallStatus: BudgetHealth = 'UNDER_CONTROL';
    if (forecasts.some((f) => f.status === 'OVER_BUDGET')) {
      overallStatus = 'OVER_BUDGET';
    } else if (forecasts.some((f) => f.status === 'AT_RISK')) {
      overallStatus = 'AT_RISK';
    } else if (forecasts.some((f) => f.status === 'NEAR_LIMIT')) {
      overallStatus = 'NEAR_LIMIT';
    } else if (forecasts.some((f) => f.status === 'ON_TRACK')) {
      overallStatus = 'ON_TRACK';
    }

    return {
      totalBudgeted: MoneyValue.fromMinorUnits(totalBudgetedMinor, currency),
      totalActualSpent: MoneyValue.fromMinorUnits(totalActualSpentMinor, currency),
      totalProjectedSpent: MoneyValue.fromMinorUnits(totalProjectedSpentMinor, currency),
      overallStatus,
      forecasts,
    };
  }
}
