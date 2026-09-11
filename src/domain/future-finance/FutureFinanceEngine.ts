import {
  Account,
  CommitmentStatus,
  MoneyCommitment,
  RecurringTransaction,
  Transaction,
  CurrencyCode,
} from '../../types';
import { DateUtils } from '../date/DateUtils';
import { TransactionEngine } from '../transaction/TransactionEngine';

/**
 * FutureFinanceEngine
 * -------------------
 * The single orchestration layer that connects the entire future-finance lifecycle:
 *
 *   RecurringTransaction
 *     -> Commitment (projected / recurring)
 *       -> Financial Timeline (projected balance)
 *         -> Projected Balance
 *           -> Safe-to-Spend
 *             -> Notifications
 *             -> Auto-post (at due date)
 *               -> Actual Transaction (balance update)
 *                 -> Budget / Analytics
 *
 * It is deliberately NOT a set of isolated components. Every downstream screen
 * (Timeline, SafeToSpend, Risk, Analytics, Notifications) consumes the SAME
 * resolved commitment list produced here, so the numbers always agree.
 *
 * Idempotency & duplicate-prevention guarantees:
 *  - Recurring occurrences get DETERMINISTIC ids: `comm-rec-<recurringId>-<dueDate>`.
 *    Re-running resolution over the same data yields identical ids, so regenerating
 *    never creates duplicates.
 *  - Auto-posted transactions carry `sourceCommitmentId`; auto-post is skipped if a
 *    transaction with that id already exists (idempotent even on repeated runs).
 *  - User-set statuses (COMPLETED / CANCELLED) are preserved and never overwritten
 *    by the generator.
 */
export class FutureFinanceEngine {
  /**
   * Resolves the authoritative commitment list for rendering and downstream engines.
   *
   * @param recurring        Raw recurring transactions from state.
   * @param manualCommitments User-created (non-auto) commitments from state.
   * @param transactions     Posted transactions (used to detect already-auto-posted).
   * @param horizonStartISO  Start of projection window (usually today).
   * @param horizonEndISO    End of projection window (e.g. today + 30 days).
   * @param referenceDateISO Reference "today" (auto-post + overdue cut-off).
   */
  public static resolveCommitments(
    recurring: RecurringTransaction[],
    manualCommitments: MoneyCommitment[],
    transactions: Transaction[],
    horizonStartISO: string,
    horizonEndISO: string,
    referenceDateISO?: string
  ): MoneyCommitment[] {
    const todayISO = referenceDateISO || DateUtils.getTodayISO();

    // 1. Generate projected commitments from recurring transactions (idempotent ids).
    const generated = FutureFinanceEngine.generateFromRecurring(
      recurring,
      horizonStartISO,
      horizonEndISO
    );

    // 1b. Posted-settlement dedupe: a generated occurrence whose settlement
    // transaction exists is PAID — drop it so paid bills never reappear as
    // overdue (manual commitments persist their own terminal status instead).
    const postedIds = new Set(
      transactions.filter((t) => t.sourceCommitmentId).map((t) => t.sourceCommitmentId as string)
    );
    const unpaidGenerated = generated.filter((c) => !postedIds.has(c.id));

    // 2. Merge manual + generated, de-duplicating by id. Manual wins on collision.
    const byId = new Map<string, MoneyCommitment>();
    for (const c of manualCommitments) byId.set(c.id, c);
    for (const c of unpaidGenerated) {
      if (!byId.has(c.id)) byId.set(c.id, c);
    }

    // 3. Recompute derived status (OVERDUE) without clobbering COMPLETED/CANCELLED/AUTO_POSTED.
    const resolved = Array.from(byId.values()).map((c) =>
      FutureFinanceEngine.recomputeStatus(c, todayISO)
    );

    // Sort: overdue first, then by due date.
    resolved.sort((a, b) => {
      const ao = a.status === 'OVERDUE' ? 0 : 1;
      const bo = b.status === 'OVERDUE' ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    });

    return resolved;
  }

