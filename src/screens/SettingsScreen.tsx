import React, { useState } from 'react';
import {
  Account,
  Budget,
  Category,
  CurrencyCode,
  TrackingPeriodPreference,
  Transaction,
  UserSettings,
  NotificationPreferences,
  ALL_CURRENCIES,
} from '../types';
import { MoneyValue } from '../domain/money/MoneyValue';
import { DateUtils } from '../domain/date/DateUtils';
import { FinovaStorage, FinovaState } from '../services/storage/FinovaStorage';
import { parseBackup, ParseBackupResult } from '../services/storage/BackupService';
import { AddAccountModal } from '../components/modals/AddAccountModal';
import { TutorialModal } from '../components/modals/TutorialModal';
import { GrbiLogo } from '../components/ui/GrbiLogo';
import { AuthUserProfile } from '../services/supabase/authService';
import { isSupabaseConfigured } from '../services/supabase/supabaseClient';
import {
  Globe,
  Shield,
  User,
  Download,
  Calendar,
  Clock,
  Building2,
  Smartphone,
  Wallet,
  Plus,
  CheckCircle2,
  Sparkles,
  Trash2,
  Play,
  Compass,
  LogOut,
  Cloud,
  CloudOff,
  Languages,
  Check,
  Bell,
  Sun,
  Moon,
  Palette,
  Database,
  Upload,
} from 'lucide-react';
import { t, SUPPORTED_LANGS } from '../i18n';
import { confirmDialog, notice } from '../components/ui/dialog';
import { AppLockService } from '../services/security/AppLockService';
import { getAutoLockMs, setAutoLockMs } from '../components/security/AppLockGuard';
import { osPermission, requestOsPermission, osNotifySupported, type OsPermission } from '../services/notification/browserNotify';

interface SettingsScreenProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
  notifPrefs: NotificationPreferences;
  onUpdateNotifPrefs: (prefs: NotificationPreferences) => void;
  onSelectCurrency: (currency: CurrencyCode) => void;
  accounts: Account[];
  onAddAccount: (newAccount: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteAccount: (accountId: string) => void;
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  onResetToCleanSlate: () => void;
  onBackup: () => void;
  onRestoreBackup: (state: FinovaState) => void;
  onLoadDemoData: () => void;
  onStartAppTour: () => void;
  authUser?: AuthUserProfile | null;
  onSignOut?: () => void;
}

