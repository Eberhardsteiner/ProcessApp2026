import type {
  DerivationSummary,
  ProcessDocumentType,
  ProcessMiningAnalysisMode,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
  SourceRoutingContext,
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
  ExtractionCandidate,
>>>>>>> theirs
=======
  ExtractionCandidate,
>>>>>>> theirs
=======
  ExtractionCandidate,
>>>>>>> theirs
=======
  ExtractionCandidate,
>>>>>>> theirs
} from '../../domain/process';
import { findDocumentProcessCandidates } from '../../import/documentProcessDiscovery';
import { extractSemiStructuredProcedureFromText } from '../../import/semiStructuredProcedureExtraction';
import type { SemiStructuredProcedureStep } from '../../import/semiStructuredProcedureExtraction';
import { extractStructuredProcedureFromText } from '../../import/structuredProcedureExtraction';
import { classifyDocumentStructure } from '../../import/documentStructureClassifier';
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
import { routeSourceMaterial } from '../../import/sourceRouter';
>>>>>>> theirs
=======
import { routeSourceMaterial } from '../../import/sourceRouter';
>>>>>>> theirs
=======
import { routeSourceMaterial } from '../../import/sourceRouter';
>>>>>>> theirs
=======
import { routeSourceMaterial } from '../../import/sourceRouter';
>>>>>>> theirs
=======
import { routeSourceMaterial } from '../../import/sourceRouter';
>>>>>>> theirs
=======
import { routeSourceMaterial } from '../../import/sourceRouter';
>>>>>>> theirs
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
} from './sourceProfiling';
import { rolePreferredValue, systemPreferredValue } from './reviewNormalization';
import {
  detectDomainIsolation,
  filterIssueEvidenceByDomain,
  filterRolesByDomain,
  filterSystemsByDomain,
} from './domainIsolation';

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
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
  extractionCandidates?: ExtractionCandidate[];
>>>>>>> theirs
=======
  extractionCandidates?: ExtractionCandidate[];
>>>>>>> theirs
=======
  extractionCandidates?: ExtractionCandidate[];
>>>>>>> theirs
=======
  extractionCandidates?: ExtractionCandidate[];
>>>>>>> theirs
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
const STORY_HEADING_RE = /^\s*3\.\s+Die Geschichte\s*$/im;
const PIPE_ROW_RE = /^\s*\|(.+)\|\s*$/;
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
  [/\bservicekoordinator(?:in)?\b/i, 'Servicekoordination'],
  [/\bqualitätsmanagement\b|\bqualitaetsmanagement\b|\bqm\b/i, 'Qualitätsmanagement'],
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
  [/\bchat\b/i, 'Chat'],
  [/\btelefon(?:at)?\b/i, 'Telefon'],
  [/\bremote\b/i, 'Remote-Support'],
  [/\breport\b/i, 'Reporting'],
  [/\bsap\b/i, 'SAP'],
  [/\bmonitoring\b/i, 'Monitoring'],
  [/\bleitstand\b/i, 'Leitstand'],
  [/\bticket\b/i, 'Ticketsystem'],
  [/\brma\b/i, 'RMA-Referenz'],
  [/\bsrm\b|\beinkaufssystem\b|\blieferantenportal\b/i, 'SRM/Einkaufssystem'],
  [/\brechnung\b|\brechnungsworkflow\b/i, 'Rechnungsworkflow'],
  [/\bhr-system\b|\bpersonalsystem\b|\bhr tool\b/i, 'HR-System'],
  [/\biam\b|\bactive directory\b|\bad\b/i, 'IAM/Active Directory'],
  [/\bservicekatalog\b|\bself service portal\b/i, 'Serviceportal'],
  [/\bmdm\b|\bmaster data\b/i, 'MDM'],
  [/\bworkflow-ticket\b|\bworkflow\b/i, 'Workflow'],
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
  if (/^\d+\)\s+/.test(paragraph)) return true;
  if (/^signal$/i.test(paragraph) || /^nutzen/i.test(paragraph)) return true;
  return false;
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
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
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
}

function buildIssueObservations(params: {
  caseId: string;
  startIndex: number;
  issueEvidence: IssueEvidence[];
}): ProcessMiningObservation[] {
  return params.issueEvidence.map((issue, index) =>
    createObservation({
      caseId: params.caseId,
      label: issue.label,
      sequenceIndex: params.startIndex + index,
      evidenceSnippet: issue.snippet,
      kind: 'issue',
      timestampQuality: 'missing',
    }),
  );
>>>>>>> theirs
}

function toObservationsFromStructured(caseId: string, steps: StructuredProcedureStep[]): ProcessMiningObservation[] {
  return steps.map((step, index) =>
    createObservation({
      caseId,
      label: step.label,
      sequenceIndex: index,
      role: step.responsible,
      system: step.system,
      evidenceSnippet: step.evidenceSnippet,
      kind: 'step',
      timestampQuality: 'missing',
    }),
  );
}

function toObservationsFromSemiStructured(caseId: string, steps: SemiStructuredProcedureStep[]): ProcessMiningObservation[] {
  return steps.map((step, index) =>
    createObservation({
      caseId,
      label: canonicalizeProcessStepLabel({ title: step.label, body: step.description || step.evidenceSnippet, fallback: step.label, index }),
      sequenceIndex: index,
      role: step.responsible,
      evidenceSnippet: step.evidenceSnippet,
      kind: 'step',
      timestampQuality: 'missing',
    }),
  );
}

