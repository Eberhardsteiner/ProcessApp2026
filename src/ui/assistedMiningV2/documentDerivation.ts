import type {
  DerivationSummary,
  MixedDocumentSegmentSummary,
  MixedDocumentSegmentType,
  ProcessDocumentType,
  ProcessMiningAnalysisMode,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
  SourceRoutingContext,
  ExtractionCandidate,
} from '../../domain/process';
import { findDocumentProcessCandidates } from '../../import/documentProcessDiscovery';
import { extractSemiStructuredProcedureFromText } from '../../import/semiStructuredProcedureExtraction';
import type { SemiStructuredProcedureStep } from '../../import/semiStructuredProcedureExtraction';
import { extractStructuredProcedureFromText } from '../../import/structuredProcedureExtraction';
import { classifyDocumentStructure } from '../../import/documentStructureClassifier';
import { routeSourceMaterial } from '../../import/sourceRouter';
import type { StructuredProcedureStep } from '../../import/structuredProcedureExtraction';
import { extractObservationsFromCase } from './narrativeParsing';
import {
  buildAnalysisModeNotice,
  createObservation,
  detectProcessMiningAnalysisMode,
  normalizeWhitespace,
  sentenceCase,
  uniqueStrings,
} from './pmShared';
import {
  canonicalizeProcessStepLabel,
  inferStepFamily,
  stepSemanticKey,
} from './semanticStepFamilies';
import { repairDerivedObservations } from './reviewSuggestions';
import {
  aggregateSourceProfiles,
  buildMultiCaseSummary,
  buildSourceExtractionPlan,
  buildSourceProfileNote,
  classifySourceParagraphs,
} from './sourceProfiling';
import { rolePreferredValue, systemPreferredValue } from './reviewNormalization';
import {
  detectDomainIsolation,
  filterIssueEvidenceByDomain,
  filterRolesByDomain,
  filterSystemsByDomain,
} from './domainIsolation';
import {
  buildContextWindow,
  buildEvidenceSourceRef,
  buildExtractionCandidateReview,
  createObservationFromStepCandidate,
  createRoleCandidates,
  createStepCandidate,
  createSupportCandidate,
  createSystemCandidates,
  reviewExtractionCandidates,
} from './evidenceModel';

export interface DerivationInput {
  text: string;
  fileName?: string;
  sourceType: 'pdf' | 'docx' | 'narrative' | 'csv-row' | 'xlsx-row';
}

export interface DerivationResult {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  method: 'structured' | 'semi-structured' | 'narrative-fallback';
  documentKind: ProcessDocumentType;
  warnings: string[];
  confidence: 'high' | 'medium' | 'low';
  derivedSteps: Array<{ label: string; role?: string; evidenceSnippet?: string }>;
  roles: string[];
  systems: string[];
  issueSignals: string[];
  summary: DerivationSummary;
  routingContext: SourceRoutingContext;
  extractionCandidates?: ExtractionCandidate[];
}

export const LOCAL_MINING_ENGINE_VERSION = 'pm-local-engine-v4.3';
const ENGINE_VERSION = 'pm-local-engine-v4.3';
const MIN_USEFUL_STEPS = 3;
const MAX_NARRATIVE_LENGTH_IN_CASE = 2000;

function mapClassifierToDocumentKind(classType: ReturnType<typeof classifyDocumentStructure>['classType']): ProcessDocumentType {
  switch (classType) {
    case 'structured-target-procedure':
      return 'procedure-document';
    case 'semi-structured-procedure':
      return 'semi-structured-procedure-document';
    case 'narrative-case':
      return 'case-narrative';
    case 'mixed-document':
      return 'mixed-document';
    case 'weak-material':
      return 'weak-material';
    default:
      return 'unknown';
  }
}


interface CandidateBlock {
  title: string;
  body: string;
  timestampRaw?: string;
}

interface MixedDocumentSection {
  key: string;
  heading?: string;
  title: string;
  body: string;
  kind: MixedDocumentSegmentType;
  sourceParagraphKinds: string[];
}

interface NarrativeDocumentProfile {
  hasStoryHeading: boolean;
  hasTimeline: boolean;
  hasAiSection: boolean;
  hasSignalSection: boolean;
  hasQuestions: boolean;
  isMixed: boolean;
}

interface IssueEvidence {
  label: string;
  snippet: string;
}
type DomainKey = 'complaints' | 'billing' | 'onboarding' | 'returns' | 'procurement' | 'masterdata' | 'service' | 'generic';

const TIME_HEADING_RE = /^(\d{1,2}:\d{2}\s*Uhr)\s*\|\s*(.+)$/i;
const MAJOR_HEADING_RE = /^\s*([1-9])\.\s+(.+)$/;
const ALPHA_SECTION_HEADING_RE = /^\s*([A-ZÄÖÜ])\.\s+(.+)$/;
const STORY_HEADING_RE = /^\s*3\.\s+Die Geschichte\s*$/im;
const PIPE_ROW_RE = /^\s*\|(.+)\|\s*$/;
const CASE_HEADING_RE = /^fall\s+[a-z0-9äöüß]+(?:\s*[·|-]\s*.+)?$/i;
const NARRATIVE_META_RE = /^(?:\d+\s*[·.-]\s+gute narrative fallserie|service-st[öo]rung.*gute dokumentqualit[aä]t|onboarding.*gute dokumentqualit[aä]t|die folgenden\s+\w+\s+f[äa]lle|die fallserie zeigt|typischerweise l[äa]uft es so|rollen\s*:|systeme\s*:|friktion\s*:|signal\s*:|st[äa]rke\s*:|wichtig\s*:|frage\s*:|hinweis\s*:)/i;
const OPEN_QUESTION_FRAGMENT_RE = /^\s*(?:wer|wann|warum|wieso|wozu|wie)\b|\?\s*$/i;
const REVIEW_FRAGMENT_RE = /^\s*(?:bitte\b|wichtig\b|signal\b|friktion\b|st[äa]rke\b|hinweis\b)/i;
const QUOTE_FRAGMENT_RE = /^["'„“‚‘]|["'„“‚‘]/;
const HEADING_BLOCKLIST = [
  /rahmen der geschichte/i,
  /die person im prozess/i,
  /tagesverlauf/i,
  /ki-unterstützung/i,
  /kurzfazit/i,
  /welche signale/i,
  /beispielfragen/i,
  /app-test/i,
  /testfall/i,
  /signal\s*$/i,
  /nutzen fu?r den test/i,
  /erwartete wirkung/i,
];

const ROLE_PATTERNS: Array<[RegExp, string]> = [
  [/\bservice desk\b/i, 'Service Desk'],
  [/\bschichtleiter(?:in)?\b|\bschichtleitung\b/i, 'Schichtleitung'],
  [/\bremote-?technik\b/i, 'Remote-Technik'],
  [/\binstandhaltung\b/i, 'Instandhaltung'],
  [/\bpersonalwesen\b/i, 'Personalwesen'],
  [/\bit-service\b/i, 'IT-Service'],
  [/\bproduktionsplanung\b/i, 'Produktionsplanung'],
  [/\bservicekoordinator(?:in)?\b/i, 'Servicekoordination'],
  [/\bqualitätsmanagement\b|\bqualitaetsmanagement\b|\bqm\b|\bqs\b|\bqualit[aä]tssicherung\b/i, 'Qualitätsmanagement'],
  [/\btechnik\b|\btechniker(?:in)?\b/i, 'Technik'],
  [/\bteamleitung\b/i, 'Teamleitung'],
  [/\bvertrieb\b/i, 'Vertrieb'],
  [/\blogistik\b/i, 'Logistik'],
  [/\blager\b|\bwareneingang\b/i, 'Lager'],
  [/\bkey-?account\b/i, 'Key Account'],
  [/\bkunde\b/i, 'Kunde'],
  [/\bsachbearbeiter(?:in)?\b/i, 'Sachbearbeitung'],
  [/\bservice\b/i, 'Service'],
  [/\bdispatcher\b/i, 'Dispatcher'],
  [/\beinkauf\b|\bprocurement\b/i, 'Einkauf'],
  [/\bfachbereich\b/i, 'Fachbereich'],
  [/\bcontrolling\b/i, 'Controlling'],
  [/\bbuchhaltung\b/i, 'Buchhaltung'],
  [/\blieferant\b/i, 'Lieferant'],
  [/\bhr\b|\bhuman resources\b|\bpersonalabteilung\b/i, 'HR'],
  [/\bit\b|\bhelpdesk\b/i, 'IT'],
  [/\bf[üu]hrungskraft\b|\bmanager\b/i, 'Führungskraft'],
  [/\bfinanz(?:team|buchhaltung)?\b|\baccounts? receivable\b|\bdebitorenbuchhaltung\b|\bkreditorenbuchhaltung\b/i, 'Finanzbuchhaltung'],
  [/\bstammdatenmanagement\b|\bmaster data\b/i, 'Stammdatenmanagement'],
  [/\bcompliance\b/i, 'Compliance'],
];

const SYSTEM_PATTERNS: Array<[RegExp, string]> = [
  [/\bcrm\b/i, 'CRM'],
  [/\berp\b/i, 'ERP'],
  [/\bdms\b|dokumentenmanagement/i, 'DMS'],
  [/\be-?mail\b|postfach/i, 'E-Mail'],
  [/\bteams\b/i, 'Teams'],
  [/\bchat\b/i, 'Chat'],
  [/\btelefon(?:at)?\b/i, 'Telefon'],
  [/\bremote\b/i, 'Remote-Support'],
  [/\breport\b/i, 'Reporting'],
  [/\bsap\b/i, 'SAP'],
  [/\bmonitoring\b/i, 'Monitoring'],
  [/\bleitstand\b/i, 'Leitstand'],
  [/\bticket\b/i, 'Ticketsystem'],
  [/\bmaschinenmonitoring\b/i, 'Maschinenmonitoring'],
  [/\brma\b/i, 'RMA-Referenz'],
  [/\bsrm\b|\beinkaufssystem\b|\blieferantenportal\b/i, 'SRM/Einkaufssystem'],
  [/\brechnung\b|\brechnungsworkflow\b/i, 'Rechnungsworkflow'],
  [/\bhr-system\b|\bpersonalsystem\b|\bhr tool\b/i, 'HR-System'],
  [/\biam\b|\bactive directory\b|\bad\b/i, 'IAM/Active Directory'],
  [/\bservicekatalog\b|\bself service portal\b/i, 'Serviceportal'],
  [/\bmdm\b|\bmaster data\b/i, 'MDM'],
  [/\bworkflow-ticket\b|\bworkflow\b/i, 'Workflow'],
  [/\bidentity-?management\b/i, 'Identity-Management'],
  [/\bcad\b/i, 'CAD'],
  [/\bvpn\b/i, 'VPN'],
  [/\bnetzlaufwerke?\b/i, 'Netzlaufwerke'],
  [/\bbankdaten\b|\brechnungsadresse\b/i, 'Stammdatenformular'],
];

const ISSUE_PATTERNS: Array<[RegExp, string]> = [
  [/seriennummer|auftragsnummer|fehlende information|mindestdaten|pflichtangaben|betriebsdauer|technischer zustand/i, 'Fehlende Pflichtangaben'],
  [/crm|erp|e-?mail|dokumentenmanagement|zwischen fenstern|mehreren systemen|verschiedenen systemen|ticketsystem|leitstand|monitoring/i, 'Informationen müssen aus mehreren Systemen zusammengeführt werden'],
  [/priorit|eskalationsmodus|risikoabwägung|unsicherheit|schichtplanung|stillstand|dringend|sla/i, 'Priorisierung erfolgt unter Unsicherheit'],
  [/warte|wartet|wartezeiten|noch auf antworten|halte den druck aus|freigaben kosten|drehscheibe|warte auf/i, 'Wartezeiten und Koordinationsaufwand belasten den Ablauf'],
  [/ähnlich(?:en)? fäll|aehnlich(?:en)? faell|wissensspeicher|erinnerung|postfach entdecke ich|private e-mail|historie ab|alte e-mail/i, 'Erfahrungswissen liegt verstreut und schwer nutzbar vor'],
  [/kundenfähige sprache|kundenfaehige sprache|zwischenmeldung|kommunikation|abschlussmail|kernaussage|beziehungspflege|erwartungsmanagement/i, 'Kommunikation muss Unsicherheit professionell abfedern'],
  [/mehrfachdokumentation|dieselbe kernaussage|mehrere systeme|report|crm und report|medienbr[iü]ch|dieselbe kernaussage in mehreren systemen/i, 'Mehrfachdokumentation und Medienbrüche erhöhen den Aufwand'],
  [/freigabe|kulanz|teamleitung und vertrieb|genehmig|kosten fehlt/i, 'Freigaben verlangsamen die Umsetzung'],
  [/implizite koordination|kleine übergaben|kleine uebergaben|schnittstelle|drehscheibe|abstimm/i, 'Implizite Koordination bindet viele Beteiligte'],
  [/sla|zeitfenster|priorisiert den einsatz/i, 'SLA-Druck prägt die Priorisierung'],
  [/remote|ferndiagnose|remote-diagnose|remote-unterst[üu]tzung/i, 'Remote-Diagnose und Fernunterstützung sind Teil des Falls'],
  [/sensorfehler|konfigurationsproblem|temperatursensor|wiederkehrender sensorfehler/i, 'Wiederkehrender Sensorfehler oder Konfigurationsproblem'],
  [/retoure|ruecksendung|rücksendung|rma|garantie|gutschrift|wareneingang/i, 'Retouren- und Garantieklärung erzeugen zusätzlichen Abstimmungsaufwand'],
  [/bedarf|bestellanforderung|spezifikation|kostenstelle|budget|angebotsdaten/i, 'Beschaffung startet mit unvollständigen Bedarfs- oder Budgetdaten'],
  [/lieferant|angebot|vergleichsangebot|beschaffung|einkaufssystem|srm/i, 'Lieferantenabstimmung und Angebotsvergleich erzeugen zusätzlichen Aufwand'],
  [/rechnung|wareneingang|buchhaltung|bestellung/i, 'Bestellung, Wareneingang und Rechnung müssen über mehrere Stellen abgestimmt werden'],
  [/onboarding|eintritt|stammdaten|personalnummer|starttermin/i, 'Onboarding scheitert schnell an fehlenden Stammdaten und Terminklarheit'],
  [/zug[aä]nge|account|iam|active directory|notebook|equipment/i, 'Zugänge und Equipment hängen von mehreren Systemen und Freigaben ab'],
  [/f[üu]hrungskraft|hr|it|fachbereich|einweisung|schulung/i, 'Onboarding erfordert enge Abstimmung zwischen HR, IT und Fachbereich'],
  [/rechnung|rechnungsdifferenz|bestellbezug|zahlungssperre|gutschrift|rechnungsworkflow/i, 'Rechnungsklärung verlangt Abgleich zwischen Belegen, Bestellung und Freigaben'],
  [/stammdaten|aenderungsantrag|änderungsantrag|dublette|bankdaten|rechnungsadresse|mdm/i, 'Stammdatenänderungen brauchen Validierung, Nachweise und sauberen Systemnachlauf'],
];

const SIGNAL_ROW_HINTS: Array<[RegExp, string]> = [
  [/fehlende pflichtangaben|unvollständige eingänge|unvollstaendige eing[aä]nge/i, 'Fehlende Pflichtangaben'],
  [/eskalationssignale|stillstand|schichtplanung|strategisch wichtiger kunde/i, 'Priorisierung erfolgt unter Unsicherheit'],
  [/verteiltes wissen|ähnliche fälle|aehnliche faelle|persönliche erinnerung|persoenliche erinnerung/i, 'Erfahrungswissen liegt verstreut und schwer nutzbar vor'],
  [/implizite koordination|service|qm|technik|vertrieb|logistik/i, 'Implizite Koordination bindet viele Beteiligte'],
  [/kommunikationslast|mehrfachdokumentation|zwischenstände|zwischenstaende/i, 'Mehrfachdokumentation und Medienbrüche erhöhen den Aufwand'],
  [/freigabe|kulanz/i, 'Freigaben verlangsamen die Umsetzung'],
  [/sla|zeitfenster/i, 'SLA-Druck prägt die Priorisierung'],
  [/remote/i, 'Remote-Diagnose und Fernunterstützung sind Teil des Falls'],
  [/bedarf|bestellanforderung|kostenstelle|budget/i, 'Beschaffung startet mit unvollständigen Bedarfs- oder Budgetdaten'],
  [/lieferant|angebot|vergleichsangebot/i, 'Lieferantenabstimmung und Angebotsvergleich erzeugen zusätzlichen Aufwand'],
  [/onboarding|eintritt|stammdaten|zug[aä]nge|equipment|schulung/i, 'Onboarding erfordert enge Abstimmung zwischen HR, IT und Fachbereich'],
  [/rechnung|rechnungsdifferenz|bestellbezug|zahlungssperre|gutschrift|rechnungsworkflow/i, 'Rechnungsklärung verlangt Abgleich zwischen Belegen, Bestellung und Freigaben'],
  [/stammdaten|aenderungsantrag|änderungsantrag|dublette|bankdaten|rechnungsadresse|mdm/i, 'Stammdatenänderungen brauchen Validierung, Nachweise und sauberen Systemnachlauf'],
];

const DOMAIN_KEYWORDS: Record<Exclude<DomainKey, 'generic'>, RegExp[]> = {
  complaints: [/\breklamation|beschwerde|kulanz|servicefall|gewährleistung|gew[aä]hrleistung\b/i],
  billing: [/\brechnung|rechnungsworkflow|zahlungssperre|gutschrift|kreditor|debitor|invoice\b/i],
  onboarding: [/\bonboarding|eintritt|zug[aä]nge|equipment|iam|personalnummer\b/i],
  returns: [/\bretoure|r[üu]cksendung|rma|wareneingang|garantie\b/i],
  procurement: [/\bbeschaffung|bestellanforderung|lieferant|angebot|srm|bestellung\b/i],
  masterdata: [/\bstammdaten|mdm|[äa]nderungsantrag|dublette|bankdaten|rechnungsadresse\b/i],
  service: [/\bst[öo]rfall|incident|ticket|sla|remote|leitstand|monitoring\b/i],
};

const ISSUE_DOMAIN_MAP: Record<string, DomainKey[]> = {
  'Fehlende Pflichtangaben': ['generic'],
  'Informationen müssen aus mehreren Systemen zusammengeführt werden': ['generic'],
  'Priorisierung erfolgt unter Unsicherheit': ['generic'],
  'Wartezeiten und Koordinationsaufwand belasten den Ablauf': ['generic'],
  'Erfahrungswissen liegt verstreut und schwer nutzbar vor': ['generic'],
  'Kommunikation muss Unsicherheit professionell abfedern': ['generic'],
  'Mehrfachdokumentation und Medienbrüche erhöhen den Aufwand': ['generic'],
  'Freigaben verlangsamen die Umsetzung': ['generic'],
  'Implizite Koordination bindet viele Beteiligte': ['generic'],
  'SLA-Druck prägt die Priorisierung': ['service'],
  'Remote-Diagnose und Fernunterstützung sind Teil des Falls': ['service'],
  'Wiederkehrender Sensorfehler oder Konfigurationsproblem': ['service'],
  'Retouren- und Garantieklärung erzeugen zusätzlichen Abstimmungsaufwand': ['returns', 'complaints'],
  'Beschaffung startet mit unvollständigen Bedarfs- oder Budgetdaten': ['procurement'],
  'Lieferantenabstimmung und Angebotsvergleich erzeugen zusätzlichen Aufwand': ['procurement'],
  'Bestellung, Wareneingang und Rechnung müssen über mehrere Stellen abgestimmt werden': ['procurement', 'billing', 'returns'],
  'Onboarding scheitert schnell an fehlenden Stammdaten und Terminklarheit': ['onboarding'],
  'Zugänge und Equipment hängen von mehreren Systemen und Freigaben ab': ['onboarding'],
  'Onboarding erfordert enge Abstimmung zwischen HR, IT und Fachbereich': ['onboarding'],
  'Rechnungsklärung verlangt Abgleich zwischen Belegen, Bestellung und Freigaben': ['billing'],
  'Stammdatenänderungen brauchen Validierung, Nachweise und sauberen Systemnachlauf': ['masterdata'],
};

function detectDomainContext(text: string): { primary: DomainKey; secondary?: DomainKey; scores: Record<DomainKey, number> } {
  const scores: Record<DomainKey, number> = {
    complaints: 0,
    billing: 0,
    onboarding: 0,
    returns: 0,
    procurement: 0,
    masterdata: 0,
    service: 0,
    generic: 0,
  };
  for (const [domain, patterns] of Object.entries(DOMAIN_KEYWORDS) as Array<[Exclude<DomainKey, 'generic'>, RegExp[]]>) {
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) scores[domain] += matches.length;
    }
  }
  const ranked = (Object.entries(scores) as Array<[DomainKey, number]>)
    .filter(([domain]) => domain !== 'generic')
    .sort((a, b) => b[1] - a[1]);
  const primary = ranked[0]?.[1] > 0 ? ranked[0][0] : 'generic';
  const secondary = ranked[1]?.[1] >= 2 ? ranked[1][0] : undefined;
  return { primary, secondary, scores };
}

