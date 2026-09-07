import { FinovaState, INITIAL_CATEGORIES } from '../storage/FinovaStorage';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { AuthUserProfile } from './authService';
import {
  Account,
  Budget,
  MoneyCommitment,
  RecurringTransaction,
  SavingsGoal,
  Transaction,
  UserSettings,
} from '../../types';

// Convert any string ID into a valid UUID string for Supabase PostgreSQL
export function toValidUuid(rawId: string): string {
  if (!rawId) return '00000000-0000-4000-8000-000000000001';
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(rawId)) {
    return rawId.toLowerCase();
  }

  // Hash the raw string into 32 hex chars deterministically
  let hash = 0;
  for (let i = 0; i < rawId.length; i++) {
    hash = ((hash << 5) - hash) + rawId.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const hexPart2 = (Math.abs(hash * 31)).toString(16).padStart(12, '0').slice(0, 12);
  const hexPart3 = (Math.abs(hash * 97)).toString(16).padStart(12, '0').slice(0, 12);

  return `${hex}-${hexPart2.slice(0, 4)}-4${hexPart2.slice(4, 7)}-8${hexPart2.slice(7, 10)}-${hexPart3}`;
}

/**
 * Category id bridge (security audit fix).
 *
 * Local category ids are slugs ('cat-food'); the cloud schema keys categories
 * by UUID with FK references from transactions/budgets/commitments/recurring.
 * Raw slugs sent to UUID columns fail every sync (`invalid input syntax for
 * type uuid`) while the UI keeps reporting success — silent backup loss.
 *
 * toValidUuid() is deterministic, so slugs map to STABLE cloud UUIDs on save,
 * and known system slugs map back on load via the reverse table below. Custom
 * categories keep their hashed ids on both sides (nothing hardcoded about
 * them), staying internally consistent. Split-part allocations are mapped too.
 */
const CLOUD_CATEGORY_SLUG_BY_UUID = new Map<string, string>(
  INITIAL_CATEGORIES.map((c) => [toValidUuid(c.id), c.id])
);

export function toCloudCategoryId(localId: string | undefined | null): string | null {
  if (!localId) return null;
  return toValidUuid(localId);
}

export function fromCloudCategoryId(cloudId: string | null | undefined, fallback: string): string {
  if (!cloudId) return fallback;
  return CLOUD_CATEGORY_SLUG_BY_UUID.get(cloudId) ?? cloudId;
}

export class CloudSyncService {
  /**
   * Load complete state from Supabase PostgreSQL for the authenticated user
   */
  public static async loadStateFromCloud(user: AuthUserProfile): Promise<FinovaState | null> {
    if (!isSupabaseConfigured || user.isGuest) {
      return null;
    }

    try {
      // All eight selects are independent — fire them as ONE wave instead of
      // eight sequential round trips (each costs a full RTT on mobile data).
      const [
        settingsRes,
        accountsRes,
        txRes,
        budgetRes,
        goalsRes,
        commitmentsRes,
        recurringRes,
        categoriesRes,
      ] = await Promise.all([
        supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('accounts').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }),
        supabase.from('budgets').select('*').eq('user_id', user.id),
        supabase.from('savings_goals').select('*').eq('user_id', user.id),
        supabase.from('money_commitments').select('*').eq('user_id', user.id),
        supabase.from('recurring_transactions').select('*').eq('user_id', user.id),
        supabase.from('categories').select('*').eq('user_id', user.id),
      ]);

      // 1. User Settings
      const settingsData = settingsRes.data;
      if (settingsRes.error) console.warn('Supabase settings load error:', settingsRes.error);

      // 2. Accounts (ALL of them — archived accounts stay out of totals
      // via isArchived, but their history must survive a cross-device restore)
      const accountsData = accountsRes.data;
      if (accountsRes.error) console.warn('Supabase accounts load error:', accountsRes.error);

      // 3. Transactions
      const txData = txRes.data;
      if (txRes.error) console.warn('Supabase tx load error:', txRes.error);

