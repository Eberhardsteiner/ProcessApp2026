import type {
  ProcessMiningAssistedV2State,
  ProcessMiningObservationCase as ObservationCase,
  ProcessMiningObservation as Observation,
  ProcessMiningAssistedV2Step,
} from '../../domain/process';
import { computeQualitySummary } from './narrativeParsing';

export type WorkspaceIntegritySeverity = 'healthy' | 'repaired' | 'critical';

export interface WorkspaceIntegrityIssue {
  id: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
}

export interface WorkspaceIntegrityReport {
  severity: WorkspaceIntegritySeverity;
  headline: string;
  summary: string;
  issues: WorkspaceIntegrityIssue[];
  repairedCount: number;
  criticalCount: number;
}

const VALID_STEPS = new Set<ProcessMiningAssistedV2Step>([
  'observations',
  'discovery',
  'conformance',
  'enhancement',
  'augmentation',
]);
const VALID_OBSERVATION_KINDS = new Set<Observation['kind']>(['step', 'variant', 'timing', 'role', 'issue', 'other']);
const VALID_TIMESTAMP_QUALITIES = new Set<Observation['timestampQuality']>(['real', 'synthetic', 'missing']);
const VALID_OPERATING_MODES = new Set<NonNullable<ProcessMiningAssistedV2State['operatingMode']>>(['quick-check', 'standard', 'pilot']);

function createBareState(): ProcessMiningAssistedV2State {
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
    acceptance: { checklist: {}, history: [] },
    updatedAt: new Date().toISOString(),
  };
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function safeIso(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return fallback;
}

