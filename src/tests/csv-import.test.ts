/**
 * CSV import safety: only the app's own export is accepted, every row is
 * validated, duplicates are caught by content fingerprint, and bookkeeping
 * rows can never be resurrected as spending.
 */
import { describe, expect, it } from 'vitest';
import { CsvImportService, IMPORT_MAX_ROWS, ImportContext } from '../services/import/CsvImportService';
import { INITIAL_CATEGORIES } from '../services/storage/FinovaStorage';
import type { Account, Transaction } from '../types';

const HEADER = 'ID,Date,Time,Type,Amount,Currency,Category,Account,Destination Account,Merchant,Subtitle,Note,Status';

const acc = (over: Partial<Account> = {}): Account => ({
  id: 'acc-1', userId: 'u', name: 'BDO', type: 'BANK', currency: 'PHP',
  initialBalance: 0, currentBalance: 1000000, icon: 'x', color: '#000',
  includeInTotalBalance: true, isArchived: false, createdAt: '', updatedAt: '', ...over,
});

const existing = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-old', userId: 'u', type: 'EXPENSE', amount: 50000, currency: 'PHP',
  categoryId: 'cat-food', accountId: 'acc-1', merchant: 'Jollibee',
  date: '2026-09-05', tags: [], status: 'CONFIRMED', createdAt: '', updatedAt: '', ...over,
});

const ctx = (txs: Transaction[] = []): ImportContext => ({
  accounts: [acc(), acc({ id: 'acc-2', name: 'GCash', type: 'E_WALLET' })],
  categories: [...INITIAL_CATEGORIES],
  existing: txs,
});

describe('parse', () => {
  it('rejects empty text and foreign headers', () => {
    expect(CsvImportService.parse('')).toEqual({ ok: false, error: 'empty' });
    expect(CsvImportService.parse('a,b,c\n1,2,3')).toEqual({ ok: false, error: 'bad-header' });
    expect(CsvImportService.parse(`${HEADER}\n`)).toEqual({ ok: true, rows: [] });
  });

  it('reads quoted cells with commas and escaped quotes', () => {
    const csv = `${HEADER}\ntx-1,2026-09-05,12:00,EXPENSE,500.00,PHP,Food,BDO,,"Jolli, Bee ""Special""",,Note,CONFIRMED`;
    const parsed = CsvImportService.parse(csv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].merchant).toBe('Jolli, Bee "Special"');
  });

  it('refuses files over the row cap', () => {
    const line = 'tx-1,2026-09-05,12:00,EXPENSE,1.00,PHP,Food,BDO,,,M,,note,CONFIRMED';
    const csv = `${HEADER}\n${Array(IMPORT_MAX_ROWS + 1).fill(line).join('\n')}`;
    expect(CsvImportService.parse(csv)).toEqual({ ok: false, error: 'too-many' });
  });

  it('strips the export formula guard and BOM', () => {
    const csv = `\uFEFF${HEADER}\ntx-1,2026-09-05,12:00,EXPENSE,5.00,PHP,Food,BDO,,'=cmd,,,CONFIRMED`;
    const parsed = CsvImportService.parse(csv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[0].merchant).toBe('=cmd');
  });
});

