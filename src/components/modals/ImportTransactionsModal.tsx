import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Field } from '../ui/Field';
import { Account, Category, CurrencyCode, Transaction, UserSettings } from '../../types';
import {
  CsvImportService,
  parseCsvCells,
  CsvRecord,
  detectImportFormat,
  planGenericImport,
  reviewRowsToTransactions,
  IMPORT_MAX_ROWS,
  BankImportFormat,
  GenericImportMapping,
  ImportDateOrder,
  PlannedImportRow,
} from '../../services/import/CsvImportService';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { DateUtils } from '../../domain/date/DateUtils';
import { Upload, FileText, CheckCircle2, AlertTriangle, Copy, ArrowLeft, ArrowRight, X } from 'lucide-react';
import { t } from '../../i18n/core';

interface ImportTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  settings: UserSettings;
  onImport: (rows: Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>, opts?: { silent?: boolean }) => void;
}

type Step = 'FILE' | 'MAP' | 'REVIEW' | 'DONE';

/** Render cap for the review list (parsing caps at IMPORT_MAX_ROWS). */
const REVIEW_RENDER_CAP = 100;

/** One review line, whether it came from the PALDO or generic planner. */
interface DisplayRow {
  line: number;
  include: boolean;
  date: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amountMinor: number;
  merchant: string;
  note: string;
  accountId: string;
  currency: CurrencyCode;
  duplicate: boolean;
  errorLabel?: string;
  fallbackBadge: boolean;
  tx?: Transaction;
}

function guessColumn(headers: string[], wants: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const w of wants) {
    const idx = norm.findIndex((h) => h.includes(w));
    if (idx >= 0) return idx;
  }
  return -1;
}

