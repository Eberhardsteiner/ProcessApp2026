import type {
  ProcessMiningObservationCase,
  SourceRoutingClass,
  SourceRoutingContext,
} from '../domain/process';

const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\.\d{2}\.\d{4}\b/i;
const CASE_RE = /\b(case|fall|ticket|incident|request|vorgang|trace|journey|instance)\b/i;
const ACTIVITY_RE = /\b(pr[üu]fen|erfassen|anlegen|bearbeiten|freigeben|versenden|validieren|abschlie[ßs]en|weiterleiten|dokumentieren|informieren|eskalieren|zuordnen|bewerten|bestellen|übernehmen|starten|beenden|genehmigen|ablehnen|prüfe|bearbeite|sende|weise zu)\b/i;
const ROLE_RE = /\b(rolle|verantwortlich|zust[äa]ndig|owner|fachbereich|abteilung|team|bearbeiter|sachbearbeiter|agent|user|ressource|resource)\b/i;
const SYSTEM_RE = /\b(system|tool|app|application|anwendung|erp|crm|sap|ticket|workflow|portal|excel|mail|e-?mail|dms)\b/i;
const NARRATIVE_RE = /\b(ich|wir|dann|anschließend|anschliessend|danach|zuerst|später|spaeter|während|waehrend|kund(?:e|in)\s+meldet|am\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)|im anschluss|daraufhin)\b/i;
const HEADING_RE = /^(#{1,5}\s+.+|\d{1,2}(?:\.\d{1,2})*\.?\s+[A-ZÄÖÜ].{3,120}|[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9\s/(),:+-]{6,100}:?)$/;
const LIST_RE = /^\s*(\d{1,2}[.)-]|[a-z][.)]|[-*•])\s+\S/;
const COMMENT_RE = /^\s*(#|\/\/|--|[-*•]{1,2})\s*$/;
const CASE_HEADER_RE = /(case|fall|ticket|vorgang|trace|instance).{0,10}(id|nr|nummer)?|(^id$)/i;
const ACTIVITY_HEADER_RE = /(activity|aktion|schritt|event|tätigkeit|taetigkeit|prozessschritt|prozess)/i;
const TIME_HEADER_RE = /(timestamp|zeit|datum|uhrzeit|created|start|ende|end|time|date|index|reihenfolge)/i;
const ROLE_HEADER_RE = /(rolle|bearbeiter|resource|ressource|owner|agent|user|zust[äa]ndig)/i;
const SYSTEM_HEADER_RE = /(system|tool|app|application|anwendung|quelle|source|plattform)/i;
const DESCRIPTION_HEADER_RE = /(beschreibung|description|text|notiz|kommentar|summary|inhalt|ablauf|freitext)/i;
const PROCEDURE_HEADER_RE = /(schritt|prozess|verantwort|rolle|system|eingabe|ausgabe|entscheidung|regel)/i;

type SourceType = ProcessMiningObservationCase['sourceType'];

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

function looksTimestamp(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized) return false;
  return !Number.isNaN(Date.parse(normalized)) || TIME_RE.test(normalized);
}

function looksNumeric(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized) return false;
  return /^-?\d+(?:[.,]\d+)?$/.test(normalized);
}

function looksActivityLabel(value: string): boolean {
  const normalized = normalizeCell(value);
  if (!normalized || looksTimestamp(normalized) || looksNumeric(normalized)) return false;
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount > 8 || normalized.length > 72) return false;
  if (ACTIVITY_RE.test(normalized)) return true;
  return /[A-Za-zÄÖÜäöüß]/.test(normalized) && wordCount >= 1 && wordCount <= 5 && !NARRATIVE_RE.test(normalized);
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

