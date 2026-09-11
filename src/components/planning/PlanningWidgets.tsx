import React, { useState } from 'react';
import { useResyncOnOpen } from '../../hooks/useResyncOnOpen';
import { AlertTriangle, CheckCircle2, PiggyBank, Target, TrendingDown, Wallet } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { t } from '../../i18n/core';
import { BudgetInsight, CurrencyCode, GoalInsight, RiskLevel, SavingsGoal } from '../../types';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const riskTone: Record<RiskLevel, { text: string; bg: string; ring: string; labelKey: string }> = {
  HIGH: { text: 'text-rose-700', bg: 'bg-rose-50', ring: 'ring-rose-200', labelKey: 'plans.riskHIGH' },
  MEDIUM: { text: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-200', labelKey: 'plans.riskMEDIUM' },
  LOW: { text: 'text-sky-700', bg: 'bg-sky-50', ring: 'ring-sky-200', labelKey: 'plans.riskLOW' },
  NONE: { text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200', labelKey: 'plans.onTrack' },
};

export const RiskBadge: React.FC<{ risk: RiskLevel; className?: string }> = ({ risk, className = '' }) => {
  const tone = riskTone[risk];
  if (risk === 'NONE') return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${tone.bg} ${tone.text} ${tone.ring} ${className}`}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      {t(tone.labelKey)}
    </span>
  );
};

const ProgressBar: React.FC<{ pct: number; tone: string; label: string }> = ({ pct, tone, label }) => (
  <div
    className="h-1.5 w-full overflow-hidden rounded-full bg-(--surface-3)"
    role="progressbar"
    aria-valuenow={Math.round(pct)}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-label={label}
  >
    <div
      className={`h-full rounded-full transition-all duration-[320ms] finova-bar ${tone}`}
      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
    />
  </div>
);

const fmt = (minor: number, currency: CurrencyCode) => MoneyValue.fromMinorUnits(minor, currency).format();

/* ------------------------------------------------------------------ */
/* Budget card (Home)                                                  */
/* ------------------------------------------------------------------ */

export const BudgetProgressCard: React.FC<{
  insight: BudgetInsight;
  currency: CurrencyCode;
  onOpen: () => void;
}> = ({ insight, currency, onOpen }) => {
  const { forecast, risk, isCurrent, daysLeft } = insight;
  const pct = forecast.percentageUsed;
  const barTone =
    risk === 'HIGH' ? 'bg-rose-500' : risk === 'MEDIUM' ? 'bg-amber-500' : risk === 'LOW' ? 'bg-sky-500' : 'bg-emerald-500';

  const headline = !isCurrent
    ? `${forecast.budgetName} · closed`
    : daysLeft > 0
    ? `${fmt(forecast.actualSpent, currency)} of ${fmt(forecast.effectiveBudget ?? forecast.budgetAmount, currency)} · ${daysLeft}d left`
    : `${fmt(forecast.actualSpent, currency)} of ${fmt(forecast.effectiveBudget ?? forecast.budgetAmount, currency)} · ends today`;

  const hint =
    risk === 'HIGH'
      ? `Projected ${fmt(insight.projectedOverspend, currency)} over`
      : risk === 'MEDIUM'
      ? `Pace is tight — ${fmt(insight.dailyAllowanceRemaining, currency)}/day left`
      : isCurrent
      ? `${fmt(forecast.effectiveRemaining ?? forecast.remainingAmount, currency)} remaining`
      : 'Tap for the period recap';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-2 rounded-2xl border border-(--line-soft) bg-(--surface) p-3.5 text-left shadow-sm transition hover:border-(--line) hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      aria-label={t('plans.budgetBarAria', { name: forecast.budgetName, status: headline })}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="truncate text-sm font-bold text-(--ink)">{forecast.budgetName}</span>
        </div>
        <RiskBadge risk={risk} />
      </div>
      <ProgressBar pct={pct} tone={barTone} label={`${forecast.budgetName} used`} />
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-semibold text-(--ink-2)">{headline}</span>
        <span className={`shrink-0 font-bold ${riskTone[risk].text}`}>{hint}</span>
      </div>
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* Goal card (Home)                                                    */
/* ------------------------------------------------------------------ */

export const GoalProgressCard: React.FC<{
  insight: GoalInsight;
  currency: CurrencyCode;
  onOpen: () => void;
  onFund: () => void;
}> = ({ insight, currency, onOpen, onFund }) => {
  const { goal, progress, risk } = insight;
  const pct = progress.progressPercentage;
  const barTone =
    risk === 'HIGH' ? 'bg-rose-500' : risk === 'MEDIUM' ? 'bg-amber-500' : risk === 'LOW' ? 'bg-sky-500' : 'bg-emerald-500';

  return (
    <div className="flex w-full flex-col gap-2 rounded-2xl border border-(--line-soft) bg-(--surface) p-3.5 shadow-sm transition hover:border-(--line) hover:shadow">
      <button type="button" onClick={onOpen} className="flex w-full items-center justify-between gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg" aria-label={`Goal ${goal.name}: ${fmt(goal.currentAmount, currency)} of ${fmt(goal.targetAmount, currency)}. ${progress.explanation}`}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="truncate text-sm font-bold text-(--ink)">{goal.name}</span>
        </div>
        <RiskBadge risk={risk} />
      </button>
      <ProgressBar pct={pct} tone={barTone} label={`${goal.name} saved`} />
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-semibold text-(--ink-2)">
          {fmt(goal.currentAmount, currency)} <span className="text-(--ink-3)">/ {fmt(goal.targetAmount, currency)}</span>
        </span>
        <button
          type="button"
          onClick={onFund}
          className="shrink-0 rounded-full bg-violet-600 px-3 py-1 text-[11px] font-bold text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1"
        >
          Fund
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Detail modal (contextual, for any budget/goal)                      */
/* ------------------------------------------------------------------ */

const DetailRow: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone = 'text-(--ink)' }) => (
  <div className="flex items-center justify-between gap-3 py-1.5">
    <span className="text-xs font-medium text-(--ink-3)">{label}</span>
    <span className={`text-sm font-bold ${tone}`}>{value}</span>
  </div>
);

export const PlanDetailModal: React.FC<{
  budgetInsight: BudgetInsight | null;
  goalInsight: GoalInsight | null;
  currency: CurrencyCode;
  onClose: () => void;
  onFundGoal?: () => void;
}> = ({ budgetInsight, goalInsight, currency, onClose, onFundGoal }) => {
  const open = Boolean(budgetInsight || goalInsight);
  const title = budgetInsight ? budgetInsight.budget.name : goalInsight ? goalInsight.goal.name : '';

  return (
    <Modal isOpen={open} onClose={onClose} title={title} maxWidth="sm">
      {budgetInsight && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <RiskBadge risk={budgetInsight.risk} />
            <span className="text-xs font-semibold text-(--ink-3)">
              {budgetInsight.isCurrent ? `Day ${budgetInsight.forecast.elapsedDays} of ${budgetInsight.forecast.totalDaysInPeriod}` : 'Period recap'}
            </span>
          </div>
          <div className="mb-3">
            <ProgressBar
              pct={budgetInsight.forecast.percentageUsed}
              tone={budgetInsight.risk === 'HIGH' ? 'bg-rose-500' : budgetInsight.risk === 'MEDIUM' ? 'bg-amber-500' : 'bg-emerald-500'}
              label="Budget used"
            />
          </div>
          <div className="divide-y divide-(--line-soft) rounded-xl bg-(--surface-2)/60 px-3 py-1">
            <DetailRow label="Budget" value={fmt(budgetInsight.forecast.effectiveBudget ?? budgetInsight.forecast.budgetAmount, currency)} />
            {budgetInsight.forecast.rolloverCarry ? (
              <DetailRow label="Rolled over" value={`+${fmt(budgetInsight.forecast.rolloverCarry, currency)}`} tone="text-emerald-600" />
            ) : null}
            <DetailRow label="Spent so far" value={fmt(budgetInsight.forecast.actualSpent, currency)} />
            <DetailRow label="Remaining" value={fmt(budgetInsight.forecast.effectiveRemaining ?? budgetInsight.forecast.remainingAmount, currency)} tone={budgetInsight.isOverBudget ? 'text-rose-600' : 'text-(--ink)'} />
            <DetailRow label="Projected period-end" value={fmt(budgetInsight.forecast.projectedMonthEndSpent, currency)} />
            <DetailRow
              label="Projected variance"
              value={`${budgetInsight.forecast.projectedVariance >= 0 ? '+' : '−'}${fmt(Math.abs(budgetInsight.forecast.projectedVariance), currency)}`}
              tone={budgetInsight.forecast.projectedVariance < 0 ? 'text-rose-600' : 'text-emerald-600'}
            />
            {budgetInsight.isCurrent && budgetInsight.daysLeft > 0 ? (
              <DetailRow label="Safe daily pace" value={`${fmt(budgetInsight.dailyAllowanceRemaining, currency)}/day`} tone="text-sky-700" />
            ) : null}
          </div>
          <p className="mt-3 rounded-xl bg-(--surface-2) p-3 text-xs leading-relaxed text-(--ink-2)">{budgetInsight.forecast.explanation}</p>
        </div>
      )}

      {goalInsight && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <RiskBadge risk={goalInsight.risk} />
            <span className="text-xs font-semibold text-(--ink-3)">
              {goalInsight.isCompleted ? 'Fully funded' : `${goalInsight.progress.daysRemaining} days to target date`}
            </span>
          </div>
          <div className="mb-3">
            <ProgressBar pct={goalInsight.progress.progressPercentage} tone={goalInsight.risk === 'HIGH' ? 'bg-rose-500' : goalInsight.risk === 'MEDIUM' ? 'bg-amber-500' : 'bg-violet-500'} label="Goal saved" />
          </div>
          <div className="divide-y divide-(--line-soft) rounded-xl bg-(--surface-2)/60 px-3 py-1">
            <DetailRow label="Saved" value={fmt(goalInsight.goal.currentAmount, currency)} />
            <DetailRow label="Target" value={fmt(goalInsight.goal.targetAmount, currency)} />
            <DetailRow label="Still needed" value={fmt(goalInsight.progress.remainingAmount, currency)} tone="text-(--ink)" />
            <DetailRow label="Planned by today" value={fmt(goalInsight.expectedContributionToDate, currency)} />
            <DetailRow
              label="Ahead / behind plan"
              value={`${goalInsight.variance >= 0 ? '+' : '−'}${fmt(Math.abs(goalInsight.variance), currency)}`}
              tone={goalInsight.variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}
            />
            {!goalInsight.isCompleted ? (
              <DetailRow label="Required pace" value={`${fmt(goalInsight.requiredRate, currency)}/mo`} tone="text-sky-700" />
            ) : null}
          </div>
          <p className="mt-3 rounded-xl bg-(--surface-2) p-3 text-xs leading-relaxed text-(--ink-2)">{goalInsight.progress.explanation}</p>
          {!goalInsight.isCompleted && onFundGoal ? (
            <button
              type="button"
              onClick={onFundGoal}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            >
              <PiggyBank className="h-4 w-4" aria-hidden="true" /> Fund this goal
            </button>
          ) : null}
        </div>
      )}
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Fund Goal modal                                                     */
/* ------------------------------------------------------------------ */

const QUICK_AMOUNTS = [10000, 50000, 100000, 500000]; // minor units: 100 / 500 / 1k / 5k

export const FundGoalModal: React.FC<{
  goal: SavingsGoal | null;
  currency: CurrencyCode;
  onClose: () => void;
  onConfirm: (amountMinor: number) => void;
}> = ({ goal, currency, onClose, onConfirm }) => {
  const [amountStr, setAmountStr] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fresh amount per goal (the modal stays mounted between goals).
  useResyncOnOpen(goal !== null, goal?.id ?? '', () => {
    setAmountStr('');
    setError(null);
  });

  if (!goal) return null;

  const remaining = goal.targetAmount - goal.currentAmount;
  const parsed = parseFloat(amountStr);
  const amountMinor = Number.isFinite(parsed) ? MoneyValue.fromMajorUnits(parsed, currency).getMinorUnits() : NaN;
  const valid = Number.isFinite(amountMinor) && amountMinor > 0;

  const submit = () => {
    if (!valid) {
      setError('Enter an amount greater than zero.');
      return;
    }
    onConfirm(Math.min(amountMinor, remaining));
    onClose();
  };

  return (
    <Modal isOpen={Boolean(goal)} onClose={onClose} title={t('plans.fundGoalTitle', { name: goal.name })} maxWidth="sm">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-(--ink-3)">
        <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
        {t('plans.stillNeeded', { amount: fmt(remaining, currency) })}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-(--ink-3)">{t('common.amount')}</span>
        <div className="flex items-center rounded-xl border border-(--line) bg-(--surface-2) px-3 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
          <span className="text-sm font-bold text-(--ink-3)">{MoneyValue.fromMinorUnits(0, currency).getCurrencySymbol()}</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step={MoneyValue.fromMinorUnits(1, currency).getMajorUnits().toString()}
            value={amountStr}
            onChange={(e) => { setAmountStr(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="0.00"
            className="w-full bg-transparent px-2 py-2.5 text-sm font-bold text-(--ink) outline-none"
            aria-label={t('plans.contributionAria')}
            autoFocus
          />
        </div>
      </label>
      {error ? <p className="text-xs font-semibold text-rose-600" role="alert">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {QUICK_AMOUNTS.filter((q) => q <= remaining).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => { setAmountStr(MoneyValue.fromMinorUnits(q, currency).getMajorUnits().toString()); setError(null); }}
            className="rounded-full border border-(--line) bg-(--surface) px-3 py-1 text-xs font-bold text-(--ink-2) transition hover:border-violet-300 hover:text-violet-700"
          >
            +{fmt(q, currency)}
          </button>
        ))}
        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => { setAmountStr(MoneyValue.fromMinorUnits(remaining, currency).getMajorUnits().toString()); setError(null); }}
            className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700 transition hover:bg-violet-100"
          >
            {t('plans.fundTheRest')}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!valid}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {t('plans.addContribution')}
      </button>
      <p className="text-center text-[11px] text-(--ink-3)">
        {t('plans.fundCapHint')}
      </p>
    </Modal>
  );
};
