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
  coercedAccounts: number;
}

const VALID_TX_TYPES = new Set(['INCOME', 'EXPENSE', 'TRANSFER']);
const VALID_TX_STATUS = new Set(['CONFIRMED', 'PENDING']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isMoney(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function sanitizeState(state: FinovaState): { state: FinovaState; report: SanitizeReport } {
  const report: SanitizeReport = {
    droppedTransactions: 0,
    droppedBudgets: 0,
    droppedGoals: 0,
    droppedCommitments: 0,
    droppedRecurring: 0,
    coercedAccounts: 0,
  };

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
      typeof t.date === 'string' &&
      DATE_RE.test(t.date);
    if (!ok) {
      report.droppedTransactions++;
      return false;
    }
    // Coerce soft fields in place (safe defaults, money untouched).
    if (!VALID_TX_STATUS.has(t.status as string)) t.status = 'CONFIRMED';
    if (!Number.isInteger(t.amount)) t.amount = Math.round(t.amount as number);
    if (t.tags !== undefined && !Array.isArray(t.tags)) t.tags = [];
    return true;
  });

  const moneyList = <T,>(
    rows: unknown,

    key: 'droppedBudgets' | 'droppedGoals' | 'droppedCommitments' | 'droppedRecurring',
    amountKeys: string[]
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
      return true;
    }) as T[];
  };

  const accounts = (Array.isArray(state.accounts) ? state.accounts : []).map((a) => {
    if (!isRecord(a) || typeof a.id !== 'string') {
      report.coercedAccounts++;
      return a;
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
    if (dirty) report.coercedAccounts++;
    return a;
  });

  const settings = { ...state.settings };
  if (!isMoney((settings as Record<string, unknown>).minimumReserve)) {
    (settings as Record<string, unknown>).minimumReserve = 0;
  }

  return {
    state: {
      ...state,
      accounts: accounts as FinovaState['accounts'],
      transactions: transactions as FinovaState['transactions'],
      budgets: moneyList(state.budgets, 'droppedBudgets', ['amount']),
      goals: moneyList(state.goals, 'droppedGoals', ['targetAmount', 'currentAmount']),
      commitments: moneyList(state.commitments, 'droppedCommitments', ['amount']),
      recurring: moneyList(state.recurring, 'droppedRecurring', ['amount']),
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
    report.coercedAccounts
  );
}