function fieldCountForLine(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  const candidates = [
    trimmed.startsWith('|')
      ? trimmed.split('|').map(part => part.trim()).filter(Boolean).length
      : 0,
    trimmed.includes('\t') ? trimmed.split('\t').filter(part => part.trim().length > 0).length : 0,
    trimmed.includes(';') ? trimmed.split(';').filter(part => part.trim().length > 0).length : 0,
    trimmed.includes(',') ? trimmed.split(',').filter(part => part.trim().length > 0).length : 0,
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
  const lowLongTextBonus = 1 - longTextShare;
  const lowTimestampBonus = 1 - timestampShare;

  const caseScore = clamp01(
    (CASE_HEADER_RE.test(header) ? 0.28 : 0) +
      duplicateShare * 0.28 +
      (uniqueShare >= 0.08 && uniqueShare <= 0.92 ? 0.18 : uniqueShare <= 0.98 ? 0.08 : 0) +
      shortShare * 0.12 +
      nonEmptyShare * 0.08 +
      lowLongTextBonus * 0.06,
  );

  const activityScore = clamp01(
    (ACTIVITY_HEADER_RE.test(header) ? 0.25 : 0) +
      activityShare * 0.4 +
      shortShare * 0.12 +
      nonEmptyShare * 0.08 +
      lowTimestampBonus * 0.08 +
      lowLongTextBonus * 0.07,
  );

  const timestampScore = clamp01(
    (TIME_HEADER_RE.test(header) ? 0.3 : 0) +
      timestampShare * 0.5 +
      nonEmptyShare * 0.1 +
      (numericShare >= 0.75 ? 0.08 : 0),
  );

  const roleScore = clamp01(
    (ROLE_HEADER_RE.test(header) ? 0.42 : 0) +
      nonEmptyShare * 0.14 +
      shortShare * 0.12 +
      lowLongTextBonus * 0.12 +
      (ROLE_RE.test(values.slice(0, 6).join(' ')) ? 0.2 : 0),
  );

  const systemScore = clamp01(
    (SYSTEM_HEADER_RE.test(header) ? 0.42 : 0) +
      nonEmptyShare * 0.14 +
      shortShare * 0.1 +
      lowLongTextBonus * 0.12 +
      (SYSTEM_RE.test(values.slice(0, 6).join(' ')) ? 0.2 : 0),
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

function routeTextSource(input: {
  text: string;
  sourceType?: SourceType;
}): SourceRoutingContext {
  const sourceType = input.sourceType;
  const signals = analyzeTextSignals(input.text);
  const sourceBiasStructured = sourceType === 'pdf' || sourceType === 'docx' ? 0.05 : 0;
  const sourceBiasNarrative = sourceType === 'narrative' ? 0.06 : 0;
  const sourceBiasTable = sourceType === 'csv-row' || sourceType === 'xlsx-row' || sourceType === 'eventlog' ? 0.05 : 0;
  const sourceBiasAgainstEventlog = sourceType === 'narrative' ? 0.1 : 0;

  const structureDensity = clamp01(signals.headingShare + signals.listShare);
  const tableDensity = clamp01(signals.tableShare + signals.consistentTableShare * 0.5);
  const narrativeDensity = clamp01(signals.narrativeShare + signals.longShare * 0.4);

  const eventlogScore = clamp01(
    tableDensity * 0.32 +
      signals.timestampShare * 0.18 +
      signals.caseShare * 0.15 +
      signals.activityShare * 0.15 +
      signals.shortShare * 0.1 +
      signals.consistentTableShare * 0.12 +
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
      tableDensity * 0.22 +
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
      tableDensity * 0.12,
  );

  const mixedScore = clamp01(
    Math.max(structureDensity, tableDensity) * 0.34 +
      narrativeDensity * 0.3 +
      signals.activityShare * 0.12 +
      signals.roleShare * 0.08 +
      signals.systemShare * 0.08 +
      signals.caseShare * 0.08,
  );

  const routingSignals = [
    formatMetric('structureDensity', structureDensity),
    formatMetric('tableDensity', tableDensity),
    formatMetric('narrativeDensity', narrativeDensity),
    formatMetric('activityDensity', signals.activityShare),
    formatMetric('timestampDensity', signals.timestampShare),
    formatMetric('weakFragmentShare', signals.weakShare),
    formatMetric('avgLineLength', Math.min(signals.avgLineLength / 120, 1)),
  ];

  if (signals.totalLines < 3 || signals.weakShare >= 0.55) {
    return buildWeakRoutingContext(
      [...routingSignals, 'defensiveDowngrade=too-little-structure'],
      'Zu wenig belastbare Struktur- oder Inhaltsdichte für einen stabilen Analysepfad.',
    );
  }

  if (
    eventlogScore >= (sourceType === 'narrative' ? 0.82 : 0.72) &&
    tableDensity >= 0.45 &&
    signals.consistentTableShare >= 0.28 &&
    signals.timestampShare >= 0.12 &&
    signals.activityShare >= 0.1 &&
    signals.longShare < 0.24
  ) {
    return {
      routingClass: 'eventlog-table',
      routingConfidence: confidenceFromScore(eventlogScore),
      routingSignals: [...routingSignals, formatMetric('eventlogScore', eventlogScore)],
    };
  }

  if (structuredScore >= 0.62 && structureDensity >= 0.22 && signals.activityShare >= 0.12 && narrativeDensity < 0.45) {
    return {
      routingClass: 'structured-procedure',
      routingConfidence: confidenceFromScore(structuredScore),
      routingSignals: [...routingSignals, formatMetric('structuredScore', structuredScore)],
    };
  }

  if (semiStructuredScore >= 0.56 && (tableDensity >= 0.18 || structureDensity >= 0.18) && signals.activityShare >= 0.1) {
    return {
      routingClass: 'semi-structured-procedure',
      routingConfidence: confidenceFromScore(semiStructuredScore),
      routingSignals: [...routingSignals, formatMetric('semiStructuredScore', semiStructuredScore)],
    };
  }

  if (mixedScore >= 0.5 && narrativeDensity >= 0.14 && (structureDensity >= 0.12 || tableDensity >= 0.14)) {
    return {
      routingClass: 'mixed-document',
      routingConfidence: confidenceFromScore(mixedScore),
      routingSignals: [...routingSignals, formatMetric('mixedScore', mixedScore)],
    };
  }

  if (narrativeScore >= 0.52 && narrativeDensity >= 0.18 && tableDensity < 0.45) {
    return {
      routingClass: 'narrative-case',
      routingConfidence: confidenceFromScore(narrativeScore),
      routingSignals: [...routingSignals, formatMetric('narrativeScore', narrativeScore)],
    };
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
