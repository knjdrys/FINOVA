import React, { useState } from 'react';
import {
  Account,
  Category,
  MoneyCommitment,
  RecurringTransaction,
  SavingsGoal,
  TimelineDay,
  Transaction,
  UserSettings,
} from '../types';
import { DateUtils } from '../domain/date/DateUtils';
import { MoneyValue } from '../domain/money/MoneyValue';
import { GoalEngine } from '../domain/goal/GoalEngine';
import { TimelineEngine } from '../domain/timeline/TimelineEngine';
import {
  Target,
  Calendar,
  Shield,
  Zap,
  CheckCircle2,
  Clock,
  Plus,
  TrendingUp,
  AlertCircle,
  Laptop,
} from 'lucide-react';

interface PlansScreenProps {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  goals: SavingsGoal[];
  commitments: MoneyCommitment[];
  recurring: RecurringTransaction[];
  settings: UserSettings;
  onOpenAddGoal: () => void;
  onOpenAddCommitment: () => void;
  onToggleCommitmentStatus: (commitmentId: string) => void;
}

type PlansSubTab = 'TIMELINE' | 'GOALS' | 'COMMITMENTS';

export const PlansScreen: React.FC<PlansScreenProps> = ({
  accounts,
  transactions,
  categories,
  goals,
  commitments,
  settings,
  onOpenAddGoal,
  onOpenAddCommitment,
  onToggleCommitmentStatus,
}) => {
  const [subTab, setSubTab] = useState<PlansSubTab>('TIMELINE');
  const todayISO = DateUtils.getTodayISO();
  const currency = settings.currency || 'PKR';
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // Generate 30-day timeline
  const timeline: TimelineDay[] = TimelineEngine.generateTimeline(
    accounts,
    transactions,
    commitments,
    categories,
    todayISO,
    DateUtils.addDaysISO(todayISO, 30),
    todayISO
  );

  return (
    <div className="space-y-4 pb-20">
      {/* Plans Section Navigation */}
      <div className="flex rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setSubTab('TIMELINE')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            subTab === 'TIMELINE'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Timeline
        </button>
        <button
          type="button"
          onClick={() => setSubTab('GOALS')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            subTab === 'GOALS'
              ? 'bg-white text-emerald-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Goals ({goals.filter((g) => !g.isArchived).length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('COMMITMENTS')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
            subTab === 'COMMITMENTS'
              ? 'bg-white text-blue-800 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Bills ({commitments.filter((c) => c.status !== 'COMPLETED').length})
        </button>
      </div>

      {/* SUB-TAB 1: FINANCIAL TIMELINE */}
      {subTab === 'TIMELINE' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              30-Day Cash Flow Projection
            </span>
            <span className="text-[11px] font-semibold text-emerald-800">
              Running Projected Balances
            </span>
          </div>

          <div className="space-y-3">
            {timeline.slice(0, 10).map((day) => {
              const hasEvents = day.events.length > 0;
              const projMoney = MoneyValue.fromMinorUnits(day.projectedEndOfDayBalance, currency);

              return (
                <div
                  key={day.date}
                  className={`rounded-2xl border p-4 transition-all ${
                    day.isToday
                      ? 'bg-emerald-50/50 border-emerald-200/80 shadow-sm'
                      : 'bg-white border-slate-100 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Calendar className={`h-4 w-4 ${day.isToday ? 'text-emerald-700' : 'text-slate-400'}`} />
                      <span className="text-xs font-bold text-slate-800">
                        {day.dayLabel}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        Projected Balance
                      </span>
                      <span
                        className={`text-xs font-extrabold ${
                          day.projectedEndOfDayBalance < settings.minimumReserve
                            ? 'text-rose-600'
                            : 'text-slate-900'
                        }`}
                      >
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
                          <div
                            key={ev.id}
                            className="flex items-center justify-between text-xs font-medium py-1"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                                  ev.status === 'ACTUAL'
                                    ? 'bg-slate-100 text-slate-700'
                                    : ev.status === 'OVERDUE'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {ev.status}
                              </span>
                              <span className="truncate text-slate-800 font-semibold">
                                {ev.title}
                              </span>
                            </div>

                            <span
                              className={`shrink-0 font-extrabold ${
                                isInflow ? 'text-emerald-700' : 'text-slate-900'
                              }`}
                            >
                              {isInflow ? '+' : '-'}
                              {evMoney.format()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-400 italic">
                      No scheduled transactions or bills.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: SAVINGS GOALS */}
      {subTab === 'GOALS' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              Active Savings Goals
            </span>
            <button
              type="button"
              onClick={onOpenAddGoal}
              className="flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Goal</span>
            </button>
          </div>

          <div className="space-y-3">
            {goals.map((goal) => {
              const progress = GoalEngine.calculateGoalProgress(goal, todayISO);
              const targetMoney = MoneyValue.fromMinorUnits(goal.targetAmount, currency);
              const currMoney = MoneyValue.fromMinorUnits(goal.currentAmount, currency);
              const monthlyRequired = MoneyValue.fromMinorUnits(progress.requiredMonthlySaving, currency);

              return (
                <div
                  key={goal.id}
                  className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-white font-bold"
                        style={{ backgroundColor: goal.color }}
                      >
                        <Shield className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{goal.name}</h4>
                        <p className="text-[11px] font-medium text-slate-500">
                          Target: {DateUtils.formatDisplayDate(goal.targetDate, { fullYear: true })}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        progress.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : progress.status === 'ON_TRACK'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {progress.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-slate-800">{currMoney.format()}</span>
                      <span className="text-slate-400">{targetMoney.format()}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${progress.progressPercentage}%`,
                          backgroundColor: goal.color,
                        }}
                      />
                    </div>
                  </div>

                  {/* Required Velocity */}
                  <div className="rounded-xl bg-slate-50 p-2.5 text-[11px] font-medium text-slate-600 flex items-center justify-between">
                    <span>Required Velocity:</span>
                    <span className="font-bold text-slate-900">
                      {monthlyRequired.format()}/mo
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: BILLS & COMMITMENTS */}
      {subTab === 'COMMITMENTS' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              Upcoming Bills & Liabilities
            </span>
            <button
              type="button"
              onClick={onOpenAddCommitment}
              className="flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Bill</span>
            </button>
          </div>

          <div className="space-y-2">
            {commitments.map((comm) => {
              const commMoney = MoneyValue.fromMinorUnits(comm.amount, currency);
              const isCompleted = comm.status === 'COMPLETED';

              return (
                <div
                  key={comm.id}
                  className={`flex items-center justify-between rounded-2xl p-4 border transition-all ${
                    isCompleted
                      ? 'bg-slate-50/70 border-slate-200/60 opacity-60'
                      : 'bg-white border-slate-100 shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => onToggleCommitmentStatus(comm.id)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        isCompleted
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 hover:border-emerald-600'
                      }`}
                    >
                      {isCompleted && <CheckCircle2 className="h-4 w-4" />}
                    </button>

                    <div className="min-w-0">
                      <h4 className={`text-xs font-bold text-slate-900 truncate ${isCompleted ? 'line-through' : ''}`}>
                        {comm.title}
                      </h4>
                      <p className="text-[11px] font-medium text-slate-500">
                        Due: {DateUtils.formatDisplayDate(comm.dueDate, { fullYear: true })} • {comm.priority}
                      </p>
                    </div>
                  </div>

                  <span className="shrink-0 text-xs font-extrabold text-slate-900">
                    {commMoney.format()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
