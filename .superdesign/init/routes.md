# App Navigation & Screens

## Primary App Tabs (SPA Router in `src/App.tsx`)

| Tab ID | Component | Description |
|---|---|---|
| `HOME` | `src/screens/HomeScreen.tsx` | Main financial cockpit: Safe-To-Spend™ wave card, quick add bar, 15-day cycle tracker, risks alert, today expenses |
| `ALL_EXPENSES` | `src/screens/AllExpensesScreen.tsx` | Full chronological transaction ledger with live search, date range grouping, category filters, and CSV export |
| `ANALYTICS` | `src/screens/InsightsScreen.tsx` | Visual charts, spending breakdown by category, weekly trends, savings progress, and What-If simulation engine |
| `SETTINGS` | `src/screens/SettingsScreen.tsx` | Bank account management (GRBI, BPI, BDO, GCash, Maya), 15-day cycle configuration, currency selector, CSV export, tour launch |
| `AUTH` | `src/screens/AuthScreen.tsx` | One-click Google sign-in, email/password authentication, feature carousel showcase, and offline guest mode |

## Modals & Flow Overlays
- `src/components/modals/AddTransactionModal.tsx`: Fast transaction entry with category chips and amount input.
- `src/components/modals/SafeToSpendExplainerModal.tsx`: Step-by-step mathematical breakdown of Safe-To-Spend formula.
- `src/components/modals/WhatIfModal.tsx`: Interactive purchase simulator showing balance and risk impact before spending.
- `src/components/modals/OnboardingModal.tsx`: 4-step wizard for first-time users (Greeting, Currency, Payday Cycle, First Bank Account).
- `src/components/tutorial/GuidedAppTour.tsx`: Animated live spotlight guide pointing to UI elements with interactive tooltips.
