-- ======================================================================================
-- PALDO — LIVE GAP MIGRATION 001: recurring_transactions table
-- Run in Supabase Dashboard → SQL Editor (anon key cannot run DDL).
-- Idempotent: safe to run even if the table already exists.
-- Why: the table from schema.sql §9 was never applied to the live database —
-- PostgREST returns PGRST205 for it, so recurring-rule cloud backup silently
-- fails while every other table syncs. RLS + owner policies ship in the same
-- statement batch so the table is never exposed without isolation.
-- ======================================================================================

CREATE TABLE IF NOT EXISTS public.recurring_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount BIGINT NOT NULL,
    currency VARCHAR(5) DEFAULT 'PHP',
    type TEXT NOT NULL DEFAULT 'EXPENSE',
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    frequency TEXT NOT NULL DEFAULT 'MONTHLY',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    next_occurrence DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    reminder_enabled BOOLEAN DEFAULT true,
    auto_post_enabled BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_user ON public.recurring_transactions(user_id);

ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

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
