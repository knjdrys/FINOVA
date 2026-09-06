import React, { useEffect, useState } from 'react';
import {
  Account,
  Budget,
  Category,
  MoneyCommitment,
  RecurringTransaction,
  SavingsGoal,
  TimelineDay,
  Transaction,
  UserSettings,
  CurrencyCode,
  CURRENCY_CONFIGS,
  PlansSection,
} from '../types';
import { DateUtils } from '../domain/date/DateUtils';
import { MoneyValue } from '../domain/money/MoneyValue';
import { GoalEngine } from '../domain/goal/GoalEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { TimelineEngine } from '../domain/timeline/TimelineEngine';
import { t } from '../i18n/core';
import {
  Shield,
  Calendar,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
  Wallet,
  Repeat,
  MoreHorizontal,
} from 'lucide-react';

interface PlansScreenProps {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  goals: SavingsGoal[];
  commitments: MoneyCommitment[];
  recurring: RecurringTransaction[];
  settings: UserSettings;
  onOpenAddGoal: () => void;
  onOpenAddEmergencyFund: () => void;
  onOpenAddCommitment: () => void;
  onOpenAddPayday: () => void;
  onOpenAddBudget: () => void;
  onOpenAddRecurring: () => void;
  onEditBudget: (b: Budget) => void;
  onEditGoal: (g: SavingsGoal) => void;
  onEditCommitment: (c: MoneyCommitment) => void;
  onEditRecurring: (r: RecurringTransaction) => void;
  onDeleteBudget: (id: string) => void;
  onRestoreBudget: (id: string) => void;
  onDeleteGoal: (id: string) => void;
  onDeleteCommitment: (id: string) => void;
  onDeleteRecurring: (id: string) => void;
  onToggleRecurringActive: (id: string) => void;
  onSkipRecurring: (id: string) => void;
  onRescheduleRecurring: (id: string, newDate: string) => void;
  onCancelRecurring: (id: string) => void;
  onToggleCommitmentStatus: (id: string) => void;
  onCancelCommitment: (id: string) => void;
  onRescheduleCommitment: (id: string, newDueDate: string) => void;
  onFundGoal: (goalId: string, amount: number, fromAccountId: string) => void;
  onNavigateToTab: (tab: string) => void;
  /** Deep-link from Home alerts: which section to show on arrival. */
  initialSection?: PlansSection;
  /** Bumped on every Home deep-link so re-tapping the same section re-fires. */
  sectionNonce?: number;
}

type PlansSubTab = 'TIMELINE' | 'BUDGETS' | 'GOALS' | 'BILLS' | 'RECURRING';

