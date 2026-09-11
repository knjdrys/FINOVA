import React from 'react';

/**
 * Retryable lazy-section loading — the correctness companion to code-splitting.
 *
 * Why not bare React.lazy: a chunk that fails to load (offline + never
 * visited — the service worker only caches visited chunks) throws during
 * render, which would route to the top-level ErrorBoundary. Two such trips
 * would offer the FACTORY RESET hatch for a mere connectivity issue. These
 * helpers scope chunk failures to the section with an honest retry instead.
 *
 * Retry works because the lazy wrapper is recreated per attempt (React
 * caches a rejected import inside one lazy() instance, so resetting the
 * boundary alone could never refetch).
 *
 * Usage (see hooks/useRetryableLazy):
 *   const loadPlans = () => import('./Plans').then(m => ({ default: m.Plans }));
 *   const [Plans, plansKey, retryPlans] = useRetryableLazy(loadPlans);
 *   {tab === 'PLANS' && (
 *     <ChunkErrorBoundary sectionName="Plans" resetKey={plansKey} onRetry={retryPlans}>
 *       <Suspense fallback={<TabFallback />}>
 *         <Plans {...unchangedProps} />
 *       </Suspense>
 *     </ChunkErrorBoundary>
 *   )}
 */

interface ChunkErrorBoundaryProps {
  children: React.ReactNode;
  sectionName: string;
  resetKey: number;
  onRetry: () => void;
}

interface ChunkErrorBoundaryState {
  error: Error | null;
  failedKey: number | null;
}

export class ChunkErrorBoundary extends React.Component<
  ChunkErrorBoundaryProps,
  ChunkErrorBoundaryState
> {
  state: ChunkErrorBoundaryState = { error: null, failedKey: null };

  static getDerivedStateFromError(error: Error): Partial<ChunkErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(): void {
    // Record WHICH attempt failed: bumping resetKey auto-recovers into a
    // fresh load without unmounting siblings.
    this.setState({ failedKey: this.props.resetKey });
  }

  render(): React.ReactNode {
    if (this.state.error && this.state.failedKey === this.props.resetKey) {
      // Keep the copy plain — this boundary must never depend on the chunk
      // that just failed (or on anything else fancy).
      return (
        <div
          role="alert"
          className="m-4 rounded-2xl border border-(--line) bg-(--surface) p-6 text-center space-y-3"
        >
          <p className="text-xs sm:text-sm font-bold text-(--ink)">
            {this.props.sectionName} couldn&apos;t load.
          </p>
          <p className="text-[11px] sm:text-xs font-medium text-(--ink-3)">
            Check your connection and try again — your data is untouched.
          </p>
          <button
            type="button"
            onClick={this.props.onRetry}
            className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-black text-white hover:bg-emerald-900 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Skeleton shown while a tab chunk loads (first visit only, then cached). */
export const TabFallback: React.FC = () => (
  <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading section">
    <div className="h-8 w-8 rounded-full border-4 border-emerald-200 border-t-emerald-700 animate-spin" />
  </div>
);
