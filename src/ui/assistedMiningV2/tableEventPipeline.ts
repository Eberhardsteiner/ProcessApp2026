import type { DerivationSummary, ExtractionCandidate, ProcessMiningObservation, ProcessMiningObservationCase } from '../../domain/process';
import type { CsvImportConfig } from './fileImport';
import { LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';
import { mapRoutingClassToDocumentKind, routeSourceMaterial } from '../../import/sourceRouter';
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

type SemanticType = NonNullable<NonNullable<DerivationSummary['tablePipeline']>['inferredSchema'][number]>['inferredSemanticType'];

function looksDate(value: string): boolean {
  if (!value) return false;
  return !Number.isNaN(Date.parse(value)) || /\b\d{2}\.\d{2}\.\d{4}\b/.test(value);
}
function looksNumeric(value: string): boolean {
  if (!value) return false;
  return /^-?\d+(?:[.,]\d+)?$/.test(value.trim());
}
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function inferSemanticType(header: string, values: string[], index: number, config: CsvImportConfig) {
  const h = header.toLowerCase();
  const nonEmpty = values.filter(Boolean);
  const total = Math.max(nonEmpty.length, 1);
  const dateShare = nonEmpty.filter(looksDate).length / total;
  const numericShare = nonEmpty.filter(looksNumeric).length / total;
  const uniqueShare = new Set(nonEmpty).size / total;
  const shortShare = nonEmpty.filter(v => v.length <= 24).length / total;
  const supportingSignals: string[] = [];
  const conflictingSignals: string[] = [];

  const headerHints: Array<[RegExp, SemanticType]> = [
    [/(case|fall|vorgang|ticket).*id|^id$/i, 'case-id'],
    [/(activity|aktion|schritt|event|tätigkeit|taetigkeit)/i, 'activity'],
    [/(timestamp|zeit|datum|created|start|ende|end)/i, 'timestamp'],
    [/(resource|rolle|bearbeiter|owner|agent|user)/i, 'role'],
    [/(system|tool|app|application|quelle|source)/i, 'system'],
    [/(status|state)/i, 'status'],
    [/(comment|note|notiz|beschreibung|description|text)/i, 'free-text-support'],
    [/(amount|betrag|summe|kosten|price)/i, 'amount'],
  ];

  let inferred: SemanticType = 'unknown';
  let score = 0.2;

  for (const [re, type] of headerHints) {
    if (re.test(h)) {
      inferred = type;
      score += 0.25;
      supportingSignals.push(`header:${type}`);
      break;
    }
  }

  if (dateShare >= 0.6) {
    inferred = inferred === 'unknown' ? 'timestamp' : inferred;
    score += 0.35;
    supportingSignals.push(`dateShare=${dateShare.toFixed(2)}`);
  }
  if (numericShare >= 0.7 && inferred === 'unknown') {
    inferred = 'order-index';
    score += 0.2;
    supportingSignals.push(`numericShare=${numericShare.toFixed(2)}`);
  }
  if (uniqueShare >= 0.85 && shortShare >= 0.8 && (inferred === 'unknown' || inferred === 'case-id')) {
    inferred = 'case-id';
    score += 0.2;
    supportingSignals.push(`uniqueShare=${uniqueShare.toFixed(2)}`);
  }

  if (inferred === 'activity' && shortShare < 0.4) conflictingSignals.push('activity-values-too-long');
  if (inferred === 'system' && uniqueShare < 0.02) conflictingSignals.push('system-low-variance');
  if (inferred === 'case-id' && uniqueShare < 0.05) conflictingSignals.push('case-id-low-uniqueness');

  if (index === config.activityColIdx) {
    inferred = 'activity';
    score += 0.15;
    supportingSignals.push('manual-config-activity');
  }
  if (index === config.caseIdColIdx) {
    inferred = 'case-id';
    score += 0.1;
    supportingSignals.push('manual-config-case-id');
  }
  if (index === config.timestampColIdx) {
    inferred = 'timestamp';
    score += 0.1;
    supportingSignals.push('manual-config-timestamp');
  }

  const confidence = Math.max(0, Math.min(1, score));
  const accepted = confidence >= 0.5 && conflictingSignals.length < 2;
  return {
    columnIndex: index,
    header,
    inferredSemanticType: inferred,
    confidence,
    supportingSignals,
    conflictingSignals,
    accepted,
    fallbackUse: accepted ? undefined : 'support-only',
  };
}

export function runTableEventPipeline(params: {
  fileName: string;
  sourceType: 'csv-row' | 'xlsx-row';
  headers: string[];
  rows: string[][];
  config: CsvImportConfig;
}): {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  summary: DerivationSummary;
  warnings: string[];
} {
  const { fileName, sourceType, headers, rows, config } = params;
  const rowCount = rows.length;
  const columnCount = headers.length;
  const values = rows.flat();
  const nonEmptyValues = values.filter(v => normalize(v).length > 0);
  const emptyValueShare = 1 - (nonEmptyValues.length / Math.max(values.length, 1));
  const timestampParseShare = nonEmptyValues.filter(looksDate).length / Math.max(nonEmptyValues.length, 1);
  const numericValueShare = nonEmptyValues.filter(looksNumeric).length / Math.max(nonEmptyValues.length, 1);
  const shortValueShare = nonEmptyValues.filter(v => v.length <= 20).length / Math.max(nonEmptyValues.length, 1);
  const longValueShare = nonEmptyValues.filter(v => v.length >= 80).length / Math.max(nonEmptyValues.length, 1);

  const inferredSchema = headers.map((header, index) => {
    const colValues = rows.map(row => normalize(row[index] ?? '')).filter(Boolean);
    return inferSemanticType(header, colValues, index, config);
  });

  const activityMap = inferredSchema.find(item => item.inferredSemanticType === 'activity' && item.accepted);
  const caseIdMap = inferredSchema.find(item => item.inferredSemanticType === 'case-id' && item.accepted);
  const timeMap = inferredSchema.find(item => (item.inferredSemanticType === 'timestamp' || item.inferredSemanticType === 'order-index') && item.accepted);
  const routedTable = routeSourceMaterial({
    sourceType,
    headers,
    rows,
  });

  const reasons: string[] = [];
  if (routedTable.routingClass !== 'eventlog-table') {
    reasons.push(
      routedTable.fallbackReason ??
        `Quellen-Router stuft das Material nicht als belastbare Ereignistabelle ein (${routedTable.routingClass}).`,
    );
  }
  if (!activityMap) reasons.push('Keine belastbare Activity-Spalte erkannt.');
  if (!caseIdMap) reasons.push('Keine belastbare Case-ID-Spalte erkannt.');
  if (!timeMap) reasons.push('Kein belastbarer Ordnungsanker (timestamp/index) erkannt.');
  if (emptyValueShare > 0.55) reasons.push('Zu hoher Leerwertanteil in der Tabelle.');

  const canUseEventlog = routedTable.routingClass === 'eventlog-table'
    && Boolean(activityMap)
    && Boolean(caseIdMap)
    && Boolean(timeMap)
    && reasons.length === 0;

  const casesByRef = new Map<string, ProcessMiningObservationCase>();
  const observations: ProcessMiningObservation[] = [];
  const extractionCandidates: ExtractionCandidate[] = [];
  const warnings: string[] = [];
  const weakIssueEvidence: Array<{ label: string; snippet: string }> = [];
  let weakSignalsCreated = 0;

  rows.forEach((row, rowIndex) => {
    const rowAnchor = `row:${rowIndex + 1}`;
    const caseRef = caseIdMap ? normalize(row[caseIdMap.columnIndex] ?? '') : '';
    const activity = activityMap ? normalize(row[activityMap.columnIndex] ?? '') : '';
    const timestampRaw = timeMap ? normalize(row[timeMap.columnIndex] ?? '') : '';
    const rowContext = buildContextWindow(
      headers.map((header, columnIndex) => {
        const value = normalize(row[columnIndex] ?? '');
        return value ? `${header}: ${value}` : undefined;
      }),
      420,
    );

    if (canUseEventlog) {
      if (!caseRef || !activity) return;
      if (!casesByRef.has(caseRef)) {
        const now = new Date().toISOString();
        casesByRef.set(caseRef, {
          id: crypto.randomUUID(),
          name: `Fall ${caseRef}`,
          narrative: '',
          rawText: `Quelle: ${fileName}`,
          sourceType: 'eventlog',
          inputKind: 'event-log',
          routingContext: {
            routingClass: 'eventlog-table',
            routingConfidence: routedTable.routingConfidence,
            routingSignals: [...routedTable.routingSignals, 'table-pipeline:eventlog'],
          },
          createdAt: now,
          updatedAt: now,
        });
      }
      const caseObj = casesByRef.get(caseRef)!;
      const seq = observations.filter(item => item.sourceCaseId === caseObj.id).length;
      const role = config.roleColIdx >= 0 ? normalize(row[config.roleColIdx] ?? '') || undefined : undefined;
      const system = config.systemColIdx >= 0 ? normalize(row[config.systemColIdx] ?? '') || undefined : undefined;
      const stepCandidate = createStepCandidate({
        rawLabel: activity,
        evidenceAnchor: `${rowAnchor} | ${activity}`,
        contextWindow: rowContext,
        confidence: routedTable.routingConfidence,
        originChannel: 'event-row',
        sourceFragmentType: 'event-row',
        routingContext: {
          routingClass: 'eventlog-table',
          routingConfidence: routedTable.routingConfidence,
          routingSignals: [...routedTable.routingSignals, 'table-pipeline:eventlog'],
        },
        sourceRef: buildEvidenceSourceRef(caseObj.id, `event-row:${rowIndex + 1}`),
        index: seq,
      });

      extractionCandidates.push(stepCandidate);
      extractionCandidates.push(...createRoleCandidates({
        labels: role ? [role] : [],
        evidenceAnchor: rowContext,
        contextWindow: rowContext,
        confidence: routedTable.routingConfidence,
        originChannel: 'event-row',
        sourceFragmentType: 'event-row',
        routingContext: {
          routingClass: 'eventlog-table',
          routingConfidence: routedTable.routingConfidence,
          routingSignals: [...routedTable.routingSignals, 'table-pipeline:eventlog'],
        },
        sourceRef: stepCandidate.sourceRef ?? buildEvidenceSourceRef(caseObj.id, `event-row:${rowIndex + 1}`),
        relatedCandidateId: stepCandidate.candidateId,
      }));
      extractionCandidates.push(...createSystemCandidates({
        labels: system ? [system] : [],
        evidenceAnchor: rowContext,
        contextWindow: rowContext,
        confidence: routedTable.routingConfidence,
        originChannel: 'event-row',
        sourceFragmentType: 'event-row',
        routingContext: {
          routingClass: 'eventlog-table',
          routingConfidence: routedTable.routingConfidence,
          routingSignals: [...routedTable.routingSignals, 'table-pipeline:eventlog'],
        },
        sourceRef: stepCandidate.sourceRef ?? buildEvidenceSourceRef(caseObj.id, `event-row:${rowIndex + 1}`),
        relatedCandidateId: stepCandidate.candidateId,
      }));

      observations.push(createObservationFromStepCandidate({
        candidate: stepCandidate,
        caseId: caseObj.id,
        sequenceIndex: seq,
        role,
        system,
        timestampRaw: timestampRaw || undefined,
        timestampQuality: timestampRaw ? 'real' : 'missing',
      }));
      return;
    }

    const weakLabel = normalize(row[config.activityColIdx] ?? row[0] ?? '');
    if (!weakLabel) return;
    weakSignalsCreated += 1;
    const weakCaseId = 'weak-table-signals';
    if (!casesByRef.has(weakCaseId)) {
      const now = new Date().toISOString();
      casesByRef.set(weakCaseId, {
        id: crypto.randomUUID(),
        name: 'Tabellensignale (defensiv)',
        narrative: '',
        rawText: `Quelle: ${fileName}`,
        sourceType,
        inputKind: 'table-row',
        routingContext: {
          routingClass: routedTable.routingClass === 'eventlog-table' ? 'weak-raw-table' : routedTable.routingClass,
          routingConfidence: routedTable.routingClass === 'eventlog-table' ? 'low' : routedTable.routingConfidence,
          routingSignals: [...routedTable.routingSignals, 'table-pipeline:defensive'],
          fallbackReason: reasons.join(' '),
        },
        createdAt: now,
        updatedAt: now,
      });
    }
    const weakCase = casesByRef.get(weakCaseId)!;
    const weakSignalLabel = `Tabellensignal: ${weakLabel.slice(0, 60)}`;
    weakIssueEvidence.push({ label: weakSignalLabel, snippet: `${rowAnchor} | ${rowContext || weakLabel}` });
    extractionCandidates.push(createSupportCandidate({
      candidateType: 'signal',
      rawLabel: weakSignalLabel,
      evidenceAnchor: `${rowAnchor} | ${weakLabel}`,
      contextWindow: rowContext || weakLabel,
      confidence: 'low',
      originChannel: 'table-row',
      sourceFragmentType: 'table-row',
      routingContext: {
        routingClass: routedTable.routingClass === 'eventlog-table' ? 'weak-raw-table' : routedTable.routingClass,
        routingConfidence: routedTable.routingClass === 'eventlog-table' ? 'low' : routedTable.routingConfidence,
        routingSignals: [...routedTable.routingSignals, 'table-pipeline:defensive'],
        fallbackReason: reasons.join(' '),
      },
      sourceRef: buildEvidenceSourceRef(weakCase.id, `weak-row:${rowIndex + 1}`),
      supportClass: 'weak-raw-fragment',
    }));
    observations.push({
      id: crypto.randomUUID(),
      sourceCaseId: weakCase.id,
      label: weakSignalLabel,
      evidenceSnippet: `${rowAnchor} | ${weakLabel}`,
      evidenceAnchor: `${rowAnchor} | ${weakLabel}`,
      contextWindow: rowContext || weakLabel,
      originChannel: 'table-row',
      sourceFragmentType: 'table-row',
      kind: 'issue',
      sequenceIndex: observations.length,
      timestampQuality: 'missing',
      createdAt: new Date().toISOString(),
    });
  });

  if (!canUseEventlog) warnings.push(`Defensiver Tabellenpfad aktiv: ${reasons.join(' ')}`);

  const cases = [...casesByRef.values()];
  const stepCount = observations.filter(item => item.kind === 'step').length;
  const reviewedCandidates = reviewExtractionCandidates(extractionCandidates);
  const candidateReview = buildExtractionCandidateReview(reviewedCandidates);
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
  const traceStats = canUseEventlog
    ? {
        caseCount: cases.length,
        averageEventsPerCase: Number((stepCount / Math.max(cases.length, 1)).toFixed(2)),
        orderedTraceShare: Number((observations.filter(item => item.timestampQuality === 'real').length / Math.max(stepCount, 1)).toFixed(2)),
      }
    : undefined;

  const summary: DerivationSummary = {
    sourceLabel: fileName,
    method: canUseEventlog ? 'semi-structured' : 'narrative-fallback',
    documentKind: canUseEventlog ? 'mixed-document' : mapRoutingClassToDocumentKind(routedTable.routingClass),
    analysisMode: canUseEventlog ? 'true-mining' : 'process-draft',
    caseCount: cases.length,
    observationCount: observations.length,
    warnings,
    confidence: canUseEventlog ? routedTable.routingConfidence : 'low',
    stepLabels: observations.filter(item => item.kind === 'step').map(item => item.label),
    roles,
    systems,
    issueSignals: observations.filter(item => item.kind === 'issue').map(item => item.label),
    issueEvidence: weakIssueEvidence,
    routingContext: {
      routingClass: canUseEventlog ? 'eventlog-table' : (routedTable.routingClass === 'eventlog-table' ? 'weak-raw-table' : routedTable.routingClass),
      routingConfidence: canUseEventlog ? routedTable.routingConfidence : 'low',
      routingSignals: [...routedTable.routingSignals, canUseEventlog ? 'table-pipeline:eventlog' : 'table-pipeline:defensive'],
      fallbackReason: canUseEventlog ? undefined : reasons.join(' '),
    },
    tablePipeline: {
      pipelineMode: canUseEventlog ? 'eventlog-table' : 'weak-raw-table',
      tableProfile: {
        rowCount,
        columnCount,
        emptyValueShare: Number(emptyValueShare.toFixed(2)),
        timestampParseShare: Number(timestampParseShare.toFixed(2)),
        numericValueShare: Number(numericValueShare.toFixed(2)),
        shortValueShare: Number(shortValueShare.toFixed(2)),
        longValueShare: Number(longValueShare.toFixed(2)),
        rowOrderCoherence: Number((timeMap ? 0.7 : 0.2).toFixed(2)),
        caseCoherence: Number((caseIdMap ? 0.7 : 0.2).toFixed(2)),
      },
      inferredSchema,
      eventlogEligibility: {
        eligible: canUseEventlog,
        reasons: canUseEventlog ? ['Mindeststruktur erfüllt.'] : reasons,
        fallbackReason: canUseEventlog ? undefined : 'Mindeststruktur für echtes Eventlog-Mining nicht erfüllt.',
      },
      rowEvidenceStats: {
        rowsWithEvidence: observations.length,
        eventsCreated: stepCount,
        weakSignalsCreated,
      },
      traceStats,
      weakTableSignals: canUseEventlog ? undefined : observations.slice(0, 15).map(item => item.label),
    },
    extractionCandidates: reviewedCandidates,
    candidateReview,
    engineVersion: LOCAL_MINING_ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };

  return { cases, observations, summary, warnings };
}
