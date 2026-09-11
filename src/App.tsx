import { useState, useEffect, useRef, useMemo } from 'react';
import { I18nProvider } from './i18n';
import { t } from './i18n/core';
import { DialogProvider, confirmDialog, notice } from './components/ui/dialog';
import { AppLockGuard } from './components/security/AppLockGuard';
import {
  Account,
  Budget,
  Category,
  CommitmentType,
  CurrencyCode,
  MoneyCommitment,
  RecurringTransaction,
  SavingsGoal,
  Transaction,
  UserSettings,
  PlansSection,
} from './types';
import { FinovaState, FinovaStorage, INITIAL_CATEGORIES } from './services/storage/FinovaStorage';
import { AccountEngine } from './domain/account/AccountEngine';
import { SafeToSpendEngine } from './domain/safe-to-spend/SafeToSpendEngine';
import { RiskEngine } from './domain/risk/RiskEngine';
import { TimelineEngine } from './domain/timeline/TimelineEngine';
import { TransactionEngine } from './domain/transaction/TransactionEngine';
import { CategoryEngine } from './domain/category/CategoryEngine';
import type { EntryMode } from './domain/entry/UnifiedEntry';
import { GoalEngine } from './domain/goal/GoalEngine';
import { FutureFinanceEngine } from './domain/future-finance/FutureFinanceEngine';
import { NotificationEngine } from './domain/notification/NotificationEngine';
import { InsightEngine } from './domain/insight/InsightEngine';
import { NotificationPrefsService } from './services/notification/NotificationPrefsService';
import { showOsNotification } from './services/notification/browserNotify';
import type { NotificationPreferences, NotificationMeta } from './types';
import { DateUtils } from './domain/date/DateUtils';
import { MoneyValue } from './domain/money/MoneyValue';

/**
 * Collision-proof entity ids. `Date.now()` ids collide when two entities are
 * created in the same millisecond (batch materialization, rapid taps); a
 * random suffix makes every id unique even within one tick.
 */
