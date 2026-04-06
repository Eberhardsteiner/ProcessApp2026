import type {
  DerivationSummary,
  ProcessMiningAnalysisMode,
  ProcessMiningDomainKey,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
} from '../../domain/process';
import { deriveProcessArtifactsFromText, LOCAL_MINING_ENGINE_VERSION } from './documentDerivation';
import { inferStepFamily, labelsLikelySameProcessStep } from './semanticStepFamilies';
import { detectProcessMiningAnalysisMode, normalizeLabel, uniqueStrings } from './pmShared';

export type QualityFixtureLevel = 'high' | 'good' | 'medium' | 'weak' | 'very-weak';
export type QualityFixtureStatus = 'pass' | 'attention' | 'fail';

export interface QualityFixtureSource {
  name: string;
  text: string;
  sourceType: 'pdf' | 'docx' | 'narrative' | 'csv-row' | 'xlsx-row';
}

export interface QualityFixtureExpectation {
  expectedSteps: string[];
  minStepHits: number;
  expectedSignals?: string[];
  minSignalHits?: number;
  expectedRoles?: string[];
  minRoleHits?: number;
  expectedSystems?: string[];
  minSystemHits?: number;
  expectedMode?: ProcessMiningAnalysisMode;
  minEvidencePct?: number;
  allowedConfidence?: DerivationSummary['confidence'][];
  minWarnings?: number;
  maxWarnings?: number;
}

export interface QualityFixtureDefinition {
  id: string;
  fileName: string;
  title: string;
  domain: ProcessMiningDomainKey;
  format: 'docx' | 'pdf' | 'xlsx' | 'csv';
  qualityLevel: QualityFixtureLevel;
  summary: string;
  intendedChecks: string[];
  sources: QualityFixtureSource[];
  expectation: QualityFixtureExpectation;
}

export interface QualityDocumentResult {
  id: string;
  fileName: string;
  title: string;
  domain: ProcessMiningDomainKey;
  format: QualityFixtureDefinition['format'];
  qualityLevel: QualityFixtureLevel;
  status: QualityFixtureStatus;
  score: number;
  headline: string;
  summary: string;
  intendedChecks: string[];
  expected: QualityFixtureExpectation;
  observed: {
    analysisMode: ProcessMiningAnalysisMode;
    confidence: DerivationSummary['confidence'];
    warnings: string[];
    sources: number;
    stepCount: number;
    signalCount: number;
    roleCount: number;
    systemCount: number;
    evidencePct: number;
    stepLabels: string[];
    roles: string[];
    systems: string[];
    signals: string[];
  };
  strengths: string[];
  issues: string[];
  recommendation: string;
  dimensionScores: Array<{ key: string; label: string; score: number }>;
}

export interface QualityDocumentSuiteResult {
  engineVersion: string;
  computedAt: string;
  overallScore: number;
  status: QualityFixtureStatus;
  passedCount: number;
  attentionCount: number;
  failedCount: number;
  headline: string;
  summary: string;
  weakestDocuments: Array<Pick<QualityDocumentResult, 'id' | 'title' | 'score' | 'status'>>;
  results: QualityDocumentResult[];
}

const DOC_01_TEXT = [
  '01 - Hochqualitatives Testdokument',
  'Verfahrensanweisung zur Bearbeitung von Kundenreklamationen im B2B-Maschinenbau',
  'Zweck',
  'Stresstest fuer die lokale Erkennung eines sauber beschriebenen Soll-Prozesses.',
  'Prozess',
  'Bearbeitung von Kundenreklamationen von Eingang bis Fallabschluss.',
  'Qualitaet',
  'hoch - klar strukturiert, konsistente Begriffe, explizite Rollen und Systeme.',
  'Erwartung',
  'Die App sollte den Kernprozess, Rollen, Systeme, Entscheidungen und Freigabepunkte sicher erkennen.',
  'Kontext. Das Dokument bildet die verbindliche Soll-Vorgehensweise fuer Reklamationen ab. Alle Meldungen werden im CRM/Ticketsystem erfasst und bis zum Abschluss in ERP, DMS und E-Mail nachvollziehbar dokumentiert.',
  'Prozessgrenzen',
  'Startpunkt ist der Eingang einer Reklamation per E-Mail, Telefon oder Portal. Endpunkt ist die dokumentierte Entscheidung mit Rueckmeldung an den Kunden und Abschluss des Falls.',
  'Rollen und Systeme',
  'Rolle | Aufgabe im Prozess | Primaere Systeme',
  'Customer Service | Erstaufnahme, Vollstaendigkeitspruefung, Kommunikation mit Kunde | CRM, E-Mail',
  'Qualitaetssicherung | technische Bewertung, Ursachenanalyse, Abstellmassnahmen | Ticket, DMS',
  'Produktion | Befundung, Sofortmassnahmen, Rueckmeldung zu Serien- oder Chargenthemen | ERP, MES',
  'Vertrieb | Kundenkontext, Vertrags- und Eskalationssicht | CRM, E-Mail',
  'Logistik | Ersatzteil- oder Rueckholung organisieren | ERP, Versandtool',
  'Finanzwesen | Gutschrift oder Belastung buchen | ERP, FiBu',
  'Ablauf',
  '1 Reklamationseingang erfassen',
  '2 Mindestdaten pruefen und fehlende Informationen anfordern',
  '3 Falltyp und Prioritaet festlegen',
  '4 Fall verantwortlicher Stelle zuweisen',
  '5 Technische Bewertung durchfuehren',
  '6 Kommerzielle und logistische Auswirkungen pruefen',
  '7 Sofortmassnahme und Kundenkommunikation abstimmen',
  '8 Ursache und Korrekturmassnahme festlegen',
  '9 Kulanz, Gutschrift, Ersatz oder Ablehnung entscheiden',
  '10 Freigabe einholen und Abschluss rueckmelden',
  'Entscheidungslogik',
  'Wenn Seriennummer oder Auftrag fehlen, Rueckfrage an Kunde vor fachlicher Bewertung.',
  'Wenn Produktionsstillstand beim Kunden droht, Prioritaet kritisch und sofortige Eskalation.',
  'Wenn Kulanzbetrag > 5.000 EUR, Freigabe durch Bereichsleitung erforderlich.',
  'Soll-Kennzahlen',
  'Erstreaktion innerhalb von 4 Stunden bei Prioritaet kritisch.',
].join('\n');

