-- ======================================================================================
-- PALDO — POSTGRESQL DATABASE SCHEMA & ROW LEVEL SECURITY (SUPABASE)
-- VERSION: 2.0
-- AUTHORITATIVE FINANCIAL DATA CONTRACT: INTEGER MINOR UNITS (ZERO FLOATING DRIFT)
-- ======================================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------------------------
-- 1. USER PROFILES TABLE (Synced with auth.users)
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT DEFAULT 'Juan Dela Cruz',
    avatar_url TEXT,
    currency VARCHAR(5) DEFAULT 'PHP',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------------------------
-- 2. USER SETTINGS TABLE
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    currency VARCHAR(5) DEFAULT 'PHP',
    default_tracking_period TEXT DEFAULT 'TODAY',
    budget_cycle_mode TEXT DEFAULT 'SEMI_MONTHLY_15_DAYS',
    semi_monthly_cutoff_day INT DEFAULT 15,
    minimum_reserve BIGINT DEFAULT 0, -- Stored in minor integer units (cents)
    safe_to_spend_period TEXT DEFAULT 'END_OF_MONTH',
    dark_theme BOOLEAN DEFAULT false,
    notifications_enabled BOOLEAN DEFAULT true,
    budget_warning_threshold INT DEFAULT 80,
    auto_generate_commitments_from_recurring BOOLEAN DEFAULT true,
    has_completed_onboarding BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------------------------
-- 3. BANK ACCOUNTS & WALLETS
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    bank_preset_id TEXT DEFAULT 'grbi',
    account_number_mask TEXT DEFAULT '•••• 1234',
    type TEXT NOT NULL DEFAULT 'BANK', -- 'BANK' | 'E_WALLET' | 'SAVINGS' | 'CREDIT_CARD' | 'CASH' | 'INVESTMENT'
    currency VARCHAR(5) DEFAULT 'PHP',
    initial_balance BIGINT NOT NULL DEFAULT 0, -- Stored in integer minor units (100 = ₱1.00)
    current_balance BIGINT NOT NULL DEFAULT 0, -- Stored in integer minor units (100 = ₱1.00)
    icon TEXT DEFAULT 'Building2',
    color TEXT DEFAULT '#1C205E',
    include_in_total_balance BOOLEAN DEFAULT true,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);

-- --------------------------------------------------------------------------------------
-- 4. CATEGORIES
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL for system-wide default categories
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'ShoppingBag',
    emoji TEXT,
    color TEXT NOT NULL DEFAULT '#059669',
    bg_color TEXT DEFAULT '#D1FAE5',
    type TEXT NOT NULL DEFAULT 'EXPENSE', -- 'INCOME' | 'EXPENSE'
    is_system BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);

-- --------------------------------------------------------------------------------------
-- 5. TRANSACTIONS
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL, -- Only used when type = 'TRANSFER'
    type TEXT NOT NULL, -- 'EXPENSE' | 'INCOME' | 'TRANSFER'
    amount BIGINT NOT NULL, -- Integer minor units (e.g. 150000 = ₱1,500.00)
    currency VARCHAR(5) DEFAULT 'PHP',
    merchant TEXT,
    note TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    time TEXT DEFAULT '12:00',
    tags TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'CONFIRMED', -- 'CONFIRMED' | 'PENDING' | 'RECONCILED'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON public.transactions(account_id);

-- --------------------------------------------------------------------------------------
-- 6. BUDGETS
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount BIGINT NOT NULL, -- Minor units
    currency VARCHAR(5) DEFAULT 'PHP',
    category_ids TEXT[] DEFAULT '{}',
    period TEXT NOT NULL DEFAULT 'MONTHLY', -- 'MONTHLY' | 'SEMI_MONTHLY_15_DAYS' | 'WEEKLY'
    semi_monthly_cutoff_day INT DEFAULT 15,
    rollover_unused BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budgets_user ON public.budgets(user_id);

-- --------------------------------------------------------------------------------------
-- 7. SAVINGS GOALS
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.savings_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_amount BIGINT NOT NULL, -- Minor units
    current_amount BIGINT NOT NULL DEFAULT 0, -- Minor units
    currency VARCHAR(5) DEFAULT 'PHP',
    target_date DATE NOT NULL,
    icon TEXT DEFAULT 'Target',
    color TEXT DEFAULT '#059669',
    linked_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON public.savings_goals(user_id);

-- --------------------------------------------------------------------------------------
-- 8. MONEY COMMITMENTS (UPCOMING BILLS & RECURRING OBLIGATIONS)
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.money_commitments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount BIGINT NOT NULL, -- Minor units
    currency VARCHAR(5) DEFAULT 'PHP',
    due_date DATE NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'MONTHLY', -- 'ONCE' | 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
    category_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    is_essential BOOLEAN DEFAULT true,
    is_auto_generated BOOLEAN DEFAULT false,
    is_paid BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commitments_user_due ON public.money_commitments(user_id, due_date ASC);

-- ======================================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES — STRICT ISOLATION BY USER
-- ======================================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_commitments ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can only read/update their own profile
CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- User Settings
CREATE POLICY "Users can read own settings" ON public.user_settings
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.user_settings
    FOR UPDATE USING (auth.uid() = user_id);

-- Accounts
CREATE POLICY "Users can read own accounts" ON public.accounts
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts" ON public.accounts
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts" ON public.accounts
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts" ON public.accounts
    FOR DELETE USING (auth.uid() = user_id);

