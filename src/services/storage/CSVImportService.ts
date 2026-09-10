import { CURRENCY_CONFIGS, CurrencyCode } from '../../types';
import { Account, Category, Transaction } from '../../types';

/**
 * CSV transaction import — completes the data loop (the app already exports
 * CSV; moving INTO the app was impossible).
 *
 * Two supported shapes:
 *  1. FINOVA's own export (round-trip: export → new device → import,
 *     idempotent because original IDs are kept and deduped).
 *  2. Generic bank/finance CSVs (date + amount required; type, category,
 *     account, merchant, currency, note, time matched by header aliases).
 *
 * Pure module: parsing, validation, and matching happen without the DOM so
 * the whole pipeline is unit-tested. The UI layer only reads the result.
 */

export interface ImportRowError {
  /** 1-based line number in the file (header is line 1). */
  line: number;
  code: 'BAD_DATE' | 'BAD_AMOUNT' | 'NEED_COLUMNS';
  detail: string;
}

export interface ImportableRow {
  id: string | null; // kept from FINOVA round-trips; null → fresh id on import
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM or null
  type: 'EXPENSE' | 'INCOME';
  amountMinor: number; // integer minor units, always positive
  currency: CurrencyCode;
  categoryId: string; // resolved against the user's categories
  categoryName: string;
  accountId: string; // resolved (falls back to the first account)
  destinationAccountId: string | null;
  merchant: string;
  note: string;
  categoryCreated: boolean; // true when a catch-all "Other"/"Other Income" was needed
}

export interface ParseResult {
  valid: ImportableRow[];
  errors: ImportRowError[];
  duplicates: number; // rows skipped: id or (date+amount+merchant) already present
  currencyMismatches: number; // rows skipped: different currency than the app
  needsColumns: boolean; // fatal: no date/amount columns found
}

// --------------------------------------------------------------------------
// CSV text → rows (RFC-4180: quoted fields, embedded quotes/commas/newlines)
// --------------------------------------------------------------------------
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Flush a trailing field/row without a final newline.
  if (field.length > 0 || row.length > 0) pushRow();
  // Drop fully-empty lines (some exports end with a blank row).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// --------------------------------------------------------------------------
// Header matching
// --------------------------------------------------------------------------
type ColIndex = { id: number; date: number; time: number; type: number; amount: number; currency: number; category: number; account: number; destination: number; merchant: number; note: number };

const ALIASES: Record<keyof ColIndex, string[]> = {
  id: ['id', 'tx id', 'transaction id', 'uuid'],
  date: ['date', 'transaction date', 'posted date', 'posted', 'transaction date (yyyy-mm-dd)', 'when'],
  time: ['time'],
  type: ['type', 'transaction type', 'kind', 'direction', 'entry type'],
  amount: ['amount', 'value', 'debit', 'credit', 'amount (php)', 'amount (pesos)'],
  currency: ['currency', 'ccy', 'cur'],
  category: ['category', 'category name', 'cat', 'payee category', 'label'],
  account: ['account', 'from account', 'account name', 'account no.', 'source account'],
  destination: ['destination account', 'to account', 'destination'],
  merchant: ['merchant', 'description', 'memo', 'details', 'payee', 'payee name', 'merchant name'],
  note: ['note', 'notes', 'comment', 'comments'],
};

function matchColumns(header: string[]): ColIndex {
  const norm = header.map((h) => h.trim().toLowerCase());
  const idx: Record<keyof ColIndex, number> = {
    id: -1, date: -1, time: -1, type: -1, amount: -1, currency: -1,
    category: -1, account: -1, destination: -1, merchant: -1, note: -1,
  };
  (Object.keys(ALIASES) as Array<keyof ColIndex>).forEach((key) => {
    idx[key] = norm.findIndex((h) => ALIASES[key].includes(h));
  });
  return idx as unknown as ColIndex;
}

