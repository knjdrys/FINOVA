import React, { useState, useEffect, useRef } from 'react';
import { Category, CategoryType } from '../../types';
import { Modal } from '../ui/Modal';
import { CATEGORY_ICON_CHOICES } from '../ui/TransactionItem';
import { CategoryEngine } from '../../domain/category/CategoryEngine';
import { t } from '../../i18n/core';

interface AddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Category, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => void;
  categories: Category[];
  editingCategory?: Category | null;
}

const COLORS = ['#059669', '#0D9488', '#2563EB', '#4F46E5', '#7C3AED', '#DB2777', '#DC2626', '#D97706', '#EA580C', '#475569'];

export const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  categories,
  editingCategory,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<CategoryType>('EXPENSE');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(CATEGORY_ICON_CHOICES[0].name);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      submittedRef.current = false;
      setName(editingCategory?.name || '');
      setType(editingCategory?.type || 'EXPENSE');
      setColor(editingCategory?.color || COLORS[0]);
      setIcon(editingCategory?.icon || CATEGORY_ICON_CHOICES[0].name);
      setError(null);
    }
  }, [isOpen, editingCategory]);

  const save = () => {
    const err = CategoryEngine.validateName(name, type, categories, editingCategory?.id);
    if (err === 'required') { setError(t('categories.nameRequired')); return; }
    if (err === 'duplicate') { setError(t('categories.duplicateName')); return; }
    setError(null);

    if (submittedRef.current) return;
    submittedRef.current = true;
    onSave({
      name: name.trim(),
      type,
      icon,
      color,
      isSystem: false,
      isArchived: editingCategory?.isArchived ?? false,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingCategory ? t('categories.edit') : t('categories.add')} maxWidth="md">
      <div className="space-y-4">
        <Field label={t('categories.name')}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('categories.namePlaceholder')}
            maxLength={40}
            className={inputCls}
          />
        </Field>

        <Field label={t('tx.type')}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('tx.type')}>
            {(['EXPENSE', 'INCOME'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={type === v}
                onClick={() => setType(v)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer ${
                  type === v
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-(--line) bg-(--surface) text-(--ink-3) hover:bg-(--surface-2)'
                }`}
              >
                {v === 'EXPENSE' ? t('tx.expense') : t('tx.income')}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('categories.color')}>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => {
              const selected = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`${t('categories.color')}: ${c}${selected ? ' (selected)' : ''}`}
                  aria-pressed={selected}
                  className={`h-9 w-9 rounded-full cursor-pointer ${selected ? 'ring-2 ring-offset-2 ring-slate-500' : ''}`}
                  style={{ backgroundColor: c }}
                />
              );
            })}
          </div>
        </Field>

        <Field label={t('categories.icon')}>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_ICON_CHOICES.map(({ name: iconName, Icon }) => {
              const selected = icon === iconName;
              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(iconName)}
                  aria-label={iconName}
                  aria-pressed={selected}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                    selected
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                      : 'border-(--line) bg-(--surface) text-(--ink-3) hover:bg-(--surface-2)'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>
        </Field>

        {error ? (
          <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-(--line) px-4 py-2.5 text-sm font-bold text-(--ink-2) cursor-pointer">{t('common.cancel')}</button>
          <button type="button" onClick={save} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white cursor-pointer">{editingCategory ? t('common.save') : t('modal.create')}</button>
        </div>
      </div>
    </Modal>
  );
};

const inputCls = 'w-full rounded-xl border border-(--line) px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <span className="text-xs font-bold text-(--ink-2)">{label}</span>
    {children}
  </div>
);
