import type { ProcessMiningAssistedV2State } from '../../domain/process';
import { patchV2State } from './storage';

export interface ConsistentPatchResult {
  next: ProcessMiningAssistedV2State;
  notes: string[];
}

function stepCountOf(state: ProcessMiningAssistedV2State): number {
  return state.observations.filter(observation => observation.kind === 'step').length;
}

function isDifferentArrayRef<T>(value: T[] | undefined, previous: T[]): boolean {
  return Boolean(value && value !== previous);
}

function hasAiRefinement(state: ProcessMiningAssistedV2State): boolean {
  return Boolean(state.aiRefinement?.prompt || state.aiRefinement?.responseText);
}

export function applyConsistentPatch(
  state: ProcessMiningAssistedV2State,
  patch: Partial<ProcessMiningAssistedV2State>,
): ConsistentPatchResult {
  const next = patchV2State(state, patch);
  const notes: string[] = [];

  const upstreamChanged =
    isDifferentArrayRef(patch.cases, state.cases) ||
    isDifferentArrayRef(patch.observations, state.observations) ||
    ('lastDerivationSummary' in patch && patch.lastDerivationSummary !== state.lastDerivationSummary);

  const discoveryChanged = 'discoverySummary' in patch && patch.discoverySummary !== state.discoverySummary;
  const conformanceChanged = 'conformanceSummary' in patch && patch.conformanceSummary !== state.conformanceSummary;
  const enhancementChanged = 'enhancementSummary' in patch && patch.enhancementSummary !== state.enhancementSummary;
  const reportChanged = 'reportSnapshot' in patch && patch.reportSnapshot !== state.reportSnapshot;

  if (upstreamChanged) {
    const hadAnalyses = Boolean(state.discoverySummary || state.conformanceSummary || state.enhancementSummary);
    const hadReporting = Boolean(state.reportSnapshot || (state.handoverDrafts && state.handoverDrafts.length > 0));
    const hadAi = hasAiRefinement(state);

    next.discoverySummary = undefined;
    next.conformanceSummary = undefined;
    next.enhancementSummary = undefined;
    next.reportSnapshot = undefined;
    next.handoverDrafts = undefined;
    next.aiRefinement = undefined;

    if (hadAnalyses) {
      notes.push('Nach Änderungen an Quellen oder erkannten Schritten wurden Discovery, Soll-Abgleich und Verbesserungsanalyse zurückgesetzt, damit keine veralteten Ergebnisse stehen bleiben.');
    }
    if (hadReporting) {
      notes.push('Berichte und Übergabetexte wurden ebenfalls zurückgesetzt, weil sich die Analysebasis geändert hat.');
    }
    if (hadAi) {
      notes.push('Auch die optionale KI-Verfeinerung wurde geleert, damit kein Prompt auf veralteten Ergebnissen basiert.');
    }
  }

  if (!upstreamChanged && discoveryChanged) {
    const hadDownstream = Boolean(
      state.conformanceSummary ||
        state.enhancementSummary ||
        state.reportSnapshot ||
        (state.handoverDrafts && state.handoverDrafts.length > 0),
    );
    const hadAi = hasAiRefinement(state);

    next.conformanceSummary = undefined;
    next.enhancementSummary = undefined;
    next.reportSnapshot = undefined;
    next.handoverDrafts = undefined;
    next.aiRefinement = undefined;

    if (hadDownstream) {
      notes.push('Nach einer neuen Discovery wurden nachgelagerte Analysen und Berichte zurückgesetzt, damit alles auf derselben Hauptlinie aufbaut.');
    }
    if (hadAi) {
      notes.push('Auch die optionale KI-Verfeinerung wurde geleert, weil sich die Hauptlinie geändert hat.');
    }
  }

  if (!upstreamChanged && !discoveryChanged && (conformanceChanged || enhancementChanged)) {
    const hadReport = Boolean(state.reportSnapshot || (state.handoverDrafts && state.handoverDrafts.length > 0));
    const hadAi = hasAiRefinement(state);

    next.reportSnapshot = undefined;
    next.handoverDrafts = undefined;
    next.aiRefinement = undefined;

    if (hadReport) {
      notes.push('Bericht und Übergabetexte wurden zurückgesetzt, weil sich Soll-Abgleich oder Verbesserungsanalyse geändert haben.');
    }
    if (hadAi) {
      notes.push('Auch die optionale KI-Verfeinerung wurde geleert, damit sie zur aktuellen Auswertung passt.');
    }
  }

  if (!upstreamChanged && !discoveryChanged && !conformanceChanged && !enhancementChanged && reportChanged) {
    next.handoverDrafts = patch.handoverDrafts ?? next.handoverDrafts;
  }

  if (stepCountOf(next) === 0 && next.currentStep !== 'observations') {
    next.currentStep = 'observations';
    notes.push('Der Arbeitsfluss wurde auf „Prozess auswerten“ zurückgesetzt, weil aktuell keine erkannten Prozessschritte mehr vorliegen.');
  }

  return { next, notes };
}