function isIssueAllowedInDomain(label: string, context: { primary: DomainKey; secondary?: DomainKey }): boolean {
  const mappedDomains = ISSUE_DOMAIN_MAP[label] ?? ['generic'];
  if (mappedDomains.includes('generic')) return true;
  if (context.primary !== 'generic' && mappedDomains.includes(context.primary)) return true;
  if (context.secondary && mappedDomains.includes(context.secondary)) return true;
  return false;
}

function cleanInputText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, ' ').trim();
}

function buildCase(params: {
  name: string;
  narrative: string;
  rawText: string;
  sourceNote?: string;
  sourceType: ProcessMiningObservationCase['sourceType'];
  inputKind: ProcessMiningObservationCase['inputKind'];
  derivedStepLabels?: string[];
  analysisProfileLabel?: string;
  analysisProfileHint?: string;
  analysisStrategies?: string[];
  routingContext?: SourceRoutingContext;
}): ProcessMiningObservationCase {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: params.name,
    narrative: params.narrative,
    rawText: params.rawText,
    sourceNote: params.sourceNote,
    sourceType: params.sourceType,
    inputKind: params.inputKind,
    derivedStepLabels: params.derivedStepLabels,
    analysisProfileLabel: params.analysisProfileLabel,
    analysisProfileHint: params.analysisProfileHint,
    analysisStrategies: params.analysisStrategies,
    routingContext: params.routingContext,
    createdAt: now,
    updatedAt: now,
  };
}

function getSourceName(fileName: string | undefined, sourceType: DerivationInput['sourceType']): string {
  return fileName ?? (sourceType === 'narrative' ? 'Freitext' : 'Import');
}

function sliceNarrative(text: string): string {
  const trimmed = cleanInputText(text);
  if (trimmed.length <= MAX_NARRATIVE_LENGTH_IN_CASE) return trimmed;
  return `${trimmed.slice(0, MAX_NARRATIVE_LENGTH_IN_CASE).trimEnd()}…`;
}

function extractStorySection(text: string): string | null {
  const match = STORY_HEADING_RE.exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  const after = text.slice(start);
  const nextHeading = after.match(/^\s*[4-9]\.\s+.+$/m);
  const storyText = nextHeading ? after.slice(0, nextHeading.index).trim() : after.trim();
  return storyText || null;
}

function profileNarrativeDocument(text: string): NarrativeDocumentProfile {
  const normalized = text.toLowerCase();
  const hasStoryHeading = /\b3\.\s+die geschichte\b/i.test(text);
  const hasTimeline = (text.match(/^\d{1,2}:\d{2}\s*Uhr\s*\|/gm) ?? []).length >= 2;
  const hasAiSection = /ki-unterstützung|ki-unterstuetzung/i.test(normalized);
  const hasSignalSection = /welche signale|beobachtete reibung|erkennbar im text/i.test(normalized);
  const hasQuestions = /beispielfragen/i.test(normalized);
  return {
    hasStoryHeading,
    hasTimeline,
    hasAiSection,
    hasSignalSection,
    hasQuestions,
    isMixed: hasStoryHeading && (hasAiSection || hasSignalSection || hasQuestions),
  };
}

function extractRelevantNarrativeSource(text: string): string {
  return extractStorySection(text) ?? text;
}

function isMostlyNarrative(text: string): boolean {
  const lower = text.toLowerCase();
  const firstPersonSignals = (lower.match(/\b(ich|wir|mein|meine|mich|uns)\b/g) ?? []).length;
  const timeHeadings = (text.match(/^\d{1,2}:\d{2}\s*Uhr\s*\|/gm) ?? []).length;
  return timeHeadings >= 2 || firstPersonSignals >= 5 || /die geschichte/i.test(text);
}

function extractTimelineBlocks(text: string): CandidateBlock[] {
  const relevantText = extractRelevantNarrativeSource(text);
  const lines = relevantText.split('\n');
  const blocks: CandidateBlock[] = [];
  let current: CandidateBlock | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const blockedHeading = line.match(MAJOR_HEADING_RE);
    if (blockedHeading && Number(blockedHeading[1]) >= 4) {
      break;
    }
    const timeMatch = line.match(TIME_HEADING_RE);
    if (timeMatch) {
      if (current && normalizeWhitespace(`${current.title} ${current.body}`).length > 24) {
        blocks.push(current);
      }
      current = {
        timestampRaw: timeMatch[1],
        title: normalizeWhitespace(timeMatch[2]),
        body: '',
      };
      continue;
    }
    if (current) {
      current.body = current.body ? `${current.body}\n${line}` : line;
    }
  }

  if (current && normalizeWhitespace(`${current.title} ${current.body}`).length > 24) {
    blocks.push(current);
  }

  return blocks;
}

function candidateTexts(text: string, refId: string): string[] {
  const extractionPlan = buildSourceExtractionPlan(text);
  const candidates = findDocumentProcessCandidates([{ refId, text }], { maxCandidates: 5 });
  const rawCandidates = [
    text,
    extractionPlan.primaryText,
    extractionPlan.supportText ? `${extractionPlan.primaryText}\n\n${extractionPlan.supportText}` : '',
    ...candidates.map(candidate => candidate.text),
  ].filter(candidate => normalizeWhitespace(candidate).length >= 40);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of rawCandidates) {
    const key = normalizeWhitespace(candidate).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function isBlockedParagraph(paragraph: string): boolean {
  if (!paragraph) return true;
  if (PIPE_ROW_RE.test(paragraph)) return true;
  const firstLine = paragraph.split('\n')[0] ?? paragraph;
  if (HEADING_BLOCKLIST.some(re => re.test(firstLine))) return true;
  if (CASE_HEADING_RE.test(firstLine)) return true;
  if (NARRATIVE_META_RE.test(firstLine)) return true;
  if (/^\d+\)\s+/.test(paragraph)) return true;
  if (/^signal$/i.test(paragraph) || /^nutzen/i.test(paragraph)) return true;
  return false;
}

