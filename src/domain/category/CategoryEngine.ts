import { Category, CategoryType } from '../../types';

/**
 * CategoryEngine — the rules behind user-defined categories.
 *
 * - System categories (`isSystem`) are immutable: every engine, seed, and
 *   translation references them by stable id, so renames would silently
 *   re-localize history.
 * - Custom categories are archive-only (same lifecycle as budgets/goals):
 *   archiving hides a category from pickers while all recorded history keeps
 *   resolving to it. There is deliberately no hard delete.
 * - Names are unique per type (case-insensitive), including against archived
 *   rows — otherwise restore would surface two identical picker entries.
 */

export type CategoryNameError = 'required' | 'duplicate';

export class CategoryEngine {
  /** System rows and the internal transfer booking category can never be edited. */
  static isEditable(category: Pick<Category, 'id' | 'isSystem'>): boolean {
    return !category.isSystem && category.id !== 'cat-transfer';
  }

  /** Only editable rows can be archived or restored. */
  static isArchivable(category: Pick<Category, 'id' | 'isSystem'>): boolean {
    return CategoryEngine.isEditable(category);
  }

  /**
   * Validates a category name. `ignoreId` exempts the row being edited so an
   * unchanged name is not flagged as a duplicate of itself.
   */
  static validateName(
    name: string,
    type: CategoryType,
    categories: Category[],
    ignoreId?: string
  ): CategoryNameError | null {
    const trimmed = name.trim();
    if (!trimmed) return 'required';
    const clash = categories.some(
      (c) => c.id !== ignoreId && c.type === type && c.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    return clash ? 'duplicate' : null;
  }

  /** Stable custom id — timestamp + random suffix, never colliding with seeds. */
  static createId(): string {
    return `cat-custom-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }

  /** Picker-safe list: visible rows of one type, A–Z. */
  static visibleByType(categories: Category[], type: CategoryType): Category[] {
    return categories
      .filter((c) => c.type === type && !c.isArchived && c.id !== 'cat-transfer')
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
