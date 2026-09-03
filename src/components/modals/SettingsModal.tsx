import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Account, Category, CurrencyCode, Transaction, UserSettings } from '../../types';
import { MoneyValue } from '../../domain/money/MoneyValue';
import { FinovaStorage } from '../../services/storage/FinovaStorage';
import { Download, RotateCcw, Shield, Sliders, User, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  onResetDemo: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  transactions,
  categories,
  accounts,
  onResetDemo,
}) => {
  const [userName, setUserName] = useState(settings.userName);
  const [currency, setCurrency] = useState<CurrencyCode>(settings.currency);
  const [minReserveStr, setMinReserveStr] = useState(
    (settings.minimumReserve / 100).toString()
  );
  const [budgetThreshold, setBudgetThreshold] = useState(
    settings.budgetWarningThreshold.toString()
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const minReserveMoney = MoneyValue.parse(minReserveStr, currency);

    onUpdateSettings({
      ...settings,
      userName: userName.trim() || 'User',
      currency,
      minimumReserve: minReserveMoney.getMinorUnits(),
      budgetWarningThreshold: parseInt(budgetThreshold, 10) || 80,
    });
    onClose();
  };

  const handleExportCSV = () => {
    const csvContent = FinovaStorage.exportToCSV(transactions, categories, accounts);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `finova_transactions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Finova Settings & Preferences">
      <form onSubmit={handleSave} className="space-y-4">
        {/* User Profile */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-slate-500" />
            <span>Profile Name</span>
          </label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600"
            required
          />
        </div>

        {/* Currency & Emergency Reserve */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-slate-500" />
              <span>Base Currency</span>
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600"
            >
              <option value="PKR">PKR (Rs)</option>
              <option value="PHP">PHP (₱)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="AED">AED (AED)</option>
              <option value="INR">INR (₹)</option>
              <option value="SGD">SGD (S$)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-slate-500" />
              <span>Safety Reserve</span>
            </label>
            <input
              type="number"
              min="0"
              value={minReserveStr}
              onChange={(e) => setMinReserveStr(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Budget Warning Threshold */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5">
            Budget Warning Alert Threshold ({budgetThreshold}%)
          </label>
          <input
            type="range"
            min="50"
            max="100"
            step="5"
            value={budgetThreshold}
            onChange={(e) => setBudgetThreshold(e.target.value)}
            className="w-full accent-emerald-700"
          />
        </div>

        {/* Data Export & Reset Actions */}
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-50 border border-slate-200 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Download className="h-4 w-4 text-emerald-700" />
            <span>Export Transactions (CSV)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (confirm('Reset all transactions, budgets, and accounts to initial demo data?')) {
                onResetDemo();
                onClose();
              }
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-50 border border-rose-200/80 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Reset to Initial Demo State</span>
          </button>
        </div>

        {/* Save Settings */}
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#122A1E] py-3 text-xs font-bold text-[#D4F63D] shadow-md hover:bg-[#183625] transition-colors"
        >
          <Check className="h-4 w-4 stroke-[3]" />
          <span>Save Preferences</span>
        </button>
      </form>
    </Modal>
  );
};
