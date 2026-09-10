/**
 * CSV import — the "move INTO FINOVA" contract.
 *  1. Round-trip: FINOVA's own CSV export re-imports with zero errors and is
 *     idempotent (re-importing the same file → all duplicates, nothing new).
 *  2. Generic bank/finance shapes: header aliases, date formats, signed
 *     amounts, category matching, catch-all "Other" creation.
 *  3. Strictness: bad dates/amounts become row errors (never silent),
 *     foreign currencies are skipped, quoted fields survive.
 */
import { describe, expect, it } from 'vitest';
import { buildDemoState, FinovaStorage } from '../services/storage/FinovaStorage';
import {
  parseCSV,
  parseDateToISO,
  parseAmountToMinor,
  parseTransactionsCSV,
  OTHER_EXPENSE_ID,
} from '../services/storage/CSVImportService';

const state = buildDemoState('2026-09-10');

function ctx() {
  return {
    categories: state.categories,
    accounts: state.accounts,
    currency: 'PHP' as const,
    existingTx: state.transactions,
  };
}

describe('FINOVA CSV round-trip', () => {
  it('exports and re-imports into a fresh app with zero errors, IDs intact', () => {
    const csv = FinovaStorage.exportToCSV(state.transactions, state.categories, state.accounts);
    const res = parseTransactionsCSV(csv, { ...ctx(), existingTx: [] });
    expect(res.needsColumns).toBe(false);
    expect(res.errors).toHaveLength(0);
    expect(res.currencyMismatches).toBe(0);
    expect(res.valid.length).toBe(state.transactions.length);
    // IDs are preserved so a re-import is detectable.
    for (const row of res.valid) {
      expect(row.id).toBeTruthy();
      expect(row.currency).toBe('PHP');
    }
  });

  it('is idempotent: importing the same file again sees only duplicates', () => {
    const csv = FinovaStorage.exportToCSV(state.transactions, state.categories, state.accounts);
    // First import into a fresh app → everything is new.
    const first = parseTransactionsCSV(csv, { ...ctx(), existingTx: [] });
    expect(first.valid.length).toBe(state.transactions.length);
    expect(first.duplicates).toBe(0);
    // The app now holds those rows (same ids) → re-import adds nothing.
    const second = parseTransactionsCSV(csv, ctx());
    expect(second.valid).toHaveLength(0);
    expect(second.duplicates).toBe(state.transactions.length);
  });

  it('imports into a FRESH (empty) app: nothing is a duplicate', () => {
    const csv = FinovaStorage.exportToCSV(state.transactions, state.categories, state.accounts);
    const fresh = parseTransactionsCSV(csv, {
      categories: state.categories,
      accounts: state.accounts,
      currency: 'PHP',
      existingTx: [],
    });
    expect(fresh.valid.length).toBe(state.transactions.length);
    expect(fresh.duplicates).toBe(0);
    expect(fresh.errors).toHaveLength(0);
  });
});

