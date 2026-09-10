import { useMemo, useState } from 'react';
import { Shield, Minus, Plus } from 'lucide-react';
import { t } from '../i18n/core';
import type { Category, Transaction, UserSettings } from '../types';
import { CurrencyCode } from '../types';
import { DateUtils } from '../domain/date/DateUtils';
import { MoneyValue } from '../domain/money/MoneyValue';
import {
  EmergencyFundEngine,
  EF_MAX_MONTHS,
  EF_MIN_MONTHS,
  type EmergencyFundReport,
} from '../domain/emergency/EmergencyFundEngine';

/**
 * Emergency Fund card — the first thing in the Goals section. Every number
 * on screen is explainable in the same card: reserve (a setting you edit
 * here), essential monthly spend (your own last complete months), the
 * multiplier you pick, and the target that follows.
 */
const EmergencyFundCard: React.FC<{
  settings: UserSettings;
  transactions: Transaction[];
  categories: Category[];
  onUpdateSettings: (s: UserSettings) => void;
}> = ({ settings, transactions, categories, onUpdateSettings }) => {
  const [editingReserve, setEditingReserve] = useState(false);
  const [reserveDraft, setReserveDraft] = useState('');

  const currency = settings.currency as CurrencyCode;
  const report: EmergencyFundReport = useMemo(
    () => EmergencyFundEngine.computeReport(settings, transactions, categories),
    [settings, transactions, categories]
  );

  const fmt = (minor: number, cur: CurrencyCode = currency) =>
    MoneyValue.fromMinorUnits(minor, cur).format();

  const statusBadge =
    report.status === 'ON_TARGET'
      ? { text: t('plans.efOnTarget'), cls: 'bg-emerald-100 text-emerald-800' }
      : report.status === 'BUILDING'
      ? { text: t('plans.efBuilding'), cls: 'bg-amber-100 text-amber-800' }
      : report.status === 'NO_ESSENTIAL_SPEND'
      ? { text: t('plans.efNoEssential'), cls: 'bg-(--line) text-(--ink-2)' }
      : { text: t('plans.efNoData'), cls: 'bg-(--line) text-(--ink-2)' };

  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE' && !c.isArchived);

  const toggleEssential = (catId: string) => {
    const current = report.essentialCategoryIds;
    const next = current.includes(catId) ? current.filter((id) => id !== catId) : [...current, catId];
    onUpdateSettings({ ...settings, essentialCategoryIds: next });
  };

  const setMonths = (delta: number) => {
    const next = Math.min(EF_MAX_MONTHS, Math.max(EF_MIN_MONTHS, report.monthsMultiplier + delta));
    onUpdateSettings({ ...settings, emergencyFundMonths: next });
  };

  const commitReserve = () => {
    const major = Number.parseFloat(reserveDraft);
    if (Number.isFinite(major) && major >= 0) {
      onUpdateSettings({ ...settings, minimumReserve: MoneyValue.fromMajorUnits(major, currency).getMinorUnits() });
    }
    setEditingReserve(false);
  };

  return (
    <div className="rounded-2xl bg-(--surface) p-4 shadow-sm border border-(--line-soft) space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Shield className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-(--ink)">{t('plans.efTitle')}</h3>
            <p className="text-[10px] font-medium text-(--ink-3)">
              {t('plans.efSubtitle', { months: report.monthLabels.map((l) => DateUtils.formatDisplayDate(`${l}-01`)).join(' · ') })}
            </p>
          </div>
        </div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusBadge.cls}`}>{statusBadge.text}</span>
      </div>

      {report.status === 'NO_ESSENTIAL_DATA' ? (
        <p className="rounded-xl bg-(--surface-2) p-3 text-[11px] font-medium text-(--ink-2)">
          {t('plans.efNoDataHint')}
        </p>
      ) : (
        <>
          <div>
            <div className="flex items-end justify-between mb-1">
              <div>
                <span className="text-2xl font-extrabold text-(--ink)">
                  {report.monthsCovered != null ? report.monthsCovered.toFixed(1) : '—'}
                </span>{' '}
                <span className="text-xs font-bold text-(--ink-3)">{t('plans.efMonthsCovered')}</span>
              </div>
              <span className="text-[11px] font-bold text-(--ink-3)">
                {fmt(report.currentMinor)} / {fmt(report.targetMinor)}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-(--surface-3) overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${report.progressPct}%` }} />
            </div>
          </div>

          {/* Every line is the arithmetic the number is made of. */}
          <div className="space-y-1.5 rounded-xl bg-(--surface-2) p-3 text-[11px] font-medium">
            <div className="flex items-center justify-between">
              <span className="text-(--ink-2)">{t('plans.efReserveNow')}</span>
              <span className="flex items-center gap-1.5">
                <span className="font-bold text-(--ink)">{fmt(report.currentMinor)}</span>
                {!editingReserve ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReserveDraft(
                        MoneyValue.fromMinorUnits(report.currentMinor, currency).getMajorUnits().toString()
                      );
                      setEditingReserve(true);
                    }}
                    className="rounded border border-(--line) px-1.5 py-0.5 text-[10px] font-bold text-(--ink-3) hover:text-(--ink) cursor-pointer"
                  >
                    {t('plans.efAdjust')}
                  </button>
                ) : (
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      value={reserveDraft}
                      onChange={(e) => setReserveDraft(e.target.value)}
                      className="w-20 rounded border border-(--line) px-1.5 py-0.5 text-[11px]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={commitReserve}
                      className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white cursor-pointer"
                    >
                      ✓
                    </button>
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-(--ink-2)">{t('plans.efEssentialPerMonth')}</span>
              <span className="font-bold text-(--ink)">
                {fmt(report.monthlyEssentialMinor)}
                <span className="font-medium text-(--ink-3)">
                  {' '}
                  · {t('plans.efFromMonths', { n: report.monthsAnalyzed })}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-(--ink-2)">{t('plans.efTarget')}</span>
              <span className="font-bold text-(--ink)">
                {fmt(report.targetMinor)}
                <span className="font-medium text-(--ink-3)">
                  {' '}
                  · {report.monthsMultiplier} × {fmt(report.monthlyEssentialMinor)}
                </span>
              </span>
            </div>
            {report.status === 'BUILDING' && (
              <div className="flex items-center justify-between">
                <span className="text-(--ink-2)">{t('plans.efRemaining')}</span>
                <span className="font-bold text-amber-700">{fmt(report.remainingMinor)}</span>
              </div>
            )}
          </div>

          {/* User-controlled levers — changing either recomputes the target. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-(--line) bg-(--surface) px-1.5 py-1">
              <button
                type="button"
                onClick={() => setMonths(-1)}
                disabled={report.monthsMultiplier <= EF_MIN_MONTHS}
                className="flex h-5 w-5 items-center justify-center rounded bg-(--surface-3) text-(--ink-2) disabled:opacity-40 cursor-pointer"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="min-w-[52px] text-center text-[11px] font-bold text-(--ink)">
                {report.monthsMultiplier} {t('plans.efMonths')}
              </span>
              <button
                type="button"
                onClick={() => setMonths(1)}
                disabled={report.monthsMultiplier >= EF_MAX_MONTHS}
                className="flex h-5 w-5 items-center justify-center rounded bg-(--surface-3) text-(--ink-2) disabled:opacity-40 cursor-pointer"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {expenseCategories.map((cat) => {
                const active = report.essentialCategoryIds.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleEssential(cat.id)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
                      active
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-(--line) bg-(--surface) text-(--ink-3) hover:text-(--ink)'
                    }`}
                    title={t('plans.efEssentialCatsHint')}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default EmergencyFundCard;

