import type {
  DerivationSummary,
  ProcessMiningAnalysisMode,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
} from '../../domain/process';
import type { CaptureDraftStep } from '../../domain/capture';
import {
  buildAnalysisModeNotice,
  detectProcessMiningAnalysisMode,
  getCaseIdsFromObservations,
  normalizeLabel,
  sampleAwarePercentLabel,
} from './pmShared';
import {
  canonicalizeProcessStepLabel,
  labelsLikelySameProcessStep,
} from './semanticStepFamilies';

export type DeviationType = 'missing_step' | 'extra_step' | 'order_change' | 'loop';

export interface V2Deviation {
  type: DeviationType;
  description: string;
  affectedStep: string;
  caseIds: string[];
  count: number;
  pct: number;
}

export interface V2CaseConformance {
  caseId: string;
  isConformant: boolean;
  deviations: Array<{ type: DeviationType; step: string }>;
}

export interface V2ConformanceResult {
  analysisMode: ProcessMiningAnalysisMode;
  sampleNotice: string;
  targetSteps: string[];
  targetSource: 'capture-draft' | 'core-process';
  totalCases: number;
  conformantCases: number;
  conformantPct: number;
  nonConformantCases: number;
  nonConformantPct: number;
  caseResults: V2CaseConformance[];
  topDeviations: V2Deviation[];
  computedAt: string;
}

function getStepObservations(observations: ProcessMiningObservation[]): ProcessMiningObservation[] {
  return observations.filter(observation => observation.kind === 'step');
}

function getOrderedLabels(caseId: string, observations: ProcessMiningObservation[]): string[] {
  return observations
    .filter(observation => observation.sourceCaseId === caseId)
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
    .map((observation, index) => canonicalizeProcessStepLabel({
      title: observation.label,
      body: observation.evidenceSnippet,
      fallback: observation.label,
      index,
    }))
    .filter(Boolean);
}

function labelsMatch(a: string, b: string): boolean {
  return labelsLikelySameProcessStep(a, b);
}

function findMatchingTargetIndex(step: string, targetLabels: string[]): number {
  return targetLabels.findIndex(targetStep => labelsMatch(step, targetStep));
}

function checkCase(caseLabels: string[], targetLabels: string[]): Array<{ type: DeviationType; step: string }> {
  const deviations: Array<{ type: DeviationType; step: string }> = [];

  const matchedTargetIndices = new Map<number, number[]>();
  caseLabels.forEach((caseStep, caseIndex) => {
    const targetIndex = findMatchingTargetIndex(caseStep, targetLabels);
    if (targetIndex >= 0) {
      const existing = matchedTargetIndices.get(targetIndex) ?? [];
      existing.push(caseIndex);
      matchedTargetIndices.set(targetIndex, existing);
    }
  });

  targetLabels.forEach((targetStep, targetIndex) => {
    if (!matchedTargetIndices.has(targetIndex)) {
      deviations.push({ type: 'missing_step', step: targetStep });
    }
  });

  caseLabels.forEach(caseStep => {
    if (findMatchingTargetIndex(caseStep, targetLabels) < 0) {
      deviations.push({ type: 'extra_step', step: caseStep });
    }
  });

  let lastMatchedTargetIndex = -1;
  caseLabels.forEach(caseStep => {
    const targetIndex = findMatchingTargetIndex(caseStep, targetLabels);
    if (targetIndex < 0) return;
    if (targetIndex < lastMatchedTargetIndex) {
      deviations.push({ type: 'order_change', step: caseStep });
    } else {
      lastMatchedTargetIndex = targetIndex;
    }
  });

  matchedTargetIndices.forEach((caseIndices, targetIndex) => {
    if (caseIndices.length > 1) {
      deviations.push({ type: 'loop', step: targetLabels[targetIndex] });
    }
  });

  return deviations;
}

function buildDeviationLabel(type: DeviationType, step: string, count: number, totalCases: number, analysisMode: ProcessMiningAnalysisMode): string {
  const lead = sampleAwarePercentLabel(count, totalCases, analysisMode);
  if (type === 'missing_step') {
    return totalCases <= 1
      ? `Im ausgewerteten Fall fehlt „${step}".`
      : `${lead} fehlt „${step}" vollständig.`;
  }
  if (type === 'extra_step') {
    return totalCases <= 1
      ? `Im ausgewerteten Fall erscheint zusätzlich „${step}".`
      : `${lead} erscheint ein zusätzlicher Schritt: „${step}".`;
  }
  if (type === 'order_change') {
    return totalCases <= 1
      ? `Im ausgewerteten Fall taucht „${step}" an einer anderen Stelle auf.`
      : `${lead} weicht die Reihenfolge ab — „${step}" taucht an anderer Stelle auf.`;
  }
  return totalCases <= 1
    ? `Im ausgewerteten Fall wird „${step}" wiederholt.`
    : `${lead} wird „${step}" wiederholt (Schleife / Rücksprung).`;
}

