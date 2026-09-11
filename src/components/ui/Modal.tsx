import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { t } from '../../i18n/core';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  // onClose identity is unstable across consumers (inline arrows like
  // `onClose={() => {}}` recreate it every render). It must NEVER retrigger
  // the focus lifecycle below — that re-ran `first.focus()` on each keystroke
  // and yanked focus out of text inputs onto the X button (onboarding bug).
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = 'unset';
      return;
    }
    // Focus belongs to the dialog while it is open: remember the opener,
    // move into the dialog, trap Tab inside, and restore on close.
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusables = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) || []).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
      );
    const first = focusables()[0];
    if (first) first.focus();
    else dialog?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
      opener?.focus?.();
    };
    // Deps are intentionally [isOpen]: onClose flows through onCloseRef so an
    // unstable callback identity can never restart focus management mid-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClass =
    maxWidth === 'sm'
      ? 'max-w-sm'
      : maxWidth === 'lg'
      ? 'max-w-lg'
      : maxWidth === 'xl'
      ? 'max-w-xl'
      : 'max-w-md';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative z-10 w-full ${maxWidthClass} bg-(--surface) rounded-t-[32px] sm:rounded-[28px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-250`}
      >
        {/* Mobile Drag Handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-(--line)" />
        </div>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-(--line-soft)">
          <h3 className="text-lg font-bold text-(--ink) tracking-tight">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-(--surface-3) text-(--ink-3) hover:bg-(--line) transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1 space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
};
