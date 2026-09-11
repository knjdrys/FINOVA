/**
 * CsvImportService — safe re-import of the app's own CSV export.
 *
 * Safety contract (import must never corrupt financial truth):
 * - Only the exact own-export header is accepted; foreign CSVs are refused
 *   outright (no fuzzy column mapping, no silent misattribution).
 * - Every row is validated: date, type, positive amount, known currency,
 *   resolvable account, same-currency account (no silent FX), resolvable
 *   transfer destination.
 * - Bookkeeping rows (goal funding, adjustments) carry cat-transfer with
 *   EXPENSE/INCOME type; tags don't survive CSV, so such rows are refused
 *   rather than resurrected as real spending.
 * - Duplicates are detected by content fingerprint, both against existing
 *   state and within the file. Imported rows always get fresh ids.
 * - Row cap (5000) guards against accidental giant-file freezes.
 */
import { Account, Category, CurrencyCode, CURRENCY_CONFIGS, Transaction } from '../../types';
import { MoneyValue } from '../../domain/money/MoneyValue';

export const IMPORT_MAX_ROWS = 5000;

const EXPECTED_HEADERS = [
  'ID', 'Date', 'Time', 'Type', 'Amount', 'Currency', 'Category',
  'Account', 'Destination Account', 'Merchant', 'Subtitle', 'Note', 'Status',
];

export type ImportParseError = 'empty' | 'bad-header' | 'too-many';

export interface ParsedImportRow {
  line: number;
  date: string;
  time: string;
  type: string;
  amount: string;
  currency: string;
  category: string;
  account: string;
  destinationAccount: string;
  merchant: string;
  subtitle: string;
  note: string;
  status: string;
}

export type ImportRowStatus = 'valid' | 'duplicate' | 'invalid';

export interface PlannedImportRow {
  row: ParsedImportRow;
  status: ImportRowStatus;
  reason?: string;
  tx?: Transaction;
}

export type ImportRejectCode =
  | 'bad-type' | 'bad-date' | 'bad-status' | 'bad-currency' | 'bad-amount'
  | 'unknown-account' | 'currency-mismatch' | 'unknown-destination'
  | 'same-account' | 'transfer-currency' | 'booking-row';

export interface ImportPlan {
  total: number;
  valid: Transaction[];
  duplicates: number;
  invalid: Array<{ line: number; code: ImportRejectCode; params: Record<string, string> }>;
}

export interface ImportContext {
  accounts: Account[];
  categories: Category[];
  existing: Transaction[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const STATUSES = new Set(['CONFIRMED', 'PENDING', 'RECONCILED']);
const TYPES = new Set(['EXPENSE', 'INCOME', 'TRANSFER']);

function isRealDate(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Minimal RFC-4180 reader: quoted cells, "" escapes, CR/LF/CRLF rows. */
function parseCsvCells(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const pushCell = () => { row.push(cell); cell = ''; };
  const pushRow = () => { rows.push(row); row = []; };
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushCell();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      pushCell();
      pushRow();
    } else {
      cell += ch;
    }
  }
  pushCell();
  pushRow();
  // Drop trailing empty rows (final newline artifacts).
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows;
}

/** Undo the export's formula-injection guard (leading ' before = + - @). */
function unguardCell(s: string): string {
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}

export class CsvImportService {
  static expectedHeaders(): string[] {
    return [...EXPECTED_HEADERS];
  }

  static parse(text: string): { ok: true; rows: ParsedImportRow[] } | { ok: false; error: ImportParseError } {
    if (!text || !text.trim()) return { ok: false, error: 'empty' };
    const cells = parseCsvCells(text);
    if (cells.length < 1) return { ok: false, error: 'empty' };
    const header = cells[0].map((h) => h.trim());
    const headerOk =
      header.length === EXPECTED_HEADERS.length &&
      EXPECTED_HEADERS.every((h, i) => header[i] === h);
    if (!headerOk) return { ok: false, error: 'bad-header' };
    const data = cells.slice(1);
    if (data.length > IMPORT_MAX_ROWS) return { ok: false, error: 'too-many' };
    const rows: ParsedImportRow[] = data.map((c, i) => ({
      line: i + 2,
      date: (c[1] || '').trim(),
      time: (c[2] || '').trim(),
      type: (c[3] || '').trim().toUpperCase(),
      amount: (c[4] || '').trim(),
      currency: (c[5] || '').trim().toUpperCase(),
      category: unguardCell((c[6] || '').trim()),
      account: unguardCell((c[7] || '').trim()),
      destinationAccount: unguardCell((c[8] || '').trim()),
      merchant: unguardCell((c[9] || '').trim()),
      subtitle: unguardCell((c[10] || '').trim()),
      note: unguardCell((c[11] || '').trim()),
      status: (c[12] || '').trim().toUpperCase() || 'CONFIRMED',
    }));
    return { ok: true, rows };
  }

