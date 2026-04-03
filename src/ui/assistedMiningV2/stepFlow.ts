import type { ProcessMiningAssistedV2State, ProcessMiningAssistedV2Step, ProcessVersion } from '../../domain/process';

export type StepFlowStatus = 'done' | 'active' | 'ready' | 'waiting';

export interface StepFlowItem {
  step: ProcessMiningAssistedV2Step;
  label: string;
  status: StepFlowStatus;
  summary: string;
  actionLabel?: string;
}

function hasHappyPath(version?: ProcessVersion): boolean {
  return Boolean(version?.sidecar.captureDraft?.happyPath?.length);
}

export function computeStepFlow(params: {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
}): StepFlowItem[] {
  const { state, version } = params;
  const currentStep = state.currentStep;
  const stepCount = state.observations.filter(observation => observation.kind === 'step').length;
  const hasDiscovery = Boolean(state.discoverySummary?.topSteps?.length);
  const hasTarget = hasHappyPath(version) || hasDiscovery;
  const hasEnhancement = Boolean(state.enhancementSummary?.issues?.length);
  const hasConformance = Boolean(state.conformanceSummary?.deviationNotes?.length) || Boolean(state.conformanceSummary);
  const hasReport = Boolean(state.reportSnapshot);
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  const items: Array<Omit<StepFlowItem, 'status'>> = [
    {
      step: 'observations',
      label: 'Prozess auswerten',
      summary:
        stepCount > 0
          ? `${stepCount} erkannte Prozessschritte aus ${Math.max(state.cases.length, 1)} ${Math.max(state.cases.length, 1) === 1 ? 'Quelle' : 'Quellen'} vorhanden.`
          : 'Noch keine ausgewertete Quelle vorhanden.',
      actionLabel: stepCount > 0 ? 'Weitere Quelle ergänzen' : 'Quelle auswerten',
    },
    {
      step: 'discovery',
      label: 'Kernprozess erkennen',
      summary:
        stepCount > 0
          ? 'Die Hauptlinie kann jetzt lokal aus den erkannten Schritten verdichtet werden.'
          : 'Wartet auf mindestens eine ausgewertete Quelle.',
      actionLabel: stepCount > 0 ? 'Discovery öffnen' : 'Zur Quelle zurückgehen',
    },
    {
      step: 'conformance',
      label: 'Mit Soll abgleichen',
      summary:
        !stepCount
          ? 'Wartet auf erkannte Prozessschritte.'
          : hasTarget
          ? 'Ein Soll-Vergleich ist möglich.'
          : 'Wartet auf einen Happy Path oder einen erkannten Kernprozess.',
      actionLabel:
        !stepCount ? 'Quelle auswerten' : hasTarget ? 'Soll-Abgleich öffnen' : 'Zuerst Kernprozess erkennen',
    },
    {
      step: 'enhancement',
      label: 'Verbesserungen erkennen',
      summary:
        stepCount > 0
          ? 'Hotspots, Reibungen und fehlende Angaben lassen sich jetzt lokal prüfen.'
          : 'Wartet auf erkannte Prozessschritte.',
      actionLabel: stepCount > 0 ? 'Hotspots prüfen' : 'Quelle auswerten',
    },
    {
      step: 'augmentation',
      label: 'Ergebnisse anreichern',
      summary:
        hasDiscovery || hasConformance || hasEnhancement || hasReport
          ? 'Ergebnisse, Bericht und Übergaben können jetzt angereichert werden.'
          : stepCount > 0
          ? 'Möglich, aber sinnvoller nach Discovery oder Verbesserungsanalyse.'
          : 'Wartet auf eine erste Analysebasis.',
      actionLabel:
        hasDiscovery || hasConformance || hasEnhancement || hasReport
          ? 'Bericht und Übergaben öffnen'
          : stepCount > 0
          ? 'Vorher Discovery starten'
          : 'Quelle auswerten',
    },
  ];

  return items.map((item, index) => ({
    ...item,
    status:
      index < currentIndex
        ? 'done'
        : item.step === currentStep
        ? 'active'
        : isReady(item.step, { stepCount, hasTarget, hasDiscovery, hasEnhancement, hasConformance, hasReport })
        ? 'ready'
        : 'waiting',
  }));
}

function isReady(
  step: ProcessMiningAssistedV2Step,
  status: {
    stepCount: number;
    hasTarget: boolean;
    hasDiscovery: boolean;
    hasEnhancement: boolean;
    hasConformance: boolean;
    hasReport: boolean;
  },
): boolean {
  if (step === 'observations') return true;
  if (step === 'discovery') return status.stepCount > 0;
  if (step === 'conformance') return status.stepCount > 0 && status.hasTarget;
  if (step === 'enhancement') return status.stepCount > 0;
  return status.stepCount > 0;
}

const STEP_ORDER: ProcessMiningAssistedV2Step[] = [
  'observations',
  'discovery',
  'conformance',
  'enhancement',
  'augmentation',
];
