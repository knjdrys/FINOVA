import React, { useEffect } from 'react';
import { X, ChevronRight, type LucideIcon } from 'lucide-react';

export type QuickActionTone =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'bill'
  | 'budget'
  | 'goal'
  | 'recurring';

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: QuickActionTone;
}

interface QuickActionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  actions: QuickAction[];
  onSelect: (id: string) => void;
}

const TONE_ICON_CLS: Record<QuickActionTone, string> = {
  expense: 'bg-rose-50 text-rose-600',
  income: 'bg-emerald-50 text-emerald-700',
  transfer: 'bg-blue-50 text-blue-700',
  bill: 'bg-amber-50 text-amber-700',
  budget: 'bg-(--accent)/20 text-emerald-800',
  goal: 'bg-violet-50 text-violet-700',
  recurring: 'bg-indigo-50 text-indigo-700',
};

/**
 * Bottom-sheet of every "create" action in one place. A new user taps the
 * floating + and sees everything they can add — no hunting through tabs.
 * Primary action (expense) is listed first and visually emphasized.
 */
export const QuickActionsSheet: React.FC<QuickActionsSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  actions,
  onSelect,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm motion-fade"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-lg bg-(--surface) rounded-t-[32px] sm:rounded-[28px] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col motion-enter"
      >
        {/* Drag handle + header */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-(--line)" />
        </div>
        <div className="flex items-start justify-between px-5 py-3 border-b border-(--line-soft)">
          <div>
            <h3 className="text-base sm:text-lg font-black text-(--ink) tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] sm:text-xs font-medium text-(--ink-3) mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-(--surface-3) text-(--ink-3) hover:bg-(--line) transition-colors cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action list */}
        <div className="overflow-y-auto px-3 py-3 space-y-1.5">
          {actions.map((action) => {
            const Icon = action.icon;
            const isPrimary = action.id === 'expense';
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => onSelect(action.id)}
                className={`group flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all cursor-pointer ${
                  isPrimary
                    ? 'bg-emerald-50/60 border border-emerald-200 hover:bg-emerald-50'
                    : 'hover:bg-(--surface-2) border border-transparent'
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-2xs ${TONE_ICON_CLS[action.tone]}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-(--ink) leading-tight">
                    {action.label}
                  </span>
                  <span className="block text-[11px] font-medium text-(--ink-3) leading-snug mt-0.5">
                    {action.description}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-(--ink-3) group-hover:text-(--ink) transition-colors" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
