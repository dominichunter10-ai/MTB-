import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected application error occurred.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let parsedError: { error?: string; operationType?: string; path?: string } | null = null;
      try {
        parsedError = JSON.parse(this.state.message);
      } catch {
        parsedError = null;
      }

      return (
        <div className="min-h-screen bg-[#F6F6F3] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#DDE2DC] rounded-2xl p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#141A17] font-display">
              Trail Sync Interrupted
            </h2>
            <p className="mt-2 text-sm text-[#525E57] leading-relaxed">
              {parsedError?.error
                ? `Firestore ${parsedError.operationType ?? 'operation'} on ${parsedError.path ?? 'collection'} could not complete: ${parsedError.error}`
                : this.state.message}
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2.5 rounded-lg bg-[#141A17] text-white text-sm font-semibold hover:bg-[#232D28] transition-colors cursor-pointer"
              >
                Reload Trail Map
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
