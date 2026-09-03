import {
  Account,
  Budget,
  Category,
  FinancialInsight,
  MoneyCommitment,
  SavingsGoal,
  Transaction,
  UserSettings,
} from '../../types';
import { DateUtils } from '../date/DateUtils';
import { MoneyValue } from '../money/MoneyValue';
import { BudgetEngine } from '../budget/BudgetEngine';
import { SafeToSpendEngine } from '../safe-to-spend/SafeToSpendEngine';
import { GoalEngine } from '../goal/GoalEngine';

export class InsightEngine {
  /**
   * Generates clear, easy-to-understand smart money tips.
   */
  public static generateInsights(
    accounts: Account[],
    transactions: Transaction[],
    budgets: Budget[],
    goals: SavingsGoal[],
    commitments: MoneyCommitment[],
    categories: Category[],
    settings: UserSettings,
    referenceDateISO?: string
  ): FinancialInsight[] {
    const todayISO = referenceDateISO || DateUtils.getTodayISO();
    const currency = settings.currency || accounts[0]?.currency || 'PHP';
    const insights: FinancialInsight[] = [];

    const currentMonthStart = DateUtils.getMonthStartISO(todayISO);
    const currentMonthEnd = DateUtils.getMonthEndISO(todayISO);
    const prevMonthDate = DateUtils.addMonthsISO(todayISO, -1);
    const prevMonthStart = DateUtils.getMonthStartISO(prevMonthDate);
    const prevMonthEnd = DateUtils.getMonthEndISO(prevMonthDate);

    const categoryMap = new Map<string, Category>(categories.map((c) => [c.id, c]));

    // 1. Month-over-Month Category Spending Shifts
    const currentCategoryExpenses = new Map<string, number>();
    const prevCategoryExpenses = new Map<string, number>();

    for (const tx of transactions) {
      if (tx.type !== 'EXPENSE' || tx.status === 'PENDING') continue;

      if (DateUtils.isDateInRange(tx.date, currentMonthStart, currentMonthEnd)) {
        const curr = currentCategoryExpenses.get(tx.categoryId) || 0;
        currentCategoryExpenses.set(tx.categoryId, curr + tx.amount);
      } else if (DateUtils.isDateInRange(tx.date, prevMonthStart, prevMonthEnd)) {
        const prev = prevCategoryExpenses.get(tx.categoryId) || 0;
        prevCategoryExpenses.set(tx.categoryId, prev + tx.amount);
      }
    }

    // Compare largest categories
    for (const [catId, currentAmount] of currentCategoryExpenses.entries()) {
      const prevAmount = prevCategoryExpenses.get(catId) || 0;
      const cat = categoryMap.get(catId);
      const catName = cat?.name || 'Expenses';

      if (prevAmount > 0) {
        const diff = currentAmount - prevAmount;
        const pctChange = Math.round((Math.abs(diff) / prevAmount) * 100);
        const diffMoney = MoneyValue.fromMinorUnits(Math.abs(diff), currency);

        if (diff < 0 && pctChange >= 10) {
          insights.push({
            id: `insight-cat-down-${catId}`,
            category: 'SPENDING',
            title: `${catName} spending is down ${pctChange}%`,
            fact: `You spent ${diffMoney.format()} less on ${catName} compared to last month.`,
            calculation: `${MoneyValue.fromMinorUnits(currentAmount, currency).format()} this month vs ${MoneyValue.fromMinorUnits(prevAmount, currency).format()} last month (${pctChange}% drop)`,
            interpretation: `Great job! You are spending less on ${catName}.`,
            severity: 'POSITIVE',
            score: 85,
            iconName: 'TrendingDown',
            createdAt: todayISO,
          });
        } else if (diff > 0 && pctChange >= 20) {
          insights.push({
            id: `insight-cat-up-${catId}`,
            category: 'SPENDING',
            title: `${catName} spending is up ${pctChange}%`,
            fact: `You spent ${diffMoney.format()} more on ${catName} than last month.`,
            calculation: `${MoneyValue.fromMinorUnits(currentAmount, currency).format()} this month vs ${MoneyValue.fromMinorUnits(prevAmount, currency).format()} last month (+${pctChange}%)`,
            interpretation: `Check your recent ${catName} purchases to keep your spending in check.`,
            severity: 'WARNING',
            score: 80,
            iconName: 'TrendingUp',
            createdAt: todayISO,
          });
        }
      }
    }

    // 2. Budget Health Insights
    for (const b of budgets) {
      if (!b.isActive) continue;
      const forecast = BudgetEngine.calculateBudgetForecast(b, transactions, todayISO);

      if (forecast.status === 'AT_RISK') {
        insights.push({
          id: `insight-budget-risk-${b.id}`,
          category: 'BUDGET',
          title: `${b.name} budget is close to limit`,
          fact: `You spent ${MoneyValue.fromMinorUnits(forecast.actualSpent, currency).format()} with ${forecast.remainingDays} days remaining.`,
          calculation: `At your current average of ${MoneyValue.fromMinorUnits(forecast.avgDailySpent, currency).format()} / day, you may spend ${MoneyValue.fromMinorUnits(forecast.projectedMonthEndSpent, currency).format()} vs your ${MoneyValue.fromMinorUnits(b.amount, currency).format()} limit.`,
          interpretation: `You might go over your ${b.name} budget by about ${MoneyValue.fromMinorUnits(Math.abs(forecast.projectedVariance), currency).format()}.`,
          severity: 'ALERT',
          score: 95,
          iconName: 'AlertTriangle',
          createdAt: todayISO,
        });
      } else if (forecast.status === 'UNDER_CONTROL' && forecast.elapsedDays >= 15) {
        insights.push({
          id: `insight-budget-good-${b.id}`,
          category: 'BUDGET',
          title: `${b.name} is well under budget`,
          fact: `You have only used ${forecast.percentageUsed}% of your budget halfway through the month.`,
          calculation: `${MoneyValue.fromMinorUnits(forecast.remainingAmount, currency).format()} left for the next ${forecast.remainingDays} days.`,
          interpretation: `You are doing great staying below your ${b.name} budget.`,
          severity: 'POSITIVE',
          score: 60,
          iconName: 'ShieldCheck',
          createdAt: todayISO,
        });
      }
    }

    // 3. Goal Progress Insights
    for (const g of goals) {
      if (g.isArchived) continue;
      const progress = GoalEngine.calculateGoalProgress(g, todayISO);

      if (progress.status === 'ON_TRACK' && progress.progressPercentage >= 50) {
        insights.push({
          id: `insight-goal-ontrack-${g.id}`,
          category: 'SAVINGS',
          title: `On track for ${g.name}`,
          fact: `You have saved ${progress.progressPercentage}% (${MoneyValue.fromMinorUnits(g.currentAmount, currency).format()}) toward your ${MoneyValue.fromMinorUnits(g.targetAmount, currency).format()} goal.`,
          calculation: `Saving ${MoneyValue.fromMinorUnits(progress.requiredMonthlySaving, currency).format()} each month will reach your goal on ${DateUtils.formatDisplayDate(g.targetDate, { fullYear: true })}.`,
          interpretation: 'You are making steady progress toward your savings goal!',
          severity: 'POSITIVE',
          score: 75,
          iconName: 'Target',
          createdAt: todayISO,
        });
      }
    }

    // 4. Safe-to-Spend Run-rate Insight
    const safeToSpend = SafeToSpendEngine.calculateSafeToSpend(accounts, commitments, goals, settings, todayISO);
    if (!safeToSpend.isDeficit && safeToSpend.dailySafeToSpend > 0) {
      insights.push({
        id: 'insight-safetospend-healthy',
        category: 'CASH_FLOW',
        title: `Safe to spend ${MoneyValue.fromMinorUnits(safeToSpend.dailySafeToSpend, currency).format()} / day`,
        fact: `You have ${MoneyValue.fromMinorUnits(safeToSpend.discretionaryPool, currency).format()} available for the next ${safeToSpend.remainingDaysInPeriod} days.`,
        calculation: `Total money minus upcoming bills (${MoneyValue.fromMinorUnits(safeToSpend.essentialUpcomingCommitments, currency).format()}), savings (${MoneyValue.fromMinorUnits(safeToSpend.reservedGoalContributions, currency).format()}), and emergency cushion (${MoneyValue.fromMinorUnits(safeToSpend.minimumReserve, currency).format()}).`,
        interpretation: 'Spending within this daily amount keeps all your upcoming bills and savings completely protected.',
        severity: 'NEUTRAL',
        score: 70,
        iconName: 'CheckCircle',
        createdAt: todayISO,
      });
    }

    // Sort by score descending (most important first)
    return insights.sort((a, b) => b.score - a.score);
  }
}
