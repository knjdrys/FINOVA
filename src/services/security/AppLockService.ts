/**
 * App Lock — PIN gate for the whole application.
 *
 * HONEST THREAT MODEL (do not overstate in UI or docs):
 *  Protects: casual "borrowed phone" access (content not rendered until PIN;
 *  auto re-lock on inactivity/blur) and naive PIN guessing (the PIN itself is
 *  never stored — verification compares a PBKDF2-SHA256 digest via WebCrypto,
 *  with rate-limited attempts).
 *  Does NOT protect: rooted devices, anyone with OS-user credentials, or
 *  DevTools access (localStorage is writable, so the verifier can be removed
 *  — this is a UI-level lock, not encryption at rest). Biometric unlock is
 *  deliberately NOT offered: WebAuthn platform authenticators are inconsistent
 *  for installed PWAs across Android WebViews/iOS, and we refuse to claim
 *  security we cannot guarantee.
 */

const LOCK_KEY = 'FINOVA_APP_LOCK_V1';
const TIMEOUT_KEY = 'FINOVA_APP_LOCK_TIMEOUT_MS';
const UNLOCK_KEY = 'FINOVA_APP_UNLOCKED';
const ITERATIONS = 210_000;
const MAX_ATTEMPTS_BEFORE_BACKOFF = 5;
const BACKOFF_BASE_MS = 30_000;

interface LockRecord {
  salt: string;   // base64
  hash: string;   // base64 (PBKDF2-SHA256 of PIN)
  createdAt: string;
  failedAttempts: number;
  lastFailedAt: number | null;
}

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function derivePin(pin: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return toB64(bits);
}

function readRecord(): LockRecord | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.salt !== 'string' || typeof parsed?.hash !== 'string') return null;
    return parsed as LockRecord;
  } catch {
    return null;
  }
}

function writeRecord(rec: LockRecord): void {
  localStorage.setItem(LOCK_KEY, JSON.stringify(rec));
}

export const AppLockService = {
  /** Auto-relock delay in ms (0 = only on blur/hide). UI preference, not a secret. */
  getAutoLockMs(): number {
    const raw = Number(localStorage.getItem(TIMEOUT_KEY) || '60000');
    return Number.isFinite(raw) && raw >= 0 ? raw : 60000;
  },

  setAutoLockMs(ms: number): void {
    localStorage.setItem(TIMEOUT_KEY, String(ms));
  },

  isSupported(): boolean {
    return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
  },

  isConfigured(): boolean {
    return readRecord() !== null;
  },

  isUnlocked(): boolean {
    return sessionStorage.getItem(UNLOCK_KEY) === '1';
  },

  setUnlocked(v: boolean): void {
    if (v) sessionStorage.setItem(UNLOCK_KEY, '1');
    else sessionStorage.removeItem(UNLOCK_KEY);
  },

  /** Milliseconds the caller must still wait before the next attempt (0 = free). */
  lockoutRemainingMs(): number {
    const rec = readRecord();
    if (!rec || !rec.lastFailedAt || rec.failedAttempts < MAX_ATTEMPTS_BEFORE_BACKOFF) return 0;
    const over = rec.failedAttempts - MAX_ATTEMPTS_BEFORE_BACKOFF + 1;
    const wait = Math.min(BACKOFF_BASE_MS * Math.pow(2, Math.min(over - 1, 5)), 30 * 60_000);
    return Math.max(0, rec.lastFailedAt + wait - Date.now());
  },

  validatePinFormat(pin: string): string | null {
    if (!/^\d{4,10}$/.test(pin)) return 'PIN must be 4-10 digits.';
    if (/^(\d)\1+$/.test(pin)) return 'Avoid a repeated single digit.';
    const seq = '0123456789';
    if (seq.includes(pin) || seq.split('').reverse().join('').includes(pin)) return 'Avoid a simple sequence.';
    return null;
  },

  async setup(pin: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isSupported()) return { ok: false, error: 'This browser cannot create a secure lock.' };
    const fmt = this.validatePinFormat(pin);
    if (fmt) return { ok: false, error: fmt };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivePin(pin, salt);
    writeRecord({ salt: toB64(salt.buffer), hash, createdAt: new Date().toISOString(), failedAttempts: 0, lastFailedAt: null });
    this.setUnlocked(true);
    return { ok: true };
  },

  async verify(pin: string): Promise<{ ok: boolean; error?: string }> {
    const rec = readRecord();
    if (!rec) return { ok: false, error: 'No lock is configured.' };
    const wait = this.lockoutRemainingMs();
    if (wait > 0) return { ok: false, error: `Too many attempts. Try again in ${Math.ceil(wait / 1000)}s.` };
    const hash = await derivePin(pin, fromB64(rec.salt));
    if (hash === rec.hash) {
      writeRecord({ ...rec, failedAttempts: 0, lastFailedAt: null });
      this.setUnlocked(true);
      return { ok: true };
    }
    writeRecord({ ...rec, failedAttempts: rec.failedAttempts + 1, lastFailedAt: Date.now() });
    return { ok: false, error: 'Incorrect PIN.' };
  },

  /** Disable the lock. Requires the current PIN when locked; free when unlocked. */
  async remove(pin?: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isUnlocked()) {
      if (!pin) return { ok: false, error: 'Unlock first or enter your PIN.' };
      const v = await this.verify(pin);
      if (!v.ok) return v;
    }
    localStorage.removeItem(LOCK_KEY);
    this.setUnlocked(false);
    return { ok: true };
  },
};
