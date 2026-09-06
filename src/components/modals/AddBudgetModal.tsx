import React, { useState, useEffect } from 'react';
import { Budget, Category, CurrencyCode } from '../../types';
import { Modal } from '../ui/Modal';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { DateUtils } from '../../domain/date/DateUtils';
import { t } from '../../i18n/core';

interface AddBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>) => void;
  categories: Category[];
  currency: CurrencyCode;
  editingBudget?: Budget | null;
}

export const AddBudgetModal: React.FC<AddBudgetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  categories,
  currency,
  editingBudget,
}) => {
  const [name, setName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [period, setPeriod] = useState<'MONTHLY' | 'SEMI_MONTHLY_15_DAYS' | 'WEEKLY'>('MONTHLY');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [rollover, setRollover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(editingBudget?.name || '');
      setAmountStr(editingBudget ? MoneyValue.fromMinorUnits(editingBudget.amount, currency).format({ includeSymbol: false }) : '');
      setPeriod((editingBudget?.period as any) || 'MONTHLY');
      setCategoryIds(editingBudget?.categoryIds || []);
      setRollover(editingBudget?.rolloverUnused || false);
      setError(null);
    }
  }, [isOpen, editingBudget, currency]);

  const save = () => {
    const amount = MoneyValue.parse(amountStr || '0', currency).getMinorUnits();
    if (!name.trim()) { setError(t('tx.errors.nameRequired')); return; }
    if (amount <= 0) { setError(t('tx.errors.amountPositive')); return; }
    setError(null);

    const start = DateUtils.getTodayISO();
    const end = period === 'MONTHLY' ? DateUtils.getMonthEndISO(start)
      : period === 'WEEKLY' ? DateUtils.addDaysISO(start, 6)
      : DateUtils.getMonthEndISO(start); // semi-monthly approximated to month window

    onSave({
      userId: 'user-1',
      name: name.trim(),
      amount,
      currency,
      period,
      startDate: start,
      endDate: end,
      categoryIds,
      notifyThresholdPercentage: 80,
      isActive: true,
      rolloverUnused: rollover,
    });
  };

  const symbol = MoneyValue.zero(currency).getCurrencySymbol();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingBudget ? t('modal.editBudget') : t('modal.newBudget')} maxWidth="md">
      <div className="space-y-4">
        <Field label={t('modal.budgetName')}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('modal.budgetNamePlaceholder')} className={inputCls} />
        </Field>
        <Field label={t('modal.amountLabel', { symbol })}>
          <input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} type="number" inputMode="decimal" placeholder="0.00" className={inputCls} />
        </Field>
        <Field label={t('modal.cycle')}>
          <select value={period} onChange={(e) => setPeriod(e.target.value as any)} className={inputCls}>
            <option value="MONTHLY">{t('modal.monthly')}</option>
            <option value="SEMI_MONTHLY_15_DAYS">{t('modal.semiMonthly')}</option>
            <option value="WEEKLY">{t('modal.weekly')}</option>
          </select>
        </Field>
        <Field label={t('modal.categoriesOptional')}>
          <div className="flex flex-wrap gap-2">
            {categories.filter((c) => c.type === 'EXPENSE').map((c) => {
              const on = categoryIds.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => setCategoryIds((prev) => on ? prev.filter((id) => id !== c.id) : [...prev, c.id])}
                  className={`rounded-full px-3 py-1 text-xs font-bold border ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-(--surface) text-(--ink-2) border-(--line)'}`}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-xs font-semibold text-(--ink-2)">
          <input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} />
          {t('modal.rollover')}
        </label>

        {error ? (
          <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-(--line) px-4 py-2.5 text-sm font-bold text-(--ink-2)">{t('common.cancel')}</button>
          <button type="button" onClick={save} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">{editingBudget ? t('common.save') : t('modal.create')}</button>
        </div>
      </div>
    </Modal>
  );
};

const inputCls = 'w-full rounded-xl border border-(--line) px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <span className="text-xs font-bold text-(--ink-2)">{label}</span>
    {children}
  </div>
);
