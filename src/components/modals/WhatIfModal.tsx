import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import {
  Account,
  Budget,
  Category,
  MoneyCommitment,
  SavingsGoal,
  Transaction,
  UserSettings,
  WhatIfSimulationInput,
} from '../../types';
import { WhatIfEngine } from '../../domain/what-if/WhatIfEngine';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { DateUtils } from '../../domain/date/DateUtils';
import { Sparkles, ShieldCheck, AlertTriangle, AlertOctagon, ArrowRight, CheckCircle2 } from 'lucide-react';

interface WhatIfModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmAsRealTransaction: (tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: SavingsGoal[];
  commitments: MoneyCommitment[];
  categories: Category[];
  settings: UserSettings;
}

export const WhatIfModal: React.FC<WhatIfModalProps> = ({
  isOpen,
  onClose,
  onConfirmAsRealTransaction,
  accounts,
  transactions,
  budgets,
  goals,
  commitments,
  categories,
  settings,
}) => {
  const [title, setTitle] = useState('New Laptop');
  const [amountStr, setAmountStr] = useState('45000');
  const [type, setType] = useState<'EXPENSE' | 'INCOME' | 'RECURRING_EXPENSE'>('EXPENSE');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'cat-shopping');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [date, setDate] = useState(DateUtils.getTodayISO());

  const currency = settings.currency || 'PHP';
  const currencySymbol = MoneyValue.zero(currency).getCurrencySymbol();
  const inputMoney = MoneyValue.parse(amountStr, currency);

  const simulationInput: WhatIfSimulationInput = {
    title: title.trim() || 'Test Purchase',
    amount: inputMoney.getMinorUnits(),
    type,
    date,
    categoryId,
    accountId: accountId || accounts[0]?.id || '',
  };

  const simulationResult = WhatIfEngine.simulateScenario(
    simulationInput,
    accounts,
    transactions,
    budgets,
    goals,
    commitments,
    categories,
    settings
  );

  const handleApplyToReal = () => {
    if (simulationInput.amount <= 0) return;
    onConfirmAsRealTransaction({
      userId: 'user-1',
      type: type === 'INCOME' ? 'INCOME' : 'EXPENSE',
      amount: simulationInput.amount,
      currency,
      categoryId,
      accountId: simulationInput.accountId,
      merchant: simulationInput.title,
      note: 'Saved from Purchase Tester',
      date: simulationInput.date,
      time: new Date().toTimeString().substring(0, 5),
      tags: ['what-if-converted'],
      status: 'CONFIRMED',
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Test a Purchase" maxWidth="lg">
      <div className="space-y-4">
        {/* Notice Banner */}
        <div className="rounded-xl bg-amber-50 p-3 border border-amber-200/80 flex items-center gap-2.5 text-xs text-amber-900 font-semibold">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>Safe Testing:</strong> Testing a purchase here does not change your real balances or history.
          </span>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Item or Expense Name</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. New Phone, Vacation"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Cost / Amount</label>
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 focus-within:border-emerald-600">
              <span className="text-xs font-bold text-slate-400">{currencySymbol}</span>
              <input
                type="number"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0"
                className="w-full text-sm font-bold text-slate-900 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Pay From Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({MoneyValue.fromMinorUnits(a.currentBalance, currency).format()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Live Simulation Results */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          {/* Verdict Badge & Summary */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Result
              </span>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {simulationResult.summarySentence}
              </p>
            </div>

            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold shrink-0 ${
                simulationResult.verdict === 'SAFE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : simulationResult.verdict === 'CAUTION'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {simulationResult.verdict === 'SAFE' && <ShieldCheck className="h-4 w-4" />}
              {simulationResult.verdict === 'CAUTION' && <AlertTriangle className="h-4 w-4" />}
              {simulationResult.verdict === 'HIGH_RISK' && <AlertOctagon className="h-4 w-4" />}
              <span>{simulationResult.verdict === 'SAFE' ? 'SAFE TO BUY' : simulationResult.verdict === 'CAUTION' ? 'CAUTION' : 'HIGH RISK'}</span>
            </div>
          </div>

          {/* Metric Comparison Grid */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            {/* Safe-to-Spend Delta */}
            <div className="rounded-xl bg-slate-50 p-3">
              <span className="text-[11px] font-semibold text-slate-500 block">
                Daily Safe Limit
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-400 line-through font-semibold">
                  {MoneyValue.fromMinorUnits(simulationResult.baseSafeToSpendDaily, currency).format()}
                </span>
                <ArrowRight className="h-3 w-3 text-slate-400" />
                <span className="text-sm font-extrabold text-slate-900">
                  {MoneyValue.fromMinorUnits(simulationResult.simulatedSafeToSpendDaily, currency).format()}
                </span>
              </div>
            </div>

            {/* Month-End Projected Balance */}
            <div className="rounded-xl bg-slate-50 p-3">
              <span className="text-[11px] font-semibold text-slate-500 block">
                Estimated Money Left at Month End
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-400 line-through font-semibold">
                  {MoneyValue.fromMinorUnits(simulationResult.baseMonthEndProjectedBalance, currency).format()}
                </span>
                <ArrowRight className="h-3 w-3 text-slate-400" />
                <span className="text-sm font-extrabold text-slate-900">
                  {MoneyValue.fromMinorUnits(simulationResult.simulatedMonthEndProjectedBalance, currency).format()}
                </span>
              </div>
            </div>
          </div>

          {/* Budget Impact Warnings */}
          {simulationResult.affectedBudgets.length > 0 && (
            <div className="rounded-xl bg-amber-50/70 p-3 border border-amber-200/60 text-xs">
              <span className="font-bold text-amber-900 block mb-1">Affected Budgets:</span>
              {simulationResult.affectedBudgets.map((b) => (
                <div key={b.budgetId} className="text-amber-800">
                  • <strong>{b.budgetName}</strong>: Spending changes from{' '}
                  {MoneyValue.fromMinorUnits(b.originalProjectedSpent, currency).format()} to{' '}
                  <span className="font-bold text-rose-700">
                    {MoneyValue.fromMinorUnits(b.simulatedProjectedSpent, currency).format()}
                  </span>{' '}
                  (Budget limit: {MoneyValue.fromMinorUnits(b.budgetAmount, currency).format()})
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApplyToReal}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#122A1E] py-3 text-xs font-bold text-[#D4F63D] shadow-md hover:bg-[#183625] transition-colors cursor-pointer"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Save as Real Expense</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
