import React from 'react';
import {
  Account,
  Budget,
  Category,
  MoneyCommitment,
  SavingsGoal,
  Transaction,
  UserSettings,
} from '../types';
import { InsightEngine } from '../domain/insight/InsightEngine';
import { MoneyValue } from '../domain/money/MoneyValue';
import { DateUtils } from '../domain/date/DateUtils';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { t, categoryName } from '../i18n';
import {
  PieChart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Target,
  CheckCircle,
  Inbox,
} from 'lucide-react';

interface InsightsScreenProps {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  goals: SavingsGoal[];
  commitments: MoneyCommitment[];
  settings: UserSettings;
  onOpenWhatIf: () => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  Target,
  CheckCircle,
  Sparkles,
};

export const InsightsScreen: React.FC<InsightsScreenProps> = ({
  accounts,
  transactions,
  categories,
  budgets,
  goals,
  commitments,
  settings,
  onOpenWhatIf,
}) => {
  const todayISO = DateUtils.getTodayISO();
  const currency = settings.currency || 'PHP';

  // Authoritative Deterministic Insights
  const insights = InsightEngine.generateInsights(
    accounts,
    transactions,
    budgets,
    goals,
    commitments,
    categories,
    settings,
    todayISO
  );

  // Category Breakdown for current month
  const currentMonthStart = DateUtils.getMonthStartISO(todayISO);
  const currentMonthEnd = DateUtils.getMonthEndISO(todayISO);
  const categoryTotals = new Map<string, number>();
  const categoryMap = new Map<string, Category>(categories.map((c) => [c.id, c]));

  let totalExpenseMinor = 0;
  for (const tx of transactions) {
    if (tx.type !== 'EXPENSE' || tx.status === 'PENDING') continue;
    if (DateUtils.isDateInRange(tx.date, currentMonthStart, currentMonthEnd)) {
      // Split-aware: a split expense contributes per allocated category.
      const allocations = TransactionEngine.getCategoryAllocations(tx);
      for (const [catId, amt] of allocations) {
        const curr = categoryTotals.get(catId) || 0;
        categoryTotals.set(catId, curr + amt);
      }
      totalExpenseMinor += tx.amount;
    }
  }

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
          <span className="text-xs font-bold text-[#D4F63D] uppercase tracking-wider flex items-center gap-1.5 mb-1">
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
          className="rounded-2xl bg-[#D4F63D] px-5 py-2.5 text-xs sm:text-sm font-black text-[#122A1E] shadow-lg shadow-lime-500/20 hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          {t('analytics.simulatorCta')}
        </button>
      </div>

      {/* Category Spending Breakdown */}
      <div className="rounded-[24px] sm:rounded-[28px] bg-white p-5 sm:p-6 shadow-sm border border-slate-100 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-800" />
            <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider">
              {t('analytics.breakdownTitle')}
            </h4>
          </div>
          <span className="text-xs sm:text-sm font-bold text-slate-500">
            {t('analytics.total')} {MoneyValue.fromMinorUnits(totalExpenseMinor, currency).format()}
          </span>
        </div>

        {categoryBreakdown.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <Inbox className="h-6 w-6 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-700">{t('analytics.emptyTitle')}</p>
            <p className="text-xs text-slate-500 max-w-xs">{t('analytics.emptyHint')}</p>
          </div>
        ) : (
          <>
            {/* Stacked Segment Bar */}
            <div className="h-3.5 sm:h-4 w-full rounded-full bg-slate-100 flex overflow-hidden" aria-hidden="true">
              {categoryBreakdown.map((item) => (
                <div
                  key={item.catId}
                  style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                  title={`${item.name}: ${item.percentage}%`}
                  className="h-full first:rounded-l-full last:rounded-r-full transition-all"
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
                    <span className="font-bold text-slate-700">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-900">
                      {MoneyValue.fromMinorUnits(item.amount, currency).format()}
                    </span>
                    <span className="text-slate-400 font-semibold">({item.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Smart Money Tips List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider">
            {t('analytics.tipsTitle')}
          </span>
          <span className="text-xs font-bold text-emerald-800">
            {t('analytics.tipsSubtitle')}
          </span>
        </div>

        {insights.length === 0 ? (
          <div className="rounded-[22px] sm:rounded-[26px] bg-white p-5 shadow-xs border border-slate-100 flex flex-col items-center gap-1.5 text-center">
            <Sparkles className="h-6 w-6 text-slate-300" aria-hidden="true" />
            <p className="text-xs sm:text-sm text-slate-500 max-w-sm">{t('analytics.noTips')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight) => {
              const IconComp = ICON_MAP[insight.iconName] || Sparkles;

              const badgeBg =
                insight.severity === 'POSITIVE'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                  : insight.severity === 'WARNING'
                  ? 'bg-amber-50 text-amber-800 border-amber-200/80'
                  : insight.severity === 'ALERT'
                  ? 'bg-rose-50 text-rose-800 border-rose-200/80'
                  : 'bg-slate-50 text-slate-800 border-slate-200/80';

              return (
                <div
                  key={insight.id}
                  className="rounded-[22px] sm:rounded-[26px] bg-white p-4 sm:p-5 shadow-xs border border-slate-100 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-2xl border ${badgeBg}`}>
                        <IconComp className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div>
                        <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-400 block">
                          {t(`insightCat.${insight.category}`)}
                        </span>
                        <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">{insight.title}</h4>
                      </div>
                    </div>
                  </div>

                  {/* Fact */}
                  <div className="rounded-xl bg-slate-50 p-3 text-xs sm:text-sm text-slate-700">
                    <p className="font-bold text-slate-900">{insight.fact}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{insight.calculation}</p>
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