function dedupeDerivedSteps(
  steps: Array<{ label: string; role?: string; evidenceSnippet?: string; timestampRaw?: string; systems?: string[]; issueSignals?: string[] }>,
) {
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
  supplementalIssueSignals?: string[];
  profile: NarrativeDocumentProfile;
  baseConfidence?: 'high' | 'medium' | 'low';
  domainContext?: { primary: DomainKey; secondary?: DomainKey };
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
  routingContext: SourceRoutingContext;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
>>>>>>> theirs
}): DerivationResult | null {
  const {
    blocks,
    sourceName,
    sourceType,
    rawText,
    warnings,
    supplementalIssueSignals = [],
    profile,
    baseConfidence = 'medium',
    domainContext,
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
    routingContext,
>>>>>>> theirs
=======
    routingContext,
>>>>>>> theirs
=======
    routingContext,
>>>>>>> theirs
=======
    routingContext,
>>>>>>> theirs
=======
    routingContext,
>>>>>>> theirs
=======
    routingContext,
>>>>>>> theirs
  } = params;

  const sourceProfile = buildSourceExtractionPlan(rawText).profile;
  const sourceProfileNote = buildSourceProfileNote(sourceProfile);
  const analysisStrategies = uniqueStrings([...buildAnalysisStrategies(sourceProfile.inputProfileLabel), ...(sourceProfile.extractionPlan ?? [])]).slice(0, 5);

  const derivedStepCandidates = dedupeDerivedSteps(
    blocks
      .map((block, index) => {
        const label = canonicalizeProcessStepLabel({ title: block.title, body: block.body, fallback: block.title, index });
        const roles = extractRoles(`${block.title} ${block.body}`);
        const systems = extractSystems(block.body);
        const issues = extractIssueSignals(`${block.title} ${block.body}`, domainContext);
        return {
          label,
          role: roles[0],
          evidenceSnippet: normalizeWhitespace(`${block.timestampRaw ? `${block.timestampRaw} | ` : ''}${block.title}. ${block.body}`).slice(0, 320),
          timestampRaw: block.timestampRaw,
          systems,
          issueSignals: issues,
        };
      })
      .filter(step => step.label && step.label.length >= 4),
  );

  if (derivedStepCandidates.length < 2) return null;

  const caseItem = buildCase({
    name: sourceName.replace(/\.[^.]+$/, ''),
    narrative: sliceNarrative(blocks.map(block => `${block.timestampRaw ? `${block.timestampRaw} | ` : ''}${block.title}\n${block.body}`).join('\n\n')),
    rawText,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType,
    inputKind: sourceType === 'narrative' ? 'narrative' : 'document',
    derivedStepLabels: derivedStepCandidates.map(step => step.label),
    analysisProfileLabel: sourceProfile.inputProfileLabel,
    analysisProfileHint: sourceProfile.extractionFocus,
    analysisStrategies,
    routingContext,
  });

  const observations: ProcessMiningObservation[] = [];
  derivedStepCandidates.forEach((step, index) => {
    observations.push(
      createObservation({
        caseId: caseItem.id,
        label: step.label,
        sequenceIndex: index,
        role: step.role,
        system: step.systems?.[0],
        evidenceSnippet: step.evidenceSnippet,
        timestampRaw: step.timestampRaw,
        timestampQuality: step.timestampRaw ? 'synthetic' : 'missing',
        kind: 'step',
      }),
    );
  });

  const roles = uniqueStrings(derivedStepCandidates.map(step => step.role));
  const systems = uniqueStrings(derivedStepCandidates.flatMap(step => step.systems ?? []));
  const issueSignals = uniqueStrings([
    ...derivedStepCandidates.flatMap(step => step.issueSignals ?? []),
    ...supplementalIssueSignals,
  ]);

  const narrativeIssueEvidence = dedupeIssueEvidence([
    ...derivedStepCandidates.flatMap(step => (step.issueSignals ?? []).map(signal => ({ label: signal, snippet: step.evidenceSnippet ?? signal }))),
    ...supplementalIssueSignals.map(signal => ({ label: signal, snippet: signal })),
  ]);

  const familyHits = derivedStepCandidates.filter(step => inferStepFamily(step.label)).length;
  const confidence: 'high' | 'medium' | 'low' =
    baseConfidence === 'high' || familyHits >= Math.max(3, Math.ceil(derivedStepCandidates.length * 0.6))
      ? 'high'
      : derivedStepCandidates.length >= MIN_USEFUL_STEPS
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
    stepLabels: derivedStepCandidates.map(step => step.label),
    roles,
    systems,
    issueSignals,
    issueEvidence: narrativeIssueEvidence,
    documentSummary,
    sourceProfile,
    routingContext,
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
    derivedSteps: derivedStepCandidates.map(step => ({ label: step.label, role: step.role, evidenceSnippet: step.evidenceSnippet })),
    roles,
    systems,
    issueSignals,
    summary,
    routingContext,
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
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
  routingContext: SourceRoutingContext;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
>>>>>>> theirs
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
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
    routingContext,
>>>>>>> theirs
=======
    routingContext,
>>>>>>> theirs
=======
    routingContext,
>>>>>>> theirs
=======
    routingContext,
>>>>>>> theirs
=======
    routingContext,
>>>>>>> theirs
=======
    routingContext,
>>>>>>> theirs
  } = params;
  const sourceProfile = buildSourceExtractionPlan(rawText).profile;
  const sourceProfileNote = buildSourceProfileNote(sourceProfile);
  const analysisStrategies = uniqueStrings([...buildAnalysisStrategies(sourceProfile.inputProfileLabel), ...(sourceProfile.extractionPlan ?? [])]).slice(0, 5);
  const derivedSteps = steps.map(step => ({
    label: step.label,
    role: step.responsible,
    evidenceSnippet: step.evidenceSnippet,
  }));
  const caseItem = buildCase({
    name: title ?? sourceName.replace(/\.[^.]+$/, ''),
    narrative: sliceNarrative(rawText),
    rawText,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType,
    inputKind: sourceType === 'narrative' ? 'narrative' : 'document',
    derivedStepLabels: derivedSteps.map(step => step.label),
    analysisProfileLabel: sourceProfile.inputProfileLabel,
    analysisProfileHint: sourceProfile.extractionFocus,
    analysisStrategies,
    routingContext,
  });
  const observations = toObservationsFromStructured(caseItem.id, steps);
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
  const systems = uniqueStrings([...steps.map(step => step.system), ...extractSystems(rawText)]);
  const issueEvidence = extractIssueEvidence(rawText);
=======
  const systems = extractSystems(rawText);
  const issueEvidence = extractIssueEvidence(rawText, domainContext);
>>>>>>> theirs
=======
  const systems = extractSystems(rawText);
  const issueEvidence = extractIssueEvidence(rawText, domainContext);
>>>>>>> theirs
=======
  const systems = extractSystems(rawText);
  const issueEvidence = extractIssueEvidence(rawText, domainContext);
>>>>>>> theirs
=======
  const systems = extractSystems(rawText);
  const issueEvidence = extractIssueEvidence(rawText, domainContext);
