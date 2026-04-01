import { parseCsvText } from './csv';
import { findBestHtmlTableByHeaders } from './extractTableFromHtml';
import type { AiEventLogResultV1, AiEventLogEventV1 } from '../ai/aiEventLog';

export type ToolHistoryKind = 'jira' | 'servicenow';
export type ToolHistoryFilterMode = 'status_only' | 'all_fields';

export interface ToolHistoryColumnMapping {
  caseIdCol: number;
  timestampCol: number;
  fieldCol: number;
  fromCol: number;
  toCol: number;
  actorCol: number;
}

export interface ToolHistoryDetection {
  kind: ToolHistoryKind;
  mapping: ToolHistoryColumnMapping;
  score: number;
  warnings: string[];
}

export interface ToolHistoryParseResult {
  ai: AiEventLogResultV1;
  warnings: string[];
  importedEvents: number;
  skippedRows: number;
  filteredRows: number;
  detectedKind: ToolHistoryKind;
  usedMapping: ToolHistoryColumnMapping;
}

const JIRA_ALIASES: Record<keyof ToolHistoryColumnMapping, string[]> = {
  caseIdCol: ['issue key', 'issuekey', 'key', 'schlüssel', 'ticket', 'issue'],
  timestampCol: ['created', 'created at', 'date', 'datetime', 'timestamp', 'changed', 'changed at', 'when'],
  fieldCol: ['field', 'field name', 'item', 'property', 'column'],
  fromCol: ['from', 'from string', 'old value', 'previous value', 'from value'],
  toCol: ['to', 'to string', 'new value', 'to value', 'value', 'new status', 'to status'],
  actorCol: ['author', 'user', 'changed by', 'actor', 'updated by'],
};

const SN_ALIASES: Record<keyof ToolHistoryColumnMapping, string[]> = {
  caseIdCol: ['number', 'nummer', 'incident', 'request', 'task', 'ticket'],
  timestampCol: ['sys updated on', 'sys_updated_on', 'updated', 'updated on', 'changed', 'changed at', 'date', 'datetime', 'timestamp'],
  fieldCol: ['field', 'field name', 'element', 'column', 'name'],
  fromCol: ['old value', 'from', 'previous value', 'old', 'from value'],
  toCol: ['new value', 'to', 'value', 'new', 'to value'],
  actorCol: ['sys updated by', 'sys_updated_by', 'updated by', 'changed by', 'user', 'actor'],
};

function normalizeHeaderStr(s: string): string {
  return s.replace(/\u00A0/g, ' ').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
}

function compactHeader(s: string): string {
  return normalizeHeaderStr(s).replace(/\s/g, '');
}

function headerMatchesAlias(header: string, aliases: string[]): boolean {
  const norm = normalizeHeaderStr(header);
  const compact = compactHeader(header);
  return aliases.some((alias) => {
    const normAlias = normalizeHeaderStr(alias);
    const compactAlias = compactHeader(alias);
    return norm === normAlias || compact === compactAlias || (normAlias.length >= 4 && norm.includes(normAlias));
  });
}

function findColIndex(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (headerMatchesAlias(headers[i], aliases)) return i;
  }
  return -1;
}

function computeMappingForKind(headers: string[], aliases: typeof JIRA_ALIASES): ToolHistoryColumnMapping {
  return {
    caseIdCol: findColIndex(headers, aliases.caseIdCol),
    timestampCol: findColIndex(headers, aliases.timestampCol),
    fieldCol: findColIndex(headers, aliases.fieldCol),
    fromCol: findColIndex(headers, aliases.fromCol),
    toCol: findColIndex(headers, aliases.toCol),
    actorCol: findColIndex(headers, aliases.actorCol),
  };
}

function scoreMapping(m: ToolHistoryColumnMapping): number {
  let s = 0;
  if (m.caseIdCol >= 0) s += 2;
  if (m.timestampCol >= 0) s += 2;
  if (m.toCol >= 0) s += 2;
  if (m.fieldCol >= 0) s += 1;
  if (m.fromCol >= 0) s += 1;
  if (m.actorCol >= 0) s += 1;
  return s;
}

