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
  domain: 'complaints' | 'service' | 'returns' | 'mixed';
  kind: 'gold' | 'sample-pack';
  label: string;
  summary: string;
  sources: BenchmarkSourceInput[];
  expectation: BenchmarkExpectation;
}

export interface BenchmarkCoverageSummary {
  totalCases: number;
  goldCaseCount: number;
  samplePackCount: number;
  domains: Array<{
    key: BenchmarkDefinition['domain'];
    label: string;
    count: number;
    note: string;
  }>;
}

export interface BenchmarkMatchSummary {
  expected: string[];
  hits: string[];
  missing: string[];
}

export interface BenchmarkCaseResult {
  id: string;
  label: string;
  domain: BenchmarkDefinition['domain'];
  kind: BenchmarkDefinition['kind'];
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
  dimensionScores: BenchmarkDimensionSummary[];
  observedStepLabels: string[];
}

export type BenchmarkDimensionKey = 'steps' | 'signals' | 'roles' | 'systems' | 'evidence' | 'mode';

export interface BenchmarkDimensionSummary {
  key: BenchmarkDimensionKey;
  label: string;
  score: number;
  note: string;
}

export interface BenchmarkDomainSummary {
  key: BenchmarkDefinition['domain'];
  label: string;
  count: number;
  score: number;
  status: BenchmarkStatus;
}