describe('generic bank/finance CSV', () => {
  it('matches header aliases and parses dates/amounts/signed types', () => {
    const csv = [
      'Date,Description,Amount,Type',
      '2026-09-01,Jollibee lunch,-250.50,debit',
      '09/02/2026,Salary,45000,credit',
      '13/09/2026,Globe Load,250,',
    ].join('\n');
    const res = parseTransactionsCSV(csv, { ...ctx(), existingTx: [] });
    expect(res.errors).toHaveLength(0);
    expect(res.valid).toHaveLength(3);
    const [a, b, c] = res.valid;
    expect(a).toMatchObject({ date: '2026-09-01', type: 'EXPENSE', amountMinor: 25050, merchant: 'Jollibee lunch' });
    expect(b).toMatchObject({ date: '2026-09-02', type: 'INCOME', amountMinor: 4_500_000, merchant: 'Salary' });
    expect(c).toMatchObject({ date: '2026-09-13', type: 'EXPENSE', amountMinor: 25000 }); // 13 forces day; empty type → EXPENSE
  });

  it('matches categories by name and creates catch-all "Other" when unmatched', () => {
    const csv = [
      'Date,Description,Amount,Category',
      '2026-09-01,Market run,1000,Groceries',
      '2026-09-01,Concert ticket,2000,Entertainment',
      '2026-09-02,Payout,5000,Freelance',
    ].join('\n');
    const res = parseTransactionsCSV(csv, { ...ctx(), existingTx: [] });
    expect(res.errors).toHaveLength(0);
    const market = res.valid.find((r) => r.merchant === 'Market run')!;
    const concert = res.valid.find((r) => r.merchant === 'Concert ticket')!;
    const payout = res.valid.find((r) => r.merchant === 'Payout')!;
    expect(market.categoryId).toBe('cat-groceries');
    expect(market.categoryCreated).toBe(false);
    expect(concert.categoryId).toBe(OTHER_EXPENSE_ID);
    expect(concert.categoryCreated).toBe(true);
    expect(payout.categoryId).toBe('cat-freelance');
  });

  it('skips rows in a different currency instead of mixing ledgers', () => {
    const csv = [
      'Date,Description,Amount,Currency',
      '2026-09-01,Local spend,1000,PHP',
      '2026-09-01,USD wire,100,USD',
    ].join('\n');
    const res = parseTransactionsCSV(csv, { ...ctx(), existingTx: [] });
    expect(res.valid).toHaveLength(1);
    expect(res.currencyMismatches).toBe(1);
  });

  it('reports bad dates and amounts as row errors with line numbers', () => {
    const csv = [
      'Date,Description,Amount',
      'September 1st,Coffee,100',
      '2026-09-01,Lunch,not-a-number',
      '2026-09-01,Rice,500',
    ].join('\n');
    const res = parseTransactionsCSV(csv, { ...ctx(), existingTx: [] });
    expect(res.valid).toHaveLength(1);
    expect(res.errors).toHaveLength(2);
    expect(res.errors[0]).toMatchObject({ line: 2, code: 'BAD_DATE' });
    expect(res.errors[1]).toMatchObject({ line: 3, code: 'BAD_AMOUNT' });
  });

  it('rejects files without date+amount columns instead of guessing', () => {
    expect(parseTransactionsCSV('Name,Phone\nAna,123', ctx()).needsColumns).toBe(true);
    expect(parseTransactionsCSV('Date\n2026-09-01', ctx()).needsColumns).toBe(true);
  });

  it('survives RFC-4180 quoting: commas and quotes inside fields', () => {
    const csv = [
      'Date,Description,Amount',
      '2026-09-01,"Smith, John & Sons, Inc.",750.25',
      '2026-09-02,"He said ""hi"" twice",10',
    ].join('\n');
    const res = parseTransactionsCSV(csv, { ...ctx(), existingTx: [] });
    expect(res.errors).toHaveLength(0);
    expect(res.valid[0].merchant).toBe('Smith, John & Sons, Inc.');
    expect(res.valid[0].amountMinor).toBe(75025);
    expect(res.valid[1].merchant).toBe('He said "hi" twice');
  });
});

describe('value parsers', () => {
  it('parseAmountToMinor handles symbols, commas, and zero-rejection', () => {
    expect(parseAmountToMinor('1,234.56', 'PHP')).toBe(123456);
    expect(parseAmountToMinor('₱500', 'PHP')).toBe(50000);
    expect(parseAmountToMinor('-0.01', 'PHP')).toBe(-1);
    expect(parseAmountToMinor('PHP 99.99', 'PHP')).toBe(9999);
    expect(parseAmountToMinor('0', 'PHP')).toBe(null);
    expect(parseAmountToMinor('abc', 'PHP')).toBe(null);
  });

  it('parseDateToISO handles ISO, US, and ambiguous short dates (MM/DD default)', () => {
    expect(parseDateToISO('2026-09-10')).toBe('2026-09-10');
    expect(parseDateToISO('2026/9/3')).toBe('2026-09-03');
    expect(parseDateToISO('9/10/2026')).toBe('2026-09-10'); // ambiguous → MM/DD
    expect(parseDateToISO('13/09/2026')).toBe('2026-09-13'); // 13 can only be a day
    expect(parseDateToISO('09-13-26')).toBe('2026-09-13'); // 13 forces MM/yy
    expect(parseDateToISO('2026-13-40')).toBe(null);
    expect(parseDateToISO('hello')).toBe(null);
  });

  it('parseCSV splits quoted multi-line fields without corrupting rows', () => {
    const rows = parseCSV('a,b\n"line1\nline2",x\n"q""q",y');
    expect(rows).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'x'],
      ['q"q', 'y'],
    ]);
  });
});
