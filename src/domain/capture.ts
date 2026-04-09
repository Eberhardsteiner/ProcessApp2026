export type CapturePhase =
  | 'scope'
  | 'happy_path'
  | 'roles'
  | 'decisions'
  | 'exceptions'
  | 'data_it'
  | 'kpis'
  | 'automation'
  | 'review';

export type CapturePhaseState = 'not_started' | 'in_progress' | 'done';

export interface CaptureProgress {
  phaseStates: Record<CapturePhase, CapturePhaseState>;
  lastTouchedAt?: string;
}

export function createInitialCaptureProgress(): CaptureProgress {
  return {
    phaseStates: {
      scope: 'not_started',
      happy_path: 'not_started',
      roles: 'not_started',
      decisions: 'not_started',
      exceptions: 'not_started',
      data_it: 'not_started',
      kpis: 'not_started',
      automation: 'not_started',
      review: 'not_started',
    },
  };
}

export type CaptureDraftVersion = 'capture-draft-v1';

export type WorkType = 'manual' | 'user_task' | 'service_task' | 'ai_assisted' | 'unknown';

export type GatewayType = 'xor' | 'and' | 'or';

export type ExceptionType =
  | 'missing_data'
  | 'timeout'
  | 'error'
  | 'cancellation'
  | 'compliance'
  | 'other';

export type CaptureElementStatus = 'unclear' | 'confirmed' | 'derived';

export type EvidenceType = 'text' | 'audio';

export interface EvidenceRef {
  type: EvidenceType;
  refId?: string;
  snippet?: string;
  startMs?: number;
  endMs?: number;
  speaker?: string;
}

export type StepLeadTimeBucket =
  | 'unknown'
  | 'minutes'
  | 'hours'
  | '1_day'
  | '2_5_days'
  | '1_2_weeks'
  | 'over_2_weeks'
  | 'varies';

export type StepLevelBucket =
  | 'unknown'
  | 'low'
  | 'medium'
  | 'high'
  | 'varies';

export interface CaptureDraftStep {
  stepId: string;
  order: number;
  label: string;
  roleId?: string | null;
  systemId?: string | null;
  workType?: WorkType;
  dataIn?: string[];
  dataOut?: string[];
  painPointHint?: string;
  toBeHint?: string;
  evidence?: EvidenceRef[];
  processingTime?: StepLeadTimeBucket;
  waitingTime?: StepLeadTimeBucket;
  volume?: StepLevelBucket;
  rework?: StepLevelBucket;
  status?: CaptureElementStatus;
}

export interface CaptureDraftDecisionBranch {
  branchId: string;
  conditionLabel: string;
  nextStepId?: string;
  endsProcess?: boolean;
  notes?: string;
}

export interface CaptureDraftDecision {
  decisionId: string;
  afterStepId: string;
  gatewayType: GatewayType;
  question: string;
  branches: CaptureDraftDecisionBranch[];
  evidence?: EvidenceRef[];
  status?: CaptureElementStatus;
}

export interface CaptureDraftException {
  exceptionId: string;
  relatedStepId?: string;
  type: ExceptionType;
  description: string;
  handling: string;
  evidence?: EvidenceRef[];
  status?: CaptureElementStatus;
  timeoutDurationIso?: string;
  timeoutInterrupting?: boolean;
}

export interface CaptureDraft {
  draftVersion: CaptureDraftVersion;
  happyPath: CaptureDraftStep[];
  decisions: CaptureDraftDecision[];
  exceptions: CaptureDraftException[];
  notes?: string[];
}

export function createInitialCaptureDraft(): CaptureDraft {
  return {
    draftVersion: 'capture-draft-v1',
    happyPath: [],
    decisions: [],
    exceptions: [],
  };
}