export const ImportTransactionsModal: React.FC<ImportTransactionsModalProps> = ({
  isOpen,
  onClose,
  accounts,
  categories,
  transactions,
  settings,
  onImport,
}) => {
  const [step, setStep] = useState<Step>('FILE');
  const [fileName, setFileName] = useState('');
  const [fileText, setFileText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [records, setRecords] = useState<CsvRecord[]>([]);
  const [format, setFormat] = useState<BankImportFormat>('GENERIC');
  const [hasHeaders, setHasHeaders] = useState(true);
  const [mapping, setMapping] = useState<GenericImportMapping>({ date: 0, description: 1, amount: 2, type: null, note: null });
  const [accountId, setAccountId] = useState('');
  const [positiveMeans, setPositiveMeans] = useState<'EXPENSE' | 'INCOME'>('INCOME');
  const [dateOrder, setDateOrder] = useState<ImportDateOrder>('AUTO');
  const [fallbackExpense, setFallbackExpense] = useState('');
  const [fallbackIncome, setFallbackIncome] = useState('');
  const [overrides, setOverrides] = useState<Map<number, boolean>>(new Map());
  const [importedCount, setImportedCount] = useState(0);
  const [deltas, setDeltas] = useState<Array<{ accountId: string; delta: number }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  const openAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts]);
  const expenseCats = useMemo(() => categories.filter((c) => c.type === 'EXPENSE' && !c.isArchived), [categories]);
  const incomeCats = useMemo(() => categories.filter((c) => c.type === 'INCOME' && !c.isArchived), [categories]);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  // Fresh wizard on every open.
  useEffect(() => {
    if (!isOpen) return;
    setStep('FILE');
    setFileName('');
    setFileText('');
    setFileError(null);
    setRecords([]);
    setFormat('GENERIC');
    setHasHeaders(true);
    setOverrides(new Map());
    setImportedCount(0);
    setDeltas([]);
    submittedRef.current = false;
    const open = accounts.filter((a) => !a.isArchived);
    setAccountId(open[0]?.id ?? '');
    const exp = categories.filter((c) => c.type === 'EXPENSE' && !c.isArchived);
    const inc = categories.filter((c) => c.type === 'INCOME' && !c.isArchived);
    setFallbackExpense(exp.find((c) => c.name.toLowerCase() === 'general')?.id ?? exp[0]?.id ?? '');
    setFallbackIncome(inc[0]?.id ?? '');
  }, [isOpen, accounts, categories]);

  // PALDO files use the strict own-export planner; anything else (or a PALDO
  // file the user declares headerless) goes through explicit column mapping.
  const effectiveFormat: BankImportFormat = hasHeaders && format === 'PALDO' ? 'PALDO' : 'GENERIC';

  const headers: string[] = records.length > 0 ? records[0].cells : [];
  const columnCount = Math.max(0, ...records.map((r) => r.cells.length));
  const columnSample = (idx: number): string => {
    const probe = records.slice(hasHeaders ? 1 : 0, (hasHeaders ? 1 : 0) + 4);
    const v = probe.map((r) => (r.cells[idx] ?? '').trim()).find((s) => s !== '');
    return v ? (v.length > 28 ? `${v.slice(0, 28)}…` : v) : '—';
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      const text = await file.text();
      const recs = parseCsvCells(text);
      if (recs.length < 2) {
        setFileError(t('import.fileEmpty'));
        return;
      }
      if (recs.length - 1 > IMPORT_MAX_ROWS) {
        setFileError(t('import.tooMany'));
        return;
      }
      setFileName(file.name);
      setFileText(text);
      setRecords(recs);
      const fmt = detectImportFormat(recs[0].cells);
      setFormat(fmt);
      if (fmt === 'GENERIC') {
        const h = recs[0].cells;
        const d = guessColumn(h, ['date', 'posting', 'petsa']);
        const desc = guessColumn(h, ['description', 'merchant', 'details', 'narrat', 'particular']);
        const amt = guessColumn(h, ['amount', 'value', 'halaga']);
        const ty = guessColumn(h, ['type', 'dc', 'dr/cr', 'debit/credit', 'uri']);
        const nt = guessColumn(h, ['note', 'memo', 'remark', 'reference']);
        setMapping({
          date: d >= 0 ? d : 0,
          description: desc >= 0 ? desc : Math.min(1, h.length - 1),
          amount: amt >= 0 ? amt : Math.min(2, h.length - 1),
          type: ty >= 0 ? ty : null,
          note: nt >= 0 ? nt : null,
        });
      }
      setStep('MAP');
    } catch {
      setFileError(t('import.fileUnreadable'));
    }
  };

  const adaptedPaldo = (planned: PlannedImportRow[]): DisplayRow[] =>
    planned.map((p) => {
      if (p.status === 'valid' && p.tx) {
        // Category fell back to General when the export named one unknown.
        const fellBack =
          p.tx.type !== 'TRANSFER' &&
          (p.tx.categoryId === 'cat-general' || p.tx.categoryId === fallbackExpense) &&
          p.row.category.trim().toLowerCase() !== 'general';
        return {
          line: p.row.line,
          include: true,
          date: p.tx.date,
          type: p.tx.type,
          amountMinor: p.tx.amount,
          merchant: p.tx.merchant || p.tx.subtitle || p.tx.note || '',
          note: p.tx.note || '',
          accountId: p.tx.accountId,
          currency: p.tx.currency,
          duplicate: false,
          fallbackBadge: fellBack,
          tx: p.tx,
        };
      }
      if (p.status === 'duplicate') {
        return {
          line: p.row.line,
          include: false,
          date: p.row.date,
          type: (p.tx?.type ?? 'EXPENSE') as DisplayRow['type'],
          amountMinor: p.tx?.amount ?? 0,
          merchant: p.row.merchant || p.row.subtitle || p.row.note || '',
          note: '',
          accountId: p.tx?.accountId ?? '',
          currency: p.tx?.currency ?? settings.currency ?? 'PHP',
          duplicate: true,
          fallbackBadge: false,
        };
      }
      return {
        line: p.row.line,
        include: false,
        date: '',
        type: 'EXPENSE' as const,
        amountMinor: 0,
        merchant: p.row.merchant || p.row.subtitle || p.row.note || '',
        note: '',
        accountId: '',
        currency: settings.currency ?? 'PHP',
        duplicate: false,
        errorLabel: p.reason ? t(`import.reasons.${p.reason}`, p.reasonParams ?? {}) : undefined,
        fallbackBadge: false,
      };
    });

  const parsed: DisplayRow[] = useMemo(() => {
    if (records.length < (hasHeaders ? 2 : 1)) return [];
    const ctx = { accounts: openAccounts, categories, existing: transactions };
    if (effectiveFormat === 'PALDO') {
      const res = CsvImportService.parse(fileText);
      if (!res.ok) return [];
      const plan = CsvImportService.plan(res.rows, ctx);
      return adaptedPaldo(plan.rows);
    }
    const target = openAccounts.find((a) => a.id === accountId);
    const reviewed = planGenericImport(records, hasHeaders, ctx, {
      accountId,
      mapping,
      dateOrder,
      positiveMeans,
      fallbackExpenseCategoryId: fallbackExpense,
      fallbackIncomeCategoryId: fallbackIncome,
    });
    return reviewed.map((r) => ({
      line: r.line,
      include: r.include,
      date: r.date,
      type: r.type,
      amountMinor: r.amountMinor,
      merchant: r.merchant,
      note: r.note,
      accountId: r.accountId,
      currency: target?.currency ?? settings.currency ?? 'PHP',
      duplicate: r.duplicate,
      errorLabel: r.error
        ? t(`import.reasons.${r.error === 'zero-amount' ? 'zero-amount' : r.error === 'missing-columns' ? 'missing-columns' : r.error === 'bad-date' ? 'bad-date' : r.error === 'bad-amount' ? 'bad-amount' : 'unknown-account'}`, {
            value: r.error === 'bad-date' ? r.rawDate ?? '' : r.error === 'bad-amount' ? r.rawAmount ?? '' : '',
          })
        : undefined,
      fallbackBadge: !r.error && !r.duplicate,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, hasHeaders, effectiveFormat, fileText, accountId, mapping, dateOrder, positiveMeans, fallbackExpense, fallbackIncome, openAccounts, categories, transactions]);

  // User include/exclude choices layer on top of planner defaults.
  const rows = useMemo(
    () => parsed.map((r) => (overrides.has(r.line) ? { ...r, include: overrides.get(r.line)! } : r)),
    [parsed, overrides]
  );
  const readyRows = rows.filter((r) => r.include && !r.errorLabel && !r.duplicate);
  const dupCount = rows.filter((r) => r.duplicate).length;
  const invalidCount = rows.filter((r) => r.errorLabel).length;

  const setAll = (value: boolean) => {
    const next = new Map<number, boolean>();
    for (const r of rows) {
      if (!r.errorLabel && !r.duplicate) next.set(r.line, value);
    }
    setOverrides(next);
  };

  const handleImport = () => {
    if (submittedRef.current || readyRows.length === 0) return;
    submittedRef.current = true;
    let payloads: Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>;
    if (effectiveFormat === 'PALDO') {
      payloads = readyRows
        .filter((r) => r.tx)
        .map((r) => {
          const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = r.tx!;
          return rest;
        });
    } else {
      // Re-run the planner so payload categories match the review exactly,
      // then re-apply the user's include/exclude choices by line number.
      const ctx = { accounts: openAccounts, categories, existing: transactions };
      const reviewed = planGenericImport(records, hasHeaders, ctx, {
        accountId,
        mapping,
        dateOrder,
        positiveMeans,
        fallbackExpenseCategoryId: fallbackExpense,
        fallbackIncomeCategoryId: fallbackIncome,
      }).map((r) => (overrides.has(r.line) ? { ...r, include: overrides.get(r.line)! } : r));
      payloads = reviewRowsToTransactions(reviewed, accounts, 'user-1', settings.currency || 'PHP');
    }
    // Per-account balance preview for the result screen.
    const byAcc = new Map<string, number>();
    for (const p of payloads) {
      const signed = p.type === 'INCOME' ? p.amount : -p.amount;
      byAcc.set(p.accountId, (byAcc.get(p.accountId) ?? 0) + signed);
      if (p.type === 'TRANSFER' && p.destinationAccountId) {
        byAcc.set(p.destinationAccountId, (byAcc.get(p.destinationAccountId) ?? 0) + p.amount);
      }
    }
    setDeltas(Array.from(byAcc.entries()).map(([accountId, delta]) => ({ accountId, delta })));
    setImportedCount(payloads.length);
    onImport(payloads, { silent: true });
    setStep('DONE');
  };

  const selectCls =
    'w-full rounded-xl border border-(--line) bg-(--surface) px-3 py-2 text-xs font-semibold text-(--ink) outline-none focus:border-emerald-600 cursor-pointer';
  const colOptions = (allowNone: boolean) => (
    <>
      {allowNone && <option value="">{t('import.colNone')}</option>}
      {Array.from({ length: columnCount }, (_, i) => (
        <option key={i} value={i}>
          {(hasHeaders ? headers[i] : `Column ${i + 1}`) || `Column ${i + 1}`} — {columnSample(i)}
        </option>
      ))}
    </>
  );

  const renderReviewRow = (r: DisplayRow) => {
    const acc = accountMap.get(r.accountId);
    const selectable = !r.errorLabel && !r.duplicate;
    const typeColor =
      r.type === 'INCOME' ? 'text-emerald-700' : r.type === 'EXPENSE' ? 'text-(--ink)' : 'text-indigo-700';
    return (
      <li
        key={r.line}
        className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${
          r.errorLabel
            ? 'border-rose-200 bg-rose-50/60'
            : r.duplicate
            ? 'border-(--line) bg-(--surface-2) opacity-70'
            : 'border-(--line) bg-(--surface)'
        }`}
      >
        <input
          type="checkbox"
          checked={r.include}
          disabled={!selectable}
          onChange={(e) => setOverrides(new Map(overrides).set(r.line, e.target.checked))}
          aria-label={`${r.merchant || r.note || `Row ${r.line}`} — ${r.date}`}
          className="h-4 w-4 shrink-0 accent-emerald-700"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-(--ink)">{r.merchant || r.note || `Row ${r.line}`}</p>
          <p className="text-[11px] font-semibold text-(--ink-3)">
            {r.date ? DateUtils.formatDisplayDate(r.date) : `Row ${r.line}`}
            {acc ? ` · ${acc.name}` : ''}
            {r.fallbackBadge && !r.errorLabel && (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800">
                {t('import.fallbackBadge')}
              </span>
            )}
          </p>
          {r.errorLabel && <p className="text-[11px] font-bold text-rose-700">{r.errorLabel}</p>}
          {r.duplicate && (
            <p className="flex items-center gap-1 text-[11px] font-bold text-(--ink-3)">
              <Copy className="h-3 w-3" /> {t('import.dupBadge')}
            </p>
          )}
        </div>
        <span className={`shrink-0 text-xs font-black ${typeColor}`}>
          {r.type === 'INCOME' ? '+' : r.type === 'EXPENSE' ? '−' : '⇄'}
          {MoneyValue.fromMinorUnits(r.amountMinor, r.currency).format()}
        </span>
      </li>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('import.title')} maxWidth="lg">
      {/* Stepper */}
      <ol className="flex items-center gap-1 text-[11px] font-bold" aria-label="progress">
        {(['FILE', 'MAP', 'REVIEW', 'DONE'] as Step[]).map((s, i) => {
          const labels: Record<Step, string> = {
            FILE: t('import.stepFile'),
            MAP: t('import.stepMap'),
            REVIEW: t('import.stepReview'),
            DONE: t('import.stepDone'),
          };
          const order: Step[] = ['FILE', 'MAP', 'REVIEW', 'DONE'];
          const active = order.indexOf(step) >= i;
          return (
            <li key={s} className={`flex flex-1 items-center gap-1 ${i > 0 ? 'ml-1' : ''}`}>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                  active ? 'bg-emerald-700 text-white' : 'bg-(--surface-3) text-(--ink-3)'
                }`}
              >
                {i + 1}
              </span>
              <span className={active ? 'text-(--ink)' : 'text-(--ink-3)'}>{labels[s]}</span>
            </li>
          );
        })}
      </ol>

      {step === 'FILE' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-(--ink-2)">{t('import.fileHint')}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-(--line) bg-(--surface-2) px-4 py-8 text-(--ink-2) transition-colors hover:border-emerald-500 hover:text-emerald-800 cursor-pointer"
          >
            <Upload className="h-6 w-6" />
            <span className="text-sm font-black">{t('import.pickFile')}</span>
          </button>
          {fileError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800" role="alert">
              {fileError}
            </p>
          )}
        </div>
      )}

      {step === 'MAP' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-(--line) bg-(--surface-2) px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-(--ink-3)" />
            <span className="min-w-0 flex-1 truncate text-xs font-bold text-(--ink)">{fileName}</span>
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
              {effectiveFormat === 'PALDO' ? t('import.formatPaldo') : t('import.formatGeneric')}
            </span>
            <span className="shrink-0 text-[11px] font-bold text-(--ink-3)">
              {t('import.rowsFound', { count: records.length - (hasHeaders ? 1 : 0) })}
            </span>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-(--ink-2)">
            <input
              type="checkbox"
              checked={hasHeaders}
              onChange={(e) => setHasHeaders(e.target.checked)}
              className="h-4 w-4 accent-emerald-700"
            />
            {t('import.hasHeaders')}
          </label>

          {effectiveFormat === 'GENERIC' ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label={t('import.mapDate')}>
                  <select value={mapping.date} onChange={(e) => setMapping({ ...mapping, date: Number(e.target.value) })} className={selectCls}>
                    {colOptions(false)}
                  </select>
                </Field>
                <Field label={t('import.mapDesc')}>
                  <select value={mapping.description} onChange={(e) => setMapping({ ...mapping, description: Number(e.target.value) })} className={selectCls}>
                    {colOptions(false)}
                  </select>
                </Field>
                <Field label={t('import.mapAmount')}>
                  <select value={mapping.amount} onChange={(e) => setMapping({ ...mapping, amount: Number(e.target.value) })} className={selectCls}>
                    {colOptions(false)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t('import.mapType')}>
                  <select
                    value={mapping.type ?? ''}
                    onChange={(e) => setMapping({ ...mapping, type: e.target.value === '' ? null : Number(e.target.value) })}
                    className={selectCls}
                  >
                    {colOptions(true)}
                  </select>
                </Field>
                <Field label={t('import.mapNote')}>
                  <select
                    value={mapping.note ?? ''}
                    onChange={(e) => setMapping({ ...mapping, note: e.target.value === '' ? null : Number(e.target.value) })}
                    className={selectCls}
                  >
                    {colOptions(true)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t('import.targetAccount')}>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectCls}>
                    {openAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('import.dateOrder')}>
                  <select value={dateOrder} onChange={(e) => setDateOrder(e.target.value as ImportDateOrder)} className={selectCls}>
                    <option value="AUTO">{t('import.orderAuto')}</option>
                    <option value="MDY">{t('import.orderMDY')}</option>
                    <option value="DMY">{t('import.orderDMY')}</option>
                  </select>
                </Field>
              </div>
              <div>
                <span className="mb-1 block text-xs font-bold text-(--ink-2)">{t('import.positiveMeans')}</span>
                <div className="grid grid-cols-2 gap-1 rounded-xl border border-(--line)/80 bg-(--surface-2) p-1" role="radiogroup" aria-label={t('import.positiveMeans')}>
                  {(['EXPENSE', 'INCOME'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={positiveMeans === v}
                      onClick={() => setPositiveMeans(v)}
                      className={`rounded-lg py-2 text-xs font-bold transition-colors cursor-pointer ${
                        positiveMeans === v ? 'bg-(--surface) text-(--ink) shadow-sm' : 'text-(--ink-3) hover:text-(--ink)'
                      }`}
                    >
                      {v === 'EXPENSE' ? t('import.positiveExpense') : t('import.positiveIncome')}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
              {t('import.formatPaldo')} — {t('import.rowsFound', { count: records.length - 1 })}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('import.fallbackExpense')}>
              <select value={fallbackExpense} onChange={(e) => setFallbackExpense(e.target.value)} className={selectCls}>
                {expenseCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('import.fallbackIncome')}>
              <select value={fallbackIncome} onChange={(e) => setFallbackIncome(e.target.value)} className={selectCls}>
                {incomeCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setStep('FILE')}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-(--surface-3) py-3 text-xs font-bold text-(--ink-2) transition-colors hover:bg-(--line) cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" /> {t('import.back')}
            </button>
            <button
              type="button"
              onClick={() => {
                setOverrides(new Map());
                setStep('REVIEW');
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-(--brand) py-3 text-xs font-bold text-(--accent) shadow-md transition-colors hover:bg-(--brand-hover) cursor-pointer"
            >
              {t('import.continue')} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === 'REVIEW' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-black">
            <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t('import.ready', { count: readyRows.length })}
            </span>
            {dupCount > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-(--line) bg-(--surface-2) px-2.5 py-1 text-(--ink-2)">
                <Copy className="h-3.5 w-3.5" /> {t('import.dups', { count: dupCount })}
              </span>
            )}
            {invalidCount > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" /> {t('import.invalid', { count: invalidCount })}
              </span>
            )}
            <span className="ml-auto flex gap-2">
              <button type="button" onClick={() => setAll(true)} className="text-[11px] font-bold text-emerald-800 hover:underline cursor-pointer">
                {t('import.selectAll')}
              </button>
              <button type="button" onClick={() => setAll(false)} className="text-[11px] font-bold text-(--ink-3) hover:underline cursor-pointer">
                {t('import.selectNone')}
              </button>
            </span>
          </div>

          {rows.length > REVIEW_RENDER_CAP && (
            <p className="text-[11px] font-bold text-(--ink-3)">
              {t('import.showingFirst', { count: REVIEW_RENDER_CAP, total: rows.length })}
            </p>
          )}
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
            {rows.slice(0, REVIEW_RENDER_CAP).map(renderReviewRow)}
          </ul>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setStep('MAP')}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-(--surface-3) py-3 text-xs font-bold text-(--ink-2) transition-colors hover:bg-(--line) cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" /> {t('import.back')}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={readyRows.length === 0}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-(--brand) py-3 text-xs font-bold text-(--accent) shadow-md transition-colors hover:bg-(--brand-hover) disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="h-4 w-4" /> {t('import.importCta', { count: readyRows.length })}
            </button>
          </div>
        </div>
      )}

      {step === 'DONE' && (
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h4 className="text-sm font-black text-(--ink)">{t('import.resultTitle', { count: importedCount })}</h4>
          {deltas.length > 0 && (
            <ul className="space-y-1.5 text-left">
              {deltas.map((d) => {
                const acc = accountMap.get(d.accountId);
                if (!acc) return null;
                return (
                  <li
                    key={d.accountId}
                    className="flex items-center justify-between rounded-xl border border-(--line) bg-(--surface-2) px-3 py-2 text-xs font-bold"
                  >
                    <span className="text-(--ink-2)">{acc.name}</span>
                    <span className={d.delta >= 0 ? 'text-emerald-700' : 'text-(--ink)'}>
                      {d.delta >= 0 ? '+' : '−'}
                      {MoneyValue.fromMinorUnits(Math.abs(d.delta), acc.currency).format()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs font-semibold text-amber-900">
            {t('import.resultHint')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-(--brand) py-3 text-xs font-bold text-(--accent) shadow-md transition-colors hover:bg-(--brand-hover) cursor-pointer"
          >
            <X className="h-4 w-4" /> {t('import.doneCta')}
          </button>
        </div>
      )}
    </Modal>
  );
};
