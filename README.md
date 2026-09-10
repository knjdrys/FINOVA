# FINOVA — Personal Finance

A fast, offline-first personal finance PWA built for the Philippine money
rhythm: **Safe-to-Spend** budgets, **15-day semi-monthly payroll** cycles,
savings goals, bills & recurring schedules, cash-flow projections, and
category insights — in **English and Filipino (Tagalog)**.

All money math runs in integer **minor units (centavos)**, so there is no
floating-point drift anywhere in the budget engines.

---

## Features

| Area | What you get |
| --- | --- |
| 💵 Safe-to-Spend | Daily spendable limit that protects upcoming bills, goals, and your emergency cushion |
| 🗓️ 15-day payroll | Budget halves aligned to the 1st–15th / 16th–30th pay periods (or a full-month mode) |
| 🏦 Multi-account | Banks, e-wallets, and cash wallets with per-account balances |
| 📊 Insights | Category spending, trends, and anomaly hints across periods |
| 🎯 Goals & bills | Savings goals with required monthly velocity, bill due dates, recurring income/expense automation |
| 🔮 30-day projection | Projected balance timeline from scheduled transactions and bills |
| 📸 Receipt capture | Photo receipts → OCR-lite parsing → transaction draft |
| 🔒 App lock | Optional PIN gate with auto-lock timer |
| 🇵🇭 English / Filipino | Full i18n with a parity test that fails the build if a locale drifts |
| ☁️ Optional cloud | Supabase auth + sync when configured — otherwise 100% local/offline, including a guest mode |
| 📲 Installable PWA | Web manifest + service worker, works as an app on phone home screens |

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check (tsc -b) + production build → dist/
npm run preview    # serve the production build locally
npm test           # vitest (290+ tests: domain engines, i18n parity, sync)
npm run lint       # oxlint (React + TypeScript rules)
```

No environment variables are required. The app runs entirely in the browser
(localStorage + IndexedDB) until you connect a Supabase backend.

## Environment (optional Supabase backend)

Create `.env.local` (see `supabase/README.md` for the full guide):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

When these are missing or placeholders, `isSupabaseConfigured` is `false` and
the app automatically falls back to **local mode**: guest sign-in works, data
lives on the device, and nothing phones home.

## Install as a PWA

Open the app on a phone, then *Add to Home Screen*. A service worker caches
the app shell for offline use and the manifest supplies name, icons, and
theme colors.

---

## Architecture

```
src/
  screens/         5 tabs (Home, All Expenses, Insights, Plans, Settings) + Auth
  components/      UI kit, modals, navigation, planning widgets, tutorial, security
  domain/          Pure engines — no React, no side effects
    money/         MoneyValue: integer centavo arithmetic + currency
    safe-to-spend/ Daily-limit engine (bills, goals, cushions protected)
    budget/ goals/ transaction/ timeline/ insight/ what-if/ risk/ ...
  services/
    storage/       FinovaStorage: localStorage + IndexedDB adapter
    supabase/      auth + cloud sync (no-ops when unconfigured)
    sync/          Conflict-safe local↔cloud merge
    notification/  In-app notification feed (works offline)
    receipt/       Receipt photo → structured draft
    security/      PIN hashing + auto-lock
  i18n/            EN/FIL locales + interpolation/plurals; parity-tested
  tests/           Vitest suites for engines, invariants, sync, i18n
supabase/          SQL schema, RLS policies, Vercel deploy guide
```

**Data flow.** Screens read app state from `App.tsx` and dispatch intent
handlers; domain engines compute results as pure functions; services persist.
The UI never does money math inline.

**Design system.** Single dark financial theme, lime `#D4F63D` accent,
semantic tokens in `src/components/ui/`, motion via a tiny rAF tween layer
that respects `prefers-reduced-motion`.

## Testing

```bash
npm test
```

Covers money invariants (no float drift, rounding rules), safe-to-spend
correctness across pay periods, goal velocity, budget overflow, cloud sync
round-trips and isolation, i18n **locale parity** (an EN key missing from FIL
fails the test), and data-volume performance.

## License

MIT — see repository.
