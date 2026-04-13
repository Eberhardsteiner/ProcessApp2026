import type {
  ExtractionCandidate,
  Process,
  ProcessMiningAssistedV2State,
  ProcessVersion,
  SourceRoutingContext,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { APP_SEMVER, APP_VERSION_LABEL } from '../../config/release';
import type { WorkspaceIntegrityReport } from './workspaceIntegrity';
import { computeMiningReadiness } from './analysisReadiness';
import { computeDataMaturity } from './dataMaturity';
import { buildReviewOverview } from './reviewSuggestions';
import { buildVerifiedAnalysisFacts, normalizeWhitespace, uniqueStrings } from './pmShared';
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
    sourceIdentity?: {
      resolvedTitle: string;
      titleSource: 'process' | 'version' | 'source-label' | 'case-name';
      consistency: 'consistent' | 'adjusted' | 'conflicted';
      runtimeProcessTitle: string;
      versionTitleSnapshot?: string;
      sourceLabel?: string;
      caseNameHints: string[];
      adjustments: string[];
    };
    verifiedAnalysis?: {
      caseCount: number;
      rawCaseRecords: number;
      analysisMode: string;
      verifiedEventlogEligibility: boolean;
      compareCapabilityAllowed: boolean;
      variantsCapabilityAllowed: boolean;
      timingCapabilityAllowed: boolean;
      reconstructedSingleCase: boolean;
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
    tablePipeline?: NonNullable<ProcessMiningAssistedV2State['lastDerivationSummary']>['tablePipeline'];
    routing?: {
      routingClass: string;
      routingConfidence: string;
      routingSignals: string[];
      fallbackReason?: string;
    };
    extractionEvidence?: {
      candidateStats?: NonNullable<ProcessMiningAssistedV2State['lastDerivationSummary']>['candidateStats'];
      rejectedOrSupportCandidates?: Array<{
        candidateType: string;
        normalizedLabel: string;
        status: string;
        evidenceOrigin?: string;
        rejectionReason?: string;
        downgradeReason?: string;
        evidenceAnchor: string;
      }>;
      structuredPreserve?: {
        applied: boolean;
        explicitStructuredStepCount?: number;
        preservedStructuredStepCount?: number;
        structuredSectionFallback?: boolean;
        structuredWholeTextFallback?: boolean;
        structuredTableDetected?: boolean;
        explicitRoleTableDetected?: boolean;
        explicitSystemCount?: number;
        structuredRecallLoss?: boolean;
        finalRoles?: string[];
        finalSystems?: string[];
        explicitRoles?: string[];
        explicitSystems?: string[];
        inferredRoles?: string[];
        inferredSystems?: string[];
        supportOnlyRoles?: string[];
        supportOnlySystems?: string[];
        suppressedRoles?: string[];
        suppressedSystems?: string[];
        preservedSteps: Array<{
          label: string;
          originalStepLabel?: string;
          canonicalStepFamily?: string;
          stepWasPreserved?: boolean;
          mergeSkippedBecauseStructured?: boolean;
          primaryRole?: string;
          primarySystem?: string;
          roles?: string[];
          systems?: string[];
          explicitRoles?: string[];
          explicitSystems?: string[];
          inferredRoles?: string[];
          inferredSystems?: string[];
          supportOnlyRoles?: string[];
          supportOnlySystems?: string[];
          suppressedInferredRoles?: string[];
          suppressedInferredSystems?: string[];
        }>;
      };
    };
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
      scoringProfile?: {
        mode: QualityScoringProfileSnapshot['mode'];
        weights: Record<string, number>;
        evidenceTypes: string[];
        blockerRules: string[];
      };
      scoringReasons?: string[];
      blockerReasons?: string[];
      confidenceAdjustments?: string[];
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
      rawCaseRecords: number;
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

interface ExportIdentity {
  resolvedTitle: string;
  titleSource: 'process' | 'version' | 'source-label' | 'case-name';
  consistency: 'consistent' | 'adjusted' | 'conflicted';
  runtimeProcessTitle: string;
  versionTitleSnapshot?: string;
  sourceLabel?: string;
  caseNameHints: string[];
  adjustments: string[];
}

function getStepObservations(state: ProcessMiningAssistedV2State) {
  return state.observations.filter(observation => observation.kind === 'step');
}

function getIssueCount(state: ProcessMiningAssistedV2State): number {
  return (
    state.lastDerivationSummary?.issueSignals?.length
    ?? state.qualitySummary?.issueObservationCount
    ?? state.observations.filter(observation => observation.kind === 'issue').length
  );
}

function humanizeSourceLabel(value?: string): string | undefined {
  const raw = normalizeWhitespace(value ?? '');
  if (!raw) return undefined;
  const withoutExt = raw.replace(/\.[^.]+$/, '');
  const normalized = withoutExt.replace(/[_]+/g, ' ').replace(/-+/g, ' ').replace(/\s+/g, ' ').trim();
  const fallMatch = normalized.match(/\bfall\s*(\d{1,2})\b/i);
  if (fallMatch) return `Fall ${fallMatch[1].padStart(2, '0')}`;
  return normalized
    .replace(/\banalyse\s+qualitaetscheck\b.*$/i, '')
    .replace(/\bqualitaetspruefung\b.*$/i, '')
    .replace(/\btestfall\b/i, 'Fall')
    .trim() || undefined;
}

function resolveExportIdentity(params: {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
}): ExportIdentity {
  const runtimeTitle = normalizeWhitespace(params.process.title || '');
  const versionTitle = normalizeWhitespace(params.version.titleSnapshot || '');
  const sourceLabel = params.state.lastDerivationSummary?.sourceLabel;
  const sourceTitle = humanizeSourceLabel(sourceLabel);
  const caseNameHints = (params.state.cases ?? [])
    .map(item => normalizeWhitespace(item.name || ''))
    .filter(Boolean)
    .slice(0, 6);
  const normalizedProcess = runtimeTitle.toLowerCase();
  const normalizedVersion = versionTitle.toLowerCase();
  const normalizedSource = (sourceTitle ?? '').toLowerCase();
  const adjustments: string[] = [];

  if (sourceTitle && normalizedSource && normalizedSource !== normalizedProcess && normalizedSource !== normalizedVersion) {
    adjustments.push(`Exporttitel wurde an die analysierte Quelle „${sourceTitle}“ angeglichen.`);
    return {
      resolvedTitle: sourceTitle,
      titleSource: 'source-label',
      consistency: runtimeTitle || versionTitle ? 'adjusted' : 'consistent',
      runtimeProcessTitle: runtimeTitle,
      versionTitleSnapshot: versionTitle || undefined,
      sourceLabel,
      caseNameHints,
      adjustments,
    };
  }

  if (runtimeTitle && versionTitle && normalizedProcess !== normalizedVersion) {
    adjustments.push(`Prozesstitel „${runtimeTitle}“ und Versions-Titel „${versionTitle}“ wichen voneinander ab; Export nutzt den Prozess-Titel.`);
    return {
      resolvedTitle: runtimeTitle,
      titleSource: 'process',
      consistency: 'adjusted',
      runtimeProcessTitle: runtimeTitle,
      versionTitleSnapshot: versionTitle || undefined,
      sourceLabel,
      caseNameHints,
      adjustments,
    };
  }

  if (runtimeTitle) {
    return {
      resolvedTitle: runtimeTitle,
      titleSource: 'process',
      consistency: 'consistent',
      runtimeProcessTitle: runtimeTitle,
      versionTitleSnapshot: versionTitle || undefined,
      sourceLabel,
      caseNameHints,
      adjustments,
    };
  }

  if (versionTitle) {
    return {
      resolvedTitle: versionTitle,
      titleSource: 'version',
      consistency: 'consistent',
      runtimeProcessTitle: runtimeTitle,
      versionTitleSnapshot: versionTitle || undefined,
      sourceLabel,
      caseNameHints,
      adjustments,
    };
  }

  if (sourceTitle) {
    return {
      resolvedTitle: sourceTitle,
      titleSource: 'source-label',
      consistency: 'consistent',
      runtimeProcessTitle: runtimeTitle,
      versionTitleSnapshot: versionTitle || undefined,
      sourceLabel,
      caseNameHints,
      adjustments,
    };
  }

  const caseName = caseNameHints.find(name => !/^fall aus\b/i.test(name) && !/^tabellensignale aus\b/i.test(name));
  return {
    resolvedTitle: caseName || 'Prozess',
    titleSource: caseName ? 'case-name' : 'process',
    consistency: caseName ? 'adjusted' : 'conflicted',
    runtimeProcessTitle: runtimeTitle,
    versionTitleSnapshot: versionTitle || undefined,
    sourceLabel,
    caseNameHints,
    adjustments: caseName ? ['Exporttitel wurde aus der einzigen belastbaren Quellbezeichnung abgeleitet.'] : adjustments,
  };
}

function buildExportIntegrityReport(params: {
  base: WorkspaceIntegrityReport;
  identity: ReturnType<typeof resolveExportIdentity>;
  verifiedCaseCount: number;
  rawCaseCount: number;
  verifiedAnalysisMode: string;
  summaryMode?: string;
  verifiedEventlogEligibility: boolean;
  rawEventlogEligibility?: boolean;
  reconstructedSingleCase: boolean;
}): WorkspaceIntegrityReport {
  const extraIssues = [...params.base.issues];

  params.identity.adjustments.forEach((message, index) => {
    extraIssues.push({ id: `export-title-adjustment-${index + 1}`, level: 'warning', message });
  });

  if (params.verifiedCaseCount !== params.rawCaseCount) {
    extraIssues.push({
      id: 'export-casecount-adjusted',
      level: 'warning',
      message: `Export nutzt ${params.verifiedCaseCount} verifizierte ${params.verifiedCaseCount === 1 ? 'Quelle' : 'Fälle'}, obwohl ${params.rawCaseCount} rohe Case-Objekte im Arbeitsstand vorliegen.`,
    });
  }
  if (params.summaryMode && params.summaryMode !== params.verifiedAnalysisMode) {
    extraIssues.push({
      id: 'export-analysismode-adjusted',
      level: 'warning',
      message: `Analysemodus wurde im Export von „${params.summaryMode}“ auf „${params.verifiedAnalysisMode}“ zurückgebunden, weil nur verifizierte Pipeline-Fakten zählen.`,
    });
  }
  if (params.rawEventlogEligibility && !params.verifiedEventlogEligibility) {
    extraIssues.push({
      id: 'export-eventlog-gate',
      level: 'critical',
      message: 'Eventlog-Eignung wurde im Export gesperrt, weil Case-Anker, Zeitanker oder Aktivitätskanal nicht sauber genug verifiziert sind.',
    });
  }
  if (params.reconstructedSingleCase) {
    extraIssues.push({
      id: 'export-single-case-reconstruction',
      level: 'warning',
      message: 'Eine rekonstruierte Single-Case-Spur bleibt für Export und Readiness defensiv behandelt und aktiviert keine Varianten- oder Timing-Freigaben.',
    });
  }

  const criticalCount = extraIssues.filter(issue => issue.level === 'critical').length;
  const repairedCount = extraIssues.filter(issue => issue.level !== 'critical').length;
  const severity = criticalCount > 0 ? 'critical' : repairedCount > 0 ? 'repaired' : 'healthy';

  return {
    severity,
    headline:
      severity === 'healthy'
        ? 'Arbeitsstand wirkt konsistent.'
        : severity === 'repaired'
        ? 'Export-Metadaten wurden für den operativen Analysezustand harmonisiert.'
        : 'Export und Arbeitsstand enthalten noch kritische Inkonsistenzen.',
    summary:
      severity === 'healthy'
        ? 'Titel, Analysemodus, Case-Zahlen und Capability-Gates passen zu den verifizierten Pipeline-Fakten.'
        : severity === 'repaired'
        ? `${repairedCount} Metadaten- oder Gate-Abweichungen wurden im Export defensiv korrigiert.`
        : `${criticalCount} kritische Export- oder Gate-Abweichungen sollten vor externer Weitergabe geprüft werden.`,
    issues: extraIssues,
    repairedCount,
    criticalCount,
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
  const verifiedFacts = buildVerifiedAnalysisFacts({
    cases: state.cases,
    observations: state.observations,
    lastDerivationSummary: state.lastDerivationSummary,
    qualitySummary: state.qualitySummary,
  });
  const exportIdentity = resolveExportIdentity({ process, version, state });
  const readiness = computeMiningReadiness({ state, version });
  const reviewOverview = buildReviewOverview({ cases: state.cases, observations: state.observations });
  const dataMaturity = computeDataMaturity({
    state,
    version,
    reviewSuggestionCount: reviewOverview.suggestionCount,
  });
  const qualityBundle = buildQualityAssessmentBundle({ state, version });
  const exportIntegrity = buildExportIntegrityReport({
    base: integrity,
    identity: exportIdentity,
    verifiedCaseCount: verifiedFacts.caseCount,
    rawCaseCount: state.cases.length,
    verifiedAnalysisMode: verifiedFacts.analysisMode,
    summaryMode: state.lastDerivationSummary?.analysisMode,
    verifiedEventlogEligibility: verifiedFacts.verifiedEventlogEligibility,
    rawEventlogEligibility: state.lastDerivationSummary?.tablePipeline?.eventlogEligibility.eligible,
    reconstructedSingleCase: verifiedFacts.reconstructedSingleCase,
  });

  const lastSummary = state.lastDerivationSummary;
  const happyPath = version.sidecar.captureDraft?.happyPath ?? [];
  const stepObservations = getStepObservations(state);
  const issueCount = getIssueCount(state);
  const evidenceBackedSteps = state.qualitySummary?.stepObservationsWithEvidence
    ?? stepObservations.filter(step => Boolean(normalizeWhitespace(step.evidenceSnippet ?? ''))).length;
  const roleBackedSteps = state.qualitySummary?.stepObservationsWithRole
    ?? stepObservations.filter(step => Boolean(normalizeWhitespace(step.primaryRole ?? step.role ?? '')) || Boolean(step.roles?.length)).length;
  const systemBackedSteps = state.qualitySummary?.stepObservationsWithSystem
    ?? stepObservations.filter(step => Boolean(normalizeWhitespace(step.primarySystem ?? step.system ?? '')) || Boolean(step.systems?.length)).length;
  const scoringWeights = qualityBundle.scoringProfile.dimensionWeights.reduce<Record<string, number>>((acc, item) => {
    acc[item.key] = item.weight;
    return acc;
  }, {});
  const dimensionRows = qualityBundle.dimensions.map(item => ({
    key: item.key,
    label: item.label,
    score: item.score,
    level: levelFromScore(item.score),
    reason: item.rationale[0] ?? item.summary,
  }));
  const scoringReasons = uniqueStrings([
    ...qualityBundle.scoringProfile.scoringReasons,
    ...qualityBundle.dimensions.flatMap(item => item.scoringReasons ?? []),
  ]).slice(0, 12);
  const blockerReasons = uniqueStrings([
    ...qualityBundle.scoringProfile.blockerReasons,
    ...qualityBundle.dimensions.flatMap(item => item.blockerReasons ?? []),
    ...qualityBundle.blockers,
  ]).slice(0, 12);
  const confidenceAdjustments = uniqueStrings([
    ...qualityBundle.scoringProfile.confidenceAdjustments,
    ...qualityBundle.dimensions.flatMap(item => item.confidenceAdjustments ?? []),
  ]).slice(0, 12);
  const preservedSteps = stepObservations
    .filter(step => Boolean(step.stepWasPreserved || step.originalStepLabel || step.explicitRoles?.length || step.explicitSystems?.length))
    .map(step => ({
      label: step.label,
      originalStepLabel: step.originalStepLabel,
      canonicalStepFamily: step.canonicalStepFamily,
      stepWasPreserved: step.stepWasPreserved,
      mergeSkippedBecauseStructured: step.mergeSkippedBecauseStructured,
      primaryRole: step.primaryRole ?? step.role,
      primarySystem: step.primarySystem ?? step.system,
      roles: step.roles,
      systems: step.systems,
      explicitRoles: step.explicitRoles,
      explicitSystems: step.explicitSystems,
      inferredRoles: step.inferredRoles,
      inferredSystems: step.inferredSystems,
      supportOnlyRoles: step.supportOnlyRoles,
      supportOnlySystems: step.supportOnlySystems,
      suppressedInferredRoles: step.suppressedInferredRoles,
      suppressedInferredSystems: step.suppressedInferredSystems,
    }));
  const explicitStructuredRoles = uniqueStrings([
    ...preservedSteps.flatMap(step => step.explicitRoles ?? []),
    ...(lastSummary?.explicitRoleTableDetected ? (lastSummary.roles ?? []) : []),
  ]);
  const explicitStructuredSystems = uniqueStrings([
    ...preservedSteps.flatMap(step => step.explicitSystems ?? []),
    ...((lastSummary?.explicitSystemCount ?? 0) > 0 ? (lastSummary?.systems ?? []) : []),
  ]);
  const inferredStructuredRoles = uniqueStrings(preservedSteps.flatMap(step => step.inferredRoles ?? []));
  const inferredStructuredSystems = uniqueStrings(preservedSteps.flatMap(step => step.inferredSystems ?? []));
  const supportOnlyStructuredRoles = uniqueStrings(preservedSteps.flatMap(step => step.supportOnlyRoles ?? []));
  const supportOnlyStructuredSystems = uniqueStrings(preservedSteps.flatMap(step => step.supportOnlySystems ?? []));
  const suppressedStructuredRoles = uniqueStrings(preservedSteps.flatMap(step => step.suppressedInferredRoles ?? []));
  const suppressedStructuredSystems = uniqueStrings(preservedSteps.flatMap(step => step.suppressedInferredSystems ?? []));
  const finalStructuredRoles = uniqueStrings(preservedSteps.flatMap(step => step.roles ?? []));
  const finalStructuredSystems = uniqueStrings(preservedSteps.flatMap(step => step.systems ?? []));

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
        title: exportIdentity.resolvedTitle,
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
      sourceRouting: lastSummary?.routingContext
        ? {
            ...lastSummary.routingContext,
            classificationReasons: lastSummary.sourceProfile?.classificationReasons ?? [],
          }
        : undefined,
      sourceIdentity: exportIdentity,
      verifiedAnalysis: {
        caseCount: verifiedFacts.caseCount,
        rawCaseRecords: state.cases.length,
        analysisMode: verifiedFacts.analysisMode,
        verifiedEventlogEligibility: verifiedFacts.verifiedEventlogEligibility,
        compareCapabilityAllowed: verifiedFacts.compareCapabilityAllowed,
        variantsCapabilityAllowed: verifiedFacts.variantsCapabilityAllowed,
        timingCapabilityAllowed: verifiedFacts.timingCapabilityAllowed,
        reconstructedSingleCase: verifiedFacts.reconstructedSingleCase,
      },
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
      recommendedFocus: [...qualityBundle.recommendedFocus, ...readiness.nextActions, ...dataMaturity.actions.map(action => action.label)]
        .filter((value, index, values) => value && values.indexOf(value) === index)
        .slice(0, 8),
      scoringProfile: qualityBundle.scoringProfile,
    },
    qualityControl: {
      integrity: exportIntegrity,
      readiness,
      dataMaturity,
      reviewOverview,
    },
    analysisPositioning: {
      analysisMode: verifiedFacts.analysisMode,
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
      lastDerivationSummary: lastSummary,
      tablePipeline: lastSummary?.tablePipeline,
      routing: lastSummary?.routingContext
        ? {
            routingClass: lastSummary.routingContext.routingClass,
            routingConfidence: lastSummary.routingContext.routingConfidence,
            routingSignals: lastSummary.routingContext.routingSignals,
            fallbackReason: lastSummary.routingContext.fallbackReason,
          }
        : undefined,
      extractionEvidence: lastSummary
        ? {
            candidateStats: lastSummary.candidateStats,
            rejectedOrSupportCandidates: (lastSummary.extractionCandidates ?? [])
              .filter(candidate => candidate.status === 'rejected' || candidate.status === 'support-only')
              .slice(0, 30)
              .map(candidate => ({
                candidateType: candidate.candidateType,
                normalizedLabel: candidate.normalizedLabel,
                status: candidate.status,
                evidenceOrigin: candidate.evidenceOrigin,
                rejectionReason: candidate.rejectionReason,
                downgradeReason: candidate.downgradeReason,
                evidenceAnchor: candidate.evidenceAnchor,
              })),
            structuredPreserve: {
              applied: Boolean(
                lastSummary.structuredPreserveApplied
                ?? (preservedSteps.length > 0 && !lastSummary.structuredRecallLoss),
              ),
              explicitStructuredStepCount: lastSummary.explicitStructuredStepCount,
              preservedStructuredStepCount: lastSummary.preservedStructuredStepCount ?? preservedSteps.length,
              structuredSectionFallback: lastSummary.structuredSectionFallback,
              structuredWholeTextFallback: lastSummary.structuredWholeTextFallback,
              structuredTableDetected: lastSummary.structuredTableDetected,
              explicitRoleTableDetected: lastSummary.explicitRoleTableDetected,
              explicitSystemCount: lastSummary.explicitSystemCount,
              structuredRecallLoss: lastSummary.structuredRecallLoss,
              finalRoles: finalStructuredRoles,
              finalSystems: finalStructuredSystems,
              explicitRoles: explicitStructuredRoles,
              explicitSystems: explicitStructuredSystems,
              inferredRoles: inferredStructuredRoles,
              inferredSystems: inferredStructuredSystems,
              supportOnlyRoles: supportOnlyStructuredRoles,
              supportOnlySystems: supportOnlyStructuredSystems,
              suppressedRoles: suppressedStructuredRoles,
              suppressedSystems: suppressedStructuredSystems,
              preservedSteps,
            },
          }
        : undefined,
      discoverySummary: state.discoverySummary,
      conformanceSummary: state.conformanceSummary,
      enhancementSummary: state.enhancementSummary,
      reportSnapshot: state.reportSnapshot,
      handoverDrafts: state.handoverDrafts,
      qualityAssessment: {
        overall: qualityBundle.overallLevel,
        dimensions: dimensionRows,
        scoringProfile: {
          mode: qualityBundle.scoringProfile.mode,
          weights: scoringWeights,
          evidenceTypes: qualityBundle.scoringProfile.validEvidenceTypes,
          blockerRules: qualityBundle.scoringProfile.blockerRules,
        },
        scoringReasons,
        blockerReasons,
        confidenceAdjustments,
      },
    },
    sourceMaterial: {
      cases: state.cases,
      observations: state.observations,
      supportSignals: lastSummary?.issueEvidence ?? [],
      extractionCandidates: lastSummary?.extractionCandidates ?? [],
      candidateReview: lastSummary?.candidateReview,
      counts: {
        cases: verifiedFacts.caseCount,
        rawCaseRecords: state.cases.length,
        observations: state.observations.length,
        steps: stepObservations.length,
        issues: issueCount,
        realTimeObservations: verifiedFacts.realTimeStepCount,
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
  processTitle?: string;
}): void {
  const content = serializeQualityExportFile(params.file);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFilename(params.file.context.process.title || params.processTitle || 'prozess')}-analyse-qualitaetscheck.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
