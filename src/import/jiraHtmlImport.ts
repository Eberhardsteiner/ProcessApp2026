import { findBestHtmlTableByHeaders } from './extractTableFromHtml';

export interface JiraHtmlImportParams {
  html: string;
  captureMode: 'artifact' | 'case' | 'cases';
  startingCaseNo: number;
  maxTickets?: number;
}

export interface JiraHtmlImportResult {
  text: string;
  warnings: string[];
  importedCount: number;
}

const MAX_CHARS_PER_TICKET = 2000;
const DEFAULT_MAX_TICKETS = 50;

const KEY_ALIASES = ['issue key', 'issuekey', 'key', 'schlüssel', 'issue-key'];
const SUMMARY_ALIASES = ['summary', 'zusammenfassung', 'titel', 'title', 'betreff'];
const DESCRIPTION_ALIASES = ['description', 'beschreibung', 'body'];
const COMMENTS_ALIASES = ['comments', 'comment', 'kommentar', 'kommentare', 'kommentar(e)'];
const STATUS_ALIASES = ['status'];
const TYPE_ALIASES = ['issue type', 'issuetype', 'typ', 'type', 'issue-type'];
const CREATED_ALIASES = ['created', 'erstellt', 'erstellungsdatum', 'created date'];
const UPDATED_ALIASES = ['updated', 'aktualisiert', 'updated date', 'last updated'];

const OPTIONAL_HEADERS = [
  ...DESCRIPTION_ALIASES,
  ...COMMENTS_ALIASES,
  ...STATUS_ALIASES,
  ...TYPE_ALIASES,
  ...CREATED_ALIASES,
  ...UPDATED_ALIASES,
];

function findColIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const normAlias = alias.toLowerCase().trim();
    const idx = headers.findIndex((h) => {
      if (h === normAlias) return true;
      if (normAlias.length >= 4 && h.includes(normAlias)) return true;
      return false;
    });
    if (idx !== -1) return idx;
  }
  return -1;
}

function getField(row: string[], index: number): string {
  if (index === -1 || index >= row.length) return '';
  return row[index] ?? '';
}

function buildTicketBlock(
  key: string,
  summary: string,
  status: string,
  type: string,
  created: string,
  updated: string,
  description: string,
  comments: string,
  warnings: string[]
): string {
  const lines: string[] = [];

  const heading = key && summary
    ? `JIRA ${key}: ${summary}`
    : key
    ? `JIRA ${key}`
    : summary
    ? `JIRA: ${summary}`
    : 'JIRA Ticket';

  lines.push(heading);

  const meta: string[] = [];
  if (status) meta.push(`Status: ${status}`);
  if (type) meta.push(`Typ: ${type}`);
  if (created) meta.push(`Erstellt: ${created}`);
  if (updated) meta.push(`Aktualisiert: ${updated}`);
  if (meta.length > 0) lines.push(meta.join(' | '));

  if (description) {
    lines.push('');
    lines.push('Beschreibung:');
    lines.push(description);
  }

  if (comments) {
    lines.push('');
    lines.push('Kommentare:');
    lines.push(comments);
  }

  let block = lines.join('\n');

  if (block.length > MAX_CHARS_PER_TICKET) {
    block = block.slice(0, MAX_CHARS_PER_TICKET) + '\n[... gekürzt]';
    warnings.push(`Ticket ${key || heading}: Inhalt wurde auf ${MAX_CHARS_PER_TICKET} Zeichen gekürzt.`);
  }

  return block;
}

export function jiraHtmlToText(params: JiraHtmlImportParams): JiraHtmlImportResult {
  const { html, captureMode, startingCaseNo, maxTickets = DEFAULT_MAX_TICKETS } = params;
  const warnings: string[] = [];

  const result = findBestHtmlTableByHeaders({
    html,
    requiredAny: [KEY_ALIASES, SUMMARY_ALIASES],
    optional: OPTIONAL_HEADERS,
  });

  warnings.push(...result.warnings);

  if (!result.bestTable) {
    warnings.push('Keine Jira Ticketliste (HTML-Tabelle) erkannt. Nutzen Sie HTML Rohtext oder Jira CSV.');
    return { text: '', warnings, importedCount: 0 };
  }

  const { headers, rows } = result.bestTable;

  const keyIdx = findColIndex(headers, KEY_ALIASES);
  const summaryIdx = findColIndex(headers, SUMMARY_ALIASES);
  const descriptionIdx = findColIndex(headers, DESCRIPTION_ALIASES);
  const commentsIdx = findColIndex(headers, COMMENTS_ALIASES);
  const statusIdx = findColIndex(headers, STATUS_ALIASES);
  const typeIdx = findColIndex(headers, TYPE_ALIASES);
  const createdIdx = findColIndex(headers, CREATED_ALIASES);
  const updatedIdx = findColIndex(headers, UPDATED_ALIASES);

  if (keyIdx === -1 && summaryIdx === -1) {
    warnings.push('Weder "Key" noch "Summary" Spalte gefunden. Ausgabe könnte unvollständig sein.');
  }

  if (rows.length === 0) {
    warnings.push('Keine Datensätze in der Tabelle gefunden.');
    return { text: '', warnings, importedCount: 0 };
  }

  if (captureMode === 'case') {
    const firstRow = rows[0];
    const key = getField(firstRow, keyIdx);
    const summary = getField(firstRow, summaryIdx);
    const description = getField(firstRow, descriptionIdx);
    const comments = getField(firstRow, commentsIdx);
    const status = getField(firstRow, statusIdx);
    const type = getField(firstRow, typeIdx);
    const created = getField(firstRow, createdIdx);
    const updated = getField(firstRow, updatedIdx);
    const block = buildTicketBlock(key, summary, status, type, created, updated, description, comments, warnings);
    const caseLabel = key ? `FALL 1 (Jira: ${key})` : 'FALL 1 (Jira)';
    if (rows.length > 1) {
      warnings.push(`Im "Fall"-Modus wird nur das erste Ticket importiert. ${rows.length - 1} weitere Ticket(s) ignoriert.`);
    }
    return { text: `${caseLabel}\n\n${block}`, warnings, importedCount: 1 };
  }

  const effectiveRows = rows.slice(0, maxTickets);
  if (rows.length > maxTickets) {
    warnings.push(`Es wurden nur die ersten ${maxTickets} von ${rows.length} Tickets importiert (Limit: ${maxTickets}).`);
  }

  const ticketBlocks: string[] = [];

  for (const row of effectiveRows) {
    const key = getField(row, keyIdx);
    const summary = getField(row, summaryIdx);
    const description = getField(row, descriptionIdx);
    const comments = getField(row, commentsIdx);
    const status = getField(row, statusIdx);
    const type = getField(row, typeIdx);
    const created = getField(row, createdIdx);
    const updated = getField(row, updatedIdx);

    const block = buildTicketBlock(key, summary, status, type, created, updated, description, comments, warnings);
    ticketBlocks.push(block);
  }

  let text: string;

  if (captureMode === 'artifact') {
    text = ticketBlocks.join('\n\n\n');
  } else {
    const parts = ticketBlocks.map((block, i) => {
      const row = effectiveRows[i];
      const key = getField(row, keyIdx);
      const caseNo = startingCaseNo + i;
      const caseLabel = key ? `FALL ${caseNo} (Jira: ${key})` : `FALL ${caseNo} (Jira)`;
      return `${caseLabel}\n\n${block}`;
    });
    text = parts.join('\n\n---\n\n');
  }

  return { text, warnings, importedCount: ticketBlocks.length };
}
