import React, { useState, useEffect } from 'react';
import {
  Account,
  Budget,
  Category,
  CurrencyCode,
  MoneyCommitment,
  SavingsGoal,
  Transaction,
  UserSettings,
} from './types';
import { FinovaState, FinovaStorage } from './services/storage/FinovaStorage';
import { SafeToSpendEngine } from './domain/safe-to-spend/SafeToSpendEngine';
import { RiskEngine } from './domain/risk/RiskEngine';
import { TimelineEngine } from './domain/timeline/TimelineEngine';
import { TransactionEngine } from './domain/transaction/TransactionEngine';
import { DateUtils } from './domain/date/DateUtils';

// Services
import { AuthService, AuthUserProfile } from './services/supabase/authService';
import { CloudSyncService } from './services/supabase/cloudSyncService';

// Navigation & Screens
import { Header } from './components/navigation/Header';
import { BottomNavigation, NavTab } from './components/navigation/BottomNavigation';
import { HomeScreen } from './screens/HomeScreen';
import { AllExpensesScreen } from './screens/AllExpensesScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AuthScreen } from './screens/AuthScreen';

// Modals & Tours
import { AddTransactionModal } from './components/modals/AddTransactionModal';
import { SafeToSpendExplainerModal } from './components/modals/SafeToSpendExplainerModal';
import { WhatIfModal } from './components/modals/WhatIfModal';
import { OnboardingModal } from './components/modals/OnboardingModal';
import { GuidedAppTour } from './components/tutorial/GuidedAppTour';
import { Modal } from './components/ui/Modal';
import { MoneyValue } from './domain/money/MoneyValue';
import { Trash2 } from 'lucide-react';

