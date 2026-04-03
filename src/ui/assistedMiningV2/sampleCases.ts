import type {
  DerivationSummary,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
} from '../../domain/process';
import { deriveProcessArtifactsFromText, LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';
import { detectProcessMiningAnalysisMode } from './pmShared';
import { aggregateSourceProfiles, buildMultiCaseSummary } from './sourceProfiling';

export interface SampleScenarioDefinition {
  key: 'complaints' | 'service' | 'returns' | 'mixed' | 'procurement' | 'onboarding';
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
  {
    key: 'returns',
    label: 'Beispielpaket Retouren & Garantie',
    summary: 'Drei kurze Fälle zu Rücksendung, Garantieprüfung, Gutschrift und Ersatzentscheidung.',
    sources: [
      {
        name: 'Retourenfall A',
        text:
          '08:05 Ein Kunde meldet eine beschädigte Baugruppe und verlangt Ersatz. Service eröffnet den Retourenfall, prüft CRM, ERP und den Lieferschein, fordert Seriennummer und Fotos nach, klärt mit Qualitätsmanagement die Garantiegrundlage, stimmt mit Logistik die Rücksendung ab, holt die Freigabe für eine Ersatzlieferung ein und informiert den Kunden über RMA, Versandlabel und nächsten Schritte.',
      },
      {
        name: 'Retourenfall B',
        text:
          '10:22 Eine Retoure wird wegen eines wiederkehrenden Fehlers angemeldet. Service gleicht frühere Vorgänge ab, legt den Vorgang im ERP an, prüft mit Qualität und Vertrieb, ob Garantie oder Kulanz greift, veranlasst die Rücksendung an den Wareneingang, bereitet eine Gutschrift vor und dokumentiert die Entscheidung für Kunde, Lager und Buchhaltung.',
      },
      {
        name: 'Retourenfall C',
        text:
          '14:10 Für einen strategisch wichtigen Kunden muss eine Rücksendung besonders schnell abgewickelt werden. Service sammelt fehlende Pflichtangaben, prüft Vertrags- und Garantiebedingungen, stimmt sich mit Technik, Logistik und Teamleitung ab, entscheidet zwischen Austausch und Gutschrift, löst den Ersatz im ERP aus und bestätigt die Retourenabwicklung per E-Mail.',
      },
    ],
  },
  {
    key: 'mixed',
    label: 'Beispielpaket Mischdokumente',
    summary: 'Drei kompakte Mischdokumente mit narrativen Abschnitten, Zusatzinformationen und signalreichem Material.',
    sources: [
      {
        name: 'Mischdokument Reklamation',
        text:
          'Narrative Prozessgeschichte | Reklamation. 07:58 Uhr Eingang einer dringenden Reklamation mit fehlender Seriennummer. Service prüft CRM, ERP und DMS, fordert Pflichtangaben nach, bindet Qualität und Technik ein, stimmt Express-Ersatz und Remote-Unterstützung ab und dokumentiert die Maßnahme. Zusätzliche Signaltabelle: fehlende Pflichtangaben, Eskalationsdruck, verteiltes Wissen.',
      },
      {
        name: 'Mischdokument Service',
        text:
          'Service-Störfall | Zusatzmaterial. 07:05 Uhr Ticket anlegen. 07:30 Uhr SLA prüfen und Einsatz priorisieren. 08:10 Uhr Monitoring, Leitstand und Remote-Diagnose klären den Sensorfehler. 10:20 Uhr Techniker stabilisiert die Anlage. 11:00 Uhr Ticket, Servicebericht und Wissensbasis werden aktualisiert. Hinweis: häufige Reibung sind Medienbrüche und unklare Übergaben.',
      },
      {
        name: 'Mischdokument Retoure',
        text:
          'Retourenfall | Leitfaden und Fallauszug. Service eröffnet die Retoure, prüft CRM und ERP, fordert Fotos und Seriennummer an, klärt Garantie oder Kulanz mit Qualitätsmanagement und Vertrieb, stimmt Rücksendung und Gutschrift mit Logistik ab und bestätigt dem Kunden Ersatz oder Gutschrift. Zusatztext: hoher Abstimmungsaufwand bei Garantie und Freigaben.',
      },
    ],
  },
  {
    key: 'procurement',
    label: 'Beispielpaket Einkauf & Freigaben',
    summary: 'Drei kurze Beschaffungsfälle mit Bedarfsprüfung, Angebotsvergleich, Freigabe und Bestellung.',
    sources: [
      {
        name: 'Beschaffungsfall A',
        text:
          '08:00 Ein Fachbereich meldet einen dringenden Bedarf für ein Prüfgerät. Einkauf legt die Anfrage an, prüft Bedarf, Spezifikation und Kostenstelle, fordert fehlende Angaben nach, holt zwei Angebote ein, stimmt den Vergleich mit Fachbereich und Controlling ab, holt die Budgetfreigabe ein, löst die Bestellung aus und informiert Lieferant und Anforderer über den Stand.',
      },
      {
        name: 'Beschaffungsfall B',
        text:
          '09:30 Eine Standardbeschaffung wird über das Einkaufssystem ausgelöst. Einkauf prüft Pflichtangaben, klärt eine fehlende Kostenstelle, gleicht Rahmenvertrag und Lieferantenoptionen ab, holt die Freigabe der Führungskraft ein, bestellt im ERP und koordiniert anschließend Wareneingang und Rechnungsprüfung mit Lager und Buchhaltung.',
      },
      {
        name: 'Beschaffungsfall C',
        text:
          '14:10 Für eine kurzfristige Ersatzbeschaffung müssen Fachbereich, Einkauf und Lieferant eng abgestimmt arbeiten. Einkauf sammelt technische Anforderungen, vergleicht Angebote, verhandelt Liefertermin und Preis, stimmt die Ausnahmefreigabe mit Controlling ab und löst die Bestellung mit beschleunigter Kommunikation an Lieferant und Fachbereich aus.',
      },
    ],
  },
  {
    key: 'onboarding',
    label: 'Beispielpaket Onboarding & Zugänge',
    summary: 'Drei Onboarding-Fälle mit Stammdaten, Zugängen, Equipment, Freigaben und Startvorbereitung.',
    sources: [
      {
        name: 'Onboardingfall A',
        text:
          '07:50 HR erhält die Vertragsbestätigung für eine neue Kollegin. HR erfasst Eintrittsdatum, Personalnummer und Stammdaten, meldet den Start an IT und Fachbereich, prüft mit der Führungskraft das Rollenprofil, stößt Account, IAM-Berechtigungen und Notebook an, plant Einweisung und Schulung und bestätigt kurz vor Start, dass Arbeitsplatz und Zugänge bereit sind.',
      },
      {
        name: 'Onboardingfall B',
        text:
          '10:15 Bei einem kurzfristigen Einstieg fehlen noch Kostenstelle und Rollenfreigabe. HR und Fachbereich klären die Daten, IT wartet auf die Freigabe für Active Directory und Fachanwendungen, die Führungskraft priorisiert die offenen Punkte, Equipment wird bestellt und die Startkommunikation wird mit Checkliste und Übergabenotiz dokumentiert.',
      },
      {
        name: 'Onboardingfall C',
        text:
          '13:40 Ein internationaler Neueintritt benötigt mehrere Systemzugänge. HR prüft Stammdaten und Datenschutzanforderungen, IT legt Accounts an, der Fachbereich bestätigt Fachrollen und Schulungen, die Führungskraft gibt letzte Berechtigungen frei und am Ende wird der Start mit Einweisung, Equipment und Nacharbeiten dokumentiert.',
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
      analysisProfileLabel: baseCase?.analysisProfileLabel,
      analysisProfileHint: baseCase?.analysisProfileHint,
      analysisStrategies: baseCase?.analysisStrategies,
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
  }

  const sourceProfile = aggregateSourceProfiles(cases.map(caseItem => {
    const result = definition.sources.find(source => source.name === caseItem.name);
    if (!result) return undefined;
    return deriveProcessArtifactsFromText({
      text: result.text,
      fileName: result.name,
      sourceType: 'narrative',
    }).summary.sourceProfile;
  }));
  const summary: DerivationSummary = {
    sourceLabel: definition.label,
    method: methods.has('structured') ? 'structured' : methods.has('semi-structured') ? 'semi-structured' : 'narrative-fallback',
    documentKind: 'case-narrative',
    analysisMode: detectProcessMiningAnalysisMode({ cases, observations }),
    caseCount: cases.length,
    observationCount: observations.length,
    warnings: Array.from(warnings),
    confidence: confidences.has('high') ? 'high' : confidences.has('medium') ? 'medium' : 'low',
    stepLabels: Array.from(stepLabels),
    roles: Array.from(roles),
    systems: Array.from(systems),
    issueSignals: Array.from(issueSignals),
    documentSummary: definition.summary,
    sourceProfile,
    multiCaseSummary: buildMultiCaseSummary(observations),
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · example pack`,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };

  return { cases, observations, summary };
}
