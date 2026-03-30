import type {
  ProcessMiningAssistedV2State,
  ProcessMiningAssistedV2Step,
  ProcessVersion,
} from '../../domain/process';
import type { CaptureDraftStep } from '../../domain/capture';
import { computeV2Discovery } from './discovery';
import { computeV2Conformance } from './conformance';
import { computeV2Enhancement } from './enhancement';
import { detectProcessMiningAnalysisMode, getAnalysisModeLabel } from './pmShared';

export interface InstantInsightCard {
  id: string;
  tone: 'strength' | 'risk' | 'gap';
  title: string;
  summary: string;
  bullets?: string[];
}

export interface InstantAnalysisSnapshot {
  analysisModeLabel: string;
  headline: string;
  summary: string;
  mainSteps: string[];
  cards: InstantInsightCard[];
  nextStep: ProcessMiningAssistedV2Step;
  nextStepLabel: string;
  nextStepReason: string;
}

function getHappyPath(version?: ProcessVersion): CaptureDraftStep[] | undefined {
  const happyPath = version?.sidecar.captureDraft?.happyPath;
  return happyPath && happyPath.length > 0 ? happyPath : undefined;
}

function getNextStepLabel(step: ProcessMiningAssistedV2Step): string {
  if (step === 'observations') return 'Material weiter auswerten';
  if (step === 'discovery') return 'Kernprozess verdichten';
  if (step === 'conformance') return 'Soll-Abgleich öffnen';
  if (step === 'enhancement') return 'Verbesserungshebel prüfen';
  return 'Ergebnisse sichern';
}

function pickNextStep(params: {
  state: ProcessMiningAssistedV2State;
  hasTarget: boolean;
  unclearLabelCount: number;
}): { step: ProcessMiningAssistedV2Step; reason: string } {
  const { state, hasTarget, unclearLabelCount } = params;
  const stepCount = state.observations.filter(observation => observation.kind === 'step').length;

  if (stepCount === 0) {
    return {
      step: 'observations',
      reason: 'Es wurden noch keine belastbaren Prozessschritte erkannt.',
    };
  }

  if (unclearLabelCount > 0) {
    return {
      step: 'observations',
      reason: 'Ein kurzer Blick auf unklare Schrittbezeichnungen macht die weitere Analyse meist stabiler.',
    };
  }

  if (!state.discoverySummary?.topSteps?.length) {
    return {
      step: 'discovery',
      reason: 'Die lokale Engine hat genug Material, um jetzt einen klaren Prozessentwurf oder Kernprozess zu verdichten.',
    };
  }

  if (hasTarget && !state.conformanceSummary) {
    return {
      step: 'conformance',
      reason: 'Mit einer Vergleichsbasis aus Happy Path oder Kernprozess lohnt sich jetzt der Soll-Abgleich.',
    };
  }

  if (!state.enhancementSummary) {
    return {
      step: 'enhancement',
      reason: 'Als Nächstes sollte geprüft werden, wo Reibung, Rücksprünge oder Koordinationsaufwand entstehen.',
    };
  }

  return {
    step: 'augmentation',
    reason: 'Die wichtigsten lokalen Erkenntnisse sind da und können jetzt gesichert oder in Maßnahmen überführt werden.',
  };
}