>>>>>>> theirs
=======
  const systems = extractSystems(rawText);
  const issueEvidence = extractIssueEvidence(rawText, domainContext);
>>>>>>> theirs
=======
  const systems = extractSystems(rawText);
  const issueEvidence = extractIssueEvidence(rawText, domainContext);
>>>>>>> theirs
=======
  const systems = extractSystems(rawText);
  const issueEvidence = extractIssueEvidence(rawText, domainContext);
>>>>>>> theirs
=======
  const systems = extractSystems(rawText);
  const issueEvidence = extractIssueEvidence(rawText, domainContext);
>>>>>>> theirs
  const issueSignals = uniqueStrings(issueEvidence.map(entry => entry.label));
  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'structured',
    documentKind,
    analysisMode: 'process-draft',
    caseCount: 1,
    observationCount: observations.length,
    warnings,
    confidence,
    stepLabels: derivedSteps.map(step => step.label),
    roles,
    systems,
    issueSignals,
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
    issueEvidence,
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'procedure-document' })} ${sourceProfileNote}`.trim(),
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
    sourceProfile,
    routingContext,
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };
  return {
    cases: [caseItem],
    observations,
    method: 'structured',
    documentKind,
    warnings,
    confidence,
    derivedSteps,
    roles,
    systems,
    issueSignals,
    summary,
    routingContext,
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
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
}): DerivationResult {
  const { steps, roles, warnings, title, sourceName, sourceType, rawText, confidence, domainContext } = params;
=======
  routingContext: SourceRoutingContext;
}): DerivationResult {
  const { steps, roles, warnings, title, sourceName, sourceType, rawText, confidence, domainContext, routingContext } = params;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
}): DerivationResult {
  const { steps, roles, warnings, title, sourceName, sourceType, rawText, confidence, domainContext, routingContext } = params;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
}): DerivationResult {
  const { steps, roles, warnings, title, sourceName, sourceType, rawText, confidence, domainContext, routingContext } = params;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
}): DerivationResult {
  const { steps, roles, warnings, title, sourceName, sourceType, rawText, confidence, domainContext, routingContext } = params;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
}): DerivationResult {
  const { steps, roles, warnings, title, sourceName, sourceType, rawText, confidence, domainContext, routingContext } = params;
>>>>>>> theirs
=======
  routingContext: SourceRoutingContext;
}): DerivationResult {
  const { steps, roles, warnings, title, sourceName, sourceType, rawText, confidence, domainContext, routingContext } = params;
>>>>>>> theirs
  const sourceProfile = buildSourceExtractionPlan(rawText).profile;
  const sourceProfileNote = buildSourceProfileNote(sourceProfile);
  const analysisStrategies = uniqueStrings([...buildAnalysisStrategies(sourceProfile.inputProfileLabel), ...(sourceProfile.extractionPlan ?? [])]).slice(0, 5);
  const derivedSteps = steps.map((step, index) => ({
    label: canonicalizeProcessStepLabel({ title: step.label, body: step.description || step.evidenceSnippet, fallback: step.label, index }),
    role: step.responsible,
    evidenceSnippet: step.evidenceSnippet,
  }));
  const caseItem = buildCase({
    name: title ?? sourceName.replace(/\.[^.]+$/, ''),
    narrative: sliceNarrative(rawText),
    rawText,
    sourceNote: `Import aus: ${sourceName}`,
    sourceType,
    inputKind: sourceType === 'narrative' ? 'narrative' : 'document',
    derivedStepLabels: derivedSteps.map(step => step.label),
    analysisProfileLabel: sourceProfile.inputProfileLabel,
    analysisProfileHint: sourceProfile.extractionFocus,
    analysisStrategies,
    routingContext,
  });
  const observations = toObservationsFromSemiStructured(caseItem.id, steps);
  const systems = extractSystems(rawText);
  const issueEvidence = extractIssueEvidence(rawText, domainContext);
  const issueSignals = uniqueStrings(issueEvidence.map(entry => entry.label));
  const summary: DerivationSummary = {
    sourceLabel: sourceName,
    method: 'semi-structured',
    documentKind: 'semi-structured-procedure-document',
    analysisMode: 'process-draft',
    caseCount: 1,
    observationCount: observations.length,
    warnings,
    confidence,
    stepLabels: derivedSteps.map(step => step.label),
    roles,
    systems,
    issueSignals,
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
    issueEvidence,
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'procedure-document' })} ${sourceProfileNote}`.trim(),
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'semi-structured-procedure-document' })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'semi-structured-procedure-document' })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'semi-structured-procedure-document' })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'semi-structured-procedure-document' })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'semi-structured-procedure-document' })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'semi-structured-procedure-document' })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'semi-structured-procedure-document' })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
=======
    documentSummary: `${buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: 'semi-structured-procedure-document' })} ${sourceProfileNote}`.trim(),
