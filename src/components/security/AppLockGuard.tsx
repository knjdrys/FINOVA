/**
 * AppLockGuard — renders a PIN screen over the app whenever the lock is
 * configured and not currently unlocked. See AppLockService for the honest
 * threat model (UI-level lock; not encryption at rest; no biometric claims).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, Delete, ShieldCheck } from 'lucide-react';
import { AppLockService } from '../../services/security/AppLockService';
import { t } from '../../i18n/core';

const TIMEOUT_KEY = 'FINOVA_APP_LOCK_TIMEOUT_MS';

export function getAutoLockMs(): number {
  const raw = Number(localStorage.getItem(TIMEOUT_KEY) || '60000');
  return Number.isFinite(raw) && raw >= 0 ? raw : 60000;
}

export function setAutoLockMs(ms: number): void {
  localStorage.setItem(TIMEOUT_KEY, String(ms));
}

export const AppLockGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locked, setLocked] = useState(() => AppLockService.isConfigured() && !AppLockService.isUnlocked());
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const timerRef = useRef<number | null>(null);

  const lock = useCallback(() => {
    if (!AppLockService.isConfigured()) return;
    AppLockService.setUnlocked(false);
    setPin('');
    setError(null);
    setLocked(true);
  }, []);

  // Re-lock when the tab is hidden/backgrounded, and after inactivity.
  useEffect(() => {
    if (!locked) {
      const onVis = () => {
        if (document.visibilityState === 'hidden') lock();
      };
      const arm = () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        const ms = getAutoLockMs();
        if (ms > 0) timerRef.current = window.setTimeout(lock, ms);
      };
      const events = ['pointerdown', 'keydown'] as const;
      events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
      document.addEventListener('visibilitychange', onVis);
      arm();
      return () => {
        events.forEach((e) => window.removeEventListener(e, arm));
        document.removeEventListener('visibilitychange', onVis);
        if (timerRef.current) window.clearTimeout(timerRef.current);
      };
    }
    return undefined;
  }, [locked, lock]);

  const submit = async () => {
    if (checking) return;
    setChecking(true);
    const res = await AppLockService.verify(pin);
    setChecking(false);
    if (res.ok) {
      setLocked(false);
      setPin('');
      setError(null);
    } else {
      setError(res.error || t('security.wrongPin'));
      setPin('');
    }
  };

  const press = (d: string) => {
    setError(null);
    setPin((p) => (p.length >= 10 ? p : p + d));
  };

  if (!locked) return <>{children}</>;

  const lockout = AppLockService.lockoutRemainingMs();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-xs text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#122A1E]">
          <Lock className="h-6 w-6 text-[#D4F63D]" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-black text-white">{t('security.title')}</h1>
        <p className="mt-1 text-xs text-slate-400">{t('security.subtitle')}</p>

        <div className="mt-6 flex h-10 items-center justify-center gap-2" role="status" aria-label={t('security.pinAria')}>
          {pin.length === 0 ? (
            <span className="text-sm text-slate-500">{t('security.enterPin')}</span>
          ) : (
            Array.from({ length: pin.length }).map((_, i) => (
              <span key={i} className="h-3 w-3 rounded-full bg-[#D4F63D]" />
            ))
          )}
        </div>

        {error && <p className="mt-2 min-h-[1rem] text-xs font-semibold text-rose-400" role="alert">{error}</p>}
        {lockout > 0 && (
          <p className="mt-2 text-xs text-amber-400">{t('security.lockedFor', { s: Math.ceil(lockout / 1000) })}</p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" onClick={() => press(d)}
              className="h-14 rounded-2xl bg-white/10 text-lg font-bold text-white active:bg-white/20">
              {d}
            </button>
          ))}
          <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} aria-label={t('security.delete')}
            className="flex h-14 items-center justify-center rounded-2xl text-slate-300 active:bg-white/10">
            <Delete className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => press('0')}
            className="h-14 rounded-2xl bg-white/10 text-lg font-bold text-white active:bg-white/20">
            0
          </button>
          <button type="button" onClick={submit} disabled={pin.length < 4 || checking} aria-label={t('security.unlock')}
            className="flex h-14 items-center justify-center rounded-2xl bg-[#D4F63D] text-slate-900 disabled:opacity-40">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-5 text-[11px] leading-relaxed text-slate-500">{t('security.honestNote')}</p>
      </div>
    </div>
  );
};