export function detectToolHistoryColumns(headers: string[], preferred: 'auto' | ToolHistoryKind): ToolHistoryDetection {
  const warnings: string[] = [];

  if (preferred === 'jira') {
    const mapping = computeMappingForKind(headers, JIRA_ALIASES);
    const score = scoreMapping(mapping);
    if (score < 3) warnings.push('Nur wenige Jira-Spalten erkannt. Bitte Spalten prüfen.');
    return { kind: 'jira', mapping, score, warnings };
  }

  if (preferred === 'servicenow') {
    const mapping = computeMappingForKind(headers, SN_ALIASES);
    const score = scoreMapping(mapping);
    if (score < 3) warnings.push('Nur wenige ServiceNow-Spalten erkannt. Bitte Spalten prüfen.');
    return { kind: 'servicenow', mapping, score, warnings };
  }

  const jiraMapping = computeMappingForKind(headers, JIRA_ALIASES);
  const jiraScore = scoreMapping(jiraMapping);
  const snMapping = computeMappingForKind(headers, SN_ALIASES);
  const snScore = scoreMapping(snMapping);

  if (jiraScore >= snScore) {
    if (jiraScore < 3) warnings.push('Automatische Erkennung unsicher (Score < 3). Bitte Quelle manuell wählen.');
    return { kind: 'jira', mapping: jiraMapping, score: jiraScore, warnings };
  } else {
    if (snScore < 3) warnings.push('Automatische Erkennung unsicher (Score < 3). Bitte Quelle manuell wählen.');
    return { kind: 'servicenow', mapping: snMapping, score: snScore, warnings };
  }
}

function hasExplicitTimezoneSuffix(s: string): boolean {
  return /(?:\bUTC\b|Z|[+-]\d{2}:?\d{2})\s*$/i.test(s);
}

function parseTimestampToIso(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  const ddmmyyyy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*$/);
  if (ddmmyyyy) {
    const d = parseInt(ddmmyyyy[1], 10);
    const mo = parseInt(ddmmyyyy[2], 10);
    const y = parseInt(ddmmyyyy[3], 10);
    const h = ddmmyyyy[4] ? parseInt(ddmmyyyy[4], 10) : 0;
    const mi = ddmmyyyy[5] ? parseInt(ddmmyyyy[5], 10) : 0;
    const sec = ddmmyyyy[6] ? parseInt(ddmmyyyy[6], 10) : 0;
    const dt = new Date(y, mo - 1, d, h, mi, sec);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }

  if (!hasExplicitTimezoneSuffix(s)) {
    const slashDmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*$/);
    if (slashDmy) {
      const a = parseInt(slashDmy[1], 10);
      const b = parseInt(slashDmy[2], 10);
      if (a <= 31 && b <= 31) {
        let day: number;
        let month: number;
        if (a > 12 && b <= 12) {
          day = a; month = b;
        } else if (b > 12 && a <= 12) {
          day = b; month = a;
        } else {
          day = a; month = b;
        }
        const y = parseInt(slashDmy[3], 10);
        const h = slashDmy[4] ? parseInt(slashDmy[4], 10) : 0;
        const mi = slashDmy[5] ? parseInt(slashDmy[5], 10) : 0;
        const sec = slashDmy[6] ? parseInt(slashDmy[6], 10) : 0;
        const dt = new Date(y, month - 1, day, h, mi, sec);
        if (!isNaN(dt.getTime())) return dt.toISOString();
      }
    }
  }

  if (!hasExplicitTimezoneSuffix(s)) {
    const yyyymmdd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*$/);
    if (yyyymmdd) {
      const y = parseInt(yyyymmdd[1], 10);
      const mo = parseInt(yyyymmdd[2], 10);
      const d = parseInt(yyyymmdd[3], 10);
      const h = yyyymmdd[4] ? parseInt(yyyymmdd[4], 10) : 0;
      const mi = yyyymmdd[5] ? parseInt(yyyymmdd[5], 10) : 0;
      const sec = yyyymmdd[6] ? parseInt(yyyymmdd[6], 10) : 0;
      const dt = new Date(y, mo - 1, d, h, mi, sec);
      if (!isNaN(dt.getTime())) return dt.toISOString();
    }
  }

  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();

  return null;
}
// sanity:
// "01.02.2024" => 1. Feb (dd.mm)
// "01/02/2024" => default dd/mm => 1. Feb (DACH)
// "02/17/2024" => b>12 => mm/dd => 17. Feb
// "2024-02-01 12:34:56" deterministisch
// "2024-02-01T12:34:56Z" via Date.parse korrekt

