import React, { useState } from 'react';
import {
  Account,
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
import { FinovaStorage } from '../services/storage/FinovaStorage';
import { BackupService } from '../services/backup/BackupService';
import { CsvImportService, ImportRejectCode } from '../services/import/CsvImportService';
import { AddAccountModal } from '../components/modals/AddAccountModal';
import { AddCategoryModal } from '../components/modals/AddCategoryModal';
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
  Pencil,
  Upload,
  Archive,
  ArchiveRestore,
  Tags,
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
  onUpdateAccount: (accountId: string, data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>, reconcileToMinor?: number) => void;
  onDeleteAccount: (accountId: string) => void;
  onAddCategory: (data: Omit<Category, 'id' | 'userId'>) => void;
  onUpdateCategory: (id: string, data: Omit<Category, 'id' | 'userId'>) => void;
  onToggleCategoryArchive: (id: string) => void;
  onRestoreBackup: (state: import('../services/storage/FinovaStorage').FinovaState) => void;
  onImportTransactions: (txs: Transaction[]) => void;
  transactions: Transaction[];
  categories: Category[];
  budgets: any[];
  onResetToCleanSlate: () => void;
  onLoadDemoData: () => void;
  onStartAppTour: () => void;
  authUser?: AuthUserProfile | null;
  onSignOut?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  onUpdateSettings,
  notifPrefs,
  onUpdateNotifPrefs,
  onSelectCurrency,
  accounts,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onAddCategory,
  onUpdateCategory,
  onToggleCategoryArchive,
  onRestoreBackup,
  onImportTransactions,
  transactions,
  categories,
  budgets,
  onResetToCleanSlate,
  onLoadDemoData,
  onStartAppTour,
  authUser,
  onSignOut,
}) => {
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [osPerm, setOsPerm] = useState<OsPermission>(() => osPermission());
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
    link.setAttribute('download', `paldo_export_${currentCurrency}_${todayISO}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadBackup = () => {
    const json = BackupService.createBackup(FinovaStorage.loadState());
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', BackupService.backupFilename(currentCurrency, todayISO));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setLastBackupAt(todayISO);
    notice(t('backup.downloaded'));
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = BackupService.parseBackup(await file.text());
    if (!result.ok) {
      notice(result.error === 'version' ? t('backup.versionNew') : t('backup.invalidFile'));
      return;
    }
    const ok = await confirmDialog({
      title: t('dialog.restoreBackup'),
      message: t('dialog.restoreBackupHint'),
      danger: true,
      confirmLabel: t('backup.restore'),
    });
    if (ok) onRestoreBackup(result.state);
  };

  const importReason = (code: ImportRejectCode, params: Record<string, string>): string => {
    switch (code) {
      case 'bad-type': return t('import.reasons.bad-type', params);
      case 'bad-date': return t('import.reasons.bad-date', params);
      case 'bad-status': return t('import.reasons.bad-status', params);
      case 'bad-currency': return t('import.reasons.bad-currency', params);
      case 'bad-amount': return t('import.reasons.bad-amount', params);
      case 'unknown-account': return t('import.reasons.unknown-account', params);
      case 'currency-mismatch': return t('import.reasons.currency-mismatch', params);
      case 'unknown-destination': return t('import.reasons.unknown-destination', params);
      case 'same-account': return t('import.reasons.same-account', params);
      case 'transfer-currency': return t('import.reasons.transfer-currency', params);
      case 'booking-row': return t('import.reasons.booking-row', params);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const parsed = CsvImportService.parse(await file.text());
    if (!parsed.ok) {
      notice(
        parsed.error === 'bad-header'
          ? t('import.badHeader')
          : parsed.error === 'too-many'
          ? t('import.tooMany')
          : t('import.empty')
      );
      return;
    }
    if (parsed.rows.length === 0) {
      notice(t('import.empty'));
      return;
    }
    const plan = CsvImportService.plan(parsed.rows, { accounts, categories, existing: transactions });
    const lines = plan.invalid.slice(0, 8).map(
      (r) => `Line ${r.line}: ${importReason(r.code, r.params)}`
    );
    if (plan.invalid.length > 8) {
      lines.push(t('import.moreRejected', { count: plan.invalid.length - 8 }));
    }
    const message = [
      t('import.review', { valid: plan.valid.length, dupes: plan.duplicates, bad: plan.invalid.length }),
      ...lines,
    ].join('\n');
    const ok = await confirmDialog({
      title: t('import.reviewTitle'),
      message,
      confirmLabel: plan.valid.length > 0 ? t('import.confirm') : t('common.close'),
    });
    if (ok) onImportTransactions(plan.valid);
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
          Settings & Preferences
        </h2>
        <span className="rounded-full bg-emerald-100 text-emerald-800 text-xs font-black px-3 py-0.5">
          {currentCurrency} Active
        </span>
      </div>

      {/* User Account & Cloud Sync Banner */}
      <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-(--brand) text-(--accent) overflow-hidden shadow-xs">
            {authUser?.avatarUrl ? (
              <img src={authUser.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
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
            <p className="truncate text-[11px] text-(--ink-3)">{authUser?.email || 'Logged in'}</p>
            <div className="flex items-center gap-1 text-[11px] mt-0.5">
              {isSupabaseConfigured && !authUser?.isGuest ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                  <Cloud className="h-3 w-3" />
                  <span>Supabase PostgreSQL Synced</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-(--ink-3) font-medium">
                  <CloudOff className="h-3 w-3" />
                  <span>Local Offline Session</span>
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
            <span>Log Out</span>
          </button>
        )}
      </div>

      {/* 0. Guided Interactive Feature Tutorial Hub */}
      <div className="rounded-[24px] sm:rounded-[28px] bg-gradient-to-br from-[#122A1E] via-[#163325] to-[#183625] p-4 sm:p-5 text-white shadow-lg shadow-emerald-950/20 border border-emerald-800/40 relative overflow-hidden">
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-(--accent) text-(--brand) shadow-sm">
                <Sparkles className="h-4 w-4 stroke-[2.5]" />
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
                App Guide
              </span>
            </div>
            <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[11px] font-black text-(--accent) border border-emerald-300/30">
              Guided Tour
            </span>
          </div>

          <div>
            <h3 className="text-base sm:text-lg font-black text-white">
              Take a Tour of the App
            </h3>
            <p className="text-xs text-emerald-200/90 font-medium max-w-md mt-0.5">
              Let our animated guide walk you through how to use each feature step by step.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onStartAppTour}
              className="flex items-center justify-center gap-2 rounded-xl bg-(--accent) text-(--brand) px-4 py-2.5 text-xs font-black shadow-md hover:bg-[#c3e332] active:scale-[0.98] transition-all cursor-pointer"
            >
              <Compass className="h-4 w-4" />
              <span>Start App Tour</span>
            </button>

            <button
              type="button"
              onClick={() => setIsTutorialOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-(--surface)/10 text-white px-3.5 py-2.5 text-xs font-bold border border-white/20 hover:bg-(--surface)/20 transition-all cursor-pointer"
            >
              <Play className="h-3 w-3 fill-current" />
              <span>Read Guide</span>
            </button>
          </div>
        </div>
      </div>

      {/* 1. Default Expense Tracking Timeframe Setting */}
      <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 shadow-2xs">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-(--ink)">
              Default Home View
            </h4>
            <p className="text-[11px] sm:text-xs text-(--ink-3)">
              Choose the time period shown when you open the app
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { value: 'TODAY', label: 'Today (Daily)' },
              { value: 'THIS_WEEK', label: 'This Week' },
              { value: 'THIS_MONTH', label: 'This Month' },
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

      {/* 2. 15-Day Semi-Monthly Payroll Budget Breakdown Feature */}
      <div data-tour="payroll-cycle-setting" className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 shadow-2xs">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-(--ink)">
                Twice-a-Month Payday (15-Day Cycle)
              </h4>
              <p className="text-[11px] sm:text-xs text-(--ink-3)">
                For people who get paid on the 15th and end of the month
              </p>
            </div>
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
            <span className="text-xs font-black block">Twice a Month (15-Day)</span>
            <span className="text-[11px] text-(--ink-3)">
              Splits into 1st & 2nd half periods
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
            <span className="text-xs font-black block">Once a Month</span>
            <span className="text-[11px] text-(--ink-3)">Full Monthly Budget</span>
          </button>
        </div>

        {/* Live 15-Day Cycle Breakdown Card (Signature Green Theme) */}
        {settings.budgetCycleMode === 'SEMI_MONTHLY_15_DAYS' && (
          <div className="rounded-2xl bg-gradient-to-br from-[#122A1E] via-[#163325] to-[#183625] p-4 text-white shadow-md space-y-3 border border-emerald-800/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
                Current 15-Day Pay Period
              </span>
              <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[11px] font-black text-(--accent) border border-emerald-300/30">
                {cycle15Day.remainingDays} Days Left
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
                <span className="text-[11px] text-emerald-300 block">Spent This Period</span>
                <span className="text-lg font-black text-(--accent)">
                  {MoneyValue.fromMinorUnits(cycleExpenseTotal, currentCurrency).format()}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-[#0d1f16] p-2.5 text-xs text-emerald-100 flex items-center justify-between border border-emerald-800/50">
              <span className="text-emerald-200">15-Day Budget:</span>
              <span className="font-black text-white">
                {MoneyValue.fromMinorUnits(halfMonthlyBudgetAmount, currentCurrency).format()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Real Banks & Accounts Management */}
      <div data-tour="bank-accounts-setting" className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-800 shadow-2xs">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-(--ink)">
                Bank Accounts & Wallets
              </h4>
              <p className="text-[11px] sm:text-xs text-(--ink-3)">
                Manage GRBank, BPI, BDO, GCash, Maya, and cash
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsAddAccountOpen(true)}
            className="flex items-center gap-1 rounded-xl bg-(--brand) text-(--accent) px-3 py-1.5 text-xs font-black shadow-xs hover:bg-(--brand-hover) transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Bank</span>
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
                    <p className="text-[11px] font-semibold text-(--ink-3)">
                      {acc.type.replace('_', ' ')} {acc.accountNumberMask ? `• ${acc.accountNumberMask}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs sm:text-sm font-black text-(--ink)">
                    {money.format()}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setEditingAccount(acc); setIsAddAccountOpen(true); }}
                    aria-label={t('modal.editAccount')}
                    className="text-[11px] font-bold text-(--ink-3) hover:text-emerald-700 transition-colors cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
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
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3a2. Categories */}
      <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-700 shadow-2xs">
              <Tags className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-(--ink)">{t('categories.title')}</h4>
              <p className="text-[11px] sm:text-xs text-(--ink-3)">{t('categories.hint')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setEditingCategory(null); setIsCategoryModalOpen(true); }}
            className="flex items-center gap-1 rounded-xl bg-(--brand) text-(--accent) px-3 py-1.5 text-xs font-black shadow-xs hover:bg-(--brand-hover) transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t('categories.add')}</span>
          </button>
        </div>

        <div className="space-y-2">
          {categories
            .filter((c) => c.id !== 'cat-transfer')
            .slice()
            .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
            .map((c) => {
              const editable = !c.isSystem;
              return (
                <div
                  key={c.id}
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-(--surface-2) border border-(--line)/70 ${c.isArchived ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-black text-white"
                      style={{ backgroundColor: c.color }}
                      aria-hidden="true"
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-(--ink)">
                        {c.name}
                        {c.isArchived ? ` · ${t('categories.archivedBadge')}` : ''}
                      </p>
                      <p className="text-[11px] font-semibold text-(--ink-3)">
                        {c.type === 'EXPENSE' ? t('tx.expense') : t('tx.income')}
                        {c.isSystem ? ` · ${t('categories.systemBadge')}` : ''}
                      </p>
                    </div>
                  </div>
                  {editable ? (
                    <div className="flex items-center gap-2 shrink-0">
                      {!c.isArchived && (
                        <button
                          type="button"
                          onClick={() => { setEditingCategory(c); setIsCategoryModalOpen(true); }}
                          aria-label={t('categories.edit')}
                          className="text-(--ink-3) hover:text-emerald-700 transition-colors cursor-pointer"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onToggleCategoryArchive(c.id)}
                        aria-label={c.isArchived ? t('categories.restore') : t('categories.archive')}
                        className="text-(--ink-3) hover:text-emerald-700 transition-colors cursor-pointer"
                      >
                        {c.isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      </button>
                    </div>
                  ) : null}
                </div>
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
              <p className="text-[11px] sm:text-[11px] leading-snug text-(--ink-3)">
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
            <p className="text-[11px] sm:text-[11px] leading-snug text-(--ink-3)">{t('security.honestNote')}</p>
          </>
        )}
      </div>

      {/* 4. Global Currency Hub */}
      <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 shadow-2xs">
            <Globe className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-(--ink)">App Currency</h4>
            <p className="text-[11px] sm:text-xs text-(--ink-3)">
              Select your currency. Updates all cards, transactions, and formulas.
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

      {/* 5. User Profile */}
      <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-800 shadow-2xs">
            <User className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-(--ink)">Your Name</h4>
            <p className="text-[11px] sm:text-xs text-(--ink-3)">Customize your greeting name</p>
          </div>
        </div>

        <input
          type="text"
          value={settings.userName}
          onChange={(e) => onUpdateSettings({ ...settings, userName: e.target.value })}
          className="w-full rounded-xl border border-(--line) bg-(--surface) px-3 py-2 text-xs font-bold text-(--ink) outline-none focus:border-emerald-600"
        />
      </div>

      {/* 6. Emergency Safety Reserve */}
      <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-800 shadow-2xs">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-(--ink)">
              Emergency Savings Cushion
            </h4>
            <p className="text-[11px] sm:text-xs text-(--ink-3)">
              Money kept safe that won't be counted in your daily spending limit
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

      {/* 7. Data Management & Clean Slate vs Demo */}
      <div className="rounded-[24px] sm:rounded-[28px] bg-(--surface) p-4 sm:p-5 shadow-sm border border-(--line-soft) space-y-3">
        <h4 className="text-xs sm:text-sm font-black text-(--ink)">Data Management</h4>

        <button
          type="button"
          onClick={handleExportCSV}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-(--surface-2) border border-(--line) py-2.5 text-xs font-bold text-(--ink-2) hover:bg-(--surface-3) transition-colors cursor-pointer"
        >
          <Download className="h-4 w-4 text-emerald-700" />
          <span>Download All Transactions ({currentCurrency} CSV Spreadsheet)</span>
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="flex items-center justify-center gap-2 rounded-xl bg-(--surface-2) border border-(--line) py-2.5 text-xs font-bold text-(--ink-2) hover:bg-(--surface-3) transition-colors cursor-pointer"
          >
            <Download className="h-4 w-4 text-emerald-700" />
            <span>{t('backup.download')}</span>
          </button>
          <button
            type="button"
            onClick={() => document.getElementById('finova-backup-file')?.click()}
            className="flex items-center justify-center gap-2 rounded-xl bg-(--surface-2) border border-(--line) py-2.5 text-xs font-bold text-(--ink-2) hover:bg-(--surface-3) transition-colors cursor-pointer"
          >
            <Upload className="h-4 w-4 text-emerald-700" />
            <span>{t('backup.restore')}</span>
          </button>
        </div>
        <input
          id="finova-backup-file"
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label={t('backup.restore')}
          onChange={handleRestoreFile}
        />
        <p className="text-[11px] font-medium text-(--ink-3)">
          {t('backup.hint')}
          {lastBackupAt ? ` · ${t('backup.lastBackup', { date: lastBackupAt })}` : ''}
        </p>

        <button
          type="button"
          onClick={() => document.getElementById('finova-import-file')?.click()}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-(--surface-2) border border-(--line) py-2.5 text-xs font-bold text-(--ink-2) hover:bg-(--surface-3) transition-colors cursor-pointer"
        >
          <Upload className="h-4 w-4 text-emerald-700" />
          <span>{t('import.button')}</span>
        </button>
        <input
          id="finova-import-file"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label={t('import.button')}
          onChange={handleImportFile}
        />
        <p className="text-[11px] font-medium text-(--ink-3)">{t('import.hint')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {/* Start Fresh (Clean 0 Slate) */}
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
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white py-2.5 text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Trash2 className="h-4 w-4 text-emerald-400" />
            <span>Start Fresh ({currentSymbol}0)</span>
          </button>

          {/* Load Sample Demo Data */}
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
            <span>Load Sample Data</span>
          </button>
        </div>
      </div>

      {/* Add / Edit Bank Modal */}
      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => { setIsAddAccountOpen(false); setEditingAccount(null); }}
        onSave={(data, reconcileToMinor) => {
          if (editingAccount) onUpdateAccount(editingAccount.id, data, reconcileToMinor);
          else onAddAccount(data);
        }}
        currency={currentCurrency}
        editingAccount={editingAccount}
      />

      {/* Add / Edit Category Modal */}
      <AddCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => { setIsCategoryModalOpen(false); setEditingCategory(null); }}
        onSave={(data) => {
          if (editingCategory) onUpdateCategory(editingCategory.id, data);
          else onAddCategory(data);
          setIsCategoryModalOpen(false);
          setEditingCategory(null);
        }}
        categories={categories}
        editingCategory={editingCategory}
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
