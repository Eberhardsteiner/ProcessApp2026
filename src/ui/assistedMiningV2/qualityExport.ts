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
    qualityAssessment: {
      overall: 'high' | 'medium' | 'low';
      dimensions: Array<{
        key:
          | 'documentTypeDetection'
          | 'structureFidelity'
          | 'stepClarity'
          | 'roleQuality'
          | 'systemQuality'
          | 'domainConsistency'
          | 'evidenceCoverage'
          | 'conservativeHandling';
        label: string;
        score: number;
        level: 'high' | 'medium' | 'low';
        reason: string;
      }>;
    };
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

function scoreToLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
  const lastSummary = state.lastDerivationSummary;
  const warnings = lastSummary?.warnings ?? [];
  const stepLabels = lastSummary?.stepLabels ?? [];
  const roles = lastSummary?.roles ?? [];
  const systems = lastSummary?.systems ?? [];
  const docKind = lastSummary?.documentKind ?? 'unknown';
  const confidence = lastSummary?.confidence ?? 'low';
  const evidenceCoverageScore = stepCount > 0 ? evidenceBackedSteps / stepCount : 0;
  const conservativeTriggered = warnings.some(w => /konservative auswertung aktiv|vorläufiger prozessentwurf/i.test(w));

  const dimensionScores: ProcessMiningQualityExportFile['analysisResults']['qualityAssessment']['dimensions'] = [
    {
      key: 'documentTypeDetection',
      label: 'Dokumenttyp-Erkennung',
      score: clamp01(docKind === 'unknown' ? 0.25 : docKind === 'weak-material' ? 0.4 : 0.8),
      level: scoreToLevel(docKind === 'unknown' ? 0.25 : docKind === 'weak-material' ? 0.4 : 0.8),
      reason: `Erkannter Typ: ${docKind}.`,
    },
    {
      key: 'structureFidelity',
      label: 'Strukturtreue',
      score: clamp01(stepLabels.length >= 6 ? 0.85 : stepLabels.length >= 3 ? 0.6 : 0.3),
      level: scoreToLevel(stepLabels.length >= 6 ? 0.85 : stepLabels.length >= 3 ? 0.6 : 0.3),
      reason: `${stepLabels.length} belastbare Schrittlabels in der letzten Ableitung.`,
    },
    {
      key: 'stepClarity',
      label: 'Schrittklarheit',
      score: clamp01(stepLabels.length > 0 ? stepLabels.filter(label => label.trim().length >= 8).length / stepLabels.length : 0),
      level: scoreToLevel(stepLabels.length > 0 ? stepLabels.filter(label => label.trim().length >= 8).length / stepLabels.length : 0),
      reason: 'Bewertung anhand Länge und Nutzbarkeit der Schrittlabels.',
    },
    {
      key: 'roleQuality',
      label: 'Rollenqualität',
      score: clamp01(stepCount > 0 ? roles.length / Math.max(3, stepCount / 2) : 0),
      level: scoreToLevel(stepCount > 0 ? roles.length / Math.max(3, stepCount / 2) : 0),
      reason: `${roles.length} Rollen gegenüber ${stepCount} Schritten.`,
    },
    {
      key: 'systemQuality',
      label: 'Systemqualität',
      score: clamp01(stepCount > 0 ? systems.length / Math.max(2, stepCount / 3) : 0),
      level: scoreToLevel(stepCount > 0 ? systems.length / Math.max(2, stepCount / 3) : 0),
      reason: `${systems.length} Systembezüge erkannt.`,
    },
    {
      key: 'domainConsistency',
      label: 'Domänenkonsistenz',
      score: clamp01(warnings.some(w => /Primärdomäne erkannt/i.test(w)) ? 0.75 : 0.45),
      level: scoreToLevel(warnings.some(w => /Primärdomäne erkannt/i.test(w)) ? 0.75 : 0.45),
      reason: warnings.some(w => /Primärdomäne erkannt/i.test(w) )
        ? 'Domänenkontext wurde erkannt und im Signalpfad berücksichtigt.'
        : 'Keine klare Primärdomäne erkannt; Konsistenz begrenzt.',
    },
    {
      key: 'evidenceCoverage',
      label: 'Evidenzabdeckung',
      score: clamp01(evidenceCoverageScore),
      level: scoreToLevel(evidenceCoverageScore),
      reason: `${evidenceBackedSteps}/${stepCount} Schritte haben Evidenzsnippets.`,
    },
    {
      key: 'conservativeHandling',
      label: 'Vorsicht bei schwachem Material',
      score: clamp01(conservativeTriggered ? 0.9 : confidence === 'low' ? 0.7 : 0.5),
      level: scoreToLevel(conservativeTriggered ? 0.9 : confidence === 'low' ? 0.7 : 0.5),
      reason: conservativeTriggered
        ? 'Konservative Auswertung wurde aktiv markiert.'
        : 'Keine explizite konservative Markierung in den Warnungen.',
    },
  ];
  const avg = dimensionScores.reduce((sum, item) => sum + item.score, 0) / Math.max(dimensionScores.length, 1);
  const overall = scoreToLevel(avg);

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
      qualityAssessment: {
        overall,
        dimensions: dimensionScores,
      },
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