const DOC_02_TEXT = [
  '02 - Gutes Testdokument',
  'Narrative Fallserie aus Sicht des Customer Service',
  'Zweck',
  'Pruefung, ob die App aus gut lesbaren Fallbeschreibungen Varianten und Reibungen ableiten kann.',
  'Qualitaet',
  'gut - mehrere Faelle, klare Zeitfolge, aber weniger standardisiert als ein Soll-Dokument.',
  'Rahmen. Die folgenden drei Faelle stammen aus dem Wochenbericht von Miriam F., Customer Service.',
  'Fall A - Hydraulikpumpe, Produktionsstillstand beim Kunden',
  '07:42 Uhr: E-Mail vom Kunden mit Betreff Anlage steht. Miriam oeffnet CRM, legt Fall R-2025-114 an und uebertraegt Kunde, Auftrag und Maschinentyp.',
  '07:55 Uhr: Es fehlen Seriennummer und Fotos. Miriam fordert die Daten per E-Mail nach und markiert den Fall zunaechst als wartet auf Daten.',
  '08:21 Uhr: Der Kunde schickt Bilder und die Seriennummer. Miriam stuft den Fall auf kritisch hoch und erstellt im Ticketsystem eine Eskalation an QS.',
  '09:10 Uhr: QS bewertet das Fehlerbild als moeglichen Dichtungsschaden; gleichzeitig wird Produktion wegen einer moeglichen Chargenabweichung gefragt.',
  '10:05 Uhr: Vertrieb meldet, dass der Kunde strategisch wichtig ist. Miriam und Vertrieb stimmen einen Zwischenbescheid und die Sofortlieferung eines Ersatzteils ab.',
  '13:40 Uhr: Logistik bestaetigt den Versand. Miriam schickt dem Kunden Tracking und Zwischenbescheid.',
  'Naechster Tag, 11:15 Uhr: QS dokumentiert Ursache und empfiehlt Austausch plus interne Korrekturmassnahme. Vertrieb gibt eine Teilkulanz frei.',
  '11:50 Uhr: Miriam sendet Abschlussantwort, verknuepft Ticket, CRM und ERP-Vorgang und schliesst den Fall.',
  'Fall B - Sensorikfehler ohne Produktionsstillstand',
  '08:05 Uhr: Telefonische Meldung, der Sensor liefert unplausible Werte, die Maschine laeuft aber weiter. Miriam erfasst den Fall und notiert das Fehlerbild im CRM.',
  '08:30 Uhr: Die Pflichtdaten sind fast vollstaendig; nur ein Foto fehlt. Miriam fordert das Bild an, laesst die Prioritaet aber auf normal.',
  '09:00 Uhr: QS prueft einen aehnlichen Altfall im DMS. Dort findet sich eine fruehere Korrektur fuer denselben Sensortyp.',
  '09:25 Uhr: Miriam informiert den Kunden ueber einen Testschritt und dokumentiert den Hinweis im Ticket.',
  '14:20 Uhr: Der Kunde bestaetigt, dass der Testschritt erfolgreich war. Eine Materialrueckholung ist nicht mehr noetig.',
  '15:10 Uhr: Miriam schliesst den Fall ohne Kulanz und ohne Logistikprozess, dokumentiert aber den Verweis auf den Altfall.',
  'Fall C - Reklamation mit Rueckholung und Gutschrift',
  '09:12 Uhr: E-Mail mit mehreren Fotos und Hinweis auf Beschaedigung bei Lieferung. Miriam legt den Fall an und stuft ihn sofort als logistischen Reklamationsfall ein.',
  '09:35 Uhr: Im ERP sieht sie, dass die Sendung zwei Tage zuvor zugestellt wurde. Sie bezieht Logistik und Vertrieb ein.',
  '10:10 Uhr: Logistik organisiert die Rueckholung, Vertrieb prueft parallel die Kundenbeziehung und den moeglichen Gutschriftbedarf.',
  '11:45 Uhr: Der Kunde sendet weitere Fotos. QS bestaetigt, dass kein technischer Fehler vorliegt, sondern ein Transportschaden.',
  '13:05 Uhr: Finanzwesen und Vertrieb stimmen eine Gutschrift ab. Miriam informiert den Kunden ueber Rueckholung und die weitere Abwicklung.',
  'Zwei Tage spaeter: Rueckholung bestaetigt, Gutschrift gebucht, Abschlussmeldung an den Kunden verschickt.',
  'Wiederkehrende Beobachtungen',
  'Fehlende Mindestdaten fuehren oft zu Rueckfragen vor der fachlichen Bewertung.',
  'QS arbeitet regelmaessig mit Ticket, DMS und E-Mail parallel; Wissen ist teilweise verteilt.',
  'Bei kritischen Faellen ist die Zwischenkommunikation mit dem Kunden ein eigenstaendiger Schritt.',
  'Nicht jeder Fall benoetigt Logistik, Kulanz oder Finanzwesen; dadurch entstehen sinnvolle Varianten.',
].join('\n');

