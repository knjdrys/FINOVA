import React, { useState, useRef } from 'react';
import { useResyncOnOpen } from '../../hooks/useResyncOnOpen';
import { Account, SavingsGoal, CurrencyCode, GoalPriority } from '../../types';
import { Modal } from '../ui/Modal';
import { Field } from '../ui/Field';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { DateUtils } from '../../domain/date/DateUtils';
import { t } from '../../i18n/core';

interface AddGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<SavingsGoal, 'id' | 'createdAt' | 'updatedAt'>) => void;
  currency: CurrencyCode;
  accounts: Account[];
  editingGoal?: SavingsGoal | null;
  /** Quick-start preset (e.g. Emergency Fund): pre-fills name + suggested target. */
  preset?: { name: string; targetAmount?: number } | null;
}

const COLORS = ['#059669', '#0D9488', '#7C3AED', '#DB2777', '#2563EB', '#D97706', '#DC2626', '#4F46E5'];

export const AddGoalModal: React.FC<AddGoalModalProps> = ({ isOpen, onClose, onSave, currency, accounts, editingGoal, preset }) => {
  const [name, setName] = useState('');
  const [targetStr, setTargetStr] = useState('');
  const [currentStr, setCurrentStr] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [priority, setPriority] = useState<GoalPriority>('ESSENTIAL');
  const [accountId, setAccountId] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  // First commit wins per open — Modal unmounts on close, so this resets naturally.
  const submittedRef = useRef(false);

  const sameCurrencyAccounts = accounts.filter((a) => !a.isArchived && a.currency === currency);

  // Form re-sync on open/entity-switch (render-adjust via shared hook —
  // the modal stays mounted while closed, so fields can't init from props).
  useResyncOnOpen(isOpen, `${editingGoal?.id ?? 'new'}:${preset?.name ?? ''}:${preset?.targetAmount ?? ''}:${currency}`, () => {
    submittedRef.current = false;
    setName(editingGoal?.name || preset?.name || '');
    setTargetStr(editingGoal ? MoneyValue.fromMinorUnits(editingGoal.targetAmount, currency).format({ includeSymbol: false }) : preset?.targetAmount ? MoneyValue.fromMinorUnits(preset.targetAmount, currency).format({ includeSymbol: false }) : '');
    setCurrentStr(editingGoal ? MoneyValue.fromMinorUnits(editingGoal.currentAmount, currency).format({ includeSymbol: false }) : '0');
    setTargetDate(editingGoal?.targetDate || DateUtils.addDaysISO(DateUtils.getTodayISO(), 180));
    setPriority(editingGoal?.priority || 'ESSENTIAL');
    setAccountId(editingGoal?.accountId || '');
    setColor(editingGoal?.color || COLORS[0]);
    setError(null);
  });

  const save = () => {
    const target = MoneyValue.parse(targetStr || '0', currency).getMinorUnits();
    // Progress is money-backed: only a NEW goal may declare a starting amount
    // (opening state, like an account's opening balance). Editing never touches
    // progress — Fund / Withdraw own it, so progress and money can't desync.
    const current = editingGoal ? editingGoal.currentAmount : MoneyValue.parse(currentStr || '0', currency).getMinorUnits();
    if (!name.trim()) { setError(t('tx.errors.nameRequired')); return; }
    if (target <= 0) { setError(t('tx.errors.targetPositive')); return; }
    if (!targetDate) { setError(t('tx.errors.dateRequired')); return; }
    if (!editingGoal && current > target) { setError(t('tx.errors.currentOverTarget')); return; }
    setError(null);

    // Duplicate-submit guard: the first commit wins per open.
    if (submittedRef.current) return;
    submittedRef.current = true;
    onSave({
      userId: 'user-1',
      name: name.trim(),
      targetAmount: target,
      currentAmount: current,
      currency,
      targetDate,
      accountId: accountId || undefined,
      priority,
      status: current >= target ? 'COMPLETED' : 'ON_TRACK',
      icon: 'Target',
      color,
      isArchived: editingGoal ? editingGoal.isArchived : false,
    });
  };

  const symbol = MoneyValue.zero(currency).getCurrencySymbol();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingGoal ? t('modal.editGoal') : t('modal.newGoal')} maxWidth="md">
      <div className="space-y-4">
        <Field label={t('modal.goalName')}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('modal.goalNamePlaceholder')} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('modal.target') + ` (${symbol})`}>
            <input value={targetStr} onChange={(e) => setTargetStr(e.target.value)} type="number" inputMode="decimal" placeholder="0.00" className={inputCls} />
          </Field>
          <Field label={t('modal.alreadySaved') + ` (${symbol})`}>
            {editingGoal ? (
              <div>
                <div className="w-full rounded-xl border border-(--line) bg-(--surface-2) px-3 py-2.5 text-sm font-bold text-(--ink-2)">
                  {MoneyValue.fromMinorUnits(editingGoal.currentAmount, currency).format({ includeSymbol: false })}
                </div>
                <p className="mt-1 text-[11px] font-medium text-(--ink-3)">{t('modal.goalCurrentLocked')}</p>
              </div>
            ) : (
              <input value={currentStr} onChange={(e) => setCurrentStr(e.target.value)} type="number" inputMode="decimal" placeholder="0.00" className={inputCls} />
            )}
          </Field>
        </div>
        <Field label={t('modal.targetDate')}>
          <input value={targetDate} onChange={(e) => setTargetDate(e.target.value)} type="date" className={inputCls} />
        </Field>
        <Field label={t('modal.priority')}>
          <select value={priority} onChange={(e) => setPriority(e.target.value as GoalPriority)} className={inputCls}>
            <option value="ESSENTIAL">{t('modal.essential')}</option>
            <option value="IMPORTANT">{t('modal.important')}</option>
            <option value="OPTIONAL">{t('modal.optionalPriority')}</option>
          </select>
        </Field>
        <Field label={t('modal.goalAccountLabel')}>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls} aria-label={t('modal.goalAccountLabel')}>
            <option value="">{t('modal.goalAccountNone')}</option>
            {sameCurrencyAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {MoneyValue.fromMinorUnits(a.currentBalance, a.currency).format()}
              </option>
            ))}
          </select>
          <p className="text-[11px] font-medium text-(--ink-3)">
            {t('modal.goalAccountHint')}
          </p>
        </Field>
        <Field label={t('modal.color')}>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => {
              const selected = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`${t('modal.color')}: ${c}${selected ? ' (selected)' : ''}`}
                  aria-pressed={selected}
                  className={`h-10 w-10 rounded-full ${selected ? 'ring-2 ring-offset-2 ring-slate-500' : ''}`}
                  style={{ backgroundColor: c }}
                />
              );
            })}
          </div>
        </Field>

        {error ? (
          <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-(--line) px-4 py-2.5 text-sm font-bold text-(--ink-2)">{t('common.cancel')}</button>
          <button type="button" onClick={save} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">{editingGoal ? t('common.save') : t('modal.create')}</button>
        </div>
      </div>
    </Modal>
  );
};

const inputCls = 'w-full rounded-xl border border-(--line) px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300';
