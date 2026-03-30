import type { ProcessMiningAssistedV2State, ProcessMiningAssistedV2Step, ProcessVersion } from '../../domain/process';
import { detectProcessMiningAnalysisMode, getAnalysisModeLabel } from './pmShared';

export type MiningReadinessStage = 'intake' | 'draft' | 'comparison' | 'mining';

export interface MiningCapability {
  key: string;
  label: string;
  enabled: boolean;
  note: string;
}

export interface MiningReadinessResult {
  stage: MiningReadinessStage;
  stageLabel: string;
  analysisModeLabel: string;
  headline: string;
  summary: string;
  confidenceLabel: string;
  confidenceTone: 'green' | 'amber' | 'red' | 'slate';
  capabilities: MiningCapability[];
  nextActions: string[];
  cautionNotes: string[];
  recommendedStep: ProcessMiningAssistedV2Step;
  recommendedStepLabel: string;
  recommendedStepReason: string;
}

function hasHappyPath(version?: ProcessVersion): boolean {
  return Boolean(version?.sidecar.captureDraft?.happyPath?.length);
}

function getStageLabel(stage: MiningReadinessStage): string {
  if (stage === 'intake') return 'Einstieg';
  if (stage === 'draft') return 'Prozessentwurf';
  if (stage === 'comparison') return 'Vergleich & Muster';
  return 'Belastbare Analyse';
}

function getConfidenceTone(confidence?: 'high' | 'medium' | 'low'): MiningReadinessResult['confidenceTone'] {
  if (confidence === 'high') return 'green';
  if (confidence === 'medium') return 'amber';
  if (confidence === 'low') return 'red';
  return 'slate';
}

function getConfidenceLabel(confidence?: 'high' | 'medium' | 'low'): string {
  if (confidence === 'high') return 'Hohe lokale Verlässlichkeit';
  if (confidence === 'medium') return 'Mittlere lokale Verlässlichkeit';
  if (confidence === 'low') return 'Niedrige lokale Verlässlichkeit';
  return 'Noch keine lokale Bewertung';
}


function getRecommendedStepLabel(step: ProcessMiningAssistedV2Step): string {
  if (step === 'observations') return 'Material auswerten';
  if (step === 'discovery') return 'Kernprozess verdichten';
  if (step === 'conformance') return 'Soll-Abgleich öffnen';
  if (step === 'enhancement') return 'Verbesserungshebel prüfen';
  return 'Ergebnisse sichern';
}

function pickRecommendedStep(params: {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
  caseCount: number;
  stepCount: number;
  realTimeCount: number;
  qualityUnclearLabelCount: number;
}): { step: ProcessMiningAssistedV2Step; reason: string } {
  const { state, version, caseCount, stepCount, realTimeCount, qualityUnclearLabelCount } = params;
  const hasDiscovery = Boolean(state.discoverySummary?.topSteps?.length);
  const hasTarget = hasHappyPath(version) || hasDiscovery;

  if (stepCount === 0) {
    return {
      step: 'observations',
      reason: 'Zuerst braucht die App mindestens ein auswertbares Dokument oder einen beschriebenen Fall.',
    };
  }

  if (qualityUnclearLabelCount > 0) {
    return {
      step: 'observations',
      reason: 'Eine kurze Prüfung unklarer Schrittbezeichnungen verbessert die Verständlichkeit und stabilisiert die Folgeanalyse.',
    };
  }

  if (!hasDiscovery) {
    return {
      step: 'discovery',
      reason: 'Die vorhandenen Schritte reichen jetzt aus, um einen verständlichen Prozessentwurf oder Kernprozess aufzubauen.',
    };
  }

  if (hasTarget && !state.conformanceSummary) {
    return {
      step: 'conformance',
      reason: 'Mit einem Happy Path oder dem bereits verdichteten Kernprozess lohnt sich nun der Soll-Abgleich.',
    };
  }

  if (!state.enhancementSummary) {
    return {
      step: 'enhancement',
      reason: realTimeCount > 0
        ? 'Jetzt lassen sich sowohl strukturelle als auch zeitbasierte Hotspots lokal prüfen.'
        : 'Jetzt lassen sich Reibung, Übergaben, Rücksprünge und Strukturprobleme lokal priorisieren.',
    };
  }

  return {
    step: 'augmentation',
    reason: caseCount >= 2
      ? 'Die wichtigsten lokalen Erkenntnisse liegen vor und sollten jetzt gesichert oder in Maßnahmen überführt werden.'
      : 'Der lokale Prozessentwurf ist ausreichend ausgearbeitet und kann nun als Evidenz oder Maßnahmenbasis gesichert werden.',
  };
}