const DOC_03_TEXT = [
  '03 - Mittlere Qualitaet: Mischdokument aus Service-Review, Notizen und E-Mail-Auszuegen',
  'Zweck: Pruefen, ob die App Prozesskern, Reibung und Governance-Hinweise sauber voneinander trennt. Qualitaet: mittel - viele relevante Signale, aber uneinheitliche Form.',
  'Auszug aus dem Review KW 18',
  'Im Teammeeting wurde festgehalten, dass die fachliche Bewertung in mehreren Faellen erst startet, nachdem fehlende Seriennummern, Fotos oder Auftragsdaten nachgeliefert wurden. Parallel dazu entstehen Suchwege in CRM, E-Mails, DMS und persoenlichen Erinnerungen. Kritische Faelle werden meist zuerst kommunikativ stabilisiert, bevor die formale Ursache sauber dokumentiert ist.',
  'Leiterin Customer Service: Wenn der Kunde mit Stillstand droht, sprechen wir zuerst mit Vertrieb und QS. Erst danach wird der Fall ganz sauber nachgezogen.',
  'E-Mail-Auszug 1',
  '07:31 Uhr - Kunde: Anlage steht seit Schichtbeginn. Bitte sofort Rueckmeldung. Seriennummer reiche ich nach.',
  '08:17 Uhr - Customer Service: Fall im CRM angelegt, Prioritaet vorlaeufig hoch, Daten fehlen noch.',
  '08:26 Uhr - Vertrieb: strategisch wichtiger Kunde, bitte Zwischenbescheid heute Vormittag.',
  '09:02 Uhr - QS: technischer Verdacht vorhanden, Chargenpruefung mit Produktion noetig.',
  'Diskussionspunkte aus dem Review',
  'Pflichtdaten liegen am Eingang haeufig nicht vollstaendig vor.',
  'Der Zwischenbescheid an den Kunden ist oft ein eigener Arbeitsschritt, taucht aber in Altfaellen nicht immer im System auf.',
  'Wissen ist verteilt: CRM fuer Kundenkontext, Ticket fuer Bearbeitung, DMS fuer Ursachen und E-Mail fuer schnelle Abstimmungen.',
  'Bei Kulanz oder Gutschrift springt der Prozess in Finanzwesen oder Vertrieb, die Fallfuehrung bleibt aber im Customer Service.',
  'Tabelle: Signale und offene Fragen',
  'Worte wie dringend, Stillstand oder Schichtplanung | Eskalationssignal | Soll automatisch kritisch priorisiert werden?',
  'Aehnliche Faelle liegen in CRM, E-Mails und persoenlicher Erinnerung | verteiltes Wissen | Welche Quelle ist fuehrend?',
  'Zwischenbescheid wird oft vor Ursachenanalyse versandt | kommunikativer Zwischenschritt | Soll der Schritt verpflichtend dokumentiert werden?',
  'Kulanz ab 5.000 EUR braucht Leitung | Governance/Freigabe | Ist der Freigabepfad in jedem Fall referenziert?',
  'Fazit fuer den Test: Das Dokument enthaelt verwertbare Prozessinformationen, mischt diese aber mit Review-Kommentaren, Governance-Hinweisen und offenen Fragen.',
].join('\n');

const DOC_04_CASE_A = [
  'Eventlog-Fall R-114',
  'Mail Eingang 2025-05-06 07:31 Customer Service E-Mail Kunde meldet Produktionsstillstand',
  'Fall erfassen 2025-05-06 07:42 Customer Service CRM Fall angelegt',
  'Daten fehlen 2025-05-06 07:55 Customer Service CRM Seriennummer fehlt',
  'Kunde erinnert 2025-05-06 08:11 Customer Service E-Mail Telefonnotiz',
  'Seriennummer nachgereicht 2025-05-06 08:21 Kunde E-Mail Foto + SN',
  'kritisch setzen 2025-05-06 08:23 Customer Service Ticket Eskaliert',
  'QS anschauen Zeit fehlt QS Ticket',
  'Vertrieb informieren 2025-05-06 08:58 Customer Service E-Mail strategischer Kunde',
  'Technische Bewertung 2025-05-06 09:10 QS DMS Verdacht Dichtung',
  'Ersatzteil Versand 2025-05-06 13:40 Logistik ERP Tracking erstellt',
  'Kulanz Teil 2025-05-07 11:15 Vertrieb ERP teilweise Kulanz',
  'Fall zu 2025-05-07 11:50 Customer Service CRM Abschlussmail',
].join('\n');

