import React from 'react';
import { PaldoLogo } from './ui/PaldoLogo';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level safety net. Without it, any render-time crash blanks the entire
 * app (bad for a finance tool). Here we show a calm, recoverable screen and
 * keep the user's locally-stored data intact.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Keep the message plain — i18n may be the thing that crashed.
    console.error('PALDO encountered an unexpected error:', error, info);
  }

  private handleReload = (): void => {
    this.setState({ error: null });
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
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