      // 4. Budgets (ALL — inactive/archived budgets are history, not garbage)
      const budgetData = budgetRes.data;

      // 5. Goals (ALL — archived goals keep their contribution history)
      const goalsData = goalsRes.data;

      // 6. Commitments
      const commitmentsData = commitmentsRes.data;

      // 7. Recurring Transactions
      const recurringData = recurringRes.data;

      // 8. Categories (own rows only — RLS also enforces this server-side)
      const categoriesData = categoriesRes.data;

      // If user has no existing cloud data yet, return null
      if (!settingsData && (!accountsData || accountsData.length === 0) && (!txData || txData.length === 0)) {
        return null;
      }

      const settings: UserSettings = {
        userId: user.id,
        userName: user.fullName || 'Juan Dela Cruz',
        currency: settingsData?.currency || 'PHP',
        defaultTrackingPeriod: settingsData?.default_tracking_period || 'TODAY',
        budgetCycleMode: settingsData?.budget_cycle_mode || 'SEMI_MONTHLY_15_DAYS',
        semiMonthlyCutoffDay: settingsData?.semi_monthly_cutoff_day || 15,
        minimumReserve: Number(settingsData?.minimum_reserve || 0),
        safeToSpendPeriod: settingsData?.safe_to_spend_period || 'END_OF_MONTH',
        darkTheme: settingsData?.dark_theme || false,
        notificationsEnabled: settingsData?.notifications_enabled ?? true,
        budgetWarningThreshold: settingsData?.budget_warning_threshold || 80,
        autoGenerateCommitmentsFromRecurring: settingsData?.auto_generate_commitments_from_recurring ?? true,
        hasCompletedOnboarding: settingsData?.has_completed_onboarding ?? true,
      };

      const accounts: Account[] = (accountsData || []).map((a) => ({
        id: a.id,
        userId: a.user_id,
        name: a.name,
        bankPresetId: a.bank_preset_id,
        accountNumberMask: a.account_number_mask,
        type: a.type,
        currency: a.currency || 'PHP',
        initialBalance: Number(a.initial_balance || 0),
        currentBalance: Number(a.current_balance || 0),
        icon: a.icon || 'Building2',
        color: a.color || '#1C205E',
        includeInTotalBalance: a.include_in_total_balance ?? true,
        isArchived: a.is_archived ?? false,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      }));

      const transactions: Transaction[] = (txData || []).map((t) => ({
        id: t.id,
        userId: t.user_id,
        accountId: t.account_id,
        categoryId: fromCloudCategoryId(t.category_id, 'cat-general'),
        destinationAccountId: t.to_account_id || undefined,
        type: t.type,
        amount: Number(t.amount),
        currency: t.currency || 'PHP',
        merchant: t.merchant,
        note: t.note,
        date: t.date,
        time: t.time || '12:00',
        tags: t.tags || [],
        status: t.status || 'CONFIRMED',
        splitParts: Array.isArray(t.split_parts) && t.split_parts.length > 0
          ? t.split_parts.map((p: { categoryId: string; amount: number }) => ({
              categoryId: fromCloudCategoryId(p.categoryId, 'cat-general'),
              amount: Number(p.amount),
            }))
          : undefined,
        receiptDataUrl: t.receipt_data_url || undefined,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }));

      const budgets: Budget[] = (budgetData || []).map((b) => ({
        id: b.id,
        userId: b.user_id,
        name: b.name,
        amount: Number(b.amount),
        currency: b.currency || 'PHP',
        period: b.period || 'MONTHLY',
        startDate: b.start_date || new Date().toISOString().substring(0, 10),
        endDate: b.end_date || new Date().toISOString().substring(0, 10),
        categoryIds: (b.category_ids || []).map((cid: string) => fromCloudCategoryId(cid, 'cat-general')),
        notifyThresholdPercentage: b.notify_threshold_percentage || 80,
        isActive: b.is_active ?? true,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      }));

