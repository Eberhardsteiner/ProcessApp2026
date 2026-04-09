import type {
  ProcessMiningObservationCase,
  ProcessMiningObservation,
} from '../../domain/process';
import { parseCsvText } from '../../import/csv';
import type { XlsxSheet } from '../../import/extractTextFromXlsx';

export type FileImportMode = 'narrative' | 'eventlog';

export interface ImportColumn {
  index: number;
  label: string;
}

export interface CsvImportConfig {
  mode: FileImportMode;
  descriptionColIdx: number;
  nameColIdx: number;
  idColIdx: number;
  timestampColIdx: number;
  sourceColIdx: number;
  activityColIdx: number;
  caseIdColIdx: number;
  roleColIdx: number;
  systemColIdx: number;
}

export interface FileImportPreview {
  fileName: string;
  fileType: 'docx' | 'pdf' | 'csv' | 'xlsx';
  text?: string;
  csvHeaders?: string[];
  csvRows?: string[][];
  xlsxSheets?: XlsxSheet[];
  detectedMode?: FileImportMode;
  warnings: string[];
}

export interface FileImportResult {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  warnings: string[];
}

const EVENT_LOG_HEADER_HINTS = [
  'case', 'case id', 'caseid', 'fall', 'ticket', 'vorgang',
  'activity', 'aktivität', 'aktion', 'step', 'schritt',
  'timestamp', 'datum', 'zeit', 'time', 'date',
];
const NARRATIVE_HEADER_HINTS = [
  'beschreibung', 'description', 'notiz', 'kommentar', 'summary',
  'text', 'inhalt', 'ablauf', 'bemerkung', 'freitext',
];

export function detectCsvImportMode(headers: string[]): FileImportMode {
  const lower = headers.map(h => h.toLowerCase());
  const eventScore = lower.filter(h => EVENT_LOG_HEADER_HINTS.some(hint => h.includes(hint))).length;
  const narrativeScore = lower.filter(h => NARRATIVE_HEADER_HINTS.some(hint => h.includes(hint))).length;
  if (eventScore >= 2) return 'eventlog';
  if (narrativeScore >= 1) return 'narrative';
  return 'narrative';
}

export function detectColumnCandidates(
  headers: string[],
): {
  description: number;
  name: number;
  id: number;
  timestamp: number;
  activity: number;
  caseId: number;
  role: number;
  system: number;
} {
  const lower = headers.map(h => h.toLowerCase());

  function find(hints: string[]): number {
    for (const hint of hints) {
      const idx = lower.findIndex(h => h.includes(hint));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  return {
    description: find(['beschreibung', 'description', 'text', 'notiz', 'kommentar', 'summary', 'inhalt', 'ablauf', 'freitext']),
    name: find(['name', 'titel', 'title', 'bezeichnung', 'betreff', 'subject']),
    id: find(['id', 'nr', 'nummer', 'ticket', 'fall', 'case']),
    timestamp: find(['datum', 'date', 'zeit', 'time', 'timestamp', 'erstellt', 'created']),
    activity: find(['activity', 'aktivität', 'aktion', 'step', 'schritt', 'vorgang', 'ereignis', 'event']),
    caseId: find(['case id', 'caseid', 'fall id', 'fallid', 'ticket', 'vorgang id', 'id']),
    role: find(['role', 'rolle', 'user', 'nutzer', 'resource', 'ressource', 'bearbeiter', 'agent']),
    system: find(['system', 'tool', 'application', 'anwendung', 'quelle', 'source']),
  };
}

function makeCase(
  name: string,
  narrative: string,
  sourceNote?: string,
  caseRef?: string,
  dateHints?: string,
): ProcessMiningObservationCase {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    narrative,
    sourceNote,
    caseRef,
    dateHints,
    createdAt: now,
    updatedAt: now,
  };
}

function makeObservation(
  caseId: string,
  label: string,
  index: number,
  role?: string,
  system?: string,
  timestampRaw?: string,
): ProcessMiningObservation {
  return {
    id: crypto.randomUUID(),
    sourceCaseId: caseId,
    label,
    role,
    system,
    kind: 'step',
    sequenceIndex: index,
    timestampRaw,
    timestampQuality: timestampRaw ? 'real' : 'missing',
    createdAt: new Date().toISOString(),
  };
}

export function buildNarrativeCasesFromText(
  text: string,
  fileName: string,
): FileImportResult {
  const caseItem = makeCase(
    fileName.replace(/\.\w+$/, ''),
    text,
    `Import aus Datei: ${fileName}`,
  );
  return { cases: [caseItem], observations: [], warnings: [] };
}

export function buildCasesFromCsvNarrative(
  _headers: string[],
  rows: string[][],
  config: CsvImportConfig,
  fileName: string,
): FileImportResult {
  const cases: ProcessMiningObservationCase[] = [];
  const warnings: string[] = [];

  if (config.descriptionColIdx < 0) {
    return { cases: [], observations: [], warnings: ['Keine Beschreibungsspalte ausgewählt.'] };
  }

  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const narrative = (row[config.descriptionColIdx] ?? '').trim();
    if (!narrative) { skipped++; continue; }

    const rawName = config.nameColIdx >= 0 ? (row[config.nameColIdx] ?? '').trim() : '';
    const name = rawName || `Fall ${i + 1} (${fileName})`;
    const caseRef = config.idColIdx >= 0 ? (row[config.idColIdx] ?? '').trim() || undefined : undefined;
    const dateHints = config.timestampColIdx >= 0 ? (row[config.timestampColIdx] ?? '').trim() || undefined : undefined;
    const sourceNote = config.sourceColIdx >= 0 ? (row[config.sourceColIdx] ?? '').trim() || undefined : `Import: ${fileName}`;

    cases.push(makeCase(name, narrative, sourceNote, caseRef, dateHints));
  }

  if (skipped > 0) warnings.push(`${skipped} Zeilen ohne Beschreibung übersprungen.`);
  return { cases, observations: [], warnings };
}

