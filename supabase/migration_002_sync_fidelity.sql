-- ======================================================================================
-- PALDO — LIVE GAP MIGRATION 002: cloud-sync fidelity columns
-- Run in Supabase Dashboard → SQL Editor (anon key cannot run DDL).
-- Idempotent: every statement is ADD COLUMN IF NOT EXISTS.
--
-- Why: the client round-trips these fields, but the columns never existed, so
--   (a) the goals upsert fails wholesale in PostgREST (unknown columns) and
--       goals silently never back up, and
--   (b) recurring priority, recurring transfer destinations, and auto-post
--       provenance are quietly dropped on every cloud restore.
-- These exact statements also live in schema.sql §10 for fresh databases.
-- ======================================================================================

ALTER TABLE public.savings_goals ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'ESSENTIAL';
ALTER TABLE public.savings_goals ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ON_TRACK';

ALTER TABLE public.recurring_transactions ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE public.recurring_transactions ADD COLUMN IF NOT EXISTS destination_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source_commitment_id UUID;
