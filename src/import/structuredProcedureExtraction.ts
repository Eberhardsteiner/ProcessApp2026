import type { AiCaptureResultV1 } from '../ai/aiTypes';

export interface StructuredProcedureStep {
  stepCode?: string;
  label: string;
  responsible?: string;
  roles?: string[];
  description?: string;
  due?: string;
  result?: string;
  system?: string;
  systems?: string[];
  explicitRoles?: string[];
  explicitSystems?: string[];
  decision?: string;
  evidenceSnippet: string;
}

export interface StructuredProcedureRole {
  name: string;
  owner?: string;
  responsibility?: string;
}

export interface StructuredProcedureApproval {
  name: string;
  authority?: string;
  leadTime?: string;
  responsible?: string;
}

export interface StructuredProcedureExtraction {
  title?: string;
  steps: StructuredProcedureStep[];
  roles: StructuredProcedureRole[];
  approvals: StructuredProcedureApproval[];
  warnings: string[];
}

const STEP_CODE_RE = /^([A-Z]{1,3}-\d{1,3})\s*$/;
const STEP_CODE_INLINE_RE = /^([A-Z]{1,3}-\d{1,3})\b/;
const DUE_RE = /T[+-]\s*\d+\s*(Tag(e)?|Woche[n]?|Monat(e)?|KW|Std\.?|h\b)/i;
const SECTION_RE = /^\s*(\d+)\.\s+/;
const TABLE_HEADER_HINT_RE = /\b(schritt|prozessschritt|aktivität|rolle|verantwortlich|zuständig|ergebnis|output|system|entscheidung|freigabe|beschreibung|termin|frist)\b/i;
const PSEUDO_LABEL_RE = /^(\d+\.?|[|/\-–—]+|[A-ZÄÖÜa-zäöüß]+\s*\|\s*\d+\.?)$/;
const NAMED_SECTION_RE = /^\s*((?:\d+\.)*\d+)\s+(.+)$/;
const PIPE_SEPARATOR_RE = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/;

type HeaderKey =
  | 'code'
  | 'label'
  | 'responsible'
  | 'description'
  | 'due'
  | 'result'
  | 'system'
  | 'decision'
  | 'name'
  | 'authority';

interface NamedSection {
  number?: string;
  heading: string;
  body: string;
  raw: string;
}

interface ParsedTableBlock {
  rows: string[][];
  startLine: number;
  endLine: number;
}

interface PreparedRoleRow extends StructuredProcedureRole {
  canonicalName?: string;
  canonicalSystems: string[];
  matchTokens: Set<string>;
}

const ROLE_CANONICALS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'Kunde', patterns: [/\bkunde\b/i, /kund:in/i] },
  { label: 'Vertrieb', patterns: [/vertrieb/i, /account manager/i] },
  { label: 'Servicekoordination', patterns: [/servicekoordination/i, /dispatcher/i, /service desk/i] },
  { label: 'Fachbereich', patterns: [/fachbereich/i, /sachbearbeitung/i, /backoffice/i] },
  { label: 'Qualitätsmanagement', patterns: [/qualit/i, /\bqm\b/i, /\bqs\b/i] },
  { label: 'Buchhaltung', patterns: [/buchhaltung/i, /finance/i, /kreditor/i, /debitor/i] },
  { label: 'Logistik', patterns: [/logistik/i, /lager/i, /versand/i] },
  { label: 'IT', patterns: [/\bit\b/i, /admin/i, /support/i] },
];

const SYSTEM_CANONICALS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'ERP', patterns: [/\berp\b/i, /sap/i] },
  { label: 'CRM', patterns: [/\bcrm\b/i, /salesforce/i] },
  { label: 'DMS', patterns: [/\bdms\b/i, /dokumenten/i] },
  { label: 'E-Mail', patterns: [/mail/i, /outlook/i] },
  { label: 'Telefon', patterns: [/telefon/i, /telefonie/i] },
  { label: 'Workflow', patterns: [/workflow/i, /prozessportal/i] },
  { label: 'Ticketsystem', patterns: [/ticket/i, /service desk/i] },
  { label: 'Portal', patterns: [/portal/i, /serviceportal/i] },
  { label: 'Reporting', patterns: [/report/i, /bi\b/i, /dashboard/i] },
];

const ROLE_KEYWORD_HINTS: Array<{ pattern: RegExp; role: string }> = [
  { pattern: /kunde|kund:in/i, role: 'Kunde' },
  { pattern: /vertrieb|account/i, role: 'Vertrieb' },
  { pattern: /service|dispatcher|leitstand/i, role: 'Servicekoordination' },
  { pattern: /qualit|qm|qs/i, role: 'Qualitätsmanagement' },
  { pattern: /buchhaltung|finance|kreditor|debitor/i, role: 'Buchhaltung' },
  { pattern: /logistik|lager|versand/i, role: 'Logistik' },
  { pattern: /admin|it|support/i, role: 'IT' },
];

function splitSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = text.split('\n');
  let currentKey = '__preamble__';
  let buffer: string[] = [];

  for (const line of lines) {
    const m = line.match(SECTION_RE);
    if (m) {
      if (buffer.length) sections.set(currentKey, buffer.join('\n'));
      currentKey = m[1];
      buffer = [line];
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length) sections.set(currentKey, buffer.join('\n'));
  return sections;
}

function extractTitle(text: string): string | undefined {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.replace(/^#+\s*/, '').trim();
    if (trimmed.length > 6 && trimmed.length < 200 && !/^\d+\./.test(trimmed)) {
      return trimmed;
    }
  }
  return undefined;
}

function normalisedLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function splitNamedSections(text: string): NamedSection[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const sections: NamedSection[] = [];
  let current: { number?: string; heading: string; buffer: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(NAMED_SECTION_RE);
    if (match) {
      if (current) {
        const body = current.buffer.join('\n').trim();
        sections.push({
          number: current.number,
          heading: current.heading,
          body,
          raw: [current.heading, body].filter(Boolean).join('\n'),
        });
      }
      current = { number: match[1], heading: match[2], buffer: [] };
      continue;
    }
    if (!current) continue;
    current.buffer.push(line);
  }

  if (current) {
    const body = current.buffer.join('\n').trim();
    sections.push({
      number: current.number,
      heading: current.heading,
      body,
      raw: [current.heading, body].filter(Boolean).join('\n'),
    });
  }

  return sections;
}

function findNamedSection(text: string, patterns: RegExp[], preferredNumbers: string[] = []): NamedSection | undefined {
  const sections = splitNamedSections(text);
  const preferred = sections.find(section => preferredNumbers.includes(section.number ?? '') && patterns.some(pattern => pattern.test(section.heading)));
  if (preferred) return preferred;
  return sections.find(section => patterns.some(pattern => pattern.test(section.heading)));
}

function cleanCell(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/[\u00a0\t]+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || undefined;
}

