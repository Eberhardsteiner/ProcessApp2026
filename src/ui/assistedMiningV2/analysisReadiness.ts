import type { ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import { canUseStrongPercentages, detectProcessMiningAnalysisMode, getAnalysisModeLabel } from './pmShared';

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
}

function hasHappyPath(version?: ProcessVersion): boolean {
  return Boolean(version?.sidecar.captureDraft?.happyPath?.length);
}

function getStageLabel(stage: MiningReadinessStage): string {
  if (stage === 'intake') return 'Einstieg';
  if (stage === 'draft') return 'Prozessentwurf';
  if (stage === 'comparison') return 'Fallvergleich';
  return 'Echtes Mining';
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
  const issueCount = lastSummary?.issueSignals?.length ?? observations.filter(observation => observation.kind === 'issue').length;
  const realTimeCount = observations.filter(observation => observation.timestampQuality === 'real').length;
  const caseCount = Math.max(cases.length, new Set(observations.map(observation => observation.sourceCaseId).filter(Boolean)).size);
  const analysisMode = detectProcessMiningAnalysisMode({
    cases,
    observations,
    lastDerivationSummary: lastSummary,
  });

  let stage: MiningReadinessStage = 'intake';
  if (stepCount > 0) stage = 'draft';
  if (analysisMode === 'exploratory-mining' && caseCount >= 2 && stepCount >= 4) stage = 'comparison';
  if (analysisMode === 'true-mining' && canUseStrongPercentages(analysisMode, caseCount)) stage = 'mining';

  const capabilities: MiningCapability[] = [
    {
      key: 'draft',
      label: 'Prozessentwurf verdichten',
      enabled: stepCount > 0,
      note: stepCount > 0
        ? 'Erkannte Schritte lassen sich zu einem gut prüfbaren Erstentwurf ordnen.'
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
        ? 'Mehrere Quellen erlauben einen vorsichtigen Vergleich zwischen Fällen.'
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
  if (caseCount > 0 && !canUseStrongPercentages(analysisMode, caseCount)) {
    cautionNotes.push('Mit dieser Fallbasis sind Mengen- und Prozentangaben vorsichtig zu lesen und eher als Richtungssignal zu verstehen.');
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
      ? 'Ein erster Prozessentwurf ist vorhanden.'
      : stage === 'comparison'
      ? 'Die App kann jetzt mehrere Fälle vorsichtig vergleichen.'
      : 'Die Datenbasis trägt jetzt belastbarere Mining-Aussagen.';

  const summary =
    stage === 'intake'
      ? 'Sobald ein Dokument oder Fall automatisch ausgewertet wurde, werden erkannte Schritte, Rollen und Reibungssignale lokal aufgebaut.'
      : stage === 'draft'
      ? 'Die lokale Engine kann bereits einen Prozessentwurf, erkannte Rollen, Reibungssignale und erste Soll-Hinweise liefern. Für robuste Varianten braucht es mehr als einen Fall.'
      : stage === 'comparison'
      ? 'Mit mehreren Quellen lassen sich Kernprozess, Soll-Abweichungen, instabile Stellen und erste Hotspots vorsichtig verdichten.'
      : 'Mehrere strukturierte Fälle und echte Zeitangaben erlauben jetzt belastbarere Aussagen zu Varianten, Übergaben und zeitbasierten Hotspots.';

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
  };
}
