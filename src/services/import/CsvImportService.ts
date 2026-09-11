/**
 * CsvImportService — safe CSV import.
 *
 * Two shapes, one safety contract (import must never corrupt financial truth):
 * - PALDO (`parse` + `plan`): the app's own export, exact headers only.
 * - GENERIC (`planGenericImport`): bank CSVs through EXPLICIT user column
 *   mapping — never fuzzy, never silent misattribution.
 * Shared guarantees: every row validated (date, positive amount, known
 * account, no silent FX), bookkeeping rows refused rather than resurrected
 * as spending, duplicates caught by content fingerprint (existing state +
 * within file), fresh ids at apply time, row cap against giant files.
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
  reasonParams?: Record<string, string>;
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
  /** Per-row outcomes in file order — powers the review wizard. */
  rows: PlannedImportRow[];
}

export interface ImportContext {
  accounts: Account[];
  categories: Category[];
  existing: Transaction[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
// Real TransactionStatus values. 'RECONCILED' was accepted here but is not a
// valid status (it would smuggle an off-type value into state), while genuine
// 'CLEARED' rows were rejected — breaking round-trip for cleared history.
const STATUSES = new Set(['CONFIRMED', 'PENDING', 'CLEARED']);
const TYPES = new Set(['EXPENSE', 'INCOME', 'TRANSFER']);

function isRealDate(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * RFC-4180 reader: quoted cells, "" escapes, embedded newlines, CR/LF/CRLF,
 * BOM. Returns records with TRUE source line numbers (a quoted newline no
 * longer shifts every later row's reported line), skips truly blank lines,
 * and treats a mid-cell quote as literal (bank exports like 12" pipe).
 */
export interface CsvRecord {
  /** 1-based line number of the record's first line in the source text. */
  line: number;
  cells: string[];
}

export function parseCsvCells(text: string): CsvRecord[] {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let cellHasContent = false; // any non-whitespace char (or quote) seen
  let recordStartLine = 1;
  let line = 1;
  const pushCell = () => { cells.push(cell); cell = ''; cellHasContent = false; };
  const pushRow = () => {
    // A truly blank line (one empty cell) is skipped; `,,` is data.
    const isBlankLine = cells.length <= 1 && cells.every((c) => c.trim() === '');
    if (!isBlankLine) rows.push({ line: recordStartLine, cells });
    cells = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; cellHasContent = true; i++; }
        else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
        cellHasContent = true;
      }
    } else if (ch === '"') {
      if (!cellHasContent) inQuotes = true;
      else cell += ch;
      cellHasContent = true;
    } else if (ch === ',') {
      pushCell();
    } else if (ch === '\n') {
      pushCell();
      pushRow();
      line++;
      recordStartLine = line;
    } else {
      cell += ch;
      if (ch !== ' ' && ch !== '\t') cellHasContent = true;
    }
  }
  if (cell !== '' || cells.length > 0) {
    pushCell();
    pushRow();
  }
  return rows;
}

/** Undo the export's formula-injection guard (leading ' before = + - @). */
export function unguardCell(s: string): string {
  const t = s.trim();
  return t.length > 1 && t[0] === "'" && /^[=+\-@\t\r]/.test(t[1]) ? t.slice(1) : t;
}

export class CsvImportService {
  static expectedHeaders(): string[] {
    return [...EXPECTED_HEADERS];
  }

  static parse(text: string): { ok: true; rows: ParsedImportRow[] } | { ok: false; error: ImportParseError } {
    if (!text || !text.trim()) return { ok: false, error: 'empty' };
    const records = parseCsvCells(text);
    if (records.length < 1) return { ok: false, error: 'empty' };
    const header = records[0].cells.map((h) => h.trim());
    const headerOk =
      header.length === EXPECTED_HEADERS.length &&
      EXPECTED_HEADERS.every((h, i) => header[i] === h);
    if (!headerOk) return { ok: false, error: 'bad-header' };
    const data = records.slice(1);
    if (data.length > IMPORT_MAX_ROWS) return { ok: false, error: 'too-many' };
    const rows: ParsedImportRow[] = data.map((r) => {
      const c = r.cells;
      return {
        line: r.line,
        date: (c[1] || '').trim(),
        time: (c[2] || '').trim(),
        type: (c[3] || '').trim().toUpperCase(),
        amount: (c[4] || '').trim(),
        currency: (c[5] || '').trim().toUpperCase(),
        category: unguardCell(c[6] || ''),
        account: unguardCell(c[7] || ''),
        destinationAccount: unguardCell(c[8] || ''),
        merchant: unguardCell(c[9] || ''),
        subtitle: unguardCell(c[10] || ''),
        note: unguardCell(c[11] || ''),
        status: (c[12] || '').trim().toUpperCase() || 'CONFIRMED',
      };
    });
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
    const plan: ImportPlan = { total: rows.length, valid: [], duplicates: 0, invalid: [], rows: [] };
    const nowISO = new Date().toISOString();

    const accountByName = new Map<string, Account>();
    // Archived accounts/categories are invisible to import: money must land
    // somewhere live, and dead categories must not be resurrected by a file.
    for (const a of ctx.accounts) {
      if (a.isArchived) continue;
      const key = a.name.trim().toLowerCase();
      if (!accountByName.has(key)) accountByName.set(key, a);
    }
    const categoryByName = new Map<string, Category[]>();
    for (const c of ctx.categories) {
      if (c.isArchived) continue;
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
        plan.rows.push({ row, status: 'invalid', reason: code, reasonParams: params });
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
        plan.rows.push({ row, status: 'duplicate', tx });
        return;
      }
      seen.add(fp);
      plan.valid.push(tx);
      plan.rows.push({ row, status: 'valid', tx });
    });

    return plan;
  }
}