function uniqueCaseInsensitive(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanCell(value);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function splitStructuredValues(value: string | undefined): string[] {
  const cleaned = cleanCell(value);
  if (!cleaned) return [];
  return uniqueCaseInsensitive(
    cleaned
      .split(/[,;/]+|\s+und\s+/i)
      .map(part => part.trim())
      .filter(Boolean),
  );
}


function canonicalRoleLabel(value: string | undefined): string | undefined {
  const cleaned = cleanCell(value);
  if (!cleaned) return undefined;
  const parts = cleaned.split(/[,;/]+|\s+und\s+/i).map(part => part.trim()).filter(Boolean);
  for (const part of parts) {
    for (const entry of ROLE_CANONICALS) {
      if (entry.patterns.some(pattern => pattern.test(part))) return entry.label;
    }
  }
  return cleaned;
}

function canonicalSystemLabels(value: string | undefined): string[] {
  const cleaned = cleanCell(value);
  if (!cleaned) return [];
  const parts = cleaned.split(/[,;/]+|\s+und\s+/i).map(part => part.trim()).filter(Boolean);
  const labels: string[] = [];
  for (const part of parts) {
    const match = SYSTEM_CANONICALS.find(entry => entry.patterns.some(pattern => pattern.test(part)));
    labels.push(match?.label ?? part);
  }
  return Array.from(new Set(labels));
}

function normalizeMatchText(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/vertriebsinnendienst/g, 'vertrieb')
    .replace(/qualitätssicherung|qualitaetssicherung|\bqs\b|\bqm\b/g, 'qualitätsmanagement')
    .replace(/servicekoordination|servicekoordinator(?:in)?/g, 'servicekoordination')
    .replace(/debitorenbuchhaltung|kreditorenbuchhaltung|finance/g, 'finanzbuchhaltung')
    .replace(/vollständigkeitsprüfung|vollstaendigkeitspruefung/g, 'mindestdaten prüfen')
    .replace(/erstaufnahme/g, 'eingang erfassen')
    .replace(/rückfragen|rueckfragen/g, 'informationen anfordern')
    .replace(/kundensicht/g, 'kunde')
    .replace(/vertragsbezug/g, 'vertrag')
    .replace(/grenzfällen|grenzfaellen/g, 'entscheidung')
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(value: string | undefined): Set<string> {
  const stop = new Set(['und', 'oder', 'der', 'die', 'das', 'mit', 'von', 'im', 'am', 'an', 'zu', 'den', 'dem', 'des', 'ein', 'eine', 'bei']);
  return new Set(
    normalizeMatchText(value)
      .split(' ')
      .map(token => token.trim())
      .filter(token => token.length >= 3 && !stop.has(token)),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let score = 0;
  a.forEach(token => {
    if (b.has(token)) score += 1;
  });
  return score;
}

function inferRoleByStepText(step: StructuredProcedureStep): string | undefined {
  const text = [step.label, step.description, step.result, step.evidenceSnippet].filter(Boolean).join(' | ');
  return ROLE_KEYWORD_HINTS.find(entry => entry.pattern.test(text))?.role;
}

function selectPrimarySystem(labels: string[]): string | undefined {
  const priority = ['ERP', 'DMS', 'E-Mail', 'CRM', 'Telefon', 'Rechnungsworkflow', 'Workflow', 'Ticketsystem', 'Leistungsnachweis-Tool', 'Reporting'];
  for (const preferred of priority) {
    if (labels.includes(preferred)) return preferred;
  }
  return labels[0];
}

function enrichStepsWithRoleRows(steps: StructuredProcedureStep[], roles: StructuredProcedureRole[]): StructuredProcedureStep[] {
  const preparedRoles: PreparedRoleRow[] = roles.map(role => ({
    ...role,
    canonicalName: canonicalRoleLabel(role.name),
    canonicalSystems: canonicalSystemLabels(role.owner),
    matchTokens: tokenSet([role.name, role.responsibility, role.owner].filter(Boolean).join(' ')),
  }));

  return steps.map(step => {
    const parsedColumns = step.evidenceSnippet.split('|').map(part => cleanCell(part)).filter(Boolean) as string[];
    const evidenceRoles = parsedColumns.length >= 4 ? splitStructuredValues(parsedColumns[2]) : [];
    const evidenceSystems = parsedColumns.length >= 5 ? splitStructuredValues(parsedColumns[3]) : [];
    const explicitRoles = uniqueCaseInsensitive([
      ...(step.explicitRoles ?? []),
      ...(step.roles ?? []),
      ...splitStructuredValues(step.responsible),
      ...evidenceRoles,
    ]);
    const explicitSystems = uniqueCaseInsensitive([
      ...(step.explicitSystems ?? []),
      ...(step.systems ?? []),
      ...splitStructuredValues(step.system),
      ...evidenceSystems,
    ]);

    const stepTokens = tokenSet([step.label, step.description, step.result, step.evidenceSnippet].filter(Boolean).join(' '));
    const inferredRole = inferRoleByStepText(step);
    const bestRole = preparedRoles
      .map(role => {
        let score = overlapScore(stepTokens, role.matchTokens);
        if (role.canonicalName && inferredRole === role.canonicalName) score += 3;
        if (role.name && step.evidenceSnippet.toLowerCase().includes(role.name.toLowerCase())) score += 4;
        return { role, score };
      })
      .sort((a, b) => b.score - a.score)[0];

    const inferredRoles = uniqueCaseInsensitive([
      explicitRoles.length === 0 && (bestRole?.score ?? 0) >= 1 ? bestRole?.role.canonicalName : undefined,
      explicitRoles.length === 0 ? inferredRole : undefined,
      explicitRoles.length === 0 ? preparedRoles[0]?.canonicalName : undefined,
    ]);
    const finalRoles = explicitRoles.length > 0
      ? uniqueCaseInsensitive([...explicitRoles, ...inferredRoles])
      : inferredRoles;
    const inferredSystems = explicitSystems.length > 0
      ? []
      : finalRoles[0]
      ? preparedRoles.find(role => role.canonicalName === finalRoles[0])?.canonicalSystems ?? []
      : ((bestRole?.score ?? 0) >= 1 ? bestRole?.role.canonicalSystems ?? [] : []);
    const finalSystems = explicitSystems.length > 0
      ? uniqueCaseInsensitive([...explicitSystems, ...inferredSystems])
      : uniqueCaseInsensitive(inferredSystems);

    return {
      ...step,
      responsible: finalRoles[0],
      roles: finalRoles,
      system: selectPrimarySystem(finalSystems),
      systems: finalSystems,
      explicitRoles,
      explicitSystems,
    };
  });
}

function normalizeHeaderCell(cell: string): string {
  return cell
    .toLowerCase()
    .replace(/[.:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHeaderCell(cell: string): boolean {
  const header = normalizeHeaderCell(cell);
  return [
    'nr', 'nr', 'nr', 'nummer', 'code', 'id',
    'schritt', 'prozessschritt', 'aktivität', 'aktivitaet', 'tätigkeit', 'taetigkeit',
    'verantwortung', 'verantwortlich', 'zuständig', 'zustaendig', 'rolle',
    'ergebnis', 'output', 'nachweis',
    'system', 'systeme',
    'entscheidung', 'freigabe', 'entscheid',
    'beschreibung', 'inhalt',
    'frist', 'termin', 'zeitpunkt',
    'aufgabe', 'funktion', 'gremium', 'instanz', 'authority', 'lead time',
  ].includes(header);
}

function classifyHeaderKey(cell: string): HeaderKey | undefined {
  const header = normalizeHeaderCell(cell);
  if (['nr', 'nummer', 'code', 'id'].includes(header)) return 'code';
  if (header.includes('prozessschritt') || header === 'schritt' || header.includes('aktiv') || header.includes('tätig') || header.includes('taetig')) return 'label';
  if (header.includes('verantwort') || header.includes('zuständig') || header.includes('zustaendig') || header === 'rolle') return 'responsible';
  if (header.includes('beschreibung') || header.includes('inhalt')) return 'description';
  if (header.includes('frist') || header.includes('termin') || header.includes('zeitpunkt') || header.includes('lead time')) return 'due';
  if (header === 'ergebnis' || header === 'output' || header === 'nachweis') return 'result';
  if (header === 'system' || header === 'systeme') return 'system';
  if (header.includes('entscheidung') || header.includes('freigabe') || header === 'entscheid') return 'decision';
  if (header === 'rolle' || header === 'funktion' || header === 'gremium' || header === 'name') return 'name';
  if (header === 'instanz' || header === 'authority') return 'authority';
  return undefined;
}

function isLikelyTableNoise(label: string): boolean {
  const cleaned = normalizeLabel(label);
  if (!cleaned) return true;
  if (cleaned.includes('|')) return true;
  if (/^\d+[.)-]?$/.test(cleaned)) return true;
  if (/^[A-Za-zÄÖÜäöüß\s]+\|\s*\d+[.)]?$/i.test(cleaned)) return true;
  if (isHeaderCell(cleaned)) return true;
  if (/^(crm|erp|dms|mail|outlook|telefonie|telefon|lagerverwaltung|service desk|portal)$/i.test(cleaned)) return true;
  if (/^[a-zäöüß]+\s+\|\s*[a-zäöüß]+$/i.test(cleaned)) return true;
  return false;
}

function normalizeLabel(label: string | undefined): string {
  if (!label) return '';
  return label
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^\d+\s+-\s*/, '')
    .replace(/^nr\.?\s*\d+\s*/i, '')
    .replace(/[|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isMeaningfulStepLabel(label: string | undefined): boolean {
  const cleaned = normalizeLabel(label);
  if (!cleaned || cleaned.length < 6) return false;
  if (cleaned.split(' ').length < 2) return false;
  if (isLikelyTableNoise(cleaned)) return false;
  if (/^(rolle|aufgabe|verantwortung|systeme?|ergebnis|entscheidung|freigabe|zielwert|kpi)$/i.test(cleaned)) return false;
  if (/^[\d\W]+$/.test(cleaned)) return false;
  return true;
}

function dedupeSteps(steps: StructuredProcedureStep[]): StructuredProcedureStep[] {
  const seen = new Set<string>();
  return steps.filter(step => {
    const key = `${step.stepCode ?? ''}|${normalizeLabel(step.label).toLowerCase()}`;
    if (!isMeaningfulStepLabel(step.label) || seen.has(key)) return false;
    seen.add(key);
    step.label = normalizeLabel(step.label);
    return true;
  });
}

function parsePipeTableBlocks(text: string): ParsedTableBlock[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks: ParsedTableBlock[] = [];
  let current: { rows: string[][]; startLine: number } | null = null;

  const flush = (endLine: number) => {
    if (!current) return;
    if (current.rows.length > 0) {
      blocks.push({ rows: current.rows, startLine: current.startLine, endLine });
    }
    current = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      flush(index);
      return;
    }
    if (PIPE_SEPARATOR_RE.test(trimmed)) {
      return;
    }

    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cleanCell(cell) ?? '')
      .filter(cell => cell.length > 0 || trimmed.includes('||'));

    if (cells.length < 2) {
      flush(index);
      return;
    }

    if (!current) current = { rows: [], startLine: index + 1 };
    current.rows.push(cells);
  });

  flush(lines.length);
  return blocks;
}

function parsePipeTableRows(sectionText: string): string[][] {
  return chooseBestTableBlock(parsePipeTableBlocks(sectionText), 2)?.rows ?? [];
}

function parseDelimitedTableRows(sectionText: string): string[][] {
  const rows: string[][] = [];
  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;
    if (trimmed.startsWith('|')) continue;
    if (!TABLE_HEADER_HINT_RE.test(trimmed) && !/[;\t]/.test(trimmed) && !/\s{2,}/.test(trimmed)) continue;

    let cells: string[] = [];
    if (trimmed.includes(';')) {
      cells = trimmed.split(';').map(cell => cell.trim());
    } else if (trimmed.includes('\t')) {
      cells = trimmed.split('\t').map(cell => cell.trim());
    } else {
      cells = trimmed.split(/\s{2,}/).map(cell => cell.trim());
    }

    cells = cells.filter(Boolean);
    if (cells.length >= 2) rows.push(cells);
  }
  return rows;
}

function headerCoverage(row: string[]): number {
  return row.filter(cell => Boolean(classifyHeaderKey(cell))).length;
}

function parseDelimitedTableRows(sectionText: string): string[][] {
  const rows: string[][] = [];
  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;
    if (trimmed.startsWith('|')) continue;
    if (!TABLE_HEADER_HINT_RE.test(trimmed) && !/[;\t]/.test(trimmed) && !/\s{2,}/.test(trimmed)) continue;

    let cells: string[] = [];
    if (trimmed.includes(';')) {
      cells = trimmed.split(';').map(cell => cell.trim());
    } else if (trimmed.includes('\t')) {
      cells = trimmed.split('\t').map(cell => cell.trim());
    } else {
      cells = trimmed.split(/\s{2,}/).map(cell => cell.trim());
    }
    cells = cells.filter(Boolean);
    if (cells.length >= 2) rows.push(cells);
  }
  return rows;
}

