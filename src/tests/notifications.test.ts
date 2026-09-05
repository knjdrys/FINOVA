/**
 * Notification system tests — events, priority, dedupe, cooldown,
 * preferences, caps, and the OS dispatch planner.
 * Pure domain logic; no DOM required (prefs service uses injected storage).
 */
import { describe, it, expect } from 'vitest';
import { NotificationEngine, type NotificationFeedInput } from '../domain/notification/NotificationEngine';
import { NotificationPrefsService, DEFAULT_NOTIFICATION_PREFS } from '../services/notification/NotificationPrefsService';
import type {
  Notification,
  NotificationPreferences,
  MoneyCommitment,
  RecurringTransaction,
  Budget,
  SavingsGoal,
  Transaction,
  CashFlowRisk,
} from '../types';

const TODAY = '2026-09-15';

const prefs = (over: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  ...DEFAULT_NOTIFICATION_PREFS,
  ...over,
});

const commitment = (over: Partial<MoneyCommitment> = {}): MoneyCommitment => ({
  id: 'c1',
  userId: 'u1',
  title: 'Electric bill',
  type: 'BILL',
  direction: 'OUTFLOW',
  amount: 250000, // ₱2,500
  currency: 'PHP',
  dueDate: '2026-09-16',
  status: 'PENDING',
  accountId: 'a1',
  categoryId: 'cat-bills',
  priority: 'ESSENTIAL',
  source: 'MANUAL',
  isRecurring: false,
  createdAt: TODAY,
  updatedAt: TODAY,
  ...over,
} as MoneyCommitment);

const recurring = (over: Partial<RecurringTransaction> = {}): RecurringTransaction => ({
  id: 'r1',
  userId: 'u1',
  title: 'Gym membership',
  amount: 150000,
  currency: 'PHP',
  frequency: 'MONTHLY',
  nextOccurrence: '2026-09-16',
  isActive: true,
  reminderEnabled: true,
  createdAt: TODAY,
  updatedAt: TODAY,
  ...over,
} as RecurringTransaction);

const budget = (over: Partial<Budget> = {}): Budget => ({
  id: 'b1',
  userId: 'u1',
  name: 'Food',
  amount: 500000,
  currency: 'PHP',
  period: 'MONTHLY',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  categoryIds: [], // whole-transaction budget
  notifyThresholdPercentage: 80,
  isActive: true,
  createdAt: TODAY,
  updatedAt: TODAY,
  ...over,
} as Budget);

const goal = (over: Partial<SavingsGoal> = {}): SavingsGoal => ({
  id: 'g1',
  userId: 'u1',
  name: 'Emergency fund',
  targetAmount: 5000000,
  currentAmount: 1000000,
  targetDate: '2026-12-31',
  status: 'AT_RISK',
  priority: 'MEDIUM',
  currency: 'PHP',
  icon: 'PiggyBank',
  color: '#059669',
  isArchived: false,
  createdAt: '2026-06-01',
  updatedAt: TODAY,
  ...over,
} as SavingsGoal);

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  userId: 'u1',
  accountId: 'a1',
  categoryId: 'cat-food',
  type: 'EXPENSE',
  amount: 480000,
  currency: 'PHP',
  date: '2026-09-10',
  merchant: 'Supermarket',
  tags: [],
  status: 'CONFIRMED',
  createdAt: TODAY,
  updatedAt: TODAY,
  ...over,
} as Transaction);

const risk = (over: Partial<CashFlowRisk> = {}): CashFlowRisk => ({
  id: 'risk-1',
  severity: 'CRITICAL',
  date: '2026-09-20',
  title: 'Projected Overdraft',
  description: 'Balance hits ₱-500 on Sep 20.',
  projectedBalance: -50000,
  minimumReserve: 0,
  primaryCause: 'Bills cluster before payday',
  recommendedAction: 'Shift discretionary spending',
  ...over,
} as CashFlowRisk);