// ---------------------------------------------------------------------------
// Generic bank-CSV import (explicit user mapping; same safety guarantees)
// ---------------------------------------------------------------------------

export type BankImportFormat = 'PALDO' | 'GENERIC';
export type ImportDateOrder = 'AUTO' | 'MDY' | 'DMY' | 'YMD';

export function detectImportFormat(headerCells: string[]): BankImportFormat {
  const expected = CsvImportService.expectedHeaders();
  const norm = headerCells.map((c) => c.trim());
  return expected.length === norm.length && expected.every((h, i) => h === norm[i])
    ? 'PALDO'
    : 'GENERIC';
}

export interface GenericImportMapping {
  date: number;
  description: number;
  amount: number;
  type?: number | null;
  note?: number | null;
}

export interface GenericImportOptions {
  accountId: string;
  mapping: GenericImportMapping;
  dateOrder: ImportDateOrder;
  /** Bank convention: are positive amounts money OUT or money IN? */
  positiveMeans: 'EXPENSE' | 'INCOME';
  fallbackExpenseCategoryId: string;
  fallbackIncomeCategoryId: string;
}

export type GenericRejectCode =
  | 'bad-date'
  | 'bad-amount'
  | 'zero-amount'
  | 'unknown-account'
  | 'missing-columns';

/** One bank row, validated and ready for the review wizard. */
export interface ReviewImportRow {
  line: number;
  include: boolean;
  date: string;
  type: 'EXPENSE' | 'INCOME';
  amountMinor: number;
  merchant: string;
  note: string;
  categoryId: string;
  categoryResolved: boolean;
  accountId: string;
  duplicate: boolean;
  error?: GenericRejectCode;
  /** Raw cell text for honest error messages ("Bad date 'foo'"). */
  rawDate?: string;
  rawAmount?: string;
}

export interface ParsedImportAmount {
  minor: number;
  negative: boolean;
}

/**
 * Parses human/bank amount text into minor units. Handles currency symbols,
 * thousands separators, decimal commas (1.234,56), parenthesis negatives,
 * and trailing-minus negatives. Null when unparseable.
 */