function parseDelimitedTableRows(sectionText: string): string[][] {
  const rows: string[][] = [];
  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;
    if (trimmed.startsWith('|')) continue;
    if (!TABLE_HEADER_HINT_RE.test(trimmed) && !/[;\t]/.test(trimmed) && !/\s{2,}/.test(trimmed)) continue;

    let cells: string[] = [];
    if (trimmed.includes(';')) {
      cells = trimmed.split(';').map(cell => cell.trim());
    } else if (trimmed.includes('\t')) {
      cells = trimmed.split('\t').map(cell => cell.trim());
    } else {
      cells = trimmed.split(/\s{2,}/).map(cell => cell.trim());
    }
    cells = cells.filter(Boolean);
    if (cells.length >= 2) rows.push(cells);
  }
  return rows;
}

function parseDelimitedTableRows(sectionText: string): string[][] {
  const rows: string[][] = [];
  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;
    if (trimmed.startsWith('|')) continue;
    if (!TABLE_HEADER_HINT_RE.test(trimmed) && !/[;\t]/.test(trimmed) && !/\s{2,}/.test(trimmed)) continue;

    let cells: string[] = [];
    if (trimmed.includes(';')) {
      cells = trimmed.split(';').map(cell => cell.trim());
    } else if (trimmed.includes('\t')) {
      cells = trimmed.split('\t').map(cell => cell.trim());
    } else {
      cells = trimmed.split(/\s{2,}/).map(cell => cell.trim());
    }
    cells = cells.filter(Boolean);
    if (cells.length >= 2) rows.push(cells);
  }
  return rows;
}

