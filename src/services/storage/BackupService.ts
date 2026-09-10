import { FinovaState } from './FinovaStorage';
import { CURRENCY_CONFIGS } from '../../types';

/**
 * Full backup & restore — the "move to a new phone" feature.
 *
 * Exports the ENTIRE FinovaState (accounts, transactions, categories,
 * budgets, goals, commitments, recurring, read-notification state, settings)
 * as a versioned, self-describing JSON envelope. Restore is strict: a file
 * that is not valid FINOVA backup JSON is rejected with a typed error code,
 * never half-applied.
 *
 * Pure module — no DOM, no storage access — so the round-trip is unit-tested
 * and the services stay offline-safe.
 */

export const BACKUP_APP = 'FINOVA';
export const BACKUP_KIND = 'finova-backup';
export const BACKUP_VERSION = 1;

export interface BackupEnvelope {
  app: typeof BACKUP_APP;
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  state: FinovaState;
}

export type BackupError =
  | 'PARSE' // not valid JSON at all
  | 'KIND' // valid JSON, not a FINOVA backup
  | 'VERSION' // unsupported schema version
  | 'SHAPE'; // required entities missing or malformed

export type ParseBackupResult =
  | { ok: true; state: FinovaState; exportedAt: string }
  | { ok: false; error: BackupError };

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Serializes a full app state into the downloadable backup format. */
export function serializeBackup(state: FinovaState, exportedAt: string = new Date().toISOString()): string {
  const envelope: BackupEnvelope = {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt,
    state,
  };
  return JSON.stringify(envelope, null, 2);
}

function isValidState(state: unknown): state is FinovaState {
  if (typeof state !== 'object' || state === null) return false;
  const s = state as Record<string, unknown>;

  const stringArray = (v: unknown): boolean => Array.isArray(v) && v.every(isNonEmptyString);

  // Every collection must be a real array — a single null here means the
  // backup is truncated or from a different product and must not load.
  if (!Array.isArray(s.accounts) || !Array.isArray(s.transactions)) return false;
  if (!Array.isArray(s.categories) || !Array.isArray(s.budgets)) return false;
  if (!Array.isArray(s.goals) || !Array.isArray(s.commitments)) return false;
  if (!Array.isArray(s.recurring) || !stringArray(s.readNotificationIds)) return false;

  // Accounts: enough to recompute balances and to render.
  for (const a of s.accounts as Array<Record<string, unknown>>) {
    if (!isNonEmptyString(a?.id) || !isNonEmptyString(a?.name)) return false;
    if (typeof a.currentBalance !== 'number' || !Number.isFinite(a.currentBalance)) return false;
  }

  // Transactions: the ledger is the crown jewels — strict.
  for (const t of s.transactions as Array<Record<string, unknown>>) {
    if (!isNonEmptyString(t?.id) || !isIsoDate(t?.date)) return false;
    if (typeof t.amount !== 'number' || !Number.isInteger(t.amount) || t.amount <= 0) return false;
    if (t.type !== 'EXPENSE' && t.type !== 'INCOME') return false;
    if (!isNonEmptyString(t.categoryId) || !isNonEmptyString(t.accountId)) return false;
    if (typeof t.currency !== 'string' || !(t.currency in CURRENCY_CONFIGS)) return false;
  }

  // Categories must at least carry id + name (display + matching depend on it).
  for (const c of s.categories as Array<Record<string, unknown>>) {
    if (!isNonEmptyString(c?.id) || !isNonEmptyString(c?.name)) return false;
  }

  // Settings must be a usable object; currency drives every MoneyValue.
  const settings = s.settings as Record<string, unknown> | undefined;
  if (typeof settings !== 'object' || settings === null) return false;
  if (typeof settings.currency !== 'string' || !(settings.currency in CURRENCY_CONFIGS)) return false;
  if (typeof settings.darkTheme !== 'boolean') return false;
  if (typeof settings.budgetCycleMode !== 'string') return false;

  return true;
}

/**
 * Validates a raw file's text. On success returns the state ready to be
 * adopted; on failure returns a typed error for localized messaging.
 */
export function parseBackup(text: string): ParseBackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'PARSE' };
  }

  if (typeof parsed !== 'object' || parsed === null) return { ok: false, error: 'KIND' };
  const env = parsed as Record<string, unknown>;
  if (env.kind !== BACKUP_KIND || env.app !== BACKUP_APP) return { ok: false, error: 'KIND' };
  if (typeof env.version !== 'number' || env.version > BACKUP_VERSION) return { ok: false, error: 'VERSION' };
  if (!isValidState(env.state)) return { ok: false, error: 'SHAPE' };

  // exportedAt is a full ISO timestamp; surface its date part for display.
  let exportedAt = '';
  if (typeof env.exportedAt === 'string') {
    const m = env.exportedAt.match(/^\d{4}-\d{2}-\d{2}/);
    exportedAt = m ? m[0] : isIsoDate(env.exportedAt) ? env.exportedAt : '';
  }
  return {
    ok: true,
    state: env.state,
    exportedAt,
  };
}

/** Download helper kept here so screens don't repeat Blob/anchor plumbing. */
export function downloadBackupText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
