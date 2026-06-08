// Gemeinsamer UI-Hook für die Analyse-Weiche. Hält den sichtbaren Zustand
// (idle/running/result/error/blocked/needs-paste) und kapselt:
//   - run(): KI/Heuristik über runProcessAnalysis (Brain der Weiche),
//   - runHeuristicFallback(): expliziter lokaler Fallback (kein stiller Auto-Fallback),
//   - importPasted(): Übernahme einer manuell eingefügten KI-Antwort.
// Die eigentliche Ergebnisverarbeitung (onAddDerived ...) bleibt im Panel (applyResult),
// damit KI-Ergebnis, Heuristik-Fallback und Paste-Import denselben Pfad nutzen.

import { useCallback, useState } from 'react';
import type { DerivationResult } from './documentDerivation';
import { deriveProcessArtifactsFromText } from './documentDerivation';
import {
  adaptAiCaptureToDerivation,
  type AiToObservationsResult,
  type SourceType,
} from '../../ai/aiToObservations';
import {
  runProcessAnalysis,
  type AnalysisOutcome,
  type RunAnalysisInput,
} from '../../ai/runAnalysis';
import type { AnalysisMode } from '../../ai/analysisMode';

export type AnalysisUiState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'result'; mode: AnalysisMode; result: DerivationResult; warnings: string[] }
  | { status: 'error'; mode: AnalysisMode; error: string }
  | { status: 'blocked'; reason: string }
  | { status: 'needs-paste'; prompt: string; reason: string };

export function useProcessAnalysis() {
  const [state, setState] = useState<AnalysisUiState>({ status: 'idle' });

  // Setzt running -> result/error/blocked/needs-paste und gibt das Outcome zurück.
  const run = useCallback(async (input: RunAnalysisInput): Promise<AnalysisOutcome> => {
    setState({ status: 'running' });
    const outcome = await runProcessAnalysis(input);
    switch (outcome.kind) {
      case 'result':
        setState({ status: 'result', mode: outcome.mode, result: outcome.result, warnings: outcome.warnings });
        break;
      case 'error':
        setState({ status: 'error', mode: outcome.mode, error: outcome.error });
        break;
      case 'blocked':
        setState({ status: 'blocked', reason: outcome.reason });
        break;
      case 'needs-paste':
        setState({ status: 'needs-paste', prompt: outcome.prompt, reason: outcome.reason });
        break;
    }
    return outcome;
  }, []);

  // Expliziter lokaler Fallback: ruft die Heuristik direkt und setzt result(mode 'heuristic').
  const runHeuristicFallback = useCallback(
    (i: { text: string; sourceName: string; sourceType: SourceType }): DerivationResult => {
      const result = deriveProcessArtifactsFromText({ text: i.text, fileName: i.sourceName, sourceType: i.sourceType });
      setState({ status: 'result', mode: 'heuristic', result, warnings: [] });
      return result;
    },
    [],
  );

  // Übernahme einer eingefügten KI-Antwort: bei ok -> result, sonst -> error.
  const importPasted = useCallback(
    (i: { aiText: string; originalText?: string; sourceName: string; sourceType: SourceType }): AiToObservationsResult => {
      const adapted = adaptAiCaptureToDerivation({
        aiText: i.aiText,
        originalText: i.originalText,
        sourceName: i.sourceName,
        sourceType: i.sourceType,
      });
      if (adapted.ok && adapted.result) {
        setState({ status: 'result', mode: 'ai-copy-paste', result: adapted.result, warnings: adapted.warnings });
      } else {
        setState({ status: 'error', mode: 'ai-copy-paste', error: adapted.error ?? 'KI-Antwort unbrauchbar' });
      }
      return adapted;
    },
    [],
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, run, runHeuristicFallback, importPasted, reset };
}
