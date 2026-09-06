import {
  CashFlowRisk,
  MoneyCommitment,
  Notification,
  NotificationKind,
  NotificationMeta,
  NotificationPreferences,
  NotificationSeverity,
  RecurringTransaction,
  SavingsGoal,
  Budget,
  Transaction,
} from '../../types';
import { DateUtils } from '../date/DateUtils';
import { MoneyValue } from '../money/MoneyValue';
import { BudgetEngine } from '../budget/BudgetEngine';
import { GoalEngine } from '../goal/GoalEngine';
import { t } from '../../i18n/core';

/**
 * NotificationEngine
 * ------------------
 * Derives the user-facing notification feed from the resolved future-finance state.
 *
 * Notifications are NOT stored as raw user data — they are a VIEW computed from
 *   - overdue / due-soon commitments (bills)
 *   - recurring payments approaching their next occurrence
 *   - commitments auto-posted into real transactions
 *   - budget risk (near limit / at risk / over)
 *   - savings-goal pace risk
 *   - projected cash-flow deficits (from RiskEngine)
 *
 * Anti-spam design:
 *   - Deterministic ids (`ntf-<kind>-<ref>[-<state>]`) make dedup inherent:
 *     the same condition never produces two rows, and mark-as-read is
 *     idempotent (reading records the id in `readIds`; re-deriving never
 *     resurrects it).
 *   - User preferences (NotificationPreferences) gate whole categories.
 *   - The feed is capped; OS dispatch (planOsNotifications) is stricter:
 *     HIGH/MEDIUM only, per-id cooldown, max 3 + a single summary.
 *
 * Priority (1 = act now … 4 = FYI) is derived from severity + kind + urgency
 * and drives feed ordering — not raw severity alone.
 */

export interface NotificationFeedInput {
  commitments: MoneyCommitment[];
  risks: CashFlowRisk[];
  autoPostedTransactions: Transaction[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: SavingsGoal[];
  recurring: RecurringTransaction[];
  readIds?: string[];
  prefs: NotificationPreferences;
  referenceDateISO?: string;
}

export interface OsDispatchPlan {
  /** Individual notifications to surface as OS notifications now. */
  toSend: Notification[];
  /** Count of additional qualifying items collapsed into the summary (0 = no summary). */
  collapsedCount: number;
}

/** Max rows the in-app feed ever shows (Home renders the top 5). */
export const FEED_CAP = 12;
/** Max individual OS notifications per dispatch; extras collapse to one summary. */
export const OS_DISPATCH_CAP = 3;

const SEV_RANK: Record<NotificationSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, INFO: 3 };

