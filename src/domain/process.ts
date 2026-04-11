export type ProcessCategory = 'steuerung' | 'kern' | 'unterstuetzung';

export type ProcessManagementLevel = 'strategisch' | 'fachlich' | 'technisch';

export type ProcessHierarchyLevel = 'landkarte' | 'hauptprozess' | 'unterprozess';

export type ProcessStatus = 'draft' | 'in_review' | 'published';

export interface Project {
  projectId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessRaci {
  responsible?: string[];
  accountable?: string[];
  consulted?: string[];
  informed?: string[];
}

export interface VersionApprovalInfo {
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
}

export interface Process {
  processId: string;
  projectId: string;

  title: string;
  category: ProcessCategory;
  managementLevel: ProcessManagementLevel;
  hierarchyLevel: ProcessHierarchyLevel;

  parentProcessId: string | null;

  createdAt: string;
  updatedAt: string;

  description?: string;
  editors?: string[];
  tags?: string[];
  raci?: ProcessRaci;
}

export interface EndToEndDefinition {
  trigger: string;
  customer: string;
  outcome: string;
  doneCriteria?: string;
}

export interface ProcessRole {
  id: string;
  name: string;
  kind: 'person' | 'role' | 'org_unit' | 'system';
  aliases?: string[];
}

export interface ProcessSystem {
  id: string;
  name: string;
  systemType?: string;
  aliases?: string[];
}

export interface ProcessDataObject {
  id: string;
  name: string;
  kind: 'document' | 'dataset' | 'form' | 'other';
  aliases?: string[];
}

export interface ProcessKPI {
  id: string;
  name: string;
  definition: string;
  unit?: string;
  target?: string;
  aliases?: string[];
}

export interface AIReadinessSignals {
  standardization: 'low' | 'medium' | 'high';
  dataAvailability: 'low' | 'medium' | 'high';
  variability: 'low' | 'medium' | 'high';
  complianceRisk: 'low' | 'medium' | 'high';
}

export type FrequencyBucket =
  | 'unknown'
  | 'ad_hoc'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

export type LeadTimeBucket =
  | 'unknown'
  | 'minutes'
  | 'hours'
  | '1_day'
  | '2_5_days'
  | '1_2_weeks'
  | 'over_2_weeks'
  | 'varies';

export interface OperationalContext {
  frequency?: FrequencyBucket;
  typicalLeadTime?: LeadTimeBucket;
}

export type ImprovementCategory =
  | 'standardize'
  | 'digitize'
  | 'automate'
  | 'ai'
  | 'data'
  | 'governance'
  | 'customer'
  | 'compliance'
  | 'kpi';

export type ImprovementStatus = 'idea' | 'planned' | 'in_progress' | 'done' | 'discarded';

export type Level3 = 'low' | 'medium' | 'high';

export type ImprovementScope = 'process' | 'step';

export type AutomationApproach =
  | 'workflow'
  | 'rpa'
  | 'api_integration'
  | 'erp_config'
  | 'low_code'
  | 'ai_assistant'
  | 'ai_document_processing'
  | 'ai_classification'
  | 'process_mining'
  | 'other';

export type AutomationLevel = 'assist' | 'partial' | 'straight_through';

export type ControlType =
  | 'audit_trail'
  | 'approval'
  | 'monitoring'
  | 'data_privacy'
  | 'fallback_manual';

export interface AutomationBlueprint {
  approach: AutomationApproach;
  level: AutomationLevel;
  humanInTheLoop: boolean;

  systemIds?: string[];
  dataObjectIds?: string[];
  kpiIds?: string[];

  controls?: ControlType[];
  notes?: string;
}

export interface ImpactEstimate {
  affectedCaseSharePct?: number;
  leadTimeSavingMinPerCase?: number;
  notes?: string;
}

export interface ImprovementBacklogItem {
  id: string;

  title: string;
  category: ImprovementCategory;
  scope: ImprovementScope;
  relatedStepId?: string;

  description?: string;

  impact: Level3;
  effort: Level3;
  risk: Level3;

  owner?: string;
  dueDate?: string;

  status: ImprovementStatus;
  createdAt: string;
  updatedAt: string;

