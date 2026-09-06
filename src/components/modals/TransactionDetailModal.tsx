import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Account, Category, Transaction } from '../../types';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { TransactionEngine } from '../../domain/transaction/TransactionEngine';
import { Pencil, Trash2, Scissors, Paperclip, X, ArrowRightLeft, ShieldCheck } from 'lucide-react';

interface TransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  accounts: Account[];
  categories: Category[];
  onEdit: (tx: Transaction) => void;
  onDelete: (txId: string) => void;
}

const accountName = (accounts: Account[], id: string | undefined, fallback: string) =>
  (id && accounts.find((a) => a.id === id)?.name) || fallback;

const categoryName = (categories: Category[], id: string) =>
  categories.find((c) => c.id === id)?.name || id;

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  isOpen,
  onClose,
  transaction: tx,
  accounts,
  categories,
  onEdit,
  onDelete,
}) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  if (!tx) return null;

  const money = MoneyValue.fromMinorUnits(tx.amount, tx.currency);
  const allocations = TransactionEngine.getCategoryAllocations(tx);
  const isSplit = tx.type === 'EXPENSE' && Boolean(tx.splitParts && tx.splitParts.length > 0);
  const isTransfer = tx.type === 'TRANSFER';

  const handleClose = () => {
    setConfirmingDelete(false);
    setShowReceipt(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Transaction Details">
      <div className="space-y-4">
        {/* Amount header */}
        <div className="rounded-2xl bg-slate-50 p-4 text-center border border-slate-100">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
            {TransactionEngine.isGoalFunding(tx)
              ? 'Savings set aside'
              : isTransfer
              ? 'Transfer'
              : tx.type === 'INCOME'
              ? 'Income'
              : isSplit
              ? 'Split expense'
              : 'Expense'}
          </span>
          <p className="text-3xl font-black text-slate-900">{money.format()}</p>
          <p className="text-xs font-bold text-slate-700 mt-1">{tx.merchant || categoryName(categories, tx.categoryId)}</p>
          {tx.sourceCommitmentId && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              <ShieldCheck className="h-3 w-3" /> Auto-posted from a plan
            </span>
          )}
        </div>

        {/* Facts */}
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white p-3 text-xs space-y-2">
          <div className="flex justify-between py-1">
            <span className="text-slate-500 font-medium">Date & Time</span>
            <span className="font-bold text-slate-800">
              {tx.date} {tx.time || ''}
            </span>
          </div>

          {isTransfer ? (
            <div className="flex justify-between py-1">
              <span className="text-slate-500 font-medium">Moved</span>
              <span className="flex items-center gap-1.5 font-bold text-slate-800">
                {accountName(accounts, tx.accountId, 'Source')}
                <ArrowRightLeft className="h-3.5 w-3.5 text-blue-600" />
                {accountName(accounts, tx.destinationAccountId, 'Destination')}
              </span>
            </div>
          ) : (
            <div className="flex justify-between py-1">
              <span className="text-slate-500 font-medium">{tx.type === 'INCOME' ? 'Source' : 'Account'}</span>
              <span className="font-bold text-slate-800">{accountName(accounts, tx.accountId, 'Default Account')}</span>
            </div>
          )}

          {!isTransfer && !isSplit && (
            <div className="flex justify-between py-1">
              <span className="text-slate-500 font-medium">Category</span>
              <span className="font-bold text-slate-800">{categoryName(categories, tx.categoryId)}</span>
            </div>
          )}

          {tx.note && (
            <div className="flex justify-between py-1">
              <span className="text-slate-500 font-medium">Note</span>
              <span className="font-semibold text-slate-800 text-right max-w-[60%]">{tx.note}</span>
            </div>
          )}

          {tx.tags && tx.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 py-1">
              <span className="text-slate-500 font-medium mr-1">Tags</span>
              {tx.tags.map((t) => (
                <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Split breakdown */}
        {isSplit && (
          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-emerald-800 mb-2">
              <Scissors className="h-3.5 w-3.5" /> Split across {allocations.size} categories
            </p>
            <div className="space-y-1.5">
              {Array.from(allocations.entries()).map(([catId, amt]) => {
                const share = tx.amount > 0 ? Math.round((amt / tx.amount) * 100) : 0;
                return (
                  <div key={catId} className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">{categoryName(categories, catId)}</span>
                    <span className="font-semibold text-slate-500">
                      {MoneyValue.fromMinorUnits(amt, tx.currency).format()}
                      <span className="ml-1.5 text-[10px] font-black text-emerald-700">{share}%</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Receipt */}
        {tx.receiptDataUrl && (
          <button
            type="button"
            onClick={() => setShowReceipt(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left hover:border-emerald-300 transition-colors cursor-pointer"
            aria-label="View attached receipt"
          >
            <img
              src={tx.receiptDataUrl}
              alt="Attached receipt thumbnail"
              className="h-12 w-12 rounded-lg object-cover border border-slate-200"
            />
            <span className="flex-1">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Paperclip className="h-3.5 w-3.5" /> Receipt attached
              </span>
              <span className="block text-[10px] font-medium text-slate-500">Tap to view full size</span>
            </span>
          </button>
        )}

        {showReceipt && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-label="Receipt full size">
            <div className="relative max-h-full w-full max-w-md overflow-auto rounded-2xl bg-white p-2">
              <button
                type="button"
                onClick={() => setShowReceipt(false)}
                aria-label="Close receipt"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
              <img src={tx.receiptDataUrl} alt="Receipt" className="w-full rounded-xl" />
            </div>
          </div>
        )}

        {/* Actions — edit opens the same contextual editor */}
        {confirmingDelete ? (
          <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs font-bold text-rose-800">
              Delete this transaction? The {money.format()} will be reversed on{' '}
              {accountName(accounts, tx.accountId, 'your account')}.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onDelete(tx.id);
                  handleClose();
                }}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-700 transition-colors cursor-pointer"
              >
                Yes, delete it
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onEdit(tx);
                handleClose();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#122A1E] py-3 text-xs font-bold text-[#D4F63D] hover:bg-[#183625] transition-colors cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit Transaction
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Delete transaction"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
