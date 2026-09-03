import React from 'react';
import { Modal } from '../ui/Modal';
import { SafeToSpendResult, UserSettings } from '../../types';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { Sparkles, CheckCircle2, ArrowDownRight, Minus, Plus } from 'lucide-react';

interface SafeToSpendExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  safeToSpend: SafeToSpendResult;
  settings: UserSettings;
}

export const SafeToSpendExplainerModal: React.FC<SafeToSpendExplainerModalProps> = ({
  isOpen,
  onClose,
  safeToSpend,
  settings,
}) => {
  const currency = settings.currency || 'PHP';
  const dailyMoney = MoneyValue.fromMinorUnits(safeToSpend.dailySafeToSpend, currency);
  const weeklyMoney = MoneyValue.fromMinorUnits(safeToSpend.weeklySafeToSpend, currency);
  const poolMoney = MoneyValue.fromMinorUnits(safeToSpend.discretionaryPool, currency);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Safe-to-Spend Limit">
      <div className="space-y-4">
        {/* Highlight Card */}
        <div className="rounded-2xl bg-gradient-to-br from-[#122A1E] to-[#183625] p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300 uppercase tracking-wider">
            <Sparkles className="h-4 w-4 text-[#D4F63D]" />
            <span>Your Daily Limit</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {dailyMoney.format()}
            </span>
            <span className="text-sm font-semibold text-emerald-200">/ day</span>
          </div>
          <p className="mt-1 text-xs text-emerald-200/80">
            or <span className="font-bold text-white">{weeklyMoney.format()}</span> per week • {safeToSpend.periodLabel}
          </p>
        </div>

        {/* Step-by-Step Breakdown */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            How We Calculate Your Limit
          </h4>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            {safeToSpend.explanation.steps.map((step, idx) => {
              const stepMoney = MoneyValue.fromMinorUnits(step.amount, currency);
              return (
                <div key={idx} className="p-3.5 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5 ${
                        step.isDeduction
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {step.isDeduction ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{step.label}</p>
                      <p className="text-[11px] text-slate-500">{step.description}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-extrabold ${
                      step.isDeduction ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {step.isDeduction ? '-' : ''}
                    {stepMoney.format()}
                  </span>
                </div>
              );
            })}

            {/* Total Money Available */}
            <div className="p-3.5 bg-slate-50 flex items-center justify-between font-bold text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <ArrowDownRight className="h-4 w-4 text-emerald-700" />
                <span>Total Money Available to Spend</span>
              </div>
              <span className="text-sm font-extrabold text-slate-900">
                {poolMoney.format()}
              </span>
            </div>
          </div>
        </div>

        {/* Division explanation */}
        <div className="rounded-xl bg-emerald-50/60 p-3.5 border border-emerald-100/80">
          <div className="flex items-start gap-2 text-xs text-emerald-950 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 mt-0.5" />
            <p>
              Dividing {poolMoney.format()} by the <strong>{safeToSpend.remainingDaysInPeriod} days left</strong> ensures your bills and savings stay safe until your next payday.
            </p>
          </div>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
        >
          Got It
        </button>
      </div>
    </Modal>
  );
};
