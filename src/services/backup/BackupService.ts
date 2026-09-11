import { CLEAN_ZERO_STATE, FinovaState, INITIAL_CATEGORIES } from '../storage/FinovaStorage';

/**
 * Full-state backup & restore for the local-first data model.
 *
 * The cloud sync is a cache mirror, not a backup: wiping device storage or
 * switching users can strand data. A downloaded JSON file is the user's own
 * copy — portable across devices and immune to account mix-ups.
 *
 * Format is versioned and validated on import. Unknown future versions are
 * rejected (never half-restored), while missing collections are coerced to
 * empty so minor shape drift can't brick a restore.
 */

export const BACKUP_VERSION = 1;
const BACKUP_APP_TAG = 'PALDO';

export interface BackupFile {
  app: typeof BACKUP_APP_TAG;
  version: number;
  exportedAt: string;
  state: FinovaState;
}

export type BackupParseError = 'invalid' | 'version';

export type BackupParseResult =
  | { ok: true; state: FinovaState; exportedAt: string }
  | { ok: false; error: BackupParseError };

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export class BackupService {
  /** Serializes the full app state into a portable backup document. */
  static createBackup(state: FinovaState): string {
    const file: BackupFile = {
      app: BACKUP_APP_TAG,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      state,
    };
    return JSON.stringify(file);
  }

  static backupFilename(currency: string, todayISO: string): string {
    return `paldo_backup_${currency}_${todayISO}.json`;
  }

  /**
   * Parses + validates a backup document. Returns a normalized FinovaState on
   * success: every collection is guaranteed to be an array, settings are
   * merged over clean defaults (a backup missing new settings keys still
   * restores), and an empty category list falls back to the system seeds so
   * pickers and analytics never operate on zero categories.
   */
  static parseBackup(text: string): BackupParseResult {
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch {
      return { ok: false, error: 'invalid' };
    }
    if (!isRecord(doc) || doc.app !== BACKUP_APP_TAG || !isRecord(doc.state)) {
      return { ok: false, error: 'invalid' };
    }
    if (typeof doc.version !== 'number' || doc.version < 1) {
      return { ok: false, error: 'invalid' };
    }
    if (doc.version > BACKUP_VERSION) {
      return { ok: false, error: 'version' };
    }

    const s = doc.state as Record<string, unknown>;
    if (!isRecord(s.settings)) {
      return { ok: false, error: 'invalid' };
    }

    const categories = asArray(s.categories);
    const state: FinovaState = {
      accounts: asArray(s.accounts),
      transactions: asArray(s.transactions),
      categories: (categories.length > 0 ? categories : INITIAL_CATEGORIES) as FinovaState['categories'],
      budgets: asArray(s.budgets),
      goals: asArray(s.goals),
      commitments: asArray(s.commitments),
      recurring: asArray(s.recurring),
      readNotificationIds: asArray<string>(s.readNotificationIds),
      settings: {
        ...CLEAN_ZERO_STATE.settings,
        ...(s.settings as object),
      } as FinovaState['settings'],
    };
    return {
      ok: true,
      state,
      exportedAt: typeof doc.exportedAt === 'string' ? doc.exportedAt : '',
    };
  }
}
