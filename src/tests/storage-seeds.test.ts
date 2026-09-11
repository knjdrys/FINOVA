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
} from '../services/storage/FinovaStorage';

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
