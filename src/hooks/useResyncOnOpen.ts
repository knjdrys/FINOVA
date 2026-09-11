import { useState } from 'react';

/**
 * Reset-on-open without setState-in-effect.
 *
 * Form modals stay mounted while closed (they take an `isOpen` prop), so
 * their fields must re-sync whenever they reopen for another entity. An
 * effect that setStates on [isOpen, entity] is the naive approach; React's
 * documented alternative is adjusting state during render, which this hook
 * packages: when the open signature changes, `resync` runs immediately in
 * the same commit — no extra render pass, no effect round-trip.
 *
 * `entityKey` should capture everything that must trigger a re-sync
 * (typically `${editingId}:${currency}`). Deliberately narrower than an
 * object-identity dep: re-syncing only when the id/currency changes means
 * an unrelated parent re-render can never clobber mid-edit typing.
 */
export function useResyncOnOpen(isOpen: boolean, entityKey: string, resync: () => void): void {
  const sig = isOpen ? `open:${entityKey}` : 'closed';
  // Sentinel init (NOT useState(sig)): modals mount conditionally, so the
  // first mount is often already-open — starting "matched" would skip the
  // initial sync and open edit forms blank.
  const [lastSig, setLastSig] = useState('__init__');
  if (sig !== lastSig) {
    setLastSig(sig);
    if (isOpen) resync();
  }
}
