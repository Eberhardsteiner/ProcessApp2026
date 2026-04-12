import React from 'react';
import { AlertTriangle, RefreshCw, ChevronDown } from 'lucide-react';

interface Props {
  title?: string;
  hint?: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  render() {
    const { error, showDetails } = this.state;
    const { title = 'Panel', hint, children } = this.props;

    if (!error) return <>{children}</>;

    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">Fehler in &quot;{title}&quot;</h3>
            {hint && (
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">{hint}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Neu laden
          </button>
          <button
            type="button"
            onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            Details {showDetails ? 'ausblenden' : 'anzeigen'}
          </button>
        </div>
        {showDetails && (
          <details open className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 overflow-auto max-h-48">
            <summary className="font-semibold cursor-pointer">{error.message}</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all text-slate-500">{error.stack}</pre>
          </details>
        )}
      </div>
    );
  }
}
