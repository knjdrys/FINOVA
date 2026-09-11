import React, { lazy, useCallback, useMemo, useState } from 'react';

/**
 * Lazy component + true retry. React caches a rejected import inside one
 * lazy() instance, so a retry must recreate the wrapper — the nonce does
 * exactly that. Pair with ChunkErrorBoundary (resetKey={nonce}).
 * `load` must be a stable module-level loader.
 */
export function useRetryableLazy<P extends object>(
  load: () => Promise<{ default: React.ComponentType<P> }>
): readonly [React.ComponentType<P>, number, () => void] {
  const [nonce, setNonce] = useState(0);
  // nonce is intentionally "unnecessary" (unread in the factory): its only
  // job is to recreate the lazy wrapper so a retry refetches.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const Comp = useMemo(() => lazy(load), [load, nonce]);
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return [Comp, nonce, retry] as const;
}
