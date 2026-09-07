/**
 * Day 4 — security/isolation regression (Phases 11-14).
 * - Category cloud bridge: deterministic both ways, splits included.
 * - Entity deletes (commitment/recurring) queue + flush through the
 *   user-scoped path, deduped, never touching other tables.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  toValidUuid,
  toCloudCategoryId,
  fromCloudCategoryId,
} from '../services/supabase/cloudSyncService';
import { INITIAL_CATEGORIES } from '../services/storage/FinovaStorage';
import { SyncQueue, SyncManager, QueueStorage } from '../services/sync/syncQueue';

const memStorage = (): QueueStorage => {
  let ops: any[] = [];
  return { load: () => ops, save: (o) => { ops = o; } };
};

describe('category cloud bridge', () => {
  it('toValidUuid is deterministic and idempotent', () => {
    expect(toValidUuid('cat-food')).toBe(toValidUuid('cat-food'));
    const once = toValidUuid('cat-food');
    expect(toValidUuid(once)).toBe(once);
    expect(once).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('every seeded slug round-trips through the cloud form', () => {
    for (const c of INITIAL_CATEGORIES) {
      const cloud = toCloudCategoryId(c.id);
      expect(cloud).not.toBe(c.id);
      expect(fromCloudCategoryId(cloud, 'FALLBACK')).toBe(c.id);
    }
  });

  it('unknown/custom ids pass through unchanged on both sides', () => {
    const custom = toValidUuid('cat-1725000000000');
    expect(fromCloudCategoryId(custom, 'FALLBACK')).toBe(custom);
    expect(toCloudCategoryId(null)).toBeNull();
    expect(fromCloudCategoryId(null, 'cat-bills')).toBe('cat-bills');
  });

  it('distinct slugs map to distinct cloud ids (FK-safe)', () => {
    const ids = new Set(INITIAL_CATEGORIES.map((c) => toCloudCategoryId(c.id)));
    expect(ids.size).toBe(INITIAL_CATEGORIES.length);
  });
});

describe('entity delete propagation', () => {
  function makeManager() {
    const queue = new SyncQueue(memStorage());
    const pushState = vi.fn(async () => true);
    const pushDelete = vi.fn(async () => true);
    const pushDeleteEntity = vi.fn(async () => true);
    const m = new SyncManager({
      queue, pushState, pushDelete, pushDeleteEntity,
      cloudAvailable: () => true,
    });
    return { m, queue, pushState, pushDelete, pushDeleteEntity };
  }

  it('commitment + recurring deletes enqueue separately and flush to their tables', async () => {
    const { m, pushDeleteEntity, pushDelete } = makeManager();
    m.requestDeleteEntity('money_commitments', 'c-1');
    m.requestDeleteEntity('money_commitments', 'c-1'); // duplicate collapses
    m.requestDeleteEntity('recurring_transactions', 'r-1');
    await new Promise((r) => setTimeout(r, 20));
    expect(pushDeleteEntity).toHaveBeenCalledWith('money_commitments', 'c-1');
    expect(pushDeleteEntity).toHaveBeenCalledWith('recurring_transactions', 'r-1');
    expect(pushDeleteEntity).toHaveBeenCalledTimes(2);
    expect(pushDelete).not.toHaveBeenCalled();
  });
});
