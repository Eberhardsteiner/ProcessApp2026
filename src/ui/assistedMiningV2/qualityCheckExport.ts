import type {
  Process,
  ProcessMiningAssistedV2State,
  ProcessVersion,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { APP_RELEASE_TITLE, APP_SEMVER, APP_VERSION_LABEL } from '../../config/release';
import { computeMiningReadiness } from './analysisReadiness';
import { computeDataMaturity } from './dataMaturity';
import { buildCollaborationSummary } from './collaboration';
import { computeGovernanceSummary } from './governance';
import { computeGovernanceWorkflow } from './governanceWorkflow';
import { evaluateIntegrationReadiness } from './integrationReadiness';
import { evaluatePilotReadiness } from './pilotReadiness';
import { evaluateReleaseStability } from './releaseStability';
import { evaluateSecurityReadiness } from './securityReadiness';
import { evaluateAcceptanceReadiness } from './acceptance';
import { buildReviewOverview } from './reviewSuggestions';
import { compareReportToCurrentState } from './reportHistory';
import { uniqueStrings } from './pmShared';

export type QualityCheckOverallStatus = 'stabil' | 'beobachten' | 'kritisch';

export interface QualityCheckExportFile {
  schemaVersion: 'pm-quality-check-export-v1';
  exportedAt: string;
  exportKind: 'manual-quality-check';
  app: {
    versionLabel: string;
    semver: string;
    releaseTitle: string;
  };
  context: {
    exportLabel: string;
    exportNote?: string;
    process: {
      processId: string;
      title: string;
      versionId: string;
      versionLabel?: string;
    };
    workspace: {
      currentStep: ProcessMiningAssistedV2State['currentStep'];
      operatingMode?: ProcessMiningAssistedV2State['operatingMode'];
      updatedAt: string;
      analysisMode?: string;
      analysisModeLabel?: string;
      dataMaturityLevel?: string;
      pilotReadinessLevel?: string;
      releaseReadinessLevel?: string;
    };
    captureReference: {
      trigger?: string;
      customer?: string;
      outcome?: string;
      doneCriteria?: string;
      happyPathStepCount: number;
    };
    sourceCases: Array<{
      id: string;
      name: string;
      inputKind?: string;
      sourceType?: string;
      sourceNote?: string;
      analysisProfileLabel?: string;
      analysisProfileHint?: string;
      derivedStepCount: number;
      derivedStepLabels?: string[];
      strategies?: string[];
      narrativePreview?: string;
    }>;
  };
  scores: {
    overall: number;
    status: QualityCheckOverallStatus;
    sourceBasis: number;
    localAnalysis: number;
    traceability: number;
    releaseReadiness: number;
  };
  interpretation: {
    summary: string;
    strengths: string[];
    cautions: string[];
    nextActions: string[];
    reviewerHints: string[];
  };
  analysis: {
    readiness: ReturnType<typeof computeMiningReadiness>;
    dataMaturity: ReturnType<typeof computeDataMaturity>;
    pilotReadiness: ReturnType<typeof evaluatePilotReadiness>;
    releaseReadiness: ReturnType<typeof evaluateReleaseStability>;
    governanceSummary: ReturnType<typeof computeGovernanceSummary>;
    governanceWorkflow: ReturnType<typeof computeGovernanceWorkflow>;
    collaborationSummary: ReturnType<typeof buildCollaborationSummary>;
    securityReadiness: ReturnType<typeof evaluateSecurityReadiness>;
    integrationReadiness: ReturnType<typeof evaluateIntegrationReadiness>;
    acceptanceReadiness: ReturnType<typeof evaluateAcceptanceReadiness>;
    reportAlignment: ReturnType<typeof compareReportToCurrentState> | null;
    qualitySummary?: ProcessMiningAssistedV2State['qualitySummary'];
    lastDerivationSummary?: ProcessMiningAssistedV2State['lastDerivationSummary'];
    discoverySummary?: ProcessMiningAssistedV2State['discoverySummary'];
    conformanceSummary?: ProcessMiningAssistedV2State['conformanceSummary'];
    enhancementSummary?: ProcessMiningAssistedV2State['enhancementSummary'];
    reportSnapshot?: ProcessMiningAssistedV2State['reportSnapshot'];
    latestBenchmark?: NonNullable<ProcessMiningAssistedV2State['benchmarkSnapshots']>[number];
  };
  workspaceState: ProcessMiningAssistedV2State;
}

function sanitizeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9äöüß_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'quality-check';
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function averageFromWeights(entries: Array<[number, number]>): number {
  const weighted = entries.reduce((sum, [score, weight]) => sum + score * weight, 0);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  return totalWeight > 0 ? weighted / totalWeight : 0;
}

function statusToScore(status: 'good' | 'attention' | 'missing'): number {
  if (status === 'good') return 100;
  if (status === 'attention') return 65;
  return 25;
}

function benchmarkStatusToScore(status?: 'pass' | 'attention' | 'fail'): number {
  if (status === 'pass') return 95;
  if (status === 'attention') return 70;
  if (status === 'fail') return 35;
  return 60;
}


function confidenceToScore(confidence?: 'high' | 'medium' | 'low'): number {
  if (confidence === 'high') return 95;
  if (confidence === 'medium') return 75;
  if (confidence === 'low') return 50;
  return 60;
}

function buildDefaultExportLabel(process: Process, state: ProcessMiningAssistedV2State): string {
  const sourceNames = state.cases.map(item => item.name).filter(Boolean);
  if (sourceNames.length === 0) return `${process.title} · Qualitätscheck`;
  const preview = sourceNames.slice(0, 2).join(' + ');
  const suffix = sourceNames.length > 2 ? ` (+${sourceNames.length - 2})` : '';
  return `${preview}${suffix} · Qualitätscheck`;
}

function buildSourceBasisScore(dataMaturity: ReturnType<typeof computeDataMaturity>): number {
  const itemScore = averageFromWeights(dataMaturity.items.map(item => [statusToScore(item.status), 1]));
  const levelBoost = dataMaturity.level === 'strong' ? 100 : dataMaturity.level === 'solid' ? 88 : dataMaturity.level === 'usable' ? 72 : 48;
  return clampScore(averageFromWeights([
    [itemScore, 0.8],
    [levelBoost, 0.2],
  ]));
}

function buildLocalAnalysisScore(params: {
  state: ProcessMiningAssistedV2State;
  readiness: ReturnType<typeof computeMiningReadiness>;
}): number {
  const { state, readiness } = params;
  const derivation = state.lastDerivationSummary;
  const chainScore = averageFromWeights([
    [state.discoverySummary ? 100 : 35, 1],
    [state.conformanceSummary ? 100 : 35, 1],
    [state.enhancementSummary ? 100 : 35, 1],
  ]);
  const modeScore = readiness.stage === 'mining' ? 100 : readiness.stage === 'comparison' ? 88 : readiness.stage === 'draft' ? 74 : 40;
  const confidenceScore = confidenceToScore(derivation?.confidence);
  const stepCount = state.qualitySummary?.stepObservationCount ?? state.observations.filter(item => item.kind === 'step').length;
  const stepScore = stepCount >= 8 ? 92 : stepCount >= 5 ? 80 : stepCount >= 3 ? 68 : stepCount > 0 ? 52 : 20;
  return clampScore(averageFromWeights([
    [chainScore, 0.35],
    [modeScore, 0.25],
    [confidenceScore, 0.2],
    [stepScore, 0.2],
  ]));
}

function buildTraceabilityScore(params: {
  state: ProcessMiningAssistedV2State;
  reportAlignment: ReturnType<typeof compareReportToCurrentState> | null;
  governanceSummary: ReturnType<typeof computeGovernanceSummary>;
  collaborationSummary: ReturnType<typeof buildCollaborationSummary>;
}): number {
  const { state, reportAlignment, governanceSummary, collaborationSummary } = params;
  const quality = state.qualitySummary;
  const stepCount = quality?.stepObservationCount ?? state.observations.filter(item => item.kind === 'step').length;
  const evidenceCount = quality?.stepObservationsWithEvidence ?? state.observations.filter(item => item.kind === 'step' && Boolean(item.evidenceSnippet?.trim())).length;
  const evidenceScore = stepCount > 0 ? Math.round((evidenceCount / Math.max(stepCount, 1)) * 100) : 25;
  const reportScore = !state.reportSnapshot ? 35 : reportAlignment?.isAligned ? 100 : 65;
  const governanceOpenCount = governanceSummary.checks.filter(item => item.status === 'open').length;
  const governanceScore = governanceSummary.readyForShare ? 92 : governanceOpenCount === 0 ? 72 : 48;
  const collaborationScore = collaborationSummary.auditEntryCount > 0 ? 85 : collaborationSummary.totalCommentCount > 0 ? 70 : 45;
  return clampScore(averageFromWeights([
    [evidenceScore, 0.35],
    [reportScore, 0.25],
    [governanceScore, 0.25],
    [collaborationScore, 0.15],
  ]));
}

function mapOverallStatus(score: number): QualityCheckOverallStatus {
  if (score >= 85) return 'stabil';
  if (score >= 70) return 'beobachten';
  return 'kritisch';
}

function buildSummary(status: QualityCheckOverallStatus, score: number, caseCount: number, stepCount: number): string {
  if (status === 'stabil') {
    return `Der aktuelle Lauf wirkt insgesamt tragfähig: ${caseCount} Quellen, ${stepCount} erkannte Schritte und ein Gesamteindruck von ${score}/100.`;
  }
  if (status === 'beobachten') {
    return `Der aktuelle Lauf ist grundsätzlich brauchbar, sollte aber noch geprüft werden: ${caseCount} Quellen, ${stepCount} erkannte Schritte und ${score}/100.`;
  }
  return `Der aktuelle Lauf bleibt noch kritisch: ${caseCount} Quellen, ${stepCount} erkannte Schritte und nur ${score}/100.`;
}

export function buildQualityCheckExport(params: {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  settings: AppSettings;
  exportLabel?: string;
  exportNote?: string;
}): QualityCheckExportFile {
  const { process, version, state, settings, exportNote } = params;
  const reviewSuggestionCount = buildReviewOverview({ cases: state.cases, observations: state.observations }).suggestionCount;
  const readiness = computeMiningReadiness({ state, version });
  const dataMaturity = computeDataMaturity({ state, version, reviewSuggestionCount });
  const pilotReadiness = evaluatePilotReadiness({ state, version });
  const releaseReadiness = evaluateReleaseStability({ state, version, settings });
  const governanceSummary = computeGovernanceSummary({ state, version });
  const governanceWorkflow = computeGovernanceWorkflow({ state, version });
  const collaborationSummary = buildCollaborationSummary(state);
  const securityReadiness = evaluateSecurityReadiness({ state, version, settings });
  const integrationReadiness = evaluateIntegrationReadiness({ state, version, settings });
  const acceptanceReadiness = evaluateAcceptanceReadiness({ state, version, settings });
  const reportAlignment = state.reportSnapshot ? compareReportToCurrentState(state.reportSnapshot, state) : null;
  const latestBenchmark = state.benchmarkSnapshots?.length ? state.benchmarkSnapshots[state.benchmarkSnapshots.length - 1] : undefined;
  const quality = state.qualitySummary;
  const stepCount = quality?.stepObservationCount ?? state.observations.filter(item => item.kind === 'step').length;
  const exportLabel = params.exportLabel?.trim() || buildDefaultExportLabel(process, state);

  const sourceBasis = buildSourceBasisScore(dataMaturity);
  const localAnalysis = buildLocalAnalysisScore({ state, readiness });
  const traceability = buildTraceabilityScore({ state, reportAlignment, governanceSummary, collaborationSummary });
  const releaseScore = clampScore(averageFromWeights([
    [releaseReadiness.score, 0.55],
    [securityReadiness.score, 0.15],
    [acceptanceReadiness.score, 0.15],
    [benchmarkStatusToScore(latestBenchmark?.status), 0.15],
  ]));
  const overall = clampScore(averageFromWeights([
    [sourceBasis, 0.3],
    [localAnalysis, 0.35],
    [traceability, 0.2],
    [releaseScore, 0.15],
  ]));
  const status = mapOverallStatus(overall);

  const strengths = uniqueStrings([
    ...dataMaturity.strengths,
    ...releaseReadiness.strengths,
    latestBenchmark?.status === 'pass' ? `Letzter Benchmark stabil mit ${latestBenchmark.overallScore}/100.` : undefined,
    state.lastDerivationSummary?.sourceProfile?.inputProfileLabel ? `Materialprofil: ${state.lastDerivationSummary.sourceProfile.inputProfileLabel}.` : undefined,
  ]).slice(0, 8);

  const cautions = uniqueStrings([
    ...readiness.cautionNotes,
    ...releaseReadiness.gates.filter(item => item.status !== 'ready').map(item => `${item.label}: ${item.summary}`),
    ...securityReadiness.items.filter(item => item.status !== 'ready').map(item => `${item.label}: ${item.summary}`),
  ]).slice(0, 8);

  const nextActions = uniqueStrings([
    ...dataMaturity.actions.map(item => item.label),
    ...readiness.nextActions,
    ...releaseReadiness.nextActions,
    ...acceptanceReadiness.nextActions,
  ]).slice(0, 8);

  const reviewerHints = uniqueStrings([
    'Diese Datei beschreibt den aktuellen Lauf eines oder mehrerer Referenzdokumente, nicht den generellen Produktstand der gesamten App.',
    state.cases.length <= 1 ? 'Bei nur einer Quelle die Ergebnisse eher als Prozessentwurf als als belastbares Mining lesen.' : undefined,
    !state.reportSnapshot ? 'Ohne Bericht und Übergaben liegt der Schwerpunkt dieses Exports auf der lokalen Analyse, nicht auf der Weitergabereife.' : undefined,
    governanceWorkflow.stage !== 'approved' ? 'Governance und Freigabe sind noch nicht abgeschlossen; offene Punkte deshalb mitbewerten.' : undefined,
  ]).slice(0, 6);

  return {
    schemaVersion: 'pm-quality-check-export-v1',
    exportedAt: new Date().toISOString(),
    exportKind: 'manual-quality-check',
    app: {
      versionLabel: APP_VERSION_LABEL,
      semver: APP_SEMVER,
      releaseTitle: APP_RELEASE_TITLE,
    },
    context: {
      exportLabel,
      exportNote: exportNote?.trim() || undefined,
      process: {
        processId: process.processId,
        title: process.title,
        versionId: version.versionId,
        versionLabel: version.versionLabel,
      },
      workspace: {
        currentStep: state.currentStep,
        operatingMode: state.operatingMode,
        updatedAt: state.updatedAt,
        analysisMode: state.lastDerivationSummary?.analysisMode,
        analysisModeLabel: readiness.analysisModeLabel,
        dataMaturityLevel: dataMaturity.levelLabel,
        pilotReadinessLevel: pilotReadiness.levelLabel,
        releaseReadinessLevel: releaseReadiness.levelLabel,
      },
      captureReference: {
        trigger: version.endToEndDefinition.trigger || undefined,
        customer: version.endToEndDefinition.customer || undefined,
        outcome: version.endToEndDefinition.outcome || undefined,
        doneCriteria: version.endToEndDefinition.doneCriteria || undefined,
        happyPathStepCount: version.sidecar.captureDraft?.happyPath?.length ?? 0,
      },
      sourceCases: state.cases.map(item => ({
        id: item.id,
        name: item.name,
        inputKind: item.inputKind,
        sourceType: item.sourceType,
        sourceNote: item.sourceNote,
        analysisProfileLabel: item.analysisProfileLabel,
        analysisProfileHint: item.analysisProfileHint,
        derivedStepCount: item.derivedStepLabels?.length ?? 0,
        derivedStepLabels: item.derivedStepLabels,
        strategies: item.analysisStrategies,
        narrativePreview: item.narrative?.slice(0, 240) || undefined,
      })),
    },
    scores: {
      overall,
      status,
      sourceBasis,
      localAnalysis,
      traceability,
      releaseReadiness: releaseScore,
    },
    interpretation: {
      summary: buildSummary(status, overall, state.cases.length, stepCount),
      strengths,
      cautions,
      nextActions,
      reviewerHints,
    },
    analysis: {
      readiness,
      dataMaturity,
      pilotReadiness,
      releaseReadiness,
      governanceSummary,
      governanceWorkflow,
      collaborationSummary,
      securityReadiness,
      integrationReadiness,
      acceptanceReadiness,
      reportAlignment,
      qualitySummary: state.qualitySummary,
      lastDerivationSummary: state.lastDerivationSummary,
      discoverySummary: state.discoverySummary,
      conformanceSummary: state.conformanceSummary,
      enhancementSummary: state.enhancementSummary,
      reportSnapshot: state.reportSnapshot,
      latestBenchmark,
    },
    workspaceState: state,
  };
}

export function serializeQualityCheckExport(payload: QualityCheckExportFile): string {
  return JSON.stringify(payload, null, 2);
}

export function getQualityCheckExportFilename(payload: QualityCheckExportFile): string {
  return `${sanitizeFilename(payload.context.exportLabel)}.pm-quality-check.json`;
}

export function downloadQualityCheckExport(payload: QualityCheckExportFile): void {
  const content = serializeQualityCheckExport(payload);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = getQualityCheckExportFilename(payload);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