describe('plan', () => {
  const row = (cells: string) => {
    const parsed = CsvImportService.parse(`${HEADER}\n${cells}`);
    if (!parsed.ok) throw new Error('fixture failed to parse');
    return parsed.rows;
  };

  it('accepts a clean row with resolved account + category', () => {
    const plan = CsvImportService.plan(
      row('tx-9,2026-09-05,18:30,EXPENSE,500.00,PHP,Food,BDO,,Jollibee,,Dinner,CONFIRMED'),
      ctx()
    );
    expect(plan.total).toBe(1);
    expect(plan.valid).toHaveLength(1);
    expect(plan.duplicates).toBe(0);
    expect(plan.invalid).toHaveLength(0);
    const tx = plan.valid[0];
    expect(tx.amount).toBe(50000);
    expect(tx.accountId).toBe('acc-1');
    expect(tx.categoryId).toBe('cat-food');
    expect(tx.merchant).toBe('Jollibee');
    expect(tx.id).toMatch(/^tx-import-/);
  });

  it('flags exact re-imports as duplicates (state + in-file)', () => {
    const line = 'tx-9,2026-09-05,12:00,EXPENSE,500.00,PHP,Food,BDO,,Jollibee,,,CONFIRMED';
    const plan = CsvImportService.plan(row(`${line}\n${line}`), ctx([existing()]));
    expect(plan.valid).toHaveLength(0);
    expect(plan.duplicates).toBe(2);
  });

  it('rejects bad dates, types, amounts, currencies, statuses', () => {
    const plan = CsvImportService.plan(
      row([
        'a,2026-13-40,12:00,EXPENSE,1.00,PHP,Food,BDO,,M,,n,CONFIRMED',
        'b,2026-09-05,12:00,REFUND,1.00,PHP,Food,BDO,,M,,n,CONFIRMED',
        'c,2026-09-05,12:00,EXPENSE,-5.00,PHP,Food,BDO,,M,,n,CONFIRMED',
        'd,2026-09-05,12:00,EXPENSE,5.00,XXY,Food,BDO,,M,,n,CONFIRMED',
        'e,2026-09-05,12:00,EXPENSE,5.00,PHP,Food,BDO,,M,,n,BOGUS',
      ].join('\n')),
      ctx()
    );
    expect(plan.valid).toHaveLength(0);
    expect(plan.invalid).toHaveLength(5);
  });

  it('rejects unknown accounts and currency mismatches', () => {
    const plan = CsvImportService.plan(
      row([
        'a,2026-09-05,12:00,EXPENSE,5.00,PHP,Food,Nope,,M,,n,CONFIRMED',
        'b,2026-09-05,12:00,EXPENSE,5.00,USD,Food,BDO,,M,,n,CONFIRMED',
      ].join('\n')),
      ctx()
    );
    expect(plan.invalid.map((i) => i.code)).toEqual(['unknown-account', 'currency-mismatch']);
    expect(plan.invalid[0].params).toEqual({ value: 'Nope' });
  });

  it('refuses to resurrect bookkeeping rows as spending', () => {
    const plan = CsvImportService.plan(
      row('a,2026-09-05,12:00,EXPENSE,100.00,PHP,Transfer,BDO,,Fund: X,,n,CONFIRMED'),
      ctx()
    );
    expect(plan.valid).toHaveLength(0);
    expect(plan.invalid[0].code).toBe('booking-row');
  });

  it('imports transfers with resolved destinations, rejects broken ones', () => {
    const plan = CsvImportService.plan(
      row([
        'a,2026-09-05,12:00,TRANSFER,100.00,PHP,Transfer,BDO,GCash,,Top up,,CONFIRMED',
        'b,2026-09-05,12:00,TRANSFER,100.00,PHP,Transfer,BDO,Nope,,x,,CONFIRMED',
        'c,2026-09-05,12:00,TRANSFER,100.00,PHP,Transfer,BDO,BDO,,x,,CONFIRMED',
      ].join('\n')),
      ctx()
    );
    expect(plan.valid).toHaveLength(1);
    expect(plan.valid[0].destinationAccountId).toBe('acc-2');
    expect(plan.valid[0].categoryId).toBe('cat-transfer');
    expect(plan.invalid).toHaveLength(2);
  });

  it('degrades unknown categories to General instead of failing the row', () => {
    const plan = CsvImportService.plan(
      row('a,2026-09-05,12:00,EXPENSE,7.50,PHP,ZzzTop,BDO,,M,,n,CONFIRMED'),
      ctx()
    );
    expect(plan.valid).toHaveLength(1);
    expect(plan.valid[0].categoryId).toBe('cat-general');
  });
});

/**
 * Extended coverage: line-accurate parser, CLEARED round-trip, per-row plan
 * detail, archived guards, and generic bank-CSV mapping.
 */
import {
  parseCsvCells,
  detectImportFormat,
  parseImportAmount,
  parseImportDate,
  planGenericImport,
  reviewRowsToTransactions,
  GenericImportOptions,
} from '../services/import/CsvImportService';

