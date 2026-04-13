import type {
  ProcessMiningObservationCase,
  SourceRoutingClass,
  SourceRoutingContext,
} from '../domain/process';
import {
  classifyDocumentStructure,
  type StructuredDocumentClass,
} from './documentStructureClassifier';

const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\.\d{2}\.\d{4}\b/i;
const CASE_RE = /\b(case|fall|ticket|incident|request|vorgang|trace|journey|instance)\b/i;
const ACTIVITY_RE = /\b(pr[üu]fen|erfassen|anlegen|bearbeiten|freigeben|versenden|validieren|abschlie[ßs]en|weiterleiten|dokumentieren|informieren|eskalieren|zuordnen|bewerten|bestellen|übernehmen|starten|beenden|genehmigen|ablehnen|prüfe|bearbeite|sende|weise zu)\b/i;
const ROLE_RE = /\b(rolle|verantwortlich|zust[äa]ndig|owner|fachbereich|abteilung|team|bearbeiter|sachbearbeiter|agent|user|ressource|resource)\b/i;
const SYSTEM_RE = /\b(system|tool|app|application|anwendung|erp|crm|sap|ticket|workflow|portal|excel|mail|e-?mail|dms)\b/i;
const NARRATIVE_RE = /\b(ich|wir|dann|anschließend|anschliessend|danach|zuerst|später|spaeter|während|waehrend|kund(?:e|in)\s+meldet|am\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)|im anschluss|daraufhin)\b/i;
const HEADING_RE = /^(#{1,5}\s+.+|\d{1,2}(?:\.\d{1,2})*\.?\s+[A-ZÄÖÜ].{3,120}|[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9\s/(),:+-]{6,100}:?)$/;
const LIST_RE = /^\s*(\d{1,2}[.)-]|[a-z][.)]|[-*•])\s+\S/;
const COMMENT_RE = /^\s*(#|\/\/|--|[-*•]{1,2})\s*$/;
const CASE_HEADER_RE = /(^id$|\b(case|fall|ticket|request|incident|trace|journey|instance|vorgang)(?:[_\s-]?(id|nr|nummer|hint|ref|key))?\b)/i;
const ACTIVITY_HEADER_RE = /\b(activity|aktion|schritt|event|task|tätigkeit|taetigkeit|prozess(?:schritt)?|action)\b/i;
const TIME_HEADER_RE = /\b(timestamp|zeit|datum|uhrzeit|created|occurred|logged|start|ende|end|time|date|date_hint|logged_at|created_at|updated_at)\b/i;
const ROLE_HEADER_RE = /\b(rolle|bearbeiter|resource|ressource|owner|agent|user|zust[äa]ndig|role_hint)\b/i;
const SYSTEM_HEADER_RE = /\b(system|system_hint|tool|app|application|anwendung|plattform|portal)\b/i;
const DESCRIPTION_HEADER_RE = /\b(beschreibung|description|text|notiz|kommentar|summary|inhalt|ablauf|freitext|text_fragment|message|details?)\b/i;
const PROCEDURE_HEADER_RE = /\b(schritt|prozess|verantwort|rolle|system|eingabe|ausgabe|entscheidung|regel)\b/i;
const CASE_IDENTIFIER_RE = /^(?:[A-Z]{1,10}\d{2,10}|[A-Z]{1,10}[-_/]\d{1,10}|[A-Z0-9]{2,12}(?:[-_/][A-Z0-9]{1,12}){1,3})$/i;
const ISO_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const ISO_SLASH_DATE_TIME_RE = /^(\d{4})\/(\d{2})\/(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const DE_DATE_TIME_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const US_DATE_TIME_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

type SourceType = ProcessMiningObservationCase['sourceType'];
type DocumentRoutingClass = Extract<
  SourceRoutingClass,
  'structured-procedure' | 'semi-structured-procedure' | 'narrative-case' | 'mixed-document'
>;

interface TextSignalProfile {
  totalLines: number;
  headingShare: number;
  listShare: number;
  tableShare: number;
  consistentTableShare: number;
  timestampShare: number;
  caseShare: number;
  activityShare: number;
  roleShare: number;
  systemShare: number;
  narrativeShare: number;
  longShare: number;
  shortShare: number;
  weakShare: number;
  avgLineLength: number;
  avgWordCount: number;
}

interface TableColumnSignal {
  header: string;
  nonEmptyShare: number;
  shortShare: number;
  longTextShare: number;
  timestampShare: number;
  numericShare: number;
  activityShare: number;
  narrativeShare: number;
  duplicateCoverage: number;
  uniqueShare: number;
  caseScore: number;
  activityScore: number;
  timestampScore: number;
  roleScore: number;
  systemScore: number;
  descriptionScore: number;
}

interface TableSignalProfile {
  rowCount: number;
  columnCount: number;
  consistentWidthShare: number;
  emptyCellShare: number;
  shortCellShare: number;
  freeTextShare: number;
  avgCharsPerRow: number;
  headerProcedureHintShare: number;
  headerNarrativeHintShare: number;
  bestCaseScore: number;
  bestActivityScore: number;
  bestTimestampScore: number;
  bestRoleScore: number;
  bestSystemScore: number;
  bestDescriptionScore: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ratio(part: number, total: number): number {
  if (!total) return 0;
  return part / total;
}

function confidenceFromScore(score: number): SourceRoutingContext['routingConfidence'] {
  if (score >= 0.8) return 'high';
  if (score >= 0.58) return 'medium';
  return 'low';
}

function formatMetric(label: string, value: number): string {
  return `${label}=${value.toFixed(2)}`;
}

function normalizeCell(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeText(text: string | undefined): string {
  return (text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function looksNumeric(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized) return false;
  return /^-?\d+(?:[.,]\d+)?$/.test(normalized);
}

function looksIdentifierLike(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized || /\s/.test(normalized)) return false;
  if (looksNumeric(normalized) && normalized.length <= 3) return false;
  return CASE_IDENTIFIER_RE.test(normalized);
}

function hasStructuredDatePattern(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized || looksIdentifierLike(normalized)) return false;
  return ISO_DATE_TIME_RE.test(normalized)
    || ISO_SLASH_DATE_TIME_RE.test(normalized)
    || DE_DATE_TIME_RE.test(normalized)
    || US_DATE_TIME_RE.test(normalized)
    || TIME_RE.test(normalized);
}

function looksTimestamp(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized) return false;
  return hasStructuredDatePattern(normalized);
}

function looksCaseIdentifier(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized || looksTimestamp(normalized)) return false;
  if (normalized.split(/\s+/).length > 2) return false;
  return looksIdentifierLike(normalized) || (CASE_RE.test(normalized) && /\d/.test(normalized));
}

function looksActivityLabel(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized || looksTimestamp(normalized) || looksNumeric(normalized) || looksIdentifierLike(normalized)) return false;
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount > 8 || normalized.length > 72) return false;
  if (SYSTEM_RE.test(normalized) && !ACTIVITY_RE.test(normalized)) return false;
  if (ROLE_RE.test(normalized) && !ACTIVITY_RE.test(normalized)) return false;
  if (ACTIVITY_RE.test(normalized)) return true;
  return /[A-Za-zÄÖÜäöüß]/.test(normalized) && wordCount >= 2 && wordCount <= 4 && !NARRATIVE_RE.test(normalized) && !SYSTEM_RE.test(normalized) && !ROLE_RE.test(normalized);
}

