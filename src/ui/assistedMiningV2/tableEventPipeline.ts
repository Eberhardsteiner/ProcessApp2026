import type {
  DerivationSummary,
  ExtractionCandidate,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
} from '../../domain/process';
import { analyzeTableSource } from '../../import/tableSourceAnalysis';
import { LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';
import {
  buildContextWindow,
  buildEvidenceSourceRef,
  buildExtractionCandidateReview,
  createObservationFromStepCandidate,
  createRoleCandidates,
  createStepCandidate,
  createSupportCandidate,
  createSystemCandidates,
  reviewExtractionCandidates,
} from './evidenceModel';
import { uniqueStrings } from './pmShared';

function confidenceFromScore(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.76) return 'high';
  if (score >= 0.52) return 'medium';
  return 'low';
}

function createWeaklyAnchoredEntityCandidate(params: {
  type: 'role' | 'system';
  label: string;
  evidenceAnchor: string;
  sourceRef: string;
  routingClass: DerivationSummary['routingContext'] extends infer T
    ? T extends { routingClass: infer R }
      ? R
      : never
    : never;
  confidence: 'high' | 'medium' | 'low';
}): ExtractionCandidate {
  return {
    candidateId: crypto.randomUUID(),
    candidateType: params.type,
    rawLabel: params.label,
    normalizedLabel: params.label,
    evidenceAnchor: params.evidenceAnchor,
    contextWindow: params.evidenceAnchor,
    confidence: params.confidence,
    originChannel: 'table-cell',
    sourceFragmentType: 'table-cell',
    routingClass: params.routingClass,
    sourceRef: params.sourceRef,
    status: 'support-only',
    supportClass: 'support-evidence',
    downgradeReason: 'Schwacher Tabellenhinweis bleibt ohne belastbaren Kernschritt ausserhalb des Prozesskerns.',
  };
}

