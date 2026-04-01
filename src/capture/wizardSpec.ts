import type { WizardQuestion } from './wizardTypes';

export const WIZARD_QUESTIONS: WizardQuestion[] = [
  {
    id: 'scope_trigger',
    phase: 'scope',
    title: 'Prozessstart',
    prompt: 'Was löst diesen Prozess aus? Was ist der Startpunkt?',
    help: 'Beschreiben Sie das Ereignis oder den Bedarf, der den Prozess startet. Beispiel: "Kundenanfrage geht ein" oder "Monatserster wird erreicht".',
    examples: [
      'Kundenanfrage geht ein',
      'Bestellung wird ausgelöst',
      'Mitarbeiter wird eingestellt',
      'Rechnung geht ein',
    ],
    required: true,
    type: 'short_text',
    validation: {
      minLen: 5,
      maxLen: 200,
      message: 'Bitte geben Sie einen aussagekräftigen Auslöser an (5-200 Zeichen)',
    },
    mapsTo: {
      target: 'version',
      path: 'endToEndDefinition.trigger',
    },
  },
  {
    id: 'scope_customer',
    phase: 'scope',
    title: 'Prozesskunde',
    prompt: 'Wer ist der Kunde dieses Prozesses? Für wen wird das Ergebnis erstellt?',
    help: 'Das kann ein externer Kunde sein oder eine interne Abteilung. Wichtig ist: Wer profitiert vom Ergebnis?',
    examples: [
      'Externer Kunde',
      'Vertriebsabteilung',
      'Geschäftsführung',
      'Mitarbeiter',
      'Lieferant',
    ],
    required: true,
    type: 'short_text',
    validation: {
      minLen: 3,
      maxLen: 100,
      message: 'Bitte geben Sie den Kunden an (3-100 Zeichen)',
    },
    mapsTo: {
      target: 'version',
      path: 'endToEndDefinition.customer',
    },
  },
  {
    id: 'scope_outcome',
    phase: 'scope',
    title: 'Prozessergebnis',
    prompt: 'Was ist das Ergebnis dieses Prozesses? Was wird geliefert?',
    help: 'Beschreiben Sie das konkrete Output oder Ziel des Prozesses. Dies sollte messbar oder prüfbar sein.',
    examples: [
      'Angebot ist versendet',
      'Rechnung ist bezahlt',
      'Produkt ist ausgeliefert',
      'Mitarbeiter ist eingearbeitet',
    ],
    required: true,
    type: 'short_text',
    validation: {
      minLen: 5,
      maxLen: 200,
      message: 'Bitte geben Sie ein konkretes Ergebnis an (5-200 Zeichen)',
    },
    mapsTo: {
      target: 'version',
      path: 'endToEndDefinition.outcome',
    },
  },
  {
    id: 'scope_done_criteria',
    phase: 'scope',
    title: 'Fertigstellungskriterium',
    prompt: 'Woran erkennen Sie, dass der Prozess erfolgreich abgeschlossen ist?',
    help: 'Optional, aber hilfreich: Was ist das konkrete "Done"-Kriterium? Dies hilft, den Prozess klar abzugrenzen.',
    examples: [
      'Kunde hat Auftragsbestätigung erhalten',
      'Zahlung ist auf dem Konto eingegangen',
      'Lieferschein ist unterschrieben',
    ],
    required: false,
    type: 'short_text',
    validation: {
      maxLen: 200,
    },
    mapsTo: {
      target: 'version',
      path: 'endToEndDefinition.doneCriteria',
    },
  },
  {
    id: 'scope_purpose',
    phase: 'scope',
    title: 'Kurzer Prozesszweck',
    prompt: 'In einem Satz: Warum gibt es diesen Prozess? Was ist sein Zweck?',
    help: 'Optional: Eine kurze Zusammenfassung hilft anderen, den Kontext zu verstehen.',
    examples: [
      'Sicherstellen, dass Kundenanfragen schnell und korrekt bearbeitet werden',
      'Gewährleisten, dass neue Mitarbeiter effektiv eingearbeitet werden',
    ],
    required: false,
    type: 'long_text',
    validation: {
      maxLen: 500,
    },
    mapsTo: {
      target: 'draft',
      path: 'notes[0]',
    },
  },
  {
    id: 'scope_frequency',
    phase: 'scope',
    title: 'Häufigkeit (grob)',
    prompt: 'Wie oft tritt dieser Prozess typischerweise auf?',
    help: 'Schätzen Sie grob. "Unbekannt" oder "Ad hoc" ist völlig ok. Ziel ist Priorisierung, nicht Genauigkeit.',
    required: false,
    type: 'single_select',
    options: [
      { value: 'daily', label: 'Täglich' },
      { value: 'weekly', label: 'Wöchentlich' },
      { value: 'monthly', label: 'Monatlich' },
      { value: 'quarterly', label: 'Quartalsweise' },
      { value: 'yearly', label: 'Jährlich' },
      { value: 'ad_hoc', label: 'Ad hoc / unregelmäßig' },
      { value: 'unknown', label: 'Unbekannt' },
    ],
    mapsTo: {
      target: 'sidecar',
      path: 'operationalContext.frequency',
    },
  },
  {
    id: 'scope_lead_time',
    phase: 'scope',
    title: 'Typische Durchlaufzeit (End-to-End)',
    prompt: 'Wie lange dauert ein typischer Fall vom Start bis zum Ergebnis?',
    help: 'Grobe Schätzung reicht. Wenn es stark schwankt, wählen Sie "Variiert".',
    required: false,
    type: 'single_select',
    options: [
      { value: 'minutes', label: 'Minuten' },
      { value: 'hours', label: 'Stunden' },
      { value: '1_day', label: 'Bis 1 Tag' },
      { value: '2_5_days', label: '2 bis 5 Tage' },
      { value: '1_2_weeks', label: '1 bis 2 Wochen' },
      { value: 'over_2_weeks', label: 'Mehr als 2 Wochen' },
      { value: 'varies', label: 'Variiert stark' },
      { value: 'unknown', label: 'Unbekannt' },
    ],
    mapsTo: {
      target: 'sidecar',
      path: 'operationalContext.typicalLeadTime',
    },
  },

  {
    id: 'happy_path_steps',
    phase: 'happy_path',
    title: 'Hauptschritte des Prozesses',
    prompt:
      'Listen Sie mindestens 5 Hauptschritte auf, die in einem typischen Durchlauf passieren (Happy Path).',
    help: 'Beschreiben Sie die wichtigsten Schritte in der Reihenfolge, in der sie normalerweise ablaufen. Nutzen Sie die Form "Substantiv + Verb" (z.B. "Rechnung prüfen"). Wenn sehr viele Schritte nötig sind, überlegen Sie, ob einzelne Teile als Unterprozesse modelliert werden sollten.',
    examples: [
      'Kundenanfrage erfassen',
      'Verfügbarkeit prüfen',
      'Angebot erstellen',
      'Angebot versenden',
      'Auftragsbestätigung erhalten',
    ],
    required: true,
    type: 'list',
    validation: {
      minLen: 5,
      message: 'Bitte listen Sie mindestens 5 Hauptschritte auf',
    },
    mapsTo: {
      target: 'draft',
      path: 'happyPath',
    },
  },

  {
    id: 'roles_list',
    phase: 'roles',
    title: 'Beteiligte Rollen',
    prompt: 'Welche Rollen, Personen oder Systeme sind an diesem Prozess beteiligt?',
    help: 'Listen Sie alle relevanten Akteure auf. Das können Personen (z.B. "Sachbearbeiter"), Rollen (z.B. "Teamleiter"), Abteilungen (z.B. "Vertrieb") oder IT-Systeme (z.B. "SAP ERP") sein.',
    examples: ['Sachbearbeiter', 'Teamleiter', 'Kunde', 'SAP ERP', 'E-Mail-System'],
    required: true,
    type: 'list',
    validation: {
      minLen: 1,
      message: 'Bitte geben Sie mindestens eine Rolle an',
    },
    mapsTo: {
      target: 'sidecar',
      path: 'roles',
    },
  },

  {
    id: 'decisions_list',
    phase: 'decisions',
    title: 'Entscheidungen und Verzweigungen',
    prompt:
      'An welchen Stellen im Prozess gibt es Entscheidungen oder Verzweigungen? Was wird entschieden?',
    help: 'Beschreiben Sie Punkte, an denen der Prozess verschiedene Wege nehmen kann. Ordnen Sie jede Entscheidung einem Schritt zu, indem Sie die Schrittnummer (1-basiert) oder den Schrittnamen voranstellen. Format: "3: Frage?" oder "nach Rechnung prüfen: Frage?". Wenn keine Zuordnung angegeben wird, wird die Entscheidung dem letzten Schritt zugeordnet.',
    examples: [
      '3: Betrag > 10.000 EUR?',
      'nach Rechnung prüfen: Betrag korrekt?',
      '5: Kunde bereits bekannt?',
      '7: Material verfügbar?',
    ],
    required: false,
    type: 'list',
    validation: {
      maxLen: 10,
    },
    mapsTo: {
      target: 'draft',
      path: 'decisions',
    },
  },

  {
    id: 'exceptions_missing_data',
    phase: 'exceptions',
    title: 'Fehlende Informationen',
    prompt: 'Was passiert, wenn wichtige Informationen oder Daten fehlen?',
    help: 'Beschreiben Sie, wie der Prozess damit umgeht, wenn benötigte Informationen nicht verfügbar sind.',
    examples: [
      'Rückfrage beim Kunden',
      'Prozess wird pausiert',
      'Standardwert wird angenommen',
    ],
    required: false,
    type: 'long_text',
    validation: {
      maxLen: 500,
    },
    mapsTo: {
      target: 'draft',
      path: 'exceptions[0].handling',
    },
  },

  {
    id: 'exceptions_timeout',
    phase: 'exceptions',
    title: 'Zeitüberschreitungen',
    prompt: 'Was passiert, wenn Fristen überschritten werden oder Antworten zu spät kommen?',
    help: 'Beschreiben Sie Eskalationen oder alternative Abläufe bei Verzögerungen.',
    examples: ['Eskalation an Vorgesetzten', 'Automatische Erinnerung', 'Prozess wird abgebrochen'],
    required: false,
    type: 'long_text',
    validation: {
      maxLen: 500,
    },
    mapsTo: {
      target: 'draft',
      path: 'exceptions[1].handling',
    },
  },

  {
    id: 'exceptions_errors',
    phase: 'exceptions',
    title: 'Fehler und Probleme',
    prompt: 'Welche typischen Fehler oder Probleme können auftreten und wie werden sie behandelt?',
    help: 'Denken Sie an technische Fehler, fehlerhafte Eingaben, Systemausfälle etc.',
    examples: [
      'Systemfehler → IT-Support informieren',
      'Falsche Daten → Korrektur anfordern',
      'Lieferant antwortet nicht → Alternative suchen',
    ],
    required: false,
    type: 'long_text',
    validation: {
      maxLen: 500,
    },
    mapsTo: {
      target: 'draft',
      path: 'exceptions[2].handling',
    },
  },

  {
    id: 'data_it_systems',
    phase: 'data_it',
    title: 'IT-Systeme',
    prompt: 'Welche IT-Systeme werden in diesem Prozess genutzt?',
    help: 'Listen Sie alle relevanten Systeme auf, z.B. ERP, CRM, E-Mail, Dokumentenmanagementsysteme.',
    examples: ['SAP ERP', 'Salesforce CRM', 'SharePoint', 'E-Mail (Outlook)', 'Excel'],
    required: false,
    type: 'list',
    mapsTo: {
      target: 'sidecar',
      path: 'systems',
    },
  },

  {
    id: 'data_it_objects',
    phase: 'data_it',
    title: 'Datenobjekte und Dokumente',
    prompt: 'Welche Dokumente, Formulare oder Daten werden in diesem Prozess verarbeitet?',
    help: 'Listen Sie die wichtigsten Informationsobjekte auf, z.B. Aufträge, Rechnungen, Verträge, Kundendaten.',
    examples: ['Auftrag', 'Rechnung', 'Lieferschein', 'Kundendaten', 'Vertrag'],
    required: false,
    type: 'list',
    mapsTo: {
      target: 'sidecar',
      path: 'dataObjects',
    },
  },

  {
    id: 'kpis_list',
    phase: 'kpis',
    title: 'Kennzahlen (KPIs)',
    prompt:
      'Mit welchen 1-3 Kennzahlen würden Sie die Performance dieses Prozesses messen?',
    help: 'Typische Kennzahlen sind z.B. Durchlaufzeit, Fehlerquote, Kundenzufriedenheit, Kosten pro Durchlauf.',
    examples: [
      'Durchlaufzeit: Zeit von Anfrage bis Angebot',
      'Fehlerquote: Anteil fehlerhafter Aufträge',
      'Kundenzufriedenheit: NPS-Score',
    ],
    required: false,
    type: 'list',
    validation: {
      maxLen: 5,
    },
    mapsTo: {
      target: 'sidecar',
      path: 'kpis',
    },
  },

  {
    id: 'automation_standardization',
    phase: 'automation',
    title: 'Standardisierung',
    prompt: 'Wie standardisiert läuft dieser Prozess ab?',
    help: 'Hoch: Immer gleich, wenig Varianz. Mittel: Meist ähnlich, einige Varianten. Niedrig: Jeder Fall ist anders.',
    required: false,
    type: 'single_select',
    options: [
      { value: 'high', label: 'Hoch - Immer gleich' },
      { value: 'medium', label: 'Mittel - Meist ähnlich' },
      { value: 'low', label: 'Niedrig - Sehr variabel' },
    ],
    mapsTo: {
      target: 'sidecar',
      path: 'aiReadinessSignals.standardization',
    },
  },

  {
    id: 'automation_data_availability',
    phase: 'automation',
    title: 'Datenverfügbarkeit',
    prompt: 'Sind die benötigten Daten digital und strukturiert verfügbar?',
    help: 'Hoch: Alle Daten digital in Systemen. Mittel: Teils digital, teils Papier. Niedrig: Meist Papier oder unstrukturiert.',
    required: false,
    type: 'single_select',
    options: [
      { value: 'high', label: 'Hoch - Vollständig digital' },
      { value: 'medium', label: 'Mittel - Teilweise digital' },
      { value: 'low', label: 'Niedrig - Meist analog' },
    ],
    mapsTo: {
      target: 'sidecar',
      path: 'aiReadinessSignals.dataAvailability',
    },
  },

  {
    id: 'automation_variability',
    phase: 'automation',
    title: 'Prozessvariabilität',
    prompt: 'Wie stark variiert der Prozess von Fall zu Fall?',
    help: 'Niedrig: Immer gleich. Mittel: Leichte Variationen. Hoch: Jeder Fall anders.',
    required: false,
    type: 'single_select',
    options: [
      { value: 'low', label: 'Niedrig - Sehr einheitlich' },
      { value: 'medium', label: 'Mittel - Einige Varianten' },
      { value: 'high', label: 'Hoch - Sehr individuell' },
    ],
    mapsTo: {
      target: 'sidecar',
      path: 'aiReadinessSignals.variability',
    },
  },

  {
    id: 'automation_compliance_risk',
    phase: 'automation',
    title: 'Compliance-Risiko',
    prompt: 'Wie hoch ist das Risiko bei Fehlern (rechtlich, finanziell, sicherheitsrelevant)?',
    help: 'Hoch: Kritisch (z.B. Finanztransaktionen, Datenschutz). Mittel: Wichtig. Niedrig: Unkritisch.',
    required: false,
    type: 'single_select',
    options: [
      { value: 'low', label: 'Niedrig - Unkritisch' },
      { value: 'medium', label: 'Mittel - Wichtig' },
      { value: 'high', label: 'Hoch - Kritisch' },
    ],
    mapsTo: {
      target: 'sidecar',
      path: 'aiReadinessSignals.complianceRisk',
    },
  },

  {
    id: 'automation_notes',
    phase: 'automation',
    title: 'Automatisierungshinweise',
    prompt:
      'Welche Schritte könnten automatisiert werden? Wo sehen Sie Potenzial für KI oder Robotic Process Automation?',
    help: 'Optional: Notieren Sie Ihre Ideen, welche Teile des Prozesses automatisiert werden könnten.',
    examples: [
      'Bonitätsprüfung über API automatisieren',
      'Rechnungserkennung mit OCR',
      'Automatische E-Mail-Versendung',
    ],
    required: false,
    type: 'list',
    mapsTo: {
      target: 'sidecar',
      path: 'automationNotes',
    },
  },
];

export function getQuestionsByPhase(phase: string): WizardQuestion[] {
  return WIZARD_QUESTIONS.filter((q) => q.phase === phase);
}

export function getQuestionById(id: string): WizardQuestion | undefined {
  return WIZARD_QUESTIONS.find((q) => q.id === id);
}
