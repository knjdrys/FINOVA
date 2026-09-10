import { CurrencyCode, Transaction } from '../../types';
import { DateUtils } from '../date/DateUtils';
import { TransactionEngine } from '../transaction/TransactionEngine';

/**
 * Income-vs-expense trend over the last N months.
 *
 * The same accounting rules as every other aggregate apply:
 * - PENDING rows never count (money not confirmed)
 * - foreign-currency rows never count (no fake FX conversions)
 * - `goal-withdraw` income rows never count (saved money moving home, not income)
 * - `goal-fund` expense rows never count (savings reservations, not spending)
 * - the CURRENT month is always flagged partial — a trend chart that pretends
 *   an in-progress month is complete is lying
 */

export interface TrendPoint {
  /** ISO month label, e.g. '2026-08'. */
  monthLabel: string;
  incomeMinor: number;
  expenseMinor: number;
  /** False only for the in-progress (current) month. */
  complete: boolean;
}

export function buildCashFlowTrend(
  transactions: Transaction[],
  currency: CurrencyCode,
  months = 6
): TrendPoint[] {
  const now = new Date();
  const points: TrendPoint[] = [];

  for (let offset = months - 1; offset >= 0; offset--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const label = DateUtils.formatISO(ref).slice(0, 7);
    const startISO = `${label}-01`;
    const endISO = DateUtils.getMonthEndISO(startISO);

    let incomeMinor = 0;
    let expenseMinor = 0;
    for (const tx of transactions) {
      if (tx.status === 'PENDING') continue;
      if (tx.currency !== currency) continue;
      if (!DateUtils.isDateInRange(tx.date, startISO, endISO)) continue;
      if (tx.type === 'INCOME') {
        if (TransactionEngine.isGoalWithdrawal(tx)) continue;
        incomeMinor += tx.amount;
      } else if (tx.type === 'EXPENSE') {
        if (TransactionEngine.isGoalFunding(tx)) continue;
        expenseMinor += tx.amount;
      }
    }

    points.push({ monthLabel: label, incomeMinor, expenseMinor, complete: offset > 0 });
  }

  return points;
}

/** True when the trend deserves a chart at all (Phase 12: never fake data). */
export function hasTrendData(points: TrendPoint[]): boolean {
  return points.filter((p) => p.complete).some((p) => p.incomeMinor > 0 || p.expenseMinor > 0);
}
