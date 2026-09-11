import {
  type CurrencyCode,
  type MoneyCommitment,
  type RecurringTransaction,
  type SavingsGoal,
  type Transaction,
} from '../../types';
import { DateUtils } from '../date/DateUtils';
import { TransactionEngine } from '../transaction/TransactionEngine';

/**
 * EmergencyFundEngine
 *
 * Turns the "Emergency Fund" savings goal from a bare named goal into an
 * explainable financial instrument:
 *
 * - Derives a clear, reliable "essential monthly expenses" figure from the
 *   user's OWN data (essential bills + essential recurring expenses first;
 *   otherwise their actual essential-category spend averaged over 6 months).
 * - Computes a recommended target (N months of essential expenses) and how
 *   many months the current fund would actually cover.
 *
 * Every number has a visible source — the UI shows whether the essential
 * figure comes from committed bills or real spending, so the user never
 * wonders "where did this target come from?".
 */

// Categories treated as essential living costs for the average-spend fallback.
const ESSENTIAL_CATEGORY_IDS = new Set([
  'cat-bills',
  'cat-groceries',
  'cat-health',
  'cat-transport',
  'cat-subscription',
]);

const DEFAULT_TARGET_MONTHS = 6;

export type EssentialSource = 'COMMITTED' | 'ACTUAL' | 'NONE';

export interface EssentialExpenseBreakdown {
  /** Monthly-normalized total of essential bills + essential recurring expenses. */
  committedMonthly: number;
  /** Average monthly essential-category spend over the last 6 months. */
  actualAvgMonthly: number;
  /** Which source drives the final essential monthly figure. */
  source: EssentialSource;
  /** Count of essential bills/recurring rules that contributed. */
  essentialBillCount: number;
  /** The final essential monthly figure (committed wins, else actual average). */
  essentialMonthly: number;
}

export interface EmergencyFundProjection {
  hasFund: boolean;
  currentEF: number;
  essentialMonthly: number;
  targetMonths: number;
  recommendedTarget: number;
  /** currentEF / essentialMonthly (0 when essentialMonthly is 0). */
  monthsCovered: number;
  /** currentEF / recommendedTarget, capped at 100. */
  progressPct: number;
  shortfall: number;
  breakdown: EssentialExpenseBreakdown;
}

function toMonthlyEquivalent(amount: number, frequency: string | undefined): number {
  switch (frequency) {
    case 'DAILY':
      return amount * 30;
    case 'WEEKLY':
      return (amount * 52) / 12;
    case 'BIWEEKLY':
      return (amount * 26) / 12;
    case 'YEARLY':
      return amount / 12;
    case 'MONTHLY':
    default:
      return amount;
  }
}

export class EmergencyFundEngine {
  /**
   * Derives essential monthly expenses from a clear, reliable source.
   * Priority: user-authored essential bills/recurring first; otherwise the
   * average of real essential-category spending over the last 6 months.
   *
   * Currency: sources are filtered to `currency` (a USD bill must never
   * inflate a PHP cushion). Recurring rules without a currency predate the
   * currency field and are treated as base-currency rather than dropped.
   * Pending and bookkeeping rows (goal funding, adjustments) are not real
   * spending and never contribute. All outputs are integer minor units.
   */
  static deriveEssentialMonthlyExpenses(args: {
    commitments: MoneyCommitment[];
    recurring: RecurringTransaction[];
    transactions: Transaction[];
    currency?: CurrencyCode;
    referenceDateISO?: string;
  }): EssentialExpenseBreakdown {
    const todayISO = args.referenceDateISO || DateUtils.getTodayISO();
    const sixMonthsAgo = DateUtils.addMonthsISO(todayISO, -6);
    const currency = args.currency;

    let committedMonthly = 0;
    let essentialBillCount = 0;

    for (const c of args.commitments) {
      if (c.priority === 'ESSENTIAL' && c.direction !== 'INFLOW' && c.status !== 'CANCELLED') {
        if (currency && c.currency !== currency) continue;
        // Manual commitments are the app's "Bills" — treated as monthly obligations.
        committedMonthly += c.amount;
        essentialBillCount++;
      }
    }
    for (const r of args.recurring) {
      if (r.isActive && r.type !== 'INCOME' && r.priority === 'ESSENTIAL') {
        if (currency && r.currency && r.currency !== currency) continue;
        committedMonthly += toMonthlyEquivalent(r.amount, r.frequency);
        essentialBillCount++;
      }
    }
    committedMonthly = Math.round(committedMonthly);

    let actualAvgMonthly = 0;
    const essentialTx = args.transactions.filter(
      (t) =>
        t.type === 'EXPENSE' &&
        t.status !== 'PENDING' &&
        (!currency || t.currency === currency) &&
        ESSENTIAL_CATEGORY_IDS.has(t.categoryId) &&
        !TransactionEngine.isBookkeeping(t) &&
        t.date >= sixMonthsAgo &&
        t.date <= todayISO,
    );
    if (essentialTx.length > 0) {
      const total = essentialTx.reduce((sum, t) => sum + t.amount, 0);
      // Window is fixed at 6 months, so dividing by 6 is the 6-month average.
      actualAvgMonthly = Math.round(total / 6);
    }

    let source: EssentialSource = 'NONE';
    let essentialMonthly = 0;
    if (committedMonthly > 0) {
      essentialMonthly = committedMonthly;
      source = 'COMMITTED';
    } else if (actualAvgMonthly > 0) {
      essentialMonthly = actualAvgMonthly;
      source = 'ACTUAL';
    }

    return { committedMonthly, actualAvgMonthly, source, essentialBillCount, essentialMonthly };
  }

  /**
   * Full emergency-fund projection. `goal` is the user's Emergency Fund savings
   * goal (if they created one). Everything is derived — no hardcoded targets.
   */
  static project(args: {
    goal?: SavingsGoal;
    commitments: MoneyCommitment[];
    recurring: RecurringTransaction[];
    transactions: Transaction[];
    targetMonths?: number;
    currency?: CurrencyCode;
    referenceDateISO?: string;
  }): EmergencyFundProjection {
    const targetMonths = args.targetMonths ?? DEFAULT_TARGET_MONTHS;
    const breakdown = EmergencyFundEngine.deriveEssentialMonthlyExpenses({
      commitments: args.commitments,
      recurring: args.recurring,
      transactions: args.transactions,
      currency: args.currency,
      referenceDateISO: args.referenceDateISO,
    });

    const currentEF = args.goal?.currentAmount ?? 0;
    const essentialMonthly = breakdown.essentialMonthly;
    const recommendedTarget = Math.round(essentialMonthly * targetMonths);
    const monthsCovered = essentialMonthly > 0 ? currentEF / essentialMonthly : 0;
    const progressPct = recommendedTarget > 0 ? Math.min(100, (currentEF / recommendedTarget) * 100) : 0;
    const shortfall = Math.max(0, recommendedTarget - currentEF);

    return {
      hasFund: Boolean(args.goal),
      currentEF,
      essentialMonthly,
      targetMonths,
      recommendedTarget,
      monthsCovered,
      progressPct,
      shortfall,
      breakdown,
    };
  }
}
