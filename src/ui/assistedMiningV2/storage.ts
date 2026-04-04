import type { ProcessVersion } from '../../domain/process';
import type { ProcessMiningAssistedV2State, ProcessMiningAssistedV2Step } from './types';

export function createEmptyV2State(): ProcessMiningAssistedV2State {
  return {
    schemaVersion: 'process-mining-assisted-v2',
    currentStep: 'observations',
    operatingMode: 'standard',
    cases: [],
    observations: [],
    reviewState: {
      normalizationRules: [],
      repairJournal: [],
    },
    reportHistory: [],
    benchmarkSnapshots: [],
    governance: {
      decisions: [],
      teamPlan: {},
      history: [],
    },
    pilotToolkit: {},
    connectorToolkit: { history: [] },
    updatedAt: new Date().toISOString(),
  };
}

export function loadV2State(version: ProcessVersion): ProcessMiningAssistedV2State {
  const existing = version.sidecar.processMiningAssistedV2;
  if (existing?.schemaVersion === 'process-mining-assisted-v2') {
    return {
      ...createEmptyV2State(),
      ...existing,
      operatingMode: existing.operatingMode ?? 'standard',
      reviewState: {
        normalizationRules: existing.reviewState?.normalizationRules ?? [],
        repairJournal: existing.reviewState?.repairJournal ?? [],
      },
      reportHistory: existing.reportHistory ?? [],
      benchmarkSnapshots: existing.benchmarkSnapshots ?? [],
      governance: {
        decisions: existing.governance?.decisions ?? [],
        teamPlan: existing.governance?.teamPlan ?? {},
        approval: existing.governance?.approval,
        history: existing.governance?.history ?? [],
      },
      pilotToolkit: existing.pilotToolkit ?? {},
      connectorToolkit: {
        history: existing.connectorToolkit?.history ?? [],
        preferredBundleKey: existing.connectorToolkit?.preferredBundleKey,
        operator: existing.connectorToolkit?.operator,
        endpointNote: existing.connectorToolkit?.endpointNote,
        lastExportedAt: existing.connectorToolkit?.lastExportedAt,
      },
    };
  }
  return createEmptyV2State();
}

export function patchV2State(
  state: ProcessMiningAssistedV2State,
  patch: Partial<ProcessMiningAssistedV2State>,
): ProcessMiningAssistedV2State {
  return { ...state, ...patch, updatedAt: new Date().toISOString() };
}

export function setV2Step(
  state: ProcessMiningAssistedV2State,
  step: ProcessMiningAssistedV2Step,
): ProcessMiningAssistedV2State {
  return patchV2State(state, { currentStep: step });
}

export function buildSidecarPatch(state: ProcessMiningAssistedV2State) {
  return { processMiningAssistedV2: state };
}
