import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Account, Category, CurrencyCode, MoneyCommitment, RecurringTransaction, SplitPart, Transaction, TransactionType } from '../../types';
import { DateUtils } from '../../domain/date/DateUtils';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { TransactionEngine } from '../../domain/transaction/TransactionEngine';
import { UnifiedEntry, EntryMode, RepeatOption } from '../../domain/entry/UnifiedEntry';
import { t } from '../../i18n/core';
import { ReceiptService, ReceiptSuggestion } from '../../services/receipt/ReceiptService';
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
  ArrowLeftRight,
  CircleDollarSign,
  LucideIcon,
  Check,
  Plus,
  Trash2,
  Paperclip,
  Scissors,
  X,
  Image as ImageIcon,
} from 'lucide-react';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  /** Planned mode: creates a PROJECTED commitment, moves no money. */
  onSaveCommitment?: (c: Omit<MoneyCommitment, 'id' | 'createdAt' | 'updatedAt'>) => void;
  /** Repeat switch: creates a recurring rule alongside the immediate transaction. */
  onSaveRecurring?: (r: Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  accounts: Account[];
  categories: Category[];
  currency: CurrencyCode;
  /** When set, the modal edits this transaction instead of creating one. */
  editingTx?: Transaction | null;
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

interface SplitRow {
  categoryId: string;
  amountStr: string;
}

const toDecimal = (minor: number, currency: CurrencyCode) =>
  MoneyValue.fromMinorUnits(minor, currency).format({ includeSymbol: false });

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onSaveCommitment,
  onSaveRecurring,
  accounts,
  categories,
  currency = 'PHP',
  editingTx = null,
}) => {
  const [type, setType] = useState<EntryMode>('EXPENSE');
  const [amountStr, setAmountStr] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'cat-food');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [destinationAccountId, setDestinationAccountId] = useState(accounts[1]?.id || accounts[0]?.id || '');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(DateUtils.getTodayISO());
  const [tagsStr, setTagsStr] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Split state (EXPENSE only)
  const [splitMode, setSplitMode] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([]);

  // Receipt state
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | undefined>(undefined);
  const [receiptBusy, setReceiptBusy] = useState(false);
  // Filename-hint review: suggestions are NEVER applied silently — the user
  // must press "Use these" (prefill) and then still press Save Transaction.
  const [receiptSuggestion, setReceiptSuggestion] = useState<ReceiptSuggestion | null>(null);
  const [receiptReviewDone, setReceiptReviewDone] = useState(false);
  // Repeat switch (create-only, Expense/Income): also creates a recurring rule.
  const [repeat, setRepeat] = useState<RepeatOption>('OFF');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currencySymbol = MoneyValue.zero(currency).getCurrencySymbol();
  const filteredCategories = categories.filter(
    (c) =>
      !c.isArchived &&
      c.id !== 'cat-transfer' && // internal booking category — never hand-pickable
      (type === 'TRANSFER' || type === 'PLANNED' ? c.type === 'EXPENSE' : c.type === type)
  );

  // Hydrate on open (create = clean slate, edit = copy of the transaction)
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingTx) {
      setType(editingTx.type);
      setAmountStr(toDecimal(editingTx.amount, editingTx.currency));
      setCategoryId(editingTx.categoryId);
      setAccountId(editingTx.accountId);
      setDestinationAccountId(editingTx.destinationAccountId || '');
      setMerchant(editingTx.merchant || '');
      setNote(editingTx.note || '');
      setDate(editingTx.date);
      setTagsStr((editingTx.tags || []).join(', '));
      setSplitMode(Boolean(editingTx.splitParts && editingTx.splitParts.length > 0));
      setSplitRows(
        (editingTx.splitParts || []).map((p) => ({
          categoryId: p.categoryId,
          amountStr: toDecimal(p.amount, editingTx.currency),
        }))
      );
      setReceiptDataUrl(editingTx.receiptDataUrl);
      setReceiptSuggestion(null);
      setReceiptReviewDone(false);
    } else {
      setType('EXPENSE');
      setAmountStr('');
      setCategoryId(categories[0]?.id || 'cat-food');
      setAccountId(accounts[0]?.id || '');
      setDestinationAccountId(accounts[1]?.id || accounts[0]?.id || '');
      setMerchant('');
      setNote('');
      setDate(DateUtils.getTodayISO());
      setTagsStr('');
      setSplitMode(false);
      setSplitRows([]);
      setReceiptDataUrl(undefined);
      setReceiptSuggestion(null);
      setReceiptReviewDone(false);
      setRepeat('OFF');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingTx]);

  // Never allow destination === source on transfers.
  useEffect(() => {
    if (type === 'TRANSFER' && destinationAccountId === accountId) {
      const alt = accounts.find((a) => a.id !== accountId);
      setDestinationAccountId(alt ? alt.id : '');
    }
  }, [type, accountId, destinationAccountId, accounts]);

  const amountMinor = useMemo(() => {
    const money = MoneyValue.parse(amountStr || '0', currency);
    return money.getMinorUnits();
  }, [amountStr, currency]);

  const splitMinor = useMemo(
    () => splitRows.reduce((s, r) => s + MoneyValue.parse(r.amountStr || '0', currency).getMinorUnits(), 0),
    [splitRows, currency]
  );
  const splitRemaining = amountMinor - splitMinor;

  const destinationOptions = accounts.filter((a) => a.id !== accountId);

  const enableSplit = () => {
    setSplitMode(true);
    const first = splitRows.length > 0 ? splitRows[0] : { categoryId, amountStr: '' };
    const secondCat = filteredCategories.find((c) => c.id !== first.categoryId)?.id || categoryId;
    setSplitRows([first, { categoryId: secondCat, amountStr: '' }]);
  };

  const updateRow = (idx: number, patch: Partial<SplitRow>) => {
    setSplitRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setError(null);
  };

  const addRow = () => {
    const used = new Set(splitRows.map((r) => r.categoryId));
    const next = filteredCategories.find((c) => !used.has(c.id)) || filteredCategories[0];
    setSplitRows((rows) => [...rows, { categoryId: next?.id || categoryId, amountStr: '' }]);
  };

  const removeRow = (idx: number) => {
    setSplitRows((rows) => rows.filter((_, i) => i !== idx));
  };

  const splitEvenly = () => {
    if (splitRows.length < 2 || amountMinor <= 0) return;
    const base = Math.floor(amountMinor / splitRows.length);
    const remainder = amountMinor - base * splitRows.length;
    setSplitRows((rows) =>
      rows.map((r, i) => ({ ...r, amountStr: toDecimal(base + (i < remainder ? 1 : 0), currency) }))
    );
    setError(null);
  };

  const handleReceiptPick = async (file: File | undefined) => {
    if (!file) return;
    setReceiptBusy(true);
    setError(null);
    // Hints come from the file name only — compress first, then suggest.
    // Nothing is ever written to the form until the user presses "Use these".
    const hint = ReceiptService.suggestFromFileName(file.name, file.lastModified);
    const result = await ReceiptService.compress(file);
    setReceiptBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setReceiptDataUrl(result.dataUrl);
    setReceiptSuggestion(ReceiptService.hasHints(hint) ? hint : null);
    setReceiptReviewDone(false);
  };

  const applyReceiptHints = () => {
    if (!receiptSuggestion) return;
    if (receiptSuggestion.merchant && !merchant.trim()) setMerchant(receiptSuggestion.merchant);
    if (receiptSuggestion.amountMajor !== undefined && !amountStr.trim()) {
      setAmountStr(String(receiptSuggestion.amountMajor));
    }
    if (receiptSuggestion.dateISO) setDate(receiptSuggestion.dateISO);
    setReceiptReviewDone(true);
    setError(null);
  };

  const dismissReceiptHints = () => {
    setReceiptSuggestion(null);
    setReceiptReviewDone(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (amountMinor <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    if (!accountId) {
      setError('Please select an account.');
      return;
    }

    const fallbackTitle =
      merchant.trim() || categories.find((c) => c.id === categoryId)?.name || 'Planned expense';

    // PLANNED never moves money — it creates a PROJECTED commitment that the
    // Bills lifecycle (reschedule / mark paid / cancel) owns from here on.
    if (type === 'PLANNED') {
      if (!onSaveCommitment) {
        setError('Planning is unavailable right now. Please try again.');
        return;
      }
      const plannedError = UnifiedEntry.validatePlanned({
        title: fallbackTitle,
        amount: amountMinor,
        currency,
        categoryId,
        accountId,
        dueDate: date,
      });
      if (plannedError) {
        setError(plannedError);
        return;
      }
      onSaveCommitment(
        UnifiedEntry.buildPlannedPayload({
          title: fallbackTitle,
          amount: amountMinor,
          currency,
          categoryId,
          accountId,
          dueDate: date,
        })
      );
      onClose();
      return;
    }

    const txType = type as TransactionType;

    const tags = tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const splitParts: SplitPart[] | undefined =
      txType === 'EXPENSE' && splitMode
        ? splitRows.map((r) => ({
            categoryId: r.categoryId,
            amount: MoneyValue.parse(r.amountStr || '0', currency).getMinorUnits(),
          }))
        : undefined;

    if (splitParts) {
      const splitError = TransactionEngine.validateSplitParts(amountMinor, splitParts);
      if (splitError) {
        setError(splitError);
        return;
      }
    }

    const validationError = TransactionEngine.validateTransaction(
      { type: txType, amount: amountMinor, currency, accountId, destinationAccountId: txType === 'TRANSFER' ? destinationAccountId : undefined },
      // When editing, the old effect is still baked into the balance — validate against
      // the post-reversal balance so raising an edited expense isn't falsely rejected.
      editingTx ? TransactionEngine.reverseTransactionFromAccounts(editingTx, accounts) : accounts
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    const resolvedCategoryId =
      txType === 'TRANSFER' ? 'cat-transfer' : splitParts ? splitParts[0].categoryId : categoryId;

    onSave({
      userId: editingTx?.userId || 'user-1',
      type: txType,
      amount: amountMinor,
      currency,
      categoryId: resolvedCategoryId,
      accountId,
      destinationAccountId: txType === 'TRANSFER' ? destinationAccountId : undefined,
      merchant: merchant.trim() || undefined,
      note: note.trim() || undefined,
      date,
      time: editingTx?.time || new Date().toTimeString().substring(0, 5),
      tags,
      status: editingTx?.status || 'CONFIRMED',
      sourceCommitmentId: editingTx?.sourceCommitmentId,
      splitParts,
      receiptDataUrl,
    });

    // Repeat switch (create-only): the saved transaction covers NOW; the rule
    // covers every future occurrence via generated commitments + timeline.
    if (!editingTx && repeat !== 'OFF' && onSaveRecurring && (txType === 'EXPENSE' || txType === 'INCOME')) {
      const repeatError = UnifiedEntry.validateRepeat(
        {
          title: fallbackTitle,
          amount: amountMinor,
          currency,
          type: txType,
          categoryId: resolvedCategoryId,
          accountId,
          startDate: date,
          repeat,
        },
        accounts
      );
      if (!repeatError) {
        onSaveRecurring(
          UnifiedEntry.buildRecurringPayload({
            title: fallbackTitle,
            amount: amountMinor,
            currency,
            type: txType,
            categoryId: resolvedCategoryId,
            accountId,
            startDate: date,
            repeat,
          })
        );
      }
    }
    onClose();
  };

  const selectCls =
    'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 cursor-pointer';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingTx ? 'Edit Transaction' : type === 'PLANNED' ? t('modal.planExpenseTitle') : 'Add Transaction'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Transaction Type Segmented Toggle */}
        <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Transaction type">
          {(['EXPENSE', 'INCOME', 'TRANSFER', 'PLANNED'] as const).filter((m) => m !== 'PLANNED' || !editingTx).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={type === m}
              onClick={() => {
                setType(m);
                if (m !== 'EXPENSE') setSplitMode(false);
                if (m === 'EXPENSE' || m === 'PLANNED') setCategoryId('cat-food');
                if (m === 'INCOME') setCategoryId('cat-salary');
                if (m === 'TRANSFER') setCategoryId('cat-transfer');
                if (m === 'TRANSFER' || m === 'PLANNED') setRepeat('OFF');
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                type === m
                  ? m === 'INCOME'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : m === 'TRANSFER'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : m === 'PLANNED'
                    ? 'bg-white text-amber-700 shadow-sm'
                    : 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {m === 'EXPENSE' ? 'Expense' : m === 'INCOME' ? 'Income' : m === 'TRANSFER' ? 'Transfer' : t('modal.typePlannedShort')}
            </button>
          ))}
        </div>
        {/* Planned mode explains itself: no money moves until it is completed. */}
        {type === 'PLANNED' && !editingTx && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800" role="note">
            {t('modal.plannedNote')}
          </p>
        )}

        {/* Large Amount Input */}
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
              onChange={(e) => {
                setAmountStr(e.target.value);
                setError(null);
              }}
              autoFocus
              required
              aria-label="Amount"
              className="w-full max-w-[220px] text-center text-3xl sm:text-4xl font-black text-slate-900 bg-transparent outline-none placeholder:text-slate-300"
            />
          </div>
        </div>

        {/* Accounts */}
        {type === 'TRANSFER' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">From</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectCls} aria-label="Source account">
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} · {MoneyValue.fromMinorUnits(acc.currentBalance, acc.currency).format()}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  const from = accountId;
                  setAccountId(destinationAccountId);
                  setDestinationAccountId(from);
                }}
                disabled={destinationOptions.length === 0}
                aria-label="Swap accounts"
                title="Swap accounts"
                className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-emerald-700 hover:border-emerald-300 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">To</label>
                <select
                  value={destinationAccountId}
                  onChange={(e) => setDestinationAccountId(e.target.value)}
                  className={selectCls}
                  aria-label="Destination account"
                >
                  {destinationOptions.length === 0 ? (
                    <option value="">Add a second account first</option>
                  ) : (
                    destinationOptions.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} · {MoneyValue.fromMinorUnits(acc.currentBalance, acc.currency).format()}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
            <p className="text-[10px] font-medium text-slate-400">
              Transfers move money between accounts — they never count as income or expense.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Account</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectCls} aria-label="Account">
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} · {MoneyValue.fromMinorUnits(acc.currentBalance, acc.currency).format()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">{type === 'PLANNED' ? t('modal.plannedDate') : 'Date'}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={selectCls} aria-label={type === 'PLANNED' ? t('modal.plannedDate') : 'Date'} />
            </div>
          </div>
        )}

        {/* Repeat switch (create-only, Expense/Income): one tap creates the rule. */}
        {(type === 'EXPENSE' || type === 'INCOME') && !editingTx && onSaveRecurring && (
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">{t('modal.repeatLabel')}</label>
            <div className="flex rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label={t('modal.repeatLabel')}>
              {(['OFF', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={repeat === r}
                  onClick={() => setRepeat(r)}
                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                    repeat === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {r === 'OFF' ? t('modal.repeatOnce') : r === 'WEEKLY' ? t('modal.repeatWeekly') : r === 'BIWEEKLY' ? t('modal.repeatBiweekly') : r === 'MONTHLY' ? t('modal.repeatMonthly') : t('modal.repeatYearly')}
                </button>
              ))}
            </div>
            {repeat !== 'OFF' && (
              <p className="mt-1.5 text-[10px] font-medium text-slate-500" role="note">
                {t('modal.repeatHint')}
              </p>
            )}
          </div>
        )}

        {/* Date for transfers (was hidden before — a real bug) */}
        {type === 'TRANSFER' && (
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={selectCls} aria-label="Date" />
          </div>
        )}

        {/* Category Picker / Split Editor (Expense + Planned; split is Expense-only) */}
        {(type === 'EXPENSE' || type === 'PLANNED') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Category</label>
              {type === 'EXPENSE' && (
              <button
                type="button"
                onClick={() => (splitMode ? setSplitMode(false) : enableSplit())}
                aria-pressed={splitMode}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                  splitMode
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-slate-100 text-slate-600 border border-slate-200 hover:border-emerald-300 hover:text-emerald-700'
                }`}
              >
                <Scissors className="h-3 w-3" />
                {splitMode ? 'Splitting on' : 'Split by category'}
              </button>
              )}
            </div>

            {!splitMode ? (
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
                      <span className="text-[11px] font-bold text-slate-800 truncate w-full">{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/30 p-3">
                {splitRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={row.categoryId}
                      onChange={(e) => updateRow(idx, { categoryId: e.target.value })}
                      className={selectCls + ' flex-1'}
                      aria-label={`Split ${idx + 1} category`}
                    >
                      {filteredCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex w-28 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2">
                      <span className="text-[11px] font-bold text-slate-400">{currencySymbol}</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        value={row.amountStr}
                        onChange={(e) => updateRow(idx, { amountStr: e.target.value })}
                        aria-label={`Split ${idx + 1} amount`}
                        className="w-full bg-transparent py-2 text-xs font-bold text-slate-900 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={splitRows.length <= 2}
                      aria-label={`Remove split ${idx + 1}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={addRow}
                      className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3 w-3" /> Category
                    </button>
                    <button
                      type="button"
                      onClick={splitEvenly}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors cursor-pointer"
                    >
                      Split evenly
                    </button>
                  </div>
                  <span
                    className={`text-[11px] font-black ${
                      splitRemaining === 0 && amountMinor > 0 ? 'text-emerald-700' : splitRemaining < 0 ? 'text-rose-600' : 'text-slate-500'
                    }`}
                    role="status"
                  >
                    {amountMinor <= 0
                      ? 'Enter the total first'
                      : splitRemaining === 0
                      ? 'Fully assigned'
                      : splitRemaining > 0
                      ? `${MoneyValue.fromMinorUnits(splitRemaining, currency).format()} left`
                      : `${MoneyValue.fromMinorUnits(-splitRemaining, currency).format()} over`}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Optional details — collapsed so the fast path is amount → category → account → save. */}
        {type !== 'TRANSFER' && (
        <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-xs font-bold text-slate-500 hover:text-slate-800 select-none">
            {t('modal.detailsSummary')} <span className="font-medium text-slate-400">{t('modal.detailsHint')}</span>
          </summary>
          <div className="space-y-3 pt-3">
        {/* Merchant & Notes */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Merchant / Payee</label>
            <input
              type="text"
              placeholder="e.g. S&R"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className={selectCls}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Note / Subtext</label>
            <input
              type="text"
              placeholder="e.g. Weekly groceries"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={selectCls}
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
            className={selectCls}
          />
        </div>
          </div>
        </details>
        )}

        {/* Receipt attachment (actuals only — a planned purchase has no receipt yet) */}
        {type !== 'PLANNED' && (
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5">Receipt</label>
          {receiptDataUrl ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <img src={receiptDataUrl} alt="Attached receipt" className="h-14 w-14 rounded-lg object-cover border border-slate-200" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-700 truncate">Receipt attached</p>
                <p className="text-[10px] font-medium text-slate-400">
                  ~{Math.round(ReceiptService.sizeOf(receiptDataUrl) / 1024)} KB · stored with this transaction
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReceiptDataUrl(undefined);
                  setReceiptSuggestion(null);
                  setReceiptReviewDone(false);
                }}
                aria-label="Remove receipt"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={receiptBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-500 hover:border-emerald-400 hover:text-emerald-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {receiptBusy ? <ImageIcon className="h-4 w-4 animate-pulse" /> : <Paperclip className="h-4 w-4" />}
              {receiptBusy ? 'Compressing…' : 'Attach a receipt photo'}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Receipt image"
            onChange={(e) => {
              void handleReceiptPick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {receiptDataUrl && receiptSuggestion && !receiptReviewDone && (
            <div
              className="mt-2 rounded-xl border border-amber-300/70 bg-amber-50 p-3"
              role="region"
              aria-label="Review receipt hints"
            >
              <p className="text-[11px] font-black uppercase tracking-wider text-amber-800">
                {t('modal.receiptReviewTitle')}
              </p>
              <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-900">
                {t('modal.receiptReviewBody')}
              </p>
              <dl className="mt-2 space-y-1 text-xs">
                {receiptSuggestion.merchant && (
                  <div className="flex justify-between gap-2">
                    <dt className="font-medium text-amber-700">{t('modal.receiptHintMerchant')}</dt>
                    <dd className="font-bold text-slate-800 text-right">{receiptSuggestion.merchant}</dd>
                  </div>
                )}
                {receiptSuggestion.amountMajor !== undefined && (
                  <div className="flex justify-between gap-2">
                    <dt className="font-medium text-amber-700">{t('modal.receiptHintAmount')}</dt>
                    <dd className="font-bold text-slate-800 text-right">
                      {currencySymbol} {receiptSuggestion.amountMajor.toFixed(2)}
                    </dd>
                  </div>
                )}
                {receiptSuggestion.dateISO && (
                  <div className="flex justify-between gap-2">
                    <dt className="font-medium text-amber-700">{t('modal.receiptHintDate')}</dt>
                    <dd className="font-bold text-slate-800 text-right">{receiptSuggestion.dateISO}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={applyReceiptHints}
                  className="flex-1 rounded-xl bg-[#122A1E] py-2 text-[11px] font-bold text-[#D4F63D] hover:bg-[#183625] transition-colors cursor-pointer"
                >
                  {t('modal.receiptUse')}
                </button>
                <button
                  type="button"
                  onClick={dismissReceiptHints}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {t('modal.receiptIgnore')}
                </button>
              </div>
            </div>
          )}
        </div>
        )}

        {error ? (
          <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        {/* Action Button */}
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#122A1E] py-3.5 text-sm font-bold text-[#D4F63D] shadow-lg shadow-emerald-950/20 transition-transform active:scale-[0.98] hover:bg-[#183625] cursor-pointer"
        >
          <Check className="h-4 w-4 stroke-[3]" />
          <span>{editingTx ? 'Save Changes' : type === 'PLANNED' ? t('modal.savePlanned') : 'Save Transaction'}</span>
        </button>
      </form>
    </Modal>
  );
};
