import type { ProcessMiningDomainKey } from '../../domain/process';
import type { SampleScenarioKey } from './sampleCases';

export type DomainLibraryMaturity = 'measured' | 'preview';
export type DomainQualityFocusKey = 'steps' | 'signals' | 'roles' | 'systems' | 'evidence' | 'mode';

export interface DomainLibraryEntry {
  key: ProcessMiningDomainKey;
  title: string;
  summary: string;
  maturity: DomainLibraryMaturity;
  sampleKey: SampleScenarioKey;
  measuredCoverageCount?: number;
  qualityFocus: DomainQualityFocusKey[];
  focus: string[];
  typicalRoles: string[];
  typicalSystems: string[];
  typicalSignals: string[];
  note: string;
}

const DOMAIN_LIBRARY: DomainLibraryEntry[] = [
  {
    key: 'complaints',
    title: 'Reklamationen',
    summary: 'Reklamationseingang, Kontextsuche, Priorisierung, fachliche Bewertung, Freigabe und Maßnahmenumsetzung.',
    maturity: 'measured',
    sampleKey: 'complaints',
    measuredCoverageCount: 2,
    qualityFocus: ['steps', 'signals', 'systems', 'evidence'],
    focus: ['Eingang bewerten', 'fehlende Angaben nachfordern', 'Lösung mit Fachbereichen abstimmen'],
    typicalRoles: ['Service', 'Qualitätsmanagement', 'Technik', 'Logistik', 'Vertrieb'],
    typicalSystems: ['CRM', 'ERP', 'DMS', 'E-Mail'],
    typicalSignals: ['Fehlende Pflichtangaben', 'Eskalationsdruck', 'verteiltes Wissen', 'Mehrfachdokumentation'],
    note: 'Belastbar im Benchmark und gut für den ersten Praxistest geeignet.',
  },
  {
    key: 'service',
    title: 'Service & Störung',
    summary: 'Ticketaufnahme, SLA, Diagnose, Einsatzplanung, Behebung und Wissensaktualisierung.',
    maturity: 'measured',
    sampleKey: 'service',
    measuredCoverageCount: 2,
    qualityFocus: ['steps', 'signals', 'systems', 'evidence'],
    focus: ['Störung aufnehmen', 'SLA und Einsatz priorisieren', 'Diagnose und Dokumentation schließen'],
    typicalRoles: ['Service', 'Dispatcher', 'Technik'],
    typicalSystems: ['Ticketsystem', 'Monitoring', 'Leitstand', 'Remote-Support'],
    typicalSignals: ['SLA-Druck', 'wiederkehrende Fehler', 'Medienbrüche'],
    note: 'Geeignet, wenn Tickets, Monitoring oder Leitstand eine große Rolle spielen.',
  },
  {
    key: 'returns',
    title: 'Retouren & Garantie',
    summary: 'Retourenfall, Garantie- oder Kulanzklärung, Rücksendung, Ersatz oder Gutschrift.',
    maturity: 'measured',
    sampleKey: 'returns',
    measuredCoverageCount: 2,
    qualityFocus: ['steps', 'signals', 'roles', 'evidence'],
    focus: ['Retoure aufnehmen', 'Garantie prüfen', 'Ersatz oder Gutschrift auslösen'],
    typicalRoles: ['Service', 'Qualitätsmanagement', 'Logistik', 'Vertrieb'],
    typicalSystems: ['CRM', 'ERP', 'RMA-Referenz'],
    typicalSignals: ['Abstimmungsaufwand bei Garantie', 'Freigaben', 'Rücksendungslogik'],
    note: 'Stark, wenn Rücksendung, Garantie und Ersatz sauber zusammen betrachtet werden sollen.',
  },
  {
    key: 'mixed',
    title: 'Mischdokumente',
    summary: 'Narrative Geschichten plus Signal-Tabellen, Leitfäden und Zusatzmaterial.',
    maturity: 'measured',
    sampleKey: 'mixed',
    measuredCoverageCount: 2,
    qualityFocus: ['steps', 'signals', 'evidence'],
    focus: ['Story-Teil trennen', 'Signale vom Ablauf abgrenzen', 'brauchbaren Prozessentwurf verdichten'],
    typicalRoles: ['variiert je Dokument'],
    typicalSystems: ['variiert je Dokument'],
    typicalSignals: ['Signaltabellen', 'Leitfäden', 'Mischtext'],
    note: 'Besonders nützlich für frühe Workshops und unsaubere Eingangsunterlagen.',
  },
  {
    key: 'procurement',
    title: 'Einkauf & Freigaben',
    summary: 'Bedarf, Spezifikation, Angebote, Budgetfreigabe, Bestellung und Rechnungsbezug.',
    maturity: 'measured',
    sampleKey: 'procurement',
    measuredCoverageCount: 2,
    qualityFocus: ['steps', 'signals', 'roles', 'systems'],
    focus: ['Bedarf aufnehmen', 'Angebote abstimmen', 'Bestellung und Wareneingang klären'],
    typicalRoles: ['Einkauf', 'Fachbereich', 'Controlling', 'Buchhaltung'],
    typicalSystems: ['ERP', 'SRM/Einkaufssystem'],
    typicalSignals: ['fehlende Kostenstellen', 'Angebotsvergleich', 'mehrere Freigabeschritte'],
    note: 'Gut geeignet für Beschaffungsprozesse mit Budget- und Lieferantenabstimmung.',
  },
  {
    key: 'onboarding',
    title: 'Onboarding & Zugänge',
    summary: 'Eintritt, Stammdaten, Rollen, Zugänge, Equipment und Startbestätigung.',
    maturity: 'measured',
    sampleKey: 'onboarding',
    measuredCoverageCount: 2,
    qualityFocus: ['steps', 'signals', 'roles', 'systems'],
    focus: ['Eintritt erfassen', 'Rollen und Zugänge anstoßen', 'Startbereitschaft bestätigen'],
    typicalRoles: ['HR', 'IT', 'Führungskraft', 'Fachbereich'],
    typicalSystems: ['HR-System', 'IAM/Active Directory', 'Serviceportal'],
    typicalSignals: ['fehlende Stammdaten', 'Freigabeabhängigkeit', 'mehrere Übergaben'],
    note: 'Stark für Zugangs-, Rollen- und Startvorbereitungsprozesse.',
  },
  {
    key: 'billing',
    title: 'Rechnung & Zahlungsklärung',
    summary: 'Rechnungsdifferenzen, Bestellbezug, Gutschrift, Zahlungssperre und Freigabe in der Finanzkette.',
    maturity: 'measured',
    sampleKey: 'billing',
    measuredCoverageCount: 2,
    qualityFocus: ['steps', 'signals', 'systems', 'evidence'],
    focus: ['Klärfall aufnehmen', 'Belege und Bezug prüfen', 'Korrektur oder Freigabe auslösen'],
    typicalRoles: ['Finanzbuchhaltung', 'Debitoren/Kreditoren', 'Fachbereich', 'Vertrieb'],
    typicalSystems: ['ERP', 'Rechnungsworkflow', 'E-Mail'],
    typicalSignals: ['fehlende Bestellbezüge', 'Abweichungen', 'Freigabe für Gutschrift oder Zahlung'],
    note: 'Neu gemessenes Finanzpaket für Klärfälle zwischen Bestellung, Rechnung, Gutschrift und Freigabe.',
  },
  {
    key: 'masterdata',
    title: 'Stammdaten & Änderungen',
    summary: 'Änderungsanträge, Validierung, Dublettenprüfung, Freigabe und Systemnachlauf bei Stamm- oder Kontaktdaten.',
    maturity: 'measured',
    sampleKey: 'masterdata',
    measuredCoverageCount: 2,
    qualityFocus: ['steps', 'signals', 'roles', 'systems'],
    focus: ['Änderungsantrag aufnehmen', 'Pflichtfelder und Dubletten prüfen', 'Änderung in Systemen bestätigen'],
    typicalRoles: ['Stammdatenmanagement', 'Fachbereich', 'Compliance', 'IT'],
    typicalSystems: ['SAP/ERP', 'MDM', 'Ticket/Workflow'],
    typicalSignals: ['fehlende Nachweise', 'Dublettenrisiko', 'mehrere Freigaben'],
    note: 'Neu gemessenes Fachpaket für Änderungsanträge, Nachweise, Dubletten und Systemnachlauf.',
  },
];

export function getDomainLibraryEntries(): DomainLibraryEntry[] {
  return DOMAIN_LIBRARY;
}
