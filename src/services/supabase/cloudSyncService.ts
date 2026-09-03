import { FinovaState, INITIAL_CATEGORIES } from '../storage/FinovaStorage';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { AuthUserProfile } from './authService';
import {
  Account,
  Budget,
  Category,
  MoneyCommitment,
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

  // Hash the raw string into 32 hex chars
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

export class CloudSyncService {
  /**
   * Load complete state from Supabase PostgreSQL for the authenticated user
   */
  public static async loadStateFromCloud(user: AuthUserProfile): Promise<FinovaState | null> {
    if (!isSupabaseConfigured || user.isGuest) {
      return null;
    }

    try {
      // 1. Fetch User Settings
      const { data: settingsData, error: sErr } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (sErr) console.warn('Supabase settings load error:', sErr);

      // 2. Fetch Accounts
      const { data: accountsData, error: aErr } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: true });

      if (aErr) console.warn('Supabase accounts load error:', aErr);

      // 3. Fetch Transactions
      const { data: txData, error: tErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (tErr) console.warn('Supabase tx load error:', tErr);

      // 4. Fetch Budgets
      const { data: budgetData } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);

      // 5. Fetch Goals
      const { data: goalsData } = await supabase
        .from('savings_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false);

      // 6. Fetch Commitments
      const { data: commitmentsData } = await supabase
        .from('money_commitments')
        .select('*')
        .eq('user_id', user.id);

      // If user has no existing cloud data yet, return null
      if (!settingsData && (!accountsData || accountsData.length === 0)) {
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
        categoryId: t.category_id || 'cat-general',
        toAccountId: t.to_account_id,
        type: t.type,
        amount: Number(t.amount),
        currency: t.currency || 'PHP',
        merchant: t.merchant,
        note: t.note,
        date: t.date,
        time: t.time || '12:00',
        tags: t.tags || [],
        status: t.status || 'CONFIRMED',
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
        categoryIds: b.category_ids || [],
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
        categoryId: c.category_id || 'cat-bills',
        accountId: c.account_id || accounts[0]?.id || 'acc-1',
        priority: c.priority || 'ESSENTIAL',
        isAutoGenerated: c.is_auto_generated ?? false,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }));

      return {
        accounts,
        transactions,
        categories: INITIAL_CATEGORIES,
        budgets,
        goals,
        commitments,
        recurring: [],
        settings,
      };
    } catch (err) {
      console.warn('Failed to load state from Supabase:', err);
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
      // 1. Sync User Profile & Settings
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: user.fullName || state.settings.userName,
        avatar_url: user.avatarUrl,
        updated_at: new Date().toISOString(),
      });

      await supabase.from('user_settings').upsert({
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
      });

      // 2. Sync Accounts
      if (state.accounts.length > 0) {
        const accountPayloads = state.accounts.map((acc) => ({
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

        const { error: accErr } = await supabase.from('accounts').upsert(accountPayloads);
        if (accErr) console.warn('Supabase accounts upsert error:', accErr);
      }

      // 3. Sync Transactions
      if (state.transactions.length > 0) {
        const firstAccId = state.accounts[0]?.id ? toValidUuid(state.accounts[0].id) : toValidUuid('acc-1');
        const txPayloads = state.transactions.map((tx) => ({
          id: toValidUuid(tx.id),
          user_id: user.id,
          account_id: tx.accountId ? toValidUuid(tx.accountId) : firstAccId,
          category_id: null,
          type: tx.type || 'EXPENSE',
          amount: Math.round(tx.amount),
          currency: tx.currency || state.settings.currency || 'PHP',
          merchant: tx.merchant || '',
          note: tx.note || '',
          date: tx.date || new Date().toISOString().substring(0, 10),
          time: tx.time || '12:00',
          tags: tx.tags || [],
          status: tx.status || 'CONFIRMED',
          updated_at: new Date().toISOString(),
        }));

        const { error: txErr } = await supabase.from('transactions').upsert(txPayloads);
        if (txErr) console.warn('Supabase transactions upsert error:', txErr);
      }

      return true;
    } catch (err) {
      console.warn('Cloud sync to Supabase error:', err);
      return false;
    }
  }

  /**
   * Delete a transaction from Supabase
   */
  public static async deleteTransactionFromCloud(txId: string, user: AuthUserProfile): Promise<void> {
    if (!isSupabaseConfigured || user.isGuest) return;
    try {
      await supabase.from('transactions').delete().eq('id', toValidUuid(txId)).eq('user_id', user.id);
    } catch (err) {
      console.warn('Supabase delete tx error:', err);
    }
  }
}