  automationBlueprint?: AutomationBlueprint;
  impactEstimate?: ImpactEstimate;
}

export interface EvidenceSource {
  refId: string;
  kind: 'ai_input' | 'file' | 'workshop' | 'other';
  language?: 'de' | 'en' | 'auto';
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiImportNote {
  id: string;
  severity: 'info' | 'warn';
  message: string;
  sourceRefId?: string;
  createdAt: string;
}

export interface EventLogEvent {
  caseId: string;
  activity: string;
  timestamp: string;
  resource?: string;
  attributes?: Record<string, string>;
}

export interface ProcessMiningActivityMapping {
  activityKey: string;
  example: string;
  count: number;
  stepId?: string;
}

export type MiningRenameRule = {
  mode: 'contains' | 'equals';
  from: string;
  to: string;
};

export type MiningLifecycleMode = 'off' | 'keep_complete' | 'keep_start' | 'strip_suffix';

export interface MiningNoiseFilter {
  enabled?: boolean;
  minEventCount?: number;
  minCaseCoveragePct?: number;
}

export interface MiningMergeRule {
  target: string;
  mode: 'equals' | 'contains';
  sources: string[];
}

export interface MiningSplitRule {
  mode: 'equals' | 'contains';
  match: string;
  attributeKey: string;
  separator?: string;
  prefix?: string;
}

export interface MiningAttributeNormalization {
  enabled?: boolean;
  trimKeys?: boolean;
  lowerCaseKeys?: boolean;
  replaceSpacesInKeys?: boolean;
  trimValues?: boolean;
  dropEmptyAttributes?: boolean;
  inferTypes?: boolean;
  normalizeNumbers?: boolean;
  normalizeDates?: boolean;
  dateFormat?: 'date' | 'datetime';
  enumCase?: 'preserve' | 'lower' | 'upper';
  enumMaxUnique?: number;
}

export interface MiningPreprocessingRecipe {
  dedupeExact?: boolean;
  dedupeConsecutive?: boolean;
  timeStart?: string;
  timeEnd?: string;
  renameRules?: MiningRenameRule[];
  noiseFilter?: MiningNoiseFilter;
  mergeRules?: MiningMergeRule[];
  splitRules?: MiningSplitRule[];
  lifecycleMode?: MiningLifecycleMode;
  attributeNormalization?: MiningAttributeNormalization;
}

export interface MiningDatasetProvenance {
  kind: 'import' | 'transform';
  method?: 'csv' | 'xes' | 'tool_history' | 'ai_eventlog' | 'preprocessing' | 'duplicate' | 'timeslice' | 'segment';
  createdAt?: string;
  createdFromDatasetId?: string;
  createdFromLabel?: string;
  recipe?: MiningPreprocessingRecipe;
  recipeId?: string;
  recipeName?: string;
  window?: { startIso: string; endIso: string; basis: 'case_start' | 'event_time'; grain?: 'month' | 'quarter' };
}

export interface SavedPreprocessingRecipe {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  recipe: MiningPreprocessingRecipe;
}

export type AssistedMiningObjective =
  | 'overview'
  | 'bottlenecks'
  | 'deviations'
  | 'compliance'
  | 'trend'
  | 'other';

export type AssistedMiningComplexity = 'simple' | 'balanced' | 'detailed';

export type AssistedMiningStep =
  | 'goal'
  | 'data'
  | 'prepare'
  | 'map'
  | 'discover'
  | 'deviations'
  | 'performance'
  | 'report';

export type ProcessMiningAssistedStep =
  | 'goal'
  | 'data'
  | 'prepare'
  | 'map'
  | 'discover'
  | 'deviations'
  | 'performance'
  | 'deepdive'
  | 'report'
  | 'handover';

export interface ProcessMiningDatasetStats {
  totalEvents: number;
  totalCases: number;
  distinctActivities: number;
  missingTimestampEvents: number;
  casesWithOutOfOrderTimestamps: number;
  distinctAttributeKeys: number;
  distinctResources: number;
  minTimestamp?: string;
  maxTimestamp?: string;
}

export interface AssistedMiningSettings {
  step?: AssistedMiningStep;
  objective?: AssistedMiningObjective;
  objectiveText?: string;
  complexity?: AssistedMiningComplexity;
  notes?: string;
}

export type MiningWorkspaceView =
  | 'data'
  | 'preprocessing'
  | 'mapping'
  | 'discovery'
  | 'conformance'
  | 'performance'
  | 'cases'
  | 'export'
  | 'organisation'
  | 'rootcause'
  | 'drift'
  | 'guided';

export interface ProcessMiningDatasetSettings {
  workspaceView?: MiningWorkspaceView;

  segment?: {
    enabled?: boolean;
    attributeKey?: string;
    valueA?: string;
    compareEnabled?: boolean;
    valueB?: string;
  };

  discovery?: {
    dfgMode?: 'activity' | 'step';
    minEdgeCount?: number;
    maxNodes?: number;
    heatMetric?: 'median' | 'p95';

    deriveMode?: 'top_variant' | 'dfg_xor' | 'dfg_xor_and';
    minEdgeShare?: number;
    maxExtraBranches?: number;
    includeLoops?: boolean;
    restrictToTopPath?: boolean;
    maxSteps?: number;
    minNodeCoverage?: number;
  };

  conformance?: {
    advancedEnabled?: boolean;
    bpmnEnabled?: boolean;
    draftEnabled?: boolean;
    maxCases?: number;
    maxMatrixSize?: number;
  };