const DOC_04_CASE_B = [
  'Eventlog-Fall R-208',
  'Telefon Eingang 2025-05-08 08:05 Customer Service Telefon Sensorproblem, kein Stillstand',
  'Rekl. anleg. 2025-05-08 08:07 Customer Service CRM Abk. in Aktivitaet',
  'Pflichtdaten pruefen 2025-05-08 08:30 Customer Service CRM Foto fehlt noch',
  'Altfall suchen 2025-05-08 09:00 QS DMS aehnlicher Altfall',
  'Testschritt senden 2025-05-08 09:25 Customer Service E-Mail Hinweis an Kunde',
  'Kunde bestaetigt OK 2025-05-08 14:20 Customer Service CRM kein Austausch',
  'Schliessen 2025-05-08 15:10 Customer Service CRM ohne Kulanz',
].join('\n');

const DOC_04_CASE_C = [
  'Eventlog-Fall R-311',
  'mail rein 2025-05-09 09:12 Customer Service E-Mail Transportschaden',
  'Fall erfassen 2025-05-09 09:15 Customer Service CRM',
  'log. Rekla markieren 2025-05-09 09:18 Customer Service CRM Typ gesetzt',
  'ERP check 2025-05-09 09:35 Customer Service ERP Zustellung 2 Tage her',
  'Rueckholung org. 2025-05-09 10:10 Logistik ERP',
  'Vertrieb dazu Zeit fehlt Vertrieb E-Mail',
  'QS check Bild 2025-05-09 11:45 QS DMS kein technischer Fehler',
  'Gutschrift abstimmen 2025-05-09 13:05 Finanzwesen ERP',
  'Kunde informieren 2025-05-09 13:09 Customer Service E-Mail',
  'Fall zu 2025-05-11 10:20 Customer Service CRM Rueckholung bestaetigt',
  'Leere Fall-ID 2025-05-11 10:30 Customer Service CRM',
  'Kunde informieren Duplikat 2025-05-09 13:09 Customer Service E-Mail',
  'Hinweise: schwach - Eventtabelle mit Luecken, Dubletten, uneinheitlichen Aktivitaetsnamen und fehlenden Zeitstempeln.',
].join('\n');

const DOC_05_TEXT = [
  'row_id,container,created_at,author,source,text',
  '1,mailbox_a,2025-05-06 07:31,cs@firma.de,mail,KD sagt Anlage steht seit Schichtbeginn, SN kommt spaeter',
  '2,mailbox_a,2025-05-06 07:44,cs@firma.de,crm-note,Fall angelegt, aber Auftrag nicht sauber',
  '3,thread_19,,vertrieb@firma.de,mail,wichtiger kunde, bitte heute irgendwas schicken',
  '4,thread_19,2025-05-06 08:26,qs@firma.de,mail,evtl charge? bitte prod fragen',
  '5,ticket_tmp,2025-05-06 08:59,cs@firma.de,ticket,zwischeninfo an kunde raus?',
  '6,notes_misc,2025-05-06 09:12,prod@firma.de,note,dichtung oder montagefehler, nicht sicher',
  '7,notes_misc,,fin@firma.de,note,kulanz? wenn >5k chef',
  '8,mailbox_b,2025-05-08 08:05,cs@firma.de,phone-note,sensor spinnt, kunde kann weiterfahren',
  '9,mailbox_b,2025-05-08 09:00,qs@firma.de,dms-hit,aehnlicher altfall 2024, testschritt reicht evtl',
  '10,mailbox_b,,kunde,mail,bild spaeter',
  '11,mailbox_c,2025-05-09 09:12,cs@firma.de,mail,verpackung kaputt / schaden bei anlieferung',
  '12,mailbox_c,2025-05-09 09:36,logistik@firma.de,erp-note,rueckholung moeglich',
  '13,mailbox_c,2025-05-09 13:06,fin@firma.de,mail,gutschrift ok',
  '14,misc,,unbekannt,copy,bitte alles in crm und ticket nachziehen',
  '15,misc,2025-05-09 13:20,cs@firma.de,mail,kunde info raus, aber qs-bericht kommt spaeter',
  '16,misc,2025-05-10 08:02,cs@firma.de,sticky,wer macht abschluss?',
].join('\n');

