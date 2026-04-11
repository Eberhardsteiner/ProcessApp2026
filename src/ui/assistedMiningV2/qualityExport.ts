import type {
  Process,
  ProcessVersion,
  ProcessMiningAssistedV2State,
  ProcessMiningDomainKey,
  ProcessMiningObservation,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { APP_SEMVER, APP_VERSION_LABEL } from '../../config/release';
import type { WorkspaceIntegrityReport } from './workspaceIntegrity';
import { computeMiningReadiness } from './analysisReadiness';
import {
  buildAnalysisClaimNote,
  detectProcessMiningAnalysisMode,
  getAnalysisClaimStrength,
  normalizeWhitespace,
  uniqueStrings,
} from './pmShared';
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
    releaseReadiness: ReturnType<typeof evaluateReleaseStability>;
    governanceSummary: ReturnType<typeof computeGovernanceSummary> | null;
    governanceWorkflow: ReturnType<typeof computeGovernanceWorkflow> | null;
    collaborationSummary: ReturnType<typeof buildCollaborationSummary>;
    pilotReadiness: ReturnType<typeof evaluatePilotReadiness>;
    integrationReadiness: ReturnType<typeof evaluateIntegrationReadiness>;
    securityReadiness: ReturnType<typeof evaluateSecurityReadiness>;
    acceptanceReadiness: ReturnType<typeof evaluateAcceptanceReadiness>;
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
<<<<<<< ours
<<<<<<< ours
=======
=======
>>>>>>> theirs
    tablePipeline?: ProcessMiningAssistedV2State['lastDerivationSummary'] extends infer T
      ? T extends { tablePipeline?: infer U }
        ? U
        : never
      : never;
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
    routing?: {
      routingClass: string;
      routingConfidence: string;
      routingSignals: string[];
      fallbackReason?: string;
    };
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
    extractionEvidence?: {
      candidateStats?: ProcessMiningAssistedV2State['lastDerivationSummary'] extends infer T
        ? T extends { candidateStats?: infer U }
          ? U
          : never
        : never;
      rejectedOrSupportCandidates?: Array<{
        candidateType: string;
        normalizedLabel: string;
        status: string;
        rejectionReason?: string;
        downgradeReason?: string;
        evidenceAnchor: string;
      }>;
    };
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
    discoverySummary?: ProcessMiningAssistedV2State['discoverySummary'];
    conformanceSummary?: ProcessMiningAssistedV2State['conformanceSummary'];
    enhancementSummary?: ProcessMiningAssistedV2State['enhancementSummary'];
    reportSnapshot?: ProcessMiningAssistedV2State['reportSnapshot'];
    handoverDrafts?: ProcessMiningAssistedV2State['handoverDrafts'];
    qualityAssessment: {
<<<<<<< ours
=======
      scoringProfile?: {
        mode: 'process-draft' | 'comparison' | 'eventlog-table' | 'weak-raw-table';
        weights: Record<string, number>;
        evidenceTypes: string[];
        blockerRules: string[];
      };
      scoringReasons?: string[];
      blockerReasons?: string[];
      confidenceAdjustments?: string[];
>>>>>>> theirs
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
    supportSignals: Array<{ label: string; snippet: string }>;
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

const KNOWN_SYSTEM_LABELS = new Set([
  'ERP',
  'DMS',
  'CRM',
  'E-Mail',
  'Telefon',
  'Workflow',
  'Ticketsystem',
  'Monitoring',
  'Leitstand',
  'Rechnungsworkflow',
  'HR-System',
  'IAM/Active Directory',
  'Serviceportal',
  'SRM/Einkaufssystem',
  'MDM',
  'Stammdatenformular',
  'RMA-Referenz',
]);

const DOMAIN_HINT_PATTERNS: Record<Exclude<ProcessMiningDomainKey, 'mixed'>, RegExp[]> = {
  complaints: [
    /reklamation|mangel|falschlieferung|fehlerbild|seriennummer|auftragsnummer|kulanz|ersatzteil|feldst[öo]rung|reklamationseingang/i,
  ],
  service: [/st[öo]rung|ticket|sla|leitstand|monitoring|ferndiagnose|dispatcher|remote/i],
  returns: [/retoure|r[üu]cksendung|rma|garantie|ersatzlieferung|wareneingang/i],
  procurement: [/bedarf|bestellanforderung|angebot|beschaffung|einkauf|srm|lieferantenportal/i],
  onboarding: [/onboarding|eintritt|zug[aä]nge|notebook|equipment|iam|active directory|hr-system/i],
  billing: [/rechnung|zahlung|gutschrift|kreditor|debitor|rechnungsworkflow|zahlungskl[aä]rung|rechnungskl[aä]rung/i],
  masterdata: [/stammdaten|[äa]nderungsantrag|dublette|bankdaten|rechnungsadresse|master data|mdm/i],
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function ratio(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return part / whole;
}

function statusFromScore(score: number): QualityDimensionStatus {
  if (score >= 85) return 'strong';
  if (score >= 70) return 'usable';
  if (score >= 45) return 'watch';
  return 'critical';
}

function overallStatusFromDimensions(params: {
  dimensions: QualityDimensionAssessment[];
  overallScore: number;
  coreScore: number;
}): QualityDimensionStatus {
  const coreKeys = new Set<QualityDimensionKey>([
    'documentTypeRecognition',
    'structureFidelity',
    'stepClarity',
    'evidenceCoverage',
    'cautionWithWeakMaterial',
  ]);
  const criticalCoreKeys = new Set<QualityDimensionKey>([
    'documentTypeRecognition',
    'structureFidelity',
    'stepClarity',
    'cautionWithWeakMaterial',
  ]);
  const criticalCoreCount = params.dimensions.filter(item => coreKeys.has(item.key) && item.status === 'critical').length;
  const strongCoreCount = params.dimensions.filter(item => coreKeys.has(item.key) && item.status === 'strong').length;
  const supportCriticalCount = params.dimensions.filter(item => !coreKeys.has(item.key) && item.status === 'critical').length;
  const hasCriticalCoreFailure = params.dimensions.some(item => criticalCoreKeys.has(item.key) && item.status === 'critical');

  if (hasCriticalCoreFailure || criticalCoreCount >= 2 || params.coreScore < 45 || params.overallScore < 40) {
    return 'critical';
  }
  if (params.coreScore >= 85 && params.overallScore >= 80 && supportCriticalCount === 0 && strongCoreCount >= 4) {
    return 'strong';
  }
  if (params.coreScore >= 68 && params.overallScore >= 62) {
    return 'usable';
  }
  if (params.coreScore >= 55 || params.overallScore >= 50) {
    return 'watch';
  }
  return 'critical';
}

function compactList(values: Array<string | undefined | null>, max = 5): string[] {
  return uniqueStrings(values).slice(0, max);
}

function weightedAverage(values: Array<{ score: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  const weighted = values.reduce((sum, item) => sum + item.score * item.weight, 0);
  return clamp(weighted / totalWeight);
}

function normalizeFieldValue(value: string | undefined): string {
  return normalizeWhitespace(value ?? '');
}

function isPipeFragment(label: string): boolean {
  return /\|/.test(label);
}

function isNumberFragment(label: string): boolean {
  return /^[\d\s./:-]+$/.test(label);
}

function isObviouslyBrokenStep(label: string): boolean {
  const normalized = normalizeFieldValue(label);
  if (!normalized) return true;
  if (isPipeFragment(normalized)) return true;
  if (isNumberFragment(normalized)) return true;
  if (!/[A-Za-zÄÖÜäöüß]/.test(normalized)) return true;
  if (/^[A-Za-zÄÖÜäöüß]+\s*\|\s*[\d.]+$/.test(normalized)) return true;
  if (normalized.length <= 3) return true;
  if (KNOWN_SYSTEM_LABELS.has(normalized)) return true;
  return false;
}

function isSuspiciousMetadataLabel(label: string): boolean {
  const normalized = normalizeFieldValue(label);
  if (!normalized) return true;
  if (isPipeFragment(normalized)) return true;
  if (isNumberFragment(normalized)) return true;
  if (!/[A-Za-zÄÖÜäöüß]/.test(normalized)) return true;
  return false;
}

function analyzeStepLabels(observations: ProcessMiningObservation[]) {
  const stepLabels = observations.filter(item => item.kind === 'step').map(item => normalizeFieldValue(item.label)).filter(Boolean);
  const suspicious = stepLabels.filter(isObviouslyBrokenStep);
  const duplicateMap = new Map<string, number>();
  stepLabels.forEach(label => {
    const key = label.toLowerCase();
    duplicateMap.set(key, (duplicateMap.get(key) ?? 0) + 1);
  });
  const duplicates = Array.from(duplicateMap.entries())
    .filter(([, count]) => count > 1)
    .map(([label, count]) => `${label} (${count})`);

  return {
    total: stepLabels.length,
    suspiciousCount: suspicious.length,
    suspiciousExamples: suspicious.slice(0, 6),
    duplicateCount: duplicates.length,
    duplicateExamples: duplicates.slice(0, 6),
    readableExamples: stepLabels.filter(label => !isObviouslyBrokenStep(label)).slice(0, 10),
  };
}

function analyzeMetadataLabels(values: Array<string | undefined | null>) {
  const labels = uniqueStrings(values).map(normalizeFieldValue).filter(Boolean);
  const suspicious = labels.filter(isSuspiciousMetadataLabel);
  return {
    total: labels.length,
    suspiciousCount: suspicious.length,
    suspiciousExamples: suspicious.slice(0, 6),
    labels: labels.slice(0, 12),
  };
}

function detectForeignDomainHints(params: {
  primaryDomainKey?: ProcessMiningDomainKey;
  secondaryDomainKeys?: ProcessMiningDomainKey[];
  texts: string[];
  scoreBoard?: Array<{ key: ProcessMiningDomainKey; label: string; score: number }>;
  suppressedSignals?: string[];
  suppressedRoles?: string[];
  suppressedSystems?: string[];
}) {
  const allowed = new Set<ProcessMiningDomainKey>([
    params.primaryDomainKey,
    ...(params.secondaryDomainKeys ?? []),
  ].filter(Boolean) as ProcessMiningDomainKey[]);

  const hits = new Map<ProcessMiningDomainKey, number>();

  params.texts.forEach(text => {
    const normalized = normalizeFieldValue(text);
    if (!normalized) return;
    (Object.keys(DOMAIN_HINT_PATTERNS) as Array<Exclude<ProcessMiningDomainKey, 'mixed'>>).forEach(key => {
      const matched = DOMAIN_HINT_PATTERNS[key].some(pattern => pattern.test(normalized));
      if (!matched) return;
      hits.set(key, (hits.get(key) ?? 0) + 1);
    });
  });

  const scoreMap = new Map((params.scoreBoard ?? []).map(item => [item.key, item]));
  const primaryScore = scoreMap.get(params.primaryDomainKey ?? 'mixed')?.score ?? 0;
  const strongScoreThreshold = Math.max(6, Math.round(primaryScore * 0.35));

  const foreignHits = Array.from(hits.entries())
    .filter(([domain]) => !allowed.has(domain))
    .map(([domain, count]) => {
      const boardEntry = scoreMap.get(domain);
      const domainScore = boardEntry?.score ?? 0;
      const severity = count >= 2 && domainScore >= strongScoreThreshold ? 'strong' : 'weak';
      return {
        domain,
        label: boardEntry?.label ?? domain,
        count,
        score: domainScore,
        severity,
      };
    });

  const strongForeignDomains = foreignHits.filter(item => item.severity === 'strong');
  const weakForeignDomains = foreignHits.filter(item => item.severity === 'weak');

  return {
    primaryScore,
    strongScoreThreshold,
    activeForeignCount: foreignHits.reduce((sum, item) => sum + item.count, 0),
    strongForeignCount: strongForeignDomains.reduce((sum, item) => sum + item.count, 0),
    weakForeignCount: weakForeignDomains.reduce((sum, item) => sum + item.count, 0),
    activeForeignDomains: foreignHits,
    strongForeignDomains,
    weakForeignDomains,
    suppressedSignalCount: (params.suppressedSignals ?? []).length,
    suppressedRoleCount: (params.suppressedRoles ?? []).length,
    suppressedSystemCount: (params.suppressedSystems ?? []).length,
  };
}

function assessDocumentTypeRecognition(params: {
  state: ProcessMiningAssistedV2State;
  analysisMode: string;
}): QualityDimensionAssessment {
  const summary = params.state.lastDerivationSummary;
  const profile = summary?.sourceProfile;
  const reasons = compactList(profile?.classificationReasons ?? [], 6);
  const rationale: string[] = [];
  let score = 20;

  if (summary) {
    score += 15;
    rationale.push(`Ableitungsmodus: ${summary.method}.`);
    rationale.push(`Dokumenttyp: ${summary.documentKind}.`);
  } else {
    rationale.push('Es liegt noch keine Ableitungszusammenfassung vor.');
  }

  if (profile?.documentClass) {
    score += 20;
    rationale.push(`Dokumentklasse erkannt: ${profile.documentClass}.`);
  }
  if (profile?.inputProfile && profile.inputProfile !== 'unclear') {
    score += 10;
    rationale.push(`Quellprofil ist nicht unklar: ${profile.inputProfile}.`);
  }
  if (reasons.length > 0) {
    score += 8;
    rationale.push(`Klassifikation wird mit ${reasons.length} Gründen begründet.`);
  }

  const structuredMatch =
    profile?.documentClass === 'structured-target-procedure' &&
    summary?.method === 'structured' &&
    summary?.documentKind === 'procedure-document';
  const semiStructuredMatch =
    profile?.documentClass === 'semi-structured-procedure' &&
    summary?.documentKind === 'procedure-document' &&
    summary?.method !== 'narrative-fallback';
  const narrativeMatch =
    profile?.documentClass === 'narrative-case' &&
    summary?.documentKind === 'case-narrative';
  const mixedMatch =
    profile?.documentClass === 'mixed-document' &&
    summary?.documentKind === 'procedure-document';
  const weakMaterialMatch =
    profile?.documentClass === 'weak-material' &&
    summary?.documentKind !== 'procedure-document' &&
    params.analysisMode === 'process-draft';

  if (structuredMatch) score = 96;
  else if (semiStructuredMatch) score = 86;
  else if (narrativeMatch) score = 88;
  else if (mixedMatch) score = Math.max(score, 74);
  else if (weakMaterialMatch) score = Math.max(score, 78);

  if (profile?.documentClass === 'structured-target-procedure' && summary?.method === 'narrative-fallback') {
    score = 18;
    rationale.push('Strukturiertes Sollprozessdokument ist fälschlich in den narrativen Fallback geraten.');
  }

  if (profile?.documentClass === 'structured-target-procedure' && summary?.documentKind !== 'procedure-document') {
    score = Math.min(score, 22);
    rationale.push('Dokumentklasse und resultierender Dokumenttyp widersprechen sich.');
  }

  return {
    key: 'documentTypeRecognition',
    label: 'Dokumenttyp-Erkennung',
    score: clamp(score),
    status: statusFromScore(score),
    summary:
      structuredMatch
        ? 'Das Dokument wird als strukturiertes Sollprozessdokument plausibel erkannt.'
        : semiStructuredMatch
        ? 'Das Dokument wird als semistrukturiertes Verfahrensdokument plausibel erkannt.'
        : narrativeMatch
        ? 'Das Dokument wird als narrative Fallbeschreibung plausibel erkannt.'
        : 'Dokumenttyp-Erkennung ist noch widersprüchlich oder schwach begründet.',
    rationale,
    observed: {
      method: summary?.method,
      documentKind: summary?.documentKind,
      documentClass: profile?.documentClass,
      inputProfile: profile?.inputProfile,
      classificationReasons: reasons,
      confidence: summary?.confidence,
    },
  };
}

function assessStructureFidelity(params: {
  state: ProcessMiningAssistedV2State;
}): QualityDimensionAssessment {
  const summary = params.state.lastDerivationSummary;
  const profile = summary?.sourceProfile;
  const stepDiagnostics = analyzeStepLabels(params.state.observations);
  const stepCount = stepDiagnostics.total;
  const selectedParagraphCount = profile?.selectedParagraphCount ?? 0;
  const supportParagraphCount = profile?.supportParagraphCount ?? 0;
  const evidenceParagraphCount = profile?.evidenceParagraphCount ?? 0;
  const processShare = profile?.processBearingSharePct ?? 0;
  const rationale: string[] = [];

  let score = 0;
  score += Math.min(stepCount * 6, 30);
  score += Math.min(selectedParagraphCount * 5, 20);
  score += Math.min(supportParagraphCount * 3, 12);
  score += Math.min(evidenceParagraphCount * 2, 8);
  score += Math.min(processShare * 0.35, 20);
  score -= Math.min(stepDiagnostics.suspiciousCount * 18, 45);

  if (summary?.method === 'structured') {
    score += 10;
    rationale.push('Die Ableitung läuft über den strukturierten Pfad.');
  }
  if (profile?.documentClass === 'structured-target-procedure' && selectedParagraphCount === 0) {
    score = Math.min(score, 28);
    rationale.push('Strukturiertes Material wurde erkannt, aber keine primären Verfahrensabschnitte ausgewählt.');
  }
  if (stepCount === 0) {
    rationale.push('Es wurden noch keine tragfähigen Prozessschritte gebildet.');
  }
  if (stepDiagnostics.suspiciousCount > 0) {
    rationale.push(`${stepDiagnostics.suspiciousCount} Schrittlables wirken wie Tabellenreste oder Fragmente.`);
  }
  if (processShare > 0) {
    rationale.push(`Prozessnahes Material: ${processShare} %.`);
  }

  return {
    key: 'structureFidelity',
    label: 'Strukturtreue',
    score: clamp(score),
    status: statusFromScore(score),
    summary:
      stepDiagnostics.suspiciousCount === 0 && stepCount > 0
        ? 'Strukturierte Abschnitte und Tabellen werden überwiegend als lesbare Prozessschritte erhalten.'
        : 'Strukturierte Bereiche werden noch nicht durchgängig sauber in Prozessschritte überführt.',
    rationale,
    observed: {
      selectedParagraphCount,
      supportParagraphCount,
      evidenceParagraphCount,
      processBearingSharePct: processShare,
      stepCount,
      suspiciousStepLabels: stepDiagnostics.suspiciousExamples,
    },
  };
}

function assessStepClarity(params: {
  state: ProcessMiningAssistedV2State;
}): QualityDimensionAssessment {
  const diagnostics = analyzeStepLabels(params.state.observations);
  const rationale: string[] = [];
  const readableRatio = diagnostics.total > 0 ? ratio(diagnostics.total - diagnostics.suspiciousCount, diagnostics.total) : 0;
  const duplicatePenalty = diagnostics.duplicateCount > 0 ? Math.min(diagnostics.duplicateCount * 8, 24) : 0;
  let score = diagnostics.total === 0 ? 0 : readableRatio * 82 + Math.min(diagnostics.total, 8) * 2 - duplicatePenalty;

  if (diagnostics.suspiciousCount === 0 && diagnostics.total >= 4) {
    score += 8;
    rationale.push('Die Schrittliste enthält keine offensichtlichen Tabellen- oder Fragmentreste.');
  }
  if (diagnostics.duplicateCount > 0) {
    rationale.push(`${diagnostics.duplicateCount} doppelte oder nahezu doppelte Schrittbezeichnungen erschweren die Lesbarkeit.`);
  }
  if (diagnostics.suspiciousCount > 0) {
    rationale.push(`${diagnostics.suspiciousCount} Schrittbezeichnungen wirken noch wie Fragmente.`);
  }

  return {
    key: 'stepClarity',
    label: 'Schrittklarheit',
    score: clamp(score),
    status: statusFromScore(score),
    summary:
      diagnostics.total === 0
        ? 'Noch keine Prozessschritte vorhanden.'
        : diagnostics.suspiciousCount === 0
        ? 'Die erkannten Schritte sind fachlich lesbar und wirken stabil.'
        : 'Ein Teil der Schritte ist bereits lesbar, einzelne Labels wirken aber noch fragmentiert oder doppelt.',
    rationale,
    observed: {
      stepCount: diagnostics.total,
      suspiciousCount: diagnostics.suspiciousCount,
      suspiciousExamples: diagnostics.suspiciousExamples,
      duplicateCount: diagnostics.duplicateCount,
      duplicateExamples: diagnostics.duplicateExamples,
      readableExamples: diagnostics.readableExamples,
    },
  };
}

function assessRoleQuality(params: {
  state: ProcessMiningAssistedV2State;
}): QualityDimensionAssessment {
  const stepObservations = params.state.observations.filter(item => item.kind === 'step');
  const roleCoverage = ratio(stepObservations.filter(item => normalizeFieldValue(item.role)).length, stepObservations.length);
  const metadata = analyzeMetadataLabels(stepObservations.map(item => item.role));
  const rationale: string[] = [];
  let score = roleCoverage * 75 + Math.min(metadata.total, 6) * 3 - metadata.suspiciousCount * 12;

  if (metadata.total === 0) {
    rationale.push('Es wurden noch keine Rollen an den Prozessschritten erkannt.');
  } else {
    rationale.push(`Rollenabdeckung auf Schrittniveau: ${Math.round(roleCoverage * 100)} %.`);
  }
  if (metadata.suspiciousCount > 0) {
    rationale.push(`${metadata.suspiciousCount} Rollenlabels wirken technisch oder fragmentiert.`);
  }

  return {
    key: 'roleQuality',
    label: 'Rollenqualität',
    score: clamp(score),
    status: statusFromScore(score),
    summary:
      metadata.total === 0
        ? 'Rollen fehlen bislang vollständig.'
        : metadata.suspiciousCount === 0
        ? 'Rollen sind überwiegend plausibel und lesbar erkannt.'
        : 'Rollen sind teilweise brauchbar, enthalten aber noch unklare oder fragmentierte Einträge.',
    rationale,
    observed: {
      stepCount: stepObservations.length,
      roleCoveragePct: clamp(roleCoverage * 100),
      uniqueRoles: metadata.labels,
      suspiciousRoleCount: metadata.suspiciousCount,
      suspiciousRoles: metadata.suspiciousExamples,
    },
  };
}

function assessSystemQuality(params: {
  state: ProcessMiningAssistedV2State;
}): QualityDimensionAssessment {
  const stepObservations = params.state.observations.filter(item => item.kind === 'step');
  const systemCoverage = ratio(stepObservations.filter(item => normalizeFieldValue(item.system)).length, stepObservations.length);
  const metadata = analyzeMetadataLabels(stepObservations.map(item => item.system));
  const rationale: string[] = [];
  let score = systemCoverage * 72 + Math.min(metadata.total, 6) * 3 - metadata.suspiciousCount * 12;

  if (metadata.total === 0) {
    rationale.push('Es wurden noch keine Systeme an den Prozessschritten erkannt.');
  } else {
    rationale.push(`Systemabdeckung auf Schrittniveau: ${Math.round(systemCoverage * 100)} %.`);
  }
  if (metadata.suspiciousCount > 0) {
    rationale.push(`${metadata.suspiciousCount} Systemlabels wirken fragmentiert oder technisch beschädigt.`);
  }

  return {
    key: 'systemQuality',
    label: 'Systemqualität',
    score: clamp(score),
    status: statusFromScore(score),
    summary:
      metadata.total === 0
        ? 'Systeme fehlen bislang vollständig.'
        : metadata.suspiciousCount === 0
        ? 'Systeme sind überwiegend plausibel und lesbar erkannt.'
        : 'Systeme sind teilweise brauchbar, enthalten aber noch unklare oder fragmentierte Einträge.',
    rationale,
    observed: {
      stepCount: stepObservations.length,
      systemCoveragePct: clamp(systemCoverage * 100),
      uniqueSystems: metadata.labels,
      suspiciousSystemCount: metadata.suspiciousCount,
      suspiciousSystems: metadata.suspiciousExamples,
    },
  };
}

function assessDomainConsistency(params: {
  state: ProcessMiningAssistedV2State;
}): QualityDimensionAssessment {
  const summary = params.state.lastDerivationSummary;
  const profile = summary?.sourceProfile;
  const primaryDomainKey = profile?.primaryDomainKey;
  const secondaryDomainKeys = profile?.secondaryDomainKeys ?? [];
  const scoreBoard = profile?.domainScores ?? [];
  const topScore = scoreBoard[0]?.score ?? 0;
  const secondScore = scoreBoard[1]?.score ?? 0;
  const foreignHints = detectForeignDomainHints({
    primaryDomainKey,
    secondaryDomainKeys,
    scoreBoard,
    suppressedSignals: profile?.domainGateSuppressedSignals ?? [],
    suppressedRoles: profile?.domainGateSuppressedRoles ?? [],
    suppressedSystems: profile?.domainGateSuppressedSystems ?? [],
    texts: [
      ...(summary?.issueSignals ?? []),
      ...(summary?.roles ?? []),
      ...(summary?.systems ?? []),
      ...params.state.observations.filter(item => item.kind === 'step').map(item => item.label),
    ],
  });
  const rationale: string[] = [];
  let score = 30;

  if (primaryDomainKey) {
    score += 40;
    rationale.push(`Primärdomäne erkannt: ${profile?.primaryDomainLabel ?? primaryDomainKey}.`);
  } else {
    rationale.push('Noch keine belastbare Primärdomäne erkannt.');
  }

  const dominanceGap = Math.max(0, topScore - secondScore);
  score += Math.min(dominanceGap * 2.5, 18);
  if (dominanceGap > 0) {
    rationale.push(`Domänendominanz: Abstand zwischen stärkster und nächster Domäne ${Math.round(dominanceGap)}.`);
  }

  if (secondaryDomainKeys.length > 0) {
    score += 4;
    rationale.push(`Sekundärdomänen berücksichtigt: ${(profile?.secondaryDomainLabels ?? secondaryDomainKeys).join(', ')}.`);
  }

  if (foreignHints.strongForeignCount > 0) {
    const strongPenalty = Math.min(foreignHints.strongForeignDomains.length * 14, 28);
    score -= strongPenalty;
    rationale.push(`${foreignHints.strongForeignCount} aktiv übernommene fachfremde Signale wirken noch domänenstörend.`);
  }
  if (foreignHints.weakForeignCount > 0) {
    const weakPenalty = Math.min(foreignHints.weakForeignDomains.length * 3, 9);
    score -= weakPenalty;
    rationale.push(`${foreignHints.weakForeignCount} schwache fachfremde Überschneidungen wurden beobachtet, aber geringer gewichtet.`);
  }

  const suppressedForeignCount = foreignHints.suppressedSignalCount + foreignHints.suppressedRoleCount + foreignHints.suppressedSystemCount;
  if (suppressedForeignCount > 0) {
    rationale.push(`${suppressedForeignCount} fachfremde Hinweise wurden ausgeblendet und nicht wie aktive Fremdsignale gewertet.`);
  }

  return {
    key: 'domainConsistency',
    label: 'Domänenkonsistenz',
    score: clamp(score),
    status: statusFromScore(score),
    summary:
      primaryDomainKey && foreignHints.strongForeignCount === 0
        ? 'Die Ergebnisse bleiben überwiegend im erkannten Domänenraum; schwache Fremdhinweise werden vorsichtig behandelt.'
        : 'Der Domänenraum ist erkennbar, enthält aber noch aktive fachfremde Überschneidungen.',
    rationale,
    observed: {
      primaryDomainKey,
      primaryDomainLabel: profile?.primaryDomainLabel,
      secondaryDomainKeys,
      domainScores: scoreBoard,
      primaryScore: foreignHints.primaryScore,
      dominanceGap: Math.round(dominanceGap),
      strongForeignDomains: foreignHints.strongForeignDomains,
      weakForeignDomains: foreignHints.weakForeignDomains,
      suppressedSignals: profile?.domainGateSuppressedSignals ?? [],
      suppressedRoles: profile?.domainGateSuppressedRoles ?? [],
      suppressedSystems: profile?.domainGateSuppressedSystems ?? [],
      issueSignals: summary?.issueSignals ?? [],
    },
  };
}

function assessEvidenceCoverage(params: {
  state: ProcessMiningAssistedV2State;
}): QualityDimensionAssessment {
  const stepObservations = params.state.observations.filter(item => item.kind === 'step');
  const evidenceBacked = stepObservations.filter(item => normalizeFieldValue(item.evidenceSnippet)).length;
  const evidenceCoverage = ratio(evidenceBacked, stepObservations.length);
  const profile = params.state.lastDerivationSummary?.sourceProfile;
  const rationale: string[] = [];
  let score = evidenceCoverage * 82 + Math.min(profile?.evidenceParagraphCount ?? 0, 6) * 3;

  if (stepObservations.length === 0) {
    rationale.push('Ohne Prozessschritte kann auch keine Belegabdeckung bewertet werden.');
  } else {
    rationale.push(`Belegabdeckung für Schritte: ${Math.round(evidenceCoverage * 100)} %.`);
  }
  if ((profile?.evidenceParagraphCount ?? 0) > 0) {
    rationale.push(`Zusätzliche Evidenzabschnitte erkannt: ${profile?.evidenceParagraphCount}.`);
  }

  return {
    key: 'evidenceCoverage',
    label: 'Evidenzabdeckung',
    score: clamp(score),
    status: statusFromScore(score),
    summary:
      evidenceCoverage >= 0.7
        ? 'Die meisten Schritte haben eine direkte Text- oder Tabellenstütze.'
        : evidenceCoverage > 0
        ? 'Ein Teil der Schritte ist belegt, die Abdeckung ist aber noch lückenhaft.'
        : 'Für die Schritte liegen kaum direkte Belegstellen vor.',
    rationale,
    observed: {
      stepCount: stepObservations.length,
      evidenceBackedSteps: evidenceBacked,
      evidenceCoveragePct: clamp(evidenceCoverage * 100),
      evidenceParagraphCount: profile?.evidenceParagraphCount ?? 0,
      evidenceExamples: compactList(stepObservations.map(item => item.evidenceSnippet), 6),
    },
  };
}

function assessCautionWithWeakMaterial(params: {
  state: ProcessMiningAssistedV2State;
  analysisMode: ReturnType<typeof detectProcessMiningAnalysisMode>;
  claimStrength: ReturnType<typeof getAnalysisClaimStrength>;
  analysisPositioning: {
    percentageGuidance: string;
    conformanceGuidance: string;
    claimNote: string;
  };
}): QualityDimensionAssessment {
  const summary = params.state.lastDerivationSummary;
  const profile = summary?.sourceProfile;
  const qualitySummary = params.state.qualitySummary;
  const caseCount = Math.max(
    params.state.cases.length,
    new Set(params.state.observations.map(item => item.sourceCaseId).filter(Boolean)).size,
  );
  const realTimeCoverage = ratio(
    params.state.observations.filter(item => item.kind === 'step' && item.timestampQuality === 'real').length,
    params.state.observations.filter(item => item.kind === 'step').length,
  );
  const weakSignals = [
    profile?.inputProfile === 'unclear',
    (profile?.processBearingSharePct ?? 0) <= 20,
    caseCount <= 1,
    realTimeCoverage < 0.3,
    summary?.confidence === 'low',
  ].filter(Boolean).length;

  const expectedClaimStrength = params.analysisMode === 'process-draft'
    ? 'draft-only'
    : params.analysisMode === 'exploratory-mining'
    ? 'cautious-comparison'
    : 'strong-mining';

  let score = params.claimStrength === expectedClaimStrength ? 78 : 30;
  const rationale: string[] = [];
  if (params.claimStrength === expectedClaimStrength) {
    rationale.push(`Claim-Stärke passt zum Analysemodus: ${params.claimStrength}.`);
  } else {
    rationale.push(`Claim-Stärke (${params.claimStrength}) passt nicht sauber zum Analysemodus (${params.analysisMode}).`);
  }

  const guidanceText = [
    params.analysisPositioning.claimNote,
    params.analysisPositioning.percentageGuidance,
    params.analysisPositioning.conformanceGuidance,
  ].join(' ');
  const cautionLanguagePresent = /vorsichtig|entwurf|hinweis|nicht als harte|zu stark|prozessentwurf/i.test(guidanceText);
  if (cautionLanguagePresent) {
    score += 12;
    rationale.push('Die Exportsprache markiert Unsicherheit und Entwurfscharakter sichtbar.');
  }

  const summaryText = JSON.stringify({
    discoverySummary: params.state.discoverySummary,
    conformanceSummary: params.state.conformanceSummary,
    enhancementSummary: params.state.enhancementSummary,
  });
  const hardPercentageLanguage = /\b\d+\s?%/i.test(summaryText);
  if (weakSignals >= 3 && hardPercentageLanguage) {
    score -= 18;
    rationale.push('Trotz schwacher Basis tauchen harte Prozentangaben in den Ergebnissen auf.');
  }

  if (weakSignals >= 3) {
    rationale.push('Die Materialbasis ist schwach oder klein und braucht deshalb besonders vorsichtige Aussagen.');
  }
  if ((qualitySummary?.totalCases ?? caseCount) <= 1 && params.analysisMode !== 'process-draft') {
    score -= 20;
    rationale.push('Einzeldokumente dürfen nicht wie belastbares Mining behandelt werden.');
  }

  return {
    key: 'cautionWithWeakMaterial',
    label: 'Vorsicht bei schwachem Material',
    score: clamp(score),
    status: statusFromScore(score),
    summary:
      params.analysisMode === 'process-draft' && params.claimStrength === 'draft-only'
        ? 'Schwaches oder einzelnes Material wird vorsichtig als Prozessentwurf behandelt.'
        : 'Die App sollte die Aussagekraft noch vorsichtiger und datenangemessener markieren.',
    rationale,
    observed: {
      analysisMode: params.analysisMode,
      claimStrength: params.claimStrength,
      caseCount: qualitySummary?.totalCases ?? caseCount,
      processBearingSharePct: profile?.processBearingSharePct ?? 0,
      realTimeCoveragePct: clamp(realTimeCoverage * 100),
      percentageGuidance: params.analysisPositioning.percentageGuidance,
      conformanceGuidance: params.analysisPositioning.conformanceGuidance,
      weakMaterialSignals: weakSignals,
    },
  };
}

function buildQualityAssessment(params: {
  state: ProcessMiningAssistedV2State;
  analysisMode: ReturnType<typeof detectProcessMiningAnalysisMode>;
  claimStrength: ReturnType<typeof getAnalysisClaimStrength>;
  analysisPositioning: {
    percentageGuidance: string;
    conformanceGuidance: string;
    claimNote: string;
  };
}) {
  const dimensions: QualityDimensionAssessment[] = [
    assessDocumentTypeRecognition({ state: params.state, analysisMode: params.analysisMode }),
    assessStructureFidelity({ state: params.state }),
    assessStepClarity({ state: params.state }),
    assessRoleQuality({ state: params.state }),
    assessSystemQuality({ state: params.state }),
    assessDomainConsistency({ state: params.state }),
    assessEvidenceCoverage({ state: params.state }),
    assessCautionWithWeakMaterial({
      state: params.state,
      analysisMode: params.analysisMode,
      claimStrength: params.claimStrength,
      analysisPositioning: params.analysisPositioning,
    }),
  ];

  const dimensionMap = new Map(dimensions.map(item => [item.key, item]));
  const coreScore = weightedAverage([
    { score: dimensionMap.get('documentTypeRecognition')?.score ?? 0, weight: 1.45 },
    { score: dimensionMap.get('structureFidelity')?.score ?? 0, weight: 1.35 },
    { score: dimensionMap.get('stepClarity')?.score ?? 0, weight: 1.35 },
    { score: dimensionMap.get('evidenceCoverage')?.score ?? 0, weight: 1.0 },
    { score: dimensionMap.get('cautionWithWeakMaterial')?.score ?? 0, weight: 1.1 },
  ]);
  const enrichmentScore = weightedAverage([
    { score: dimensionMap.get('roleQuality')?.score ?? 0, weight: 1.0 },
    { score: dimensionMap.get('systemQuality')?.score ?? 0, weight: 1.0 },
    { score: dimensionMap.get('domainConsistency')?.score ?? 0, weight: 1.1 },
  ]);
  const overallScore = clamp(coreScore * 0.75 + enrichmentScore * 0.25);

  const coreKeys = new Set<QualityDimensionKey>([
    'documentTypeRecognition',
    'structureFidelity',
    'stepClarity',
    'evidenceCoverage',
    'cautionWithWeakMaterial',
  ]);
  const blockerKeys = new Set<QualityDimensionKey>([
    'documentTypeRecognition',
    'structureFidelity',
    'stepClarity',
    'cautionWithWeakMaterial',
  ]);
  const strengths = dimensions.filter(item => item.score >= 85).map(item => item.label).slice(0, 4);
  const watchpoints = dimensions.filter(item => item.score < 70).map(item => item.label).slice(0, 5);
  const blockers = dimensions.filter(item => blockerKeys.has(item.key) && item.score < 45).map(item => item.label).slice(0, 4);
  const recommendedFocus = dimensions
    .slice()
    .sort((a, b) => {
      const aPenalty = coreKeys.has(a.key) ? 10 : 0;
      const bPenalty = coreKeys.has(b.key) ? 10 : 0;
      return (a.score - aPenalty) - (b.score - bPenalty);
    })
    .slice(0, 3)
    .map(item => item.label);

  const overallStatus = overallStatusFromDimensions({
    dimensions,
    overallScore,
    coreScore,
  });
  const overallSummary =
    overallStatus === 'strong'
      ? 'Der Export liefert eine starke und glaubwürdige Grundlage für eine externe Qualitätsbewertung.'
      : overallStatus === 'usable'
      ? 'Der Export ist brauchbar und in den Kerndimensionen tragfähig, bleibt aber in einzelnen Anreicherungen noch unvollständig.'
      : overallStatus === 'watch'
      ? 'Der Export ist für eine Detailbewertung nutzbar, zeigt aber noch sichtbare Schwächen oder Lücken in der Analysekette.'
      : 'Der Export zeigt echte Kernfehler in der aktuellen Analysequalität. Ergebnisse sind deshalb nur eingeschränkt belastbar.';

  return {
    overallScore,
    overallStatus,
    overallSummary,
    dimensions,
    strengths,
    watchpoints,
    blockers,
    recommendedFocus,
  };
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
  const issueCount = state.lastDerivationSummary?.issueSignals?.length ?? state.observations.filter(item => item.kind === 'issue').length;
  const realTimeCount = state.observations.filter(item => item.timestampQuality === 'real').length;
  const evidenceBackedSteps = state.observations.filter(item => item.kind === 'step' && Boolean(item.evidenceSnippet?.trim())).length;
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
  const analysisMode = detectProcessMiningAnalysisMode({
    cases: state.cases,
    observations: state.observations,
    lastDerivationSummary: state.lastDerivationSummary,
  });
  const caseCount = Math.max(state.cases.length, new Set(state.observations.map(item => item.sourceCaseId).filter(Boolean)).size);
  const claimStrength = getAnalysisClaimStrength(analysisMode, caseCount);

  const analysisPositioning = {
    analysisMode,
    claimStrength,
    claimNote: buildAnalysisClaimNote({ mode: analysisMode, caseCount }),
    percentageGuidance:
      claimStrength === 'strong-mining'
        ? 'Prozent- und Mengenangaben können hier deutlich belastbarer gelesen werden.'
        : claimStrength === 'cautious-comparison'
        ? 'Prozent- und Mengenangaben sollten hier nur vorsichtig als Fallvergleich gelesen werden.'
        : 'Prozent- und Mengenangaben wären hier zu stark. Der Stand ist vor allem als Prozessentwurf zu lesen.',
    conformanceGuidance:
      claimStrength === 'strong-mining'
        ? 'Soll-Abweichungen können hier als deutlich belastbarere Verteilung gelesen werden.'
        : claimStrength === 'cautious-comparison'
        ? 'Soll-Abweichungen sind hier als vorsichtige Vergleichshinweise zu lesen, nicht als harte Fehlerrate.'
        : 'Soll-Abweichungen sind hier nur Hinweise zur Schärfung des Entwurfs und keine Fehlerrate.',
  };

  const qualityAssessment = buildQualityAssessment({
    state,
    analysisMode,
    claimStrength,
    analysisPositioning,
  });
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
  const lastSummary = state.lastDerivationSummary;
  const warnings = lastSummary?.warnings ?? [];
  const stepLabels = lastSummary?.stepLabels ?? [];
  const roles = lastSummary?.roles ?? [];
  const systems = lastSummary?.systems ?? [];
  const docKind = lastSummary?.documentKind ?? 'unknown';
  const confidence = lastSummary?.confidence ?? 'low';
<<<<<<< ours
  const evidenceCoverageScore = stepCount > 0 ? evidenceBackedSteps / stepCount : 0;
  const conservativeTriggered = warnings.some(w => /konservative auswertung aktiv|vorläufiger prozessentwurf/i.test(w));
=======
  const conservativeTriggered = warnings.some(w => /konservative auswertung aktiv|vorläufiger prozessentwurf/i.test(w));
  const routingClass = lastSummary?.routingContext?.routingClass;
  const mode: 'process-draft' | 'comparison' | 'eventlog-table' | 'weak-raw-table' =
    routingClass === 'weak-raw-table'
      ? 'weak-raw-table'
      : routingClass === 'eventlog-table'
      ? 'eventlog-table'
      : state.cases.length > 1
      ? 'comparison'
      : 'process-draft';
  const tablePipeline = lastSummary?.tablePipeline;
  const weakStepRe = /^(mail|e-?mail|chat|kommentar|notiz|hinweis|offen|ticket|frage|status|todo)$/i;
  const activityRe = /\b(pr[üu]fen|bearbeiten|anlegen|validieren|freigeben|abstimmen|dokumentieren|versenden|zuordnen|abschlie[ßs]en|eskalieren|bereitstellen|bestellen|recherchieren|koordinieren)\b/i;
  const semanticStepShare = stepLabels.length > 0
    ? stepLabels.filter(label => label.length >= 6 && !weakStepRe.test(label) && activityRe.test(label)).length / stepLabels.length
    : 0;
  const evidenceCoverageScore = (() => {
    if (mode === 'eventlog-table') {
      const rowEvidence = tablePipeline?.rowEvidenceStats?.rowsWithEvidence ?? 0;
      const eventsCreated = tablePipeline?.rowEvidenceStats?.eventsCreated ?? 0;
      const mappingConfidence = (() => {
        const accepted = tablePipeline?.inferredSchema?.filter(item => item.accepted) ?? [];
        if (accepted.length === 0) return 0;
        return accepted.reduce((sum, item) => sum + item.confidence, 0) / accepted.length;
      })();
      return clamp01((rowEvidence / Math.max(stepCount, 1)) * 0.45 + (eventsCreated / Math.max(stepCount, 1)) * 0.25 + mappingConfidence * 0.3);
    }
    if (mode === 'weak-raw-table') {
      const weakSignals = tablePipeline?.rowEvidenceStats?.weakSignalsCreated ?? issueCount;
      const withAnchor = state.observations.filter(item => Boolean(item.evidenceSnippet?.trim())).length;
      return clamp01((withAnchor / Math.max(state.observations.length, 1)) * 0.6 + (weakSignals > 0 ? 0.3 : 0));
    }
    if (mode === 'comparison') {
      const multiCaseCoverage = state.cases.length > 1 ? Math.min(1, state.cases.length / 6) : 0;
      return clamp01((evidenceBackedSteps / Math.max(stepCount, 1)) * 0.7 + multiCaseCoverage * 0.3);
    }
    return clamp01(evidenceBackedSteps / Math.max(stepCount, 1));
  })();
  const cautionScore = (() => {
    const weakInput = mode === 'weak-raw-table' || docKind === 'weak-material' || warnings.some(w => /fallback|schwach|unsicher/i.test(w));
    const overClaim = weakInput && (confidence === 'high' || (mode === 'weak-raw-table' && stepCount > 2));
    if (weakInput) return overClaim ? 0.25 : 0.88;
    return conservativeTriggered ? 0.82 : 0.58;
  })();
  const structureScore = (() => {
    if (mode === 'eventlog-table') {
      const order = tablePipeline?.tableProfile?.rowOrderCoherence ?? 0.2;
      const caseC = tablePipeline?.tableProfile?.caseCoherence ?? 0.2;
      return clamp01((order + caseC) / 2);
    }
    if (mode === 'weak-raw-table') return clamp01((tablePipeline?.eventlogEligibility.eligible ? 0.2 : 0.65));
    return clamp01(stepLabels.length >= 6 ? 0.85 : stepLabels.length >= 3 ? 0.6 : 0.3);
  })();
  const docTypeScore = (() => {
    if (mode === 'eventlog-table') return clamp01(routingClass === 'eventlog-table' ? 0.88 : 0.45);
    if (mode === 'weak-raw-table') return clamp01(routingClass === 'weak-raw-table' ? 0.82 : 0.35);
    return clamp01(docKind === 'unknown' ? 0.25 : docKind === 'weak-material' ? 0.4 : 0.8);
  })();
>>>>>>> theirs

  const dimensionScores: ProcessMiningQualityExportFile['analysisResults']['qualityAssessment']['dimensions'] = [
    {
      key: 'documentTypeDetection',
      label: 'Dokumenttyp-Erkennung',
<<<<<<< ours
      score: clamp01(docKind === 'unknown' ? 0.25 : docKind === 'weak-material' ? 0.4 : 0.8),
      level: scoreToLevel(docKind === 'unknown' ? 0.25 : docKind === 'weak-material' ? 0.4 : 0.8),
      reason: `Erkannter Typ: ${docKind}.`,
=======
      score: docTypeScore,
      level: scoreToLevel(docTypeScore),
      reason: `Aktiver Modus ${mode}, Routing ${routingClass ?? 'unbekannt'}, Dokumenttyp ${docKind}.`,
>>>>>>> theirs
    },
    {
      key: 'structureFidelity',
      label: 'Strukturtreue',
<<<<<<< ours
      score: clamp01(stepLabels.length >= 6 ? 0.85 : stepLabels.length >= 3 ? 0.6 : 0.3),
      level: scoreToLevel(stepLabels.length >= 6 ? 0.85 : stepLabels.length >= 3 ? 0.6 : 0.3),
      reason: `${stepLabels.length} belastbare Schrittlabels in der letzten Ableitung.`,
=======
      score: structureScore,
      level: scoreToLevel(structureScore),
      reason: mode === 'eventlog-table'
        ? 'Strukturtreue aus Trace-/Case-Kohärenz der Tabelle.'
        : mode === 'weak-raw-table'
        ? 'Defensive Strukturbewertung für schwache Tabellenquellen.'
        : `${stepLabels.length} belastbare Schrittlabels in der letzten Ableitung.`,
>>>>>>> theirs
    },
    {
      key: 'stepClarity',
      label: 'Schrittklarheit',
<<<<<<< ours
      score: clamp01(stepLabels.length > 0 ? stepLabels.filter(label => label.trim().length >= 8).length / stepLabels.length : 0),
      level: scoreToLevel(stepLabels.length > 0 ? stepLabels.filter(label => label.trim().length >= 8).length / stepLabels.length : 0),
      reason: 'Bewertung anhand Länge und Nutzbarkeit der Schrittlabels.',
=======
      score: clamp01(semanticStepShare),
      level: scoreToLevel(semanticStepShare),
      reason: 'Semantische Prüfung auf Aktivitätscharakter, Fragmentfreiheit und Ausschluss schwacher Kanal-/Notizlabels.',
>>>>>>> theirs
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
<<<<<<< ours
      reason: `${evidenceBackedSteps}/${stepCount} Schritte haben Evidenzsnippets.`,
=======
      reason: mode === 'eventlog-table'
        ? 'Eventlog-Modus: Zeilenanker, Mapping-Konfidenz und Eventabdeckung kombiniert.'
        : mode === 'weak-raw-table'
        ? 'Weak-Table-Modus: Evidenz für Signale/Cluster statt erzwungener Prozessschritte.'
        : `${evidenceBackedSteps}/${stepCount} Schritte haben Evidenzsnippets.`,
>>>>>>> theirs
    },
    {
      key: 'conservativeHandling',
      label: 'Vorsicht bei schwachem Material',
<<<<<<< ours
      score: clamp01(conservativeTriggered ? 0.9 : confidence === 'low' ? 0.7 : 0.5),
      level: scoreToLevel(conservativeTriggered ? 0.9 : confidence === 'low' ? 0.7 : 0.5),
      reason: conservativeTriggered
        ? 'Konservative Auswertung wurde aktiv markiert.'
        : 'Keine explizite konservative Markierung in den Warnungen.',
    },
  ];
  const avg = dimensionScores.reduce((sum, item) => sum + item.score, 0) / Math.max(dimensionScores.length, 1);
  const overall = scoreToLevel(avg);
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
      score: clamp01(cautionScore),
      level: scoreToLevel(cautionScore),
      reason: cautionScore >= 0.75
        ? 'Claims sind zur Evidenzlage passend vorsichtig.'
        : 'Warnung: Claims wirken stärker als die belastbare Evidenzlage.',
    },
  ];
  const scoringProfiles: Record<typeof mode, { weights: Record<string, number>; evidenceTypes: string[]; blockerRules: string[] }> = {
    'process-draft': {
      weights: { documentTypeDetection: 0.12, structureFidelity: 0.16, stepClarity: 0.2, roleQuality: 0.1, systemQuality: 0.08, domainConsistency: 0.1, evidenceCoverage: 0.14, conservativeHandling: 0.1 },
      evidenceTypes: ['paragraph', 'list-item', 'section-block', 'table-support'],
      blockerRules: ['zu-wenig-schritte', 'niedrige-evidenzabdeckung', 'overclaiming-bei-schwacher-lage'],
    },
    comparison: {
      weights: { documentTypeDetection: 0.1, structureFidelity: 0.12, stepClarity: 0.16, roleQuality: 0.08, systemQuality: 0.06, domainConsistency: 0.14, evidenceCoverage: 0.2, conservativeHandling: 0.14 },
      evidenceTypes: ['episode-anchor', 'cross-case-support', 'local-context-window'],
      blockerRules: ['unzureichende-fallabdeckung', 'vergleich-ohne-evidenz', 'starke-claims-bei-niedriger-konsistenz'],
    },
    'eventlog-table': {
      weights: { documentTypeDetection: 0.1, structureFidelity: 0.2, stepClarity: 0.1, roleQuality: 0.08, systemQuality: 0.08, domainConsistency: 0.06, evidenceCoverage: 0.26, conservativeHandling: 0.12 },
      evidenceTypes: ['row-anchor', 'cell-anchor', 'trace-order', 'schema-mapping-confidence'],
      blockerRules: ['fehlende-case-oder-activity-spalte', 'kein-ordnungsanker', 'mapping-konflikte-hoch'],
    },
    'weak-raw-table': {
      weights: { documentTypeDetection: 0.14, structureFidelity: 0.14, stepClarity: 0.06, roleQuality: 0.06, systemQuality: 0.06, domainConsistency: 0.08, evidenceCoverage: 0.16, conservativeHandling: 0.3 },
      evidenceTypes: ['row-anchor', 'signal-cluster', 'missing-data-patterns'],
      blockerRules: ['pseudo-prozessschritte-aus-rohzeilen', 'overclaiming-bei-weak-table'],
    },
  };
  const activeProfile = scoringProfiles[mode];
  const weightedScore = dimensionScores.reduce((sum, item) => sum + item.score * (activeProfile.weights[item.key] ?? 0), 0);
  const confidenceAdjustments: string[] = [];
  let avg = weightedScore;
  if (mode === 'weak-raw-table' && confidence === 'high') {
    avg = Math.max(0, avg - 0.12);
    confidenceAdjustments.push('Abzug wegen starker Claims trotz weak-raw-table.');
  }
  if (mode === 'eventlog-table' && (tablePipeline?.eventlogEligibility.eligible ?? false) && confidence === 'low') {
    avg = Math.min(1, avg + 0.05);
    confidenceAdjustments.push('Moderater Bonus: Eventlog-Eignung erfüllt, Claim war eher vorsichtig.');
  }
  const blockerReasons = [
    ...(tablePipeline?.eventlogEligibility?.eligible === false ? [tablePipeline.eventlogEligibility.fallbackReason ?? 'Eventlog-Mindeststruktur nicht erfüllt.'] : []),
    ...(semanticStepShare < 0.35 && mode !== 'weak-raw-table' ? ['Semantische Schrittklarheit kritisch niedrig.'] : []),
    ...(evidenceCoverageScore < 0.35 ? ['Evidenzabdeckung im aktiven Modus zu niedrig.'] : []),
    ...(cautionScore < 0.4 ? ['Unzureichende Vorsicht gegenüber schwacher Materiallage.'] : []),
  ];
  const overall = scoreToLevel(avg);
>>>>>>> theirs

  return {
    schemaVersion: 'pm-analysis-quality-export-v2',
    exportedAt: new Date().toISOString(),
    appVersion: `${APP_VERSION_LABEL} (${APP_SEMVER})`,
    purpose: 'Dieser Export beschreibt ausschließlich den aktuellen Analysezustand des Materials, das in der App ausgewertet wurde.',
    note: 'Keine eingebauten Referenzfälle, keine automatische Testbibliothek. Gedacht für externe Qualitätsbewertung zusammen mit den separat geprüften Beispieldokumenten.',
    assessmentGuide: {
      intent: 'Der Export ist so strukturiert, dass eine externe Qualitätsbewertung schon mit einem einzelnen Testfall möglich ist.',
      evaluationOrder: [
        'Zuerst qualityAssessment.overallScore und overallStatus lesen.',
        'Dann qualityAssessment.dimensions in der Reihenfolge Dokumenttyp, Strukturtreue, Schrittklarheit, Rollen, Systeme, Domänenkonsistenz, Evidenz, Vorsicht bei schwachem Material prüfen.',
        'Anschließend analysisResults.lastDerivationSummary, sourceMaterial.observations und qualityControl zur Detailprüfung heranziehen.',
      ],
      statusScale: [
        { status: 'strong', meaning: 'starke Grundlage für belastbare Detailbewertung' },
        { status: 'usable', meaning: 'brauchbar und in den Kerndimensionen tragfähig, aber noch unvollständig' },
        { status: 'watch', meaning: 'bewertbar, aber mit deutlich sichtbaren Schwächen oder Lücken' },
        { status: 'critical', meaning: 'kritisch fehlerhafter Kernzustand; Ergebnisse nur eingeschränkt belastbar' },
      ],
      interpretationHints: [
        'Einzeldokumente sollten als Prozessentwurf und nicht als belastbares Mining gelesen werden.',
        'Schwaches Material muss vorsichtig bewertet werden. Hohe Vorsicht ist hier ein Qualitätsmerkmal, kein Fehler.',
        'Die Dimensionen enthalten jeweils observed-Daten und rationale-Hinweise, damit eine externe Bewertung direkt aus einem Export möglich ist.',
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
    },
    qualityControlDefinition: [
      {
        key: 'document-and-structure',
        label: 'Dokumenttyp und Strukturqualität',
        checks: [
          'Wird der Dokumenttyp fachlich plausibel erkannt?',
          'Werden Tabellen, Listen und strukturierte Abschnitte sauber in Prozessschritte überführt?',
        ],
      },
      {
        key: 'semantic-quality',
        label: 'Semantische Extraktionsqualität',
        checks: [
          'Sind Schritte, Rollen, Systeme und Domäne fachlich lesbar und konsistent?',
          'Gibt es genügend Evidenz und ausreichend vorsichtige Aussagen bei schwacher Datenbasis?',
        ],
      },
      {
        key: 'operational-context',
        label: 'Kontext, Reife und Weitergabe',
        checks: [
          'Wie tragfähig sind Datenreife, Governance, Sicherheit und Freigabereife?',
          'Bleibt der Arbeitsstand trotz möglicher Schwächen technisch konsistent und review-fähig?',
        ],
      },
    ],
    qualityAssessment,
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
    analysisPositioning,
    analysisResults: {
      qualitySummary: state.qualitySummary,
      lastDerivationSummary: state.lastDerivationSummary,
<<<<<<< ours
<<<<<<< ours
=======
      tablePipeline: lastSummary?.tablePipeline,
>>>>>>> theirs
=======
      tablePipeline: lastSummary?.tablePipeline,
>>>>>>> theirs
      routing: lastSummary?.routingContext
        ? {
            routingClass: lastSummary.routingContext.routingClass,
            routingConfidence: lastSummary.routingContext.routingConfidence,
            routingSignals: lastSummary.routingContext.routingSignals,
            fallbackReason: lastSummary.routingContext.fallbackReason,
          }
        : undefined,
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
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
                rejectionReason: candidate.rejectionReason,
                downgradeReason: candidate.downgradeReason,
                evidenceAnchor: candidate.evidenceAnchor,
              })),
          }
        : undefined,
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
      discoverySummary: state.discoverySummary,
      conformanceSummary: state.conformanceSummary,
      enhancementSummary: state.enhancementSummary,
      reportSnapshot: state.reportSnapshot,
      handoverDrafts: state.handoverDrafts,
      qualityAssessment: {
<<<<<<< ours
=======
        scoringProfile: {
          mode,
          weights: activeProfile.weights,
          evidenceTypes: activeProfile.evidenceTypes,
          blockerRules: activeProfile.blockerRules,
        },
        scoringReasons: [
          `Mode-spezifische Gewichtung aktiv: ${mode}.`,
          `Routing-Klasse: ${routingClass ?? 'unbekannt'}.`,
          `Semantische Schrittklarheit: ${(semanticStepShare * 100).toFixed(0)}%.`,
        ],
        blockerReasons,
        confidenceAdjustments,
>>>>>>> theirs
        overall,
        dimensions: dimensionScores,
      },
    },
    sourceMaterial: {
      cases: state.cases,
      observations: state.observations.filter(item => item.kind === 'step'),
      supportSignals: state.lastDerivationSummary?.issueEvidence ?? [],
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
