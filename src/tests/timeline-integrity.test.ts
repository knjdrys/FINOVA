/**
 * DESTRUCTION TEST — timeline projection integrity.
 * Overdue bills used to vanish from projections (range started today);
 * AUTO_POSTED bills deducted twice (posted tx + projected bill); transfers
 * rendered as outflows; risk totals counted paid bills and unreceived income.
 */
import { describe, it, expect } from 'vitest';
import { TimelineEngine } from '../domain/timeline/TimelineEngine';
import { RiskEngine } from '../domain/risk/RiskEngine';
import { Account, MoneyCommitment, Transaction, UserSettings } from '../types';

const TODAY = '2026-09-15';
const P = (major: number) => Math.round(major * 100);

const acc = (over: Partial<Account> & { id: string }): Account => ({
  userId: 'user-1', name: over.id, type: 'BANK', currency: 'PHP',
  initialBalance: P(20000), currentBalance: P(20000), icon: '', color: '',
  includeInTotalBalance: true, isArchived: false,
  createdAt: TODAY, updatedAt: TODAY,
  ...over,
});

const settings = (over: Partial<UserSettings> = {}): UserSettings => ({
  userId: 'user-1', userName: 'Test', currency: 'PHP',
  defaultTrackingPeriod: 'TODAY', budgetCycleMode: 'MONTHLY',
  semiMonthlyCutoffDay: 15, minimumReserve: 0, safeToSpendPeriod: 'END_OF_MONTH',
  darkTheme: false, notificationsEnabled: true, budgetWarningThreshold: 80,
  autoGenerateCommitmentsFromRecurring: true, hasCompletedOnboarding: true,
  ...over,
});

const bill = (over: Partial<MoneyCommitment> & { id: string }): MoneyCommitment => ({
  userId: 'user-1', title: 'Bill', type: 'BILL', amount: P(1000), currency: 'PHP',
  direction: 'OUTFLOW', status: 'PROJECTED', dueDate: TODAY,
  accountId: 'a1', categoryId: 'cat-bills', priority: 'ESSENTIAL',
  createdAt: TODAY, updatedAt: TODAY,
  ...over,
});

const tx = (over: Partial<Transaction> & { id: string }): Transaction => ({
  userId: 'user-1', type: 'EXPENSE', amount: P(100), currency: 'PHP',
  categoryId: 'cat-shopping', accountId: 'a1', date: TODAY, time: '10:00',
  tags: [], status: 'CONFIRMED', createdAt: TODAY, updatedAt: TODAY,
  ...over,
});

const START = '2026-08-15';
const END = '2026-10-15';

describe('overdue obligations in projections', () => {
  it('an overdue outflow reduces every projected balance from today onward', () => {
    const accounts = [acc({ id: 'a1' })];
    const plain = TimelineEngine.generateTimeline(accounts, [], [], [], START, END, TODAY, 'PHP');
    const withOverdue = TimelineEngine.generateTimeline(
      accounts, [], [bill({ id: 'c-od', status: 'OVERDUE', dueDate: '2026-09-01', amount: P(3000) })],
      [], START, END, TODAY, 'PHP'
    );
    const todayPlain = plain.find((d) => d.date === TODAY)!.projectedEndOfDayBalance;
    const todayOd = withOverdue.find((d) => d.date === TODAY)!.projectedEndOfDayBalance;
    expect(todayPlain).toBe(P(20000));
    expect(todayOd).toBe(P(17000));
    // The overdue event itself displays on its (past) due date.
    const pastDay = withOverdue.find((d) => d.date === '2026-09-01')!;
    expect(pastDay.events.some((e) => e.id === 'c-od' && e.status === 'OVERDUE')).toBe(true);
  });

  it('AUTO_POSTED bills never project (their posted tx is the record)', () => {
    const accounts = [acc({ id: 'a1', currentBalance: P(19000) })];
    const paidTx = tx({ id: 'tx-auto', amount: P(1000), sourceCommitmentId: 'c-ap', tags: ['auto-posted'] });
    const days = TimelineEngine.generateTimeline(
      accounts, [paidTx], [bill({ id: 'c-ap', status: 'AUTO_POSTED', dueDate: '2026-09-10' })],
      [], START, END, TODAY, 'PHP'
    );
    const today = days.find((d) => d.date === TODAY)!;
    // Balance reflects the payment exactly once; no phantom projected bill.
    expect(today.projectedEndOfDayBalance).toBe(P(19000));
    expect(today.events.some((e) => e.id === 'tx-auto' && e.status === 'ACTUAL')).toBe(true);
    expect(days.flatMap((d) => d.events).some((e) => e.id === 'c-ap')).toBe(false);
  });
});

describe('transfer events are leg-aware', () => {
  it('liquid-to-liquid transfers emit no event (pool total unchanged)', () => {
    const accounts = [acc({ id: 'a1' }), acc({ id: 'a2' })];
    const move = tx({ id: 't-move', type: 'TRANSFER', amount: P(5000), accountId: 'a1', destinationAccountId: 'a2' });
    const days = TimelineEngine.generateTimeline(accounts, [move], [], [], START, END, TODAY, 'PHP');
    expect(days.flatMap((d) => d.events)).toHaveLength(0);
    expect(days.find((d) => d.date === TODAY)!.projectedEndOfDayBalance).toBe(P(40000));
  });

  it('liquid-to-excluded transfers emit an OUTFLOW event (money left the pool)', () => {
    const accounts = [acc({ id: 'a1' }), acc({ id: 'save', includeInTotalBalance: false })];
    const move = tx({ id: 't-move', type: 'TRANSFER', amount: P(5000), accountId: 'a1', destinationAccountId: 'save' });
    const days = TimelineEngine.generateTimeline(accounts, [move], [], [], START, END, TODAY, 'PHP');
    const evs = days.find((d) => d.date === TODAY)!.events;
    expect(evs).toHaveLength(1);
    expect(evs[0].direction).toBe('OUTFLOW');
  });
});

describe('timeline currency override', () => {
  it('uses the explicit currency, not accounts[0]', () => {
    const accounts = [acc({ id: 'usd', currency: 'USD', currentBalance: P(50) }), acc({ id: 'a1' })];
    const days = TimelineEngine.generateTimeline(accounts, [], [], [], START, END, TODAY, 'PHP');
    expect(days.find((d) => d.date === TODAY)!.projectedEndOfDayBalance).toBe(P(20000));
  });
});

describe('risk overdue scope', () => {
  it('excludes AUTO_POSTED bills and INFLOW from the overdue risk', () => {
    const accounts = [acc({ id: 'a1' })];
    const bills = [
      bill({ id: 'c-ap', status: 'AUTO_POSTED', dueDate: '2026-09-01', amount: P(5000) }),
      bill({ id: 'c-in', direction: 'INFLOW', status: 'OVERDUE', dueDate: '2026-09-01', amount: P(9000) }),
      bill({ id: 'c-od', status: 'OVERDUE', dueDate: '2026-09-01', amount: P(1000) }),
    ];
    const risks = RiskEngine.detectCashFlowRisks(accounts, [], bills, [], settings(), TODAY);
    const overdue = risks.find((r) => r.id.startsWith('risk-overdue'))!;
    expect(overdue).toBeDefined();
    expect(overdue.title).toContain('1 Overdue');
    expect(overdue.description).toContain('1,000');
  });
});
