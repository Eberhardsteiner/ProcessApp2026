import type {
  DerivationSummary,
  ProcessMiningAnalysisMode,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
} from '../../domain/process';
import { deriveProcessArtifactsFromText, LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';
import { detectProcessMiningAnalysisMode, normalizeLabel, uniqueStrings } from './pmShared';
import { inferStepFamily, labelsLikelySameProcessStep } from './semanticStepFamilies';
import { getSampleScenarios } from './sampleCases';

export type BenchmarkStatus = 'pass' | 'attention' | 'fail';

export interface BenchmarkSourceInput {
  name: string;
  text: string;
  sourceType: 'pdf' | 'docx' | 'narrative' | 'csv-row' | 'xlsx-row';
}

export interface BenchmarkExpectation {
  expectedSteps: string[];
  minStepHits: number;
  expectedSignals?: string[];
  minSignalHits?: number;
  expectedRoles?: string[];
  minRoleHits?: number;
  expectedSystems?: string[];
  minSystemHits?: number;
  minEvidencePct?: number;
  expectedMode?: ProcessMiningAnalysisMode;
}

export interface BenchmarkDefinition {
  id: string;
  label: string;
  summary: string;
  sources: BenchmarkSourceInput[];
  expectation: BenchmarkExpectation;
}

export interface BenchmarkMatchSummary {
  expected: string[];
  hits: string[];
  missing: string[];
}

export interface BenchmarkCaseResult {
  id: string;
  label: string;
  summary: string;
  status: BenchmarkStatus;
  score: number;
  headline: string;
  detail: string;
  sources: number;
  analysisMode: ProcessMiningAnalysisMode;
  confidence: DerivationSummary['confidence'];
  methods: DerivationSummary['method'][];
  warnings: string[];
  steps: BenchmarkMatchSummary;
  signals: BenchmarkMatchSummary;
  roles: BenchmarkMatchSummary;
  systems: BenchmarkMatchSummary;
  evidencePct: number;
  observedStepLabels: string[];
}

export interface BenchmarkSuiteResult {
  engineVersion: string;
  computedAt: string;
  overallScore: number;
  status: BenchmarkStatus;
  passedCount: number;
  attentionCount: number;
  failedCount: number;
  headline: string;
  summary: string;
  results: BenchmarkCaseResult[];
}

const GOLD_COMPLAINT_STORY_TEXT = [
  '07:58 Uhr | Der Fall taucht auf, bevor der Tag richtig begonnen hat. Im Posteingang steht: Stillstand wegen FM-240, dringend. Es fehlen Seriennummer, Auftragsnummer und eine klare Aussage, ob die Maschine noch läuft oder komplett steht. Julia muss einschätzen, wie hoch der Fall priorisiert werden soll.',
  '08:18 Uhr | Julia sucht sich den Kontext in CRM, ERP, DMS und E-Mail zusammen. Sie vergleicht Ansprechpartner, Produktfamilie, Lieferschein und Fotos, um überhaupt sicher zu sein, welcher Vorgang betroffen ist.',
  '09:02 Uhr | Sie legt den Vorgang als Qualitätsabweichung mit möglicher Eskalation an, ergänzt einen internen Kommentar und fordert Seriennummer, Betriebsdauer, letzte Wartung und den tatsächlichen Stillstand beim Kunden nach.',
  '10:07 Uhr | Der Fall geht an Qualitätsmanagement und Technik. Ohne Seriennummer und Sensorangabe will sich niemand festlegen. Gleichzeitig wächst der Druck aus dem Key Account, weil eine Schichtplanung abhängt.',
  '11:26 Uhr | Julia recherchiert ähnliche Fälle in CRM und E-Mail. Das Erfahrungswissen liegt verteilt in alten Nachrichten und persönlicher Erinnerung, nicht in einem sauberen Wissensspeicher.',
  '12:14 Uhr | Der Kunde ruft an. Julia formuliert eine vorsichtige Zwischenmeldung, bestätigt die hohe Priorität und hält die Kommunikation stabil, obwohl intern noch Unsicherheit besteht.',
  '14:31 Uhr | Mit der Seriennummer kann die Technik den Fall besser zuordnen. Qualitätsmanagement, Technik und Logistik stimmen eine pragmatische Lösung ab: Express-Ersatzteil, Remote-Unterstützung und nachgelagerte Prüfung des Altteils.',
  '15:48 Uhr | Für die Kosten braucht Julia noch Teamleitung und Vertrieb, weil der Kunde strategisch wichtig ist und die Kulanz begründet werden muss. Danach löst sie den Ersatzauftrag im ERP aus, informiert die Logistik, formuliert die Kundenmail und dokumentiert den Zwischenstand im CRM.',
  'Die Geschichte enthält mehrere Signale, die eine gute Anwendung erkennen sollte: fehlende Pflichtangaben, Eskalationssignale, verteiltes Wissen, implizite Koordination, vorsichtige Kommunikation und Mehrfachdokumentation.',
].join('\n\n');

function buildBenchmarkDefinitions(): BenchmarkDefinition[] {
  const definitions: BenchmarkDefinition[] = [
    {
      id: 'gold-complaint-story',
      label: 'Goldfall Reklamationsgeschichte',
      summary: 'Der narrative Reklamationsfall von Julia Neumann dient als Referenz für fehlende Pflichtangaben, Eskalationsdruck, verteiltes Wissen und viele manuelle Übergaben.',
      sources: [
        {
          name: 'Reklamationsgeschichte Julia Neumann',
          text: GOLD_COMPLAINT_STORY_TEXT,
          sourceType: 'narrative',
        },
      ],
      expectation: {
        expectedSteps: [
          'Reklamationseingang erfassen und Erstlage bewerten',
          'Kunden-, Auftrags- und Produktkontext zusammenführen',
          'Priorität festlegen und fehlende Angaben anfordern',
          'Fachliche Bewertung mit Qualität und Technik anstoßen',
          'Ähnliche Fälle und Erfahrungswissen recherchieren',
          'Zwischenstand an den Kunden kommunizieren',
          'Lösung mit Fachbereichen abstimmen',
          'Freigabe und Kulanzentscheidung einholen',
          'Maßnahme auslösen und Beteiligte informieren',
          'Status dokumentieren und Fall nachhalten',
        ],
        minStepHits: 6,
        expectedSignals: [
          'Fehlende Pflichtangaben',
          'Informationen müssen aus mehreren Systemen zusammengeführt werden',
          'Priorisierung erfolgt unter Unsicherheit',
          'Wartezeiten und Koordinationsaufwand belasten den Ablauf',
          'Erfahrungswissen liegt verstreut und schwer nutzbar vor',
          'Kommunikation muss Unsicherheit professionell abfedern',
          'Mehrfachdokumentation und Medienbrüche erhöhen den Aufwand',
        ],
        minSignalHits: 4,
        expectedRoles: ['Service', 'Qualitätsmanagement', 'Technik', 'Logistik', 'Vertrieb'],
        minRoleHits: 3,
        expectedSystems: ['CRM', 'ERP', 'DMS', 'E-Mail'],
        minSystemHits: 3,
        minEvidencePct: 70,
        expectedMode: 'process-draft',
      },
    },
  ];

  const samples = getSampleScenarios();
  const complaintsPack = samples.find(sample => sample.key === 'complaints');
  const servicePack = samples.find(sample => sample.key === 'service');

  if (complaintsPack) {
    definitions.push({
      id: 'gold-complaints-pack',
      label: complaintsPack.label,
      summary: complaintsPack.summary,
      sources: complaintsPack.sources.map(source => ({ ...source, sourceType: 'narrative' as const })),
      expectation: {
        expectedSteps: [
          'Reklamationseingang erfassen und Erstlage bewerten',
          'Priorität festlegen und fehlende Angaben anfordern',
          'Fachliche Bewertung mit Qualität und Technik anstoßen',
          'Lösung mit Fachbereichen abstimmen',
          'Maßnahme auslösen und Beteiligte informieren',
          'Status dokumentieren und Fall nachhalten',
        ],
        minStepHits: 3,
        expectedSignals: [
          'Fehlende Pflichtangaben',
          'Priorisierung erfolgt unter Unsicherheit',
          'Kommunikation muss Unsicherheit professionell abfedern',
        ],
        minSignalHits: 1,
        expectedRoles: ['Service', 'Technik', 'Qualitätsmanagement', 'Logistik'],
        minRoleHits: 1,
        expectedSystems: ['CRM', 'ERP', 'E-Mail'],
        minSystemHits: 1,
        minEvidencePct: 60,
        expectedMode: 'exploratory-mining',
      },
    });
  }

  if (servicePack) {
    definitions.push({
      id: 'gold-service-pack',
      label: servicePack.label,
      summary: servicePack.summary,
      sources: servicePack.sources.map(source => ({ ...source, sourceType: 'narrative' as const })),
      expectation: {
        expectedSteps: [
          'Ticket',
          'SLA',
          'Diagnose',
          'Einsatz',
          'Störung beheben',
          'Dokumentieren',
        ],
        minStepHits: 4,
        expectedSignals: ['SLA', 'Remote', 'Wiederkehrender Sensorfehler'],
        minSignalHits: 1,
        expectedRoles: ['Service', 'Technik'],
        minRoleHits: 1,
        expectedSystems: ['Ticket', 'Monitoring', 'Leitstand'],
        minSystemHits: 1,
        minEvidencePct: 55,
        expectedMode: 'exploratory-mining',
      },
    });
  }

  return definitions;
}

export function getBenchmarkDefinitions(): BenchmarkDefinition[] {
  return buildBenchmarkDefinitions();
}

function buildConfidenceLevel(summaries: DerivationSummary[]): DerivationSummary['confidence'] {
  if (summaries.some(summary => summary.confidence === 'low')) return 'low';
  if (summaries.some(summary => summary.confidence === 'medium')) return 'medium';
  return 'high';
}

function matchExpectedValues(params: {
  expected: string[];
  actual: string[];
  matcher: (expected: string, actual: string) => boolean;
}): BenchmarkMatchSummary {
  const hits = uniqueStrings(
    params.expected.flatMap(expected => {
      const match = params.actual.find(actual => params.matcher(expected, actual));
      return match ? [expected] : [];
    }),
  );

  return {
    expected: params.expected,
    hits,
    missing: params.expected.filter(expected => !hits.includes(expected)),
  };
}

function stepMatcher(expected: string, actual: string): boolean {
  if (!expected.trim() || !actual.trim()) return false;
  if (expected.startsWith('family:')) {
    return inferStepFamily(actual)?.id === expected.slice(7);
  }
  return labelsLikelySameProcessStep(expected, actual) || normalizeLabel(actual).includes(normalizeLabel(expected));
}

function fuzzyMatcher(expected: string, actual: string): boolean {
  const expectedNorm = normalizeLabel(expected);
  const actualNorm = normalizeLabel(actual);
  if (!expectedNorm || !actualNorm) return false;
  return actualNorm.includes(expectedNorm) || expectedNorm.includes(actualNorm);
}

function aggregateObservations(results: Array<{
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  summary: DerivationSummary;
}>): {
  stepLabels: string[];
  roles: string[];
  systems: string[];
  signals: string[];
  stepObservationCount: number;
  evidenceCount: number;
  methods: DerivationSummary['method'][];
  confidence: DerivationSummary['confidence'];
  warnings: string[];
  analysisMode: ProcessMiningAnalysisMode;
} {
  const stepLabels = uniqueStrings(results.flatMap(result => result.summary.stepLabels));
  const roles = uniqueStrings(results.flatMap(result => result.summary.roles));
  const systems = uniqueStrings(results.flatMap(result => result.summary.systems ?? []));
  const signals = uniqueStrings([
    ...results.flatMap(result => result.summary.issueSignals ?? []),
    ...results.flatMap(result => result.observations.filter(observation => observation.kind === 'issue').map(observation => observation.label)),
  ]);
  const stepObservations = results.flatMap(result => result.observations.filter(observation => observation.kind === 'step'));
  const evidenceCount = stepObservations.filter(observation => Boolean(observation.evidenceSnippet?.trim())).length;
  const warnings = uniqueStrings(results.flatMap(result => result.summary.warnings));
  const methods = uniqueStrings(results.map(result => result.summary.method)) as DerivationSummary['method'][];
  const confidence = buildConfidenceLevel(results.map(result => result.summary));
  const analysisMode = detectProcessMiningAnalysisMode({
    cases: results.flatMap(result => result.cases),
    observations: results.flatMap(result => result.observations),
  });

  return {
    stepLabels,
    roles,
    systems,
    signals,
    stepObservationCount: stepObservations.length,
    evidenceCount,
    methods,
    confidence,
    warnings,
    analysisMode,
  };
}

function scoreMatch(params: {
  hits: number;
  expected: number;
  weight: number;
}): number {
  if (params.expected === 0 || params.weight === 0) return 0;
  return Math.round((params.hits / Math.max(params.expected, 1)) * params.weight);
}

function computeStatus(params: {
  score: number;
  stepHits: number;
  minStepHits: number;
  signalHits: number;
  minSignalHits: number;
  roleHits: number;
  minRoleHits: number;
  systemHits: number;
  minSystemHits: number;
  evidencePct: number;
  minEvidencePct: number;
  modeMatches: boolean;
}): BenchmarkStatus {
  const hardMisses = [
    params.stepHits < params.minStepHits,
    params.signalHits < params.minSignalHits,
    params.roleHits < params.minRoleHits,
    params.systemHits < params.minSystemHits,
    params.evidencePct < params.minEvidencePct,
    !params.modeMatches,
  ].filter(Boolean).length;

  if (params.score >= 75 && hardMisses === 0) return 'pass';
  if (params.score >= 50 && hardMisses <= 4) return 'attention';
  return 'fail';
}

export function runBenchmarkCase(definition: BenchmarkDefinition): BenchmarkCaseResult {
  const sourceResults = definition.sources.map(source =>
    deriveProcessArtifactsFromText({
      text: source.text,
      fileName: source.name,
      sourceType: source.sourceType,
    }),
  );

  const aggregate = aggregateObservations(sourceResults);
  const steps = matchExpectedValues({
    expected: definition.expectation.expectedSteps,
    actual: aggregate.stepLabels,
    matcher: stepMatcher,
  });
  const signals = matchExpectedValues({
    expected: definition.expectation.expectedSignals ?? [],
    actual: aggregate.signals,
    matcher: fuzzyMatcher,
  });
  const roles = matchExpectedValues({
    expected: definition.expectation.expectedRoles ?? [],
    actual: aggregate.roles,
    matcher: fuzzyMatcher,
  });
  const systems = matchExpectedValues({
    expected: definition.expectation.expectedSystems ?? [],
    actual: aggregate.systems,
    matcher: fuzzyMatcher,
  });

  const evidencePct = aggregate.stepObservationCount > 0
    ? Math.round((aggregate.evidenceCount / aggregate.stepObservationCount) * 100)
    : 0;
  const stepScore = scoreMatch({ hits: steps.hits.length, expected: Math.max(1, steps.expected.length), weight: 45 });
  const signalScore = scoreMatch({ hits: signals.hits.length, expected: Math.max(1, signals.expected.length), weight: definition.expectation.expectedSignals?.length ? 20 : 0 });
  const roleScore = scoreMatch({ hits: roles.hits.length, expected: Math.max(1, roles.expected.length), weight: definition.expectation.expectedRoles?.length ? 15 : 0 });
  const systemScore = scoreMatch({ hits: systems.hits.length, expected: Math.max(1, systems.expected.length), weight: definition.expectation.expectedSystems?.length ? 10 : 0 });
  const evidenceScore = Math.round((Math.min(evidencePct, 100) / 100) * 10);
  const score = Math.min(100, stepScore + signalScore + roleScore + systemScore + evidenceScore);
  const modeMatches = definition.expectation.expectedMode ? aggregate.analysisMode === definition.expectation.expectedMode : true;

  const status = computeStatus({
    score,
    stepHits: steps.hits.length,
    minStepHits: definition.expectation.minStepHits,
    signalHits: signals.hits.length,
    minSignalHits: definition.expectation.minSignalHits ?? 0,
    roleHits: roles.hits.length,
    minRoleHits: definition.expectation.minRoleHits ?? 0,
    systemHits: systems.hits.length,
    minSystemHits: definition.expectation.minSystemHits ?? 0,
    evidencePct,
    minEvidencePct: definition.expectation.minEvidencePct ?? 0,
    modeMatches,
  });

  const missingHighlights = uniqueStrings([
    ...steps.missing.slice(0, 2).map(item => `Schritte: ${item}`),
    ...signals.missing.slice(0, 2).map(item => `Signale: ${item}`),
    ...roles.missing.slice(0, 1).map(item => `Rollen: ${item}`),
    ...systems.missing.slice(0, 1).map(item => `Systeme: ${item}`),
    ...(modeMatches ? [] : [`Modus: erwartet ${definition.expectation.expectedMode}, erkannt ${aggregate.analysisMode}`]),
  ]);

  const headline =
    status === 'pass'
      ? 'Die lokale Analyseengine trifft diesen Referenzfall aktuell gut.'
      : status === 'attention'
      ? 'Der Referenzfall ist brauchbar, zeigt aber noch erkennbare Lücken.'
      : 'Der Referenzfall zeigt deutlichen Verbesserungsbedarf in der lokalen Analyse.';

  const detail =
    missingHighlights.length > 0
      ? `Noch nicht stabil genug erkannt: ${missingHighlights.slice(0, 4).join(' · ')}.`
      : 'Die wichtigsten Schritte, Signale und Kontextmerkmale werden aktuell ohne größere Lücken erkannt.';

  return {
    id: definition.id,
    label: definition.label,
    summary: definition.summary,
    status,
    score,
    headline,
    detail,
    sources: definition.sources.length,
    analysisMode: aggregate.analysisMode,
    confidence: aggregate.confidence,
    methods: aggregate.methods,
    warnings: aggregate.warnings,
    steps,
    signals,
    roles,
    systems,
    evidencePct,
    observedStepLabels: aggregate.stepLabels,
  };
}

export function runBenchmarkSuite(): BenchmarkSuiteResult {
  const definitions = getBenchmarkDefinitions();
  const results = definitions.map(runBenchmarkCase);
  const overallScore = results.length > 0
    ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length)
    : 0;
  const passedCount = results.filter(result => result.status === 'pass').length;
  const attentionCount = results.filter(result => result.status === 'attention').length;
  const failedCount = results.filter(result => result.status === 'fail').length;
  const status: BenchmarkStatus = failedCount > 0 ? 'fail' : attentionCount > 0 ? 'attention' : 'pass';

  const headline =
    status === 'pass'
      ? 'Die lokale Analyseengine besteht die aktuellen Goldfälle solide.'
      : failedCount > 0
      ? 'Mindestens ein Goldfall fällt deutlich ab und sollte vor weiteren Umbauten verbessert werden.'
      : 'Die lokale Analyseengine bleibt insgesamt brauchbar, hat aber sichtbare Spannungen in einzelnen Referenzfällen.';

  const summary =
    results.length === 0
      ? 'Es sind noch keine Goldfälle definiert.'
      : `${passedCount} bestanden, ${attentionCount} mit Beobachtungen, ${failedCount} kritisch. Durchschnittlicher Referenzscore: ${overallScore} von 100.`;

  return {
    engineVersion: LOCAL_MINING_ENGINE_VERSION,
    computedAt: new Date().toISOString(),
    overallScore,
    status,
    passedCount,
    attentionCount,
    failedCount,
    headline,
    summary,
    results,
  };
}
