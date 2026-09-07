import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { CurrencyCode } from '../../types';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { GrbiLogo } from '../ui/GrbiLogo';
import {
  Sparkles,
  ShieldCheck,
  Calendar,
  Building2,
  Plus,
  HelpCircle,
  Globe,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Zap,
  TrendingUp,
  Smartphone,
} from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency?: CurrencyCode;
}

interface TutorialStep {
  id: number;
  tag: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accentColor: string;
  bullets: Array<{ icon: React.ReactNode; label: string; text: string }>;
  interactivePreview: (currencySymbol: string) => React.ReactNode;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({
  isOpen,
  onClose,
  currency = 'PHP',
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currencySymbol = MoneyValue.zero(currency).getCurrencySymbol();

  const steps: TutorialStep[] = [
    {
      id: 1,
      tag: 'HOME OVERVIEW',
      title: 'Spending Summary & Time Filters',
      subtitle: 'See exactly how much you have spent today, this week, or this month.',
      icon: <Sparkles className="h-6 w-6 text-[#D4F63D]" />,
      accentColor: '#122A1E',
      bullets: [
        {
          icon: <TrendingUp className="h-4 w-4 text-emerald-700" />,
          label: 'Simple Time Filters',
          text: 'Tap Today, This Week, or This Month to switch views anytime.',
        },
        {
          icon: <Zap className="h-4 w-4 text-emerald-700" />,
          label: 'Exact Math',
          text: 'Every cent and peso is counted accurately with zero calculation errors.',
        },
      ],
      interactivePreview: (sym) => (
        <div className="rounded-2xl bg-gradient-to-br from-[#122A1E] via-[#163325] to-[#183625] p-4 text-white shadow-md space-y-2 border border-emerald-800/40 animate-pulse">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
              Spending Summary
            </span>
            <span className="flex h-2 w-2 rounded-full bg-[#D4F63D]"></span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {sym}10,000<span className="text-emerald-300 text-lg">.00</span>
          </p>
          <div className="flex items-center justify-between pt-1 text-[11px] text-emerald-200">
            <span>Spent Today</span>
            <span className="font-bold text-[#D4F63D]">Budget {sym}30,000</span>
          </div>
        </div>
      ),
    },
    {
      id: 2,
      tag: 'SAFE SPENDING',
      title: 'Daily Safe-to-Spend Limit',
      subtitle: 'Never accidentally spend money you need for bills, savings, or emergencies.',
      icon: <ShieldCheck className="h-6 w-6 text-emerald-700" />,
      accentColor: '#059669',
      bullets: [
        {
          icon: <ShieldCheck className="h-4 w-4 text-emerald-700" />,
          label: 'How It Works',
          text: 'We subtract your upcoming bills and savings from your balance, then divide what is left by your days remaining.',
        },
        {
          icon: <Zap className="h-4 w-4 text-emerald-700" />,
          label: 'Overspending Warnings',
          text: 'If your upcoming bills are higher than your money, PALDO warns you right away so you can adjust.',
        },
      ],
      interactivePreview: (sym) => (
        <div className="rounded-2xl bg-(--surface) p-3.5 border border-emerald-200 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black text-emerald-900 uppercase">
                Daily Safe Limit
              </span>
              <span className="rounded-full bg-[#D4F63D] text-[#122A1E] px-1.5 py-0.2 text-[10px] font-black">
                Safe to Spend
              </span>
            </div>
            <span className="text-xs font-black text-emerald-700">13 Days Left</span>
          </div>
          <div className="text-xl font-black text-(--ink)">
            {sym}288.46<span className="text-xs text-(--ink-3) font-semibold"> / day</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-emerald-100 overflow-hidden">
            <div className="h-full bg-emerald-600 rounded-full w-2/3"></div>
          </div>
        </div>
      ),
    },
    {
      id: 3,
      tag: 'PAYDAY SCHEDULE',
      title: 'Twice-a-Month Payday (15-Day Cycle)',
      subtitle: 'Great for people who get paid on the 15th and end of the month.',
      icon: <Calendar className="h-6 w-6 text-emerald-700" />,
      accentColor: '#047857',
      bullets: [
        {
          icon: <Calendar className="h-4 w-4 text-emerald-700" />,
          label: '1st & 2nd Half Periods',
          text: 'Splits your month into two 15-day periods (1st to 15th, and 16th to end of month).',
        },
        {
          icon: <TrendingUp className="h-4 w-4 text-emerald-700" />,
          label: 'Half-Month Budget',
          text: 'Automatically gives you a budget for each 15-day paycheck period.',
        },
      ],
      interactivePreview: (sym) => (
        <div className="rounded-2xl bg-gradient-to-br from-[#122A1E] via-[#163325] to-[#183625] p-3.5 text-white shadow-sm space-y-2 border border-emerald-800/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-emerald-300">
              1st Pay Period (1st - 15th)
            </span>
            <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-black text-[#D4F63D] border border-emerald-300/30">
              13 Days Left
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-emerald-200">Spent in this period</span>
            <span className="text-base font-black text-[#D4F63D]">{sym}2,750.00</span>
          </div>
          <div className="rounded-lg bg-[#0d1f16] p-2 text-[11px] text-emerald-100 flex justify-between border border-emerald-800/40">
            <span>15-Day Budget:</span>
            <span className="font-black text-white">{sym}15,000.00</span>
          </div>
        </div>
      ),
    },
    {
      id: 4,
      tag: 'BANK ACCOUNTS',
      title: 'Real Banks, Rural Banks & E-Wallets',
      subtitle: 'Add Guagua Rural Bank, BPI, BDO, GCash, Maya, or cash.',
      icon: <Building2 className="h-6 w-6 text-blue-700" />,
      accentColor: '#1E40AF',
      bullets: [
        {
          icon: <Building2 className="h-4 w-4 text-blue-700" />,
          label: 'Popular Bank Presets',
          text: 'Select Guagua Rural Bank, Inc. (GRBI), BPI, GCash, Maya, or create custom accounts.',
        },
        {
          icon: <Zap className="h-4 w-4 text-blue-700" />,
          label: 'Move Money Easily',
          text: 'Transferring money between accounts automatically updates both balances with zero errors.',
        },
      ],
      interactivePreview: (sym) => (
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-(--surface-2) border border-(--line)">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 shrink-0 rounded-lg overflow-hidden flex items-center justify-center bg-[#1C205E]">
                <GrbiLogo size={28} />
              </div>
              <div>
                <span className="text-xs font-black text-(--ink) block">Guagua Rural Bank, Inc.</span>
                <span className="text-[10px] text-(--ink-3) font-semibold">Bank • •••• 5678</span>
              </div>
            </div>
            <span className="text-xs font-black text-(--ink)">{sym}45,000.00</span>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-(--surface-2) border border-(--line)">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center bg-[#0284C7] text-white">
                <Smartphone className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs font-black text-(--ink) block">GCash Wallet</span>
                <span className="text-[10px] text-(--ink-3) font-semibold">E-Wallet • •••• 0917</span>
              </div>
            </div>
            <span className="text-xs font-black text-(--ink)">{sym}11,180.00</span>
          </div>
        </div>
      ),
    },
    {
      id: 5,
      tag: 'FAST ENTRY',
      title: 'Quick-Add Button & Easy Deletes',
      subtitle: 'Add expenses, paychecks, or money transfers in just 5 seconds.',
      icon: <Plus className="h-6 w-6 text-[#122A1E]" />,
      accentColor: '#122A1E',
      bullets: [
        {
          icon: <Plus className="h-4 w-4 text-emerald-700" />,
          label: 'Always Accessible',
          text: 'Tap the bright (+) button at the bottom of the screen anytime to add a transaction.',
        },
        {
          icon: <Zap className="h-4 w-4 text-emerald-700" />,
          label: 'Safe to Delete',
          text: 'If you made a mistake and delete a transaction, your bank balance automatically corrects itself.',
        },
      ],
      interactivePreview: () => (
        <div className="flex items-center justify-center p-4 bg-(--surface-2) rounded-2xl border border-(--line) text-center">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D4F63D] text-[#122A1E] shadow-lg shadow-lime-500/30">
              <Plus className="h-6 w-6 stroke-[3]" />
            </div>
            <div className="text-left">
              <span className="text-xs font-black text-(--ink) block">Quick-Add Button</span>
              <span className="text-[11px] text-(--ink-3) font-medium">Available on every screen</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 6,
      tag: 'TEST PURCHASES',
      title: 'What-If Purchase Tester',
      subtitle: 'Test how a big purchase or subscription will affect your daily budget before buying.',
      icon: <HelpCircle className="h-6 w-6 text-purple-700" />,
      accentColor: '#7C3AED',
      bullets: [
        {
          icon: <HelpCircle className="h-4 w-4 text-purple-700" />,
          label: 'See New Daily Limit',
          text: 'Shows exactly how your daily spending limit will change before you spend any real money.',
        },
        {
          icon: <ShieldCheck className="h-4 w-4 text-purple-700" />,
          label: 'Goal Protection',
          text: 'Tells you if a purchase is safe or if it will put you in danger of running out of money.',
        },
      ],
      interactivePreview: (sym) => (
        <div className="rounded-2xl bg-purple-50/90 p-3.5 border border-purple-200 text-purple-950 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-purple-800">
              Test: New Laptop ({sym}45,000)
            </span>
            <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-black">
              VERDICT: SAFE
            </span>
          </div>
          <p className="text-xs font-semibold text-purple-900">
            Daily limit changes by <span className="font-black text-rose-600">-{sym}112.50 / day</span>
          </p>
        </div>
      ),
    },
    {
      id: 7,
      tag: 'WORLD CURRENCIES',
      title: 'Currencies & Download Spreadsheet',
      subtitle: 'Use PHP (₱), USD ($), EUR (€), and 20+ currencies, and download your data anytime.',
      icon: <Globe className="h-6 w-6 text-emerald-700" />,
      accentColor: '#059669',
      bullets: [
        {
          icon: <Globe className="h-4 w-4 text-emerald-700" />,
          label: 'Switch Currency Anytime',
          text: 'Choose your currency in Settings. All numbers and symbols update instantly.',
        },
        {
          icon: <CheckCircle2 className="h-4 w-4 text-emerald-700" />,
          label: 'Download Spreadsheet (CSV)',
          text: 'Download your full expense history to open in Excel or Google Sheets anytime.',
        },
      ],
      interactivePreview: (sym) => (
        <div className="flex items-center justify-between p-3.5 bg-(--surface-2) rounded-2xl border border-(--line)">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 font-black text-emerald-900 text-xs">
              {sym}
            </span>
            <span className="text-xs font-bold text-(--ink)">{currency} Active</span>
          </div>
          <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            Download Ready
          </span>
        </div>
      ),
    },
  ];

  const currentStep = steps[currentStepIndex];
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === steps.length - 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" maxWidth="lg">
      <div className="space-y-4 py-1">
        {/* Header with Progress */}
        <div className="flex items-center justify-between border-b border-(--line-soft) pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#122A1E] text-[#D4F63D] shadow-xs">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                PALDO Guide
              </span>
              <h3 className="text-sm sm:text-base font-black text-(--ink)">
                Part {currentStepIndex + 1} of {steps.length}
              </h3>
            </div>
          </div>

          {/* Progress Indicators */}
          <div className="flex items-center gap-1">
            {steps.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentStepIndex(idx)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === currentStepIndex
                    ? 'w-6 bg-emerald-700'
                    : idx < currentStepIndex
                    ? 'w-2 bg-emerald-300'
                    : 'w-2 bg-(--line)'
                }`}
                aria-label={`Step ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="space-y-3.5">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full">
              {currentStep.tag}
            </span>
            <h4 className="text-base sm:text-lg font-black text-(--ink) mt-1">
              {currentStep.title}
            </h4>
            <p className="text-xs sm:text-sm text-(--ink-3) font-medium mt-0.5">
              {currentStep.subtitle}
            </p>
          </div>

          {/* Interactive Feature Visual Preview */}
          <div className="pt-1">
            {currentStep.interactivePreview(currencySymbol)}
          </div>

          {/* Key Capabilities */}
          <div className="space-y-2 pt-1">
            {currentStep.bullets.map((b, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-xl bg-(--surface-2) p-2.5 border border-(--line)/70"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-(--surface) shadow-2xs mt-0.5">
                  {b.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-black text-(--ink) block">{b.label}</span>
                  <p className="text-[11px] text-(--ink-2) font-medium leading-relaxed mt-0.5">
                    {b.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-(--line-soft)">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
            className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isFirst
                ? 'opacity-30 cursor-not-allowed text-slate-400'
                : 'text-(--ink-2) bg-(--surface-3) hover:bg-(--line)'
            }`}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Back</span>
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-xl bg-[#122A1E] px-5 py-2.5 text-xs font-black text-[#D4F63D] shadow-md hover:bg-[#183625] transition-all cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Done</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
              className="flex items-center gap-1.5 rounded-xl bg-[#122A1E] px-5 py-2.5 text-xs font-black text-[#D4F63D] shadow-md hover:bg-[#183625] transition-all cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
