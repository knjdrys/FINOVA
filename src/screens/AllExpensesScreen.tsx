import React, { useEffect, useMemo, useState } from 'react';
import { Account, Category, Transaction, TransactionType, UserSettings } from '../types';
import { WaveCard } from '../components/ui/WaveCard';
import { FilterChips } from '../components/ui/FilterChips';
import { TransactionItem } from '../components/ui/TransactionItem';
import { DateUtils } from '../domain/date/DateUtils';
import { MoneyValue } from '../domain/money/MoneyValue';
import { TransactionEngine, TransactionFilterOptions } from '../domain/transaction/TransactionEngine';
import { groupByCategory } from '../domain/transaction/DayGrouping';
import { ChevronLeft, Download, Search, SlidersHorizontal, X, ReceiptText, Upload } from 'lucide-react';
import { FinovaStorage } from '../services/storage/FinovaStorage';
import { parseTransactionsCSV, ParseResult, ImportableRow } from '../services/storage/CSVImportService';
import { ImportTransactionsModal } from '../components/modals/ImportTransactionsModal';
import { t } from '../i18n/core';
import { notice } from '../components/ui/dialog';

interface AllExpensesScreenProps {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  settings: UserSettings;
  onBackToHome: () => void;
  onSelectTransaction: (tx: Transaction) => void;
  onImportTransactions: (rows: ImportableRow[]) => number;
}

type PeriodFilter = 'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM';
type SortFilter = NonNullable<TransactionFilterOptions['sortBy']>;

function monthBounds(anchor: Date, offsetMonths: number): { start: string; end: string } {
  const y = anchor.getFullYear();
  const m = anchor.getMonth() + offsetMonths;
  const d = new Date(y, m, 1);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const end = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return { start, end };
}

