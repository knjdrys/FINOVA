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
    const prevMonthDate = DateUtils.addMonthsISO(todayISO, -1);
    const prevMonthStart = DateUtils.getMonthStartISO(prevMonthDate);
    const prevMonthEnd = DateUtils.getMonthEndISO(prevMonthDate);
    // Like-for-like window: comparing 5 elapsed days against a full 31-day
    // month manufactures fake "down 85%" praise every month-start. Compare
    // this month through today vs last month through the same day instead.
    const elapsedDays = DateUtils.parseISO(todayISO).getDate(); // 1..31
    const likeForLikeEnd = DateUtils.addDaysISO(prevMonthStart, elapsedDays - 1);
    const prevWindowEnd = likeForLikeEnd > prevMonthEnd ? prevMonthEnd : likeForLikeEnd;
    // Anything under ~100 in the display currency is noise, not a trend.
    const DUST_FLOOR_MINOR = 100 * 100;

    const categoryMap = new Map<string, Category>(categories.map((c) => [c.id, c]));

    // 1. Month-over-Month Category Spending Shifts
    const currentCategoryExpenses = new Map<string, number>();
    const prevCategoryExpenses = new Map<string, number>();

    for (const tx of transactions) {
      if (tx.type !== 'EXPENSE' || tx.status === 'PENDING') continue;
      if (tx.currency !== currency) continue; // never mix currencies
      // Split-aware single source of truth (also excludes goal-fund reservations).
      const allocations = TransactionEngine.getCategoryAllocations(tx);

      if (DateUtils.isDateInRange(tx.date, currentMonthStart, todayISO)) {
        for (const [catId, amt] of allocations) {
          currentCategoryExpenses.set(catId, (currentCategoryExpenses.get(catId) || 0) + amt);
        }
      } else if (DateUtils.isDateInRange(tx.date, prevMonthStart, prevWindowEnd)) {
        for (const [catId, amt] of allocations) {
          prevCategoryExpenses.set(catId, (prevCategoryExpenses.get(catId) || 0) + amt);
        }
      }
    }

    // Compare largest categories
    for (const [catId, currentAmount] of currentCategoryExpenses.entries()) {
      const prevAmount = prevCategoryExpenses.get(catId) || 0;
      if (Math.max(currentAmount, prevAmount) < DUST_FLOOR_MINOR) continue;
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
      // The forecast is computed in the budget's own currency — formatting it
      // in the global currency mislabels every multi-currency budget.
      const bc = b.currency || currency;

      if (forecast.status === 'AT_RISK' || forecast.status === 'OVER_BUDGET') {
        const isOver = forecast.status === 'OVER_BUDGET';
        insights.push({
          id: `insight-budget-risk-${b.id}`,
          category: 'BUDGET',
          title: isOver
            ? t('insights.budgetOverTitle', { name: b.name })
            : t('insights.budgetRiskTitle', { name: b.name }),
          fact: t('insights.budgetRiskFact', {
            spent: MoneyValue.fromMinorUnits(forecast.actualSpent, bc).format(),
            days: forecast.remainingDays,
          }),
          calculation: t('insights.budgetRiskCalc', {
            avg: MoneyValue.fromMinorUnits(forecast.avgDailySpent, bc).format(),
            projected: MoneyValue.fromMinorUnits(forecast.projectedMonthEndSpent, bc).format(),
            limit: MoneyValue.fromMinorUnits(forecast.effectiveBudget ?? b.amount, bc).format(),
          }),
          interpretation: t('insights.budgetRiskInterp', {
            name: b.name,
            variance: MoneyValue.fromMinorUnits(Math.abs(forecast.projectedVariance), bc).format(),
          }),
          severity: 'ALERT',
          score: isOver ? 98 : 95,
          iconName: 'AlertTriangle',
          createdAt: todayISO,
        });
      } else if (forecast.status === 'UNDER_CONTROL' && forecast.elapsedDays >= 15) {
        insights.push({
          id: `insight-budget-good-${b.id}`,
          category: 'BUDGET',
          title: t('insights.budgetGoodTitle', { name: b.name }),
          fact: t('insights.budgetGoodFact', { pct: forecast.percentageUsed, days: forecast.remainingDays }),
          calculation: t('insights.budgetGoodCalc', {
            remaining: MoneyValue.fromMinorUnits(forecast.remainingAmount, bc).format(),
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

      // Goals carry their own currency — never relabel them with the global one.
      const gc = g.currency || currency;
      if (progress.status === 'ON_TRACK' && progress.progressPercentage >= 50) {
        insights.push({
          id: `insight-goal-ontrack-${g.id}`,
          category: 'SAVINGS',
          title: t('insights.goalOnTrackTitle', { name: g.name }),
          fact: t('insights.goalOnTrackFact', {
            pct: progress.progressPercentage,
            saved: MoneyValue.fromMinorUnits(g.currentAmount, gc).format(),
            target: MoneyValue.fromMinorUnits(g.targetAmount, gc).format(),
          }),
          calculation: t('insights.goalOnTrackCalc', {
            monthly: MoneyValue.fromMinorUnits(progress.requiredMonthlySaving, gc).format(),
            date: DateUtils.formatDisplayDate(g.targetDate, { fullYear: true }),
          }),
          interpretation: t('insights.goalOnTrackInterp'),
          severity: 'POSITIVE',
          score: 75,
          iconName: 'Target',
          createdAt: todayISO,
        });
      } else if (progress.status === 'SLIGHTLY_BEHIND' || progress.status === 'AT_RISK') {
        // A struggling goal used to stay silent while healthy ones got praised.
        const critical = progress.status === 'AT_RISK';
        insights.push({
          id: `insight-goal-behind-${g.id}`,
          category: 'SAVINGS',
          title: t('insights.goalBehindTitle', { name: g.name }),
          fact: t('insights.goalBehindFact', {
            pct: Math.round(progress.progressPercentage),
            saved: MoneyValue.fromMinorUnits(g.currentAmount, gc).format(),
            target: MoneyValue.fromMinorUnits(g.targetAmount, gc).format(),
          }),
          calculation: t('insights.goalBehindCalc', {
            monthly: MoneyValue.fromMinorUnits(progress.requiredMonthlySaving, gc).format(),
            date: DateUtils.formatDisplayDate(g.targetDate, { fullYear: true }),
          }),
          interpretation: t('insights.goalBehindInterp'),
          severity: critical ? 'ALERT' : 'WARNING',
          score: critical ? 96 : 88,
          iconName: 'Target',
          createdAt: todayISO,
        });
      }
    }

    // 4. Safe-to-Spend Run-rate Insight
    const safeToSpend = SafeToSpendEngine.calculateSafeToSpend(accounts, commitments, goals, settings, todayISO);
    if (safeToSpend.isDeficit) {
      // A deficit is the single most urgent cash-flow state — it used to
      // produce no insight at all while healthy days got a card.
      const shortfall = Math.max(
        0,
        safeToSpend.essentialUpcomingCommitments +
          safeToSpend.reservedGoalContributions +
          safeToSpend.minimumReserve -
          safeToSpend.totalAvailableBalance
      );
      insights.push({
        id: 'insight-safetospend-deficit',
        category: 'CASH_FLOW',
        title: t('insights.safeDeficitTitle'),
        fact: t('insights.safeDeficitFact', {
          shortfall: MoneyValue.fromMinorUnits(shortfall, currency).format(),
        }),
        calculation: t('insights.safeDeficitCalc', {
          bills: MoneyValue.fromMinorUnits(safeToSpend.essentialUpcomingCommitments, currency).format(),
          savings: MoneyValue.fromMinorUnits(safeToSpend.reservedGoalContributions, currency).format(),
          reserve: MoneyValue.fromMinorUnits(safeToSpend.minimumReserve, currency).format(),
          balance: MoneyValue.fromMinorUnits(safeToSpend.totalAvailableBalance, currency).format(),
        }),
        interpretation: t('insights.safeDeficitInterp'),
        severity: 'ALERT',
        score: 100,
        iconName: 'AlertOctagon',
        createdAt: todayISO,
      });
    } else if (!safeToSpend.isDeficit && safeToSpend.dailySafeToSpend > 0) {
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

    // Foreign-currency accounts are silently excluded from the spending-limit
    // pool (pools never mix currencies) — say so, or users wonder where their
    // money went. FYI rank: below actionable items, above silence.
    const fxExcluded = accounts.filter(
      (a) => a.includeInTotalBalance && !a.isArchived && a.currency !== currency
    );
    if (fxExcluded.length > 0) {
      const names = fxExcluded.map((a) => a.name).join(', ');
      const excluded = [...new Set(fxExcluded.map((a) => a.currency))].join(', ');
      insights.push({
        id: 'insight-fx-excluded',
        category: 'CASH_FLOW',
        title: t('insights.fxExcludedTitle'),
        fact: t('insights.fxExcludedFact', { names }),
        calculation: t('insights.fxExcludedCalc', { currency, excluded }),
        interpretation: t('insights.fxExcludedInterp', { currency }),
        severity: 'NEUTRAL',
        score: 60,
        iconName: 'Globe',
        createdAt: todayISO,
      });
    }

    // Sort by score descending (most important first)
    return insights.sort((a, b) => b.score - a.score);
  }
}

export interface MonthlyCashFlow {
  /** First day of the month (ISO) — the stable bucket key. */
  monthStartISO: string;
  /** 0-based month index for localized labels. */
  monthIndex0: number;
  year: number;
  income: number;
  expense: number;
  net: number;
  /** True when the bucket holds any economic activity. */
  hasActivity: boolean;
}

/**
 * Monthly income-vs-expense buckets, oldest → newest, ending with the month
 * that contains `referenceDateISO`. Bookkeeping rows (goal funding,
 * reconciliations) and transfers are excluded: the trend must show real
 * money earned vs. really spent. Single-currency like every other analytic.
 */
export function getMonthlyCashFlow(
  transactions: Transaction[],
  currency: string,
  referenceDateISO: string,
  months: number = 6
): MonthlyCashFlow[] {
  const buckets: MonthlyCashFlow[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const anchor = DateUtils.addMonthsISO(referenceDateISO, -i);
    const start = DateUtils.getMonthStartISO(anchor);
    const d = new Date(`${start}T00:00:00`);
    buckets.push({
      monthStartISO: start,
      monthIndex0: d.getMonth(),
      year: d.getFullYear(),
      income: 0,
      expense: 0,
      net: 0,
      hasActivity: false,
    });
  }
  const byStart = new Map(buckets.map((b) => [b.monthStartISO, b]));
  for (const tx of transactions) {
    if (tx.status === 'PENDING') continue;
    if (tx.currency !== currency) continue;
    if (TransactionEngine.isBookkeeping(tx)) continue;
    if (tx.type !== 'INCOME' && tx.type !== 'EXPENSE') continue;
    if (tx.date > referenceDateISO) continue; // current bar is spent-so-far, matching the breakdown
    const bucket = byStart.get(DateUtils.getMonthStartISO(tx.date));
    if (!bucket) continue;
    if (tx.type === 'INCOME') bucket.income += tx.amount;
    else bucket.expense += tx.amount;
  }
  for (const b of buckets) {
    b.net = b.income - b.expense;
    b.hasActivity = b.income > 0 || b.expense > 0;
  }
  return buckets;
}