export function computeInstantAnalysisSnapshot(params: {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
}): InstantAnalysisSnapshot | null {
  const { state, version } = params;
  const stepObservations = state.observations.filter(observation => observation.kind === 'step');
  if (stepObservations.length === 0) return null;

  const analysisMode = detectProcessMiningAnalysisMode({
    cases: state.cases,
    observations: state.observations,
    lastDerivationSummary: state.lastDerivationSummary,
  });
  const discovery = computeV2Discovery({
    cases: state.cases,
    observations: state.observations,
    lastDerivationSummary: state.lastDerivationSummary,
  });

  const happyPath = getHappyPath(version);
  const hasTarget = Boolean((happyPath && happyPath.length > 0) || discovery.coreProcess.length > 0);
  const conformance = hasTarget
    ? computeV2Conformance({
        cases: state.cases,
        observations: state.observations,
        captureHappyPath: happyPath,
        coreProcess: discovery.coreProcess,
        lastDerivationSummary: state.lastDerivationSummary,
      })
    : null;
  const enhancement = computeV2Enhancement({
    cases: state.cases,
    observations: state.observations,
    lastDerivationSummary: state.lastDerivationSummary,
  });

  const quality = state.qualitySummary;
  const firstSteps = discovery.coreProcess.slice(0, 6);
  const topDeviation = conformance?.topDeviations[0];
  const topHotspot = enhancement.hotspots[0];
  const gaps: string[] = [];

  if ((state.cases?.length ?? 0) < 2) {
    gaps.push('Ein zweiter Fall oder ein weiteres Dokument würde Unterschiede und wiederkehrende Muster sichtbarer machen.');
  }
  if ((quality?.observationsWithRealTime ?? 0) === 0) {
    gaps.push('Ohne echte Datum- oder Uhrzeitangaben bleiben Aussagen zu Warte- und Durchlaufzeiten vorsichtig.');
  }
  if ((quality?.unclearLabelCount ?? 0) > 0) {
    gaps.push(`${quality?.unclearLabelCount} Schrittbezeichnungen wirken noch unklar und sollten kurz geprüft werden.`);
  }
  if (!happyPath) {
    gaps.push('Ein gepflegter Happy Path aus der Prozesserfassung verbessert später den Soll-Abgleich.');
  }

  const cards: InstantInsightCard[] = [
    {
      id: 'main-flow',
      tone: 'strength',
      title:
        analysisMode === 'process-draft'
          ? 'Es liegt bereits ein brauchbarer Prozessentwurf vor'
          : 'Die App erkennt bereits eine Hauptlinie im Prozess',
      summary:
        firstSteps.length > 0
          ? `Die lokale Engine verdichtet aktuell ${firstSteps.length} Hauptschritte. ${firstSteps.slice(0, 3).join(' → ')}${firstSteps.length > 3 ? ' …' : ''}`
          : 'Es wurden bereits Schritte erkannt, aber die Hauptlinie ist noch sehr kurz.',
      bullets: firstSteps.slice(0, 5),
    },
  ];

  if (topDeviation) {
    cards.push({
      id: 'deviation',
      tone: 'risk',
      title: 'Wichtigster Soll-Hinweis',
      summary: topDeviation.description,
      bullets: conformance?.targetSteps.slice(0, 4),
    });
  } else if (hasTarget) {
    cards.push({
      id: 'deviation-none',
      tone: 'strength',
      title: 'Im ersten Soll-Abgleich zeigt sich kein dominanter Konflikt',
      summary: 'Die bisher erkannten Schritte passen in dieser frühen Sicht weitgehend zur gewählten Vergleichsbasis.',
    });
  }

  if (topHotspot) {
    cards.push({
      id: 'hotspot',
      tone: topHotspot.isTimeBased ? 'risk' : 'risk',
      title: topHotspot.headline,
      summary: topHotspot.detail,
      bullets: state.lastDerivationSummary?.issueSignals?.slice(0, 3),
    });
  }

  cards.push({
    id: 'gaps',
    tone: gaps.length > 0 ? 'gap' : 'strength',
    title: gaps.length > 0 ? 'Was die Analyse noch stärker machen würde' : 'Die aktuelle Datenbasis ist für die nächsten Schritte gut vorbereitet',
    summary:
      gaps[0] ?? 'Die lokale Analyse kann jetzt ohne weitere Vorbereitung in Discovery, Soll-Abgleich und Verbesserungsanalyse übergehen.',
    bullets: gaps.slice(1, 4),
  });

  const next = pickNextStep({
    state,
    hasTarget,
    unclearLabelCount: quality?.unclearLabelCount ?? 0,
  });

  const headline =
    analysisMode === 'process-draft'
      ? 'Die App hat aus dem Material bereits einen lokalen Prozessentwurf aufgebaut.'
      : analysisMode === 'exploratory-mining'
      ? 'Die App kann schon Unterschiede, Abweichungen und Reibung zwischen mehreren Quellen aufzeigen.'
      : 'Die Datenbasis erlaubt jetzt auch weitergehende lokale Mining-Aussagen.';

  return {
    analysisModeLabel: getAnalysisModeLabel(analysisMode),
    headline,
    summary: discovery.sampleNotice,
    mainSteps: firstSteps,
    cards,
    nextStep: next.step,
    nextStepLabel: getNextStepLabel(next.step),
    nextStepReason: next.reason,
  };
}
