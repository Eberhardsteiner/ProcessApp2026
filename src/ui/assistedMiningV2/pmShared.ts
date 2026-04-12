import type {
  DerivationSummary,
  ProcessMiningAnalysisMode,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
  ProcessMiningQualitySummary,
} from '../../domain/process';

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeLabel(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

export function sentenceCase(value: string): string {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = normalizeWhitespace(value ?? '');
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function getCaseIdsFromObservations(observations: ProcessMiningObservation[]): string[] {
  return Array.from(new Set(observations.map(o => o.sourceCaseId).filter((id): id is string => Boolean(id))));
}

function ratio(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return part / whole;
}

function getRealTimeStepCount(observations: ProcessMiningObservation[]): number {
  return observations.filter(observation => observation.kind === 'step' && observation.timestampQuality === 'real').length;
}

function getRealTimeCoverage(observations: ProcessMiningObservation[]): number {
  const stepObservations = observations.filter(observation => observation.kind === 'step');
  if (stepObservations.length === 0) return 0;
  return ratio(getRealTimeStepCount(stepObservations), stepObservations.length);
}

function findEligibilityCriterion(summary: DerivationSummary | undefined, key: string) {
  return summary?.tablePipeline?.eventlogEligibility.minimumCriteria?.find(item => item.key === key);
}

function passedCriterion(summary: DerivationSummary | undefined, key: string): boolean {
  return Boolean(findEligibilityCriterion(summary, key)?.passed);
}

function fallbackPassedCriterion(summary: DerivationSummary | undefined, preferredKey: string, legacyKey: string): boolean {
  const preferred = findEligibilityCriterion(summary, preferredKey);
  if (preferred) return Boolean(preferred.passed);
  return passedCriterion(summary, legacyKey);
}

export interface VerifiedAnalysisFacts {
  analysisMode: ProcessMiningAnalysisMode;
  caseCount: number;
  stateCaseCount: number;
  observationCaseCount: number;
  derivedCaseCount: number;
  traceCaseCount: number;
  stepCount: number;
  realTimeStepCount: number;
  realTimeCoverage: number;
  orderingBackedCaseCount: number;
  verifiedEventlogEligibility: boolean;
  verifiedActivityAnchor: boolean;
  verifiedCaseAnchor: boolean;
  verifiedTimeAnchor: boolean;
  reconstructedSingleCase: boolean;
  timingCapabilityAllowed: boolean;
  compareCapabilityAllowed: boolean;
  variantsCapabilityAllowed: boolean;
}

export function buildVerifiedAnalysisFacts(params: {
  cases?: ProcessMiningObservationCase[];
  observations?: ProcessMiningObservation[];
  lastDerivationSummary?: DerivationSummary;
  qualitySummary?: ProcessMiningQualitySummary;
}): VerifiedAnalysisFacts {
  const { cases = [], observations = [], lastDerivationSummary, qualitySummary } = params;
  const summary = lastDerivationSummary;
  const stepObservations = observations.filter(observation => observation.kind === 'step');
  const stepCount = stepObservations.length;
  const stateCaseCount = cases.length;
  const observationCaseCount = getCaseIdsFromObservations(observations).length;
  const summaryCaseCount = typeof summary?.caseCount === 'number' ? summary.caseCount : 0;
  const multiCaseCount = summary?.multiCaseSummary?.caseCount ?? 0;
  const traceCaseCount = summary?.tablePipeline?.traceStats?.caseCount ?? 0;
  const realTimeStepCount = getRealTimeStepCount(stepObservations);
  const realTimeCoverage = getRealTimeCoverage(stepObservations);
  const reconstructedSingleCase = Boolean(summary?.tablePipeline?.traceStats?.reconstructedSingleCase);

  const verifiedActivityAnchor = passedCriterion(summary, 'activity-channel');
  const verifiedCaseAnchor = passedCriterion(summary, 'case-anchor');
  const verifiedTimeAnchor = fallbackPassedCriterion(summary, 'time-anchor', 'order-anchor');
  const sufficientCoreCoverage = passedCriterion(summary, 'core-row-coverage');
  const sufficientMappingConfidence = passedCriterion(summary, 'mapping-confidence');
  const acceptableConflictLoad = passedCriterion(summary, 'conflict-load');
  const stableTableShape = passedCriterion(summary, 'table-shape');

  const verifiedEventlogEligibility = Boolean(
    summary?.tablePipeline
      && summary.tablePipeline.pipelineMode === 'eventlog-table'
      && summary.tablePipeline.eventlogEligibility.eligible
      && verifiedActivityAnchor
      && verifiedCaseAnchor
      && verifiedTimeAnchor
      && sufficientCoreCoverage
      && sufficientMappingConfidence
      && acceptableConflictLoad
      && stableTableShape
      && !reconstructedSingleCase,
  );

  let caseCount = Math.max(stateCaseCount, observationCaseCount);
  if (verifiedEventlogEligibility) {
    caseCount = Math.max(caseCount, traceCaseCount, summaryCaseCount, 1);
  } else if (summary?.routingContext?.routingClass === 'weak-raw-table' || summary?.tablePipeline?.pipelineMode === 'weak-raw-table') {
    caseCount = stepCount > 0 || stateCaseCount > 0 || summaryCaseCount > 0 ? 1 : 0;
  } else {
    caseCount = Math.max(caseCount, multiCaseCount);
    if (summaryCaseCount > 0 && summaryCaseCount <= 24) {
      caseCount = Math.max(caseCount, summaryCaseCount);
    }
  }

  const orderingBackedCaseCount = verifiedEventlogEligibility
    ? Math.max(traceCaseCount, caseCount)
    : Math.max(
        qualitySummary?.casesWithOrdering ?? 0,
        multiCaseCount > 1 ? Math.min(multiCaseCount, caseCount) : 0,
      );

  const enoughCasesForMining = caseCount >= 8;
  const enoughTimeForMining = realTimeCoverage >= 0.6;
  const enoughEventsForMining = stepCount >= Math.max(24, caseCount * 3);

  let analysisMode: ProcessMiningAnalysisMode;
  if (caseCount <= 1) {
    analysisMode = 'process-draft';
  } else if (verifiedEventlogEligibility && enoughCasesForMining && enoughTimeForMining && enoughEventsForMining) {
    analysisMode = 'true-mining';
  } else if (enoughCasesForMining && enoughTimeForMining && enoughEventsForMining) {
    analysisMode = 'true-mining';
  } else {
    analysisMode = 'exploratory-mining';
  }

  const timingCapabilityAllowed = verifiedEventlogEligibility
    ? verifiedTimeAnchor && caseCount >= 2 && realTimeCoverage >= 0.5 && (summary?.tablePipeline?.traceStats?.orderedTraceShare ?? 0) >= 0.5
    : caseCount >= 2 && orderingBackedCaseCount >= Math.min(caseCount, 2) && realTimeStepCount >= Math.max(2, Math.ceil(stepCount * 0.35));

  const compareCapabilityAllowed = caseCount >= 2 && stepCount >= 4 && orderingBackedCaseCount >= Math.min(caseCount, 2);
  const variantsCapabilityAllowed = verifiedEventlogEligibility
    ? caseCount >= 2 && (summary?.tablePipeline?.traceStats?.orderedTraceShare ?? 0) >= 0.5
    : compareCapabilityAllowed;

  return {
    analysisMode,
    caseCount,
    stateCaseCount,
    observationCaseCount,
    derivedCaseCount: summaryCaseCount,
    traceCaseCount,
    stepCount,
    realTimeStepCount,
    realTimeCoverage,
    orderingBackedCaseCount,
    verifiedEventlogEligibility,
    verifiedActivityAnchor,
    verifiedCaseAnchor,
    verifiedTimeAnchor,
    reconstructedSingleCase,
    timingCapabilityAllowed,
    compareCapabilityAllowed,
    variantsCapabilityAllowed,
  };
}

export function detectProcessMiningAnalysisMode(params: {
  cases?: ProcessMiningObservationCase[];
  observations?: ProcessMiningObservation[];
  lastDerivationSummary?: DerivationSummary;
  qualitySummary?: ProcessMiningQualitySummary;
}): ProcessMiningAnalysisMode {
  return buildVerifiedAnalysisFacts(params).analysisMode;
}

export function getAnalysisModeLabel(mode: ProcessMiningAnalysisMode): string {
  if (mode === 'process-draft') return 'Prozessentwurf';
  if (mode === 'exploratory-mining') return 'Fallvergleich';
  return 'Echtes Process Mining';
}

export function canUseStrongPercentages(mode: ProcessMiningAnalysisMode, caseCount: number): boolean {
  return mode === 'true-mining' && caseCount >= 8;
}

export function formatCaseCountShare(params: {
  count: number;
  total: number;
  mode?: ProcessMiningAnalysisMode;
}): string {
  const { count, total, mode } = params;
  if (total <= 0) return 'noch keine belastbare Basis';
  if (!canUseStrongPercentages(mode ?? 'exploratory-mining', total)) {
    return `${count} von ${total} ${total === 1 ? 'Quelle' : 'Fällen/Quellen'}`;
  }
  return `${Math.round((count / Math.max(total, 1)) * 100)} %`;
}

export type AnalysisClaimStrength = 'draft-only' | 'cautious-comparison' | 'strong-mining';

export function getAnalysisClaimStrength(mode: ProcessMiningAnalysisMode, caseCount: number): AnalysisClaimStrength {
  if (mode === 'process-draft') return 'draft-only';
  if (canUseStrongPercentages(mode, caseCount)) return 'strong-mining';
  return 'cautious-comparison';
}

export function buildAnalysisClaimNote(params: {
  mode: ProcessMiningAnalysisMode;
  caseCount: number;
}): string {
  const { mode, caseCount } = params;
  const strength = getAnalysisClaimStrength(mode, caseCount);
  if (strength === 'draft-only') {
    return 'Die App sollte hier nur von einem Prozessentwurf sprechen. Prozentwerte und Standardquoten wären zu stark.';
  }
  if (strength === 'cautious-comparison') {
    return `Die App darf ${caseCount} Fälle vorsichtig vergleichen, sollte Mengen- und Prozentangaben aber nur zurückhaltend verwenden.`;
  }
  return 'Die Datenbasis ist stark genug für deutlich belastbarere Mengen- und Prozentangaben.';
}

export function buildAnalysisModeNotice(params: {
  mode: ProcessMiningAnalysisMode;
  caseCount: number;
  documentKind?: DerivationSummary['documentKind'];
}): string {
  const { mode, caseCount, documentKind } = params;
  if (mode === 'process-draft') {
    if (documentKind === 'procedure-document' || documentKind === 'semi-structured-procedure-document') {
      return 'Aktuell liegt vor allem ein einzelnes Verfahrensdokument vor. Die Ergebnisse zeigen daher einen Prozessentwurf, keine statistisch belastbaren Häufigkeiten.';
    }
    if (documentKind === 'mixed-document') {
      return 'Aktuell liegt ein Mischdokument vor. Die Ergebnisse zeigen einen vorsichtigen Prozessentwurf mit getrennten Struktur- und Narrativanteilen.';
    }
    return 'Aktuell liegt nur ein einzelner Fall oder eine defensiv gehaltene Quelle vor. Die Ergebnisse zeigen einen Prozessentwurf und noch kein belastbares Mining-Muster.';
  }
  if (mode === 'exploratory-mining') {
    return `Es liegen ${caseCount} belastbar auswertbare Fälle oder Quellen vor. Das reicht für einen vorsichtigen Fallvergleich, aber noch nicht für harte Standardquoten wie in einem echten Eventlog.`;
  }
  return `Es liegen ${caseCount} strukturierte Fälle mit verifizierter Zeitbasis vor. Prozentwerte und Vergleichsaussagen sind damit deutlich belastbarer.`;
}

export function sampleAwarePercentLabel(count: number, total: number, mode?: ProcessMiningAnalysisMode): string {
  if (total <= 1) {
    return count === 1 ? 'im ausgewerteten Fall' : 'im ausgewerteten Material';
  }
  if (!canUseStrongPercentages(mode ?? 'exploratory-mining', total)) {
    return `in ${count} von ${total} Fällen`;
  }
  return `in ${Math.round((count / Math.max(total, 1)) * 100)} % der Fälle`;
}

export function createObservation(params: {
  caseId: string;
  label: string;
  sequenceIndex: number;
  kind?: ProcessMiningObservation['kind'];
  evidenceSnippet?: string;
  role?: string;
  system?: string;
  timestampRaw?: string;
  timestampIso?: string;
  timestampQuality?: ProcessMiningObservation['timestampQuality'];
}): ProcessMiningObservation {
  return {
    id: crypto.randomUUID(),
    sourceCaseId: params.caseId,
    label: sentenceCase(params.label),
    evidenceSnippet: params.evidenceSnippet,
    role: params.role,
    system: params.system,
    kind: params.kind ?? 'step',
    sequenceIndex: params.sequenceIndex,
    timestampRaw: params.timestampRaw,
    timestampIso: params.timestampIso,
    timestampQuality: params.timestampQuality ?? (params.timestampIso || params.timestampRaw ? 'real' : 'missing'),
    createdAt: new Date().toISOString(),
  };
}
