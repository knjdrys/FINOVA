import React from 'react';
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
} from 'lucide-react';
import { Category, Transaction } from '../../types';
import { MoneyValue } from '../../domain/money/MoneyValue';

interface TransactionItemProps {
  transaction: Transaction;
  category?: Category;
  accountName?: string;
  onClick?: (transaction: Transaction) => void;
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

export const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction,
  category,
  accountName,
  onClick,
}) => {
  const IconComponent = category?.icon ? ICON_MAP[category.icon] || CircleDollarSign : CircleDollarSign;
  const money = MoneyValue.fromMinorUnits(transaction.amount, transaction.currency);

  const isIncome = transaction.type === 'INCOME';
  const isTransfer = transaction.type === 'TRANSFER';

  // Card Icon container styles from screenshot
  const isFood = category?.id === 'cat-food' || transaction.categoryId === 'cat-food';
  const isGroceries = category?.id === 'cat-groceries' || transaction.categoryId === 'cat-groceries';
  const isBills = category?.id === 'cat-bills' || transaction.categoryId === 'cat-bills';

  const bgColor = isFood
    ? '#FFEDD5'
    : isGroceries
    ? '#D1FAE5'
    : isBills
    ? '#E0E7FF'
    : category?.bgColor || (isIncome ? '#D1FAE5' : '#F1F5F9');

  const iconColor = isFood
    ? '#EA580C'
    : isGroceries
    ? '#059669'
    : isBills
    ? '#4F46E5'
    : category?.color || (isIncome ? '#059669' : '#334155');

  const titleText = transaction.merchant || category?.name || 'Transaction';
  const subtitleText = transaction.subtitle || category?.name || 'Expense';
  const noteSubline = transaction.note || `${accountName || 'Personal Account'} • ${category?.name || 'General'}`;

  return (
    <div
      onClick={() => onClick?.(transaction)}
      className="group relative flex items-center justify-between rounded-[22px] bg-white p-3.5 shadow-xs border border-slate-100/80 transition-all duration-150 hover:shadow-md hover:border-emerald-200/60 active:scale-[0.99] cursor-pointer"
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* Rounded Icon Box with emoji or icon */}
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl shadow-xs"
          style={{ backgroundColor: bgColor, color: iconColor }}
        >
          {category?.emoji ? (
            <span className="text-xl select-none">{category.emoji}</span>
          ) : (
            <IconComponent className="h-6 w-6 stroke-[2.2]" />
          )}
        </div>

        {/* Multi-line Details matching screenshot */}
        <div className="min-w-0 flex-1 pr-2">
          <div className="flex items-center gap-1.5">
            <h4 className="truncate text-sm font-extrabold text-slate-900 tracking-tight">
              {titleText}
            </h4>
            {isTransfer && (
              <span className="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[9px] font-bold text-blue-700">
                Transfer
              </span>
            )}
          </div>
          <p className="truncate text-xs font-semibold text-slate-400 mt-0.2">
            {subtitleText}
          </p>
          <p className="truncate text-[10px] font-medium text-slate-400 mt-0.5">
            {noteSubline}
          </p>
        </div>
      </div>

      {/* Amount Display */}
      <div className="shrink-0 text-right">
        <p className="text-sm sm:text-base font-black tracking-tight text-slate-900">
          {isIncome ? '+' : ''}
          {money.format()}
        </p>
      </div>
    </div>
  );
};
