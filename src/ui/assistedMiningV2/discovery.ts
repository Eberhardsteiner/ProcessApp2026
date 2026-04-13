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
  normalizeWhitespace,
} from './pmShared';
import { canonicalizeProcessStepLabel, stepSemanticKey } from './semanticStepFamilies';

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

interface DiscoverySequenceEntry {
  label: string;
  key: string;
}

function getStepObservations(observations: ProcessMiningObservation[]): ProcessMiningObservation[] {
  return observations.filter(observation => observation.kind === 'step');
}

function getDiscoveryLabel(observation: ProcessMiningObservation, index: number): string {
  const preservedLabel = normalizeWhitespace(observation.originalStepLabel ?? observation.label);
  if (observation.stepWasPreserved && preservedLabel) {
    return preservedLabel;
  }
  return canonicalizeProcessStepLabel({
    title: observation.label,
    body: observation.evidenceSnippet,
    fallback: observation.label,
    index,
  });
}

function getDiscoveryKey(observation: ProcessMiningObservation, label: string): string {
  if (observation.stepWasPreserved) {
    return `structured:${normalizeLabel(observation.originalStepLabel ?? label)}`;
  }
  return stepSemanticKey(label);
}

function getSequenceForCase(caseId: string, observations: ProcessMiningObservation[]): DiscoverySequenceEntry[] {
  const labels = observations
    .filter(observation => observation.sourceCaseId === caseId)
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
    .map((observation, index) => {
      const label = getDiscoveryLabel(observation, index);
      return {
        label,
        key: getDiscoveryKey(observation, label),
      };
    })
    .filter(entry => Boolean(entry.label));

  const deduped: DiscoverySequenceEntry[] = [];
  let lastKey: string | null = null;
  for (const entry of labels) {
    if (entry.key === lastKey) continue;
    deduped.push(entry);
    lastKey = entry.key;
  }
  return deduped;
}

function detectLoops(sequence: DiscoverySequenceEntry[]): DiscoverySequenceEntry[] {
  const seen = new Set<string>();
  const repeated = new Map<string, DiscoverySequenceEntry>();
  for (const step of sequence) {
    if (seen.has(step.key) && !repeated.has(step.key)) {
      repeated.set(step.key, step);
    }
    seen.add(step.key);
  }
  return Array.from(repeated.values());
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

  const caseSequences = new Map<string, DiscoverySequenceEntry[]>();
  for (const caseId of caseIds) {
    caseSequences.set(caseId, getSequenceForCase(caseId, stepObservations));
  }

  const variantMap = new Map<string, { steps: string[]; caseIds: string[] }>();
  for (const [caseId, steps] of caseSequences) {
    const normalizedKey = steps.map(step => step.key).join(' → ');
    if (!variantMap.has(normalizedKey)) {
      variantMap.set(normalizedKey, { steps: steps.map(step => step.label), caseIds: [] });
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
  const loopLabels = new Map<string, string>();
  for (const [caseId, steps] of caseSequences) {
    for (const repeatedStep of detectLoops(steps)) {
      if (!loopMap.has(repeatedStep.key)) loopMap.set(repeatedStep.key, new Set());
      loopMap.get(repeatedStep.key)!.add(caseId);
      if (!loopLabels.has(repeatedStep.key)) loopLabels.set(repeatedStep.key, repeatedStep.label);
    }
  }

  const loops = Array.from(loopMap.entries())
    .sort((a, b) => b[1].size - a[1].size)
    .map(([key, caseIdSet]) => ({
      label: loopLabels.get(key) ?? stepObservations.find(observation => getDiscoveryKey(observation, getDiscoveryLabel(observation, observation.sequenceIndex)) === key)?.originalStepLabel ?? key.replace(/^family:/, ''),
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
