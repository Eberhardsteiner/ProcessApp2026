import { parseCsvText } from './csv';

export interface JiraCsvImportParams {
  csvText: string;
  captureMode: 'artifact' | 'case' | 'cases';
  startingCaseNo: number;
  maxTickets?: number;
}

export interface JiraCsvImportResult {
  text: string;
  warnings: string[];
  importedCount: number;
}

const MAX_CHARS_PER_TICKET = 2000;
const DEFAULT_MAX_TICKETS = 50;

const KEY_ALIASES = ['key', 'issue key', 'schlüssel', 'issue-key', 'issuekey'];
const SUMMARY_ALIASES = ['summary', 'zusammenfassung', 'titel', 'title', 'betreff'];
const DESCRIPTION_ALIASES = ['description', 'beschreibung', 'body'];
const COMMENTS_ALIASES = ['comments', 'comment', 'kommentar', 'kommentare', 'kommentar(e)'];
const STATUS_ALIASES = ['status'];
const TYPE_ALIASES = ['issue type', 'issuetype', 'typ', 'type', 'issue-type'];
const CREATED_ALIASES = ['created', 'erstellt', 'erstellungsdatum', 'created date'];
const UPDATED_ALIASES = ['updated', 'aktualisiert', 'updated date', 'last updated'];

function findColIndex(headers: string[], aliases: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function cleanHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getField(row: string[], index: number): string {
  if (index === -1 || index >= row.length) return '';
  return cleanHtml(row[index] ?? '');
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
  if (meta.length > 0) {
    lines.push(meta.join(' | '));
  }

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

export function jiraCsvToText(params: JiraCsvImportParams): JiraCsvImportResult {
  const { csvText, captureMode, startingCaseNo, maxTickets = DEFAULT_MAX_TICKETS } = params;
  const warnings: string[] = [];

  let parsed;
  try {
    parsed = parseCsvText(csvText);
  } catch (e) {
    throw new Error(`Jira CSV konnte nicht geparsed werden: ${e instanceof Error ? e.message : String(e)}`);
  }

  const { headers, rows } = parsed;

  const keyIdx = findColIndex(headers, KEY_ALIASES);
  const summaryIdx = findColIndex(headers, SUMMARY_ALIASES);
  const descriptionIdx = findColIndex(headers, DESCRIPTION_ALIASES);
  const commentsIdx = findColIndex(headers, COMMENTS_ALIASES);
  const statusIdx = findColIndex(headers, STATUS_ALIASES);
  const typeIdx = findColIndex(headers, TYPE_ALIASES);
  const createdIdx = findColIndex(headers, CREATED_ALIASES);
  const updatedIdx = findColIndex(headers, UPDATED_ALIASES);

  if (keyIdx === -1 && summaryIdx === -1) {
    warnings.push('Weder "Key" noch "Summary" Spalte gefunden. Die Ausgabe könnte unvollständig sein.');
  }
  if (descriptionIdx === -1) {
    warnings.push('Keine "Description/Beschreibung" Spalte gefunden.');
  }

  const effectiveRows = rows.slice(0, maxTickets);
  if (rows.length > maxTickets) {
    warnings.push(`Es wurden nur die ersten ${maxTickets} von ${rows.length} Tickets importiert (Limit: ${maxTickets}).`);
  }

  if (effectiveRows.length === 0) {
    warnings.push('Keine Datensätze gefunden.');
    return { text: '', warnings, importedCount: 0 };
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
  } else if (captureMode === 'case') {
    const firstBlock = ticketBlocks[0];
    const firstKey = getField(effectiveRows[0], keyIdx);
    const caseLabel = firstKey ? `FALL 1 (Jira: ${firstKey})` : 'FALL 1 (Jira)';
    text = `${caseLabel}\n\n${firstBlock}`;
    if (ticketBlocks.length > 1) {
      warnings.push(`Im "Fall"-Modus wird nur das erste Ticket importiert. ${ticketBlocks.length - 1} weitere Ticket(s) ignoriert.`);
    }
  } else {
    const parts: string[] = ticketBlocks.map((block, i) => {
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