  performance?: {
    transitionPerfMode?: 'step' | 'activity';
    slaThresholdMs?: number;
    slaPreset?: '8h' | '2d' | '7d' | 'custom';
    maxCases?: number;
  };

  rootCause?: {
    thresholdMode?: 'p90' | 'p95' | 'custom';
    customThresholdMs?: number;
    minSupportCases?: number;
    maxCases?: number;
    maxSignals?: number;
    maxValuesPerKey?: number;
  };

  assistant?: AssistedMiningSettings;
}

export interface ProcessMiningDatasetEventsRef {
  store: 'indexeddb';
  key: string;
  eventCount: number;
  createdAt: string;
}

export interface RawProcessMiningDataset {
  id: string;
  sourceLabel: string;
  importedAt: string;
  events: EventLogEvent[];
  activityMappings: ProcessMiningActivityMapping[];
  warnings?: string[];
  truncated?: boolean;
  maxEvents?: number;
  timeMode: 'real' | 'synthetic';
  sourceRefId?: string;
  provenance?: MiningDatasetProvenance;
  settings?: ProcessMiningDatasetSettings;
  eventsRef?: ProcessMiningDatasetEventsRef;
}

export interface ProcessMiningDataset {
  id: string;
  sourceLabel: string;
  importedAt: string;
  events: EventLogEvent[];
  activityMappings: ProcessMiningActivityMapping[];
  warnings?: string[];
  truncated?: boolean;
  maxEvents?: number;
  timeMode: 'real';
  sourceRefId?: string;
  provenance?: MiningDatasetProvenance;
  settings?: ProcessMiningDatasetSettings;
  eventsRef?: ProcessMiningDatasetEventsRef;
}

export type MiningSlaRuleKind = 'case_duration' | 'time_to_step' | 'wait_between_steps';

export interface MiningSlaRule {
  id: string;
  enabled: boolean;
  name: string;
  kind: MiningSlaRuleKind;
  thresholdMs: number;

  targetStepId?: string;
  countMissingAsBreach?: boolean;