function parseDelimitedTableRows(sectionText: string): string[][] {
  const rows: string[][] = [];
  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;
    if (trimmed.startsWith('|')) continue;
    if (!TABLE_HEADER_HINT_RE.test(trimmed) && !/[;\t]/.test(trimmed) && !/\s{2,}/.test(trimmed)) continue;

    let cells: string[] = [];
    if (trimmed.includes(';')) {
      cells = trimmed.split(';').map(cell => cell.trim());
    } else if (trimmed.includes('\t')) {
      cells = trimmed.split('\t').map(cell => cell.trim());
    } else {
      cells = trimmed.split(/\s{2,}/).map(cell => cell.trim());
    }
    cells = cells.filter(Boolean);
    if (cells.length >= 2) rows.push(cells);
  }
  return rows;
}

function detectPipeTableHeaders(rows: string[][]): number {
  if (!rows.length) return -1;
  return headerCoverage(rows[0] ?? []) >= 2 ? 0 : -1;
}

function chooseBestTableBlock(blocks: ParsedTableBlock[], minHeaders = 2): ParsedTableBlock | undefined {
  return blocks
    .map(block => ({
      block,
      score: headerCoverage(block.rows[0] ?? []) * 10 + Math.max(0, block.rows.length - 1),
    }))
    .filter(item => headerCoverage(item.block.rows[0] ?? []) >= minHeaders)
    .sort((a, b) => b.score - a.score)[0]?.block;
}

function mapHeaderRow(row: string[]): Partial<Record<HeaderKey, number>> {
  const map: Partial<Record<HeaderKey, number>> = {};
  row.forEach((cell, index) => {
    const key = classifyHeaderKey(cell);
    if (key && map[key] === undefined) map[key] = index;
  });
  return map;
}

function sanitizeStepLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const normalized = label.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length < 4) return undefined;
  if (PSEUDO_LABEL_RE.test(normalized)) return undefined;
  if (/^\d+\.?\s*$/.test(normalized)) return undefined;
  return normalized;
}

function buildStepFromHeaderMappedRow(
  row: string[],
  headerMap: Partial<Record<HeaderKey, number>>,
): StructuredProcedureStep | undefined {
  const get = (key: HeaderKey): string | undefined => {
    const index = headerMap[key];
    return index === undefined ? undefined : cleanCell(row[index]);
  };

  let codeVal = get('code');
  let labelVal = sanitizeStepLabel(get('label'));

  if (!labelVal && codeVal && !STEP_CODE_INLINE_RE.test(codeVal)) {
    labelVal = sanitizeStepLabel(codeVal);
    codeVal = undefined;
  }

  if (!labelVal) {
    const firstFilled = row.find(cell => {
      const cleaned = cleanCell(cell);
      return Boolean(cleaned && cleaned.length > 2 && !STEP_CODE_INLINE_RE.test(cleaned) && !isHeaderCell(cleaned));
    });
    labelVal = sanitizeStepLabel(firstFilled);
  }

  if (!labelVal) return undefined;

  const explicitRoles = splitStructuredValues(get('responsible'));
  const explicitSystems = splitStructuredValues(get('system'));

  return {
    stepCode: codeVal,
    label: labelVal,
    responsible: explicitRoles[0],
    roles: explicitRoles,
    description: cleanCell(get('description')),
    due: cleanCell(get('due')),
    result: cleanCell(get('result')),
    system: selectPrimarySystem(explicitSystems),
    systems: explicitSystems,
    explicitRoles,
    explicitSystems,
    decision: cleanCell(get('decision')),
    evidenceSnippet: row.filter(Boolean).join(' | '),
  };
}

function parseTableStepsFromRows(rows: string[][]): StructuredProcedureStep[] {
  if (!rows.length) return [];
  const headerIdx = detectPipeTableHeaders(rows);
  if (headerIdx < 0) return [];

  const headerMap = mapHeaderRow(rows[headerIdx]);
  const steps = rows
    .slice(headerIdx + 1)
    .map(row => buildStepFromHeaderMappedRow(row, headerMap))
    .filter((step): step is StructuredProcedureStep => Boolean(step));

  return dedupeSteps(steps);
}

function parsePipeTableSteps(sectionText: string): StructuredProcedureStep[] {
  return parseTableStepsFromRows(parsePipeTableRows(sectionText));
}

function parseFlexibleTableSteps(sectionText: string): StructuredProcedureStep[] {
  const pipeSteps = parsePipeTableSteps(sectionText);
  if (pipeSteps.length >= 2) return pipeSteps;
  return parseTableStepsFromRows(parseDelimitedTableRows(sectionText));
}

function parseFlatStepBlocks(sectionText: string): StructuredProcedureStep[] {
  const lines = normalisedLines(sectionText);
  const steps: StructuredProcedureStep[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const codeMatch = line.match(STEP_CODE_RE) || line.match(STEP_CODE_INLINE_RE) || line.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (!codeMatch) {
      i += 1;
      continue;
    }

    const consumed: string[] = [line];
    const stepCode = STEP_CODE_INLINE_RE.test(line) || STEP_CODE_RE.test(line)
      ? codeMatch[1]
      : /^\d{1,2}[.)]/.test(line)
      ? codeMatch[1]
      : undefined;

    let label = /^\d{1,2}[.)]\s+/.test(line) ? codeMatch[2] : '';
    let responsible: string | undefined;
    let description: string | undefined;
    let due: string | undefined;
    let result: string | undefined;
    let system: string | undefined;

    i += 1;
    const nextLines: string[] = [];
    while (i < lines.length && !STEP_CODE_RE.test(lines[i]) && !/^\d{1,2}[.)]\s+/.test(lines[i]) && !NAMED_SECTION_RE.test(lines[i])) {
      nextLines.push(lines[i]);
      consumed.push(lines[i]);
      i += 1;
    }

    for (const candidate of nextLines) {
      if (!label && isMeaningfulStepLabel(candidate)) {
        label = candidate;
        continue;
      }
      if (DUE_RE.test(candidate) && !due) {
        due = candidate;
        continue;
      }
      if (!responsible && candidate.length < 80 && /(leitung|team|service|vertrieb|qm|qualität|buchhaltung|finance|logistik|kunde|lieferant|fachbereich)/i.test(candidate)) {
        responsible = candidate;
        continue;
      }
      if (!system && /(crm|erp|dms|mail|outlook|service desk|telefonie|portal|bi|qms)/i.test(candidate)) {
        system = candidate;
        continue;
      }
      if (!description) {
        description = candidate;
        continue;
      }
      if (!result) {
        result = candidate;
      }
    }

    label = sanitizeStepLabel(label) ?? '';
    if (!label) continue;

    steps.push({
      stepCode,
      label: normalizeLabel(label),
      responsible,
      description,
      due,
      result,
      system,
      evidenceSnippet: consumed.join(' | ').slice(0, 300),
    });
  }

  return dedupeSteps(steps);
}

