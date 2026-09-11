/**
 * Imperative dialog API — the non-component half of the dialog layer.
 *
 * Split from dialog.tsx so that file exports only its component (Fast
 * Refresh granularity). The provider registers its handles here on mount;
 * the functions fall back to native dialogs when no provider is mounted
 * (tests, SSR) so nothing ever silently no-ops.
 */

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

export const dialogHandle: DialogState = { confirm: null, notice: null };

/** Ask the user to confirm a destructive or irreversible action. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (dialogHandle.confirm) return dialogHandle.confirm(options);
  // Fallback keeps behavior truthful if the provider is somehow absent.
  return Promise.resolve(window.confirm(`${options.title}${options.message ? `\n\n${options.message}` : ''}`));
}

/** Show a short informational message (replaces alert()). */
export function notice(message: string): void {
  if (dialogHandle.notice) {
    dialogHandle.notice(message);
    return;
  }
  window.alert(message);
}
