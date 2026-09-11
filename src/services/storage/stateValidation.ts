import type { FinovaState } from './FinovaStorage';

/**
 * Row-level sanitization for persisted state.
 *
 * loadState and backup-restore used to trust every row's shape: a single
 * hand-edited or corrupted row (string amount, missing date, NaN balance)
 * poisoned arithmetic app-wide (NaN balances) or crashed render paths. The
 * sanitizer runs on every load/restore:
 *  - transactions/budgets/goals/commitments/recurring with invalid money or
 *    dates are DROPPED (a corrupt row must never brick the ledger);
 *  - accounts are load-bearing (dropping one orphans its history), so invalid
 *    balances are COERCED to 0 instead — the app stays usable and the user
 *    reconciles the difference through the normal audited flow;
 *  - unknown enum values are coerced to safe defaults (status → CONFIRMED).
 *
 * Returns the cleaned state plus counts so callers can report honestly.
 */

export interface SanitizeReport {
  droppedTransactions: number;
  droppedBudgets: number;
  droppedGoals: number;
  droppedCommitments: number;
  droppedRecurring: number;
  droppedCategories: number;
  droppedAccounts: number;
  coercedAccounts: number;
  /** Stale PENDING rows auto-confirmed (bank settlement window passed). */
  settledPending: number;
}

