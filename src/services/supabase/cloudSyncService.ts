import { FinovaState } from '../storage/FinovaStorage';
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
      const { data: settingsData } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // 2. Fetch Accounts
      const { data: accountsData } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: true });

      // 3. Fetch Transactions
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

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

      // If no data exists yet on cloud for this user, return null so local defaults or onboarding trigger
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
        categories: [],
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
      // 1. Sync User Settings
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
          id: acc.id.includes('-') && acc.id.length >= 30 ? acc.id : undefined,
          user_id: user.id,
          name: acc.name,
          bank_preset_id: acc.bankPresetId || 'grbi',
          account_number_mask: acc.accountNumberMask,
          type: acc.type || 'BANK',
          currency: acc.currency || 'PHP',
          initial_balance: acc.initialBalance,
          current_balance: acc.currentBalance,
          icon: acc.icon,
          color: acc.color,
          include_in_total_balance: acc.includeInTotalBalance,
          is_archived: acc.isArchived,
        })).filter((p) => p.id !== undefined);

        if (accountPayloads.length > 0) {
          await supabase.from('accounts').upsert(accountPayloads);
        }
      }

      return true;
    } catch (err) {
      console.warn('Cloud sync to Supabase error:', err);
      return false;
    }
  }
}
