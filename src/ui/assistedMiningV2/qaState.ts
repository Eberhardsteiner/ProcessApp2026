import type {
  ProcessMiningAssistedV2QaState,
  ProcessMiningAssistedV2State,
  ProcessVersion,
} from '../../domain/process';

export const QA_STATE_KEYS = [
  'benchmarkSnapshots',
  'governance',
  'collaboration',
  'pilotToolkit',
  'connectorToolkit',
  'security',
  'acceptance',
] as const;

type QaStateKey = (typeof QA_STATE_KEYS)[number];

type QaPatch = Partial<Pick<ProcessMiningAssistedV2State, QaStateKey>>;

function safeIso(value: string | undefined): string {
  if (value) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date().toISOString();
}

export function createEmptyV2QaState(): ProcessMiningAssistedV2QaState {
  return {
    schemaVersion: 'process-mining-assisted-v2-qa',
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
    connectorToolkit: {
      history: [],
      contractHistory: [],
      receipts: [],
    },
    security: {},
    acceptance: {
      checklist: {},
      history: [],
    },
    updatedAt: new Date().toISOString(),
  };
}

export function extractLegacyQaState(state: ProcessMiningAssistedV2State | undefined): ProcessMiningAssistedV2QaState {
  const empty = createEmptyV2QaState();
  if (!state) return empty;

  return {
    ...empty,
    benchmarkSnapshots: state.benchmarkSnapshots ?? empty.benchmarkSnapshots,
    governance: state.governance ?? empty.governance,
    collaboration: state.collaboration ?? empty.collaboration,
    pilotToolkit: state.pilotToolkit ?? empty.pilotToolkit,
    connectorToolkit: state.connectorToolkit ?? empty.connectorToolkit,
    security: state.security ?? empty.security,
    acceptance: state.acceptance ?? empty.acceptance,
    updatedAt: safeIso(state.updatedAt),
  };
}

export function loadV2QaState(version: ProcessVersion): ProcessMiningAssistedV2QaState {
  const empty = createEmptyV2QaState();
  const stored = version.sidecar.processMiningAssistedV2Qa;
  if (stored?.schemaVersion === 'process-mining-assisted-v2-qa') {
    return {
      ...empty,
      ...stored,
      benchmarkSnapshots: stored.benchmarkSnapshots ?? empty.benchmarkSnapshots,
      governance: stored.governance ?? empty.governance,
      collaboration: stored.collaboration ?? empty.collaboration,
      pilotToolkit: stored.pilotToolkit ?? empty.pilotToolkit,
      connectorToolkit: stored.connectorToolkit ?? empty.connectorToolkit,
      security: stored.security ?? empty.security,
      acceptance: stored.acceptance ?? empty.acceptance,
      updatedAt: safeIso(stored.updatedAt),
    };
  }

  return extractLegacyQaState(version.sidecar.processMiningAssistedV2);
}

export function patchV2QaState(
  state: ProcessMiningAssistedV2QaState,
  patch: Partial<ProcessMiningAssistedV2QaState>,
): ProcessMiningAssistedV2QaState {
  return {
    ...state,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

export function buildQaSidecarPatch(state: ProcessMiningAssistedV2QaState) {
  return {
    processMiningAssistedV2Qa: state,
  };
}

export function splitV2StatePatch(patch: Partial<ProcessMiningAssistedV2State>): {
  corePatch: Partial<ProcessMiningAssistedV2State>;
  qaPatch: QaPatch;
} {
  const corePatch = { ...patch } as Partial<ProcessMiningAssistedV2State>;
  const qaPatch: QaPatch = {};

  for (const key of QA_STATE_KEYS) {
    if (key in corePatch) {
      switch (key) {
        case 'benchmarkSnapshots':
          qaPatch.benchmarkSnapshots = corePatch.benchmarkSnapshots;
          break;
        case 'governance':
          qaPatch.governance = corePatch.governance;
          break;
        case 'collaboration':
          qaPatch.collaboration = corePatch.collaboration;
          break;
        case 'pilotToolkit':
          qaPatch.pilotToolkit = corePatch.pilotToolkit;
          break;
        case 'connectorToolkit':
          qaPatch.connectorToolkit = corePatch.connectorToolkit;
          break;
        case 'security':
          qaPatch.security = corePatch.security;
          break;
        case 'acceptance':
          qaPatch.acceptance = corePatch.acceptance;
          break;
      }
      delete corePatch[key];
    }
  }

  return { corePatch, qaPatch };
}

export function stripQaFields(state: ProcessMiningAssistedV2State): ProcessMiningAssistedV2State {
  const coreState = { ...state };
  for (const key of QA_STATE_KEYS) {
    delete coreState[key];
  }
  return coreState;
}

export function mergeCoreAndQaState(
  coreState: ProcessMiningAssistedV2State,
  qaState: ProcessMiningAssistedV2QaState | null,
): ProcessMiningAssistedV2State {
  if (!qaState) return coreState;
  return {
    ...coreState,
    benchmarkSnapshots: qaState.benchmarkSnapshots,
    governance: qaState.governance,
    collaboration: qaState.collaboration,
    pilotToolkit: qaState.pilotToolkit,
    connectorToolkit: qaState.connectorToolkit,
    security: qaState.security,
    acceptance: qaState.acceptance,
  };
}

export function splitCompositeState(state: ProcessMiningAssistedV2State): {
  coreState: ProcessMiningAssistedV2State;
  qaState: ProcessMiningAssistedV2QaState;
} {
  return {
    coreState: stripQaFields(state),
    qaState: extractLegacyQaState(state),
  };
}