function isNarrativeMetaBlock(block: CandidateBlock): boolean {
  const title = normalizeWhitespace(block.title);
  const body = normalizeWhitespace(block.body);
  const combined = normalizeWhitespace(`${title} ${body}`);
  if (!combined) return true;
  if (CASE_HEADING_RE.test(title)) return true;
  if (NARRATIVE_META_RE.test(title) || NARRATIVE_META_RE.test(combined)) return true;
  if (REVIEW_FRAGMENT_RE.test(title) && !ACTION_LEAD_RE.test(combined)) return true;
  if (OPEN_QUESTION_FRAGMENT_RE.test(title) || OPEN_QUESTION_FRAGMENT_RE.test(body)) return true;
  return false;
}

function splitEntitySeedParts(parts: Array<string | undefined>): string[] {
  return parts
    .filter(Boolean)
    .flatMap(part => normalizeWhitespace(part ?? '').split(/[,/;]|\s+und\s+/i))
    .map(part => normalizeWhitespace(part))
    .filter(Boolean);
}

function isExplicitRoleSeed(value: string): boolean {
  if (!value) return false;
  if (value.length > 48) return false;
  if ((value.match(/\s+/g) ?? []).length >= 4) return false;
  if (/[.!?"„“:]/.test(value)) return false;
  if (/\b(?:ist|sind|war|waren|wurde|wurden|wird|werden|hat|haben|fehlte|fehlen|meldete|legte|erhielt|musste|funktionierten?|ben[öo]tigt|braucht|drohte|starten|warten)\b/i.test(value)) return false;
  return true;
}

function isExplicitSystemSeed(value: string): boolean {
  if (!value) return false;
  if (value.length > 56) return false;
  if ((value.match(/\s+/g) ?? []).length >= 5) return false;
  if (/[.!?"„“:]/.test(value)) return false;
  if (/\b(?:ist|sind|war|waren|wurde|wurden|wird|werden|hat|haben|fehlte|fehlen|meldete|legte|erhielt|musste|funktionierten?|ben[öo]tigt|braucht|drohte|starten|warten)\b/i.test(value)) return false;
  return true;
}

const ACTION_LEAD_RE = /^(?:service|julia|kunde|technik|qualit[aä]tsmanagement|qm|logistik|vertrieb|teamleitung|dispatcher|der techniker|die technik|das team|anschlie[ßs]end|danach|sp[aä]ter|am ende|zun[aä]chst|noch bevor|w[aä]hrend|parallel|gleichzeitig)?\s*(?:legt|nimmt|pr[üu]ft|fragt|fordert|stuft|bindet|schickt|leitet|sammelt|recherchiert|sucht|gleicht|entscheidet|priorisiert|best[aä]tigt|formuliert|kommuniziert|stimmt|holt|erh[aä]lt|organisiert|plant|bestellt|l[öo]st|informiert|dokumentiert|aktualisiert|schlie[ßs]t|empfiehlt|erkennt|spielt|behebt|bereitet|versendet)\b/i;

function splitActionClauseUnit(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (normalized.length < 24) return [normalized];

  const commaSplit = normalized
    .split(/,|;|\u2022/g)
    .map(part => normalizeWhitespace(part))
    .filter(Boolean);

  const coarseParts = commaSplit.length >= 2 ? commaSplit : [normalized];
  const refined: string[] = [];

  for (const part of coarseParts) {
    const subparts = part
      .split(/\s+und\s+(?=(?:der|die|das|ein|eine|service|kunde|technik|logistik|vertrieb|teamleitung|dispatcher|techniker|sie|julia|anschlie[ßs]end|danach)?\s*(?:legt|nimmt|pr[üu]ft|fragt|fordert|stuft|bindet|schickt|leitet|sammelt|recherchiert|sucht|gleicht|entscheidet|priorisiert|best[aä]tigt|formuliert|kommuniziert|stimmt|holt|erh[aä]lt|organisiert|plant|bestellt|l[öo]st|informiert|dokumentiert|aktualisiert|schlie[ßs]t|empfiehlt|erkennt|spielt|behebt|bereitet|versendet)\b)/i)
      .map(piece => normalizeWhitespace(piece))
      .filter(Boolean);

    if (subparts.length > 1) {
      refined.push(...subparts);
    } else {
      refined.push(part);
    }
  }

  return refined.filter(part => part.length >= 18);
}

function paragraphBlocksFromText(text: string): CandidateBlock[] {
  const source = extractRelevantNarrativeSource(text);
  const extractionPlan = buildSourceExtractionPlan(source);
  const processParagraphs = extractionPlan.primaryParagraphs.map(paragraph => paragraph.text);
  const baseParagraphs = (processParagraphs.length > 0 ? processParagraphs : source.split(/\n{2,}/))
    .map(chunk => normalizeWhitespace(chunk))
    .filter(chunk => chunk.length > 28)
    .filter(chunk => !isBlockedParagraph(chunk));

  const blocks: CandidateBlock[] = [];
  for (const chunk of baseParagraphs) {
    const units = splitActionClauseUnit(chunk);
    if (units.length >= 2) {
      units.forEach(unit => {
        const title = sentenceCase(unit.split(/(?<=[.!?])\s+/)[0] ?? unit);
        if (ACTION_LEAD_RE.test(unit) || unit.length > 30) {
          blocks.push({ title, body: unit });
        }
      });
      continue;
    }

    const firstSentence = chunk.split(/(?<=[.!?])\s+/)[0] ?? chunk;
    blocks.push({ title: sentenceCase(firstSentence), body: chunk });
  }

  return blocks;
}

function emptyMixedSegmentCounts(): Record<MixedDocumentSegmentType, number> {
  return {
    'process-core': 0,
    quote: 0,
    question: 0,
    'review-note': 0,
    table: 0,
    'governance-note': 0,
  };
}

function hasProcessBearingParagraph(kinds: string[]): boolean {
  return kinds.some(kind => ['timeline', 'procedural', 'decision', 'communication', 'knowledge'].includes(kind));
}

function classifyMixedSectionKind(params: {
  title: string;
  body: string;
  paragraphKinds: string[];
}): MixedDocumentSegmentType {
  const combined = normalizeWhitespace(`${params.title} ${params.body}`);
  const lower = combined.toLowerCase();
  if (!combined) return 'review-note';
  if (
    /signaltabelle|\bbeobachtung\b|m[öo]gliche bedeutung|\|/.test(lower)
    || params.paragraphKinds.includes('tableLike')
  ) {
    return 'table';
  }
  if (
    /offene fragen|\bwer\b|\bwie\b|\bwann\b|\bwarum\b|\bsoll\b/.test(lower)
    || /\?/.test(params.body)
  ) {
    return 'question';
  }
  if (
    /governance|review|owner|eigent[üu]merschaft|verantwort|freigabestatus|management-freigabe|intern freigegeben|4-augen|audit|compliance|zieldatum|pilot-weitergabe/.test(lower)
    || params.paragraphKinds.includes('governance')
  ) {
    return 'governance-note';
  }
  if (
    /besprechungsausschnitt|e-?mail-auszug|mail-auszug|zitat/.test(lower)
    || (QUOTE_FRAGMENT_RE.test(params.body) && !hasProcessBearingParagraph(params.paragraphKinds))
  ) {
    return 'quote';
  }
  if (
    /operative passage|vermuteter ablauf|typischerweise|[üu]blicherweise|prozesskern|ablauf/.test(lower)
    || hasProcessBearingParagraph(params.paragraphKinds)
  ) {
    return 'process-core';
  }
  return 'review-note';
}

function splitMixedDocumentSections(text: string): MixedDocumentSection[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\f/g, '\n');
  const lines = normalized.split('\n');
  const rawSections: Array<{ heading?: string; title: string; lines: string[] }> = [];
  let current: { heading?: string; title: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const body = current.lines.join('\n').trim();
    if (body || current.title) {
      rawSections.push({ ...current, lines: current.lines.slice() });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line) {
      if (current && current.lines[current.lines.length - 1] !== '') {
        current.lines.push('');
      }
      continue;
    }

    const alphaHeading = line.match(ALPHA_SECTION_HEADING_RE);
    if (alphaHeading) {
      flush();
      current = {
        heading: alphaHeading[1],
        title: sentenceCase(alphaHeading[2]),
        lines: [],
      };
      continue;
    }

    if (!current) {
      current = {
        title: rawSections.length === 0 ? 'Kontext' : `Abschnitt ${rawSections.length + 1}`,
        lines: [],
      };
    }
    current.lines.push(line);
  }

  flush();

  return rawSections
    .map((section, index) => {
      const body = section.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      const paragraphKinds = uniqueStrings(classifySourceParagraphs(body).map(paragraph => paragraph.kind));
      const kind = classifyMixedSectionKind({
        title: section.title,
        body,
        paragraphKinds,
      });
      return {
        key: `mixed-section:${index + 1}`,
        heading: section.heading,
        title: section.title,
        body,
        kind,
        sourceParagraphKinds: paragraphKinds,
      } satisfies MixedDocumentSection;
    })
    .filter(section => normalizeWhitespace(`${section.title} ${section.body}`).length >= 8);
}

function normalizeMixedProcessUnitTitle(unit: string): string {
  const normalized = normalizeWhitespace(unit)
    .replace(/^(?:typischerweise(?:\s+l[äa]uft\s+es\s+so)?|[üu]blicherweise|in der praxis|danach|anschlie[ßs]end|anschliessend|zun[aä]chst|sp[äa]ter|zuerst)\s*(?::)?\s*/i, '')
    .replace(/^(?:wird|werden|folgt)\s+/i, '')
    .replace(/^„|“$/g, '')
    .trim();
  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  return sentenceCase(firstSentence.replace(/[.:]+$/g, '').trim());
}

function extractProcessBlocksFromMixedSection(section: MixedDocumentSection): CandidateBlock[] {
  if (section.kind !== 'process-core') return [];

  const sectionText = normalizeWhitespace(section.body);
  if (!sectionText) return [];

  const explicitUnits = splitActionClauseUnit(section.body);
  const units = explicitUnits.length >= 2
    ? explicitUnits
    : section.body
        .split(/(?<=[.!?])\s+/)
        .map(part => normalizeWhitespace(part))
        .filter(Boolean);

  return units
    .map(unit => normalizeWhitespace(unit.replace(/^[•*-]\s*/, '')))
    .filter(unit => unit.length >= 18)
    .filter(unit => !OPEN_QUESTION_FRAGMENT_RE.test(unit))
    .filter(unit => !QUOTE_FRAGMENT_RE.test(unit))
    .filter(unit => !/^(?:in grenzf[aä]llen|nicht immer ist klar|mehrere [a-z].* betreffen|finance berichtet)/i.test(unit))
    .map(unit => ({
      title: normalizeMixedProcessUnitTitle(unit),
      body: unit,
    }))
    .filter(block => block.title.length >= 6);
}

function buildMixedDocumentSegmentSummary(sections: MixedDocumentSection[]): MixedDocumentSegmentSummary {
  const counts = emptyMixedSegmentCounts();
  const examplesByType = new Map<MixedDocumentSegmentType, { type: MixedDocumentSegmentType; title?: string; snippet: string }>();

  sections.forEach(section => {
    counts[section.kind] += 1;
    if (!examplesByType.has(section.kind)) {
      examplesByType.set(section.kind, {
        type: section.kind,
        title: section.title,
        snippet: normalizeWhitespace(section.body || section.title).slice(0, 220),
      });
    }
  });

  return {
    totalSegments: sections.length,
    counts,
    examples: Array.from(examplesByType.values()),
  };
}

function extractRoles(text: string): string[] {
  return uniqueStrings(ROLE_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label));
}

function extractSystems(text: string): string[] {
  return uniqueStrings(SYSTEM_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label));
}

function extractIssueSignals(text: string, context?: { primary: DomainKey; secondary?: DomainKey }): string[] {
  const labels = ISSUE_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label);
  if (!context || context.primary === 'generic') return uniqueStrings(labels);
  return uniqueStrings(labels.filter(label => isIssueAllowedInDomain(label, context)));
}

function dedupeIssueEvidence(entries: IssueEvidence[]): IssueEvidence[] {
  const byKey = new Map<string, IssueEvidence>();
  for (const entry of entries) {
    const key = normalizeWhitespace(entry.label).toLowerCase();
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, { label: entry.label, snippet: entry.snippet });
      continue;
    }
    const existing = byKey.get(key)!;
    if (entry.snippet && existing.snippet && existing.snippet !== entry.snippet) {
      byKey.set(key, {
        label: existing.label,
        snippet: `${existing.snippet} ${entry.snippet}`.slice(0, 320).trim(),
      });
    }
  }
  return Array.from(byKey.values());
}