      const goals: SavingsGoal[] = (goalsData || []).map((g) => ({
        id: g.id,
        userId: g.user_id,
        name: g.name,
        targetAmount: Number(g.target_amount),
        currentAmount: Number(g.current_amount || 0),
        currency: g.currency || 'PHP',
        targetDate: g.target_date,
        accountId: g.linked_account_id,
        priority: g.priority || 'ESSENTIAL',
        status: g.status || 'ON_TRACK',
        icon: g.icon || 'Target',
        color: g.color || '#059669',
        isArchived: g.is_archived ?? false,
        createdAt: g.created_at,
        updatedAt: g.updated_at,
      }));

      const commitments: MoneyCommitment[] = (commitmentsData || []).map((c) => ({
        id: c.id,
        userId: c.user_id,
        title: c.name || c.title || 'Upcoming Bill',
        type: c.type || 'BILL',
        amount: Number(c.amount),
        currency: c.currency || 'PHP',
        direction: c.direction || 'OUTFLOW',
        status: c.status || 'PROJECTED',
        dueDate: c.due_date,
        categoryId: fromCloudCategoryId(c.category_id, 'cat-bills'),
        accountId: c.account_id || accounts[0]?.id || 'acc-1',
        priority: c.priority || 'ESSENTIAL',
        isAutoGenerated: c.is_auto_generated ?? false,
        autoPostEnabled: c.auto_post_enabled ?? false,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }));