export const AllExpensesScreen: React.FC<AllExpensesScreenProps> = ({
  accounts,
  transactions,
  categories,
  settings,
  onBackToHome,
  onSelectTransaction,
  onImportTransactions,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'ALL'>('ALL');
  const [period, setPeriod] = useState<PeriodFilter>('ALL');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [accountId, setAccountId] = useState('ALL');
  const [minStr, setMinStr] = useState('');
  const [maxStr, setMaxStr] = useState('');
  const [sortBy, setSortBy] = useState<SortFilter>('NEWEST');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Long-list guard: render day groups up to this many rows, then offer more.
  const [visibleLimit, setVisibleLimit] = useState(120);
  // CSV import preview (nothing is applied until the user confirms).
  const [importResult, setImportResult] = useState<ParseResult | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const currency = settings.currency || 'PHP';
  const currencySymbol = MoneyValue.zero(currency).getCurrencySymbol();

  // Stable for the life of this page visit — period boundaries shouldn't
  // recompute on every render (today's date doesn't change mid-session).
  const today = useMemo(() => new Date(), []);
  const periodBounds = useMemo(() => {
    if (period === 'THIS_MONTH') return monthBounds(today, 0);
    if (period === 'LAST_MONTH') return monthBounds(today, -1);
    if (period === 'CUSTOM' && (customStart || customEnd)) {
      return { start: customStart || '0000-01-01', end: customEnd || '9999-12-31' };
    }
    return undefined;
  }, [period, customStart, customEnd, today]);

  const minMinor = minStr ? MoneyValue.parse(minStr, currency).getMinorUnits() : undefined;
  const maxMinor = maxStr ? MoneyValue.parse(maxStr, currency).getMinorUnits() : undefined;

  // Filter transactions dynamically — every control feeds the engine, nothing is hardcoded.
  const filtered = TransactionEngine.filterTransactions(transactions, {
    searchQuery,
    type: typeFilter,
    categoryId: selectedCategoryId !== 'ALL' ? selectedCategoryId : undefined,
    accountId: accountId !== 'ALL' ? accountId : undefined,
    startDate: periodBounds?.start,
    endDate: periodBounds?.end,
    minAmount: minMinor,
    maxAmount: maxMinor,
    sortBy,
  });

  const activeFilterCount =
    (typeFilter !== 'ALL' ? 1 : 0) +
    (selectedCategoryId !== 'ALL' ? 1 : 0) +
    (accountId !== 'ALL' ? 1 : 0) +
    (period !== 'ALL' ? 1 : 0) +
    (minStr || maxStr ? 1 : 0) +
    (searchQuery ? 1 : 0);

  const resetFilters = () => {
    setTypeFilter('ALL');
    setSelectedCategoryId('ALL');
    setAccountId('ALL');
    setPeriod('ALL');
    setCustomStart('');
    setCustomEnd('');
    setMinStr('');
    setMaxStr('');
    setSearchQuery('');
    setSortBy('NEWEST');
  };

  // Adaptive summary — honest about what the current view contains.
  // Goal-funding reservations are excluded: they are savings, not spending.
  const isSpend = (t: Transaction) => t.type === 'EXPENSE' && !TransactionEngine.isGoalFunding(t);
  const expenseMinor = filtered.filter(isSpend).reduce((s, t) => s + t.amount, 0);
  const incomeMinor = filtered.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
  const transferMinor = filtered.filter((t) => t.type === 'TRANSFER').reduce((s, t) => s + t.amount, 0);
  const summary =
    typeFilter === 'EXPENSE'
      ? { label: t('tx.sumSpent'), amount: expenseMinor }
      : typeFilter === 'INCOME'
      ? { label: t('tx.sumEarned'), amount: incomeMinor }
      : typeFilter === 'TRANSFER'
      ? { label: t('tx.sumMoved'), amount: transferMinor }
      : { label: t('tx.netFlow'), amount: incomeMinor - expenseMinor };
  const summaryMoney = MoneyValue.fromMinorUnits(Math.abs(summary.amount), currency);

  // Group filtered transactions by date (day header shows the day's net flow).
  // Funding reservations don't move the net: they are savings, not spending.
  const groupedDatesMap = new Map<string, { transactions: Transaction[]; net: number }>();
  for (const tx of filtered) {
    const existing = groupedDatesMap.get(tx.date) || { transactions: [], net: 0 };
    existing.transactions.push(tx);
    if (tx.type === 'EXPENSE' && !TransactionEngine.isGoalFunding(tx)) existing.net -= tx.amount;
    if (tx.type === 'INCOME') existing.net += tx.amount;
    groupedDatesMap.set(tx.date, existing);
  }
  const sortedDates =
    sortBy === 'NEWEST' || sortBy === 'OLDEST'
      ? Array.from(groupedDatesMap.keys()).sort((a, b) => (sortBy === 'NEWEST' ? b.localeCompare(a) : a.localeCompare(b)))
      : Array.from(groupedDatesMap.keys());

  // Reset the render cap whenever the result set changes.
  useEffect(() => {
    setVisibleLimit(120);
  }, [searchQuery, typeFilter, period, selectedCategoryId, accountId, minStr, maxStr, sortBy, customStart, customEnd, transactions.length]);

  let renderedRows = 0;
  const visibleDates = sortedDates.filter((dateStr) => {
    if (renderedRows >= visibleLimit) return false;
    renderedRows += groupedDatesMap.get(dateStr)!.transactions.length;
    return true;
  });
  const hiddenRows = filtered.length - Math.min(filtered.length, renderedRows);

  const handleImportFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const result = parseTransactionsCSV(text, {
        categories,
        accounts,
        currency,
        existingTx: transactions,
      });
      setImportResult(result);
      setIsImportOpen(true);
    };
    reader.onerror = () => notice(t('dialog.importReadFail'));
    reader.readAsText(file);
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      notice(t('dialog.exportEmpty'));
      return;
    }
    const csvContent = FinovaStorage.exportToCSV(filtered, categories, accounts);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `finova_transactions_${DateUtils.getTodayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectCls =
    'rounded-xl border border-(--line) bg-(--surface) px-2.5 py-1.5 text-[11px] font-bold text-(--ink-2) outline-none focus:border-emerald-600 cursor-pointer';

  return (
    <div className="space-y-4 sm:space-y-5 pb-6">
      {/* 1. Top Bar */}
      <div className="flex items-center justify-between py-1">
        <button
          type="button"
          onClick={onBackToHome}
          className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl bg-(--surface) text-(--ink) shadow-xs border border-(--line)/80 hover:bg-(--surface-2) transition-colors cursor-pointer"
          aria-label={t('tx.backHome')}
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.5]" />
        </button>

        <h2 className="text-base sm:text-lg font-black text-(--ink) tracking-tight">
          {t('tx.title')}
        </h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            title={t('tx.importCsv')}
            aria-label={t('tx.importCsv')}
            className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl bg-(--surface) text-(--ink) shadow-xs border border-(--line)/80 hover:bg-(--surface-2) transition-colors cursor-pointer"
          >
            <Upload className="h-4 w-4 sm:h-5 sm:w-5 stroke-[2.2]" />
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              handleImportFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={handleExport}
            title={t('tx.exportCsv')}
            aria-label={t('tx.exportCsv')}
            className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl bg-(--surface) text-(--ink) shadow-xs border border-(--line)/80 hover:bg-(--surface-2) transition-colors cursor-pointer"
          >
            <Download className="h-4 w-4 sm:h-5 sm:w-5 stroke-[2.2]" />
          </button>
        </div>
      </div>

      {/* 2. Adaptive Summary WaveCard */}
      <WaveCard
        subtitle={summary.label}
        amount={summaryMoney.format({ includeSymbol: false })}
        currencySymbol={summary.amount < 0 ? `-${currencySymbol}` : currencySymbol}
        trendText={t('tx.entries', { count: filtered.length })}
        trendDirection={typeFilter === 'INCOME' ? 'up' : typeFilter === 'EXPENSE' ? 'down' : 'neutral'}
        metaText={
          typeFilter === 'ALL'
            ? `↑ ${MoneyValue.fromMinorUnits(incomeMinor, currency).format()} · ↓ ${MoneyValue.fromMinorUnits(expenseMinor, currency).format()}`
            : undefined
        }
        rightBadge={
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
            aria-label={t('tx.periodAria')}
            className="rounded-full border border-emerald-800/60 bg-[#183625] px-3 py-1.5 text-xs font-black text-white outline-none cursor-pointer"
          >
            <option value="ALL">{t('tx.allTime')}</option>
            <option value="THIS_MONTH">{t('tx.thisMonth')}</option>
            <option value="LAST_MONTH">{t('tx.lastMonth')}</option>
            <option value="CUSTOM">{t('tx.customRange')}</option>
          </select>
        }
      />

      {/* 3. Type segmented control + sort + advanced toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-(--surface-3) p-1" role="tablist" aria-label={t('tx.typeAria')}>
          {(
            [
              ['ALL', t('tx.segAll')],
              ['EXPENSE', t('tx.segExpenses')],
              ['INCOME', t('tx.segIncome')],
              ['TRANSFER', t('tx.segTransfers')],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={typeFilter === value}
              onClick={() => setTypeFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all cursor-pointer ${
                typeFilter === value ? 'bg-(--surface) text-(--ink) shadow-sm' : 'text-(--ink-2) hover:text-(--ink)'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortFilter)}
          aria-label={t('tx.sortAria')}
          className={selectCls + ' ml-auto'}
        >
          <option value="NEWEST">{t('tx.sortNewest')}</option>
          <option value="OLDEST">{t('tx.sortOldest')}</option>
          <option value="HIGHEST_AMOUNT">{t('tx.sortHighest')}</option>
          <option value="LOWEST_AMOUNT">{t('tx.sortLowest')}</option>
        </select>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
            showAdvanced || activeFilterCount > 0
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-(--line) bg-(--surface) text-(--ink-2) hover:border-emerald-300'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t('tx.filters')}
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-black text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* 4. Advanced filters — account, amount range, custom dates (contextual, collapsible) */}
      {showAdvanced && (
        <div className="space-y-3 rounded-2xl border border-(--line) bg-(--surface) p-3 shadow-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-(--ink-3) block mb-1">{t('tx.filterAccount')}</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectCls + ' w-full'} aria-label={t('tx.filterAccount')}>
                <option value="ALL">{t('tx.allAccounts')}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-(--ink-3) block mb-1">{t('common.amount')}</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min="0" placeholder={`${t('tx.filterMin')} ${currencySymbol}`} value={minStr}
                  onChange={(e) => setMinStr(e.target.value)} aria-label={t('tx.minAria')}
                  className={selectCls + ' w-full'}
                />
                <input
                  type="number" min="0" placeholder={`${t('tx.filterMax')} ${currencySymbol}`} value={maxStr}
                  onChange={(e) => setMaxStr(e.target.value)} aria-label={t('tx.maxAria')}
                  className={selectCls + ' w-full'}
                />
              </div>
            </div>
          </div>
          {period === 'CUSTOM' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-(--ink-3) block mb-1">{t('tx.filterFrom')}</label>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={selectCls + ' w-full'} aria-label={t('tx.filterFrom')} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-(--ink-3) block mb-1">{t('tx.filterTo')}</label>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={selectCls + ' w-full'} aria-label={t('tx.filterTo')} />
              </div>
            </div>
          )}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" /> {t('tx.clearFilters')}
            </button>
          )}
        </div>
      )}

      {/* 5. Category Filter Chips Carousel */}
      <div data-tour="category-chips">
        <FilterChips
          categories={categories.filter((c) => c.type === 'EXPENSE')}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={setSelectedCategoryId}
        />
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-(--ink-3)" />
        <input
          type="text"
          placeholder={t('tx.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label={t('tx.searchPlaceholder')}
          className="w-full rounded-2xl border border-(--line) bg-(--surface) pl-10 pr-4 py-2.5 text-xs sm:text-sm font-semibold text-(--ink) placeholder:text-(--ink-3) outline-none focus:border-emerald-600 shadow-xs"
        />
      </div>

      {/* 6. Date Group Timeline List or Zero State */}
      <div className="space-y-4 pt-1 motion-stagger">
        {filtered.length === 0 ? (
          <div className="rounded-[28px] bg-(--surface) p-6 text-center border border-(--line)/80 shadow-xs space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-(--surface-3) text-(--ink-3)">
              {transactions.length === 0 ? <ReceiptText className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </div>
            <h4 className="text-xs sm:text-sm font-black text-(--ink)">
              {transactions.length === 0 ? t('tx.noTransactions') : t('tx.nothingMatches')}
            </h4>
            <p className="text-[11px] text-(--ink-3) max-w-xs mx-auto">
              {transactions.length === 0
                ? t('tx.noTransactionsHint')
                : t('tx.nothingMatchesHint')}
            </p>
            {transactions.length > 0 && activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-1 rounded-full border border-(--line) bg-(--surface) px-3 py-1.5 text-[11px] font-bold text-(--ink-2) hover:border-emerald-300 hover:text-emerald-700 transition-colors cursor-pointer"
              >
                {t('tx.resetFilters')}
              </button>
            )}
          </div>
        ) : (
          visibleDates.map((dateStr) => {
            const group = groupedDatesMap.get(dateStr)!;
            const dayAbbr = DateUtils.getDayAbbreviation(dateStr);
            const dateDisplay = DateUtils.formatDisplayDate(dateStr, { fullYear: true });
            const dayNetMoney = MoneyValue.fromMinorUnits(Math.abs(group.net), currency);
            // Keep similar items (same category) together on date sorts. On
            // amount sorts the engine's amount order is the point, so stay flat.
            const dateSorted = sortBy === 'NEWEST' || sortBy === 'OLDEST';
            const dayGroups = dateSorted
              ? groupByCategory([...group.transactions].sort((a, b) => (b.time ?? '').localeCompare(a.time ?? '')))
              : group.transactions.map((tx) => ({ categoryId: tx.categoryId, items: [tx], totalMinor: tx.amount }));

            return (
              <div key={dateStr} className="space-y-2">
                {/* Date Header Badge Row */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[#183625] px-2 py-0.5 text-[10px] sm:text-xs font-black text-white tracking-wider">
                      {dayAbbr}
                    </span>
                    <span className="text-xs sm:text-sm font-black text-(--ink-2)">
                      {dateDisplay}
                    </span>
                  </div>
                  <span
                    className={`text-xs sm:text-sm font-black ${
                      group.net > 0 ? 'text-emerald-700' : group.net < 0 ? 'text-(--ink)' : 'text-(--ink-3)'
                    }`}
                  >
                    {group.net > 0 ? `+${dayNetMoney.format()}` : group.net < 0 ? `-${dayNetMoney.format()}` : dayNetMoney.format()}
                  </span>
                </div>

                {/* Day Transactions (category-grouped on date sorts) */}
                <div className="space-y-2">
                  {dayGroups.map((g) => (
                    <div key={g.categoryId} className="space-y-2">
                      {dateSorted && g.items.length > 1 && (
                        <div className="flex items-center justify-between px-1">
                          <span className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-(--ink-3)">
                            <span aria-hidden="true">{categoryMap.get(g.categoryId)?.emoji}</span>
                            <span>{categoryMap.get(g.categoryId)?.name || t('tx.generic')}</span>
                            <span className="rounded-full bg-(--surface-3) px-1.5 py-0.5 text-[9px] font-black text-(--ink-2)">
                              {g.items.length}
                            </span>
                          </span>
                          <span className="text-[10px] sm:text-[11px] font-black text-(--ink-2)">
                            {MoneyValue.fromMinorUnits(g.totalMinor, currency).format()}
                          </span>
                        </div>
                      )}
                      {g.items.map((tx) => (
                        <TransactionItem
                          key={tx.id}
                          transaction={tx}
                          category={categoryMap.get(tx.categoryId)}
                          accountName={accountMap.get(tx.accountId)?.name}
                          destinationAccountName={
                            tx.destinationAccountId ? accountMap.get(tx.destinationAccountId)?.name : undefined
                          }
                          categories={categories}
                          onClick={onSelectTransaction}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
        {hiddenRows > 0 && (
          <button
            type="button"
            onClick={() => setVisibleLimit((v) => v + 200)}
            className="w-full rounded-2xl border border-(--line) bg-(--surface) py-2.5 text-xs font-bold text-(--ink-2) hover:border-emerald-300 hover:text-emerald-700 transition-colors cursor-pointer"
          >
            {t('tx.showMore', { count: hiddenRows })}
          </button>
        )}
      </div>

      {/* CSV import preview — confirm here before anything is applied */}
      <ImportTransactionsModal
        isOpen={isImportOpen}
        result={importResult}
        currency={currency}
        onClose={() => {
          setIsImportOpen(false);
          setImportResult(null);
        }}
        onConfirm={(rows) => {
          const count = onImportTransactions(rows);
          setIsImportOpen(false);
          setImportResult(null);
          notice(t('tx.importDone', { count }));
        }}
      />
    </div>
  );
};
