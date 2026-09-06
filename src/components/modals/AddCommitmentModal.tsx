import React, { useState, useEffect } from 'react';
import { MoneyCommitment, Account, Category, CurrencyCode, CommitmentType, CommitmentPriority } from '../../types';
import { Modal } from '../ui/Modal';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { DateUtils } from '../../domain/date/DateUtils';
import { t } from '../../i18n/core';

interface AddCommitmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<MoneyCommitment, 'id' | 'createdAt' | 'updatedAt'>) => void;
  accounts: Account[];
  categories: Category[];
  currency: CurrencyCode;
  editingCommitment?: MoneyCommitment | null;
  /** Quick-start preset (e.g. payday): pre-fills type + title for a new commitment. */
  preset?: { type: CommitmentType; title?: string } | null;
}

export const AddCommitmentModal: React.FC<AddCommitmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  accounts,
  categories,
  currency,
  editingCommitment,
  preset,
}) => {
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [type, setType] = useState<CommitmentType>('BILL');
  const [priority, setPriority] = useState<CommitmentPriority>('ESSENTIAL');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('cat-bills');
  const [autoPost, setAutoPost] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(editingCommitment?.title || preset?.title || '');
      setAmountStr(editingCommitment ? MoneyValue.fromMinorUnits(editingCommitment.amount, editingCommitment.currency).format({ includeSymbol: false }) : '');
      setDueDate(editingCommitment?.dueDate || DateUtils.addDaysISO(DateUtils.getTodayISO(), 7));
      setType(editingCommitment?.type || preset?.type || 'BILL');
      setPriority(editingCommitment?.priority || 'ESSENTIAL');
      setAccountId(editingCommitment?.accountId || accounts[0]?.id || '');
      setCategoryId(
        editingCommitment?.categoryId ||
          (preset?.type === 'EXPECTED_INCOME' || preset?.type === 'RECURRING_INCOME' ? 'cat-salary' : 'cat-bills')
      );
      setAutoPost(editingCommitment?.autoPostEnabled ?? false);
      setError(null);
    }
  }, [isOpen, editingCommitment, preset, accounts]);

  const save = () => {
    const amount = MoneyValue.parse(amountStr || '0', currency).getMinorUnits();
    if (!title.trim()) { setError(t('tx.errors.titleRequired')); return; }
    if (amount <= 0) { setError(t('tx.errors.amountPositive')); return; }
    if (!dueDate) { setError(t('tx.errors.dateRequired')); return; }
    if (!accountId) { setError(t('tx.errors.accountRequired')); return; }
    setError(null);

    onSave({
      userId: 'user-1',
      title: title.trim(),
      type,
      amount,
      currency,
      direction: type === 'RECURRING_INCOME' || type === 'EXPECTED_INCOME' ? 'INFLOW' : 'OUTFLOW',
      status: 'PROJECTED',
      dueDate,
      accountId,
      categoryId,
      priority,
      autoPostEnabled: autoPost,
    });
  };

  const symbol = MoneyValue.zero(currency).getCurrencySymbol();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingCommitment ? t('modal.editBill') : t('modal.newBill')} maxWidth="md">
      <div className="space-y-4">
        <Field label={t('modal.title')}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('modal.billTitlePlaceholder')} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('modal.amountLabel', { symbol })}>
            <input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} type="number" inputMode="decimal" placeholder="0.00" className={inputCls} />
          </Field>
          <Field label={t('modal.dueDate')}>
            <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" className={inputCls} />
          </Field>
        </div>
        <Field label={t('modal.type')}>
          <select value={type} onChange={(e) => setType(e.target.value as CommitmentType)} className={inputCls}>
            <option value="BILL">{t('modal.typeBill')}</option>
            <option value="SUBSCRIPTION">{t('modal.typeSubscription')}</option>
            <option value="DEBT_PAYMENT">{t('modal.typeDebt')}</option>
            <option value="PLANNED_EXPENSE">{t('modal.typePlanned')}</option>
            <option value="RECURRING_EXPENSE">{t('modal.typeRecurringExpense')}</option>
            <option value="EXPECTED_INCOME">{t('modal.typeExpectedIncome')}</option>
            <option value="RECURRING_INCOME">{t('modal.typeRecurringIncome')}</option>
          </select>
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
        <Field label={t('modal.priority')}>
          <select value={priority} onChange={(e) => setPriority(e.target.value as CommitmentPriority)} className={inputCls}>
            <option value="ESSENTIAL">{t('modal.essential')}</option>
            <option value="IMPORTANT">{t('modal.important')}</option>
            <option value="OPTIONAL">{t('modal.optionalPriority')}</option>
          </select>
        </Field>
        <label className="flex items-start gap-2.5 rounded-xl border border-(--line) bg-(--surface-2) px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={autoPost}
            onChange={(e) => setAutoPost(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-emerald-700"
          />
          <span>
            <span className="block text-xs font-bold text-(--ink-2)">{t('modal.autoPostTitle')}</span>
            <span className="block text-[10px] font-medium text-(--ink-3)">{t('modal.autoPostBillHint')}</span>
          </span>
        </label>

        {error ? (
          <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-(--line) px-4 py-2.5 text-sm font-bold text-(--ink-2)">{t('common.cancel')}</button>
          <button type="button" onClick={save} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">{editingCommitment ? t('common.save') : t('modal.create')}</button>
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