// --------------------------------------------------------------------------
// Value parsers
// --------------------------------------------------------------------------
/** '1,234.56', '₱1234.56', 'PHP 1,234.56' → 123456 minor units (PHP). */
export function parseAmountToMinor(raw: string, currency: CurrencyCode): number | null {
  let s = raw.trim().replace(/[₱$€£\s]/g, '');
  // Drop a leading currency code like "PHP 123" when it slipped past the strip.
  s = s.replace(/^[A-Za-z]{3}/, '').trim();
  if (!s || !/^[-+]?[\d,]*\.?\d*$/.test(s)) return null;
  s = s.replace(/,/g, '');
  const major = Number(s);
  if (!Number.isFinite(major) || major === 0) return null;
  const multiplier = CURRENCY_CONFIGS[currency]?.minorUnitMultiplier ?? 100;
  const sign = major < 0 ? -1 : 1;
  const minor = Math.round(Math.abs(major) * multiplier);
  return minor === 0 ? null : sign * minor;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Accepts YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY, DD/MM/YYYY, M/D/YY.
 * Ambiguous short dates default to MM/DD (US-style) — the same convention
 * most exported bank statements from PH digital banks use.
 */
export function parseDateToISO(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return `${y}-${pad2(+mo)}-${pad2(+d)}`;
    return null;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!m) return null;
  const [, a, b, yRaw] = m.map(Number);
  const year = yRaw < 100 ? 2000 + yRaw : yRaw;
  let mo = 0;
  let d = 0;
  if (a > 12 && b <= 12) [d, mo] = [a, b]; // clearly DD/MM
  else if (b > 12 && a <= 12) [mo, d] = [a, b]; // clearly MM/DD
  else [mo, d] = [a, b]; // ambiguous → MM/DD
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${year}-${pad2(mo)}-${pad2(d)}`;
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function parseTime(raw: string): string | null {
  const m = raw.trim().match(TIME_RE);
  if (!m) return null;
  return `${pad2(+m[1])}:${m[2]}`;
}

function parseType(raw: string): 'EXPENSE' | 'INCOME' | null {
  const s = raw.trim().toLowerCase();
  if (['income', 'in', 'credit', 'cr', 'salary', 'deposit'].includes(s)) return 'INCOME';
  if (['expense', 'out', 'debit', 'dr', 'withdrawal', 'purchase'].includes(s)) return 'EXPENSE';
  // Empty/unrecognized → caller applies the documented default (EXPENSE).
  // Sign is NEVER type evidence: a positive expense row has no sign at all.
  return null;
}

// --------------------------------------------------------------------------
// Category / account resolution
// --------------------------------------------------------------------------
export const OTHER_EXPENSE_ID = 'cat-import-other';
export const OTHER_INCOME_ID = 'cat-import-other-income';

export function createCatchAllCategory(id: string, name: string, type: 'EXPENSE' | 'INCOME', userId: string): Category {
  return {
    id,
    userId,
    name,
    type,
    icon: type === 'INCOME' ? 'Coins' : 'CircleDashed',
    emoji: type === 'INCOME' ? '💰' : '📦',
    color: '#64748B',
    bgColor: '#F1F5F9',
    isSystem: false,
    isArchived: false,
  };
}

function matchCategory(name: string, categories: Category[], type: 'EXPENSE' | 'INCOME'): { id: string; created: Category | null } {
  const wanted = name.trim().toLowerCase();
  if (wanted) {
    // Exact name match (any type) first — a "Salary" row must land in Salary.
    const exact = categories.find((c) => c.name.trim().toLowerCase() === wanted);
    if (exact) return { id: exact.id, created: null };
    // Then a same-type match on the same name (covers localized names later).
    const typed = categories.find((c) => c.type === type && c.name.trim().toLowerCase() === wanted);
    if (typed) return { id: typed.id, created: null };
  }
  const id = type === 'INCOME' ? OTHER_INCOME_ID : OTHER_EXPENSE_ID;
  const existing = categories.find((c) => c.id === id);
  if (existing) return { id: existing.id, created: null };
  const created = createCatchAllCategory(id, type === 'INCOME' ? 'Other Income' : 'Other', type, categories[0]?.userId ?? 'user-1');
  return { id, created };
}

function matchAccount(name: string, accounts: Account[]): string | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const byName = accounts.find((a) => a.name.trim().toLowerCase() === wanted);
  if (byName) return byName.id;
  const byMask = accounts.find((a) => (a.accountNumberMask || '').toLowerCase().includes(wanted));
  return byMask ? byMask.id : null;
}

// --------------------------------------------------------------------------
// Main entry
// --------------------------------------------------------------------------
export function parseTransactionsCSV(
  text: string,
  ctx: { categories: Category[]; accounts: Account[]; currency: CurrencyCode; existingTx: Transaction[] }
): ParseResult {
  const result: ParseResult = { valid: [], errors: [], duplicates: 0, currencyMismatches: 0, needsColumns: false };
  const rows = parseCSV(text);
  if (rows.length < 2) {
    result.needsColumns = true;
    return result;
  }

  const cols = matchColumns(rows[0]);
  if (cols.date === -1 || cols.amount === -1) {
    result.needsColumns = true;
    return result;
  }

  const existingIds = new Set(ctx.existingTx.map((t) => t.id));
  const existingKeys = new Set(
    ctx.existingTx.map((t) => `${t.date}|${t.amount}|${(t.merchant || '').toLowerCase()}`)
  );
  const seenInFile = new Set<string>();
  const firstAccountId = ctx.accounts[0]?.id ?? null;
  const createdCategories = new Map<string, Category>();

  for (let r = 1; r < rows.length; r++) {
    const line = r + 1;
    const cells = rows[r];
    const get = (i: number) => (i >= 0 && i < cells.length ? cells[i].trim() : '');

    // Date
    const date = parseDateToISO(get(cols.date));
    if (!date) {
      result.errors.push({ line, code: 'BAD_DATE', detail: get(cols.date) });
      continue;
    }

    // Amount
    let signed = parseAmountToMinor(get(cols.amount), ctx.currency);
    if (signed === null) {
      result.errors.push({ line, code: 'BAD_AMOUNT', detail: get(cols.amount) });
      continue;
    }

    // Currency column (if present): never mix currencies into the ledger.
    const currencyRaw = get(cols.currency).toUpperCase();
    if (currencyRaw && currencyRaw !== ctx.currency) {
      result.currencyMismatches += 1;
      continue;
    }

    // Type: explicit column first. Without one, every row defaults to
    // EXPENSE — spending is the common import case and an income row without
    // a type column would be indistinguishable from a positive expense.
    // (The sign is still normalized: negative amounts become positive
    // EXPENSEs, so a signed bank export imports correctly.)
    const type: 'EXPENSE' | 'INCOME' =
      (cols.type !== -1 && parseType(get(cols.type))) || 'EXPENSE';
    if (signed < 0) signed = -signed;

    // Duplicate detection: id (round-trip) or date+amount+merchant.
    const id = cols.id !== -1 && get(cols.id) ? get(cols.id) : null;
    const merchant = cols.merchant !== -1 ? get(cols.merchant) : '';
    const dupKey = id ?? `${date}|${signed}|${merchant.toLowerCase()}`;
    if (id ? existingIds.has(id) : existingKeys.has(dupKey)) {
      result.duplicates += 1;
      continue;
    }
    if (seenInFile.has(dupKey)) {
      result.duplicates += 1;
      continue;
    }
    seenInFile.add(dupKey);

    // Category
    const catName = cols.category !== -1 ? get(cols.category) : '';
    const matched = matchCategory(catName, ctx.categories, type);
    if (matched.created) createdCategories.set(matched.id, matched.created);

    // Accounts
    const accountId = (cols.account !== -1 && matchAccount(get(cols.account), ctx.accounts)) || firstAccountId || 'acc-unknown';
    let destinationAccountId: string | null = null;
    if (cols.destination !== -1 && get(cols.destination)) {
      destinationAccountId = matchAccount(get(cols.destination), ctx.accounts);
    }

    result.valid.push({
      id,
      date,
      time: cols.time !== -1 ? parseTime(get(cols.time)) : null,
      type,
      amountMinor: signed,
      currency: ctx.currency,
      categoryId: matched.id,
      categoryName: matched.created?.name ?? ctx.categories.find((c) => c.id === matched.id)?.name ?? '',
      accountId,
      destinationAccountId,
      merchant,
      note: cols.note !== -1 ? get(cols.note) : '',
      categoryCreated: matched.created !== null,
    });
  }

  return result;
}
