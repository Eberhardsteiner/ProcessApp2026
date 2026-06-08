// Präsentations-Komponente für den Analyse-Status. Rein darstellend; keine Politik.
// Zeigt nur die "Nicht-Erfolgs"-Zustände (running/error/blocked/needs-paste).
// Bei 'idle'/'result' rendert sie nichts – das Ergebnis zeigt das Panel selbst.

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCopy, Loader, RefreshCw, Wand2 } from 'lucide-react';
import type { AnalysisUiState } from './useProcessAnalysis';

interface Props {
  state: AnalysisUiState;
  onUseHeuristicFallback: () => void;
  onImportPasted: (aiText: string) => void;
  onRetry?: () => void;
}

export function AnalysisStatus({ state, onUseHeuristicFallback, onImportPasted, onRetry }: Props) {
  const [pasteText, setPasteText] = useState('');
  const [copied, setCopied] = useState(false);

  // 'idle'/'result' -> nichts rendern (Ergebnis zeigt das Panel selbst).
  if (state.status === 'idle' || state.status === 'result') {
    return null;
  }

  if (state.status === 'running') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">
        <Loader className="w-4 h-4 animate-spin shrink-0" />
        <span>Analysiere … (KI)</span>
      </div>
    );
  }

  if (state.status === 'blocked') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{state.reason}</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 space-y-3">
        <div className="flex items-start gap-2 text-sm text-red-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onUseHeuristicFallback}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            Lokale Vorschau ohne KI verwenden
          </button>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Erneut versuchen
            </button>
          )}
        </div>
      </div>
    );
  }

  // state.status === 'needs-paste'
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-3 space-y-3">
      <p className="text-sm text-violet-900 leading-relaxed">{state.reason}</p>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-xs font-semibold text-slate-600">Prompt für die KI</span>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.prompt);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              } catch {
                // Clipboard nicht verfügbar -> still ignorieren
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-white transition-colors"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
            {copied ? 'Kopiert' : 'Prompt kopieren'}
          </button>
        </div>
        <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100 whitespace-pre-wrap">
          {state.prompt}
        </pre>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">KI-Antwort (JSON) einfügen</label>
        <textarea
          rows={6}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Fügen Sie hier die JSON-Antwort der KI ein."
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y bg-white"
        />
        <button
          type="button"
          disabled={!pasteText.trim()}
          onClick={() => onImportPasted(pasteText)}
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Wand2 className="w-4 h-4" />
          Antwort importieren
        </button>
      </div>
    </div>
  );
}
