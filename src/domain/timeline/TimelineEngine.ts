import { Account, Category, MoneyCommitment, TimelineDay, TimelineDayEvent, Transaction } from '../../types';
import { DateUtils } from '../date/DateUtils';

export class TimelineEngine {
  /**
   * Constructs the Financial Timeline by interleaving settled transactions and future commitments
   * with running projected balances for each day.
   */
  public static generateTimeline(
    accounts: Account[],
    transactions: Transaction[],
    commitments: MoneyCommitment[],
    categories: Category[],
    startDateISO: string,
    endDateISO: string,
    referenceDateISO?: string
  ): TimelineDay[] {
    const todayISO = referenceDateISO || DateUtils.getTodayISO();
    const categoryMap = new Map<string, Category>(categories.map((c) => [c.id, c]));
    const accountMap = new Map<string, Account>(accounts.map((a) => [a.id, a]));

    // Start with liquid balance as of today — ISOLATED to the active currency.
    // The projected running balance must never mix currencies.
    const currency = accounts[0]?.currency || 'PHP';
    const liquidAccounts = accounts.filter((a) => a.includeInTotalBalance && !a.isArchived && a.currency === currency);
    const currentLiquidBalance = liquidAccounts.reduce((sum, a) => sum + a.currentBalance, 0);

    // Group events by date
    const dayEventsMap = new Map<string, TimelineDayEvent[]>();

    // Add confirmed transactions
    for (const tx of transactions) {
      if (!DateUtils.isDateInRange(tx.date, startDateISO, endDateISO)) continue;
      if (tx.status === 'PENDING') continue;
      if (tx.currency && tx.currency !== currency) continue; // never mix currencies

      const cat = categoryMap.get(tx.categoryId);
      const acc = accountMap.get(tx.accountId);

      const event: TimelineDayEvent = {
        id: tx.id,
        type: 'TRANSACTION',
        title: tx.merchant || cat?.name || 'Transaction',
        amount: tx.amount,
        direction: tx.type === 'INCOME' ? 'INFLOW' : 'OUTFLOW',
        status: 'ACTUAL',
        categoryId: tx.categoryId,
        accountId: tx.accountId,
        accountName: acc?.name,
        categoryName: cat?.name,
        categoryIcon: cat?.icon,
        categoryColor: cat?.color,
      };

      const list = dayEventsMap.get(tx.date) || [];
      list.push(event);
      dayEventsMap.set(tx.date, list);
    }

    // Add future commitments (from today onward)
    for (const comm of commitments) {
      if (!DateUtils.isDateInRange(comm.dueDate, startDateISO, endDateISO)) continue;
      if (comm.status === 'COMPLETED' || comm.status === 'CANCELLED') continue;
      if (comm.currency && comm.currency !== currency) continue; // never mix currencies

      const cat = categoryMap.get(comm.categoryId);
      const acc = accountMap.get(comm.accountId);

      const isOverdue = comm.dueDate < todayISO;
      const eventStatus = isOverdue ? 'OVERDUE' : (comm.status === 'CONFIRMED' ? 'SCHEDULED' : 'PROJECTED');

      const event: TimelineDayEvent = {
        id: comm.id,
        type: 'COMMITMENT',
        title: comm.title,
        amount: comm.amount,
        direction: comm.direction,
        status: eventStatus,
        categoryId: comm.categoryId,
        accountId: comm.accountId,
        accountName: acc?.name,
        categoryName: cat?.name,
        categoryIcon: cat?.icon,
        categoryColor: cat?.color,
      };

      const list = dayEventsMap.get(comm.dueDate) || [];
      list.push(event);
      dayEventsMap.set(comm.dueDate, list);
    }

    // Generate daily chronological timeline array
    const timelineDays: TimelineDay[] = [];
    let currentDate = startDateISO;
    let runningProjectedBalance = currentLiquidBalance;

    // Fast-calculate initial balance if startDate is before today
    // For projection from today onward:
    while (currentDate <= endDateISO) {
      const events = dayEventsMap.get(currentDate) || [];
      let totalInflow = 0;
      let totalOutflow = 0;

      for (const ev of events) {
        if (ev.direction === 'INFLOW') {
          totalInflow += ev.amount;
        } else {
          totalOutflow += ev.amount;
        }
      }

      const netAmount = totalInflow - totalOutflow;

      // Only alter running balance for dates >= today (future projection)
      if (currentDate >= todayISO) {
        // Only apply commitments / projected movements into future running balance
        const futureInflows = events.filter((e) => e.status !== 'ACTUAL' && e.direction === 'INFLOW').reduce((s, e) => s + e.amount, 0);
        const futureOutflows = events.filter((e) => e.status !== 'ACTUAL' && e.direction === 'OUTFLOW').reduce((s, e) => s + e.amount, 0);
        runningProjectedBalance += (futureInflows - futureOutflows);
      }

      const isToday = currentDate === todayISO;
      const isPast = currentDate < todayISO;

      timelineDays.push({
        date: currentDate,
        dayLabel: DateUtils.formatDisplayDate(currentDate, { includeDay: true, fullYear: true }),
        isToday,
        isPast,
        events,
        totalInflow,
        totalOutflow,
        netAmount,
        projectedEndOfDayBalance: runningProjectedBalance,
      });

      currentDate = DateUtils.addDaysISO(currentDate, 1);
    }

    return timelineDays;
  }
}
