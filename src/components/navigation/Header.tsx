import React from 'react';
import { User as UserIcon, ChevronDown, Globe, LogIn, LogOut, ShieldCheck, Download, CloudOff, RefreshCw, CloudUpload } from 'lucide-react';
import { Account, CurrencyCode, UserSettings, ALL_CURRENCIES } from '../../types';
import { AuthUserProfile } from '../../services/supabase/authService';
import type { SyncStatus } from '../../services/sync/syncQueue';
import { useI18n } from '../../i18n';
import { confirmDialog } from '../ui/dialog';

interface HeaderProps {
  settings: UserSettings;
  accounts: Account[];
  selectedAccountId: string;
  onSelectAccount: (accountId: string) => void;
  onSelectCurrency: (currency: CurrencyCode) => void;
  authUser?: AuthUserProfile | null;
  onNavigateToSettings?: () => void;
  onOpenSignIn?: () => void;
  onSignOut?: () => void;
  syncStatus?: SyncStatus | null;
  canInstall?: boolean;
  onInstall?: () => void;
  updateReady?: boolean;
  onApplyUpdate?: () => void;
}

/**
 * Truthful connectivity pill. Only claims what the sync layer actually knows:
 *  - offline (navigator.onLine) with/without queued ops
 *  - an in-flight or retrying cloud flush
 *  - a confirmed successful push ("Synced")
 * Guest / unconfigured users see nothing (the guest banner already explains).
 */
