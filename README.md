# PALDO — Personal Finance

A calm, privacy-first personal finance web app: track spending, see a daily **Safe-to-Spend** limit, plan budgets and savings goals, and never miss a bill. Works offline as a PWA, with optional cloud sync.

> Note: the repository folder is named `FINOVA` (the original code name); the shipped product is **PALDO**.

## Stack

- React 19 + TypeScript (strict) + Vite 6
- Tailwind CSS v4
- Supabase (Postgres + Auth) for optional cloud sync — local-first by design
- Vitest for unit/domain tests

## Getting started

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check (tsc -b) + production build
npm test         # full test suite (483 tests, 43 files)
npm run lint     # oxlint (0 warnings, 0 errors)
```

### Cloud sync (optional)

Copy `.env.example` to `.env.local` and fill in your Supabase project keys:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
```

Without these, the app runs fully offline on the device. Apply `supabase/schema.sql` in your Supabase project for cloud sync and row-level security. If your database predates a migration file in `supabase/migration_*.sql`, run those too (they are idempotent and also folded into `schema.sql` for fresh databases).

## How it's organized

- `src/domain/*` — pure, tested financial engines (transactions, budgets, goals, safe-to-spend, timeline, risk, insights). No React.
- `src/screens/*`, `src/components/*` — UI.
- `src/services/*` — storage, auth, sync, notifications.
- `src/i18n/*` — English (`en`) + Filipino (`fil`) locales. Every `en` key must exist in `fil` (enforced by a parity test).

## Notes

- **Local-first:** data is saved to the device immediately; cloud sync (when configured) queues and pushes in the background.
- **Privacy:** the app stores data locally and (optionally) in your own Supabase project. There is no third-party analytics or push backend — device notifications work while the app is open; the in-app feed always works, even offline.
- **App Lock** is a device-level PIN gate, not encryption — keep your device lock on too.
- **Data portability:** full JSON backup/restore plus CSV export; the app's own CSV exports can be re-imported with duplicate detection and a pre-import review.

## Financial model (short version)

- Money is integer minor units (`MoneyValue`); dates are plain `YYYY-MM-DD` local days (`DateUtils`) — no timezone drift, no float totals.
- Every transaction moves account balances through `TransactionEngine`; edits reverse-then-apply, deletes reverse. Nothing hand-edits a balance except reconciliation, which posts an auditable adjustment transaction.
- Goal funding and adjustments are tagged bookkeeping (`goal-fund`, `adjustment`) and are excluded from budgets, spending breakdowns, and trends.
- Transfers move money between same-currency accounts and never count as income or spending.
- The display currency can be freely chosen on a clean slate, but is locked once you hold balances or history — switching it would relabel every amount without converting it. Multi-currency households should keep one account per currency.
- The Emergency Fund target is derived from your own essential bills (or 6-month essential spend) — every figure shows its source.
