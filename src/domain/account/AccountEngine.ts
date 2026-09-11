import { Account, CurrencyCode, MoneyCommitment, RecurringTransaction, Transaction } from '../../types';
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

  /**
   * Archive rule (delete-with-history safety).
   *
   * Hard-deleting an account that owns transactions orphans them: balances
   * drop but spend history stays, breaking every total. So accounts WITH
   * history are archived instead — excluded from totals/Safe-to-Spend/
   * pickers (every engine already filters `isArchived`) while history
   * stays intact. Linked automation is settled so nothing can post into
   * an archived account: pending commitments are CANCELLED (kept as
   * history), active recurring rules are PAUSED (resumable — resume rolls
   * forward, never dumps a backlog).
   *
   * Pure: returns the next slices, mutates nothing.
   */
  /**
   * A commitment still "points at" its account while it can act: terminal
   * rows (COMPLETED/CANCELLED/AUTO_POSTED) are history and don't block a
   * hard delete; everything else does.
   */
  public static isLiveCommitment(c: MoneyCommitment): boolean {
    return c.status !== 'COMPLETED' && c.status !== 'CANCELLED' && c.status !== 'AUTO_POSTED';
  }

  /**
   * True when a non-terminal commitment or an active recurring rule names
   * the account. The delete handler archives (never hard-deletes) such
   * accounts: hard-deleting would orphan the bill/rule on a dead accountId.
   */
  public static hasLiveLinks(
    commitments: MoneyCommitment[],
    recurring: RecurringTransaction[],
    accountId: string
  ): boolean {
    return (
      commitments.some((c) => c.accountId === accountId && AccountEngine.isLiveCommitment(c)) ||
      recurring.some((r) => r.accountId === accountId && r.isActive)
    );
  }

  public static archiveAccount(
    accounts: Account[],
    commitments: MoneyCommitment[],
    recurring: RecurringTransaction[],
    accountId: string,
    nowISO: string
  ): { accounts: Account[]; commitments: MoneyCommitment[]; recurring: RecurringTransaction[] } {
    return {
      accounts: accounts.map((a) =>
        a.id === accountId ? { ...a, isArchived: true, updatedAt: nowISO } : a
      ),
      commitments: commitments.map((c) =>
        c.accountId === accountId && AccountEngine.isLiveCommitment(c)
          ? { ...c, status: 'CANCELLED' as const, updatedAt: nowISO }
          : c
      ),
      recurring: recurring.map((r) =>
        r.accountId === accountId && r.isActive ? { ...r, isActive: false, updatedAt: nowISO } : r
      ),
    };
  }

  /**
   * Restore rule. Only the flag flips: commitments cancelled by the archive
   * stay cancelled (they may be stale) and paused recurring rules stay
   * paused — the user resumes them explicitly, so nothing auto-posts into
   * a freshly restored account by surprise.
   */
  public static unarchiveAccount(accounts: Account[], accountId: string, nowISO: string): Account[] {
    return accounts.map((a) =>
      a.id === accountId ? { ...a, isArchived: false, updatedAt: nowISO } : a
    );
  }

  /**
   * Transaction touch check. Note: this ALONE no longer decides delete-vs-
   * archive — the handler also requires hasLiveLinks() to be false, so a
   * bill/rule linked to a transaction-less account still archives safely.
   */
  public static hasHistory(transactions: Transaction[], accountId: string): boolean {
    return transactions.some((tx) => tx.accountId === accountId || tx.destinationAccountId === accountId);
  }
}
