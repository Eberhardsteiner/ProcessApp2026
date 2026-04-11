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
import {
  buildAnalysisClaimNote,
  detectProcessMiningAnalysisMode,
  getAnalysisClaimStrength,
  normalizeWhitespace,
  uniqueStrings,
} from './pmShared';

export type QualityDimensionKey =
  | 'documentTypeRecognition'
  | 'structureFidelity'
  | 'stepClarity'
  | 'roleQuality'
  | 'systemQuality'
  | 'domainConsistency'
  | 'evidenceCoverage'
  | 'cautionWithWeakMaterial';

export type QualityDimensionStatus = 'strong' | 'usable' | 'watch' | 'critical';

export interface QualityDimensionAssessment {
  key: QualityDimensionKey;
  label: string;
  score: number;
  status: QualityDimensionStatus;
  summary: string;
  rationale: string[];
  observed: Record<string, unknown>;
}

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
  };
  qualityControl: {
    integrity: WorkspaceIntegrityReport;
    readiness: ReturnType<typeof computeMiningReadiness>;
    dataMaturity: ReturnType<typeof computeDataMaturity>;
    reviewOverview: ReturnType<typeof buildReviewOverview>;
  };
  analysisPositioning: {
    analysisMode: string;
    claimStrength: 'draft-only' | 'cautious-comparison' | 'strong-mining';
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

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function ratio(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return part / whole;
}

function compactList(values: Array<string | undefined | null>, max = 5): string[] {
  return uniqueStrings(values).slice(0, max);
}

function statusFromScore(score: number): QualityDimensionStatus {
  if (score >= 85) return 'strong';
  if (score >= 68) return 'usable';
  if (score >= 45) return 'watch';
  return 'critical';
}

function levelFromScore(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
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

function hasReadableLetters(value: string): boolean {
  return /[A-Za-zÄÖÜäöüß]/.test(value);
}

function isReadableStepLabel(label: string): boolean {
  const normalized = normalizeWhitespace(label);
  if (!normalized) return false;
  if (!hasReadableLetters(normalized)) return false;
  if (/\|/.test(normalized)) return false;
  if (/^[\d\s./:-]+$/.test(normalized)) return false;
  if (normalized.length < 5) return false;
  return true;
}

function weightedAverage(values: Array<{ score: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  const weightedScore = values.reduce((sum, item) => sum + item.score * item.weight, 0);
  return clamp(weightedScore / totalWeight);
}

function buildOverallStatus(dimensions: QualityDimensionAssessment[], overallScore: number): QualityDimensionStatus {
  const coreKeys = new Set<QualityDimensionKey>([
    'documentTypeRecognition',
    'structureFidelity',
    'stepClarity',
    'evidenceCoverage',
    'cautionWithWeakMaterial',
  ]);
  const criticalCoreCount = dimensions.filter(item => coreKeys.has(item.key) && item.status === 'critical').length;

  if (criticalCoreCount >= 2 || overallScore < 40) return 'critical';
  if (dimensions.some(item => coreKeys.has(item.key) && item.status === 'critical')) return 'watch';
  if (overallScore >= 85 && dimensions.every(item => item.status !== 'critical')) return 'strong';
  if (overallScore >= 68) return 'usable';
  if (overallScore >= 45) return 'watch';
  return 'critical';
}

function assessDocumentTypeRecognition(params: {
  state: ProcessMiningAssistedV2State;
  analysisMode: ReturnType<typeof detectProcessMiningAnalysisMode>;
}): QualityDimensionAssessment {
  const summary = params.state.lastDerivationSummary;
  const profile = summary?.sourceProfile;
  const classificationReasons = compactList(profile?.classificationReasons ?? [], 6);
  let score = summary ? 34 : 8;

  if (summary?.documentKind && summary.documentKind !== 'unknown') score += 18;
  if (summary?.method && summary.method !== 'narrative-fallback') score += 12;
  if (profile?.inputProfile && profile.inputProfile !== 'unclear') score += 10;
  if (profile?.documentClass) score += 10;
  if (classificationReasons.length > 0) score += 8;
  if (summary?.routingContext?.routingConfidence === 'high') score += 6;
  if (summary?.confidence === 'high') score += 6;
  if (summary?.documentKind === 'unknown') score = Math.min(score, 40);
  if (summary?.warnings.length) score -= Math.min(14, summary.warnings.length * 3);
  if (params.analysisMode === 'process-draft' && summary?.documentKind === 'weak-material') score += 8;

  const finalScore = clamp(score);
  return {
    key: 'documentTypeRecognition',
    label: 'Dokumenttyp-Erkennung',
    score: finalScore,
    status: statusFromScore(finalScore),
    summary:
      finalScore >= 85
        ? 'Dokumenttyp und Extraktionsmodus wirken klar und fachlich stimmig.'
        : finalScore >= 68
        ? 'Der Dokumenttyp ist grundsätzlich nachvollziehbar eingeordnet, aber noch nicht maximal stabil.'
        : finalScore >= 45
        ? 'Die Typisierung ist nur teilweise abgesichert und sollte vorsichtig gelesen werden.'
        : 'Die Typisierung bleibt widersprüchlich oder zu schwach abgesichert.',
    rationale: compactList([
      summary ? `Ableitungsmodus: ${summary.method}.` : 'Noch keine Ableitungszusammenfassung vorhanden.',
      summary?.documentKind ? `Dokumenttyp: ${summary.documentKind}.` : undefined,
      profile?.inputProfileLabel ? `Quellprofil: ${profile.inputProfileLabel}.` : undefined,
      profile?.documentClassLabel ? `Dokumentenklasse: ${profile.documentClassLabel}.` : undefined,
      classificationReasons.length > 0 ? `Klassifikationsgründe: ${classificationReasons.join(' | ')}` : undefined,
      summary?.routingContext?.routingClass ? `Routing: ${summary.routingContext.routingClass}.` : undefined,
    ], 6),
    observed: {
      method: summary?.method,
      documentKind: summary?.documentKind,
      confidence: summary?.confidence,
      inputProfile: profile?.inputProfile,
      documentClass: profile?.documentClass,
      routingClass: summary?.routingContext?.routingClass,
      routingConfidence: summary?.routingContext?.routingConfidence,
      routingSignals: summary?.routingContext?.routingSignals,
      fallbackReason: summary?.routingContext?.fallbackReason,
      classificationReasons,
    },
  };
}

function assessStructureFidelity(params: {
  state: ProcessMiningAssistedV2State;
}): QualityDimensionAssessment {
  const stepObservations = getStepObservations(params.state);
  const stepCount = stepObservations.length;
  const quality = params.state.qualitySummary;
  const lastSummary = params.state.lastDerivationSummary;
  const orderingShare = ratio(
    quality?.casesWithOrdering ?? 0,
    Math.max(quality?.totalCases ?? params.state.cases.length, 1),
  );
  const tableOrder = lastSummary?.tablePipeline?.tableProfile.rowOrderCoherence ?? 0;
  const tableCases = lastSummary?.tablePipeline?.tableProfile.caseCoherence ?? 0;
  const readabilityShare = ratio(stepObservations.filter(item => isReadableStepLabel(item.label)).length, Math.max(stepCount, 1));

  const finalScore = clamp(
    stepCount === 0
      ? 0
      : 25 + readabilityShare * 30 + orderingShare * 20 + tableOrder * 12 + tableCases * 13,
  );

  return {
    key: 'structureFidelity',
    label: 'Strukturtreue',
    score: finalScore,
    status: statusFromScore(finalScore),
    summary:
      finalScore >= 85
        ? 'Schrittfolge und strukturelle Ableitung wirken stabil und gut anschlussfähig.'
        : finalScore >= 68
        ? 'Die Struktur ist grundsätzlich tragfähig, hat aber noch kleinere Schwächen.'
        : finalScore >= 45
        ? 'Die Struktur ist nur teilweise belastbar und braucht kurze Prüfung.'
        : 'Die Strukturableitung ist für belastbare Aussagen noch zu instabil.',
    rationale: compactList([
      `${stepCount} erkannte Schritte im Arbeitsstand.`,
      quality ? `${quality.casesWithOrdering} von ${quality.totalCases} Quellen mit belastbarer Reihenfolge.` : undefined,
      lastSummary?.tablePipeline ? `Tabellenkohärenz: Reihenfolge ${Math.round(tableOrder * 100)} %, Fälle ${Math.round(tableCases * 100)} %.` : undefined,
      params.state.discoverySummary?.notes,
      params.state.discoverySummary?.sampleNotice,
    ], 5),
    observed: {
      stepCount,
      casesWithOrdering: quality?.casesWithOrdering,
      totalCases: quality?.totalCases ?? params.state.cases.length,
      rowOrderCoherence: tableOrder,
      caseCoherence: tableCases,
      variantCount: params.state.discoverySummary?.variantCount,
      mainVariantShare: params.state.discoverySummary?.mainVariantShare,
    },
  };
}

function assessStepClarity(params: {
  state: ProcessMiningAssistedV2State;
}): QualityDimensionAssessment {
  const labels = getStepObservations(params.state).map(item => normalizeWhitespace(item.label)).filter(Boolean);
  const readable = labels.filter(isReadableStepLabel);
  const avgLength = labels.length > 0 ? labels.reduce((sum, label) => sum + label.length, 0) / labels.length : 0;
  const readableShare = ratio(readable.length, Math.max(labels.length, 1));
  const finalScore = clamp(labels.length === 0 ? 0 : 20 + readableShare * 55 + Math.min(avgLength, 28));

  return {
    key: 'stepClarity',
    label: 'Schrittklarheit',
    score: finalScore,
    status: statusFromScore(finalScore),
    summary:
      finalScore >= 85
        ? 'Die Schrittbezeichnungen sind überwiegend klar, lesbar und fachlich brauchbar.'
        : finalScore >= 68
        ? 'Die meisten Schritte sind gut lesbar, einzelne Bezeichnungen bleiben generisch.'
        : finalScore >= 45
        ? 'Die Schrittbezeichnungen enthalten noch mehrere unscharfe oder technische Fragmente.'
        : 'Schrittlabels sind aktuell zu unklar für eine verlässliche fachliche Lesart.',
    rationale: compactList([
      `${readable.length} von ${labels.length} Schrittlabels wirken klar lesbar.`,
      labels.length > 0 ? `Durchschnittliche Label-Länge: ${Math.round(avgLength)} Zeichen.` : undefined,
      params.state.qualitySummary ? `${params.state.qualitySummary.unclearLabelCount} unklare Labels im lokalen Qualitätsbild.` : undefined,
      params.state.discoverySummary?.sampleNotice,
    ], 4),
    observed: {
      stepLabelCount: labels.length,
      readableLabelCount: readable.length,
      averageLabelLength: Math.round(avgLength),
      examples: readable.slice(0, 8),
    },
  };
}

function assessRoleQuality(params: {
  state: ProcessMiningAssistedV2State;
}): QualityDimensionAssessment {
  const steps = getStepObservations(params.state);
  const roleBackedSteps =
    params.state.qualitySummary?.stepObservationsWithRole ??
    steps.filter(step => Boolean(normalizeWhitespace(step.role ?? ''))).length;
  const uniqueRoles = uniqueStrings([
    ...steps.map(step => step.role),
    ...(params.state.lastDerivationSummary?.roles ?? []),
  ]);
  const coverage = ratio(roleBackedSteps, Math.max(steps.length, 1));
  const variety = Math.min(1, uniqueRoles.length / Math.max(Math.ceil(steps.length / 3), 1));
  const finalScore = clamp(steps.length === 0 ? 0 : 18 + coverage * 55 + variety * 27);

  return {
    key: 'roleQuality',
    label: 'Rollenqualität',
    score: finalScore,
    status: statusFromScore(finalScore),
    summary:
      finalScore >= 85
        ? 'Rollenbezüge sind breit genug vorhanden, um Übergaben und Verantwortungen gut zu lesen.'
        : finalScore >= 68
        ? 'Rolleninformationen sind brauchbar, aber noch nicht durchgehend vorhanden.'
        : finalScore >= 45
        ? 'Rollenkontext ist nur punktuell vorhanden und begrenzt die Aussagekraft.'
        : 'Rollenbezüge fehlen weitgehend.',
    rationale: compactList([
      `${roleBackedSteps} von ${steps.length} Schritten mit Rollenbezug.`,
      uniqueRoles.length > 0 ? `${uniqueRoles.length} unterschiedliche Rollen erkannt.` : 'Noch keine Rollen erkannt.',
    ], 3),
    observed: {
      stepCount: steps.length,
      roleBackedSteps,
      roleCoveragePct: Math.round(coverage * 100),
      uniqueRoles,
    },
  };
}

function assessSystemQuality(params: {
  state: ProcessMiningAssistedV2State;
}): QualityDimensionAssessment {
  const steps = getStepObservations(params.state);
  const systemBackedSteps =
    params.state.qualitySummary?.stepObservationsWithSystem ??
    steps.filter(step => Boolean(normalizeWhitespace(step.system ?? ''))).length;
  const uniqueSystems = uniqueStrings([
    ...steps.map(step => step.system),
    ...(params.state.lastDerivationSummary?.systems ?? []),
  ]);
  const coverage = ratio(systemBackedSteps, Math.max(steps.length, 1));
  const variety = Math.min(1, uniqueSystems.length / Math.max(Math.ceil(steps.length / 4), 1));
  const finalScore = clamp(steps.length === 0 ? 0 : 15 + coverage * 58 + variety * 24);

  return {
    key: 'systemQuality',
    label: 'Systemqualität',
    score: finalScore,
    status: statusFromScore(finalScore),
    summary:
      finalScore >= 85
        ? 'Systembezüge sind klar genug, um Medienbrüche und digitale Übergaben gut zu verstehen.'
        : finalScore >= 68
        ? 'Systeminformationen sind schon brauchbar, aber noch nicht flächig.'
        : finalScore >= 45
        ? 'Systemkontext ist nur teilweise vorhanden.'
        : 'Systembezüge fehlen weitgehend.',
    rationale: compactList([
      `${systemBackedSteps} von ${steps.length} Schritten mit Systembezug.`,
      uniqueSystems.length > 0 ? `${uniqueSystems.length} unterschiedliche Systeme erkannt.` : 'Noch keine Systeme erkannt.',
    ], 3),
    observed: {
      stepCount: steps.length,
      systemBackedSteps,
      systemCoveragePct: Math.round(coverage * 100),
      uniqueSystems,
    },
  };
}

function assessDomainConsistency(params: {
  state: ProcessMiningAssistedV2State;
}): QualityDimensionAssessment {
  const profile = params.state.lastDerivationSummary?.sourceProfile;
  const primaryDomain = profile?.primaryDomainLabel ?? profile?.primaryDomainKey;
  const secondaryDomains = profile?.secondaryDomainLabels ?? profile?.secondaryDomainKeys ?? [];
  const domainScores = profile?.domainScores ?? [];
  const topScore = domainScores[0]?.score ?? 0;
  const runnerUp = domainScores[1]?.score ?? 0;
  const dominanceGap = Math.max(0, topScore - runnerUp);

  let score = primaryDomain ? 46 : 24;
  if (primaryDomain) score += 16;
  if (profile?.domainGateNote) score += 10;
  if (domainScores.length > 0) score += Math.min(12, dominanceGap);
  if ((secondaryDomains?.length ?? 0) > 2) score -= 10;
  if (profile?.documentClass === 'mixed-document') score -= 6;

  const finalScore = clamp(score);
  return {
    key: 'domainConsistency',
    label: 'Domänenkonsistenz',
    score: finalScore,
    status: statusFromScore(finalScore),
    summary:
      finalScore >= 85
        ? 'Die fachliche Domäne wirkt klar eingegrenzt und konsistent.'
        : finalScore >= 68
        ? 'Die Domäne ist grundsätzlich erkennbar, aber noch nicht maximal eindeutig.'
        : finalScore >= 45
        ? 'Die Domäne ist nur teilweise abgesichert und sollte vorsichtig interpretiert werden.'
        : 'Die fachliche Domäne bleibt zu offen oder gemischt.',
    rationale: compactList([
      primaryDomain ? `Primärdomäne: ${primaryDomain}.` : 'Keine klare Primärdomäne ermittelt.',
      secondaryDomains.length > 0 ? `Nebendomänen: ${secondaryDomains.join(', ')}.` : undefined,
      profile?.domainGateNote,
      domainScores.length > 0 ? `Dominanzabstand der Domänenscores: ${dominanceGap}.` : undefined,
    ], 4),
    observed: {
      primaryDomain,
      secondaryDomains,
      domainScores: domainScores.slice(0, 6),
      domainGateNote: profile?.domainGateNote,
    },
  };
}

function assessEvidenceCoverage(params: {
  state: ProcessMiningAssistedV2State;
}): QualityDimensionAssessment {
  const steps = getStepObservations(params.state);
  const evidenceBackedSteps =
    params.state.qualitySummary?.stepObservationsWithEvidence ??
    steps.filter(step => Boolean(normalizeWhitespace(step.evidenceSnippet ?? ''))).length;
  const realTimeObservations =
    params.state.qualitySummary?.observationsWithRealTime ??
    params.state.observations.filter(observation => observation.timestampQuality === 'real').length;
  const supportSignals = params.state.lastDerivationSummary?.issueEvidence ?? [];
  const evidenceCoverage = ratio(evidenceBackedSteps, Math.max(steps.length, 1));
  const timingSupport = ratio(realTimeObservations, Math.max(steps.length, 1));
  const finalScore = clamp(
    steps.length === 0
      ? 0
      : 18 + evidenceCoverage * 58 + Math.min(12, supportSignals.length * 3) + timingSupport * 12,
  );

  return {
    key: 'evidenceCoverage',
    label: 'Evidenzabdeckung',
    score: finalScore,
    status: statusFromScore(finalScore),
    summary:
      finalScore >= 85
        ? 'Die Analyse ist gut mit Belegstellen und ergänzenden Signalen unterfüttert.'
        : finalScore >= 68
        ? 'Es gibt eine brauchbare Evidenzbasis, aber noch Lücken.'
        : finalScore >= 45
        ? 'Die Evidenz reicht für erste Einschätzungen, ist aber noch nicht dicht genug.'
        : 'Die Analyse bleibt zu dünn belegt.',
    rationale: compactList([
      `${evidenceBackedSteps} von ${steps.length} Schritten mit Evidenzsnippet.`,
      `${realTimeObservations} Beobachtungen mit echten Zeitangaben.`,
      supportSignals.length > 0 ? `${supportSignals.length} zusätzliche Support-Signale aus der Ableitung.` : undefined,
    ], 4),
    observed: {
      stepCount: steps.length,
      evidenceBackedSteps,
      realTimeObservations,
      supportSignals: supportSignals.slice(0, 10),
    },
  };
}

function assessCautionWithWeakMaterial(params: {
  state: ProcessMiningAssistedV2State;
  analysisMode: ReturnType<typeof detectProcessMiningAnalysisMode>;
  claimStrength: ReturnType<typeof getAnalysisClaimStrength>;
}): QualityDimensionAssessment {
  const summary = params.state.lastDerivationSummary;
  const warnings = summary?.warnings ?? [];
  const weakMaterial =
    summary?.documentKind === 'weak-material' ||
    summary?.method === 'narrative-fallback' ||
    params.analysisMode === 'process-draft' ||
    warnings.some(warning => /schwach|vorsicht|fallback|unsicher/i.test(warning));

  let score = weakMaterial ? 82 : 70;
  if (weakMaterial && params.claimStrength === 'strong-mining') score = 24;
  if (weakMaterial && params.claimStrength === 'cautious-comparison') score = 74;
  if (weakMaterial && params.claimStrength === 'draft-only') score = 90;
  if (!weakMaterial && params.claimStrength === 'strong-mining') score += 10;
  if (summary?.confidence === 'low') score -= 8;
  if (summary?.confidence === 'high' && !weakMaterial) score += 6;
  score -= Math.min(10, warnings.filter(warning => /widerspruch|unklar/i.test(warning)).length * 4);

  const finalScore = clamp(score);
  return {
    key: 'cautionWithWeakMaterial',
    label: 'Vorsicht bei schwachem Material',
    score: finalScore,
    status: statusFromScore(finalScore),
    summary:
      finalScore >= 85
        ? 'Aussagen und Materialstärke wirken gut austariert.'
        : finalScore >= 68
        ? 'Die Vorsicht gegenüber schwacher Datenlage ist grundsätzlich angemessen.'
        : finalScore >= 45
        ? 'Die Claims sollten vorsichtiger gelesen werden als der Export es aktuell nahelegt.'
        : 'Die Analyse wirkt für die vorhandene Materialstärke zu offensiv.',
    rationale: compactList([
      weakMaterial ? 'Die Datenlage wird als schwach oder entwurfsnah behandelt.' : 'Die Datenlage wirkt nicht mehr nur entwurfsnah.',
      `Claim-Stärke: ${params.claimStrength}.`,
      summary?.confidence ? `Ableitungskonfidenz: ${summary.confidence}.` : undefined,
      warnings.length > 0 ? `Warnungen: ${warnings.slice(0, 3).join(' | ')}` : undefined,
    ], 4),
    observed: {
      weakMaterial,
      claimStrength: params.claimStrength,
      confidence: summary?.confidence,
      warningCount: warnings.length,
      warnings: warnings.slice(0, 8),
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
  const readiness = computeMiningReadiness({ state, version });
  const reviewOverview = buildReviewOverview({ cases: state.cases, observations: state.observations });
  const dataMaturity = computeDataMaturity({
    state,
    version,
    reviewSuggestionCount: reviewOverview.suggestionCount,
  });
  const analysisMode = detectProcessMiningAnalysisMode({
    cases: state.cases,
    observations: state.observations,
    lastDerivationSummary: state.lastDerivationSummary,
  });
  const claimStrength = getAnalysisClaimStrength(analysisMode, state.cases.length);
  const claimNote = buildAnalysisClaimNote({
    mode: analysisMode,
    caseCount: state.cases.length,
  });
  const dimensions: QualityDimensionAssessment[] = [
    assessDocumentTypeRecognition({ state, analysisMode }),
    assessStructureFidelity({ state }),
    assessStepClarity({ state }),
    assessRoleQuality({ state }),
    assessSystemQuality({ state }),
    assessDomainConsistency({ state }),
    assessEvidenceCoverage({ state }),
    assessCautionWithWeakMaterial({ state, analysisMode, claimStrength }),
  ];

  const overallScore = weightedAverage([
    { score: dimensions[0].score, weight: 0.16 },
    { score: dimensions[1].score, weight: 0.16 },
    { score: dimensions[2].score, weight: 0.16 },
    { score: dimensions[3].score, weight: 0.1 },
    { score: dimensions[4].score, weight: 0.08 },
    { score: dimensions[5].score, weight: 0.1 },
    { score: dimensions[6].score, weight: 0.14 },
    { score: dimensions[7].score, weight: 0.1 },
  ]);
  const overallStatus = buildOverallStatus(dimensions, overallScore);
  const overallLevel = levelFromScore(overallScore);

  const blockers = dimensions
    .filter(item => item.status === 'critical')
    .map(item => `${item.label}: ${item.summary}`);
  const watchpoints = dimensions
    .filter(item => item.status === 'watch')
    .map(item => `${item.label}: ${item.summary}`);
  const strengths = dimensions
    .filter(item => item.status === 'strong')
    .map(item => `${item.label}: ${item.summary}`);
  const recommendedFocus = uniqueStrings([
    ...dimensions
      .slice()
      .sort((left, right) => left.score - right.score)
      .slice(0, 3)
      .map(item => `${item.label}: ${item.summary}`),
    ...readiness.nextActions,
    ...dataMaturity.actions.map(action => action.label),
  ]).slice(0, 6);

  const overallSummary =
    overallStatus === 'strong'
      ? 'Der exportierte Analysezustand ist in den Kerndimensionen stabil und extern gut bewertbar.'
      : overallStatus === 'usable'
      ? 'Der Analysezustand ist extern gut bewertbar, zeigt aber noch einzelne Lücken im Detailbild.'
      : overallStatus === 'watch'
      ? 'Der Analysezustand ist bewertbar, sollte aber mit erhöhter Vorsicht gelesen werden.'
      : 'Der Analysezustand ist in mindestens einer Kerndimension kritisch und nur eingeschränkt belastbar.';

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
      intent: 'Der Export soll einen einzelnen Analysezustand extern bewertbar machen, ohne auf eingebaute Referenzfälle zurückzugreifen.',
      evaluationOrder: [
        'Zuerst qualityAssessment.overallScore und overallStatus lesen.',
        'Danach die acht Qualitätsdimensionen in qualityAssessment.dimensions prüfen.',
        'Anschließend analysisPositioning, qualityControl und analysisResults für die Einordnung heranziehen.',
      ],
      statusScale: [
        { status: 'strong', meaning: 'tragfähiger und konsistenter Analysezustand' },
        { status: 'usable', meaning: 'brauchbar, aber mit klar benennbaren Lücken' },
        { status: 'watch', meaning: 'bewertbar, jedoch vorsichtig zu lesen' },
        { status: 'critical', meaning: 'in Kerndimensionen kritisch eingeschränkt' },
      ],
      interpretationHints: [
        'Ein einzelnes Dokument ist eher als Prozessentwurf oder vorsichtiger Vergleich zu lesen, nicht automatisch als belastbares Mining.',
        'Hohe Vorsicht bei schwachem Material ist ein Qualitätsmerkmal und kein Defizit.',
        'Die observed- und rationale-Felder liefern die direkte Begründung für eine externe Bewertung.',
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
        key: 'integrity-and-readiness',
        label: 'Arbeitsstand und Analysefähigkeit',
        checks: [
          'Ist der Arbeitsstand technisch konsistent und lokal belastbar?',
          'Reicht die aktuelle Basis für Entwurf, Vergleich oder belastbareres Mining?',
        ],
      },
      {
        key: 'data-and-review',
        label: 'Datenreife und Prüfbedarf',
        checks: [
          'Wie vollständig sind Reihenfolge, Evidenz, Rollen und Systeme?',
          'Welche lokalen Review-Hinweise zeigen noch vermeidbare Schwächen?',
        ],
      },
      {
        key: 'core-analysis-quality',
        label: 'Extraktions- und Bewertungsqualität',
        checks: [
          'Sind Dokumenttyp, Struktur, Schritte und Domänenbezug plausibel?',
          'Wird schwaches Material vorsichtig und nicht überzogen interpretiert?',
        ],
      },
    ],
    qualityAssessment: {
      overallScore,
      overallStatus,
      overallSummary,
      dimensions,
      strengths,
      watchpoints,
      blockers,
      recommendedFocus,
    },
    qualityControl: {
      integrity,
      readiness,
      dataMaturity,
      reviewOverview,
    },
    analysisPositioning: {
      analysisMode,
      claimStrength,
      claimNote,
      percentageGuidance:
        claimStrength === 'strong-mining'
          ? 'Prozent- und Mengenangaben sind mit dieser Basis deutlich belastbarer.'
          : 'Prozent- und Mengenangaben sollten als vorsichtige Richtungssignale gelesen werden.',
      conformanceGuidance:
        happyPath.length > 0
          ? 'Soll-Ist-Aussagen können sich auf den gepflegten Happy Path stützen.'
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
        overall: overallLevel,
        dimensions: dimensions.map(item => ({
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