  static fingerprint(args: {
    date: string; type: string; amountMinor: number; currency: string;
    accountId: string; categoryId: string; merchant: string; note: string;
  }): string {
    return [
      args.date, args.type, args.amountMinor, args.currency,
      args.accountId, args.categoryId, args.merchant, args.note,
    ].join('|');
  }

  static fingerprintOf(tx: Transaction): string {
    return CsvImportService.fingerprint({
      date: tx.date, type: tx.type, amountMinor: tx.amount, currency: tx.currency,
      accountId: tx.accountId, categoryId: tx.categoryId,
      merchant: tx.merchant || '', note: tx.note || '',
    });
  }

  static plan(rows: ParsedImportRow[], ctx: ImportContext): ImportPlan {
    const seen = new Set(ctx.existing.map((t) => CsvImportService.fingerprintOf(t)));
    const plan: ImportPlan = { total: rows.length, valid: [], duplicates: 0, invalid: [] };
    const nowISO = new Date().toISOString();

    const accountByName = new Map<string, Account>();
    for (const a of ctx.accounts) {
      const key = a.name.trim().toLowerCase();
      if (!accountByName.has(key)) accountByName.set(key, a);
    }
    const categoryByName = new Map<string, Category[]>();
    for (const c of ctx.categories) {
      const key = c.name.trim().toLowerCase();
      const list = categoryByName.get(key) || [];
      list.push(c);
      categoryByName.set(key, list);
    }
    const general = ctx.categories.find((c) => c.id === 'cat-general');

    const resolveCategory = (name: string, type: string): Category | undefined => {
      const candidates = categoryByName.get(name.trim().toLowerCase()) || [];
      return (
        candidates.find((c) => (type === 'INCOME' ? c.type === 'INCOME' : c.type === 'EXPENSE')) ||
        candidates[0]
      );
    };

    rows.forEach((row, index) => {
      const reject = (code: ImportRejectCode, params: Record<string, string> = {}) => {
        plan.invalid.push({ line: row.line, code, params });
      };

      if (!TYPES.has(row.type)) return reject('bad-type', { value: row.type });
      if (!DATE_RE.test(row.date) || !isRealDate(row.date)) return reject('bad-date', { value: row.date });
      if (!STATUSES.has(row.status)) return reject('bad-status', { value: row.status });
      const currency = row.currency as CurrencyCode;
      if (!CURRENCY_CONFIGS[currency]) return reject('bad-currency', { value: row.currency });

      let amountMinor = 0;
      try {
        amountMinor = MoneyValue.parse(row.amount || '0', currency).getMinorUnits();
      } catch {
        return reject('bad-amount', { value: row.amount });
      }
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        return reject('bad-amount', { value: row.amount });
      }

      const account = accountByName.get(row.account.toLowerCase());
      if (!account) return reject('unknown-account', { value: row.account });
      if (account.currency !== currency) {
        return reject('currency-mismatch', { currency, account: account.name });
      }

      let categoryId: string;
      let destinationAccountId: string | undefined;
      if (row.type === 'TRANSFER') {
        const dest = accountByName.get(row.destinationAccount.toLowerCase());
        if (!dest) return reject('unknown-destination', { value: row.destinationAccount });
        if (dest.id === account.id) return reject('same-account');
        if (dest.currency !== currency) return reject('transfer-currency');
        categoryId = 'cat-transfer';
        destinationAccountId = dest.id;
      } else {
        const match = resolveCategory(row.category, row.type);
        if (match && match.id === 'cat-transfer') {
          // Internal booking rows (goal funding, adjustments) can't survive
          // CSV — tags are not exported — so refuse rather than resurrect
          // bookkeeping as real spending.
          return reject('booking-row');
        }
        categoryId = match ? match.id : general?.id || 'cat-general';
      }

      const tx: Transaction = {
        id: `tx-import-${Date.now()}-${index}`,
        userId: 'user-1',
        type: row.type as Transaction['type'],
        amount: amountMinor,
        currency,
        categoryId,
        accountId: account.id,
        destinationAccountId,
        merchant: row.merchant || undefined,
        subtitle: row.subtitle || undefined,
        note: row.note || undefined,
        date: row.date,
        time: TIME_RE.test(row.time) ? row.time : '12:00',
        tags: [],
        status: row.status as Transaction['status'],
        createdAt: nowISO,
        updatedAt: nowISO,
      };
      const fp = CsvImportService.fingerprintOf(tx);
      if (seen.has(fp)) {
        plan.duplicates += 1;
        return;
      }
      seen.add(fp);
      plan.valid.push(tx);
    });

    return plan;
  }
}
