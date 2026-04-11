import type {
  ExtractionCandidate,
  Process,
  ProcessMiningAssistedV2State,
  ProcessMiningObservation,
  ProcessVersion,
  SourceRoutingContext,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { APP_SEMVER, APP_VERSION_LABEL } from '../../config/release';
import type { WorkspaceIntegrityReport } from './workspaceIntegrity';
import { computeMiningReadiness } from './analysisReadiness';
import { computeDataMaturity } from './dataMaturity';
import { buildReviewOverview } from './reviewSuggestions';
import { normalizeWhitespace } from './pmShared';
import {
  buildQualityAssessmentBundle,
  levelFromScore,
  type QualityDimensionAssessment,
  type QualityDimensionKey,
  type QualityDimensionStatus,
  type QualityScoringProfileSnapshot,
} from './qualityScoring';

export interface ProcessMiningQualityExportFile {
  schemaVersion: 'pm-analysis-quality-export-v2';
  exportedAt: string;
  appVersion: string;
  purpose: string;
  note: string;
  assessmentGuide: {
    intent: string;
    evaluationOrder: string[];
    statusScale: Array<{ status: QualityDimensionStatus; meaning: string }>;
    interpretationHints: string[];
  };
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
    sourceRouting?: SourceRoutingContext & {
      classificationReasons?: string[];
    };
  };
  qualityControlDefinition: Array<{
    key: string;
    label: string;
    checks: string[];
  }>;
  qualityAssessment: {
    overallScore: number;
    overallStatus: QualityDimensionStatus;
    overallSummary: string;
    dimensions: QualityDimensionAssessment[];
    strengths: string[];
    watchpoints: string[];
    blockers: string[];
    recommendedFocus: string[];
    scoringProfile: QualityScoringProfileSnapshot;
  };
  qualityControl: {
    integrity: WorkspaceIntegrityReport;
    readiness: ReturnType<typeof computeMiningReadiness>;
    dataMaturity: ReturnType<typeof computeDataMaturity>;
    reviewOverview: ReturnType<typeof buildReviewOverview>;
  };
  analysisPositioning: {
    analysisMode: string;
    nominalClaimStrength: string;
    claimStrength: string;
    claimCalibration: {
      fit: string;
      reason: string;
    };
    nominalClaimNote: string;
    claimNote: string;
    percentageGuidance: string;
    conformanceGuidance: string;
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
        key: QualityDimensionKey;
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
    supportSignals: Array<{ label: string; snippet: string }>;
    extractionCandidates: ExtractionCandidate[];
    candidateReview?: NonNullable<ProcessMiningAssistedV2State['lastDerivationSummary']>['candidateReview'];
    counts: {
      cases: number;
      observations: number;
      steps: number;
      issues: number;
      realTimeObservations: number;
      evidenceBackedSteps: number;
      roleBackedSteps: number;
      systemBackedSteps: number;
    };
  };
  workspaceArtifacts: {
    augmentationNotes?: ProcessMiningAssistedV2State['augmentationNotes'];
  };
  rawWorkspaceState: ProcessMiningAssistedV2State;
}

function sanitizeFilename(value: string): string {
  const base = normalizeWhitespace(value || 'prozess');
  const ascii = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
  return ascii.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'prozess';
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
        authMode: settings.ai.api.authMode,
        timeoutMs: settings.ai.api.timeoutMs,
        endpointConfigured: Boolean(normalizeWhitespace(settings.ai.api.endpointUrl)),
        apiKeyConfigured: Boolean(normalizeWhitespace(settings.ai.api.apiKey)),
      },
    },
    processMining: {
      externalizeEvents: settings.processMining.externalizeEvents,
      externalizeThreshold: settings.processMining.externalizeThreshold,
    },
  };
}

function getStepObservations(state: ProcessMiningAssistedV2State): ProcessMiningObservation[] {
  return state.observations.filter(observation => observation.kind === 'step');
}

function getIssueCount(state: ProcessMiningAssistedV2State): number {
  return (
    state.lastDerivationSummary?.issueSignals?.length ??
    state.qualitySummary?.issueObservationCount ??
    state.observations.filter(observation => observation.kind === 'issue').length
  );
}

