import { Account, CurrencyCode, CURRENCY_CONFIGS, SplitPart, Transaction, TransactionType } from '../../types';
import { MoneyValue } from '../money/MoneyValue';
import { DateUtils } from '../date/DateUtils';
import { t } from '../../i18n/core';

export interface TransactionFilterOptions {
  searchQuery?: string;
  type?: TransactionType | 'ALL';
  categoryId?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: 'NEWEST' | 'OLDEST' | 'HIGHEST_AMOUNT' | 'LOWEST_AMOUNT';
}

export class TransactionEngine {
  /**
   * Goal-funding marker. A contribution is a reservation (account → goal
   * progress), never spending: it must not inflate period totals, budget
   * spend, or category analytics — even though unlinked goals record it as
   * an EXPENSE row (linked goals use a true TRANSFER instead).
   */
  public static isGoalFunding(tx: Pick<Transaction, 'tags'>): boolean {
    return Boolean(tx.tags && tx.tags.includes('goal-fund'));
  }

  /**
   * Reconciliation marker. When the real-world balance drifts from the books
   * (missed cash, bank fees posted late), the correction is recorded as an
   * ordinary INCOME/EXPENSE row tagged `adjustment` — so every money-direction
   * and edit/delete law still holds — but it is bookkeeping, not economic
   * activity, and must not inflate spending, earnings, or budget analytics.
   */
  public static isBalanceAdjustment(tx: Pick<Transaction, 'tags'>): boolean {
    return Boolean(tx.tags && tx.tags.includes('adjustment'));
  }

  /**
   * Goal-withdrawal marker. The exact reverse of a goal-funding reservation
   * (goal progress → account): internal plumbing, never income.
   */
  public static isGoalWithdrawal(tx: Pick<Transaction, 'tags'>): boolean {
    return Boolean(tx.tags && tx.tags.includes('goal-withdraw'));
  }

  /** True for any internal booking row (goal reservations, goal withdrawals, reconciliations). */
  public static isBookkeeping(tx: Pick<Transaction, 'tags'>): boolean {
    return this.isGoalFunding(tx) || this.isGoalWithdrawal(tx) || this.isBalanceAdjustment(tx);
  }

  /**
   * Single source of truth for category attribution.
   * A split expense contributes to each of its categories by the allocated amount;
   * a normal expense contributes its full amount to its single category.
   * Bookkeeping rows (goal-funding reservations, balance adjustments) contribute
   * to NO category — they are not spending.
   * Budgets, Insights, and any future consumer MUST use this instead of reading
   * tx.categoryId directly, so split money is never double-counted or lost.
   */
  public static getCategoryAllocations(tx: Transaction): Map<string, number> {
    const map = new Map<string, number>();
    if (tx.type !== 'EXPENSE') return map;
    if (this.isBookkeeping(tx)) return map;
    if (tx.splitParts && tx.splitParts.length > 0) {
      for (const part of tx.splitParts) {
        if (part.amount > 0) {
          map.set(part.categoryId, (map.get(part.categoryId) || 0) + part.amount);
        }
      }
    } else if (tx.amount > 0) {
      map.set(tx.categoryId, tx.amount);
    }
    return map;
  }

  /**
   * Validates split allocations against the parent amount.
   * Returns null when valid (or when not a split), or a human-readable reason.
   */
  public static validateSplitParts(amount: number, splitParts: SplitPart[] | undefined, currency: CurrencyCode = 'PHP'): string | null {
    if (!splitParts || splitParts.length === 0) return null;
    if (splitParts.length < 2) return t('engine.splitMinTwo');
    if (splitParts.some((p) => !p.categoryId)) return t('engine.splitCategory');
    if (splitParts.some((p) => !Number.isFinite(p.amount) || !Number.isInteger(p.amount))) return t('engine.splitZero');
    if (splitParts.some((p) => p.amount <= 0)) return t('engine.splitZero');
    const sum = splitParts.reduce((s, p) => s + p.amount, 0);
    if (sum !== amount) {
      const mult = CURRENCY_CONFIGS[currency]?.minorUnitMultiplier ?? 100;
      const diffMoney = MoneyValue.fromMinorUnits(Math.abs(amount - sum), currency);
      const diffStr = diffMoney.format({ includeSymbol: false, forceDecimals: mult > 1 });
      return sum < amount
        ? t('engine.splitUnassigned', { amount: diffStr })
        : t('engine.splitExceed', { amount: diffStr });
    }
    return null;
  }