export function computeV2Conformance(params: {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  captureHappyPath?: CaptureDraftStep[];
  coreProcess?: string[];
  lastDerivationSummary?: DerivationSummary;
}): V2ConformanceResult {
  const stepObservations = getStepObservations(params.observations);

  let targetSteps: string[];
  let targetSource: 'capture-draft' | 'core-process';

  if (params.captureHappyPath && params.captureHappyPath.length > 0) {
    targetSteps = params.captureHappyPath
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((step, index) => canonicalizeProcessStepLabel({ title: step.label.trim(), fallback: step.label.trim(), index }))
      .filter(Boolean);
    targetSource = 'capture-draft';
  } else if (params.coreProcess && params.coreProcess.length > 0) {
    targetSteps = params.coreProcess.map((step, index) => canonicalizeProcessStepLabel({ title: step, fallback: step, index }));
    targetSource = 'core-process';
  } else {
    const analysisMode = detectProcessMiningAnalysisMode({ cases: params.cases, observations: stepObservations, lastDerivationSummary: params.lastDerivationSummary });
    return {
      analysisMode,
      sampleNotice: buildAnalysisModeNotice({ mode: analysisMode, caseCount: params.cases.length, documentKind: params.lastDerivationSummary?.documentKind }),
      targetSteps: [],
      targetSource: 'core-process',
      totalCases: 0,
      conformantCases: 0,
      conformantPct: 0,
      nonConformantCases: 0,
      nonConformantPct: 0,
      caseResults: [],
      topDeviations: [],
      computedAt: new Date().toISOString(),
    };
  }

  const caseIds = getCaseIdsFromObservations(stepObservations);
  const totalCases = caseIds.length;
  const analysisMode = detectProcessMiningAnalysisMode({
    cases: params.cases,
    observations: stepObservations,
    lastDerivationSummary: params.lastDerivationSummary,
  });
  const sampleNotice = buildAnalysisModeNotice({
    mode: analysisMode,
    caseCount: Math.max(totalCases, params.cases.length),
    documentKind: params.lastDerivationSummary?.documentKind,
  });

  const caseResults: V2CaseConformance[] = caseIds.map(caseId => {
    const labels = getOrderedLabels(caseId, stepObservations);
    const deviations = checkCase(labels, targetSteps);
    return {
      caseId,
      isConformant: deviations.length === 0,
      deviations,
    };
  });

  const conformantCases = caseResults.filter(result => result.isConformant).length;
  const deviationTally = new Map<string, { type: DeviationType; step: string; caseIds: Set<string> }>();
  caseResults.forEach(caseResult => {
    caseResult.deviations.forEach(deviation => {
      const key = `${deviation.type}::${normalizeLabel(deviation.step)}`;
      if (!deviationTally.has(key)) {
        deviationTally.set(key, { type: deviation.type, step: deviation.step, caseIds: new Set() });
      }
      deviationTally.get(key)!.caseIds.add(caseResult.caseId);
    });
  });

  const topDeviations: V2Deviation[] = Array.from(deviationTally.values())
    .sort((a, b) => b.caseIds.size - a.caseIds.size)
    .slice(0, 8)
    .map(entry => {
      const count = entry.caseIds.size;
      const pct = Math.round((count / Math.max(totalCases, 1)) * 100);
      return {
        type: entry.type,
        description: buildDeviationLabel(entry.type, entry.step, count, totalCases, analysisMode),
        affectedStep: entry.step,
        caseIds: Array.from(entry.caseIds),
        count,
        pct,
      };
    });

  return {
    analysisMode,
    sampleNotice,
    targetSteps,
    targetSource,
    totalCases,
    conformantCases,
    conformantPct: totalCases > 0 ? Math.round((conformantCases / totalCases) * 100) : 0,
    nonConformantCases: totalCases - conformantCases,
    nonConformantPct: totalCases > 0 ? Math.round(((totalCases - conformantCases) / totalCases) * 100) : 0,
    caseResults,
    topDeviations,
    computedAt: new Date().toISOString(),
  };
}