function extractIssueEvidence(text: string, context?: { primary: DomainKey; secondary?: DomainKey }): IssueEvidence[] {
  const snippets = cleanInputText(text)
    .split(/\n{2,}|(?<=[.!?])\s+/)
    .map(part => normalizeWhitespace(part))
    .filter(part => part.length >= 25);

  const evidence: IssueEvidence[] = [];
  for (const snippet of snippets) {
    for (const [re, label] of ISSUE_PATTERNS) {
      if (re.test(snippet)) {
        evidence.push({ label, snippet: sentenceCase(snippet).slice(0, 220) });
      }
    }
  }

  for (const rawLine of text.split('\n')) {
    const match = rawLine.match(PIPE_ROW_RE);
    if (!match) continue;
    const cells = match[1]
      .split('|')
      .map(cell => normalizeWhitespace(cell))
      .filter(Boolean);
    if (cells.length < 2) continue;
    const joined = cells.join(' | ');
    if (/beobachtete reibung|erwartete wirkung|erkennbar im text|nutzen fu?r den test|sinnvolle ki-unterstützung|sinnvolle ki-unterstuetzung/i.test(joined)) {
      continue;
    }
    for (const [re, label] of SIGNAL_ROW_HINTS) {
      if (re.test(joined)) {
        evidence.push({ label, snippet: joined.slice(0, 220) });
      }
    }
  }

  const deduped = dedupeIssueEvidence(evidence);
  if (!context || context.primary === 'generic') return deduped;
  return deduped.filter(entry => isIssueAllowedInDomain(entry.label, context));
}

function collectLocalRoleLabels(params: {
  explicit?: Array<string | undefined>;
  context?: Array<string | undefined>;
}): string[] {
  const explicit = splitEntitySeedParts(params.explicit ?? [])
    .filter(isExplicitRoleSeed)
    .map(label => sentenceCase(label));
  const contextText = (params.context ?? []).filter(Boolean).join(' ');
  return uniqueStrings([
    ...explicit,
    ...extractRoles(contextText),
  ]);
}

function collectLocalSystemLabels(params: {
  explicit?: Array<string | undefined>;
  context?: Array<string | undefined>;
}): string[] {
  const explicit = splitEntitySeedParts(params.explicit ?? [])
    .filter(isExplicitSystemSeed)
    .map(label => sentenceCase(label));
  const contextText = (params.context ?? []).filter(Boolean).join(' ');
  return uniqueStrings([
    ...explicit,
    ...extractSystems(contextText),
  ]);
}

function buildStructuredStepArtifacts(
  caseId: string,
  steps: StructuredProcedureStep[],
  routingContext: SourceRoutingContext,
): {
  observations: ProcessMiningObservation[];
  extractionCandidates: ExtractionCandidate[];
  roles: string[];
  systems: string[];
  derivedSteps: Array<{ label: string; role?: string; evidenceSnippet?: string }>;
} {
  const observations: ProcessMiningObservation[] = [];
  const extractionCandidates: ExtractionCandidate[] = [];
  const collectedRoles: string[] = [];
  const collectedSystems: string[] = [];
  const derivedSteps: Array<{ label: string; role?: string; evidenceSnippet?: string }> = [];

  steps.forEach((step, index) => {
    const evidenceAnchor = step.evidenceSnippet || [step.label, step.description, step.result].filter(Boolean).join(' | ');
    const contextWindow = buildContextWindow([step.label, step.description, step.result, step.decision, evidenceAnchor]);
    const localRoles = collectLocalRoleLabels({
      explicit: [step.responsible],
      context: [step.label, step.description, evidenceAnchor],
    });
    const localSystems = collectLocalSystemLabels({
      explicit: [step.system],
      context: [step.label, step.description, evidenceAnchor],
    });
    const stepCandidate = createStepCandidate({
      rawLabel: step.label,
      evidenceAnchor,
      contextWindow,
      confidence: evidenceAnchor.length >= 28 ? 'high' : 'medium',
      originChannel: evidenceAnchor.includes('|') ? 'table-row' : 'bullet-list',
      sourceFragmentType: evidenceAnchor.includes('|') ? 'table-row' : 'list-item',
      routingContext,
      sourceRef: buildEvidenceSourceRef(caseId, `structured-step:${index + 1}`),
      index,
    });

    extractionCandidates.push(stepCandidate);
    extractionCandidates.push(...createRoleCandidates({
      labels: localRoles,
      evidenceAnchor,
      contextWindow,
      confidence: stepCandidate.confidence,
      originChannel: stepCandidate.originChannel,
      sourceFragmentType: stepCandidate.sourceFragmentType,
      routingContext,
      sourceRef: stepCandidate.sourceRef ?? buildEvidenceSourceRef(caseId, `structured-step:${index + 1}`),
      relatedCandidateId: stepCandidate.candidateId,
    }));
    extractionCandidates.push(...createSystemCandidates({
      labels: localSystems,
      evidenceAnchor,
      contextWindow,
      confidence: stepCandidate.confidence,
      originChannel: stepCandidate.originChannel,
      sourceFragmentType: stepCandidate.sourceFragmentType,
      routingContext,
      sourceRef: stepCandidate.sourceRef ?? buildEvidenceSourceRef(caseId, `structured-step:${index + 1}`),
      relatedCandidateId: stepCandidate.candidateId,
    }));

    observations.push(createObservationFromStepCandidate({
      candidate: stepCandidate,
      caseId,
      sequenceIndex: observations.length,
      role: localRoles[0],
      system: localSystems[0],
      timestampQuality: 'missing',
    }));
    collectedRoles.push(...localRoles);
    collectedSystems.push(...localSystems);
    derivedSteps.push({
      label: stepCandidate.normalizedLabel,
      role: localRoles[0],
      evidenceSnippet: stepCandidate.evidenceAnchor,
    });
  });

  return {
    observations,
    extractionCandidates,
    roles: uniqueStrings(collectedRoles),
    systems: uniqueStrings(collectedSystems),
    derivedSteps,
  };
}

function buildSemiStructuredStepArtifacts(
  caseId: string,
  steps: SemiStructuredProcedureStep[],
  routingContext: SourceRoutingContext,
): {
  observations: ProcessMiningObservation[];
  extractionCandidates: ExtractionCandidate[];
  roles: string[];
  systems: string[];
  derivedSteps: Array<{ label: string; role?: string; evidenceSnippet?: string }>;
} {
  const observations: ProcessMiningObservation[] = [];
  const extractionCandidates: ExtractionCandidate[] = [];
  const collectedRoles: string[] = [];
  const collectedSystems: string[] = [];
  const derivedSteps: Array<{ label: string; role?: string; evidenceSnippet?: string }> = [];

  steps.forEach((step, index) => {
    const evidenceAnchor = step.evidenceSnippet || [step.label, step.description, step.sourceHeading].filter(Boolean).join(' | ');
    const contextWindow = buildContextWindow([step.sourceHeading, step.label, step.description, evidenceAnchor]);
    const localRoles = collectLocalRoleLabels({
      explicit: [step.responsible],
      context: [step.sourceHeading, step.label, step.description, evidenceAnchor],
    });
    const localSystems = collectLocalSystemLabels({
      context: [step.sourceHeading, step.label, step.description, evidenceAnchor],
    });
    const stepCandidate = createStepCandidate({
      rawLabel: step.label,
      evidenceAnchor,
      contextWindow,
      confidence: step.description ? 'medium' : 'low',
      originChannel: step.sourceHeading ? 'bullet-list' : 'paragraph',
      sourceFragmentType: step.sourceHeading ? 'list-item' : 'paragraph',
      routingContext,
      sourceRef: buildEvidenceSourceRef(caseId, `semi-step:${index + 1}`),
      index,
    });

    extractionCandidates.push(stepCandidate);
    extractionCandidates.push(...createRoleCandidates({
      labels: localRoles,
      evidenceAnchor,
      contextWindow,
      confidence: stepCandidate.confidence,
      originChannel: stepCandidate.originChannel,
      sourceFragmentType: stepCandidate.sourceFragmentType,
      routingContext,
      sourceRef: stepCandidate.sourceRef ?? buildEvidenceSourceRef(caseId, `semi-step:${index + 1}`),
      relatedCandidateId: stepCandidate.candidateId,
    }));
    extractionCandidates.push(...createSystemCandidates({
      labels: localSystems,
      evidenceAnchor,
      contextWindow,
      confidence: stepCandidate.confidence,
      originChannel: stepCandidate.originChannel,
      sourceFragmentType: stepCandidate.sourceFragmentType,
      routingContext,
      sourceRef: stepCandidate.sourceRef ?? buildEvidenceSourceRef(caseId, `semi-step:${index + 1}`),
      relatedCandidateId: stepCandidate.candidateId,
    }));

    observations.push(createObservationFromStepCandidate({
      candidate: stepCandidate,
      caseId,
      sequenceIndex: observations.length,
      role: localRoles[0],
      system: localSystems[0],
      timestampQuality: 'missing',
    }));
    collectedRoles.push(...localRoles);
    collectedSystems.push(...localSystems);
    derivedSteps.push({
      label: stepCandidate.normalizedLabel,
      role: localRoles[0],
      evidenceSnippet: stepCandidate.evidenceAnchor,
    });
  });

  return {
    observations,
    extractionCandidates,
    roles: uniqueStrings(collectedRoles),
    systems: uniqueStrings(collectedSystems),
    derivedSteps,
  };
}