function buildQualityFixtures(): QualityFixtureDefinition[] {
  return [
    {
      id: 'fixture-docx-soll-high',
      fileName: '01_Hochqualitatives_Sollprozessdokument_Reklamationsbearbeitung.docx',
      title: 'Hochqualitatives Sollprozessdokument Reklamationsbearbeitung',
      domain: 'complaints',
      format: 'docx',
      qualityLevel: 'high',
      summary: 'Sehr klares Soll-Dokument mit Rollen, Systemen, Entscheidungslogik und Freigabepunkten.',
      intendedChecks: ['Kernprozess', 'Rollen', 'Systeme', 'Entscheidungen', 'Freigaben'],
      sources: [{ name: 'Sollprozess Reklamation', text: DOC_01_TEXT, sourceType: 'docx' }],
      expectation: {
        expectedSteps: [
          'family:complaint_intake',
          'family:prioritize_and_request',
          'family:technical_assessment',
          'family:solution_coordination',
          'family:approval',
          'family:execution',
          'family:documentation_followup',
        ],
        minStepHits: 5,
        expectedSignals: ['Fehlende Pflichtangaben', 'Freigaben verlangsamen die Umsetzung'],
        minSignalHits: 1,
        expectedRoles: ['Service', 'Qualitätsmanagement', 'Logistik', 'Vertrieb', 'Finanzbuchhaltung'],
        minRoleHits: 3,
        expectedSystems: ['CRM', 'ERP', 'DMS', 'E-Mail'],
        minSystemHits: 3,
        minEvidencePct: 65,
        expectedMode: 'process-draft',
        allowedConfidence: ['high', 'medium'],
        maxWarnings: 4,
      },
    },
    {
      id: 'fixture-docx-narrative-good',
      fileName: '02_Gute_Narrative_Fallserie_Reklamationsbearbeitung.docx',
      title: 'Gute narrative Fallserie Reklamationsbearbeitung',
      domain: 'complaints',
      format: 'docx',
      qualityLevel: 'good',
      summary: 'Drei nachvollziehbare Fallgeschichten mit Varianten, Rollenwechseln und Reibungspunkten.',
      intendedChecks: ['Varianten', 'Friktionen', 'wiederkehrende Muster', 'Rollen', 'Zwischenschritte'],
      sources: [{ name: 'Narrative Fallserie Reklamation', text: DOC_02_TEXT, sourceType: 'docx' }],
      expectation: {
        expectedSteps: [
          'family:complaint_intake',
          'family:prioritize_and_request',
          'family:technical_assessment',
          'family:customer_update',
          'family:solution_coordination',
          'family:approval',
          'family:documentation_followup',
        ],
        minStepHits: 5,
        expectedSignals: [
          'Fehlende Pflichtangaben',
          'Erfahrungswissen liegt verstreut und schwer nutzbar vor',
          'Kommunikation muss Unsicherheit professionell abfedern',
        ],
        minSignalHits: 2,
        expectedRoles: ['Service', 'Qualitätsmanagement', 'Logistik', 'Vertrieb', 'Finanzbuchhaltung'],
        minRoleHits: 3,
        expectedSystems: ['CRM', 'ERP', 'DMS', 'E-Mail'],
        minSystemHits: 3,
        minEvidencePct: 60,
        expectedMode: 'process-draft',
        allowedConfidence: ['high', 'medium'],
        maxWarnings: 5,
      },
    },
    {
      id: 'fixture-pdf-mixed-medium',
      fileName: '03_Mittlere_Qualitaet_Mischdokument_Service_Review.pdf',
      title: 'Mittlere Qualität Mischdokument Service-Review',
      domain: 'mixed',
      format: 'pdf',
      qualityLevel: 'medium',
      summary: 'Review-Notizen, E-Mail-Auszug und Signaltabelle mit Prozesskern und Nebengeräusch.',
      intendedChecks: ['Trennung von Prozesskern und Reibung', 'Governance-Hinweise', 'verteiltes Wissen'],
      sources: [{ name: 'Mischdokument Service Review', text: DOC_03_TEXT, sourceType: 'pdf' }],
      expectation: {
        expectedSteps: [
          'family:complaint_intake',
          'family:prioritize_and_request',
          'family:technical_assessment',
          'family:customer_update',
          'family:approval',
        ],
        minStepHits: 3,
        expectedSignals: [
          'Fehlende Pflichtangaben',
          'Priorisierung erfolgt unter Unsicherheit',
          'Erfahrungswissen liegt verstreut und schwer nutzbar vor',
          'Freigaben verlangsamen die Umsetzung',
        ],
        minSignalHits: 2,
        expectedRoles: ['Service', 'Qualitätsmanagement', 'Vertrieb'],
        minRoleHits: 2,
        expectedSystems: ['CRM', 'DMS', 'E-Mail'],
        minSystemHits: 2,
        minEvidencePct: 50,
        expectedMode: 'process-draft',
        allowedConfidence: ['medium', 'high'],
        minWarnings: 0,
      },
    },
    {
      id: 'fixture-xlsx-eventlog-weak',
      fileName: '04_Schwache_Qualitaet_Eventlog_mit_Luecken_Reklamationen.xlsx',
      title: 'Schwache Qualität Eventlog mit Lücken Reklamationen',
      domain: 'complaints',
      format: 'xlsx',
      qualityLevel: 'weak',
      summary: 'Eventtabelle mit mehreren Fällen, Dubletten, leeren IDs, fehlenden Zeitstempeln und uneinheitlichen Aktivitätsnamen.',
      intendedChecks: ['Datenreife', 'Dubletten', 'uneinheitliche Schritte', 'vorsichtige Bewertung'],
      sources: [
        { name: 'Eventlog R-114', text: DOC_04_CASE_A, sourceType: 'xlsx-row' },
        { name: 'Eventlog R-208', text: DOC_04_CASE_B, sourceType: 'xlsx-row' },
        { name: 'Eventlog R-311', text: DOC_04_CASE_C, sourceType: 'xlsx-row' },
      ],
      expectation: {
        expectedSteps: ['family:complaint_intake', 'family:prioritize_and_request', 'family:technical_assessment', 'family:documentation_followup'],
        minStepHits: 3,
        expectedSignals: ['Fehlende Pflichtangaben', 'Freigaben verlangsamen die Umsetzung'],
        minSignalHits: 1,
        expectedRoles: ['Service', 'Qualitätsmanagement', 'Logistik', 'Vertrieb'],
        minRoleHits: 2,
        expectedSystems: ['CRM', 'ERP', 'DMS', 'E-Mail'],
        minSystemHits: 2,
        minEvidencePct: 45,
        expectedMode: 'exploratory-mining',
        allowedConfidence: ['low', 'medium'],
        minWarnings: 1,
      },
    },
    {
      id: 'fixture-csv-fragments-very-weak',
      fileName: '05_Sehr_Schwache_Qualitaet_Rohnotizen_und_Exportfragmente.csv',
      title: 'Sehr schwache Qualität Rohnotizen und Exportfragmente',
      domain: 'mixed',
      format: 'csv',
      qualityLevel: 'very-weak',
      summary: 'Fragmentierter Rohexport mit fehlenden Zeiten, Kürzeln, E-Mail-Bruchstücken und unklaren Zuständigkeiten.',
      intendedChecks: ['vorsichtige Auswertung', 'niedrigere Sicherheit', 'rohe Signale statt Scheingenauigkeit'],
      sources: [{ name: 'Rohnotizen und Exportfragmente', text: DOC_05_TEXT, sourceType: 'csv-row' }],
      expectation: {
        expectedSteps: ['family:complaint_intake', 'family:prioritize_and_request', 'family:customer_update'],
        minStepHits: 1,
        expectedSignals: [
          'Fehlende Pflichtangaben',
          'Priorisierung erfolgt unter Unsicherheit',
          'Mehrfachdokumentation und Medienbrüche erhöhen den Aufwand',
        ],
        minSignalHits: 2,
        expectedRoles: ['Service', 'Vertrieb', 'Qualitätsmanagement'],
        minRoleHits: 1,
        expectedSystems: ['CRM', 'E-Mail'],
        minSystemHits: 1,
        minEvidencePct: 25,
        expectedMode: 'process-draft',
        allowedConfidence: ['low', 'medium'],
        minWarnings: 1,
      },
    },
  ];
}