interface ToolValidationError {
  type: 'missing_case_id' | 'missing_timestamp' | 'invalid_timestamp' | 'missing_activity_value';
  rowIndex: number;
  rawValue?: string;
}

function buildEventsFromRows(params: {
  headers: string[];
  rows: string[][];
  mapping: ToolHistoryColumnMapping;
  filterMode: ToolHistoryFilterMode;
  kind: ToolHistoryKind;
  maxEvents: number;
  sourceLabelForNotes?: string;
}): { events: AiEventLogEventV1[]; warnings: string[]; skippedRows: number; filteredRows: number } {
  const { headers, rows, mapping, filterMode, kind, maxEvents } = params;
  const { caseIdCol, timestampCol, fieldCol, fromCol, toCol, actorCol } = mapping;

  if (filterMode === 'status_only' && fieldCol < 0) {
    throw new Error(
      'Import im Modus "Nur Status/State" nicht möglich: Es wurde keine Field-/Feldname-Spalte in den Daten erkannt.\n' +
      'Der Modus "status_only" erfordert eine sauber erkannte Spalte (z.\u202fB. "Field", "Field Name", "Element"), ' +
      'aus der hervorgeht, ob ein Eintrag einen Status- oder State-Wechsel darstellt.\n' +
      'Ohne diese Spalte ist keine zuverlässige Unterscheidung zwischen Statusänderungen und anderen Feldänderungen möglich.\n' +
      'Bitte wählen Sie entweder den Modus "Alle Felder" oder stellen Sie sicher, dass Ihre Export-Datei eine Field-Spalte enthält.'
    );
  }

  const coreColSet = new Set([caseIdCol, timestampCol, fieldCol, fromCol, toCol, actorCol].filter((c) => c >= 0));
  const extraCols: { idx: number; key: string }[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (!coreColSet.has(i)) {
      const key = normalizeHeaderStr(headers[i]).replace(/\s+/g, '_').slice(0, 40);
      if (key) extraCols.push({ idx: i, key });
    }
  }

  const events: AiEventLogEventV1[] = [];
  const warnings: string[] = [];
  let skippedRows = 0;
  let filteredRows = 0;
  let warnedValueTrunc = false;
  const validationErrors: ToolValidationError[] = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const displayRow = rowIdx + 2;

    if (events.length >= maxEvents) {
      const remaining = rows.length - rowIdx;
      throw new Error(
        `Tool-Import abgebrochen: Die Datei enthält mehr als ${maxEvents.toLocaleString('de-DE')} Events (mindestens ${(events.length + remaining).toLocaleString('de-DE')} erkannt).\n` +
        'Automatisches Kürzen des Event Logs ist nicht zulässig. Ein abgeschnittenes Log ergibt ein unvollständiges Ist-Bild.\n' +
        'Bitte das Log extern vorfiltern (z.\u202fB. auf einen Zeitraum oder eine Teilmenge von Cases) und erneut importieren.'
      );
    }

    const caseId = caseIdCol >= 0 ? (row[caseIdCol] ?? '').trim() : '';
    if (!caseId) {
      validationErrors.push({ type: 'missing_case_id', rowIndex: displayRow });
      skippedRows++;
      continue;
    }

    const rawTs = timestampCol >= 0 ? (row[timestampCol] ?? '').trim() : '';
    if (!rawTs) {
      validationErrors.push({ type: 'missing_timestamp', rowIndex: displayRow });
      skippedRows++;
      continue;
    }
    const timestampIso = parseTimestampToIso(rawTs);
    if (!timestampIso) {
      validationErrors.push({ type: 'invalid_timestamp', rowIndex: displayRow, rawValue: rawTs });
      skippedRows++;
      continue;
    }

    const field = fieldCol >= 0 ? (row[fieldCol] ?? '').trim() : '';
    const toV = toCol >= 0 ? (row[toCol] ?? '').trim() : '';
    if (!toV) {
      validationErrors.push({ type: 'missing_activity_value', rowIndex: displayRow });
      skippedRows++;
      continue;
    }

    if (filterMode === 'status_only') {
      if (!field) {
        filteredRows++;
        continue;
      }
      const fl = field.toLowerCase();
      if (!fl.includes('status') && !fl.includes('state')) {
        filteredRows++;
        continue;
      }
    }

    const activity = filterMode === 'status_only'
      ? `Status: ${toV}`
      : (field ? `${field}: ${toV}` : toV);

    const fromV = fromCol >= 0 ? (row[fromCol] ?? '').trim() : '';
    const actor = actorCol >= 0 ? (row[actorCol] ?? '').trim() : '';

    const attributes: Record<string, string> = { tool: kind };
    if (field) attributes['field'] = field;
    if (fromV) attributes['from'] = fromV;
    attributes['to'] = toV;

    let attrCount = Object.keys(attributes).length;
    for (const { idx, key } of extraCols) {
      if (attrCount >= 20) break;
      let val = (row[idx] ?? '').trim();
      if (!val) continue;
      if (val.length > 200) {
        if (!warnedValueTrunc) {
          warnings.push('Einige Attributwerte wurden auf 200 Zeichen gekürzt.');
          warnedValueTrunc = true;
        }
        val = val.slice(0, 200);
      }
      attributes[key] = val;
      attrCount++;
    }

    const evt: AiEventLogEventV1 = { caseId, activity, timestamp: timestampIso, attributes };
    if (actor) evt.resource = actor;
    events.push(evt);
  }

  if (validationErrors.length > 0) {
    const missingCase = validationErrors.filter(e => e.type === 'missing_case_id');
    const missingTs = validationErrors.filter(e => e.type === 'missing_timestamp');
    const invalidTs = validationErrors.filter(e => e.type === 'invalid_timestamp');
    const missingActivity = validationErrors.filter(e => e.type === 'missing_activity_value');

    const parts: string[] = [];
    if (missingCase.length > 0) {
      const rows = missingCase.slice(0, 3).map(e => `Zeile ${e.rowIndex}`).join(', ');
      parts.push(`${missingCase.length} Zeile(n) ohne Case-ID (${rows}${missingCase.length > 3 ? ', ...' : ''})`);
    }
    if (missingTs.length > 0) {
      const rows = missingTs.slice(0, 3).map(e => `Zeile ${e.rowIndex}`).join(', ');
      parts.push(`${missingTs.length} Zeile(n) ohne Zeitstempel (${rows}${missingTs.length > 3 ? ', ...' : ''})`);
    }
    if (invalidTs.length > 0) {
      const samples = invalidTs.slice(0, 3).map(e => `"${e.rawValue}" (Zeile ${e.rowIndex})`).join(', ');
      parts.push(`${invalidTs.length} Zeile(n) mit ungültigem Zeitstempel (${samples}${invalidTs.length > 3 ? ', ...' : ''})`);
    }
    if (missingActivity.length > 0) {
      const rows = missingActivity.slice(0, 3).map(e => `Zeile ${e.rowIndex}`).join(', ');
      parts.push(`${missingActivity.length} Zeile(n) ohne Aktivitätswert (to-Spalte leer) (${rows}${missingActivity.length > 3 ? ', ...' : ''})`);
    }

    throw new Error(
      `Tool-Import abgebrochen: ${validationErrors.length} Zeile(n) verletzen Pflichtfelder (caseId, timestamp und Aktivitätswert müssen vorhanden und gültig sein).\n` +
      parts.join('\n') +
      '\nHinweis: Bewusstes Filtern nach Status-Events ist kein Fehler. Fehlende Pflichtfelder dagegen schon.\n' +
      'Bitte korrigieren Sie die Daten und importieren Sie erneut. Kein teilbereinigtes Dataset wird gespeichert.'
    );
  }

  if (filteredRows > 0) {
    warnings.push(
      `Status-Filter aktiv: ${filteredRows.toLocaleString('de-DE')} Zeile(n) bewusst ausgeblendet (Feldname enthält kein "status"/"state" oder fehlt). ` +
      'Nur Status- und State-Änderungen wurden als Events übernommen.'
    );
  }

  return { events, warnings, skippedRows, filteredRows };
}

