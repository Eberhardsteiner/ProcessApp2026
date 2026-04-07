import type { Process, ProcessVersion, ProcessMiningAssistedV2State } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { APP_SEMVER, APP_VERSION_LABEL } from '../../config/release';
import type { WorkspaceIntegrityReport } from './workspaceIntegrity';
import { computeMiningReadiness } from './analysisReadiness';
import { computeDataMaturity } from './dataMaturity';
import { buildReviewOverview } from './reviewSuggestions';
import { evaluateReleaseStability } from './releaseStability';
import { computeGovernanceSummary } from './governance';
import { computeGovernanceWorkflow } from './governanceWorkflow';
import { buildCollaborationSummary } from './collaboration';
import { evaluatePilotReadiness } from './pilotReadiness';
import { evaluateIntegrationReadiness } from './integrationReadiness';
import { evaluateSecurityReadiness } from './securityReadiness';
import { evaluateAcceptanceReadiness } from './acceptance';

export interface ProcessMiningQualityExportFile {
  schemaVersion: 'pm-analysis-quality-export-v1';
  exportedAt: string;
  appVersion: string;
  purpose: string;
  note: string;
  context: {
    process: {
      processId: string;
      title: string;
      versionId: string;
      versionLabel?: string;
      status: string;
      updatedAt: string;
    };
    currentStep: ProcessMiningAssistedV2State['currentStep'];
    operatingMode?: ProcessMiningAssistedV2State['operatingMode'];
    settings: Record<string, unknown>;
    comparisonBasis: {
      happyPathStepLabels: string[];
      trigger?: string;
      customer?: string;
      outcome?: string;
      doneCriteria?: string;
    };
  };
  qualityControlDefinition: Array<{
    key: string;
    label: string;
    checks: string[];
  }>;
  qualityControl: {
    integrity: WorkspaceIntegrityReport;
    readiness: ReturnType<typeof computeMiningReadiness>;
    dataMaturity: ReturnType<typeof computeDataMaturity>;
    reviewOverview: ReturnType<typeof buildReviewOverview>;
    releaseReadiness: ReturnType<typeof evaluateReleaseStability>;
    governanceSummary: ReturnType<typeof computeGovernanceSummary> | null;
    governanceWorkflow: ReturnType<typeof computeGovernanceWorkflow> | null;
    collaborationSummary: ReturnType<typeof buildCollaborationSummary>;
    pilotReadiness: ReturnType<typeof evaluatePilotReadiness>;
    integrationReadiness: ReturnType<typeof evaluateIntegrationReadiness>;
    securityReadiness: ReturnType<typeof evaluateSecurityReadiness>;
    acceptanceReadiness: ReturnType<typeof evaluateAcceptanceReadiness>;
  };
  analysisResults: {
    qualitySummary?: ProcessMiningAssistedV2State['qualitySummary'];
    lastDerivationSummary?: ProcessMiningAssistedV2State['lastDerivationSummary'];
    discoverySummary?: ProcessMiningAssistedV2State['discoverySummary'];
    conformanceSummary?: ProcessMiningAssistedV2State['conformanceSummary'];
    enhancementSummary?: ProcessMiningAssistedV2State['enhancementSummary'];
    reportSnapshot?: ProcessMiningAssistedV2State['reportSnapshot'];
    handoverDrafts?: ProcessMiningAssistedV2State['handoverDrafts'];
  };
  sourceMaterial: {
    cases: ProcessMiningAssistedV2State['cases'];
    observations: ProcessMiningAssistedV2State['observations'];
    counts: {
      cases: number;
      observations: number;
      steps: number;
      issues: number;
      realTimeObservations: number;
      evidenceBackedSteps: number;
    };
  };
  workspaceArtifacts: {
    governance?: ProcessMiningAssistedV2State['governance'];
    collaboration?: ProcessMiningAssistedV2State['collaboration'];
    pilotToolkit?: ProcessMiningAssistedV2State['pilotToolkit'];
    connectorToolkit?: ProcessMiningAssistedV2State['connectorToolkit'];
    security?: ProcessMiningAssistedV2State['security'];
    acceptance?: ProcessMiningAssistedV2State['acceptance'];
    augmentationNotes?: ProcessMiningAssistedV2State['augmentationNotes'];
  };
  rawWorkspaceState: ProcessMiningAssistedV2State;
}

function sanitizeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9äöüß_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'pm-qualitaetscheck';
}

function buildSafeSettings(settings: AppSettings): Record<string, unknown> {
  return {
    dataHandlingMode: settings.dataHandlingMode,
    uiMode: settings.uiMode,
    transcription: {
      providerId: settings.transcription.providerId,
      language: settings.transcription.language,
    },
    translation: {
      providerId: settings.translation.providerId,
      targetLanguage: settings.translation.targetLanguage,
    },
    ai: {
      mode: settings.ai.mode,
      api: {
        endpointConfigured: Boolean(settings.ai.api.endpointUrl.trim()),
        endpointUrl: settings.ai.api.endpointUrl.trim() || undefined,
        authMode: settings.ai.api.authMode,
        timeoutMs: settings.ai.api.timeoutMs,
      },
    },
    processMining: {
      externalizeEvents: settings.processMining.externalizeEvents,
      externalizeThreshold: settings.processMining.externalizeThreshold,
    },
  };
}