  /**
   * Generates projected commitments from active recurring transactions across the
   * horizon. IDs are deterministic (`comm-rec-<recId>-<dueDate>`) so re-running
   * is idempotent — no duplicates even after reschedule/edit regeneration.
   */
  public static generateFromRecurring(
    recurring: RecurringTransaction[],
    horizonStartISO: string,
    horizonEndISO: string
  ): MoneyCommitment[] {
    const out: MoneyCommitment[] = [];

    for (const rec of recurring) {
      if (!rec.isActive) continue;

      const currency: CurrencyCode = rec.currency || 'PHP';
      const direction = rec.type === 'INCOME' ? 'INFLOW' : 'OUTFLOW';
      const type = rec.type === 'INCOME' ? 'RECURRING_INCOME' : 'BILL';

      // Anchor-based iteration: every occurrence is derived from startDate, never
      // chained from the previous occurrence. Chaining drifts month-end rules
      // (Jan 31 -> Feb 28 -> Mar 28 forever). Anchoring clamps correctly:
      // Jan 31 -> Feb 28 -> Mar 31 (standard "last day of month" billing).
      const floor = rec.nextOccurrence && rec.nextOccurrence >= rec.startDate
        ? rec.nextOccurrence
        : rec.startDate;
      const recEnd = rec.endDate || horizonEndISO;
      const horizon = recEnd < horizonEndISO ? recEnd : horizonEndISO;

      // Overdue visibility: emit back to 31 days before the horizon start so
      // unpaid past-due occurrences surface as OVERDUE (via recomputeStatus)
      // instead of vanishing on their due date. Older backlog stays out of
      // projections by design — a bounded window, not silent forgiveness.
      const pastCutoff = DateUtils.addDaysISO(horizonStartISO, -31);
      // Fast-seek: jump the anchor step near max(floor, cutoff) instead of
      // stepping from zero — an untouched daily rule from years back would
      // otherwise trip the loop guards and emit nothing.
      const seekTarget = floor > pastCutoff ? floor : pastCutoff;
      let step = FutureFinanceEngine.seekStep(rec.startDate, rec.frequency, seekTarget);
      let occurrence = FutureFinanceEngine.occurrenceAt(rec.startDate, rec.frequency, step);
      let skipGuard = 0;
      // Skip anchored occurrences that fall before the rule's nextOccurrence
      // (already posted / settled occurrences are never regenerated).
      while (occurrence < floor && skipGuard < 2000) {
        step++;
        skipGuard++;
        occurrence = FutureFinanceEngine.occurrenceAt(rec.startDate, rec.frequency, step);
      }

      let guard = 0;
      while (occurrence <= horizon && guard < 1000) {
        guard++;
        if (occurrence >= pastCutoff) {
          out.push({
            id: `comm-rec-${rec.id}-${occurrence}`,
            userId: rec.userId,
            title: rec.title,
            type,
            amount: rec.amount,
            currency,
            direction,
            status: 'PROJECTED',
            dueDate: occurrence,
            accountId: rec.accountId,
            categoryId: rec.categoryId,
            relatedRecurringTransactionId: rec.id,
            priority: 'ESSENTIAL',
            isAutoGenerated: true,
            // Explicit consent wins; legacy rules (no flag) keep the old
            // reminder-means-auto-post behavior so nothing silently stops.
            autoPostEnabled: rec.autoPostEnabled ?? rec.reminderEnabled,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        occurrence = FutureFinanceEngine.occurrenceAt(rec.startDate, rec.frequency, ++step);
      }
    }

    return out;
  }

  /**
   * The n-th occurrence of a rule anchored at `startDate` (n = 0 is the start
   * date itself). Month/year steps use clamped month arithmetic so a rule on
   * the 31st lands on Feb 28/29, then returns to Mar 31 — no drift.
   */
  public static occurrenceAt(startDateISO: string, frequency: string, step: number): string {
    if (step <= 0) return startDateISO;
    switch (frequency) {
      case 'DAILY': return DateUtils.addDaysISO(startDateISO, step);
      case 'WEEKLY': return DateUtils.addDaysISO(startDateISO, step * 7);
      case 'BIWEEKLY': return DateUtils.addDaysISO(startDateISO, step * 14);
      case 'YEARLY': return DateUtils.addMonthsISO(startDateISO, step * 12);
      case 'MONTHLY':
      default: return DateUtils.addMonthsISO(startDateISO, step);
    }
  }

  /**
   * Advances a rule's nextOccurrence to the first anchored occurrence on or
   * after `todayISO` (used on resume so a paused rule doesn't dump a backlog
   * of overdue occurrences). On-grid by construction: display, skip, and
   * generation always agree. Pure — returns the date, never mutates.
   */
  public static rollForwardNextOccurrence(rec: RecurringTransaction, todayISO: string): string {
    const floor = rec.nextOccurrence && rec.nextOccurrence >= rec.startDate ? rec.nextOccurrence : rec.startDate;
    if (floor >= todayISO) return floor;
    return FutureFinanceEngine.firstAnchoredOnOrAfter(rec.startDate, rec.frequency, todayISO);
  }

  /**
   * Estimated anchor step at-or-before `targetISO` — conservative (one step
   * back), so callers always walk forward to the exact landing. Shared by
   * generation, floors, and display.
   */
  private static seekStep(startDateISO: string, frequency: string, targetISO: string): number {
    if (targetISO <= startDateISO) return 0;
    const gapDays = Math.max(0, DateUtils.daysBetween(startDateISO, targetISO));
    let jump = 0;
    if (frequency === 'DAILY') jump = gapDays;
    else if (frequency === 'WEEKLY') jump = Math.floor(gapDays / 7);
    else if (frequency === 'BIWEEKLY') jump = Math.floor(gapDays / 14);
    else if (frequency === 'YEARLY') jump = Math.floor(gapDays / 366);
    else jump = Math.floor(gapDays / 31); // MONTHLY + default
    return Math.max(0, jump - 1);
  }

  /**
   * Smallest anchored occurrence strictly AFTER `dateISO`.
   * Floors set from this stay on the anchor grid, so month-end rules never
   * drift (Jan 31 → Feb 28 → Mar 31) no matter how occurrences are consumed.
   */
  public static nextAnchoredAfter(startDateISO: string, frequency: string, dateISO: string): string {
    let step = FutureFinanceEngine.seekStep(startDateISO, frequency, dateISO);
    let occurrence = FutureFinanceEngine.occurrenceAt(startDateISO, frequency, step);
    let guard = 0;
    while (occurrence <= dateISO && guard < 3000) {
      step++;
      guard++;
      occurrence = FutureFinanceEngine.occurrenceAt(startDateISO, frequency, step);
    }
    return occurrence;
  }

  /**
   * Smallest anchored occurrence ON OR AFTER `dateISO` — a rule's true next
   * occurrence from a (possibly rescheduled, off-grid) floor. Used for
   * display and resume so the shown date is always a real occurrence.
   */
  public static firstAnchoredOnOrAfter(startDateISO: string, frequency: string, dateISO: string): string {
    let step = FutureFinanceEngine.seekStep(startDateISO, frequency, dateISO);
    let occurrence = FutureFinanceEngine.occurrenceAt(startDateISO, frequency, step);
    let guard = 0;
    while (occurrence < dateISO && guard < 3000) {
      step++;
      guard++;
      occurrence = FutureFinanceEngine.occurrenceAt(startDateISO, frequency, step);
    }
    return occurrence;
  }

  /**
   * Skip-one-occurrence floor: moves past the rule's first emitted
   * occurrence. Anchored, so skipping from an off-grid (rescheduled) floor
   * can never swallow a real occurrence the way chained +1-month math can.
   */
  public static skipFloor(rec: RecurringTransaction): string {
    const floor = rec.nextOccurrence && rec.nextOccurrence >= rec.startDate ? rec.nextOccurrence : rec.startDate;
    const first = FutureFinanceEngine.firstAnchoredOnOrAfter(rec.startDate, rec.frequency, floor);
    return FutureFinanceEngine.nextAnchoredAfter(rec.startDate, rec.frequency, first);
  }

  /**
   * Builds the single settlement transaction for a commitment being marked
   * paid/received. Direction-aware: OUTFLOW → EXPENSE, INFLOW → INCOME.
   * Pure (no ids, no timestamps) — the caller attaches identity and checks
   * idempotency (sourceCommitmentId) plus settleability before posting.
   */
  public static buildSettlementTransaction(
    c: MoneyCommitment,
    referenceDateISO: string,
    timeStr: string
  ): Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> {
    const isInflow = c.direction === 'INFLOW';
    return {
      userId: c.userId,
      type: isInflow ? 'INCOME' : 'EXPENSE',
      amount: c.amount,
      currency: c.currency,
      categoryId: c.categoryId || (isInflow ? 'cat-salary' : 'cat-bills'),
      accountId: c.accountId,
      merchant: c.title,
      note: isInflow ? `Income received: ${c.title}` : `Bill paid: ${c.title}`,
      date: referenceDateISO,
      time: timeStr,
      tags: [isInflow ? 'income-received' : 'bill-paid'],
      status: 'CONFIRMED',
      sourceCommitmentId: c.id,
    };
  }

  /**
   * Recomputes the derived status of a commitment.
   * Hard terminal states (COMPLETED, CANCELLED, AUTO_POSTED) are preserved.
   * A past-due non-terminal commitment becomes OVERDUE.
   */
  public static recomputeStatus(
    c: MoneyCommitment,
    todayISO: string
  ): MoneyCommitment {
    if (c.status === 'COMPLETED' || c.status === 'CANCELLED' || c.status === 'AUTO_POSTED') {
      return c;
    }
    if (c.dueDate < todayISO) {
      // Full ISO datetime, not the bare date: updatedAt feeds sync merge
      // ordering, and a date-only stamp would always lose to same-day edits.
      return { ...c, status: 'OVERDUE', updatedAt: new Date().toISOString() };
    }
    return c;
  }

  /**
   * Auto-posts due, non-terminal, auto-enabled commitments into real transactions.
   *
   * Idempotent: any commitment whose id already has a posted transaction
   * (matched by `sourceCommitmentId`) is skipped. Returns updated accounts,
   * transactions, and commitments. Safe to run repeatedly (e.g. on every load).
   *
   * @param commitments Resolved commitments (from resolveCommitments).
   * @param accounts    Current accounts.
   * @param transactions Current transactions.
   * @param referenceDateISO "today" — only commitments due on/before this date post.
   */
  /**
   * Auto-post catch-up window (days). Bills due within the last week settle
   * automatically; older bills surface as OVERDUE for explicit user action.
   * Moving money for stale bills without consent risks double-paying bills
   * the user already settled outside the app during the gap.
   */
  public static readonly AUTO_POST_CATCHUP_DAYS = 7;

  public static autoPostDueCommitments(
    commitments: MoneyCommitment[],
    accounts: Account[],
    transactions: Transaction[],
    referenceDateISO?: string,
    catchupDays: number = FutureFinanceEngine.AUTO_POST_CATCHUP_DAYS
  ): {
    accounts: Account[];
    transactions: Transaction[];
    commitments: MoneyCommitment[];
    postedCount: number;
  } {
    const todayISO = referenceDateISO || DateUtils.getTodayISO();
    const oldestAuto = DateUtils.addDaysISO(todayISO, -catchupDays);
    const postedIds = new Set(
      transactions.filter((t) => t.sourceCommitmentId).map((t) => t.sourceCommitmentId as string)
    );

    let nextAccounts = accounts;
    let nextTransactions = transactions;
    const postedCommitmentIds: string[] = [];
    let postedCount = 0;

    for (const c of commitments) {
      // Auto-post every due, enabled, unsettled commitment — OUTFLOW bills AND
      // INFLOW paydays (expected income due today is money in). The overdraft
      // guard below applies to OUTFLOW only.
      if (c.status === 'COMPLETED' || c.status === 'CANCELLED' || c.status === 'AUTO_POSTED') continue;
      if (c.dueDate > todayISO) continue; // not due yet
      if (c.dueDate < oldestAuto) continue; // stale — waits for the user's tap, never auto-moves money
      if (postedIds.has(c.id)) continue;  // already posted — idempotent skip

      const source = nextAccounts.find((a) => a.id === c.accountId);
      // Overdraft guard applies to OUTFLOW only — auto-posting income must never
      // be blocked by (or drive) the balance check. Skip, leaving it OVERDUE, if
      // the bill can't actually be paid.
      const isOutflow = c.direction !== 'INFLOW';
      if (!source || source.currency !== c.currency || (isOutflow && source.currentBalance - c.amount < 0)) {
        continue;
      }

      const tx: Transaction = {
        id: `tx-auto-${c.id}`,
        userId: c.userId,
        type: c.direction === 'INFLOW' ? 'INCOME' : 'EXPENSE',
        amount: c.amount,
        currency: c.currency,
        // Direction-aware fallback (mirrors buildSettlementTransaction): an
        // auto-posted payday must never land in an EXPENSE category.
        categoryId: c.categoryId || (c.direction === 'INFLOW' ? 'cat-salary' : 'cat-bills'),
        accountId: c.accountId,
        merchant: c.title,
        note: 'Auto-posted from commitment',
        date: c.dueDate,
        time: DateUtils.getCurrentTimeString(),
        tags: ['auto-posted'],
        status: 'CONFIRMED',
        sourceCommitmentId: c.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      nextAccounts = TransactionEngine.applyTransactionToAccounts(tx, nextAccounts);
      nextTransactions = [tx, ...nextTransactions];
      postedIds.add(c.id);
      postedCommitmentIds.push(c.id);
      postedCount++;
    }

    // Mark posted commitments as AUTO_POSTED (settled, but distinct from manual COMPLETED).
    const nextCommitments = commitments.map((c) =>
      postedCommitmentIds.includes(c.id) ? { ...c, status: 'AUTO_POSTED' as CommitmentStatus, updatedAt: new Date().toISOString() } : c
    );

    return { accounts: nextAccounts, transactions: nextTransactions, commitments: nextCommitments, postedCount };
  }

  /**
   * Converts a generated (recurring-derived) occurrence into a standalone
   * manual commitment — used when an occurrence outlives its rule's floor
   * (cancel-anywhere backlog, reopened bills after a payment is deleted).
   * The copy keeps every financial field but drops the rule link, so it
   * lives the full manual lifecycle (pay / reschedule / cancel / delete).
   * Auto-post is disabled on the copy: a rescued bill must never silently
   * re-post itself (that would make deleting a payment pointless).
   */
  public static materializeGenerated(
    c: MoneyCommitment,
    id: string,
    status: CommitmentStatus = 'PROJECTED',
    nowISO?: string
  ): MoneyCommitment {
    const now = nowISO || new Date().toISOString();
    return {
      ...c,
      id,
      relatedRecurringTransactionId: undefined,
      isAutoGenerated: false,
      autoPostEnabled: false,
      status,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * State slices a generated-occurrence lifecycle transition reads and writes.
   * Transitions are pure (state in, state out, null for no-op) so the app
   * stays a thin wrapper and every money path is unit-testable.
   */
  public static settleGeneratedOccurrence(
    slices: {
      recurring: RecurringTransaction[];
      commitments: MoneyCommitment[];
      transactions: Transaction[];
      accounts: Account[];
    },
    commitmentId: string,
    todayISO: string,
    timeStr: string,
    makeId: (prefix: string) => string,
    nowISO: string = new Date().toISOString()
  ): {
    recurring: RecurringTransaction[];
    commitments: MoneyCommitment[];
    transactions: Transaction[];
    accounts: Account[];
  } | null {
    const found = FutureFinanceEngine.findGenerated(slices, commitmentId, todayISO);
    if (!found) return null;
    const { gen, rule, resolved } = found;
    // Idempotent: a second tap finds the first tap's settlement and no-ops.
    if (slices.transactions.some((t) => t.sourceCommitmentId === commitmentId)) return null;
    const isInflow = gen.direction === 'INFLOW';
    const source = slices.accounts.find((a) => a.id === gen.accountId);
    const canSettle =
      source &&
      source.currency === gen.currency &&
      (isInflow || source.currentBalance - gen.amount >= 0);
    const floor = FutureFinanceEngine.nextAnchoredAfter(rule.startDate, rule.frequency, gen.dueDate);
    const posted = FutureFinanceEngine.postedCommitmentIds(slices.transactions);
    // Backlog preservation: outstanding earlier occurrences of the same rule
    // are rescued as manual bills — paying a later bill must never erase
    // earlier unpaid ones from projections.
    const rescued = FutureFinanceEngine.unresolvedBefore(resolved, rule.id, gen.id, floor, posted);
    let accounts = slices.accounts;
    let transactions = slices.transactions;
    if (canSettle && source) {
      const payTx: Transaction = {
        ...FutureFinanceEngine.buildSettlementTransaction(gen, todayISO, timeStr),
        id: makeId('tx'),
        createdAt: nowISO,
        updatedAt: nowISO,
      };
      accounts = TransactionEngine.applyTransactionToAccounts(payTx, slices.accounts);
      transactions = [payTx, ...slices.transactions];
    }
    const copies = rescued.map((c) => FutureFinanceEngine.materializeGenerated(c, makeId('comm'), 'PROJECTED', nowISO));
    if (!canSettle) {
      // Record-only, mirroring the manual path: marked paid with an
      // explanatory note, but no money moves.
      copies.push(
        FutureFinanceEngine.materializeGenerated(
          { ...gen, notes: 'Marked paid (no balance change — insufficient funds or currency mismatch).' },
          makeId('comm'),
          'COMPLETED',
          nowISO
        )
      );
    }
    return {
      accounts,
      transactions,
      commitments: [...slices.commitments, ...copies],
      recurring: slices.recurring.map((r) =>
        r.id === rule.id
          ? {
              ...r,
              nextOccurrence: r.nextOccurrence && r.nextOccurrence > floor ? r.nextOccurrence : floor,
              updatedAt: nowISO,
            }
          : r
      ),
    };
  }

  /**
   * Cancels a generated occurrence: the rule skips past it, and outstanding
   * earlier occurrences are rescued as manual bills so no obligation is lost.
   * Returns null when the occurrence is gone (rule deleted/paused mid-flight).
   */
  public static cancelGeneratedOccurrence(
    slices: {
      recurring: RecurringTransaction[];
      commitments: MoneyCommitment[];
      transactions: Transaction[];
    },
    commitmentId: string,
    todayISO: string,
    makeId: (prefix: string) => string,
    nowISO: string = new Date().toISOString()
  ): {
    recurring: RecurringTransaction[];
    commitments: MoneyCommitment[];
  } | null {
    const found = FutureFinanceEngine.findGenerated(slices, commitmentId, todayISO);
    if (!found) return null;
    const { gen, rule, resolved } = found;
    const floor = FutureFinanceEngine.nextAnchoredAfter(rule.startDate, rule.frequency, gen.dueDate);
    const posted = FutureFinanceEngine.postedCommitmentIds(slices.transactions);
    const rescued = FutureFinanceEngine.unresolvedBefore(resolved, rule.id, gen.id, floor, posted);
    return {
      commitments: [
        ...slices.commitments,
        ...rescued.map((c) => FutureFinanceEngine.materializeGenerated(c, makeId('comm'), 'PROJECTED', nowISO)),
      ],
      recurring: slices.recurring.map((r) =>
        r.id === rule.id
          ? {
              ...r,
              nextOccurrence: r.nextOccurrence && r.nextOccurrence > floor ? r.nextOccurrence : floor,
              updatedAt: nowISO,
            }
          : r
      ),
    };
  }

  /**
   * Reschedules a generated occurrence.
   * Forward (newDate >= due): the rule jumps to the new date; the occurrence
   * is consumed by the jump — the next bill IS the new date.
   * Backward: the occurrence truly MOVES — rescued as a manual bill on the new
   * date while the rule continues past the old one. Every other occurrence the
   * jump would hide is rescued as manual, never lost.
   */
  public static rescheduleGeneratedOccurrence(
    slices: {
      recurring: RecurringTransaction[];
      commitments: MoneyCommitment[];
      transactions: Transaction[];
    },
    commitmentId: string,
    newDueDate: string,
    todayISO: string,
    makeId: (prefix: string) => string,
    nowISO: string = new Date().toISOString()
  ): {
    recurring: RecurringTransaction[];
    commitments: MoneyCommitment[];
  } | null {
    const found = FutureFinanceEngine.findGenerated(slices, commitmentId, todayISO);
    if (!found) return null;
    const { gen, rule, resolved } = found;
    const movingBack = newDueDate < gen.dueDate;
    const floor = movingBack
      ? FutureFinanceEngine.nextAnchoredAfter(rule.startDate, rule.frequency, gen.dueDate)
      : newDueDate;
    const posted = FutureFinanceEngine.postedCommitmentIds(slices.transactions);
    const rescued = FutureFinanceEngine.unresolvedBefore(resolved, rule.id, gen.id, floor, posted);
    const copies = rescued.map((c) =>
      FutureFinanceEngine.materializeGenerated(c, makeId('comm'), 'PROJECTED', nowISO)
    );
    if (movingBack) {
      copies.push(
        FutureFinanceEngine.materializeGenerated({ ...gen, dueDate: newDueDate }, makeId('comm'), 'PROJECTED', nowISO)
      );
    }
    return {
      commitments: [...slices.commitments, ...copies],
      recurring: slices.recurring.map((r) =>
        r.id === rule.id ? { ...r, nextOccurrence: floor, updatedAt: nowISO } : r
      ),
    };
  }

  /**
   * Reopens the bill behind a deleted payment transaction. Manual bills flip
   * back to PROJECTED (clearing the record-only note); generated occurrences
   * — whose rule floor already moved on — are rebuilt from the payment itself
   * as manual bills. Terminal (CANCELLED) bills stay untouched.
   */
  public static reopenBillForDeletedPayment(
    commitments: MoneyCommitment[],
    tx: Transaction,
    makeId: (prefix: string) => string,
    nowISO: string = new Date().toISOString()
  ): MoneyCommitment[] {
    const linkedId = tx.sourceCommitmentId;
    if (!linkedId) return commitments;
    const manual = commitments.find((c) => c.id === linkedId);
    if (manual && (manual.status === 'COMPLETED' || manual.status === 'AUTO_POSTED')) {
      return commitments.map((c) =>
        c.id === linkedId
          ? {
              ...c,
              status: 'PROJECTED' as CommitmentStatus,
              notes: c.notes?.startsWith('Marked paid (no balance change') ? undefined : c.notes,
              updatedAt: nowISO,
            }
          : c
      );
    }
    if (!manual) {
      const isInflow = tx.type === 'INCOME';
      const rescued: MoneyCommitment = {
        id: makeId('comm'),
        userId: tx.userId,
        title: tx.merchant || (isInflow ? 'Expected income' : 'Bill'),
        type: isInflow ? 'EXPECTED_INCOME' : 'BILL',
        amount: tx.amount,
        currency: tx.currency,
        direction: isInflow ? 'INFLOW' : 'OUTFLOW',
        status: 'PROJECTED',
        dueDate: tx.date,
        accountId: tx.accountId,
        categoryId: tx.categoryId,
        priority: 'ESSENTIAL',
        autoPostEnabled: false,
        createdAt: nowISO,
        updatedAt: nowISO,
      };
      return [...commitments, rescued];
    }
    return commitments;
  }

  /** Locates a live generated occurrence plus its rule (null when gone). */
  private static findGenerated(
    slices: {
      recurring: RecurringTransaction[];
      commitments: MoneyCommitment[];
      transactions: Transaction[];
    },
    commitmentId: string,
    todayISO: string
  ): { gen: MoneyCommitment; rule: RecurringTransaction; resolved: MoneyCommitment[] } | null {
    const resolved = FutureFinanceEngine.resolveCommitments(
      slices.recurring,
      slices.commitments,
      slices.transactions,
      todayISO,
      DateUtils.addDaysISO(todayISO, 30),
      todayISO
    );
    const gen = resolved.find((c) => c.id === commitmentId && c.relatedRecurringTransactionId);
    const rule = gen?.relatedRecurringTransactionId
      ? slices.recurring.find((r) => r.id === gen.relatedRecurringTransactionId)
      : undefined;
    return gen && rule ? { gen, rule, resolved } : null;
  }

  /** Commitment ids that already have a posted settlement transaction. */
  private static postedCommitmentIds(transactions: Transaction[]): Set<string> {
    return new Set(
      transactions.filter((t) => t.sourceCommitmentId).map((t) => t.sourceCommitmentId as string)
    );
  }

  /**
   * Outstanding (non-terminal, unsettled) occurrences of one rule due before
   * `cutoffISO`, excluding one id — the backlog a floor jump would hide.
   */
  private static unresolvedBefore(
    resolved: MoneyCommitment[],
    ruleId: string,
    excludeId: string,
    cutoffISO: string,
    posted: Set<string>
  ): MoneyCommitment[] {
    return resolved.filter(
      (c) =>
        c.relatedRecurringTransactionId === ruleId &&
        c.id !== excludeId &&
        c.status !== 'COMPLETED' &&
        c.status !== 'CANCELLED' &&
        c.status !== 'AUTO_POSTED' &&
        c.dueDate < cutoffISO &&
        !posted.has(c.id)
    );
  }

  /**
   * Public accessor for one recurrence step. Used by the app to roll a rule's
   * nextOccurrence forward after its occurrence was auto-posted, keeping the
   * recurring -> commitment -> transaction lifecycle coherent.
   */
  public static advanceOccurrence(dateISO: string, frequency: string): string {
    return FutureFinanceEngine.advance(dateISO, frequency);
  }

  private static advance(dateISO: string, frequency: string): string {
    switch (frequency) {
      case 'DAILY': return DateUtils.addDaysISO(dateISO, 1);
      case 'WEEKLY': return DateUtils.addDaysISO(dateISO, 7);
      case 'BIWEEKLY': return DateUtils.addDaysISO(dateISO, 14);
      case 'MONTHLY': return DateUtils.addMonthsISO(dateISO, 1);
      case 'YEARLY': return DateUtils.addMonthsISO(dateISO, 12);
      default: return DateUtils.addMonthsISO(dateISO, 1);
    }
  }
}