export function buildQualityExportFile(params: {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  settings: AppSettings;
  integrity: WorkspaceIntegrityReport;
}): ProcessMiningQualityExportFile {
  const { process, version, state, settings, integrity } = params;
  const readiness = computeMiningReadiness({ state, version });
  const reviewOverview = buildReviewOverview({ cases: state.cases, observations: state.observations });
  const dataMaturity = computeDataMaturity({
    state,
    version,
    reviewSuggestionCount: reviewOverview.suggestionCount,
  });
  const qualityBundle = buildQualityAssessmentBundle({ state, version });

  const happyPath = version.sidecar.captureDraft?.happyPath ?? [];
  const stepObservations = getStepObservations(state);
  const issueCount = getIssueCount(state);
  const evidenceBackedSteps =
    state.qualitySummary?.stepObservationsWithEvidence ??
    stepObservations.filter(step => Boolean(normalizeWhitespace(step.evidenceSnippet ?? ''))).length;
  const roleBackedSteps =
    state.qualitySummary?.stepObservationsWithRole ??
    stepObservations.filter(step => Boolean(normalizeWhitespace(step.role ?? ''))).length;
  const systemBackedSteps =
    state.qualitySummary?.stepObservationsWithSystem ??
    stepObservations.filter(step => Boolean(normalizeWhitespace(step.system ?? ''))).length;
  const realTimeObservations =
    state.qualitySummary?.observationsWithRealTime ??
    state.observations.filter(observation => observation.timestampQuality === 'real').length;

  return {
    schemaVersion: 'pm-analysis-quality-export-v2',
    exportedAt: new Date().toISOString(),
    appVersion: `${APP_VERSION_LABEL} (${APP_SEMVER})`,
    purpose: 'Dieser Export beschreibt ausschließlich den aktuellen operativen Analysezustand des ausgewerteten Materials.',
    note: 'Keine QA-, Benchmark-, Sample- oder Referenzlogik ist Bestandteil dieses Exportpfads. Das JSON dient als externes Bewertungsartefakt für genau diesen Analysezustand.',
    assessmentGuide: {
      intent: 'Der Export bewertet den aktuellen Analysezustand modusabhängig und evidenznah statt mit pauschalen Dokumentmaßstäben.',
      evaluationOrder: [
        'Zuerst qualityAssessment.scoringProfile lesen, um den aktiven Bewertungsmodus zu verstehen.',
        'Danach overallScore, overallStatus und blockers prüfen.',
        'Anschließend die einzelnen Dimensionen mit interpretation, rationale und observed lesen.',
      ],
      statusScale: [
        { status: 'strong', meaning: 'tragfähiger und konsistenter Analysezustand' },
        { status: 'usable', meaning: 'brauchbar, aber mit klar benennbaren Lücken' },
        { status: 'watch', meaning: 'bewertbar, jedoch vorsichtig zu lesen' },
        { status: 'critical', meaning: 'in Kerndimensionen kritisch eingeschränkt' },
      ],
      interpretationHints: [
        'Schrittklarheit bewertet semantische Brauchbarkeit und keine bloße Glätte von Labels.',
        'Evidenzabdeckung wird je nach Prozessentwurf, Fallvergleich oder Tabellenmodus anders gerechnet.',
        'Vorsicht bei schwachem Material ist ein Qualitätsmerkmal, wenn die App Claims sichtbar zurücknimmt.',
      ],
    },
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
      sourceRouting: state.lastDerivationSummary?.routingContext
        ? {
            ...state.lastDerivationSummary.routingContext,
            classificationReasons: state.lastDerivationSummary.sourceProfile?.classificationReasons ?? [],
          }
        : undefined,
    },
    qualityControlDefinition: [
      {
        key: 'mode-aware-scoring',
        label: 'Modusabhängige Qualitätsbewertung',
        checks: [
          'Passt das Bewertungsprofil zum realen Analysemodus und Routingkontext?',
          'Sind Gewichte, Evidenzarten und Blockerregeln für diesen Modus plausibel?',
        ],
      },
      {
        key: 'evidence-and-claim-fit',
        label: 'Evidenzlage und Claim-Stärke',
        checks: [
          'Trägt die Evidenz den aktuell erlaubten Claim wirklich?',
          'Wird schwaches Material defensiv und starkes Material nicht unnötig klein gerechnet?',
        ],
      },
      {
        key: 'operational-quality',
        label: 'Operative Brauchbarkeit',
        checks: [
          'Sind Schritte semantisch brauchbar statt nur schön benannt?',
          'Bleiben Tabellen- und weak-raw-table-Fälle frei von dokumentzentrierten Fehlmaßstäben?',
        ],
      },
    ],
    qualityAssessment: {
      overallScore: qualityBundle.overallScore,
      overallStatus: qualityBundle.overallStatus,
      overallSummary: qualityBundle.overallSummary,
      dimensions: qualityBundle.dimensions,
      strengths: qualityBundle.strengths,
      watchpoints: qualityBundle.watchpoints,
      blockers: qualityBundle.blockers,
      recommendedFocus: [...qualityBundle.recommendedFocus, ...readiness.nextActions, ...dataMaturity.actions.map(action => action.label)].filter(
        (value, index, values) => value && values.indexOf(value) === index,
      ).slice(0, 8),
      scoringProfile: qualityBundle.scoringProfile,
    },
    qualityControl: {
      integrity,
      readiness,
      dataMaturity,
      reviewOverview,
    },
    analysisPositioning: {
      analysisMode: qualityBundle.analysisMode,
      nominalClaimStrength: qualityBundle.nominalClaimStrength,
      claimStrength: qualityBundle.claimStrength,
      claimCalibration: {
        fit: qualityBundle.claimCalibration.fit,
        reason: qualityBundle.claimCalibration.reason,
      },
      nominalClaimNote: qualityBundle.nominalClaimNote,
      claimNote: qualityBundle.claimNote,
      percentageGuidance:
        qualityBundle.claimStrength === 'strong-mining'
          ? 'Prozent- und Mengenangaben sind mit dieser Basis belastbarer, bleiben aber an Mapping- und Trace-Qualität gekoppelt.'
          : 'Prozent- und Mengenangaben sollten als vorsichtige Richtungssignale gelesen werden.',
      conformanceGuidance:
        qualityBundle.scoringProfile.mode === 'eventlog-table'
          ? 'Konformitäts- und Ablaufaussagen dürfen sich auf echte Eventstruktur, Zeilenanker und Spurenkohärenz stützen.'
          : happyPath.length > 0
          ? 'Soll-Ist-Aussagen können sich auf den gepflegten Happy Path stützen, bleiben aber modusabhängig zu lesen.'
          : 'Soll-Ist-Aussagen beruhen derzeit auf lokal abgeleiteter Vergleichsbasis und sollten entsprechend vorsichtig gelesen werden.',
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
        overall: qualityBundle.overallLevel,
        dimensions: qualityBundle.dimensions.map(item => ({
          key: item.key,
          label: item.label,
          score: item.score,
          level: levelFromScore(item.score),
          reason: item.rationale[0] ?? item.summary,
        })),
      },
    },
    sourceMaterial: {
      cases: state.cases,
      observations: state.observations,
      supportSignals: state.lastDerivationSummary?.issueEvidence ?? [],
      extractionCandidates: state.lastDerivationSummary?.extractionCandidates ?? [],
      candidateReview: state.lastDerivationSummary?.candidateReview,
      counts: {
        cases: state.cases.length,
        observations: state.observations.length,
        steps: stepObservations.length,
        issues: issueCount,
        realTimeObservations,
        evidenceBackedSteps,
        roleBackedSteps,
        systemBackedSteps,
      },
    },
    workspaceArtifacts: {
      augmentationNotes: state.augmentationNotes,
    },
    rawWorkspaceState: state,
  };
}

export function serializeQualityExportFile(value: ProcessMiningQualityExportFile): string {
  return JSON.stringify(value, null, 2);
}

export function downloadQualityExportFile(params: {
  file: ProcessMiningQualityExportFile;
  processTitle: string;
}): void {
  const content = serializeQualityExportFile(params.file);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFilename(params.processTitle)}-analyse-qualitaetscheck.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
