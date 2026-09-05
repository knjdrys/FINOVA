import React, { useState, useEffect } from 'react';
import { RecurringTransaction, Account, Category, CurrencyCode, TransactionType, RecurringFrequency } from '../../types';
import { Modal } from '../ui/Modal';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { DateUtils } from '../../domain/date/DateUtils';
import { t } from '../../i18n/core';

interface AddRecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  accounts: Account[];
  categories: Category[];
  currency: CurrencyCode;
  editingRecurring?: RecurringTransaction | null;
}

export const AddRecurringModal: React.FC<AddRecurringModalProps> = ({
  isOpen,
  onClose,
  onSave,
  accounts,
  categories,
  currency,
  editingRecurring,
}) => {
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [frequency, setFrequency] = useState<RecurringFrequency>('MONTHLY');
  const [startDate, setStartDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('cat-bills');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(editingRecurring?.title || '');
      setAmountStr(editingRecurring ? MoneyValue.fromMinorUnits(editingRecurring.amount, editingRecurring.currency || currency).format({ includeSymbol: false }) : '');
      setType(editingRecurring?.type || 'EXPENSE');
      setFrequency(editingRecurring?.frequency || 'MONTHLY');
      setStartDate(editingRecurring?.startDate || DateUtils.getTodayISO());
      setAccountId(editingRecurring?.accountId || accounts[0]?.id || '');
      setCategoryId(editingRecurring?.categoryId || 'cat-bills');
      setError(null);
    }
  }, [isOpen, editingRecurring, accounts, currency]);

  const save = () => {
    const amount = MoneyValue.parse(amountStr || '0', currency).getMinorUnits();
    if (!title.trim()) { setError(t('tx.errors.titleRequired')); return; }
    if (amount <= 0) { setError(t('tx.errors.amountPositive')); return; }
    if (!accountId) { setError(t('tx.errors.accountRequired')); return; }
    setError(null);

    onSave({
      userId: 'user-1',
      title: title.trim(),
      amount,
      currency,
      type,
      categoryId,
      accountId,
      frequency,
      startDate,
      nextOccurrence: startDate,
      isActive: true,
      reminderEnabled: true,
    });
  };

  const symbol = MoneyValue.zero(currency).getCurrencySymbol();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingRecurring ? t('modal.editRecurring') : t('modal.newRecurring')} maxWidth="md">
      <div className="space-y-4">
        <Field label={t('modal.title')}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('modal.recurringTitlePlaceholder')} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('modal.amountLabel', { symbol })}>
            <input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} type="number" inputMode="decimal" placeholder="0.00" className={inputCls} />
          </Field>
          <Field label={t('modal.type')}>
            <select value={type} onChange={(e) => setType(e.target.value as TransactionType)} className={inputCls}>
              <option value="EXPENSE">{t('modal.typeExpense')}</option>
              <option value="INCOME">{t('modal.typeIncome')}</option>
            </select>
          </Field>
        </div>
        <Field label={t('modal.frequency')}>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)} className={inputCls}>
            <option value="DAILY">{t('modal.daily')}</option>
            <option value="WEEKLY">{t('modal.weekly')}</option>
            <option value="BIWEEKLY">{t('modal.biweekly')}</option>
            <option value="MONTHLY">{t('modal.monthly')}</option>
            <option value="YEARLY">{t('modal.yearly')}</option>
          </select>
        </Field>
        <Field label={t('modal.startDate')}>
          <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" className={inputCls} />
        </Field>
        <Field label={t('common.account')}>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label={t('common.category')}>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        {error ? (
          <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">{t('common.cancel')}</button>
          <button type="button" onClick={save} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">{editingRecurring ? t('common.save') : t('modal.create')}</button>
        </div>
      </div>
    </Modal>
  );
};

const inputCls = 'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <span className="text-xs font-bold text-slate-600">{label}</span>
    {children}
  </div>
);
