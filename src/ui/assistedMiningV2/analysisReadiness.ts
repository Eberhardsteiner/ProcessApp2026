import type { ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import { buildVerifiedAnalysisFacts, canUseStrongPercentages, detectProcessMiningAnalysisMode, getAnalysisModeLabel } from './pmShared';

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
  const verifiedFacts = buildVerifiedAnalysisFacts({
    cases,
    observations,
    lastDerivationSummary: lastSummary,
    qualitySummary: quality,
  });
  const caseCount = verifiedFacts.caseCount;
  const analysisMode = detectProcessMiningAnalysisMode({
    cases,
    observations,
    lastDerivationSummary: lastSummary,
    qualitySummary: quality,
  });
  const orderingBackedCaseCount = verifiedFacts.orderingBackedCaseCount;
  const hasVerifiedCompareBasis = verifiedFacts.compareCapabilityAllowed;
  const hasVerifiedTimingBasis = verifiedFacts.timingCapabilityAllowed;
  const hasVerifiedVariantBasis = verifiedFacts.variantsCapabilityAllowed;

  let stage: MiningReadinessStage = 'intake';
  if (stepCount > 0) stage = 'draft';
  if (analysisMode === 'exploratory-mining' && hasVerifiedCompareBasis) stage = 'comparison';
  if (analysisMode === 'true-mining' && hasVerifiedTimingBasis && canUseStrongPercentages(analysisMode, caseCount)) stage = 'mining';

  const compareReady = stepCount > 0 && (hasHappyPath(version) || Boolean(state.discoverySummary?.topSteps?.length)) && verifiedFacts.caseCount >= 1;

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
      enabled: compareReady,
      note: compareReady
        ? hasHappyPath(version)
          ? hasVerifiedCompareBasis
            ? 'Ein vorhandener Happy Path kann jetzt auf belastbarer Vergleichsbasis als Soll-Prozess genutzt werden.'
            : 'Ein vorhandener Happy Path erlaubt bereits einen vorsichtigen Soll-Abgleich auf Entwurfsbasis.'
          : 'Die lokale Vergleichsbasis ist belastbar genug, um Soll-Ist-Hinweise vorsichtig zu prüfen.'
        : hasHappyPath(version)
        ? 'Ein Happy Path ist vorhanden, aber es fehlen noch tragfähige Schritte für den Soll-Abgleich.'
        : 'Sobald Kernprozess und Vergleichsbasis verifiziert sind, wird der Soll-Ist-Abgleich sinnvoll.',
    },
    {
      key: 'variants',
      label: 'Varianten vergleichen',
      enabled: hasVerifiedVariantBasis,
      note: hasVerifiedVariantBasis
        ? verifiedFacts.verifiedEventlogEligibility
          ? 'Verifizierte Mehrfall- und Spurenbasis erlaubt jetzt einen belastbareren Variantenvergleich.'
          : 'Mehrere belastbar geordnete Quellen erlauben einen vorsichtigen Variantenvergleich.'
        : verifiedFacts.reconstructedSingleCase
        ? 'Eine rekonstruierte Einzelfallspur reicht nicht für echte Varianten.'
        : 'Für echte Varianten braucht es mindestens zwei belastbar geordnete Fälle oder Spuren.',
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
      enabled: hasVerifiedTimingBasis,
      note: hasVerifiedTimingBasis
        ? verifiedFacts.verifiedEventlogEligibility
          ? 'Verifizierte Zeitanker und geordnete Spuren erlauben Aussagen zu Warte- und Durchlaufzeiten.'
          : 'Mehrere belastbare Zeitangaben erlauben vorsichtige Aussagen zu Warte- und Durchlaufzeiten.'
        : 'Ohne verifizierte Zeitbasis bleibt die Analyse auf Struktur und Reibungen fokussiert.',
    },
  ];

  const nextActions: string[] = [];
  if (stepCount === 0) {
    nextActions.push('Zuerst ein Dokument hochladen oder einen Fall beschreiben und automatisch auswerten lassen.');
  }
  if (stepCount > 0 && (quality?.unclearLabelCount ?? 0) > 0) {
    nextActions.push('Die erkannten Schritte kurz prüfen und unklare Bezeichnungen vereinheitlichen.');
  }
  if (stepCount > 0 && caseCount < 2) {
    nextActions.push('Einen zweiten belastbaren Fall oder eine weitere Quelle ergänzen, damit Muster und Unterschiede sichtbar werden.');
  }
  if (stepCount > 0 && caseCount >= 2 && orderingBackedCaseCount < Math.min(caseCount, 2)) {
    nextActions.push('Die Reihenfolge oder Case-Zuordnung der Quellen prüfen, damit Vergleich und Varianten nicht auf fragiler Basis laufen.');
  }
  if (!hasHappyPath(version) && stepCount > 0) {
    nextActions.push('Im Capture-Teil einen Happy Path pflegen, damit der Soll-Abgleich belastbarer wird.');
  }
  if (!hasVerifiedTimingBasis && stepCount > 0) {
    nextActions.push('Wenn möglich verifizierbare Datums- oder Uhrzeitangaben ergänzen, bevor zeitbasierte Hotspots interpretiert werden.');
  }
  if (stage === 'comparison' || stage === 'mining') {
    nextActions.push('Discovery, Soll-Abgleich und Verbesserungshebel nacheinander durchgehen und priorisieren.');
  }

  const cautionNotes: string[] = [];
  if (analysisMode === 'process-draft') {
    cautionNotes.push('Die Ergebnisse zeigen derzeit vor allem einen Prozessentwurf und keine belastbaren Unternehmensquoten.');
  }
  if (caseCount > 0 && !canUseStrongPercentages(analysisMode, caseCount)) {
    cautionNotes.push('Mit dieser verifizierten Fallbasis sind Mengen- und Prozentangaben vorsichtig zu lesen und eher als Richtungssignal zu verstehen.');
  }
  if (!hasVerifiedTimingBasis && stepCount > 0) {
    cautionNotes.push('Ohne verifizierte Zeitbasis bleiben Aussagen zu Durchlauf- oder Wartezeiten bewusst zurückhaltend.');
  }
  if (orderingBackedCaseCount < caseCount && caseCount > 0) {
    cautionNotes.push('Ein Teil der Quellen enthält noch keine verifizierte Reihenfolge oder Case-Struktur. Eine kurze Prüfung erhöht die Ergebnisstärke.');
  }
  if (verifiedFacts.verifiedEventlogEligibility && verifiedFacts.traceCaseCount <= 1) {
    cautionNotes.push('Trotz Eventstruktur liegt aktuell nur eine belastbare Spur vor. Varianten und Vergleich bleiben deshalb begrenzt.');
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
      ? 'Die lokale Engine kann bereits einen Prozessentwurf, erkannte Rollen, Reibungssignale und erste Soll-Hinweise liefern. Für robuste Varianten braucht es mehr als einen verifizierten Fall.'
      : stage === 'comparison'
      ? 'Mit mehreren verifizierten Quellen lassen sich Kernprozess, Soll-Abweichungen, instabile Stellen und erste Hotspots vorsichtig verdichten.'
      : 'Mehrere strukturierte Fälle mit verifizierter Zeitbasis erlauben jetzt belastbarere Aussagen zu Varianten, Übergaben und zeitbasierten Hotspots.';

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
