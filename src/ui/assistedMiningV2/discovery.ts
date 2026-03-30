import type {
  DerivationSummary,
  ProcessMiningAnalysisMode,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
} from '../../domain/process';
import {
  buildAnalysisModeNotice,
  detectProcessMiningAnalysisMode,
  getCaseIdsFromObservations,
  normalizeLabel,
} from './pmShared';

export interface V2Variant {
  id: string;
  steps: string[];
  normalizedKey: string;
  caseCount: number;
  caseIds: string[];
  share: number;
  isCore: boolean;
}

export interface V2Loop {
  label: string;
  count: number;
  caseIds: string[];
}

export interface V2DiscoveryResult {
  analysisMode: ProcessMiningAnalysisMode;
  sampleNotice: string;
  coreProcess: string[];
  coreProcessCaseCoverage: number;
  coreProcessCaseCount: number;
  totalCases: number;
  totalObservations: number;
  totalStepObservations: number;
  variants: V2Variant[];
  loops: V2Loop[];
  computedAt: string;
}

function getStepObservations(observations: ProcessMiningObservation[]): ProcessMiningObservation[] {
  return observations.filter(observation => observation.kind === 'step');
}

function getSequenceForCase(caseId: string, observations: ProcessMiningObservation[]): string[] {
  return observations
    .filter(observation => observation.sourceCaseId === caseId)
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
    .map(observation => observation.label.trim())
    .filter(Boolean);
}

function detectLoops(sequence: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const step of sequence) {
    const key = normalizeLabel(step);
    if (seen.has(key)) repeated.add(step);
    seen.add(key);
  }
  return Array.from(repeated);
}

export function computeV2Discovery(params: {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  lastDerivationSummary?: DerivationSummary;
}): V2DiscoveryResult {
  const stepObservations = getStepObservations(params.observations);
  const caseIds = getCaseIdsFromObservations(stepObservations);
  const analysisMode = detectProcessMiningAnalysisMode({
    cases: params.cases,
    observations: stepObservations,
    lastDerivationSummary: params.lastDerivationSummary,
  });
  const sampleNotice = buildAnalysisModeNotice({
    mode: analysisMode,
    caseCount: Math.max(caseIds.length, params.cases.length),
    documentKind: params.lastDerivationSummary?.documentKind,
  });

  if (caseIds.length === 0) {
    return {
      analysisMode,
      sampleNotice,
      coreProcess: [],
      coreProcessCaseCoverage: 0,
      coreProcessCaseCount: 0,
      totalCases: params.cases.length,
      totalObservations: params.observations.length,
      totalStepObservations: 0,
      variants: [],
      loops: [],
      computedAt: new Date().toISOString(),
    };
  }

  const caseSequences = new Map<string, string[]>();
  for (const caseId of caseIds) {
    caseSequences.set(caseId, getSequenceForCase(caseId, stepObservations));
  }

  const variantMap = new Map<string, { steps: string[]; caseIds: string[] }>();
  for (const [caseId, steps] of caseSequences) {
    const normalizedKey = steps.map(normalizeLabel).join(' → ');
    if (!variantMap.has(normalizedKey)) {
      variantMap.set(normalizedKey, { steps, caseIds: [] });
    }
    variantMap.get(normalizedKey)!.caseIds.push(caseId);
  }

  const totalCases = caseIds.length;
  const variants = Array.from(variantMap.entries())
    .sort((a, b) => b[1].caseIds.length - a[1].caseIds.length)
    .map(([normalizedKey, value], index) => ({
      id: crypto.randomUUID(),
      steps: value.steps,
      normalizedKey,
      caseCount: value.caseIds.length,
      caseIds: value.caseIds,
      share: Math.round((value.caseIds.length / Math.max(totalCases, 1)) * 100),
      isCore: index === 0,
    }));

  const coreVariant = variants[0];
  const loopMap = new Map<string, Set<string>>();
  for (const [caseId, steps] of caseSequences) {
    for (const repeatedStep of detectLoops(steps)) {
      const key = normalizeLabel(repeatedStep);
      if (!loopMap.has(key)) loopMap.set(key, new Set());
      loopMap.get(key)!.add(caseId);
    }
  }

  const loops = Array.from(loopMap.entries())
    .sort((a, b) => b[1].size - a[1].size)
    .map(([key, caseIdSet]) => ({
      label: stepObservations.find(observation => normalizeLabel(observation.label) === key)?.label ?? key,
      count: caseIdSet.size,
      caseIds: Array.from(caseIdSet),
    }));

  return {
    analysisMode,
    sampleNotice,
    coreProcess: coreVariant?.steps ?? [],
    coreProcessCaseCoverage: coreVariant?.share ?? 0,
    coreProcessCaseCount: coreVariant?.caseCount ?? 0,
    totalCases,
    totalObservations: params.observations.length,
    totalStepObservations: stepObservations.length,
    variants,
    loops,
    computedAt: new Date().toISOString(),
  };
}

export function formatShare(share: number): string {
  return `${share} %`;
}
