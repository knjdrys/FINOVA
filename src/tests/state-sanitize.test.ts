/**
 * DESTRUCTION TEST — persistence robustness.
 * Loads and restores used to trust every row's shape: one corrupt row
 * (string amount, missing date, NaN balance) poisoned arithmetic app-wide.
 * Corrupt rows are now dropped (accounts coerced, never dropped) and counted.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeState, totalDropped } from '../services/storage/stateValidation';
import { BackupService } from '../services/backup/BackupService';
import { CLEAN_ZERO_STATE } from '../services/storage/FinovaStorage';

const baseState = () => structuredClone(CLEAN_ZERO_STATE);

describe('sanitizeState', () => {
  it('drops transactions with invalid money, type, or date — keeps valid rows', () => {
    const s = baseState();
    const good = {
      id: 'tx-good', userId: 'u', type: 'EXPENSE', amount: 100, currency: 'PHP',
      categoryId: 'c', accountId: 'a', date: '2026-09-10', time: '10:00',
      tags: [], status: 'CONFIRMED', createdAt: '', updatedAt: '',
    };
    s.transactions = [
      good,
      { ...good, id: 'bad-amount', amount: '250' }, // string money
      { ...good, id: 'bad-nan', amount: NaN }, // NaN poison
      { ...good, id: 'bad-neg', amount: -5 }, // negative
      { ...good, id: 'bad-type', type: 'YOLO' }, // unknown type
      { ...good, id: 'bad-date', date: 'Sept 10' }, // undated money
      null,
    ] as unknown as typeof s.transactions;
    const { state, report } = sanitizeState(s);
    expect(state.transactions.map((t) => t.id)).toEqual(['tx-good']);
    expect(report.droppedTransactions).toBe(6);
  });

  it('coerces soft fields without touching money', () => {
    const s = baseState();
    s.transactions = [{
      id: 'tx-soft', userId: 'u', type: 'EXPENSE', amount: 100.4, currency: 'PHP',
      categoryId: 'c', accountId: 'a', date: '2026-09-10', time: '10:00',
      tags: 'oops', status: 'WEIRD', createdAt: '', updatedAt: '',
    }] as unknown as typeof s.transactions;
    const { state, report } = sanitizeState(s);
    expect(state.transactions).toHaveLength(1);
    expect(state.transactions[0].status).toBe('CONFIRMED');
    expect(state.transactions[0].tags).toEqual([]);
    expect(state.transactions[0].amount).toBe(100);
    expect(report.droppedTransactions).toBe(0);
  });

  it('coerces corrupt account balances to 0 (accounts are never dropped)', () => {
    const s = baseState();
    s.accounts = [{
      id: 'a1', userId: 'u', name: 'Broken', type: 'BANK', currency: 'PHP',
      initialBalance: NaN, currentBalance: 'lots',
      icon: '', color: '', includeInTotalBalance: true, isArchived: false,
      createdAt: '', updatedAt: '',
    }] as unknown as typeof s.accounts;
    const { state, report } = sanitizeState(s);
    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0].currentBalance).toBe(0);
    expect(state.accounts[0].initialBalance).toBe(0);
    expect(report.coercedAccounts).toBe(1);
  });

  it('drops plans with invalid money and coerces minimumReserve', () => {
    const s = baseState();
    s.budgets = [{ id: 'b1', amount: NaN }] as unknown as typeof s.budgets;
    s.goals = [{ id: 'g1', targetAmount: 100, currentAmount: 50, targetDate: '2026-12-31' }] as unknown as typeof s.goals;
    s.commitments = [{ id: 'c1', amount: -1 }] as unknown as typeof s.commitments;
    s.recurring = [{ id: 'r1', amount: 100, startDate: '2026-09-01', frequency: 'MONTHLY' }] as unknown as typeof s.recurring;
    (s.settings as unknown as Record<string, unknown>).minimumReserve = 'high';
    const { state, report } = sanitizeState(s);
    expect(state.budgets).toHaveLength(0);
    expect(state.goals).toHaveLength(1);
    expect(state.commitments).toHaveLength(0);
    expect(state.recurring).toHaveLength(1);
    expect(state.settings.minimumReserve).toBe(0);
    expect(totalDropped(report)).toBe(2);
  });
});

describe('parseBackup reports dropped rows', () => {
  it('restores with a droppedRows count instead of bricking', () => {
    const state = baseState();
    (state.transactions as unknown[]) = [
      {
        id: 'tx-good', userId: 'u', type: 'EXPENSE', amount: 100, currency: 'PHP',
        categoryId: 'c', accountId: 'a', date: '2026-09-10', createdAt: '', updatedAt: '',
      },
      { id: 'tx-bad', type: 'EXPENSE', amount: 'NaN-cheque' },
    ];
    const json = BackupService.createBackup(state);
    const parsed = BackupService.parseBackup(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state.transactions.map((t) => t.id)).toEqual(['tx-good']);
      expect(parsed.droppedRows).toBe(1);
    }
  });
});

describe('sanitizeState hardened lists', () => {
  it('keeps CLEARED rows intact (no silent status rewrite on reload)', () => {
    const s = baseState();
    s.transactions = [{
      id: 'tx-c', userId: 'u', type: 'EXPENSE', amount: 100, currency: 'PHP',
      categoryId: 'c', accountId: 'a', date: '2026-09-10', tags: [],
      status: 'CLEARED', createdAt: '', updatedAt: '',
    }] as unknown as typeof s.transactions;
    const { state } = sanitizeState(s);
    expect(state.transactions[0].status).toBe('CLEARED');
  });

  it('drops impossible calendar dates (2026-13-40 is not a date)', () => {
    const s = baseState();
    s.transactions = [{
      id: 'tx-d', userId: 'u', type: 'EXPENSE', amount: 100, currency: 'PHP',
      categoryId: 'c', accountId: 'a', date: '2026-13-40', tags: [],
      status: 'CONFIRMED', createdAt: '', updatedAt: '',
    }] as unknown as typeof s.transactions;
    const { state, report } = sanitizeState(s);
    expect(state.transactions).toHaveLength(0);
    expect(report.droppedTransactions).toBe(1);
  });

  it('drops plans with garbage dates/enums, coerces soft commitment fields', () => {
    const s = baseState();
    s.budgets = [
      { id: 'b-ok', amount: 100, startDate: '2026-09-01', endDate: '2026-09-30' },
      { id: 'b-bad', amount: 100, startDate: 'yesterday', endDate: '2026-09-30' },
    ] as unknown as typeof s.budgets;
    s.goals = [
      { id: 'g-bad', targetAmount: 100, currentAmount: 0, targetDate: '2026-02-30' },
    ] as unknown as typeof s.goals;
    s.commitments = [
      { id: 'c-ok', amount: 100, dueDate: '2026-09-20', direction: 'OUTFLOW', status: 'WEIRD', type: 'NOPE' },
      { id: 'c-bad', amount: 100, dueDate: '2026-09-20', direction: 'SIDEWAYS' },
    ] as unknown as typeof s.commitments;
    s.recurring = [
      { id: 'r-ok', amount: 100, startDate: '2026-09-01', frequency: 'MONTHLY', nextOccurrence: '2026-10-01' },
      { id: 'r-badfreq', amount: 100, startDate: '2026-09-01', frequency: 'FORTNIGHTLY' },
      { id: 'r-badfloor', amount: 100, startDate: '2026-09-01', frequency: 'MONTHLY', nextOccurrence: 'soon' },
    ] as unknown as typeof s.recurring;
    const { state, report } = sanitizeState(s);
    expect(state.budgets.map((b) => b.id)).toEqual(['b-ok']);
    expect(state.goals).toHaveLength(0);
    expect(state.commitments.map((c) => c.id)).toEqual(['c-ok']);
    expect(state.commitments[0].status).toBe('PROJECTED');
    expect(state.commitments[0].type).toBe('BILL');
    expect(state.recurring.map((r) => r.id)).toEqual(['r-ok']);
    expect(report.droppedBudgets).toBe(1);
    expect(report.droppedGoals).toBe(1);
    expect(report.droppedCommitments).toBe(1);
    expect(report.droppedRecurring).toBe(2);
  });

  it('auto-settles PENDING rows older than 7 days, keeps fresh ones pending', () => {
    const s = baseState();
    const mk = (id: string, status: string, date: string) => ({
      id, userId: 'u', type: 'EXPENSE', amount: 100, currency: 'PHP',
      categoryId: 'c', accountId: 'a', date, time: '10:00',
      tags: [], status, createdAt: '', updatedAt: '',
    });
    s.transactions = [
      mk('tx-stale', 'PENDING', '2026-08-20'), // 22 days before ref
      mk('tx-edge7', 'PENDING', '2026-09-04'), // exactly 7 days before ref
      mk('tx-edge8', 'PENDING', '2026-09-03'), // 8 days before ref
      mk('tx-fresh', 'PENDING', '2026-09-10'), // 1 day before ref
      mk('tx-conf', 'CONFIRMED', '2026-08-01'),
    ] as unknown as typeof s.transactions;
    const { state, report } = sanitizeState(s, '2026-09-11');
    const byId = new Map(state.transactions.map((t) => [t.id, t.status]));
    expect(byId.get('tx-stale')).toBe('CONFIRMED');
    expect(byId.get('tx-edge7')).toBe('PENDING'); // exactly 7 days: not older
    expect(byId.get('tx-edge8')).toBe('CONFIRMED'); // 8 days: older, settles
    expect(byId.get('tx-fresh')).toBe('PENDING');
    expect(byId.get('tx-conf')).toBe('CONFIRMED');
    expect(report.settledPending).toBe(2);
    expect(totalDropped(report)).toBe(0); // settlement is routine, not corruption
  });

  it('drops null accounts/categories instead of crashing downstream maps', () => {
    const s = baseState();
    s.accounts = [{ id: 'a1', initialBalance: 0, currentBalance: 0 }, null] as unknown as typeof s.accounts;
    s.categories = [{ id: 'c1' }, null, 'x'] as unknown as typeof s.categories;
    (s as unknown as Record<string, unknown>).readNotificationIds = 'not-an-array';
    const { state, report } = sanitizeState(s);
    expect(state.accounts).toHaveLength(1);
    expect(state.categories).toHaveLength(1);
    expect(state.readNotificationIds).toEqual([]);
    expect(report.droppedAccounts).toBe(1);
    expect(report.droppedCategories).toBe(2);
  });
});
