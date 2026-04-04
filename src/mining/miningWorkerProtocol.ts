import type { EventLogEvent, ProcessMiningActivityMapping } from '../domain/process';
import type { CaptureDraftStep } from '../domain/capture';

export type MiningWorkerRequestKind = 'variants' | 'dfg' | 'caseDurationStats' | 'alignmentConformance';

export interface VariantsRequest {
  kind: 'variants';
  cacheKey: string;
  events: EventLogEvent[];
}

export interface VariantsResult {
  variant: string;
  count: number;
  share: number;
}

export interface DfgRequest {
  kind: 'dfg';
  cacheKey: string;
  events: EventLogEvent[];
  mode: 'activity' | 'step';
  activityMappings?: ProcessMiningActivityMapping[];
  draftSteps?: CaptureDraftStep[];
  timeMode?: string;
}

export interface CaseDurationStatsRequest {
  kind: 'caseDurationStats';
  cacheKey: string;
  events: EventLogEvent[];
  maxCases?: number;
  timeMode?: string;
}

export interface DurationBucket {
  label: string;
  count: number;
  pct: number;
}

export interface WorstCase {
  caseId: string;
  durationMs: number;
  startTs: string;
  endTs: string;
}

export interface CaseDurationStatsResult {
  totalCases: number;
  analyzedCases: number;
  medianMs: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  buckets: DurationBucket[];
  worstCases: WorstCase[];
  warnings: string[];
  durationsMs: number[];
  p25Ms: number | null;
  p75Ms: number | null;
  iqrMs: number | null;
  outlierUpperFenceMs: number | null;
  outlierCount: number;
  outlierPct: number;
}

export interface AlignmentConformanceRequest {
  kind: 'alignmentConformance';
  cacheKey: string;
  events: EventLogEvent[];
  activityMappings: ProcessMiningActivityMapping[];
  draftSteps: CaptureDraftStep[];
  maxCases?: number;
  maxMatrixSize?: number;
}

export interface AlignmentStepDeviation {
  stepId: string;
  order: number;
  label: string;
  count: number;
  pct: number;
  exampleCaseId?: string;
}

export interface AlignmentWorstCase {
  caseId: string;
  distance: number;
  insertions: number;
  deletions: number;
  mappedSteps: number;
}

export interface AlignmentBucket {
  bucket: string;
  count: number;
  pct: number;
  exampleCaseId?: string;
}

export interface AlignmentConformanceResult {
  totalCases: number;
  expectedSteps: number;
  analyzedCases: number;
  casesWithNoMappedSteps: number;
  meanDistance: number;
  medianDistance: number;
  p90Distance: number;
  distanceBuckets: AlignmentBucket[];
  worstCases: AlignmentWorstCase[];
  warnings: string[];
  casesWithInsertions: { count: number; pct: number };
  casesWithDeletions: { count: number; pct: number };
  topInsertedSteps: AlignmentStepDeviation[];
  topDeletedSteps: AlignmentStepDeviation[];
  fitnessMean: number;
  fitnessMedian: number;
  precisionMean: number;
  precisionMedian: number;
  casesWithOrderViolations: { count: number; pct: number };
  casesWithRework: { count: number; pct: number };
  topPatterns: Array<{
    signature: string;
    count: number;
    pct: number;
    exampleCaseId?: string;
    missingSteps: AlignmentStepDeviation[];
    insertedSteps: AlignmentStepDeviation[];
  }>;
  sampleDeviatingCaseIds: string[];
}

export type MiningWorkerRequest =
  | VariantsRequest
  | DfgRequest
  | CaseDurationStatsRequest
  | AlignmentConformanceRequest;

export type MiningWorkerRequestWithId =
  | (VariantsRequest & { id: string })
  | (DfgRequest & { id: string })
  | (CaseDurationStatsRequest & { id: string })
  | (AlignmentConformanceRequest & { id: string });

export interface MiningWorkerSuccessResponse<T = unknown> {
  id: string;
  ok: true;
  cacheKey: string;
  result: T;
}

export interface MiningWorkerErrorResponse {
  id: string;
  ok: false;
  cacheKey: string;
  error: string;
}

export type MiningWorkerResponse = MiningWorkerSuccessResponse | MiningWorkerErrorResponse;