function safeDateOnly(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

function dedupeById<T extends { id?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const id = typeof item.id === 'string' ? item.id : '';
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function sanitizeCases(rawCases: unknown, issues: WorkspaceIntegrityIssue[]): ObservationCase[] {
  const now = new Date().toISOString();
  if (!Array.isArray(rawCases)) {
    return [];
  }

  const sanitized = rawCases
    .map((item, index): ObservationCase | null => {
      if (!item || typeof item !== 'object') {
        issues.push({
          id: `cases-invalid-${index}`,
          level: 'warning',
          message: 'Mindestens ein Fall war beschädigt und wurde beim Laden übersprungen.',
        });
        return null;
      }
      const candidate = item as Partial<ObservationCase>;
      const id = optionalString(candidate.id);
      const name = optionalString(candidate.name);
      if (!id || !name) {
        issues.push({
          id: `cases-missing-${index}`,
          level: 'warning',
          message: 'Ein Fall ohne stabile ID oder Bezeichnung wurde verworfen.',
        });
        return null;
      }
      return {
        id,
        name,
        caseRef: optionalString(candidate.caseRef),
        narrative: safeString(candidate.narrative, safeString(candidate.rawText, '')),
        rawText: optionalString(candidate.rawText),
        inputKind: candidate.inputKind,
        sourceType: candidate.sourceType,
        dateHints: optionalString(candidate.dateHints),
        sourceNote: optionalString(candidate.sourceNote),
        derivedStepLabels: Array.isArray(candidate.derivedStepLabels)
          ? candidate.derivedStepLabels.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          : undefined,
        analysisProfileLabel: optionalString(candidate.analysisProfileLabel),
        analysisProfileHint: optionalString(candidate.analysisProfileHint),
        analysisStrategies: Array.isArray(candidate.analysisStrategies)
          ? candidate.analysisStrategies.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          : undefined,
        createdAt: safeIso(candidate.createdAt, now),
        updatedAt: safeIso(candidate.updatedAt, now),
      };
    })
    .filter((item): item is ObservationCase => Boolean(item));

  const unique = dedupeById(sanitized);
  if (unique.length !== sanitized.length) {
    issues.push({
      id: 'cases-duplicate',
      level: 'info',
      message: 'Doppelte Fälle wurden beim Laden automatisch zusammengeführt.',
    });
  }
  return unique;
}

function sanitizeObservations(rawObservations: unknown, validCaseIds: Set<string>, issues: WorkspaceIntegrityIssue[]): Observation[] {
  const now = new Date().toISOString();
  if (!Array.isArray(rawObservations)) {
    return [];
  }

  const sanitized = rawObservations
    .map((item, index): Observation | null => {
      if (!item || typeof item !== 'object') {
        issues.push({
          id: `obs-invalid-${index}`,
          level: 'warning',
          message: 'Mindestens ein erkannter Eintrag war beschädigt und wurde verworfen.',
        });
        return null;
      }
      const candidate = item as Partial<Observation>;
      const id = optionalString(candidate.id);
      const label = optionalString(candidate.label);
      if (!id || !label) {
        issues.push({
          id: `obs-missing-${index}`,
          level: 'warning',
          message: 'Ein erkannter Eintrag ohne stabile ID oder Bezeichnung wurde verworfen.',
        });
        return null;
      }
      const sourceCaseId = optionalString(candidate.sourceCaseId);
      const caseRef = sourceCaseId && validCaseIds.has(sourceCaseId) ? sourceCaseId : undefined;
      if (sourceCaseId && !caseRef) {
        issues.push({
          id: `obs-orphan-${id}`,
          level: 'info',
          message: 'Ein erkannter Schritt war keiner vorhandenen Quelle mehr zugeordnet und wurde als allgemeiner Hinweis weitergeführt.',
        });
      }
      return {
        id,
        sourceCaseId: caseRef,
        label,
        evidenceSnippet: optionalString(candidate.evidenceSnippet),
        role: optionalString(candidate.role),
        system: optionalString(candidate.system),
        kind: VALID_OBSERVATION_KINDS.has(candidate.kind as Observation['kind']) ? (candidate.kind as Observation['kind']) : 'other',
        sequenceIndex: Number.isFinite(candidate.sequenceIndex) ? Math.max(0, Math.trunc(candidate.sequenceIndex as number)) : index,
        timestampRaw: optionalString(candidate.timestampRaw),
        timestampIso: optionalString(candidate.timestampIso),
        timestampQuality: VALID_TIMESTAMP_QUALITIES.has(candidate.timestampQuality as Observation['timestampQuality'])
          ? (candidate.timestampQuality as Observation['timestampQuality'])
          : 'missing',
        createdAt: safeIso(candidate.createdAt, now),
      };
    })
    .filter((item): item is Observation => Boolean(item));

  const unique = dedupeById(sanitized);
  if (unique.length !== sanitized.length) {
    issues.push({
      id: 'obs-duplicate',
      level: 'info',
      message: 'Doppelte erkannte Einträge wurden beim Laden automatisch bereinigt.',
    });
  }

  const bucketCounter = new Map<string, number>();
  return unique
    .sort((a, b) => {
      const caseA = a.sourceCaseId ?? '';
      const caseB = b.sourceCaseId ?? '';
      if (caseA !== caseB) return caseA.localeCompare(caseB, 'de');
      if (a.sequenceIndex !== b.sequenceIndex) return a.sequenceIndex - b.sequenceIndex;
      return a.createdAt.localeCompare(b.createdAt, 'de');
    })
    .map(item => {
      const bucket = item.sourceCaseId ?? '_global';
      const nextIndex = bucketCounter.get(bucket) ?? 0;
      bucketCounter.set(bucket, nextIndex + 1);
      return { ...item, sequenceIndex: nextIndex };
    });
}

function needsStepFallback(state: ProcessMiningAssistedV2State): boolean {
  const stepCount = state.observations.filter(item => item.kind === 'step').length;
  return stepCount === 0;
}

function buildReport(issues: WorkspaceIntegrityIssue[]): WorkspaceIntegrityReport {
  const criticalCount = issues.filter(issue => issue.level === 'critical').length;
  const repairedCount = issues.filter(issue => issue.level !== 'critical').length;
  const severity: WorkspaceIntegritySeverity = criticalCount > 0 ? 'critical' : repairedCount > 0 ? 'repaired' : 'healthy';

  const headline =
    severity === 'healthy'
      ? 'Arbeitsstand wirkt konsistent.'
      : severity === 'repaired'
      ? 'Arbeitsstand wurde beim Laden automatisch stabilisiert.'
      : 'Arbeitsstand hat noch kritische Brüche.';

  const summary =
    severity === 'healthy'
      ? 'Die wichtigsten Kernobjekte, Folgeartefakte und Qualitätsangaben passen aktuell sauber zusammen.'
      : severity === 'repaired'
      ? `${repairedCount} kleinere Brüche wurden automatisch repariert, damit die Hauptpfade stabil bleiben.`
      : `${criticalCount} kritische Punkte sollten vor dem Weiterarbeiten bewusst geprüft werden.`;

  return {
    severity,
    headline,
    summary,
    issues,
    repairedCount,
    criticalCount,
  };
}

export function hardenWorkspaceState(input: unknown): { state: ProcessMiningAssistedV2State; report: WorkspaceIntegrityReport } {
  const empty = createBareState();
  const candidate = input && typeof input === 'object' ? (input as Partial<ProcessMiningAssistedV2State>) : {};
  const issues: WorkspaceIntegrityIssue[] = [];
  const now = new Date().toISOString();

  const currentStep = VALID_STEPS.has(candidate.currentStep as ProcessMiningAssistedV2Step)
    ? (candidate.currentStep as ProcessMiningAssistedV2Step)
    : 'observations';
  if (candidate.currentStep && currentStep !== candidate.currentStep) {
    issues.push({
      id: 'step-reset',
      level: 'info',
      message: 'Ein ungültiger Arbeitsschritt wurde auf „Prozess auswerten“ zurückgesetzt.',
    });
  }

  const cases = sanitizeCases(candidate.cases, issues);
  const caseIds = new Set(cases.map(item => item.id));
  const observations = sanitizeObservations(candidate.observations, caseIds, issues);
  const qualitySummary = computeQualitySummary(cases, observations);

  const next: ProcessMiningAssistedV2State = {
    ...empty,
    ...candidate,
    schemaVersion: 'process-mining-assisted-v2',
    currentStep,
    operatingMode: VALID_OPERATING_MODES.has(candidate.operatingMode as NonNullable<ProcessMiningAssistedV2State['operatingMode']>)
      ? candidate.operatingMode
      : 'standard',
    cases,
    observations,
    qualitySummary,
    reportHistory: Array.isArray(candidate.reportHistory) ? candidate.reportHistory.filter(Boolean) : [],
    benchmarkSnapshots: Array.isArray(candidate.benchmarkSnapshots) ? candidate.benchmarkSnapshots.filter(Boolean) : [],
    handoverDrafts: Array.isArray(candidate.handoverDrafts) && candidate.handoverDrafts.length > 0 ? candidate.handoverDrafts.filter(Boolean) : undefined,
    updatedAt: safeIso(candidate.updatedAt, now),
    reviewState: {
      normalizationRules: Array.isArray(candidate.reviewState?.normalizationRules)
        ? dedupeById(candidate.reviewState.normalizationRules.filter(Boolean))
        : [],
      repairJournal: Array.isArray(candidate.reviewState?.repairJournal)
        ? dedupeById(candidate.reviewState.repairJournal.filter(Boolean))
        : [],
    },
    governance: {
      decisions: Array.isArray(candidate.governance?.decisions)
        ? dedupeById(candidate.governance.decisions.filter(Boolean)).map(decision => ({
            ...decision,
            owner: optionalString(decision.owner),
            dueDate: safeDateOnly(decision.dueDate),
            createdAt: safeIso(decision.createdAt, now),
            updatedAt: safeIso(decision.updatedAt, now),
          }))
        : [],
      teamPlan: candidate.governance?.teamPlan && typeof candidate.governance.teamPlan === 'object'
        ? {
            ...candidate.governance.teamPlan,
            nextReviewAt: safeDateOnly(candidate.governance.teamPlan.nextReviewAt),
            reviewStartedAt: candidate.governance.teamPlan.reviewStartedAt ? safeIso(candidate.governance.teamPlan.reviewStartedAt, now) : undefined,
          }
        : {},
      approval: candidate.governance?.approval && typeof candidate.governance.approval === 'object'
        ? {
            ...candidate.governance.approval,
            approvedAt: candidate.governance.approval.approvedAt ? safeIso(candidate.governance.approval.approvedAt, now) : undefined,
          }
        : undefined,
      history: Array.isArray(candidate.governance?.history)
        ? dedupeById(candidate.governance.history.filter(Boolean)).map(entry => ({
            ...entry,
            capturedAt: safeIso(entry.capturedAt, now),
          }))
        : [],
    },
    collaboration: candidate.collaboration && typeof candidate.collaboration === 'object'
      ? {
          lastActor: optionalString(candidate.collaboration.lastActor),
          comments: Array.isArray(candidate.collaboration.comments)
            ? dedupeById(candidate.collaboration.comments.filter(Boolean)).map(comment => ({
                ...comment,
                targetRef: optionalString(comment.targetRef),
                author: optionalString(comment.author),
                nextAction: optionalString(comment.nextAction),
                text: safeString(comment.text),
                targetLabel: safeString(comment.targetLabel, 'Allgemeiner Kommentar'),
                status: (comment.status === 'resolved' ? 'resolved' : comment.status === 'in_review' ? 'in_review' : 'open') as 'open' | 'in_review' | 'resolved',
                createdAt: safeIso(comment.createdAt, now),
                updatedAt: safeIso(comment.updatedAt, now),
              })).filter(comment => comment.text.trim().length > 0)
            : [],
          auditTrail: Array.isArray(candidate.collaboration.auditTrail)
            ? dedupeById(candidate.collaboration.auditTrail.filter(Boolean)).map(entry => ({
                ...entry,
                actor: optionalString(entry.actor),
                detail: optionalString(entry.detail),
                targetLabel: safeString(entry.targetLabel, 'Arbeitsstand'),
                createdAt: safeIso(entry.createdAt, now),
              }))
            : [],
        }
      : { comments: [], auditTrail: [] },
    pilotToolkit: candidate.pilotToolkit && typeof candidate.pilotToolkit === 'object'
      ? {
          ...candidate.pilotToolkit,
          plannedAt: safeDateOnly(candidate.pilotToolkit.plannedAt),
          lastExportedAt: candidate.pilotToolkit.lastExportedAt ? safeIso(candidate.pilotToolkit.lastExportedAt, now) : undefined,
        }
      : {},
    connectorToolkit: candidate.connectorToolkit && typeof candidate.connectorToolkit === 'object'
      ? {
          ...candidate.connectorToolkit,
          lastExportedAt: candidate.connectorToolkit.lastExportedAt ? safeIso(candidate.connectorToolkit.lastExportedAt, now) : undefined,
          lastReceiptAt: candidate.connectorToolkit.lastReceiptAt ? safeIso(candidate.connectorToolkit.lastReceiptAt, now) : undefined,
          history: Array.isArray(candidate.connectorToolkit.history)
            ? dedupeById(candidate.connectorToolkit.history.filter(Boolean)).map(entry => ({
                ...entry,
                exportedAt: safeIso(entry.exportedAt, now),
              }))
            : [],
          contractHistory: Array.isArray(candidate.connectorToolkit.contractHistory)
            ? dedupeById(candidate.connectorToolkit.contractHistory.filter(Boolean)).map(entry => ({
                ...entry,
                builtAt: safeIso(entry.builtAt, now),
                missingRequiredFields: Array.isArray(entry.missingRequiredFields)
                  ? entry.missingRequiredFields.filter(Boolean).map((item: unknown) => safeString(item, 'Pflichtfeld'))
                  : [],
                completenessScore: Number.isFinite(entry.completenessScore) ? Math.max(0, Math.min(100, Number(entry.completenessScore))) : 0,
              }))
            : [],
          receipts: Array.isArray(candidate.connectorToolkit.receipts)
            ? dedupeById(candidate.connectorToolkit.receipts.filter(Boolean)).map(entry => ({
                ...entry,
                importedAt: safeIso(entry.importedAt, now),
                status:
                  entry.status === 'accepted' || entry.status === 'queued' || entry.status === 'rejected' || entry.status === 'completed'
                    ? entry.status
                    : 'queued',
                source: entry.source === 'file' ? 'file' : 'paste',
                externalRef: optionalString(entry.externalRef),
                endpoint: optionalString(entry.endpoint),
                note: optionalString(entry.note),
                basisFingerprint: optionalString(entry.basisFingerprint),
              }))
            : [],
        }
      : { history: [], contractHistory: [], receipts: [] },
    acceptance: candidate.acceptance && typeof candidate.acceptance === 'object'
      ? {
          ...candidate.acceptance,
          decidedBy: optionalString(candidate.acceptance.decidedBy),
          decidedAt: candidate.acceptance.decidedAt ? safeIso(candidate.acceptance.decidedAt, now) : undefined,
          scope: optionalString(candidate.acceptance.scope),
          targetWindow: optionalString(candidate.acceptance.targetWindow),
          successCriteria: optionalString(candidate.acceptance.successCriteria),
          knownRisks: optionalString(candidate.acceptance.knownRisks),
          trainingNote: optionalString(candidate.acceptance.trainingNote),
          note: optionalString(candidate.acceptance.note),
          lastExportedAt: candidate.acceptance.lastExportedAt ? safeIso(candidate.acceptance.lastExportedAt, now) : undefined,
          checklist: candidate.acceptance.checklist && typeof candidate.acceptance.checklist === 'object'
            ? {
                benchmarkReviewed: Boolean(candidate.acceptance.checklist.benchmarkReviewed),
                reportReviewed: Boolean(candidate.acceptance.checklist.reportReviewed),
                governanceReviewed: Boolean(candidate.acceptance.checklist.governanceReviewed),
                securityReviewed: Boolean(candidate.acceptance.checklist.securityReviewed),
                pilotPrepared: Boolean(candidate.acceptance.checklist.pilotPrepared),
                enablementPrepared: Boolean(candidate.acceptance.checklist.enablementPrepared),
              }
            : {},
          history: Array.isArray(candidate.acceptance.history)
            ? dedupeById(candidate.acceptance.history.filter(Boolean)).map(entry => ({
                ...entry,
                createdAt: safeIso(entry.createdAt, now),
                basisFingerprint: optionalString(entry.basisFingerprint),
                decidedBy: optionalString(entry.decidedBy),
              }))
            : [],
        }
      : { checklist: {}, history: [] },
  };

  if (needsStepFallback(next)) {
    if (next.discoverySummary || next.conformanceSummary || next.enhancementSummary || next.reportSnapshot || next.handoverDrafts?.length) {
      issues.push({
        id: 'downstream-cleared-no-steps',
        level: 'warning',
        message: 'Analysen, Bericht und Übergaben wurden geleert, weil keine tragfähigen Prozessschritte mehr vorlagen.',
      });
    }
    next.discoverySummary = undefined;
    next.conformanceSummary = undefined;
    next.enhancementSummary = undefined;
    next.reportSnapshot = undefined;
    next.handoverDrafts = undefined;
    next.aiRefinement = undefined;
    if (next.currentStep !== 'observations') {
      next.currentStep = 'observations';
      issues.push({
        id: 'flow-reset-no-steps',
        level: 'info',
        message: 'Der Arbeitsfluss wurde auf den ersten Schritt zurückgesetzt, weil aktuell keine tragfähigen Prozessschritte vorliegen.',
      });
    }
  }

  if (next.reportSnapshot && (!next.discoverySummary && !next.conformanceSummary && !next.enhancementSummary)) {
    next.reportSnapshot = undefined;
    next.handoverDrafts = undefined;
    issues.push({
      id: 'report-cleared-stale',
      level: 'warning',
      message: 'Ein veralteter Bericht ohne passende Analysebasis wurde entfernt.',
    });
  }

  if (next.handoverDrafts?.length && !next.reportSnapshot) {
    next.handoverDrafts = undefined;
    issues.push({
      id: 'handover-cleared-orphan',
      level: 'info',
      message: 'Übergabetexte ohne Berichtsbasis wurden verworfen, damit keine veralteten Aussagen stehen bleiben.',
    });
  }

  const report = buildReport(issues);
  return { state: next, report };
}