function parseRoleTable(sectionText: string): StructuredProcedureRole[] {
  const bestBlock = chooseBestTableBlock(parsePipeTableBlocks(sectionText), 1);
  if (!bestBlock || bestBlock.rows.length < 2) return [];
  const header = bestBlock.rows[0].map(cell => normalizeHeaderCell(cell));
  if (!header.some(cell => cell.includes('rolle') || cell.includes('funktion') || cell.includes('gremium'))) return [];

  const nameIdx = header.findIndex(cell => cell.includes('rolle') || cell.includes('funktion') || cell.includes('gremium') || cell === 'name');
  const ownerIdx = header.findIndex(cell => cell.includes('owner') || cell.includes('inhaber') || cell.includes('leiter') || cell === 'system' || cell === 'systeme');
  const respIdx = header.findIndex(cell => cell.includes('aufgabe') || cell.includes('verantwort') || cell.includes('zuständig') || cell.includes('zustaendig'));

  const roles = bestBlock.rows.slice(1).map(row => ({
    name: canonicalRoleLabel(cleanCell(nameIdx >= 0 ? row[nameIdx] : row[0])) ?? '',
    owner: canonicalSystemLabels(cleanCell(ownerIdx >= 0 ? row[ownerIdx] : undefined)).join(' / ') || undefined,
    responsibility: cleanCell(respIdx >= 0 ? row[respIdx] : undefined),
  })).filter(role => role.name.length > 1);

  return roles.filter((role, index, all) => all.findIndex(candidate => candidate.name.toLowerCase() === role.name.toLowerCase()) === index);
}

function parseRoles(sectionText: string): StructuredProcedureRole[] {
  const tableRoles = parseRoleTable(sectionText);
  if (tableRoles.length > 0) return tableRoles;

  const roles: StructuredProcedureRole[] = [];
  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 150) continue;
    if (/^\d+\.\s/.test(trimmed)) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0 && colonIdx < 50) {
      roles.push({ name: canonicalRoleLabel(trimmed.slice(0, colonIdx).trim()) ?? trimmed.slice(0, colonIdx).trim(), responsibility: trimmed.slice(colonIdx + 1).trim() || undefined });
    } else if (trimmed.length < 80 && !isHeaderCell(trimmed)) {
      roles.push({ name: canonicalRoleLabel(trimmed) ?? trimmed });
    }
  }
  return roles.filter((role, index, all) => all.findIndex(candidate => candidate.name.toLowerCase() === role.name.toLowerCase()) === index);
}

function parseFlatRoleRows(sectionText: string): StructuredProcedureRole[] {
  const lines = normalisedLines(sectionText);
  const headerStart = lines.findIndex((line, index) => /^rolle$/i.test(line) && /^(aufgabe|verantwortung)$/i.test(lines[index + 1] ?? ''));
  if (headerStart < 0) return [];

  const headerColumns = [lines[headerStart], lines[headerStart + 1], lines[headerStart + 2]].filter(Boolean);
  const rowWidth = headerColumns.length;
  let cursor = headerStart + rowWidth;
  const roles: StructuredProcedureRole[] = [];

  while (cursor < lines.length) {
    const cells = lines.slice(cursor, cursor + rowWidth);
    if (cells.length < 2) break;
    if (cells.some(cell => NAMED_SECTION_RE.test(cell))) break;
    const [name, responsibility, maybeOwner] = cells;
    if (!name || /^rolle$/i.test(name)) break;
    roles.push({
      name: canonicalRoleLabel(name) ?? name,
      responsibility: responsibility || undefined,
      owner: maybeOwner && !/^systeme?$/i.test(maybeOwner) ? (canonicalSystemLabels(maybeOwner).join(' / ') || undefined) : undefined,
    });
    cursor += rowWidth;
  }

  return roles.filter((role, index, all) => all.findIndex(candidate => candidate.name.toLowerCase() === role.name.toLowerCase()) === index);
}

