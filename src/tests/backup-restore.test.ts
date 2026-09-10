/**
 * Backup & restore — the "move to a new phone" contract.
 *  1. Round-trip: serialize(demoState) → parse → identical state.
 *  2. Strictness: every tampering mode is rejected with the right code,
 *     so a restore can never half-apply a broken file.
 */
import { describe, expect, it } from 'vitest';
import { buildDemoState } from '../services/storage/FinovaStorage';
import { parseBackup, serializeBackup } from '../services/storage/BackupService';

const state = buildDemoState('2026-09-10');

describe('backup round-trip', () => {
  it('serializes and parses back to the exact same state', () => {
    const text = serializeBackup(state, '2026-09-10T12:00:00.000Z');
    const res = parseBackup(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state).toEqual(state);
    expect(res.exportedAt).toBe('2026-09-10');
  });

  it('keeps the ledger intact through the round-trip (ids, amounts, dates)', () => {
    const res = parseBackup(serializeBackup(state));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const txs = res.state.transactions;
    expect(txs).toHaveLength(state.transactions.length);
    for (const t of txs) {
      expect(Number.isInteger(t.amount)).toBe(true);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(t.date)).toBe(true);
    }
  });
});

describe('backup strictness — bad files never load', () => {
  it('rejects non-JSON with PARSE', () => {
    expect(parseBackup('definitely not json')).toEqual({ ok: false, error: 'PARSE' });
    expect(parseBackup('')).toEqual({ ok: false, error: 'PARSE' });
  });

  it('rejects JSON that is not a FINOVA backup with KIND', () => {
    expect(parseBackup(JSON.stringify({ kind: 'other-app-backup', app: 'FINOVA' }))).toEqual({
      ok: false,
      error: 'KIND',
    });
    expect(parseBackup(JSON.stringify('just a string'))).toEqual({ ok: false, error: 'KIND' });
  });

  it('rejects unsupported schema versions with VERSION', () => {
    const env = JSON.parse(serializeBackup(state));
    env.version = 99;
    expect(parseBackup(JSON.stringify(env))).toEqual({ ok: false, error: 'VERSION' });
  });

  it('rejects missing collections with SHAPE, but an empty ledger is legal', () => {
    const broken = (fn: (s: Record<string, unknown>) => void) => {
      const env = JSON.parse(serializeBackup(state));
      fn(env.state);
      return parseBackup(JSON.stringify(env));
    };
    expect(broken((s) => { delete s.transactions; })).toEqual({ ok: false, error: 'SHAPE' });
    expect(broken((s) => { s.accounts = null; })).toEqual({ ok: false, error: 'SHAPE' });
    // A brand-new user with zero transactions is a perfectly good backup.
    const emptyEnv = JSON.parse(serializeBackup(state));
    (emptyEnv.state as { transactions: unknown[] }).transactions = [];
    expect(parseBackup(JSON.stringify(emptyEnv)).ok).toBe(true);
  });

  it('rejects malformed ledger rows (float amounts, bad dates, bad type)', () => {
    const mutate = (fn: (t: Record<string, unknown>) => void) => {
      const env = JSON.parse(serializeBackup(state));
      fn((env.state as { transactions: Array<Record<string, unknown>> }).transactions[0]);
      return parseBackup(JSON.stringify(env));
    };
    expect(mutate((t) => { t.amount = 12.5; })).toEqual({ ok: false, error: 'SHAPE' });
    expect(mutate((t) => { t.amount = -100; })).toEqual({ ok: false, error: 'SHAPE' });
    expect(mutate((t) => { t.date = 'Sept 10'; })).toEqual({ ok: false, error: 'SHAPE' });
    expect(mutate((t) => { t.type = 'TRANSFER'; })).toEqual({ ok: false, error: 'SHAPE' });
  });

  it('rejects unknown currencies (ledger must stay single-currency)', () => {
    const env = JSON.parse(serializeBackup(state));
    (env.state as { transactions: Array<Record<string, unknown>> }).transactions[0].currency = 'XXX';
    expect(parseBackup(JSON.stringify(env))).toEqual({ ok: false, error: 'SHAPE' });
    const env2 = JSON.parse(serializeBackup(state));
    (env2.state as { settings: Record<string, unknown> }).settings.currency = 'ZZZ';
    expect(parseBackup(JSON.stringify(env2))).toEqual({ ok: false, error: 'SHAPE' });
  });

  it('accepts a minimal but valid state', () => {
    const minimal = {
      app: 'FINOVA',
      kind: 'finova-backup',
      version: 1,
      exportedAt: '2026-01-01T00:00:00Z',
      state: {
        accounts: [{ id: 'a1', name: 'Cash', currentBalance: 1000 }],
        transactions: [
          {
            id: 't1',
            type: 'EXPENSE',
            amount: 500,
            currency: 'PHP',
            categoryId: 'c1',
            accountId: 'a1',
            date: '2026-01-02',
            tags: [],
            status: 'CONFIRMED',
          },
        ],
        categories: [{ id: 'c1', name: 'Food' }],
        budgets: [],
        goals: [],
        commitments: [],
        recurring: [],
        readNotificationIds: [],
        settings: {
          userId: 'u1',
          userName: 'Ana',
          currency: 'PHP',
          defaultTrackingPeriod: 'WEEK',
          budgetCycleMode: 'MONTHLY',
          semiMonthlyCutoffDay: 15,
          minimumReserve: 0,
          safeToSpendPeriod: 'NEXT_PAYCHECK',
          darkTheme: true,
          notificationsEnabled: true,
          budgetWarningThreshold: 80,
          autoGenerateCommitmentsFromRecurring: false,
        },
      },
    };
    expect(parseBackup(JSON.stringify(minimal)).ok).toBe(true);
  });
});
