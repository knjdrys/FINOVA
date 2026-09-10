import { CurrencyCode, Transaction, TransactionType } from '../../types';
import { TransactionEngine } from '../transaction/TransactionEngine';

/**
 * Merchant smart categorization.
 *
 * The fastest way to log a transaction is amount → category. But when the
 * user types a merchant they have logged before, the correct category is
 * almost always the one their own history says — not a guess. This module
 * turns the user's CONFIRMED transactions into a merchant → category
 * histogram and suggests a category only when the evidence is unambiguous
 * (≥ 3 past uses of that merchant, and a unique winner).
 *
 * It is pure: same history + same merchant → same suggestion, every time.
 * Split expenses count per allocated category, so a split receipt teaches
 * both halves. Goal-funding reservations never teach (they are excluded by
 * getCategoryAllocations / skipped by tag).
 */

export interface MerchantSuggestion {
  categoryId: string;
  /** How many past transactions used this merchant for the suggested category. */
  matchCount: number;
  /** Total past transactions under this merchant (any category). */
  totalForMerchant: number;
}

/** Normalization key: case-, trim- and whitespace-insensitive comparison. */
export function normalizeMerchant(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const MIN_MERCHANT_LENGTH = 3;
const MIN_MATCH_COUNT = 3;

export function suggestCategoryForMerchant(
  merchant: string,
  transactions: Transaction[],
  type: TransactionType,
  currency: CurrencyCode
): MerchantSuggestion | null {
  const key = normalizeMerchant(merchant);
  if (key.length < MIN_MERCHANT_LENGTH) return null;

  // Amount-weighted histograms: a receipt that is 90% groceries teaches
  // groceries, even if it is technically split.
  const amountByCat = new Map<string, number>();
  const countByCat = new Map<string, number>();
  let totalForMerchant = 0;

  for (const tx of transactions) {
    if (tx.status !== 'CONFIRMED') continue;
    if (tx.type !== type) continue;
    if (tx.currency !== currency) continue;
    if (TransactionEngine.isGoalFunding(tx) || TransactionEngine.isGoalWithdrawal(tx)) continue;
    if (normalizeMerchant(tx.merchant || '') !== key) continue;

    totalForMerchant++;
    // EXPENSE: per allocated category (split-aware). INCOME: the row
    // category. TRANSFER/PLANNED have no meaningful category here.
    if (type === 'EXPENSE') {
      for (const [catId, minor] of TransactionEngine.getCategoryAllocations(tx)) {
        amountByCat.set(catId, (amountByCat.get(catId) || 0) + minor);
        countByCat.set(catId, (countByCat.get(catId) || 0) + 1);
      }
    } else if (type === 'INCOME') {
      amountByCat.set(tx.categoryId, (amountByCat.get(tx.categoryId) || 0) + tx.amount);
      countByCat.set(tx.categoryId, (countByCat.get(tx.categoryId) || 0) + 1);
    }
  }

  if (totalForMerchant < MIN_MATCH_COUNT) return null;

  let bestId: string | null = null;
  let bestAmount = 0;
  let runnerUp = 0;
  for (const [catId, amount] of amountByCat) {
    if (amount > bestAmount) {
      runnerUp = bestAmount;
      bestAmount = amount;
      bestId = catId;
    } else if (amount === bestAmount) {
      // tie for the top → not a unique winner
      runnerUp = Math.max(runnerUp, amount);
    }
  }

  if (!bestId) return null;
  const bestCount = countByCat.get(bestId) || 0;
  if (bestCount < MIN_MATCH_COUNT || bestAmount === runnerUp) return null;
  return { categoryId: bestId, matchCount: bestCount, totalForMerchant };
}

/**
 * Duplicate-entry hint for manual input.
 *
 * A duplicate is "the same merchant, the same amount, the same day" — the
 * classic fat-fingered double log. It is a HINT, not a block: the user might
 * genuinely buy the same thing twice on one day. Merchant must be present
 * and non-trivial; amount > 0; both transactions CONFIRMED. `excludeId`
 * lets edit mode ignore the transaction being edited.
 */
export interface DuplicateQuery {
  merchant: string;
  amount: number;
  date: string;
  excludeId?: string;
}

export function findPossibleDuplicate(query: DuplicateQuery, transactions: Transaction[]): Transaction | null {
  const key = normalizeMerchant(query.merchant);
  if (key.length < MIN_MERCHANT_LENGTH || query.amount <= 0 || !query.date) return null;

  for (const tx of transactions) {
    if (tx.id === query.excludeId) continue;
    if (tx.status !== 'CONFIRMED') continue;
    if (tx.amount !== query.amount) continue;
    if (tx.date !== query.date) continue;
    if (normalizeMerchant(tx.merchant || '') !== key) continue;
    return tx;
  }
  return null;
}
