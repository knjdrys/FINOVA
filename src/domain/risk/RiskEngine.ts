import { Account, CashFlowRisk, MoneyCommitment, RiskSeverity, SavingsGoal, TimelineDay, UserSettings } from '../../types';
import { DateUtils } from '../date/DateUtils';
import { MoneyValue } from '../money/MoneyValue';

export class RiskEngine {
  /**
   * Evaluates liquidity risks, reserve violations, and upcoming cash-flow crunches.
   */
  public static detectCashFlowRisks(
    accounts: Account[],
    timeline: TimelineDay[],
    commitments: MoneyCommitment[],
    _goals: SavingsGoal[],
    settings: UserSettings,
    referenceDateISO?: string
  ): CashFlowRisk[] {
    const todayISO = referenceDateISO || DateUtils.getTodayISO();
    const minReserve = settings.minimumReserve || 0;
    const currency = settings.currency || accounts[0]?.currency || 'PKR';
    const risks: CashFlowRisk[] = [];

    // 1. Scan timeline for negative balance or reserve breach
    for (const day of timeline) {
      if (day.date < todayISO) continue;

      const projected = day.projectedEndOfDayBalance;

      if (projected < 0) {
        const deficitMoney = MoneyValue.fromMinorUnits(Math.abs(projected), currency);
        // Find main cause on that day or preceding days
        const majorOutflows = day.events.filter((e) => e.direction === 'OUTFLOW');
        const primaryCause = majorOutflows[0]?.title || 'Multiple scheduled commitments';

        risks.push({
          id: `risk-neg-${day.date}`,
          severity: 'CRITICAL',
          date: day.date,
          title: `Projected Overdraft / Deficit on ${DateUtils.formatDisplayDate(day.date, { fullYear: true })}`,
          description: `Your balance is projected to reach -${deficitMoney.format()} on ${DateUtils.formatDisplayDate(day.date)}.`,
          projectedBalance: projected,
          minimumReserve: minReserve,
          primaryCause,
          recommendedAction: 'Reschedule optional payments or deposit funds before this date.',
        });
        break; // Report the earliest critical deficit
      } else if (minReserve > 0 && projected < minReserve) {
        const belowAmount = MoneyValue.fromMinorUnits(minReserve - projected, currency);
        const projectedMoney = MoneyValue.fromMinorUnits(projected, currency);
        const reserveMoney = MoneyValue.fromMinorUnits(minReserve, currency);
        const majorOutflow = day.events.find((e) => e.direction === 'OUTFLOW');

        risks.push({
          id: `risk-reserve-${day.date}`,
          severity: 'HIGH',
          date: day.date,
          title: `Reserve Violation on ${DateUtils.formatDisplayDate(day.date, { fullYear: true })}`,
          description: `Projected balance (${projectedMoney.format()}) will drop ${belowAmount.format()} below your ${reserveMoney.format()} minimum safety reserve.`,
          projectedBalance: projected,
          minimumReserve: minReserve,
          primaryCause: majorOutflow ? `${majorOutflow.title} (${MoneyValue.fromMinorUnits(majorOutflow.amount, currency).format()})` : 'Cumulative outflows',
          recommendedAction: 'Limit discretionary spending or adjust upcoming commitments.',
        });
        break;
      }
    }

    // 2. Check for overdue commitments
    const overdue = commitments.filter(
      (c) => c.dueDate < todayISO && c.status !== 'COMPLETED' && c.status !== 'CANCELLED'
    );
    if (overdue.length > 0) {
      const overdueTotal = overdue.reduce((sum, c) => sum + c.amount, 0);
      const overdueMoney = MoneyValue.fromMinorUnits(overdueTotal, currency);

      risks.push({
        id: `risk-overdue-${todayISO}`,
        severity: 'HIGH',
        date: todayISO,
        title: `${overdue.length} Overdue Bill${overdue.length > 1 ? 's' : ''}`,
        description: `You have ${overdue.length} pending obligations totaling ${overdueMoney.format()} that were due before today.`,
        projectedBalance: 0,
        minimumReserve: minReserve,
        primaryCause: overdue.map((o) => o.title).slice(0, 2).join(', '),
        recommendedAction: 'Mark settled commitments as completed to keep projections accurate.',
      });
    }

    return risks;
  }
}