export function parseToolHistoryCsvToAiEventLog(params: {
  csvText: string;
  preferred: 'auto' | ToolHistoryKind;
  filterMode: ToolHistoryFilterMode;
  mappingOverride?: Partial<ToolHistoryColumnMapping>;
  maxEvents?: number;
  sourceLabelForNotes?: string;
}): ToolHistoryParseResult {
  const { csvText, preferred, filterMode, mappingOverride, maxEvents = 200000, sourceLabelForNotes } = params;

  const parsed = parseCsvText(csvText);
  const { headers, rows } = parsed;

  const detection = detectToolHistoryColumns(headers, preferred);
  const mapping: ToolHistoryColumnMapping = { ...detection.mapping, ...mappingOverride };

  const { events, warnings, skippedRows, filteredRows } = buildEventsFromRows({
    headers, rows, mapping, filterMode, kind: detection.kind, maxEvents, sourceLabelForNotes,
  });

  const allWarnings = [...detection.warnings, ...warnings];

  const ai: AiEventLogResultV1 = {
    schemaVersion: 'ai-event-log-v1',
    language: 'de',
    timeMode: 'real',
    events,
    notes: sourceLabelForNotes ? [`Quelle: ${sourceLabelForNotes}`] : undefined,
    warnings: allWarnings.slice(0, 20),
  };

  return {
    ai,
    warnings: allWarnings.slice(0, 20),
    importedEvents: events.length,
    skippedRows,
    filteredRows,
    detectedKind: detection.kind,
    usedMapping: mapping,
  };
}

