import { UserSettings } from '../../types';
import type { Category, Transaction } from '../../types';
import { CurrencyCode } from '../../types';
import { DateUtils } from '../date/DateUtils';
import { TransactionEngine } from '../transaction/TransactionEngine';

/**
 * Emergency Fund engine.
 *
 * The old product had no real emergency fund: one preset goal + a raw
 * "cushion" number in settings. Now the reserve is a first-class, fully
 * explainable number — every line a user sees derives from their own data or
 * a setting they control:
 *
 *   current reserve = settings.minimumReserve        (user-editable)
 *   monthly essential = average of the last up-to-3 COMPLETE months of
 *     spend in the categories the user marks essential
 *     (default: bills + groceries)
 *   target = months × monthly essential              (user-picked 1–12)
 *   months covered = current reserve ÷ monthly essential
 *
 * Only complete months count — the in-progress month is never partial data,
 * which keeps the number honest.
 */

export const EF_MIN_MONTHS = 1;
export const EF_MAX_MONTHS = 12;
export const EF_DEFAULT_MONTHS = 3;
export const EF_LOOKBACK_MONTHS = 3;

/** Categories treated as essential when the user hasn't made a choice yet. */
export const EF_DEFAULT_ESSENTIAL_CATEGORIES = ['cat-bills', 'cat-groceries'];

export type EmergencyFundStatus = 'NO_ESSENTIAL_DATA' | 'NO_ESSENTIAL_SPEND' | 'BUILDING' | 'ON_TARGET';

export interface EmergencyFundReport {
  currency: CurrencyCode;
  /** Current reserve in minor units (settings.minimumReserve, clamped ≥ 0). */
  currentMinor: number;
  /** User-controlled multiplier (clamped 1..12, default 3). */
  monthsMultiplier: number;
  /** Categories counted as essential (user-controlled, default bills+groceries). */
  essentialCategoryIds: string[];
  /** ISO month labels analyzed, oldest → newest (complete months only). */
  monthLabels: string[];
  /** Complete months (of the lookback window) that contain any spend. */
  monthsAnalyzed: number;
  /** Average essential-category spend per analyzed month, minor units. */
  monthlyEssentialMinor: number;
  /** Target = monthsMultiplier × monthlyEssentialMinor. */
  targetMinor: number;
  /** currentMinor ÷ monthlyEssentialMinor; null when essential spend is 0. */
  monthsCovered: number | null;
  /** 0..100 progress toward target. */
  progressPct: number;
  /** max(0, target − current). */
  remainingMinor: number;
  status: EmergencyFundStatus;
}

export function clampEfMonths(value: number | undefined | null): number {
  if (value == null || !Number.isFinite(value)) return EF_DEFAULT_MONTHS;
  return Math.min(EF_MAX_MONTHS, Math.max(EF_MIN_MONTHS, Math.round(value)));
}

export function resolveEssentialCategories(settings: Pick<UserSettings, 'essentialCategoryIds'>): string[] {
  const ids = settings.essentialCategoryIds;
  if (Array.isArray(ids) && ids.length > 0) return ids;
  return [...EF_DEFAULT_ESSENTIAL_CATEGORIES];
}

export function computeEmergencyFundReport(
  settings: UserSettings,
  transactions: Transaction[],
  categories: Category[]
): EmergencyFundReport {
  const currency: CurrencyCode = settings.currency;
  const currentMinor = Math.max(0, Math.round(settings.minimumReserve || 0));
  const monthsMultiplier = clampEfMonths(settings.emergencyFundMonths);
  const essentialIds = resolveEssentialCategories(settings);
  // Ignore saved ids that no longer exist (deleted categories) — a stale id
  // must not silently do nothing in the report.
  const knownIds = new Set(categories.map((c) => c.id));
  const essentialSet = new Set(essentialIds.filter((id) => knownIds.has(id)));

  // Complete months only, oldest → newest: the last 3 before this month.
  const now = new Date();
  const monthLabels: string[] = [];
  for (let offset = EF_LOOKBACK_MONTHS; offset >= 1; offset--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    monthLabels.push(DateUtils.formatISO(ref).slice(0, 7)); // local-time month, never UTC-shifted
  }

  const monthlyEssential: number[] = [];
  let monthsAnalyzed = 0;

  for (const label of monthLabels) {
    const startISO = `${label}-01`;
    const endISO = DateUtils.getMonthEndISO(startISO);
    let essentialSpend = 0;
    let anySpend = 0;
    for (const tx of transactions) {
      if (tx.type !== 'EXPENSE' || tx.status === 'PENDING') continue;
      if (tx.currency !== currency) continue;
      if (!DateUtils.isDateInRange(tx.date, startISO, endISO)) continue;
      anySpend += tx.amount;
      // getCategoryAllocations is split-aware and already excludes
      // goal-funding reservations, so this is true spending only.
      const allocations = TransactionEngine.getCategoryAllocations(tx);
      for (const [catId, minor] of allocations) {
        if (essentialSet.has(catId)) essentialSpend += minor;
      }
    }
    if (anySpend > 0) {
      monthsAnalyzed++;
      monthlyEssential.push(Math.round(essentialSpend));
    }
  }

  const monthlyEssentialMinor =
    monthsAnalyzed > 0 ? Math.round(monthlyEssential.reduce((a, b) => a + b, 0) / monthsAnalyzed) : 0;
  const targetMinor = monthlyEssentialMinor * monthsMultiplier;
  const monthsCovered = monthlyEssentialMinor > 0 ? currentMinor / monthlyEssentialMinor : null;
  const progressPct = targetMinor > 0 ? Math.min(100, Math.round((currentMinor / targetMinor) * 100)) : 0;
  const remainingMinor = Math.max(0, targetMinor - currentMinor);

  let status: EmergencyFundStatus;
  if (monthsAnalyzed === 0) status = 'NO_ESSENTIAL_DATA';
  else if (monthlyEssentialMinor === 0) status = 'NO_ESSENTIAL_SPEND';
  else if (currentMinor >= targetMinor) status = 'ON_TARGET';
  else status = 'BUILDING';

  return {
    currency,
    currentMinor,
    monthsMultiplier,
    essentialCategoryIds: essentialIds,
    monthLabels,
    monthsAnalyzed,
    monthlyEssentialMinor,
    targetMinor,
    monthsCovered,
    progressPct,
    remainingMinor,
    status,
  };
}

/** Object-style API mirroring the rest of the domain engines. */
export const EmergencyFundEngine = {
  computeReport: computeEmergencyFundReport,
  clampEfMonths,
  resolveEssentialCategories,
};
