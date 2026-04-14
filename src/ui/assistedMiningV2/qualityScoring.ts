import type {
  DerivationSummary,
  ExtractionCandidate,
  ProcessMiningAnalysisMode,
  ProcessMiningAssistedV2State,
  ProcessMiningObservation,
  ProcessVersion,
  SourceRoutingClass,
  TableColumnMapping,
  TableColumnSemanticType,
} from '../../domain/process';
import {
  buildAnalysisClaimNote,
  buildVerifiedAnalysisFacts,
  detectProcessMiningAnalysisMode,
  getAnalysisClaimStrength,
  normalizeWhitespace,
  uniqueStrings,
  type AnalysisClaimStrength,
} from './pmShared';
import { atomizeStructuredValues } from './structuredValueHygiene';

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
export type QualityScoringProfileMode = 'process-draft' | 'comparison' | 'eventlog-table' | 'weak-raw-table';

export interface QualityDimensionAssessment {
  key: QualityDimensionKey;
  label: string;
  score: number;
  status: QualityDimensionStatus;
  summary: string;
  rationale: string[];
  interpretation: string;
  applicableEvidenceTypes: string[];
  scoringReasons: string[];
  blockerReasons: string[];
  confidenceAdjustments: string[];
  observed: Record<string, unknown>;
}

export interface QualityScoringProfileSnapshot {
  mode: QualityScoringProfileMode;
  label: string;
  analysisMode: ProcessMiningAnalysisMode;
  routingClass?: SourceRoutingClass;
  pipelineMode?: NonNullable<DerivationSummary['tablePipeline']>['pipelineMode'];
  dimensionWeights: Array<{ key: QualityDimensionKey; label: string; weight: number }>;
  validEvidenceTypes: string[];
  minimumRequirements: string[];
  highScoreRequirements: string[];
  blockerRules: string[];
  dimensionInterpretation: Array<{ key: QualityDimensionKey; label: string; interpretation: string }>;
  scoringReasons: string[];
  blockerReasons: string[];
  confidenceAdjustments: string[];
}

export interface ClaimCalibration {
  nominalClaimStrength: AnalysisClaimStrength;
  effectiveClaimStrength: AnalysisClaimStrength;
  fit: 'aligned' | 'overclaim-risk' | 'underclaim-risk';
  reason: string;
}

export interface QualityAssessmentBundle {
  analysisMode: ProcessMiningAnalysisMode;
  claimStrength: AnalysisClaimStrength;
  nominalClaimStrength: AnalysisClaimStrength;
  claimNote: string;
  nominalClaimNote: string;
  claimCalibration: ClaimCalibration;
  overallScore: number;
  overallStatus: QualityDimensionStatus;
  overallSummary: string;
  overallLevel: 'high' | 'medium' | 'low';
  dimensions: QualityDimensionAssessment[];
  strengths: string[];
  watchpoints: string[];
  blockers: string[];
  recommendedFocus: string[];
  scoringProfile: QualityScoringProfileSnapshot;
}

type QualityScoringProfileDefinition = {
  label: string;
  dimensionWeights: Record<QualityDimensionKey, number>;
  validEvidenceTypes: string[];
  minimumRequirements: string[];
  highScoreRequirements: string[];
  blockerRules: string[];
  dimensionInterpretation: Record<QualityDimensionKey, string>;
};

type SemanticStepStats = {
  averageUsability: number;
  strongShare: number;
  weakShare: number;
  activityShare: number;
  contextBackedShare: number;
  evidenceBackedShare: number;
  communicationOnlyShare: number;
  fragmentShare: number;
  duplicatePressure: number;
};

type QualityScoringContext = {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
  summary?: DerivationSummary;
  quality?: ProcessMiningAssistedV2State['qualitySummary'];
  steps: ProcessMiningObservation[];
  candidates: ExtractionCandidate[];
  analysisMode: ProcessMiningAnalysisMode;
  scoringMode: QualityScoringProfileMode;
  profile: QualityScoringProfileDefinition;
  routingClass?: SourceRoutingClass;
  pipelineMode?: NonNullable<DerivationSummary['tablePipeline']>['pipelineMode'];
  caseCount: number;
  routingConfidenceValue: number;
  derivationConfidenceValue: number;
  mergedCoreSteps: number;
  rejectedCoreSteps: number;
  supportOnlyCandidates: number;
  weakFragmentCount: number;
  localRoleAssignments: number;
  localSystemAssignments: number;
  semanticStepStats: SemanticStepStats;
  nominalClaimStrength: AnalysisClaimStrength;
  claimStrength: AnalysisClaimStrength;
  claimCalibration: ClaimCalibration;
  claimNote: string;
  nominalClaimNote: string;
};

const ACTIVITY_RE = /\b(pr[üu]f|erfass|anleg|bearbeit|freigeb|versend|validier|abschlie[ßs]|weiterleit|dokumentier|informier|eskalier|zuordn|bewert|bestell|übernehm|uebernehm|start|beend|genehmig|ablehn|aktualisier|abgleich|klär|klaer|mapp|merge|split|import|export|review|approve|reject|create|update|close|open|assign|submit)\w*/i;
const PROCESS_OBJECT_RE = /\b(anfrage|auftrag|bestellung|rechnung|freigabe|meldung|fall|ticket|retoure|onboarding|stammdaten|reklamation|incident|zugang|prüfung|pruefung|abschluss|antrag|lieferung|konto|kunde)\b/i;
const COMMUNICATION_ONLY_RE = /\b(mail|e-?mail|chat|telefon|anruf|kommentar|notiz|nachricht)\b/i;
const WEAK_LABEL_RE = /^(mail|e-?mail|chat|kommentar|notiz|hinweis|offen|ticket|frage|status|todo)$/i;
const FRAGMENT_RE = /\?|(^|[\s:])(offen|todo|notiz|hinweis|kommentar|frage|status|unklar)([\s.]|$)/i;

const DIMENSION_LABELS: Record<QualityDimensionKey, string> = {
  documentTypeRecognition: 'Dokumenttyp-Erkennung',
  structureFidelity: 'Strukturtreue',
  stepClarity: 'Schrittklarheit',
  roleQuality: 'Rollenqualität',
  systemQuality: 'Systemqualität',
  domainConsistency: 'Domänenkonsistenz',
  evidenceCoverage: 'Evidenzabdeckung',
  cautionWithWeakMaterial: 'Vorsicht bei schwachem Material',
};

