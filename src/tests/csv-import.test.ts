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
