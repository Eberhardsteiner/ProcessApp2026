import type { ProcessVersion } from '../../domain/process';
import type { ProcessMiningAssistedV2State, ProcessMiningAssistedV2Step } from './types';
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
    benchmarkSnapshots: [],
    governance: {
      decisions: [],
      teamPlan: {},
      history: [],
    },
    collaboration: {
      comments: [],
      auditTrail: [],
    },
    pilotToolkit: {},
    connectorToolkit: { history: [], contractHistory: [], receipts: [] },
    security: {},
    acceptance: {
      checklist: {},
      history: [],
    },
    updatedAt: new Date().toISOString(),
  };
}

export function loadV2State(version: ProcessVersion): LoadedV2StateResult {
  const existing = version.sidecar.processMiningAssistedV2;
  if (existing?.schemaVersion === 'process-mining-assisted-v2') {
    const candidate: ProcessMiningAssistedV2State = {
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
      collaboration: {
        lastActor: existing.collaboration?.lastActor,
        comments: existing.collaboration?.comments ?? [],
        auditTrail: existing.collaboration?.auditTrail ?? [],
      },
      pilotToolkit: existing.pilotToolkit ?? {},
      connectorToolkit: {
        history: existing.connectorToolkit?.history ?? [],
        contractHistory: existing.connectorToolkit?.contractHistory ?? [],
        receipts: existing.connectorToolkit?.receipts ?? [],
        preferredBundleKey: existing.connectorToolkit?.preferredBundleKey,
        operator: existing.connectorToolkit?.operator,
        endpointNote: existing.connectorToolkit?.endpointNote,
        lastExportedAt: existing.connectorToolkit?.lastExportedAt,
        lastReceiptAt: existing.connectorToolkit?.lastReceiptAt,
      },
      security: existing.security ?? {},
      acceptance: {
        checklist: existing.acceptance?.checklist ?? {},
        history: existing.acceptance?.history ?? [],
        decision: existing.acceptance?.decision,
        decidedBy: existing.acceptance?.decidedBy,
        decidedAt: existing.acceptance?.decidedAt,
        scope: existing.acceptance?.scope,
        targetWindow: existing.acceptance?.targetWindow,
        successCriteria: existing.acceptance?.successCriteria,
        knownRisks: existing.acceptance?.knownRisks,
        trainingNote: existing.acceptance?.trainingNote,
        note: existing.acceptance?.note,
        lastExportedAt: existing.acceptance?.lastExportedAt,
      },
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
  return { processMiningAssistedV2: state };
}
