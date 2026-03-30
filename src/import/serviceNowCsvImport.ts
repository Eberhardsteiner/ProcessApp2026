import { parseCsvText } from './csv';

export interface ServiceNowCsvImportParams {
  csvText: string;
  captureMode: 'artifact' | 'case' | 'cases';
  startingCaseNo: number;
  maxTickets?: number;
}

export interface ServiceNowCsvImportResult {
  text: string;
  warnings: string[];
  importedCount: number;
}

const MAX_CHARS_PER_TICKET = 2500;
const DEFAULT_MAX_TICKETS = 50;

const NUMBER_ALIASES = ['number', 'nummer', 'ticket', 'incident', 'request', 'req number', 'inc number'];
const SHORT_DESC_ALIASES = ['short description', 'short_description', 'kurzbeschreibung', 'summary', 'titel', 'title'];
const DESC_ALIASES = ['description', 'beschreibung', 'desc'];
const COMMENTS_ALIASES = ['comments', 'additional comments', 'additional_comments', 'kommentare', 'zusätzliche kommentare'];
const WORK_NOTES_ALIASES = ['work notes', 'work_notes', 'arbeitsnotizen', 'worknote', 'work note'];
const STATE_ALIASES = ['state', 'status', 'zustand'];
const CATEGORY_ALIASES = ['category', 'kategorie', 'cat'];
const OPENED_ALIASES = ['opened', 'opened at', 'opened_at', 'erstellt', 'created', 'created at'];
const UPDATED_ALIASES = ['updated', 'updated at', 'updated_at', 'aktualisiert', 'last updated'];

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
  number: string,
  shortDesc: string,
  state: string,
  category: string,
  opened: string,
  updated: string,
  description: string,
  comments: string,
  workNotes: string,
  warnings: string[]
): string {
  const lines: string[] = [];

  const heading = number && shortDesc
    ? `SERVICENOW ${number}: ${shortDesc}`
    : number
    ? `SERVICENOW ${number}`
    : shortDesc
    ? `SERVICENOW: ${shortDesc}`
    : 'ServiceNow Ticket';

  lines.push(heading);

  const meta: string[] = [];
  if (state) meta.push(`Status: ${state}`);
  if (category) meta.push(`Kategorie: ${category}`);
  if (opened) meta.push(`Erstellt: ${opened}`);
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

  if (workNotes) {
    lines.push('');
    lines.push('Work Notes:');
    lines.push(workNotes);
  }

  let block = lines.join('\n');

  const ref = number || heading;
  if (block.length > MAX_CHARS_PER_TICKET) {
    block = block.slice(0, MAX_CHARS_PER_TICKET) + '\n[... gekürzt]';
    warnings.push(`Ticket ${ref}: Inhalt wurde auf ${MAX_CHARS_PER_TICKET} Zeichen gekürzt.`);
  }

  return block;
}

export function serviceNowCsvToText(params: ServiceNowCsvImportParams): ServiceNowCsvImportResult {
  const { csvText, captureMode, startingCaseNo, maxTickets = DEFAULT_MAX_TICKETS } = params;
  const warnings: string[] = [];

  let parsed;
  try {
    parsed = parseCsvText(csvText);
  } catch (e) {
    throw new Error(`ServiceNow CSV konnte nicht geparsed werden: ${e instanceof Error ? e.message : String(e)}`);
  }

  const { headers, rows } = parsed;

  const numberIdx = findColIndex(headers, NUMBER_ALIASES);
  const shortDescIdx = findColIndex(headers, SHORT_DESC_ALIASES);
  const descIdx = findColIndex(headers, DESC_ALIASES);
  const commentsIdx = findColIndex(headers, COMMENTS_ALIASES);
  const workNotesIdx = findColIndex(headers, WORK_NOTES_ALIASES);
  const stateIdx = findColIndex(headers, STATE_ALIASES);
  const categoryIdx = findColIndex(headers, CATEGORY_ALIASES);
  const openedIdx = findColIndex(headers, OPENED_ALIASES);
  const updatedIdx = findColIndex(headers, UPDATED_ALIASES);

  if (numberIdx === -1 && shortDescIdx === -1) {
    warnings.push('Weder "Number" noch "Short Description" Spalte gefunden. Die Ausgabe könnte unvollständig sein.');
  }
  if (descIdx === -1) {
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
    const number = getField(row, numberIdx);
    const shortDesc = getField(row, shortDescIdx);
    const description = getField(row, descIdx);
    const comments = getField(row, commentsIdx);
    const workNotes = getField(row, workNotesIdx);
    const state = getField(row, stateIdx);
    const category = getField(row, categoryIdx);
    const opened = getField(row, openedIdx);
    const updated = getField(row, updatedIdx);

    const block = buildTicketBlock(number, shortDesc, state, category, opened, updated, description, comments, workNotes, warnings);
    ticketBlocks.push(block);
  }

  let text: string;

  if (captureMode === 'artifact') {
    text = ticketBlocks.join('\n\n\n');
  } else if (captureMode === 'case') {
    const firstBlock = ticketBlocks[0];
    const firstNumber = getField(effectiveRows[0], numberIdx);
    const caseLabel = firstNumber ? `FALL 1 (ServiceNow: ${firstNumber})` : 'FALL 1 (ServiceNow)';
    text = `${caseLabel}\n\n${firstBlock}`;
    if (ticketBlocks.length > 1) {
      warnings.push(`Im "Fall"-Modus wird nur das erste Ticket importiert. ${ticketBlocks.length - 1} weitere Ticket(s) ignoriert.`);
    }
  } else {
    const parts: string[] = ticketBlocks.map((block, i) => {
      const row = effectiveRows[i];
      const number = getField(row, numberIdx);
      const caseNo = startingCaseNo + i;
      const caseLabel = number ? `FALL ${caseNo} (ServiceNow: ${number})` : `FALL ${caseNo} (ServiceNow)`;
      return `${caseLabel}\n\n${block}`;
    });
    text = parts.join('\n\n---\n\n');
  }

  return { text, warnings, importedCount: ticketBlocks.length };
}
