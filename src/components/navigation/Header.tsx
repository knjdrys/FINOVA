import React from 'react';
import { User as UserIcon, ChevronDown, Globe, LogIn, LogOut, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Account, CurrencyCode, UserSettings, ALL_CURRENCIES } from '../../types';
import { AuthUserProfile } from '../../services/supabase/authService';
import { isSupabaseConfigured } from '../../services/supabase/supabaseClient';

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
}

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
}) => {
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const accountLabel = selectedAccountId === 'ALL' ? 'Personal' : selectedAccount?.name || 'Personal';
  const isGuest = authUser?.isGuest ?? true;

  return (
    <div className="space-y-2 pb-2">
      {/* 1. GUEST BANNER / CLOUD SYNC STATUS BAR */}
      {isGuest ? (
        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-2xl px-3.5 py-1.5 text-xs text-amber-900 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="font-black tracking-tight uppercase text-[10px] sm:text-xs text-amber-950">
              NOTE: GUEST ACCOUNT ONLY
            </span>
            <span className="hidden sm:inline text-[11px] text-amber-800/80">
              — Data is saved locally on this browser
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenSignIn}
            className="flex items-center gap-1.5 rounded-xl bg-[#122A1E] text-[#D4F63D] px-3 py-1 text-[11px] sm:text-xs font-black shadow-xs hover:bg-[#183625] active:scale-95 transition-all cursor-pointer shrink-0 ml-2"
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
            onClick={() => {
              if (confirm('Are you sure you want to log out of FINOVA?')) {
                onSignOut?.();
              }
            }}
            className="flex items-center gap-1 rounded-lg text-[11px] font-extrabold text-slate-500 hover:text-rose-600 px-2 py-0.5 transition-colors cursor-pointer shrink-0"
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#122A1E] text-[#D4F63D] shadow-xs overflow-hidden border border-emerald-800/40 hover:scale-105 transition-transform cursor-pointer"
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
            <p className="truncate text-sm sm:text-base font-bold tracking-tight text-slate-800">
              Welcome, <span className="font-black text-slate-900">{authUser?.fullName || settings.userName}</span>
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 shrink-0">
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
            <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-slate-800 shadow-xs border border-slate-200/80 hover:bg-slate-50 transition-colors">
              <Globe className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
              <span>{settings.currency}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
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
            <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-xs border border-slate-200/80 hover:bg-slate-50 transition-colors">
              <UserIcon className="h-3.5 w-3.5 text-slate-600 shrink-0" />
              <span className="truncate max-w-[90px] sm:max-w-[140px]">{accountLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            </div>
          </div>
        </div>
      </header>
    </div>
  );
};
