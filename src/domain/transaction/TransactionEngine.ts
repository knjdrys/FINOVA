import { Account, Transaction, TransactionType } from '../../types';
import { MoneyValue } from '../money/MoneyValue';
import { DateUtils } from '../date/DateUtils';

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
   * Aggregates total income, total expense, and net cash flow for a date period.
   * Transfer transactions are strictly excluded from income and expense aggregates (FINOVA Invariant #4 & #10).
   */
  public static calculatePeriodTotals(
    transactions: Transaction[],
    startDate: string,
    endDate: string
  ): {
    totalIncome: MoneyValue;
    totalExpense: MoneyValue;
    netCashFlow: MoneyValue;
    transactionCount: number;
  } {
    let incomeSum = 0;
    let expenseSum = 0;
    let count = 0;
    const currency = transactions[0]?.currency || 'PKR';

    for (const tx of transactions) {
      if (tx.status === 'PENDING') continue;
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

      // Category filter
      if (filters.categoryId && tx.categoryId !== filters.categoryId) {
        return false;
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
