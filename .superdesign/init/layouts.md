# Shared Layout Components

## Header
- File: `src/components/navigation/Header.tsx`
- Description: Top navigation bar displaying user greeting, avatar, cloud connection indicator, global currency selector, and account picker dropdown.

```tsx
import React from 'react';
import { User as UserIcon, ChevronDown, Globe, LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { Account, CurrencyCode, UserSettings, ALL_CURRENCIES } from '../../types';
import { AuthUserProfile } from '../../services/supabase/authService';

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

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <select
              value={settings.currency}
              onChange={(e) => onSelectCurrency(e.target.value as CurrencyCode)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
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

          <div className="relative">
            <select
              value={selectedAccountId}
              onChange={(e) => onSelectAccount(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
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
```

## BottomNavigation
- File: `src/components/navigation/BottomNavigation.tsx`
- Description: Floating bottom navigation bar with icons for Home, All Expenses, Analytics, Settings, and a prominent center quick-add (+) action trigger.

```tsx
import React from 'react';
import { Home, ReceiptText, BarChart3, Settings, Plus } from 'lucide-react';

export type NavTab = 'HOME' | 'ALL_EXPENSES' | 'ANALYTICS' | 'SETTINGS';

interface BottomNavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenQuickAdd: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  currentTab,
  onSelectTab,
  onOpenQuickAdd,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 pb-safe pointer-events-none">
      <div className="flex items-center justify-between w-full max-w-lg md:max-w-xl h-16 sm:h-18 px-6 my-3 rounded-[28px] bg-[#122A1E]/95 backdrop-blur-xl border border-emerald-800/40 text-white shadow-2xl shadow-emerald-950/40 pointer-events-auto">
        <button
          type="button"
          onClick={() => onSelectTab('HOME')}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
            currentTab === 'HOME' ? 'text-[#D4F63D] scale-105' : 'text-emerald-200/60 hover:text-white'
          }`}
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px] font-bold">Home</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('ALL_EXPENSES')}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
            currentTab === 'ALL_EXPENSES' ? 'text-[#D4F63D] scale-105' : 'text-emerald-200/60 hover:text-white'
          }`}
        >
          <ReceiptText className="h-5 w-5" />
          <span className="text-[10px] font-bold">Expenses</span>
        </button>

        {/* Center Lime Quick Add Button */}
        <div className="relative -top-5">
          <button
            type="button"
            data-tour="quick-add"
            onClick={onOpenQuickAdd}
            className="flex h-13 w-13 items-center justify-center rounded-full bg-[#D4F63D] text-[#122A1E] shadow-xl shadow-lime-500/30 hover:scale-110 active:scale-95 transition-all cursor-pointer border-4 border-[#F7F7F2]"
            aria-label="Add transaction"
          >
            <Plus className="h-6 w-6 stroke-[3]" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelectTab('ANALYTICS')}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
            currentTab === 'ANALYTICS' ? 'text-[#D4F63D] scale-105' : 'text-emerald-200/60 hover:text-white'
          }`}
        >
          <BarChart3 className="h-5 w-5" />
          <span className="text-[10px] font-bold">Insights</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('SETTINGS')}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
            currentTab === 'SETTINGS' ? 'text-[#D4F63D] scale-105' : 'text-emerald-200/60 hover:text-white'
          }`}
        >
          <Settings className="h-5 w-5" />
          <span className="text-[10px] font-bold">Settings</span>
        </button>
      </div>
    </nav>
  );
};
```
