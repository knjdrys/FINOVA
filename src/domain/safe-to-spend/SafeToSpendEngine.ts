import { Account, MoneyCommitment, SafeToSpendResult, SavingsGoal, UserSettings } from '../../types';
import { DateUtils } from '../date/DateUtils';
import { MoneyValue } from '../money/MoneyValue';
import { GoalEngine } from '../goal/GoalEngine';

export class SafeToSpendEngine {
  /**
   * Calculates the authoritative, explainable Safe-to-Spend metrics.
   *
   * Formula:
   * Total Liquid Balance
   * - Essential Upcoming Outflows (due before cycle/period end)
   * - Reserved Goal Savings Contributions
   * - Configured Minimum Safety Reserve
   * = Available Discretionary Pool
   * / Remaining Days in Cycle (15-Day or Monthly)
   * = Daily Safe-to-Spend
   */
  public static calculateSafeToSpend(
    accounts: Account[],
    commitments: MoneyCommitment[],
    goals: SavingsGoal[],
    settings: UserSettings,
    referenceDateISO?: string
  ): SafeToSpendResult {
    const todayISO = referenceDateISO || DateUtils.getTodayISO();
    const currency = settings.currency || accounts[0]?.currency || 'PHP';
    const is15DayMode = settings.budgetCycleMode === 'SEMI_MONTHLY_15_DAYS';

    let periodEndDate = DateUtils.getMonthEndISO(todayISO);
    let remainingDays = DateUtils.getRemainingDaysInMonth(todayISO);
    let periodLabel = '';
    let cycleInfo: SafeToSpendResult['cycleInfo'];

    if (is15DayMode) {
      const cycle = DateUtils.get15DayCycle(todayISO, settings.semiMonthlyCutoffDay || 15);
      periodEndDate = cycle.endDate;
      remainingDays = cycle.remainingDays;
      periodLabel = `15-Day Cycle (${cycle.cycleLabel} — ${remainingDays} days left)`;
      cycleInfo = {
        cycleLabel: cycle.cycleLabel,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
      };
    } else {
      const periodMonthName = DateUtils.getMonthName(DateUtils.parseISO(todayISO).getMonth() + 1);
      periodLabel = `Through end of ${periodMonthName} (${remainingDays} days left)`;
    }

    // 1. Total available liquid balance — ISOLATED to the active currency.
    // Cross-currency money is never summed (e.g. PHP + USD must not be added).
    const liquidAccounts = accounts.filter((a) => a.includeInTotalBalance && !a.isArchived && a.currency === currency);
    const totalAvailableBalance = liquidAccounts.reduce((sum, a) => sum + a.currentBalance, 0);

    // 2. Essential outstanding commitments due on/before period end — SAME currency only.
    // OVERDUE bills count: past-due money is still owed, and excluding it
    // overstates safety. AUTO_POSTED bills do NOT count: their money already
    // left the balance above, so counting them would deduct twice.
    let essentialCommitments = 0;
    for (const c of commitments) {
      if (c.currency !== currency) continue; // never mix currencies
      if (c.direction !== 'OUTFLOW') continue;
      if (c.status === 'COMPLETED' || c.status === 'CANCELLED' || c.status === 'AUTO_POSTED') continue;
      if (c.priority !== 'ESSENTIAL' && c.priority !== 'IMPORTANT') continue;
      if (c.dueDate > periodEndDate) continue;
      essentialCommitments += c.amount;
    }

    // 3. Reserved goal contributions (pro-rated for 15-day cycle if active).
    // Only goals in the active currency reserve money from this currency's pool.
    const sameCurrencyGoals = goals.filter((g) => (g.currency || currency) === currency);
    const monthlyGoalCommitments = GoalEngine.calculateMonthlyGoalCommitments(sameCurrencyGoals, todayISO);
    let reservedGoalContributions = monthlyGoalCommitments.getMinorUnits();
    if (is15DayMode) {
      // Half-month goal allocation
      reservedGoalContributions = Math.round(reservedGoalContributions / 2);
    }

    // 4. Minimum reserve
    const minimumReserve = settings.minimumReserve || 0;

    // 5. Available discretionary pool
    const totalDeductions = essentialCommitments + reservedGoalContributions + minimumReserve;
    const discretionaryPool = totalAvailableBalance - totalDeductions;
    const isDeficit = discretionaryPool < 0;

    // 6. Safe to spend run-rate
    const dailySafeToSpend = isDeficit ? 0 : Math.round(discretionaryPool / remainingDays);
    const weeklySafeToSpend = Math.round(dailySafeToSpend * 7);

    const poolMoney = MoneyValue.fromMinorUnits(Math.abs(discretionaryPool), currency);
    const dailyMoney = MoneyValue.fromMinorUnits(dailySafeToSpend, currency);

    const steps = [
      {
        label: 'Total Liquid Balance',
        amount: totalAvailableBalance,
        isDeduction: false,
        description: `Sum of ${liquidAccounts.length} active liquid account(s)`,
      },
      {
        label: 'Upcoming Essential Bills & Commitments',
        amount: essentialCommitments,
        isDeduction: true,
        description: `Obligations due on/before ${DateUtils.formatDisplayDate(periodEndDate, { fullYear: true })} (including overdue)`,
      },
      {
        label: is15DayMode ? '15-Day Goal Savings Allocation' : 'Reserved Savings for Goals',
        amount: reservedGoalContributions,
        isDeduction: true,
        description: is15DayMode
          ? 'Pro-rated 15-day contribution to stay on track for goals'
          : 'Monthly allocations to stay on track for active savings goals',
      },
      {
        label: 'Emergency Minimum Reserve',
        amount: minimumReserve,
        isDeduction: true,
        description: 'Your configured untouchable baseline safety buffer',
      },
    ];

    const summary = isDeficit
      ? `You have a projected deficit of ${poolMoney.format()}. Prioritize essential commitments before discretionary spending.`
      : `You have ${poolMoney.format()} in discretionary funds for this ${
          is15DayMode ? '15-day payroll cycle' : 'month'
        }, allowing ${dailyMoney.format()} per day for the next ${remainingDays} days without risking bills or goals.`;

    return {
      totalAvailableBalance,
      essentialUpcomingCommitments: essentialCommitments,
      reservedGoalContributions,
      minimumReserve,
      discretionaryPool,
      remainingDaysInPeriod: remainingDays,
      dailySafeToSpend,
      weeklySafeToSpend,
      periodLabel,
      periodEndDate,
      isDeficit,
      is15DayCycle: is15DayMode,
      cycleInfo,
      explanation: {
        steps,
        summary,
      },
    };
  }
}