describe('parseCsvCells line accuracy', () => {
  it('reports true source lines past quoted newlines and blank lines', () => {
    const recs = parseCsvCells('a,b\n\n1,"x\ny"\n2,3');
    expect(recs.map((r) => r.line)).toEqual([1, 3, 5]);
    expect(recs[1].cells).toEqual(['1', 'x\ny']);
  });

  it('treats mid-cell quotes as literal', () => {
    const recs = parseCsvCells('a\n12" pipe');
    expect(recs[1].cells).toEqual(['12" pipe']);
  });
});

describe('detectImportFormat', () => {
  it('matches the exact own-export header only', () => {
    expect(detectImportFormat(HEADER.split(','))).toBe('PALDO');
    expect(detectImportFormat(['Date', 'Description', 'Amount'])).toBe('GENERIC');
    expect(detectImportFormat([...HEADER.split(','), 'Extra'])).toBe('GENERIC');
  });
});

describe('parseImportAmount', () => {
  it.each([
    ['1,234.56', 100, 123456],
    ['₱1,234.56', 100, 123456],
    ['PHP 500', 100, 50000],
    ['(1,234.56)', 100, -123456],
    ['1,234.56-', 100, -123456],
    ['1.234,56', 100, 123456],
    ['12,50', 100, 1250],
    ['1,234', 100, 123400],
    ['500', 1, 500],
  ])('%s → %s', (raw, mult, minor) => {
    expect(parseImportAmount(raw as string, mult as number)?.minor).toBe(minor);
  });

  it.each([[''], ['abc'], ['1.2.3'], [',,,']])('rejects %s', (raw) => {
    expect(parseImportAmount(raw as string, 100)).toBeNull();
  });
});

describe('parseImportDate', () => {
  it.each([
    ['2026-09-15', 'AUTO', '2026-09-15'],
    ['09/15/2026', 'AUTO', '2026-09-15'],
    ['15/09/2026', 'AUTO', '2026-09-15'],
    ['05/06/2026', 'AUTO', '2026-05-06'],
    ['05/06/2026', 'DMY', '2026-06-05'],
    ['9/5/26', 'MDY', '2026-09-05'],
    ['15 Jan 2026', 'AUTO', '2026-01-15'],
    ['Jan 15, 2026', 'AUTO', '2026-01-15'],
    ['2026/09/15', 'AUTO', '2026-09-15'],
  ])('%s (%s)', (raw, order, iso) => {
    expect(parseImportDate(raw as string, order as 'AUTO' | 'MDY' | 'DMY')).toBe(iso);
  });

  it.each([['2026-13-01'], ['2026-02-30'], ['not a date'], ['15/15/2026'], ['']])('rejects %s', (raw) => {
    expect(parseImportDate(raw as string, 'AUTO')).toBeNull();
  });
});

describe('plan status + archive hardening', () => {
  const planRows = (cells: string) => {
    const parsed = CsvImportService.parse(`${HEADER}\n${cells}`);
    if (!parsed.ok) throw new Error('fixture failed to parse');
    return parsed.rows;
  };

  it('accepts CLEARED rows and rejects off-type RECONCILED', () => {
    const plan = CsvImportService.plan(
      planRows([
        'a,2026-09-05,12:00,EXPENSE,5.00,PHP,Food,BDO,,M,,n,CLEARED',
        'b,2026-09-05,12:00,EXPENSE,5.00,PHP,Food,BDO,,M,,n,RECONCILED',
      ].join('\n')),
      ctx()
    );
    expect(plan.valid).toHaveLength(1);
    expect(plan.valid[0].status).toBe('CLEARED');
    expect(plan.invalid[0].code).toBe('bad-status');
  });

  it('returns per-row outcomes in file order', () => {
    const line = 'tx-9,2026-09-05,12:00,EXPENSE,500.00,PHP,Food,BDO,,Jollibee,,,CONFIRMED';
    const plan = CsvImportService.plan(
      planRows(`${line}\nbad,not-a-date,12:00,EXPENSE,1.00,PHP,Food,BDO,,M,,n,CONFIRMED\n${line}`),
      ctx()
    );
    expect(plan.rows.map((r) => r.status)).toEqual(['valid', 'invalid', 'duplicate']);
    expect(plan.rows[1].reason).toBe('bad-date');
    expect(plan.rows[1].reasonParams).toEqual({ value: 'not-a-date' });
    expect(plan.rows[0].tx?.merchant).toBe('Jollibee');
  });

  it('refuses archived accounts and degrades archived categories', () => {
    const archivedAcc = acc({ id: 'acc-9', name: 'Old Bank', isArchived: true });
    const archivedCat = { ...INITIAL_CATEGORIES[0], id: 'cat-old', name: 'OldCat', isArchived: true };
    const c: ImportContext = {
      accounts: [acc(), archivedAcc],
      categories: [...INITIAL_CATEGORIES, archivedCat],
      existing: [],
    };
    const plan = CsvImportService.plan(
      planRows([
        'a,2026-09-05,12:00,EXPENSE,5.00,PHP,Food,Old Bank,,M,,n,CONFIRMED',
        'b,2026-09-05,12:00,EXPENSE,5.00,PHP,OldCat,BDO,,M,,n,CONFIRMED',
      ].join('\n')),
      c
    );
    expect(plan.invalid[0].code).toBe('unknown-account');
    expect(plan.valid).toHaveLength(1);
    expect(plan.valid[0].categoryId).toBe('cat-general');
  });
});

