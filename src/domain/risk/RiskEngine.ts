import { Account, CashFlowRisk, MoneyCommitment, SavingsGoal, TimelineDay, UserSettings } from '../../types';
import { DateUtils } from '../date/DateUtils';
import { MoneyValue } from '../money/MoneyValue';
import { t } from '../../i18n/core';

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
    const currency = settings.currency || accounts[0]?.currency || 'PHP';
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
          title: t('risk.overdraftTitle', { date: DateUtils.formatDisplayDate(day.date, { fullYear: true }) }),
          description: t('risk.overdraftBody', {
            amount: `-${deficitMoney.format()}`,
            date: DateUtils.formatDisplayDate(day.date),
          }),
          projectedBalance: projected,
          minimumReserve: minReserve,
          primaryCause,
          recommendedAction: t('risk.actionReschedule'),
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
          title: t('risk.reserveTitle', { date: DateUtils.formatDisplayDate(day.date, { fullYear: true }) }),
          description: t('risk.reserveBody', {
            balance: projectedMoney.format(),
            below: belowAmount.format(),
            reserve: reserveMoney.format(),
          }),
          projectedBalance: projected,
          minimumReserve: minReserve,
          primaryCause: majorOutflow ? `${majorOutflow.title} (${MoneyValue.fromMinorUnits(majorOutflow.amount, currency).format()})` : 'Cumulative outflows',
          recommendedAction: t('risk.actionLimit'),
        });
        break;
      }
    }

    // 2. Check for overdue OUTFLOW commitments — SAME currency only.
    // AUTO_POSTED bills already paid (their money left); overdue INFLOW is
    // covered by per-bill notifications instead of this owed-money total.
    const overdue = commitments.filter(
      (c) =>
        c.currency === currency &&
        c.direction !== 'INFLOW' &&
        c.dueDate < todayISO &&
        c.status !== 'COMPLETED' &&
        c.status !== 'CANCELLED' &&
        c.status !== 'AUTO_POSTED'
    );
    if (overdue.length > 0) {
      const overdueTotal = overdue.reduce((sum, c) => sum + c.amount, 0);
      const overdueMoney = MoneyValue.fromMinorUnits(overdueTotal, currency);

      risks.push({
        id: `risk-overdue-${todayISO}`,
        severity: 'HIGH',
        date: todayISO,
        title: t('risk.overdueTitle', { count: overdue.length }),
        description: t('risk.overdueBody', { count: overdue.length, amount: overdueMoney.format() }),
        projectedBalance: 0,
        minimumReserve: minReserve,
        primaryCause: overdue.map((o) => o.title).slice(0, 2).join(', '),
        recommendedAction: t('risk.actionMarkSettled'),
      });
    }

    return risks;
  }
}
