import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { CurrencyCode } from '../../types';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { GrbiLogo } from '../ui/GrbiLogo';
import { useI18n } from '../../i18n';
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
  const { t } = useI18n();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currencySymbol = MoneyValue.zero(currency).getCurrencySymbol();

  const steps: TutorialStep[] = [
    {
      id: 1,
      tag: t('tutorial.s1.tag'),
      title: t('tutorial.s1.title'),
      subtitle: t('tutorial.s1.subtitle'),
      icon: <Sparkles className="h-6 w-6 text-(--accent)" />,
      accentColor: '#122A1E',
      bullets: [
        {
          icon: <TrendingUp className="h-4 w-4 text-emerald-700" />,
          label: t('tutorial.s1.b1label'),
          text: t('tutorial.s1.b1text'),
        },
        {
          icon: <Zap className="h-4 w-4 text-emerald-700" />,
          label: t('tutorial.s1.b2label'),
          text: t('tutorial.s1.b2text'),
        },
      ],
      interactivePreview: (sym) => (
        <div className="rounded-2xl bg-gradient-to-br from-[#122A1E] via-[#163325] to-[#183625] p-4 text-white shadow-md space-y-2 border border-emerald-800/40 animate-pulse">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
              {t('tutorial.s1.pSummary')}
            </span>
            <span className="flex h-2 w-2 rounded-full bg-(--accent)"></span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {sym}10,000<span className="text-emerald-300 text-lg">.00</span>
          </p>
          <div className="flex items-center justify-between pt-1 text-[11px] text-emerald-200">
            <span>{t('tutorial.s1.pSpent')}</span>
            <span className="font-bold text-(--accent)">{t('tutorial.s1.pBudget', { sym })}</span>
          </div>
        </div>
      ),
    },
    {
      id: 2,
      tag: t('tutorial.s2.tag'),
      title: t('tutorial.s2.title'),
      subtitle: t('tutorial.s2.subtitle'),
      icon: <ShieldCheck className="h-6 w-6 text-emerald-700" />,
      accentColor: '#059669',
      bullets: [
        {
          icon: <ShieldCheck className="h-4 w-4 text-emerald-700" />,
          label: t('tutorial.s2.b1label'),
          text: t('tutorial.s2.b1text'),
        },
        {
          icon: <Zap className="h-4 w-4 text-emerald-700" />,
          label: t('tutorial.s2.b2label'),
          text: t('tutorial.s2.b2text'),
        },
      ],
      interactivePreview: (sym) => (
        <div className="rounded-2xl bg-(--surface) p-3.5 border border-emerald-200 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black text-emerald-900 uppercase">
                {t('tutorial.s2.pLimit')}
              </span>
              <span className="rounded-full bg-(--accent) text-(--brand) px-1.5 py-0.2 text-[11px] font-black">
                {t('tutorial.s2.pSafe')}
              </span>
            </div>
            <span className="text-xs font-black text-emerald-700">{t('tutorial.daysLeft')}</span>
          </div>
          <div className="text-xl font-black text-(--ink)">
            {sym}288.46<span className="text-xs text-(--ink-3) font-semibold"> {t('tutorial.perDay')}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-emerald-100 overflow-hidden">
            <div className="h-full bg-emerald-600 rounded-full w-2/3"></div>
          </div>
        </div>
      ),
    },
    {
      id: 3,
      tag: t('tutorial.s3.tag'),
      title: t('tutorial.s3.title'),
      subtitle: t('tutorial.s3.subtitle'),
      icon: <Calendar className="h-6 w-6 text-emerald-700" />,
      accentColor: '#047857',
      bullets: [
        {
          icon: <Calendar className="h-4 w-4 text-emerald-700" />,
          label: t('tutorial.s3.b1label'),
          text: t('tutorial.s3.b1text'),
        },
        {
          icon: <TrendingUp className="h-4 w-4 text-emerald-700" />,
          label: t('tutorial.s3.b2label'),
          text: t('tutorial.s3.b2text'),
        },
      ],
      interactivePreview: (sym) => (
        <div className="rounded-2xl bg-gradient-to-br from-[#122A1E] via-[#163325] to-[#183625] p-3.5 text-white shadow-sm space-y-2 border border-emerald-800/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-emerald-300">
              {t('tutorial.s3.pPeriod')}
            </span>
            <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[11px] font-black text-(--accent) border border-emerald-300/30">
              {t('tutorial.daysLeft')}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-emerald-200">{t('tutorial.s3.pSpent')}</span>
            <span className="text-base font-black text-(--accent)">{sym}2,750.00</span>
          </div>
          <div className="rounded-lg bg-[#0d1f16] p-2 text-[11px] text-emerald-100 flex justify-between border border-emerald-800/40">
            <span>{t('tutorial.s3.pBudget')}</span>
            <span className="font-black text-white">{sym}15,000.00</span>
          </div>
        </div>
      ),
    },
    {
      id: 4,
      tag: t('tutorial.s4.tag'),
      title: t('tutorial.s4.title'),
      subtitle: t('tutorial.s4.subtitle'),
      icon: <Building2 className="h-6 w-6 text-blue-700" />,
      accentColor: '#1E40AF',
      bullets: [
        {
          icon: <Building2 className="h-4 w-4 text-blue-700" />,
          label: t('tutorial.s4.b1label'),
          text: t('tutorial.s4.b1text'),
        },
        {
          icon: <Zap className="h-4 w-4 text-blue-700" />,
          label: t('tutorial.s4.b2label'),
          text: t('tutorial.s4.b2text'),
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
                <span className="text-xs font-black text-(--ink) block">GRBank</span>
                <span className="text-[11px] text-(--ink-3) font-semibold">{t('tutorial.s4.pBank')} • •••• 5678</span>
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
                <span className="text-[11px] text-(--ink-3) font-semibold">{t('tutorial.s4.pEwallet')} • •••• 0917</span>
              </div>
            </div>
            <span className="text-xs font-black text-(--ink)">{sym}11,180.00</span>
          </div>
        </div>
      ),
    },
    {
      id: 5,
      tag: t('tutorial.s5.tag'),
      title: t('tutorial.s5.title'),
      subtitle: t('tutorial.s5.subtitle'),
      icon: <Plus className="h-6 w-6 text-(--brand)" />,
      accentColor: '#122A1E',
      bullets: [
        {
          icon: <Plus className="h-4 w-4 text-emerald-700" />,
          label: t('tutorial.s5.b1label'),
          text: t('tutorial.s5.b1text'),
        },
        {
          icon: <Zap className="h-4 w-4 text-emerald-700" />,
          label: t('tutorial.s5.b2label'),
          text: t('tutorial.s5.b2text'),
        },
      ],
      interactivePreview: () => (
        <div className="flex items-center justify-center p-4 bg-(--surface-2) rounded-2xl border border-(--line) text-center">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--accent) text-(--brand) shadow-lg shadow-lime-500/30">
              <Plus className="h-6 w-6 stroke-[3]" />
            </div>
            <div className="text-left">
              <span className="text-xs font-black text-(--ink) block">{t('tutorial.s5.pButton')}</span>
              <span className="text-[11px] text-(--ink-3) font-medium">{t('tutorial.s5.pEverywhere')}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 6,
      tag: t('tutorial.s6.tag'),
      title: t('tutorial.s6.title'),
      subtitle: t('tutorial.s6.subtitle'),
      icon: <HelpCircle className="h-6 w-6 text-purple-700" />,
      accentColor: '#7C3AED',
      bullets: [
        {
          icon: <HelpCircle className="h-4 w-4 text-purple-700" />,
          label: t('tutorial.s6.b1label'),
          text: t('tutorial.s6.b1text'),
        },
        {
          icon: <ShieldCheck className="h-4 w-4 text-purple-700" />,
          label: t('tutorial.s6.b2label'),
          text: t('tutorial.s6.b2text'),
        },
      ],
      interactivePreview: (sym) => (
        <div className="rounded-2xl bg-purple-50/90 p-3.5 border border-purple-200 text-purple-950 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase text-purple-800">
              {t('tutorial.s6.pTest', { sym })}
            </span>
            <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-black">
              {t('tutorial.s6.pVerdict')}
            </span>
          </div>
          <p className="text-xs font-semibold text-purple-900">
            {t('tutorial.s6.pChanges')} <span className="font-black text-rose-600">-{sym}112.50 {t('tutorial.perDay')}</span>
          </p>
        </div>
      ),
    },
    {
      id: 7,
      tag: t('tutorial.s7.tag'),
      title: t('tutorial.s7.title'),
      subtitle: t('tutorial.s7.subtitle'),
      icon: <Globe className="h-6 w-6 text-emerald-700" />,
      accentColor: '#059669',
      bullets: [
        {
          icon: <Globe className="h-4 w-4 text-emerald-700" />,
          label: t('tutorial.s7.b1label'),
          text: t('tutorial.s7.b1text'),
        },
        {
          icon: <CheckCircle2 className="h-4 w-4 text-emerald-700" />,
          label: t('tutorial.s7.b2label'),
          text: t('tutorial.s7.b2text'),
        },
      ],
      interactivePreview: (sym) => (
        <div className="flex items-center justify-between p-3.5 bg-(--surface-2) rounded-2xl border border-(--line)">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 font-black text-emerald-900 text-xs">
              {sym}
            </span>
            <span className="text-xs font-bold text-(--ink)">{t('tutorial.s7.pActive', { currency })}</span>
          </div>
          <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            {t('tutorial.s7.pReady')}
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
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-(--brand) text-(--accent) shadow-xs">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
                {t('tutorial.guide')}
              </span>
              <h3 className="text-sm sm:text-base font-black text-(--ink)">
                {t('tutorial.partOf', { current: currentStepIndex + 1, total: steps.length })}
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
                aria-label={t('tutorial.stepAria', { n: idx + 1 })}
              />
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="space-y-3.5">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full">
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
            <span>{t('tutorial.back')}</span>
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-xl bg-(--brand) px-5 py-2.5 text-xs font-black text-(--accent) shadow-md hover:bg-(--brand-hover) transition-all cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{t('tutorial.done')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
              className="flex items-center gap-1.5 rounded-xl bg-(--brand) px-5 py-2.5 text-xs font-black text-(--accent) shadow-md hover:bg-(--brand-hover) transition-all cursor-pointer"
            >
              <span>{t('tutorial.next')}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
