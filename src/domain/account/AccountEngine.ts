import { Account, Transaction } from '../../types';
import { MoneyValue } from '../money/MoneyValue';

export class AccountEngine {
  /**
   * Calculates the total available liquid balance across all active, included accounts.
   */
  public static calculateTotalBalance(accounts: Account[]): MoneyValue {
    const included = accounts.filter((acc) => acc.includeInTotalBalance && !acc.isArchived);
    const sumMinor = included.reduce((sum, acc) => sum + acc.currentBalance, 0);
    const currency = accounts[0]?.currency || 'PKR';
    return MoneyValue.fromMinorUnits(sumMinor, currency);
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