export class NotificationEngine {
  public static generateNotifications(input: NotificationFeedInput): Notification[] {
    const {
      commitments,
      risks,
      autoPostedTransactions,
      transactions,
      budgets,
      goals,
      recurring,
      readIds = [],
      prefs,
      referenceDateISO,
    } = input;

    const todayISO = referenceDateISO || DateUtils.getTodayISO();
    const read = new Set(readIds);
    const out: Notification[] = [];

    // Master switch: everything is derived, so disabled = empty feed.
    if (!prefs.enabled) return [];

    const leadDays = Math.max(0, prefs.billLeadDays);

    const push = (n: Omit<Notification, 'isRead' | 'priority'> & { priority?: number }) => {
      out.push({
        ...n,
        isRead: read.has(n.id), // acknowledged items stay in the feed (dimmed), never OS-dispatched
        priority: n.priority ?? NotificationEngine.derivePriority(n),
      });
    };

    // 1. Bills: overdue + due-soon commitments.
    if (prefs.bills) {
      for (const c of commitments) {
        if (c.status === 'OVERDUE') {
          push({
            id: `ntf-overdue-${c.id}`,
            kind: 'OVERDUE_COMMITMENT',
            severity: 'HIGH',
            title: t('notif.overdueTitle', { title: c.title }),
            body: t('notif.overdueBody', {
              amount: MoneyValue.fromMinorUnits(c.amount, c.currency).format(),
              date: DateUtils.formatDisplayDate(c.dueDate),
            }),
            relatedCommitmentId: c.id,
            createdAt: todayISO,
          });
        } else if (c.status !== 'COMPLETED' && c.status !== 'CANCELLED' && c.status !== 'AUTO_POSTED') {
          const days = DateUtils.daysBetween(todayISO, c.dueDate);
          if (days >= 0 && days <= leadDays) {
            // Essential bills due within 3 days are act-soon, not FYI.
            const essentialSoon = c.priority === 'ESSENTIAL' && days <= 3;
            push({
              id: `ntf-due-${c.id}`,
              kind: 'UPCOMING_COMMITMENT',
              severity: days === 0 || essentialSoon ? 'MEDIUM' : 'LOW',
              title:
                days === 0
                  ? t('notif.dueTodayTitle', { title: c.title })
                  : t('notif.dueInTitle', { count: days, days, title: c.title }),
              body: t('notif.dueBody', {
                amount: MoneyValue.fromMinorUnits(c.amount, c.currency).format(),
                date: DateUtils.formatDisplayDate(c.dueDate),
              }),
              relatedCommitmentId: c.id,
              createdAt: todayISO,
            });
          }
        }
      }
    }

    // 2. Recurring payments approaching next occurrence.
    //    Dedup vs bills: if a commitment was already generated from this
    //    recurring rule and is due within the same window, the bill row
    //    covers it — skip the recurring row.
    if (prefs.recurring) {
      for (const r of recurring) {
        if (!r.isActive || !r.reminderEnabled) continue;
        const days = DateUtils.daysBetween(todayISO, r.nextOccurrence);
        if (days < 0 || days > leadDays) continue;
        const covered = commitments.some(
          (c) =>
            c.relatedRecurringTransactionId === r.id &&
            c.status !== 'COMPLETED' &&
            c.status !== 'CANCELLED' &&
            c.status !== 'AUTO_POSTED' &&
            DateUtils.daysBetween(todayISO, c.dueDate) <= leadDays
        );
        if (covered) continue;
        push({
          id: `ntf-recurring-${r.id}-${r.nextOccurrence}`,
          kind: 'RECURRING_UPCOMING',
          severity: days === 0 ? 'MEDIUM' : 'LOW',
          title:
            days === 0
              ? t('notif.recurringTodayTitle', { title: r.title })
              : t('notif.recurringInTitle', { count: days, days, title: r.title }),
          body: t('notif.recurringBody', {
            amount: MoneyValue.fromMinorUnits(r.amount, r.currency || 'PHP').format(),
            date: DateUtils.formatDisplayDate(r.nextOccurrence),
          }),
          createdAt: todayISO,
        });
      }
    }

    // 3. Auto-posted commitments (informational confirmation of a bill paid).
    if (prefs.bills) {
      for (const postedTx of autoPostedTransactions) {
        if (postedTx.sourceCommitmentId) {
          const c = commitments.find((x) => x.id === postedTx.sourceCommitmentId);
          push({
            id: `ntf-autopost-${postedTx.id}`,
            kind: 'AUTO_POSTED',
            severity: 'INFO',
            title: t('notif.autoPaidTitle', { title: postedTx.merchant || c?.title || t('plans.bills') }),
            body: t('notif.autoPaidBody', {
              amount: MoneyValue.fromMinorUnits(postedTx.amount, postedTx.currency).format(),
            }),
            relatedCommitmentId: postedTx.sourceCommitmentId,
            relatedTransactionId: postedTx.id,
            createdAt: todayISO,
          });
        }
      }
    }

    // 4. Budget risk — current-period active budgets only.
    //    State is part of the id: escalation (NEAR → OVER) is a new alert;
    //    de-escalation simply drops the old row instead of nagging.
    if (prefs.budgetRisk) {
      for (const b of budgets) {
        if (!b.isActive) continue;
        const insight = BudgetEngine.getBudgetInsight(b, transactions, todayISO);
        if (!insight.isCurrent) continue; // only the active window alerts
        let state: 'OVER' | 'AT_RISK' | 'NEAR' | null = null;
        if (insight.isOverBudget) state = 'OVER';
        else if (insight.isAtRisk) state = 'AT_RISK';
        else if (insight.isNearLimit) state = 'NEAR';
        if (!state) continue;
        const currency = b.currency || 'PHP';
        push({
          id: `ntf-budget-${b.id}-${state}`,
          kind: 'BUDGET_ALERT',
          severity: state === 'OVER' ? 'HIGH' : state === 'AT_RISK' ? 'MEDIUM' : 'LOW',
          title:
            state === 'OVER'
              ? t('notif.budgetOverTitle', { name: b.name })
              : state === 'AT_RISK'
                ? t('notif.budgetAtRiskTitle', { name: b.name })
                : t('notif.budgetNearTitle', { name: b.name }),
          body:
            state === 'OVER'
              ? t('notif.budgetOverBody', {
                  amount: MoneyValue.fromMinorUnits(insight.forecast.actualSpent - insight.forecast.budgetAmount, currency).format(),
                  spent: MoneyValue.fromMinorUnits(insight.forecast.actualSpent, currency).format(),
                  limit: MoneyValue.fromMinorUnits(insight.forecast.budgetAmount, currency).format(),
                })
              : state === 'AT_RISK'
                ? t('notif.budgetAtRiskBody', {
                    amount: MoneyValue.fromMinorUnits(insight.projectedOverspend, currency).format(),
                    days: insight.daysLeft,
                  })
                : t('notif.budgetNearBody', {
                    percent: Math.round(insight.forecast.percentageUsed),
                    remaining: MoneyValue.fromMinorUnits(insight.forecast.remainingAmount, currency).format(),
                  }),
          relatedBudgetId: b.id,
          createdAt: todayISO,
        });
      }
    }

    // 5. Goal pace risk. A goal created today gets a one-day grace period: flagging
    // a goal "at risk" minutes after the user set it up is noise, not signal.
    if (prefs.goalRisk) {
      for (const g of goals) {
        if (g.isArchived || g.status === 'COMPLETED') continue;
        if (g.createdAt && g.createdAt >= todayISO) continue;
        const insight = GoalEngine.getGoalInsight(g, todayISO);
        if (insight.risk === 'NONE') continue;
        const severity: NotificationSeverity = insight.risk === 'HIGH' ? 'MEDIUM' : 'LOW';
        const state = insight.progress.status;
        push({
          id: `ntf-goal-${g.id}-${state}`,
          kind: 'GOAL_ALERT',
          severity,
          title:
            state === 'AT_RISK'
              ? t('notif.goalAtRiskTitle', { name: g.name })
              : t('notif.goalBehindTitle', { name: g.name }),
          body: t('notif.goalBody', {
            current: MoneyValue.fromMinorUnits(g.currentAmount, g.currency || 'PHP').format(),
            target: MoneyValue.fromMinorUnits(g.targetAmount, g.currency || 'PHP').format(),
            date: DateUtils.formatDisplayDate(g.targetDate),
          }),
          relatedGoalId: g.id,
          createdAt: todayISO,
        });
      }
    }

    // 6. Projected cash-flow risks (already localized by RiskEngine).
    if (prefs.cashFlowRisk) {
      for (const r of risks) {
        push({
          id: `ntf-risk-${r.id}`,
          kind: 'CASHFLOW_RISK',
          severity: (r.severity === 'CRITICAL' ? 'HIGH' : r.severity === 'HIGH' ? 'MEDIUM' : 'LOW') as NotificationSeverity,
          title: r.title,
          body: r.description,
          createdAt: todayISO,
        });
      }
    }

    // Sort: unread first, then priority, then severity. Cap the feed.
    out.sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return SEV_RANK[a.severity] - SEV_RANK[b.severity];
    });
    return out.slice(0, FEED_CAP);
  }

  /**
   * Plan OS-level dispatch from the current feed. Pure — the caller owns
   * meta persistence and the permission check (see browserNotify).
   *
   * Spam gates:
   *  - HIGH/MEDIUM only (LOW/INFO never leave the app).
   *  - Per-id cooldown: an id already OS-sent within cooldownHours is skipped.
   *  - Cap: at most OS_DISPATCH_CAP individual notifications; anything beyond
   *    collapses into ONE summary notification, so reconnecting after a week
   *    offline yields ≤ 4 toasts, not 40.
   */
  public static planOsNotifications(
    notifications: Notification[],
    prefs: NotificationPreferences,
    meta: Record<string, NotificationMeta>,
    nowMs: number = Date.now()
  ): OsDispatchPlan {
    if (!prefs.enabled || !prefs.osNotifications) return { toSend: [], collapsedCount: 0 };
    const cooldownMs = Math.max(0, prefs.cooldownHours) * 60 * 60 * 1000;

    const eligible = notifications.filter((n) => {
      if (n.isRead) return false; // acknowledged in-app — don't page for it
      if (n.severity !== 'HIGH' && n.severity !== 'MEDIUM') return false;
      const last = meta[n.id]?.lastOsSentAt;
      if (last) {
        const sentAt = Date.parse(last);
        if (!Number.isNaN(sentAt) && nowMs - sentAt < cooldownMs) return false;
      }
      return true;
    });

    const toSend = eligible.slice(0, OS_DISPATCH_CAP);
    const collapsedCount = eligible.length - toSend.length;
    return { toSend, collapsedCount };
  }

  /** Feed priority 1..4 from severity + kind + urgency context. */
  private static derivePriority(n: {
    severity: NotificationSeverity;
    kind: NotificationKind;
  }): number {
    switch (n.kind) {
      case 'OVERDUE_COMMITMENT':
        return 1;
      case 'CASHFLOW_RISK':
        return n.severity === 'HIGH' ? 1 : 2;
      case 'BUDGET_ALERT':
        return n.severity === 'HIGH' ? 1 : n.severity === 'MEDIUM' ? 2 : 3;
      case 'UPCOMING_COMMITMENT':
        return n.severity === 'MEDIUM' ? 2 : 3;
      case 'GOAL_ALERT':
        return n.severity === 'MEDIUM' ? 2 : 3;
      case 'RECURRING_UPCOMING':
        return n.severity === 'MEDIUM' ? 2 : 3;
      case 'AUTO_POSTED':
        return 4;
      default:
        return SEV_RANK[n.severity] + 1;
    }
  }

  public static markAsRead(notifications: Notification[], id: string): Notification[] {
    return notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n));
  }

  public static unreadCount(notifications: Notification[]): number {
    return notifications.filter((n) => !n.isRead).length;
  }
}