-- Categories: Read system categories OR own categories
CREATE POLICY "Users can read categories" ON public.categories
    FOR SELECT USING (is_system = true OR auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON public.categories
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own categories" ON public.categories
    FOR UPDATE USING (auth.uid() = user_id AND is_system = false);
CREATE POLICY "Users can delete own categories" ON public.categories
    FOR DELETE USING (auth.uid() = user_id AND is_system = false);

-- Transactions
CREATE POLICY "Users can read own transactions" ON public.transactions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON public.transactions
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON public.transactions
    FOR DELETE USING (auth.uid() = user_id);

-- Budgets
CREATE POLICY "Users can read own budgets" ON public.budgets
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own budgets" ON public.budgets
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own budgets" ON public.budgets
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own budgets" ON public.budgets
    FOR DELETE USING (auth.uid() = user_id);

-- Savings Goals
CREATE POLICY "Users can read own goals" ON public.savings_goals
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own goals" ON public.savings_goals
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals" ON public.savings_goals
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own goals" ON public.savings_goals
    FOR DELETE USING (auth.uid() = user_id);

-- Money Commitments
CREATE POLICY "Users can read own commitments" ON public.money_commitments
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own commitments" ON public.money_commitments
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own commitments" ON public.money_commitments
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own commitments" ON public.money_commitments
    FOR DELETE USING (auth.uid() = user_id);

-- ======================================================================================
-- AUTOMATIC PROFILE & SETTINGS PROVISIONING TRIGGER (ON AUTH SIGNUP)
-- ======================================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Juan Dela Cruz'),
        NEW.raw_user_meta_data->>'avatar_url'
    );

    INSERT INTO public.user_settings (user_id, currency, has_completed_onboarding)
    VALUES (NEW.id, 'PHP', false);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ======================================================================================
-- 9. RECURRING TRANSACTIONS (Templates that auto-generate transactions)
-- ======================================================================================

CREATE TABLE IF NOT EXISTS public.recurring_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount BIGINT NOT NULL, -- Minor units
    currency VARCHAR(5) DEFAULT 'PHP',
    type TEXT NOT NULL DEFAULT 'EXPENSE', -- 'EXPENSE' | 'INCOME'
    category_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    frequency TEXT NOT NULL DEFAULT 'MONTHLY', -- 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY'
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    next_occurrence DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    reminder_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_user ON public.recurring_transactions(user_id);

-- --------------------------------------------------------------------------------------
-- 10. MIGRATION: bring legacy live schema in line with the app's data contract
--     (idempotent — safe to re-run on a fresh OR already-deployed database)
-- --------------------------------------------------------------------------------------

-- budgets: add planning-window + threshold columns the client round-trips
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS notify_threshold_percentage INT DEFAULT 80;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS semi_monthly_cutoff_day INT DEFAULT 15;

-- money_commitments: add the status/type/priority/direction fields the client uses
ALTER TABLE public.money_commitments ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'BILL';
ALTER TABLE public.money_commitments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PROJECTED';
ALTER TABLE public.money_commitments ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'ESSENTIAL';
ALTER TABLE public.money_commitments ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'OUTFLOW';

-- transactions: split allocations + local-only receipt pointer
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS split_parts JSONB;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS receipt_data_url TEXT;

-- transactions: auto-post provenance (which commitment a row settled)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source_commitment_id UUID;

-- savings_goals: priority/status the client already round-trips. Without
-- these columns PostgREST rejects the whole goals upsert, so goals silently
-- never back up to the cloud.
ALTER TABLE public.savings_goals ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'ESSENTIAL';
ALTER TABLE public.savings_goals ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ON_TRACK';

-- recurring_transactions: essentiality flag (emergency-fund baseline) +
-- scheduled-transfer destination. Priority stays nullable: legacy rules
-- without it mean "unknown", not "essential".
ALTER TABLE public.recurring_transactions ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE public.recurring_transactions ADD COLUMN IF NOT EXISTS destination_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

-- recurring_transactions: RLS + owner policies
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

-- recurring lifecycle: explicit auto-post consent (legacy rows fall back to reminder_enabled in-app)
ALTER TABLE public.recurring_transactions ADD COLUMN IF NOT EXISTS auto_post_enabled BOOLEAN;

-- money_commitments: auto-post + provenance for the recurring lifecycle
ALTER TABLE public.money_commitments ADD COLUMN IF NOT EXISTS auto_post_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.money_commitments ADD COLUMN IF NOT EXISTS last_auto_posted_at TIMESTAMPTZ;
ALTER TABLE public.money_commitments ADD COLUMN IF NOT EXISTS related_recurring_transaction_id UUID;
ALTER TABLE public.money_commitments ADD COLUMN IF NOT EXISTS goal_id UUID;
ALTER TABLE public.money_commitments ADD COLUMN IF NOT EXISTS notes TEXT;

DROP POLICY IF EXISTS "Users can read own recurring" ON public.recurring_transactions;
CREATE POLICY "Users can read own recurring" ON public.recurring_transactions
    FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own recurring" ON public.recurring_transactions;
CREATE POLICY "Users can insert own recurring" ON public.recurring_transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own recurring" ON public.recurring_transactions;
CREATE POLICY "Users can update own recurring" ON public.recurring_transactions
    FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own recurring" ON public.recurring_transactions;
CREATE POLICY "Users can delete own recurring" ON public.recurring_transactions
    FOR DELETE USING (auth.uid() = user_id);

