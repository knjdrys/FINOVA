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
    _transactions: Transaction[],
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

    // 2. Merge manual + generated, de-duplicating by id. Manual wins on collision.
    const byId = new Map<string, MoneyCommitment>();
    for (const c of manualCommitments) byId.set(c.id, c);
    for (const c of generated) {
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

      let step = 0;
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
        if (occurrence >= horizonStartISO) {
          out.push({
            id: `comm-rec-${rec.id}-${occurrence}`,
            userId: rec.userId,
            title: rec.title,
            type,
            amount: rec.amount,
            currency,
            direction,
            status: occurrence < horizonStartISO ? 'PROJECTED' : 'PROJECTED',
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
   * Advances a rule's nextOccurrence forward until it reaches `todayISO`
   * (used on resume so a paused rule doesn't dump a backlog of overdue
   * occurrences). Pure — returns the date, never mutates.
   */
  public static rollForwardNextOccurrence(rec: RecurringTransaction, todayISO: string): string {
    let next = rec.nextOccurrence && rec.nextOccurrence >= rec.startDate ? rec.nextOccurrence : rec.startDate;
    let guard = 0;
    while (next < todayISO && guard < 2000) {
      next = FutureFinanceEngine.advanceOccurrence(next, rec.frequency);
      guard++;
    }
    return next;
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
      return { ...c, status: 'OVERDUE', updatedAt: todayISO };
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
  public static autoPostDueCommitments(
    commitments: MoneyCommitment[],
    accounts: Account[],
    transactions: Transaction[],
    referenceDateISO?: string
  ): {
    accounts: Account[];
    transactions: Transaction[];
    commitments: MoneyCommitment[];
    postedCount: number;
  } {
    const todayISO = referenceDateISO || DateUtils.getTodayISO();
    const postedIds = new Set(
      transactions.filter((t) => t.sourceCommitmentId).map((t) => t.sourceCommitmentId as string)
    );

    let nextAccounts = accounts;
    let nextTransactions = transactions;
    const postedCommitmentIds: string[] = [];
    let postedCount = 0;

    for (const c of commitments) {
      // Only auto-post OUTFLOW bills that are due and enabled and not yet settled.
      if (c.status === 'COMPLETED' || c.status === 'CANCELLED' || c.status === 'AUTO_POSTED') continue;
      if (c.dueDate > todayISO) continue; // not due yet
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
        categoryId: c.categoryId || 'cat-bills',
        accountId: c.accountId,
        merchant: c.title,
        note: 'Auto-posted from commitment',
        date: c.dueDate,
        time: DateUtils.getCurrentTimeString(),
        tags: ['auto-posted'],
        status: 'CONFIRMED',
        sourceCommitmentId: c.id,
        createdAt: todayISO,
        updatedAt: todayISO,
      };

      nextAccounts = TransactionEngine.applyTransactionToAccounts(tx, nextAccounts);
      nextTransactions = [tx, ...nextTransactions];
      postedIds.add(c.id);
      postedCommitmentIds.push(c.id);
      postedCount++;
    }

    // Mark posted commitments as AUTO_POSTED (settled, but distinct from manual COMPLETED).
    const nextCommitments = commitments.map((c) =>
      postedCommitmentIds.includes(c.id) ? { ...c, status: 'AUTO_POSTED' as CommitmentStatus, updatedAt: todayISO } : c
    );

    return { accounts: nextAccounts, transactions: nextTransactions, commitments: nextCommitments, postedCount };
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
