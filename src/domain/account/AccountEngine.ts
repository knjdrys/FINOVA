import { Account, CurrencyCode, Transaction } from '../../types';
import { MoneyValue } from '../money/MoneyValue';

export class AccountEngine {
  /**
   * Calculates the total available liquid balance across all active, included accounts
   * of a SINGLE currency. Passing a currency prevents silent cross-currency summation
   * (e.g. PHP + USD must never be added together). When omitted, the first account's
   * currency is used (single-currency apps behave as before).
   */
  public static calculateTotalBalance(accounts: Account[], currency?: CurrencyCode): MoneyValue {
    const included = accounts.filter((acc) => acc.includeInTotalBalance && !acc.isArchived);
    const targetCurrency = currency || included[0]?.currency || 'PHP';
    const sumMinor = included
      .filter((acc) => acc.currency === targetCurrency)
      .reduce((sum, acc) => sum + acc.currentBalance, 0);
    return MoneyValue.fromMinorUnits(sumMinor, targetCurrency);
  }

  /**
   * Returns the liquid balance broken down per currency. Use this for multi-currency
   * surfaces so no two currencies are ever summed.
   */
  public static getTotalBalanceByCurrency(accounts: Account[]): Record<string, number> {
    const included = accounts.filter((acc) => acc.includeInTotalBalance && !acc.isArchived);
    const map: Record<string, number> = {};
    for (const acc of included) {
      map[acc.currency] = (map[acc.currency] || 0) + acc.currentBalance;
    }
    return map;
  }

  /**
   * Reconstructs authoritative account balances directly from transaction history (Audit Invariant).
   */
  public static calculateReconciledBalances(
    accounts: Account[],
    transactions: Transaction[]
  ): Map<string, number> {
    const balanceMap = new Map<string, number>();

    // Initialize with initial balances
    for (const acc of accounts) {
      balanceMap.set(acc.id, acc.initialBalance);
    }

    // Apply all confirmed transactions chronologically
    const sorted = [...transactions].sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return (a.time || '00:00').localeCompare(b.time || '00:00');
    });

    for (const tx of sorted) {
      if (tx.status === 'PENDING') continue;

      if (tx.type === 'INCOME') {
        const curr = balanceMap.get(tx.accountId) ?? 0;
        balanceMap.set(tx.accountId, curr + tx.amount);
      } else if (tx.type === 'EXPENSE') {
        const curr = balanceMap.get(tx.accountId) ?? 0;
        balanceMap.set(tx.accountId, curr - tx.amount);
      } else if (tx.type === 'TRANSFER') {
        const srcCurr = balanceMap.get(tx.accountId) ?? 0;
        balanceMap.set(tx.accountId, srcCurr - tx.amount);

        if (tx.destinationAccountId) {
          const destCurr = balanceMap.get(tx.destinationAccountId) ?? 0;
          balanceMap.set(tx.destinationAccountId, destCurr + tx.amount);
        }
      }
    }

    return balanceMap;
  }
}
