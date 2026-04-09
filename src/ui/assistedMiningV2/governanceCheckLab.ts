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
import { computeGovernanceInsights } from './governanceInsights';
import { createGovernanceSnapshot } from './governanceWorkflow';

export interface GovernanceCheckResult {
  key: string;
  label: string;
  score: number;
  headline: string;
  status: 'pass' | 'attention' | 'fail';
  activeDecisionCount: number;
  overdueDecisionCount: number;
  missingOwnerCount: number;
  summary: string;
}

export interface GovernanceCheckSuiteResult {
  engineVersion: string;
  computedAt: string;
  headline: string;
  summary: string;
  averageScore: number;
  passedCount: number;
  attentionCount: number;
  failedCount: number;
  results: GovernanceCheckResult[];
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
    processId: `gov-${key}`,
    projectId: 'governance-check',
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
    id: `gov-version-${params.key}`,
    processId: params.processId,
    versionId: `gov-version-${params.key}`,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    titleSnapshot: 'Governance-Check',
    versionLabel: 'Governance-Check',
    endToEndDefinition: {
      trigger: 'Governance-Check starten',
      customer: 'Intern',
      outcome: 'Governance-Reife bewertet',
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

function scoreToStatus(score: number): GovernanceCheckResult['status'] {
  if (score >= 80) return 'pass';
  if (score >= 60) return 'attention';
  return 'fail';
}

export function runGovernanceCheckSuite(): GovernanceCheckSuiteResult {
  const now = new Date();
  const scenarios = [
    (() => {
      const { process, version, state } = buildBaseState('complaints');
      state.governance = {
        decisions: [
          {
            id: crypto.randomUUID(),
            title: 'Freigabepfad für Kulanz mit Vertrieb abstimmen',
            status: 'in_review',
            owner: 'Teamleitung Service',
            dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().slice(0, 10),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          {
            id: crypto.randomUUID(),
            title: 'Offene Pflichtdaten im Bericht kennzeichnen',
            status: 'open',
            owner: 'Qualitätsmanagement',
            dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString().slice(0, 10),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
        teamPlan: {
          coordinator: 'Julia Neumann',
          reviewers: ['Qualitätsmanagement', 'Vertrieb'],
          nextReviewAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString().slice(0, 10),
          reviewStartedAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          reviewTemplateKey: 'team-review',
        },
      };
      state.governance.history = [createGovernanceSnapshot({ state, version, label: 'Review gestartet' })];
      return { key: 'complaints', label: 'Review läuft geordnet', process, version, state };
    })(),
    (() => {
      const { process, version, state } = buildBaseState('procurement');
      state.governance = {
        decisions: [
          {
            id: crypto.randomUUID(),
            title: 'Pilot-Weitergabe freigeben',
            status: 'approved',
            owner: 'Leitung Einkauf',
            dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
        teamPlan: {
          coordinator: 'Leitung Einkauf',
          reviewers: ['Controlling', 'Prozessmanagement'],
          nextReviewAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString().slice(0, 10),
          reviewStartedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          reviewTemplateKey: 'management-approval',
        },
      };
      const readySnapshot = createGovernanceSnapshot({ state, version, label: 'Freigabebereit' });
      state.governance.history = [readySnapshot];
      state.governance.approval = {
        status: 'approved',
        approvedBy: 'Leitung Einkauf',
        approvedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        note: 'Freigabe für Pilot-Weitergabe gesetzt.',
        basisFingerprint: readySnapshot.basisFingerprint,
      };
      return { key: 'procurement', label: 'Freigabe frisch bestätigt', process, version, state };
    })(),
    (() => {
      const { process, version, state } = buildBaseState('onboarding');
      state.governance = {
        decisions: [
          {
            id: crypto.randomUUID(),
            title: 'Offene Berechtigungsfrage klären',
            status: 'open',
            owner: 'HR',
            dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString().slice(0, 10),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          {
            id: crypto.randomUUID(),
            title: 'Review mit IT und HR schließen',
            status: 'in_review',
            owner: 'IT',
            dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString().slice(0, 10),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
        teamPlan: {
          coordinator: 'HR',
          reviewers: ['IT'],
          nextReviewAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().slice(0, 10),
          reviewStartedAt: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString(),
          reviewTemplateKey: 'pilot-release',
        },
        approval: {
          status: 'approved',
          approvedBy: 'HR',
          approvedAt: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString(),
          note: 'Frühere Freigabe',
          basisFingerprint: 'stale-basis-fingerprint',
        },
      };
      state.governance.history = [createGovernanceSnapshot({ state, version, label: 'Frühere Freigabe' })];
      return { key: 'onboarding', label: 'Freigabe neu prüfen', process, version, state };
    })(),
  ];

  const results: GovernanceCheckResult[] = scenarios.map(entry => {
    const insights = computeGovernanceInsights({ state: entry.state, version: entry.version });
    return {
      key: entry.key,
      label: entry.label,
      score: insights.score,
      headline: insights.headline,
      status: scoreToStatus(insights.score),
      activeDecisionCount: insights.activeDecisionCount,
      overdueDecisionCount: insights.overdueDecisionCount,
      missingOwnerCount: insights.missingOwnerCount,
      summary: insights.nextAction,
    };
  });

  const averageScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1));
  const passedCount = results.filter(item => item.status === 'pass').length;
  const attentionCount = results.filter(item => item.status === 'attention').length;
  const failedCount = results.filter(item => item.status === 'fail').length;

  return {
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · governance assist`,
    computedAt: new Date().toISOString(),
    headline:
      failedCount > 0
        ? 'Governance-Auswertung zeigt noch klare Lücken in mindestens einem Prüfszenario.'
        : attentionCount > 0
        ? 'Governance-Auswertung wirkt tragfähig, hat aber noch sichtbare Beobachtungspunkte.'
        : 'Governance-Auswertung wirkt stabil und nachvollziehbar.',
    summary: `${results.length} Szenarien geprüft · Durchschnitt ${averageScore}/100 · ${passedCount} stabil · ${attentionCount} beobachten · ${failedCount} kritisch.`,
    averageScore,
    passedCount,
    attentionCount,
    failedCount,
    results,
  };
}