  /**
   * Applies the financial mutation of a newly created transaction to accounts.
   * Atomic and immutable: returns a new accounts array.
   */
  public static applyTransactionToAccounts(tx: Transaction, accounts: Account[]): Account[] {
    return accounts.map((acc) => {
      let balance = acc.currentBalance;

      if (acc.id === tx.accountId) {
        if (tx.type === 'INCOME') {
          balance += tx.amount;
        } else if (tx.type === 'EXPENSE' || tx.type === 'TRANSFER') {
          balance -= tx.amount;
        }
      }

      if (tx.type === 'TRANSFER' && tx.destinationAccountId && acc.id === tx.destinationAccountId) {
        balance += tx.amount;
      }

      return {
        ...acc,
        currentBalance: balance,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Reverses the financial effect of a transaction (e.g. before deletion or editing).
   */
  public static reverseTransactionFromAccounts(tx: Transaction, accounts: Account[]): Account[] {
    return accounts.map((acc) => {
      let balance = acc.currentBalance;

      if (acc.id === tx.accountId) {
        if (tx.type === 'INCOME') {
          balance -= tx.amount;
        } else if (tx.type === 'EXPENSE' || tx.type === 'TRANSFER') {
          balance += tx.amount;
        }
      }

      if (tx.type === 'TRANSFER' && tx.destinationAccountId && acc.id === tx.destinationAccountId) {
        balance -= tx.amount;
      }

      return {
        ...acc,
        currentBalance: balance,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Updates an existing transaction by reversing the old effect and applying the new effect atomically.
   */
  public static updateTransactionInAccounts(
    oldTx: Transaction,
    newTx: Transaction,
    accounts: Account[]
  ): Account[] {
    const reversed = this.reverseTransactionFromAccounts(oldTx, accounts);
    return this.applyTransactionToAccounts(newTx, reversed);
  }

  /**
   * Pre-flight validation for a prospective transaction mutation.
   * Guards the financial core:
   *  - EXPENSE/TRANSFER must not drive the source account below zero (no negative balances).
   *  - TRANSFER source and destination must share the same currency (no silent FX drift).
   * Returns null when valid, or a human-readable reason when rejected.
   */
  public static validateTransaction(
    tx: Pick<Transaction, 'type' | 'amount' | 'currency' | 'accountId' | 'destinationAccountId'>,
    accounts: Account[]
  ): string | null {
    if (tx.amount <= 0) return t('engine.amountPositive');

    const source = accounts.find((a) => a.id === tx.accountId);
    if (!source) return t('engine.sourceMissing');

    if (tx.type === 'EXPENSE' || tx.type === 'TRANSFER') {
      if (source.currentBalance - tx.amount < 0) {
        return t('engine.overdraw');
      }
    }

    if (tx.type === 'TRANSFER') {
      if (!tx.destinationAccountId) return t('engine.destRequired');
      if (tx.destinationAccountId === tx.accountId) return t('engine.destSame');
      const dest = accounts.find((a) => a.id === tx.destinationAccountId);
      if (!dest) return t('engine.destMissing');
      if (dest.currency !== source.currency) {
        return t('engine.crossCurrency');
      }
    }

    return null;
  }

  /**
   * Aggregates total income, total expense, and net cash flow for a date period.
   * Transfer transactions are strictly excluded from income and expense aggregates (FINOVA Invariant #4 & #10).
   */
  public static calculatePeriodTotals(
    transactions: Transaction[],
    startDate: string,
    endDate: string,
    currencyFallback: CurrencyCode = 'PHP',
    currencyFilter?: CurrencyCode
  ): {
    totalIncome: MoneyValue;
    totalExpense: MoneyValue;
    netCashFlow: MoneyValue;
    transactionCount: number;
  } {
    let incomeSum = 0;
    let expenseSum = 0;
    let count = 0;
    // Never guess from row zero: an empty period must still format in the
    // user's currency (previously fell back to PKR for everyone).
    const currency = transactions[0]?.currency || currencyFallback;

    for (const tx of transactions) {
      if (tx.status === 'PENDING') continue;
      if (TransactionEngine.isBookkeeping(tx)) continue; // reservations, withdrawals, adjustments are not economic activity
      if (currencyFilter && tx.currency !== currencyFilter) continue; // never mix currencies
      if (!DateUtils.isDateInRange(tx.date, startDate, endDate)) continue;

      if (tx.type === 'INCOME') {
        incomeSum += tx.amount;
        count++;
      } else if (tx.type === 'EXPENSE') {
        expenseSum += tx.amount;
        count++;
      }
      // TRANSFER is intentionally ignored for income/expense
    }

    const totalIncome = MoneyValue.fromMinorUnits(incomeSum, currency);
    const totalExpense = MoneyValue.fromMinorUnits(expenseSum, currency);
    const netCashFlow = totalIncome.subtract(totalExpense);

    return {
      totalIncome,
      totalExpense,
      netCashFlow,
      transactionCount: count,
    };
  }

  /**
   * Filters and sorts transactions according to query criteria.
   */
  public static filterTransactions(
    transactions: Transaction[],
    filters: TransactionFilterOptions
  ): Transaction[] {
    let result = transactions.filter((tx) => {
      // Type filter
      if (filters.type && filters.type !== 'ALL' && tx.type !== filters.type) {
        return false;
      }

      // Category filter — expenses match via allocations (a split matches when any part does);
      // income/transfers fall back to their single category.
      if (filters.categoryId) {
        const allocations = this.getCategoryAllocations(tx);
        if (allocations.size > 0) {
          if (!allocations.has(filters.categoryId)) return false;
        } else if (tx.categoryId !== filters.categoryId) {
          return false;
        }
      }

      // Account filter (matches either source or destination)
      if (filters.accountId && tx.accountId !== filters.accountId && tx.destinationAccountId !== filters.accountId) {
        return false;
      }

      // Date range filter
      if (filters.startDate && tx.date < filters.startDate) {
        return false;
      }
      if (filters.endDate && tx.date > filters.endDate) {
        return false;
      }

      // Amount filter
      if (filters.minAmount !== undefined && tx.amount < filters.minAmount) {
        return false;
      }
      if (filters.maxAmount !== undefined && tx.amount > filters.maxAmount) {
        return false;
      }

      // Search query (matches merchant, note, tags)
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase().trim();
        const merchantMatch = tx.merchant?.toLowerCase().includes(query) ?? false;
        const noteMatch = tx.note?.toLowerCase().includes(query) ?? false;
        const tagMatch = tx.tags?.some((t) => t.toLowerCase().includes(query)) ?? false;
        if (!merchantMatch && !noteMatch && !tagMatch) {
          return false;
        }
      }

      return true;
    });

    // Sort
    const sortBy = filters.sortBy || 'NEWEST';
    result.sort((a, b) => {
      if (sortBy === 'NEWEST') {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        return (b.time || '00:00').localeCompare(a.time || '00:00');
      }
      if (sortBy === 'OLDEST') {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return (a.time || '00:00').localeCompare(b.time || '00:00');
      }
      if (sortBy === 'HIGHEST_AMOUNT') {
        return b.amount - a.amount;
      }
      if (sortBy === 'LOWEST_AMOUNT') {
        return a.amount - b.amount;
      }
      return 0;
    });

    return result;
  }
}