const feed = (over: Partial<NotificationFeedInput> = {}): Notification[] =>
  NotificationEngine.generateNotifications({
    commitments: [],
    risks: [],
    autoPostedTransactions: [],
    transactions: [],
    budgets: [],
    goals: [],
    recurring: [],
    readIds: [],
    prefs: prefs(),
    referenceDateISO: TODAY,
    ...over,
  });

describe('NotificationEngine — events', () => {
  it('overdue commitment produces a HIGH priority-1 alert', () => {
    const out = feed({ commitments: [commitment({ status: 'OVERDUE' })] });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('OVERDUE_COMMITMENT');
    expect(out[0].severity).toBe('HIGH');
    expect(out[0].priority).toBe(1);
    expect(out[0].id).toBe('ntf-overdue-c1');
  });

  it('due-soon commitment inside lead window alerts; outside does not', () => {
    const inside = feed({ commitments: [commitment({ dueDate: '2026-09-17' })] }); // 2 days, default lead 2
    expect(inside).toHaveLength(1);
    expect(inside[0].kind).toBe('UPCOMING_COMMITMENT');
    const outside = feed({ commitments: [commitment({ dueDate: '2026-09-25' })] });
    expect(outside).toHaveLength(0);
  });

  it('billLeadDays preference widens the upcoming window', () => {
    const out = feed({
      commitments: [commitment({ dueDate: '2026-09-22' })],
      prefs: prefs({ billLeadDays: 7 }),
    });
    expect(out).toHaveLength(1);
  });

  it('essential bills due within 3 days are boosted to MEDIUM; optional stay LOW', () => {
    // Widened lead window so the 3-day boundary is inside the alert range.
    const wide = prefs({ billLeadDays: 7 });
    const essential = feed({
      commitments: [commitment({ dueDate: '2026-09-18', priority: 'ESSENTIAL' })], // 3 days
      prefs: wide,
    });
    expect(essential[0].severity).toBe('MEDIUM');
    const optional = feed({
      commitments: [commitment({ dueDate: '2026-09-18', priority: 'OPTIONAL' })],
      prefs: wide,
    });
    expect(optional[0].severity).toBe('LOW');
    const farEssential = feed({
      commitments: [commitment({ dueDate: '2026-09-20', priority: 'ESSENTIAL' })], // 5 days
      prefs: wide,
    });
    expect(farEssential[0].severity).toBe('LOW');
    // With the default 2-day lead window, an essential bill 3 days out is
    // simply not surfaced yet — the boost never invents rows.
    expect(feed({ commitments: [commitment({ dueDate: '2026-09-18', priority: 'ESSENTIAL' })] })).toHaveLength(0);
  });

  it('recurring payment alerts when due soon and not covered by a commitment', () => {
    const out = feed({ recurring: [recurring()] });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('RECURRING_UPCOMING');
    expect(out[0].id).toBe('ntf-recurring-r1-2026-09-16');
  });

  it('recurring alert is deduped when a commitment covers the same payment', () => {
    const out = feed({
      recurring: [recurring()],
      commitments: [commitment({ dueDate: '2026-09-16', relatedRecurringTransactionId: 'r1' })],
    });
    // Only the bill row survives — no double alert for one payment.
    expect(out.map((n) => n.kind)).toEqual(['UPCOMING_COMMITMENT']);
  });

  it('disabled reminder on a recurring rule stays silent', () => {
    expect(feed({ recurring: [recurring({ reminderEnabled: false })] })).toHaveLength(0);
  });

  it('over-budget current-period budget alerts HIGH; future window stays silent', () => {
    const spent = [tx({ amount: 600000 })]; // ₱6,000 vs ₱5,000 budget
    const out = feed({ budgets: [budget()], transactions: spent });
    expect(out.some((n) => n.kind === 'BUDGET_ALERT' && n.severity === 'HIGH')).toBe(true);
    const future = feed({
      budgets: [budget({ startDate: '2026-10-01' })],
      transactions: spent,
    });
    expect(future.filter((n) => n.kind === 'BUDGET_ALERT')).toHaveLength(0);
  });

  it('budget escalation (AT_RISK -> OVER) is a new alert id', () => {
    const atRisk = feed({ budgets: [budget()], transactions: [tx({ amount: 480000 })] }); // 96% spent, projected over
    const over = feed({ budgets: [budget()], transactions: [tx({ amount: 520000 })] }); // actually over
    expect(atRisk[0].id).toMatch(/-AT_RISK$/);
    expect(over[0].id).toMatch(/-OVER$/);
  });

  it('at-risk goal produces GOAL_ALERT; completed goal stays silent', () => {
    const out = feed({ goals: [goal()] });
    expect(out.some((n) => n.kind === 'GOAL_ALERT')).toBe(true);
    const done = feed({ goals: [goal({ status: 'COMPLETED', currentAmount: 5000000 })] });
    expect(done.filter((n) => n.kind === 'GOAL_ALERT')).toHaveLength(0);
  });

  it('cash-flow risk maps CRITICAL to HIGH severity', () => {
    const out = feed({ risks: [risk()] });
    expect(out[0].kind).toBe('CASHFLOW_RISK');
    expect(out[0].severity).toBe('HIGH');
    expect(out[0].priority).toBe(1);
  });
});