  fromStepId?: string;
  toStepId?: string;
  countMissingAsBreachForWait?: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface RawProcessMiningState {
  schemaVersion: 'process-mining-v1';
  sourceLabel: string;
  importedAt: string;
  events: EventLogEvent[];
  activityMappings: ProcessMiningActivityMapping[];
  warnings?: string[];
  truncated?: boolean;
  maxEvents?: number;
  timeMode: 'real' | 'synthetic';
  sourceRefId?: string;
  datasets?: RawProcessMiningDataset[];
  activeDatasetId?: string;
  preprocessingRecipes?: SavedPreprocessingRecipe[];
  slaRules?: MiningSlaRule[];
}

export interface ProcessMiningState {
  schemaVersion: 'process-mining-v1';
  sourceLabel: string;
  importedAt: string;
  events: EventLogEvent[];
  activityMappings: ProcessMiningActivityMapping[];
  warnings?: string[];
  truncated?: boolean;
  maxEvents?: number;
  timeMode: 'real';
  sourceRefId?: string;
  datasets?: ProcessMiningDataset[];
  activeDatasetId?: string;
  preprocessingRecipes?: SavedPreprocessingRecipe[];
  slaRules?: MiningSlaRule[];
}

export type ProcessMiningAssistedV2Step =
  | 'observations'
  | 'discovery'
  | 'conformance'
  | 'enhancement'
  | 'augmentation';

export type ObservationTimestampQuality = 'real' | 'synthetic' | 'missing';

export type ProcessMiningAnalysisMode = 'process-draft' | 'exploratory-mining' | 'true-mining';
export type SourceRoutingClass =
  | 'structured-procedure'
  | 'semi-structured-procedure'
  | 'narrative-case'
  | 'mixed-document'
  | 'eventlog-table'
  | 'weak-raw-table';

export interface SourceRoutingContext {
  routingClass: SourceRoutingClass;
  routingConfidence: 'high' | 'medium' | 'low';
  routingSignals: string[];
  fallbackReason?: string;
}
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs

export type ExtractionCandidateType = 'step' | 'role' | 'system' | 'signal' | 'support';
export type ExtractionCandidateStatus = 'candidate' | 'merged' | 'support-only' | 'rejected';

export interface ExtractionCandidate {
  candidateId: string;
  candidateType: ExtractionCandidateType;
  rawLabel: string;
  normalizedLabel: string;
  evidenceAnchor: string;
  contextWindow: string;
  confidence: 'high' | 'medium' | 'low';
  originChannel:
    | 'heading'
    | 'paragraph'
    | 'sentence'
    | 'bullet-list'
    | 'table-row'
    | 'table-cell'
    | 'event-row'
    | 'metadata'
    | 'narrative-context'
    | 'imported-observation';
  sourceFragmentType: 'text-span' | 'sentence' | 'paragraph' | 'list-item' | 'table-cell' | 'table-row' | 'event-row' | 'heading';
  routingClass?: SourceRoutingClass;
  sourceRef?: string;
  status: ExtractionCandidateStatus;
  rejectionReason?: string;
  downgradeReason?: string;
}
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs

export interface ProcessMiningObservationCase {
  id: string;
  name: string;
  caseRef?: string;
  narrative: string;
  rawText?: string;
  inputKind?: 'narrative' | 'document' | 'table-row' | 'event-log';
  sourceType?: 'pdf' | 'docx' | 'narrative' | 'csv-row' | 'xlsx-row' | 'eventlog';
  dateHints?: string;
  sourceNote?: string;
  derivedStepLabels?: string[];
  analysisProfileLabel?: string;
  analysisProfileHint?: string;
  analysisStrategies?: string[];
  routingContext?: SourceRoutingContext;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessMiningObservation {
  id: string;
  sourceCaseId?: string;
  label: string;
  evidenceSnippet?: string;
  role?: string;
  system?: string;
  kind: 'step' | 'variant' | 'timing' | 'role' | 'issue' | 'other';
  sequenceIndex: number;
  timestampRaw?: string;
  timestampIso?: string;
  timestampQuality: ObservationTimestampQuality;
  createdAt: string;
}

export interface ProcessMiningDiscoverySummary {
  caseCount: number;
  variantCount: number;
  mainVariantShare?: number;
  topSteps: string[];
  analysisMode?: ProcessMiningAnalysisMode;
  sampleNotice?: string;
  notes?: string;
  updatedAt: string;
}

export interface ProcessMiningConformanceSummary {
  checkedSteps: number;
  deviationCount: number;
  deviationNotes: string[];
  analysisMode?: ProcessMiningAnalysisMode;
  sampleNotice?: string;
  notes?: string;
  updatedAt: string;
}

export interface ProcessMiningEnhancementSummary {
  issueCount: number;
  issues: Array<{ title: string; description: string; kind: 'timing' | 'rework' | 'handoff' | 'missing' | 'other' }>;
  analysisMode?: ProcessMiningAnalysisMode;
  sampleNotice?: string;
  notes?: string;
  updatedAt: string;
}

export interface ProcessMiningQualitySummary {
  totalCases: number;
  totalObservations: number;
  stepObservationCount: number;
  issueObservationCount: number;
  casesWithOrdering: number;
  observationsWithRealTime: number;
  observationsWithSyntheticTime: number;
  observationsWithNoTime: number;
  unclearLabelCount: number;
  stepObservationsWithEvidence: number;
  stepObservationsWithRole: number;
  stepObservationsWithSystem: number;
  notes?: string;
  updatedAt: string;
}


export interface DerivationSourceProfile {
  inputProfile: 'procedure-document' | 'narrative-timeline' | 'mixed-process-document' | 'signal-heavy-document' | 'table-like-material' | 'unclear';
  inputProfileLabel: string;
  documentClass?: 'structured-target-procedure' | 'semi-structured-procedure' | 'narrative-case' | 'mixed-document' | 'weak-material';
  documentClassLabel?: string;
  primaryDomainKey?: ProcessMiningDomainKey;
  primaryDomainLabel?: string;
  secondaryDomainKeys?: ProcessMiningDomainKey[];
  secondaryDomainLabels?: string[];
  domainGateNote?: string;
  domainScores?: Array<{ key: ProcessMiningDomainKey; label: string; score: number }>;
  domainGateSuppressedSignals?: string[];
  domainGateSuppressedRoles?: string[];
  domainGateSuppressedSystems?: string[];
  extractionFocus: string;
  sectionCounts: {
    timeline: number;
    procedural: number;
    communication: number;
    issue: number;
    decision: number;
    knowledge: number;
    measure: number;
    governance: number;
    commentary: number;
    tableLike: number;
    noise: number;
  };
  stability: 'high' | 'medium' | 'low';
  classificationReasons?: string[];
  selectedParagraphCount?: number;
  supportParagraphCount?: number;
  evidenceParagraphCount?: number;
  processBearingSharePct?: number;
  dominantKinds?: string[];
  extractionPlan?: string[];
}

export interface DerivationMultiCaseSummary {
  caseCount: number;
  stableSteps: string[];
  variableSteps: string[];
  patternNote: string;
  stabilityScore?: number;
  repeatableFamilyCount?: number;
  branchingFamilyCount?: number;
  dominantPattern?: string;
  recurringSignals?: string[];
  stabilityNote?: string;
}

export type ProcessDocumentType = 'procedure-document' | 'semi-structured-procedure-document' | 'case-narrative' | 'mixed-document' | 'weak-material' | 'unknown';

export interface DerivationSummary {
  sourceLabel: string;
  method: 'structured' | 'semi-structured' | 'narrative-fallback';
  documentKind: ProcessDocumentType;
  analysisMode: ProcessMiningAnalysisMode;
  caseCount: number;
  observationCount: number;
  warnings: string[];
  confidence: 'high' | 'medium' | 'low';
  stepLabels: string[];
  roles: string[];
  systems?: string[];
  issueSignals?: string[];
  issueEvidence?: Array<{ label: string; snippet: string }>;
  documentSummary?: string;
  sourceProfile?: DerivationSourceProfile;
  routingContext?: SourceRoutingContext;
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
  extractionCandidates?: ExtractionCandidate[];
  candidateStats?: {
    total: number;
    mergedCoreSteps: number;
    supportOnly: number;
    rejected: number;
  };
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
  tablePipeline?: {
    pipelineMode: 'eventlog-table' | 'weak-raw-table';
    tableProfile: {
      rowCount: number;
      columnCount: number;
      emptyValueShare: number;
      timestampParseShare: number;
      numericValueShare: number;
      shortValueShare: number;
      longValueShare: number;
      rowOrderCoherence: number;
      caseCoherence: number;
    };
    inferredSchema: Array<{
      columnIndex: number;
      header: string;
      inferredSemanticType:
        | 'case-id'
        | 'activity'
        | 'timestamp'
        | 'start-timestamp'
        | 'end-timestamp'
        | 'order-index'
        | 'resource'
        | 'role'
        | 'system'
        | 'status'
        | 'lifecycle'
        | 'comment'
        | 'note'
        | 'amount'
        | 'location'
        | 'free-text-support'
        | 'unknown';
      confidence: number;
      supportingSignals: string[];
      conflictingSignals: string[];
      accepted: boolean;
      fallbackUse?: string;
    }>;
    eventlogEligibility: {
      eligible: boolean;
      reasons: string[];
      fallbackReason?: string;
    };
    rowEvidenceStats: {
      rowsWithEvidence: number;
      eventsCreated: number;
      weakSignalsCreated: number;
    };
    traceStats?: {
      caseCount: number;
      averageEventsPerCase: number;
      orderedTraceShare: number;
    };
    weakTableSignals?: string[];
  };
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
  multiCaseSummary?: DerivationMultiCaseSummary;
  repairNotes?: string[];
  engineVersion?: string;
  provenance?: 'local' | 'ai';
  updatedAt: string;
}

export type ProcessMiningReportAudience = 'management' | 'process_owner' | 'operations' | 'workshop';

export interface ProcessMiningHandoverDraft {
  audience: ProcessMiningReportAudience;
  label: string;
  summary: string;
  text: string;
}

export interface ProcessMiningReportBasisSnapshot {
  caseCount: number;
  stepCount: number;
  evidenceStepCount: number;
  variantCount: number;
  deviationCount: number;
  hotspotCount: number;
  readinessHeadline: string;
  maturityLabel: string;
}

export type ProcessMiningGovernanceDecisionStatus = 'open' | 'in_review' | 'approved' | 'deferred';

export type ProcessMiningGovernanceReviewTemplateKey = 'team-review' | 'management-approval' | 'pilot-release';

export type ProcessMiningGovernanceWorkflowStage =
  | 'draft'
  | 'review-prep'
  | 'review-running'
  | 'approval-ready'
  | 'approved';

export interface ProcessMiningGovernanceDecision {
  id: string;
  title: string;
  detail?: string;
  status: ProcessMiningGovernanceDecisionStatus;
  sourceType?: 'analysis' | 'report' | 'handover' | 'manual';
  owner?: string;
  dueDate?: string;
  relatedStepLabel?: string;
  evidenceHint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessMiningGovernanceTeamPlan {
  coordinator?: string;
  reviewers?: string[];
  nextReviewAt?: string;
  shareTargets?: string;
  shareNote?: string;
  reviewStartedAt?: string;
  reviewTemplateKey?: ProcessMiningGovernanceReviewTemplateKey;
}

export interface ProcessMiningGovernanceApproval {
  status?: 'approval_ready' | 'approved';
  approvedBy?: string;
  approvedAt?: string;
  note?: string;
  basisFingerprint?: string;
}

export interface ProcessMiningGovernanceSnapshot {
  id: string;
  label: string;
  capturedAt: string;
  workflowStage: ProcessMiningGovernanceWorkflowStage;
  readyForShare: boolean;
  headline: string;
  summary: string;
  nextAction?: string;
  openDecisionCount: number;
  inReviewDecisionCount: number;
  approvedDecisionCount: number;
  deferredDecisionCount: number;
  reviewerCount: number;
  coordinator?: string;
  nextReviewAt?: string;
  shareTargets?: string;
  basisFingerprint?: string;
}

export interface ProcessMiningGovernanceState {
  decisions?: ProcessMiningGovernanceDecision[];
  teamPlan?: ProcessMiningGovernanceTeamPlan;
  approval?: ProcessMiningGovernanceApproval;
  history?: ProcessMiningGovernanceSnapshot[];
}

export type ProcessMiningCommentTargetType =
  | 'workspace'
  | 'report'
  | 'governance'
  | 'governance-decision'
  | 'step'
  | 'source'
  | 'connector';

export type ProcessMiningCommentStatus = 'open' | 'in_review' | 'resolved';

export interface ProcessMiningComment {
  id: string;
  targetType: ProcessMiningCommentTargetType;
  targetRef?: string;
  targetLabel: string;
  author?: string;
  text: string;
  nextAction?: string;
  status: ProcessMiningCommentStatus;
  createdAt: string;
  updatedAt: string;
}

export type ProcessMiningAuditAction =
  | 'comment-added'
  | 'comment-status-changed'
  | 'comment-reopened'
  | 'comment-resolved'
  | 'report-generated'
  | 'connector-contract-generated'
  | 'connector-receipt-imported'
  | 'security-profile-reviewed'
  | 'security-profile-exported'
  | 'governance-decision-added'
  | 'governance-decision-status'
  | 'governance-review-started'
  | 'governance-snapshot-saved'
  | 'governance-approved'
  | 'governance-approval-cleared'
  | 'acceptance-updated'
  | 'acceptance-snapshot-saved';

export interface ProcessMiningAuditEntry {
  id: string;
  action: ProcessMiningAuditAction;
  actor?: string;
  targetType: ProcessMiningCommentTargetType | 'governance-flow' | 'release';
  targetLabel: string;
  detail?: string;
  createdAt: string;
}

export interface ProcessMiningCollaborationState {
  lastActor?: string;
  comments?: ProcessMiningComment[];
  auditTrail?: ProcessMiningAuditEntry[];
}

export interface ProcessMiningPilotToolkitState {
  sessionTitle?: string;
  sessionGoal?: string;
  facilitator?: string;
  plannedAt?: string;
  audience?: string;
  note?: string;
  lastExportedAt?: string;
}

export type ProcessMiningConnectorBundleKey =
  | 'ticket-handover'
  | 'bi-feed'
  | 'ai-proxy'
  | 'governance-archive';

export type ProcessMiningConnectorBundleStatus = 'ready' | 'partial' | 'blocked';

export interface ProcessMiningConnectorExportSnapshot {
  id: string;
  key: ProcessMiningConnectorBundleKey;
  label: string;
  exportedAt: string;
  basisFingerprint?: string;
  status: ProcessMiningConnectorBundleStatus;
  summary: string;
  fileBase: string;
}

export interface ProcessMiningConnectorContractSnapshot {
  id: string;
  key: ProcessMiningConnectorBundleKey;
  label: string;
  builtAt: string;
  basisFingerprint?: string;
  completenessScore: number;
  missingRequiredFields: string[];
  fileBase: string;
}

export type ProcessMiningConnectorReceiptStatus = 'accepted' | 'queued' | 'rejected' | 'completed';

export interface ProcessMiningConnectorReceipt {
  id: string;
  key: ProcessMiningConnectorBundleKey;
  label: string;
  importedAt: string;
  status: ProcessMiningConnectorReceiptStatus;
  externalRef?: string;
  endpoint?: string;
  note?: string;
  basisFingerprint?: string;
  source: 'paste' | 'file';
}

export interface ProcessMiningConnectorToolkitState {
  preferredBundleKey?: ProcessMiningConnectorBundleKey;
  operator?: string;
  endpointNote?: string;
  lastExportedAt?: string;
  history?: ProcessMiningConnectorExportSnapshot[];
  contractHistory?: ProcessMiningConnectorContractSnapshot[];
  receipts?: ProcessMiningConnectorReceipt[];
  lastReceiptAt?: string;
}

export type ProcessMiningDataClassification = 'internal' | 'confidential' | 'restricted';
export type ProcessMiningDeploymentTarget = 'local-browser' | 'internal-static' | 'internal-proxy' | 'managed-pilot';

export interface ProcessMiningSecurityState {
  reviewedBy?: string;
  reviewedAt?: string;
  dataClassification?: ProcessMiningDataClassification;
  deploymentTarget?: ProcessMiningDeploymentTarget;
  allowExternalProcessing?: boolean;
  incidentContact?: string;
  privacyNote?: string;
  retentionNote?: string;
  backupNote?: string;
  deploymentNote?: string;
  lastProfileExportedAt?: string;
}

export type ProcessMiningAcceptanceDecision =
  | 'continue-pilot'
  | 'limited-release'
  | 'needs-refinement'
  | 'stop';

export interface ProcessMiningAcceptanceChecklist {
  benchmarkReviewed?: boolean;
  reportReviewed?: boolean;
  governanceReviewed?: boolean;
  securityReviewed?: boolean;
  pilotPrepared?: boolean;
  enablementPrepared?: boolean;
}

export interface ProcessMiningAcceptanceSnapshot {
  id: string;
  createdAt: string;
  label: string;
  decision: ProcessMiningAcceptanceDecision;
  decisionLabel: string;
  score: number;
  level: 'blocked' | 'attention' | 'ready';
  levelLabel: string;
  summary: string;
  basisFingerprint?: string;
  decidedBy?: string;
}

export interface ProcessMiningAcceptanceState {
  decision?: ProcessMiningAcceptanceDecision;
  decidedBy?: string;
  decidedAt?: string;
  scope?: string;
  targetWindow?: string;
  successCriteria?: string;
  knownRisks?: string;
  trainingNote?: string;
  note?: string;
  checklist?: ProcessMiningAcceptanceChecklist;
  history?: ProcessMiningAcceptanceSnapshot[];
  lastExportedAt?: string;
}

export interface ProcessMiningReportSnapshot {
  title: string;
  executiveSummary: string;
  processStory: string;
  keyFindings: string[];
  nextActions: string[];
  cautionNotes: string[];
  markdown: string;
  analysisMode: ProcessMiningAnalysisMode;
  basis?: ProcessMiningReportBasisSnapshot;
  generatedAt: string;
}

export interface ProcessMiningAiRefinementState {
  sourceCaseId?: string;
  prompt?: string;
  responseText?: string;
  promptFocus?: 'balanced' | 'steps' | 'frictions';
  lastMode?: 'copy_paste' | 'api';
  lastAppliedAt?: string;
  lastStatus?: string;
  lastError?: string;
}

export interface ProcessMiningNormalizationRule {
  id: string;
  kind: 'step' | 'role' | 'system';
  key: string;
  preferredValue: string;
  examples?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProcessMiningRepairJournalEntry {
  id: string;
  title: string;
  detail?: string;
  createdAt: string;
}

export type ProcessMiningBenchmarkStatus = 'pass' | 'attention' | 'fail';

export type ProcessMiningDomainKey =
  | 'complaints'
  | 'service'
  | 'returns'
  | 'mixed'
  | 'procurement'
  | 'onboarding'
  | 'billing'
  | 'masterdata';

export type ProcessMiningOperatingMode = 'quick-check' | 'standard' | 'pilot';

export interface ProcessMiningBenchmarkDomainSnapshot {
  key: ProcessMiningDomainKey;
  label: string;
  count: number;
  goldCaseCount?: number;
  samplePackCount?: number;
  score: number;
  status: ProcessMiningBenchmarkStatus;
  highlight?: string;
  strongestDimensionKey?: ProcessMiningBenchmarkDimensionSnapshot['key'];
  strongestDimensionLabel?: string;
  strongestDimensionScore?: number;
  weakestDimensionKey?: ProcessMiningBenchmarkDimensionSnapshot['key'];
  weakestDimensionLabel?: string;
  weakestDimensionScore?: number;
  dimensionScores?: ProcessMiningBenchmarkDimensionSnapshot[];
}

export interface ProcessMiningBenchmarkDimensionSnapshot {
  key: 'steps' | 'signals' | 'roles' | 'systems' | 'evidence' | 'mode';
  label: string;
  score: number;
  note: string;
}

export interface ProcessMiningBenchmarkCaseSnapshot {
  id: string;
  label: string;
  domain: ProcessMiningDomainKey;
  score: number;
  status: ProcessMiningBenchmarkStatus;
}

export interface ProcessMiningBenchmarkSnapshot {
  computedAt: string;
  engineVersion: string;
  status: ProcessMiningBenchmarkStatus;
  overallScore: number;
  passedCount: number;
  attentionCount: number;
  failedCount: number;
  caseCount: number;
  goldCaseCount: number;
  samplePackCount: number;
  headline: string;
  summary: string;
  domainScores: ProcessMiningBenchmarkDomainSnapshot[];
  dimensionScores: ProcessMiningBenchmarkDimensionSnapshot[];
  weakestCases: ProcessMiningBenchmarkCaseSnapshot[];
  recommendations: string[];
  strictGate?: {
    pass: boolean;
    summary: string;
    reasons: string[];
  };
}

export interface ProcessMiningReviewState {
  normalizationRules?: ProcessMiningNormalizationRule[];
  repairJournal?: ProcessMiningRepairJournalEntry[];
}

export interface ProcessMiningAssistedV2State {
  schemaVersion: 'process-mining-assisted-v2';
  currentStep: ProcessMiningAssistedV2Step;
  operatingMode?: ProcessMiningOperatingMode;
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  qualitySummary?: ProcessMiningQualitySummary;
  discoverySummary?: ProcessMiningDiscoverySummary;
  conformanceSummary?: ProcessMiningConformanceSummary;
  enhancementSummary?: ProcessMiningEnhancementSummary;
  augmentationNotes?: string;
  lastDerivationSummary?: DerivationSummary;
  reportSnapshot?: ProcessMiningReportSnapshot;
  reportHistory?: ProcessMiningReportSnapshot[];
  handoverDrafts?: ProcessMiningHandoverDraft[];
  aiRefinement?: ProcessMiningAiRefinementState;
  reviewState?: ProcessMiningReviewState;
  benchmarkSnapshots?: ProcessMiningBenchmarkSnapshot[];
  governance?: ProcessMiningGovernanceState;
  collaboration?: ProcessMiningCollaborationState;
  pilotToolkit?: ProcessMiningPilotToolkitState;
  connectorToolkit?: ProcessMiningConnectorToolkitState;
  security?: ProcessMiningSecurityState;
  acceptance?: ProcessMiningAcceptanceState;
  updatedAt: string;
}

export interface ProcessMiningAssistedState {
  schemaVersion: 'process-mining-assisted-v1';