describe('planGenericImport', () => {
  const BANK = 'Date,Description,Amount\n09/01/2026,PAYROLL - ACME,50000.00\n09/02/2026,JOLLIBEE MNL,(250.75)\n09/03/2026,7-ELEVEN,135.50-';
  const opts = (over: Partial<GenericImportOptions> = {}): GenericImportOptions => ({
    accountId: 'acc-1',
    mapping: { date: 0, description: 1, amount: 2 },
    dateOrder: 'AUTO',
    positiveMeans: 'INCOME',
    fallbackExpenseCategoryId: 'cat-general',
    fallbackIncomeCategoryId: 'cat-salary',
    ...over,
  });

  it('maps columns with sign-by-convention typing', () => {
    const rows = planGenericImport(parseCsvCells(BANK), true, ctx(), opts());
    expect(rows.map((r) => [r.date, r.type, r.amountMinor, r.merchant])).toEqual([
      ['2026-09-01', 'INCOME', 5000000, 'PAYROLL - ACME'],
      ['2026-09-02', 'EXPENSE', 25075, 'JOLLIBEE MNL'],
      ['2026-09-03', 'EXPENSE', 13550, '7-ELEVEN'],
    ]);
    expect(rows.every((r) => r.include && !r.error && !r.duplicate)).toBe(true);
  });

  it('lets an explicit type column override the sign', () => {
    const csv = 'Date,Details,Value,DC\n09/01/2026,INTEREST,12.50,CR\n09/02/2026,SERVICE FEE,200.00,DR';
    const rows = planGenericImport(parseCsvCells(csv), true, ctx(),
      opts({ mapping: { date: 0, description: 1, amount: 2, type: 3 }, positiveMeans: 'EXPENSE' }));
    expect(rows.map((r) => r.type)).toEqual(['INCOME', 'EXPENSE']);
  });

  it('reports short rows, bad cells, and dups (existing + in-file)', () => {
    const csv = 'Date,Description,Amount\n09/01/2026,ONLY-TWO\n09/02/2026,DUP,100.00\n09/02/2026,DUP,100.00\nnope,Bad,5.00';
    const rows = planGenericImport(parseCsvCells(csv), true, ctx(), opts());
    expect(rows[0].error).toBe('missing-columns');
    expect(rows[1].duplicate).toBe(false);
    expect(rows[2].duplicate).toBe(true);
    expect(rows[2].include).toBe(false);
    expect(rows[3].error).toBe('bad-date');
    expect(rows[3].rawDate).toBe('nope');
  });

  it('builds payloads only for kept rows', () => {
    const rows = planGenericImport(parseCsvCells(BANK), true, ctx(), opts());
    rows[0].include = false;
    const payloads = reviewRowsToTransactions(rows, ctx().accounts, 'user-1', 'PHP');
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({ type: 'EXPENSE', amount: 25075, currency: 'PHP', accountId: 'acc-1', tags: ['imported'] });
  });
});