export function parseToolHistoryHtmlToAiEventLog(params: {
  html: string;
  preferred: 'auto' | ToolHistoryKind;
  filterMode: ToolHistoryFilterMode;
  maxEvents?: number;
  sourceLabelForNotes?: string;
}): ToolHistoryParseResult {
  const { html, preferred, filterMode, maxEvents = 200000, sourceLabelForNotes } = params;

  const caseAliases = [...JIRA_ALIASES.caseIdCol, ...SN_ALIASES.caseIdCol];
  const tsAliases = [...JIRA_ALIASES.timestampCol, ...SN_ALIASES.timestampCol];
  const toAliases = [...JIRA_ALIASES.toCol, ...SN_ALIASES.toCol];
  const fieldAliases = [...JIRA_ALIASES.fieldCol, ...SN_ALIASES.fieldCol];
  const fromAliases = [...JIRA_ALIASES.fromCol, ...SN_ALIASES.fromCol];
  const actorAliases = [...JIRA_ALIASES.actorCol, ...SN_ALIASES.actorCol];

  const result = findBestHtmlTableByHeaders({
    html,
    requiredAny: [caseAliases, tsAliases, toAliases],
    optional: [...fieldAliases, ...fromAliases, ...actorAliases],
  });

  if (!result.bestTable) {
    throw new Error(
      `Keine Ticket-Historie-Tabelle in der HTML-Datei erkannt. ${result.warnings.join(' ')} ` +
      `Erwartet werden Spalten für Case-ID, Timestamp und neuen Wert/Status.`
    );
  }

  const { headers, rows } = result.bestTable;
  const detection = detectToolHistoryColumns(headers, preferred);
  const mapping = detection.mapping;

  const { events, warnings, skippedRows, filteredRows } = buildEventsFromRows({
    headers, rows, mapping, filterMode, kind: detection.kind, maxEvents, sourceLabelForNotes,
  });

  const allWarnings = [...result.warnings, ...detection.warnings, ...warnings];

  const ai: AiEventLogResultV1 = {
    schemaVersion: 'ai-event-log-v1',
    language: 'de',
    timeMode: 'real',
    events,
    notes: sourceLabelForNotes ? [`Quelle: ${sourceLabelForNotes}`] : undefined,
    warnings: allWarnings.slice(0, 20),
  };

  return {
    ai,
    warnings: allWarnings.slice(0, 20),
    importedEvents: events.length,
    skippedRows,
    filteredRows,
    detectedKind: detection.kind,
    usedMapping: mapping,
  };
}
