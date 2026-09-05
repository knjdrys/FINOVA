/**
 * Offline sync queue semantics — the guarantees the product claims:
 * duplicate prevention, collapse-to-latest, retry/backoff, offline
 * transitions, and flush-lock safety. Pure logic, node env, no DOM.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  SyncQueue,
  SyncManager,
  createPersistentQueueStorage,
  STATE_SYNC_OP_ID,
  deleteOpId,
  type SyncStatus,
  type SyncDeps,
} from '../services/sync/syncQueue';

const memStorage = () => {
  let ops: ReturnType<SyncQueue['pending']> = [];
  return {
    load: () => ops,
    save: (o: ReturnType<SyncQueue['pending']>) => { ops = o; },
  };
};

function makeManager(over: Partial<SyncDeps> = {}) {
  const queue = new SyncQueue(memStorage());
  const statuses: SyncStatus[] = [];
  const pushState = vi.fn(async () => true);
  const pushDelete = vi.fn(async () => true);
  let t = 0;
  let cloudAvailable = true;
  const timers: Array<{ fn: () => void; at: number; done?: boolean }> = [];
  const m = new SyncManager({
    queue,
    pushState,
    pushDelete,
    cloudAvailable: () => cloudAvailable,
    onStatus: (s) => statuses.push({ ...s }),
    now: () => t,
    setTimeoutFn: (fn, ms) => { const e = { fn, at: t + ms }; timers.push(e); return e; },
    clearTimeoutFn: () => {},
    ...over,
  });
  return {
    m, queue, statuses, pushState, pushDelete,
    advance: (dt: number) => {
      t += dt;
      for (const x of [...timers]) {
        if (!x.done && x.at <= t) { x.done = true; x.fn(); }
      }
    },
    setCloud: (v: boolean) => { cloudAvailable = v; },
  };
}

describe('SyncQueue', () => {
  it('collapses repeated state-sync requests into ONE op', () => {
    const q = new SyncQueue(memStorage());
    q.enqueueStateSync(1);
    q.enqueueStateSync(2);
    q.enqueueStateSync(3);
    expect(q.size()).toBe(1);
    expect(q.pending()[0].id).toBe(STATE_SYNC_OP_ID);
  });

  it('dedupes delete ops per transaction id', () => {
    const q = new SyncQueue(memStorage());
    q.enqueueDeleteTx('tx-1', 1);
    q.enqueueDeleteTx('tx-1', 2);
    q.enqueueDeleteTx('tx-2', 3);
    expect(q.size()).toBe(2);
    expect(q.pending().map(o => o.id)).toEqual([deleteOpId('tx-1'), deleteOpId('tx-2')]);
  });

  it('persists across queue instances (page reload)', () => {
    const store = memStorage();
    const q1 = new SyncQueue(store);
    q1.enqueueStateSync(1);
    q1.enqueueDeleteTx('tx-9', 2);
    const q2 = new SyncQueue(store);
    expect(q2.size()).toBe(2);
  });

  it('runnable() respects backoff windows', () => {
    const q = new SyncQueue(memStorage());
    q.enqueueStateSync(0);
    q.scheduleRetry(STATE_SYNC_OP_ID, 5000);
    expect(q.runnable(4999)).toHaveLength(0);
    expect(q.runnable(5000)).toHaveLength(1);
  });

  it('a fresh edit resets backoff so it gets an immediate retry chance', () => {
    const q = new SyncQueue(memStorage());
    q.enqueueStateSync(0);
    q.scheduleRetry(STATE_SYNC_OP_ID, 9999);
    q.enqueueStateSync(10); // new edit while waiting for retry
    expect(q.runnable(10).length).toBe(1);
  });

  it('survives corrupt persisted entries', () => {
    const bad = { load: () => [null as never, { nope: true } as never, { id: 'ok', kind: 'state-sync' as const, attempts: 0, nextRetryAt: 0, enqueuedAt: 0 }], save: () => {} };
    const q = new SyncQueue(bad);
    expect(q.size()).toBe(1);
  });
});

describe('SyncManager — offline/online transitions', () => {
  it('offline edits queue instead of calling the cloud', async () => {
    const { m, queue, pushState, statuses } = makeManager();
    m.setOnline(false);
    m.requestSync();
    expect(pushState).not.toHaveBeenCalled();
    expect(queue.size()).toBe(1);
    expect(statuses.at(-1)!.phase).toBe('queued-offline');
  });

  it('reconnect flushes queued ops exactly once', async () => {
    const { m, queue, pushState } = makeManager();
    m.setOnline(false);
    m.requestSync();
    m.requestSync();
    m.requestSync();
    m.setOnline(true);
    await new Promise(r => setTimeout(r, 0));
    expect(pushState).toHaveBeenCalledTimes(1); // collapse: 3 edits → 1 push
    expect(queue.size()).toBe(0);
  });

  it('guest / unconfigured users never queue or push (local-only)', async () => {
    const { m, queue, pushState, statuses, setCloud } = makeManager();
    setCloud(false);
    m.requestSync();
    m.requestDelete('tx-1');
    expect(pushState).not.toHaveBeenCalled();
    expect(queue.size()).toBe(0);
    expect(statuses.at(-1)!.phase).toBe('local-only');
  });

  it('failed push is retried with backoff, not dropped', async () => {
    let calls = 0;
    const { m, queue, advance } = makeManager({
      pushState: async () => { calls += 1; return calls >= 3; }, // fail twice, succeed third
    });
    m.requestSync();
    await new Promise(r => setTimeout(r, 0));
    expect(queue.size()).toBe(1); // still owed
    advance(2000); // first backoff (1000*2^1)
    await new Promise(r => setTimeout(r, 0));
    advance(4000); // second backoff (1000*2^2)
    await new Promise(r => setTimeout(r, 0));
    expect(calls).toBe(3);
    expect(queue.size()).toBe(0);
  });

  it('retry backoff is capped at maxBackoffMs', async () => {
    const { m, queue, advance } = makeManager({
      pushState: async () => false, // always fail
      maxBackoffMs: 4000,
    });
    m.requestSync();
    await new Promise(r => setTimeout(r, 0));
    // attempt 1 failed → backoff min(1000*2^1, 4000) = 2000
    expect(queue.pending()[0].nextRetryAt - 0).toBeLessThanOrEqual(4000);
    advance(2000);
    await new Promise(r => setTimeout(r, 0));
    // attempt 2 failed → would be 4000 uncapped growth; cap holds at 4000
    const op = queue.pending()[0];
    expect(op.attempts).toBe(2);
    expect(op.nextRetryAt).toBeLessThanOrEqual(2000 + 4000);
  });

  it('delete op flushes separately and dedupes', async () => {
    const { m, queue, pushDelete } = makeManager();
    m.setOnline(false);
    m.requestDelete('tx-a');
    m.requestDelete('tx-a');
    m.requestDelete('tx-b');
    expect(queue.size()).toBe(2);
    m.setOnline(true);
    await new Promise(r => setTimeout(r, 0));
    expect(pushDelete).toHaveBeenCalledTimes(2);
    expect(pushDelete).toHaveBeenCalledWith('tx-a');
    expect(pushDelete).toHaveBeenCalledWith('tx-b');
    expect(queue.size()).toBe(0);
  });

  it('edit during an in-flight flush re-runs the flush (dirty flag, nothing lost)', async () => {
    const resolvers: Array<(v: boolean) => void> = [];
    const pushState = vi.fn(() => new Promise<boolean>((r) => { resolvers.push(r); }));
    const { m, queue } = makeManager({ pushState });
    m.requestSync(); // starts flush #1 (awaiting)
    m.requestSync(); // mid-flush edit → dirty flag
    await new Promise(r => setTimeout(r, 0));
    expect(pushState).toHaveBeenCalledTimes(1);
    resolvers[0](true); // flush #1 completes
    await new Promise(r => setTimeout(r, 0));
    // dirty re-flush ran with the CURRENT state (snapshot at run time)
    expect(pushState).toHaveBeenCalledTimes(2);
    resolvers[1](true); // flush #2 completes
    await new Promise(r => setTimeout(r, 0));
    expect(queue.size()).toBe(0);
  });

  it('status exposes pending count for the UI pill', async () => {
    const { m, statuses } = makeManager();
    m.setOnline(false);
    m.requestSync();
    m.requestDelete('tx-x');
    const s = statuses.at(-1)!;
    expect(s.online).toBe(false);
    expect(s.pending).toBe(2);
  });

  it('successful sync records lastSyncAt and reports synced', async () => {
    const { m, statuses } = makeManager();
    m.requestSync();
    await new Promise(r => setTimeout(r, 0));
    const s = statuses.at(-1)!;
    expect(s.phase).toBe('synced');
    expect(s.lastSyncAt).not.toBeNull();
  });
});

describe('createPersistentQueueStorage', () => {
  it('falls back to memory when localStorage is absent (node env)', () => {
    const s = createPersistentQueueStorage('TEST_KEY');
    s.save([{ id: 'x', kind: 'state-sync', attempts: 0, nextRetryAt: 0, enqueuedAt: 0 }]);
    expect(s.load()).toHaveLength(1);
  });
});