function duplicateCoverage(values: string[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const repeated = Array.from(counts.values()).reduce((sum, count) => sum + (count > 1 ? count : 0), 0);
  return repeated / values.length;
}

function mostCommonNumber(values: number[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? values[0];
}

function countDelimitedFields(
  line: string,
  delimiter: '|' | '\t' | ';' | ',',
  options?: { requireCompactSegments?: boolean },
): number {
  if (!line.includes(delimiter)) return 0;
  const parts = line.split(delimiter).map(part => part.trim()).filter(Boolean);
  if (parts.length < 3) return 0;
  if (!options?.requireCompactSegments) return parts.length;
  const avgLength = parts.reduce((sum, part) => sum + part.length, 0) / parts.length;
  const compactShare = ratio(parts.filter(part => part.length <= 36).length, parts.length);
  const longShare = ratio(parts.filter(part => part.length >= 80 || part.split(/\s+/).length >= 12).length, parts.length);
  return parts.length >= 4 && avgLength <= 28 && compactShare >= 0.6 && longShare <= 0.2
    ? parts.length
    : 0;
}

function fieldCountForLine(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  const candidates = [
    trimmed.startsWith('|') ? countDelimitedFields(trimmed, '|') : 0,
    countDelimitedFields(trimmed, '\t'),
    countDelimitedFields(trimmed, ';', { requireCompactSegments: true }),
    countDelimitedFields(trimmed, ',', { requireCompactSegments: true }),
  ];
  return Math.max(...candidates);
}

function analyzeTextSignals(text: string): TextSignalProfile {
  const normalized = normalizeText(text);
  const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
  const totalLines = Math.max(lines.length, 1);
  const fieldCounts = lines.map(fieldCountForLine);
  const modalFieldCount = mostCommonNumber(fieldCounts.filter(count => count >= 3));
  const tableRows = fieldCounts.filter(count => count >= 3).length;
  const consistentTableRows = fieldCounts.filter(count => count >= 3 && modalFieldCount >= 3 && Math.abs(count - modalFieldCount) <= 1).length;
  const headingRows = lines.filter(line => HEADING_RE.test(line)).length;
  const listRows = lines.filter(line => LIST_RE.test(line)).length;
  const timestampRows = lines.filter(line => looksTimestamp(line)).length;
  const caseRows = lines.filter(line => CASE_RE.test(line)).length;
  const activityRows = lines.filter(line => ACTIVITY_RE.test(line) || looksActivityLabel(line)).length;
  const roleRows = lines.filter(line => ROLE_RE.test(line)).length;
  const systemRows = lines.filter(line => SYSTEM_RE.test(line)).length;
  const narrativeRows = lines.filter(line => NARRATIVE_RE.test(line)).length;
  const longRows = lines.filter(line => line.length >= 90 || line.split(/\s+/).length >= 14).length;
  const shortRows = lines.filter(line => line.length <= 18).length;
  const weakRows = lines.filter(line => line.length < 5 || COMMENT_RE.test(line)).length;
  const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / totalLines;
  const avgWordCount = lines.reduce((sum, line) => sum + line.split(/\s+/).length, 0) / totalLines;

  return {
    totalLines: lines.length,
    headingShare: ratio(headingRows, totalLines),
    listShare: ratio(listRows, totalLines),
    tableShare: ratio(tableRows, totalLines),
    consistentTableShare: ratio(consistentTableRows, totalLines),
    timestampShare: ratio(timestampRows, totalLines),
    caseShare: ratio(caseRows, totalLines),
    activityShare: ratio(activityRows, totalLines),
    roleShare: ratio(roleRows, totalLines),
    systemShare: ratio(systemRows, totalLines),
    narrativeShare: ratio(narrativeRows, totalLines),
    longShare: ratio(longRows, totalLines),
    shortShare: ratio(shortRows, totalLines),
    weakShare: ratio(weakRows, totalLines),
    avgLineLength,
    avgWordCount,
  };
}

function analyzeColumn(headers: string[], rows: string[][], index: number): TableColumnSignal {
  const header = normalizeCell(headers[index] ?? `Spalte ${index + 1}`);
  const values = rows.map(row => normalizeCell(row[index])).filter(Boolean);
  const total = Math.max(values.length, 1);
  const nonEmptyShare = ratio(values.length, Math.max(rows.length, 1));
  const shortShare = ratio(values.filter(value => value.length <= 36).length, total);
  const longTextShare = ratio(values.filter(value => value.length >= 80 || value.split(/\s+/).length >= 12).length, total);
  const timestampShare = ratio(values.filter(looksTimestamp).length, total);
  const numericShare = ratio(values.filter(looksNumeric).length, total);
  const activityShare = ratio(values.filter(looksActivityLabel).length, total);
  const narrativeShare = ratio(values.filter(value => NARRATIVE_RE.test(value) || value.split(/\s+/).length >= 16).length, total);
  const uniqueShare = ratio(new Set(values).size, total);
  const duplicateShare = duplicateCoverage(values);
  const caseLikeShare = ratio(values.filter(looksCaseIdentifier).length, total);
  const identifierShare = ratio(values.filter(looksIdentifierLike).length, total);
  const roleLikeShare = ratio(values.filter(value => ROLE_RE.test(value)).length, total);
  const systemLikeShare = ratio(values.filter(value => SYSTEM_RE.test(value) || (/^[A-Z0-9_-]{2,16}$/.test(value) && !looksNumeric(value) && !looksIdentifierLike(value))).length, total);
  const lowLongTextBonus = 1 - longTextShare;

  const caseScore = clamp01(
    (CASE_HEADER_RE.test(header) ? 0.32 : 0) +
      caseLikeShare * 0.34 +
      identifierShare * 0.12 +
      duplicateShare * 0.16 +
      (uniqueShare >= 0.08 && uniqueShare <= 0.92 ? 0.14 : uniqueShare <= 0.98 ? 0.06 : 0) +
      shortShare * 0.08 +
      nonEmptyShare * 0.06 +
      lowLongTextBonus * 0.06 -
      (timestampShare > 0.45 && caseLikeShare < 0.4 ? 0.18 : 0),
  );

  const activityScore = clamp01(
    (ACTIVITY_HEADER_RE.test(header) ? 0.28 : 0) +
      activityShare * 0.44 +
      shortShare * 0.08 +
      nonEmptyShare * 0.08 +
      lowLongTextBonus * 0.06 -
      ((SYSTEM_HEADER_RE.test(header) || ROLE_HEADER_RE.test(header) || DESCRIPTION_HEADER_RE.test(header) || CASE_HEADER_RE.test(header) || TIME_HEADER_RE.test(header)) && !ACTIVITY_HEADER_RE.test(header) ? 0.24 : 0) -
      (systemLikeShare > 0.55 && activityShare < 0.55 ? 0.18 : 0) -
      (roleLikeShare > 0.55 && activityShare < 0.55 ? 0.14 : 0) -
      (timestampShare > 0.25 ? 0.08 : 0),
  );

  const timestampScore = clamp01(
    (TIME_HEADER_RE.test(header) ? 0.34 : 0) +
      timestampShare * 0.58 +
      nonEmptyShare * 0.08 -
      ((!TIME_HEADER_RE.test(header) && (CASE_HEADER_RE.test(header) || SYSTEM_HEADER_RE.test(header) || ROLE_HEADER_RE.test(header) || DESCRIPTION_HEADER_RE.test(header))) ? 0.22 : 0) -
      (identifierShare > 0.25 ? 0.24 : 0) -
      (caseLikeShare > 0.25 ? 0.18 : 0),
  );

  const roleScore = clamp01(
    (ROLE_HEADER_RE.test(header) ? 0.44 : 0) +
      nonEmptyShare * 0.14 +
      shortShare * 0.12 +
      lowLongTextBonus * 0.12 +
      (ROLE_RE.test(values.slice(0, 6).join(' ')) ? 0.2 : 0),
  );

  const systemScore = clamp01(
    (SYSTEM_HEADER_RE.test(header) ? 0.46 : 0) +
      nonEmptyShare * 0.14 +
      shortShare * 0.1 +
      lowLongTextBonus * 0.12 +
      (SYSTEM_RE.test(values.slice(0, 6).join(' ')) ? 0.22 : 0),
  );

  const descriptionScore = clamp01(
    (DESCRIPTION_HEADER_RE.test(header) ? 0.35 : 0) +
      longTextShare * 0.28 +
      narrativeShare * 0.22 +
      nonEmptyShare * 0.1 +
      (values.length > 0 && values.reduce((sum, value) => sum + value.length, 0) / values.length >= 90 ? 0.12 : 0),
  );

  return {
    header,
    nonEmptyShare,
    shortShare,
    longTextShare,
    timestampShare,
    numericShare,
    activityShare,
    narrativeShare,
    duplicateCoverage: duplicateShare,
    uniqueShare,
    caseScore,
    activityScore,
    timestampScore,
    roleScore,
    systemScore,
    descriptionScore,
  };
}

function analyzeTableSignals(headers: string[], rows: string[][]): TableSignalProfile {
  const normalizedHeaders = headers.map(normalizeCell);
  const normalizedRows = rows.map(row => row.map(value => normalizeCell(value)));
  const rowCount = normalizedRows.length;
  const rowWidths = normalizedRows.map(row => row.length);
  const modalWidth = mostCommonNumber(rowWidths);
  const consistentWidthShare = ratio(
    normalizedRows.filter(row => modalWidth > 0 && Math.abs(row.length - modalWidth) <= 1).length,
    Math.max(rowCount, 1),
  );

  const columnCount = Math.max(normalizedHeaders.length, modalWidth, 1);
  const allCells = normalizedRows.flatMap(row => {
    const padded = Array.from({ length: columnCount }, (_, index) => normalizeCell(row[index]));
    return padded;
  });
  const nonEmptyCells = allCells.filter(Boolean);
  const emptyCellShare = 1 - ratio(nonEmptyCells.length, Math.max(allCells.length, 1));
  const shortCellShare = ratio(nonEmptyCells.filter(cell => cell.length <= 32).length, Math.max(nonEmptyCells.length, 1));
  const freeTextShare = ratio(
    nonEmptyCells.filter(cell => cell.length >= 80 || cell.split(/\s+/).length >= 12 || NARRATIVE_RE.test(cell)).length,
    Math.max(nonEmptyCells.length, 1),
  );
  const avgCharsPerRow = normalizedRows.reduce((sum, row) => sum + row.join(' ').length, 0) / Math.max(rowCount, 1);

  const headerProcedureHintShare = ratio(
    normalizedHeaders.filter(header => PROCEDURE_HEADER_RE.test(header)).length,
    Math.max(normalizedHeaders.length, 1),
  );
  const headerNarrativeHintShare = ratio(
    normalizedHeaders.filter(header => DESCRIPTION_HEADER_RE.test(header)).length,
    Math.max(normalizedHeaders.length, 1),
  );

  const columns = Array.from({ length: columnCount }, (_, index) => analyzeColumn(normalizedHeaders, normalizedRows, index));
  const bestCaseScore = Math.max(...columns.map(column => column.caseScore), 0);
  const bestActivityScore = Math.max(...columns.map(column => column.activityScore), 0);
  const bestTimestampScore = Math.max(...columns.map(column => column.timestampScore), 0);
  const bestRoleScore = Math.max(...columns.map(column => column.roleScore), 0);
  const bestSystemScore = Math.max(...columns.map(column => column.systemScore), 0);
  const bestDescriptionScore = Math.max(...columns.map(column => column.descriptionScore), 0);

  return {
    rowCount,
    columnCount,
    consistentWidthShare,
    emptyCellShare,
    shortCellShare,
    freeTextShare,
    avgCharsPerRow,
    headerProcedureHintShare,
    headerNarrativeHintShare,
    bestCaseScore,
    bestActivityScore,
    bestTimestampScore,
    bestRoleScore,
    bestSystemScore,
    bestDescriptionScore,
  };
}

function buildWeakRoutingContext(
  signals: string[],
  fallbackReason: string,
): SourceRoutingContext {
  return {
    routingClass: 'weak-raw-table',
    routingConfidence: 'low',
    routingSignals: signals,
    fallbackReason,
  };
}

function isDocumentSourceType(sourceType?: SourceType): boolean {
  return sourceType === 'pdf' || sourceType === 'docx' || sourceType === 'narrative';
}

function mapDocumentClassToRoutingClass(classType: StructuredDocumentClass): DocumentRoutingClass | undefined {
  switch (classType) {
    case 'structured-target-procedure':
      return 'structured-procedure';
    case 'semi-structured-procedure':
      return 'semi-structured-procedure';
    case 'narrative-case':
      return 'narrative-case';
    case 'mixed-document':
      return 'mixed-document';
    default:
      return undefined;
  }
}

function buildRoutingContext(
  routingClass: SourceRoutingClass,
  score: number,
  routingSignals: string[],
  extra?: { fallbackReason?: string },
): SourceRoutingContext {
  return {
    routingClass,
    routingConfidence: confidenceFromScore(score),
    routingSignals,
    ...(extra?.fallbackReason ? { fallbackReason: extra.fallbackReason } : {}),
  };
}

function routingScoreForClass(
  routingClass: DocumentRoutingClass,
  scores: {
    structuredScore: number;
    semiStructuredScore: number;
    narrativeScore: number;
    mixedScore: number;
  },
): number {
  switch (routingClass) {
    case 'structured-procedure':
      return scores.structuredScore;
    case 'semi-structured-procedure':
      return scores.semiStructuredScore;
    case 'narrative-case':
      return scores.narrativeScore;
    case 'mixed-document':
      return scores.mixedScore;
    default:
      return 0;
  }
}

function inferDocumentPrimaryClass(params: {
  sourceType?: SourceType;
  signals: TextSignalProfile;
  structureDensity: number;
  tableDensity: number;
  narrativeDensity: number;
  classifierClass: StructuredDocumentClass;
}): {
  routingClass?: DocumentRoutingClass;
  reason?: string;
  confidenceFloor?: number;
} {
  const { signals, structureDensity, tableDensity, narrativeDensity } = params;
  const canPromoteSemiStructuredDocument =
    isDocumentSourceType(params.sourceType) &&
    structureDensity >= 0.42 &&
    signals.activityShare >= 0.22 &&
    narrativeDensity < 0.18;

  if (params.classifierClass === 'structured-target-procedure') {
    return {
      routingClass: 'structured-procedure',
      reason: 'documentClassifier=structured-target-procedure',
      confidenceFloor: 0.74,
    };
  }

  if (params.classifierClass === 'semi-structured-procedure' && canPromoteSemiStructuredDocument) {
    return {
      routingClass: 'structured-procedure',
      reason: 'documentPrimary=promoted-structured',
      confidenceFloor: 0.68,
    };
  }

  const classifierRoutingClass = mapDocumentClassToRoutingClass(params.classifierClass);
  if (classifierRoutingClass) {
    return {
      routingClass: classifierRoutingClass,
      reason: `documentClassifier=${params.classifierClass}`,
      confidenceFloor: 0.62,
    };
  }

  if (!isDocumentSourceType(params.sourceType)) return {};

  if (
    signals.caseShare >= 0.12 &&
    signals.activityShare >= 0.14 &&
    (narrativeDensity >= 0.12 || signals.timestampShare >= 0.04 || signals.avgLineLength >= 80)
  ) {
    return {
      routingClass: structureDensity >= 0.12 || tableDensity >= 0.08 ? 'mixed-document' : 'narrative-case',
      reason: 'documentPrimary=case-timeline',
      confidenceFloor: 0.58,
    };
  }

  if (
    signals.activityShare >= 0.28 &&
    (structureDensity >= 0.12 || tableDensity >= 0.08) &&
    (signals.longShare >= 0.08 || signals.caseShare >= 0.05 || signals.systemShare >= 0.05)
  ) {
    return {
      routingClass: structureDensity >= 0.32 && signals.narrativeShare < 0.14
        ? 'semi-structured-procedure'
        : 'mixed-document',
      reason: 'documentPrimary=flow-with-context',
      confidenceFloor: 0.56,
    };
  }

  if (
    structureDensity >= 0.24 &&
    signals.activityShare >= 0.18 &&
    narrativeDensity < 0.18 &&
    signals.caseShare < 0.12
  ) {
    return {
      routingClass: structureDensity >= 0.42 ? 'structured-procedure' : 'semi-structured-procedure',
      reason: 'documentPrimary=structured-flow',
      confidenceFloor: 0.56,
    };
  }

  if (narrativeDensity >= 0.16 && signals.avgLineLength >= 70 && signals.activityShare >= 0.1) {
    return {
      routingClass: 'narrative-case',
      reason: 'documentPrimary=narrative-density',
      confidenceFloor: 0.54,
    };
  }

  return {};
}

function hasClearWeakCounterEvidence(params: {
  isDocumentSource: boolean;
  signals: TextSignalProfile;
  structureDensity: number;
  narrativeDensity: number;
}): boolean {
  const { isDocumentSource, signals, structureDensity, narrativeDensity } = params;
  if (signals.totalLines < 3) return true;
  if (
    signals.weakShare >= 0.72 &&
    structureDensity < 0.08 &&
    narrativeDensity < 0.08 &&
    signals.activityShare < 0.08
  ) {
    return true;
  }
  return !isDocumentSource && signals.weakShare >= 0.55;
}

function hasClearEventlogCounterEvidence(params: {
  sourceType?: SourceType;
  classifierClass: StructuredDocumentClass;
  eventlogScore: number;
  effectiveTableDensity: number;
  signals: TextSignalProfile;
}): boolean {
  const { sourceType, classifierClass, eventlogScore, effectiveTableDensity, signals } = params;
  if (!isDocumentSourceType(sourceType)) {
    return (
      eventlogScore >= (sourceType === 'narrative' ? 0.82 : 0.72) &&
      effectiveTableDensity >= 0.45 &&
      signals.consistentTableShare >= 0.28 &&
      signals.timestampShare >= 0.12 &&
      signals.activityShare >= 0.1 &&
      signals.longShare < 0.24
    );
  }
  return (
    (classifierClass === 'weak-material' || classifierClass === 'mixed-document') &&
    eventlogScore >= 0.84 &&
    effectiveTableDensity >= 0.64 &&
    signals.consistentTableShare >= 0.42 &&
    signals.timestampShare >= 0.16 &&
    signals.activityShare >= 0.14 &&
    signals.longShare < 0.18
  );
}

function routeTextSource(input: {
  text: string;
  sourceType?: SourceType;
}): SourceRoutingContext {
  const sourceType = input.sourceType;
  const isDocumentSource = isDocumentSourceType(sourceType);
  const signals = analyzeTextSignals(input.text);
  const documentClassification = classifyDocumentStructure(input.text);
  const sourceBiasStructured = sourceType === 'pdf' || sourceType === 'docx' ? 0.08 : 0;
  const sourceBiasNarrative = sourceType === 'narrative' ? 0.08 : 0;
  const sourceBiasTable = sourceType === 'csv-row' || sourceType === 'xlsx-row' || sourceType === 'eventlog' ? 0.05 : 0;
  const sourceBiasAgainstEventlog = sourceType === 'narrative' ? 0.12 : isDocumentSource ? 0.08 : 0;

  const structureDensity = clamp01(signals.headingShare + signals.listShare);
  const tableDensity = clamp01(signals.tableShare + signals.consistentTableShare * 0.5);
  const effectiveTableDensity = isDocumentSource
    ? Math.min(tableDensity, Math.max(structureDensity * 0.75, 0.18))
    : tableDensity;
  const narrativeDensity = clamp01(signals.narrativeShare + signals.longShare * 0.4);

  const eventlogScore = clamp01(
    effectiveTableDensity * 0.32 +
      signals.timestampShare * 0.18 +
      signals.caseShare * 0.15 +
      signals.activityShare * 0.15 +
      signals.shortShare * 0.1 +
      signals.consistentTableShare * (isDocumentSource ? 0.08 : 0.12) +
      sourceBiasTable -
      signals.longShare * 0.14 -
      sourceBiasAgainstEventlog,
  );

  const structuredScore = clamp01(
    structureDensity * 0.42 +
      signals.activityShare * 0.22 +
      signals.roleShare * 0.1 +
      signals.systemShare * 0.08 +
      signals.consistentTableShare * 0.08 +
      sourceBiasStructured -
      narrativeDensity * 0.08,
  );

  const semiStructuredScore = clamp01(
    structureDensity * 0.24 +
      effectiveTableDensity * 0.22 +
      signals.activityShare * 0.2 +
      signals.roleShare * 0.08 +
      signals.systemShare * 0.06 +
      signals.caseShare * 0.05 +
      signals.longShare * 0.1 +
      sourceBiasStructured,
  );

  const narrativeScore = clamp01(
    narrativeDensity * 0.42 +
      signals.timestampShare * 0.12 +
      signals.activityShare * 0.1 +
      signals.caseShare * 0.08 +
      (signals.avgLineLength >= 80 ? 0.12 : signals.avgLineLength / 80 * 0.12) +
      sourceBiasNarrative -
      effectiveTableDensity * 0.08,
  );

  const mixedScore = clamp01(
    Math.max(structureDensity, effectiveTableDensity) * 0.34 +
      narrativeDensity * 0.3 +
      signals.activityShare * 0.12 +
      signals.roleShare * 0.08 +
      signals.systemShare * 0.08 +
      signals.caseShare * 0.08,
  );

  const routingSignals = [
    formatMetric('structureDensity', structureDensity),
    formatMetric('tableDensity', tableDensity),
    formatMetric('effectiveTableDensity', effectiveTableDensity),
    formatMetric('narrativeDensity', narrativeDensity),
    formatMetric('activityDensity', signals.activityShare),
    formatMetric('timestampDensity', signals.timestampShare),
    formatMetric('weakFragmentShare', signals.weakShare),
    `documentClassifier=${documentClassification.classType}`,
    formatMetric('avgLineLength', Math.min(signals.avgLineLength / 120, 1)),
  ];

  if (hasClearWeakCounterEvidence({
    isDocumentSource,
    signals,
    structureDensity,
    narrativeDensity,
  })) {
    return buildWeakRoutingContext(
      [...routingSignals, 'defensiveDowngrade=too-little-structure'],
      'Zu wenig belastbare Struktur- oder Inhaltsdichte für einen stabilen Analysepfad.',
    );
  }

  const clearEventlogCounterEvidence = hasClearEventlogCounterEvidence({
    sourceType,
    classifierClass: documentClassification.classType,
    eventlogScore,
    effectiveTableDensity,
    signals,
  });

  const guardedDocumentRouting = inferDocumentPrimaryClass({
    sourceType,
    signals,
    structureDensity,
    tableDensity: effectiveTableDensity,
    narrativeDensity,
    classifierClass: documentClassification.classType,
  });

  if (isDocumentSource && guardedDocumentRouting.routingClass && !clearEventlogCounterEvidence) {
    const guardScore = Math.max(
      routingScoreForClass(guardedDocumentRouting.routingClass, {
        structuredScore,
        semiStructuredScore,
        narrativeScore,
        mixedScore,
      }),
      guardedDocumentRouting.confidenceFloor ?? 0.54,
    );
    return buildRoutingContext(
      guardedDocumentRouting.routingClass,
      guardScore,
      [
        ...routingSignals,
        guardedDocumentRouting.reason ?? 'documentPriority=primary-signals',
        'documentPriority=primary-signals',
        formatMetric('eventlogScore', eventlogScore),
      ],
    );
  }

  if (clearEventlogCounterEvidence) {
    return buildRoutingContext(
      'eventlog-table',
      eventlogScore,
      [...routingSignals, formatMetric('eventlogScore', eventlogScore)],
    );
  }

  if (structuredScore >= 0.62 && structureDensity >= 0.22 && signals.activityShare >= 0.12 && narrativeDensity < 0.45) {
    return buildRoutingContext(
      'structured-procedure',
      structuredScore,
      [...routingSignals, formatMetric('structuredScore', structuredScore)],
    );
  }

  if (semiStructuredScore >= 0.56 && (effectiveTableDensity >= 0.18 || structureDensity >= 0.18) && signals.activityShare >= 0.1) {
    return buildRoutingContext(
      'semi-structured-procedure',
      semiStructuredScore,
      [...routingSignals, formatMetric('semiStructuredScore', semiStructuredScore)],
    );
  }

  if (mixedScore >= 0.5 && narrativeDensity >= 0.14 && (structureDensity >= 0.12 || effectiveTableDensity >= 0.14)) {
    return buildRoutingContext(
      'mixed-document',
      mixedScore,
      [...routingSignals, formatMetric('mixedScore', mixedScore)],
    );
  }

  if (narrativeScore >= 0.52 && narrativeDensity >= 0.18 && effectiveTableDensity < 0.45) {
    return buildRoutingContext(
      'narrative-case',
      narrativeScore,
      [...routingSignals, formatMetric('narrativeScore', narrativeScore)],
    );
  }

  return buildWeakRoutingContext(
    [...routingSignals, 'defensiveDowngrade=ambiguous-text'],
    'Signale bleiben widersprüchlich; das Material wird vorsichtig in einen schwächeren Modus gelegt.',
  );
}

function routeTableSource(input: {
  headers: string[];
  rows: string[][];
}): SourceRoutingContext {
  const signals = analyzeTableSignals(input.headers, input.rows);
  const eventlogScore = clamp01(
    signals.bestCaseScore * 0.28 +
      signals.bestActivityScore * 0.28 +
      signals.bestTimestampScore * 0.24 +
      signals.consistentWidthShare * 0.1 +
      signals.shortCellShare * 0.08 +
      (1 - signals.freeTextShare) * 0.08,
  );
  const procedureScore = clamp01(
    signals.bestActivityScore * 0.34 +
      signals.headerProcedureHintShare * 0.18 +
      signals.bestRoleScore * 0.12 +
      signals.bestSystemScore * 0.1 +
      signals.consistentWidthShare * 0.12 +
      (1 - signals.freeTextShare) * 0.14,
  );
  const mixedScore = clamp01(
    signals.freeTextShare * 0.34 +
      signals.bestDescriptionScore * 0.24 +
      signals.bestActivityScore * 0.12 +
      signals.bestCaseScore * 0.08 +
      signals.headerNarrativeHintShare * 0.12 +
      Math.min(signals.avgCharsPerRow / 220, 1) * 0.1,
  );

  const routingSignals = [
    `rows=${signals.rowCount}`,
    `cols=${signals.columnCount}`,
    formatMetric('widthConsistency', signals.consistentWidthShare),
    formatMetric('freeTextShare', signals.freeTextShare),
    formatMetric('emptyCellShare', signals.emptyCellShare),
    formatMetric('caseScore', signals.bestCaseScore),
    formatMetric('activityScore', signals.bestActivityScore),
    formatMetric('timestampScore', signals.bestTimestampScore),
  ];

  if (signals.rowCount < 3 || signals.consistentWidthShare < 0.55 || signals.emptyCellShare > 0.68) {
    return buildWeakRoutingContext(
      [...routingSignals, 'defensiveDowngrade=unstable-table-shape'],
      'Tabellenform und Zellverteilung sind zu instabil für eine belastbare Pfadentscheidung.',
    );
  }

  if (
    eventlogScore >= 0.68 &&
    signals.rowCount >= 6 &&
    signals.bestCaseScore >= 0.45 &&
    signals.bestActivityScore >= 0.5 &&
    signals.bestTimestampScore >= 0.4 &&
    signals.freeTextShare < 0.28
  ) {
    return {
      routingClass: 'eventlog-table',
      routingConfidence: confidenceFromScore(eventlogScore),
      routingSignals: [...routingSignals, formatMetric('eventlogScore', eventlogScore)],
    };
  }

  if (procedureScore >= 0.56 && signals.bestActivityScore >= 0.45 && signals.freeTextShare < 0.42) {
    return {
      routingClass: 'semi-structured-procedure',
      routingConfidence: confidenceFromScore(procedureScore),
      routingSignals: [...routingSignals, formatMetric('procedureScore', procedureScore)],
    };
  }

  if (mixedScore >= 0.5 && signals.freeTextShare >= 0.18) {
    return {
      routingClass: 'mixed-document',
      routingConfidence: confidenceFromScore(mixedScore),
      routingSignals: [...routingSignals, formatMetric('mixedScore', mixedScore)],
      fallbackReason: 'Die Tabelle enthält relevante Struktur, aber zu viel Freitext oder Kommentaranteil für einen starken Eventlog-Pfad.',
    };
  }

  return buildWeakRoutingContext(
    [...routingSignals, 'defensiveDowngrade=no-strong-table-path'],
    'Weder Eventlog- noch Verfahrenssignale reichen aus; die Tabelle bleibt im defensiven Rohmodus.',
  );
}

export function routeSourceMaterial(input: {
  text?: string;
  sourceType?: SourceType;
  headers?: string[];
  rows?: string[][];
}): SourceRoutingContext {
  if (input.headers && input.rows) {
    return routeTableSource({
      headers: input.headers,
      rows: input.rows,
    });
  }

  return routeTextSource({
    text: input.text ?? '',
    sourceType: input.sourceType,
  });
}

export function mapRoutingClassToDocumentKind(routingClass: SourceRoutingClass): 'procedure-document' | 'semi-structured-procedure-document' | 'case-narrative' | 'mixed-document' | 'weak-material' | 'unknown' {
  switch (routingClass) {
    case 'structured-procedure':
      return 'procedure-document';
    case 'semi-structured-procedure':
      return 'semi-structured-procedure-document';
    case 'narrative-case':
      return 'case-narrative';
    case 'mixed-document':
      return 'mixed-document';
    case 'eventlog-table':
    case 'weak-raw-table':
      return 'weak-material';
    default:
      return 'unknown';
  }
}