  createdAt: string;
  updatedAt: string;

  currentStep?: ProcessMiningAssistedStep;
  objective?: AssistedMiningObjective;
  objectiveText?: string;
  complexity?: AssistedMiningComplexity;

  datasets?: ProcessMiningDataset[];
  activeDatasetId?: string;
  datasetStats?: Record<string, ProcessMiningDatasetStats>;

  slaRules?: MiningSlaRule[];

  reportSnapshot?: {
    createdAt: string;
    text: string;
  };

  handoverStatus?: {
    lastAt: string;
    lastScope: 'active' | 'all';
    lastMode: 'update' | 'duplicate';
    lastTransferredCount: number;
    lastTransferredSlaRules?: number;
    lastIncludedReport?: boolean;
    lastTransferredMeasures?: number;
  };
}

export type AssistedOptimizationGoal =
  | 'lead_time'
  | 'quality'
  | 'cost'
  | 'customer'
  | 'compliance'
  | 'transparency'
  | 'other';

export type AssistedOptimizationPainPoint =
  | 'waiting'
  | 'handoffs'
  | 'rework'
  | 'missing_info'
  | 'manual_work'
  | 'system_breaks'
  | 'errors'
  | 'compliance_risk'
  | 'other';

export interface AssistedOptimizationBrief {
  goal?: AssistedOptimizationGoal;
  goalOtherText?: string;

