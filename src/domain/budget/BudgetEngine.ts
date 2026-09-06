import { Budget, BudgetForecast, BudgetHealth, BudgetInsight, RiskLevel, Transaction } from '../../types';
import { DateUtils } from '../date/DateUtils';
import { MoneyValue } from '../money/MoneyValue';
import { TransactionEngine } from '../transaction/TransactionEngine';

export class BudgetEngine {
  /**
   * How much of a transaction counts against a budget's category scope.
   * Split expenses contribute per-part (a budget covering several split
   * categories counts each part once); normal expenses contribute in full.
   */
  private static attributedAmount(tx: Transaction, budget: Budget): number {
    const allocations = TransactionEngine.getCategoryAllocations(tx);
    if (allocations.size === 0) return 0;
    if (budget.categoryIds.length === 0) {
      // Whole-transaction budget: count the total once, not per category.
      return tx.amount;
    }
    let sum = 0;
    for (const [catId, amt] of allocations) {
      if (budget.categoryIds.includes(catId)) sum += amt;
    }
    return sum;
  }

  /**
   * Calculates actual spending and predictive run-rate forecast for a given budget.
   */
  public static calculateBudgetForecast(
    budget: Budget,
    transactions: Transaction[],
    referenceDateISO?: string
  ): BudgetForecast {
    const todayISO = referenceDateISO || DateUtils.getTodayISO();
    // Prefer the budget's own currency; never guess from row zero.
    const currency = budget.currency || transactions[0]?.currency || 'PHP';

    // Sum actual expenses within budget date range and matching category filter
    let actualSpent = 0;
    for (const tx of transactions) {
      if (tx.type !== 'EXPENSE' || tx.status === 'PENDING') continue;
      if (TransactionEngine.isGoalFunding(tx)) continue; // reservations are not budget spend
      if (!DateUtils.isDateInRange(tx.date, budget.startDate, budget.endDate)) continue;

      const attributed = this.attributedAmount(tx, budget);
      if (attributed > 0) {
        actualSpent += attributed;
      }
    }

    const totalDaysInPeriod = Math.max(1, DateUtils.daysBetween(budget.startDate, budget.endDate) + 1);
    
    // Calculate elapsed days clamped between 1 and totalDaysInPeriod
    const daysFromStart = Math.max(1, DateUtils.daysBetween(budget.startDate, todayISO) + 1);
    const elapsedDays = Math.min(totalDaysInPeriod, daysFromStart);
    
    // Remaining days from today to endDate
    const daysToEnd = Math.max(0, DateUtils.daysBetween(todayISO, budget.endDate));
    const remainingDays = Math.max(1, daysToEnd);

    // Rollover: when enabled, unused budget from the previous period carries forward.
    // We compute the immediately-preceding period of the same length and measure its
    // actual spend against its amount.
    let rolloverCarry = 0;
    if (budget.rolloverUnused) {
      rolloverCarry = BudgetEngine.calculateRolloverCarry(budget, transactions);
    }
    const effectiveBudget = budget.amount + rolloverCarry;
    const effectiveRemaining = effectiveBudget - actualSpent;
    const effectivePercentage = effectiveBudget > 0 ? (actualSpent / effectiveBudget) * 100 : 0;

    // Daily run-rate projection
    const avgDailySpent = Math.round(actualSpent / elapsedDays);
    const projectedRemainingSpent = Math.round(avgDailySpent * (remainingDays - 1));
    const projectedMonthEndSpent = actualSpent + projectedRemainingSpent;
    const projectedVariance = effectiveBudget - projectedMonthEndSpent;

    // Determine status — based on the EFFECTIVE budget (base + rollover carry).
    let status: BudgetHealth = 'UNDER_CONTROL';
    let explanation = '';

    const budgetMoney = MoneyValue.fromMinorUnits(effectiveBudget, currency);
    const spentMoney = MoneyValue.fromMinorUnits(actualSpent, currency);
    const projectedMoney = MoneyValue.fromMinorUnits(projectedMonthEndSpent, currency);
    const varianceMoney = MoneyValue.fromMinorUnits(Math.abs(projectedVariance), currency);

    if (actualSpent > effectiveBudget) {
      status = 'OVER_BUDGET';
      explanation = `Exceeded budget limit by ${MoneyValue.fromMinorUnits(actualSpent - effectiveBudget, currency).format()}. Total spent: ${spentMoney.format()} / ${budgetMoney.format()}.`;
    } else if (projectedMonthEndSpent > effectiveBudget) {
      status = 'AT_RISK';
      explanation = `At current pace (${MoneyValue.fromMinorUnits(avgDailySpent, currency).format()}/day), projected to exceed budget by ~${varianceMoney.format()}. Total projected: ${projectedMoney.format()}.`;
    } else if (effectivePercentage >= budget.notifyThresholdPercentage) {
      status = 'NEAR_LIMIT';
      explanation = `Spent ${effectivePercentage.toFixed(0)}% of budget (${spentMoney.format()} of ${budgetMoney.format()}).`;
    } else if (effectivePercentage >= 50) {
      status = 'ON_TRACK';
      explanation = `Spending is on track. Projected month-end: ${projectedMoney.format()} with ~${varianceMoney.format()} remaining buffer.`;
    } else {
      status = 'UNDER_CONTROL';
      explanation = `Comfortably within limit. ${MoneyValue.fromMinorUnits(effectiveRemaining, currency).format()} remaining.`;
    }

    return {
      budgetId: budget.id,
      budgetName: budget.name,
      budgetAmount: effectiveBudget,
      actualSpent,
      remainingAmount: effectiveRemaining,
      percentageUsed: Math.round(effectivePercentage),
      rolloverCarry,
      effectiveBudget,
      effectiveRemaining,
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
   * Computes unused budget carried forward from the immediately-preceding period of the
   * same length. Only expenses matching the budget's categories in that prior window count.
   * Never produces a negative carry (overspend does not subtract from the next period).
   */
  public static calculateRolloverCarry(budget: Budget, transactions: Transaction[]): number {
    const periodLengthDays = Math.max(1, DateUtils.daysBetween(budget.startDate, budget.endDate) + 1);
    const prevEnd = DateUtils.addDaysISO(budget.startDate, -1);
    const prevStart = DateUtils.addDaysISO(prevEnd, -(periodLengthDays - 1));

    let prevSpent = 0;
    for (const tx of transactions) {
      if (tx.type !== 'EXPENSE' || tx.status === 'PENDING') continue;
      if (budget.currency && tx.currency !== budget.currency) continue;
      if (!DateUtils.isDateInRange(tx.date, prevStart, prevEnd)) continue;
      const attributed = this.attributedAmount(tx, budget);
      if (attributed > 0) {
        prevSpent += attributed;
      }
    }

    const unused = budget.amount - prevSpent;
    return unused > 0 ? unused : 0;
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
    const currency = activeBudgets[0]?.currency || transactions[0]?.currency || 'PHP';

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

  /**
   * Wraps a budget forecast with risk detection + "is current" awareness, producing a
   * Home/Plans-friendly insight. Risk escalates from near-limit -> at-risk -> over-budget,
   * and a LOW risk is raised when the projected daily allowance is tight (<= buffer) with
   * meaningful remaining days.
   */
  public static getBudgetInsight(budget: Budget, transactions: Transaction[], referenceDateISO?: string): BudgetInsight {
    const todayISO = referenceDateISO || DateUtils.getTodayISO();
    const forecast = this.calculateBudgetForecast(budget, transactions, todayISO);

    const isCurrent = DateUtils.isDateInRange(todayISO, budget.startDate, budget.endDate) && budget.isActive;
    const isOverBudget = forecast.status === 'OVER_BUDGET';
    const isAtRisk = forecast.status === 'AT_RISK';
    const isNearLimit = forecast.status === 'NEAR_LIMIT';

    const projectedOverspend = forecast.projectedVariance < 0 ? Math.abs(forecast.projectedVariance) : 0;
    const daysLeft = forecast.remainingDays;
    const effectiveRemaining = forecast.effectiveRemaining ?? forecast.remainingAmount;
    const dailyAllowanceRemaining =
      daysLeft > 0 ? Math.round(effectiveRemaining / daysLeft) : 0;

    let risk: RiskLevel = 'NONE';
    if (isOverBudget) risk = 'HIGH';
    else if (isAtRisk) risk = 'MEDIUM';
    else if (isNearLimit) risk = 'LOW';

    return {
      budget,
      forecast,
      isCurrent,
      isOverBudget,
      isAtRisk,
      isNearLimit,
      risk,
      projectedOverspend,
      daysLeft,
      dailyAllowanceRemaining,
    };
  }
}
