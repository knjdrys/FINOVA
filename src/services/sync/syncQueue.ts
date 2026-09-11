/**
 * Offline sync queue — pure, dependency-injected, node-testable.
 *
 * Model: FINOVA is localStorage-first. Every mutation persists locally
 * immediately (that path is unchanged and always works offline). The queue
 * only tracks WHICH cloud operations are still owed, so they can be retried
 * when connectivity returns.
 *
 * Duplicate prevention (the important part):
 *  - `state-sync` ops collapse to a SINGLE queue entry (fixed id). The flush
 *    always sends the CURRENT state snapshot, never a stale one — so N edits
 *    offline produce ONE push, not N replays.
 *  - Cloud writes are idempotent upserts keyed by deterministic ids
 *    (toValidUuid), so even a replayed flush cannot duplicate rows.
 *  - `delete-tx` ops are deduped per transaction id; deletes are idempotent.
 *  - A flush lock guarantees one in-flight sync at a time; if state changes
 *    mid-flush the op is re-queued (dirty flag), never lost.
 */

export interface QueueOp {
  /** Stable dedupe key: 'state-sync', `delete-tx:<id>`, or `delete:<table>:<id>`. */
  id: string;
  kind: 'state-sync' | 'delete-tx' | 'delete-entity';
  txId?: string;
  /** Cloud table + row for 'delete-entity' ops (whitelisted at the service layer). */
  entityTable?: 'money_commitments' | 'recurring_transactions';
  entityId?: string;
  attempts: number;
  /** Epoch ms before which the op should not be retried (backoff). */
  nextRetryAt: number;
  enqueuedAt: number;
}

export interface QueueStorage {
  load(): QueueOp[];
  save(ops: QueueOp[]): void;
}

/** localStorage-backed with an in-memory fallback (node tests, private mode). */
export function createPersistentQueueStorage(key = 'PALDO_SYNC_QUEUE_V1'): QueueStorage {
  let memory: QueueOp[] = [];
  const hasLS = typeof localStorage !== 'undefined';
  return {
    load() {
      if (!hasLS) return memory;
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as QueueOp[]) : [];
      } catch {
        return memory;
      }
    },
    save(ops) {
      memory = ops;
      if (!hasLS) return;
      try {
        localStorage.setItem(key, JSON.stringify(ops));
      } catch {
        /* quota/private mode — in-memory copy still serves the session */
      }
    },
  };
}

export const STATE_SYNC_OP_ID = 'state-sync';
export const deleteOpId = (txId: string) => `delete-tx:${txId}`;
export const deleteEntityOpId = (table: string, id: string) => `delete:${table}:${id}`;

export class SyncQueue {
  private ops: QueueOp[];

  constructor(private storage: QueueStorage) {
    this.ops = storage.load().filter((o) => o && typeof o.id === 'string');
  }

  /** Enqueue (or refresh) the single state-sync op. Collapses duplicates. */
  enqueueStateSync(now: number): void {
    const existing = this.ops.find((o) => o.id === STATE_SYNC_OP_ID);
    if (existing) {
      // Already queued: the flush will pick up the LATEST state anyway.
      // Reset backoff so a fresh edit gets an immediate retry chance.
      existing.nextRetryAt = 0;
    } else {
      this.ops.push({ id: STATE_SYNC_OP_ID, kind: 'state-sync', attempts: 0, nextRetryAt: 0, enqueuedAt: now });
    }
    this.storage.save(this.ops);
  }

  /** Enqueue a transaction delete, deduped per txId. */
  enqueueDeleteTx(txId: string, now: number): void {
    const id = deleteOpId(txId);
    if (this.ops.some((o) => o.id === id)) return;
    this.ops.push({ id, kind: 'delete-tx', txId, attempts: 0, nextRetryAt: 0, enqueuedAt: now });
    this.storage.save(this.ops);
  }

  /** Enqueue a commitment/recurring delete, deduped per table+id. */
  enqueueDeleteEntity(
    table: 'money_commitments' | 'recurring_transactions',
    entityId: string,
    now: number
  ): void {
    const id = deleteEntityOpId(table, entityId);
    if (this.ops.some((o) => o.id === id)) return;
    this.ops.push({ id, kind: 'delete-entity', entityTable: table, entityId, attempts: 0, nextRetryAt: 0, enqueuedAt: now });
    this.storage.save(this.ops);
  }

  /** Ops eligible to run right now, in insertion order. */
  runnable(now: number): QueueOp[] {
    return this.ops.filter((o) => o.nextRetryAt <= now);
  }

  remove(id: string): void {
    this.ops = this.ops.filter((o) => o.id !== id);
    this.storage.save(this.ops);
  }

  scheduleRetry(id: string, nextRetryAt: number): void {
    const op = this.ops.find((o) => o.id === id);
    if (op) {
      op.attempts += 1;
      op.nextRetryAt = nextRetryAt;
      this.storage.save(this.ops);
    }
  }

  pending(): QueueOp[] {
    return [...this.ops];
  }

  size(): number {
    return this.ops.length;
  }

  clear(): void {
    this.ops = [];
    this.storage.save(this.ops);
  }
}

export type SyncPhase =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'queued-offline'
  | 'retrying'
  | 'local-only';

export interface SyncStatus {
  phase: SyncPhase;
  online: boolean;
  /** Number of cloud ops still owed. */
  pending: number;
  lastSyncAt: number | null;
}

