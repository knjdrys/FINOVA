import React, { useState, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Account, AccountType, CurrencyCode, POPULAR_BANKS_AND_WALLETS } from '../../types';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { GrbiLogo } from '../ui/GrbiLogo';
import { Building2, Smartphone, Wallet, Check } from 'lucide-react';
import { t } from '../../i18n/core';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>, reconcileToMinor?: number) => void;
  currency: CurrencyCode;
  /** When set, the modal edits identity fields + offers balance reconciliation. */
  editingAccount?: Account | null;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currency,
  editingAccount,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('grbi');
  const [name, setName] = useState('GRBank');
  const [accountType, setAccountType] = useState<AccountType>('BANK');
  const [accountNumberMask, setAccountNumberMask] = useState('•••• 1234');
  const [initialBalanceStr, setInitialBalanceStr] = useState('0');
  const [actualBalanceStr, setActualBalanceStr] = useState('0');
  const [includeInTotalBalance, setIncludeInTotalBalance] = useState(true);
  // First commit wins per open — Modal unmounts on close, so this resets naturally.
  const submittedRef = useRef(false);

  React.useEffect(() => {
    if (isOpen) {
      submittedRef.current = false;
      if (editingAccount) {
        setSelectedPresetId(editingAccount.bankPresetId || 'grbi');
        setName(editingAccount.name);
        setAccountType(editingAccount.type);
        setAccountNumberMask(editingAccount.accountNumberMask || '');
        setIncludeInTotalBalance(editingAccount.includeInTotalBalance);
        setActualBalanceStr(
          MoneyValue.fromMinorUnits(editingAccount.currentBalance, editingAccount.currency).getMajorUnits().toString()
        );
      } else {
        setSelectedPresetId('grbi');
        setName('GRBank');
        setAccountType('BANK');
        setAccountNumberMask('•••• 1234');
        setInitialBalanceStr('0');
        setIncludeInTotalBalance(true);
      }
    }
  }, [isOpen, editingAccount]);

  const currencySymbol = MoneyValue.zero(currency).getCurrencySymbol();
  const isEdit = Boolean(editingAccount);
  const reconcileMinor = isEdit && editingAccount
    ? MoneyValue.parse(actualBalanceStr || '0', editingAccount.currency).getMinorUnits()
    : 0;
  const reconcileDelta = isEdit && editingAccount ? reconcileMinor - editingAccount.currentBalance : 0;

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = POPULAR_BANKS_AND_WALLETS.find((p) => p.id === presetId);
    if (preset) {
      setName(preset.name);
      setAccountType(preset.type);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Duplicate-submit guard: the first commit wins per open.
    if (submittedRef.current) return;
    submittedRef.current = true;

    if (editingAccount) {
      // Edit keeps the money; a changed "actual" balance reconciles via an
      // adjustment transaction in App (never a silent balance overwrite).
      onSave(
        {
          userId: editingAccount.userId,
          name: name.trim() || editingAccount.name,
          bankPresetId: editingAccount.bankPresetId,
          accountNumberMask: accountNumberMask.trim() || undefined,
          type: accountType,
          currency: editingAccount.currency,
          initialBalance: editingAccount.initialBalance,
          currentBalance: editingAccount.currentBalance,
          icon: editingAccount.icon,
          color: editingAccount.color,
          includeInTotalBalance,
          isArchived: editingAccount.isArchived,
        },
        reconcileDelta !== 0 ? reconcileMinor : undefined
      );
      onClose();
      return;
    }

    const money = MoneyValue.parse(initialBalanceStr, currency);
    const preset = POPULAR_BANKS_AND_WALLETS.find((p) => p.id === selectedPresetId);

    onSave({
      userId: 'user-1',
      name: name.trim() || 'New Account',
      bankPresetId: selectedPresetId,
      accountNumberMask: accountNumberMask.trim() || undefined,
      type: accountType,
      currency,
      initialBalance: money.getMinorUnits(),
      currentBalance: money.getMinorUnits(),
      icon: preset?.icon || 'Building2',
      color: preset?.color || '#1C205E',
      includeInTotalBalance,
      isArchived: false,
    });

    // Reset
    setName('');
    setAccountNumberMask('');
    setInitialBalanceStr('0');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? t('modal.editAccount') : 'Add Bank or Wallet'} maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Popular Institution Selection (create-only: identity is fixed after creation) */}
        {!isEdit && (
        <div>
          <label className="text-xs font-bold text-(--ink-2) block mb-1.5">
            Select Bank or E-Wallet
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
            {POPULAR_BANKS_AND_WALLETS.map((preset) => {
              const isSelected = preset.id === selectedPresetId;
              const isGrbi = preset.id === 'grbi';

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-700 bg-emerald-50/70 shadow-xs ring-1 ring-emerald-700'
                      : 'border-(--line) bg-(--surface) hover:bg-(--surface-2)'
                  }`}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white overflow-hidden shadow-2xs"
                    style={{ backgroundColor: preset.color }}
                  >
                    {isGrbi ? (
                      <GrbiLogo size={28} className="h-full w-full object-contain" />
                    ) : preset.type === 'E_WALLET' ? (
                      <Smartphone className="h-4 w-4" />
                    ) : preset.type === 'CASH' ? (
                      <Wallet className="h-4 w-4" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                  </div>
                  <span className="truncate text-[11px] font-bold text-(--ink)">
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* Account Details */}
        <div className="space-y-3 bg-(--surface-2) p-4 rounded-2xl border border-(--line)/80">
          <div>
            <label className="text-xs font-bold text-(--ink-2) block mb-1">Account Name</label>
            <input
              aria-label="Account Name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GRBank Savings"
              className="w-full rounded-xl border border-(--line) bg-(--surface) px-3 py-2 text-xs font-bold text-(--ink) outline-none focus:border-emerald-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-(--ink-2) block mb-1">Account Type</label>
              <select
                aria-label="Account Type"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
                className="w-full rounded-xl border border-(--line) bg-(--surface) px-3 py-2 text-xs font-semibold text-(--ink) outline-none focus:border-emerald-600 cursor-pointer"
              >
                <option value="BANK">Bank Account</option>
                <option value="E_WALLET">E-Wallet (GCash / Maya)</option>
                <option value="SAVINGS">Savings Account</option>
                <option value="CREDIT_CARD">Credit Card</option>
                <option value="CASH">Cash on Hand</option>
                <option value="INVESTMENT">Investment</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-(--ink-2) block mb-1">Last 4 Digits (Optional)</label>
              <input
                aria-label="Last 4 Digits (Optional)"
                type="text"
                value={accountNumberMask}
                onChange={(e) => setAccountNumberMask(e.target.value)}
                placeholder="•••• 4829"
                className="w-full rounded-xl border border-(--line) bg-(--surface) px-3 py-2 text-xs font-semibold text-(--ink) outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Initial Balance (create) / Reconciliation (edit) */}
          {!isEdit ? (
            <div>
              <label className="text-xs font-bold text-(--ink-2) block mb-1">Current Balance</label>
              <div className="flex items-center gap-1.5 rounded-xl border border-(--line) bg-(--surface) px-3 py-1.5 focus-within:border-emerald-600">
                <span className="text-xs font-bold text-(--ink-3)">{currencySymbol}</span>
                <input
                  aria-label="Current Balance"
                  type="number"
                  step="any"
                  min="0"
                  value={initialBalanceStr}
                  onChange={(e) => setInitialBalanceStr(e.target.value)}
                  className="w-full text-sm font-bold text-(--ink) outline-none"
                />
              </div>
              {accountType === 'CREDIT_CARD' && (
                <p className="mt-1.5 text-[11px] font-medium text-(--ink-3)">{t('modal.creditBalanceHint')}</p>
              )}
            </div>
          ) : editingAccount ? (
            <div>
              <label className="text-xs font-bold text-(--ink-2) block mb-1">{t('modal.reconcileLabel')}</label>
              <div className="flex items-center gap-1.5 rounded-xl border border-(--line) bg-(--surface) px-3 py-1.5 focus-within:border-emerald-600">
                <span className="text-xs font-bold text-(--ink-3)">
                  {MoneyValue.zero(editingAccount.currency).getCurrencySymbol()}
                </span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={actualBalanceStr}
                  onChange={(e) => setActualBalanceStr(e.target.value)}
                  aria-label={t('modal.reconcileLabel')}
                  className="w-full text-sm font-bold text-(--ink) outline-none"
                />
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-(--ink-3)">
                {reconcileDelta === 0 ? (
                  t('modal.reconcileMatch')
                ) : (
                  <>
                    {reconcileDelta > 0 ? '+' : '−'}
                    {MoneyValue.fromMinorUnits(Math.abs(reconcileDelta), editingAccount.currency).format()} ·{' '}
                    {reconcileDelta > 0 ? t('tx.income') : t('tx.expense')} {t('tx.adjustment').toLowerCase()} ·{' '}
                    {t('modal.reconcileHint')}
                  </>
                )}
              </p>
            </div>
          ) : null}

          {/* Include in Total Balance Toggle */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <span className="text-xs font-bold text-(--ink) block">Include in Total Balance</span>
              <span className="text-[11px] text-(--ink-3)">Count this money toward your daily spending limit</span>
            </div>
            <input
              aria-label="Include in Total Balance"
              type="checkbox"
              checked={includeInTotalBalance}
              onChange={(e) => setIncludeInTotalBalance(e.target.checked)}
              className="h-4 w-4 rounded text-emerald-700 focus:ring-emerald-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-(--brand) py-3.5 text-sm font-bold text-(--accent) shadow-lg shadow-emerald-950/20 transition-transform active:scale-[0.98] hover:bg-(--brand-hover) cursor-pointer"
        >
          <Check className="h-4 w-4 stroke-[3]" />
          <span>Save Account</span>
        </button>
      </form>
    </Modal>
  );
};
