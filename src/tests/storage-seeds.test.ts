/**
 * Storage seed integrity: system categories are code-owned, so a stored
 * state from an older app version gains new seeds on load (without touching
 * user rows), and the cloud 'cat-general' fallback always resolves to a
 * real system category.
 */
import { describe, it, expect, beforeEach } from 'vitest';

function makeStorageStub() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
}

(globalThis as any).localStorage = makeStorageStub();

import {
  FinovaStorage,
  INITIAL_CATEGORIES,
  CLEAN_ZERO_STATE,
  DEMO_ANCHOR_ISO,
  DEMO_TRANSACTIONS,
} from '../services/storage/FinovaStorage';
import { DateUtils } from '../domain/date/DateUtils';

describe('system category seeds', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('cat-general is a real system category (cloud fallback resolves)', () => {
    const general = INITIAL_CATEGORIES.find((c) => c.id === 'cat-general');
    expect(general).toBeTruthy();
    expect(general!.isSystem).toBe(true);
    expect(general!.icon).toBeTruthy();
    expect(general!.color).toBeTruthy();
  });

  it('loadState backfills seeds the stored state predates', () => {
    const legacy = structuredClone(CLEAN_ZERO_STATE);
    legacy.categories = legacy.categories.filter((c) => c.id !== 'cat-general');
    expect(legacy.categories.some((c) => c.id === 'cat-general')).toBe(false);
    FinovaStorage.saveState(legacy);

    const loaded = FinovaStorage.loadState();
    expect(loaded.categories.some((c) => c.id === 'cat-general')).toBe(true);
    // Nothing else disturbed: same count + the one seed.
    expect(loaded.categories).toHaveLength(legacy.categories.length + 1);
  });

  it('backfill never duplicates seeds that already exist', () => {
    FinovaStorage.saveState(structuredClone(CLEAN_ZERO_STATE));
    const loaded = FinovaStorage.loadState();
    const ids = loaded.categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('global currency lock', () => {
  const tx: import('../types').Transaction = { id: 'tx-1', userId: 'u', type: 'EXPENSE', amount: 100, currency: 'PHP', categoryId: 'cat-food', accountId: 'acc-main', date: '2026-09-01', tags: [], status: 'CONFIRMED', createdAt: '', updatedAt: '' };

  it('allows the switch on a clean slate and relabels every slice consistently', () => {
    const clean = structuredClone(CLEAN_ZERO_STATE);
    expect(FinovaStorage.canChangeGlobalCurrency(clean)).toBe(true);
    const next = FinovaStorage.setGlobalCurrency(clean, 'USD');
    expect(next.settings.currency).toBe('USD');
    expect(next.accounts.every((a) => a.currency === 'USD')).toBe(true);
    expect(next.transactions.every((t) => t.currency === 'USD')).toBe(true);
    expect(next.budgets.every((b) => b.currency === 'USD')).toBe(true);
    expect(next.goals.every((g) => g.currency === 'USD')).toBe(true);
    expect(next.commitments.every((c) => c.currency === 'USD')).toBe(true);
    expect(next.recurring.every((r) => (r.currency || 'USD') === 'USD')).toBe(true);
  });

  it('refuses to rewrite amounts once any financial data exists', () => {
    const withTx = structuredClone(CLEAN_ZERO_STATE);
    withTx.transactions = [{ ...tx }];
    expect(FinovaStorage.canChangeGlobalCurrency(withTx)).toBe(false);
    expect(FinovaStorage.setGlobalCurrency(withTx, 'USD')).toBe(withTx);

    const withBalance = structuredClone(CLEAN_ZERO_STATE);
    withBalance.accounts[0].currentBalance = 5000;
    expect(FinovaStorage.canChangeGlobalCurrency(withBalance)).toBe(false);

    for (const slice of ['budgets', 'goals', 'commitments', 'recurring'] as const) {
      const s = structuredClone(CLEAN_ZERO_STATE);
      (s[slice] as unknown[]).push({ id: 'x', currency: 'PHP' });
      expect(FinovaStorage.canChangeGlobalCurrency(s)).toBe(false);
    }
  });
});

describe('demo showcase rebase', () => {
  it('lands the newest demo transaction exactly on today, gaps preserved', () => {
    const demo = FinovaStorage.loadDemoShowcaseData();
    const today = DateUtils.getTodayISO();
    const newest = demo.transactions.map((t) => t.date).sort().pop();
    expect(newest).toBe(today);
    // Relative shape preserved: the bill is due 3 days after the anchor tx.
    const anchorShifted = demo.transactions.find((t) => t.id === 'tx-1')!.date;
    expect(anchorShifted).toBe(today);
    const bill = demo.commitments.find((c) => c.id === 'comm-electric')!;
    expect(bill.dueDate).toBe(DateUtils.addDaysISO(today, 3));
    // Budgets straddle today (current window, not a dead May slice).
    expect(demo.budgets.length).toBeGreaterThan(0);
    for (const b of demo.budgets) {
      expect(DateUtils.isDateInRange(today, b.startDate, b.endDate)).toBe(true);
    }
  });

  it('never mutates the DEMO_* constants (repeat loads stay identical)', () => {
    const before = JSON.stringify(DEMO_TRANSACTIONS);
    FinovaStorage.loadDemoShowcaseData();
    FinovaStorage.loadDemoShowcaseData();
    expect(JSON.stringify(DEMO_TRANSACTIONS)).toBe(before);
    expect(DEMO_ANCHOR_ISO).toBe('2026-05-17');
  });
});
