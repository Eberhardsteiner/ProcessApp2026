import type { ProcessVersion } from '../../domain/process';
import type { ProcessMiningAssistedV2State, ProcessMiningAssistedV2Step } from './types';
import { stripQaFields } from './qaState';
import { hardenWorkspaceState, type WorkspaceIntegrityReport } from './workspaceIntegrity';

export interface LoadedV2StateResult {
  state: ProcessMiningAssistedV2State;
  integrity: WorkspaceIntegrityReport;
}

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
    updatedAt: new Date().toISOString(),
  };
}

export function loadV2State(version: ProcessVersion): LoadedV2StateResult {
  const existing = version.sidecar.processMiningAssistedV2;
  if (existing?.schemaVersion === 'process-mining-assisted-v2') {
    const coreExisting = stripQaFields(existing);

    const candidate: ProcessMiningAssistedV2State = {
      ...createEmptyV2State(),
      ...coreExisting,
      operatingMode: coreExisting.operatingMode ?? 'standard',
      reviewState: {
        normalizationRules: coreExisting.reviewState?.normalizationRules ?? [],
        repairJournal: coreExisting.reviewState?.repairJournal ?? [],
      },
      reportHistory: coreExisting.reportHistory ?? [],
    };
    const hardened = hardenWorkspaceState(candidate);
    return {
      state: hardened.state,
      integrity: hardened.report,
    };
  }

  const empty = createEmptyV2State();
  return {
    state: empty,
    integrity: {
      severity: 'healthy',
      headline: 'Neuer Arbeitsstand',
      summary: 'Es gibt noch keinen gespeicherten PM-Arbeitsstand für diese Version.',
      issues: [],
      repairedCount: 0,
      criticalCount: 0,
    },
  };
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
  return { processMiningAssistedV2: stripQaFields(state) };
}