const SyncPill: React.FC<{ status: SyncStatus | null }> = ({ status }) => {
  const { t } = useI18n();
  if (!status || status.phase === 'local-only' || status.phase === 'idle') return null;

  let icon = <CloudUpload className="h-3 w-3" />;
  let label = '';
  let tone = 'bg-emerald-500/15 text-emerald-800 border-emerald-600/25';

  if (!status.online) {
    icon = <CloudOff className="h-3 w-3" />;
    label = status.pending > 0 ? t('sync.offlinePending', { count: status.pending }) : t('sync.offline');
    tone = 'bg-slate-500/15 text-(--ink-2) border-slate-500/25';
  } else if (status.phase === 'syncing') {
    icon = <RefreshCw className="h-3 w-3 animate-spin" />;
    label = t('sync.syncing');
    tone = 'bg-sky-500/15 text-sky-800 border-sky-600/25';
  } else if (status.phase === 'retrying' || status.phase === 'queued-offline') {
    icon = <RefreshCw className="h-3 w-3" />;
    label = t('sync.pending', { count: status.pending });
    tone = 'bg-amber-500/15 text-amber-800 border-amber-500/30';
  } else if (status.phase === 'synced') {
    label = t('sync.synced');
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${tone}`}
    >
      {icon}
      {label}
    </span>
  );
};

export const Header: React.FC<HeaderProps> = ({
  settings,
  accounts,
  selectedAccountId,
  onSelectAccount,
  onSelectCurrency,
  authUser,
  onNavigateToSettings,
  onOpenSignIn,
  onSignOut,
  syncStatus,
  canInstall,
  onInstall,
  updateReady,
  onApplyUpdate,
}) => {
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const accountLabel = selectedAccountId === 'ALL' ? 'Personal' : selectedAccount?.name || 'Personal';
  const isGuest = authUser?.isGuest ?? true;
  const { t } = useI18n();

  return (
    <div className="space-y-2 pb-2">
      {/* 1. GUEST BANNER / CLOUD SYNC STATUS BAR */}
      {isGuest ? (
        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-2xl px-3.5 py-1.5 text-xs text-amber-900 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="font-black tracking-tight uppercase text-[11px] sm:text-xs text-amber-950">
              NOTE: GUEST ACCOUNT ONLY
            </span>
            <span className="hidden sm:inline text-[11px] text-amber-800/80">
              — Data is saved locally on this browser
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenSignIn}
            className="flex items-center gap-1.5 rounded-xl bg-(--brand) text-(--accent) px-3 py-1.5 text-[11px] sm:text-xs font-black shadow-xs hover:bg-(--brand-hover) active:scale-95 transition-all cursor-pointer shrink-0 ml-2"
          >
            <LogIn className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Sign In</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-600/20 rounded-2xl px-3.5 py-1 text-xs text-emerald-950">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
            <span className="truncate text-[11px] font-bold text-emerald-900">
              Logged in as <strong className="font-extrabold">{authUser?.email || authUser?.fullName}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={async () => {
              if (await confirmDialog({ title: t('dialog.signOut') })) {
                onSignOut?.();
              }
            }}
            className="flex items-center gap-1 rounded-lg text-[11px] font-extrabold text-(--ink-3) hover:text-rose-600 px-2 py-1.5 transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="h-3 w-3" />
            <span>Logout</span>
          </button>
        </div>
      )}

      {/* 2. MAIN HEADER NAVIGATION BAR */}
      <header data-tour="header-actions" className="flex items-center justify-between pt-1">
        {/* User Profile Avatar & Name */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
          <button
            type="button"
            onClick={onNavigateToSettings}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--brand) text-(--accent) shadow-xs overflow-hidden border border-emerald-800/40 hover:scale-105 transition-transform cursor-pointer"
            title={authUser?.email || 'User Profile'}
          >
            {authUser?.avatarUrl ? (
              <img src={authUser.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs font-black">
                {(authUser?.fullName || settings.userName || 'J')[0].toUpperCase()}
              </span>
            )}
          </button>

          <div className="min-w-0">
            <p className="truncate text-sm sm:text-base font-bold tracking-tight text-(--ink)">
              Welcome, <span className="font-black text-(--ink)">{authUser?.fullName || settings.userName}</span>
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Offline / sync status (real connectivity, not decoration) */}
          <SyncPill status={syncStatus ?? null} />

          {/* New version ready — user chooses when to reload, never forced */}
          {updateReady && (
            <button
              type="button"
              onClick={onApplyUpdate}
              className="flex items-center gap-1 rounded-full bg-sky-600 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide text-white shadow-xs hover:bg-sky-700 active:scale-95 transition-all cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              <span>{t('sync.update')}</span>
            </button>
          )}

          {/* Install app — only when the browser actually offered it */}
          {canInstall && (
            <button
              type="button"
              onClick={onInstall}
              className="flex items-center gap-1 rounded-full bg-(--brand) px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide text-(--accent) shadow-xs hover:bg-(--brand-hover) active:scale-95 transition-all cursor-pointer"
            >
              <Download className="h-3 w-3" />
              <span>{t('sync.install')}</span>
            </button>
          )}

          {/* Currency Quick Selector */}
          <div className="relative">
            <select
              value={settings.currency}
              onChange={(e) => onSelectCurrency(e.target.value as CurrencyCode)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              aria-label="Select Currency"
            >
              {ALL_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} - {c.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5 rounded-full bg-(--surface) px-3 py-1.5 text-xs font-extrabold text-(--ink) shadow-xs border border-(--line)/80 hover:bg-(--surface-2) transition-colors">
              <Globe className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
              <span>{settings.currency}</span>
              <ChevronDown className="h-3.5 w-3.5 text-(--ink-3) shrink-0" />
            </div>
          </div>

          {/* Account Selector Pill */}
          <div className="relative">
            <select
              value={selectedAccountId}
              onChange={(e) => onSelectAccount(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              aria-label="Select Account"
            >
              <option value="ALL">Personal (All Accounts)</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5 rounded-full bg-(--surface) px-3 py-1.5 text-xs font-bold text-(--ink) shadow-xs border border-(--line)/80 hover:bg-(--surface-2) transition-colors">
              <UserIcon className="h-3.5 w-3.5 text-(--ink-2) shrink-0" />
              <span className="truncate max-w-[90px] sm:max-w-[140px]">{accountLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-(--ink-3) shrink-0" />
            </div>
          </div>
        </div>
      </header>
    </div>
  );
};