export function parseImportAmount(raw: string, multiplier: number): ParsedImportAmount | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  const paren = /^\(\s*(.*)\s*\)$/.exec(s);
  if (paren) {
    negative = true;
    s = paren[1];
  }
  if (/-$/.test(s.trim())) {
    negative = true;
    s = s.trim().slice(0, -1);
  }
  s = s.replace(/[^0-9.,]/g, '');
  if (!s || /^[.,]+$/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: the LAST one is the decimal separator.
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    normalized = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    // Only commas: decimal comma (`12,50`) vs thousands (`1,234`).
    normalized = /,\d{1,2}$/.test(s) ? s.replace(/,/g, '.') : s.replace(/,/g, '');
    if ((normalized.match(/\./g) || []).length > 1) return null;
  } else {
    normalized = s;
  }
  if ((normalized.match(/\./g) || []).length > 1) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  const signed = negative ? -Math.abs(n) : n;
  return { minor: Math.round(signed * multiplier), negative: signed < 0 };
}

const IMPORT_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function validImportYMD(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const p = (v: number) => String(v).padStart(2, '0');
  return `${y}-${p(m)}-${p(d)}`;
}

function expandImportYear(yy: number): number {
  return yy >= 70 ? 1900 + yy : 2000 + yy;
}

/**
 * Parses bank/ISO date text into ISO. AUTO disambiguates MDY vs DMY from the
 * values themselves (a part > 12 must be the day) and falls back to the
 * caller's preference otherwise.
 */
export function parseImportDate(
  raw: string,
  order: ImportDateOrder,
  autoFallback: 'MDY' | 'DMY' = 'MDY'
): string | null {
  const s = raw.trim().replace(/,/g, ' ');
  if (!s) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return validImportYMD(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // "15 Jan 2026" / "Jan 15 2026" / "15-Jan-2026".
  const words = s.split(/[\s/.-]+/).filter(Boolean);
  if (words.length === 3) {
    const monthIdx = words.findIndex(
      (w) => IMPORT_MONTHS[w.toLowerCase()] !== undefined || IMPORT_MONTHS[w.toLowerCase().slice(0, 4)] !== undefined
    );
    if (monthIdx >= 0) {
      const low = words[monthIdx].toLowerCase();
      const m = IMPORT_MONTHS[low] ?? IMPORT_MONTHS[low.slice(0, 4)];
      const rest = words.filter((_, i) => i !== monthIdx).map(Number);
      if (rest.length === 2 && rest.every((v) => Number.isInteger(v))) {
        const yearIdx = words.findIndex((w) => /^\d{4}$/.test(w));
        if (yearIdx >= 0 && yearIdx !== monthIdx) {
          const y = Number(words[yearIdx]);
          const d = Number(words.filter((_, i) => i !== monthIdx && i !== yearIdx)[0]);
          return validImportYMD(y, m, d);
        }
        const [a, b] = rest;
        return validImportYMD(b < 100 ? expandImportYear(b) : b, m, a);
      }
      return null;
    }
  }

  const parts = s.split(/[\s/.-]+/).filter(Boolean);
  if (parts.length !== 3 || !parts.every((p) => /^\d{1,4}$/.test(p))) return null;
  const nums = parts.map(Number);
  // YMD expressed with slashes ("2026/09/15").
  if (parts[0].length === 4) return validImportYMD(nums[0], nums[1], nums[2]);

  let eff: 'MDY' | 'DMY' | 'YMD' = order === 'AUTO' ? autoFallback : order;
  if (order === 'AUTO') {
    if (nums[0] > 12 && nums[1] <= 12) eff = 'DMY';
    else if (nums[1] > 12 && nums[0] <= 12) eff = 'MDY';
    else if (nums[0] > 31 || nums[1] > 31) return null;
  }
  if (eff === 'YMD') return validImportYMD(nums[0], nums[1], nums[2]);
  let y = nums[2];
  if (y < 100) y = expandImportYear(y);
  return eff === 'MDY' ? validImportYMD(y, nums[0], nums[1]) : validImportYMD(y, nums[1], nums[0]);
}

function typeFromImportCell(raw: string): 'EXPENSE' | 'INCOME' | null {
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/(^|\b)(cr|credit|in|income|deposit|paid-in|inflow)(\b|$)/.test(s) || s === '+') return 'INCOME';
  if (/(^|\b)(dr|debit|out|expense|withdrawal|paid-out|outflow)(\b|$)/.test(s) || s === '-') return 'EXPENSE';
  return null;
}

/**
 * Validates generic bank records into review rows. One target account, caller-
 * mapped columns; row type comes from the optional type column, else from the
 * amount sign + convention. Duplicates use the same content fingerprint as
 * the PALDO path (existing state + within file) and start excluded.
 */
