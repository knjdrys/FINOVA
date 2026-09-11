import React from 'react';
import { PaldoLogo } from './ui/PaldoLogo';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** Consecutive boundary trips this session (reload resets React state, not this). */
  tripCount: number;
}

const TRIP_KEY = 'FINOVA_ERROR_TRIPS';

/**
 * Top-level safety net. Without it, any render-time crash blanks the entire
 * app (bad for a finance tool). Here we show a calm, recoverable screen and
 * keep the user's locally-stored data intact.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, tripCount: 0 };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let trips = 0;
    try {
      trips = Number(sessionStorage.getItem(TRIP_KEY) || 0) + 1;
      sessionStorage.setItem(TRIP_KEY, String(trips));
    } catch {
      trips = 1;
    }
    return { error, tripCount: trips };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Keep the message plain — i18n may be the thing that crashed.
    console.error('PALDO encountered an unexpected error:', error, info);
  }

  private handleReload = (): void => {
    this.setState({ error: null, tripCount: 0 });
    window.location.reload();
  };

  private handleFactoryReset = (): void => {
    // Last resort only: wipe every PALDO-owned key and restart clean.
    try {
      const owned = Object.keys(localStorage).filter(
        (k) => k.startsWith('FINOVA_') || k.startsWith('paldo')
      );
      for (const k of owned) localStorage.removeItem(k);
      sessionStorage.removeItem(TRIP_KEY);
    } catch {
      // Storage itself may be broken — reload anyway and let the boundary speak.
    }
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen w-full bg-(--bg) text-(--ink) flex items-center justify-center p-6 font-sans">
          <div className="max-w-sm w-full rounded-[28px] bg-(--surface) p-6 text-center border border-(--line) shadow-sm space-y-4">
            <PaldoLogo className="h-9 w-auto mx-auto" />
            <h2 className="text-lg font-black text-(--ink) tracking-tight">
              Something went wrong
            </h2>
            <p className="text-xs sm:text-sm font-medium text-(--ink-3) leading-relaxed">
              The app hit an unexpected error. Your data is safe on this device — reloading
              usually fixes it.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full flex items-center justify-center rounded-2xl bg-(--brand) py-3 text-sm font-black text-(--accent) shadow-md hover:bg-(--brand-hover) transition-all cursor-pointer"
            >
              Reload PALDO
            </button>
            {this.state.tripCount >= 2 && (
              <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-3">
                <p className="text-[11px] font-bold text-red-800 leading-relaxed">
                  Reloading didn't fix it — saved data on this device may be triggering the
                  crash. You can erase local data and start fresh (cloud data is untouched).
                </p>
                <button
                  type="button"
                  onClick={this.handleFactoryReset}
                  className="w-full flex items-center justify-center rounded-2xl border border-red-300 bg-white py-2.5 text-xs font-black text-red-700 hover:bg-red-100 transition-all cursor-pointer"
                >
                  Erase local data &amp; restart
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