export interface SyncDeps {
  queue: SyncQueue;
  /** Push full state; resolves true on confirmed success. */
  pushState: () => Promise<boolean>;
  /** Delete one tx cloud-side; resolves true on confirmed success. */
  pushDelete: (txId: string) => Promise<boolean>;
  /** Delete one commitment/recurring row cloud-side; true on confirmed success. */
  pushDeleteEntity?: (table: 'money_commitments' | 'recurring_transactions', entityId: string) => Promise<boolean>;
  /** Whether cloud sync is possible at all (configured + real user). */
  cloudAvailable: () => boolean;
  onStatus?: (s: SyncStatus) => void;
  now?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (h: unknown) => void;
  /** Backoff ceiling, ms. */
  maxBackoffMs?: number;
}

export class SyncManager {
  private online =
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
  private flushing = false;
  private dirtyDuringFlush = false;
  private dirtyStateDuringFlush = false;
  private retryTimer: unknown = null;
  private lastSyncAt: number | null = null;
  private phase: SyncPhase = 'idle';
  private now: () => number;
  private setTimeoutFn: (fn: () => void, ms: number) => unknown;
  private clearTimeoutFn: (h: unknown) => void;
  private maxBackoffMs: number;

  constructor(private deps: SyncDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.setTimeoutFn = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = deps.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.maxBackoffMs = deps.maxBackoffMs ?? 60_000;
    if (!this.deps.cloudAvailable()) this.phase = 'local-only';
  }

  get status(): SyncStatus {
    return { phase: this.phase, online: this.online, pending: this.deps.queue.size(), lastSyncAt: this.lastSyncAt };
  }

  /** A local mutation happened that the cloud should eventually see. */
  requestSync(): void {
    if (!this.deps.cloudAvailable()) {
      this.emit('local-only');
      return;
    }
    this.deps.queue.enqueueStateSync(this.now());
    if (this.flushing) {
      // Mid-flush edit: the in-flight snapshot may miss it. Remember to
      // re-enqueue after the flush settles (success removes the op).
      this.dirtyDuringFlush = true;
      this.dirtyStateDuringFlush = true;
    }
    if (!this.online) {
      this.emit('queued-offline');
      return;
    }
    void this.flush();
  }

  /** A transaction was deleted locally; the cloud delete is owed. */
  requestDelete(txId: string): void {
    if (!this.deps.cloudAvailable()) {
      this.emit('local-only');
      return;
    }
    this.deps.queue.enqueueDeleteTx(txId, this.now());
    if (!this.online) {
      this.emit('queued-offline');
      return;
    }
    void this.flush();
  }

  /** A commitment/recurring row was deleted locally; the cloud delete is owed. */
  requestDeleteEntity(table: 'money_commitments' | 'recurring_transactions', entityId: string): void {
    if (!this.deps.cloudAvailable()) {
      this.emit('local-only');
      return;
    }
    this.deps.queue.enqueueDeleteEntity(table, entityId, this.now());
    if (!this.online) {
      this.emit('queued-offline');
      return;
    }
    void this.flush();
  }

  setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    if (online) {
      void this.flush();
    } else if (this.deps.queue.size() > 0) {
      this.emit('queued-offline');
    } else {
      this.emit(this.deps.cloudAvailable() ? 'idle' : 'local-only');
    }
  }

  /**
   * Drain runnable ops. One at a time (flush lock). state-sync sends the
   * CURRENT snapshot at run time, so collapsing is safe by construction.
   */
  async flush(): Promise<void> {
    if (this.flushing) {
      this.dirtyDuringFlush = true;
      return;
    }
    if (!this.online || !this.deps.cloudAvailable()) {
      this.emit(this.deps.queue.size() > 0 ? 'queued-offline' : 'idle');
      return;
    }
    this.flushing = true;
    this.emit('syncing');

    let failed = false;
    try {
      // Snapshot the runnable list; state-sync is evaluated at run time.
      for (const op of this.deps.queue.runnable(this.now())) {
        let ok = false;
        try {
          ok = op.kind === 'state-sync'
            ? await this.deps.pushState()
            : op.kind === 'delete-entity'
              ? (this.deps.pushDeleteEntity ? await this.deps.pushDeleteEntity(op.entityTable!, op.entityId!) : true)
              : await this.deps.pushDelete(op.txId!);
        } catch {
          ok = false;
        }
        if (ok) {
          this.deps.queue.remove(op.id);
          if (op.kind === 'state-sync') this.lastSyncAt = this.now();
        } else {
          failed = true;
          const backoff = Math.min(1000 * 2 ** (op.attempts + 1), this.maxBackoffMs);
          this.deps.queue.scheduleRetry(op.id, this.now() + backoff);
          // Stop this pass; the retry timer resumes it.
          this.scheduleRetryTimer(backoff);
          break;
        }
      }
    } finally {
      this.flushing = false;
    }

    if (this.dirtyDuringFlush) {
      this.dirtyDuringFlush = false;
      if (this.dirtyStateDuringFlush) {
        // The completed flush may have removed the op we enqueued mid-flight;
        // re-enqueue so the latest snapshot is guaranteed to be pushed.
        this.dirtyStateDuringFlush = false;
        this.deps.queue.enqueueStateSync(this.now());
      }
      void this.flush();
      return;
    }
    if (failed) {
      this.emit('retrying');
    } else if (this.deps.queue.size() > 0) {
      // Remaining ops are waiting on backoff timers.
      this.emit('retrying');
    } else {
      this.emit(this.lastSyncAt !== null ? 'synced' : 'idle');
    }
  }

  private scheduleRetryTimer(ms: number): void {
    if (this.retryTimer !== null) this.clearTimeoutFn(this.retryTimer);
    this.retryTimer = this.setTimeoutFn(() => {
      this.retryTimer = null;
      void this.flush();
    }, ms);
  }

  private emit(phase: SyncPhase): void {
    this.phase = phase;
    this.deps.onStatus?.(this.status);
  }
}