function dedupeDerivedSteps<T extends { label: string }>(
  steps: T[],
): T[] {
  const seen = new Set<string>();
  return steps.filter(step => {
    const key = stepSemanticKey(step.label);
    if (!step.label || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildNarrativeDocumentNote(profile: NarrativeDocumentProfile): string | undefined {
  if (profile.isMixed) {
    return 'Mischdokument erkannt: Der Prozessentwurf wird primär aus der eigentlichen Fallgeschichte bzw. Zeitleiste gebildet. Tabellen mit KI-Ideen, Kurzfazit und Testfragen fließen nur als Zusatzsignale ein.';
  }
  if (profile.hasStoryHeading || profile.hasTimeline) {
    return 'Narrative Fallbeschreibung erkannt: Die App verdichtet die geschilderten Episoden zu einem belastbaren lokalen Prozessentwurf.';
  }
  return undefined;
}

function buildAnalysisStrategies(profileLabel: string): string[] {
  const lower = normalizeWhitespace(profileLabel).toLowerCase();
  if (lower.includes('mischdokument')) {
    return ['Prozesskern aus dem Material filtern', 'Signal- und Zusatzmaterial getrennt behandeln', 'Ergebnis in der Prüfwerkstatt kurz kontrollieren'];
  }
  if (lower.includes('zeitverlauf') || lower.includes('fallgeschichte')) {
    return ['Zeitverlauf in eine Hauptlinie verdichten', 'Rollen und Reibungen lokal ergänzen'];
  }
  if (lower.includes('verfahrensbeschreibung')) {
    return ['Formale Schritte direkt übernehmen', 'Rollen und Systeme aus dem Text ergänzen'];
  }
  if (lower.includes('signal')) {
    return ['Nur ablaufnahe Passagen als Schritte verwenden', 'Rest als Reibungssignal behandeln'];
  }
  return ['Vorsichtige Standardlogik verwenden', 'Ergebnis über Belegstellen prüfen'];
}

function buildNarrativeDerivation(params: {
  blocks: CandidateBlock[];
  sourceName: string;
  sourceType: DerivationInput['sourceType'];
  rawText: string;
  warnings: string[];
  supplementalIssueEvidence?: IssueEvidence[];
  profile: NarrativeDocumentProfile;
  baseConfidence?: 'high' | 'medium' | 'low';
  domainContext?: { primary: DomainKey; secondary?: DomainKey };
  routingContext: SourceRoutingContext;
}): DerivationResult | null {
  const {
    blocks,
    sourceName,
    sourceType,
    rawText,
    warnings,
    supplementalIssueEvidence = [],
    profile,
    baseConfidence = 'medium',
    domainContext,
    routingContext,
  } = params;

  const sourceProfile = buildSourceExtractionPlan(rawText).profile;
  const sourceProfileNote = buildSourceProfileNote(sourceProfile);
  const analysisStrategies = uniqueStrings([...buildAnalysisStrategies(sourceProfile.inputProfileLabel), ...(sourceProfile.extractionPlan ?? [])]).slice(0, 5);
  const supplementalIssueSignals = uniqueStrings(supplementalIssueEvidence.map(entry => entry.label));

  const caseItem = buildCase({
    name: sourceName.replace(/\.[^.]+$/, ''),
    narrative: sliceNarrative(blocks.map(block => `${block.timestampRaw ? `${block.timestampRaw} | ` : ''}${block.title}\n${block.body}`).join('\n\n')),
    rawText,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType,
    inputKind: sourceType === 'narrative' ? 'narrative' : 'document',
    derivedStepLabels: dedupeDerivedSteps(
      blocks
        .filter(block => !isNarrativeMetaBlock(block))
        .map((block, index) => ({
        label: canonicalizeProcessStepLabel({ title: block.title, body: block.body, fallback: block.title, index }),
      })),
    ).map(step => step.label),
    analysisProfileLabel: sourceProfile.inputProfileLabel,
    analysisProfileHint: sourceProfile.extractionFocus,
    analysisStrategies,
    routingContext,
  });

  const narrativeArtifacts = dedupeDerivedSteps(
    blocks
      .filter(block => !isNarrativeMetaBlock(block))
      .map((block, index) => {
        const evidenceAnchor = normalizeWhitespace(`${block.timestampRaw ? `${block.timestampRaw} | ` : ''}${block.title}. ${block.body}`).slice(0, 320);
        const contextWindow = buildContextWindow([block.timestampRaw, block.title, block.body]);
        const normalizedLabel = canonicalizeProcessStepLabel({
          title: block.title,
          body: block.body,
          fallback: block.title,
          index,
        });
        const localRoles = collectLocalRoleLabels({ context: [block.title, block.body] });
        const localSystems = collectLocalSystemLabels({ context: [block.title, block.body] });
        const issueSignals = extractIssueSignals(`${block.title} ${block.body}`, domainContext);
        const stepCandidate = createStepCandidate({
          rawLabel: block.title,
          normalizedLabel,
          evidenceAnchor,
          contextWindow,
          confidence: block.body.length >= 80 ? 'high' : 'medium',
          originChannel: 'narrative-context',
          sourceFragmentType: 'paragraph',
          routingContext,
          sourceRef: buildEvidenceSourceRef(caseItem.id, `narrative-block:${index + 1}`),
          index,
        });
        const extractionCandidates: ExtractionCandidate[] = [
          stepCandidate,
          ...createRoleCandidates({
            labels: localRoles,
            evidenceAnchor,
            contextWindow,
            confidence: stepCandidate.confidence,
            originChannel: stepCandidate.originChannel,
            sourceFragmentType: stepCandidate.sourceFragmentType,
            routingContext,
            sourceRef: stepCandidate.sourceRef ?? buildEvidenceSourceRef(caseItem.id, `narrative-block:${index + 1}`),
            relatedCandidateId: stepCandidate.candidateId,
          }),
          ...createSystemCandidates({
            labels: localSystems,
            evidenceAnchor,
            contextWindow,
            confidence: stepCandidate.confidence,
            originChannel: stepCandidate.originChannel,
            sourceFragmentType: stepCandidate.sourceFragmentType,
            routingContext,
            sourceRef: stepCandidate.sourceRef ?? buildEvidenceSourceRef(caseItem.id, `narrative-block:${index + 1}`),
            relatedCandidateId: stepCandidate.candidateId,
          }),
          ...issueSignals.map((signal, signalIndex) => createSupportCandidate({
            candidateType: 'signal',
            rawLabel: signal,
            evidenceAnchor,
            contextWindow,
            confidence: 'medium',
            originChannel: 'narrative-context',
            sourceFragmentType: 'paragraph',
            routingContext,
            sourceRef: buildEvidenceSourceRef(caseItem.id, `narrative-block:${index + 1}:signal:${signalIndex + 1}`),
            relatedCandidateId: stepCandidate.candidateId,
          })),
        ];
        return {
          label: normalizedLabel,
          role: localRoles[0],
          evidenceSnippet: stepCandidate.evidenceAnchor,
          timestampRaw: block.timestampRaw,
          systems: localSystems,
          issueSignals,
          stepCandidate,
          extractionCandidates,
        };
      })
      .filter(step => step.label && step.label.length >= 4),
  );

  if (narrativeArtifacts.length < 2) return null;

  const observations = narrativeArtifacts.map((step, index) => createObservationFromStepCandidate({
    candidate: step.stepCandidate,
    caseId: caseItem.id,
    sequenceIndex: index,
    role: step.role,
    system: step.systems?.[0],
    timestampRaw: step.timestampRaw,
    timestampQuality: step.timestampRaw ? 'synthetic' : 'missing',
  }));

  const extractionCandidates = narrativeArtifacts.flatMap(step => step.extractionCandidates);
  const roles = uniqueStrings(narrativeArtifacts.map(step => step.role));
  const systems = uniqueStrings(narrativeArtifacts.flatMap(step => step.systems ?? []));
  const issueSignals = uniqueStrings([
    ...narrativeArtifacts.flatMap(step => step.issueSignals ?? []),
    ...supplementalIssueSignals,
  ]);

  const narrativeIssueEvidence = dedupeIssueEvidence([
    ...narrativeArtifacts.flatMap(step => (step.issueSignals ?? []).map(signal => ({ label: signal, snippet: step.evidenceSnippet ?? signal }))),
    ...supplementalIssueEvidence,
  ]);

  const familyHits = narrativeArtifacts.filter(step => inferStepFamily(step.label)).length;
  const confidence: 'high' | 'medium' | 'low' =
    baseConfidence === 'high' || familyHits >= Math.max(3, Math.ceil(narrativeArtifacts.length * 0.6))
      ? 'high'
      : narrativeArtifacts.length >= MIN_USEFUL_STEPS
      ? 'medium'
      : 'low';

  const analysisMode: ProcessMiningAnalysisMode = 'process-draft';
  const summaryNote = buildNarrativeDocumentNote(profile);
  const documentSummary = [
    buildAnalysisModeNotice({ mode: analysisMode, caseCount: 1, documentKind: 'case-narrative' }),
    summaryNote,
    sourceProfileNote,
    issueSignals.length > 0 ? `Wichtige Reibungssignale: ${issueSignals.slice(0, 3).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'narrative-fallback',
    documentKind: 'case-narrative',
    analysisMode,
    caseCount: 1,
    observationCount: observations.filter(observation => observation.kind === 'step').length,
    warnings,
    confidence,
    stepLabels: narrativeArtifacts.map(step => step.label),
    roles,
    systems,
    issueSignals,
    issueEvidence: narrativeIssueEvidence,
    documentSummary,
    sourceProfile,
    routingContext,
    extractionCandidates,
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };

  return {
    cases: [caseItem],
    observations,
    method: 'narrative-fallback',
    documentKind: 'case-narrative',
    warnings,
    confidence,
    derivedSteps: narrativeArtifacts.map(step => ({ label: step.label, role: step.role, evidenceSnippet: step.evidenceSnippet })),
    roles,
    systems,
    issueSignals,
    summary,
    routingContext,
    extractionCandidates,
  };
}

function supportLabelForMixedSection(section: MixedDocumentSection): string {
  switch (section.kind) {
    case 'table':
      return section.title || 'Signaltabelle';
    case 'governance-note':
      return section.title || 'Governance-Hinweis';
    case 'question':
      return section.title || 'Offene Fragen';
    case 'quote':
      return section.title || 'Zitat oder Besprechungsausschnitt';
    case 'review-note':
      return section.title || 'Review-Notiz';
    default:
      return section.title || 'Prozesskern';
  }
}

function buildMixedDocumentDerivation(params: {
  sourceName: string;
  sourceType: DerivationInput['sourceType'];
  rawText: string;
  warnings: string[];
  supplementalIssueEvidence?: IssueEvidence[];
  domainContext?: { primary: DomainKey; secondary?: DomainKey };
  routingContext: SourceRoutingContext;
}): DerivationResult | null {
  const {
    sourceName,
    sourceType,
    rawText,
    warnings,
    supplementalIssueEvidence = [],
    domainContext,
    routingContext,
  } = params;

  const sections = splitMixedDocumentSections(rawText);
  if (sections.length < 2) return null;

  const processSections = sections.filter(section => section.kind === 'process-core');
  const processBlocks: CandidateBlock[] = [];
  const seenProcessKeys = new Set<string>();
  processSections
    .flatMap(section => extractProcessBlocksFromMixedSection(section))
    .forEach((block, index) => {
      const canonical = canonicalizeProcessStepLabel({ title: block.title, body: block.body, fallback: block.title, index });
      const key = stepSemanticKey(canonical);
      if (seenProcessKeys.has(key)) return;
      seenProcessKeys.add(key);
      processBlocks.push(block);
    });
  if (processBlocks.length < 2) return null;

  const baseSourceProfile = buildSourceExtractionPlan(rawText).profile;
  const segmentSummary = buildMixedDocumentSegmentSummary(sections);
  const sourceProfile = {
    ...baseSourceProfile,
    inputProfile: 'mixed-process-document' as const,
    inputProfileLabel: 'Mischdokument mit Prozesskern',
    documentClass: 'mixed-document' as const,
    documentClassLabel: 'Mischdokument',
    classificationReasons: uniqueStrings([
      ...(baseSourceProfile.classificationReasons ?? []),
      'Mischdokumentpfad trennt Prozesskern, Fragen, Review-Notizen, Tabellen und Governance explizit.',
      `${segmentSummary.counts['process-core']} Kernsegmente, ${segmentSummary.counts['review-note']} Review-Segmente, ${segmentSummary.counts.table} Tabellen- oder Signal-Segmente, ${segmentSummary.counts['governance-note']} Governance-Hinweise erkannt.`,
    ]),
    supportParagraphCount: Math.max(baseSourceProfile.supportParagraphCount ?? 0, sections.length - processSections.length),
    evidenceParagraphCount: Math.max(baseSourceProfile.evidenceParagraphCount ?? 0, sections.length),
    extractionPlan: uniqueStrings([
      ...(baseSourceProfile.extractionPlan ?? []),
      'Mischdokumente über Segmenttypen statt rein narrativ verdichten',
      'Prozesskern und Review-/Governance-Segmente strikt trennen',
    ]),
  };
  const sourceProfileNote = buildSourceProfileNote(sourceProfile);
  const analysisStrategies = uniqueStrings([
    ...buildAnalysisStrategies(sourceProfile.inputProfileLabel),
    ...(sourceProfile.extractionPlan ?? []),
  ]).slice(0, 5);

  const caseItem = buildCase({
    name: sourceName.replace(/\.[^.]+$/, ''),
    narrative: sliceNarrative(rawText),
    rawText,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType,
    inputKind: sourceType === 'narrative' ? 'narrative' : 'document',
    derivedStepLabels: processBlocks.map((block, index) => canonicalizeProcessStepLabel({ title: block.title, body: block.body, fallback: block.title, index })),
    analysisProfileLabel: sourceProfile.inputProfileLabel,
    analysisProfileHint: sourceProfile.extractionFocus,
    analysisStrategies,
    routingContext,
  });

  const stepArtifacts = dedupeDerivedSteps(
    processBlocks.map((block, index) => {
      const evidenceAnchor = normalizeWhitespace(`${block.title}. ${block.body}`).slice(0, 320);
      const contextWindow = buildContextWindow([block.title, block.body]);
      const normalizedLabel = canonicalizeProcessStepLabel({
        title: block.title,
        body: block.body,
        fallback: block.title,
        index,
      });
      const localRoles = collectLocalRoleLabels({ context: [block.title, block.body] });
      const localSystems = collectLocalSystemLabels({ context: [block.title, block.body] });
      const stepCandidate = createStepCandidate({
        rawLabel: block.title,
        normalizedLabel,
        evidenceAnchor,
        contextWindow,
        confidence: block.body.length >= 48 ? 'high' : 'medium',
        originChannel: 'paragraph',
        sourceFragmentType: 'paragraph',
        routingContext,
        sourceRef: buildEvidenceSourceRef(caseItem.id, `mixed-core:${index + 1}`),
        index,
      });
      const extractionCandidates: ExtractionCandidate[] = [
        stepCandidate,
        ...createRoleCandidates({
          labels: localRoles,
          evidenceAnchor,
          contextWindow,
          confidence: stepCandidate.confidence,
          originChannel: stepCandidate.originChannel,
          sourceFragmentType: stepCandidate.sourceFragmentType,
          routingContext,
          sourceRef: stepCandidate.sourceRef ?? buildEvidenceSourceRef(caseItem.id, `mixed-core:${index + 1}`),
          relatedCandidateId: stepCandidate.candidateId,
        }),
        ...createSystemCandidates({
          labels: localSystems,
          evidenceAnchor,
          contextWindow,
          confidence: stepCandidate.confidence,
          originChannel: stepCandidate.originChannel,
          sourceFragmentType: stepCandidate.sourceFragmentType,
          routingContext,
          sourceRef: stepCandidate.sourceRef ?? buildEvidenceSourceRef(caseItem.id, `mixed-core:${index + 1}`),
          relatedCandidateId: stepCandidate.candidateId,
        }),
      ];
      return {
        label: normalizedLabel,
        evidenceSnippet: evidenceAnchor,
        role: localRoles[0],
        systems: localSystems,
        stepCandidate,
        extractionCandidates,
      };
    }),
  );

  const observations = stepArtifacts.map((step, index) => createObservationFromStepCandidate({
    candidate: step.stepCandidate,
    caseId: caseItem.id,
    sequenceIndex: index,
    role: step.role,
    system: step.systems?.[0],
    timestampQuality: 'missing',
  }));

  const extractionCandidates = stepArtifacts.flatMap(step => step.extractionCandidates);
  const supportSections = sections.filter(section => section.kind !== 'process-core');
  const issueEvidence = dedupeIssueEvidence([
    ...supplementalIssueEvidence,
    ...supportSections.flatMap(section => extractIssueEvidence(`${section.title}\n${section.body}`, domainContext)),
  ]);
  const seenIssueKeys = new Set<string>();

  supportSections.forEach(section => {
    const evidenceAnchor = normalizeWhitespace(`${section.title}. ${section.body}`).slice(0, 320);
    const contextWindow = buildContextWindow([section.title, section.body, section.sourceParagraphKinds.join(', ')]);
    const supportCandidate = createSupportCandidate({
      rawLabel: supportLabelForMixedSection(section),
      normalizedLabel: section.title,
      evidenceAnchor,
      contextWindow,
      confidence: section.kind === 'table' || section.kind === 'governance-note' ? 'medium' : 'low',
      originChannel: section.kind === 'table' ? 'table-row' : 'paragraph',
      sourceFragmentType: section.kind === 'table' ? 'table-row' : 'paragraph',
      routingContext,
      sourceRef: buildEvidenceSourceRef(caseItem.id, section.key),
      supportClass: section.kind === 'governance-note' ? 'governance-note' : 'support-evidence',
      status: 'support-only',
    });
    extractionCandidates.push(supportCandidate);

    const sectionIssues = extractIssueEvidence(`${section.title}\n${section.body}`, domainContext);
    sectionIssues.forEach((entry, issueIndex) => {
      const issueKey = `${normalizeWhitespace(entry.label).toLowerCase()}::${normalizeWhitespace(entry.snippet).toLowerCase()}`;
      if (seenIssueKeys.has(issueKey)) return;
      seenIssueKeys.add(issueKey);
      observations.push(createObservation({
        caseId: caseItem.id,
        label: entry.label,
        evidenceSnippet: entry.snippet,
        kind: 'issue',
        sequenceIndex: processBlocks.length + observations.filter(item => item.kind === 'issue').length,
      }));
      extractionCandidates.push(createSupportCandidate({
        candidateType: 'signal',
        rawLabel: entry.label,
        evidenceAnchor: entry.snippet,
        contextWindow,
        confidence: section.kind === 'table' ? 'medium' : 'low',
        originChannel: section.kind === 'table' ? 'table-row' : 'paragraph',
        sourceFragmentType: section.kind === 'table' ? 'table-row' : 'paragraph',
        routingContext,
        sourceRef: buildEvidenceSourceRef(caseItem.id, `${section.key}:signal:${issueIndex + 1}`),
        relatedCandidateId: supportCandidate.candidateId,
        supportClass: section.kind === 'governance-note' ? 'governance-note' : undefined,
      }));
    });
  });

  const roles = uniqueStrings(stepArtifacts.map(step => step.role));
  const systems = uniqueStrings(stepArtifacts.flatMap(step => step.systems ?? []));
  const issueSignals = uniqueStrings(issueEvidence.map(entry => entry.label));

  const documentSummary = [
    buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'mixed-document' }),
    `Mischdokumentpfad aktiv: ${segmentSummary.counts['process-core']} Prozesskern-Segmente werden in Schritte verdichtet; ${segmentSummary.counts.table} Tabellen-/Signalschichten, ${segmentSummary.counts['review-note']} Review-Notizen, ${segmentSummary.counts.question} Fragen und ${segmentSummary.counts['governance-note']} Governance-Hinweise bleiben als Stützmaterial erhalten.`,
    sourceProfileNote,
    issueSignals.length > 0 ? `Wichtige Reibungssignale: ${issueSignals.slice(0, 3).join(', ')}.` : '',
  ].filter(Boolean).join(' ').trim();

  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'narrative-fallback',
    documentKind: 'mixed-document',
    analysisMode: 'process-draft',
    caseCount: 1,
    observationCount: observations.filter(observation => observation.kind === 'step').length,
    warnings,
    confidence: stepArtifacts.length >= 4 ? 'high' : 'medium',
    stepLabels: stepArtifacts.map(step => step.label),
    roles,
    systems,
    issueSignals,
    issueEvidence,
    documentSummary,
    sourceProfile,
    routingContext,
    extractionCandidates,
    mixedDocumentSegments: segmentSummary,
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };

  return {
    cases: [caseItem],
    observations,
    method: 'narrative-fallback',
    documentKind: 'mixed-document',
    warnings,
    confidence: summary.confidence,
    derivedSteps: stepArtifacts.map(step => ({ label: step.label, role: step.role, evidenceSnippet: step.evidenceSnippet })),
    roles,
    systems,
    issueSignals,
    summary,
    routingContext,
    extractionCandidates,
  };
}

function buildStructuredDerivation(params: {
  steps: StructuredProcedureStep[];
  roles: string[];
  warnings: string[];
  title?: string;
  sourceName: string;
  sourceType: DerivationInput['sourceType'];
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
  documentKind?: ProcessDocumentType;
  domainContext?: { primary: DomainKey; secondary?: DomainKey };
  routingContext: SourceRoutingContext;
}): DerivationResult {
  const {
    steps,
    roles,
    warnings,
    title,
    sourceName,
    sourceType,
    rawText,
    confidence,
    documentKind = 'procedure-document',
    domainContext,
    routingContext,
  } = params;
  const sourceProfile = buildSourceExtractionPlan(rawText).profile;
  const sourceProfileNote = buildSourceProfileNote(sourceProfile);
  const analysisStrategies = uniqueStrings([...buildAnalysisStrategies(sourceProfile.inputProfileLabel), ...(sourceProfile.extractionPlan ?? [])]).slice(0, 5);
  const caseItem = buildCase({
    name: title ?? sourceName.replace(/\.[^.]+$/, ''),
    narrative: sliceNarrative(rawText),
    rawText,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType,
    inputKind: sourceType === 'narrative' ? 'narrative' : 'document',
    derivedStepLabels: steps.map(step => step.label),
    analysisProfileLabel: sourceProfile.inputProfileLabel,
    analysisProfileHint: sourceProfile.extractionFocus,
    analysisStrategies,
    routingContext,
  });
  const structuredArtifacts = buildStructuredStepArtifacts(caseItem.id, steps, routingContext);
  const issueEvidence = extractIssueEvidence(rawText, domainContext);
  const issueSignals = uniqueStrings(issueEvidence.map(entry => entry.label));
  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'structured',
    documentKind,
    analysisMode: 'process-draft',
    caseCount: 1,
    observationCount: structuredArtifacts.observations.length,
    warnings,
    confidence,
    stepLabels: structuredArtifacts.derivedSteps.map(step => step.label),
    roles: uniqueStrings([...roles, ...structuredArtifacts.roles]),
    systems: structuredArtifacts.systems,
    issueSignals,
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind })} ${sourceProfileNote}`.trim(),
    sourceProfile,
    routingContext,
    issueEvidence,
    extractionCandidates: structuredArtifacts.extractionCandidates,
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };
  return {
    cases: [caseItem],
    observations: structuredArtifacts.observations,
    method: 'structured',
    documentKind,
    warnings,
    confidence,
    derivedSteps: structuredArtifacts.derivedSteps,
    roles: uniqueStrings([...roles, ...structuredArtifacts.roles]),
    systems: structuredArtifacts.systems,
    issueSignals,
    summary,
    routingContext,
    extractionCandidates: structuredArtifacts.extractionCandidates,
  };
}

function buildSemiStructuredDerivation(params: {
  steps: SemiStructuredProcedureStep[];
  roles: string[];
  warnings: string[];
  title?: string;
  sourceName: string;
  sourceType: DerivationInput['sourceType'];
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
  domainContext?: { primary: DomainKey; secondary?: DomainKey };
  routingContext: SourceRoutingContext;
}): DerivationResult {
  const { steps, roles, warnings, title, sourceName, sourceType, rawText, confidence, domainContext, routingContext } = params;
  const sourceProfile = buildSourceExtractionPlan(rawText).profile;
  const sourceProfileNote = buildSourceProfileNote(sourceProfile);
  const analysisStrategies = uniqueStrings([...buildAnalysisStrategies(sourceProfile.inputProfileLabel), ...(sourceProfile.extractionPlan ?? [])]).slice(0, 5);
  const caseItem = buildCase({
    name: title ?? sourceName.replace(/\.[^.]+$/, ''),
    narrative: sliceNarrative(rawText),
    rawText,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType,
    inputKind: sourceType === 'narrative' ? 'narrative' : 'document',
    derivedStepLabels: steps.map((step, index) => canonicalizeProcessStepLabel({ title: step.label, body: step.description || step.evidenceSnippet, fallback: step.label, index })),
    analysisProfileLabel: sourceProfile.inputProfileLabel,
    analysisProfileHint: sourceProfile.extractionFocus,
    analysisStrategies,
    routingContext,
  });
  const semiStructuredArtifacts = buildSemiStructuredStepArtifacts(caseItem.id, steps, routingContext);
  const issueEvidence = extractIssueEvidence(rawText, domainContext);
  const issueSignals = uniqueStrings(issueEvidence.map(entry => entry.label));
  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'semi-structured',
    documentKind: 'semi-structured-procedure-document',
    analysisMode: 'process-draft',
    caseCount: 1,
    observationCount: semiStructuredArtifacts.observations.length,
    warnings,
    confidence,
    stepLabels: semiStructuredArtifacts.derivedSteps.map(step => step.label),
    roles: uniqueStrings([...roles, ...semiStructuredArtifacts.roles]),
    systems: semiStructuredArtifacts.systems,
    issueSignals,
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'semi-structured-procedure-document' })} ${sourceProfileNote}`.trim(),
    sourceProfile,
    routingContext,
    issueEvidence,
    extractionCandidates: semiStructuredArtifacts.extractionCandidates,
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };
  return {
    cases: [caseItem],
    observations: semiStructuredArtifacts.observations,
    method: 'semi-structured',
    documentKind: 'semi-structured-procedure-document',
    warnings,
    confidence,
    derivedSteps: semiStructuredArtifacts.derivedSteps,
    roles: uniqueStrings([...roles, ...semiStructuredArtifacts.roles]),
    systems: semiStructuredArtifacts.systems,
    issueSignals,
    summary,
    routingContext,
    extractionCandidates: semiStructuredArtifacts.extractionCandidates,
  };
}

function buildEmptyResult(
  sourceName: string,
  sourceType: DerivationInput['sourceType'],
  text: string,
  warning: string,
  routingContext: SourceRoutingContext,
): DerivationResult {
  const sourceProfile = buildSourceExtractionPlan(text).profile;
  const caseItem = buildCase({
    name: sourceName,
    narrative: sliceNarrative(text),
    rawText: text,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType,
    inputKind: sourceType === 'narrative' ? 'narrative' : 'document',
    analysisProfileLabel: sourceProfile.inputProfileLabel,
    analysisProfileHint: sourceProfile.extractionFocus,
    analysisStrategies: buildAnalysisStrategies(sourceProfile.inputProfileLabel),
    routingContext,
  });
  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'narrative-fallback',
    documentKind: 'unknown',
    analysisMode: 'process-draft',
    caseCount: 1,
    observationCount: 0,
    warnings: [warning],
    confidence: 'low',
    stepLabels: [],
    roles: [],
    systems: [],
    issueSignals: [],
    issueEvidence: [],
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'unknown' })} ${buildSourceProfileNote(sourceProfile)}`.trim(),
    sourceProfile,
    routingContext,
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };
  return {
    cases: [caseItem],
    observations: [],
    method: 'narrative-fallback',
    documentKind: 'unknown',
    warnings: [warning],
    confidence: 'low',
    derivedSteps: [],
    roles: [],
    systems: [],
    issueSignals: [],
    summary,
    routingContext,
  };
}

