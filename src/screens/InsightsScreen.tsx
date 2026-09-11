import React, { useMemo } from 'react';
import {
  Category,
  FinancialInsight,
  Transaction,
  UserSettings,
} from '../types';
import { getMonthlyCashFlow } from '../domain/insight/InsightEngine';
import { MoneyValue } from '../domain/money/MoneyValue';
import { DateUtils } from '../domain/date/DateUtils';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { t, categoryName, monthAbbr } from '../i18n';
import {
  PieChart,
  Globe,
  Sparkles,
  TrendingDown,
  TrendingUp,
  AlertOctagon,
  AlertTriangle,
  ShieldCheck,
  Target,
  CheckCircle,
  Inbox,
} from 'lucide-react';

interface InsightsScreenProps {
  transactions: Transaction[];
  categories: Category[];
  settings: UserSettings;
  /** App's memoized insight list — the single source (Home calm-state uses the same). */
  insights: FinancialInsight[];
  onOpenWhatIf: () => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe,
  TrendingDown,
  TrendingUp,
  AlertOctagon,
  AlertTriangle,
  ShieldCheck,
  Target,
  CheckCircle,
  Sparkles,
};

export const InsightsScreen: React.FC<InsightsScreenProps> = ({
  transactions,
  categories,
  settings,
  insights,
  onOpenWhatIf,
}) => {
  const todayISO = DateUtils.getTodayISO();
  const currency = settings.currency || 'PHP';

  // Category breakdown + cash-flow trend, memoized: each is O(transactions)
  // and parent re-renders (WhatIf keystrokes) must not recompute 10k rows.
  // Numeric-only memos; translated names resolve at render so language
  // switches can never be frozen by a stale memo.
  const { categoryTotals, totalExpenseMinor } = useMemo(() => {
    // Through today only, so a future-dated confirmed row can't inflate spend.
    const currentMonthStart = DateUtils.getMonthStartISO(todayISO);
    const totals = new Map<string, number>();
    let total = 0;
    for (const tx of transactions) {
      if (tx.type !== 'EXPENSE' || tx.status === 'PENDING') continue;
      if (tx.currency !== currency) continue; // never mix currencies
      if (TransactionEngine.isBookkeeping(tx)) continue; // reservations + adjustments are not spending
      if (DateUtils.isDateInRange(tx.date, currentMonthStart, todayISO)) {
        // Split-aware: a split expense contributes per allocated category.
        const allocations = TransactionEngine.getCategoryAllocations(tx);
        for (const [catId, amt] of allocations) {
          totals.set(catId, (totals.get(catId) || 0) + amt);
        }
        total += tx.amount;
      }
    }
    return { categoryTotals: totals, totalExpenseMinor: total };
  }, [transactions, currency, todayISO]);

  const categoryMap = useMemo(
    () => new Map<string, Category>(categories.map((c) => [c.id, c])),
    [categories]
  );

  // Monthly cash-flow trend — trailing 6 months, oldest → newest.
  const cashFlow = useMemo(
    () => getMonthlyCashFlow(transactions, currency, todayISO),
    [transactions, currency, todayISO]
  );
  const cashFlowMax = Math.max(1, ...cashFlow.map((b) => Math.max(b.income, b.expense)));
  const cashFlowActive = cashFlow.some((b) => b.hasActivity);
  const currentNet = cashFlow[cashFlow.length - 1]?.net ?? 0;

  const categoryBreakdown = Array.from(categoryTotals.entries())
    .map(([catId, amount]) => {
      const cat = categoryMap.get(catId);
      const percentage = totalExpenseMinor > 0 ? (amount / totalExpenseMinor) * 100 : 0;
      return {
        catId,
        name: categoryName(cat) || t('analytics.other'),
        amount,
        color: cat?.color || '#059669',
        percentage: Math.round(percentage),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-4 sm:space-y-5 pb-6">
      {/* What-If Simulator Action Card */}
      <div
        data-tour="what-if-banner"
        className="rounded-[24px] sm:rounded-[28px] bg-gradient-to-br from-[#122A1E] via-[#163325] to-[#183625] p-5 sm:p-6 text-white shadow-xl shadow-emerald-950/20 border border-emerald-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div>
          <span className="text-xs font-bold text-(--accent) uppercase tracking-wider flex items-center gap-1.5 mb-1">
            <Sparkles className="h-3.5 w-3.5" />
            {t('analytics.simulatorKicker')}
          </span>
          <h3 className="text-base sm:text-lg font-black text-white">
            {t('analytics.simulatorTitle')}
          </h3>
          <p className="text-xs sm:text-sm text-emerald-200/80 mt-0.5 max-w-sm">
            {t('analytics.simulatorHint')}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenWhatIf}
          className="rounded-2xl bg-(--accent) px-5 py-2.5 text-xs sm:text-sm font-black text-(--brand) shadow-lg shadow-lime-500/20 hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          {t('analytics.simulatorCta')}
        </button>
      </div>

      {/* Category Spending Breakdown */}
      <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-5 sm:p-6 shadow-sm border border-(--line-soft) space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-800" />
            <h4 className="text-xs sm:text-sm font-black text-(--ink) uppercase tracking-wider">
              {t('analytics.breakdownTitle')}
            </h4>
          </div>
          <span className="text-xs sm:text-sm font-bold text-(--ink-3)">
            {t('analytics.total')} {MoneyValue.fromMinorUnits(totalExpenseMinor, currency).format()}
          </span>
        </div>

        {categoryBreakdown.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <Inbox className="h-6 w-6 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-bold text-(--ink-2)">{t('analytics.emptyTitle')}</p>
            <p className="text-xs text-(--ink-3) max-w-xs">{t('analytics.emptyHint')}</p>
          </div>
        ) : (
          <>
            {/* Stacked Segment Bar */}
            <div className="h-3.5 sm:h-4 w-full rounded-full bg-(--surface-3) flex overflow-hidden" aria-hidden="true">
              {categoryBreakdown.map((item) => (
                <div
                  key={item.catId}
                  style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                  title={`${item.name}: ${item.percentage}%`}
                  className="h-full first:rounded-l-full last:rounded-r-full finova-chart-bar"
                />
              ))}
            </div>

            {/* Category List */}
            <div className="space-y-2 pt-1">
              {categoryBreakdown.slice(0, 5).map((item) => (
                <div key={item.catId} className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                      aria-hidden="true"
                    />
                    <span className="font-bold text-(--ink-2)">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-(--ink)">
                      {MoneyValue.fromMinorUnits(item.amount, currency).format()}
                    </span>
                    <span className="text-(--ink-3) font-semibold">({item.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Monthly Cash-Flow Trend */}
      <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-5 sm:p-6 shadow-sm border border-(--line-soft) space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-800" />
            <h4 className="text-xs sm:text-sm font-black text-(--ink) uppercase tracking-wider">
              {t('analytics.cashflowTitle')}
            </h4>
          </div>
          <span className="text-xs sm:text-sm font-bold text-(--ink-3)">{t('analytics.cashflowHint')}</span>
        </div>

        {!cashFlowActive ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <Inbox className="h-6 w-6 text-slate-300" aria-hidden="true" />
            <p className="text-xs text-(--ink-3) max-w-xs">{t('analytics.cashflowEmpty')}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 text-[11px] font-bold text-(--ink-3)">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                {t('analytics.income')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" aria-hidden="true" />
                {t('analytics.expense')}
              </span>
            </div>
            <div className="flex items-stretch justify-between gap-1.5 sm:gap-2" role="img" aria-label={t('analytics.cashflowTitle')}>
              {cashFlow.map((b) => {
                const incomePct = b.income > 0 ? Math.max(3, (b.income / cashFlowMax) * 100) : 0;
                const expensePct = b.expense > 0 ? Math.max(3, (b.expense / cashFlowMax) * 100) : 0;
                const label = monthAbbr(b.monthIndex0);
                return (
                  <div key={b.monthStartISO} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-24 sm:h-28 w-full items-end justify-center gap-1">
                      <div
                        style={{ height: `${incomePct}%` }}
                        title={`${label}: ${t('analytics.income')} ${MoneyValue.fromMinorUnits(b.income, currency).format()}`}
                        className="w-3 sm:w-4 rounded-t-md bg-emerald-500 finova-chart-bar"
                      />
                      <div
                        style={{ height: `${expensePct}%` }}
                        title={`${label}: ${t('analytics.expense')} ${MoneyValue.fromMinorUnits(b.expense, currency).format()}`}
                        className="w-3 sm:w-4 rounded-t-md bg-rose-400 finova-chart-bar"
                      />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold text-(--ink-3)">{label}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs sm:text-sm font-bold text-(--ink-2)">
              {t('analytics.net')}{' '}
              <span className={currentNet >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                {currentNet > 0 ? '+' : ''}
                {MoneyValue.fromMinorUnits(currentNet, currency).format()}
              </span>
            </p>
          </>
        )}
      </div>

      {/* Smart Money Tips List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs sm:text-sm font-black text-(--ink) uppercase tracking-wider">
            {t('analytics.tipsTitle')}
          </span>
          <span className="text-xs font-bold text-emerald-800">
            {t('analytics.tipsSubtitle')}
          </span>
        </div>

        {insights.length === 0 ? (
          <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-5 shadow-xs border border-(--line-soft) flex flex-col items-center gap-1.5 text-center">
            <Sparkles className="h-6 w-6 text-slate-300" aria-hidden="true" />
            <p className="text-xs sm:text-sm text-(--ink-3) max-w-sm">{t('analytics.noTips')}</p>
          </div>
        ) : (
          <div className="space-y-3 motion-stagger">
            {insights.map((insight) => {
              const IconComp = ICON_MAP[insight.iconName] || Sparkles;

              const badgeBg =
                insight.severity === 'POSITIVE'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                  : insight.severity === 'WARNING'
                  ? 'bg-amber-50 text-amber-800 border-amber-200/80'
                  : insight.severity === 'ALERT'
                  ? 'bg-rose-50 text-rose-800 border-rose-200/80'
                  : 'bg-(--surface-2) text-(--ink) border-(--line)/80';

              return (
                <div
                  key={insight.id}
                  className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-xs border border-(--line-soft) space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-2xl border ${badgeBg}`}>
                        <IconComp className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div>
                        <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-(--ink-3) block">
                          {t(`insightCat.${insight.category}`)}
                        </span>
                        <h4 className="text-xs sm:text-sm font-extrabold text-(--ink)">{insight.title}</h4>
                      </div>
                    </div>
                  </div>

                  {/* Fact */}
                  <div className="rounded-xl bg-(--surface-2) p-3 text-xs sm:text-sm text-(--ink-2)">
                    <p className="font-bold text-(--ink)">{insight.fact}</p>
                    <p className="text-xs text-(--ink-3) mt-0.5">{insight.calculation}</p>
                  </div>

                  {/* Interpretation */}
                  <p className="text-xs sm:text-sm font-semibold text-emerald-950/90 pl-1">
                    {insight.interpretation}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