export const PlansScreen: React.FC<PlansScreenProps> = ({
  accounts,
  transactions,
  budgets,
  goals,
  commitments,
  recurring,
  settings,
  onOpenAddGoal,
  onOpenAddEmergencyFund,
  onOpenAddCommitment,
  onOpenAddPayday,
  onOpenAddBudget,
  onOpenAddRecurring,
  onEditBudget,
  onEditGoal,
  onEditCommitment,
  onEditRecurring,
  onDeleteBudget,
  onRestoreBudget,
  onDeleteGoal,
  onDeleteCommitment,
  onDeleteRecurring,
  onToggleRecurringActive,
  onSkipRecurring,
  onRescheduleRecurring,
  onCancelRecurring,
  onToggleCommitmentStatus,
  onCancelCommitment,
  onRescheduleCommitment,
  onFundGoal,
  initialSection,
  sectionNonce,
}) => {
  const [subTab, setSubTab] = useState<PlansSubTab>(initialSection || 'TIMELINE');
  // Deep-link: when Home sends us to a section, honor it even if already mounted.
  useEffect(() => {
    if (initialSection) setSubTab(initialSection);
  }, [initialSection, sectionNonce]);
  const todayISO = DateUtils.getTodayISO();
  const currency = (settings.currency || accounts[0]?.currency || 'PHP') as CurrencyCode;

  const timeline: TimelineDay[] = TimelineEngine.generateTimeline(
    accounts,
    transactions,
    commitments,
    [],
    todayISO,
    DateUtils.addDaysISO(todayISO, 30),
    todayISO
  );

  return (
    <div className="space-y-4 pb-20">
      {/* Internal segments — no new top-level navigation tab */}
      <div className="flex rounded-xl bg-slate-100 p-1 text-[10px] font-bold">
        <Seg label="Timeline" active={subTab === 'TIMELINE'} onClick={() => setSubTab('TIMELINE')} />
        <Seg label="Budgets" active={subTab === 'BUDGETS'} onClick={() => setSubTab('BUDGETS')} />
        <Seg label="Goals" active={subTab === 'GOALS'} onClick={() => setSubTab('GOALS')} />
        <Seg label="Bills" active={subTab === 'BILLS'} onClick={() => setSubTab('BILLS')} />
        <Seg label="Recurring" active={subTab === 'RECURRING'} onClick={() => setSubTab('RECURRING')} />
      </div>

      {subTab === 'TIMELINE' && <TimelineView timeline={timeline} settings={settings} currency={currency} />}

      {subTab === 'BUDGETS' && (
        <BudgetsView
          budgets={budgets}
          transactions={transactions}
          onOpenAdd={onOpenAddBudget}
          onEdit={onEditBudget}
          onDelete={onDeleteBudget}
          onRestore={onRestoreBudget}
          currency={currency}
        />
      )}

      {subTab === 'GOALS' && (
        <GoalsView
          goals={goals}
          onOpenAdd={onOpenAddGoal}
          onOpenEmergencyFund={onOpenAddEmergencyFund}
          onEdit={onEditGoal}
          onDelete={onDeleteGoal}
          onFund={onFundGoal}
          accounts={accounts}
          currency={currency}
        />
      )}

      {subTab === 'BILLS' && (
        <BillsView
          commitments={commitments}
          onOpenAdd={onOpenAddCommitment}
          onOpenPayday={onOpenAddPayday}
          onEdit={onEditCommitment}
          onDelete={onDeleteCommitment}
          onToggle={onToggleCommitmentStatus}
          onCancel={onCancelCommitment}
          onReschedule={onRescheduleCommitment}
        />
      )}

      {subTab === 'RECURRING' && (
        <RecurringView
          recurring={recurring}
          onOpenAdd={onOpenAddRecurring}
          onEdit={onEditRecurring}
          onDelete={onDeleteRecurring}
          onToggleActive={onToggleRecurringActive}
          onSkip={onSkipRecurring}
          onReschedule={onRescheduleRecurring}
          onCancel={onCancelRecurring}
          currency={currency}
        />
      )}
    </div>
  );
};

const Seg: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-1 py-2 rounded-lg transition-all ${
      active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
    }`}
  >
    {label}
  </button>
);

const TimelineView: React.FC<{ timeline: TimelineDay[]; settings: UserSettings; currency: CurrencyCode }> = ({
  timeline,
  settings,
  currency,
}) => {
  const window = timeline.slice(0, 12);
  const hasAnyEvents = window.some((d) => d.events.length > 0);
  return (
  <div className="space-y-3">
    <div className="flex items-center justify-between px-1">
      <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">30-Day Cash Flow Projection</span>
      <span className="text-[11px] font-semibold text-emerald-800">Running Projected Balances</span>
    </div>
    <p className="px-1 text-[10px] font-medium text-slate-500">
      {t('plans.timelineLegend')}
    </p>
    {!hasAnyEvents && (
      <div className="rounded-2xl bg-white p-6 text-center border border-slate-200/80 shadow-xs space-y-2">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Calendar className="h-5 w-5" />
        </div>
        <p className="text-xs font-bold text-slate-800">{t('plans.timelineEmpty')}</p>
        <p className="text-[11px] font-medium text-slate-500 max-w-xs mx-auto">{t('plans.timelineEmptyHint')}</p>
      </div>
    )}
    <div className="space-y-3">
      {hasAnyEvents ? window.map((day) => {
        const hasEvents = day.events.length > 0;
        const projMoney = MoneyValue.fromMinorUnits(day.projectedEndOfDayBalance, currency);
        // Quiet days collapse to a one-line balance row — the projection stays
        // visible without a wall of "nothing scheduled" cards.
        if (!hasEvents && !day.isToday) {
          return (
            <div
              key={day.date}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-2 shadow-xs"
            >
              <span className="text-[11px] font-semibold text-slate-500">{day.dayLabel}</span>
              <span className={`text-[11px] font-extrabold ${day.projectedEndOfDayBalance < settings.minimumReserve ? 'text-rose-600' : 'text-slate-700'}`}>
                {projMoney.format()}
              </span>
            </div>
          );
        }
        return (
          <div
            key={day.date}
            className={`rounded-2xl border p-4 transition-all ${
              day.isToday ? 'bg-emerald-50/50 border-emerald-200/80 shadow-sm' : 'bg-white border-slate-100 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Calendar className={`h-4 w-4 ${day.isToday ? 'text-emerald-700' : 'text-slate-500'}`} />
                <span className="text-xs font-bold text-slate-800">{day.dayLabel}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 font-semibold block">Projected Balance</span>
                <span className={`text-xs font-extrabold ${day.projectedEndOfDayBalance < settings.minimumReserve ? 'text-rose-600' : 'text-slate-900'}`}>
                  {projMoney.format()}
                </span>
              </div>
            </div>
            {hasEvents ? (
              <div className="mt-2.5 space-y-2">
                {day.events.map((ev) => {
                  const evMoney = MoneyValue.fromMinorUnits(ev.amount, currency);
                  const isInflow = ev.direction === 'INFLOW';
                  return (
                    <div key={ev.id} className="flex items-center justify-between text-xs font-medium py-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            ev.status === 'ACTUAL'
                              ? 'bg-slate-100 text-slate-700'
                              : ev.status === 'OVERDUE'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {ev.status}
                        </span>
                        <span className="truncate text-slate-800 font-semibold">{ev.title}</span>
                      </div>
                      <span className={`shrink-0 font-extrabold ${isInflow ? 'text-emerald-700' : 'text-slate-900'}`}>
                        {isInflow ? '+' : '-'}
                        {evMoney.format()}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500 italic">No scheduled transactions or bills.</p>
            )}
          </div>
        );
      }) : null}
    </div>
  </div>
  );
};