function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto.randomUUID as () => string)().slice(0, 8)
      : `${Date.now().toString(36)}${Math.floor(Math.random() * 1e8).toString(36)}`;
  return `${prefix}-${rand}`;
}

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
import { QuickActionsSheet, type QuickAction } from './components/QuickActionsSheet';
import { ReceiptText, ArrowDownLeft, ArrowLeftRight, CalendarClock, Wallet, Target, Repeat } from 'lucide-react';
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
  const [goalPreset, setGoalPreset] = useState<{ name: string; targetAmount?: number } | null>(null);
  const [editingCommitment, setEditingCommitment] = useState<MoneyCommitment | null>(null);
  const [commitmentPreset, setCommitmentPreset] = useState<{ type: CommitmentType; title?: string } | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringTransaction | null>(null);
  const [selectedTxForDetail, setSelectedTxForDetail] = useState<Transaction | null>(null);

  // Quick Actions sheet — one tap on the floating + reveals every "create" path,
  // so a new user never has to hunt through tabs to discover what they can add.
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);

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
    // Narrow deps are intentional: recreating on every profile-field change
    // would churn the queue for no benefit.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
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
              categories: cloudState.categories && cloudState.categories.length > 0
                ? cloudState.categories
                : (prev.categories.length > 0 ? prev.categories : INITIAL_CATEGORIES),
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
    // Narrow deps are intentional: the cloud load must fire on identity
    // change, not on every profile-object re-creation.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id, authUser?.fullName, authUser?.email, authUser?.isGuest]);

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
  const activeAccounts = useMemo(
    () => (selectedAccountId === 'ALL' ? accounts : accounts.filter((a) => a.id === selectedAccountId)),
    [accounts, selectedAccountId]
  );

  // Authoritative Domain Calculations (memoized: pure + expensive — without
  // this every tab switch re-ran the full engine chain over all rows).
  // The recurring->commitment bridge, overdue recompute, and auto-post all flow through
  // FutureFinanceEngine so every downstream screen consumes ONE resolved commitment list.
  const resolvedCommitments = useMemo(
    () =>
      FutureFinanceEngine.resolveCommitments(
        state.recurring,
        state.commitments,
        state.transactions,
        todayISO,
        DateUtils.addDaysISO(todayISO, 30),
        todayISO
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.recurring, state.commitments, state.transactions, todayISO]
  );

  const safeToSpend = useMemo(
    () => SafeToSpendEngine.calculateSafeToSpend(activeAccounts, resolvedCommitments, goals, settings, todayISO),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeAccounts, resolvedCommitments, goals, settings, todayISO]
  );

  /**
   * Auto-post lifecycle: once per session, settle due commitments that opted in.
   * Everything is computed INSIDE the functional updater from `prev` (never
   * from the render-scope closure): a second invocation — StrictMode remount,
   * Fast Refresh, effect re-fire — sees the first run's AUTO_POSTED statuses
   * and posted transactions, posts nothing, and returns `prev` unchanged.
   * Computing outside the updater double-advanced recurring rules (Sep 15 →
   * Nov 15), permanently skipping October's occurrence with no record.
   */
  const autoPostRanRef = useRef(false);
  useEffect(() => {
    if (autoPostRanRef.current) return;
    autoPostRanRef.current = true;

    setState((prev) => {
      const resolved = FutureFinanceEngine.resolveCommitments(
        prev.recurring,
        prev.commitments,
        prev.transactions,
        todayISO,
        DateUtils.addDaysISO(todayISO, 30),
        todayISO
      );
      const due = resolved.filter(
        (c) =>
          c.autoPostEnabled &&
          c.dueDate <= todayISO &&
          c.status !== 'COMPLETED' &&
          c.status !== 'CANCELLED' &&
          c.status !== 'AUTO_POSTED'
      );
      if (due.length === 0) return prev;

      const result = FutureFinanceEngine.autoPostDueCommitments(
        due,
        prev.accounts,
        prev.transactions,
        todayISO
      );
      if (result.postedCount === 0) return prev;

      const postedIds = new Set(result.commitments.filter((c) => c.status === 'AUTO_POSTED').map((c) => c.id));
      // Per-rule floors: a rule's floor moves past the latest occurrence it
      // actually posted — but never past a still-unpaid due occurrence (an
      // overdraft-skipped bill must stay visible as overdue, not vanish).
      const postedDueByRule = new Map<string, string>();
      for (const c of result.commitments) {
        if (c.status === 'AUTO_POSTED' && c.relatedRecurringTransactionId) {
          const prevDue = postedDueByRule.get(c.relatedRecurringTransactionId);
          if (!prevDue || c.dueDate > prevDue) postedDueByRule.set(c.relatedRecurringTransactionId, c.dueDate);
        }
      }
      const unpaidDueByRule = new Map<string, string>();
      for (const c of due) {
        if (postedIds.has(c.id) || !c.relatedRecurringTransactionId) continue;
        const prevDue = unpaidDueByRule.get(c.relatedRecurringTransactionId);
        if (!prevDue || c.dueDate < prevDue) unpaidDueByRule.set(c.relatedRecurringTransactionId, c.dueDate);
      }

      return {
        ...prev,
        accounts: result.accounts,
        transactions: result.transactions,
        // Persist settled status for manual commitments (generated ones re-derive
        // from the posted transactions, which are already in result.transactions).
        commitments: prev.commitments.map((c) =>
          postedIds.has(c.id) ? { ...c, status: 'AUTO_POSTED' as const, updatedAt: new Date().toISOString() } : c
        ),
        // Roll recurring rules forward so posted occurrences are not regenerated.
        recurring: prev.recurring.map((r) => {
          const postedDue = postedDueByRule.get(r.id);
          if (!postedDue) return r;
          // On-grid floors: the next anchored occurrence after the latest
          // posted date (or the earliest still-unpaid due date, itself
          // on-grid) — floors never drift off the month-end grid.
          const floor =
            unpaidDueByRule.get(r.id) ??
            FutureFinanceEngine.nextAnchoredAfter(r.startDate, r.frequency, postedDue);
          // Never move a floor backwards (a reschedule may sit ahead of it).
          const nextOccurrence = r.nextOccurrence && r.nextOccurrence > floor ? r.nextOccurrence : floor;
          return { ...r, nextOccurrence, updatedAt: new Date().toISOString() };
        }),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayISO]);

  // Single timeline source for Risks, Notifications, and the Plans display.
  // The range reaches 31 days back so overdue obligations deduct from the
  // projection's starting point (past days display; math starts today).
  const timeline = useMemo(
    () =>
      TimelineEngine.generateTimeline(
        activeAccounts,
        transactions,
        resolvedCommitments,
        categories,
        DateUtils.addDaysISO(todayISO, -31),
        DateUtils.addDaysISO(todayISO, 30),
        todayISO,
        currency
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeAccounts, transactions, resolvedCommitments, categories, todayISO, currency]
  );

  const risks = useMemo(
    () =>
      RiskEngine.detectCashFlowRisks(activeAccounts, timeline, resolvedCommitments, goals, settings, todayISO),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeAccounts, timeline, resolvedCommitments, goals, settings, todayISO]
  );

  const notifications = useMemo(
    () =>
      NotificationEngine.generateNotifications({
        commitments: resolvedCommitments,
        risks,
        // True auto-posts only (manual settlements are tagged bill-paid, not
        // auto-posted), posted within the last 3 days — every historical
        // settlement used to notify forever, crowding the feed.
        autoPostedTransactions: transactions.filter(
          (t) =>
            t.sourceCommitmentId &&
            t.tags?.includes('auto-posted') &&
            (t.createdAt || '').slice(0, 10) >= DateUtils.addDaysISO(todayISO, -3)
        ),
        transactions,
        budgets,
        goals,
        recurring: state.recurring,
        readIds: state.readNotificationIds,
        prefs: notifPrefs,
        referenceDateISO: todayISO,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedCommitments, risks, transactions, budgets, goals, state.recurring, state.readNotificationIds, notifPrefs, todayISO]
  );

  // Product Brain: one shared insight list (Home calm-state line + Analytics).
  const insights = useMemo(
    () =>
      InsightEngine.generateInsights(
        activeAccounts,
        transactions,
        budgets,
        goals,
        resolvedCommitments,
        categories,
        settings,
        todayISO
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeAccounts, transactions, budgets, goals, resolvedCommitments, categories, settings, todayISO]
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
    if (newCurrency === state.settings.currency) return;
    if (!FinovaStorage.canChangeGlobalCurrency(state)) {
      notice(t('settings.currencyLocked'));
      return;
    }
    setState(FinovaStorage.setGlobalCurrency(state, newCurrency));
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

  // Handler: Edit Account (+ optional reconciliation). Identity fields update
  // in place; a changed "actual" balance never overwrites silently — it posts
  // an auditable adjustment transaction so every money law still holds.
  const handleUpdateAccount = (
    accountId: string,
    data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>,
    reconcileToMinor?: number
  ) => {
    const acc = state.accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const nowISO = new Date().toISOString();
    let accounts = state.accounts.map((a) =>
      a.id === accountId ? { ...a, ...data, id: a.id, createdAt: a.createdAt, updatedAt: nowISO } : a
    );
    let transactions = state.transactions;
    if (reconcileToMinor !== undefined) {
      const delta = reconcileToMinor - acc.currentBalance;
      if (delta !== 0) {
        const adjTx: Transaction = {
          id: `tx-${Date.now()}`,
          userId: 'user-1',
          type: delta > 0 ? 'INCOME' : 'EXPENSE',
          amount: Math.abs(delta),
          currency: acc.currency,
          categoryId: 'cat-transfer',
          accountId,
          merchant: t('tx.adjustment'),
          note: t('tx.adjustmentNote'),
          date: todayISO,
          time: DateUtils.getCurrentTimeString(),
          tags: ['adjustment'],
          status: 'CONFIRMED',
          createdAt: nowISO,
          updatedAt: nowISO,
        };
        accounts = TransactionEngine.applyTransactionToAccounts(adjTx, accounts);
        transactions = [adjTx, ...transactions];
      }
    }
    setState((prev) => ({ ...prev, accounts, transactions }));
    if (authUser && !authUser.isGuest) {
      getSyncManager()?.requestSync();
    }
  };

  // ---- Custom categories: archive-only lifecycle (history always resolves) ----
  const handleAddCategory = (data: Omit<Category, 'id' | 'userId'>) => {
    mutatePlans({
      categories: [
        ...state.categories,
        { ...data, id: CategoryEngine.createId(), userId: 'user-1' },
      ],
    });
  };
  const handleUpdateCategory = (id: string, data: Omit<Category, 'id' | 'userId'>) => {
    const existing = state.categories.find((c) => c.id === id);
    if (!existing || !CategoryEngine.isEditable(existing)) {
      notice(t('categories.systemLocked'));
      return;
    }
    mutatePlans({
      categories: state.categories.map((c) =>
        c.id === id ? { ...c, ...data, id: c.id, userId: c.userId, isSystem: false } : c
      ),
    });
  };
  const handleToggleCategoryArchive = (id: string) => {
    const existing = state.categories.find((c) => c.id === id);
    if (!existing || !CategoryEngine.isArchivable(existing)) {
      notice(t('categories.systemLocked'));
      return;
    }
    mutatePlans({
      categories: state.categories.map((c) =>
        c.id === id ? { ...c, isArchived: !c.isArchived } : c
      ),
    });
  };

  // Handler: CSV import — batch-applies pre-validated transactions.
  // No overdraft blocking here: this reconstructs history (like a restore),
  // it isn't new spending, so rows apply even when the current balance has
  // moved on since the row's date.
  const handleImportTransactions = (txs: Transaction[]) => {
    if (txs.length === 0) {
      notice(t('import.nothingNew'));
      return;
    }
    let accounts = state.accounts;
    for (const tx of txs) {
      accounts = TransactionEngine.applyTransactionToAccounts(tx, accounts);
    }
    setState((prev) => ({ ...prev, accounts, transactions: [...txs, ...prev.transactions] }));
    if (authUser && !authUser.isGuest) {
      getSyncManager()?.requestSync();
    }
    notice(t('import.done', { count: txs.length }));
  };

  // Handler: Restore a downloaded backup (replace-all with ownership kept).
  const handleRestoreBackup = (restored: FinovaState) => {
    tombstoneAllCloudRows();
    const next: FinovaState = {
      ...restored,
      settings: {
        ...restored.settings,
        userId: authUser?.id || restored.settings.userId,
      },
    };
    FinovaStorage.saveState(next);
    setState(next);
    if (authUser && !authUser.isGuest) {
      getSyncManager()?.requestSync();
    }
    notice(t('backup.restored'));
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
      // Hard delete: the cloud row must go too, or it resurrects on restore.
      if (authUser && !authUser.isGuest) {
        getSyncManager()?.requestDeleteEntity('accounts', accountId);
      }
    }
    if (authUser && !authUser.isGuest) {
      getSyncManager()?.requestSync();
    }
    if (selectedAccountId === accountId) {
      setSelectedAccountId('ALL');
    }
  };

  // Handler: Restore an archived account (history was never deleted).
  const handleRestoreAccount = (accountId: string) => {
    const nowISO = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      accounts: AccountEngine.unarchiveAccount(prev.accounts, accountId, nowISO),
    }));
    if (authUser && !authUser.isGuest) {
      getSyncManager()?.requestSync();
    }
  };

  // Handler: Add New Transaction (or save edits when editingTx is set)
  const handleSaveTransaction = (newTxData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingTx) {
      // Linked rows are edited through their owner, never here: changing a
      // bill payment's amount would desync it from the bill, and touching a
      // goal row would desync goal progress.
      if (editingTx.sourceCommitmentId) {
        notice(t('dialog.settleTxLocked'));
        return;
      }
      if (TransactionEngine.isGoalFunding(editingTx) || TransactionEngine.isGoalWithdrawal(editingTx)) {
        notice(t('dialog.goalTxLocked'));
        return;
      }
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

  // Handler: Delete Transaction (confirmation happens in the detail modal).
  // - Goal-funding/withdrawal rows are locked: deleting one would desync goal
  //   progress (the goal keeps money the account got back). Fund/withdraw instead.
  // - Bill-payment rows reopen their bill: deleting a payment means unpaid
  //   again (manual bills flip back to PROJECTED; generated occurrences are
  //   rescued as manual bills, since the rule's floor already moved past them).
  const handleDeleteTransaction = (txId: string) => {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return;
    if (TransactionEngine.isGoalFunding(tx) || TransactionEngine.isGoalWithdrawal(tx)) {
      notice(t('dialog.goalTxLocked'));
      return;
    }
    setState((prev) => {
      const target = prev.transactions.find((t) => t.id === txId);
      if (!target) return prev;
      const updatedAccounts = TransactionEngine.reverseTransactionFromAccounts(target, prev.accounts);
      const updatedTransactions = prev.transactions.filter((t) => t.id !== txId);
      const nextCommitments = FutureFinanceEngine.reopenBillForDeletedPayment(prev.commitments, target, newId);
      return { ...prev, accounts: updatedAccounts, transactions: updatedTransactions, commitments: nextCommitments };
    });

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
    // Archiving a funded goal would strand its reservation (account stays
    // deducted, progress sits in an invisible goal). Withdraw first.
    const goal = state.goals.find((g) => g.id === id);
    if (goal && goal.currentAmount > 0) {
      notice(
        t('dialog.goalFundedHint', {
          amount: MoneyValue.fromMinorUnits(goal.currentAmount, goal.currency || currency).format(),
        })
      );
      return;
    }
    if (!(await confirmDialog({ title: t('dialog.deleteGoal'), message: t('dialog.deleteGoalHint'), danger: true, confirmLabel: t('common.delete') }))) return;
    mutatePlans({ goals: state.goals.map((g) => (g.id === id ? { ...g, isArchived: true, updatedAt: new Date().toISOString() } : g)) });
  };
  const handleRestoreGoal = (id: string) => {
    mutatePlans({ goals: state.goals.map((g) => (g.id === id ? { ...g, isArchived: false, updatedAt: new Date().toISOString() } : g)) });
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

  /**
   * Withdraw from a goal — the exact reverse of funding, never income.
   * - Goal with a usable linked account holding enough: a true TRANSFER
   *   linked → destination. Refused (not faked) when the linked account
   *   can't cover it — posting income instead would invent money.
   * - Otherwise: an INCOME row tagged `goal-withdraw` that every spend,
   *   income, and budget aggregate excludes. Goal progress drops by the
   *   same amount, so account delta + goal delta == 0, always.
   */
  const handleWithdrawGoal = (goalId: string, amount: number, toAccountId: string) => {
    const goal = state.goals.find((g) => g.id === goalId);
    if (!goal) return;
    if (amount <= 0) { notice(t('tx.errors.amountPositive')); return; }
    const withdrawable = Math.min(amount, goal.currentAmount);
    if (withdrawable <= 0) { notice(t('plans.withdrawEmpty')); return; }
    const goalCurrency = goal.currency || currency;
    const dest = state.accounts.find((a) => a.id === toAccountId);
    if (!dest) { notice(t('tx.errors.accountRequired')); return; }
    if (dest.currency !== goalCurrency) { notice(t('dialog.currencyMismatch')); return; }
    const linked = state.accounts.find((a) => a.id === goal.accountId);
    const useTransfer = Boolean(
      linked && !linked.isArchived && linked.id !== dest.id && linked.currency === dest.currency
    );
    if (useTransfer && linked && linked.currentBalance - withdrawable < 0) {
      notice(t('plans.withdrawLinkedShort'));
      return;
    }
    const nowISO = new Date().toISOString();
    const withdrawTx: Transaction = useTransfer && linked
      ? {
          id: newId('tx'),
          userId: 'user-1',
          type: 'TRANSFER',
          amount: withdrawable,
          currency: goalCurrency,
          categoryId: 'cat-transfer',
          accountId: linked.id,
          destinationAccountId: dest.id,
          merchant: `Withdraw: ${goal.name}`,
          note: `Returned from ${goal.name} to ${dest.name}`,
          date: todayISO,
          time: DateUtils.getCurrentTimeString(),
          tags: ['goal-withdraw'],
          status: 'CONFIRMED',
          createdAt: nowISO,
          updatedAt: nowISO,
        }
      : {
          id: newId('tx'),
          userId: 'user-1',
          type: 'INCOME',
          amount: withdrawable,
          currency: goalCurrency,
          categoryId: 'cat-transfer',
          accountId: dest.id,
          merchant: `Withdraw: ${goal.name}`,
          note: `Released from ${goal.name} — tracked as savings movement, not income`,
          date: todayISO,
          time: DateUtils.getCurrentTimeString(),
          tags: ['goal-withdraw'],
          status: 'CONFIRMED',
          createdAt: nowISO,
          updatedAt: nowISO,
        };
    const updatedAccounts = TransactionEngine.applyTransactionToAccounts(withdrawTx, state.accounts);
    const updatedGoals = state.goals.map((g) => (g.id === goalId ? GoalEngine.withdraw(g, withdrawable) : g));
    mutatePlans({ accounts: updatedAccounts, goals: updatedGoals, transactions: [withdrawTx, ...state.transactions] });
  };

  // Commitment (Bill) CRUD + mark paid
  const handleAddCommitment = (data: Omit<MoneyCommitment, 'id' | 'createdAt' | 'updatedAt'>) => {
    mutatePlans({ commitments: [...state.commitments, { ...data, id: `comm-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] });
  };
  const handleUpdateCommitment = (id: string, data: Omit<MoneyCommitment, 'id' | 'createdAt' | 'updatedAt'>) => {
    mutatePlans({ commitments: state.commitments.map((c) => (c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c)) });
  };
  const handleDeleteCommitment = async (id: string) => {
    // Generated occurrences have no row to delete (the Bills list hides Delete
    // for them); this guard keeps the handler truthful if ever reached.
    if (!state.commitments.some((c) => c.id === id)) {
      notice(t('dialog.generatedDeleteHint'));
      return;
    }
    if (!(await confirmDialog({ title: t('dialog.deleteBill'), message: t('dialog.deleteBillHint'), danger: true, confirmLabel: t('common.delete') }))) return;
    mutatePlans({ commitments: state.commitments.filter((c) => c.id !== id) });
    // Hard delete: the cloud row must go too, or it resurrects on restore.
    if (authUser && !authUser.isGuest) {
      getSyncManager()?.requestDeleteEntity('money_commitments', id);
    }
  };
  // Mark a bill paid: flips status and posts the real money movement.
  // Direction-aware: OUTFLOW posts an EXPENSE (overdraft-guarded), INFLOW
  // posts INCOME and credits the account (expected paydays must never post
  // as expenses). Either way exactly one transaction is created per call —
  // toggling back to PROJECTED never deletes the posted transaction, and
  // re-completing is blocked by the already-posted check (inside a functional
  // update, so a double-tap can never double-post).
  const handleToggleCommitmentStatus = (commitmentId: string) => {
    // Generated (recurring-derived) occurrences live outside state.commitments.
    if (!state.commitments.some((c) => c.id === commitmentId)) {
      settleGeneratedOccurrence(commitmentId);
      return;
    }
    setState((prev) => {
      const comm = prev.commitments.find((c) => c.id === commitmentId);
      if (!comm) return prev;
      // AUTO_POSTED counts as paid: tapping it acknowledges (→ COMPLETED),
      // never reopens — the money already moved.
      const willBePaid = comm.status !== 'COMPLETED';
      const nowISO = new Date().toISOString();
      let nextCommitments = prev.commitments.map((c) =>
        c.id === commitmentId ? { ...c, status: willBePaid ? ('COMPLETED' as const) : ('PROJECTED' as const), updatedAt: nowISO } : c
      );
      let nextAccounts = prev.accounts;
      let nextTransactions = prev.transactions;
      if (willBePaid) {
        const isInflow = comm.direction === 'INFLOW';
        const source = prev.accounts.find((a) => a.id === comm.accountId);
        const alreadyPosted = prev.transactions.some((t) => t.sourceCommitmentId === commitmentId);
        const canSettle =
          source &&
          source.currency === comm.currency &&
          (isInflow || source.currentBalance - comm.amount >= 0);
        if (alreadyPosted) {
          // Idempotent re-complete: flip the status, never post a second transaction.
        } else if (canSettle && source) {
          const payTx: Transaction = {
            ...FutureFinanceEngine.buildSettlementTransaction(comm, todayISO, DateUtils.getCurrentTimeString()),
            id: newId('tx'),
            createdAt: nowISO,
            updatedAt: nowISO,
          };
          nextAccounts = TransactionEngine.applyTransactionToAccounts(payTx, prev.accounts);
          nextTransactions = [payTx, ...prev.transactions];
        } else {
          // Mark paid without posting (insufficient funds or currency mismatch) — record only.
          nextCommitments = nextCommitments.map((c) =>
            c.id === commitmentId ? { ...c, notes: 'Marked paid (no balance change — insufficient funds or currency mismatch).' } : c
          );
        }
      }
      return { ...prev, commitments: nextCommitments, accounts: nextAccounts, transactions: nextTransactions };
    });
  };

  /**
   * Settles a recurring-generated occurrence via the tested engine transition:
   * posts the payment (same settleability rules as manual bills) and advances
   * the rule's floor past the settled date, rescuing outstanding earlier
   * occurrences as manual bills first.
   */
  const settleGeneratedOccurrence = (commitmentId: string) => {
    setState((prev) => {
      const next = FutureFinanceEngine.settleGeneratedOccurrence(
        prev,
        commitmentId,
        todayISO,
        DateUtils.getCurrentTimeString(),
        newId
      );
      return next ? { ...prev, ...next } : prev;
    });
  };

  // Cancel a commitment — terminal state, never auto-recomputed or auto-posted.
  // Cancelling a generated occurrence skips the rule past it; outstanding
  // earlier occurrences are rescued as manual bills so no obligation is lost.
  const handleCancelCommitment = async (id: string) => {
    if (!(await confirmDialog({ title: t('dialog.cancelCommitment'), message: t('dialog.cancelCommitmentHint'), danger: true, confirmLabel: t('common.confirm') }))) return;
    if (!state.commitments.some((c) => c.id === id)) {
      setState((prev) => {
        const next = FutureFinanceEngine.cancelGeneratedOccurrence(prev, id, todayISO, newId);
        return next ? { ...prev, ...next } : prev;
      });
      return;
    }
    mutatePlans({
      commitments: state.commitments.map((c) =>
        c.id === id ? { ...c, status: 'CANCELLED', updatedAt: new Date().toISOString() } : c
      ),
    });
  };

  // Reschedule a commitment — moves the due date; recompute/auto-post handle the rest.
  // Rescheduling a generated occurrence moves the RULE's next occurrence; any
  // outstanding occurrences the jump would hide are rescued as manual bills.
  const handleRescheduleCommitment = (id: string, newDueDate: string) => {
    if (!state.commitments.some((c) => c.id === id)) {
      setState((prev) => {
        const next = FutureFinanceEngine.rescheduleGeneratedOccurrence(prev, id, newDueDate, todayISO, newId);
        return next ? { ...prev, ...next } : prev;
      });
      return;
    }
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
    // Hard delete: the cloud row must go too, or it resurrects on restore.
    if (authUser && !authUser.isGuest) {
      getSyncManager()?.requestDeleteEntity('recurring_transactions', id);
    }
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

  // Skip one occurrence: move past the first emitted occurrence without
  // creating anything. Anchored (not chained +1 step), so skipping from an
  // off-grid floor can never swallow a real occurrence.
  const handleSkipRecurring = (id: string) => {
    mutatePlans({
      recurring: state.recurring.map((r) =>
        r.id === id
          ? { ...r, nextOccurrence: FutureFinanceEngine.skipFloor(r), updatedAt: new Date().toISOString() }
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

  // Whole-state replacement (reset, demo load) must tombstone every cloud
  // row FIRST, or the next pull resurrects/merges stale rows over the new
  // state. Queued deletes flush in insertion order, ahead of the state-sync
  // the replacement itself triggers.
  const tombstoneAllCloudRows = () => {
    if (!authUser || authUser.isGuest) return;
    const mgr = getSyncManager();
    for (const tx of state.transactions) mgr?.requestDelete(tx.id);
    for (const c of state.commitments) mgr?.requestDeleteEntity('money_commitments', c.id);
    for (const r of state.recurring) mgr?.requestDeleteEntity('recurring_transactions', r.id);
    for (const b of state.budgets) mgr?.requestDeleteEntity('budgets', b.id);
    for (const g of state.goals) mgr?.requestDeleteEntity('savings_goals', g.id);
    for (const a of state.accounts) mgr?.requestDeleteEntity('accounts', a.id);
  };

  // Handler: Reset to Clean 0 Slate (For Real Life)
  const handleResetToCleanSlate = () => {
    tombstoneAllCloudRows();
    const clean = FinovaStorage.resetToCleanSlate(currency, authUser?.fullName || settings.userName);
    setState(clean);
  };

  // Handler: Load Demo Showcase Data
  const handleLoadDemoData = () => {
    tombstoneAllCloudRows();
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
      try {
        localStorage.removeItem(`PALDO_SYNC_QUEUE_${previousUser.id}`);
      } catch {
        /* storage quota / private mode fallback */
      }
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
          <div className="h-10 w-10 border-4 border-(--accent) border-t-transparent rounded-full animate-spin" />
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

  const quickActions: QuickAction[] = [
    { id: 'expense', label: t('quick.expense'), description: t('quick.expenseDesc'), icon: ReceiptText, tone: 'expense' },
    { id: 'income', label: t('quick.income'), description: t('quick.incomeDesc'), icon: ArrowDownLeft, tone: 'income' },
    { id: 'transfer', label: t('quick.transfer'), description: t('quick.transferDesc'), icon: ArrowLeftRight, tone: 'transfer' },
    { id: 'planBill', label: t('quick.planBill'), description: t('quick.planBillDesc'), icon: CalendarClock, tone: 'bill' },
    { id: 'budget', label: t('quick.budget'), description: t('quick.budgetDesc'), icon: Wallet, tone: 'budget' },
    { id: 'goal', label: t('quick.goal'), description: t('quick.goalDesc'), icon: Target, tone: 'goal' },
    { id: 'recurring', label: t('quick.recurring'), description: t('quick.recurringDesc'), icon: Repeat, tone: 'recurring' },
  ];

  const handleQuickAction = (id: string) => {
    setIsQuickActionsOpen(false);
    if (id === 'expense') openQuickAdd('EXPENSE');
    else if (id === 'income') openQuickAdd('INCOME');
    else if (id === 'transfer') openQuickAdd('TRANSFER');
    else if (id === 'planBill') openQuickAdd('PLANNED');
    else if (id === 'budget') setIsAddBudgetOpen(true);
    else if (id === 'goal') setIsAddGoalOpen(true);
    else if (id === 'recurring') setIsAddRecurringOpen(true);
  };

  return (
    <I18nProvider lang={settings.language || 'en'}>
    <DialogProvider>
    <AppLockGuard>
    <div className="min-h-screen bg-(--bg) text-(--ink) font-sans flex flex-col items-center justify-start w-full motion-enter">
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
              timeline={timeline}
              settings={settings}
              onOpenAddGoal={() => { setEditingGoal(null); setGoalPreset(null); setIsAddGoalOpen(true); }}
              onOpenAddEmergencyFund={(targetMinor?: number) => { setEditingGoal(null); setGoalPreset({ name: 'Emergency Fund', targetAmount: targetMinor }); setIsAddGoalOpen(true); }}
              onOpenAddCommitment={() => { setEditingCommitment(null); setCommitmentPreset(null); setIsAddCommitmentOpen(true); }}
              onOpenAddPayday={() => { setEditingCommitment(null); setCommitmentPreset({ type: 'EXPECTED_INCOME', title: 'Payday' }); setIsAddCommitmentOpen(true); }}
              onOpenAddBudget={() => { setEditingBudget(null); setIsAddBudgetOpen(true); }}
              onOpenAddRecurring={() => { setEditingRecurring(null); setIsAddRecurringOpen(true); }}
              onEditBudget={(b) => { setEditingBudget(b); setIsAddBudgetOpen(true); }}
              onEditGoal={(g) => { setEditingGoal(g); setIsAddGoalOpen(true); }}
              // Editing a generated occurrence edits its RULE (the occurrence itself
              // is derived) — a truthful deep-link instead of a void save.
              onEditCommitment={(c) => {
                if (c.relatedRecurringTransactionId) {
                  const rule = state.recurring.find((r) => r.id === c.relatedRecurringTransactionId);
                  if (rule) {
                    setEditingRecurring(rule);
                    setIsAddRecurringOpen(true);
                    return;
                  }
                }
                setEditingCommitment(c);
                setIsAddCommitmentOpen(true);
              }}
              onEditRecurring={(r) => { setEditingRecurring(r); setIsAddRecurringOpen(true); }}
              onDeleteBudget={handleDeleteBudget}
              onRestoreBudget={handleRestoreBudget}
              onDeleteGoal={handleDeleteGoal}
              onRestoreGoal={handleRestoreGoal}
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
              onWithdrawGoal={handleWithdrawGoal}
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
              currencyLocked={!FinovaStorage.canChangeGlobalCurrency(state)}
              accounts={accounts}
              onAddAccount={handleAddAccount}
              onUpdateAccount={handleUpdateAccount}
              onDeleteAccount={handleDeleteAccount}
              onRestoreAccount={handleRestoreAccount}
              onAddCategory={handleAddCategory}
              onUpdateCategory={handleUpdateCategory}
              onToggleCategoryArchive={handleToggleCategoryArchive}
              onRestoreBackup={handleRestoreBackup}
              onImportTransactions={handleImportTransactions}
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
        onOpenQuickActions={() => setIsQuickActionsOpen(true)}
      />

      {/* LIVE APP TOUR OVERLAY (ANIMATED SPOTLIGHT POINTER) */}
      <GuidedAppTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onNavigateTab={(tab) => setCurrentTab(tab)}
        currency={currency}
      />

      {/* FLOATING + → QUICK ACTIONS (discovers every "add" path) */}
      <QuickActionsSheet
        isOpen={isQuickActionsOpen}
        onClose={() => setIsQuickActionsOpen(false)}
        title={t('quick.title')}
        subtitle={t('quick.subtitle')}
        actions={quickActions}
        onSelect={handleQuickAction}
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
          // Same ownership rule as handleSaveTransaction, enforced at open so
          // the user never edits a linked row into a desync.
          if (tx.sourceCommitmentId) {
            notice(t('dialog.settleTxLocked'));
            return;
          }
          if (TransactionEngine.isGoalFunding(tx) || TransactionEngine.isGoalWithdrawal(tx)) {
            notice(t('dialog.goalTxLocked'));
            return;
          }
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
