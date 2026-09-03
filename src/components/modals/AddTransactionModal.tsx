import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Account, Category, CurrencyCode, Transaction, TransactionType } from '../../types';
import { DateUtils } from '../../domain/date/DateUtils';
import { MoneyValue } from '../../domain/money/MoneyValue';
import {
  Utensils,
  ShoppingCart,
  Zap,
  Tv,
  Car,
  ShoppingBag,
  HeartPulse,
  Briefcase,
  Laptop,
  ArrowRightLeft,
  CircleDollarSign,
  LucideIcon,
  Check,
} from 'lucide-react';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  accounts: Account[];
  categories: Category[];
  currency: CurrencyCode;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Utensils,
  ShoppingCart,
  Zap,
  Tv,
  Car,
  ShoppingBag,
  HeartPulse,
  Briefcase,
  Laptop,
  ArrowRightLeft,
};

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  accounts,
  categories,
  currency = 'PHP',
}) => {
  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amountStr, setAmountStr] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'cat-food');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [destinationAccountId, setDestinationAccountId] = useState(accounts[1]?.id || accounts[0]?.id || '');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(DateUtils.getTodayISO());
  const [tagsStr, setTagsStr] = useState('');

  const currencySymbol = MoneyValue.zero(currency).getCurrencySymbol();
  const filteredCategories = categories.filter((c) => !c.isArchived && (type === 'TRANSFER' || c.type === type));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const money = MoneyValue.parse(amountStr, currency);
    if (money.getMinorUnits() <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    if (!accountId) {
      alert('Please select an account.');
      return;
    }

    if (type === 'TRANSFER' && accountId === destinationAccountId) {
      alert('Source and destination accounts must be different for a transfer.');
      return;
    }

    const tags = tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onSave({
      userId: 'user-1',
      type,
      amount: money.getMinorUnits(),
      currency,
      categoryId: type === 'TRANSFER' ? 'cat-transfer' : categoryId,
      accountId,
      destinationAccountId: type === 'TRANSFER' ? destinationAccountId : undefined,
      merchant: merchant.trim() || undefined,
      note: note.trim() || undefined,
      date,
      time: new Date().toTimeString().substring(0, 5),
      tags,
      status: 'CONFIRMED',
    });

    // Reset & close
    setAmountStr('');
    setMerchant('');
    setNote('');
    setTagsStr('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Transaction">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Transaction Type Segmented Toggle */}
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setType('EXPENSE');
              setCategoryId('cat-food');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              type === 'EXPENSE'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => {
              setType('INCOME');
              setCategoryId('cat-salary');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              type === 'INCOME'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Income
          </button>
          <button
            type="button"
            onClick={() => {
              setType('TRANSFER');
              setCategoryId('cat-transfer');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              type === 'TRANSFER'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Transfer
          </button>
        </div>

        {/* Large Amount Input with Dynamic Currency Symbol */}
        <div className="rounded-2xl bg-slate-50 p-4 text-center border border-slate-200/70 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Amount
          </label>
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-2xl font-black text-slate-500">{currencySymbol}</span>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              autoFocus
              required
              className="w-full max-w-[220px] text-center text-3xl sm:text-4xl font-black text-slate-900 bg-transparent outline-none placeholder:text-slate-300"
            />
          </div>
        </div>

        {/* Category Picker (For Expense/Income) */}
        {type !== 'TRANSFER' && (
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">Category</label>
            <div className="grid grid-cols-4 gap-2">
              {filteredCategories.map((cat) => {
                const isSelected = categoryId === cat.id;
                const IconComponent = ICON_MAP[cat.icon] || CircleDollarSign;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-700 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-700'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-xl mb-1.5 shadow-2xs"
                      style={{ backgroundColor: cat.bgColor || '#F1F5F9', color: cat.color }}
                    >
                      {cat.emoji ? (
                        <span className="text-lg select-none">{cat.emoji}</span>
                      ) : (
                        <IconComponent className="h-5 w-5" />
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-slate-800 truncate w-full">
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Account Selection */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              {type === 'TRANSFER' ? 'From Account' : 'Account'}
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 cursor-pointer"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({MoneyValue.fromMinorUnits(acc.currentBalance, currency).format()})
                </option>
              ))}
            </select>
          </div>

          {type === 'TRANSFER' ? (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">To Account</label>
              <select
                value={destinationAccountId}
                onChange={(e) => setDestinationAccountId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 cursor-pointer"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({MoneyValue.fromMinorUnits(acc.currentBalance, currency).format()})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          )}
        </div>

        {/* Merchant & Notes */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Merchant / Payee</label>
            <input
              type="text"
              placeholder="e.g. Imtiaz Stores"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Note / Subtext</label>
            <input
              type="text"
              placeholder="e.g. Weekly groceries"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5">Tags (comma separated)</label>
          <input
            type="text"
            placeholder="groceries, shopping, weekend"
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-emerald-600"
          />
        </div>

        {/* Action Button */}
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#122A1E] py-3.5 text-sm font-bold text-[#D4F63D] shadow-lg shadow-emerald-950/20 transition-transform active:scale-[0.98] hover:bg-[#183625] cursor-pointer"
        >
          <Check className="h-4 w-4 stroke-[3]" />
          <span>Save Transaction</span>
        </button>
      </form>
    </Modal>
  );
};