function buildExtractionCandidates(
  observations: ProcessMiningObservation[],
  routingContext: SourceRoutingContext,
  seedCandidates: ExtractionCandidate[] = [],
  issueEvidence: IssueEvidence[] = [],
): ExtractionCandidate[] {
  const seedCandidateById = new Map(seedCandidates.map(candidate => [candidate.candidateId, candidate]));
  const representedSeedIds = new Set<string>();
  const candidates: ExtractionCandidate[] = [];
  for (const observation of observations) {
    const seed = observation.candidateId ? seedCandidateById.get(observation.candidateId) : undefined;
    if (observation.candidateId) representedSeedIds.add(observation.candidateId);

    const evidenceAnchor = normalizeWhitespace(observation.evidenceAnchor ?? observation.evidenceSnippet ?? seed?.evidenceAnchor ?? observation.label).slice(0, 320);
    const contextWindow = normalizeWhitespace(
      observation.contextWindow
      ?? seed?.contextWindow
      ?? buildContextWindow([observation.label, observation.evidenceSnippet]),
    ).slice(0, 320);
    const originChannel = observation.originChannel ?? seed?.originChannel ?? 'imported-observation';
    const sourceFragmentType = observation.sourceFragmentType
      ?? seed?.sourceFragmentType
      ?? (evidenceAnchor.includes('|') ? 'table-row' : 'sentence');

    if (observation.kind === 'step') {
      const stepCandidateId = `${observation.id}:step`;
      candidates.push({
        candidateId: stepCandidateId,
        candidateType: 'step',
        rawLabel: observation.label,
        normalizedLabel: canonicalizeProcessStepLabel({
          title: observation.label,
          body: evidenceAnchor || contextWindow,
          fallback: observation.label,
          index: observation.sequenceIndex,
        }),
        evidenceAnchor: evidenceAnchor || observation.label,
        contextWindow,
        confidence: seed?.confidence ?? (evidenceAnchor.length >= 24 ? 'medium' : 'low'),
        originChannel,
        sourceFragmentType,
        routingClass: routingContext.routingClass,
        sourceRef: observation.id,
        status: 'candidate',
        supportClass: seed?.supportClass,
      });

      if (observation.role) {
        candidates.push(...createRoleCandidates({
          labels: [observation.role],
          evidenceAnchor: evidenceAnchor || observation.role,
          contextWindow,
          confidence: seed?.confidence ?? 'medium',
          originChannel,
          sourceFragmentType,
          routingContext,
          sourceRef: observation.id,
          relatedCandidateId: stepCandidateId,
        }));
      }

      if (observation.system) {
        candidates.push(...createSystemCandidates({
          labels: [observation.system],
          evidenceAnchor: evidenceAnchor || observation.system,
          contextWindow,
          confidence: seed?.confidence ?? 'medium',
          originChannel,
          sourceFragmentType,
          routingContext,
          sourceRef: observation.id,
          relatedCandidateId: stepCandidateId,
        }));
      }
      continue;
    }

    candidates.push(createSupportCandidate({
      candidateType: observation.kind === 'issue' ? 'signal' : 'support',
      rawLabel: observation.label,
      evidenceAnchor: evidenceAnchor || observation.label,
      contextWindow,
      confidence: seed?.confidence ?? 'low',
      originChannel,
      sourceFragmentType,
      routingContext,
      sourceRef: observation.id,
      supportClass: seed?.supportClass,
    }));
  }

  issueEvidence.forEach((entry, index) => {
    candidates.push(createSupportCandidate({
      candidateType: 'signal',
      rawLabel: entry.label,
      evidenceAnchor: entry.snippet,
      contextWindow: buildContextWindow([entry.label, entry.snippet]),
      confidence: 'medium',
      originChannel: 'paragraph',
      sourceFragmentType: 'paragraph',
      routingContext,
      sourceRef: `issue-evidence:${index + 1}`,
    }));
  });

  seedCandidates.forEach(candidate => {
    if (representedSeedIds.has(candidate.candidateId)) return;
    if (candidate.relatedCandidateId && representedSeedIds.has(candidate.relatedCandidateId)) return;
    candidates.push(candidate);
  });

  return reviewExtractionCandidates(candidates);
}