>>>>>>> theirs
    sourceProfile,
    routingContext,
    engineVersion: ENGINE_VERSION,
    provenance: 'local',
    updatedAt: new Date().toISOString(),
  };
  return {
    cases: [caseItem],
    observations,
    method: 'semi-structured',
    documentKind: 'semi-structured-procedure-document',
    warnings,
    confidence,
    derivedSteps,
    roles,
    systems,
    issueSignals,
    summary,
    routingContext,
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

const WEAK_STEP_LABEL_RE = /^(mail|e-?mail|chat|kommentar|notiz|hinweis|offen|ticket|frage|status|todo)$/i;
const ACTIVITY_STEP_RE = /\b(pr[üu]fen|bearbeiten|anlegen|validieren|freigeben|abstimmen|dokumentieren|versenden|zuordnen|abschlie[ßs]en|eskalieren|bereitstellen|bestellen|recherchieren|koordinieren)\b/i;

function buildExtractionCandidates(
  observations: ProcessMiningObservation[],
  routingContext: SourceRoutingContext,
): ExtractionCandidate[] {
  const candidates: ExtractionCandidate[] = [];
  for (const observation of observations) {
    const anchor = observation.evidenceSnippet?.trim() || '';
    const contextWindow = normalizeWhitespace(`${observation.label} ${observation.evidenceSnippet ?? ''}`).slice(0, 320);
    const isWeakStep = observation.kind === 'step' && (
      anchor.length < 12 ||
      WEAK_STEP_LABEL_RE.test(observation.label.trim()) ||
      !ACTIVITY_STEP_RE.test(contextWindow)
    );
    const stepStatus: ExtractionCandidate['status'] = observation.kind === 'step'
      ? (isWeakStep ? 'rejected' : 'merged')
      : observation.kind === 'issue'
      ? 'support-only'
      : 'candidate';
    const rejectionReason = observation.kind === 'step' && isWeakStep
      ? anchor.length < 12
        ? 'Kein belastbarer Evidenzanker am Schritt.'
        : WEAK_STEP_LABEL_RE.test(observation.label.trim())
        ? 'Nur schwaches Kurzlabel ohne belastbaren Prozessbezug.'
        : 'Kein stabiler Aktivitätscharakter im lokalen Kontext.'
      : undefined;

    candidates.push({
      candidateId: `${observation.id}-base`,
      candidateType: observation.kind === 'step' ? 'step' : observation.kind === 'issue' ? 'signal' : 'support',
      rawLabel: observation.label,
      normalizedLabel: observation.kind === 'step' ? canonicalizeProcessStepLabel({ title: observation.label, body: observation.evidenceSnippet, fallback: observation.label, index: observation.sequenceIndex }) : observation.label,
      evidenceAnchor: anchor || observation.label,
      contextWindow,
      confidence: observation.kind === 'step' && !isWeakStep ? 'medium' : 'low',
      originChannel: 'imported-observation',
      sourceFragmentType: anchor.includes('|') ? 'table-row' : 'sentence',
      routingClass: routingContext.routingClass,
      sourceRef: observation.id,
      status: stepStatus,
      rejectionReason,
      downgradeReason: stepStatus === 'support-only' ? 'Signal oder Hinweis, kein Kernschritt.' : undefined,
    });

    if (observation.kind === 'step' && observation.role) {
      candidates.push({
        candidateId: `${observation.id}-role`,
        candidateType: 'role',
        rawLabel: observation.role,
        normalizedLabel: sentenceCase(observation.role),
        evidenceAnchor: anchor || observation.role,
        contextWindow,
        confidence: anchor ? 'medium' : 'low',
        originChannel: 'imported-observation',
        sourceFragmentType: anchor.includes('|') ? 'table-row' : 'sentence',
        routingClass: routingContext.routingClass,
        sourceRef: observation.id,
        status: anchor ? 'candidate' : 'support-only',
        downgradeReason: anchor ? undefined : 'Rolle nur schwach ohne lokalen Evidenzanker.',
      });
    }

    if (observation.kind === 'step' && observation.system) {
      candidates.push({
        candidateId: `${observation.id}-system`,
        candidateType: 'system',
        rawLabel: observation.system,
        normalizedLabel: sentenceCase(observation.system),
        evidenceAnchor: anchor || observation.system,
        contextWindow,
        confidence: anchor ? 'medium' : 'low',
        originChannel: 'imported-observation',
        sourceFragmentType: anchor.includes('|') ? 'table-row' : 'sentence',
        routingClass: routingContext.routingClass,
        sourceRef: observation.id,
        status: anchor ? 'candidate' : 'support-only',
        downgradeReason: anchor ? undefined : 'System nur schwach ohne lokalen Evidenzanker.',
      });
    }
  }
  return candidates;
}

function finalizeDerivationResult(result: DerivationResult): DerivationResult {
<<<<<<< ours
  const repaired = result.method === 'structured'
    ? {
        observations: result.observations,
        report: {
          renamedSteps: 0,
          reclassifiedIssues: 0,
          splitSteps: 0,
          mergedDuplicates: 0,
          notes: [] as string[],
        },
      }
    : repairDerivedObservations(result.observations);

  const rawText = normalizeWhitespace(
    result.cases
      .map(caseItem => caseItem.rawText ?? caseItem.narrative ?? '')
      .filter(Boolean)
      .join('\n\n'),
  );
  const provisionalStepLabels = uniqueStrings(
    repaired.observations
      .filter(observation => observation.kind === 'step')
      .map(observation => observation.label),
  );
  const provisionalRoles = uniqueStrings([...result.roles, ...repaired.observations.map(observation => observation.role)]);
  const provisionalSystems = uniqueStrings([...result.systems, ...repaired.observations.map(observation => observation.system)]);
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
    ...repaired.observations
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

  const filteredObservations = repaired.observations
    .filter(observation => observation.kind !== 'issue')
    .map(observation => {
      const normalizedRole = observation.role ? rolePreferredValue(observation.role) : undefined;
      const normalizedSystem = observation.system ? systemPreferredValue(observation.system) : undefined;
      return {
        ...observation,
        role: normalizedRole && filterRolesByDomain([normalizedRole], domainIsolation).length > 0 ? normalizedRole : undefined,
        system: normalizedSystem && filterSystemsByDomain([normalizedSystem], domainIsolation).length > 0 ? normalizedSystem : undefined,
      };
    });

  const stepLabels = uniqueStrings(
    filteredObservations
      .filter(observation => observation.kind === 'step')
      .map(observation => observation.label),
  );
  const roles = filterRolesByDomain(uniqueStrings([...result.roles, ...filteredObservations.map(observation => observation.role)]), domainIsolation);
  const systems = filterSystemsByDomain(uniqueStrings([...result.systems, ...filteredObservations.map(observation => observation.system)]), domainIsolation);
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
=======
  const repaired = repairDerivedObservations(result.observations);
  const candidates = buildExtractionCandidates(repaired.observations, result.routingContext);
  const acceptedStepIds = new Set(
    candidates
      .filter(candidate => candidate.candidateType === 'step' && candidate.status === 'merged')
      .map(candidate => candidate.sourceRef)
      .filter(Boolean),
  );
  const gatedObservations = repaired.observations.filter(observation => (
    observation.kind !== 'step' || acceptedStepIds.has(observation.id)
  ));
  const stepLabels = uniqueStrings(
    gatedObservations
      .filter(observation => observation.kind === 'step')
      .map(observation => observation.label),
  );
  const roles = uniqueStrings([
    ...result.roles,
    ...candidates
      .filter(candidate => candidate.candidateType === 'role' && candidate.status !== 'rejected')
      .map(candidate => candidate.normalizedLabel),
  ]);
  const systems = uniqueStrings([
    ...result.systems,
    ...candidates
      .filter(candidate => candidate.candidateType === 'system' && candidate.status !== 'rejected')
      .map(candidate => candidate.normalizedLabel),
  ]);
  const issueSignals = uniqueStrings([
    ...result.issueSignals,
    ...gatedObservations.filter(observation => observation.kind === 'issue').map(observation => observation.label),
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
  const analysisStrategies = sourceProfile ? buildAnalysisStrategies(sourceProfile.inputProfileLabel) : undefined;
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
  const documentSummary = uniqueStrings([
    result.summary.documentSummary ?? '',
    domainIsolation.note ?? '',
  ]).join(' ').trim();
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
=======
>>>>>>> theirs
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
  const finalDocumentSummary = [
    forceConservative
      ? 'Vorläufiger Prozessentwurf mit erhöhter Unsicherheit.'
      : '',
    result.summary.documentSummary ?? '',
  ].filter(Boolean).join(' ');
<<<<<<< ours
<<<<<<< ours
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
>>>>>>> theirs
=======
>>>>>>> theirs

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
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
    observations: filteredObservations,
    roles,
    systems,
    issueSignals,
    derivedSteps: filteredObservations
=======
    observations: gatedObservations,
    roles,
    systems,
    issueSignals,
    derivedSteps: gatedObservations
>>>>>>> theirs
=======
    observations: gatedObservations,
    roles,
    systems,
    issueSignals,
    derivedSteps: gatedObservations
>>>>>>> theirs
=======
=======
>>>>>>> theirs
    observations: gatedObservations,
    roles,
    systems,
    issueSignals,
    derivedSteps: gatedObservations
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
      .filter(observation => observation.kind === 'step')
      .map(observation => ({
        label: observation.label,
        role: observation.role,
        evidenceSnippet: observation.evidenceSnippet,
      })),
    summary: {
      ...result.summary,
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
      observationCount: filteredObservations.length,
=======
      observationCount: gatedObservations.length,
>>>>>>> theirs
=======
      observationCount: gatedObservations.length,
>>>>>>> theirs
=======
      observationCount: gatedObservations.length,
>>>>>>> theirs
=======
      observationCount: gatedObservations.length,
>>>>>>> theirs
      stepLabels,
      warnings: finalWarnings,
      confidence: finalConfidence,
      roles,
      systems,
      issueSignals,
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
      issueEvidence: keptIssueEvidence,
=======
      documentSummary: finalDocumentSummary,
>>>>>>> theirs
=======
      documentSummary: finalDocumentSummary,
>>>>>>> theirs
=======
      documentSummary: finalDocumentSummary,
      routingContext: result.routingContext,
>>>>>>> theirs
=======
      documentSummary: finalDocumentSummary,
      routingContext: result.routingContext,
>>>>>>> theirs
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
      documentSummary: finalDocumentSummary,
      routingContext: result.routingContext,
      extractionCandidates: candidates,
      candidateStats: {
        total: candidates.length,
        mergedCoreSteps: candidates.filter(candidate => candidate.candidateType === 'step' && candidate.status === 'merged').length,
        supportOnly: candidates.filter(candidate => candidate.status === 'support-only').length,
        rejected: candidates.filter(candidate => candidate.status === 'rejected').length,
      },
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
      repairNotes,
      documentSummary,
      sourceProfile,
      multiCaseSummary,
      engineVersion: ENGINE_VERSION,
      updatedAt: new Date().toISOString(),
    },
    warnings: finalWarnings,
    confidence: finalConfidence,
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
    extractionCandidates: candidates,
>>>>>>> theirs
=======
    extractionCandidates: candidates,
>>>>>>> theirs
=======
    extractionCandidates: candidates,
>>>>>>> theirs
=======
    extractionCandidates: candidates,
>>>>>>> theirs
  };
}

export function deriveProcessArtifactsFromText(input: DerivationInput): DerivationResult {
  const rawText = cleanInputText(input.text);
  const sourceName = getSourceName(input.fileName, input.sourceType);
  const routingContext = routeSourceMaterial({ text: rawText, sourceType: input.sourceType });
  const profile = profileNarrativeDocument(rawText);
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
  const sourceProfile = buildSourceExtractionPlan(rawText).profile;
=======
  const structureClassification = classifyDocumentStructure(rawText);
  const classifiedDocumentKind = mapClassifierToDocumentKind(structureClassification.classType);
>>>>>>> theirs
=======
  const structureClassification = classifyDocumentStructure(rawText);
  const classifiedDocumentKind = mapClassifierToDocumentKind(structureClassification.classType);
>>>>>>> theirs
=======
  const structureClassification = classifyDocumentStructure(rawText);
  const classifiedDocumentKind = mapClassifierToDocumentKind(structureClassification.classType);
>>>>>>> theirs
=======
  const structureClassification = classifyDocumentStructure(rawText);
  const classifiedDocumentKind = mapClassifierToDocumentKind(structureClassification.classType);
>>>>>>> theirs
=======
  const structureClassification = classifyDocumentStructure(rawText);
  const classifiedDocumentKind = mapClassifierToDocumentKind(structureClassification.classType);
>>>>>>> theirs
=======
  const structureClassification = classifyDocumentStructure(rawText);
  const classifiedDocumentKind = mapClassifierToDocumentKind(structureClassification.classType);
>>>>>>> theirs
=======
  const structureClassification = classifyDocumentStructure(rawText);
  const classifiedDocumentKind = mapClassifierToDocumentKind(structureClassification.classType);
>>>>>>> theirs
=======
  const structureClassification = classifyDocumentStructure(rawText);
  const classifiedDocumentKind = mapClassifierToDocumentKind(structureClassification.classType);
>>>>>>> theirs

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
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
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
  warnings.push(
    `Quellen-Router: ${routingContext.routingClass} (${routingContext.routingConfidence}) · Signale: ${routingContext.routingSignals.slice(0, 4).join(', ')}.`,
  );
  if (routingContext.fallbackReason) {
    warnings.push(`Router-Fallback: ${routingContext.fallbackReason}`);
  }
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
  warnings.push(`Dokumentklassifikation: ${structureClassification.classType} (${structureClassification.confidence}). ${structureClassification.reasons.slice(0, 2).join(' ')}`.trim());
  const domainContext = detectDomainContext(rawText);
  if (domainContext.primary !== 'generic') {
    warnings.push(`Primärdomäne erkannt: ${domainContext.primary}${domainContext.secondary ? `, Sekundärdomäne: ${domainContext.secondary}` : ''}.`);
  }

  const roles = extractRoles(rawText);
  const systems = extractSystems(rawText);
  const supplementalIssueEvidence = extractIssueEvidence(rawText, domainContext);
  const supplementalIssueSignals = uniqueStrings(supplementalIssueEvidence.map(entry => entry.label));
  const storyBlocks = extractTimelineBlocks(rawText);
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
  const structuredLike = sourceProfile.documentClass === 'structured-target-procedure' || sourceProfile.documentClass === 'semi-structured-procedure';

  if (structuredLike) {
    const structuredCandidates = candidateTexts(rawText, sourceName);

    for (const candidateText of structuredCandidates) {
      const structured = extractStructuredProcedureFromText(sourceName, candidateText);
      if (structured && structured.steps.length >= MIN_USEFUL_STEPS) {
        return finalizeDerivationResult(buildStructuredDerivation({
          steps: structured.steps,
          roles: uniqueStrings([...structured.roles.map(role => role.name), ...roles, ...structured.steps.map(step => step.responsible)]),
          warnings: uniqueStrings([...structured.warnings, ...warnings]),
          title: structured.title,
          sourceName,
          sourceType: input.sourceType,
          rawText,
          confidence: sourceProfile.documentClass === 'structured-target-procedure' ? 'high' : 'medium',
        }));
      }
    }

<<<<<<< ours
    for (const candidateText of structuredCandidates) {
      const semiStructured = extractSemiStructuredProcedureFromText(sourceName, candidateText);
      if (semiStructured && semiStructured.steps.length >= MIN_USEFUL_STEPS) {
        return finalizeDerivationResult(buildSemiStructuredDerivation({
          steps: semiStructured.steps,
          roles: uniqueStrings([...semiStructured.roles, ...roles, ...semiStructured.steps.map(step => step.responsible)]),
          warnings: uniqueStrings([...semiStructured.warnings, ...warnings]),
          title: semiStructured.title,
          sourceName,
          sourceType: input.sourceType,
          rawText,
          confidence: semiStructured.confidence,
        }));
      }
    }

    warnings.push('Strukturiertes Verfahrensdokument erkannt, aber noch nicht sauber als Ablauf extrahiert — narrative Notlogik bleibt nur letzte Reserve.');
  }

<<<<<<< ours
  if (!structuredLike && isMostlyNarrative(rawText) && storyBlocks.length >= MIN_USEFUL_STEPS) {
=======
  if ((classifiedDocumentKind === 'case-narrative' || classifiedDocumentKind === 'mixed-document') && isMostlyNarrative(rawText) && storyBlocks.length >= MIN_USEFUL_STEPS) {
>>>>>>> theirs
=======
  if ((classifiedDocumentKind === 'case-narrative' || classifiedDocumentKind === 'mixed-document') && isMostlyNarrative(rawText) && storyBlocks.length >= MIN_USEFUL_STEPS) {
>>>>>>> theirs
=======
  const preferredPath = routingContext.routingClass;
  const allowStructuredFirst = preferredPath === 'structured-procedure' || preferredPath === 'eventlog-table';
  const allowSemiStructuredFirst = preferredPath === 'semi-structured-procedure' || preferredPath === 'mixed-document';
  const allowNarrativeFirst = preferredPath === 'narrative-case';
  const forceDefensiveFallback = preferredPath === 'weak-raw-table';

  if (!forceDefensiveFallback && allowNarrativeFirst && isMostlyNarrative(rawText) && storyBlocks.length >= MIN_USEFUL_STEPS) {
>>>>>>> theirs
=======
  const preferredPath = routingContext.routingClass;
  const allowStructuredFirst = preferredPath === 'structured-procedure' || preferredPath === 'eventlog-table';
  const allowSemiStructuredFirst = preferredPath === 'semi-structured-procedure' || preferredPath === 'mixed-document';
  const allowNarrativeFirst = preferredPath === 'narrative-case';
  const forceDefensiveFallback = preferredPath === 'weak-raw-table';

  if (!forceDefensiveFallback && allowNarrativeFirst && isMostlyNarrative(rawText) && storyBlocks.length >= MIN_USEFUL_STEPS) {
>>>>>>> theirs
=======
  const preferredPath = routingContext.routingClass;
  const allowStructuredFirst = preferredPath === 'structured-procedure' || preferredPath === 'eventlog-table';
  const allowSemiStructuredFirst = preferredPath === 'semi-structured-procedure' || preferredPath === 'mixed-document';
  const allowNarrativeFirst = preferredPath === 'narrative-case';
  const forceDefensiveFallback = preferredPath === 'weak-raw-table';

  if (!forceDefensiveFallback && allowNarrativeFirst && isMostlyNarrative(rawText) && storyBlocks.length >= MIN_USEFUL_STEPS) {
>>>>>>> theirs
=======
  const preferredPath = routingContext.routingClass;
  const allowStructuredFirst = preferredPath === 'structured-procedure' || preferredPath === 'eventlog-table';
  const allowSemiStructuredFirst = preferredPath === 'semi-structured-procedure' || preferredPath === 'mixed-document';
  const allowNarrativeFirst = preferredPath === 'narrative-case';
  const forceDefensiveFallback = preferredPath === 'weak-raw-table';

  if (!forceDefensiveFallback && allowNarrativeFirst && isMostlyNarrative(rawText) && storyBlocks.length >= MIN_USEFUL_STEPS) {
>>>>>>> theirs
=======
  const preferredPath = routingContext.routingClass;
  const allowStructuredFirst = preferredPath === 'structured-procedure' || preferredPath === 'eventlog-table';
  const allowSemiStructuredFirst = preferredPath === 'semi-structured-procedure' || preferredPath === 'mixed-document';
  const allowNarrativeFirst = preferredPath === 'narrative-case';
  const forceDefensiveFallback = preferredPath === 'weak-raw-table';

  if (!forceDefensiveFallback && allowNarrativeFirst && isMostlyNarrative(rawText) && storyBlocks.length >= MIN_USEFUL_STEPS) {
>>>>>>> theirs
=======
  const preferredPath = routingContext.routingClass;
  const allowStructuredFirst = preferredPath === 'structured-procedure' || preferredPath === 'eventlog-table';
  const allowSemiStructuredFirst = preferredPath === 'semi-structured-procedure' || preferredPath === 'mixed-document';
  const allowNarrativeFirst = preferredPath === 'narrative-case';
  const forceDefensiveFallback = preferredPath === 'weak-raw-table';

  if (!forceDefensiveFallback && allowNarrativeFirst && isMostlyNarrative(rawText) && storyBlocks.length >= MIN_USEFUL_STEPS) {
>>>>>>> theirs
    const narrativeResult = buildNarrativeDerivation({
      blocks: storyBlocks,
      sourceName,
      sourceType: input.sourceType,
      rawText,
      warnings,
      supplementalIssueSignals,
      profile,
      baseConfidence: storyBlocks.length >= 5 ? 'high' : 'medium',
      domainContext,
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
      routingContext,
>>>>>>> theirs
=======
      routingContext,
>>>>>>> theirs
=======
      routingContext,
>>>>>>> theirs
=======
      routingContext,
>>>>>>> theirs
=======
      routingContext,
>>>>>>> theirs
=======
      routingContext,
>>>>>>> theirs
    });
    if (narrativeResult) {
      narrativeResult.roles = uniqueStrings([...narrativeResult.roles, ...roles]);
      narrativeResult.systems = uniqueStrings([...narrativeResult.systems, ...systems]);
      narrativeResult.issueSignals = uniqueStrings([...narrativeResult.issueSignals, ...supplementalIssueSignals]);
      narrativeResult.summary.roles = narrativeResult.roles;
      narrativeResult.summary.systems = narrativeResult.systems;
      narrativeResult.summary.issueSignals = narrativeResult.issueSignals;
      return finalizeDerivationResult(narrativeResult);
    }
  }

<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
  for (const candidateText of candidateTexts(rawText, sourceName)) {
    const structured = extractStructuredProcedureFromText(sourceName, candidateText);
    if (structured && structured.steps.length >= MIN_USEFUL_STEPS) {
      return finalizeDerivationResult(buildStructuredDerivation({
        steps: structured.steps,
        roles: uniqueStrings([...structured.roles.map(role => role.name), ...roles, ...structured.steps.map(step => step.responsible)]),
        warnings: uniqueStrings([...structured.warnings, ...warnings]),
        title: structured.title,
        sourceName,
        sourceType: input.sourceType,
        rawText,
<<<<<<< ours
        confidence: sourceProfile.documentClass === 'structured-target-procedure' ? 'high' : 'medium',
=======
        confidence: 'high',
        documentKind: classifiedDocumentKind === 'semi-structured-procedure-document'
          ? 'semi-structured-procedure-document'
          : 'procedure-document',
        domainContext,
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
      }));
    }
  }

  for (const candidateText of candidateTexts(rawText, sourceName)) {
    const semiStructured = extractSemiStructuredProcedureFromText(sourceName, candidateText);
    if (semiStructured && semiStructured.steps.length >= MIN_USEFUL_STEPS) {
      return finalizeDerivationResult(buildSemiStructuredDerivation({
        steps: semiStructured.steps,
        roles: uniqueStrings([...semiStructured.roles, ...roles, ...semiStructured.steps.map(step => step.responsible)]),
        warnings: uniqueStrings([...semiStructured.warnings, ...warnings]),
        title: semiStructured.title,
        sourceName,
        sourceType: input.sourceType,
        rawText,
        confidence: semiStructured.confidence,
        domainContext,
      }));
=======
  if (!forceDefensiveFallback && (allowStructuredFirst || preferredPath === 'mixed-document')) {
    for (const candidateText of candidateTexts(rawText, sourceName)) {
      const structured = extractStructuredProcedureFromText(sourceName, candidateText);
      if (structured && structured.steps.length >= MIN_USEFUL_STEPS) {
        return finalizeDerivationResult(buildStructuredDerivation({
          steps: structured.steps,
          roles: uniqueStrings([...structured.roles.map(role => role.name), ...roles, ...structured.steps.map(step => step.responsible)]),
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

=======
  if (!forceDefensiveFallback && (allowStructuredFirst || preferredPath === 'mixed-document')) {
    for (const candidateText of candidateTexts(rawText, sourceName)) {
      const structured = extractStructuredProcedureFromText(sourceName, candidateText);
      if (structured && structured.steps.length >= MIN_USEFUL_STEPS) {
        return finalizeDerivationResult(buildStructuredDerivation({
          steps: structured.steps,
          roles: uniqueStrings([...structured.roles.map(role => role.name), ...roles, ...structured.steps.map(step => step.responsible)]),
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

>>>>>>> theirs
=======
  if (!forceDefensiveFallback && (allowStructuredFirst || preferredPath === 'mixed-document')) {
    for (const candidateText of candidateTexts(rawText, sourceName)) {
      const structured = extractStructuredProcedureFromText(sourceName, candidateText);
      if (structured && structured.steps.length >= MIN_USEFUL_STEPS) {
        return finalizeDerivationResult(buildStructuredDerivation({
          steps: structured.steps,
          roles: uniqueStrings([...structured.roles.map(role => role.name), ...roles, ...structured.steps.map(step => step.responsible)]),
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

>>>>>>> theirs
=======
  if (!forceDefensiveFallback && (allowStructuredFirst || preferredPath === 'mixed-document')) {
    for (const candidateText of candidateTexts(rawText, sourceName)) {
      const structured = extractStructuredProcedureFromText(sourceName, candidateText);
      if (structured && structured.steps.length >= MIN_USEFUL_STEPS) {
        return finalizeDerivationResult(buildStructuredDerivation({
          steps: structured.steps,
          roles: uniqueStrings([...structured.roles.map(role => role.name), ...roles, ...structured.steps.map(step => step.responsible)]),
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

>>>>>>> theirs
=======
  if (!forceDefensiveFallback && (allowStructuredFirst || preferredPath === 'mixed-document')) {
    for (const candidateText of candidateTexts(rawText, sourceName)) {
      const structured = extractStructuredProcedureFromText(sourceName, candidateText);
      if (structured && structured.steps.length >= MIN_USEFUL_STEPS) {
        return finalizeDerivationResult(buildStructuredDerivation({
          steps: structured.steps,
          roles: uniqueStrings([...structured.roles.map(role => role.name), ...roles, ...structured.steps.map(step => step.responsible)]),
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

>>>>>>> theirs
=======
  if (!forceDefensiveFallback && (allowStructuredFirst || preferredPath === 'mixed-document')) {
    for (const candidateText of candidateTexts(rawText, sourceName)) {
      const structured = extractStructuredProcedureFromText(sourceName, candidateText);
      if (structured && structured.steps.length >= MIN_USEFUL_STEPS) {
        return finalizeDerivationResult(buildStructuredDerivation({
          steps: structured.steps,
          roles: uniqueStrings([...structured.roles.map(role => role.name), ...roles, ...structured.steps.map(step => step.responsible)]),
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

>>>>>>> theirs
  if (!forceDefensiveFallback && (allowSemiStructuredFirst || preferredPath === 'eventlog-table' || preferredPath === 'structured-procedure')) {
    for (const candidateText of candidateTexts(rawText, sourceName)) {
      const semiStructured = extractSemiStructuredProcedureFromText(sourceName, candidateText);
      if (semiStructured && semiStructured.steps.length >= MIN_USEFUL_STEPS) {
        return finalizeDerivationResult(buildSemiStructuredDerivation({
          steps: semiStructured.steps,
          roles: uniqueStrings([...semiStructured.roles, ...roles, ...semiStructured.steps.map(step => step.responsible)]),
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
      supplementalIssueSignals,
      profile,
      baseConfidence: paragraphBlocks.length >= MIN_USEFUL_STEPS ? 'medium' : 'low',
      domainContext,
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
      routingContext,
>>>>>>> theirs
=======
      routingContext,
>>>>>>> theirs
=======
      routingContext,
>>>>>>> theirs
=======
      routingContext,
>>>>>>> theirs
=======
      routingContext,
>>>>>>> theirs
=======
      routingContext,
>>>>>>> theirs
    });
    if (narrativeResult) {
      narrativeResult.roles = uniqueStrings([...narrativeResult.roles, ...roles]);
      narrativeResult.systems = uniqueStrings([...narrativeResult.systems, ...systems]);
      narrativeResult.issueSignals = uniqueStrings([...narrativeResult.issueSignals, ...supplementalIssueSignals]);
      narrativeResult.summary.roles = narrativeResult.roles;
      narrativeResult.summary.systems = narrativeResult.systems;
      narrativeResult.summary.issueSignals = narrativeResult.issueSignals;
      return finalizeDerivationResult(narrativeResult);
    }
  }

  warnings.push('Keine belastbare Prozessstruktur erkannt — einfache lokale Satz- und Abschnittslogik wird verwendet.');
  const fallbackSourceProfile = sourceProfile;
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
  const { observations: fallbackObservations } = extractObservationsFromCase(fallbackCase);
  const usableObservations = fallbackObservations.map((observation, index) => ({
    ...observation,
    label: observation.kind === 'step'
      ? canonicalizeProcessStepLabel({ title: observation.label, body: observation.evidenceSnippet, fallback: observation.label, index })
      : observation.label,
  }));
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
  const fallbackStepObservations = usableObservations.filter(observation => observation.kind === 'step');
  const fallbackIssueEvidence = dedupeIssueEvidence([
    ...extractIssueEvidence(rawText),
    ...usableObservations
      .filter(observation => observation.kind === 'issue')
      .map(observation => ({ label: observation.label, snippet: observation.evidenceSnippet ?? observation.label })),
  ]);
  const fallbackIssueSignals = uniqueStrings(fallbackIssueEvidence.map(entry => entry.label));
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
=======
>>>>>>> theirs
  const fallbackIssueEvidence = extractIssueEvidence(rawText, domainContext);
  const enrichedFallbackObservations = [
    ...usableObservations,
    ...buildIssueObservations({
      caseId: fallbackCase.id,
      startIndex: usableObservations.length,
      issueEvidence: fallbackIssueEvidence,
    }),
  ];
>>>>>>> theirs

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
    roles,
    systems,
    issueSignals: fallbackIssueSignals,
    issueEvidence: fallbackIssueEvidence,
    documentSummary: [
      buildAnalysisModeNotice({ mode: 'process-draft', caseCount: 1, documentKind: profile.hasStoryHeading || profile.hasTimeline ? 'case-narrative' : 'unknown' }),
      buildNarrativeDocumentNote(profile),
      buildSourceProfileNote(fallbackSourceProfile),
    ].filter(Boolean).join(' '),
    sourceProfile: fallbackSourceProfile,
    routingContext,
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
    roles,
    systems,
    issueSignals: fallbackIssueSignals,
    summary,
    routingContext,
  });
}

export function deriveFromMultipleTexts(
  inputs: Array<{ text: string; name: string; sourceType: DerivationInput['sourceType'] }>,
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
  const routingClasses = summaries.map(summary => summary.routingContext?.routingClass).filter(Boolean) as SourceRoutingContext['routingClass'][];
  const dominantRoutingClass = routingClasses.length > 0
    ? routingClasses.reduce<Record<string, number>>((acc, key) => {
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {})
    : {};
  const routingWinner = Object.entries(dominantRoutingClass).sort((a, b) => b[1] - a[1])[0];
  const combinedRoutingContext: SourceRoutingContext = {
    routingClass: (inputs.length > 1 ? 'mixed-document' : (routingWinner?.[0] as SourceRoutingContext['routingClass'] | undefined)) ?? 'weak-raw-table',
    routingConfidence: inputs.length > 1 ? 'medium' : (summaries[0]?.routingContext?.routingConfidence ?? 'low'),
    routingSignals: [
      `sources=${inputs.length}`,
      `routingSpread=${uniqueStrings(routingClasses).join(',') || 'none'}`,
      ...(summaries.flatMap(summary => summary.routingContext?.routingSignals ?? []).slice(0, 4)),
    ],
    fallbackReason: summaries.find(summary => summary.routingContext?.fallbackReason)?.routingContext?.fallbackReason,
  };
  const combinedSummary: DerivationSummary = {
    sourceLabel: inputs.length === 1 ? inputs[0].name : `${inputs.length} importierte Beschreibungen`,
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
