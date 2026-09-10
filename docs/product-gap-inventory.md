# FINOVA — Product Gap Inventory (2026-09-10)

Method: full repo inspection (every screen, modal, domain engine, service,
test) evaluated against the capabilities a modern high-end personal-finance
product is expected to have. Classification: CRITICAL (must exist to be a
complete finance product) / IMPORTANT (strongly improves) / ADVANCED
(premium) / OPTIONAL (nice).

Legend: ✅ done (this pass) · 🔄 done previously · ⏭ next pass · ➖ deliberate
non-feature (documented reason).

## Financial foundation
| Capability | Status | Notes |
| --- | --- | --- |
| Accounts: create/edit/archive/balances | 🔄 | AddAccountModal, archive, per-account balances from ledger |
| Cash / bank / wallet / card | 🔄 | account types BANK/WALLET/CASH/CARD |
| Transactions: add/edit/delete/search/filter/detail | 🔄 | detail modal → contextual editor |
| Transfers (not counted as income/expense) | 🔄 | TRANSFER type, destination account, excluded by `getCategoryAllocations` invariant |
| Income records + recurring income | 🔄 | INCOME txs, recurring INCOME rules |
| Categories (system + custom, archive) | 🔄 | archivable, localized names |
| Subcategories | ➖ | hierarchy rejected: categories + tags + splits already express structure; subcategories add UI complexity without new questions they answer |
| Merchants/payees | 🔄 | merchant field + merchant-based intelligence (this pass) |

## Budgeting
| Capability | Status | Notes |
| --- | --- | --- |
| Category budgets, limits, progress, overspend | 🔄 | BudgetEngine + status + warnings |
| Budget reacts to real transactions | 🔄 | engine computed from ledger |
| Budget history (past months per budget) | ⏭ | ADVANCED — next pass |

## Planning
| Capability | Status | Notes |
| --- | --- | --- |
| Bills / commitments (9 types, status, due dates) | 🔄 | FutureFinanceEngine auto-post, overdue, manual settle |
| Upcoming payments | 🔄 | timeline + notification engine |
| Recurring income/expense, dedupe, missed dates, pause, delete | 🔄 | `isActive`/endDate = pause; engine guards AUTO_POSTED/COMPLETED idempotency |

## Savings
| Capability | Status | Notes |
| --- | --- | --- |
| Goals: create/target/date/contribute/edit/archive | 🔄 | GoalEngine |
| Goal **withdraw** | ✅ | added this pass (engine + UI + tests) — the reverse of funding, exact inverse ledger effects |
| Emergency fund (target = N months essential, months covered, progress) | ✅ | built this pass — was only a goal preset + raw reserve number |
| Sinking funds | ➖ | goals with target date already serve this; separate entity would duplicate |

## Cash flow
| Capability | Status | Notes |
| --- | --- | --- |
| Income vs expenses, upcoming obligations, projected balance, 30-day forecast | 🔄 | TimelineEngine + What-If simulator |

## Financial intelligence
| Capability | Status | Notes |
| --- | --- | --- |
| Safe-to-Spend (explainable) | 🔄 | engine + explainer modal with line items |
| Spending insights / trends / anomalies | 🔄/⏭ | MoM category moves + budget/goal/s2s insights exist; single-spend anomaly detection ⏭ (ADVANCED, next pass) |
| Budget warnings | 🔄 | BUDGET_ALERT notifications + insight |
| **Merchant recognition / smart categorization** | ✅ | added this pass — learned from the user's OWN history (3+ same merchant+category), never fabricated |
| **Duplicate detection on manual entry** | ✅ | added this pass — non-blocking hint on merchant+amount+day match |
| Recurring detection from history | ⏭ | ADVANCED — heuristic suggest, next pass |
| **Financial health indicator (explainable score)** | ⏭ | ADVANCED — next pass |

