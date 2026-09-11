import React, { useState, useEffect } from 'react';
import {
  Account,
  Budget,
  Category,
  CurrencyCode,
  FinancialInsight,
  Notification,
  NotificationSeverity,
  PlansSection,
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
import { PlanningService } from '../services/planning/PlanningService';
import { BudgetProgressCard, FundGoalModal, GoalProgressCard, PlanDetailModal } from '../components/planning/PlanningWidgets';
import { ShieldCheck, ChevronRight, Calendar, Plus, Sparkles, Bell, Check, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { AnimatedMoney } from '../components/motion/AnimatedMoney';

interface HomeScreenProps {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  goals: SavingsGoal[];
  settings: UserSettings;
  safeToSpend: SafeToSpendResult;
  notifications: Notification[];
  insights: FinancialInsight[];
  onNavigateToTab: (tab: 'ALL_EXPENSES' | 'ANALYTICS' | 'SETTINGS' | 'PLANS') => void;
  onOpenPlansSection: (section: PlansSection) => void;
  onOpenSafeToSpendExplainer: () => void;
  onOpenQuickAdd: () => void;
  onAddIncome: () => void;
  onAddBudget: () => void;
  onAddEmergencyFund: () => void;
  onDismissChecklist: () => void;
  onSelectTransaction: (tx: Transaction) => void;
  onMarkNotificationRead: (id: string) => void;
  onFundGoal: (goalId: string, amountMinor: number) => void;
}

type PeriodTab = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH';

export const HomeScreen: React.FC<HomeScreenProps> = ({
  accounts,
  transactions,
  categories,
  budgets,
  goals,
  settings,
  safeToSpend,
  notifications,
  insights,
  onNavigateToTab,
  onOpenPlansSection,
  onOpenSafeToSpendExplainer,
  onOpenQuickAdd,
  onAddIncome,
  onAddBudget,
  onAddEmergencyFund,
  onDismissChecklist,
  onSelectTransaction,
  onMarkNotificationRead,
  onFundGoal,
}) => {
  const { t } = useI18n();
  const [periodTab, setPeriodTab] = useState<PeriodTab>(settings.defaultTrackingPeriod || 'TODAY');
  const [detailBudgetId, setDetailBudgetId] = useState<string | null>(null);
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null);
  const [fundingGoalId, setFundingGoalId] = useState<string | null>(null);

  useEffect(() => {
    if (settings.defaultTrackingPeriod) {
      setPeriodTab(settings.defaultTrackingPeriod);
    }
  }, [settings.defaultTrackingPeriod]);

  const todayISO = DateUtils.getTodayISO();
  const currency = (settings.currency || 'PHP') as CurrencyCode;
  const currencySymbol = MoneyValue.zero(currency).getCurrencySymbol();
  const is15DayMode = settings.budgetCycleMode === 'SEMI_MONTHLY_15_DAYS';

  // Most-relevant budgets/goals for Home (risk-ranked, capped) — the rest lives in Plans.
  const homePlans = PlanningService.selectHomePlans(budgets, goals, transactions, todayISO);
  const detailBudget = homePlans.budgets.find((i) => i.budget.id === detailBudgetId) || null;
  const detailGoal = homePlans.goals.find((i) => i.goal.id === detailGoalId) || null;
  const fundingGoal = goals.find((g) => g.id === fundingGoalId && !g.isArchived) || null;

  // Contextual action for an alert: jump to the entity it is about, not a
  // generic tab. Budget/goal alerts open their Plans section; bill alerts
  // open Bills; auto-post confirmations open the transaction itself.
  const handleNotificationAction = (n: Notification) => {
    if (n.kind === 'BUDGET_ALERT' && n.relatedBudgetId) {
      onOpenPlansSection('BUDGETS');
    } else if (n.kind === 'GOAL_ALERT' && n.relatedGoalId) {
      onOpenPlansSection('GOALS');
    } else if (n.kind === 'AUTO_POSTED' && n.relatedTransactionId) {
      const tx = transactions.find((x) => x.id === n.relatedTransactionId);
      if (tx) onSelectTransaction(tx);
      else onOpenPlansSection('BILLS');
    } else if (n.kind === 'RECURRING_UPCOMING') {
      onOpenPlansSection('RECURRING');
    } else if (n.kind === 'CASHFLOW_RISK') {
      onOpenPlansSection('TIMELINE');
    } else {
      onOpenPlansSection('BILLS');
    }
  };

  // Calm-state signal: when nothing needs attention (no unread alerts, no
  // plan risk), one quiet insight line (no card) so Home still feels alive.
  const hasUnreadAlerts = notifications.some((n) => !n.isRead);
  const calmInsight =
    !hasUnreadAlerts && !homePlans.hasRisk && insights.length > 0
      ? insights[0]
      : null;

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  // Calculate dynamic period totals from actual live transactions
  let periodStart = todayISO;
  let periodEnd = todayISO;
  let periodSubtitle = t('home.todayExpense');
  let comparisonText = t('home.vsYesterday');
  let comparisonDir: 'up' | 'down' | 'neutral' = 'neutral';

  if (periodTab === 'THIS_WEEK') {
    periodStart = DateUtils.addDaysISO(todayISO, -6);
    periodEnd = todayISO;
    periodSubtitle = t('home.weekExpense');
    comparisonText = t('home.past7Days');
    comparisonDir = 'neutral';
  } else if (periodTab === 'THIS_MONTH') {
    periodStart = DateUtils.getMonthStartISO(todayISO);
    periodEnd = DateUtils.getMonthEndISO(todayISO);
    periodSubtitle = t('home.monthExpense');
    comparisonText = t('home.currentMonth');
    comparisonDir = 'neutral';
  }

  const periodTotals = TransactionEngine.calculatePeriodTotals(transactions, periodStart, periodEnd, currency, currency);
  // Header budget figure must match what Home actually tracks: active budgets
  // in the active currency only. Summing archived or foreign-currency budgets
  // here would corrupt the "spent of budgeted" comparison.
  const totalBudgetMinor = budgets
    .filter((b) => b.isActive && (b.currency || currency) === currency)
    .reduce((sum, b) => sum + (b.amount || 0), 0);
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

  // First-run checklist: three guided wins (income → budget → emergency fund).
  // Retires itself once all are done or the user dismisses it — never nags.
  const hasIncome = transactions.some((tx) => tx.type === 'INCOME');
  const hasBudget = budgets.length > 0;
  const hasGoal = goals.some((g) => !g.isArchived);
  const showChecklist =
    !settings.hasDismissedChecklist && !(hasIncome && hasBudget && hasGoal);
  const checklistItems = [
    { key: 'income', label: t('home.checkIncome'), done: hasIncome, action: onAddIncome },
    { key: 'budget', label: t('home.checkBudget'), done: hasBudget, action: onAddBudget },
    { key: 'ef', label: t('home.checkEmergencyFund'), done: hasGoal, action: onAddEmergencyFund },
  ];

  return (
    <div className="space-y-4 sm:space-y-5 pb-6">
      {/* 1. Time Filter Segmented Control */}
      <div data-tour="timeframe-filters">
        <SegmentedControl
          value={periodTab}
          onChange={(val) => setPeriodTab(val as PeriodTab)}
          options={[
            { value: 'TODAY', label: t('home.periodToday') },
            { value: 'THIS_WEEK', label: t('home.periodThisWeek') },
            { value: 'THIS_MONTH', label: t('home.periodThisMonth') },
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
          trendText={hasTransactions ? comparisonText : t('home.cleanSlate')}
          trendDirection={comparisonDir}
          metaText={totalBudgetMinor > 0 ? t('home.budgetMeta', { amount: totalBudgetMoney.format() }) : t('home.noBudgetSet')}
        />
      </div>

      {/* Product Brain — single alert surface, ranked by priority.
          Focal item carries a contextual action; the rest stay compact.
          (Replaces the old standalone risk banner, which duplicated the
          feed's CASHFLOW_RISK row.) */}
      {notifications.length > 0 && (
        <NotificationCenter
          notifications={notifications}
          onMarkRead={onMarkNotificationRead}
          onAction={handleNotificationAction}
        />
      )}

      {/* Safe-to-Spend Informational Bar — turns rose in deficit, never green-lights overspending */}
      <div
        data-tour="safe-to-spend"
        role="button"
        tabIndex={0}
        aria-label={t('home.stsDetailsLabel')}
        onClick={onOpenSafeToSpendExplainer}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenSafeToSpendExplainer();
          }
        }}
        className={`group flex items-center justify-between rounded-2xl bg-(--surface) p-3.5 sm:p-4 shadow-xs border border-l-4 border-l-(--accent) transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
          safeToSpend.isDeficit ? 'border-rose-200 hover:border-rose-300' : 'border-emerald-100 hover:border-emerald-300'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl shadow-xs ${
            safeToSpend.isDeficit ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
          }`}>
            {is15DayMode ? <Calendar className="h-5 w-5 sm:h-6 sm:w-6" /> : <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] sm:text-xs font-black uppercase tracking-wider ${
                safeToSpend.isDeficit ? 'text-rose-800' : 'text-emerald-800 dark:text-emerald-300'
              }`}>
                {t('home.safeToSpend')}
              </span>
              {safeToSpend.isDeficit ? (
                <span className="rounded-full bg-rose-100 text-rose-900 border border-rose-200 px-1.5 py-0.2 text-[11px] font-black">
                  {t('home.overCommitted')}
                </span>
              ) : is15DayMode ? (
                <span className="rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200 px-1.5 py-0.2 text-[11px] font-black">
                  {t('home.fifteenDayCycle')}
                </span>
              ) : (
                <span className="rounded-full bg-[#E5FA82] px-1.5 py-0.2 text-[11px] font-black text-(--brand)">
                  {t('home.protected')}
                </span>
              )}
            </div>
            <p className="truncate text-xs sm:text-sm font-semibold text-(--ink-2) mt-0.5">
              <span className="text-sm sm:text-base font-black text-(--ink)">
                {/* AnimatedMoney: number tweens on success, respects reduced-motion */}
                <AnimatedMoney minor={safeToSpend.dailySafeToSpend} currency={currency} />
              </span>
              {t('home.perDayRemaining', { days: safeToSpend.remainingDaysInPeriod })}
              {(safeToSpend.essentialUpcomingCommitments > 0 || safeToSpend.reservedGoalContributions > 0) && (
                <span className="block truncate text-[11px] sm:text-[11px] font-medium text-(--ink-3)">
                  {t('home.stsPreview', {
                    bills: MoneyValue.fromMinorUnits(safeToSpend.essentialUpcomingCommitments, currency).format(),
                    goals: MoneyValue.fromMinorUnits(safeToSpend.reservedGoalContributions, currency).format(),
                  })}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs sm:text-sm font-bold text-emerald-800 dark:text-emerald-300 shrink-0">
          <span>{t('home.details')}</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>

      {/* Budgets & Goals — only the items that matter right now; tap for context detail */}
      {(homePlans.budgets.length > 0 || homePlans.goals.length > 0) && (
        <div className="space-y-2.5" data-tour="planning-glance">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-(--ink-2)">
              {homePlans.hasRisk ? t('home.needsAttention') : t('home.budgetsAndGoals')}
            </span>
            <button
              type="button"
              onClick={() => onNavigateToTab('PLANS')}
              className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 hover:text-emerald-900 transition-colors"
            >
              {t('home.viewAll')} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {homePlans.budgets.map((insight) => (
              <BudgetProgressCard
                key={insight.budget.id}
                insight={insight}
                currency={currency}
                onOpen={() => setDetailBudgetId(insight.budget.id)}
              />
            ))}
            {homePlans.goals.map((insight) => (
              <GoalProgressCard
                key={insight.goal.id}
                insight={insight}
                currency={currency}
                onOpen={() => setDetailGoalId(insight.goal.id)}
                onFund={() => setFundingGoalId(insight.goal.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Calm state: one quiet insight line — no card, no chrome */}
      {calmInsight && (
        <button
          type="button"
          onClick={() => onNavigateToTab('ANALYTICS')}
          className="flex w-full items-center gap-2 px-1 text-left group"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-(--ink-3) group-hover:text-(--ink-2) transition-colors">
            {calmInsight.title}
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-(--ink-3) transition-colors" />
        </button>
      )}

      {/* 3. Transaction Timeline Section */}
      <div className="space-y-4 pt-1">
        {showChecklist ? (
          /* First-run checklist: 3 guided wins, then it retires itself. */
          <div className="rounded-[28px] bg-(--surface) p-5 text-center border border-(--line)/80 shadow-xs space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="text-sm sm:text-base font-black text-(--ink)">
                  {t('home.checklistTitle')}
                </h4>
                <p className="text-xs text-(--ink-3) mt-0.5 font-medium">
                  {t('home.checklistDone', { done: checklistItems.filter((i) => i.done).length })}
                </p>
              </div>
              <button
                type="button"
                onClick={onDismissChecklist}
                aria-label={t('home.checklistDismiss')}
                className="flex h-7 w-7 items-center justify-center rounded-full text-(--ink-3) hover:text-(--ink-2) hover:bg-(--surface-3) transition-colors cursor-pointer shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 text-left">
              {checklistItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.action}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors cursor-pointer ${
                    item.done
                      ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-950/40'
                      : 'border-(--line) bg-(--surface) hover:border-emerald-300'
                  }`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    item.done ? 'bg-emerald-600 text-white' : 'border border-(--line-2) text-transparent'
                  }`}>
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span className={`text-xs font-bold ${item.done ? 'text-(--ink-3) line-through' : 'text-(--ink)'}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : !hasTransactions ? (
          /* Clean Zero-State Card when starting fresh */
          <div className="rounded-[28px] bg-(--surface) p-6 text-center border border-(--line)/80 shadow-xs space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-black text-(--ink)">
                {t('home.readyToTrack')}
              </h4>
              <p className="text-xs text-(--ink-3) max-w-xs mx-auto mt-1 font-medium">
                {t('home.readyToTrackHint', { amount: `${currencySymbol}0` })}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenQuickAdd}
              className="inline-flex items-center gap-1.5 rounded-xl bg-(--brand) px-4 py-2 text-xs font-black text-(--accent) shadow-sm hover:bg-(--brand-hover) transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 stroke-[3]" />
              <span>{t('home.logFirstTransaction')}</span>
            </button>
          </div>
        ) : (
          /* Dynamic Date-Grouped Transaction List */
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm sm:text-base font-black text-(--ink) tracking-tight">
                {t('home.recentActivity')}
              </span>
              <button
                type="button"
                onClick={() => onNavigateToTab('ALL_EXPENSES')}
                className="text-xs sm:text-sm font-bold text-(--ink-3) hover:text-(--ink) transition-colors cursor-pointer"
              >
                {t('home.seeAllCount', { count: transactions.length })}
              </button>
            </div>

            {sortedDates.slice(0, 4).map((dateStr) => {
              const dayTxList = groupedTxMap.get(dateStr) || [];
              const dateLabel = DateUtils.formatDisplayDate(dateStr);

              return (
                <div key={dateStr} className="space-y-2 motion-stagger">
                  <div className="px-1">
                    <span className="text-xs sm:text-sm font-black text-(--ink) tracking-tight">
                      {dateLabel}
                    </span>
                  </div>
                  {dayTxList.map((tx) => (
                    <TransactionItem
                      key={tx.id}
                      transaction={tx}
                      category={categoryMap.get(tx.categoryId)}
                      accountName={accountMap.get(tx.accountId)?.name}
                      destinationAccountName={
                        tx.destinationAccountId ? accountMap.get(tx.destinationAccountId)?.name : undefined
                      }
                      categories={categories}
                      onClick={onSelectTransaction}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contextual detail + funding flows (progressive disclosure from the cards above) */}
      <PlanDetailModal
        budgetInsight={detailBudget}
        goalInsight={detailGoal}
        currency={currency}
        onClose={() => { setDetailBudgetId(null); setDetailGoalId(null); }}
        onFundGoal={detailGoal ? () => { setFundingGoalId(detailGoal.goal.id); setDetailGoalId(null); } : undefined}
      />
      <FundGoalModal
        goal={fundingGoal}
        currency={currency}
        onClose={() => setFundingGoalId(null)}
        onConfirm={(amountMinor) => fundingGoal && onFundGoal(fundingGoal.id, amountMinor)}
      />
    </div>
  );
};

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onAction: (n: Notification) => void;
}

const severityStyle: Record<NotificationSeverity, { box: string; dot: string }> = {
  HIGH: { box: 'border-rose-200/70 bg-rose-50/80', dot: 'bg-rose-500' },
  MEDIUM: { box: 'border-amber-200/70 bg-amber-50/80', dot: 'bg-amber-500' },
  LOW: { box: 'border-(--line)/70 bg-(--surface-2)/80', dot: 'bg-slate-400' },
  INFO: { box: 'border-(--line)/70 bg-(--surface-2)/80', dot: 'bg-slate-400' },
};

/**
 * The single alert surface on Home. The first unread item is the focal
 * point (full body + explicit action); everything else stays compact so
 * attention has a ranking, not just a list.
 */
const NotificationCenter: React.FC<NotificationCenterProps> = ({ notifications, onMarkRead, onAction }) => {
  const { t } = useI18n();
  const unread = notifications.filter((n) => !n.isRead).length;
  const [focal, ...rest] = notifications.slice(0, 5);
  if (!focal) return null;
  const fst = severityStyle[focal.severity];
  const actionLabel =
    focal.kind === 'AUTO_POSTED'
      ? t('home.viewTransaction')
      : focal.kind === 'CASHFLOW_RISK'
        ? t('home.viewTimeline')
        : t('home.open');
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 px-1">
        <Bell className="h-3.5 w-3.5 text-(--ink-3)" />
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-(--ink-2)">{t('home.alerts')}</span>
        {unread > 0 && (
          <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{unread}</span>
        )}
      </div>

      {/* Focal alert — full detail + contextual action */}
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAction(focal); } }}
        onClick={() => onAction(focal)}
        className={`rounded-2xl border p-3.5 flex items-start gap-2.5 cursor-pointer transition-shadow hover:shadow-sm ${focal.isRead ? 'opacity-55 ' + fst.box : fst.box}`}
      >
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${fst.dot}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h4 className="text-xs sm:text-[13px] font-bold text-(--ink)">{focal.title}</h4>
          {focal.body && <p className="text-[11px] sm:text-xs text-(--ink-2) mt-0.5">{focal.body}</p>}
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg bg-(--surface)/80 px-2 py-1 text-[11px] font-black text-(--ink-2) shadow-xs">
              {actionLabel} <ChevronRight className="h-3 w-3" />
            </span>
            {!focal.isRead && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMarkRead(focal.id); }}
                className="rounded-lg px-2 py-1 text-[11px] font-bold text-(--ink-3) hover:bg-(--surface)/70 hover:text-(--ink-2) transition-colors"
              >
                {t('home.markRead')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Secondary alerts — compact one-liners, same contextual action */}
      {rest.map((n) => {
        const st = severityStyle[n.severity];
        return (
          <div
            key={n.id}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAction(n); } }}
            onClick={() => onAction(n)}
            className={`rounded-xl border px-3 py-2 flex items-center gap-2 cursor-pointer ${n.isRead ? 'opacity-55 ' + st.box : st.box}`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-(--ink-2)">{n.title}</span>
            {!n.isRead && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMarkRead(n.id); }}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-(--ink-3) hover:bg-(--surface)/70 hover:text-(--ink-2) transition-colors"
                aria-label={t('home.markRead')}
              >
                ✓
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
