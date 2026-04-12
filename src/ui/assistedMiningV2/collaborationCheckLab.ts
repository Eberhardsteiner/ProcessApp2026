import type {
  Process,
  ProcessMiningAssistedV2State,
  ProcessMiningConformanceSummary,
  ProcessMiningDiscoverySummary,
  ProcessMiningEnhancementSummary,
  ProcessVersion,
} from '../../domain/process';
import { createInitialCaptureProgress } from '../../domain/capture';
import { createInitialBpmnModelRef } from '../../domain/bpmn';
import { computeQualitySummary } from './narrativeParsing';
import { buildSampleScenario } from './sampleCases';
import { computeV2Discovery } from './discovery';
import { computeV2Conformance } from './conformance';
import { computeV2Enhancement } from './enhancement';
import { buildProcessMiningReport } from './reporting';
import { LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';
import { createEmptyV2State } from './storage';
import { appendAuditForComment, buildCollaborationSummary, createComment, noteCollaborationEvent, upsertComment } from './collaboration';

export interface CollaborationCheckResult {
  key: string;
  label: string;
  score: number;
  status: 'pass' | 'attention' | 'fail';
  summary: string;
  openCommentCount: number;
  auditEntryCount: number;
}

export interface CollaborationCheckSuiteResult {
  engineVersion: string;
  computedAt: string;
  headline: string;
  summary: string;
  averageScore: number;
  passedCount: number;
  attentionCount: number;
  failedCount: number;
  results: CollaborationCheckResult[];
}

function buildDiscoverySummary(result: ReturnType<typeof computeV2Discovery>): ProcessMiningDiscoverySummary {
  return {
    caseCount: result.totalCases,
    variantCount: result.variants.length,
    mainVariantShare: result.coreProcessCaseCoverage,
    topSteps: result.coreProcess,
    analysisMode: result.analysisMode,
    sampleNotice: result.sampleNotice,
    notes: '',
    updatedAt: result.computedAt,
  };
}

function buildConformanceSummary(result: ReturnType<typeof computeV2Conformance>): ProcessMiningConformanceSummary {
  return {
    checkedSteps: result.targetSteps.length,
    deviationCount: result.topDeviations.length,
    deviationNotes: result.topDeviations.map(item => item.description),
    analysisMode: result.analysisMode,
    sampleNotice: result.sampleNotice,
    notes: '',
    updatedAt: result.computedAt,
  };
}

function mapHotspotKind(kind: ReturnType<typeof computeV2Enhancement>['hotspots'][number]['kind'], headline: string): 'timing' | 'rework' | 'handoff' | 'missing' | 'other' {
  if (kind === 'timing') return 'timing';
  if (kind === 'rework') return 'rework';
  if (kind === 'handoff') return 'handoff';
  if (kind === 'exception' && /fehl|mindestdaten|pflichtangaben|information/i.test(headline)) return 'missing';
  return 'other';
}

function buildEnhancementSummary(result: ReturnType<typeof computeV2Enhancement>): ProcessMiningEnhancementSummary {
  return {
    issueCount: result.hotspots.length,
    issues: result.hotspots.map(hotspot => ({
      title: hotspot.headline,
      description: hotspot.detail,
      kind: mapHotspotKind(hotspot.kind, hotspot.headline),
    })),
    analysisMode: result.analysisMode,
    sampleNotice: result.sampleNotice,
    notes: '',
    updatedAt: result.computedAt,
  };
}

function buildSyntheticProcess(key: string, label: string): Process {
  const now = new Date().toISOString();
  return {
    processId: `collab-${key}`,
    projectId: 'collaboration-check',
    title: label,
    category: 'kern',
    managementLevel: 'fachlich',
    hierarchyLevel: 'hauptprozess',
    parentProcessId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildSyntheticVersion(params: { key: string; processId: string; discoverySummary: ProcessMiningDiscoverySummary }): ProcessVersion {
  const now = new Date().toISOString();
  return {
    id: `collab-version-${params.key}`,
    processId: params.processId,
    versionId: `collab-version-${params.key}`,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    titleSnapshot: 'Collaboration-Check',
    versionLabel: 'Collaboration-Check',
    endToEndDefinition: {
      trigger: 'Collaboration-Check starten',
      customer: 'Intern',
      outcome: 'Zusammenarbeit bewertet',
    },
    bpmn: createInitialBpmnModelRef(),
    sidecar: {
      roles: [],
      systems: [],
      dataObjects: [],
      kpis: [],
      improvementBacklog: [],
      evidenceSources: [],
      aiImportNotes: [],
      captureDraft: {
        draftVersion: 'capture-draft-v1',
        happyPath: params.discoverySummary.topSteps.slice(0, 6).map((label, index) => ({
          stepId: `hp-${params.key}-${index + 1}`,
          order: index + 1,
          label,
        })),
        decisions: [],
        exceptions: [],
      },
    },
    quality: {
      syntaxFindings: [],
      semanticQuestions: [],
      namingFindings: [],
    },
    captureProgress: createInitialCaptureProgress(),
  };
}

function buildBaseState(key: Parameters<typeof buildSampleScenario>[0]) {
  const scenario = buildSampleScenario(key);
  const qualitySummary = computeQualitySummary(scenario.cases, scenario.observations);
  const discovery = computeV2Discovery({
    cases: scenario.cases,
    observations: scenario.observations,
    lastDerivationSummary: scenario.summary,
  });
  const discoverySummary = buildDiscoverySummary(discovery);
  const process = buildSyntheticProcess(key, scenario.summary.sourceLabel ?? key);
  const version = buildSyntheticVersion({ key, processId: process.processId, discoverySummary });
  const conformance = computeV2Conformance({
    cases: scenario.cases,
    observations: scenario.observations,
    captureHappyPath: version.sidecar.captureDraft?.happyPath,
    coreProcess: discovery.coreProcess,
    lastDerivationSummary: scenario.summary,
  });
  const enhancement = computeV2Enhancement({
    cases: scenario.cases,
    observations: scenario.observations,
    lastDerivationSummary: scenario.summary,
  });
  const state: ProcessMiningAssistedV2State = {
    ...createEmptyV2State(),
    currentStep: 'augmentation',
    cases: scenario.cases,
    observations: scenario.observations,
    qualitySummary,
    lastDerivationSummary: scenario.summary,
    discoverySummary,
    conformanceSummary: buildConformanceSummary(conformance),
    enhancementSummary: buildEnhancementSummary(enhancement),
    updatedAt: new Date().toISOString(),
  };
  const report = buildProcessMiningReport({ process, version, state });
  state.reportSnapshot = report.snapshot;
  state.handoverDrafts = report.handovers;
  return { process, version, state };
}

function scoreToStatus(score: number): CollaborationCheckResult['status'] {
  if (score >= 80) return 'pass';
  if (score >= 60) return 'attention';
  return 'fail';
}

export function runCollaborationCheckSuite(): CollaborationCheckSuiteResult {
  const scenarios = [
    (() => {
      const { state } = buildBaseState('complaints');
      const comment = createComment({
        targetType: 'step',
        targetRef: state.discoverySummary?.topSteps[0],
        targetLabel: state.discoverySummary?.topSteps[0] ?? 'Kernschritt',
        author: 'Julia Neumann',
        text: 'Hier bitte im Team noch einmal prüfen, ob die Freigabegrenze sauber dokumentiert ist.',
        nextAction: 'Im nächsten Review mit Vertrieb abstimmen.',
      });
      let collaboration = upsertComment(state.collaboration, comment);
      collaboration = appendAuditForComment(collaboration, {
        action: 'comment-added',
        comment,
        actor: 'Julia Neumann',
      });
      collaboration = noteCollaborationEvent(collaboration, {
        action: 'report-generated',
        actor: 'Julia Neumann',
        targetType: 'report',
        targetLabel: state.reportSnapshot?.title ?? 'Bericht',
        detail: 'Bericht wurde für das Team-Review erzeugt.',
      });
      state.collaboration = collaboration;
      return { key: 'complaints', label: 'Kommentar plus Berichtsspur', state };
    })(),
    (() => {
      const { state } = buildBaseState('procurement');
      const comment = createComment({
        targetType: 'governance',
        targetLabel: 'Governance-Stand',
        author: 'Leitung Einkauf',
        text: 'Review ist dokumentiert, aber der Freigabeweg braucht noch einen Owner.',
      });
      let collaboration = upsertComment(state.collaboration, comment);
      collaboration = appendAuditForComment(collaboration, {
        action: 'comment-added',
        comment,
        actor: 'Leitung Einkauf',
      });
      state.collaboration = collaboration;
      return { key: 'procurement', label: 'Kommentar ohne Folge-Audit', state };
    })(),
    (() => {
      const { state } = buildBaseState('service');
      state.collaboration = createEmptyV2State().collaboration;
      return { key: 'service', label: 'Noch keine Zusammenarbeit', state };
    })(),
  ];

  const results = scenarios.map(item => {
    const summary = buildCollaborationSummary(item.state);
    let score = 100;
    if (summary.totalCommentCount === 0 && summary.auditEntryCount === 0) {
      score = 68;
    } else {
      if (summary.totalCommentCount === 0) score -= 18;
      if (summary.auditEntryCount === 0) score -= 17;
      if (summary.actorCount === 0) score -= 5;
      if (summary.latestAuditHeadline.includes('Noch keine')) score -= 5;
    }
    if (summary.openCommentCount > 2) score -= 10;
    score = Math.max(0, Math.min(100, score));
    return {
      key: item.key,
      label: item.label,
      score,
      status: scoreToStatus(score),
      summary:
        summary.totalCommentCount === 0
          ? 'Noch keine Team-Kommentare oder Auditspur dokumentiert.'
          : `${summary.totalCommentCount} Kommentare · ${summary.auditEntryCount} Audit-Einträge · ${summary.actorCount} beteiligte Personen`,
      openCommentCount: summary.openCommentCount,
      auditEntryCount: summary.auditEntryCount,
    } satisfies CollaborationCheckResult;
  });

  const averageScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1));
  const passedCount = results.filter(item => item.status === 'pass').length;
  const attentionCount = results.filter(item => item.status === 'attention').length;
  const failedCount = results.filter(item => item.status === 'fail').length;
  const headline =
    failedCount > 0
      ? 'Zusammenarbeit und Auditspur haben noch klare Lücken.'
      : attentionCount > 0
      ? 'Zusammenarbeit wirkt brauchbar, sollte aber noch konsequenter genutzt werden.'
      : 'Zusammenarbeit und Auditspur wirken tragfähig.';
  const summary = `${results.length} Szenarien geprüft · ${passedCount} stabil · ${attentionCount} beobachten · ${failedCount} kritisch.`;

  return {
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · collaboration-check`,
    computedAt: new Date().toISOString(),
    headline,
    summary,
    averageScore,
    passedCount,
    attentionCount,
    failedCount,
    results,
  };
}
