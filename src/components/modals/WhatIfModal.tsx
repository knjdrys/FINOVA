import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Field } from '../ui/Field';
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
import { TransactionEngine } from '../../domain/transaction/TransactionEngine';
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
  const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'cat-shopping');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [date] = useState(DateUtils.getTodayISO());
  const [applyError, setApplyError] = useState<string | null>(null);

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
    // Saving a sim as real money runs the same guards as manual entry —
    // applying an over-budget test must fail loudly, not drive a negative.
    const validationError = TransactionEngine.validateTransaction(
      {
        type: type === 'INCOME' ? 'INCOME' : 'EXPENSE',
        amount: simulationInput.amount,
        currency,
        accountId: simulationInput.accountId,
      },
      accounts
    );
    if (validationError) {
      setApplyError(validationError);
      return;
    }
    setApplyError(null);
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
    <Modal isOpen={isOpen} onClose={onClose} title={type === 'INCOME' ? 'Test Extra Income' : 'Test a Purchase'} maxWidth="lg">
      <div className="space-y-4">
        {/* Notice Banner */}
        <div className="rounded-xl bg-amber-50 p-3 border border-amber-200/80 flex items-center gap-2.5 text-xs text-amber-900 font-semibold">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <strong>Safe Testing:</strong> Testing here does not change your real balances or history.
          </span>
        </div>

        {/* Expense / Income toggle */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-(--surface-2) p-1 border border-(--line)/80" role="tablist" aria-label="Simulation type">
          {(['EXPENSE', 'INCOME'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={type === v}
              onClick={() => { setType(v); setApplyError(null); }}
              className={`rounded-lg py-2 text-xs font-bold transition-colors cursor-pointer ${type === v ? 'bg-(--surface) text-(--ink) shadow-sm' : 'text-(--ink-3) hover:text-(--ink)'}`}
            >
              {v === 'EXPENSE' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-(--surface-2) p-4 rounded-2xl border border-(--line)/80">
          <Field label={type === 'INCOME' ? 'Income Name' : 'Item or Expense Name'}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. New Phone, Vacation"
              className="w-full rounded-xl border border-(--line) bg-(--surface) px-3 py-2 text-xs font-semibold text-(--ink) outline-none focus:border-emerald-600"
            />
          </Field>

          <div>
            <label htmlFor="whatif-amount" className="text-xs font-bold text-(--ink-2) block mb-1">Cost / Amount</label>
            <div className="flex items-center gap-1.5 rounded-xl border border-(--line) bg-(--surface) px-3 py-1.5 focus-within:border-emerald-600">
              <span className="text-xs font-bold text-(--ink-3)">{currencySymbol}</span>
              <input
                id="whatif-amount"
                type="number"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0"
                className="w-full text-sm font-bold text-(--ink) outline-none"
              />
            </div>
          </div>

          <Field label="Category">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-xl border border-(--line) bg-(--surface) px-3 py-2 text-xs font-semibold text-(--ink) outline-none"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={type === 'INCOME' ? 'To Account' : 'Pay From Account'}>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-xl border border-(--line) bg-(--surface) px-3 py-2 text-xs font-semibold text-(--ink) outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({MoneyValue.fromMinorUnits(a.currentBalance, a.currency).format()})
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Live Simulation Results */}
        <div className="rounded-2xl border border-(--line) bg-(--surface) p-4 shadow-sm space-y-3">
          {/* Verdict Badge & Summary */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-(--ink-3) uppercase tracking-wider block">
                Result
              </span>
              <p className="text-sm font-bold text-(--ink) mt-0.5">
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
              <span>{simulationResult.verdict === 'SAFE' ? (type === 'INCOME' ? 'LOOKS GOOD' : 'SAFE TO BUY') : simulationResult.verdict === 'CAUTION' ? 'CAUTION' : 'HIGH RISK'}</span>
            </div>
          </div>

          {/* Metric Comparison Grid */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-(--line-soft)">
            {/* Safe-to-Spend Delta */}
            <div className="rounded-xl bg-(--surface-2) p-3">
              <span className="text-[11px] font-semibold text-(--ink-3) block">
                Daily Safe Limit
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-(--ink-3) line-through font-semibold">
                  {MoneyValue.fromMinorUnits(simulationResult.baseSafeToSpendDaily, currency).format()}
                </span>
                <ArrowRight className="h-3 w-3 text-(--ink-3)" />
                <span className="text-sm font-extrabold text-(--ink)">
                  {MoneyValue.fromMinorUnits(simulationResult.simulatedSafeToSpendDaily, currency).format()}
                </span>
              </div>
            </div>

            {/* Month-End Projected Balance */}
            <div className="rounded-xl bg-(--surface-2) p-3">
              <span className="text-[11px] font-semibold text-(--ink-3) block">
                Estimated Money Left at Month End
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-(--ink-3) line-through font-semibold">
                  {MoneyValue.fromMinorUnits(simulationResult.baseMonthEndProjectedBalance, currency).format()}
                </span>
                <ArrowRight className="h-3 w-3 text-(--ink-3)" />
                <span className="text-sm font-extrabold text-(--ink)">
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
        {applyError && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800" role="alert">
            {applyError}
          </p>
        )}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-(--surface-3) py-3 text-xs font-bold text-(--ink-2) hover:bg-(--line) transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApplyToReal}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-(--brand) py-3 text-xs font-bold text-(--accent) shadow-md hover:bg-(--brand-hover) transition-colors cursor-pointer"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{type === 'INCOME' ? 'Save as Real Income' : 'Save as Real Expense'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