export function runTableEventPipeline(params: {
  fileName: string;
  sourceType: 'csv-row' | 'xlsx-row';
  headers: string[];
  rows: string[][];
}): {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  summary: DerivationSummary;
  warnings: string[];
} {
  const analysis = analyzeTableSource({
    headers: params.headers,
    rows: params.rows,
    sourceType: params.sourceType,
  });
  const warnings: string[] = [];
  const casesByKey = new Map<string, ProcessMiningObservationCase>();
  const sequenceByCaseId = new Map<string, number>();
  const observations: ProcessMiningObservation[] = [];
  const extractionCandidates: ExtractionCandidate[] = [];
  const issueEvidence: Array<{ label: string; snippet: string }> = [];

  if (analysis.pipelineMode === 'eventlog-table') {
    analysis.normalizedEvents.forEach(event => {
      if (!casesByKey.has(event.caseId)) {
        const now = new Date().toISOString();
        casesByKey.set(event.caseId, {
          id: crypto.randomUUID(),
          name: event.caseId === 'single-case' ? `Fall aus ${params.fileName}` : `Fall ${event.caseId}`,
          caseRef: event.caseId === 'single-case' ? undefined : event.caseId,
          narrative: '',
          rawText: `Quelle: ${params.fileName}`,
          sourceType: 'eventlog',
          inputKind: 'event-log',
          routingContext: analysis.routingContext,
          createdAt: now,
          updatedAt: now,
        });
        sequenceByCaseId.set(event.caseId, 0);
      }

      const caseItem = casesByKey.get(event.caseId)!;
      const sequenceIndex = sequenceByCaseId.get(event.caseId) ?? 0;
      sequenceByCaseId.set(event.caseId, sequenceIndex + 1);

      const contextWindow = buildContextWindow([
        event.rowEvidenceAnchor,
        event.status ? `Status: ${event.status}` : undefined,
        event.lifecycle ? `Lifecycle: ${event.lifecycle}` : undefined,
        event.system ? `System: ${event.system}` : undefined,
      ], 420);
      const sourceRef = buildEvidenceSourceRef(caseItem.id, `event-row:${event.sourceRowIndex + 1}`);
      const stepCandidate = createStepCandidate({
        rawLabel: event.activity,
        evidenceAnchor: event.rowEvidenceAnchor,
        contextWindow,
        confidence: confidenceFromScore(event.confidence),
        originChannel: 'event-row',
        sourceFragmentType: 'event-row',
        routingContext: analysis.routingContext,
        sourceRef,
        index: sequenceIndex,
      });

      extractionCandidates.push(stepCandidate);
      extractionCandidates.push(...createRoleCandidates({
        labels: uniqueStrings([event.role ?? '', event.resource ?? '']),
        evidenceOrigin: 'explicit',
        evidenceAnchor: event.rowEvidenceAnchor,
        contextWindow,
        confidence: confidenceFromScore(event.confidence),
        originChannel: 'event-row',
        sourceFragmentType: 'event-row',
        routingContext: analysis.routingContext,
        sourceRef,
        relatedCandidateId: stepCandidate.candidateId,
      }));
      extractionCandidates.push(...createSystemCandidates({
        labels: event.system ? [event.system] : [],
        evidenceOrigin: 'explicit',
        evidenceAnchor: event.rowEvidenceAnchor,
        contextWindow,
        confidence: confidenceFromScore(event.confidence),
        originChannel: 'event-row',
        sourceFragmentType: 'event-row',
        routingContext: analysis.routingContext,
        sourceRef,
        relatedCandidateId: stepCandidate.candidateId,
      }));

      if (event.status) {
        extractionCandidates.push(createSupportCandidate({
          candidateType: 'signal',
          rawLabel: `Statussignal: ${event.status}`,
          evidenceAnchor: event.rowEvidenceAnchor,
          contextWindow,
          confidence: confidenceFromScore(event.confidence),
          originChannel: 'event-row',
          sourceFragmentType: 'event-row',
          routingContext: analysis.routingContext,
          sourceRef,
          relatedCandidateId: stepCandidate.candidateId,
          supportClass: 'issue-signal',
        }));
      }

      observations.push(createObservationFromStepCandidate({
        candidate: stepCandidate,
        caseId: caseItem.id,
        sequenceIndex,
        role: event.role ?? event.resource,
        system: event.system,
        timestampRaw: event.timestampRaw,
        timestampIso: event.timestampIso,
        timestampQuality: event.timestampIso || event.timestampRaw ? 'real' : 'missing',
      }));
    });

    if (analysis.traceStats?.reconstructedSingleCase) {
      warnings.push('Kein expliziter Case-ID-Kanal erkannt; die Tabelle wurde defensiv als Single-Case-Ereignisfolge rekonstruiert.');
    }
  } else {
    const now = new Date().toISOString();
    const weakCase: ProcessMiningObservationCase = {
      id: crypto.randomUUID(),
      name: `Tabellensignale aus ${params.fileName}`,
      narrative: '',
      rawText: `Quelle: ${params.fileName}`,
      sourceType: params.sourceType,
      inputKind: 'table-row',
      routingContext: analysis.routingContext,
      createdAt: now,
      updatedAt: now,
    };
    casesByKey.set('weak-table-signals', weakCase);

    analysis.weakRowSignals.forEach((signal, index) => {
      const sourceRef = buildEvidenceSourceRef(weakCase.id, `weak-row:${signal.sourceRowIndex + 1}`);
      extractionCandidates.push(createSupportCandidate({
        candidateType: 'signal',
        rawLabel: signal.label,
        evidenceAnchor: signal.snippet,
        contextWindow: signal.snippet,
        confidence: confidenceFromScore(signal.confidence),
        originChannel: 'table-row',
        sourceFragmentType: 'table-row',
        routingContext: analysis.routingContext,
        sourceRef,
        supportClass: signal.supportClass,
      }));

      if (signal.roleHint) {
        extractionCandidates.push(createWeaklyAnchoredEntityCandidate({
          type: 'role',
          label: signal.roleHint,
          evidenceAnchor: signal.snippet,
          sourceRef,
          routingClass: analysis.routingContext.routingClass,
          confidence: confidenceFromScore(signal.confidence),
        }));
      }

      if (signal.systemHint) {
        extractionCandidates.push(createWeaklyAnchoredEntityCandidate({
          type: 'system',
          label: signal.systemHint,
          evidenceAnchor: signal.snippet,
          sourceRef,
          routingClass: analysis.routingContext.routingClass,
          confidence: confidenceFromScore(signal.confidence),
        }));
      }

      observations.push({
        id: crypto.randomUUID(),
        sourceCaseId: weakCase.id,
        label: signal.label,
        evidenceSnippet: signal.snippet,
        evidenceAnchor: signal.snippet,
        contextWindow: signal.snippet,
        originChannel: signal.sourceCellRefs.length > 0 ? 'table-cell' : 'table-row',
        sourceFragmentType: signal.sourceCellRefs.length > 0 ? 'table-cell' : 'table-row',
        kind: signal.supportClass === 'support-evidence' ? 'other' : 'issue',
        sequenceIndex: index,
        timestampQuality: 'missing',
        createdAt: new Date().toISOString(),
      });
      issueEvidence.push({ label: signal.label, snippet: signal.snippet });
    });

    if (analysis.eventlogEligibility.fallbackReason) {
      warnings.push(`Defensiver Tabellenpfad aktiv: ${analysis.eventlogEligibility.fallbackReason}`);
    }
  }

  const reviewedCandidates = reviewExtractionCandidates(extractionCandidates);
  const candidateReview = buildExtractionCandidateReview(reviewedCandidates);
  const cases = [...casesByKey.values()];
  const roles = uniqueStrings(
    reviewedCandidates
      .filter(candidate => candidate.candidateType === 'role' && candidate.status !== 'support-only')
      .map(candidate => candidate.normalizedLabel),
  );
  const systems = uniqueStrings(
    reviewedCandidates
      .filter(candidate => candidate.candidateType === 'system' && candidate.status !== 'support-only')
      .map(candidate => candidate.normalizedLabel),
  );

  const verifiedTimedEvents = analysis.normalizedEvents.filter(event => Boolean(event.timestampIso || event.timestampRaw)).length;
  const derivedAnalysisMode: DerivationSummary['analysisMode'] = analysis.pipelineMode === 'eventlog-table'
    ? (analysis.traceStats?.caseCount ?? 0) >= 8
      && verifiedTimedEvents >= Math.max(24, (analysis.traceStats?.caseCount ?? 0) * 3)
      && (analysis.traceStats?.orderedTraceShare ?? 0) >= 0.6
      ? 'true-mining'
      : (analysis.traceStats?.caseCount ?? 0) >= 2
      ? 'exploratory-mining'
      : 'process-draft'
    : 'process-draft';

  const summary: DerivationSummary = {
    sourceLabel: params.fileName,
    method: analysis.pipelineMode === 'eventlog-table' ? 'semi-structured' : 'narrative-fallback',
    documentKind: analysis.pipelineMode === 'eventlog-table' ? 'mixed-document' : 'weak-material',
    analysisMode: derivedAnalysisMode,
    caseCount: cases.length,
    observationCount: observations.length,
    warnings,
    confidence: analysis.routingContext.routingConfidence,
    stepLabels: observations.filter(item => item.kind === 'step').map(item => item.label),
    roles,
    systems,
    issueSignals: observations.filter(item => item.kind === 'issue').map(item => item.label),
    issueEvidence,
    routingContext: analysis.routingContext,
    tablePipeline: {
      pipelineMode: analysis.pipelineMode,
      tableProfile: analysis.tableProfile,
      inferredSchema: analysis.inferredSchema,
      acceptedColumnMappings: analysis.acceptedColumnMappings,
      rejectedColumnMappings: analysis.rejectedColumnMappings,
      mappingConfidence: analysis.mappingConfidence,
      eventlogEligibility: analysis.eventlogEligibility,
      rowEvidenceStats: analysis.rowEvidenceStats,
      traceStats: analysis.traceStats,
      normalizedEvents: analysis.normalizedEvents,
      weakTableSignals: analysis.weakTableSignals,
    },
    extractionCandidates: reviewedCandidates,
    candidateReview,
    engineVersion: LOCAL_MINING_ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };

  return {
    cases,
    observations,
    summary,
    warnings,
  };
}