function finalizeDerivationResult(result: DerivationResult): DerivationResult {
  const repaired = repairDerivedObservations(result.observations);
  const candidates = buildExtractionCandidates(
    repaired.observations,
    result.routingContext,
    result.extractionCandidates ?? [],
    result.summary.issueEvidence ?? [],
  );
  const candidateReview = buildExtractionCandidateReview(candidates);
  const acceptedStepIds = new Set(
    candidates
      .filter(candidate => candidate.candidateType === 'step' && candidate.status === 'merged')
      .map(candidate => candidate.sourceRef)
      .filter(Boolean),
  );
  const gatedObservations = repaired.observations.filter(observation => (
    observation.kind !== 'step' || acceptedStepIds.has(observation.id)
  ));
  const rawText = normalizeWhitespace(
    result.cases
      .map(caseItem => caseItem.rawText ?? caseItem.narrative ?? '')
      .join('\n\n'),
  );
  const provisionalStepLabels = uniqueStrings(
    gatedObservations
      .filter(observation => observation.kind === 'step')
      .map(observation => observation.label),
  );
  const provisionalRoles = uniqueStrings([
    ...candidates
      .filter(candidate => candidate.candidateType === 'role' && candidate.status !== 'support-only' && Boolean(candidate.relatedCandidateId))
      .map(candidate => candidate.normalizedLabel),
    ...gatedObservations.map(observation => (observation.role ? rolePreferredValue(observation.role) : undefined)),
  ]);
  const provisionalSystems = uniqueStrings([
    ...candidates
      .filter(candidate => candidate.candidateType === 'system' && candidate.status !== 'support-only' && Boolean(candidate.relatedCandidateId))
      .map(candidate => candidate.normalizedLabel),
    ...gatedObservations.map(observation => (observation.system ? systemPreferredValue(observation.system) : undefined)),
  ]);
  const domainIsolation = detectDomainIsolation({
    text: rawText,
    stepLabels: provisionalStepLabels,
    roles: provisionalRoles,
    systems: provisionalSystems,
    fileHints: result.cases.map(caseItem => `${caseItem.name} ${caseItem.sourceNote ?? ''}`).join(' '),
    sourceProfile: result.summary.sourceProfile,
  });
  const issueEvidenceSource = dedupeIssueEvidence([
    ...(result.summary.issueEvidence ?? []),
    ...gatedObservations
      .filter(observation => observation.kind === 'issue')
      .map(observation => ({
        label: observation.label,
        snippet: observation.evidenceSnippet ?? observation.label,
      })),
  ]);
  const { kept: keptIssueEvidence, droppedLabels } = filterIssueEvidenceByDomain({
    issueEvidence: issueEvidenceSource,
    rawText,
    domainResult: domainIsolation,
  });
  const keptIssueLabels = new Set(keptIssueEvidence.map(entry => entry.label));
  const filteredSupportObservations = gatedObservations
    .filter(observation => observation.kind !== 'issue')
    .map(observation => {
      const normalizedRole = observation.role ? rolePreferredValue(observation.role) : undefined;
      const normalizedSystem = observation.system ? systemPreferredValue(observation.system) : undefined;
      return {
        ...observation,
        role:
          normalizedRole && filterRolesByDomain([normalizedRole], domainIsolation).length > 0
            ? normalizedRole
            : undefined,
        system:
          normalizedSystem && filterSystemsByDomain([normalizedSystem], domainIsolation).length > 0
            ? normalizedSystem
            : undefined,
      };
    });
  const filteredIssueObservations = gatedObservations.filter(
    observation => observation.kind === 'issue' && keptIssueLabels.has(observation.label),
  );
  const filteredObservations = [...filteredSupportObservations, ...filteredIssueObservations];
  const stepLabels = uniqueStrings(
    filteredObservations
      .filter(observation => observation.kind === 'step')
      .map(observation => observation.label),
  );
  const roles = filterRolesByDomain(
    uniqueStrings([
      ...filteredSupportObservations.map(observation => observation.role),
    ]),
    domainIsolation,
  );
  const systems = filterSystemsByDomain(
    uniqueStrings([
      ...filteredSupportObservations.map(observation => observation.system),
    ]),
    domainIsolation,
  );
  const issueSignals = uniqueStrings(keptIssueEvidence.map(entry => entry.label));
  const droppedRoleLabels = provisionalRoles.filter(label => label && !roles.includes(label));
  const droppedSystemLabels = provisionalSystems.filter(label => label && !systems.includes(label));
  const domainNotes = [
    domainIsolation.note,
    droppedLabels.length > 0 ? `Fachfremde Signale ausgeblendet: ${droppedLabels.join(', ')}.` : undefined,
    droppedRoleLabels.length > 0 ? `Domänenfremde Rollen ausgeblendet: ${droppedRoleLabels.join(', ')}.` : undefined,
    droppedSystemLabels.length > 0 ? `Domänenfremde Systeme ausgeblendet: ${droppedSystemLabels.join(', ')}.` : undefined,
  ].filter((value): value is string => Boolean(value));
  const repairNotes = uniqueStrings([
    ...(repaired.report.notes.length > 0 ? repaired.report.notes : result.summary.repairNotes ?? []),
    ...domainNotes,
  ]);

  const sourceProfile = result.summary.sourceProfile
    ? {
        ...result.summary.sourceProfile,
        primaryDomainKey: domainIsolation.primaryDomainKey,
        primaryDomainLabel: domainIsolation.primaryDomainLabel,
        secondaryDomainKeys: domainIsolation.secondaryDomainKeys,
        secondaryDomainLabels: domainIsolation.secondaryDomainLabels,
        domainGateNote: domainIsolation.note,
        domainScores: domainIsolation.scoreBoard,
        domainGateSuppressedSignals: droppedLabels,
        domainGateSuppressedRoles: uniqueStrings(droppedRoleLabels),
        domainGateSuppressedSystems: uniqueStrings(droppedSystemLabels),
        classificationReasons: uniqueStrings([
          ...(result.summary.sourceProfile.classificationReasons ?? []),
          ...(domainIsolation.note ? [domainIsolation.note] : []),
          droppedLabels.length > 0 ? 'Fachfremde Signalsätze werden nur bei starker Evidenz übernommen' : '',
        ]).filter(Boolean),
      }
    : result.summary.sourceProfile;

  const multiCaseSummary = buildMultiCaseSummary(filteredObservations);
  const analysisStrategies = sourceProfile
    ? uniqueStrings([
        ...buildAnalysisStrategies(sourceProfile.inputProfileLabel),
        ...(sourceProfile.extractionPlan ?? []),
      ]).slice(0, 5)
    : undefined;
  const caseCount = Math.max(result.summary.caseCount, result.cases.length);
  const lowEvidence = stepLabels.length < 3 || result.documentKind === 'weak-material' || result.documentKind === 'unknown';
  const forceConservative = caseCount <= 1 && lowEvidence;
  const finalConfidence: DerivationSummary['confidence'] = forceConservative
    ? 'low'
    : result.summary.confidence;
  const conservativeWarning = forceConservative
    ? 'Konservative Auswertung aktiv: Datenbasis ist schwach, daher werden Ergebnisse nur als vorläufiger Prozessentwurf ausgewiesen.'
    : undefined;
  const finalWarnings = uniqueStrings([
    ...result.warnings,
    ...result.summary.warnings,
    conservativeWarning,
  ]);
  const documentSummary = uniqueStrings([
    result.summary.documentSummary ?? '',
    ...domainNotes,
  ]).join(' ').trim();
  const finalDocumentSummary = [
    forceConservative
      ? 'Vorläufiger Prozessentwurf mit erhöhter Unsicherheit.'
      : '',
    documentSummary,
  ].filter(Boolean).join(' ');

  return {
    ...result,
    cases: result.cases.map(caseItem => ({
      ...caseItem,
      derivedStepLabels: stepLabels.length > 0 ? stepLabels : caseItem.derivedStepLabels,
      analysisProfileLabel: sourceProfile?.inputProfileLabel ?? caseItem.analysisProfileLabel,
      analysisProfileHint: sourceProfile?.extractionFocus ?? caseItem.analysisProfileHint,
      analysisStrategies: analysisStrategies ?? caseItem.analysisStrategies,
      routingContext: result.routingContext ?? caseItem.routingContext,
      updatedAt: new Date().toISOString(),
    })),
    observations: filteredObservations,
    roles,
    systems,
    issueSignals,
    derivedSteps: filteredObservations
      .filter(observation => observation.kind === 'step')
      .map(observation => ({
        label: observation.label,
        role: observation.role,
        evidenceSnippet: observation.evidenceSnippet,
      })),
    summary: {
      ...result.summary,
      observationCount: filteredObservations.length,
      stepLabels,
      warnings: finalWarnings,
      confidence: finalConfidence,
      roles,
      systems,
      issueSignals,
      issueEvidence: keptIssueEvidence,
      documentSummary: finalDocumentSummary,
      routingContext: result.routingContext,
      repairNotes,
      sourceProfile,
      multiCaseSummary,
      extractionCandidates: candidates,
      candidateReview,
      engineVersion: ENGINE_VERSION,
      updatedAt: new Date().toISOString(),
    },
    warnings: finalWarnings,
    confidence: finalConfidence,
    extractionCandidates: candidates,
  };
}