/** Small-caps section label that groups related cards (scannability). */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-3">
    <h3 className="px-1 pt-1 text-[11px] font-black uppercase tracking-[0.14em] text-(--ink-3)">{title}</h3>
    {children}
  </section>
);

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  onUpdateSettings,
  notifPrefs,
  onUpdateNotifPrefs,
  onSelectCurrency,
  accounts,
  onAddAccount,
  onDeleteAccount,
  transactions,
  categories,
  budgets,
  onResetToCleanSlate,
  onBackup,
  onRestoreBackup,
  onLoadDemoData,
  onStartAppTour,
  authUser,
  onSignOut,
}) => {
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [osPerm, setOsPerm] = useState<OsPermission>(() => osPermission());
  const restoreInputRef = React.useRef<HTMLInputElement>(null);

  // Restore: read the file, validate, then confirm before replacing anything.
  const handleRestoreFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const res: ParseBackupResult = parseBackup(text);
      if (!res.ok) {
        const msg =
          res.error === 'PARSE' ? t('dialog.backupInvalidParse')
          : res.error === 'KIND' ? t('dialog.backupInvalidKind')
          : res.error === 'VERSION' ? t('dialog.backupInvalidVersion')
          : t('dialog.backupInvalidShape');
        notice(msg);
        return;
      }
      const s = res.state;
      void confirmDialog({
        title: t('dialog.restoreBackup'),
        message: t('dialog.restoreBackupHint', {
          tx: s.transactions.length,
          acc: s.accounts.length,
          b: s.budgets.length,
          g: s.goals.length,
        }),
        danger: true,
        confirmLabel: t('settings.restoreBackup'),
      }).then((ok) => {
        if (ok) onRestoreBackup(s);
      });
    };
    reader.onerror = () => notice(t('dialog.backupInvalidParse'));
    reader.readAsText(file);
  };
  // App lock (PIN) — local state mirrors the lock service, which is the source of truth.
  const [lockOn, setLockOn] = useState(() => AppLockService.isConfigured());
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockBusy, setLockBusy] = useState(false);
  const [autoLockMs, setAutoLockMsState] = useState(() => getAutoLockMs());

  const enableLock = async () => {
    setLockError(null);
    if (pinDraft !== pinConfirm) {
      setLockError(t('security.pinsDiffer'));
      return;
    }
    setLockBusy(true);
    const res = await AppLockService.setup(pinDraft);
    setLockBusy(false);
    if (res.ok) {
      setPinDraft('');
      setPinConfirm('');
      setShowPinForm(false);
      setLockOn(true);
      notice(t('security.enabled'));
    } else {
      setLockError(res.error || t('security.enableFailed'));
    }
  };

  const disableLock = async () => {
    const yes = await confirmDialog({
      title: t('security.disable'),
      message: t('security.disableConfirm'),
      confirmLabel: t('security.disable'),
      danger: true,
    });
    if (!yes) return;
    const res = await AppLockService.remove();
    if (res.ok) {
      setLockOn(false);
      setShowPinForm(false);
      notice(t('security.disabled'));
    } else {
      notice(res.error || t('security.enableFailed'));
    }
  };
  const setNotif = (patch: Partial<NotificationPreferences>) => onUpdateNotifPrefs({ ...notifPrefs, ...patch });
  const enableOsNotifications = async () => {
    const result = await requestOsPermission();
    setOsPerm(result);
    setNotif({ osNotifications: result === 'granted' });
  };
  const currentCurrency = settings.currency || 'PHP';
  const currentSymbol = MoneyValue.zero(currentCurrency).getCurrencySymbol();
  const todayISO = DateUtils.getTodayISO();
  const cycle15Day = DateUtils.get15DayCycle(todayISO, settings.semiMonthlyCutoffDay || 15);

  const handleExportCSV = () => {
    if (transactions.length === 0) {
      notice(t('dialog.exportEmpty'));
      return;
    }
    const csvContent = FinovaStorage.exportToCSV(transactions, categories, accounts);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `finova_export_${currentCurrency}_${todayISO}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate 15-day cycle budget and expense metrics
  const cycleExpenseTotal = transactions
    .filter(
      (tx) =>
        tx.type === 'EXPENSE' &&
        DateUtils.isDateInRange(tx.date, cycle15Day.startDate, cycle15Day.endDate)
    )
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalMonthlyBudgetAmount = budgets.reduce((sum, b) => sum + (b.amount || 0), 0);
  const halfMonthlyBudgetAmount = Math.round(totalMonthlyBudgetAmount / 2);

  return (
    <div className="space-y-4 sm:space-y-5 pb-8">
      {/* Screen Header */}
      <div className="flex items-center justify-between py-1">
        <h2 className="text-base sm:text-lg font-black text-(--ink) tracking-tight">
          {t('settings.title')}
        </h2>
        <span className="rounded-full bg-emerald-100 text-emerald-800 text-xs font-black px-3 py-0.5">
          {t('settings.currencyActive', { currency: currentCurrency })}
        </span>
      </div>

      {/* ================================================================ */}
      {/* PROFILE — who you are + where your data lives                     */}
      {/* ================================================================ */}
      <Section title={t('settings.sectionProfile')}>
        <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#122A1E] text-[#D4F63D] overflow-hidden shadow-xs">
              {authUser?.avatarUrl ? (
                <img src={authUser.avatarUrl} alt={t('settings.avatarAria')} className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-black">
                  {(authUser?.fullName || settings.userName || 'J')[0].toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h4 className="truncate text-xs sm:text-sm font-black text-(--ink)">
                {authUser?.fullName || settings.userName}
              </h4>
              <p className="truncate text-[11px] text-(--ink-3)">{authUser?.email || t('settings.loggedLocally')}</p>
              <div className="flex items-center gap-1 text-[10px] mt-0.5">
                {isSupabaseConfigured && !authUser?.isGuest ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                    <Cloud className="h-3 w-3" />
                    <span>{t('settings.cloudSynced')}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-(--ink-3) font-medium">
                    <CloudOff className="h-3 w-3" />
                    <span>{t('settings.localSession')}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {onSignOut && (
            <button
              type="button"
              onClick={async () => {
                if (await confirmDialog({ title: t('dialog.signOut') })) {
                  onSignOut();
                }
              }}
              className="flex items-center gap-1.5 rounded-xl bg-(--surface-3) px-3.5 py-2 text-xs font-bold text-(--ink-2) hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{t('settings.signOut')}</span>
            </button>
          )}
        </div>

        {/* Your Name */}
        <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-800 shadow-2xs">
              <User className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-(--ink)">{t('settings.yourName')}</h4>
              <p className="text-[11px] sm:text-xs text-(--ink-3)">{t('settings.yourNameHint')}</p>
            </div>
          </div>

          <input
            type="text"
            value={settings.userName}
            onChange={(e) => onUpdateSettings({ ...settings, userName: e.target.value })}
            className="w-full rounded-xl border border-(--line) bg-(--surface) px-3 py-2 text-xs font-bold text-(--ink) outline-none focus:border-emerald-600"
          />
        </div>
      </Section>

      {/* ================================================================ */}
      {/* MONEY — the fundamentals that shape every number in the app      */}
      {/* ================================================================ */}
      <Section title={t('settings.sectionMoney')}>
        {/* Global Currency Hub */}
        <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 shadow-2xs">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-(--ink)">{t('settings.currencyTitle')}</h4>
              <p className="text-[11px] sm:text-xs text-(--ink-3)">
                {t('settings.currencyHint')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {ALL_CURRENCIES.map((curr) => {
              const isSelected = curr.code === currentCurrency;
              return (
                <button
                  key={curr.code}
                  type="button"
                  onClick={() => onSelectCurrency(curr.code)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-700 bg-emerald-50/70 text-emerald-950 shadow-xs ring-1 ring-emerald-700'
                      : 'border-(--line)/80 bg-(--surface) text-(--ink-2) hover:bg-(--surface-2)'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-(--surface-3) font-black text-(--ink) text-xs shrink-0">
                      {curr.symbol}
                    </span>
                    <span className="truncate">{curr.name}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 15-Day Semi-Monthly Payroll Budget Breakdown Feature */}
        <div data-tour="payroll-cycle-setting" className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 shadow-2xs">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-(--ink)">
                {t('settings.paydayTitle')}
              </h4>
              <p className="text-[11px] sm:text-xs text-(--ink-3)">
                {t('settings.paydayHint')}
              </p>
            </div>
          </div>

          {/* Cycle Mode Selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ ...settings, budgetCycleMode: 'SEMI_MONTHLY_15_DAYS' })
              }
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                settings.budgetCycleMode === 'SEMI_MONTHLY_15_DAYS'
                  ? 'border-emerald-700 bg-emerald-50/70 text-emerald-950 font-black ring-1 ring-emerald-700 shadow-xs'
                  : 'border-(--line) bg-(--surface) text-(--ink-2) font-semibold hover:bg-(--surface-2)'
              }`}
            >
              <span className="text-xs font-black block">{t('settings.twiceMonthLabel')}</span>
              <span className="text-[10px] text-(--ink-3)">
                {t('settings.twiceMonthHint')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ ...settings, budgetCycleMode: 'MONTHLY' })}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                settings.budgetCycleMode === 'MONTHLY'
                  ? 'border-emerald-700 bg-emerald-50/70 text-emerald-950 font-black ring-1 ring-emerald-700 shadow-xs'
                  : 'border-(--line) bg-(--surface) text-(--ink-2) font-semibold hover:bg-(--surface-2)'
              }`}
            >
              <span className="text-xs font-black block">{t('settings.onceMonthLabel')}</span>
              <span className="text-[10px] text-(--ink-3)">{t('settings.onceMonthHint')}</span>
            </button>
          </div>

          {/* Live 15-Day Cycle Breakdown Card (Signature Green Theme) */}
          {settings.budgetCycleMode === 'SEMI_MONTHLY_15_DAYS' && (
            <div className="rounded-2xl bg-gradient-to-br from-[#122A1E] via-[#163325] to-[#183625] p-4 text-white shadow-md space-y-3 border border-emerald-800/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                  {t('settings.cycleCurrent')}
                </span>
                <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-black text-[#D4F63D] border border-emerald-300/30">
                  {t('settings.daysLeft', { days: cycle15Day.remainingDays })}
                </span>
              </div>

              <div className="flex items-baseline justify-between">
                <div>
                  <h5 className="text-base font-black text-white">{cycle15Day.cycleLabel}</h5>
                  <p className="text-[11px] text-emerald-200/80">
                    {DateUtils.formatDisplayDate(cycle15Day.startDate)} –{' '}
                    {DateUtils.formatDisplayDate(cycle15Day.endDate, { fullYear: true })}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-emerald-300 block">{t('settings.spentThisPeriod')}</span>
                  <span className="text-lg font-black text-[#D4F63D]">
                    {MoneyValue.fromMinorUnits(cycleExpenseTotal, currentCurrency).format()}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-[#0d1f16] p-2.5 text-xs text-emerald-100 flex items-center justify-between border border-emerald-800/50">
                <span className="text-emerald-200">{t('settings.fifteenDayBudget')}:</span>
                <span className="font-black text-white">
                  {MoneyValue.fromMinorUnits(halfMonthlyBudgetAmount, currentCurrency).format()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Emergency Safety Reserve */}
        <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-800 shadow-2xs">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-(--ink)">
                {t('settings.cushionTitle')}
              </h4>
              <p className="text-[11px] sm:text-xs text-(--ink-3)">
                {t('settings.cushionHint')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-(--line) bg-(--surface) px-3 py-1.5 focus-within:border-emerald-600">
            <span className="text-xs font-bold text-(--ink-3)">{currentSymbol}</span>
            <input
              type="number"
              min="0"
              step={MoneyValue.fromMinorUnits(1, currentCurrency).getMajorUnits().toString()}
              value={MoneyValue.fromMinorUnits(settings.minimumReserve, currentCurrency).getMajorUnits().toString()}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                onUpdateSettings({ ...settings, minimumReserve: MoneyValue.fromMajorUnits(val, currentCurrency).getMinorUnits() });
              }}
              className="w-full text-xs font-bold text-(--ink) outline-none"
            />
          </div>
        </div>
      </Section>

      {/* ================================================================ */}
      {/* ACCOUNTS — the banks & wallets money actually lives in           */}
      {/* ================================================================ */}
      <Section title={t('settings.sectionAccounts')}>
        {/* Real Banks & Accounts Management */}
        <div data-tour="bank-accounts-setting" className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-800 shadow-2xs">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-(--ink)">
                  {t('settings.accountsTitle')}
                </h4>
                <p className="text-[11px] sm:text-xs text-(--ink-3)">
                  {t('settings.accountsHint')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAddAccountOpen(true)}
              className="flex items-center gap-1 rounded-xl bg-[#122A1E] text-[#D4F63D] px-3 py-1.5 text-xs font-black shadow-xs hover:bg-[#183625] transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('settings.addBank')}</span>
            </button>
          </div>

          {/* Accounts List */}
          <div className="space-y-2">
            {accounts.map((acc) => {
              const money = MoneyValue.fromMinorUnits(acc.currentBalance, currentCurrency);
              const isWallet = acc.type === 'E_WALLET';
              const isCash = acc.type === 'CASH';
              const isGrbi = acc.bankPresetId === 'grbi' || acc.name.toLowerCase().includes('guagua') || acc.name.toLowerCase().includes('grbank');

              return (
                <div
                  key={acc.id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-(--surface-2) border border-(--line)/70"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white overflow-hidden shadow-2xs"
                      style={{ backgroundColor: acc.color || '#059669' }}
                    >
                      {isGrbi ? (
                        <GrbiLogo size={32} className="h-full w-full object-contain" />
                      ) : isWallet ? (
                        <Smartphone className="h-4 w-4" />
                      ) : isCash ? (
                        <Wallet className="h-4 w-4" />
                      ) : (
                        <Building2 className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h5 className="truncate text-xs font-black text-(--ink)">{acc.name}</h5>
                      <p className="text-[10px] font-semibold text-(--ink-3)">
                        {acc.type.replace('_', ' ')} {acc.accountNumberMask ? `• ${acc.accountNumberMask}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs sm:text-sm font-black text-(--ink)">
                      {money.format()}
                    </span>
                    {accounts.length > 1 && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (await confirmDialog({ title: t('dialog.removeAccount', { name: acc.name }), message: t('dialog.removeAccountHint'), danger: true, confirmLabel: t('common.delete') })) {
                            onDeleteAccount(acc.id);
                          }
                        }}
                        className="text-[11px] font-bold text-(--ink-3) hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        {t('common.delete')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ================================================================ */}
      {/* PREFERENCES — how the app looks, sounds, and alerts              */}
      {/* ================================================================ */}
      <Section title={t('settings.sectionPreferences')}>
        {/* 1. Default Expense Tracking Timeframe Setting */}
        <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 shadow-2xs">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-(--ink)">
                {t('settings.homeViewTitle')}
              </h4>
              <p className="text-[11px] sm:text-xs text-(--ink-3)">
                {t('settings.homeViewHint')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: 'TODAY', label: t('settings.homeViewToday') },
                { value: 'THIS_WEEK', label: t('settings.homeViewWeek') },
                { value: 'THIS_MONTH', label: t('settings.homeViewMonth') },
              ] as Array<{ value: TrackingPeriodPreference; label: string }>
            ).map((item) => {
              const isSelected = (settings.defaultTrackingPeriod || 'TODAY') === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ ...settings, defaultTrackingPeriod: item.value })
                  }
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-950 font-black shadow-xs ring-1 ring-emerald-700'
                      : 'border-(--line) bg-(--surface) text-(--ink-2) font-bold hover:bg-(--surface-2)'
                  }`}
                >
                  <span className="text-xs">{item.label}</span>
                  {isSelected && <span className="h-1 w-4 rounded-full bg-emerald-700 mt-1"></span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3b2. Appearance — light / dark theme */}
        <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 shadow-2xs">
              <Palette className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-(--ink)">{t('settings.themeMode')}</h4>
              <p className="text-[11px] sm:text-xs text-(--ink-3)">{t('settings.themeHint')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('settings.themeMode')}>
            {([
              { value: false, label: t('settings.light'), Icon: Sun },
              { value: true, label: t('settings.dark'), Icon: Moon },
            ] as const).map(({ value, label, Icon }) => {
              const isSelected = (settings.darkTheme === true) === value;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onUpdateSettings({ ...settings, darkTheme: value })}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-700 bg-emerald-50/70 text-emerald-950 shadow-xs ring-1 ring-emerald-700'
                      : 'border-(--line)/80 bg-(--surface) text-(--ink-2) hover:bg-(--surface-2)'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-emerald-700 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3b. Language Hub */}
        <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 shadow-2xs">
              <Languages className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-(--ink)">{t('settings.language')}</h4>
              <p className="text-[11px] sm:text-xs text-(--ink-3)">{t('settings.languageHint')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SUPPORTED_LANGS.map((lang) => {
              const isSelected = (settings.language || 'en') === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, language: lang.code })}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-700 bg-emerald-50/70 text-emerald-950 shadow-xs ring-1 ring-emerald-700'
                      : 'border-(--line)/80 bg-(--surface) text-(--ink-2) hover:bg-(--surface-2)'
                  }`}
                >
                  <span>{lang.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-emerald-700 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3c. Notifications Hub */}
        <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 shadow-2xs">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-(--ink)">{t('notifSet.title')}</h4>
                <p className="text-[11px] sm:text-xs text-(--ink-3)">{t('notifSet.hint')}</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifPrefs.enabled}
              onClick={() => setNotif({ enabled: !notifPrefs.enabled })}
              className={`shrink-0 h-6 w-11 rounded-full p-0.5 transition-colors cursor-pointer ${notifPrefs.enabled ? 'bg-emerald-700' : 'bg-slate-300'}`}
            >
              <span className={`block h-5 w-5 rounded-full bg-(--surface) shadow transition-transform ${notifPrefs.enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {notifPrefs.enabled && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  ['bills', t('notifSet.bills')],
                  ['recurring', t('notifSet.recurring')],
                  ['budgetRisk', t('notifSet.budgetRisk')],
                  ['cashFlowRisk', t('notifSet.cashFlowRisk')],
                  ['goalRisk', t('notifSet.goalRisk')],
                ] as const).map(([key, label]) => {
                  const on = notifPrefs[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => setNotif({ [key]: !on } as Partial<NotificationPreferences>)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        on
                          ? 'border-emerald-700 bg-emerald-50/70 text-emerald-950 ring-1 ring-emerald-700'
                          : 'border-(--line)/80 bg-(--surface) text-(--ink-3) hover:bg-(--surface-2)'
                      }`}
                    >
                      <span>{label}</span>
                      {on ? <Check className="h-3.5 w-3.5 text-emerald-700 shrink-0" /> : <span className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-(--ink-2)">{t('notifSet.leadTime')}</span>
                  <select
                    value={notifPrefs.billLeadDays}
                    onChange={(e) => setNotif({ billLeadDays: Number(e.target.value) })}
                    className="rounded-xl border border-(--line) bg-(--surface) px-2.5 py-2 text-xs font-bold text-(--ink)"
                  >
                    <option value={1}>{t('notifSet.lead1')}</option>
                    <option value={2}>{t('notifSet.lead2')}</option>
                    <option value={3}>{t('notifSet.lead3')}</option>
                    <option value={5}>{t('notifSet.lead5')}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-(--ink-2)">{t('notifSet.cooldown')}</span>
                  <select
                    value={notifPrefs.cooldownHours}
                    onChange={(e) => setNotif({ cooldownHours: Number(e.target.value) })}
                    className="rounded-xl border border-(--line) bg-(--surface) px-2.5 py-2 text-xs font-bold text-(--ink)"
                  >
                    <option value={6}>{t('notifSet.cooldown6')}</option>
                    <option value={12}>{t('notifSet.cooldown12')}</option>
                    <option value={24}>{t('notifSet.cooldown24')}</option>
                    <option value={48}>{t('notifSet.cooldown48')}</option>
                  </select>
                </label>
              </div>

              {/* OS notifications — honest about what the platform can do */}
              <div className="pt-1 space-y-1.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifPrefs.osNotifications}
                  disabled={!osNotifySupported() || osPerm === 'denied'}
                  onClick={() => {
                    if (notifPrefs.osNotifications) setNotif({ osNotifications: false });
                    else void enableOsNotifications();
                  }}
                  className={`flex w-full items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all ${
                    !osNotifySupported() || osPerm === 'denied'
                      ? 'border-(--line) bg-(--surface-2) text-slate-400 cursor-not-allowed'
                      : notifPrefs.osNotifications
                        ? 'border-emerald-700 bg-emerald-50/70 text-emerald-950 ring-1 ring-emerald-700 cursor-pointer'
                        : 'border-(--line)/80 bg-(--surface) text-(--ink-2) hover:bg-(--surface-2) cursor-pointer'
                  }`}
                >
                  <span>{t('notifSet.os')}</span>
                  {notifPrefs.osNotifications ? <Check className="h-3.5 w-3.5 text-emerald-700 shrink-0" /> : <span className="h-3.5 w-3.5 shrink-0" />}
                </button>
                <p className="text-[10px] sm:text-[11px] leading-snug text-(--ink-3)">
                  {!osNotifySupported()
                    ? t('notifSet.osUnsupported')
                    : osPerm === 'denied'
                      ? t('notifSet.osDenied')
                      : t('notifSet.osLimit')}
                </p>
              </div>
            </>
          )}
        </div>
      </Section>

      {/* ================================================================ */}
      {/* SECURITY                                                          */}
      {/* ================================================================ */}
      <Section title={t('settings.sectionSecurity')}>
        {/* 3d. Security — App Lock (PIN). Honest: UI-level lock, not encryption. */}
        <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 shadow-2xs">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-(--ink)">{t('security.title')}</h4>
                <p className="text-[11px] sm:text-xs text-(--ink-3)">{t('security.hint')}</p>
              </div>
            </div>
            {lockOn ? (
              <button
                type="button"
                onClick={() => void disableLock()}
                className="shrink-0 rounded-xl border border-(--line) px-3 py-1.5 text-[11px] font-bold text-(--ink-2) hover:bg-(--surface-2) cursor-pointer"
              >
                {t('security.disable')}
              </button>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={showPinForm}
                disabled={!AppLockService.isSupported()}
                onClick={() => setShowPinForm((v) => !v)}
                className={`shrink-0 h-6 w-11 rounded-full p-0.5 transition-colors ${AppLockService.isSupported() ? 'bg-slate-300 hover:bg-slate-400 cursor-pointer' : 'bg-(--line) cursor-not-allowed'}`}
              >
                <span className={`block h-5 w-5 rounded-full bg-(--surface) shadow transition-transform ${showPinForm ? 'translate-x-5' : ''}`} />
              </button>
            )}
          </div>

          {!AppLockService.isSupported() && (
            <p className="text-[11px] text-amber-700">{t('security.unsupported')}</p>
          )}

          {!lockOn && AppLockService.isSupported() && showPinForm && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-(--ink-2)">{t('security.newPin')}</span>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={10}
                  value={pinDraft}
                  onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="rounded-xl border border-(--line) bg-(--surface) px-2.5 py-2 text-sm font-bold tracking-widest text-(--ink)"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-(--ink-2)">{t('security.confirmPin')}</span>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={10}
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="rounded-xl border border-(--line) bg-(--surface) px-2.5 py-2 text-sm font-bold tracking-widest text-(--ink)"
                />
              </label>
              {lockError && <p className="sm:col-span-2 text-[11px] font-semibold text-rose-600" role="alert">{lockError}</p>}
              <button
                type="button"
                onClick={() => void enableLock()}
                disabled={pinDraft.length < 4 || lockBusy}
                className="sm:col-span-2 rounded-xl bg-emerald-800 px-3 py-2 text-xs font-black text-white disabled:opacity-40 cursor-pointer"
              >
                {lockBusy ? t('security.settingUp') : t('security.enable')}
              </button>
            </div>
          )}

          {lockOn && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-(--ink-2)">{t('security.autoLock')}</span>
                <select
                  value={autoLockMs}
                  onChange={(e) => {
                    const ms = Number(e.target.value);
                    setAutoLockMs(ms);
                    setAutoLockMsState(ms);
                  }}
                  className="rounded-xl border border-(--line) bg-(--surface) px-2.5 py-2 text-xs font-bold text-(--ink)"
                >
                  <option value={0}>{t('security.autoLockNever')}</option>
                  <option value={30000}>{t('security.autoLock30s')}</option>
                  <option value={60000}>{t('security.autoLock1m')}</option>
                  <option value={300000}>{t('security.autoLock5m')}</option>
                </select>
              </label>
              <p className="text-[10px] sm:text-[11px] leading-snug text-(--ink-3)">{t('security.honestNote')}</p>
            </>
          )}
        </div>
      </Section>

      {/* ================================================================ */}
      {/* LEARN — how to get the most out of the app                       */}
      {/* ================================================================ */}
      <Section title={t('settings.sectionLearn')}>
        {/* 0. Guided Interactive Feature Tutorial Hub */}
        <div className="rounded-[24px] sm:rounded-[28px] bg-gradient-to-br from-[#122A1E] via-[#163325] to-[#183625] p-4 sm:p-5 text-white shadow-lg shadow-emerald-950/20 border border-emerald-800/40 relative overflow-hidden">
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#D4F63D] text-[#122A1E] shadow-sm">
                  <Sparkles className="h-4 w-4 stroke-[2.5]" />
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                  {t('settings.appGuide')}
                </span>
              </div>
              <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-black text-[#D4F63D] border border-emerald-300/30">
                {t('settings.guidedTour')}
              </span>
            </div>

            <div>
              <h3 className="text-base sm:text-lg font-black text-white">
                {t('settings.tourTitle')}
              </h3>
              <p className="text-xs text-emerald-200/90 font-medium max-w-md mt-0.5">
                {t('settings.tourBody')}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onStartAppTour}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#D4F63D] text-[#122A1E] px-4 py-2.5 text-xs font-black shadow-md hover:bg-[#c3e332] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Compass className="h-4 w-4" />
                <span>{t('settings.startTour')}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsTutorialOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-(--surface)/10 text-white px-3.5 py-2.5 text-xs font-bold border border-white/20 hover:bg-(--surface)/20 transition-all cursor-pointer"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>{t('settings.readGuide')}</span>
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* ================================================================ */}
      {/* DATA — export, demo, and reset (kept last: destructive actions)   */}
      {/* ================================================================ */}
      <Section title={t('settings.sectionData')}>
        {/* 7. Data Management & Clean Slate vs Demo */}
        <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
          <h4 className="text-xs sm:text-sm font-black text-(--ink)">{t('settings.dataTitle')}</h4>

          <button
            type="button"
            onClick={handleExportCSV}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-(--surface-2) border border-(--line) py-2.5 text-xs font-bold text-(--ink-2) hover:bg-(--surface-3) transition-colors cursor-pointer"
          >
            <Download className="h-4 w-4 text-emerald-700" />
            <span>{t('settings.exportAll', { currency: currentCurrency })}</span>
          </button>

          {/* Full backup / restore — the "move to a new phone" pair */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onBackup}
              title={t('settings.backupHint')}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              <Database className="h-4 w-4 text-emerald-700" />
              <span>{t('settings.backupFull')}</span>
            </button>
            <button
              type="button"
              onClick={() => restoreInputRef.current?.click()}
              title={t('settings.restoreHint')}
              className="flex items-center justify-center gap-2 rounded-xl bg-(--surface-2) border border-(--line) py-2.5 text-xs font-bold text-(--ink-2) hover:bg-(--surface-3) transition-colors cursor-pointer"
            >
              <Upload className="h-4 w-4 text-(--ink-2)" />
              <span>{t('settings.restoreBackup')}</span>
            </button>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                handleRestoreFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {settings.lastBackupDate && (
            <p className="text-[11px] font-semibold text-(--ink-3) text-center">
              {t('settings.lastBackup', { date: DateUtils.formatDisplayDate(settings.lastBackupDate.slice(0, 10), { fullYear: true }) })}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {/* Load Sample Demo Data — moved next to Export (non-destructive) */}
            <button
              type="button"
              onClick={async () => {
                if (await confirmDialog({ title: t('dialog.loadSample'), message: t('dialog.loadSampleHint'), confirmLabel: t('common.confirm') })) {
                  onLoadDemoData();
                }
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              <Sparkles className="h-4 w-4 text-emerald-700" />
              <span>{t('settings.loadSample')}</span>
            </button>

            {/* Start Fresh (Clean 0 Slate) — destructive, red */}
            <button
              type="button"
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: t('dialog.startFresh', { amount: `${currentSymbol}0` }),
                    message: t('dialog.startFreshHint'),
                    danger: true,
                    confirmLabel: t('common.confirm'),
                  })
                ) {
                  onResetToCleanSlate();
                }
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 py-2.5 text-xs font-bold hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <Trash2 className="h-4 w-4 text-rose-600" />
              <span>{t('settings.startFresh', { amount: `${currentSymbol}0` })}</span>
            </button>
          </div>
        </div>
      </Section>

      {/* Add Bank Modal */}
      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onSave={onAddAccount}
        currency={currentCurrency}
      />

      {/* Interactive Tutorial Modal */}
      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        currency={currentCurrency}
      />
    </div>
  );
};
