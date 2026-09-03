import React, { useState, useEffect } from 'react';
import {
  Account,
  Budget,
  CashFlowRisk,
  Category,
  MoneyCommitment,
  SafeToSpendResult,
  SavingsGoal,
  Transaction,
  UserSettings,
} from '../types';
import { WaveCard } from '../components/ui/WaveCard';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { TransactionItem } from '../components/ui/TransactionItem';
import { DateUtils } from '../domain/date/DateUtils';
import { MoneyValue } from '../domain/money/MoneyValue';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { ShieldCheck, ChevronRight, AlertTriangle, Calendar, Plus, Sparkles } from 'lucide-react';

interface HomeScreenProps {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  goals: SavingsGoal[];
  commitments: MoneyCommitment[];
  settings: UserSettings;
  safeToSpend: SafeToSpendResult;
  risks: CashFlowRisk[];
  onNavigateToTab: (tab: 'ALL_EXPENSES' | 'ANALYTICS' | 'SETTINGS') => void;
  onOpenSafeToSpendExplainer: () => void;
  onOpenQuickAdd: () => void;
  onSelectTransaction: (tx: Transaction) => void;
}

type PeriodTab = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH';

export const HomeScreen: React.FC<HomeScreenProps> = ({
  accounts,
  transactions,
  categories,
  budgets,
  settings,
  safeToSpend,
  risks,
  onNavigateToTab,
  onOpenSafeToSpendExplainer,
  onOpenQuickAdd,
  onSelectTransaction,
}) => {
  const [periodTab, setPeriodTab] = useState<PeriodTab>(settings.defaultTrackingPeriod || 'TODAY');

  useEffect(() => {
    if (settings.defaultTrackingPeriod) {
      setPeriodTab(settings.defaultTrackingPeriod);
    }
  }, [settings.defaultTrackingPeriod]);

  const todayISO = DateUtils.getTodayISO();
  const currency = settings.currency || 'PHP';
  const currencySymbol = MoneyValue.zero(currency).getCurrencySymbol();
  const is15DayMode = settings.budgetCycleMode === 'SEMI_MONTHLY_15_DAYS';

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  // Calculate dynamic period totals from actual live transactions
  let periodStart = todayISO;
  let periodEnd = todayISO;
  let periodSubtitle = "Today's expense";
  let comparisonText = 'vs yesterday';
  let comparisonDir: 'up' | 'down' | 'neutral' = 'neutral';

  if (periodTab === 'THIS_WEEK') {
    periodStart = DateUtils.addDaysISO(todayISO, -6);
    periodEnd = todayISO;
    periodSubtitle = 'This week expense';
    comparisonText = 'past 7 days';
    comparisonDir = 'neutral';
  } else if (periodTab === 'THIS_MONTH') {
    periodStart = DateUtils.getMonthStartISO(todayISO);
    periodEnd = DateUtils.getMonthEndISO(todayISO);
    periodSubtitle = 'This month expense';
    comparisonText = 'current month';
    comparisonDir = 'neutral';
  }

  const periodTotals = TransactionEngine.calculatePeriodTotals(transactions, periodStart, periodEnd);
  const totalBudgetMinor = budgets.reduce((sum, b) => sum + (b.amount || 0), 0);
  const totalBudgetMoney = MoneyValue.fromMinorUnits(
    totalBudgetMinor > 0 ? totalBudgetMinor : 0,
    currency
  );

  // Group transactions by date
  const groupedTxMap = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const list = groupedTxMap.get(tx.date) || [];
    list.push(tx);
    groupedTxMap.set(tx.date, list);
  }

  const sortedDates = Array.from(groupedTxMap.keys()).sort((a, b) => b.localeCompare(a));
  const hasTransactions = transactions.length > 0;

  return (
    <div className="space-y-4 sm:space-y-5 pb-6">
      {/* 1. Time Filter Segmented Control */}
      <div data-tour="timeframe-filters">
        <SegmentedControl
          value={periodTab}
          onChange={(val) => setPeriodTab(val as PeriodTab)}
          options={[
            { value: 'TODAY', label: 'Today' },
            { value: 'THIS_WEEK', label: 'This Week' },
            { value: 'THIS_MONTH', label: 'This Month' },
          ]}
        />
      </div>

      {/* 2. Main Highlight Card with Wave Graphics (100% Dynamic Real Math) */}
      <div data-tour="wave-card">
        <WaveCard
          subtitle={periodSubtitle}
          statusDot={periodTotals.totalExpense.isPositive()}
          amount={periodTotals.totalExpense.format({ includeSymbol: false })}
          currencySymbol={currencySymbol}
          trendText={hasTransactions ? comparisonText : 'Clean Slate'}
          trendDirection={comparisonDir}
          metaText={totalBudgetMinor > 0 ? `Budget ${totalBudgetMoney.format()}` : 'No Budget Set'}
        />
      </div>

      {/* Safe-to-Spend Informational Bar */}
      <div
        data-tour="safe-to-spend"
        onClick={onOpenSafeToSpendExplainer}
        className="group flex items-center justify-between rounded-2xl bg-white p-3.5 sm:p-4 shadow-xs border border-emerald-100 hover:border-emerald-300 transition-all cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 shadow-xs">
            {is15DayMode ? <Calendar className="h-5 w-5 sm:h-6 sm:w-6" /> : <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-emerald-800">
                Safe to Spend
              </span>
              {is15DayMode ? (
                <span className="rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200 px-1.5 py-0.2 text-[9px] font-black">
                  15-Day Cycle
                </span>
              ) : (
                <span className="rounded-full bg-[#E5FA82] px-1.5 py-0.2 text-[9px] font-black text-[#122A1E]">
                  Protected
                </span>
              )}
            </div>
            <p className="truncate text-xs sm:text-sm font-semibold text-slate-600 mt-0.5">
              <span className="text-sm sm:text-base font-black text-slate-900">
                {MoneyValue.fromMinorUnits(safeToSpend.dailySafeToSpend, currency).format()}
              </span>
              /day ({safeToSpend.remainingDaysInPeriod} days remaining)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs sm:text-sm font-bold text-emerald-800 shrink-0">
          <span>Details</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>

      {/* Cash Flow Risk Alert (If Any) */}
      {risks.length > 0 && (
        <div className="rounded-2xl bg-rose-50/90 p-3.5 border border-rose-200/70">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h4 className="text-xs sm:text-sm font-bold text-rose-900">{risks[0].title}</h4>
              <p className="text-[11px] sm:text-xs text-rose-700 mt-0.5">{risks[0].description}</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Transaction Timeline Section */}
      <div className="space-y-4 pt-1">
        {!hasTransactions ? (
          /* Clean Zero-State Card when starting fresh */
          <div className="rounded-[28px] bg-white p-6 text-center border border-slate-200/80 shadow-xs space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-black text-slate-900">
                Ready to Track Real Money
              </h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1 font-medium">
                Your slate is clean at {currencySymbol}0. Tap the lime <strong>+</strong> button below to record your first income, bill, or daily expense.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenQuickAdd}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#122A1E] px-4 py-2 text-xs font-black text-[#D4F63D] shadow-sm hover:bg-[#183625] transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 stroke-[3]" />
              <span>Log First Transaction</span>
            </button>
          </div>
        ) : (
          /* Dynamic Date-Grouped Transaction List */
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                Recent Activity
              </span>
              <button
                type="button"
                onClick={() => onNavigateToTab('ALL_EXPENSES')}
                className="text-xs sm:text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
              >
                See all ({transactions.length})
              </button>
            </div>

            {sortedDates.slice(0, 4).map((dateStr) => {
              const dayTxList = groupedTxMap.get(dateStr) || [];
              const dateLabel = DateUtils.formatDisplayDate(dateStr);

              return (
                <div key={dateStr} className="space-y-2">
                  <div className="px-1">
                    <span className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
                      {dateLabel}
                    </span>
                  </div>
                  {dayTxList.map((tx) => (
                    <TransactionItem
                      key={tx.id}
                      transaction={tx}
                      category={categoryMap.get(tx.categoryId)}
                      accountName={accountMap.get(tx.accountId)?.name}
                      onClick={onSelectTransaction}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