export function buildObservationsFromCsvEventLog(
  _headers: string[],
  rows: string[][],
  config: CsvImportConfig,
): FileImportResult {
  const observations: ProcessMiningObservation[] = [];
  const syntheticCases = new Map<string, ProcessMiningObservationCase>();
  const warnings: string[] = [];

  if (config.activityColIdx < 0) {
    return { cases: [], observations: [], warnings: ['Keine Aktivitätsspalte ausgewählt.'] };
  }

  const caseSeqCounter = new Map<string, number>();

  for (const row of rows) {
    const activity = (row[config.activityColIdx] ?? '').trim();
    if (!activity) continue;

    const caseIdRaw = config.caseIdColIdx >= 0 ? (row[config.caseIdColIdx] ?? '').trim() : '';
    const caseId = caseIdRaw || 'default';

    if (!syntheticCases.has(caseId)) {
      const now = new Date().toISOString();
      syntheticCases.set(caseId, {
        id: crypto.randomUUID(),
        name: caseIdRaw ? `Fall: ${caseIdRaw}` : 'Importierter Fall',
        narrative: '',
        caseRef: caseIdRaw || undefined,
        createdAt: now,
        updatedAt: now,
      });
      caseSeqCounter.set(caseId, 0);
    }

    const caseObj = syntheticCases.get(caseId)!;
    const seq = caseSeqCounter.get(caseId)!;
    caseSeqCounter.set(caseId, seq + 1);

    const role = config.roleColIdx >= 0 ? (row[config.roleColIdx] ?? '').trim() || undefined : undefined;
    const system = config.systemColIdx >= 0 ? (row[config.systemColIdx] ?? '').trim() || undefined : undefined;
    const timestamp = config.timestampColIdx >= 0 ? (row[config.timestampColIdx] ?? '').trim() || undefined : undefined;

    observations.push(makeObservation(caseObj.id, activity, seq, role, system, timestamp));
  }

  return {
    cases: Array.from(syntheticCases.values()),
    observations,
    warnings,
  };
}

export function buildCasesFromXlsx(
  sheet: XlsxSheet,
  config: CsvImportConfig,
  fileName: string,
): FileImportResult {
  return buildCasesFromCsvNarrative(sheet.headers, sheet.rows, config, fileName);
}

export function buildObservationsFromXlsx(
  sheet: XlsxSheet,
  config: CsvImportConfig,
): FileImportResult {
  return buildObservationsFromCsvEventLog(sheet.headers, sheet.rows, config);
}

export function parseCsvForImport(text: string): { headers: string[]; rows: string[][] } {
  const parsed = parseCsvText(text);
  return { headers: parsed.headers, rows: parsed.rows };
}
