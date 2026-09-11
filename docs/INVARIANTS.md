# FINOVA Money Laws (canonical invariants)

These laws hold no matter how the UI evolves. Every law names its enforcement
point and its test. When a law and a feature disagree, the law wins.

1. **Integer minor units.** All money math runs in integer minor units
   (`MoneyValue`); floats never touch balances. Non-integer persisted amounts
   are rounded by the sanitizer. — `MoneyValue`, `stateValidation.ts`,
   `financial-core.test.ts` §4.
2. **Direction laws.** EXPENSE never increases its account; INCOME never
   decreases it. — `TransactionEngine.applyTransactionToAccounts`,
   `financial-invariants.test.ts` (money direction laws).
3. **No silent negatives.** Manual entry refuses to overdraw the source
   (`validateTransaction`, edit-aware via pre-reversal). Imports/restores
   reconstruct history and bypass the guard deliberately. Credit-card balances
   model *available credit*, so the same guard reads as over-limit.
   — `TransactionEngine.validateTransaction`, `financial-core.test.ts` §3.
4. **Transfer double-entry.** A TRANSFER subtracts the source and adds the
   destination atomically; the all-accounts total never moves.
   — `apply/reverseTransactionFromAccounts`, `financial-core.test.ts` §8.
5. **Edit = reverse + apply.** Editing reverses the old effect before applying
   the new one — never adjust-by-delta. Bill-payment and goal rows are locked
   against editing (they're owned by their bill/goal).
   — `updateTransactionInAccounts`, `App.handleSaveTransaction`,
   `financial-core.test.ts` §2.
6. **Delete never desyncs.** Deleting reverses the money effect; deleting a
   bill payment reopens its bill; goal rows can't be deleted (fund/withdraw
   instead). Accounts with history *or live bills/rules* archive, never
   hard-delete; categories are archive-only. — `handleDeleteTransaction`,
   `AccountEngine.hasHistory/hasLiveLinks`, `account-archive.test.ts`.
7. **PENDING is provisional.** Analytics exclude PENDING rows; balances include
   them (authorized money). PENDING rows older than 7 days auto-settle to
   CONFIRMED on load — analytics must never understate spend forever.
   — `InsightEngine`, `calculatePeriodTotals`, `sanitizeState`,
   `state-sanitize.test.ts`.
8. **Spent-so-far clamps to today.** No "spent" figure anywhere (Home totals,
   Analytics breakdown, cash-flow bars, budget actuals) includes future-dated
   rows — future money is committed, not spent. The Tx-list summary is the
   deliberate exception: it describes its visible view, list included.
   — `calculatePeriodTotals(asOf)`, `calculateBudgetForecast`,
   `getMonthlyCashFlow`, `financial-qa.test.ts` (clamping).
9. **Bookkeeping isn't economic activity.** Goal funding/withdrawal and balance
   adjustments move balances but never count as income, expense, budget spend,
   or category attribution. — `isBookkeeping` guards in every aggregate,
   `goal-funding-semantics.test.ts`.
10. **Aggregates ignore non-economic rows.** Period income/expense/net
    (Law 4's counterpart for readers): TRANSFER rows never appear in income,
    expense, budget spend, or cash-flow buckets. — `calculatePeriodTotals`,
    `calculateBudgetForecast`, `getMonthlyCashFlow`,
    `financial-core.test.ts` §8.