export function buildQualityExportFile(params: {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  settings: AppSettings;
  integrity: WorkspaceIntegrityReport;
}): ProcessMiningQualityExportFile {
  const { process, version, state, settings, integrity } = params;
  const reviewOverview = buildReviewOverview({ cases: state.cases, observations: state.observations });
  const readiness = computeMiningReadiness({ state, version });
  const dataMaturity = computeDataMaturity({ state, version, reviewSuggestionCount: reviewOverview.suggestionCount });
  const releaseReadiness = evaluateReleaseStability({ state, version, settings });
  const governanceSummary = computeGovernanceSummary({ state, version });
  const governanceWorkflow = computeGovernanceWorkflow({ state, version });
  const collaborationSummary = buildCollaborationSummary(state);
  const pilotReadiness = evaluatePilotReadiness({ state, version });
  const integrationReadiness = evaluateIntegrationReadiness({ state, version, settings });
  const securityReadiness = evaluateSecurityReadiness({ state, version, settings });
  const acceptanceReadiness = evaluateAcceptanceReadiness({ version, state, settings });
  const happyPath = version.sidecar.captureDraft?.happyPath ?? [];
  const stepCount = state.observations.filter(item => item.kind === 'step').length;
  const issueCount = state.observations.filter(item => item.kind === 'issue').length;
  const realTimeCount = state.observations.filter(item => item.timestampQuality === 'real').length;
  const evidenceBackedSteps = state.observations.filter(item => item.kind === 'step' && Boolean(item.evidenceSnippet?.trim())).length;

  return {
    schemaVersion: 'pm-analysis-quality-export-v1',
    exportedAt: new Date().toISOString(),
    appVersion: `${APP_VERSION_LABEL} (${APP_SEMVER})`,
    purpose: 'Dieser Export beschreibt ausschließlich den aktuellen Analysezustand des Materials, das in der App ausgewertet wurde.',
    note: 'Keine eingebauten Referenzfälle, keine automatische Testbibliothek. Gedacht für externe Qualitätsbewertung zusammen mit den separat geprüften Beispieldokumenten.',
    context: {
      process: {
        processId: process.processId,
        title: process.title,
        versionId: version.versionId,
        versionLabel: version.versionLabel,
        status: version.status,
        updatedAt: version.updatedAt,
      },
      currentStep: state.currentStep,
      operatingMode: state.operatingMode,
      settings: buildSafeSettings(settings),
      comparisonBasis: {
        happyPathStepLabels: happyPath.map(step => step.label),
        trigger: version.endToEndDefinition.trigger,
        customer: version.endToEndDefinition.customer,
        outcome: version.endToEndDefinition.outcome,
        doneCriteria: version.endToEndDefinition.doneCriteria,
      },
    },
    qualityControlDefinition: [
      {
        key: 'integrity',
        label: 'Arbeitsstand und Konsistenz',
        checks: [
          'Ist der PM-Arbeitsstand technisch konsistent?',
          'Gibt es Reparaturen, Warnungen oder kritische Brüche?',
        ],
      },
      {
        key: 'analysis',
        label: 'Lokale Analysequalität',
        checks: [
          'Wie tragfähig sind Quellen, Schritte, Evidenz und Reihenfolge?',
          'Wie lesbar und vorsichtig sind Discovery, Soll-Abgleich und Verbesserungsanalyse?',
        ],
      },
      {
        key: 'handover',
        label: 'Weitergabe und Betriebsreife',
        checks: [
          'Wie tragfähig sind Bericht, Governance, Sicherheit, Pilot- und Connector-Stand?',
          'Ist der Stand eher intern nutzbar, review-reif oder freigabefähig?',
        ],
      },
    ],
    qualityControl: {
      integrity,
      readiness,
      dataMaturity,
      reviewOverview,
      releaseReadiness,
      governanceSummary,
      governanceWorkflow,
      collaborationSummary,
      pilotReadiness,
      integrationReadiness,
      securityReadiness,
      acceptanceReadiness,
    },
    analysisResults: {
      qualitySummary: state.qualitySummary,
      lastDerivationSummary: state.lastDerivationSummary,
      discoverySummary: state.discoverySummary,
      conformanceSummary: state.conformanceSummary,
      enhancementSummary: state.enhancementSummary,
      reportSnapshot: state.reportSnapshot,
      handoverDrafts: state.handoverDrafts,
    },
    sourceMaterial: {
      cases: state.cases,
      observations: state.observations,
      counts: {
        cases: state.cases.length,
        observations: state.observations.length,
        steps: stepCount,
        issues: issueCount,
        realTimeObservations: realTimeCount,
        evidenceBackedSteps,
      },
    },
    workspaceArtifacts: {
      governance: state.governance,
      collaboration: state.collaboration,
      pilotToolkit: state.pilotToolkit,
      connectorToolkit: state.connectorToolkit,
      security: state.security,
      acceptance: state.acceptance,
      augmentationNotes: state.augmentationNotes,
    },
    rawWorkspaceState: state,
  };
}

export function serializeQualityExportFile(value: ProcessMiningQualityExportFile): string {
  return JSON.stringify(value, null, 2);
}

export function downloadQualityExportFile(value: ProcessMiningQualityExportFile): void {
  const content = serializeQualityExportFile(value);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFilename(value.context.process.title)}-analyse-qualitaetscheck.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
