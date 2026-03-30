import type { ProcessVersion } from '../../domain/process';
import type { ProcessMiningAssistedV2State, ProcessMiningAssistedV2Step } from './types';

export function createEmptyV2State(): ProcessMiningAssistedV2State {
  return {
    schemaVersion: 'process-mining-assisted-v2',
    currentStep: 'observations',
    cases: [],
    observations: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadV2State(version: ProcessVersion): ProcessMiningAssistedV2State {
  const existing = version.sidecar.processMiningAssistedV2;
  if (existing?.schemaVersion === 'process-mining-assisted-v2') {
    return existing;
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