describe('NotificationEngine — priority, caps, prefs', () => {
  it('feed sorts by priority (overdue first, auto-post last)', () => {
    const out = feed({
      commitments: [commitment({ id: 'cA', status: 'OVERDUE' })],
      autoPostedTransactions: [tx({ id: 'tA', sourceCommitmentId: 'cB' })],
      risks: [risk()],
    });
    expect(out[0].kind).toBe('OVERDUE_COMMITMENT');
    expect(out[out.length - 1].kind).toBe('AUTO_POSTED');
    expect(out[out.length - 1].priority).toBe(4);
  });

  it('feed is capped at FEED_CAP', () => {
    const many = Array.from({ length: 30 }, (_, i) => commitment({ id: `c${i}`, status: 'OVERDUE' }));
    const out = feed({ commitments: many });
    expect(out.length).toBeLessThanOrEqual(12);
  });

  it('category prefs silence their event class only', () => {
    const input = {
      commitments: [commitment({ status: 'OVERDUE' })],
      recurring: [recurring()],
      budgets: [budget()],
      transactions: [tx({ amount: 600000 })],
      goals: [goal()],
      risks: [risk()],
    };
    const noBudgets = feed({ ...input, prefs: prefs({ budgetRisk: false }) });
    expect(noBudgets.some((n) => n.kind === 'BUDGET_ALERT')).toBe(false);
    expect(noBudgets.some((n) => n.kind === 'OVERDUE_COMMITMENT')).toBe(true);
    const noGoals = feed({ ...input, prefs: prefs({ goalRisk: false }) });
    expect(noGoals.some((n) => n.kind === 'GOAL_ALERT')).toBe(false);
  });

  it('master switch empties the whole feed', () => {
    const out = feed({
      commitments: [commitment({ status: 'OVERDUE' })],
      risks: [risk()],
      prefs: prefs({ enabled: false }),
    });
    expect(out).toHaveLength(0);
  });

  it('read ids persist as isRead=true and never duplicate', () => {
    const c = commitment({ status: 'OVERDUE' });
    const first = feed({ commitments: [c] });
    expect(first[0].isRead).toBe(false);
    const second = feed({ commitments: [c], readIds: ['ntf-overdue-c1'] });
    expect(second).toHaveLength(1);
    expect(second[0].isRead).toBe(true);
  });

  it('re-derivation is idempotent — same input yields same ids', () => {
    const input = { commitments: [commitment({ status: 'OVERDUE' })], recurring: [recurring()] };
    const a = feed(input).map((n) => n.id);
    const b = feed(input).map((n) => n.id);
    expect(a).toEqual(b);
  });
});

