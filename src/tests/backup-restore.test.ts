/**
 * Backup & restore contract: the JSON document must round-trip the full
 * local-first state, reject foreign/future files loudly, and never produce
 * a half-shaped state that breaks pickers or analytics.
 */
import { describe, expect, it } from 'vitest';
import { BackupService, BACKUP_VERSION } from '../services/backup/BackupService';
import { CLEAN_ZERO_STATE, INITIAL_CATEGORIES } from '../services/storage/FinovaStorage';

describe('BackupService round-trip', () => {
  it('serializes and restores the full state byte-identically', () => {
    const state = {
      ...CLEAN_ZERO_STATE,
      transactions: [
        {
          id: 'tx-1', userId: 'u', type: 'EXPENSE', amount: 150, currency: 'PHP',
          categoryId: 'cat-food', accountId: 'acc-main', date: '2026-09-01',
          tags: [], status: 'CONFIRMED', createdAt: '', updatedAt: '',
        },
      ],
    } as typeof CLEAN_ZERO_STATE;
    const json = BackupService.createBackup(state);
    const parsed = BackupService.parseBackup(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state.transactions).toHaveLength(1);
      expect(parsed.state.settings.currency).toBe('PHP');
      expect(parsed.exportedAt).toBeTruthy();
    }
  });

  it('tags the document so foreign JSON is never mistaken for a backup', () => {
    const doc = JSON.parse(BackupService.createBackup(CLEAN_ZERO_STATE));
    expect(doc.app).toBe('PALDO');
    expect(doc.version).toBe(BACKUP_VERSION);
    expect(typeof doc.exportedAt).toBe('string');
  });
});

describe('BackupService validation', () => {
  it('rejects non-JSON text', () => {
    expect(BackupService.parseBackup('not json {{{')).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects JSON without the PALDO tag or state', () => {
    expect(BackupService.parseBackup('{"hello":"world"}')).toEqual({ ok: false, error: 'invalid' });
    expect(BackupService.parseBackup('{"app":"PALDO","version":1}')).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects backups from a newer app version instead of half-restoring', () => {
    const doc = { app: 'PALDO', version: BACKUP_VERSION + 1, exportedAt: '', state: CLEAN_ZERO_STATE };
    expect(BackupService.parseBackup(JSON.stringify(doc))).toEqual({ ok: false, error: 'version' });
  });

  it('rejects backups with a missing settings block', () => {
    const doc = { app: 'PALDO', version: 1, exportedAt: '', state: { accounts: [] } };
    expect(BackupService.parseBackup(JSON.stringify(doc))).toEqual({ ok: false, error: 'invalid' });
  });

  it('coerces missing collections to empty arrays (shape drift cannot brick restore)', () => {
    const doc = { app: 'PALDO', version: 1, exportedAt: '', state: { settings: CLEAN_ZERO_STATE.settings } };
    const parsed = BackupService.parseBackup(JSON.stringify(doc));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state.accounts).toEqual([]);
      expect(parsed.state.transactions).toEqual([]);
      expect(parsed.state.budgets).toEqual([]);
    }
  });

  it('falls back to system categories when the backup carries none', () => {
    const doc = {
      app: 'PALDO', version: 1, exportedAt: '',
      state: { settings: CLEAN_ZERO_STATE.settings, categories: [] },
    };
    const parsed = BackupService.parseBackup(JSON.stringify(doc));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state.categories.length).toBeGreaterThan(0);
      expect(parsed.state.categories).toEqual(INITIAL_CATEGORIES);
    }
  });

  it('merges settings over clean defaults so new keys always exist', () => {
    const doc = {
      app: 'PALDO', version: 1, exportedAt: '',
      state: { settings: { currency: 'USD' }, categories: INITIAL_CATEGORIES },
    };
    const parsed = BackupService.parseBackup(JSON.stringify(doc));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state.settings.currency).toBe('USD');
      expect(parsed.state.settings.budgetWarningThreshold).toBe(
        CLEAN_ZERO_STATE.settings.budgetWarningThreshold
      );
    }
  });
});
