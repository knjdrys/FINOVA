import { useState, useEffect, useRef } from 'react';
import { I18nProvider } from './i18n';
import { t } from './i18n/core';
import { DialogProvider, confirmDialog, notice } from './components/ui/dialog';
import { AppLockGuard } from './components/security/AppLockGuard';
import {
  Account,
  Budget,
  CommitmentType,
  CurrencyCode,
  MoneyCommitment,
  RecurringTransaction,
  SavingsGoal,
  Transaction,
  UserSettings,
  PlansSection,
} from './types';
import { FinovaState, FinovaStorage } from './services/storage/FinovaStorage';
import { AccountEngine } from './domain/account/AccountEngine';
import { SafeToSpendEngine } from './domain/safe-to-spend/SafeToSpendEngine';
import { RiskEngine } from './domain/risk/RiskEngine';
import { TimelineEngine } from './domain/timeline/TimelineEngine';
import { TransactionEngine } from './domain/transaction/TransactionEngine';
import type { EntryMode } from './domain/entry/UnifiedEntry';
import { GoalEngine } from './domain/goal/GoalEngine';
import { FutureFinanceEngine } from './domain/future-finance/FutureFinanceEngine';
import { NotificationEngine } from './domain/notification/NotificationEngine';
import { InsightEngine } from './domain/insight/InsightEngine';
import { NotificationPrefsService } from './services/notification/NotificationPrefsService';
import { showOsNotification } from './services/notification/browserNotify';
import type { NotificationPreferences, NotificationMeta } from './types';
import { DateUtils } from './domain/date/DateUtils';

// Services
import { AuthService, AuthUserProfile } from './services/supabase/authService';
import { CloudSyncService } from './services/supabase/cloudSyncService';
import { initSyncManager, getSyncManager, subscribeSyncStatus, registerServiceWorker, setupInstallPrompt, promptInstall, subscribeInstallable, isStandalone, subscribeSwUpdate, applyServiceWorkerUpdate } from './services/sync/browserSync';
import type { SyncStatus } from './services/sync/syncQueue';

// Navigation & Screens
import { Header } from './components/navigation/Header';
import { BottomNavigation, NavTab } from './components/navigation/BottomNavigation';
import { HomeScreen } from './screens/HomeScreen';
import { AllExpensesScreen } from './screens/AllExpensesScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { PlansScreen } from './screens/PlansScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AuthScreen } from './screens/AuthScreen';

// Modals & Tours
import { AddTransactionModal } from './components/modals/AddTransactionModal';
import { TransactionDetailModal } from './components/modals/TransactionDetailModal';
import { AddBudgetModal } from './components/modals/AddBudgetModal';
import { AddGoalModal } from './components/modals/AddGoalModal';
import { AddCommitmentModal } from './components/modals/AddCommitmentModal';
import { AddRecurringModal } from './components/modals/AddRecurringModal';
import { SafeToSpendExplainerModal } from './components/modals/SafeToSpendExplainerModal';
import { WhatIfModal } from './components/modals/WhatIfModal';
import { OnboardingModal } from './components/modals/OnboardingModal';
import { GuidedAppTour } from './components/tutorial/GuidedAppTour';

