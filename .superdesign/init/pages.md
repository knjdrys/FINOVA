# Page Component Dependency Trees

## / (Home Screen)
Entry: `src/screens/HomeScreen.tsx`
Dependencies:
- `src/components/ui/WaveCard.tsx`
  - `src/domain/money/MoneyValue.ts`
  - `src/domain/safe-to-spend/SafeToSpendEngine.ts`
- `src/components/ui/FilterChips.tsx`
- `src/components/ui/TransactionItem.tsx`
- `src/components/ui/GrbiLogo.tsx`
- `src/domain/date/DateUtils.ts`

## /expenses (All Expenses Screen)
Entry: `src/screens/AllExpensesScreen.tsx`
Dependencies:
- `src/components/ui/FilterChips.tsx`
- `src/components/ui/TransactionItem.tsx`
- `src/domain/money/MoneyValue.ts`
- `src/domain/date/DateUtils.ts`

## /analytics (Insights Screen)
Entry: `src/screens/InsightsScreen.tsx`
Dependencies:
- `src/domain/insight/InsightEngine.ts`
- `src/domain/money/MoneyValue.ts`
- `src/domain/date/DateUtils.ts`

## /settings (Settings Screen)
Entry: `src/screens/SettingsScreen.tsx`
Dependencies:
- `src/components/modals/AddAccountModal.tsx`
- `src/components/modals/TutorialModal.tsx`
- `src/components/ui/GrbiLogo.tsx`
- `src/domain/money/MoneyValue.ts`
- `src/domain/date/DateUtils.ts`
- `src/services/storage/FinovaStorage.ts`

## /auth (Auth Screen)
Entry: `src/screens/AuthScreen.tsx`
Dependencies:
- `src/services/supabase/authService.ts`
- `src/services/supabase/supabaseClient.ts`
- `src/components/ui/GrbiLogo.tsx`