describe('NotificationEngine — OS dispatch planner', () => {
  const n = (over: Partial<Notification>): Notification => ({
    id: 'x',
    kind: 'OVERDUE_COMMITMENT',
    severity: 'HIGH',
    priority: 1,
    title: 'T',
    body: 'B',
    isRead: false,
    createdAt: TODAY,
    ...over,
  });

  it('LOW/INFO and read items never dispatch', () => {
    const items = [n({ id: 'low', severity: 'LOW' }), n({ id: 'info', severity: 'INFO' }), n({ id: 'rd', isRead: true })];
    const plan = NotificationEngine.planOsNotifications(items, prefs({ osNotifications: true }), {}, Date.now());
    expect(plan.toSend).toHaveLength(0);
    expect(plan.collapsedCount).toBe(0);
  });

  it('cooldown suppresses an id re-sent within cooldownHours', () => {
    const now = Date.parse('2026-09-15T12:00:00Z');
    const meta = { x: { lastShownAt: new Date(now).toISOString(), lastOsSentAt: new Date(now - 3 * 3600e3).toISOString() } };
    const p24 = NotificationEngine.planOsNotifications([n({ id: 'x' })], prefs({ osNotifications: true, cooldownHours: 24 }), meta, now);
    expect(p24.toSend).toHaveLength(0);
    const p2 = NotificationEngine.planOsNotifications([n({ id: 'x' })], prefs({ osNotifications: true, cooldownHours: 2 }), meta, now);
    expect(p2.toSend).toHaveLength(1);
  });

  it('dispatch caps at 3 and collapses the rest into one summary count', () => {
    const items = Array.from({ length: 7 }, (_, i) => n({ id: `h${i}` }));
    const plan = NotificationEngine.planOsNotifications(items, prefs({ osNotifications: true }), {}, Date.now());
    expect(plan.toSend).toHaveLength(3);
    expect(plan.collapsedCount).toBe(4);
  });

  it('osNotifications=false disables dispatch entirely', () => {
    const plan = NotificationEngine.planOsNotifications([n({})], prefs({ osNotifications: false }), {}, Date.now());
    expect(plan.toSend).toHaveLength(0);
    expect(plan.collapsedCount).toBe(0);
  });
});

describe('NotificationPrefsService — persistence', () => {
  const memStorage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
  };

  it('missing storage yields defaults', () => {
    const p = NotificationPrefsService.loadPrefs(memStorage());
    expect(p).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(p.osNotifications).toBe(false); // opt-in by default
  });

  it('round-trips saved prefs and merges unknown/missing keys over defaults', () => {
    const s = memStorage();
    NotificationPrefsService.savePrefs(prefs({ bills: false, cooldownHours: 48 }), s);
    const loaded = NotificationPrefsService.loadPrefs(s);
    expect(loaded.bills).toBe(false);
    expect(loaded.cooldownHours).toBe(48);
    expect(loaded.goalRisk).toBe(true); // untouched default survived
  });

  it('corrupt JSON falls back to defaults instead of throwing', () => {
    const s = memStorage();
    s.setItem('FINOVA_NOTIF_PREFS_V1', '{not json');
    expect(NotificationPrefsService.loadPrefs(s)).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it('meta save prunes entries older than the TTL', () => {
    const s = memStorage();
    const now = Date.parse('2026-09-15T00:00:00Z');
    const old = new Date(now - 120 * 24 * 3600e3).toISOString();
    const fresh = new Date(now - 2 * 24 * 3600e3).toISOString();
    NotificationPrefsService.saveMeta(
      { stale: { lastShownAt: old }, keep: { lastShownAt: fresh } },
      now,
      s
    );
    const loaded = NotificationPrefsService.loadMeta(s);
    expect(loaded.keep).toBeDefined();
    expect(loaded.stale).toBeUndefined();
  });
});
