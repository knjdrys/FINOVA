/**
 * Browser glue for the offline sync queue + PWA lifecycle.
 *
 * Responsibilities:
 *  - Singleton SyncManager wired to the real cloudSyncService.
 *  - online/offline event wiring (drives queue flush on reconnect).
 *  - Service-worker registration + update flow.
 *  - beforeinstallprompt capture so the app can offer a real install button.
 *
 * Everything here degrades gracefully: no SW support, no install prompt,
 * no Supabase — the app keeps working localStorage-first.
 */
import { SyncQueue, SyncManager, createPersistentQueueStorage, type SyncStatus } from './syncQueue';
import { CloudSyncService } from '../supabase/cloudSyncService';
import { isSupabaseConfigured } from '../supabase/supabaseClient';
import type { AuthUserProfile } from '../supabase/authService';
import type { FinovaState } from '../storage/FinovaStorage';

// ─── Sync manager singleton ────────────────────────────────────────────────

let manager: SyncManager | null = null;
let listenersWired = false;
let getState: (() => FinovaState) | null = null;
let authUser: AuthUserProfile | null = null;
const listeners = new Set<(s: SyncStatus) => void>();

/**
 * Create (or recreate) the manager. Called once at app start and again
 * whenever auth state changes, because cloud availability depends on it.
 */
export function initSyncManager(opts: {
  /** Returns the current full app state to push. */
  getState: () => FinovaState;
  authUser: AuthUserProfile | null;
}): SyncManager {
  getState = opts.getState;
  authUser = opts.authUser;

  const queue = new SyncQueue(createPersistentQueueStorage());
  manager = new SyncManager({
    queue,
    cloudAvailable: () => isSupabaseConfigured && !!authUser && !authUser.isGuest,
    pushState: async () => {
      if (!getState || !authUser) return false;
      return CloudSyncService.syncStateToCloud(getState(), authUser);
    },
    pushDelete: async (txId) => {
      if (!authUser) return false;
      return CloudSyncService.deleteTransactionFromCloud(txId, authUser);
    },
    onStatus: (s) => listeners.forEach((l) => l(s)),
  });

  // Reconnect: drain whatever queued up while offline. (Wired once.)
  if (!listenersWired) {
    listenersWired = true;
    window.addEventListener('online', () => manager?.setOnline(true));
    window.addEventListener('offline', () => manager?.setOnline(false));
    // navigator.onLine can be stale after tab sleep; nudge on focus.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void manager?.flush();
    });
  }

  // Surface anything already owed from a previous session.
  if (queue.size() > 0 && navigator.onLine) void manager.flush();
  // Emit initial status so the UI pill renders correctly at boot.
  listeners.forEach((l) => l(manager!.status));
  return manager;
}

export function getSyncManager(): SyncManager | null {
  return manager;
}

/** Subscribe to sync status changes; returns unsubscribe. */
export function subscribeSyncStatus(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  if (manager) fn(manager.status);
  return () => listeners.delete(fn);
}

// ─── Service worker registration ───────────────────────────────────────────

export type SwUpdateState = 'none' | 'available' | 'ready';

let swUpdateState: SwUpdateState = 'none';
const swListeners = new Set<(s: SwUpdateState) => void>();

export function subscribeSwUpdate(fn: (s: SwUpdateState) => void): () => void {
  swListeners.add(fn);
  fn(swUpdateState);
  return () => swListeners.delete(fn);
}

function setSwUpdateState(s: SwUpdateState) {
  swUpdateState = s;
  swListeners.forEach((l) => l(s));
}

/** Ask a waiting SW to activate, then reload so the new shell runs. */
export function applyServiceWorkerUpdate(): void {
  void navigator.serviceWorker.getRegistration().then((reg) => {
    if (reg?.waiting) {
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
      reg.waiting.postMessage('SKIP_WAITING');
    }
  });
}

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  // Dev server serves its own module graph; caching it would cause stale
  // confusion during development. SW is exercised from the production build.
  if (import.meta.env.DEV) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    if (reg.waiting) setSwUpdateState('ready');
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          setSwUpdateState('ready');
        }
      });
    });
  } catch {
    /* registration failure = app still works, just without offline shell */
  }
}

// ─── Install prompt (beforeinstallprompt) ──────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(canInstall: boolean) => void>();

export function subscribeInstallable(fn: (canInstall: boolean) => void): () => void {
  installListeners.add(fn);
  fn(!!deferredPrompt);
  return () => installListeners.delete(fn);
}

/** True when running as an installed app (standalone display mode). */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari legacy flag
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function setupInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    installListeners.forEach((l) => l(true));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installListeners.forEach((l) => l(false));
  });
}

/** Trigger the native install dialog. Returns the user's choice. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  installListeners.forEach((l) => l(false));
  return outcome;
}
