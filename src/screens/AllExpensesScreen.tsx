import React, { useState } from 'react';
import { Account, Category, Transaction, UserSettings } from '../types';
import { WaveCard } from '../components/ui/WaveCard';
import { FilterChips } from '../components/ui/FilterChips';
import { TransactionItem } from '../components/ui/TransactionItem';
import { DateUtils } from '../domain/date/DateUtils';
import { MoneyValue } from '../domain/money/MoneyValue';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { ChevronLeft, Download, ChevronDown, Search, Plus, Sparkles } from 'lucide-react';
import { FinovaStorage } from '../services/storage/FinovaStorage';

interface AllExpensesScreenProps {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  settings: UserSettings;
  onBackToHome: () => void;
  onSelectTransaction: (tx: Transaction) => void;
}

export const AllExpensesScreen: React.FC<AllExpensesScreenProps> = ({
  accounts,
  transactions,
  categories,
  settings,
  onBackToHome,
  onSelectTransaction,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth] = useState('May 26');

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const currency = settings.currency || 'PHP';
  const currencySymbol = MoneyValue.zero(currency).getCurrencySymbol();

  // Filter transactions dynamically
  const filtered = TransactionEngine.filterTransactions(transactions, {
    searchQuery,
    categoryId: selectedCategoryId !== 'ALL' ? selectedCategoryId : undefined,
    type: 'EXPENSE',
    sortBy: 'NEWEST',
  });

  // Dynamically calculate total spent from real transactions
  const totalExpenseMinor = filtered.reduce((sum, tx) => sum + tx.amount, 0);
  const totalSpentMoney = MoneyValue.fromMinorUnits(totalExpenseMinor, currency);

  // Group filtered transactions by date
  const groupedDatesMap = new Map<string, { transactions: Transaction[]; dayTotal: number }>();
  for (const tx of filtered) {
    const existing = groupedDatesMap.get(tx.date) || { transactions: [], dayTotal: 0 };
    existing.transactions.push(tx);
    existing.dayTotal += tx.amount;
    groupedDatesMap.set(tx.date, existing);
  }

  const sortedDates = Array.from(groupedDatesMap.keys()).sort((a, b) => b.localeCompare(a));
  const hasExpenses = filtered.length > 0;

  const handleExport = () => {
    if (transactions.length === 0) {
      alert('No transactions recorded yet to export.');
      return;
    }
    const csvContent = FinovaStorage.exportToCSV(transactions, categories, accounts);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `finova_expenses_${DateUtils.getTodayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 sm:space-y-5 pb-6">
      {/* 1. Top Bar */}
      <div className="flex items-center justify-between py-1">
        <button
          type="button"
          onClick={onBackToHome}
          className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl bg-white text-slate-800 shadow-xs border border-slate-200/80 hover:bg-slate-50 transition-colors cursor-pointer"
          aria-label="Back to Home"
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.5]" />
        </button>

        <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
          All Expenses
        </h2>

        <button
          type="button"
          onClick={handleExport}
          title="Export CSV"
          className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-2xl bg-white text-slate-800 shadow-xs border border-slate-200/80 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <Download className="h-4 w-4 sm:h-5 sm:w-5 stroke-[2.2]" />
        </button>
      </div>

      {/* 2. Total Spent WaveCard (100% Dynamic Real Math) */}
      <WaveCard
        subtitle="TOTAL SPENT"
        amount={totalSpentMoney.format({ includeSymbol: false })}
        currencySymbol={currencySymbol}
        trendText={hasExpenses ? `${filtered.length} entries` : 'Zero Spend'}
        trendDirection={hasExpenses ? 'down' : 'neutral'}
        metaText={`${filtered.length} transactions`}
        rightBadge={
          <div className="flex items-center gap-1.5 rounded-full bg-[#183625] px-3.5 py-1.5 text-xs font-black text-white border border-emerald-800/60 shadow-xs">
            <span>{selectedMonth}</span>
            <ChevronDown className="h-3.5 w-3.5 text-emerald-200" />
          </div>
        }
      />

      {/* 3. Category Filter Chips Carousel */}
      <div data-tour="category-chips">
        <FilterChips
          categories={categories.filter((c) => c.type === 'EXPENSE')}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={setSelectedCategoryId}
        />
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search transactions, merchants, notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-600 shadow-xs"
        />
      </div>

      {/* 4. Date Group Timeline List or Zero State */}
      <div className="space-y-4 pt-1">
        {!hasExpenses ? (
          <div className="rounded-[28px] bg-white p-6 text-center border border-slate-200/80 shadow-xs space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <h4 className="text-xs sm:text-sm font-black text-slate-900">No Expenses Recorded</h4>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
              All transactions recorded with the <strong>+</strong> button will appear here grouped chronologically.
            </p>
          </div>
        ) : (
          sortedDates.map((dateStr) => {
            const group = groupedDatesMap.get(dateStr)!;
            const dayAbbr = DateUtils.getDayAbbreviation(dateStr);
            const dateDisplay = DateUtils.formatDisplayDate(dateStr, { fullYear: true });
            const dayTotalMoney = MoneyValue.fromMinorUnits(group.dayTotal, currency);

            return (
              <div key={dateStr} className="space-y-2">
                {/* Date Header Badge Row */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-[#183625] px-2 py-0.5 text-[10px] sm:text-xs font-black text-white tracking-wider">
                      {dayAbbr}
                    </span>
                    <span className="text-xs sm:text-sm font-black text-slate-700">
                      {dateDisplay}
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm font-black text-slate-900">
                    {dayTotalMoney.format()}
                  </span>
                </div>

                {/* Day Transactions */}
                <div className="space-y-2">
                  {group.transactions.map((tx) => (
                    <TransactionItem
                      key={tx.id}
                      transaction={tx}
                      category={categoryMap.get(tx.categoryId)}
                      accountName={accountMap.get(tx.accountId)?.name}
                      onClick={onSelectTransaction}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