export function getQualityFixtureDefinitions(): QualityFixtureDefinition[] {
  return buildQualityFixtures();
}

function ratioToScore(hits: number, target: number): number {
  if (target <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((hits / target) * 100)));
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

function matchExpectedValues(params: { expected: string[]; actual: string[]; matcher: (expected: string, actual: string) => boolean; }) {
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

function aggregateObservations(results: Array<{ cases: ProcessMiningObservationCase[]; observations: ProcessMiningObservation[]; summary: DerivationSummary; }>) {
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
  const confidence: DerivationSummary['confidence'] = results.some(result => result.summary.confidence === 'low')
    ? 'low'
    : results.some(result => result.summary.confidence === 'medium')
      ? 'medium'
      : 'high';
  const analysisMode = detectProcessMiningAnalysisMode({
    cases: results.flatMap(result => result.cases),
    observations: results.flatMap(result => result.observations),
  });

  return {
    stepLabels,
    roles,
    systems,
    signals,
    warnings,
    evidencePct: Math.round((evidenceCount / Math.max(stepObservations.length, 1)) * 100),
    analysisMode,
    confidence,
    cases: results.flatMap(result => result.cases),
    observations: results.flatMap(result => result.observations),
  };
}

function statusFromScore(score: number): QualityFixtureStatus {
  if (score >= 85) return 'pass';
  if (score >= 65) return 'attention';
  return 'fail';
}

function buildRecommendation(definition: QualityFixtureDefinition, score: number, issues: string[]): string {
  if (score >= 90) {
    return `${definition.fileName}: wirkt für diesen Gütegrad stabil. Weitere Nachschärfung lohnt vor allem bei Detailtreue und Evidenz.`;
  }
  if (definition.qualityLevel === 'weak' || definition.qualityLevel === 'very-weak') {
    return `${definition.fileName}: nicht mehr Prozesssicherheit erzwingen, sondern Datenreife, Dubletten und Warnungen weiter stärken.`;
  }
  if (issues.length > 0) {
    return `${definition.fileName}: als Nächstes ${issues[0].replace(/\.$/, '').toLowerCase()} verbessern.`;
  }
  return `${definition.fileName}: Analysebasis weiter festigen und Vergleich gegen nächste Version laufen lassen.`;
}

function buildHeadline(level: QualityFixtureLevel, status: QualityFixtureStatus): string {
  if (status === 'pass') {
    return level === 'high' || level === 'good'
      ? 'Die App arbeitet auf diesem Dokument bereits belastbar.'
      : 'Die App geht mit diesem schwierigen Material bereits vernünftig um.';
  }
  if (status === 'attention') {
    return level === 'weak' || level === 'very-weak'
      ? 'Die App bleibt bei diesem schwachen Material brauchbar, aber noch nicht konsistent genug.'
      : 'Die App erkennt bereits viel, lässt bei diesem Dokument aber noch fachliche Lücken.';
  }
  return 'Die App braucht für dieses Dokument noch deutliche Nachschärfung.';
}

export function runQualityDocumentSuite(): QualityDocumentSuiteResult {
  const fixtures = getQualityFixtureDefinitions();

  const results: QualityDocumentResult[] = fixtures.map(definition => {
    const derivations = definition.sources.map(source => {
      const result = deriveProcessArtifactsFromText({
        text: source.text,
        fileName: source.name,
        sourceType: source.sourceType,
      });
      return {
        cases: result.cases,
        observations: result.observations,
        summary: result.summary,
      };
    });

    const aggregate = aggregateObservations(derivations);
    const stepMatch = matchExpectedValues({ expected: definition.expectation.expectedSteps, actual: aggregate.stepLabels, matcher: stepMatcher });
    const signalMatch = matchExpectedValues({ expected: definition.expectation.expectedSignals ?? [], actual: aggregate.signals, matcher: fuzzyMatcher });
    const roleMatch = matchExpectedValues({ expected: definition.expectation.expectedRoles ?? [], actual: aggregate.roles, matcher: fuzzyMatcher });
    const systemMatch = matchExpectedValues({ expected: definition.expectation.expectedSystems ?? [], actual: aggregate.systems, matcher: fuzzyMatcher });

    const dimensionScores = [
      { key: 'steps', label: 'Schritte', score: ratioToScore(stepMatch.hits.length, definition.expectation.minStepHits) },
      { key: 'signals', label: 'Reibungssignale', score: ratioToScore(signalMatch.hits.length, definition.expectation.minSignalHits ?? 0) },
      { key: 'roles', label: 'Rollen', score: ratioToScore(roleMatch.hits.length, definition.expectation.minRoleHits ?? 0) },
      { key: 'systems', label: 'Systeme', score: ratioToScore(systemMatch.hits.length, definition.expectation.minSystemHits ?? 0) },
      { key: 'evidence', label: 'Belegstellen', score: definition.expectation.minEvidencePct ? ratioToScore(aggregate.evidencePct, definition.expectation.minEvidencePct) : 100 },
      { key: 'mode', label: 'Analysemodus', score: definition.expectation.expectedMode ? (aggregate.analysisMode === definition.expectation.expectedMode ? 100 : 55) : 100 },
      { key: 'confidence', label: 'Sicherheitsniveau', score: definition.expectation.allowedConfidence ? (definition.expectation.allowedConfidence.includes(aggregate.confidence) ? 100 : 45) : 100 },
      { key: 'warnings', label: 'Warnlogik', score: (() => {
        const warningCount = aggregate.warnings.length;
        const { minWarnings, maxWarnings } = definition.expectation;
        if (typeof minWarnings === 'number' && warningCount < minWarnings) {
          return ratioToScore(warningCount, minWarnings);
        }
        if (typeof maxWarnings === 'number' && warningCount > maxWarnings) {
          const overshoot = warningCount - maxWarnings;
          return Math.max(40, 100 - overshoot * 15);
        }
        return 100;
      })() },
    ];

    const weightedScore = Math.round(
      dimensionScores.find(item => item.key === 'steps')!.score * 0.32 +
      dimensionScores.find(item => item.key === 'signals')!.score * 0.16 +
      dimensionScores.find(item => item.key === 'roles')!.score * 0.1 +
      dimensionScores.find(item => item.key === 'systems')!.score * 0.08 +
      dimensionScores.find(item => item.key === 'evidence')!.score * 0.12 +
      dimensionScores.find(item => item.key === 'mode')!.score * 0.08 +
      dimensionScores.find(item => item.key === 'confidence')!.score * 0.07 +
      dimensionScores.find(item => item.key === 'warnings')!.score * 0.07,
    );
    const status = statusFromScore(weightedScore);

    const strengths: string[] = [];
    const issues: string[] = [];

    if (stepMatch.hits.length >= definition.expectation.minStepHits) strengths.push(`Kernschritte werden ausreichend erkannt (${stepMatch.hits.length}/${definition.expectation.minStepHits}).`);
    else issues.push(`Kernschritte bleiben noch lückenhaft (${stepMatch.hits.length}/${definition.expectation.minStepHits}).`);

    if ((definition.expectation.minSignalHits ?? 0) > 0) {
      if (signalMatch.hits.length >= (definition.expectation.minSignalHits ?? 0)) strengths.push(`Reibungssignale werden brauchbar erkannt (${signalMatch.hits.length}).`);
      else issues.push(`Reibungssignale werden noch zu schwach erkannt (${signalMatch.hits.length}/${definition.expectation.minSignalHits}).`);
    }

    if ((definition.expectation.minRoleHits ?? 0) > 0) {
      if (roleMatch.hits.length >= (definition.expectation.minRoleHits ?? 0)) strengths.push(`Rollenbild wirkt tragfähig (${roleMatch.hits.length} Treffer).`);
      else issues.push(`Rollen werden noch zu lückenhaft erkannt (${roleMatch.hits.length}/${definition.expectation.minRoleHits}).`);
    }

    if ((definition.expectation.minSystemHits ?? 0) > 0) {
      if (systemMatch.hits.length >= (definition.expectation.minSystemHits ?? 0)) strengths.push(`Systemlandschaft wird brauchbar erkannt (${systemMatch.hits.length} Treffer).`);
      else issues.push(`Systeme bleiben noch zu unscharf (${systemMatch.hits.length}/${definition.expectation.minSystemHits}).`);
    }

    if (definition.expectation.expectedMode) {
      if (aggregate.analysisMode === definition.expectation.expectedMode) strengths.push(`Analysemodus passt (${aggregate.analysisMode}).`);
      else issues.push(`Analysemodus passt noch nicht sauber (${aggregate.analysisMode} statt ${definition.expectation.expectedMode}).`);
    }

    if (definition.expectation.allowedConfidence) {
      if (definition.expectation.allowedConfidence.includes(aggregate.confidence)) strengths.push(`Sicherheitsniveau wirkt angemessen (${aggregate.confidence}).`);
      else issues.push(`Sicherheitsniveau wirkt unpassend (${aggregate.confidence}).`);
    }

    if (typeof definition.expectation.minWarnings === 'number' && aggregate.warnings.length < definition.expectation.minWarnings) {
      issues.push(`Warnungen bleiben unter dem erwarteten Vorsichtsniveau (${aggregate.warnings.length}/${definition.expectation.minWarnings}).`);
    }
    if (typeof definition.expectation.maxWarnings === 'number' && aggregate.warnings.length > definition.expectation.maxWarnings) {
      issues.push(`Warnungen sind höher als für dieses Material erwartet (${aggregate.warnings.length}/${definition.expectation.maxWarnings}).`);
    }

    const summary = `${definition.fileName}: ${aggregate.stepLabels.length} erkannte Schritte, ${aggregate.signals.length} Reibungssignale, ${aggregate.roles.length} Rollen, ${aggregate.systems.length} Systeme, ${aggregate.evidencePct}% Belegstellen.`;

    return {
      id: definition.id,
      fileName: definition.fileName,
      title: definition.title,
      domain: definition.domain,
      format: definition.format,
      qualityLevel: definition.qualityLevel,
      status,
      score: weightedScore,
      headline: buildHeadline(definition.qualityLevel, status),
      summary,
      intendedChecks: definition.intendedChecks,
      expected: definition.expectation,
      observed: {
        analysisMode: aggregate.analysisMode,
        confidence: aggregate.confidence,
        warnings: aggregate.warnings,
        sources: definition.sources.length,
        stepCount: aggregate.stepLabels.length,
        signalCount: aggregate.signals.length,
        roleCount: aggregate.roles.length,
        systemCount: aggregate.systems.length,
        evidencePct: aggregate.evidencePct,
        stepLabels: aggregate.stepLabels,
        roles: aggregate.roles,
        systems: aggregate.systems,
        signals: aggregate.signals,
      },
      strengths,
      issues,
      recommendation: buildRecommendation(definition, weightedScore, issues),
      dimensionScores,
    };
  });

  const passedCount = results.filter(item => item.status === 'pass').length;
  const attentionCount = results.filter(item => item.status === 'attention').length;
  const failedCount = results.filter(item => item.status === 'fail').length;
  const overallScore = Math.round(results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1));
  const status: QualityFixtureStatus = failedCount > 0 ? 'fail' : attentionCount > 0 ? 'attention' : 'pass';

  const headline =
    status === 'fail'
      ? 'Mindestens eines der fünf Referenzdokumente zeigt noch deutliche Qualitätslücken.'
      : status === 'attention'
        ? 'Die fünf Referenzdokumente sind insgesamt brauchbar, zeigen aber noch klaren Nachschärfungsbedarf.'
        : 'Die fünf Referenzdokumente werden derzeit stabil und differenziert ausgewertet.';

  const summary = `${results.length} Referenzdokumente · Gesamt ${overallScore}/100 · ${passedCount} stabil · ${attentionCount} beobachten · ${failedCount} kritisch.`;

  return {
    engineVersion: `${LOCAL_MINING_ENGINE_VERSION} · quality-documents`,
    computedAt: new Date().toISOString(),
    overallScore,
    status,
    passedCount,
    attentionCount,
    failedCount,
    headline,
    summary,
    weakestDocuments: results
      .slice()
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map(item => ({ id: item.id, title: item.title, score: item.score, status: item.status })),
    results,
  };
}
