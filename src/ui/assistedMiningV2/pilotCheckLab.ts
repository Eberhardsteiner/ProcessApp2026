import type {
  Process,
  ProcessMiningAssistedV2State,
  ProcessMiningConformanceSummary,
  ProcessMiningDiscoverySummary,
  ProcessMiningEnhancementSummary,
  ProcessVersion,
} from '../../domain/process';
import { computeQualitySummary } from './narrativeParsing';
import { buildSampleScenario, getSampleScenarios } from './sampleCases';
import { computeV2Discovery } from './discovery';
import { computeV2Conformance } from './conformance';
import { computeV2Enhancement } from './enhancement';
import { buildProcessMiningReport } from './reporting';
import { evaluatePilotReadiness } from './pilotReadiness';
import { buildWorkspaceSnapshot, parseWorkspaceSnapshotText, serializeWorkspaceSnapshot } from './workspaceSnapshot';
import { LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';
import { createEmptyV2State } from './storage';

export interface PilotCheckResult {
  key: string;
  label: string;
  readinessLabel: string;
  score: number;
  stepCount: number;
  caseCount: number;
  reportReady: boolean;
  handovers: number;
  roundtripStable: boolean;
  status: 'pass' | 'attention' | 'fail';
}

export interface PilotCheckSuiteResult {
  engineVersion: string;
  computedAt: string;
  passedCount: number;
  attentionCount: number;
  failedCount: number;
  headline: string;
  summary: string;
  results: PilotCheckResult[];
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
    processId: `pilot-${key}`,
    projectId: 'pilot-check',
    title: label,
    category: 'kern',
    managementLevel: 'fachlich',
    hierarchyLevel: 'hauptprozess',
    parentProcessId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildSyntheticVersion(params: {
  key: string;
  processId: string;
  discoverySummary: ProcessMiningDiscoverySummary;
}): ProcessVersion {
  const now = new Date().toISOString();
  return {
    id: `pilot-version-${params.key}`,
    processId: params.processId,
    versionId: `pilot-version-${params.key}`,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    titleSnapshot: 'Pilot-Check',
    versionLabel: 'Pilot-Check',
    sidecar: {
      roles: [],
      systems: [],
      dataObjects: [],
      kpis: [],
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
  };
}

function buildStateForScenario(key: string) {
  const scenario = buildSampleScenario(key as Parameters<typeof buildSampleScenario>[0]);
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

export function runPilotCheckSuite(): PilotCheckSuiteResult {
  const scenarios = getSampleScenarios();
  const results: PilotCheckResult[] = scenarios.map(scenario => {
    const { process, version, state } = buildStateForScenario(scenario.key);
    const readiness = evaluatePilotReadiness({ state, version });
    const snapshot = buildWorkspaceSnapshot({ process, version, state, readiness });
    const roundtrip = parseWorkspaceSnapshotText(serializeWorkspaceSnapshot(snapshot));
    const roundtripStable =
      roundtrip.state.cases.length === state.cases.length &&
      roundtrip.state.observations.length === state.observations.length &&
      Boolean(roundtrip.state.reportSnapshot?.executiveSummary);
    const score = readiness.score;
    const status: PilotCheckResult['status'] = score >= 80 ? 'pass' : score >= 60 ? 'attention' : 'fail';

    return {
      key: scenario.key,
      label: scenario.label,
      readinessLabel: readiness.levelLabel,
      score,
      stepCount: state.qualitySummary?.stepObservationCount ?? 0,
      caseCount: state.qualitySummary?.totalCases ?? state.cases.length,
      reportReady: Boolean(state.reportSnapshot),
      handovers: state.handoverDrafts?.length ?? 0,
      roundtripStable,
      status,
    };
  });

  const passedCount = results.filter(item => item.status === 'pass').length;
  const attentionCount = results.filter(item => item.status === 'attention').length;
  const failedCount = results.filter(item => item.status === 'fail').length;
  const avgScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1));

  return {
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · pilot hardening`,
    computedAt: new Date().toISOString(),
    passedCount,
    attentionCount,
    failedCount,
    headline: failedCount > 0 ? 'Pilot-Check hat kritische Punkte gefunden.' : attentionCount > 0 ? 'Pilot-Check ist stabil, aber noch beobachtenswert.' : 'Pilot-Check wirkt stabil.',
    summary: `${results.length} Beispielpakete geprüft · Durchschnitt ${avgScore}/100 · ${passedCount} stabil, ${attentionCount} beobachten, ${failedCount} kritisch.`,
    results,
  };
}