  painPoints?: AssistedOptimizationPainPoint[];
  painOtherText?: string;

  focusStepId?: string | null;

  constraints?: string;
  successCriteria?: string;

  visionNarrative?: string;

  updatedAt?: string;
}

export interface ProcessSidecar {
  roles: ProcessRole[];
  systems: ProcessSystem[];
  dataObjects: ProcessDataObject[];
  kpis: ProcessKPI[];
  automationNotes?: string[];
  aiReadinessSignals?: AIReadinessSignals;
  operationalContext?: OperationalContext;
  captureDraft?: import('./capture').CaptureDraft;
  improvementBacklog?: ImprovementBacklogItem[];
  evidenceSources?: EvidenceSource[];
  aiImportNotes?: AiImportNote[];
  processMining?: RawProcessMiningState;
  processMiningAssisted?: ProcessMiningAssistedState;
  processMiningAssistedV2?: ProcessMiningAssistedV2State;
  assistedOptimizationBrief?: AssistedOptimizationBrief;
}

export interface SyntaxFinding {
  severity: 'info' | 'warn' | 'error';
  message: string;
  elementId?: string;
}

export type SemanticQuestionStatus = 'open' | 'done';

export interface SemanticQuestion {
  id: string;
  question: string;
  relatedStepHint?: string;
  status?: SemanticQuestionStatus;
  answer?: string;
  relatedStepId?: string;
}

export interface NamingFinding {
  severity: 'info' | 'warn';
  message: string;
  exampleFix?: string;
}

export interface ModelQuality {
  syntaxFindings: SyntaxFinding[];
  semanticQuestions: SemanticQuestion[];
  namingFindings: NamingFinding[];
}

export interface ProcessVersion {
  id: string;
  processId: string;
  versionId: string;

  status: ProcessStatus;
  createdAt: string;
  updatedAt: string;

  titleSnapshot: string;

  versionLabel?: string;
  approval?: VersionApprovalInfo;

  endToEndDefinition: EndToEndDefinition;
  bpmn: import('./bpmn').BpmnModelRef;
  sidecar: ProcessSidecar;
  quality: ModelQuality;
  captureProgress: import('./capture').CaptureProgress;
}
