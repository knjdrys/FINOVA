import React, { useEffect, useState } from 'react';
import { UploadCloud, CopyX, AlertTriangle, FileQuestion, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { t } from '../../i18n';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { DateUtils } from '../../domain/date/DateUtils';
import { CurrencyCode } from '../../types';
import { ParseResult } from '../../services/storage/CSVImportService';

/**
 * Import preview — nothing is applied until the user confirms here.
 * Shows what will happen (ready / duplicates / errors) with the first rows,
 * exactly like a premium migration flow: inspect first, commit second.
 */
interface ImportTransactionsModalProps {
  isOpen: boolean;
  result: ParseResult | null;
  currency: CurrencyCode;
  onClose: () => void;
  onConfirm: (rows: ParseResult['valid']) => void;
}

export const ImportTransactionsModal: React.FC<ImportTransactionsModalProps> = ({
  isOpen,
  result,
  currency,
  onClose,
  onConfirm,
}) => {
  // Scroll position resets each time a new file is analyzed.
  const [preview, setPreview] = useState(0);
  useEffect(() => {
    if (isOpen) setPreview(0);
  }, [isOpen, result]);

  if (!result) return null;

  const canImport = result.valid.length > 0;
  const errorFor = (code: string, line: number, detail: string) => {
    switch (code) {
      case 'BAD_DATE':
        return t('tx.importErrDate', { line, detail: detail || '—' });
      case 'BAD_AMOUNT':
        return t('tx.importErrAmount', { line, detail: detail || '—' });
      default:
        return t('tx.importErrGeneric', { line });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('tx.importTitle')}>
      <div className="space-y-4">
        {result.needsColumns ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <FileQuestion className="h-8 w-8 text-rose-500" aria-hidden="true" />
            <p className="text-sm font-bold text-(--ink)">{t('tx.importNeedCols')}</p>
          </div>
        ) : (
          <>
            {/* Outcome summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="text-lg sm:text-xl font-black text-emerald-800">{result.valid.length}</p>
                <p className="text-[10px] sm:text-[11px] font-bold text-emerald-700 uppercase tracking-wide">{t('tx.importReady')}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-center">
                <p className="text-lg sm:text-xl font-black text-amber-700">{result.duplicates}</p>
                <p className="text-[10px] sm:text-[11px] font-bold text-amber-700 uppercase tracking-wide">{t('tx.importDuplicates')}</p>
              </div>
              <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-center">
                <p className="text-lg sm:text-xl font-black text-rose-600">{result.errors.length}</p>
                <p className="text-[10px] sm:text-[11px] font-bold text-rose-600 uppercase tracking-wide">{t('tx.importErrors')}</p>
              </div>
            </div>

            {result.currencyMismatches > 0 && (
              <p className="text-[11px] sm:text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                {t('tx.importCurrencySkipped', { count: result.currencyMismatches })}
              </p>
            )}

            {/* Preview of what will be imported */}
            {canImport && (
              <div className="rounded-2xl border border-(--line-soft) overflow-hidden">
                <div className="max-h-56 overflow-y-auto divide-y divide-(--line-soft)">
                  {result.valid.slice(preview, preview + 8).map((row, i) => (
                    <div key={`${row.id ?? 'new'}-${row.date}-${i}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-(--surface)">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-(--ink) truncate">
                          {row.merchant || t('tx.importNoMerchant')}
                        </p>
                        <p className="text-[10px] sm:text-[11px] font-semibold text-(--ink-3)">
                          {DateUtils.formatDisplayDate(row.date, { fullYear: true })} · {row.categoryName}
                        </p>
                      </div>
                      <div className={`shrink-0 text-xs sm:text-sm font-black ${row.type === 'INCOME' ? 'text-emerald-600' : 'text-(--ink)'}`}>
                        {row.type === 'INCOME' ? '+' : '−'}
                        {MoneyValue.fromMinorUnits(row.amountMinor, currency).format()}
                      </div>
                    </div>
                  ))}
                </div>
                {result.valid.length > 8 && (
                  <div className="flex items-center justify-between px-3.5 py-2 bg-(--surface-2)">
                    <span className="text-[11px] font-bold text-(--ink-3)">
                      {t('tx.importMore', { count: result.valid.length - 8 })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreview((p) => p + 8)}
                      className="text-[11px] font-black text-emerald-700 hover:underline cursor-pointer"
                    >
                      {t('tx.importShowMore')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Row errors */}
            {result.errors.length > 0 && (
              <div className="rounded-2xl border border-rose-200 overflow-hidden">
                <div className="max-h-36 overflow-y-auto divide-y divide-rose-100">
                  {result.errors.map((e, i) => (
                    <div key={`${e.line}-${i}`} className="flex items-center gap-2 px-3.5 py-2 bg-rose-50/60">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />
                      <p className="text-[11px] font-semibold text-rose-700">{errorFor(e.code, e.line, e.detail)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nothing at all? */}
            {!canImport && result.errors.length === 0 && result.duplicates === 0 && (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <FileQuestion className="h-8 w-8 text-slate-400" aria-hidden="true" />
                <p className="text-sm font-bold text-(--ink-2)">{t('tx.importEmpty')}</p>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-(--line) bg-(--surface) px-4 py-2.5 text-xs sm:text-sm font-bold text-(--ink-2) hover:bg-(--surface-2) transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <X className="h-4 w-4" aria-hidden="true" /> {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={!canImport}
            onClick={() => onConfirm(result.valid)}
            className="flex-[2] rounded-2xl bg-emerald-700 px-4 py-2.5 text-xs sm:text-sm font-black text-white shadow-md hover:bg-emerald-800 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
          >
            {canImport ? (
              <>
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
                {t('tx.importConfirm', {
                  count: result.valid.length,
                  total: MoneyValue.fromMinorUnits(
                    result.valid.reduce((s, r) => s + r.amountMinor, 0),
                    currency
                  ).format(),
                })}
              </>
            ) : (
              <>
                <CopyX className="h-4 w-4" aria-hidden="true" />
                {t('tx.importNothing')}
              </>
            )}
          </button>
        </div>
        <p className="text-[10px] sm:text-[11px] text-center font-semibold text-(--ink-3)">
          {t('tx.importReassure')}
        </p>
      </div>
    </Modal>
  );
};
