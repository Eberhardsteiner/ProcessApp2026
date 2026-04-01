import type {
  DerivationSummary,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
} from '../../domain/process';
import { deriveProcessArtifactsFromText, LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';

export interface SampleScenarioDefinition {
  key: 'complaints' | 'service';
  label: string;
  summary: string;
  sources: Array<{ name: string; text: string }>;
}

export interface SampleScenarioPayload {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  summary: DerivationSummary;
}

const SAMPLE_SCENARIOS: SampleScenarioDefinition[] = [
  {
    key: 'complaints',
    label: 'Beispielpaket Reklamationen',
    summary: 'Drei kurze Reklamationsfälle mit Priorisierung, Rückfragen, Freigabe und Ersatzteilentscheidung.',
    sources: [
      {
        name: 'Reklamation A',
        text:
          '07:55 Eingang einer Reklamation per E-Mail. Die Seriennummer fehlt, der Kunde meldet Stillstand. Service legt den Fall an, prüft CRM und ERP, fragt Seriennummer und Betriebsdauer nach, stuft den Vorgang hoch ein, bindet Technik und Qualitätsmanagement ein, erhält später die fehlenden Angaben, organisiert ein Express-Ersatzteil und informiert den Kunden mit einer Zwischenmeldung.',
      },
      {
        name: 'Reklamation B',
        text:
          '08:20 Eine Reklamation kommt über den Vertrieb. Die Maschine läuft noch eingeschränkt. Service sammelt Fotos, prüft frühere ähnliche Fälle, priorisiert mittel, bittet Technik um Einschätzung, lässt eine Remote-Prüfung durchführen, dokumentiert die Ursache und schließt den Fall nach erfolgreicher Rückmeldung des Kunden.',
      },
      {
        name: 'Reklamation C',
        text:
          '09:10 Ein strategisch wichtiger Kunde meldet einen hitzebedingten Fehler. Service prüft Auftragsdaten, ergänzt fehlende Pflichtangaben, stimmt sich mit Qualität, Technik und Logistik ab, bereitet die Kulanzfreigabe vor, organisiert Ersatzteil und Remote-Unterstützung, dokumentiert den Verlauf im CRM und bestätigt dem Kunden die nächsten Schritte.',
      },
    ],
  },
  {
    key: 'service',
    label: 'Beispielpaket Service-Störung',
    summary: 'Zwei Servicefälle mit Ticketanlage, Triage, Diagnose, Einsatzplanung und Abschlussdokumentation.',
    sources: [
      {
        name: 'Servicefall A',
        text:
          '06:40 Ein Ticket meldet eine Störung an einer Verpackungslinie. Der Dispatcher legt den Fall an, prüft den SLA-Rahmen, holt Diagnoseinformationen aus Monitoring und Leitstand, priorisiert den Einsatz, plant einen Techniker ein, bestätigt dem Kunden das Zeitfenster, der Techniker behebt die Störung vor Ort und dokumentiert die Ursache im Servicebericht.',
      },
      {
        name: 'Servicefall B',
        text:
          '11:05 Ein wiederkehrender Sensorfehler wird telefonisch gemeldet. Service nimmt die Störung auf, gleicht die Historie ab, empfiehlt zunächst eine Remote-Diagnose, erkennt ein Konfigurationsproblem, spielt die Korrektur ein, bestätigt die Wiederinbetriebnahme und aktualisiert Ticket, Wissensbasis und Übergabenotiz.',
      },
    ],
  },
];

export function getSampleScenarios(): SampleScenarioDefinition[] {
  return SAMPLE_SCENARIOS;
}

export function buildSampleScenario(key: SampleScenarioDefinition['key']): SampleScenarioPayload {
  const definition = SAMPLE_SCENARIOS.find(entry => entry.key === key);
  if (!definition) {
    throw new Error(`Unknown sample scenario: ${key}`);
  }

  const cases: ProcessMiningObservationCase[] = [];
  const observations: ProcessMiningObservation[] = [];
  const stepLabels = new Set<string>();
  const roles = new Set<string>();
  const systems = new Set<string>();
  const issueSignals = new Set<string>();
  const warnings = new Set<string>();
  const methods = new Set<string>();
  const confidences = new Set<string>();
  const analysisModes = new Set<string>();

  for (const source of definition.sources) {
    const result = deriveProcessArtifactsFromText({
      text: source.text,
      fileName: source.name,
      sourceType: 'narrative',
    });

    const baseCase = result.cases[0];
    const caseId = crypto.randomUUID();
    const now = new Date().toISOString();
    const caseItem: ProcessMiningObservationCase = {
      id: caseId,
      name: source.name,
      narrative: baseCase?.narrative ?? source.text,
      rawText: baseCase?.rawText ?? source.text,
      inputKind: 'narrative',
      sourceType: 'narrative',
      sourceNote: `Beispielquelle: ${definition.label}`,
      derivedStepLabels: result.summary.stepLabels,
      createdAt: now,
      updatedAt: now,
    };
    cases.push(caseItem);

    result.observations.forEach((observation, index) => {
      observations.push({
        ...observation,
        id: crypto.randomUUID(),
        sourceCaseId: caseId,
        sequenceIndex: observation.sequenceIndex ?? index,
      });
    });

    result.summary.stepLabels.forEach(label => stepLabels.add(label));
    result.summary.roles.forEach(role => roles.add(role));
    (result.summary.systems ?? []).forEach(system => systems.add(system));
    (result.summary.issueSignals ?? []).forEach(signal => issueSignals.add(signal));
    result.summary.warnings.forEach(warning => warnings.add(warning));
    methods.add(result.summary.method);
    confidences.add(result.summary.confidence);
    analysisModes.add(result.summary.analysisMode);
  }

  const summary: DerivationSummary = {
    sourceLabel: definition.label,
    method: methods.has('structured') ? 'structured' : methods.has('semi-structured') ? 'semi-structured' : 'narrative-fallback',
    documentKind: 'case-narrative',
    analysisMode: analysisModes.has('true-mining') ? 'true-mining' : analysisModes.has('exploratory-mining') ? 'exploratory-mining' : 'process-draft',
    caseCount: cases.length,
    observationCount: observations.length,
    warnings: Array.from(warnings),
    confidence: confidences.has('high') ? 'high' : confidences.has('medium') ? 'medium' : 'low',
    stepLabels: Array.from(stepLabels),
    roles: Array.from(roles),
    systems: Array.from(systems),
    issueSignals: Array.from(issueSignals),
    documentSummary: definition.summary,
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · example pack`,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };

  return { cases, observations, summary };
}