export interface BenchmarkStrictGate {
  pass: boolean;
  summary: string;
  reasons: string[];
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
  coverage: BenchmarkCoverageSummary;
  domainScores: BenchmarkDomainSummary[];
  dimensionScores: BenchmarkDimensionSummary[];
  recommendations: string[];
  weakestCases: Array<Pick<BenchmarkCaseResult, 'id' | 'label' | 'status' | 'score' | 'domain'>>;
  strictGate: BenchmarkStrictGate;
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

const GOLD_COMPLAINT_MIXED_DOC_TEXT = [
  'Narrative Prozessgeschichte | Kundenreklamationen',
  '3. Die Geschichte',
  '07:58 Uhr | Der Fall taucht auf. Im Posteingang steht: Stillstand wegen FM-240, dringend. Es fehlen Seriennummer, Auftragsnummer und der genaue technische Zustand.',
  '08:18 Uhr | Julia sucht CRM, ERP, DMS und E-Mail gleichzeitig durch, um Kunden-, Auftrags- und Produktkontext zusammenzuführen.',
  '09:02 Uhr | Sie priorisiert den Fall hoch, legt den Vorgang an und fordert fehlende Pflichtangaben nach.',
  '10:07 Uhr | Qualitätsmanagement und Technik bewerten den Fall, gleichzeitig steigt der Druck durch Schichtplanung und Key Account.',
  '11:26 Uhr | Ähnliche Fälle liegen verstreut in CRM, E-Mails und Erfahrung.',
  '12:14 Uhr | Julia gibt dem Kunden eine vorsichtige Zwischenmeldung.',
  '14:31 Uhr | Technik, Qualitätsmanagement und Logistik stimmen Express-Ersatzteil und Remote-Unterstützung ab.',
  '15:48 Uhr | Teamleitung und Vertrieb geben Kulanz und Kosten frei. Julia löst den Ersatz im ERP aus, informiert die Logistik und dokumentiert den Status im CRM.',
  '4. Was Julia als sinnvolle KI-Unterstützung erleben würde',
  'Beobachtete Reibung | Sinnvolle Unterstützung',
  'Unvollständige Eingänge | Vollständigkeitsprüfung',
  'Informationssuche in mehreren Systemen | Fallansicht über CRM, ERP und DMS',
  '5. Welche Signale eine Test-App erkennen sollte',
  'Signal | Erkennbar im Text',
  'Fehlende Pflichtangaben | Seriennummer, Auftragsnummer, technischer Zustand',
  'Verteiltes Wissen | CRM, E-Mails, persönliche Erinnerung',
].join('\n\n');

const GOLD_RETURNS_MIXED_TEXT = [
  'Retouren- und Garantiefall | Mischdokument',
  '08:05 Uhr | Service nimmt eine Retoure auf und prüft Lieferschein, CRM und ERP. Seriennummer und Fotos fehlen zunächst.',
  '09:10 Uhr | Qualitätsmanagement klärt mit Service die Garantiegrundlage und den Prüfbedarf. Vertrieb muss wegen eines strategisch wichtigen Kunden auf Kulanz mitentscheiden.',
  '11:40 Uhr | Logistik und Wareneingang stimmen RMA, Rücksendung und Versandlabel ab. Parallel wird eine Gutschrift vorbereitet.',
  '14:25 Uhr | Teamleitung gibt die Ersatzlieferung frei. Service informiert den Kunden, löst die Retourenabwicklung aus und dokumentiert die Entscheidung.',
  'Zusatzinformationen',
  'Signal | Nutzen',
  'Fehlende Pflichtangaben | Rückfragen und Verzögerung',
  'Garantie, Kulanz und Freigabe | Zusätzlicher Abstimmungsaufwand',
].join('\n\n');

const GOLD_SERVICE_MIXED_TEXT = [
  'Service-Störfall | Mischdokument mit Zusatzmaterial',
  '07:05 Uhr | Ein Ticket meldet Stillstand an einer Verpackungslinie.',
  '07:30 Uhr | Dispatcher prüft SLA, priorisiert den Einsatz und bestätigt das Zeitfenster gegenüber dem Kunden.',
  '08:10 Uhr | Monitoring, Leitstand und Remote-Diagnose zeigen einen Sensorfehler.',
  '10:20 Uhr | Ein Techniker wird eingeplant, spielt eine Korrektur ein und stabilisiert die Anlage.',
  '11:00 Uhr | Ticket, Servicebericht und Wissensbasis werden aktualisiert.',
  'Zusatzmaterial',
  'Hinweis | Medienbrüche zwischen Ticket, Leitstand und Wissensbasis',
].join('\n\n');

const GOLD_MIXED_GUIDE_TEXT = [
  'Praxisleitfaden | Reklamation und Retoure',
  'Pflichtangaben: Seriennummer, Auftragsnummer, Fotos, betroffene Baugruppe',
  '1. Eingang und Erstlage bewerten',
  '2. CRM, ERP und DMS prüfen',
  '3. Fehlende Angaben anfordern',
  '4. Qualität, Technik und Logistik abstimmen',
  '5. Freigabe oder Kulanz klären',
  '6. Maßnahme auslösen und dokumentieren',
  'Zusatzinformation',
  'Signal | Verteiltes Wissen und mehrere manuelle Übergaben',
  'FAQ | Was tun bei fehlender Seriennummer?',
].join('\n\n');

const DOMAIN_META: Record<BenchmarkDefinition['domain'], { label: string; note: string }> = {
  complaints: {
    label: 'Reklamationen',
    note: 'Fehlende Pflichtangaben, Eskalationsdruck, Wissenssuche und Koordination.',
  },
  service: {
    label: 'Service & Störung',
    note: 'Ticket, SLA, Diagnose, Einsatzplanung und Stabilisierung.',
  },
  returns: {
    label: 'Retouren & Garantie',
    note: 'Rücksendung, Garantieprüfung, Kulanz, Gutschrift und Ersatz.',
  },
  mixed: {
    label: 'Mischdokumente',
    note: 'Narrative Geschichten plus Signaltabellen, Hilfetexte und Zusatzmaterial.',
  },
};

function buildBenchmarkDefinitions(): BenchmarkDefinition[] {
  const definitions: BenchmarkDefinition[] = [
    {
      id: 'gold-complaint-story',
      domain: 'complaints',
      kind: 'gold',
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
    {
      id: 'gold-complaint-mixed-document',
      domain: 'mixed',
      kind: 'gold',
      label: 'Goldfall Mischdokument Reklamation',
      summary: 'Prüft, ob die lokale Engine aus einem gemischten Dokument nur den Prozesskern verdichtet und Signal-Tabellen nicht als Schritte fehlinterpretiert.',
      sources: [
        {
          name: 'Mischdokument Reklamation',
          text: GOLD_COMPLAINT_MIXED_DOC_TEXT,
          sourceType: 'docx',
        },
      ],
      expectation: {
        expectedSteps: [
          'family:complaint_intake',
          'family:context_assembly',
          'family:prioritize_and_request',
          'family:technical_assessment',
          'family:customer_update',
          'family:solution_coordination',
          'family:approval',
          'family:execution',
          'family:documentation_followup',
        ],
        minStepHits: 6,
        expectedSignals: [
          'Fehlende Pflichtangaben',
          'Informationen müssen aus mehreren Systemen zusammengeführt werden',
          'Priorisierung erfolgt unter Unsicherheit',
          'Erfahrungswissen liegt verstreut und schwer nutzbar vor',
        ],
        minSignalHits: 2,
        expectedRoles: ['Qualitätsmanagement', 'Technik', 'Logistik', 'Vertrieb'],
        minRoleHits: 2,
        expectedSystems: ['CRM', 'ERP', 'DMS', 'E-Mail'],
        minSystemHits: 3,
        minEvidencePct: 65,
        expectedMode: 'process-draft',
      },
    },
    {
      id: 'gold-returns-mixed-document',
      domain: 'returns',
      kind: 'gold',
      label: 'Goldfall Retouren & Garantie',
      summary: 'Prüft Garantieklärung, Kulanz, Rücksendung und Ersatzentscheidung in einem kompakten Retourenfall.',
      sources: [
        {
          name: 'Retourenfall Mischdokument',
          text: GOLD_RETURNS_MIXED_TEXT,
          sourceType: 'docx',
        },
      ],
      expectation: {
        expectedSteps: [
          'family:return_intake',
          'family:warranty_check',
          'family:solution_coordination',
          'family:execution',
        ],
        minStepHits: 3,
        expectedSignals: [
          'Fehlende Pflichtangaben',
          'Retouren- und Garantieklärung erzeugen zusätzlichen Abstimmungsaufwand',
        ],
        minSignalHits: 1,
        expectedRoles: ['Service', 'Qualitätsmanagement', 'Vertrieb', 'Logistik'],
        minRoleHits: 2,
        expectedSystems: ['CRM', 'ERP'],
        minSystemHits: 1,
        minEvidencePct: 60,
        expectedMode: 'process-draft',
      },
    },
    {
      id: 'gold-service-mixed-document',
      domain: 'service',
      kind: 'gold',
      label: 'Goldfall Service-Mischdokument',
      summary: 'Prüft Ticket, SLA, Diagnose, Einsatz und Dokumentation in einem kompakten Service-Mischdokument.',
      sources: [
        {
          name: 'Service-Mischdokument',
          text: GOLD_SERVICE_MIXED_TEXT,
          sourceType: 'pdf',
        },
      ],
      expectation: {
        expectedSteps: [
          'family:service_ticket_intake',
          'family:service_triage',
          'family:service_diagnosis',
          'family:service_execution',
          'family:service_documentation',
        ],
        minStepHits: 4,
        expectedSignals: ['Medienbrüche', 'Sensorfehler'],
        minSignalHits: 1,
        expectedRoles: ['Service', 'Technik'],
        minRoleHits: 1,
        expectedSystems: ['Ticket', 'Monitoring', 'Leitstand'],
        minSystemHits: 2,
        minEvidencePct: 60,
        expectedMode: 'process-draft',
      },
    },
    {
      id: 'gold-mixed-guide-document',
      domain: 'mixed',
      kind: 'gold',
      label: 'Goldfall Leitfaden mit Zusatzmaterial',
      summary: 'Prüft, ob ein kurzer Leitfaden mit FAQ und Signaltabelle trotzdem zu einem brauchbaren Prozessentwurf verdichtet wird.',
      sources: [
        {
          name: 'Praxisleitfaden Mischdokument',
          text: GOLD_MIXED_GUIDE_TEXT,
          sourceType: 'docx',
        },
      ],
      expectation: {
        expectedSteps: [
          'family:complaint_intake',
          'family:solution_coordination',
          'family:approval',
          'family:execution',
        ],
        minStepHits: 4,
        expectedSignals: ['Fehlende Pflichtangaben', 'Verteiltes Wissen'],
        minSignalHits: 2,
        expectedRoles: ['Technik', 'Logistik'],
        minRoleHits: 2,
        expectedSystems: ['CRM', 'ERP', 'DMS'],
        minSystemHits: 2,
        minEvidencePct: 60,
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
      domain: 'complaints',
      kind: 'sample-pack',
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
      domain: 'service',
      kind: 'sample-pack',
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

  const mixedPack = samples.find(sample => sample.key === 'mixed');
  if (mixedPack) {
    definitions.push({
      id: 'gold-mixed-pack',
      domain: 'mixed',
      kind: 'sample-pack',
      label: mixedPack.label,
      summary: mixedPack.summary,
      sources: mixedPack.sources.map(source => ({ ...source, sourceType: 'narrative' as const })),
      expectation: {
        expectedSteps: [
          'Kunden-, Auftrags- und Produktkontext zusammenführen',
          'Lösung mit Fachbereichen abstimmen',
          'family:service_diagnosis',
          'family:return_intake',
        ],
        minStepHits: 3,
        expectedSignals: ['Fehlende Pflichtangaben', 'Medienbrüche', 'Retouren- und Garantieklärung'],
        minSignalHits: 1,
        expectedRoles: ['Service', 'Technik', 'Logistik'],
        minRoleHits: 1,
        expectedSystems: ['CRM', 'ERP'],
        minSystemHits: 1,
        minEvidencePct: 55,
        expectedMode: 'exploratory-mining',
      },
    });
  }

  const returnsPack = samples.find(sample => sample.key === 'returns');
  if (returnsPack) {
    definitions.push({
      id: 'gold-returns-pack',
      domain: 'returns',
      kind: 'sample-pack',
      label: returnsPack.label,
      summary: returnsPack.summary,
      sources: returnsPack.sources.map(source => ({ ...source, sourceType: 'narrative' as const })),
      expectation: {
        expectedSteps: [
          'family:return_intake',
          'family:warranty_check',
          'family:approval',
          'family:execution',
        ],
        minStepHits: 3,
        expectedSignals: [
          'Retouren- und Garantieklärung erzeugen zusätzlichen Abstimmungsaufwand',
          'Freigaben verlangsamen die Umsetzung',
        ],
        minSignalHits: 1,
        expectedRoles: ['Service', 'Qualitätsmanagement', 'Logistik'],
        minRoleHits: 1,
        expectedSystems: ['CRM', 'ERP'],
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

export function getBenchmarkCoverageSummary(): BenchmarkCoverageSummary {
  const definitions = getBenchmarkDefinitions();
  const domains = Object.entries(DOMAIN_META)
    .map(([key, meta]) => ({
      key: key as BenchmarkDefinition['domain'],
      label: meta.label,
      note: meta.note,
      count: definitions.filter(definition => definition.domain === key).length,
    }))
    .filter(entry => entry.count > 0);

  return {
    totalCases: definitions.length,
    goldCaseCount: definitions.filter(definition => definition.kind === 'gold').length,
    samplePackCount: definitions.filter(definition => definition.kind === 'sample-pack').length,
    domains,
  };
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

const DIMENSION_LABELS: Record<BenchmarkDimensionKey, string> = {
  steps: 'Schritte',
  signals: 'Reibungssignale',
  roles: 'Rollen',
  systems: 'Systeme',
  evidence: 'Belegstellen',
  mode: 'Analysemodus',
};

function ratioToScore(hits: number, expected: number): number {
  if (expected <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((hits / Math.max(expected, 1)) * 100)));
}

function computeDimensionNote(key: BenchmarkDimensionKey, score: number): string {
  if (score >= 85) {
    return `${DIMENSION_LABELS[key]} werden in der Referenzbibliothek aktuell stabil getroffen.`;
  }
  if (score >= 65) {
    return `${DIMENSION_LABELS[key]} sind brauchbar, profitieren aber noch von weiterer Stabilisierung.`;
  }
  return `${DIMENSION_LABELS[key]} sind derzeit die schwächere Seite der lokalen Engine.`;
}

function computeWeightedScore(scores: Record<BenchmarkDimensionKey, number>): number {
  const weighted =
    scores.steps * 0.4 +
    scores.signals * 0.18 +
    scores.roles * 0.12 +
    scores.systems * 0.1 +
    scores.evidence * 0.12 +
    scores.mode * 0.08;
  return Math.round(weighted);
}

function buildDimensionScores(params: {
  steps: BenchmarkMatchSummary;
  signals: BenchmarkMatchSummary;
  roles: BenchmarkMatchSummary;
  systems: BenchmarkMatchSummary;
  evidencePct: number;
  modeMatches: boolean;
}): BenchmarkDimensionSummary[] {
  const rawScores: Record<BenchmarkDimensionKey, number> = {
    steps: ratioToScore(params.steps.hits.length, params.steps.expected.length),
    signals: ratioToScore(params.signals.hits.length, params.signals.expected.length),
    roles: ratioToScore(params.roles.hits.length, params.roles.expected.length),
    systems: ratioToScore(params.systems.hits.length, params.systems.expected.length),
    evidence: Math.max(0, Math.min(100, params.evidencePct)),
    mode: params.modeMatches ? 100 : 0,
  };

  return (Object.keys(DIMENSION_LABELS) as BenchmarkDimensionKey[]).map(key => ({
    key,
    label: DIMENSION_LABELS[key],
    score: rawScores[key],
    note: computeDimensionNote(key, rawScores[key]),
  }));
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

  if (params.score >= 78 && hardMisses === 0) return 'pass';
  if (params.score >= 55 && hardMisses <= 4) return 'attention';
  return 'fail';
}

function benchmarkStatusFromScore(score: number): BenchmarkStatus {
  if (score >= 85) return 'pass';
  if (score >= 65) return 'attention';
  return 'fail';
}

function computeDomainScores(results: BenchmarkCaseResult[]): BenchmarkDomainSummary[] {
  return (Object.entries(DOMAIN_META) as Array<[BenchmarkDefinition['domain'], (typeof DOMAIN_META)[BenchmarkDefinition['domain']]]>)
    .map(([key, meta]) => {
      const cases = results.filter(result => result.domain === key);
      if (cases.length === 0) return null;
      const score = Math.round(cases.reduce((sum, item) => sum + item.score, 0) / cases.length);
      return {
        key,
        label: meta.label,
        count: cases.length,
        score,
        status: benchmarkStatusFromScore(score),
      };
    })
    .filter((item): item is BenchmarkDomainSummary => Boolean(item));
}

function computeDimensionAverages(results: BenchmarkCaseResult[]): BenchmarkDimensionSummary[] {
  return (Object.keys(DIMENSION_LABELS) as BenchmarkDimensionKey[]).map(key => {
    const values = results.map(result => result.dimensionScores.find(item => item.key === key)?.score ?? 0);
    const score = values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    return {
      key,
      label: DIMENSION_LABELS[key],
      score,
      note: computeDimensionNote(key, score),
    };
  });
}

function buildStrictGate(params: {
  results: BenchmarkCaseResult[];
  overallScore: number;
  domainScores: BenchmarkDomainSummary[];
  dimensionScores: BenchmarkDimensionSummary[];
}): BenchmarkStrictGate {
  const goldCases = params.results.filter(result => result.kind === 'gold');
  const goldAverage = goldCases.length > 0
    ? Math.round(goldCases.reduce((sum, item) => sum + item.score, 0) / goldCases.length)
    : params.overallScore;
  const evidenceScore = params.dimensionScores.find(item => item.key === 'evidence')?.score ?? 0;
  const weakDomains = params.domainScores.filter(item => item.score < 75);
  const criticalCases = params.results.filter(item => item.status === 'fail');
  const reasons: string[] = [];

  if (criticalCases.length > 0) {
    reasons.push(`${criticalCases.length} Referenzfälle sind aktuell kritisch.`);
  }
  if (params.overallScore < 85) {
    reasons.push(`Der Gesamtscore liegt mit ${params.overallScore} unter der Zielmarke 85.`);
  }
  if (goldAverage < 85) {
    reasons.push(`Die Goldfälle liegen im Schnitt nur bei ${goldAverage}.`);
  }
  if (weakDomains.length > 0) {
    reasons.push(`Mindestens ein Fachfeld bleibt unter 75: ${weakDomains.map(item => item.label).join(', ')}.`);
  }
  if (evidenceScore < 60) {
    reasons.push(`Die Belegstellen liegen mit ${evidenceScore} noch unter der Zielmarke 60.`);
  }

  return {
    pass: reasons.length === 0,
    summary: reasons.length === 0
      ? 'Strenger Qualitätscheck bestanden: keine kritischen Fälle, starke Goldfälle und stabile Fachfelder.'
      : `Strenger Qualitätscheck noch nicht bestanden: ${reasons.slice(0, 3).join(' ')}`,
    reasons,
  };
}

function buildRecommendations(params: {
  results: BenchmarkCaseResult[];
  domainScores: BenchmarkDomainSummary[];
  dimensionScores: BenchmarkDimensionSummary[];
}): string[] {
  const recommendations: string[] = [];
  const weakestDimension = [...params.dimensionScores].sort((a, b) => a.score - b.score)[0];
  const weakestDomain = [...params.domainScores].sort((a, b) => a.score - b.score)[0];
  const weakestCases = [...params.results].sort((a, b) => a.score - b.score).slice(0, 2);

  if (weakestDimension && weakestDimension.score < 85) {
    recommendations.push(`Als Nächstes ${weakestDimension.label.toLowerCase()} nachschärfen. Dort liegt die Bibliothek aktuell nur bei ${weakestDimension.score}/100.`);
  }
  if (weakestDomain && weakestDomain.score < 85) {
    recommendations.push(`Das Fachfeld ${weakestDomain.label} braucht als Nächstes mehr Pflege. Der Domainscore liegt bei ${weakestDomain.score}/100.`);
  }
  if (weakestCases.length > 0 && weakestCases[0].score < 90) {
    recommendations.push(`Zuerst die schwächsten Referenzfälle prüfen: ${weakestCases.map(item => item.label).join(' · ')}.`);
  }
  if (recommendations.length === 0) {
    recommendations.push('Die Referenzbibliothek wirkt stabil. Als Nächstes lohnt sich eher UI-Feinschliff oder zusätzliche Fachpakete.');
  }
  return uniqueStrings(recommendations);
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
  const modeMatches = definition.expectation.expectedMode ? aggregate.analysisMode === definition.expectation.expectedMode : true;
  const dimensionScores = buildDimensionScores({
    steps,
    signals,
    roles,
    systems,
    evidencePct,
    modeMatches,
  });
  const rawDimensionMap = Object.fromEntries(dimensionScores.map(item => [item.key, item.score])) as Record<BenchmarkDimensionKey, number>;
  const score = computeWeightedScore(rawDimensionMap);

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
    domain: definition.domain,
    kind: definition.kind,
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
    dimensionScores,
    observedStepLabels: aggregate.stepLabels,
  };
}

export function runBenchmarkSuite(): BenchmarkSuiteResult {
  const definitions = getBenchmarkDefinitions();
  const coverage = getBenchmarkCoverageSummary();
  const results = definitions.map(runBenchmarkCase);
  const overallScore = results.length > 0
    ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length)
    : 0;
  const passedCount = results.filter(result => result.status === 'pass').length;
  const attentionCount = results.filter(result => result.status === 'attention').length;
  const failedCount = results.filter(result => result.status === 'fail').length;
  const status: BenchmarkStatus = failedCount > 0 ? 'fail' : attentionCount > 0 ? 'attention' : 'pass';
  const domainScores = computeDomainScores(results);
  const dimensionScores = computeDimensionAverages(results);
  const strictGate = buildStrictGate({ results, overallScore, domainScores, dimensionScores });
  const weakestCases = [...results]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(result => ({
      id: result.id,
      label: result.label,
      domain: result.domain,
      score: result.score,
      status: result.status,
    }));
  const recommendations = buildRecommendations({ results, domainScores, dimensionScores });

  const headline =
    status === 'pass'
      ? 'Die lokale Analyseengine besteht die aktuellen Goldfälle solide.'
      : failedCount > 0
      ? 'Mindestens ein Goldfall fällt deutlich ab und sollte vor weiteren Umbauten verbessert werden.'
      : 'Die lokale Analyseengine bleibt insgesamt brauchbar, hat aber sichtbare Spannungen in einzelnen Referenzfällen.';

  const summary =
    results.length === 0
      ? 'Es sind noch keine Goldfälle definiert.'
      : `${results.length} Referenzfälle aus ${coverage.domains.length} Fachbereichen geprüft. ${passedCount} bestanden, ${attentionCount} mit Beobachtungen, ${failedCount} kritisch. Durchschnittlicher Referenzscore: ${overallScore} von 100.`;

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
    coverage,
    domainScores,
    dimensionScores,
    recommendations,
    weakestCases,
    strictGate,
    results,
  };
}