const VALID_TX_TYPES = new Set(['INCOME', 'EXPENSE', 'TRANSFER']);
const VALID_TX_STATUS = new Set(['CONFIRMED', 'PENDING', 'CLEARED']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDateStr(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isMoney(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function sanitizeState(
  state: FinovaState,
  todayISO?: string
): { state: FinovaState; report: SanitizeReport } {
  const report: SanitizeReport = {
    droppedTransactions: 0,
    droppedBudgets: 0,
    droppedGoals: 0,
    droppedCommitments: 0,
    droppedRecurring: 0,
    droppedCategories: 0,
    droppedAccounts: 0,
    coercedAccounts: 0,
    settledPending: 0,
  };
  // Bank authorizations settle in 1-5 business days; a PENDING row older than
  // 7 days is confirmed money the CSV just never updated. Zero-padded ISO
  // dates compare lexicographically, so a plain string cutoff is exact.
  const today = todayISO && isRealDateStr(todayISO) ? todayISO : new Date().toISOString().slice(0, 10);
  const cutoff = new Date(today + 'T00:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const settleBefore = cutoff.toISOString().slice(0, 10);

  const transactions = (Array.isArray(state.transactions) ? state.transactions : []).filter((t) => {
    if (!isRecord(t)) {
      report.droppedTransactions++;
      return false;
    }
    const ok =
      typeof t.id === 'string' &&
      VALID_TX_TYPES.has(t.type as string) &&
      isMoney(t.amount) &&
      typeof t.accountId === 'string' &&
      isRealDateStr(t.date);
    if (!ok) {
      report.droppedTransactions++;
      return false;
    }
    // Coerce soft fields in place (safe defaults, money untouched).
    if (!VALID_TX_STATUS.has(t.status as string)) t.status = 'CONFIRMED';
    // Auto-settle stale bank pendings: analytics exclude PENDING but balances
    // include it, so an unsettled-forever row understates spend while the
    // balance disagrees. Status-only flip — balances are untouched.
    if (t.status === 'PENDING' && (t.date as string) < settleBefore) {
      t.status = 'CONFIRMED';
      report.settledPending++;
    }
    if (!Number.isInteger(t.amount)) t.amount = Math.round(t.amount as number);
    if (t.tags !== undefined && !Array.isArray(t.tags)) t.tags = [];
    return true;
  });

  const VALID_FREQUENCY = new Set(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY']);
  const VALID_DIRECTION = new Set(['INFLOW', 'OUTFLOW']);

  const moneyList = <T,>(
    rows: unknown,

    key: 'droppedBudgets' | 'droppedGoals' | 'droppedCommitments' | 'droppedRecurring',
    amountKeys: string[],
    dateKeys: string[] = [],
    optionalDateKeys: string[] = [],
    enumKeys: Record<string, Set<string>> = {}
  ): T[] => {
    if (!Array.isArray(rows)) return [];
    return rows.filter((r) => {
      if (!isRecord(r) || typeof r.id !== 'string') {
        report[key]++;
        return false;
      }
      for (const k of amountKeys) {
        if (r[k] !== undefined && !isMoney(r[k])) {
          report[key]++;
          return false;
        }
      }
      // Required dates must be real calendar dates: garbage due/target dates
      // poison every engine that string-compares or diffs them.
      for (const k of dateKeys) {
        if (!isRealDateStr(r[k])) {
          report[key]++;
          return false;
        }
      }
      for (const k of optionalDateKeys) {
        if (r[k] !== undefined && r[k] !== null && !isRealDateStr(r[k])) {
          report[key]++;
          return false;
        }
      }
      for (const [k, allowed] of Object.entries(enumKeys)) {
        if (!allowed.has(r[k] as string)) {
          report[key]++;
          return false;
        }
      }
      return true;
    }) as T[];
  };

  const accounts = (Array.isArray(state.accounts) ? state.accounts : []).filter((a) => {
    if (!isRecord(a) || typeof a.id !== 'string') {
      report.droppedAccounts++;
      return false;
    }
    let dirty = false;
    if (!isMoney(a.initialBalance)) {
      a.initialBalance = 0;
      dirty = true;
    }
    if (!isMoney(a.currentBalance)) {
      a.currentBalance = 0;
      dirty = true;
    }
    if (Number.isInteger(a.initialBalance) === false && isMoney(a.initialBalance)) {
      a.initialBalance = Math.round(a.initialBalance as number);
      dirty = true;
    }
    if (Number.isInteger(a.currentBalance) === false && isMoney(a.currentBalance)) {
      a.currentBalance = Math.round(a.currentBalance as number);
      dirty = true;
    }
    if (dirty) report.coercedAccounts++;
    return true;
  });

  const categories = (Array.isArray(state.categories) ? state.categories : []).filter((c) => {
    if (!isRecord(c) || typeof c.id !== 'string') {
      report.droppedCategories++;
      return false;
    }
    return true;
  });

  const readNotificationIds = Array.isArray(state.readNotificationIds) ? state.readNotificationIds : [];

  const settings = { ...state.settings };
  if (!isMoney((settings as Record<string, unknown>).minimumReserve)) {
    (settings as Record<string, unknown>).minimumReserve = 0;
  }

  return {
    state: {
      ...state,
      accounts: accounts as FinovaState['accounts'],
      transactions: transactions as FinovaState['transactions'],
      budgets: moneyList(state.budgets, 'droppedBudgets', ['amount'], ['startDate', 'endDate']),
      goals: moneyList(state.goals, 'droppedGoals', ['targetAmount', 'currentAmount'], ['targetDate']),
      commitments: moneyList(state.commitments, 'droppedCommitments', ['amount'], ['dueDate'], [], {
        direction: VALID_DIRECTION,
      }).map((c) => {
        // Soft enums coerce (an outstanding bill stays outstanding and visible).
        const rec = c as unknown as Record<string, unknown>;
        const validStatus = ['PROJECTED', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'OVERDUE', 'CANCELLED', 'AUTO_POSTED'];
        if (!validStatus.includes(rec.status as string)) rec.status = 'PROJECTED';
        const validType = [
          'BILL', 'SUBSCRIPTION', 'RECURRING_EXPENSE', 'RECURRING_INCOME',
          'SAVINGS_CONTRIBUTION', 'DEBT_PAYMENT', 'PLANNED_EXPENSE', 'EXPECTED_INCOME', 'CUSTOM',
        ];
        if (!validType.includes(rec.type as string)) {
          rec.type = rec.direction === 'INFLOW' ? 'EXPECTED_INCOME' : 'BILL';
        }
        return c;
      }),
      recurring: moneyList(
        state.recurring,
        'droppedRecurring',
        ['amount'],
        ['startDate'],
        ['nextOccurrence', 'endDate'],
        { frequency: VALID_FREQUENCY }
      ),
      categories: categories as FinovaState['categories'],
      readNotificationIds,
      settings,
    } as FinovaState,
    report,
  };
}

export function totalDropped(report: SanitizeReport): number {
  return (
    report.droppedTransactions +
    report.droppedBudgets +
    report.droppedGoals +
    report.droppedCommitments +
    report.droppedRecurring +
    report.droppedCategories +
    report.droppedAccounts +
    report.coercedAccounts
  );
}