export function deriveProcessArtifactsFromText(input: DerivationInput): DerivationResult {
  const rawText = cleanInputText(input.text);
  const sourceName = getSourceName(input.fileName, input.sourceType);
  const routingContext = routeSourceMaterial({ text: rawText, sourceType: input.sourceType });
  const profile = profileNarrativeDocument(rawText);
  const structureClassification = classifyDocumentStructure(rawText);
  const classifiedDocumentKind = mapClassifierToDocumentKind(structureClassification.classType);

  if (rawText.length < 20) {
    return finalizeDerivationResult(
      buildEmptyResult(
        sourceName,
        input.sourceType,
        rawText,
        'Text zu kurz oder leer — keine Schritte erkennbar.',
        routingContext,
      ),
    );
  }

  const warnings: string[] = [];
  if (profile.isMixed) {
    warnings.push('Mischdokument erkannt — Prozessschritte werden vor allem aus der eigentlichen Fallgeschichte oder Zeitleiste abgeleitet. Tabellen, KI-Ideen und Testfragen werden nur ergänzend genutzt.');
  }
  warnings.push(
    `Quellen-Router: ${routingContext.routingClass} (${routingContext.routingConfidence}) · Signale: ${routingContext.routingSignals.slice(0, 4).join(', ')}.`,
  );
  if (routingContext.fallbackReason) {
    warnings.push(`Router-Fallback: ${routingContext.fallbackReason}`);
  }
  warnings.push(`Dokumentklassifikation: ${structureClassification.classType} (${structureClassification.confidence}). ${structureClassification.reasons.slice(0, 2).join(' ')}`.trim());
  const domainContext = detectDomainContext(rawText);
  if (domainContext.primary !== 'generic') {
    warnings.push(`Primärdomäne erkannt: ${domainContext.primary}${domainContext.secondary ? `, Sekundärdomäne: ${domainContext.secondary}` : ''}.`);
  }

  const supplementalIssueEvidence = extractIssueEvidence(rawText, domainContext);
  const supplementalIssueSignals = uniqueStrings(supplementalIssueEvidence.map(entry => entry.label));
  const storyBlocks = extractTimelineBlocks(rawText);
  const derivedSourceProfile = buildSourceExtractionPlan(rawText).profile;
  const preferredPath = routingContext.routingClass;
  const allowStructuredFirst = preferredPath === 'structured-procedure';
  const allowSemiStructuredFirst = preferredPath === 'semi-structured-procedure';
  const allowNarrativeFirst = preferredPath === 'narrative-case';
  const allowMixedPath = preferredPath === 'mixed-document';
  const allowDedicatedMixedPath = allowMixedPath || derivedSourceProfile.documentClass === 'mixed-document' || derivedSourceProfile.inputProfile === 'mixed-process-document';
  const forceDefensiveFallback = preferredPath === 'weak-raw-table' || preferredPath === 'eventlog-table';

  if (preferredPath === 'eventlog-table') {
    warnings.push('Quellen-Router erkennt tabellarisches Ereignismaterial. Außerhalb des Tabellenimports bleibt dieser Pfad bewusst defensiv.');
  }

  if (!forceDefensiveFallback && allowDedicatedMixedPath) {
    const mixedResult = buildMixedDocumentDerivation({
      sourceName,
      sourceType: input.sourceType,
      rawText,
      warnings: uniqueStrings([...warnings, 'Dedizierter Mischdokument-Pfad verwendet.']),
      supplementalIssueEvidence,
      domainContext,
      routingContext,
    });
    if (mixedResult) {
      mixedResult.issueSignals = uniqueStrings([...mixedResult.issueSignals, ...supplementalIssueSignals]);
      mixedResult.summary.issueSignals = mixedResult.issueSignals;
      return finalizeDerivationResult(mixedResult);
    }
  }

  if (!forceDefensiveFallback && allowNarrativeFirst && isMostlyNarrative(rawText) && storyBlocks.length >= MIN_USEFUL_STEPS) {
    const narrativeResult = buildNarrativeDerivation({
      blocks: storyBlocks,
      sourceName,
      sourceType: input.sourceType,
      rawText,
      warnings,
      supplementalIssueEvidence,
      profile,
      baseConfidence: storyBlocks.length >= 5 ? 'high' : 'medium',
      domainContext,
      routingContext,
    });
    if (narrativeResult) {
      narrativeResult.issueSignals = uniqueStrings([...narrativeResult.issueSignals, ...supplementalIssueSignals]);
      narrativeResult.summary.issueSignals = narrativeResult.issueSignals;
      return finalizeDerivationResult(narrativeResult);
    }
  }

  if (!forceDefensiveFallback && (allowStructuredFirst || allowMixedPath)) {
    for (const candidateText of candidateTexts(rawText, sourceName)) {
      const structured = extractStructuredProcedureFromText(sourceName, candidateText);
      if (structured && structured.steps.length >= MIN_USEFUL_STEPS) {
        return finalizeDerivationResult(buildStructuredDerivation({
          steps: structured.steps,
          roles: uniqueStrings([...structured.roles.map(role => role.name), ...structured.steps.map(step => step.responsible)]),
          warnings: uniqueStrings([...structured.warnings, ...warnings]),
          title: structured.title,
          sourceName,
          sourceType: input.sourceType,
          rawText,
          confidence: 'high',
          documentKind: classifiedDocumentKind === 'semi-structured-procedure-document'
            ? 'semi-structured-procedure-document'
            : 'procedure-document',
          domainContext,
          routingContext,
        }));
      }
    }
  }

  if (!forceDefensiveFallback && (allowSemiStructuredFirst || allowMixedPath || allowStructuredFirst)) {
    for (const candidateText of candidateTexts(rawText, sourceName)) {
      const semiStructured = extractSemiStructuredProcedureFromText(sourceName, candidateText);
      if (semiStructured && semiStructured.steps.length >= MIN_USEFUL_STEPS) {
        return finalizeDerivationResult(buildSemiStructuredDerivation({
          steps: semiStructured.steps,
          roles: uniqueStrings([...semiStructured.roles, ...semiStructured.steps.map(step => step.responsible)]),
          warnings: uniqueStrings([...semiStructured.warnings, ...warnings]),
          title: semiStructured.title,
          sourceName,
          sourceType: input.sourceType,
          rawText,
          confidence: semiStructured.confidence,
          domainContext,
          routingContext,
        }));
      }
    }
  }

  const paragraphBlocks = paragraphBlocksFromText(rawText);
  if ((preferredPath === 'narrative-case' || preferredPath === 'mixed-document' || preferredPath === 'weak-raw-table') && paragraphBlocks.length >= 2) {
    const narrativeResult = buildNarrativeDerivation({
      blocks: paragraphBlocks,
      sourceName,
      sourceType: input.sourceType,
      rawText,
      warnings: uniqueStrings([...warnings, 'Lokale Narrative-Heuristik verwendet, weil keine klare Verfahrensstruktur erkannt wurde.']),
      supplementalIssueEvidence,
      profile,
      baseConfidence: paragraphBlocks.length >= MIN_USEFUL_STEPS ? 'medium' : 'low',
      domainContext,
      routingContext,
    });
    if (narrativeResult) {
      narrativeResult.issueSignals = uniqueStrings([...narrativeResult.issueSignals, ...supplementalIssueSignals]);
      narrativeResult.summary.issueSignals = narrativeResult.issueSignals;
      return finalizeDerivationResult(narrativeResult);
    }
  }

  warnings.push('Keine belastbare Prozessstruktur erkannt — einfache lokale Satz- und Abschnittslogik wird verwendet.');
  const fallbackSourceProfile = buildSourceExtractionPlan(rawText).profile;
  const fallbackCase = buildCase({
    name: sourceName,
    narrative: sliceNarrative(rawText),
    rawText,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType: input.sourceType,
    inputKind: input.sourceType === 'narrative' ? 'narrative' : 'document',
    analysisProfileLabel: fallbackSourceProfile.inputProfileLabel,
    analysisProfileHint: fallbackSourceProfile.extractionFocus,
    analysisStrategies: uniqueStrings([...buildAnalysisStrategies(fallbackSourceProfile.inputProfileLabel), ...(fallbackSourceProfile.extractionPlan ?? [])]).slice(0, 5),
    routingContext,
  });
  const { observations: fallbackObservations, extractionCandidates: fallbackCandidates } = extractObservationsFromCase(fallbackCase);
  const usableObservations = fallbackObservations.map((observation, index) => ({
    ...observation,
    label: observation.kind === 'step'
      ? canonicalizeProcessStepLabel({ title: observation.label, body: observation.evidenceSnippet, fallback: observation.label, index })
      : observation.label,
  }));
  const fallbackStepObservations = usableObservations.filter(observation => observation.kind === 'step');
  const fallbackIssueEvidence = dedupeIssueEvidence([
    ...extractIssueEvidence(rawText, domainContext),
    ...usableObservations
      .filter(observation => observation.kind === 'issue')
      .map(observation => ({ label: observation.label, snippet: observation.evidenceSnippet ?? observation.label })),
  ]);
  const fallbackIssueSignals = uniqueStrings(fallbackIssueEvidence.map(entry => entry.label));
  const fallbackRoles = uniqueStrings(
    fallbackCandidates
      .filter(candidate => candidate.candidateType === 'role' && Boolean(candidate.relatedCandidateId))
      .map(candidate => candidate.normalizedLabel),
  );
  const fallbackSystems = uniqueStrings(
    fallbackCandidates
      .filter(candidate => candidate.candidateType === 'system' && Boolean(candidate.relatedCandidateId))
      .map(candidate => candidate.normalizedLabel),
  );

  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'narrative-fallback',
    documentKind: classifiedDocumentKind === 'unknown' ? (profile.hasStoryHeading || profile.hasTimeline ? 'case-narrative' : 'unknown') : classifiedDocumentKind,
    analysisMode: 'process-draft',
    caseCount: 1,
    observationCount: fallbackStepObservations.length,
    warnings,
    confidence: 'low',
    stepLabels: fallbackStepObservations.map(observation => observation.label),
    roles: fallbackRoles,
    systems: fallbackSystems,
    issueSignals: fallbackIssueSignals,
    issueEvidence: fallbackIssueEvidence,
    documentSummary: [
      buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: profile.hasStoryHeading || profile.hasTimeline ? 'case-narrative' : 'unknown' }),
      buildNarrativeDocumentNote(profile),
      buildSourceProfileNote(fallbackSourceProfile),
    ].filter(Boolean).join(' '),
    sourceProfile: fallbackSourceProfile,
    routingContext,
    extractionCandidates: fallbackCandidates,
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };
  return finalizeDerivationResult({
    cases: [fallbackCase],
    observations: fallbackStepObservations,
    method: 'narrative-fallback',
    documentKind: classifiedDocumentKind === 'unknown' ? (profile.hasStoryHeading || profile.hasTimeline ? 'case-narrative' : 'unknown') : classifiedDocumentKind,
    warnings,
    confidence: 'low',
    derivedSteps: fallbackStepObservations
      .filter(observation => observation.kind === 'step')
      .map(observation => ({ label: observation.label, evidenceSnippet: observation.evidenceSnippet })),
    roles: fallbackRoles,
    systems: fallbackSystems,
    issueSignals: fallbackIssueSignals,
    summary,
    routingContext,
    extractionCandidates: fallbackCandidates,
  });
}

export function deriveFromMultipleTexts(
  inputs: Array<{ text: string; name: string; sourceType: DerivationInput['sourceType'] }>,
  options?: {
    sourceLabel?: string;
    routingContextOverride?: SourceRoutingContext;
  },
): {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  summaries: DerivationSummary[];
  combinedSummary: DerivationSummary;
  totalSteps: number;
  warnings: string[];
} {
  const cases: ProcessMiningObservationCase[] = [];
  const observations: ProcessMiningObservation[] = [];
  const summaries: DerivationSummary[] = [];
  const warnings: string[] = [];
  let stepCount = 0;

  for (const input of inputs) {
    const result = deriveProcessArtifactsFromText({ text: input.text, fileName: input.name, sourceType: input.sourceType });
    cases.push(...result.cases);
    observations.push(...result.observations);
    summaries.push(result.summary);
    warnings.push(...result.warnings);
    stepCount += result.derivedSteps.length;
  }

  const analysisMode = detectProcessMiningAnalysisMode({ cases, observations });
  const sourceProfile = aggregateSourceProfiles(summaries.map(summary => summary.sourceProfile));
  const multiCaseSummary = buildMultiCaseSummary(observations);
  const aggregatedCandidates = summaries.flatMap(summary => summary.extractionCandidates ?? []);
  const aggregatedCandidateReview = buildExtractionCandidateReview(aggregatedCandidates);
  const routingClasses = summaries.map(summary => summary.routingContext?.routingClass).filter(Boolean) as SourceRoutingContext['routingClass'][];
  const dominantRoutingClass = routingClasses.length > 0
    ? routingClasses.reduce<Record<string, number>>((acc, key) => {
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {})
    : {};
  const routingWinner = Object.entries(dominantRoutingClass).sort((a, b) => b[1] - a[1])[0];
  const aggregatedRoutingSignals = [
    `sources=${inputs.length}`,
    `routingSpread=${uniqueStrings(routingClasses).join(',') || 'none'}`,
    ...(summaries.flatMap(summary => summary.routingContext?.routingSignals ?? []).slice(0, 4)),
  ];
  const combinedRoutingContext: SourceRoutingContext = options?.routingContextOverride
    ? {
        routingClass: options.routingContextOverride.routingClass,
        routingConfidence: options.routingContextOverride.routingConfidence,
        routingSignals: uniqueStrings([
          ...options.routingContextOverride.routingSignals,
          ...aggregatedRoutingSignals,
        ]),
        fallbackReason: options.routingContextOverride.fallbackReason
          ?? summaries.find(summary => summary.routingContext?.fallbackReason)?.routingContext?.fallbackReason,
      }
    : {
        routingClass: (inputs.length > 1 ? 'mixed-document' : (routingWinner?.[0] as SourceRoutingContext['routingClass'] | undefined)) ?? 'weak-raw-table',
        routingConfidence: inputs.length > 1 ? 'medium' : (summaries[0]?.routingContext?.routingConfidence ?? 'low'),
        routingSignals: aggregatedRoutingSignals,
        fallbackReason: summaries.find(summary => summary.routingContext?.fallbackReason)?.routingContext?.fallbackReason,
      };
  const combinedSummary: DerivationSummary = {
    sourceLabel: options?.sourceLabel ?? (inputs.length === 1 ? inputs[0].name : `${inputs.length} importierte Beschreibungen`),
    method: summaries.some(summary => summary.method === 'structured')
      ? 'structured'
      : summaries.some(summary => summary.method === 'semi-structured')
      ? 'semi-structured'
      : 'narrative-fallback',
    documentKind: inputs.length > 1 ? 'mixed-document' : summaries[0]?.documentKind ?? 'unknown',
    analysisMode,
    caseCount: cases.length,
    observationCount: observations.length,
    warnings: uniqueStrings(warnings),
    confidence: cases.length >= 5 || stepCount >= 15 ? 'high' : stepCount >= 6 ? 'medium' : 'low',
    stepLabels: uniqueStrings(observations.filter(observation => observation.kind === 'step').map(observation => observation.label)).slice(0, 20),
    roles: uniqueStrings(summaries.flatMap(summary => summary.roles)),
    systems: uniqueStrings(summaries.flatMap(summary => summary.systems ?? [])),
    issueSignals: uniqueStrings(summaries.flatMap(summary => summary.issueSignals ?? [])),
    issueEvidence: dedupeIssueEvidence(summaries.flatMap(summary => summary.issueEvidence ?? [])),
    documentSummary: [
      buildAnalysisModeNotice({ mode: analysisMode, caseCount: cases.length, documentKind: inputs.length > 1 ? 'case-narrative' : summaries[0]?.documentKind }),
      sourceProfile ? buildSourceProfileNote(sourceProfile) : '',
      multiCaseSummary?.patternNote ?? '',
    ].filter(Boolean).join(' '),
    sourceProfile,
    routingContext: combinedRoutingContext,
    multiCaseSummary,
    extractionCandidates: aggregatedCandidates,
    candidateReview: aggregatedCandidateReview,
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };

  return {
    cases,
    observations,
    summaries,
    combinedSummary,
    totalSteps: stepCount,
    warnings: uniqueStrings(warnings),
  };
}