## Reporting & analytics
| Capability | Status | Notes |
| --- | --- | --- |
| Category breakdown, What-If | 🔄 | |
| **Income vs expenses monthly trend (6 months)** | ✅ | added this pass — real series, no decoration |
| **Net worth** | ⏭ | next pass (assets from accounts; liabilities model first) |
| Export (CSV transactions, JSON full backup) | 🔄 | + import this repo's previous pass |
| Printable/PDF statement | ⏭ | OPTIONAL — print-CSS view, later |

## UX
| Capability | Status | Notes |
| --- | --- | --- |
| Onboarding (guided, skippable, useful when skipped) | 🔄 | checklist + tour + demo-data offer |
| Empty/loading/error/success states | 🔄 | inbox states, Suspense fallback, dialog service |
| Search/filter/sort/date-range/category/account filters | 🔄 | All Expenses advanced panel |
| Notifications + reminders | 🔄 | in-app feed (offline), OS notifications where permitted |
| Undo for destructive actions | 🔄 | previous pass |

## Security
| Capability | Status | Notes |
| --- | --- | --- |
| Auth (Supabase OAuth/email/guest), RLS, per-user scoping | 🔄 | |
| App lock PIN + auto-lock | 🔄 | honest threat model documented |
| Input validation | 🔄 | engines validate (overdraw, same-account transfer, split sums) |
| CSV formula-injection guard on export | 🔄 | leading = + - @ neutralized |
| Secrets exposure | ✅ | no secrets in repo; env-only; verified this pass |

## Engineering
| Capability | Status | Notes |
| --- | --- | --- |
| Code-splitting, lint, i18n parity, volume tests | 🔄 | |
| **SEO meta (description + OG tags)** | ✅ | added this pass |
| Dead code / TODO / fake handlers | ✅ | audited: none found |

## Completion summary (this pass — 2026-09-10)

Implemented & verified:
1. **Goal withdrawal** — `GoalEngine.withdrawableAmount`/`withdraw` (pure,
   exact inverse of `contribute`; COMPLETED reverts to ON_TRACK below
   target). UI: "Withdraw" on every goal card with a saved amount
   (Plans → Goals). Ledger: linked goal → true TRANSFER to a user-picked
   destination; unlinked goal → `goal-withdraw` reservation INCOME row.
   Invariant: `goal-withdraw` rows count toward account balances and the
   cash-flow timeline but are excluded from every income aggregate
   (period totals, All-Expenses income/day nets, Home first-run check).
   12 new tests.
2. **Emergency fund** — new `EmergencyFundEngine` (pure): current reserve
   (settings.minimumReserve, editable in-card) × user-picked 1–12 month
   multiplier × essential spend averaged over the last 3 COMPLETE months
   (default essentials: bills + groceries; user-togglable chips). Honest
   statuses (NO_DATA / NO_ESSENTIAL_SPEND / BUILDING / ON_TARGET) — never
   fabricated. Card at the top of Plans → Goals with every line of the
   arithmetic visible. 13 new tests.
3. **Merchant smart categorization** — new `MerchantCategorizer`
   (amount-weighted, split-aware, learns only from CONFIRMED same-type
   same-currency history, ≥3 uses, unique dominant winner). Auto-fills the
   category in Add Transaction until the user touches the picker; "from
   your history (n×)" chip makes it transparent.
4. **Duplicate hint on manual entry** — `findPossibleDuplicate`
   (merchant + amount + day) → non-blocking amber note in Add Transaction.
5. **6-month cash-flow trend** — new `CashFlowTrend` series builder
   (reservation-aware, currency-matched, current month flagged partial) +
   Insights card, rendered only when complete months have real data.
6. **SEO meta** — description + Open Graph + Twitter tags in index.html.

Demo state extended with two complete months of history (salary +
essentials) so the emergency fund, trend, and month-over-month insights
show real data on first load; balances still derive from the ledger.

Verification: vitest 369/369 (was 322) · tsc clean · oxlint 0/0 ·
production build clean (index 500.40 kB / gzip 145.49).
