/**
 * OS-level notifications — what this platform actually supports.
 * ---------------------------------------------------------------
 * PLATFORM TRUTH (documented per product constraint):
 *
 *  - TRUE background push (server wakes the app while it is closed) requires
 *    Web Push: a VAPID key pair, a push subscription store, and a server-side
 *    sender. FINOVA has no push backend (Supabase holds data only; Vercel
 *    serves statics), so we DO NOT claim scheduled background alerts.
 *
 *  - What DOES work reliably, and what we implement:
 *      1. The in-app feed (always, offline included — derived from local data).
 *      2. OS notifications via the service worker's showNotification() while
 *         the app is open (foreground OR a background tab/window). The SW
 *         keeps the notification alive even if the tab later closes.
 *      3. On every app open / data change, new HIGH|MEDIUM items that passed
 *         the per-id cooldown surface as OS notifications (if the user opted
 *         in and granted permission).
 *
 *  - Notification scheduling APIs (Periodic Background Sync, Web Alarms) are
 *    either not supported for web notifications or not generally available;
 *    we do not fake them.
 *
 * This module is browser-only; every entry point is guarded so domain/test
 * code can import the types without a DOM.
 */

export type OsPermission = 'unsupported' | 'default' | 'granted' | 'denied';

export function osNotifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function osPermission(): OsPermission {
  if (!osNotifySupported()) return 'unsupported';
  return Notification.permission as OsPermission;
}

/** Ask the browser for permission. Resolves to the resulting state. */
export async function requestOsPermission(): Promise<OsPermission> {
  if (!osNotifySupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return (await Notification.requestPermission()) as OsPermission;
  } catch {
    return Notification.permission as OsPermission;
  }
}

/**
 * Show an OS notification through the SW registration when available
 * (survives tab close), falling back to the page-level constructor.
 * Returns false when nothing could be shown — callers must not claim success.
 */
export async function showOsNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (!osNotifySupported() || Notification.permission !== 'granted') return false;
  const options: NotificationOptions = {
    body,
    tag, // same tag replaces the previous notification — no stacking
    icon: '/icons/pwa-192.png',
    badge: '/icons/pwa-192.png',
  };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return true;
      }
    }
    // Page-level fallback (works while the tab is alive).
    void new Notification(title, options);
    return true;
  } catch (err) {
    // Some platforms throw when called without SW scope; treat as not shown.
    console.warn('[notify] OS notification failed', err);
    return false;
  }
}
