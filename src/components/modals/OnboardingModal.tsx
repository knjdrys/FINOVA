import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import {
  Account,
  CurrencyCode,
  BudgetCycleMode,
  UserSettings,
  ALL_CURRENCIES,
  POPULAR_BANKS_AND_WALLETS,
} from '../../types';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { GrbiLogo } from '../ui/GrbiLogo';
import { prefersDarkOS } from '../../services/storage/FinovaStorage';
import { useI18n } from '../../i18n';
import { Sparkles, ArrowRight, CheckCircle2, Building2, Smartphone, Wallet } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (data: {
    settings: UserSettings;
    initialAccount: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;
    isDemo: boolean;
  }) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onComplete }) => {
  const { t } = useI18n();
  const [step, setStep] = useState<1 | 2>(1);
  const [userName, setUserName] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('PHP');
  const [budgetCycleMode, setBudgetCycleMode] = useState<BudgetCycleMode>('SEMI_MONTHLY_15_DAYS');
  const [selectedBankPresetId, setSelectedBankPresetId] = useState('grbi');
  const [accountName, setAccountName] = useState('Guagua Rural Bank, Inc.');
  const [initialBalanceStr, setInitialBalanceStr] = useState('0');

  const currencySymbol = MoneyValue.zero(currency).getCurrencySymbol();
  const selectedPreset = POPULAR_BANKS_AND_WALLETS.find((p) => p.id === selectedBankPresetId);

  const handleFinish = (isDemo: boolean) => {
    const money = MoneyValue.parse(initialBalanceStr, currency);
    const updatedSettings: UserSettings = {
      userId: 'user-1',
      userName: userName.trim() || 'Juan Dela Cruz',
      currency,
      language: 'en',
      defaultTrackingPeriod: 'TODAY',
      budgetCycleMode,
      semiMonthlyCutoffDay: 15,
      minimumReserve: 0,
      safeToSpendPeriod: 'END_OF_MONTH',
      darkTheme: prefersDarkOS(),
      notificationsEnabled: true,
      budgetWarningThreshold: 80,
      autoGenerateCommitmentsFromRecurring: true,
      hasCompletedOnboarding: true,
    };

    const initialAccount: Omit<Account, 'id' | 'createdAt' | 'updatedAt'> = {
      userId: 'user-1',
      name: accountName.trim() || selectedPreset?.name || 'Primary Account',
      bankPresetId: selectedBankPresetId,
      accountNumberMask: '•••• 1234',
      type: selectedPreset?.type || 'BANK',
      currency,
      initialBalance: isDemo ? 9722100 : money.getMinorUnits(),
      currentBalance: isDemo ? 9722100 : money.getMinorUnits(),
      icon: selectedPreset?.icon || 'Building2',
      color: selectedPreset?.color || '#1C205E',
      includeInTotalBalance: true,
      isArchived: false,
    };

    onComplete({
      settings: updatedSettings,
      initialAccount,
      isDemo,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="" maxWidth="lg">
      <div className="space-y-5 py-2">
        {/* Step 1: Welcome & Profile */}
        {step === 1 && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#122A1E] text-[#D4F63D] shadow-lg shadow-emerald-950/20">
              <Sparkles className="h-7 w-7" />
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-(--ink) tracking-tight">
                {t('onboard.welcome')}
              </h2>
              <p className="text-xs sm:text-sm text-(--ink-3) mt-1 max-w-sm mx-auto font-medium">
                {t('onboard.tagline')}
              </p>
            </div>

            <div className="space-y-3 pt-2 text-left bg-(--surface-2) p-4 rounded-2xl border border-(--line)/80">
              <div>
                <label className="text-xs font-bold text-(--ink-2) block mb-1">
                  {t('onboard.namePrompt')}
                </label>
                <input
                  type="text"
                  placeholder={t('onboard.namePlaceholder')}
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full rounded-xl border border-(--line) bg-(--surface) px-3.5 py-2.5 text-xs sm:text-sm font-bold text-(--ink) outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-(--ink-2) block mb-1">
                  {t('onboard.currencyPrompt')}
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="w-full rounded-xl border border-(--line) bg-(--surface) px-3 py-2.5 text-xs sm:text-sm font-bold text-(--ink) outline-none focus:border-emerald-600 cursor-pointer"
                >
                  {ALL_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.symbol} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#122A1E] py-3.5 text-sm font-bold text-[#D4F63D] shadow-md shadow-emerald-950/20 hover:bg-[#183625] transition-all cursor-pointer"
            >
              <span>{t('onboard.continue')}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Step 2: Primary Bank & Paycheck Cycle */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="text-center">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                {t('onboard.stepOf', { current: 2, total: 2 })}
              </span>
              <h3 className="text-lg sm:text-xl font-black text-(--ink) mt-1">
                {t('onboard.step2Title')}
              </h3>
              <p className="text-xs text-(--ink-3)">
                {t('onboard.step2Body')}
              </p>
            </div>

            {/* Bank Preset Picker */}
            <div>
              <label className="text-xs font-bold text-(--ink-2) block mb-1.5">
                {t('onboard.bankLabel')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                {POPULAR_BANKS_AND_WALLETS.slice(0, 9).map((preset) => {
                  const isSelected = preset.id === selectedBankPresetId;
                  const isGrbi = preset.id === 'grbi';

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedBankPresetId(preset.id);
                        setAccountName(preset.name);
                      }}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-emerald-700 bg-emerald-50/70 shadow-xs ring-1 ring-emerald-700'
                          : 'border-(--line) bg-(--surface) hover:bg-(--surface-2)'
                      }`}
                    >
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white overflow-hidden shadow-2xs"
                        style={{ backgroundColor: preset.color }}
                      >
                        {isGrbi ? (
                          <GrbiLogo size={24} className="h-full w-full object-contain" />
                        ) : preset.type === 'E_WALLET' ? (
                          <Smartphone className="h-3.5 w-3.5" />
                        ) : preset.type === 'CASH' ? (
                          <Wallet className="h-3.5 w-3.5" />
                        ) : (
                          <Building2 className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <span className="truncate text-[11px] font-bold text-(--ink)">
                        {preset.name.split('(')[0].trim()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Starting Balance (Default 0) */}
            <div className="bg-(--surface-2) p-3.5 rounded-2xl border border-(--line)/80 space-y-2">
              <label className="text-xs font-bold text-(--ink-2) block">
                {t('onboard.startingBalanceLabel')}
              </label>
              <div className="flex items-center gap-1.5 rounded-xl border border-(--line) bg-(--surface) px-3 py-1.5 focus-within:border-emerald-600">
                <span className="text-sm font-black text-(--ink-3)">{currencySymbol}</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={initialBalanceStr}
                  onChange={(e) => setInitialBalanceStr(e.target.value)}
                  className="w-full text-base font-black text-(--ink) outline-none"
                />
              </div>
            </div>

            {/* Budget & Paycheck Cycle */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-(--ink-2) block">
                How often do you get paid?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBudgetCycleMode('SEMI_MONTHLY_15_DAYS')}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                    budgetCycleMode === 'SEMI_MONTHLY_15_DAYS'
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-950 font-black ring-1 ring-emerald-700 shadow-xs'
                      : 'border-(--line) bg-(--surface) text-(--ink-2) font-semibold'
                  }`}
                >
                  <span className="text-xs font-black block">Twice a Month (15-Day)</span>
                  <span className="text-[10px] text-(--ink-3)">15th & End of Month</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBudgetCycleMode('MONTHLY')}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                    budgetCycleMode === 'MONTHLY'
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-950 font-black ring-1 ring-emerald-700'
                      : 'border-(--line) bg-(--surface) text-(--ink-2) font-semibold'
                  }`}
                >
                  <span className="text-xs font-black block">Once a Month</span>
                  <span className="text-[10px] text-(--ink-3)">Full Monthly Budget</span>
                </button>
              </div>
            </div>

            {/* Action Buttons: Clean Slate vs Sample Demo */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => handleFinish(false)}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#122A1E] py-3.5 text-sm font-bold text-[#D4F63D] shadow-md hover:bg-[#183625] transition-all cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Start Fresh with {currencySymbol}0</span>
              </button>

              <button
                type="button"
                onClick={() => handleFinish(true)}
                className="w-full text-center py-2 text-xs font-bold text-(--ink-3) hover:text-(--ink) transition-colors cursor-pointer"
              >
                Or explore first with Sample Demo Data
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