      const recurring: RecurringTransaction[] = (recurringData || []).map((r) => ({
        id: r.id,
        userId: r.user_id,
        title: r.title,
        amount: Number(r.amount),
        currency: r.currency || 'PHP',
        type: r.type || 'EXPENSE',
        categoryId: fromCloudCategoryId(r.category_id, 'cat-bills'),
        accountId: r.account_id || accounts[0]?.id || 'acc-1',
        frequency: r.frequency || 'MONTHLY',
        startDate: r.start_date,
        nextOccurrence: r.next_occurrence,
        endDate: r.end_date,
        isActive: r.is_active ?? true,
        reminderEnabled: r.reminder_enabled ?? true,
        autoPostEnabled: r.auto_post_enabled ?? r.reminder_enabled ?? true,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      // Categories: cloud rows win when present (mapped back to local slugs);
      // otherwise the local seeds. Known system slugs recover their canonical
      // seed entry (emoji, i18n names); custom rows keep stable cloud ids.
      const categories = (categoriesData && categoriesData.length > 0)
        ? categoriesData.map((c: any) => {
            const slug = CLOUD_CATEGORY_SLUG_BY_UUID.get(c.id);
            if (slug) {
              const seed = INITIAL_CATEGORIES.find((s) => s.id === slug);
              if (seed) return { ...seed };
            }
            return {
              id: c.id,
              userId: c.user_id,
              name: c.name,
              type: c.type || 'EXPENSE',
              icon: c.icon || 'ShoppingBag',
              color: c.color || '#059669',
              isSystem: false,
              isArchived: false,
            };
          })
        : INITIAL_CATEGORIES;

      return {
        accounts,
        transactions,
        categories,
        budgets,
        goals,
        commitments,
        recurring,
        readNotificationIds: [],
        settings,
      };
    } catch (err) {
      console.error('Failed to load state from Supabase:', err);
      return null;
    }
  }

  /**
   * Synchronize local Finova state to Supabase PostgreSQL for the current authenticated user
   */
  public static async syncStateToCloud(state: FinovaState, user: AuthUserProfile): Promise<boolean> {
    if (!isSupabaseConfigured || user.isGuest) {
      return false;
    }

    try {
      // Wave 1 — independent rows, fired in parallel (one RTT instead of six
      // sequential round trips). FK-holding tables go in wave 2.
      const profilePayload = {
        id: user.id,
        email: user.email,
        full_name: user.fullName || state.settings.userName,
        avatar_url: user.avatarUrl,
        updated_at: new Date().toISOString(),
      };
      const settingsPayload = {
        user_id: user.id,
        currency: state.settings.currency || 'PHP',
        default_tracking_period: state.settings.defaultTrackingPeriod || 'TODAY',
        budget_cycle_mode: state.settings.budgetCycleMode || 'SEMI_MONTHLY_15_DAYS',
        semi_monthly_cutoff_day: state.settings.semiMonthlyCutoffDay || 15,
        minimum_reserve: state.settings.minimumReserve || 0,
        safe_to_spend_period: state.settings.safeToSpendPeriod || 'END_OF_MONTH',
        dark_theme: state.settings.darkTheme || false,
        notifications_enabled: state.settings.notificationsEnabled ?? true,
        budget_warning_threshold: state.settings.budgetWarningThreshold || 80,
        has_completed_onboarding: state.settings.hasCompletedOnboarding ?? true,
        updated_at: new Date().toISOString(),
      };
      const categoryPayloads = (state.categories || []).map((c) => ({
        id: toValidUuid(c.id),
        user_id: user.id,
        name: c.name,
        icon: c.icon || 'ShoppingBag',
        color: c.color || '#059669',
        type: c.type || 'EXPENSE',
        is_system: false,
      }));
      // 4. Sync Accounts
      const accountPayloads: any[] = state.accounts.map((acc) => ({
        id: toValidUuid(acc.id),
        user_id: user.id,
        name: acc.name,
        bank_preset_id: acc.bankPresetId || 'grbi',
        account_number_mask: acc.accountNumberMask,
        type: acc.type || 'BANK',
        currency: acc.currency || state.settings.currency || 'PHP',
        initial_balance: acc.initialBalance,
        current_balance: acc.currentBalance,
        icon: acc.icon || 'Building2',
        color: acc.color || '#1C205E',
        include_in_total_balance: acc.includeInTotalBalance ?? true,
        is_archived: acc.isArchived ?? false,
        updated_at: new Date().toISOString(),
      }));
      const budgetPayloads = state.budgets.map((b) => ({
        id: toValidUuid(b.id),
        user_id: user.id,
        name: b.name,
        amount: Math.round(b.amount),
        currency: b.currency || state.settings.currency || 'PHP',
        category_ids: (b.categoryIds || []).map((cid) => toCloudCategoryId(cid) || cid),
        period: b.period || 'MONTHLY',
        start_date: b.startDate,
        end_date: b.endDate,
        notify_threshold_percentage: b.notifyThresholdPercentage || 80,
        rollover_unused: b.rolloverUnused ?? false,
        is_active: b.isActive ?? true,
        updated_at: new Date().toISOString(),
      }));
      const goalPayloads = state.goals.map((g) => ({
        id: toValidUuid(g.id),
        user_id: user.id,
        name: g.name,
        target_amount: Math.round(g.targetAmount),
        current_amount: Math.round(g.currentAmount || 0),
        currency: g.currency || state.settings.currency || 'PHP',
        target_date: g.targetDate,
        linked_account_id: g.accountId ? toValidUuid(g.accountId) : null,
        priority: g.priority || 'ESSENTIAL',
        status: g.status || 'ON_TRACK',
        icon: g.icon || 'Target',
        color: g.color || '#059669',
        is_archived: g.isArchived ?? false,
        updated_at: new Date().toISOString(),
      }));

      const [profRes, setRes, catRes, accRes, budRes, goalRes] = await Promise.all([
        supabase.from('profiles').upsert(profilePayload),
        supabase.from('user_settings').upsert(settingsPayload),
        categoryPayloads.length > 0
          ? supabase.from('categories').upsert(categoryPayloads)
          : Promise.resolve({ error: null }),
        accountPayloads.length > 0
          ? supabase.from('accounts').upsert(accountPayloads)
          : Promise.resolve({ error: null }),
        budgetPayloads.length > 0
          ? supabase.from('budgets').upsert(budgetPayloads)
          : Promise.resolve({ error: null }),
        goalPayloads.length > 0
          ? supabase.from('savings_goals').upsert(goalPayloads)
          : Promise.resolve({ error: null }),
      ]);
      if (profRes.error) console.warn('Supabase profiles upsert warning:', profRes.error);
      if (setRes.error) console.warn('Supabase settings upsert warning:', setRes.error);
      if (catRes.error) console.error('Supabase categories upsert error:', catRes.error);
      if (accRes.error) console.error('Supabase accounts upsert error:', accRes.error);
      if (budRes.error) console.error('Supabase budgets upsert error:', budRes.error);
      if (goalRes.error) console.error('Supabase goals upsert error:', goalRes.error);

      // Wave 2 — FK-holding rows, fired together after wave 1 lands.
      // (Payloads are built first; the three upserts then run in parallel.)
      const txPayloads =
        state.transactions.length > 0 && accountPayloads.length > 0
          ? (() => {
              const insertedAccountIds = new Set(accountPayloads.map((a) => a.id));
              const fallbackAccountId = accountPayloads[0].id;
              return state.transactions.map((tx) => {
                const targetAccId = toValidUuid(tx.accountId);
                const validAccId = insertedAccountIds.has(targetAccId) ? targetAccId : fallbackAccountId;
                const destTargetId = tx.destinationAccountId ? toValidUuid(tx.destinationAccountId) : null;
                return {
                  id: toValidUuid(tx.id),
                  user_id: user.id,
                  account_id: validAccId,
                  category_id: toCloudCategoryId(tx.categoryId),
                  to_account_id: destTargetId && insertedAccountIds.has(destTargetId) ? destTargetId : null,
                  type: tx.type || 'EXPENSE',
                  amount: Math.round(tx.amount),
                  currency: tx.currency || state.settings.currency || 'PHP',
                  merchant: tx.merchant || '',
                  note: tx.note || '',
                  date: tx.date || new Date().toISOString().substring(0, 10),
                  time: tx.time || '12:00',
                  tags: tx.tags || [],
                  status: tx.status || 'CONFIRMED',
                  split_parts:
                    tx.splitParts && tx.splitParts.length > 0
                      ? tx.splitParts.map((p) => ({ ...p, categoryId: toCloudCategoryId(p.categoryId) || p.categoryId }))
                      : null,
                  // Receipts stay local-only (data URLs would bloat the row); cloud syncs metadata.
                  receipt_data_url: null,
                  updated_at: new Date().toISOString(),
                };
              });
            })()
          : [];
      const commitmentPayloads = state.commitments.map((c) => ({
        id: toValidUuid(c.id),
        user_id: user.id,
        name: c.title,
        amount: Math.round(c.amount),
        currency: c.currency || state.settings.currency || 'PHP',
        due_date: c.dueDate,
        type: c.type || 'BILL',
        status: c.status || 'PROJECTED',
        priority: c.priority || 'ESSENTIAL',
        direction: c.direction || 'OUTFLOW',
        category_id: toCloudCategoryId(c.categoryId),
        account_id: c.accountId ? toValidUuid(c.accountId) : null,
        is_auto_generated: c.isAutoGenerated ?? false,
        auto_post_enabled: c.autoPostEnabled ?? false,
        updated_at: new Date().toISOString(),
      }));
      const recurringPayloads = state.recurring.map((r) => ({
        id: toValidUuid(r.id),
        user_id: user.id,
        title: r.title,
        amount: Math.round(r.amount),
        currency: r.currency || state.settings.currency || 'PHP',
        type: r.type || 'EXPENSE',
        category_id: toCloudCategoryId(r.categoryId),
        account_id: r.accountId ? toValidUuid(r.accountId) : null,
        frequency: r.frequency || 'MONTHLY',
        start_date: r.startDate,
        next_occurrence: r.nextOccurrence,
        end_date: r.endDate || null,
        is_active: r.isActive ?? true,
        reminder_enabled: r.reminderEnabled ?? true,
        auto_post_enabled: r.autoPostEnabled ?? r.reminderEnabled ?? true,
        updated_at: new Date().toISOString(),
      }));

      const [txRes, comRes, recRes] = await Promise.all([
        txPayloads.length > 0
          ? supabase.from('transactions').upsert(txPayloads)
          : Promise.resolve({ error: null }),
        commitmentPayloads.length > 0
          ? supabase.from('money_commitments').upsert(commitmentPayloads)
          : Promise.resolve({ error: null }),
        recurringPayloads.length > 0
          ? supabase.from('recurring_transactions').upsert(recurringPayloads)
          : Promise.resolve({ error: null }),
      ]);
      if (txRes.error) console.error('Supabase transactions upsert error:', txRes.error);
      if (comRes.error) console.error('Supabase commitments upsert error:', comRes.error);
      if (recRes.error) console.error('Supabase recurring upsert error:', recRes.error);

      return true;
    } catch (err) {
      console.error('Cloud sync to Supabase fatal error:', err);
      return false;
    }
  }

  /**
   * Delete a transaction from Supabase
   */
  public static async deleteTransactionFromCloud(txId: string, user: AuthUserProfile): Promise<boolean> {
    if (!isSupabaseConfigured || user.isGuest) return false;
    try {
      const { error } = await supabase.from('transactions').delete().eq('id', toValidUuid(txId)).eq('user_id', user.id);
      return !error;
    } catch (err) {
      console.error('Supabase delete tx error:', err);
      return false;
    }
  }

  /**
   * Delete a money commitment from Supabase
   */
  public static async deleteCommitmentFromCloud(commId: string, user: AuthUserProfile): Promise<boolean> {
    if (!isSupabaseConfigured || user.isGuest) return false;
    try {
      const { error } = await supabase.from('money_commitments').delete().eq('id', toValidUuid(commId)).eq('user_id', user.id);
      return !error;
    } catch (err) {
      console.error('Supabase delete commitment error:', err);
      return false;
    }
  }

  /**
   * Delete a recurring transaction from Supabase
   */
  public static async deleteRecurringFromCloud(recId: string, user: AuthUserProfile): Promise<boolean> {
    if (!isSupabaseConfigured || user.isGuest) return false;
    try {
      const { error } = await supabase.from('recurring_transactions').delete().eq('id', toValidUuid(recId)).eq('user_id', user.id);
      return !error;
    } catch (err) {
      console.error('Supabase delete recurring error:', err);
      return false;
    }
  }

  /**
   * Delete a budget from Supabase
   */
  public static async deleteBudgetFromCloud(budgetId: string, user: AuthUserProfile): Promise<boolean> {
    if (!isSupabaseConfigured || user.isGuest) return false;
    try {
      const { error } = await supabase.from('budgets').delete().eq('id', toValidUuid(budgetId)).eq('user_id', user.id);
      return !error;
    } catch (err) {
      console.error('Supabase delete budget error:', err);
      return false;
    }
  }

  /**
   * Delete a savings goal from Supabase
   */
  public static async deleteGoalFromCloud(goalId: string, user: AuthUserProfile): Promise<boolean> {
    if (!isSupabaseConfigured || user.isGuest) return false;
    try {
      const { error } = await supabase.from('savings_goals').delete().eq('id', toValidUuid(goalId)).eq('user_id', user.id);
      return !error;
    } catch (err) {
      console.error('Supabase delete goal error:', err);
      return false;
    }
  }

  /**
   * Delete an account from Supabase
   */
  public static async deleteAccountFromCloud(accountId: string, user: AuthUserProfile): Promise<boolean> {
    if (!isSupabaseConfigured || user.isGuest) return false;
    try {
      const { error } = await supabase.from('accounts').delete().eq('id', toValidUuid(accountId)).eq('user_id', user.id);
      return !error;
    } catch (err) {
      console.error('Supabase delete account error:', err);
      return false;
    }
  }
}
