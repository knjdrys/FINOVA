/**
 * FINOVA dialog layer — replaces native alert()/confirm() app-wide.
 *
 * Why: native dialogs are unstyled, block the UI thread, cannot be localized,
 * and look broken inside the installed PWA. This module keeps the exact same
 * call ergonomics (`await confirm(...)`, `notice(...)`) but renders through
 * the app's Modal shell with the design system's buttons, and routes every
 * string through i18n at the call site.
 *
 * The provider is mounted once in App; the imperative functions talk to it
 * through a module-level handle. If no provider is mounted (tests, SSR), the
 * functions fall back to the native dialogs so nothing ever silently no-ops.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { t } from '../../i18n/core';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions render the confirm button in rose. */
  danger?: boolean;
}

interface DialogState {
  confirm: ((options: ConfirmOptions) => Promise<boolean>) | null;
  notice: ((message: string) => void) | null;
}

const handle: DialogState = { confirm: null, notice: null };

/** Ask the user to confirm a destructive or irreversible action. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (handle.confirm) return handle.confirm(options);
  // Fallback keeps behavior truthful if the provider is somehow absent.
  return Promise.resolve(window.confirm(`${options.title}${options.message ? `\n\n${options.message}` : ''}`));
}

/** Show a short informational message (replaces alert()). */
export function notice(message: string): void {
  if (handle.notice) {
    handle.notice(message);
    return;
  }
  window.alert(message);
}

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showConfirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve }));
  }, []);

  const showToast = useCallback((message: string) => {
    setNoticeMsg(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNoticeMsg(null), 4000);
  }, []);

  // Register the imperative handles for this mounted provider.
  useEffect(() => {
    handle.confirm = showConfirm;
    handle.notice = showToast;
    return () => {
      handle.confirm = null;
      handle.notice = null;
    };
  }, [showConfirm, showToast]);

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <>
      {children}

      {/* Confirmation dialog */}
      <Modal isOpen={!!confirmState} onClose={() => close(false)} title={confirmState?.title} maxWidth="sm">
        <div className="space-y-4">
          {confirmState?.message && (
            <p className="text-xs sm:text-sm font-semibold text-slate-600 leading-relaxed">{confirmState.message}</p>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => close(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              {confirmState?.cancelLabel ?? t('common.cancel')}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => close(true)}
              className={`rounded-xl px-4 py-2 text-xs font-black text-white transition-colors cursor-pointer ${
                confirmState?.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-800 hover:bg-emerald-900'
              }`}
            >
              {confirmState?.confirmLabel ?? t('common.confirm')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Transient notice toast (replaces alert()) */}
      {noticeMsg && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4"
        >
          <div className="pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-xl">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300 mt-0.5" />
            <p className="text-xs sm:text-sm font-bold leading-snug">{noticeMsg}</p>
          </div>
        </div>
      )}
    </>
  );
};
