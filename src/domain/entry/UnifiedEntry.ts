import {
  CurrencyCode,
  MoneyCommitment,
  RecurringFrequency,
  RecurringTransaction,
  TransactionType,
} from '../../types';
import { TransactionEngine } from '../transaction/TransactionEngine';
import { Account } from '../../types';

/**
 * Unified entry — one domain module behind the ADD sheet.
 *
 * Modes Expense/Income/Transfer produce an immediate transaction (money moves
 * now). Planned produces a PROJECTED commitment (no balance effect until it is
 * completed/converted). Repeat (Expense/Income only) additionally creates a
 * recurring rule; future occurrences derive via FutureFinanceEngine, so the
 * builder never fabricates manual commitments for them.
 *
 * All builders are pure: they validate and shape payloads, never mutate state.
 */

export type EntryMode = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'PLANNED';

export type RepeatOption = 'OFF' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

export const REPEAT_TO_FREQUENCY: Record<Exclude<RepeatOption, 'OFF'>, RecurringFrequency> = {
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY',
};

export interface PlannedEntryInput {
  title: string;
  amount: number;
  currency: CurrencyCode;
  categoryId: string;
  accountId: string;
  dueDate: string;
}

export interface RepeatEntryInput {
  title: string;
  amount: number;
  currency: CurrencyCode;
  type: TransactionType;
  categoryId: string;
  accountId: string;
  startDate: string;
  repeat: Exclude<RepeatOption, 'OFF'>;
}

export class UnifiedEntry {
  /**
   * A planned purchase is future intent: PROJECTED, OUTFLOW, no posting.
   * Completing it later goes through the commitment lifecycle (mark paid),
   * which is the single path that moves money.
   */
  public static buildPlannedPayload(input: PlannedEntryInput): Omit<MoneyCommitment, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      userId: 'user-1',
      title: input.title.trim(),
      type: 'PLANNED_EXPENSE',
      amount: input.amount,
      currency: input.currency,
      direction: 'OUTFLOW',
      status: 'PROJECTED',
      dueDate: input.dueDate,
      accountId: input.accountId,
      categoryId: input.categoryId,
      priority: 'ESSENTIAL',
    };
  }

  public static validatePlanned(input: PlannedEntryInput): string | null {
    if (!input.title.trim()) return 'Please add a title for this planned expense.';
    if (input.amount <= 0) return 'Please enter a valid amount.';
    if (!input.accountId) return 'Please select an account.';
    if (!input.dueDate) return 'Please pick the date you plan to buy this.';
    return null;
  }

  /**
   * A repeat switch creates a rule starting on `startDate`. The immediate
   * transaction (if any) is saved separately by the caller; this rule covers
   * all FUTURE occurrences via generated commitments.
   */
  public static buildRecurringPayload(input: RepeatEntryInput): Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      userId: 'user-1',
      title: input.title.trim(),
      amount: input.amount,
      currency: input.currency,
      type: input.type,
      categoryId: input.categoryId,
      accountId: input.accountId,
      frequency: REPEAT_TO_FREQUENCY[input.repeat],
      startDate: input.startDate,
      nextOccurrence: input.startDate,
      isActive: true,
      reminderEnabled: true,
    };
  }

  public static validateRepeat(input: RepeatEntryInput, accounts: Account[]): string | null {
    if (input.amount <= 0) return 'Please enter a valid amount.';
    if (!input.accountId) return 'Please select an account.';
    if (!input.startDate) return 'Please pick a start date.';
    if (input.type === 'TRANSFER') return 'Transfers cannot repeat.';
    return TransactionEngine.validateTransaction(
      { type: input.type, amount: input.amount, currency: input.currency, accountId: input.accountId },
      accounts
    );
  }
}