export function App() {
  const [authUser, setAuthUser] = useState<AuthUserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [state, setState] = useState<FinovaState>(() => FinovaStorage.loadState());
  const [currentTab, setCurrentTab] = useState<NavTab>('HOME');
  // Home alert deep-links into Plans (section + nonce so repeats re-fire).
  const [plansInitialSection, setPlansInitialSection] = useState<PlansSection | undefined>(undefined);
  const [plansSectionNonce, setPlansSectionNonce] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');

  // Modal & Tour Visibility States
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState<EntryMode>('EXPENSE');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [isSafeToSpendOpen, setIsSafeToSpendOpen] = useState(false);
  const [isWhatIfOpen, setIsWhatIfOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isAddBudgetOpen, setIsAddBudgetOpen] = useState(false);
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const [isAddCommitmentOpen, setIsAddCommitmentOpen] = useState(false);
  const [isAddRecurringOpen, setIsAddRecurringOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [goalPreset, setGoalPreset] = useState<{ name: string } | null>(null);
  const [editingCommitment, setEditingCommitment] = useState<MoneyCommitment | null>(null);
  const [commitmentPreset, setCommitmentPreset] = useState<{ type: CommitmentType; title?: string } | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringTransaction | null>(null);
  const [selectedTxForDetail, setSelectedTxForDetail] = useState<Transaction | null>(null);

  // ---- Offline / sync plumbing ----
  // Latest state snapshot for the queue flush (avoids stale closures).
  const stateRef = useRef(state);
  stateRef.current = state;
  // Identity adoption: every auth transition (boot restore, guest entry, email/
  // OAuth sign-in) must re-scope device storage to that user AND load their
  // namespace. Setting identity without re-scoping silently writes the user's
  // data into the boot ('none') namespace, which then "disappears" on reload.
  const scopedAuthIdRef = useRef<string | null>(null);
  const adoptAuthUser = (user: AuthUserProfile | null) => {
    if (user?.id !== scopedAuthIdRef.current) {
      scopedAuthIdRef.current = user?.id ?? null;
      FinovaStorage.setScopeForUser(user);
      setState(FinovaStorage.loadState());
    }
    setAuthUser(user);
  };
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  // Notification behavior + lifecycle meta (device-local, not cloud-synced).
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(() => NotificationPrefsService.loadPrefs());
  const notifMetaRef = useRef<Record<string, NotificationMeta>>(null!);
  if (!notifMetaRef.current) notifMetaRef.current = NotificationPrefsService.loadMeta();

  // Initialize and listen to Auth state changes
  useEffect(() => {
    let isMounted = true;
    AuthService.getInitialSession().then(({ user }) => {
      if (isMounted) {
        adoptAuthUser(user);
        setIsAuthLoading(false);
      }
    });

    const { data } = AuthService.onAuthStateChange((_event, _session, user) => {
      if (isMounted) {
        adoptAuthUser(user);
      }
    });

    return () => {
      isMounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  // Theme: reflect the persisted preference on <html> so the .dark variant
  // tokens (see index.css) flip every neutral surface app-wide.
  // (Reads state.settings: the `settings` shorthand destructures later.)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.settings.darkTheme === true);
  }, [state.settings.darkTheme]);

  // PWA: service worker + install prompt + sync status subscription.
  useEffect(() => {
    registerServiceWorker();
    setupInstallPrompt();
    const unsubInstall = subscribeInstallable(setCanInstall);
    const unsubSync = subscribeSyncStatus(setSyncStatus);
    const unsubUpdate = subscribeSwUpdate((s) => setUpdateReady(s === 'ready'));
    return () => {
      unsubInstall();
      unsubSync();
      unsubUpdate();
    };
  }, []);

  // (Re)create the sync manager whenever auth identity changes.
  useEffect(() => {
    initSyncManager({ getState: () => stateRef.current, authUser });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id, authUser?.isGuest]);

  // Load data from Supabase Cloud whenever user logs in
  useEffect(() => {
    if (authUser) {
      const userNameToSet = authUser.fullName || authUser.email.split('@')[0] || 'User';
      setState((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          userId: authUser.id,
          userName: userNameToSet,
        },
      }));

      if (!authUser.isGuest) {
        CloudSyncService.loadStateFromCloud(authUser).then((cloudState) => {
          if (cloudState && cloudState.accounts.length > 0) {
            setState((prev) => ({
              ...cloudState,
              categories: prev.categories.length > 0 ? prev.categories : cloudState.categories,
              settings: {
                ...cloudState.settings,
                userName: userNameToSet,
              },
            }));
          } else {
            // New user on cloud: queue initial state sync up to Supabase
            getSyncManager()?.requestSync();
          }
        });
      }
    }
  }, [authUser?.id, authUser?.fullName, authUser?.isGuest]);

  // Sync state to local storage & queue the cloud push
  useEffect(() => {
    FinovaStorage.saveState(state);
    if (authUser && !authUser.isGuest) {
      getSyncManager()?.requestSync();
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
  // The recurring->commitment bridge, overdue recompute, and auto-post all flow through
  // FutureFinanceEngine so every downstream screen consumes ONE resolved commitment list.
  const resolvedCommitments = FutureFinanceEngine.resolveCommitments(
    state.recurring,
    state.commitments,
    state.transactions,
    todayISO,
    DateUtils.addDaysISO(todayISO, 30),
    todayISO
  );

  const safeToSpend = SafeToSpendEngine.calculateSafeToSpend(
    activeAccounts,
    resolvedCommitments,
    goals,
    settings,
    todayISO
  );

  /**
   * Auto-post lifecycle: once per session, settle due commitments that opted in.
   * The engine is idempotent (skips anything already posted via sourceCommitmentId),
   * and the ref guard prevents double roll-forward under StrictMode re-runs.
   * Recurring rules whose occurrence was posted advance to their next occurrence.
   */
  const autoPostRanRef = useRef(false);
  useEffect(() => {
    if (autoPostRanRef.current) return;
    autoPostRanRef.current = true;

    const due = resolvedCommitments.filter(
      (c) =>
        c.autoPostEnabled &&
        c.dueDate <= todayISO &&
        c.status !== 'COMPLETED' &&
        c.status !== 'CANCELLED' &&
        c.status !== 'AUTO_POSTED'
    );
    if (due.length === 0) return;

    const result = FutureFinanceEngine.autoPostDueCommitments(
      due,
      state.accounts,
      state.transactions,
      todayISO
    );
    if (result.postedCount === 0) return;

    const postedIds = new Set(result.commitments.filter((c) => c.status === 'AUTO_POSTED').map((c) => c.id));
    const postedRecurringIds = new Set(
      result.commitments
        .filter((c) => postedIds.has(c.id) && c.relatedRecurringTransactionId)
        .map((c) => c.relatedRecurringTransactionId as string)
    );

    setState((prev) => ({
      ...prev,
      accounts: result.accounts,
      transactions: result.transactions,
      // Persist settled status for manual commitments (generated ones re-derive).
      commitments: prev.commitments.map((c) =>
        postedIds.has(c.id) ? { ...c, status: 'AUTO_POSTED' as const, updatedAt: todayISO } : c
      ),
      // Roll recurring rules forward so the posted occurrence is not regenerated.
      recurring: prev.recurring.map((r) =>
        postedRecurringIds.has(r.id)
          ? {
              ...r,
              nextOccurrence: FutureFinanceEngine.advanceOccurrence(
                r.nextOccurrence && r.nextOccurrence >= r.startDate ? r.nextOccurrence : r.startDate,
                r.frequency
              ),
              updatedAt: new Date().toISOString(),
            }
          : r
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCommitments, todayISO]);

  const timeline = TimelineEngine.generateTimeline(
    activeAccounts,
    transactions,
    resolvedCommitments,
    categories,
    todayISO,
    DateUtils.addDaysISO(todayISO, 30),
    todayISO
  );

  const risks = RiskEngine.detectCashFlowRisks(
    activeAccounts,
    timeline,
    resolvedCommitments,
    goals,
    settings,
    todayISO
  );

  const notifications = NotificationEngine.generateNotifications({
    commitments: resolvedCommitments,
    risks,
    autoPostedTransactions: transactions.filter((t) => t.sourceCommitmentId),
    transactions,
    budgets,
    goals,
    recurring: state.recurring,
    readIds: state.readNotificationIds,
    prefs: notifPrefs,
    referenceDateISO: todayISO,
  });

  // Product Brain: one shared insight list (Home calm-state line + Analytics).
  const insights = InsightEngine.generateInsights(
    activeAccounts,
    transactions,
    budgets,
    goals,
    resolvedCommitments,
    categories,
    settings,
    todayISO
  );

  // OS dispatch: when the feed gains new HIGH/MEDIUM items and the user
  // opted into OS notifications, surface them (SW-backed, per-id cooldown,
  // capped + summary). Truthful scope: this only runs while the app is
  // open — there is no push backend, and we don't pretend otherwise.
  const notifSig = notifications.map((n) => n.id).join('|');
  useEffect(() => {
    if (!notifPrefs.osNotifications || !notifPrefs.enabled) return;
    const meta = notifMetaRef.current;
    const now = Date.now();
    const nowISO = new Date(now).toISOString();
    const plan = NotificationEngine.planOsNotifications(notifications, notifPrefs, meta, now);
    if (plan.toSend.length === 0 && plan.collapsedCount === 0) return;
    let touched = false;
    for (const n of plan.toSend) {
      void showOsNotification(n.title, n.body, n.id).then((shown) => {
        if (!shown) return;
        meta[n.id] = { lastShownAt: meta[n.id]?.lastShownAt || nowISO, lastOsSentAt: nowISO };
        touched = true;
        NotificationPrefsService.saveMeta(meta, now);
      });
    }
    if (plan.collapsedCount > 0) {
      const summaryId = `ntf-summary-${Math.floor(now / 3600000)}`; // one per hour, max
      void showOsNotification(
        t('notif.moreTitle'),
        t('notif.moreBody', { count: plan.collapsedCount }),
        summaryId
      ).then((shown) => {
        if (shown) NotificationPrefsService.saveMeta(meta, now);
      });
    }
    void touched;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifSig, notifPrefs.osNotifications, notifPrefs.cooldownHours]);

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
    const nextState = {
      ...state,
      accounts: [...state.accounts, newAccount],
    };
    setState(nextState);
    if (authUser && !authUser.isGuest) {
      getSyncManager()?.requestSync();
    }
  };

  // Handler: Delete Account
  const handleDeleteAccount = async (accountId: string) => {
    if (state.accounts.length <= 1) {
      notice(t('dialog.minOneAccount'));
      return;
    }
    const acc = state.accounts.find((a) => a.id === accountId);
    const hasHistory = AccountEngine.hasHistory(state.transactions, accountId);
    // Accounts with history are ARCHIVED, never hard-deleted: hard-deleting
    // would orphan transactions (balances drop but spend history stays,
    // breaking every total). Archive excludes the account from totals,
    // Safe-to-Spend, and pickers while keeping history intact.
    if (hasHistory && acc) {
      if (
        !(await confirmDialog({
          title: t('dialog.archiveAccount', { name: acc.name }),
          message: t('dialog.archiveAccountHint'),
          danger: true,
          confirmLabel: t('common.confirm'),
        }))
      )
        return;
      const nowISO = new Date().toISOString();
      const archived = AccountEngine.archiveAccount(
        state.accounts,
        state.commitments,
        state.recurring,
        accountId,
        nowISO
      );
      setState((prev) => ({ ...prev, ...archived }));
    } else {
      const nextState = {
        ...state,
        accounts: state.accounts.filter((a) => a.id !== accountId),
      };
      setState(nextState);
    }
    if (authUser && !authUser.isGuest) {
      getSyncManager()?.requestSync();
    }
    if (selectedAccountId === accountId) {
      setSelectedAccountId('ALL');
    }
  };

  // Handler: Add New Transaction (or save edits when editingTx is set)
  const handleSaveTransaction = (newTxData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingTx) {
      const updatedTx: Transaction = {
        ...editingTx,
        ...newTxData,
        id: editingTx.id,
        createdAt: editingTx.createdAt,
        updatedAt: new Date().toISOString(),
      };

      // Reverse the old effect and apply the new one atomically — no duplication.
      const updatedAccounts = TransactionEngine.updateTransactionInAccounts(
        editingTx,
        updatedTx,
        state.accounts
      );
      const updatedTransactions = state.transactions.map((t) => (t.id === editingTx.id ? updatedTx : t));

      const nextState = { ...state, accounts: updatedAccounts, transactions: updatedTransactions };
      setState(nextState);
      setEditingTx(null);

      if (authUser && !authUser.isGuest) {
        getSyncManager()?.requestSync();
      }
      return;
    }

    const newTx: Transaction = {
      ...newTxData,
      id: `tx-${Date.now()}`,
      currency,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedAccounts = TransactionEngine.applyTransactionToAccounts(newTx, state.accounts);
    const updatedTransactions = [newTx, ...state.transactions];

    const nextState = {
      ...state,
      accounts: updatedAccounts,
      transactions: updatedTransactions,
    };

    setState(nextState);

    if (authUser && !authUser.isGuest) {
      getSyncManager()?.requestSync();
    }
  };

  // Handler: Delete Transaction (confirmation happens in the detail modal)
  const handleDeleteTransaction = (txId: string) => {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return;

    const updatedAccounts = TransactionEngine.reverseTransactionFromAccounts(tx, state.accounts);
    const updatedTransactions = state.transactions.filter((t) => t.id !== txId);

    setState((prev) => ({
      ...prev,
      accounts: updatedAccounts,
      transactions: updatedTransactions,
    }));

    if (authUser && !authUser.isGuest) {
      getSyncManager()?.requestDelete(txId);
    }

    setSelectedTxForDetail(null);
  };

  // ---- Plans handlers: atomic state mutations for budgets / goals / commitments / recurring ----
  const mutatePlans = (next: Partial<FinovaState>) => {
    setState((prev) => ({ ...prev, ...next }));
  };

  // Unified entry point for the ADD sheet (FAB, Home CTA, first-run checklist).
  const openQuickAdd = (mode: EntryMode = 'EXPENSE') => {
    setEditingTx(null);
    setQuickAddMode(mode);
    setIsAddTxOpen(true);
  };

  const dismissChecklist = () => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, hasDismissedChecklist: true } }));
  };

  // Budget CRUD
  const handleAddBudget = (data: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>) => {
    mutatePlans({ budgets: [...state.budgets, { ...data, id: `bud-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] });
  };
  const handleUpdateBudget = (id: string, data: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>) => {
    mutatePlans({ budgets: state.budgets.map((b) => (b.id === id ? { ...b, ...data, updatedAt: new Date().toISOString() } : b)) });
  };
  const handleDeleteBudget = async (id: string) => {
    if (!(await confirmDialog({ title: t('dialog.deleteBudget'), message: t('dialog.deleteBudgetHint'), danger: true, confirmLabel: t('common.delete') }))) return;
    // Archive, not hard-delete: history stays explainable and the budget can be restored.
    mutatePlans({ budgets: state.budgets.map((b) => (b.id === id ? { ...b, isActive: false, updatedAt: new Date().toISOString() } : b)) });
  };
  const handleRestoreBudget = (id: string) => {
    mutatePlans({ budgets: state.budgets.map((b) => (b.id === id ? { ...b, isActive: true, updatedAt: new Date().toISOString() } : b)) });
  };

  // Goal CRUD + fund
  const handleAddGoal = (data: Omit<SavingsGoal, 'id' | 'createdAt' | 'updatedAt'>) => {
    mutatePlans({ goals: [...state.goals, { ...data, id: `goal-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] });
  };
  const handleUpdateGoal = (id: string, data: Omit<SavingsGoal, 'id' | 'createdAt' | 'updatedAt'>) => {
    mutatePlans({ goals: state.goals.map((g) => (g.id === id ? { ...g, ...data, updatedAt: new Date().toISOString() } : g)) });
  };
  const handleDeleteGoal = async (id: string) => {
    if (!(await confirmDialog({ title: t('dialog.deleteGoal'), message: t('dialog.deleteGoalHint'), danger: true, confirmLabel: t('common.delete') }))) return;
    mutatePlans({ goals: state.goals.map((g) => (g.id === id ? { ...g, isArchived: true, updatedAt: new Date().toISOString() } : g)) });
  };
  /**
   * Fund a goal — one coherent interpretation, never double-counted.
   * - Goal with a usable linked account (same currency): a true TRANSFER
   *   source → linked account. Both balances move; income/expense aggregates
   *   ignore it by invariant; goal progress increases.
   * - Goal without one: a reservation — the source balance drops and goal
   *   progress increases, recorded as a `goal-fund` EXPENSE row that every
   *   spend aggregate (period totals, budgets, category analytics) excludes.
   * Either way: account delta + goal delta == amount, spend delta == 0.
   */
  const handleFundGoal = (goalId: string, amount: number, fromAccountId: string) => {
    const goal = state.goals.find((g) => g.id === goalId);
    if (!goal) return;
    if (amount <= 0) { notice(t('tx.errors.amountPositive')); return; }
    // Clamp to the remaining need: without this, over-funding deducts the full
    // amount from the account while the goal clamps at target — money vanishes.
    const fundable = GoalEngine.fundableAmount(goal, amount);
    if (fundable <= 0) { notice(amount <= 0 ? t('tx.errors.amountPositive') : t('plans.fundCapHint')); return; }
    const source = state.accounts.find((a) => a.id === fromAccountId);
    if (!source) { notice(t('tx.errors.accountRequired')); return; }
    if (source.currency !== (goal.currency || currency)) { notice(t('dialog.currencyMismatch')); return; }
    if (source.currentBalance - fundable < 0) { notice(t('tx.errors.overdraw')); return; }
    const linked = state.accounts.find((a) => a.id === goal.accountId);
    const useTransfer = Boolean(
      linked && !linked.isArchived && linked.id !== source.id && linked.currency === source.currency
    );
    if (useTransfer && !linked) return;
    const fundTx: Transaction = useTransfer
      ? {
          id: `tx-${Date.now()}`,
          userId: 'user-1',
          type: 'TRANSFER',
          amount: fundable,
          currency: goal.currency || currency,
          categoryId: 'cat-transfer',
          accountId: fromAccountId,
          destinationAccountId: (linked as Account).id,
          merchant: `Fund: ${goal.name}`,
          note: `Moved to ${(linked as Account).name} for ${goal.name}`,
          date: todayISO,
          time: DateUtils.getCurrentTimeString(),
          tags: ['goal-fund'],
          status: 'CONFIRMED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : {
          id: `tx-${Date.now()}`,
          userId: 'user-1',
          type: 'EXPENSE',
          amount: fundable,
          currency: goal.currency || currency,
          categoryId: 'cat-transfer',
          accountId: fromAccountId,
          merchant: `Fund: ${goal.name}`,
          note: `Set aside for ${goal.name} — tracked as savings progress, not spending`,
          date: todayISO,
          time: DateUtils.getCurrentTimeString(),
          tags: ['goal-fund'],
          status: 'CONFIRMED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
    const updatedAccounts = TransactionEngine.applyTransactionToAccounts(fundTx, state.accounts);
    const updatedGoals = state.goals.map((g) => (g.id === goalId ? GoalEngine.contribute(g, fundable) : g));
    mutatePlans({ accounts: updatedAccounts, goals: updatedGoals, transactions: [fundTx, ...state.transactions] });
  };

  /**
   * Home-screen funding path: the Fund Goal modal asks only for an amount, so we resolve
   * the source account here — the goal's linked account when usable, otherwise the first
   * account whose currency matches and can cover the contribution.
   */
  const handleFundGoalFromHome = (goalId: string, amount: number) => {
    const goal = state.goals.find((g) => g.id === goalId);
    if (!goal) return;
    const goalCurrency = goal.currency || currency;
    const usable = (a: Account) => a.currency === goalCurrency && !a.isArchived && a.currentBalance >= amount;
    const linked = state.accounts.find((a) => a.id === goal.accountId);
    const source = (linked && usable(linked) ? linked : undefined) || state.accounts.find(usable);
    if (!source) {
      notice(t('dialog.fundNoSource', { currency: goalCurrency }));
      return;
    }
    handleFundGoal(goalId, amount, source.id);
  };

  // Commitment (Bill) CRUD + mark paid
  const handleAddCommitment = (data: Omit<MoneyCommitment, 'id' | 'createdAt' | 'updatedAt'>) => {
    mutatePlans({ commitments: [...state.commitments, { ...data, id: `comm-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] });
  };
  const handleUpdateCommitment = (id: string, data: Omit<MoneyCommitment, 'id' | 'createdAt' | 'updatedAt'>) => {
    mutatePlans({ commitments: state.commitments.map((c) => (c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c)) });
  };
  const handleDeleteCommitment = async (id: string) => {
    if (!(await confirmDialog({ title: t('dialog.deleteBill'), message: t('dialog.deleteBillHint'), danger: true, confirmLabel: t('common.delete') }))) return;
    mutatePlans({ commitments: state.commitments.filter((c) => c.id !== id) });
  };
  // Mark a bill paid: flips status and posts the real money movement.
  // Direction-aware: OUTFLOW posts an EXPENSE (overdraft-guarded), INFLOW
  // posts INCOME and credits the account (expected paydays must never post
  // as expenses). Either way exactly one transaction is created per call —
  // toggling back to PROJECTED never deletes the posted transaction, and
  // re-completing is blocked by the completed-status check below.
  const handleToggleCommitmentStatus = (commitmentId: string) => {
    const comm = state.commitments.find((c) => c.id === commitmentId);
    if (!comm) return;
    const willBePaid = comm.status !== 'COMPLETED';
    let nextCommitments = state.commitments.map((c) =>
      c.id === commitmentId ? { ...c, status: willBePaid ? ('COMPLETED' as const) : ('PROJECTED' as const), updatedAt: new Date().toISOString() } : c
    );
    let nextAccounts = state.accounts;
    let nextTransactions = state.transactions;
    if (willBePaid) {
      const isInflow = comm.direction === 'INFLOW';
      const source = state.accounts.find((a) => a.id === comm.accountId);
      const alreadyPosted = state.transactions.some((t) => t.sourceCommitmentId === commitmentId);
      const canSettle =
        source &&
        source.currency === comm.currency &&
        (isInflow || source.currentBalance - comm.amount >= 0);
      if (alreadyPosted) {
        // Idempotent re-complete: flip the status, never post a second transaction.
      } else if (canSettle && source) {
        const payTx: Transaction = {
          ...FutureFinanceEngine.buildSettlementTransaction(comm, todayISO, DateUtils.getCurrentTimeString()),
          id: `tx-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        nextAccounts = TransactionEngine.applyTransactionToAccounts(payTx, state.accounts);
        nextTransactions = [payTx, ...state.transactions];
      } else {
        // Mark paid without posting (insufficient funds or currency mismatch) — record only.
        nextCommitments = nextCommitments.map((c) =>
          c.id === commitmentId ? { ...c, notes: 'Marked paid (no balance change — insufficient funds or currency mismatch).' } : c
        );
      }
    }
    mutatePlans({ commitments: nextCommitments, accounts: nextAccounts, transactions: nextTransactions });
  };

  // Cancel a commitment — terminal state, never auto-recomputed or auto-posted.
  const handleCancelCommitment = async (id: string) => {
    if (!(await confirmDialog({ title: t('dialog.cancelCommitment'), message: t('dialog.cancelCommitmentHint'), danger: true, confirmLabel: t('common.confirm') }))) return;
    mutatePlans({
      commitments: state.commitments.map((c) =>
        c.id === id ? { ...c, status: 'CANCELLED', updatedAt: new Date().toISOString() } : c
      ),
    });
  };

  // Reschedule a commitment — moves the due date; recompute/auto-post handle the rest.
  const handleRescheduleCommitment = (id: string, newDueDate: string) => {
    mutatePlans({
      commitments: state.commitments.map((c) =>
        c.id === id ? { ...c, dueDate: newDueDate, updatedAt: new Date().toISOString() } : c
      ),
    });
  };

  // Mark a notification read (persists its id so re-derivation stays idempotent).
  const handleMarkNotificationRead = (id: string) => {
    setState((prev) => ({
      ...prev,
      readNotificationIds: prev.readNotificationIds.includes(id)
        ? prev.readNotificationIds
        : [...prev.readNotificationIds, id],
    }));
  };

  // Recurring Transaction CRUD
  const handleAddRecurring = (data: Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    mutatePlans({ recurring: [...state.recurring, { ...data, id: `rec-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] });
  };
  const handleUpdateRecurring = (id: string, data: Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    mutatePlans({ recurring: state.recurring.map((r) => (r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r)) });
  };
  const handleDeleteRecurring = async (id: string) => {
    if (!(await confirmDialog({ title: t('dialog.deleteRecurring'), message: t('dialog.deleteRecurringHint'), danger: true, confirmLabel: t('common.delete') }))) return;
    mutatePlans({ recurring: state.recurring.filter((r) => r.id !== id) });
  };

  // Pause / resume a rule. Resume rolls nextOccurrence forward so a paused
  // rule never dumps a backlog of overdue occurrences, and clears a past end
  // date so the rule can produce again.
  const handleToggleRecurringActive = (id: string) => {
    mutatePlans({
      recurring: state.recurring.map((r) => {
        if (r.id !== id) return r;
        if (r.isActive) return { ...r, isActive: false, updatedAt: new Date().toISOString() };
        const rolled = FutureFinanceEngine.rollForwardNextOccurrence(r, todayISO);
        return {
          ...r,
          isActive: true,
          nextOccurrence: rolled,
          endDate: r.endDate && r.endDate < todayISO ? undefined : r.endDate,
          updatedAt: new Date().toISOString(),
        };
      }),
    });
  };

  // Skip one occurrence: move to the next without creating anything.
  const handleSkipRecurring = (id: string) => {
    mutatePlans({
      recurring: state.recurring.map((r) =>
        r.id === id
          ? { ...r, nextOccurrence: FutureFinanceEngine.advanceOccurrence(r.nextOccurrence, r.frequency), updatedAt: new Date().toISOString() }
          : r
      ),
    });
  };

  // Reschedule a rule: move its next occurrence to a chosen date.
  const handleRescheduleRecurring = (id: string, newDate: string) => {
    mutatePlans({
      recurring: state.recurring.map((r) => (r.id === id ? { ...r, nextOccurrence: newDate, updatedAt: new Date().toISOString() } : r)),
    });
  };

  // Cancel a rule: terminal stop (kept for history, produces nothing more).
  // Distinct from pause (temporary) and delete (removes the rule entirely).
  const handleCancelRecurring = async (id: string) => {
    if (!(await confirmDialog({ title: t('dialog.cancelRecurring'), message: t('dialog.cancelRecurringHint'), danger: true, confirmLabel: t('common.confirm') }))) return;
    mutatePlans({
      recurring: state.recurring.map((r) =>
        r.id === id ? { ...r, isActive: false, endDate: todayISO, updatedAt: new Date().toISOString() } : r
      ),
    });
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
    const previousUser = authUser;
    await AuthService.signOut();
    // Wipe the previous user's data out of memory and re-scope storage so
    // the next login never sees it (device-local isolation). Cloud users'
    // local namespace is a cache — their data lives in Supabase under RLS
    // and re-pulls on next login. Guest data is never wiped.
    if (previousUser && !previousUser.isGuest) {
      FinovaStorage.wipeForUser(previousUser.id);
    }
    adoptAuthUser(null);
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
        readNotificationIds: [],
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
      <I18nProvider lang={settings.language || 'en'}>
      <DialogProvider>
      <div className="min-h-screen w-full bg-[#0A1811] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-[#D4F63D] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-emerald-300 tracking-wider uppercase">{t('common.loading')}</span>
        </div>
      </div>
      </DialogProvider>
      </I18nProvider>
    );
  }

  // If not logged in, render the AuthScreen (Google + Email Auth)
  if (!authUser) {
    return (
      <I18nProvider lang={settings.language || 'en'}>
        <DialogProvider>
          <AuthScreen onAuthenticated={(user) => adoptAuthUser(user)} />
        </DialogProvider>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider lang={settings.language || 'en'}>
    <DialogProvider>
    <AppLockGuard>
    <div className="min-h-screen bg-(--bg) text-(--ink) font-sans flex flex-col items-center justify-start w-full">
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
          syncStatus={syncStatus}
          canInstall={canInstall && !isStandalone()}
          onInstall={() => { void promptInstall(); }}
          updateReady={updateReady}
          onApplyUpdate={applyServiceWorkerUpdate}
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
              notifications={notifications}
              insights={insights}
              settings={settings}
              safeToSpend={safeToSpend}
              onNavigateToTab={(tab) => setCurrentTab(tab as NavTab)}
              onOpenPlansSection={(section) => {
                setPlansInitialSection(section);
                setPlansSectionNonce((n) => n + 1);
                setCurrentTab('PLANS');
              }}
              onOpenSafeToSpendExplainer={() => setIsSafeToSpendOpen(true)}
              onOpenQuickAdd={() => openQuickAdd('EXPENSE')}
              onSelectTransaction={(tx) => setSelectedTxForDetail(tx)}
              onMarkNotificationRead={handleMarkNotificationRead}
              onFundGoal={handleFundGoalFromHome}
              onAddIncome={() => openQuickAdd('INCOME')}
              onAddBudget={() => { setEditingBudget(null); setIsAddBudgetOpen(true); }}
              onAddEmergencyFund={() => { setEditingGoal(null); setGoalPreset({ name: 'Emergency Fund' }); setIsAddGoalOpen(true); }}
              onDismissChecklist={dismissChecklist}
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
              commitments={resolvedCommitments}
              settings={settings}
              onOpenWhatIf={() => setIsWhatIfOpen(true)}
            />
          )}

          {currentTab === 'PLANS' && (
            <PlansScreen
              accounts={activeAccounts}
              transactions={transactions}
              categories={categories}
              budgets={budgets}
              goals={goals}
              commitments={resolvedCommitments}
              recurring={state.recurring}
              settings={settings}
              onOpenAddGoal={() => { setEditingGoal(null); setGoalPreset(null); setIsAddGoalOpen(true); }}
              onOpenAddEmergencyFund={() => { setEditingGoal(null); setGoalPreset({ name: 'Emergency Fund' }); setIsAddGoalOpen(true); }}
              onOpenAddCommitment={() => { setEditingCommitment(null); setCommitmentPreset(null); setIsAddCommitmentOpen(true); }}
              onOpenAddPayday={() => { setEditingCommitment(null); setCommitmentPreset({ type: 'EXPECTED_INCOME', title: 'Payday' }); setIsAddCommitmentOpen(true); }}
              onOpenAddBudget={() => { setEditingBudget(null); setIsAddBudgetOpen(true); }}
              onOpenAddRecurring={() => { setEditingRecurring(null); setIsAddRecurringOpen(true); }}
              onEditBudget={(b) => { setEditingBudget(b); setIsAddBudgetOpen(true); }}
              onEditGoal={(g) => { setEditingGoal(g); setIsAddGoalOpen(true); }}
              onEditCommitment={(c) => { setEditingCommitment(c); setIsAddCommitmentOpen(true); }}
              onEditRecurring={(r) => { setEditingRecurring(r); setIsAddRecurringOpen(true); }}
              onDeleteBudget={handleDeleteBudget}
              onRestoreBudget={handleRestoreBudget}
              onDeleteGoal={handleDeleteGoal}
              onDeleteCommitment={handleDeleteCommitment}
              onDeleteRecurring={handleDeleteRecurring}
              onToggleRecurringActive={handleToggleRecurringActive}
              onSkipRecurring={handleSkipRecurring}
              onRescheduleRecurring={handleRescheduleRecurring}
              onCancelRecurring={handleCancelRecurring}
              onToggleCommitmentStatus={handleToggleCommitmentStatus}
              onCancelCommitment={handleCancelCommitment}
              onRescheduleCommitment={handleRescheduleCommitment}
              onFundGoal={handleFundGoal}
              onNavigateToTab={(t) => setCurrentTab(t as NavTab)}
              initialSection={plansInitialSection}
              sectionNonce={plansSectionNonce}
            />
          )}

          {currentTab === 'SETTINGS' && (
            <SettingsScreen
              settings={settings}
              onUpdateSettings={(newSettings) => setState((prev) => ({ ...prev, settings: newSettings }))}
              notifPrefs={notifPrefs}
              onUpdateNotifPrefs={(p) => {
                setNotifPrefs(p);
                NotificationPrefsService.savePrefs(p);
              }}
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
        onOpenQuickAdd={() => openQuickAdd('EXPENSE')}
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

      {/* 2. Fast Add / Edit Transaction */}
      <AddTransactionModal
        isOpen={isAddTxOpen}
        onClose={() => { setIsAddTxOpen(false); setEditingTx(null); setQuickAddMode('EXPENSE'); }}
        onSave={handleSaveTransaction}
        onSaveCommitment={handleAddCommitment}
        onSaveRecurring={handleAddRecurring}
        accounts={accounts}
        categories={categories}
        currency={currency}
        editingTx={editingTx}
        initialMode={quickAddMode}
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

      {/* 5. Plans — Create/Edit modals (contextual, no new top-level nav) */}
      <AddBudgetModal
        isOpen={isAddBudgetOpen}
        onClose={() => { setIsAddBudgetOpen(false); setEditingBudget(null); }}
        onSave={(data) => {
          if (editingBudget) handleUpdateBudget(editingBudget.id, data);
          else handleAddBudget(data);
          setIsAddBudgetOpen(false); setEditingBudget(null);
        }}
        categories={categories}
        currency={currency}
        editingBudget={editingBudget}
      />
      <AddGoalModal
        isOpen={isAddGoalOpen}
        onClose={() => { setIsAddGoalOpen(false); setEditingGoal(null); setGoalPreset(null); }}
        onSave={(data) => {
          if (editingGoal) handleUpdateGoal(editingGoal.id, data);
          else handleAddGoal(data);
          setIsAddGoalOpen(false); setEditingGoal(null); setGoalPreset(null);
        }}
        currency={currency}
        accounts={accounts}
        editingGoal={editingGoal}
        preset={goalPreset}
      />
      <AddCommitmentModal
        isOpen={isAddCommitmentOpen}
        onClose={() => { setIsAddCommitmentOpen(false); setEditingCommitment(null); setCommitmentPreset(null); }}
        onSave={(data) => {
          if (editingCommitment) handleUpdateCommitment(editingCommitment.id, data);
          else handleAddCommitment(data);
          setIsAddCommitmentOpen(false); setEditingCommitment(null); setCommitmentPreset(null);
        }}
        accounts={accounts}
        categories={categories}
        currency={currency}
        editingCommitment={editingCommitment}
        preset={commitmentPreset}
      />
      <AddRecurringModal
        isOpen={isAddRecurringOpen}
        onClose={() => { setIsAddRecurringOpen(false); setEditingRecurring(null); }}
        onSave={(data) => {
          if (editingRecurring) handleUpdateRecurring(editingRecurring.id, data);
          else handleAddRecurring(data);
          setIsAddRecurringOpen(false); setEditingRecurring(null);
        }}
        accounts={accounts}
        categories={categories}
        currency={currency}
        editingRecurring={editingRecurring}
      />

      {/* 5. Transaction Detail Modal */}
      <TransactionDetailModal
        isOpen={selectedTxForDetail !== null}
        onClose={() => setSelectedTxForDetail(null)}
        transaction={selectedTxForDetail}
        accounts={accounts}
        categories={categories}
        onEdit={(tx) => {
          setEditingTx(tx);
          setIsAddTxOpen(true);
        }}
        onDelete={handleDeleteTransaction}
      />
    </div>
    </AppLockGuard>
    </DialogProvider>
    </I18nProvider>
  );
}

export default App;
