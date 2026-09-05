import type { NotificationMeta, NotificationPreferences } from '../../types';

/**
 * NotificationPreferencesService
 * ------------------------------
 * Device-local persistence for notification behavior + lifecycle meta.
 *
 * Deliberately NOT part of FinovaState / cloud sync:
 *  - Cooldown timestamps are per-device facts (each device decides its own
 *    spam gate; syncing them would silence one device because another
 *    already notified).
 *  - They are behavioral metadata, not financial data.
 *
 * All reads are defensive: corrupt/missing JSON falls back to defaults,
 * never throws.
 */

const PREFS_KEY = 'FINOVA_NOTIF_PREFS_V1';
const META_KEY = 'FINOVA_NOTIF_META_V1';
/** Meta older than this is pruned — ids are stable, but dead entities shouldn't accumulate. */
const META_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  enabled: true,
  bills: true,
  recurring: true,
  budgetRisk: true,
  cashFlowRisk: true,
  goalRisk: true,
  osNotifications: false, // opt-in: requires browser permission, user must choose
  billLeadDays: 2,
  cooldownHours: 24,
};

type StorageLike = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
};

/** Injectable storage so tests (node env) can drive it without a DOM. */
function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* access can throw in privacy modes */
  }
  return null;
}

export class NotificationPrefsService {
  public static loadPrefs(storage: StorageLike | null = defaultStorage()): NotificationPreferences {
    try {
      const raw = storage?.getItem(PREFS_KEY);
      if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
      const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
      // Merge over defaults so future keys added to the interface don't
      // come back undefined for existing installs.
      return { ...DEFAULT_NOTIFICATION_PREFS, ...parsed };
    } catch {
      return { ...DEFAULT_NOTIFICATION_PREFS };
    }
  }

  public static savePrefs(prefs: NotificationPreferences, storage: StorageLike | null = defaultStorage()): void {
    try {
      storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage full / unavailable — prefs are best-effort */
    }
  }

  public static loadMeta(storage: StorageLike | null = defaultStorage()): Record<string, NotificationMeta> {
    try {
      const raw = storage?.getItem(META_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, NotificationMeta>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  public static saveMeta(
    meta: Record<string, NotificationMeta>,
    now: number = Date.now(),
    storage: StorageLike | null = defaultStorage()
  ): void {
    try {
      // Prune stale entries so the map can't grow forever across months.
      const pruned: Record<string, NotificationMeta> = {};
      for (const [id, m] of Object.entries(meta)) {
        const touched = Date.parse(m.lastOsSentAt || m.lastShownAt || '');
        if (Number.isNaN(touched) || now - touched <= META_TTL_MS) pruned[id] = m;
      }
      storage?.setItem(META_KEY, JSON.stringify(pruned));
    } catch {
      /* best-effort */
    }
  }
}
