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
import { TransactionEngine } from '../transaction/TransactionEngine';
import { GoalEngine } from '../goal/GoalEngine';
import { t, categoryName } from '../../i18n/core';

export class InsightEngine {
  /**
   * Generates clear, easy-to-understand smart money tips.
   * Strings are localized at generation time via i18n/core (no React needed).
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
      if (tx.currency !== currency) continue; // never mix currencies
      // Split-aware single source of truth (also excludes goal-fund reservations).
      const allocations = TransactionEngine.getCategoryAllocations(tx);

      if (DateUtils.isDateInRange(tx.date, currentMonthStart, currentMonthEnd)) {
        for (const [catId, amt] of allocations) {
          currentCategoryExpenses.set(catId, (currentCategoryExpenses.get(catId) || 0) + amt);
        }
      } else if (DateUtils.isDateInRange(tx.date, prevMonthStart, prevMonthEnd)) {
        for (const [catId, amt] of allocations) {
          prevCategoryExpenses.set(catId, (prevCategoryExpenses.get(catId) || 0) + amt);
        }
      }
    }

    // Compare largest categories
    for (const [catId, currentAmount] of currentCategoryExpenses.entries()) {
      const prevAmount = prevCategoryExpenses.get(catId) || 0;
      const cat = categoryMap.get(catId);
      const catName = categoryName(cat) || t('insights.expenses');

      if (prevAmount > 0) {
        const diff = currentAmount - prevAmount;
        const pctChange = Math.round((Math.abs(diff) / prevAmount) * 100);
        const diffMoney = MoneyValue.fromMinorUnits(Math.abs(diff), currency);

        if (diff < 0 && pctChange >= 10) {
          insights.push({
            id: `insight-cat-down-${catId}`,
            category: 'SPENDING',
            title: t('insights.catDownTitle', { cat: catName, pct: pctChange }),
            fact: t('insights.catDownFact', { amount: diffMoney.format(), cat: catName }),
            calculation: t('insights.catDownCalc', {
              current: MoneyValue.fromMinorUnits(currentAmount, currency).format(),
              previous: MoneyValue.fromMinorUnits(prevAmount, currency).format(),
              pct: pctChange,
            }),
            interpretation: t('insights.catDownInterp', { cat: catName }),
            severity: 'POSITIVE',
            score: 85,
            iconName: 'TrendingDown',
            createdAt: todayISO,
          });
        } else if (diff > 0 && pctChange >= 20) {
          insights.push({
            id: `insight-cat-up-${catId}`,
            category: 'SPENDING',
            title: t('insights.catUpTitle', { cat: catName, pct: pctChange }),
            fact: t('insights.catUpFact', { amount: diffMoney.format(), cat: catName }),
            calculation: t('insights.catUpCalc', {
              current: MoneyValue.fromMinorUnits(currentAmount, currency).format(),
              previous: MoneyValue.fromMinorUnits(prevAmount, currency).format(),
              pct: pctChange,
            }),
            interpretation: t('insights.catUpInterp', { cat: catName }),
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
          title: t('insights.budgetRiskTitle', { name: b.name }),
          fact: t('insights.budgetRiskFact', {
            spent: MoneyValue.fromMinorUnits(forecast.actualSpent, currency).format(),
            days: forecast.remainingDays,
          }),
          calculation: t('insights.budgetRiskCalc', {
            avg: MoneyValue.fromMinorUnits(forecast.avgDailySpent, currency).format(),
            projected: MoneyValue.fromMinorUnits(forecast.projectedMonthEndSpent, currency).format(),
            limit: MoneyValue.fromMinorUnits(b.amount, currency).format(),
          }),
          interpretation: t('insights.budgetRiskInterp', {
            name: b.name,
            variance: MoneyValue.fromMinorUnits(Math.abs(forecast.projectedVariance), currency).format(),
          }),
          severity: 'ALERT',
          score: 95,
          iconName: 'AlertTriangle',
          createdAt: todayISO,
        });
      } else if (forecast.status === 'UNDER_CONTROL' && forecast.elapsedDays >= 15) {
        insights.push({
          id: `insight-budget-good-${b.id}`,
          category: 'BUDGET',
          title: t('insights.budgetGoodTitle', { name: b.name }),
          fact: t('insights.budgetGoodFact', { pct: forecast.percentageUsed }),
          calculation: t('insights.budgetGoodCalc', {
            remaining: MoneyValue.fromMinorUnits(forecast.remainingAmount, currency).format(),
            days: forecast.remainingDays,
          }),
          interpretation: t('insights.budgetGoodInterp', { name: b.name }),
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
          title: t('insights.goalOnTrackTitle', { name: g.name }),
          fact: t('insights.goalOnTrackFact', {
            pct: progress.progressPercentage,
            saved: MoneyValue.fromMinorUnits(g.currentAmount, currency).format(),
            target: MoneyValue.fromMinorUnits(g.targetAmount, currency).format(),
          }),
          calculation: t('insights.goalOnTrackCalc', {
            monthly: MoneyValue.fromMinorUnits(progress.requiredMonthlySaving, currency).format(),
            date: DateUtils.formatDisplayDate(g.targetDate, { fullYear: true }),
          }),
          interpretation: t('insights.goalOnTrackInterp'),
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
        title: t('insights.safeTitle', {
          amount: MoneyValue.fromMinorUnits(safeToSpend.dailySafeToSpend, currency).format(),
        }),
        fact: t('insights.safeFact', {
          pool: MoneyValue.fromMinorUnits(safeToSpend.discretionaryPool, currency).format(),
          days: safeToSpend.remainingDaysInPeriod,
        }),
        calculation: t('insights.safeCalc', {
          bills: MoneyValue.fromMinorUnits(safeToSpend.essentialUpcomingCommitments, currency).format(),
          savings: MoneyValue.fromMinorUnits(safeToSpend.reservedGoalContributions, currency).format(),
          reserve: MoneyValue.fromMinorUnits(safeToSpend.minimumReserve, currency).format(),
        }),
        interpretation: t('insights.safeInterp'),
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