const PROFILE_DEFINITIONS: Record<QualityScoringProfileMode, QualityScoringProfileDefinition> = {
  'process-draft': {
    label: 'Prozessentwurf',
    dimensionWeights: {
      documentTypeRecognition: 0.18,
      structureFidelity: 0.16,
      stepClarity: 0.19,
      roleQuality: 0.09,
      systemQuality: 0.07,
      domainConsistency: 0.1,
      evidenceCoverage: 0.13,
      cautionWithWeakMaterial: 0.08,
    },
    validEvidenceTypes: ['Textspanne', 'Absatz', 'Listenpunkt', 'strukturierter Block', 'lokaler Kontextanker'],
    minimumRequirements: [
      'Mindestens ein evidenzgestützter Kernschritt.',
      'Lokale Kontextanker für wesentliche Schritte.',
      'Keine starken Mining-Claims bei Einzelquelle oder Entwurfsmodus.',
    ],
    highScoreRequirements: [
      'Konsistente Dokumentklassifikation und belastbare lokale Evidenz.',
      'Semantisch brauchbare Kernschritte ohne Fragmentreste.',
      'Rollen- und Systembezüge sind lokal verankert statt lose verteilt.',
    ],
    blockerRules: [
      'Keine belastbaren Kernschritte trotz vorhandener Quelle.',
      'Kernschritte bleiben semantisch zu schwach oder zu notizhaft.',
      'Die Evidenzbasis ist zu dünn für einen tragfähigen Prozessentwurf.',
    ],
    dimensionInterpretation: {
      documentTypeRecognition: 'Bewertet die Klarheit der Quellenklassifikation und ob der Prozessentwurf zur Materialart passt.',
      structureFidelity: 'Bewertet, ob aus dem Dokument ein anschlussfähiger Ablauf entsteht, ohne Struktur zu erfinden.',
      stepClarity: 'Bewertet semantische Brauchbarkeit von Kernschritten statt glatter Oberflächenlabels.',
      roleQuality: 'Bewertet lokal verankerte Rollen statt globale Rollentreffer.',
      systemQuality: 'Bewertet lokal verankerte Systembezüge statt bloßer Systemnennungen.',
      domainConsistency: 'Bewertet, ob Domäne, Quellprofil und Prozesssprache ohne Widersprüche zusammenpassen.',
      evidenceCoverage: 'Bewertet Textanker, Kontextfenster und strukturelle Belege für den Entwurfsmodus.',
      cautionWithWeakMaterial: 'Bewertet, ob der Entwurfsmodus bei schwachen Quellen bewusst zurückhaltend bleibt.',
    },
  },
  comparison: {
    label: 'Fallvergleich',
    dimensionWeights: {
      documentTypeRecognition: 0.14,
      structureFidelity: 0.18,
      stepClarity: 0.16,
      roleQuality: 0.08,
      systemQuality: 0.07,
      domainConsistency: 0.08,
      evidenceCoverage: 0.16,
      cautionWithWeakMaterial: 0.13,
    },
    validEvidenceTypes: ['lokale Textstütze', 'Episodenanker', 'Mehrfallabdeckung', 'Kontextfenster', 'Stabilitätsmuster'],
    minimumRequirements: [
      'Mindestens zwei auswertbare Quellen oder Fälle.',
      'Lokale Evidenz pro Fall statt bloßer Aggregation.',
      'Vergleichsaussagen bleiben vorsichtig, solange Fallbasis und Stabilität begrenzt sind.',
    ],
    highScoreRequirements: [
      'Mehrfallmuster sind sichtbar und semantisch anschlussfähig.',
      'Evidenz deckt mehrere Fälle mit lokalem Kontext ab.',
      'Claim-Stärke bleibt beim Vergleich unterhalb harter Mining-Behauptungen.',
    ],
    blockerRules: [
      'Vergleich wird behauptet, obwohl die Mehrfallbasis zu dünn bleibt.',
      'Evidenz deckt nur Einzelstellen statt wiederkehrende Muster ab.',
      'Die App klingt stärker als die tatsächliche Vergleichsbasis trägt.',
    ],
    dimensionInterpretation: {
      documentTypeRecognition: 'Bewertet die Stabilität der Quellenklassifikation über mehrere Fälle hinweg.',
      structureFidelity: 'Bewertet, ob Vergleichsrahmen, Reihenfolge und Mehrfallmuster wirklich zusammenpassen.',
      stepClarity: 'Bewertet, ob konsolidierte Schrittmuster semantisch als Ablauf brauchbar bleiben.',
      roleQuality: 'Bewertet Rollenbezüge über mehrere Fälle nur dann positiv, wenn sie lokal verankert bleiben.',
      systemQuality: 'Bewertet Systembezüge im Vergleich nur mit lokaler oder wiederkehrender Evidenz.',
      domainConsistency: 'Bewertet, ob die Fälle in einem glaubwürdigen fachlichen Rahmen vergleichbar bleiben.',
      evidenceCoverage: 'Bewertet Mehrfallabdeckung, lokale Episodenanker und Vergleichsstabilität.',
      cautionWithWeakMaterial: 'Bewertet, ob Vergleichsclaims unter unsicherer Datenlage zurückhaltend bleiben.',
    },
  },
  'eventlog-table': {
    label: 'Eventlog-/Tabellenanalyse',
    dimensionWeights: {
      documentTypeRecognition: 0.12,
      structureFidelity: 0.22,
      stepClarity: 0.12,
      roleQuality: 0.09,
      systemQuality: 0.08,
      domainConsistency: 0.05,
      evidenceCoverage: 0.2,
      cautionWithWeakMaterial: 0.12,
    },
    validEvidenceTypes: ['Zeilenanker', 'Zellanker', 'Trace-Abdeckung', 'Case-Kohärenz', 'Mappingsicherheit', 'Event-Normalisierung'],
    minimumRequirements: [
      'Belastbarer Activity-Kanal.',
      'Belastbarer Case-Anker oder defensiv rekonstruierbare Single-Case-Struktur.',
      'Zeit- oder Sequenzanker und nachvollziehbare Ereignisfolgen.',
    ],
    highScoreRequirements: [
      'Schema-Inferenz ist belastbar und transparent.',
      'Normalisierte Events decken die Kernzeilen mit klaren Evidenzankern ab.',
      'Claim-Stärke passt zur tatsächlichen Eventstruktur und Fallbasis.',
    ],
    blockerRules: [
      'Die Mindeststruktur für echtes Eventlog-Mining ist nicht erfüllt.',
      'Schema- oder Ordnungsanker bleiben zu schwach für belastbare Ablaufaussagen.',
      'Die App würde Tabellen zu stark interpretieren oder unpassend untertreiben.',
    ],
    dimensionInterpretation: {
      documentTypeRecognition: 'Bewertet im Tabellenmodus Quellklassifikation, Schemafidelity und operative Pfadwahl statt Dokumentprosa.',
      structureFidelity: 'Bewertet Eventstruktur, Spurenkohärenz, Reihenfolge und Event-Normalisierung.',
      stepClarity: 'Bewertet Aktivitätssemantik der normalisierten Events statt formale Lesbarkeit von Labels.',
      roleQuality: 'Bewertet Rollen und Ressourcen nur mit zeilen- oder zellverankerter Zuordnung.',
      systemQuality: 'Bewertet Systemzuordnungen nur mit belastbaren Spaltenmappings und Zeilenankern.',
      domainConsistency: 'Bewertet, ob Tabellensemantik, Routing und operative Interpretation ohne Widerspruch zusammenpassen.',
      evidenceCoverage: 'Bewertet Zeilenanker, Zellanker, Mappingkonfidenz und Trace-Abdeckung.',
      cautionWithWeakMaterial: 'Bewertet, ob echte Eventstruktur genutzt wird, ohne Tabellen aggressiv zu überdehnen.',
    },
  },
  'weak-raw-table': {
    label: 'Schwache Tabellenanalyse',
    dimensionWeights: {
      documentTypeRecognition: 0.14,
      structureFidelity: 0.16,
      stepClarity: 0.06,
      roleQuality: 0.05,
      systemQuality: 0.05,
      domainConsistency: 0.04,
      evidenceCoverage: 0.2,
      cautionWithWeakMaterial: 0.3,
    },
    validEvidenceTypes: ['Zeilenanker', 'Zellanker', 'Signalcluster', 'Statusmuster', 'Fallback-Begründung', 'Datendefizit-Hinweise'],
    minimumRequirements: [
      'Schwaches Material wird explizit als weak-raw-table geführt.',
      'Es werden keine pseudo-stabilen Kernschritte erzwungen.',
      'Signale bleiben evidenzverankert und vorsichtig klassifiziert.',
    ],
    highScoreRequirements: [
      'Routing und Export zeigen die defensive Einordnung transparent.',
      'Signalspuren sind verankert, ohne Ablauf vorzutäuschen.',
      'Claim-Stärke bleibt klar unter harten Mining-Aussagen.',
    ],
    blockerRules: [
      'Schwaches Tabellenmaterial wird dennoch als harter Ablauf verkauft.',
      'Kurzlabels oder Rohfragmente werden als Kernschritte finalisiert.',
      'Fallback- und Signaltransparenz fehlen trotz schwacher Struktur.',
    ],
    dimensionInterpretation: {
      documentTypeRecognition: 'Bewertet, ob die App schwache Tabellen wirklich als schwach erkennt und nicht schönklassifiziert.',
      structureFidelity: 'Bewertet defensive Strukturtreue: kein erfundener Ablauf, klare Fallback-Entscheidung, sichtbare Signalspur.',
      stepClarity: 'Bewertet im weak-raw-table-Modus vor allem den Verzicht auf pseudo-klare Kernschritte.',
      roleQuality: 'Bewertet vorsichtige Rollenhinweise positiv, ohne fehlende Kernzuordnungen zu bestrafen.',
      systemQuality: 'Bewertet vorsichtige Systemhinweise positiv, ohne Scheingenauigkeit zu belohnen.',
      domainConsistency: 'Bewertet, ob Routing, Signaldeutung und semantische Zurückhaltung zusammenpassen.',
      evidenceCoverage: 'Bewertet Signalanker, Mappingtransparenz und sichtbare Datendefizite statt Prozessschrittparagrafen.',
      cautionWithWeakMaterial: 'Bewertet, ob die App bewusst schwach bleibt, wenn die Tabelle keine harte Ablaufstruktur trägt.',
    },
  },
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ratio(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return part / whole;
}

export function levelFromScore(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

function statusFromScore(score: number): QualityDimensionStatus {
  if (score >= 85) return 'strong';
  if (score >= 68) return 'usable';
  if (score >= 45) return 'watch';
  return 'critical';
}

function compactList(values: Array<string | undefined | null>, max = 6): string[] {
  return uniqueStrings(values).slice(0, max);
}

function confidenceValue(value?: 'high' | 'medium' | 'low'): number {
  if (value === 'high') return 0.92;
  if (value === 'medium') return 0.68;
  if (value === 'low') return 0.34;
  return 0.2;
}

function getStepObservations(state: ProcessMiningAssistedV2State): ProcessMiningObservation[] {
  return state.observations.filter(observation => observation.kind === 'step');
}

function findBestMapping(
  summary: DerivationSummary | undefined,
  semanticTypes: TableColumnSemanticType[],
): TableColumnMapping | undefined {
  return (summary?.tablePipeline?.acceptedColumnMappings ?? summary?.tablePipeline?.inferredSchema ?? [])
    .filter(mapping => semanticTypes.includes(mapping.inferredSemanticType) && mapping.accepted)
    .sort((left, right) => right.confidence - left.confidence)[0];
}

function detectScoringMode(params: {
  analysisMode: ProcessMiningAnalysisMode;
  summary?: DerivationSummary;
}): QualityScoringProfileMode {
  const routingClass = params.summary?.routingContext?.routingClass;
  const pipelineMode = params.summary?.tablePipeline?.pipelineMode;
  if (pipelineMode === 'weak-raw-table' || routingClass === 'weak-raw-table') return 'weak-raw-table';
  if (pipelineMode === 'eventlog-table' || routingClass === 'eventlog-table') return 'eventlog-table';
  if (params.analysisMode === 'exploratory-mining' || params.analysisMode === 'true-mining') return 'comparison';
  return 'process-draft';
}

function expectedDocumentClassForRouting(
  routingClass?: SourceRoutingClass,
): NonNullable<NonNullable<DerivationSummary['sourceProfile']>['documentClass']> | undefined {
  switch (routingClass) {
    case 'structured-procedure':
      return 'structured-target-procedure';
    case 'semi-structured-procedure':
      return 'semi-structured-procedure';
    case 'narrative-case':
      return 'narrative-case';
    case 'mixed-document':
      return 'mixed-document';
    case 'weak-raw-table':
      return 'weak-material';
    default:
      return undefined;
  }
}

function isRoutingDocumentClassConsistent(summary?: DerivationSummary): boolean {
  const routingClass = summary?.routingContext?.routingClass;
  const documentClass = summary?.sourceProfile?.documentClass;
  const expectedDocumentClass = expectedDocumentClassForRouting(routingClass);
  if (!expectedDocumentClass || !documentClass) return true;
  return expectedDocumentClass === documentClass;
}

function isScoringModeConsistent(params: {
  scoringMode: QualityScoringProfileMode;
  summary?: DerivationSummary;
}): boolean {
  const routingClass = params.summary?.routingContext?.routingClass;
  if (!routingClass) return true;
  if (routingClass === 'eventlog-table') return params.scoringMode === 'eventlog-table';
  if (routingClass === 'weak-raw-table') return params.scoringMode === 'weak-raw-table';
  return params.scoringMode === 'process-draft' || params.scoringMode === 'comparison';
}

function hasStructuredSourceConflict(summary?: DerivationSummary): boolean {
  if (!summary?.structuredPreserveApplied) return false;
  const explicitStructuredStepCount = summary.explicitStructuredStepCount ?? 0;
  const preservedStructuredStepCount = summary.preservedStructuredStepCount ?? 0;
  if (explicitStructuredStepCount > 0 && preservedStructuredStepCount < explicitStructuredStepCount) return true;
  return Boolean(summary.structuredRecallLoss);
}

function atomicEntityValuesForStep(step: ProcessMiningObservation, kind: 'role' | 'system'): string[] {
  return atomizeStructuredValues(
    kind === 'role'
      ? [
          ...(step.roles ?? []),
          ...(step.explicitRoles ?? []),
          ...(step.inferredRoles ?? []),
          step.primaryRole,
          step.role,
        ]
      : [
          ...(step.systems ?? []),
          ...(step.explicitSystems ?? []),
          ...(step.inferredSystems ?? []),
          step.primarySystem,
          step.system,
        ],
  );
}

function candidateMap(candidates: ExtractionCandidate[]): Map<string, ExtractionCandidate> {
  return new Map(candidates.map(candidate => [candidate.candidateId, candidate]));
}

function semanticStepScore(
  step: ProcessMiningObservation,
  candidate: ExtractionCandidate | undefined,
  frequency: Map<string, number>,
): number {
  const label = normalizeWhitespace(step.label);
  const evidence = normalizeWhitespace(candidate?.evidenceAnchor ?? step.evidenceAnchor ?? step.evidenceSnippet ?? '');
  const context = normalizeWhitespace(candidate?.contextWindow ?? step.contextWindow ?? evidence);
  const text = `${label} ${context}`.trim();
  const wordCount = label ? label.split(/\s+/).length : 0;
  const duplicatePenalty = (frequency.get(label.toLowerCase()) ?? 0) > 2 ? 0.08 : 0;
  let score = 0.18;

  if (candidate?.status === 'merged') score += 0.24;
  if (ACTIVITY_RE.test(text)) score += 0.22;
  if (PROCESS_OBJECT_RE.test(text)) score += 0.08;
  if (wordCount >= 2 && wordCount <= 7) score += 0.08;
  if (evidence.length >= 12) score += 0.08;
  if (context.length >= 20) score += 0.08;
  if (!WEAK_LABEL_RE.test(label) && !FRAGMENT_RE.test(text)) score += 0.08;

  if (COMMUNICATION_ONLY_RE.test(label) && !ACTIVITY_RE.test(text)) score -= 0.22;
  if (WEAK_LABEL_RE.test(label)) score -= 0.24;
  if (FRAGMENT_RE.test(text)) score -= 0.18;
  if (wordCount <= 1 || label.length < 6) score -= 0.08;
  if (label.length > 80) score -= 0.06;
  score -= duplicatePenalty;

  return clamp01(score);
}

function buildSemanticStepStats(params: {
  steps: ProcessMiningObservation[];
  candidates: ExtractionCandidate[];
}): SemanticStepStats {
  const steps = params.steps;
  if (steps.length === 0) {
    return {
      averageUsability: 0,
      strongShare: 0,
      weakShare: 0,
      activityShare: 0,
      contextBackedShare: 0,
      evidenceBackedShare: 0,
      communicationOnlyShare: 0,
      fragmentShare: 0,
      duplicatePressure: 0,
    };
  }

  const byId = candidateMap(params.candidates);
  const frequency = new Map<string, number>();
  steps.forEach(step => {
    const key = normalizeWhitespace(step.label).toLowerCase();
    if (!key) return;
    frequency.set(key, (frequency.get(key) ?? 0) + 1);
  });

  const scores = steps.map(step => semanticStepScore(step, step.candidateId ? byId.get(step.candidateId) : undefined, frequency));
  return {
    averageUsability: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    strongShare: ratio(scores.filter(score => score >= 0.68).length, scores.length),
    weakShare: ratio(scores.filter(score => score < 0.42).length, scores.length),
    activityShare: ratio(steps.filter(step => ACTIVITY_RE.test(`${step.label} ${step.evidenceSnippet ?? ''}`)).length, steps.length),
    contextBackedShare: ratio(
      steps.filter(step => normalizeWhitespace(byId.get(step.candidateId ?? '')?.contextWindow ?? step.contextWindow ?? '').length >= 20).length,
      steps.length,
    ),
    evidenceBackedShare: ratio(
      steps.filter(step => normalizeWhitespace(byId.get(step.candidateId ?? '')?.evidenceAnchor ?? step.evidenceSnippet ?? '').length >= 12).length,
      steps.length,
    ),
    communicationOnlyShare: ratio(steps.filter(step => COMMUNICATION_ONLY_RE.test(step.label)).length, steps.length),
    fragmentShare: ratio(
      steps.filter(step => FRAGMENT_RE.test(`${step.label} ${step.evidenceSnippet ?? ''}`) || WEAK_LABEL_RE.test(step.label)).length,
      steps.length,
    ),
    duplicatePressure: ratio(
      Array.from(frequency.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0),
      steps.length,
    ),
  };
}

function effectiveClaimStrength(params: {
  scoringMode: QualityScoringProfileMode;
  caseCount: number;
  summary?: DerivationSummary;
}): AnalysisClaimStrength {
  if (params.scoringMode === 'weak-raw-table' || params.scoringMode === 'process-draft') return 'draft-only';
  if (params.scoringMode === 'comparison') return params.caseCount >= 2 ? 'cautious-comparison' : 'draft-only';

  const tablePipeline = params.summary?.tablePipeline;
  const traceStats = tablePipeline?.traceStats;
  const mappingConfidence = tablePipeline?.mappingConfidence ?? 0;
  const orderedTraceShare = traceStats?.orderedTraceShare ?? 0;
  const eligible = tablePipeline?.eventlogEligibility.eligible ?? false;
  if (eligible && params.caseCount >= 8 && mappingConfidence >= 0.68 && orderedTraceShare >= 0.62) {
    return 'strong-mining';
  }
  if (eligible) return 'cautious-comparison';
  return 'draft-only';
}

function buildClaimCalibration(params: {
  nominal: AnalysisClaimStrength;
  effective: AnalysisClaimStrength;
  scoringMode: QualityScoringProfileMode;
}): ClaimCalibration {
  const rank = { 'draft-only': 0, 'cautious-comparison': 1, 'strong-mining': 2 };
  if (rank[params.nominal] > rank[params.effective]) {
    return {
      nominalClaimStrength: params.nominal,
      effectiveClaimStrength: params.effective,
      fit: 'overclaim-risk',
      reason: `Die nominale Claim-Stärke ${params.nominal} wäre für ${params.scoringMode} zu stark und wurde defensiv auf ${params.effective} abgesenkt.`,
    };
  }
  if (rank[params.nominal] < rank[params.effective]) {
    return {
      nominalClaimStrength: params.nominal,
      effectiveClaimStrength: params.effective,
      fit: 'underclaim-risk',
      reason: `Die vorhandene Evidenz trägt mehr als ${params.nominal}; die Claim-Stärke wurde auf ${params.effective} angehoben.`,
    };
  }
  return {
    nominalClaimStrength: params.nominal,
    effectiveClaimStrength: params.effective,
    fit: 'aligned',
    reason: `Claim-Stärke ${params.effective} passt zur aktiven Bewertungsbasis ${params.scoringMode}.`,
  };
}

function buildEffectiveClaimNote(params: {
  scoringMode: QualityScoringProfileMode;
  claimStrength: AnalysisClaimStrength;
  caseCount: number;
  summary?: DerivationSummary;
}): string {
  if (params.claimStrength === 'draft-only') {
    return params.scoringMode === 'weak-raw-table'
      ? 'Die Quelle bleibt ein defensiver weak-raw-table-Befund. Signale sind nutzbar, harte Ablauf- oder Prozentclaims wären zu stark.'
      : 'Die Ergebnisse sind als Prozessentwurf zu lesen. Harte Mengen- oder Mining-Claims wären für diese Evidenzlage zu stark.';
  }
  if (params.claimStrength === 'cautious-comparison') {
    return `Die App kann ${params.caseCount} Quellen vorsichtig vergleichen, sollte Standardquoten und harte Konformitätsclaims aber weiter defensiv behandeln.`;
  }
  const mappingConfidence = params.summary?.tablePipeline?.mappingConfidence ?? 0;
  return `Die Eventstruktur ist belastbar genug für stärkere Mining-Aussagen. Mappingkonfidenz ${mappingConfidence.toFixed(2)} und Fallbasis tragen deutlich robustere Vergleiche.`;
}

function createDimension(
  profile: QualityScoringProfileDefinition,
  key: QualityDimensionKey,
  score: number,
  summary: string,
  rationale: Array<string | undefined | null>,
  observed: Record<string, unknown>,
  scoringReasons: Array<string | undefined | null>,
  confidenceAdjustments: Array<string | undefined | null> = [],
  blockerReasons: Array<string | undefined | null> = [],
): QualityDimensionAssessment {
  const finalScore = clamp(score);
  return {
    key,
    label: DIMENSION_LABELS[key],
    score: finalScore,
    status: statusFromScore(finalScore),
    summary,
    rationale: compactList(rationale, 6),
    interpretation: profile.dimensionInterpretation[key],
    applicableEvidenceTypes: profile.validEvidenceTypes,
    scoringReasons: compactList(scoringReasons, 6),
    blockerReasons: compactList(blockerReasons, 4),
    confidenceAdjustments: compactList(confidenceAdjustments, 4),
    observed,
  };
}

function assessDocumentTypeRecognition(ctx: QualityScoringContext): QualityDimensionAssessment {
  const summary = ctx.summary;
  const profile = summary?.sourceProfile;
  const classReasons = profile?.classificationReasons ?? [];
  const passedCriteria = summary?.tablePipeline?.eventlogEligibility.minimumCriteria?.filter(item => item.passed).length ?? 0;
  const criteriaCount = summary?.tablePipeline?.eventlogEligibility.minimumCriteria?.length ?? 0;
  const routingDocumentClassConsistent = isRoutingDocumentClassConsistent(summary);
  const scoringModeConsistent = isScoringModeConsistent({ scoringMode: ctx.scoringMode, summary });
  const structuredSourceConflict = hasStructuredSourceConflict(summary);

  let score = 18 + ctx.routingConfidenceValue * 18 + ctx.derivationConfidenceValue * 8;
  if (ctx.scoringMode === 'process-draft') {
    score += (summary?.documentKind && summary.documentKind !== 'unknown' ? 14 : 0)
      + (profile?.inputProfile && profile.inputProfile !== 'unclear' ? 12 : 0)
      + (profile?.documentClass ? 10 : 0)
      + Math.min(10, classReasons.length * 3)
      + (summary?.structuredPreserveApplied ? 10 : 0)
      + (routingDocumentClassConsistent ? 8 : -16)
      + (scoringModeConsistent ? 6 : -14)
      + (structuredSourceConflict ? -22 : 0);
  } else if (ctx.scoringMode === 'comparison') {
    score += Math.min(10, classReasons.length * 2)
      + (ctx.caseCount >= 2 ? 10 : 0)
      + ((summary?.multiCaseSummary?.stabilityScore ?? 0) / 100) * 16
      + (routingDocumentClassConsistent ? 8 : -16)
      + (scoringModeConsistent ? 6 : -12);
  } else if (ctx.scoringMode === 'eventlog-table') {
    score += (summary?.routingContext?.routingClass === 'eventlog-table' ? 16 : 0)
      + (summary?.tablePipeline?.pipelineMode === 'eventlog-table' ? 16 : 0)
      + (summary?.tablePipeline?.mappingConfidence ?? 0) * 18
      + ratio(passedCriteria, Math.max(criteriaCount, 1)) * 14
      + (scoringModeConsistent ? 8 : -18);
  } else {
    score += (summary?.routingContext?.routingClass === 'weak-raw-table' ? 18 : 0)
      + (summary?.tablePipeline?.pipelineMode === 'weak-raw-table' ? 16 : 0)
      + (summary?.routingContext?.fallbackReason ? 16 : 0)
      + (summary?.tablePipeline?.eventlogEligibility.eligible ? -18 : 8)
      + (scoringModeConsistent ? 8 : -18);
  }

  return createDimension(
    ctx.profile,
    'documentTypeRecognition',
    score,
    score >= 85
      ? 'Die operative Quellenklassifikation passt sehr gut zum aktiven Analysemodus.'
      : score >= 68
      ? 'Die Quellenklassifikation ist tragfähig, aber noch nicht maximal robust.'
      : score >= 45
      ? 'Die operative Einordnung bleibt nur teilweise abgesichert.'
      : 'Quellenklassifikation und Analysemodus passen derzeit noch nicht belastbar zusammen.',
    [
      summary?.routingContext?.routingClass ? `Routing: ${summary.routingContext.routingClass}.` : undefined,
      profile?.inputProfileLabel ? `Quellprofil: ${profile.inputProfileLabel}.` : undefined,
      profile?.documentClassLabel ? `Dokumentenklasse: ${profile.documentClassLabel}.` : undefined,
      summary?.tablePipeline ? `Tabellenpfad: ${summary.tablePipeline.pipelineMode}.` : undefined,
      !routingDocumentClassConsistent ? 'Routing und Dokumentklasse widersprechen sich aktuell.' : undefined,
      !scoringModeConsistent ? 'Bewertungsmodus passt nicht sauber zum operativen Routingkontext.' : undefined,
    ],
    {
      routingClass: summary?.routingContext?.routingClass,
      routingConfidence: summary?.routingContext?.routingConfidence,
      documentKind: summary?.documentKind,
      inputProfile: profile?.inputProfile,
      documentClass: profile?.documentClass,
      mappingConfidence: summary?.tablePipeline?.mappingConfidence,
      eventlogEligibility: summary?.tablePipeline?.eventlogEligibility.eligible,
      routingDocumentClassConsistent,
      scoringModeConsistent,
      structuredSourceConflict,
    },
    [
      ctx.profile.dimensionInterpretation.documentTypeRecognition,
      ctx.scoringMode === 'eventlog-table' ? 'Tabellenmodus nutzt Schema- und Eligibility-Signale statt Dokumentprosa.' : undefined,
      ctx.scoringMode === 'weak-raw-table' ? 'Defensive Einordnung wird positiv gewertet, wenn sie transparent bleibt.' : undefined,
    ],
    [
      ctx.summary?.warnings.length ? `${ctx.summary.warnings.length} Warnungen begrenzen die Klassifikationssicherheit.` : undefined,
      !routingDocumentClassConsistent ? 'Inkonsistente Routing-/Dokumentklasse begrenzt hohe Statusstufen.' : undefined,
      !scoringModeConsistent ? 'Inkonsistenter Bewertungsmodus begrenzt hohe Statusstufen.' : undefined,
    ],
  );
}

function assessStructureFidelity(ctx: QualityScoringContext): QualityDimensionAssessment {
  const summary = ctx.summary;
  const quality = ctx.quality;
  const orderingShare = ratio(quality?.casesWithOrdering ?? 0, Math.max(quality?.totalCases ?? ctx.caseCount, 1));
  const multiCaseStrength = (summary?.multiCaseSummary?.stabilityScore ?? 0) / 100;
  const rowOrderCoherence = summary?.tablePipeline?.tableProfile.rowOrderCoherence ?? 0;
  const caseCoherence = summary?.tablePipeline?.tableProfile.caseCoherence ?? 0;
  const coreRowCoverage = ratio(
    summary?.tablePipeline?.rowEvidenceStats.rowsWithAcceptedCoreMapping ?? 0,
    Math.max(summary?.tablePipeline?.tableProfile.rowCount ?? 0, 1),
  );
  const orderedTraceShare = summary?.tablePipeline?.traceStats?.orderedTraceShare ?? 0;
  const noCoreSimulation = ctx.scoringMode === 'weak-raw-table' ? clamp01(1 - ctx.steps.length / 3) : 0;
  const explicitStructuredStepCount = summary?.explicitStructuredStepCount ?? 0;
  const preservedStructuredStepCount = summary?.preservedStructuredStepCount ?? 0;
  const structuredPreserveShare = explicitStructuredStepCount > 0
    ? preservedStructuredStepCount / Math.max(explicitStructuredStepCount, 1)
    : 0;

  let score = 0;
  if (ctx.scoringMode === 'process-draft') {
    const processBearingShare = ratio(summary?.sourceProfile?.processBearingSharePct ?? 0, 100);
    score = 20
      + orderingShare * 24
      + ctx.semanticStepStats.contextBackedShare * 18
      + processBearingShare * 16
      + ctx.semanticStepStats.strongShare * 12
      + (summary?.structuredPreserveApplied ? 10 : 0)
      + (explicitStructuredStepCount > 0 ? structuredPreserveShare * 12 : 0)
      - (summary?.structuredRecallLoss ? 26 : 0);
  } else if (ctx.scoringMode === 'comparison') {
    const caseCoverage = ratio(uniqueStrings(ctx.steps.map(step => step.sourceCaseId)).length, Math.max(ctx.caseCount, 1));
    score = 18 + orderingShare * 18 + caseCoverage * 18 + multiCaseStrength * 22 + ctx.semanticStepStats.strongShare * 10 + ctx.semanticStepStats.contextBackedShare * 10;
  } else if (ctx.scoringMode === 'eventlog-table') {
    score = 18 + rowOrderCoherence * 24 + caseCoherence * 18 + orderedTraceShare * 18 + coreRowCoverage * 18 + (summary?.tablePipeline?.mappingConfidence ?? 0) * 10;
  } else {
    const signalCoverage = ratio(
      summary?.tablePipeline?.rowEvidenceStats.weakSignalsCreated ?? 0,
      Math.max(summary?.tablePipeline?.tableProfile.rowCount ?? 0, 1),
    );
    score = 36 + noCoreSimulation * 24 + signalCoverage * 18 + (summary?.routingContext?.fallbackReason ? 14 : 0) + (summary?.tablePipeline?.eventlogEligibility.eligible ? -24 : 0);
  }

  return createDimension(
    ctx.profile,
    'structureFidelity',
    score,
    score >= 85
      ? 'Die Struktur passt sehr gut zum aktiven Bewertungsmodus.'
      : score >= 68
      ? 'Die Struktur ist brauchbar, aber noch nicht durchgehend belastbar.'
      : score >= 45
      ? 'Die Struktur bleibt spürbar fragil und sollte vorsichtig gelesen werden.'
      : 'Die Strukturträger sind für belastbare Aussagen noch zu schwach.',
    [
      ctx.scoringMode === 'eventlog-table' ? `Spurenkohärenz ${Math.round(orderedTraceShare * 100)} %.` : undefined,
      ctx.scoringMode === 'eventlog-table' ? `Kernzeilenabdeckung ${Math.round(coreRowCoverage * 100)} %.` : undefined,
      ctx.scoringMode === 'comparison' ? `Stabilitätsmuster ${Math.round(multiCaseStrength * 100)} %.` : undefined,
      quality ? `${quality.casesWithOrdering} von ${quality.totalCases} Quellen mit belastbarer Reihenfolge.` : undefined,
      ctx.scoringMode === 'weak-raw-table' ? `Keine Kernschrittsimulation: ${Math.round(noCoreSimulation * 100)} %.` : undefined,
      explicitStructuredStepCount > 0 ? `Structured-Preserve erhält ${preservedStructuredStepCount} von ${explicitStructuredStepCount} expliziten Ablaufzeilen.` : undefined,
    ],
    {
      orderingShare,
      multiCaseStrength,
      rowOrderCoherence,
      caseCoherence,
      coreRowCoverage,
      orderedTraceShare,
      noCoreSimulation,
      explicitStructuredStepCount,
      preservedStructuredStepCount,
      structuredPreserveShare: Number(structuredPreserveShare.toFixed(2)),
    },
    [
      ctx.profile.dimensionInterpretation.structureFidelity,
      ctx.scoringMode === 'weak-raw-table' ? 'Defensive Strukturtreue belohnt bewusst den Verzicht auf künstliche Ablaufhärte.' : undefined,
    ],
  );
}

function assessStepClarity(ctx: QualityScoringContext): QualityDimensionAssessment {
  const activityMappingConfidence = findBestMapping(ctx.summary, ['activity'])?.confidence ?? 0;
  const noPseudoSteps = ctx.scoringMode === 'weak-raw-table' ? clamp01(1 - ctx.steps.length / 3) : 0;
  let score = 0;

  if (ctx.scoringMode === 'weak-raw-table') {
    score = 42 + noPseudoSteps * 28 + clamp01(1 - ctx.semanticStepStats.fragmentShare) * 18 + clamp01(1 - ctx.semanticStepStats.communicationOnlyShare) * 12;
  } else if (ctx.steps.length > 0) {
    score = 12
      + ctx.semanticStepStats.averageUsability * 48
      + ctx.semanticStepStats.strongShare * 18
      + clamp01(1 - ctx.semanticStepStats.duplicatePressure) * 10
      + clamp01(1 - ctx.semanticStepStats.fragmentShare) * 8;
    if (ctx.scoringMode === 'comparison') score += (ctx.summary?.multiCaseSummary?.stabilityScore ?? 0) * 0.08;
    if (ctx.scoringMode === 'eventlog-table') score += activityMappingConfidence * 16;
  }

  return createDimension(
    ctx.profile,
    'stepClarity',
    score,
    score >= 85
      ? 'Schritte sind semantisch tragfähig und anschlussfähig an einen realen Ablauf.'
      : score >= 68
      ? 'Die meisten Schrittbezeichnungen sind brauchbar, aber nicht durchgehend trennscharf.'
      : score >= 45
      ? 'Schrittklarheit bleibt gemischt; Fragmente oder zu formale Labels stören noch.'
      : 'Kernschritte sind semantisch zu schwach, fragmentarisch oder zu kommunikativ.',
    [
      ctx.steps.length > 0 ? `${Math.round(ctx.semanticStepStats.strongShare * 100)} % semantisch starke Schritte.` : undefined,
      ctx.steps.length > 0 ? `${Math.round(ctx.semanticStepStats.weakShare * 100)} % semantisch schwache Schritte.` : undefined,
      ctx.scoringMode === 'eventlog-table' ? `Activity-Mapping ${activityMappingConfidence.toFixed(2)}.` : undefined,
      ctx.scoringMode === 'weak-raw-table' ? `Verzicht auf Pseudo-Schritte ${Math.round(noPseudoSteps * 100)} %.` : undefined,
    ],
    {
      stepCount: ctx.steps.length,
      averageUsability: Number(ctx.semanticStepStats.averageUsability.toFixed(2)),
      strongShare: Number(ctx.semanticStepStats.strongShare.toFixed(2)),
      weakShare: Number(ctx.semanticStepStats.weakShare.toFixed(2)),
      activityShare: Number(ctx.semanticStepStats.activityShare.toFixed(2)),
      duplicatePressure: Number(ctx.semanticStepStats.duplicatePressure.toFixed(2)),
      fragmentShare: Number(ctx.semanticStepStats.fragmentShare.toFixed(2)),
    },
    [
      'Kurze oder glatte Labels zählen nur, wenn sie auch Prozessfunktion und Kontext tragen.',
      ctx.profile.dimensionInterpretation.stepClarity,
    ],
    [],
    ctx.semanticStepStats.weakShare > 0.35
      ? ['Mehrere Kernschritte wirken noch notizhaft, kommunikativ oder ohne klaren Aktivitätscharakter.']
      : [],
  );
}

function assessRoleOrSystemQuality(
  ctx: QualityScoringContext,
  kind: 'role' | 'system',
): QualityDimensionAssessment {
  const quality = ctx.quality;
  const backedSteps = kind === 'role'
    ? quality?.stepObservationsWithRole ?? ctx.steps.filter(step => atomicEntityValuesForStep(step, 'role').length > 0).length
    : quality?.stepObservationsWithSystem ?? ctx.steps.filter(step => atomicEntityValuesForStep(step, 'system').length > 0).length;
  const localAssignments = kind === 'role' ? ctx.localRoleAssignments : ctx.localSystemAssignments;
  const mapping = findBestMapping(ctx.summary, kind === 'role' ? ['role', 'resource'] : ['system']);
  const uniqueValues = atomizeStructuredValues(
    kind === 'role'
      ? [
          ...ctx.steps.flatMap(step => atomicEntityValuesForStep(step, 'role')),
          ...(ctx.summary?.roles ?? []),
          ...(ctx.summary?.explicitRoles ?? []),
          ...(ctx.summary?.inferredRoles ?? []),
        ]
      : [
          ...ctx.steps.flatMap(step => atomicEntityValuesForStep(step, 'system')),
          ...(ctx.summary?.systems ?? []),
          ...(ctx.summary?.explicitSystems ?? []),
          ...(ctx.summary?.inferredSystems ?? []),
        ],
  );
  const coverage = ratio(backedSteps, Math.max(ctx.steps.length, 1));
  const localShare = ratio(localAssignments, Math.max(ctx.steps.length, 1));
  const supportOnlyHints = ratio(
    ctx.candidates.filter(candidate => candidate.candidateType === kind && candidate.status === 'support-only').length,
    Math.max(ctx.summary?.tablePipeline?.rowEvidenceStats.weakSignalsCreated ?? ctx.steps.length, 1),
  );

  let score = 0;
  if (ctx.scoringMode === 'weak-raw-table') {
    score = 42 + supportOnlyHints * 18 + clamp01(1 - ctx.steps.length / 4) * 18 + (mapping?.confidence ?? 0) * 12 + (coverage === 0 ? 8 : 0);
  } else if (ctx.steps.length > 0) {
    score = 12 + coverage * 34 + localShare * 24 + Math.min(1, uniqueValues.length / Math.max(Math.ceil(ctx.steps.length / 3), 1)) * 10 + (mapping?.confidence ?? 0) * 16;
  }

  return createDimension(
    ctx.profile,
    kind === 'role' ? 'roleQuality' : 'systemQuality',
    score,
    score >= 85
      ? `${kind === 'role' ? 'Rollen' : 'Systeme'} sind lokal belastbar verankert.`
      : score >= 68
      ? `${kind === 'role' ? 'Rollen' : 'Systeme'} sind brauchbar, aber noch nicht vollständig abgesichert.`
      : score >= 45
      ? `${kind === 'role' ? 'Rollen' : 'Systeme'} sind nur punktuell oder vorsichtig nutzbar.`
      : `${kind === 'role' ? 'Rollen' : 'Systeme'} bleiben derzeit zu schwach verankert.`,
    [
      `${backedSteps} von ${ctx.steps.length} Schritten mit ${kind === 'role' ? 'Rollen' : 'System'}bezug.`,
      localAssignments > 0 ? `${localAssignments} lokal verankerte ${kind === 'role' ? 'Rollen' : 'System'}zuordnungen.` : undefined,
      mapping ? `${kind === 'role' ? 'Spaltenmapping' : 'Systemmapping'} ${mapping.confidence.toFixed(2)}.` : undefined,
    ],
    {
      backedSteps,
      localAssignments,
      coverage: Number(coverage.toFixed(2)),
      supportOnlyHints: Number(supportOnlyHints.toFixed(2)),
      uniqueValues,
      mappingConfidence: mapping?.confidence,
    },
    [
      ctx.profile.dimensionInterpretation[kind === 'role' ? 'roleQuality' : 'systemQuality'],
    ],
  );
}

function assessDomainConsistency(ctx: QualityScoringContext): QualityDimensionAssessment {
  const profile = ctx.summary?.sourceProfile;
  const domainScores = profile?.domainScores ?? [];
  const topScore = domainScores[0]?.score ?? 0;
  const runnerUp = domainScores[1]?.score ?? 0;
  const mappingConflicts = (ctx.summary?.tablePipeline?.rejectedColumnMappings ?? []).filter(mapping => mapping.conflictingSignals.length > 0).length;
  const routingDocumentClassConsistent = isRoutingDocumentClassConsistent(ctx.summary);
  const scoringModeConsistent = isScoringModeConsistent({ scoringMode: ctx.scoringMode, summary: ctx.summary });
  const competingPrimaryDomains = topScore >= 4 && runnerUp >= 4 && Math.abs(topScore - runnerUp) <= 2;
  const suppressedConflictSignals = (profile?.domainGateSuppressedSignals?.length ?? 0) > 0 && competingPrimaryDomains;
  const suppressedConflictRoles = (profile?.domainGateSuppressedRoles?.length ?? 0) > 0 && competingPrimaryDomains;
  const suppressedConflictSystems = (profile?.domainGateSuppressedSystems?.length ?? 0) > 0 && competingPrimaryDomains;
  const conflictReasons = uniqueStrings([
    !routingDocumentClassConsistent ? 'Routing und Dokumentklasse widersprechen sich.' : undefined,
    !scoringModeConsistent ? 'Bewertungsmodus widerspricht dem operativen Routingkontext.' : undefined,
    competingPrimaryDomains
      ? `Mindestens zwei belastbare Domänen konkurrieren fast gleich stark (${topScore} vs. ${runnerUp}).`
      : undefined,
    suppressedConflictSignals ? 'Mehrere starke fachfremde Signalsätze mussten aktiv ausgeblendet werden.' : undefined,
    suppressedConflictRoles ? 'Mehrere fachfremde Rollenhinweise mussten aktiv ausgeblendet werden.' : undefined,
    suppressedConflictSystems ? 'Mehrere fachfremde Systemhinweise mussten aktiv ausgeblendet werden.' : undefined,
    ctx.scoringMode === 'eventlog-table' || ctx.scoringMode === 'weak-raw-table'
      ? mappingConflicts > 0
        ? `${mappingConflicts} reale Mappingkonflikte belasten die operative Domänenlesart.`
        : undefined
      : undefined,
    hasStructuredSourceConflict(ctx.summary)
      ? 'Structured-Preserve verlor explizite Ablaufzeilen und erzeugt damit einen realen Strukturkonflikt.'
      : undefined,
  ]);
  const conflictPenalty = clamp(
    (routingDocumentClassConsistent ? 0 : 22)
    + (scoringModeConsistent ? 0 : 18)
    + (competingPrimaryDomains ? 16 + Math.max(0, 6 - Math.abs(topScore - runnerUp)) : 0)
    + (suppressedConflictSignals ? 8 : 0)
    + (suppressedConflictRoles ? 6 : 0)
    + (suppressedConflictSystems ? 6 : 0)
    + ((ctx.scoringMode === 'eventlog-table' || ctx.scoringMode === 'weak-raw-table') ? Math.min(24, mappingConflicts * 6) : 0)
    + (hasStructuredSourceConflict(ctx.summary) ? 24 : 0),
    0,
    72,
  );
  const neutralNoConflict = !profile?.primaryDomainLabel && conflictReasons.length === 0;
  const consistencyBonus = clamp(
    (ctx.routingConfidenceValue * 8)
    + (ctx.derivationConfidenceValue * 6)
    + (profile?.primaryDomainLabel && !competingPrimaryDomains ? Math.min(8, Math.max(0, topScore - runnerUp)) : 0)
    + (neutralNoConflict ? 10 : 0)
    + (ctx.summary?.structuredPreserveApplied && routingDocumentClassConsistent && scoringModeConsistent ? 8 : 0)
    + ((ctx.scoringMode === 'eventlog-table' || ctx.scoringMode === 'weak-raw-table')
      ? ((ctx.summary?.tablePipeline?.mappingConfidence ?? 0) * 8)
      : 0),
    0,
    22,
  );
  const score = clamp(74 + consistencyBonus - conflictPenalty);
  const summary =
    conflictReasons.length === 0 && neutralNoConflict
      ? 'Die Domänenlage bleibt bewusst neutral und konsistent; es gibt keine belastbaren Konfliktsignale.'
      : conflictReasons.length === 0
      ? 'Fachlicher Rahmen, Routing und operative Interpretation wirken konsistent.'
      : score >= 68
      ? 'Einzelne fachliche Spannungen sind sichtbar, aber noch nicht dominant widersprüchlich.'
      : score >= 45
      ? 'Mehrere reale fachliche oder operative Konfliktsignale bleiben sichtbar.'
      : 'Reale Domänen-, Routing- oder Mappingkonflikte schränken die Interpretation deutlich ein.';

  return createDimension(
    ctx.profile,
    'domainConsistency',
    score,
    summary,
    [
      profile?.primaryDomainLabel ? `Primärdomäne: ${profile.primaryDomainLabel}.` : undefined,
      (profile?.secondaryDomainLabels?.length ?? 0) > 0 ? `Sekundärdomänen: ${profile?.secondaryDomainLabels?.join(', ')}.` : undefined,
      neutralNoConflict ? 'Keine belastbare Primärdomäne ist hier kein Widerspruch, solange Routing und Struktur konsistent bleiben.' : undefined,
      profile?.domainGateNote,
      ...conflictReasons,
    ],
    {
      primaryDomain: profile?.primaryDomainLabel ?? profile?.primaryDomainKey,
      secondaryDomains: profile?.secondaryDomainLabels ?? profile?.secondaryDomainKeys,
      domainScores: domainScores.slice(0, 5),
      mappingConflicts,
      mappingConfidence: ctx.summary?.tablePipeline?.mappingConfidence,
      routingDocumentClassConsistent,
      scoringModeConsistent,
      competingPrimaryDomains,
      conflictCount: conflictReasons.length,
      neutralNoConflict,
    },
    [
      ctx.profile.dimensionInterpretation.domainConsistency,
      neutralNoConflict ? 'Neutrale Domänenlage wird nicht abgewertet, solange keine realen Konflikte sichtbar sind.' : undefined,
    ],
    [],
    score < 45 ? conflictReasons : [],
  );
}

function assessEvidenceCoverage(ctx: QualityScoringContext): QualityDimensionAssessment {
  const quality = ctx.quality;
  const summary = ctx.summary;
  const evidenceSteps = quality?.stepObservationsWithEvidence ?? ctx.steps.filter(step => Boolean(normalizeWhitespace(step.evidenceSnippet ?? ''))).length;
  const evidenceShare = ratio(evidenceSteps, Math.max(ctx.steps.length, 1));
  const contextShare = ctx.semanticStepStats.contextBackedShare;
  const signalCount = summary?.issueEvidence?.length ?? quality?.issueObservationCount ?? 0;
  const caseCoverage = ratio(uniqueStrings(ctx.steps.map(step => step.sourceCaseId)).length, Math.max(ctx.caseCount, 1));
  const paragraphSupport = clamp01((summary?.sourceProfile?.evidenceParagraphCount ?? 0) / Math.max(ctx.steps.length, 1));
  const criteriaPassShare = ratio(
    summary?.tablePipeline?.eventlogEligibility.minimumCriteria?.filter(item => item.passed).length ?? 0,
    Math.max(summary?.tablePipeline?.eventlogEligibility.minimumCriteria?.length ?? 0, 1),
  );
  const coreRowCoverage = ratio(
    summary?.tablePipeline?.rowEvidenceStats.rowsWithAcceptedCoreMapping ?? 0,
    Math.max(summary?.tablePipeline?.tableProfile.rowCount ?? 0, 1),
  );
  const normalizedCoverage = ratio(
    summary?.tablePipeline?.normalizedEvents?.length ?? 0,
    Math.max(summary?.tablePipeline?.tableProfile.rowCount ?? 0, 1),
  );
  const weakSignalYield = clamp01((summary?.tablePipeline?.rowEvidenceStats.weakSignalsCreated ?? 0) / 6);
  const mappingTransparency = clamp01(
    ((summary?.tablePipeline?.acceptedColumnMappings?.length ?? 0) + (summary?.tablePipeline?.rejectedColumnMappings?.length ?? 0)) / 8,
  );

  let score = 0;
  if (ctx.scoringMode === 'process-draft') {
    score = 16 + evidenceShare * 34 + contextShare * 18 + paragraphSupport * 18 + Math.min(1, signalCount / 4) * 8 + ctx.semanticStepStats.strongShare * 6;
  } else if (ctx.scoringMode === 'comparison') {
    const stability = (summary?.multiCaseSummary?.stabilityScore ?? 0) / 100;
    score = 15 + evidenceShare * 24 + contextShare * 12 + caseCoverage * 18 + stability * 18 + Math.min(1, signalCount / 6) * 7;
  } else if (ctx.scoringMode === 'eventlog-table') {
    score = 12 + coreRowCoverage * 24 + (summary?.tablePipeline?.mappingConfidence ?? 0) * 22 + criteriaPassShare * 18 + normalizedCoverage * 14 + (summary?.tablePipeline?.traceStats?.orderedTraceShare ?? 0) * 10;
  } else {
    score = 30 + weakSignalYield * 18 + mappingTransparency * 14 + (summary?.routingContext?.fallbackReason ? 14 : 0) + clamp01(1 - ctx.steps.length / 3) * 14 + ratio(summary?.tablePipeline?.rowEvidenceStats.rowsWithEvidence ?? 0, Math.max(summary?.tablePipeline?.rowEvidenceStats.weakSignalsCreated ?? 0, 1)) * 10;
  }

  return createDimension(
    ctx.profile,
    'evidenceCoverage',
    score,
    score >= 85
      ? 'Die Evidenz passt sehr gut zum aktiven Analysemodus.'
      : score >= 68
      ? 'Die Evidenzbasis ist brauchbar, zeigt aber noch Lücken.'
      : score >= 45
      ? 'Die Evidenz reicht nur für vorsichtige Aussagen.'
      : 'Die Evidenzbasis bleibt für den aktiven Modus zu dünn.',
    [
      ctx.scoringMode === 'eventlog-table' ? `Kernzeilenabdeckung ${Math.round(coreRowCoverage * 100)} %.` : undefined,
      ctx.scoringMode === 'eventlog-table' ? `Mappingsicherheit ${summary?.tablePipeline?.mappingConfidence?.toFixed(2) ?? '0.00'}.` : undefined,
      ctx.scoringMode === 'comparison' ? `Mehrfallabdeckung ${Math.round(caseCoverage * 100)} %.` : undefined,
      ctx.scoringMode === 'weak-raw-table' ? `${summary?.tablePipeline?.rowEvidenceStats.weakSignalsCreated ?? 0} defensive Signalspuren.` : undefined,
      `${evidenceSteps} von ${ctx.steps.length} Schritten mit Evidenzanker.`,
    ],
    {
      evidenceSteps,
      evidenceShare: Number(evidenceShare.toFixed(2)),
      contextShare: Number(contextShare.toFixed(2)),
      paragraphSupport: Number(paragraphSupport.toFixed(2)),
      caseCoverage: Number(caseCoverage.toFixed(2)),
      mappingConfidence: summary?.tablePipeline?.mappingConfidence,
      criteriaPassShare: Number(criteriaPassShare.toFixed(2)),
      coreRowCoverage: Number(coreRowCoverage.toFixed(2)),
      normalizedCoverage: Number(normalizedCoverage.toFixed(2)),
      weakSignalYield: Number(weakSignalYield.toFixed(2)),
    },
    [
      ctx.profile.dimensionInterpretation.evidenceCoverage,
    ],
  );
}

function assessCautionWithWeakMaterial(ctx: QualityScoringContext): QualityDimensionAssessment {
  const summary = ctx.summary;
  const warnings = summary?.warnings ?? [];
  const weakMaterialSignal =
    ctx.scoringMode === 'weak-raw-table'
      ? 1
      : ctx.scoringMode === 'process-draft'
      ? 0.78
      : summary?.confidence === 'low' || summary?.documentKind === 'weak-material'
      ? 0.74
      : ctx.routingConfidenceValue < 0.5
      ? 0.62
      : warnings.length > 0
      ? 0.44
      : 0.18;
  const noPseudoSteps = ctx.scoringMode === 'weak-raw-table' ? clamp01(1 - ctx.steps.length / 3) : 0.6;
  const defensiveAlignment =
    ctx.claimStrength === 'draft-only'
      ? 0.92
      : ctx.claimStrength === 'cautious-comparison'
      ? 0.7
      : ctx.scoringMode === 'eventlog-table'
      ? 0.78
      : 0.18;
  const overclaimPenalty = ctx.claimCalibration.fit === 'overclaim-risk' ? 28 : 0;
  const underclaimPenalty = ctx.claimCalibration.fit === 'underclaim-risk' ? 8 : 0;
  const contradictionPenalty = Math.min(14, warnings.filter(warning => /widerspruch|unklar|zu stark|fragil|defensiv/i.test(warning)).length * 4);
  const confidenceMismatchPenalty =
    weakMaterialSignal > 0.7 && summary?.confidence === 'high'
      ? 8
      : weakMaterialSignal < 0.3 && ctx.claimStrength === 'draft-only' && ctx.scoringMode === 'eventlog-table'
      ? 6
      : 0;

  const score = 48
    + defensiveAlignment * 22
    + noPseudoSteps * 12
    + (summary?.routingContext?.fallbackReason ? 8 : 0)
    + (ctx.claimCalibration.fit === 'aligned' ? 8 : 0)
    - overclaimPenalty
    - underclaimPenalty
    - contradictionPenalty
    - confidenceMismatchPenalty;

  return createDimension(
    ctx.profile,
    'cautionWithWeakMaterial',
    score,
    score >= 85
      ? 'Claim-Stärke und Datenlage sind sehr sauber austariert.'
      : score >= 68
      ? 'Die App bleibt im Wesentlichen vorsichtig genug, aber noch nicht perfekt austariert.'
      : score >= 45
      ? 'Zwischen Datenlage und Claim-Stärke bleibt spürbare Spannung.'
      : 'Die Selbsteinschätzung wirkt für die vorhandene Evidenzlage zu offensiv oder unpassend.',
    [
      `Effektive Claim-Stärke: ${ctx.claimStrength}.`,
      `Nominale Claim-Stärke: ${ctx.nominalClaimStrength}.`,
      ctx.claimCalibration.reason,
      summary?.routingContext?.fallbackReason ? `Fallback: ${summary.routingContext.fallbackReason}` : undefined,
    ],
    {
      weakMaterialSignal: Number(weakMaterialSignal.toFixed(2)),
      defensiveAlignment: Number(defensiveAlignment.toFixed(2)),
      claimStrength: ctx.claimStrength,
      nominalClaimStrength: ctx.nominalClaimStrength,
      claimFit: ctx.claimCalibration.fit,
      warningCount: warnings.length,
      noPseudoSteps: Number(noPseudoSteps.toFixed(2)),
    },
    [
      ctx.profile.dimensionInterpretation.cautionWithWeakMaterial,
      ctx.claimCalibration.reason,
    ],
    [
      overclaimPenalty > 0 ? 'Overclaim-Risiko wird explizit abgezogen.' : undefined,
      underclaimPenalty > 0 ? 'Systematische Untertreibung stutzt den Score leicht.' : undefined,
      confidenceMismatchPenalty > 0 ? 'Abgeleitete Konfidenz klingt strenger oder stärker als die Materiallage trägt.' : undefined,
    ],
    ctx.claimCalibration.fit === 'overclaim-risk'
      ? ['Die Claim-Stärke wäre ohne Kalibrierung zu stark für die aktuelle Evidenzlage.']
      : [],
  );
}

function weightedAverage(values: Array<{ score: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return clamp(values.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight);
}

function buildDynamicBlockers(ctx: QualityScoringContext, dimensions: QualityDimensionAssessment[]): string[] {
  const dimensionByKey = new Map(dimensions.map(item => [item.key, item]));
  const blockers: string[] = [];
  if (ctx.scoringMode === 'process-draft') {
    if (ctx.mergedCoreSteps === 0) blockers.push('Prozessentwurf: Es wurde noch kein belastbarer Kernschritt finalisiert.');
    if ((dimensionByKey.get('stepClarity')?.score ?? 0) < 45) blockers.push('Prozessentwurf: Kernschritte sind semantisch zu schwach oder zu notizhaft.');
    if ((dimensionByKey.get('evidenceCoverage')?.score ?? 0) < 45) blockers.push('Prozessentwurf: Die lokale Evidenzbasis reicht für einen tragfähigen Entwurf noch nicht aus.');
    if (ctx.summary?.method === 'structured') {
      const explicitStructuredStepCount = ctx.summary.explicitStructuredStepCount ?? 0;
      const preservedStructuredStepCount = ctx.summary.preservedStructuredStepCount ?? ctx.steps.length;
      if (explicitStructuredStepCount > 0 && preservedStructuredStepCount < explicitStructuredStepCount) {
        blockers.push('Structured-Prozessentwurf: Explizite Ablaufzeilen wurden nicht vollständig erhalten.');
      }
      if (ctx.summary.structuredWholeTextFallback) {
        blockers.push('Structured-Prozessentwurf: Parser musste trotz strukturierter Quelle auf Ganztext zurückfallen.');
      }
      if (ctx.summary.explicitRoleTableDetected && (ctx.summary.roles?.length ?? 0) === 0) {
        blockers.push('Structured-Prozessentwurf: Explizite Rollen-/Systemtabelle wurde erkannt, aber Rollen blieben final leer.');
      }
      if ((ctx.summary.explicitSystemCount ?? 0) > 0 && (ctx.summary.systems?.length ?? 0) === 0) {
        blockers.push('Structured-Prozessentwurf: Explizite Structured-Systeme wurden erkannt, blieben final aber leer.');
      }
    }
  } else if (ctx.scoringMode === 'comparison') {
    if (ctx.caseCount < 2 || !ctx.summary?.multiCaseSummary) blockers.push('Fallvergleich: Mehrfallbasis oder Stabilitätsmuster reichen noch nicht für einen belastbaren Vergleich.');
    if ((dimensionByKey.get('evidenceCoverage')?.score ?? 0) < 50) blockers.push('Fallvergleich: Die Evidenz deckt mehrere Fälle noch nicht dicht genug ab.');
    if (ctx.claimCalibration.fit === 'overclaim-risk') blockers.push('Fallvergleich: Die nominelle Claim-Stärke wäre für die Vergleichsbasis zu stark.');
  } else if (ctx.scoringMode === 'eventlog-table') {
    if (!ctx.summary?.tablePipeline?.eventlogEligibility.eligible) blockers.push('Eventlog-Analyse: Die Mindeststruktur für echtes Eventlog-Mining ist nicht erfüllt.');
    if ((ctx.summary?.tablePipeline?.mappingConfidence ?? 0) < 0.58) blockers.push('Eventlog-Analyse: Das Kernmapping bleibt zu unsicher.');
    if ((ctx.summary?.tablePipeline?.tableProfile.rowOrderCoherence ?? 0) < 0.4) blockers.push('Eventlog-Analyse: Reihenfolge oder Ordnungsanker bleiben zu instabil.');
  } else {
    if (ctx.steps.length > 0 && ctx.semanticStepStats.weakShare > 0.3) blockers.push('Weak-raw-table: Schwache Tabellenfragmente sind noch als Kernschritte sichtbar.');
    if (ctx.claimStrength !== 'draft-only') blockers.push('Weak-raw-table: Die Claim-Stärke bleibt für schwaches Tabellenmaterial zu stark.');
    if (!ctx.summary?.routingContext?.fallbackReason) blockers.push('Weak-raw-table: Die defensive Fallback-Begründung fehlt.');
  }
  return uniqueStrings(blockers);
}

function buildOverallStatus(ctx: QualityScoringContext, dimensions: QualityDimensionAssessment[], overallScore: number, blockers: string[]): QualityDimensionStatus {
  if (ctx.scoringMode === 'weak-raw-table') {
    if (blockers.length > 0 || overallScore < 40) return 'critical';
    if (overallScore >= 68) return 'usable';
    if (overallScore >= 45) return 'watch';
    return 'critical';
  }
  if (blockers.length >= 2 || overallScore < 40) return 'critical';
  if (blockers.length === 1) return 'watch';
  if (overallScore >= 85 && dimensions.every(item => item.status !== 'critical') && ctx.claimCalibration.fit !== 'overclaim-risk') {
    return 'strong';
  }
  if (overallScore >= 68) return 'usable';
  if (overallScore >= 45) return 'watch';
  return 'critical';
}

function overallSummaryFor(ctx: QualityScoringContext, overallStatus: QualityDimensionStatus): string {
  if (ctx.scoringMode === 'weak-raw-table') {
    return overallStatus === 'usable'
      ? 'Die schwache Tabelle wird ehrlich und defensiv behandelt. Das Ergebnis ist brauchbar, aber bewusst kein harter Prozessbefund.'
      : overallStatus === 'watch'
      ? 'Die schwache Tabelle ist als Signalstand lesbar, bleibt aber in ihrer defensiven Einordnung noch fragil.'
      : 'Die schwache Tabelle wird noch nicht defensiv genug oder nicht transparent genug behandelt.';
  }
  if (overallStatus === 'strong') return `Das aktive Bewertungsprofil ${ctx.profile.label} stuft den Analysezustand in den Kerndimensionen als belastbar ein.`;
  if (overallStatus === 'usable') return `Das aktive Bewertungsprofil ${ctx.profile.label} sieht einen brauchbaren, aber noch nicht voll stabilen Analysezustand.`;
  if (overallStatus === 'watch') return `Das aktive Bewertungsprofil ${ctx.profile.label} erkennt deutliche Vorsichts- oder Nachschärfungsbedarfe.`;
  return `Das aktive Bewertungsprofil ${ctx.profile.label} sieht derzeit mindestens einen kritisch instabilen Kernbereich.`;
}

function focusSuggestionFor(key: QualityDimensionKey, mode: QualityScoringProfileMode): string {
  if (key === 'documentTypeRecognition') return mode.includes('table') ? 'Routing, Pfadwahl und Schemaeinordnung der Tabelle nachschärfen.' : 'Quellenklassifikation und operativen Analysemodus stabilisieren.';
  if (key === 'structureFidelity') return mode === 'eventlog-table' ? 'Reihenfolge-, Case- und Mappingkohärenz der Eventstruktur erhöhen.' : 'Ablaufstruktur und Reihenfolge lokal nachschärfen.';
  if (key === 'stepClarity') return 'Kernschritte semantisch von Fragmenten, Kommunikationsresten und Kurzlabels trennen.';
  if (key === 'roleQuality') return 'Rollen nur mit lokaler Verankerung halten und lose Zuweisungen zurücknehmen.';
  if (key === 'systemQuality') return 'Systembezüge an lokale Evidenz oder belastbare Spaltenmappings binden.';
  if (key === 'domainConsistency') return 'Widersprüche zwischen Domäne, Routing und Materialsprache bereinigen.';
  if (key === 'evidenceCoverage') return mode.includes('table') ? 'Evidenzabdeckung über Zeilenanker, Zellanker und Mappingtransparenz erhöhen.' : 'Mehr lokale Belegstellen und Kontextfenster in die Bewertung tragen.';
  return 'Claim-Stärke und Vorsicht explizit an die reale Evidenzlage koppeln.';
}

export function buildQualityAssessmentBundle(params: {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
}): QualityAssessmentBundle {
  const { state, version } = params;
  const summary = state.lastDerivationSummary;
  const steps = getStepObservations(state);
  const candidates = summary?.extractionCandidates ?? [];
  const verifiedFacts = buildVerifiedAnalysisFacts({
    cases: state.cases,
    observations: state.observations,
    lastDerivationSummary: summary,
    qualitySummary: state.qualitySummary,
  });
  const analysisMode = detectProcessMiningAnalysisMode({
    cases: state.cases,
    observations: state.observations,
    lastDerivationSummary: summary,
    qualitySummary: state.qualitySummary,
  });
  const caseCount = verifiedFacts.caseCount;
  const scoringMode = detectScoringMode({ analysisMode, summary });
  const profile = PROFILE_DEFINITIONS[scoringMode];
  const nominalClaimStrength = getAnalysisClaimStrength(analysisMode, caseCount);
  const claimStrength = effectiveClaimStrength({ scoringMode, caseCount, summary });
  const claimCalibration = buildClaimCalibration({ nominal: nominalClaimStrength, effective: claimStrength, scoringMode });
  const nominalClaimNote = buildAnalysisClaimNote({ mode: analysisMode, caseCount });
  const mergedCoreSteps = summary?.candidateReview?.mergedCoreSteps ?? steps.length;
  const rejectedCoreSteps = summary?.candidateReview?.rejectedCoreSteps ?? 0;
  const supportOnlyCandidates = summary?.candidateReview?.supportOnlyCandidates ?? 0;
  const weakFragmentCount = summary?.candidateReview?.weakFragmentCount ?? 0;
  const localRoleAssignments = summary?.candidateReview?.localRoleAssignments ?? 0;
  const localSystemAssignments = summary?.candidateReview?.localSystemAssignments ?? 0;

  const ctx: QualityScoringContext = {
    state,
    version,
    summary,
    quality: state.qualitySummary,
    steps,
    candidates,
    analysisMode,
    scoringMode,
    profile,
    routingClass: summary?.routingContext?.routingClass,
    pipelineMode: summary?.tablePipeline?.pipelineMode,
    caseCount,
    routingConfidenceValue: confidenceValue(summary?.routingContext?.routingConfidence),
    derivationConfidenceValue: confidenceValue(summary?.confidence),
    mergedCoreSteps,
    rejectedCoreSteps,
    supportOnlyCandidates,
    weakFragmentCount,
    localRoleAssignments,
    localSystemAssignments,
    semanticStepStats: buildSemanticStepStats({ steps, candidates }),
    nominalClaimStrength,
    claimStrength,
    claimCalibration,
    claimNote: buildEffectiveClaimNote({ scoringMode, claimStrength, caseCount, summary }),
    nominalClaimNote,
  };

  const dimensions = [
    assessDocumentTypeRecognition(ctx),
    assessStructureFidelity(ctx),
    assessStepClarity(ctx),
    assessRoleOrSystemQuality(ctx, 'role'),
    assessRoleOrSystemQuality(ctx, 'system'),
    assessDomainConsistency(ctx),
    assessEvidenceCoverage(ctx),
    assessCautionWithWeakMaterial(ctx),
  ];

  let overallScore = weightedAverage(
    dimensions.map(item => ({
      score: item.score,
      weight: profile.dimensionWeights[item.key],
    })),
  );
  if (ctx.claimCalibration.fit === 'overclaim-risk') overallScore = clamp(overallScore - 10);
  if (ctx.claimCalibration.fit === 'underclaim-risk') overallScore = clamp(overallScore - 4);
  if (ctx.scoringMode === 'weak-raw-table') overallScore = Math.min(overallScore, 82);

  const blockerReasons = buildDynamicBlockers(ctx, dimensions);
  const overallStatus = buildOverallStatus(ctx, dimensions, overallScore, blockerReasons);
  const strengths = dimensions.filter(item => item.status === 'strong').map(item => `${item.label}: ${item.summary}`);
  const watchpoints = uniqueStrings([
    ...dimensions.filter(item => item.status === 'watch').map(item => `${item.label}: ${item.summary}`),
    ...(ctx.claimCalibration.fit !== 'aligned' ? [ctx.claimCalibration.reason] : []),
  ]);
  const blockers = uniqueStrings([
    ...dimensions.filter(item => item.status === 'critical').map(item => `${item.label}: ${item.summary}`),
    ...blockerReasons,
  ]);
  const recommendedFocus = uniqueStrings([
    ...dimensions.slice().sort((left, right) => left.score - right.score).slice(0, 3).map(item => focusSuggestionFor(item.key, scoringMode)),
    ...blockerReasons.map(reason => reason.replace(/^.*?:\s*/, '')),
  ]).slice(0, 6);

  const scoringReasons = compactList([
    `Scoring-Profil ${profile.label} aktiv.`,
    summary?.routingContext?.routingClass ? `Routingklasse ${summary.routingContext.routingClass} prägt die Bewertungslogik.` : undefined,
    summary?.tablePipeline?.pipelineMode ? `Tabellenpipeline ${summary.tablePipeline.pipelineMode} prägt die Evidenzlogik.` : undefined,
    claimCalibration.reason,
  ], 6);
  const confidenceAdjustments = compactList([
    ctx.routingConfidenceValue < 0.5 ? 'Niedrige Routingkonfidenz begrenzt hohe Statusstufen.' : undefined,
    ctx.derivationConfidenceValue < 0.5 ? 'Niedrige Ableitungskonfidenz begrenzt den Gesamtscore.' : undefined,
    ctx.claimCalibration.fit === 'overclaim-risk' ? 'Der Gesamtscore wurde wegen Overclaim-Risiko reduziert.' : undefined,
    ctx.claimCalibration.fit === 'underclaim-risk' ? 'Leichte Abwertung wegen systematischer Untertreibung trotz tragfähiger Evidenz.' : undefined,
  ], 6);

  return {
    analysisMode,
    claimStrength,
    nominalClaimStrength,
    claimNote: ctx.claimNote,
    nominalClaimNote,
    claimCalibration,
    overallScore,
    overallStatus,
    overallSummary: overallSummaryFor(ctx, overallStatus),
    overallLevel: levelFromScore(overallScore),
    dimensions,
    strengths,
    watchpoints,
    blockers,
    recommendedFocus,
    scoringProfile: {
      mode: scoringMode,
      label: profile.label,
      analysisMode,
      routingClass: summary?.routingContext?.routingClass,
      pipelineMode: summary?.tablePipeline?.pipelineMode,
      dimensionWeights: (Object.entries(profile.dimensionWeights) as Array<[QualityDimensionKey, number]>).map(([key, weight]) => ({
        key,
        label: DIMENSION_LABELS[key],
        weight,
      })),
      validEvidenceTypes: profile.validEvidenceTypes,
      minimumRequirements: profile.minimumRequirements,
      highScoreRequirements: profile.highScoreRequirements,
      blockerRules: profile.blockerRules,
      dimensionInterpretation: (Object.keys(profile.dimensionInterpretation) as QualityDimensionKey[]).map(key => ({
        key,
        label: DIMENSION_LABELS[key],
        interpretation: profile.dimensionInterpretation[key],
      })),
      scoringReasons,
      blockerReasons,
      confidenceAdjustments,
    },
  };
}
