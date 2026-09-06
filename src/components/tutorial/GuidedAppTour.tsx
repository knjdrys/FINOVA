import React, { useState, useEffect, useCallback } from 'react';
import { NavTab } from '../navigation/BottomNavigation';
import { CurrencyCode } from '../../types';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle2,
  Pointer,
} from 'lucide-react';

export interface TourStep {
  id: number;
  tab: NavTab;
  selector: string;
  badge: string;
  title: string;
  description: string;
  targetLabel: string;
  keyTakeaway: string;
}

interface GuidedAppTourProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: NavTab) => void;
  currency?: CurrencyCode;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 1,
    tab: 'HOME',
    selector: '[data-tour="wave-card"]',
    badge: 'Step 1 of 7 • Home',
    title: 'Spending Summary & Time Filters',
    description:
      'This card shows how much money you spent. Tap Today, This Week, or This Month to switch views anytime.',
    targetLabel: 'Spending Summary Card',
    keyTakeaway: 'Tap any time button to see today, this week, or this month.',
  },
  {
    id: 2,
    tab: 'HOME',
    selector: '[data-tour="safe-to-spend"]',
    badge: 'Step 2 of 7 • Daily Limit',
    title: 'Daily Safe-to-Spend™ Limit',
    description:
      'This shows how much money you can spend each day without worrying. It protects your upcoming bills and savings first, then divides what is left by your remaining days.',
    targetLabel: 'Daily Safe-to-Spend Bar',
    keyTakeaway: 'Tap "Details" to see how your daily limit is calculated.',
  },
  {
    id: 3,
    tab: 'HOME',
    selector: '[data-tour="quick-add"]',
    badge: 'Step 3 of 7 • Add Transactions',
    title: 'Quick-Add Button (+)',
    description:
      'Tap this bright button anytime to add an expense, record income like your paycheck, or move money between bank accounts.',
    targetLabel: 'Quick-Add (+) Button',
    keyTakeaway: 'Moving money between banks updates your balances automatically.',
  },
  {
    id: 4,
    tab: 'ALL_EXPENSES',
    selector: '[data-tour="category-chips"]',
    badge: 'Step 4 of 7 • Categories',
    title: 'Filter by Category & History',
    description:
      'See all your past spending sorted by day. Tap any category (like Food, Bills, or Shopping) to see only those items.',
    targetLabel: 'Category Filter Buttons',
    keyTakeaway: 'Tap a category to quickly find what you spent on food, bills, or shopping.',
  },
  {
    id: 5,
    tab: 'ANALYTICS',
    selector: '[data-tour="what-if-banner"]',
    badge: 'Step 5 of 7 • Decision Tester',
    title: 'Test a Purchase Before Spending',
    description:
      'Thinking of buying something big? Test it here first to see how it will change your daily spending before you pay with real money.',
    targetLabel: 'Purchase Simulator',
    keyTakeaway: 'Test purchases safely without changing your real account balances.',
  },
  {
    id: 6,
    tab: 'SETTINGS',
    selector: '[data-tour="payroll-cycle-setting"]',
    badge: 'Step 6 of 7 • Payday Setup',
    title: 'Twice-a-Month Payday (15-Day Cycle)',
    description:
      'If you get paid twice a month (like the 15th and end of the month), FINOVA splits your budget into two 15-day halves so you do not run out of money before payday.',
    targetLabel: '15-Day Payday Setup',
    keyTakeaway: 'Your daily safe spending matches your next payday.',
  },
  {
    id: 7,
    tab: 'SETTINGS',
    selector: '[data-tour="bank-accounts-setting"]',
    badge: 'Step 7 of 7 • Banks & Settings',
    title: 'Bank Accounts, Currencies & Clean Start',
    description:
      'Add your real bank accounts (like Guagua Rural Bank, BPI, GCash, or Maya). Change your currency or start fresh with ₱0 whenever you want.',
    targetLabel: 'Bank Accounts Manager',
    keyTakeaway: "You are all set! You're ready to easily track your real money.",
  },
];

interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export const GuidedAppTour: React.FC<GuidedAppTourProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
}) => {
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [targetRect, setTargetRect] = useState<ElementRect | null>(null);

  const currentStep = TOUR_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  // Measure and update target element's position on screen
  const updateTargetRect = useCallback(() => {
    if (!isOpen || !currentStep) return;

    const el = document.querySelector(currentStep.selector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right,
      });
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep]);

  // When step changes, navigate tab and measure after render
  useEffect(() => {
    if (!isOpen || !currentStep) return;

    // Navigate to relevant tab
    onNavigateTab(currentStep.tab);

    // Give DOM time to mount/render the tab content, then scroll and measure
    const timer1 = setTimeout(() => {
      const el = document.querySelector(currentStep.selector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      updateTargetRect();
    }, 150);

    const timer2 = setTimeout(() => {
      updateTargetRect();
    }, 450);

    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
    };
  }, [isOpen, stepIndex, currentStep, onNavigateTab, updateTargetRect]);

  if (!isOpen) return null;

  // Smart Adaptive Placement:
  // If the target is in the bottom half of the screen, place card at the TOP.
  // If the target is in the top half of the screen, place card at the BOTTOM.
  const isTargetInBottomHalf = targetRect
    ? targetRect.top > window.innerHeight * 0.45
    : false;

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto transition-all animate-fadeIn">
      {/* 1. Crystal-Clear Transparent Overlay (Zero blur, allows full readability) */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/20 transition-opacity cursor-pointer"
      />

      {/* 2. High-Precision Target Spotlight Ring & Pointing Pin */}
      {targetRect && (
        <div
          className="fixed pointer-events-none transition-all duration-300 ease-out z-55"
          style={{
            top: Math.max(0, targetRect.top - 6),
            left: Math.max(0, targetRect.left - 6),
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        >
          {/* Glowing Animated Ring */}
          <div className="w-full h-full rounded-2xl ring-4 ring-[#D4F63D] shadow-[0_0_30px_rgba(212,246,61,0.9)] animate-pulse" />

          {/* Animated Pointing Badge attached directly to the target */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-[#122A1E] text-[#D4F63D] px-3 py-1 text-[11px] font-black shadow-xl border border-[#D4F63D]/80 whitespace-nowrap animate-bounce ${
              isTargetInBottomHalf ? '-top-9' : '-bottom-9'
            }`}
          >
            <Pointer className={`h-3.5 w-3.5 ${isTargetInBottomHalf ? 'rotate-180' : ''}`} />
            <span>{currentStep.targetLabel}</span>
          </div>
        </div>
      )}

      {/* 3. Smart Floating Guided Tour Explanation Card */}
      <div
        className={`fixed inset-x-4 max-w-lg md:max-w-xl mx-auto z-60 pointer-events-auto transition-all duration-300 ${
          isTargetInBottomHalf ? 'top-4' : 'bottom-4'
        }`}
      >
        <div className="rounded-[28px] bg-(--surface) p-5 sm:p-6 shadow-2xl border border-(--line) space-y-3.5">
          {/* Header Row */}
          <div className="flex items-center justify-between border-b border-(--line-soft) pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#122A1E] text-[#D4F63D] shadow-xs">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-emerald-700">
                {currentStep.badge}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-(--surface-3) text-(--ink-3) hover:bg-(--line) hover:text-(--ink) transition-colors cursor-pointer"
              title="Close Tour"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Title & Description */}
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-black text-(--ink) tracking-tight">
              {currentStep.title}
            </h3>
            <p className="text-xs sm:text-sm text-(--ink-2) font-medium leading-relaxed">
              {currentStep.description}
            </p>
          </div>

          {/* Key Takeaway */}
          <div className="flex items-start gap-2 rounded-xl bg-emerald-50/90 p-2.5 border border-emerald-200/70">
            <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
            <span className="text-[11px] sm:text-xs font-bold text-emerald-950 leading-snug">
              {currentStep.keyTakeaway}
            </span>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-1 border-t border-(--line-soft)">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isFirst
                  ? 'opacity-30 cursor-not-allowed text-slate-400'
                  : 'text-(--ink-2) bg-(--surface-3) hover:bg-(--line)'
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </button>

            {/* Step Dots */}
            <div className="flex items-center gap-1.5">
              {TOUR_STEPS.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === stepIndex ? 'w-5 bg-emerald-700' : 'w-1.5 bg-(--line)'
                  }`}
                />
              ))}
            </div>

            {isLast ? (
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 rounded-xl bg-[#122A1E] px-4 py-2 text-xs font-black text-[#D4F63D] shadow-md hover:bg-[#183625] transition-all cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Got It! Start</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStepIndex((prev) => Math.min(TOUR_STEPS.length - 1, prev + 1))}
                className="flex items-center gap-1 rounded-xl bg-[#122A1E] px-4 py-2 text-xs font-black text-[#D4F63D] shadow-md hover:bg-[#183625] transition-all cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
