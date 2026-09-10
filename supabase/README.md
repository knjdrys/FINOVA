# FINOVA — Supabase & Vercel Setup Guide

Follow this guide to connect FINOVA to Supabase (PostgreSQL with Row Level Security) and deploy to Vercel.

---

## 1. Supabase Setup (PostgreSQL Database & Auth)

1. Go to [https://supabase.com](https://supabase.com) and create a new project (e.g. `finova-prod`).
2. Open your project dashboard and navigate to **SQL Editor**.
3. Create a new query, paste the entire contents of [`supabase/schema.sql`](./schema.sql), and click **Run**.
   - This creates all tables (`profiles`, `user_settings`, `accounts`, `categories`, `transactions`, `budgets`, `savings_goals`, `money_commitments`).
   - Automatically enables strict **Row Level Security (RLS)** so users can only access their own financial records.
   - Sets up auto-provisioning triggers for new user signups.

### Enabling Google OAuth in Supabase:
1. In Supabase Dashboard, go to **Authentication** -> **Providers** -> **Google**.
2. Toggle Google to **Enabled**.
3. Add your **Client ID** and **Client Secret** from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
4. Add the Supabase Redirect URL (provided in your Supabase Auth dashboard) to your Google Cloud Console Authorized Redirect URIs.

---

## 2. Local Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. In Supabase Dashboard -> **Project Settings** -> **API**, copy:
   - **Project URL** -> set as `VITE_SUPABASE_URL`
   - **Project API Anon Key** -> set as `VITE_SUPABASE_ANON_KEY`

---

## 3. Deploy to Vercel

1. Push your repository to GitHub.
2. Go to [https://vercel.com](https://vercel.com) and click **Add New Project**.
3. Select your repository.
4. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click **Deploy**. Vercel will automatically build and deploy the app with zero routing errors (`vercel.json` SPA configuration included).