export function App() {
  const [authUser, setAuthUser] = useState<AuthUserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [state, setState] = useState<FinovaState>(() => FinovaStorage.loadState());
  const [currentTab, setCurrentTab] = useState<NavTab>('HOME');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');

  // Modal & Tour Visibility States
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [isSafeToSpendOpen, setIsSafeToSpendOpen] = useState(false);
  const [isWhatIfOpen, setIsWhatIfOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [selectedTxForDetail, setSelectedTxForDetail] = useState<Transaction | null>(null);

  // Initialize and listen to Auth state changes
  useEffect(() => {
    let isMounted = true;
    AuthService.getInitialSession().then(({ user }) => {
      if (isMounted) {
        setAuthUser(user);
        setIsAuthLoading(false);
      }
    });

    const { data } = AuthService.onAuthStateChange((_event, _session, user) => {
      if (isMounted) {
        setAuthUser(user);
      }
    });

    return () => {
      isMounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  // Sync state to local storage & Supabase Cloud
  useEffect(() => {
    FinovaStorage.saveState(state);
    if (authUser && !authUser.isGuest) {
      CloudSyncService.syncStateToCloud(state, authUser);
    }
  }, [state, authUser]);

  const { accounts, transactions, categories, budgets, goals, commitments, settings } = state;
  const todayISO = DateUtils.getTodayISO();
  const currency = settings.currency || 'PHP';

  // Filter accounts if specific account selected
  const activeAccounts = selectedAccountId === 'ALL'
    ? accounts
    : accounts.filter((a) => a.id === selectedAccountId);

  // Authoritative Domain Calculations
  const safeToSpend = SafeToSpendEngine.calculateSafeToSpend(
    activeAccounts,
    commitments,
    goals,
    settings,
    todayISO
  );

  const timeline = TimelineEngine.generateTimeline(
    activeAccounts,
    transactions,
    commitments,
    categories,
    todayISO,
    DateUtils.addDaysISO(todayISO, 30),
    todayISO
  );

  const risks = RiskEngine.detectCashFlowRisks(
    activeAccounts,
    timeline,
    commitments,
    goals,
    settings,
    todayISO
  );

  // Handler: Change Global Currency across the entire system
  const handleSelectCurrency = (newCurrency: CurrencyCode) => {
    const updated = FinovaStorage.setGlobalCurrency(state, newCurrency);
    setState(updated);
  };

  // Handler: Add New Account / Bank
  const handleAddAccount = (newAccData: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newAccount: Account = {
      ...newAccData,
      id: `acc-${Date.now()}`,
      currency,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      accounts: [...prev.accounts, newAccount],
    }));
  };

  // Handler: Delete Account
  const handleDeleteAccount = (accountId: string) => {
    if (state.accounts.length <= 1) {
      alert('You must have at least one account.');
      return;
    }
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((a) => a.id !== accountId),
    }));
    if (selectedAccountId === accountId) {
      setSelectedAccountId('ALL');
    }
  };

  // Handler: Add New Transaction
  const handleSaveTransaction = (newTxData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newTx: Transaction = {
      ...newTxData,
      id: `tx-${Date.now()}`,
      currency,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedAccounts = TransactionEngine.applyTransactionToAccounts(newTx, state.accounts);
    const updatedTransactions = [newTx, ...state.transactions];

    setState((prev) => ({
      ...prev,
      accounts: updatedAccounts,
      transactions: updatedTransactions,
    }));
  };

  // Handler: Delete Transaction
  const handleDeleteTransaction = (txId: string) => {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return;

    if (!confirm('Delete this transaction? Its financial balance effect will be reversed.')) {
      return;
    }

    const updatedAccounts = TransactionEngine.reverseTransactionFromAccounts(tx, state.accounts);
    const updatedTransactions = state.transactions.filter((t) => t.id !== txId);

    setState((prev) => ({
      ...prev,
      accounts: updatedAccounts,
      transactions: updatedTransactions,
    }));

    setSelectedTxForDetail(null);
  };

  // Handler: Reset to Clean 0 Slate (For Real Life)
  const handleResetToCleanSlate = () => {
    const clean = FinovaStorage.resetToCleanSlate(currency, authUser?.fullName || settings.userName);
    setState(clean);
  };

  // Handler: Load Demo Showcase Data
  const handleLoadDemoData = () => {
    const demo = FinovaStorage.loadDemoShowcaseData();
    setState(demo);
  };

  // Handler: Sign Out
  const handleSignOut = async () => {
    await AuthService.signOut();
    setAuthUser(null);
  };

  // Handler: Onboarding Completion
  const handleOnboardingComplete = (data: {
    settings: UserSettings;
    initialAccount: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;
    isDemo: boolean;
  }) => {
    if (data.isDemo) {
      const demo = FinovaStorage.loadDemoShowcaseData();
      setState({
        ...demo,
        settings: {
          ...demo.settings,
          userName: data.settings.userName || demo.settings.userName,
          currency: data.settings.currency || demo.settings.currency,
          budgetCycleMode: data.settings.budgetCycleMode,
          hasCompletedOnboarding: true,
        },
      });
    } else {
      const newAcc: Account = {
        ...data.initialAccount,
        id: 'acc-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const cleanState: FinovaState = {
        accounts: [newAcc],
        transactions: [],
        categories: state.categories,
        budgets: [],
        goals: [],
        commitments: [],
        recurring: [],
        settings: {
          ...data.settings,
          userName: authUser?.fullName || data.settings.userName,
          hasCompletedOnboarding: true,
        },
      };
      FinovaStorage.saveState(cleanState);
      setState(cleanState);
    }
  };

  // Show Loading Spinner during initial auth check
  if (isAuthLoading) {
    return (
      <div className="min-h-screen w-full bg-[#0A1811] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-[#D4F63D] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-emerald-300 tracking-wider uppercase">Loading FINOVA...</span>
        </div>
      </div>
    );
  }

  // If not logged in, render the AuthScreen (Google + Email Auth)
  if (!authUser) {
    return <AuthScreen onAuthenticated={(user) => setAuthUser(user)} />;
  }

  return (
    <div className="min-h-screen bg-[#F7F7F2] text-slate-900 font-sans flex flex-col items-center justify-start w-full">
      {/* Responsive App Container */}
      <div className="w-full max-w-lg md:max-w-2xl lg:max-w-3xl px-4 sm:px-6 pt-2 sm:pt-4 pb-28 min-h-screen flex flex-col">
        {/* Header */}
        <Header
          settings={settings}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
          onSelectCurrency={handleSelectCurrency}
          authUser={authUser}
          onNavigateToSettings={() => setCurrentTab('SETTINGS')}
          onOpenSignIn={() => setAuthUser(null)}
          onSignOut={handleSignOut}
        />

        {/* Main Content Area */}
        <main className="flex-1 w-full mt-1 sm:mt-2">
          {currentTab === 'HOME' && (
            <HomeScreen
              accounts={activeAccounts}
              transactions={transactions}
              categories={categories}
              budgets={budgets}
              goals={goals}
              commitments={commitments}
              settings={settings}
              safeToSpend={safeToSpend}
              risks={risks}
              onNavigateToTab={(tab) => setCurrentTab(tab as NavTab)}
              onOpenSafeToSpendExplainer={() => setIsSafeToSpendOpen(true)}
              onOpenQuickAdd={() => setIsAddTxOpen(true)}
              onSelectTransaction={(tx) => setSelectedTxForDetail(tx)}
            />
          )}

          {currentTab === 'ALL_EXPENSES' && (
            <AllExpensesScreen
              accounts={activeAccounts}
              transactions={transactions}
              categories={categories}
              settings={settings}
              onBackToHome={() => setCurrentTab('HOME')}
              onSelectTransaction={(tx) => setSelectedTxForDetail(tx)}
            />
          )}

          {currentTab === 'ANALYTICS' && (
            <InsightsScreen
              accounts={activeAccounts}
              transactions={transactions}
              categories={categories}
              budgets={budgets}
              goals={goals}
              commitments={commitments}
              settings={settings}
              onOpenWhatIf={() => setIsWhatIfOpen(true)}
            />
          )}

          {currentTab === 'SETTINGS' && (
            <SettingsScreen
              settings={settings}
              onUpdateSettings={(newSettings) => setState((prev) => ({ ...prev, settings: newSettings }))}
              onSelectCurrency={handleSelectCurrency}
              accounts={accounts}
              onAddAccount={handleAddAccount}
              onDeleteAccount={handleDeleteAccount}
              transactions={transactions}
              categories={categories}
              budgets={budgets}
              onResetToCleanSlate={handleResetToCleanSlate}
              onLoadDemoData={handleLoadDemoData}
              onStartAppTour={() => setIsTourOpen(true)}
              authUser={authUser}
              onSignOut={handleSignOut}
            />
          )}
        </main>
      </div>

      {/* Persistent Fluid Bottom Navigation */}
      <BottomNavigation
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenQuickAdd={() => setIsAddTxOpen(true)}
      />

      {/* LIVE APP TOUR OVERLAY (ANIMATED SPOTLIGHT POINTER) */}
      <GuidedAppTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onNavigateTab={(tab) => setCurrentTab(tab)}
        currency={currency}
      />

      {/* MODALS */}
      {/* 1. First-Time Welcome Onboarding Wizard */}
      {settings.hasCompletedOnboarding === false && (
        <OnboardingModal
          isOpen={true}
          onComplete={handleOnboardingComplete}
        />
      )}

      {/* 2. Fast Add Transaction */}
      <AddTransactionModal
        isOpen={isAddTxOpen}
        onClose={() => setIsAddTxOpen(false)}
        onSave={handleSaveTransaction}
        accounts={accounts}
        categories={categories}
        currency={currency}
      />

      {/* 3. Safe-to-Spend Explainer */}
      <SafeToSpendExplainerModal
        isOpen={isSafeToSpendOpen}
        onClose={() => setIsSafeToSpendOpen(false)}
        safeToSpend={safeToSpend}
        settings={settings}
      />

      {/* 4. What-If Simulation */}
      <WhatIfModal
        isOpen={isWhatIfOpen}
        onClose={() => setIsWhatIfOpen(false)}
        onConfirmAsRealTransaction={handleSaveTransaction}
        accounts={accounts}
        transactions={transactions}
        budgets={budgets}
        goals={goals}
        commitments={commitments}
        categories={categories}
        settings={settings}
      />

      {/* 5. Transaction Detail Modal */}
      {selectedTxForDetail && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedTxForDetail(null)}
          title="Transaction Details"
        >
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4 text-center border border-slate-100">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                {selectedTxForDetail.type}
              </span>
              <p className="text-3xl font-black text-slate-900">
                {MoneyValue.fromMinorUnits(selectedTxForDetail.amount, selectedTxForDetail.currency).format()}
              </p>
              <p className="text-xs font-bold text-slate-700 mt-1">
                {selectedTxForDetail.merchant || 'Personal Entry'}
              </p>
            </div>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white p-3 text-xs space-y-2">
              <div className="flex justify-between py-1">
                <span className="text-slate-500 font-medium">Date & Time</span>
                <span className="font-bold text-slate-800">
                  {selectedTxForDetail.date} {selectedTxForDetail.time || ''}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 font-medium">Category</span>
                <span className="font-bold text-slate-800">
                  {categories.find((c) => c.id === selectedTxForDetail.categoryId)?.name || selectedTxForDetail.categoryId}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 font-medium">Account</span>
                <span className="font-bold text-slate-800">
                  {accounts.find((a) => a.id === selectedTxForDetail.accountId)?.name || 'Default Account'}
                </span>
              </div>
              {selectedTxForDetail.note && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-500 font-medium">Note</span>
                  <span className="font-semibold text-slate-800">{selectedTxForDetail.note}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleDeleteTransaction(selectedTxForDetail.id)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-50 border border-rose-200 py-3 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete Transaction (Reverses Balance)</span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default App;