const BudgetsView: React.FC<{
  budgets: Budget[];
  transactions: Transaction[];
  onOpenAdd: () => void;
  onEdit: (b: Budget) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  currency: CurrencyCode;
}> = ({ budgets, transactions, onOpenAdd, onEdit, onDelete, onRestore, currency }) => {
  const todayISO = DateUtils.getTodayISO();
  const activeBudgets = budgets.filter((b) => b.isActive);
  const archivedBudgets = budgets.filter((b) => !b.isActive);
  const [showArchived, setShowArchived] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Budgets</span>
        <button type="button" onClick={onOpenAdd} className="flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950">
          <Plus className="h-3.5 w-3.5" /> <span>New Budget</span>
        </button>
      </div>
      {budgets.length === 0 && <EmptyHint text="No budgets yet. Tap New Budget above to set a spending limit." />}
      <div className="space-y-3">
        {activeBudgets.map((b) => {
          const insight = BudgetEngine.getBudgetInsight(b, transactions, todayISO);
          const f = insight.forecast;
          const spentMoney = MoneyValue.fromMinorUnits(f.actualSpent, currency);
          const budgetMoney = MoneyValue.fromMinorUnits(f.budgetAmount, currency);
          const remainingMoney = MoneyValue.fromMinorUnits(Math.max(0, f.effectiveRemaining ?? f.remainingAmount), currency);
          const projectedMoney = MoneyValue.fromMinorUnits(f.projectedMonthEndSpent, currency);
          const pct = Math.min(100, f.percentageUsed);
          const barColor = f.status === 'OVER_BUDGET' ? '#E11D48' : f.status === 'AT_RISK' || f.status === 'NEAR_LIMIT' ? '#F59E0B' : '#059669';
          const riskBadge =
            insight.risk === 'HIGH'
              ? { text: t('plans.riskHIGH'), cls: 'bg-rose-100 text-rose-800' }
              : insight.risk === 'MEDIUM'
              ? { text: t('plans.riskMEDIUM'), cls: 'bg-amber-100 text-amber-800' }
              : insight.risk === 'LOW'
              ? { text: t('plans.riskLOW'), cls: 'bg-slate-200 text-slate-600' }
              : null;
          return (
            <div key={b.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">{b.name}</h4>
                    {riskBadge && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${riskBadge.cls}`}>{riskBadge.text}</span>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-slate-500">
                    {spentMoney.format()} / {budgetMoney.format()}
                    {b.rolloverUnused ? ' · rollover' : ''}
                  </p>
                </div>
                <RowActions onEdit={() => onEdit(b)} onDelete={() => onDelete(b.id)} />
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
              </div>
              <p className="text-[11px] font-medium text-slate-500">
                {t('plans.budgetLeftOver', { remaining: remainingMoney.format(), projected: projectedMoney.format() })}
                {insight.isOverBudget && (
                  <span className="font-bold text-rose-600"> · {t('plans.budgetOverBy', { amount: MoneyValue.fromMinorUnits(insight.projectedOverspend, currency).format() })}</span>
                )}
                {!insight.isOverBudget && insight.risk !== 'NONE' && insight.dailyAllowanceRemaining > 0 && (
                  <span className="font-bold text-amber-700"> · {t('plans.budgetDaily', { amount: MoneyValue.fromMinorUnits(insight.dailyAllowanceRemaining, currency).format() })}</span>
                )}
              </p>
            </div>
          );
        })}
      </div>
      {archivedBudgets.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 text-[11px] font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            {showArchived ? t('plans.archivedHide') : t('plans.archivedShow', { count: archivedBudgets.length })}
          </button>
          {showArchived && (
            <div className="mt-2 space-y-2">
              {archivedBudgets.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="text-xs font-bold text-slate-500">{b.name}</span>
                  <button
                    type="button"
                    onClick={() => onRestore(b.id)}
                    className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                  >
                    {t('plans.restoreBtn')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const GoalsView: React.FC<{
  goals: SavingsGoal[];
  onOpenAdd: () => void;
  onOpenEmergencyFund: () => void;
  onEdit: (g: SavingsGoal) => void;
  onDelete: (id: string) => void;
  onFund: (goalId: string, amount: number, fromAccountId: string) => void;
  accounts: Account[];
  currency: CurrencyCode;
}> = ({ goals, onOpenAdd, onOpenEmergencyFund, onEdit, onDelete, onFund, accounts, currency }) => {
  const todayISO = DateUtils.getTodayISO();
  const [fundingId, setFundingId] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState('');
  const [fundSource, setFundSource] = useState('');

  const activeGoals = goals.filter((g) => !g.isArchived);
  const hasEmergencyFund = activeGoals.some((g) => /emergency/i.test(g.name));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Savings Goals</span>
        <button type="button" onClick={onOpenAdd} className="flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950">
          <Plus className="h-3.5 w-3.5" /> <span>New Goal</span>
        </button>
      </div>
      {activeGoals.length === 0 && (
        <div className="space-y-2">
          <EmptyHint text="No goals yet. Tap New Goal above to start saving toward something." />
          <button
            type="button"
            onClick={onOpenEmergencyFund}
            className="flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left hover:bg-emerald-100/70 transition-colors cursor-pointer"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Shield className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-bold text-slate-900">{t('plans.efStart')}</span>
              <span className="block text-[11px] font-medium text-slate-500">{t('plans.efHint')}</span>
            </span>
          </button>
        </div>
      )}
      {!hasEmergencyFund && activeGoals.length > 0 && (
        <button
          type="button"
          onClick={onOpenEmergencyFund}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white py-2 text-[11px] font-bold text-slate-500 hover:border-emerald-300 hover:text-emerald-700 transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> {t('plans.efStart')}
        </button>
      )}
      <div className="space-y-3">
        {activeGoals.map((goal) => {
          const progress = GoalEngine.calculateGoalProgress(goal, todayISO);
          const insight = GoalEngine.getGoalInsight(goal, todayISO);
          const targetMoney = MoneyValue.fromMinorUnits(goal.targetAmount, currency);
          const currMoney = MoneyValue.fromMinorUnits(goal.currentAmount, currency);
          const monthlyRequired = MoneyValue.fromMinorUnits(progress.requiredMonthlySaving, currency);
          const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
          const suggested = Math.min(progress.requiredMonthlySaving, remaining);
          const riskBadge =
            insight.risk === 'HIGH'
              ? { text: t('plans.riskHIGH'), cls: 'bg-rose-100 text-rose-800' }
              : insight.risk === 'MEDIUM'
              ? { text: t('plans.riskMEDIUM'), cls: 'bg-amber-100 text-amber-800' }
              : insight.risk === 'LOW'
              ? { text: t('plans.riskLOW'), cls: 'bg-slate-200 text-slate-600' }
              : null;
          return (
            <div key={goal.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white font-bold" style={{ backgroundColor: goal.color }}>
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{goal.name}</h4>
                      {riskBadge && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${riskBadge.cls}`}>{riskBadge.text}</span>
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-slate-500">Target: {DateUtils.formatDisplayDate(goal.targetDate, { fullYear: true })}</p>
                    {goal.accountId && (
                      <p className="text-[10px] font-bold text-emerald-700">
                        {t('plans.savingInto', { name: accounts.find((a) => a.id === goal.accountId)?.name || 'linked account' })}
                      </p>
                    )}
                  </div>
                </div>
                <RowActions onEdit={() => onEdit(goal)} onDelete={() => onDelete(goal.id)} />
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-slate-800">{currMoney.format()}</span>
                  <span className="text-slate-500">{targetMoney.format()}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress.progressPercentage}%`, backgroundColor: goal.color }} />
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 text-[11px] font-medium text-slate-600 flex items-center justify-between">
                <span>Required Velocity:</span>
                <span className="font-bold text-slate-900">{monthlyRequired.format()}/mo</span>
              </div>
              {insight.variance < 0 && remaining > 0 && (
                <p className="text-[11px] font-semibold text-amber-700">
                  {t('plans.goalBehind', { amount: MoneyValue.fromMinorUnits(-insight.variance, currency).format() })}
                </p>
              )}
              {fundingId === goal.id ? (
                <div className="space-y-2 rounded-xl bg-emerald-50/60 p-3 border border-emerald-100">
                  {suggested > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const mult = CURRENCY_CONFIGS[currency]?.minorUnitMultiplier ?? 100;
                        setFundAmount(String(suggested / mult));
                      }}
                      className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                    >
                      {t('plans.fundSuggested', { amount: MoneyValue.fromMinorUnits(suggested, currency).format() })}
                    </button>
                  )}
                  <input
                    type="number"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="Amount"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <select value={fundSource} onChange={(e) => setFundSource(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="">From account…</option>
                    {accounts.filter((a) => a.currency === (goal.currency || currency)).map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({MoneyValue.fromMinorUnits(a.currentBalance, a.currency).format()})</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const amt = Math.round(Number(fundAmount) * 100);
                        if (amt > 0 && fundSource) {
                          onFund(goal.id, amt, fundSource);
                          setFundingId(null);
                          setFundAmount('');
                          setFundSource('');
                        }
                      }}
                      className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                    >
                      Fund
                    </button>
                    <button type="button" onClick={() => setFundingId(null)} className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => {
                  setFundingId(goal.id);
                  // Pre-select a source so Fund never silently no-ops: the goal's
                  // linked account first, else the first same-currency account.
                  const goalCurrency = goal.currency || currency;
                  const linked = accounts.find((a) => a.id === goal.accountId && a.currency === goalCurrency && !a.isArchived);
                  const fallback = accounts.find((a) => a.currency === goalCurrency && !a.isArchived);
                  setFundSource(linked?.id || fallback?.id || '');
                }} className="w-full rounded-xl border border-emerald-200 bg-emerald-50 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
                  Fund this goal
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const BillsView: React.FC<{
  commitments: MoneyCommitment[];
  onOpenAdd: () => void;
  onOpenPayday: () => void;
  onEdit: (c: MoneyCommitment) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onCancel: (id: string) => void;
  onReschedule: (id: string, newDueDate: string) => void;
}> = ({ commitments, onOpenAdd, onOpenPayday, onEdit, onDelete, onToggle, onCancel, onReschedule }) => {
  const [reschedId, setReschedId] = useState<string | null>(null);
  const [reschedDate, setReschedDate] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'OUT' | 'PLANNED' | 'IN'>('ALL');

  const visible = commitments.filter((c) => {
    if (filter === 'OUT') return c.direction === 'OUTFLOW' && c.type !== 'PLANNED_EXPENSE';
    if (filter === 'PLANNED') return c.type === 'PLANNED_EXPENSE';
    if (filter === 'IN') return c.direction === 'INFLOW';
    return true;
  });
  const sorted = [...visible].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Upcoming Bills & Liabilities</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onOpenPayday} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-emerald-700 transition-colors cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> <span>{t('plans.paydayBtn')}</span>
          </button>
          <button type="button" onClick={onOpenAdd} className="flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950">
            <Plus className="h-3.5 w-3.5" /> <span>Add Bill</span>
          </button>
        </div>
      </div>
      <div className="flex gap-1.5 px-1" role="tablist" aria-label="Filter commitments">
        {([['ALL', t('plans.billFilterAll')], ['OUT', t('plans.billFilterBills')], ['PLANNED', t('plans.billFilterPlanned')], ['IN', t('plans.billFilterIncome')]] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={filter === v}
            onClick={() => setFilter(v)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer ${
              filter === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {sorted.length === 0 && <EmptyHint text="No bills yet. Tap + Add Bill above to add a recurring obligation." />}
      <div className="space-y-2">
        {sorted.map((comm) => {
          const isCompleted = comm.status === 'COMPLETED' || comm.status === 'AUTO_POSTED';
          const isCancelled = comm.status === 'CANCELLED';
          const isOverdue = comm.status === 'OVERDUE';
          const statusBadge = isCompleted
            ? { text: 'PAID', cls: 'bg-emerald-100 text-emerald-800' }
            : isCancelled
            ? { text: 'CANCELLED', cls: 'bg-slate-200 text-slate-500' }
            : isOverdue
            ? { text: 'OVERDUE', cls: 'bg-rose-100 text-rose-800' }
            : { text: comm.status, cls: 'bg-amber-100 text-amber-800' };
          return (
            <div key={comm.id} className={`rounded-2xl p-4 border transition-all ${isCompleted ? 'bg-slate-50/70 border-slate-200/60 opacity-60' : isCancelled ? 'bg-slate-50/40 border-slate-200/40 opacity-50' : 'bg-white border-slate-100 shadow-sm'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => onToggle(comm.id)}
                    disabled={isCancelled}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${isCompleted ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 hover:border-emerald-600 disabled:opacity-40'}`}
                    aria-label={comm.direction === 'INFLOW' ? 'Mark received' : 'Mark paid'}
                  >
                    {isCompleted && <CheckCircle2 className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className={`text-xs font-bold text-slate-900 truncate ${isCompleted || isCancelled ? 'line-through' : ''}`}>{comm.title}</h4>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusBadge.cls}`}>{statusBadge.text}</span>
                    </div>
                    <p className="text-[11px] font-medium text-slate-500">Due: {DateUtils.formatDisplayDate(comm.dueDate, { fullYear: true })} • {comm.priority}{comm.autoPostEnabled ? ' • auto' : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs font-extrabold text-slate-900">{MoneyValue.fromMinorUnits(comm.amount, comm.currency).format()}</span>
                  <button type="button" onClick={() => onEdit(comm)} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100" aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <RowMenu
                    id={comm.id}
                    openId={menuId}
                    onOpen={setMenuId}
                    label={t('common.moreActions')}
                    items={[
                      ...(!isCancelled && !isCompleted
                        ? [{ label: t('plans.rescheduleBtn'), onSelect: () => { setReschedId(comm.id); setReschedDate(comm.dueDate); } }]
                        : []),
                      ...(!isCancelled && !isCompleted
                        ? [{ label: t('common.cancel'), onSelect: () => onCancel(comm.id) }]
                        : []),
                      { label: t('common.delete'), onSelect: () => onDelete(comm.id), danger: true },
                    ]}
                  />
                </div>
              </div>
              {reschedId === comm.id && (
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-50/60 p-2 border border-amber-100">
                  <input
                    type="date"
                    value={reschedDate}
                    onChange={(e) => setReschedDate(e.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => { if (reschedDate) { onReschedule(comm.id, reschedDate); setReschedId(null); } }}
                    className="rounded-lg bg-amber-600 px-2 py-1 text-[10px] font-bold text-white"
                  >Save</button>
                  <button type="button" onClick={() => setReschedId(null)} className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700">X</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RecurringView: React.FC<{
  recurring: RecurringTransaction[];
  onOpenAdd: () => void;
  onEdit: (r: RecurringTransaction) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string) => void;
  onSkip: (id: string) => void;
  onReschedule: (id: string, newDate: string) => void;
  onCancel: (id: string) => void;
  currency: CurrencyCode;
}> = ({ recurring, onOpenAdd, onEdit, onDelete, onToggleActive, onSkip, onReschedule, onCancel, currency }) => {
  const [reschedId, setReschedId] = useState<string | null>(null);
  const [reschedDate, setReschedDate] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const todayISO = DateUtils.getTodayISO();
  return (
  <div className="space-y-3">
    <div className="flex items-center justify-between px-1">
      <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Recurring Transactions</span>
      <button type="button" onClick={onOpenAdd} className="flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950">
        <Plus className="h-3.5 w-3.5" /> <span>Add Recurring</span>
      </button>
    </div>
    {recurring.length === 0 && <EmptyHint text="No recurring items. Tap + Add Recurring above to automate a bill or income." />}
    <div className="space-y-2">
      {recurring.map((r) => {
        const rMoney = MoneyValue.fromMinorUnits(r.amount, r.currency || currency);
        const ended = Boolean(r.endDate && r.endDate < todayISO);
        const auto = (r.autoPostEnabled ?? r.reminderEnabled) === true;
        const badge = !r.isActive
          ? ended
            ? { text: t('plans.stEnded'), cls: 'bg-slate-200 text-slate-500' }
            : { text: t('plans.stPaused'), cls: 'bg-slate-200 text-slate-500' }
          : { text: t('plans.stActive'), cls: 'bg-emerald-100 text-emerald-800' };
        return (
          <div key={r.id} className={`rounded-2xl p-4 border transition-all ${r.isActive ? 'bg-white border-slate-100 shadow-sm' : 'bg-slate-50/70 border-slate-200/60'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Repeat className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-900 truncate">{r.title}</h4>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.text}</span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500">{r.frequency} • {r.type} • Next: {DateUtils.formatDisplayDate(r.nextOccurrence, { fullYear: true })}{auto && r.isActive ? ` • ${t('plans.autoBadge')}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs font-extrabold text-slate-900">{rMoney.format()}</span>
                <button
                  type="button"
                  onClick={() => onToggleActive(r.id)}
                  aria-label={r.isActive ? t('plans.pauseBtn') : t('plans.resumeBtn')}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  {r.isActive ? t('plans.pauseBtn') : t('plans.resumeBtn')}
                </button>
                <button type="button" onClick={() => onEdit(r)} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100" aria-label="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <RowMenu
                  id={r.id}
                  openId={menuId}
                  onOpen={setMenuId}
                  label={t('common.moreActions')}
                  items={[
                    ...(r.isActive
                      ? [
                          { label: t('plans.skipNextBtn'), onSelect: () => onSkip(r.id) },
                          { label: t('plans.rescheduleBtn'), onSelect: () => { setReschedId(r.id); setReschedDate(r.nextOccurrence); } },
                          { label: t('common.cancel'), onSelect: () => onCancel(r.id) },
                        ]
                      : []),
                    { label: t('common.delete'), onSelect: () => onDelete(r.id), danger: true },
                  ]}
                />
              </div>
            </div>
            {reschedId === r.id && (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-50/60 p-2 border border-amber-100">
                <input
                  type="date"
                  value={reschedDate}
                  onChange={(e) => setReschedDate(e.target.value)}
                  aria-label="New next-occurrence date"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => { if (reschedDate) { onReschedule(r.id, reschedDate); setReschedId(null); } }}
                  className="rounded-lg bg-amber-600 px-2 py-1 text-[10px] font-bold text-white"
                >
                  {t('plans.moveBtn')}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
  );
};

const RowActions: React.FC<{ onEdit: () => void; onDelete: () => void }> = ({ onEdit, onDelete }) => (
  <div className="flex items-center gap-1 shrink-0">
    <button type="button" onClick={onEdit} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100" aria-label="Edit">
      <Pencil className="h-3.5 w-3.5" />
    </button>
    <button type="button" onClick={onDelete} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50" aria-label="Delete">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  </div>
);

/**
 * Overflow menu for secondary row actions. Primary state changes
 * (paid toggle, pause switch) and Edit stay visible; everything else
 * (reschedule, skip, cancel, delete) lives behind one "•••" button so
 * rows stay scannable as capability grows.
 */
const RowMenu: React.FC<{
  id: string;
  openId: string | null;
  onOpen: (id: string | null) => void;
  label: string;
  items: Array<{ label: string; onSelect: () => void; danger?: boolean }>;
}> = ({ id, openId, onOpen, label, items }) => {
  const open = openId === id;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => onOpen(open ? null : id)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} onClick={() => onOpen(null)} className="fixed inset-0 z-10 cursor-default" />
          <div
            role="menu"
            onKeyDown={(e) => { if (e.key === 'Escape') onOpen(null); }}
            className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpen(null);
                  item.onSelect();
                }}
                className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-bold transition-colors cursor-pointer ${
                  item.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const EmptyHint: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl bg-white p-6 text-center border border-slate-200/80 shadow-xs">
    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
      <Wallet className="h-5 w-5" />
    </div>
    <p className="text-xs text-slate-500 mt-2 font-medium max-w-xs mx-auto">{text}</p>
  </div>
);