export function computeMiningReadiness(params: {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
}): MiningReadinessResult {
  const { state, version } = params;
  const quality = state.qualitySummary;
  const lastSummary = state.lastDerivationSummary;
  const observations = state.observations ?? [];
  const cases = state.cases ?? [];
  const stepCount = observations.filter(observation => observation.kind === 'step').length;
  const issueCount = observations.filter(observation => observation.kind === 'issue').length;
  const realTimeCount = observations.filter(observation => observation.timestampQuality === 'real').length;
  const caseCount = Math.max(cases.length, new Set(observations.map(observation => observation.sourceCaseId).filter(Boolean)).size);
  const analysisMode = detectProcessMiningAnalysisMode({
    cases,
    observations,
    lastDerivationSummary: lastSummary,
  });

  let stage: MiningReadinessStage = 'intake';
  if (stepCount > 0) stage = 'draft';
  if (caseCount >= 2 && stepCount >= 4) stage = 'comparison';
  if (caseCount >= 5 && realTimeCount >= Math.max(3, Math.ceil(stepCount * 0.4))) stage = 'mining';

  const capabilities: MiningCapability[] = [
    {
      key: 'draft',
      label: 'Prozessentwurf verdichten',
      enabled: stepCount > 0,
      note: stepCount > 0
        ? 'Erkannte Schritte lassen sich zu einem belastbaren Erstentwurf ordnen.'
        : 'Sobald ein Dokument oder Fall ausgewertet wurde, entsteht ein Prozessentwurf.',
    },
    {
      key: 'compare',
      label: 'Mit Soll abgleichen',
      enabled: stepCount > 0 && (hasHappyPath(version) || Boolean(state.discoverySummary?.topSteps?.length)),
      note: hasHappyPath(version)
        ? 'Ein vorhandener Happy Path kann direkt als Soll-Prozess genutzt werden.'
        : 'Sobald ein Kernprozess oder Happy Path vorliegt, wird Soll-Ist-Vergleich sinnvoll.',
    },
    {
      key: 'variants',
      label: 'Varianten vergleichen',
      enabled: caseCount >= 2 && stepCount >= 4,
      note: caseCount >= 2
        ? 'Mehrere Quellen erlauben Muster und Unterschiede zwischen Fällen.'
        : 'Für echte Varianten braucht es mindestens zwei Fälle oder Dokumente.',
    },
    {
      key: 'hotspots',
      label: 'Reibungssignale erkennen',
      enabled: issueCount > 0 || stepCount > 0,
      note: issueCount > 0
        ? 'Lokale Signalerkennung kann Friktionen bereits ohne KI sichtbar machen.'
        : 'Mit mehr Material werden Reibungssignale stabiler und konkreter.',
    },
    {
      key: 'timing',
      label: 'Zeitbasierte Hotspots',
      enabled: realTimeCount > 0,
      note: realTimeCount > 0
        ? 'Echte Zeitangaben erlauben Aussagen zu Warte- und Durchlaufzeiten.'
        : 'Ohne echte Datum-/Zeitangaben bleibt die Analyse auf Struktur und Friktionen fokussiert.',
    },
  ];

  const nextActions: string[] = [];
  if (stepCount === 0) {
    nextActions.push('Zuerst ein Dokument hochladen oder einen Fall beschreiben und automatisch auswerten lassen.');
  }
  if (stepCount > 0 && (quality?.unclearLabelCount ?? 0) > 0) {
    nextActions.push('Die erkannten Schritte kurz prüfen und unklare Bezeichnungen vereinheitlichen.');
  }
  if (caseCount < 2 && stepCount > 0) {
    nextActions.push('Einen zweiten Fall oder ein weiteres Dokument ergänzen, damit Muster und Unterschiede sichtbar werden.');
  }
  if (!hasHappyPath(version) && stepCount > 0) {
    nextActions.push('Im Capture-Teil einen Happy Path pflegen, damit der Soll-Abgleich belastbarer wird.');
  }
  if (realTimeCount === 0 && stepCount > 0) {
    nextActions.push('Wenn möglich Datums- oder Uhrzeitangaben ergänzen, um Wartezeiten lokal auswerten zu können.');
  }
  if (stage === 'comparison' || stage === 'mining') {
    nextActions.push('Discovery, Soll-Abgleich und Verbesserungshebel nacheinander durchgehen und priorisieren.');
  }

  const cautionNotes: string[] = [];
  if (analysisMode === 'process-draft') {
    cautionNotes.push('Die Ergebnisse zeigen derzeit vor allem einen dokumentbasierten Prozessentwurf und keine belastbaren Unternehmensquoten.');
  }
  if (caseCount > 0 && caseCount < 5) {
    cautionNotes.push('Mit wenigen Fällen sind Varianten und Abweichungsraten nur als erste Hinweise zu lesen.');
  }
  if (realTimeCount === 0 && stepCount > 0) {
    cautionNotes.push('Ohne echte Zeitangaben bleiben Aussagen zu Durchlauf- oder Wartezeiten vorsichtig formuliert.');
  }
  if ((quality?.casesWithOrdering ?? 0) < caseCount && caseCount > 0) {
    cautionNotes.push('Ein Teil der Quellen enthält noch keine saubere Schrittfolge. Eine kurze Prüfung erhöht die Ergebnisstärke.');
  }

  const stageLabel = getStageLabel(stage);
  const analysisModeLabel = getAnalysisModeLabel(analysisMode);
  const confidenceTone = getConfidenceTone(lastSummary?.confidence);
  const confidenceLabel = getConfidenceLabel(lastSummary?.confidence);

  const headline =
    stage === 'intake'
      ? 'Die App wartet noch auf auswertbares Material.'
      : stage === 'draft'
      ? 'Ein belastbarer Prozessentwurf ist vorhanden.'
      : stage === 'comparison'
      ? 'Die App kann jetzt Muster, Unterschiede und Soll-Abweichungen herausarbeiten.'
      : 'Die Datenbasis trägt jetzt auch weitergehende Mining-Aussagen.';

  const summary =
    stage === 'intake'
      ? 'Sobald ein Dokument oder Fall automatisch ausgewertet wurde, werden erkannte Schritte, Rollen und Reibungssignale lokal aufgebaut.'
      : stage === 'draft'
      ? 'Die lokale Engine kann bereits einen Prozessentwurf, erkannte Rollen, Reibungssignale und erste Soll-Hinweise liefern. Für robuste Varianten braucht es mehr als einen Fall.'
      : stage === 'comparison'
      ? 'Mit mehreren Quellen lassen sich Kernprozess, Soll-Abweichungen, instabile Stellen und erste Hotspots auch ohne KI sinnvoll verdichten.'
      : 'Mehrere strukturierte Fälle und echte Zeitangaben erlauben jetzt belastbarere Aussagen zu Varianten, Übergaben und zeitbasierten Hotspots.';

  const recommended = pickRecommendedStep({
    state,
    version,
    caseCount,
    stepCount,
    realTimeCount,
    qualityUnclearLabelCount: quality?.unclearLabelCount ?? 0,
  });

  return {
    stage,
    stageLabel,
    analysisModeLabel,
    headline,
    summary,
    confidenceLabel,
    confidenceTone,
    capabilities,
    nextActions: nextActions.slice(0, 4),
    cautionNotes: cautionNotes.slice(0, 4),
    recommendedStep: recommended.step,
    recommendedStepLabel: getRecommendedStepLabel(recommended.step),
    recommendedStepReason: recommended.reason,
  };
}