function parseApprovals(sectionText: string): StructuredProcedureApproval[] {
  const blocks = parsePipeTableBlocks(sectionText);
  const bestBlock = chooseBestTableBlock(blocks, 1);
  if (bestBlock && bestBlock.rows.length >= 2) {
    const headerMap = mapHeaderRow(bestBlock.rows[0]);
    if (headerMap.decision !== undefined || headerMap.authority !== undefined || headerMap.due !== undefined) {
      return bestBlock.rows.slice(1).map(row => ({
        name: cleanCell((headerMap.decision !== undefined ? row[headerMap.decision] : undefined) ?? row[0]) ?? '',
        authority: cleanCell(headerMap.authority !== undefined ? row[headerMap.authority] : undefined),
        leadTime: cleanCell(headerMap.due !== undefined ? row[headerMap.due] : undefined),
        responsible: cleanCell(headerMap.responsible !== undefined ? row[headerMap.responsible] : undefined),
      })).filter(item => item.name.length > 1);
    }
  }

  const approvals: StructuredProcedureApproval[] = [];
  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !DUE_RE.test(trimmed)) continue;
    approvals.push({ name: trimmed.slice(0, 100) });
  }
  return approvals;
}

export function extractStructuredProcedureFromText(
  _refId: string,
  text: string,
): StructuredProcedureExtraction | null {
  if (!text || text.trim().length < 50) return null;

  const warnings: string[] = [];
  const sections = splitSections(text);
  const namedStepsSection = findNamedSection(text, [/standardablauf/i, /prozessablauf/i, /ablauf/i, /vorgehen/i], ['5', '4', '3']);
  const namedRolesSection = findNamedSection(text, [/rollen? und systeme/i, /^rollen?$/i, /verantwortlichkeiten/i], ['2']);
  const namedApprovalsSection = findNamedSection(text, [/entscheidungslogik/i, /entscheidungsregeln/i, /freigaberegeln/i, /entscheidungen/i], ['6', '4']);

  const stepsSection = namedStepsSection?.body ?? sections.get('4') ?? sections.get('5') ?? sections.get('3') ?? '';
  const rolesSection = namedRolesSection?.body ?? sections.get('2') ?? '';
  const approvalsSection = namedApprovalsSection?.body ?? sections.get('3') ?? sections.get('4') ?? '';

  let steps: StructuredProcedureStep[] = [];

  if (stepsSection) {
    steps = parseFlexibleTableSteps(stepsSection);
    if (!steps.length) {
      steps = parseFlatStepBlocks(stepsSection);
    }
  }

  if (!steps.length) {
    steps = parseFlexibleTableSteps(text);
    if (!steps.length) {
      steps = parseFlatStepBlocks(text);
    }
    if (steps.length) {
      warnings.push('Prozessschritte wurden nicht in Abschnitt 4 gefunden – ganztext-Fallback verwendet.');
    }
  }

  const roles = [
    ...parseFlatRoleRows(rolesSection || text),
    ...parseRoles(rolesSection || text),
  ].filter((role, index, all) => all.findIndex(candidate => candidate.name.toLowerCase() === role.name.toLowerCase()) === index);

  steps = enrichStepsWithRoleRows(dedupeSteps(steps), roles);
  steps = dedupeSteps(steps);
  if (!steps.length) return null;

  const approvals = parseApprovals(approvalsSection || text);
  const title = extractTitle(text);

  return { title, steps, roles, approvals, warnings };
}

export function buildAiCaptureFromStructuredProcedure(
  extraction: StructuredProcedureExtraction,
): AiCaptureResultV1 {
  const happyPath = extraction.steps.map(step =>
    step.stepCode ? `${step.stepCode} ${step.label}` : step.label,
  );

  const roles = extraction.roles.length
    ? extraction.roles.map(role => role.name)
    : [...new Set(extraction.steps.map(step => step.responsible).filter((role): role is string => Boolean(role)))];

  const stepDetails: AiCaptureResultV1['stepDetails'] = extraction.steps.map((step, index) => ({
    step: index + 1,
    role: step.responsible,
    evidenceSnippet: step.evidenceSnippet,
  }));

  const notes: string[] = [];
  if (extraction.approvals.length) {
    notes.push(
      'Genehmigungen/Fristen: ' +
        extraction.approvals
          .map(approval => [approval.name, approval.authority, approval.leadTime].filter(Boolean).join(', '))
          .join('; '),
    );
  }

  const trigger = extraction.steps[0]?.label ?? 'Prozessstart';
  const outcome = extraction.steps[extraction.steps.length - 1]?.result
    ?? extraction.steps[extraction.steps.length - 1]?.label
    ?? 'Prozessende';

  return {
    schemaVersion: 'ai-capture-v1',
    language: 'de',
    endToEnd: {
      trigger,
      customer: roles[0] ?? 'intern',
      outcome,
    },
    happyPath,
    roles: roles.length ? roles : undefined,
    stepDetails: stepDetails.length ? stepDetails : undefined,
    notes: notes.length ? notes : undefined,
    warnings: extraction.warnings.length ? extraction.warnings : undefined,
  };
}
