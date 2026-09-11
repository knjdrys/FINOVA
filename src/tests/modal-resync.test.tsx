// @vitest-environment jsdom
/**
 * Modal re-sync regression (code-splitting companion).
 *
 * Overlays mount conditionally (only when open) so their chunks stay split.
 * That makes mount-with-entity the common case — the re-sync hook must fill
 * edit forms on FIRST mount, re-fill on entity switch, and clear for new.
 * (The naive useState(sig) init skipped the first sync and opened edits blank.)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { AddBudgetModal } from '../components/modals/AddBudgetModal';
import { Budget } from '../types';

const budget = (over: Partial<Budget> = {}): Budget => ({
  id: 'bud-1', userId: 'user-1', name: 'Food', amount: 3000000,
  currency: 'PHP', period: 'MONTHLY', startDate: '2026-09-01', endDate: '2026-09-30',
  categoryIds: [], notifyThresholdPercentage: 80, isActive: true, rolloverUnused: false,
  createdAt: 'x', updatedAt: 'x', ...over,
});

const renderModal = (editingBudget: Budget | null) =>
  render(
    <AddBudgetModal
      isOpen={true}
      onClose={() => {}}
      onSave={() => {}}
      categories={[]}
      currency="PHP"
      editingBudget={editingBudget}
    />
  );

describe('conditional-mount form sync', () => {
  it('prefills name + amount on FIRST mount with an editing entity', () => {
    renderModal(budget({ name: 'Groceries', amount: 2500000 }));
    expect((screen.getByLabelText('Budget name') as HTMLInputElement).value).toBe('Groceries');
    // Grouping-free: type="number" rejects locale commas, so values >= 1000
    // used to display blank. 2,500,000 minor -> "25000".
    expect((screen.getByLabelText(/Amount/) as HTMLInputElement).value).toBe('25000');
  });

  it('opens blank for a new entity', () => {
    renderModal(null);
    expect((screen.getByLabelText('Budget name') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Amount/) as HTMLInputElement).value).toBe('');
  });

  it('re-syncs when the editing entity switches while mounted', () => {
    const view = renderModal(budget({ id: 'bud-1', name: 'Food', amount: 3000000 }));
    expect((screen.getByLabelText('Budget name') as HTMLInputElement).value).toBe('Food');
    view.rerender(
      <AddBudgetModal
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        categories={[]}
        currency="PHP"
        editingBudget={budget({ id: 'bud-2', name: 'Transport', amount: 1000000 })}
      />
    );
    expect((screen.getByLabelText('Budget name') as HTMLInputElement).value).toBe('Transport');
    expect((screen.getByLabelText(/Amount/) as HTMLInputElement).value).toBe('10000');
  });

  it('clears when switching from edit back to new', () => {
    const view = renderModal(budget({ name: 'Food' }));
    expect((screen.getByLabelText('Budget name') as HTMLInputElement).value).toBe('Food');
    view.rerender(
      <AddBudgetModal
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        categories={[]}
        currency="PHP"
        editingBudget={null}
      />
    );
    expect((screen.getByLabelText('Budget name') as HTMLInputElement).value).toBe('');
  });
});