export function planGenericImport(
  records: CsvRecord[],
  hasHeaders: boolean,
  ctx: ImportContext,
  opts: GenericImportOptions
): ReviewImportRow[] {
  const account = ctx.accounts.find((a) => a.id === opts.accountId && !a.isArchived);
  const multiplier = account ? CURRENCY_CONFIGS[account.currency]?.minorUnitMultiplier ?? 100 : 100;
  const data = hasHeaders ? records.slice(1) : records;
  const { mapping } = opts;
  const need = Math.max(mapping.date, mapping.description, mapping.amount) + 1;

  const seen = new Set(ctx.existing.map((t) => CsvImportService.fingerprintOf(t)));
  const err = (line: number, error: GenericRejectCode, partial?: Partial<ReviewImportRow>): ReviewImportRow => ({
    line,
    include: false,
    date: '',
    type: 'EXPENSE',
    amountMinor: 0,
    merchant: '',
    note: '',
    categoryId: opts.fallbackExpenseCategoryId,
    categoryResolved: false,
    accountId: opts.accountId,
    duplicate: false,
    error,
    ...partial,
  });

  return data.map((rec) => {
    const cells = rec.cells;
    const { line } = rec;
    if (!account) return err(line, 'unknown-account');
    if (cells.length < need) return err(line, 'missing-columns', { accountId: account.id });
    const descRaw = unguardCell(cells[mapping.description] ?? '');
    const dateRaw = (cells[mapping.date] ?? '').trim();
    const amountRaw = (cells[mapping.amount] ?? '').trim();
    const date = parseImportDate(dateRaw, opts.dateOrder);
    if (!date) return err(line, 'bad-date', { merchant: descRaw, accountId: account.id, rawDate: dateRaw });
    const parsed = parseImportAmount(amountRaw, multiplier);
    if (!parsed) return err(line, 'bad-amount', { merchant: descRaw, accountId: account.id, rawAmount: amountRaw });
    if (parsed.minor === 0) return err(line, 'zero-amount', { merchant: descRaw, accountId: account.id, rawAmount: amountRaw });

    const explicit = mapping.type != null ? typeFromImportCell(cells[mapping.type] ?? '') : null;
    let type: 'EXPENSE' | 'INCOME';
    if (explicit) {
      type = explicit;
    } else if (parsed.negative) {
      type = opts.positiveMeans === 'EXPENSE' ? 'INCOME' : 'EXPENSE';
    } else {
      type = opts.positiveMeans;
    }
    const row: ReviewImportRow = {
      line,
      include: true,
      date,
      type,
      amountMinor: Math.abs(parsed.minor),
      merchant: descRaw,
      note: mapping.note != null ? unguardCell(cells[mapping.note] ?? '') : '',
      categoryId: type === 'INCOME' ? opts.fallbackIncomeCategoryId : opts.fallbackExpenseCategoryId,
      categoryResolved: false,
      accountId: account.id,
      duplicate: false,
    };
    const fp = CsvImportService.fingerprint({
      date: row.date,
      type: row.type,
      amountMinor: row.amountMinor,
      currency: account.currency,
      accountId: row.accountId,
      categoryId: row.categoryId,
      merchant: row.merchant,
      note: row.note,
    });
    if (seen.has(fp)) {
      row.duplicate = true;
      row.include = false;
    } else {
      seen.add(fp);
    }
    return row;
  });
}

/** Builds the final payloads for the review rows the user kept. */
export function reviewRowsToTransactions(
  rows: ReviewImportRow[],
  accounts: Account[],
  userId: string,
  fallbackCurrency: CurrencyCode
): Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return rows
    .filter((r) => r.include && !r.error && !r.duplicate)
    .map((r) => ({
      userId,
      type: r.type,
      amount: r.amountMinor,
      currency: byId.get(r.accountId)?.currency ?? fallbackCurrency,
      categoryId: r.categoryId,
      accountId: r.accountId,
      merchant: r.merchant || undefined,
      note: r.note || undefined,
      date: r.date,
      tags: ['imported'],
      status: 'CONFIRMED' as const,
    }));
}
