/**
 * Custom-category lifecycle: system rows are immutable, names stay unique
 * per type (even against archived rows), and pickers only ever see visible
 * rows of the requested type in a stable A–Z order.
 */
import { describe, expect, it } from 'vitest';
import { CategoryEngine } from '../domain/category/CategoryEngine';
import { Category } from '../types';

const sys = (over: Partial<Category> = {}): Category => ({
  id: 'cat-food', userId: 'u', name: 'Food', type: 'EXPENSE',
  icon: 'Utensils', color: '#000', isSystem: true, isArchived: false, ...over,
});

describe('CategoryEngine edit guards', () => {
  it('system categories are never editable or archivable', () => {
    expect(CategoryEngine.isEditable(sys())).toBe(false);
    expect(CategoryEngine.isArchivable(sys())).toBe(false);
  });

  it('the internal transfer category is never editable', () => {
    const t = sys({ id: 'cat-transfer', isSystem: false });
    expect(CategoryEngine.isEditable(t)).toBe(false);
  });

  it('custom categories are editable and archivable', () => {
    const c = sys({ id: 'cat-custom-1', name: 'Pets', isSystem: false });
    expect(CategoryEngine.isEditable(c)).toBe(true);
    expect(CategoryEngine.isArchivable(c)).toBe(true);
  });
});

describe('CategoryEngine name validation', () => {
  const rows = [sys(), sys({ id: 'cat-salary', name: 'Salary', type: 'INCOME' })];

  it('blank names are rejected', () => {
    expect(CategoryEngine.validateName('   ', 'EXPENSE', rows)).toBe('required');
  });

  it('names clash case-insensitively within the same type', () => {
    expect(CategoryEngine.validateName('food', 'EXPENSE', rows)).toBe('duplicate');
    expect(CategoryEngine.validateName('  FOOD  ', 'EXPENSE', rows)).toBe('duplicate');
  });

  it('the same name is fine across types', () => {
    expect(CategoryEngine.validateName('Food', 'INCOME', rows)).toBe(null);
  });

  it('editing keeps its own name without a false duplicate', () => {
    expect(CategoryEngine.validateName('Food', 'EXPENSE', rows, 'cat-food')).toBe(null);
  });

  it('archived rows still reserve their name (restore would double-list)', () => {
    const withArchived = [...rows, sys({ id: 'cat-custom-x', name: 'Pets', isSystem: false, isArchived: true })];
    expect(CategoryEngine.validateName('pets', 'EXPENSE', withArchived)).toBe('duplicate');
  });
});

describe('CategoryEngine picker list', () => {
  it('returns visible rows of one type, A–Z, without the transfer row', () => {
    const rows = [
      sys({ id: 'b', name: 'Zoo', isSystem: false }),
      sys({ id: 'a', name: 'Aquarium', isSystem: false }),
      sys({ id: 'cat-transfer', name: 'Transfer', isSystem: false }),
      sys({ id: 'arch', name: 'Buried', isSystem: false, isArchived: true }),
      sys({ id: 'inc', name: 'Salary', type: 'INCOME' }),
    ];
    const visible = CategoryEngine.visibleByType(rows, 'EXPENSE');
    expect(visible.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('generates collision-proof custom ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => CategoryEngine.createId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id.startsWith('cat-custom-')).toBe(true);
  });
});
