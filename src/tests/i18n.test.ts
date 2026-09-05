/**
 * i18n architecture tests — the contract that keeps localization honest:
 *  1. Locale parity: every en key exists in fil (no silent English leaks).
 *  2. Interpolation + plural forms.
 *  3. Fallback: unknown key renders the key itself, never blank.
 *  4. categoryName: system categories localize, user data passes through verbatim.
 *  5. Localized calendar labels.
 *  6. Domain engines (DateUtils, TransactionEngine) respond to the active language.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  categoryName,
  dayAbbr,
  localeKeys,
  monthAbbr,
  monthFull,
  setLanguage,
  t,
} from '../i18n/core';
import { DateUtils } from '../domain/date/DateUtils';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { Account } from '../types';

afterEach(() => setLanguage('en'));

describe('i18n locale parity', () => {
  it('every English key exists in Filipino', () => {
    const enKeys = localeKeys('en');
    const filKeys = new Set(localeKeys('fil'));
    const missing = enKeys.filter((k) => !filKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('no Filipino key is orphaned (missing in English)', () => {
    const filKeys = localeKeys('fil');
    const enKeys = new Set(localeKeys('en'));
    const orphaned = filKeys.filter((k) => !enKeys.has(k));
    expect(orphaned).toEqual([]);
  });

  it('plural keys carry the _one/_other suffix contract', () => {
    const enKeys = localeKeys('en');
    for (const key of enKeys) {
      if (key.endsWith('_one') || key.endsWith('_other')) {
        const base = key.replace(/_(one|other)$/, '');
        expect(enKeys).toContain(base); // base form must exist as fallback
      }
    }
  });
});

describe('i18n resolution', () => {
  it('interpolates named variables', () => {
    setLanguage('en');
    expect(t('tx.splitUnassigned', { amount: '12.50' })).toBe('12.50 unassigned');
  });

  it('picks plural forms by count', () => {
    setLanguage('en');
    expect(t('tx.activeFilters', { count: 1 })).toBe('1 filter active');
    expect(t('tx.activeFilters', { count: 3 })).toBe('3 filters active');
  });

  it('unknown keys render the key itself, never blank', () => {
    expect(t('nope.not.a.key')).toBe('nope.not.a.key');
  });

  it('missing variables keep their placeholder visible', () => {
    expect(t('tx.splitUnassigned', {})).toBe('{amount} unassigned');
  });

  it('switching language switches copy', () => {
    setLanguage('en');
    const addTitle = t('tx.addTitle');
    setLanguage('fil');
    expect(t('tx.addTitle')).not.toBe(addTitle);
    expect(t('tx.addTitle')).toBe('Magdagdag ng Transaksyon');
  });
});

describe('categoryName — data vs. chrome', () => {
  it('localizes system categories by id', () => {
    setLanguage('fil');
    expect(categoryName({ id: 'cat-food', name: 'Food', isSystem: true })).toBe('Pagkain');
    expect(categoryName({ id: 'cat-transport', name: 'Transport', isSystem: true })).toBe('Biyahe');
  });

  it('never translates user-created categories', () => {
    setLanguage('fil');
    expect(categoryName({ id: 'cat-x', name: 'Lablab Dates', isSystem: false })).toBe('Lablab Dates');
  });

  it('falls back to stored name if a system id has no dictionary entry', () => {
    setLanguage('fil');
    expect(categoryName({ id: 'cat-unknown', name: 'Weird One', isSystem: true })).toBe('Weird One');
  });
});

describe('localized calendar labels', () => {
  it('month and day abbreviations follow the active language', () => {
    setLanguage('en');
    expect(monthAbbr(0)).toBe('Jan');
    expect(dayAbbr(0)).toBe('SUN');
    setLanguage('fil');
    expect(monthAbbr(0)).toBe('Ene');
    expect(dayAbbr(0)).toBe('LIN');
    expect(monthFull(1)).toBe('Enero');
  });

  it('DateUtils relative labels localize', () => {
    const today = DateUtils.getTodayISO();
    setLanguage('en');
    expect(DateUtils.formatDisplayDate(today)).toBe('Today');
    setLanguage('fil');
    expect(DateUtils.formatDisplayDate(today)).toBe('Ngayon');
  });

  it('month names inside display dates localize', () => {
    setLanguage('fil');
    expect(DateUtils.getMonthName(1)).toBe('Enero');
    setLanguage('en');
    expect(DateUtils.getMonthName(1)).toBe('January');
  });
});

describe('domain engines localize at generation time', () => {
  const account = (id: string, balance: number): Account => ({
    id,
    userId: 'u1',
    name: 'Checking',
    type: 'BANK',
    currency: 'PHP',
    initialBalance: balance,
    currentBalance: balance,
    icon: 'Wallet',
    color: '#000',
    includeInTotalBalance: true,
    isArchived: false,
    createdAt: '',
    updatedAt: '',
  });

  it('transaction validation errors follow the language', () => {
    const bad = {
      id: 't1', userId: 'u1', type: 'EXPENSE' as const, amount: 0, currency: 'PHP' as const,
      accountId: 'a1', categoryId: 'cat-food', date: '2026-09-01', merchant: '', note: '',
      isRecurring: false, isReviewed: false, status: 'POSTED' as const,
      createdAt: '', updatedAt: '',
    };
    setLanguage('en');
    expect(TransactionEngine.validateTransaction(bad as any, [account('a1', 1000)])).toBe(
      'Amount must be greater than zero.',
    );
    setLanguage('fil');
    expect(TransactionEngine.validateTransaction(bad as any, [account('a1', 1000)])).toBe(
      'Dapat mas mataas sa zero ang halaga.',
    );
  });

  it('split validation errors localize', () => {
    const split = {
      id: 't2', userId: 'u1', type: 'EXPENSE' as const, amount: 10000, currency: 'PHP' as const,
      accountId: 'a1', categoryId: 'cat-food', date: '2026-09-01', merchant: '', note: '',
      isRecurring: false, isReviewed: false, status: 'POSTED' as const,
      createdAt: '', updatedAt: '',
      splitParts: [
        { categoryId: 'cat-food', amount: 4000 },
        { categoryId: 'cat-bills', amount: 3000 },
      ],
    };
    setLanguage('fil');
    expect(TransactionEngine.validateSplitParts(10000, split.splitParts)).toBe(
      'May 30.00 pang walang hatian.',
    );
  });
});
