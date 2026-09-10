import { Transaction } from '../../types';

/**
 * View-level grouping used by the transaction timelines (Home + Transactions).
 *
 * Within a single day, items of the SAME CATEGORY are kept together so a
 * busy day reads like a receipt — "Food: 3 items, ₱810" — instead of a
 * mixed stream. Single-item categories render without a header so quiet
 * days stay compact.
 *
 * Pure function, no engine dependencies: inputs are already in the display
 * order the screen wants (newest first for the default sorts), and the
 * group order follows the first (most recent) item of each category, with
 * larger subtotals breaking ties.
 */

export interface DayCategoryGroup {
  categoryId: string;
  items: Transaction[];
  totalMinor: number;
}

export function groupByCategory(items: Transaction[]): DayCategoryGroup[] {
  const byCategory = new Map<string, Transaction[]>();
  for (const tx of items) {
    const list = byCategory.get(tx.categoryId);
    if (list) list.push(tx);
    else byCategory.set(tx.categoryId, [tx]);
  }

  const groups: DayCategoryGroup[] = Array.from(byCategory.entries()).map(
    ([categoryId, txs]) => ({
      categoryId,
      items: txs,
      totalMinor: txs.reduce((sum, t) => sum + t.amount, 0),
    })
  );

  groups.sort((a, b) => {
    const ai = a.items[0];
    const bi = b.items[0];
    if (ai.date !== bi.date) return ai.date < bi.date ? 1 : -1;
    const at = ai.time ?? '';
    const bt = bi.time ?? '';
    if (at !== bt) return at < bt ? 1 : -1;
    return b.totalMinor - a.totalMinor;
  });

  return groups;
}
