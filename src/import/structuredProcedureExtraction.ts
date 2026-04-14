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
  systems?: string[];
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
  systems: string[];
  approvals: StructuredProcedureApproval[];
  warnings: string[];
  explicitStructuredStepCount: number;
  structuredSectionFallback: boolean;
  structuredWholeTextFallback: boolean;
  structuredTableDetected: boolean;
  explicitRoleTableDetected: boolean;
  explicitSystemCount: number;
  structuredRecallLoss?: boolean;
}

const STEP_CODE_RE = /^([A-Z]{1,3}-\d{1,3})\s*$/;
const STEP_CODE_INLINE_RE = /^([A-Z]{1,3}-\d{1,3})\b/;
const DUE_RE = /T[+-]\s*\d+\s*(Tag(e)?|Woche[n]?|Monat(e)?|KW|Std\.?|h\b)/i;
const SECTION_RE = /^\s*(\d+)\.\s+/;
const TABLE_HEADER_HINT_RE = /\b(schritt|prozessschritt|aktivität|rolle|verantwortlich|zuständig|ergebnis|output|system|entscheidung|freigabe|beschreibung|termin|frist)\b/i;
const PSEUDO_LABEL_RE = /^(\d+\.?|[|/\-–—]+|[A-ZÄÖÜa-zäöüß]+\s*\|\s*\d+\.?)$/;
const NAMED_SECTION_RE = /^\s*((?:\d+(?:\.\d+)*)|[A-ZÄÖÜ])\.?\s+(.+)$/;
const MARKDOWN_HEADING_RE = /^\s*#{1,6}\s+(.+)$/;
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

interface StructuredStepSectionChoice {
  text: string;
  section?: NamedSection;
  steps: StructuredProcedureStep[];
  explicitStepCount: number;
  tableDetected: boolean;
  wholeTextFallback: boolean;
  sectionFallback: boolean;
}

interface PreparedRoleRow extends StructuredProcedureRole {
  canonicalName?: string;
  canonicalSystems: string[];
  matchTokens: Set<string>;
}

const ROLE_CANONICALS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'Kunde', patterns: [/\bkunde\b/i, /kund:in/i] },
  { label: 'Vertrieb', patterns: [/vertrieb/i, /account manager/i] },
  { label: 'Kundenservice', patterns: [/kundenservice/i, /customer service/i] },
  { label: 'Servicekoordination', patterns: [/servicekoordination/i, /dispatcher/i, /service desk/i] },
  { label: 'Sachbearbeitung', patterns: [/sachbearbeitung/i, /backoffice/i] },
  { label: 'Fachbereich', patterns: [/fachbereich/i] },
  { label: 'Teamleitung', patterns: [/teamleitung/i, /team lead/i] },
  { label: 'Qualitätsmanagement', patterns: [/qualit/i, /\bqm\b/i, /\bqs\b/i] },
  { label: 'Buchhaltung', patterns: [/buchhaltung/i, /finance/i, /kreditor/i, /debitor/i] },
  { label: 'Logistik', patterns: [/logistik/i, /lager/i, /versand/i] },
  { label: 'IT', patterns: [/\bit\b/i, /admin/i, /support/i] },
];

const ROLE_KEYWORD_HINTS: Array<{ pattern: RegExp; role: string }> = [
  { pattern: /kunde|kund:in/i, role: 'Kunde' },
  { pattern: /vertrieb|account/i, role: 'Vertrieb' },
  { pattern: /kundenservice|customer service/i, role: 'Kundenservice' },
  { pattern: /service|dispatcher|leitstand/i, role: 'Servicekoordination' },
  { pattern: /sachbearbeitung|backoffice/i, role: 'Sachbearbeitung' },
  { pattern: /fachbereich/i, role: 'Fachbereich' },
  { pattern: /teamleitung|team lead/i, role: 'Teamleitung' },
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
    const markdownMatch = line.match(MARKDOWN_HEADING_RE);
    if (match || markdownMatch) {
      if (current) {
        const body = current.buffer.join('\n').trim();
        sections.push({
          number: current.number,
          heading: current.heading,
          body,
          raw: [current.heading, body].filter(Boolean).join('\n'),
        });
      }
      current = match
        ? { number: match[1], heading: match[2], buffer: [] }
        : { heading: markdownMatch?.[1] ?? line.replace(/^#+\s*/, ''), buffer: [] };
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

function splitNumberedSections(text: string): NamedSection[] {
  return Array.from(splitSections(text).entries())
    .filter(([number]) => /^\d+$/.test(number))
    .map(([number, raw]) => {
    const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const firstLine = lines[0]?.trim() ?? '';
    const headingMatch = firstLine.match(NAMED_SECTION_RE);
    const heading = headingMatch?.[2] ?? (firstLine || `Abschnitt ${number}`);
    const body = (headingMatch ? lines.slice(1) : lines).join('\n').trim();
    return {
      number,
      heading,
      body,
      raw: raw.trim(),
    };
  });
}

function collectNamedSections(text: string): NamedSection[] {
  const sections = [...splitNamedSections(text), ...splitNumberedSections(text)];
  const seen = new Set<string>();
  const result: NamedSection[] = [];

  for (const section of sections) {
    const key = `${section.number ?? ''}::${section.heading.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(section);
  }

  return result;
}

function findNamedSection(text: string, patterns: RegExp[], preferredNumbers: string[] = []): NamedSection | undefined {
  const sections = collectNamedSections(text);
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

function preserveRoleLabel(value: string | undefined): string | undefined {
  return cleanCell(value);
}

function preserveSystemLabels(value: string | undefined): string[] {
  return splitStructuredValues(value);
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
    canonicalSystems: uniqueCaseInsensitive([
      ...(role.systems ?? []),
      ...splitStructuredValues(role.owner),
    ]),
    matchTokens: tokenSet([
      role.name,
      canonicalRoleLabel(role.name),
      role.responsibility,
      role.owner,
      ...(role.systems ?? []),
    ].filter(Boolean).join(' ')),
  }));

  return steps.map(step => {
    const explicitRoles = uniqueCaseInsensitive([
      ...(step.explicitRoles ?? []),
      ...splitStructuredValues(step.responsible),
    ]);
    const explicitRoleRows = preparedRoles.filter(role =>
      explicitRoles.some(explicitRole => canonicalRoleLabel(explicitRole) === role.canonicalName || normalizeMatchText(explicitRole) === normalizeMatchText(role.name)),
    );
    const localExplicitSystems = uniqueCaseInsensitive([
      ...(step.explicitSystems ?? []),
      ...splitStructuredValues(step.system),
    ]);
    const explicitSystems = uniqueCaseInsensitive([
      ...localExplicitSystems,
      ...(localExplicitSystems.length === 0 ? explicitRoleRows.flatMap(role => role.canonicalSystems ?? []) : []),
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
    const key = [
      step.stepCode ?? '',
      normalizeLabel(step.label).toLowerCase(),
      cleanCell(step.evidenceSnippet)?.toLowerCase() ?? '',
    ].join('|');
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

function hasStepHeaderMap(headerMap: Partial<Record<HeaderKey, number>>): boolean {
  return headerMap.label !== undefined
    || (
      headerMap.code !== undefined
      && (headerMap.responsible !== undefined || headerMap.result !== undefined || headerMap.description !== undefined)
    );
}

function hasRoleTableHeader(row: string[]): boolean {
  const header = row.map(cell => normalizeHeaderCell(cell));
  return header.some(cell => cell.includes('rolle') || cell.includes('funktion') || cell.includes('gremium') || cell === 'name');
}

function extractRoleRowsFromTableRows(rows: string[][]): StructuredProcedureRole[] {
  if (!rows.length) return [];
  const headerIdx = detectPipeTableHeaders(rows);
  if (headerIdx < 0) return [];

  const header = rows[headerIdx]?.map(cell => normalizeHeaderCell(cell)) ?? [];
  if (!hasRoleTableHeader(rows[headerIdx] ?? [])) return [];

  const nameIdx = header.findIndex(cell => cell.includes('rolle') || cell.includes('funktion') || cell.includes('gremium') || cell === 'name');
  const respIdx = header.findIndex(cell => cell.includes('aufgabe') || cell.includes('verantwort') || cell.includes('zuständig') || cell.includes('zustaendig'));
  const systemsIdx = header.findIndex(cell => cell === 'system' || cell === 'systeme');
  const ownerIdx = header.findIndex(cell => cell.includes('owner') || cell.includes('inhaber') || cell.includes('leiter') || cell === 'instanz');

  return rows
    .slice(headerIdx + 1)
    .map(row => ({
      name: preserveRoleLabel(cleanCell(nameIdx >= 0 ? row[nameIdx] : row[0])) ?? '',
      owner: cleanCell(ownerIdx >= 0 ? row[ownerIdx] : undefined),
      systems: preserveSystemLabels(cleanCell(systemsIdx >= 0 ? row[systemsIdx] : undefined)),
      responsibility: cleanCell(respIdx >= 0 ? row[respIdx] : undefined),
    }))
    .filter(role => role.name.length > 1)
    .filter((role, index, all) => all.findIndex(candidate => candidate.name.toLowerCase() === role.name.toLowerCase()) === index);
}

function chooseBestRoleTableBlock(blocks: ParsedTableBlock[]): ParsedTableBlock | undefined {
  return blocks
    .map(block => {
      const explicitRoles = extractRoleRowsFromTableRows(block.rows);
      return {
        block,
        explicitCount: explicitRoles.length,
        hasRoleHeader: hasRoleTableHeader(block.rows[0] ?? []),
        score: (hasRoleTableHeader(block.rows[0] ?? []) ? 50 : 0) + headerCoverage(block.rows[0] ?? []) * 8 + explicitRoles.length * 5,
      };
    })
    .filter(item => item.hasRoleHeader && item.explicitCount > 0)
    .sort((a, b) => b.score - a.score)[0]?.block;
}

function extractTableStepsFromRows(rows: string[][]): StructuredProcedureStep[] {
  if (!rows.length) return [];
  const headerIdx = detectPipeTableHeaders(rows);
  if (headerIdx < 0) return [];

  const headerMap = mapHeaderRow(rows[headerIdx]);
  if (!hasStepHeaderMap(headerMap)) return [];

  return rows
    .slice(headerIdx + 1)
    .map(row => buildStepFromHeaderMappedRow(row, headerMap))
    .filter((step): step is StructuredProcedureStep => Boolean(step));
}

function chooseBestStepTableBlock(blocks: ParsedTableBlock[]): ParsedTableBlock | undefined {
  return blocks
    .map(block => {
      const headerMap = mapHeaderRow(block.rows[0] ?? []);
      const explicitSteps = extractTableStepsFromRows(block.rows);
      return {
        block,
        explicitCount: explicitSteps.length,
        hasStepHeader: hasStepHeaderMap(headerMap),
        score: (hasStepHeaderMap(headerMap) ? 60 : 0) + headerCoverage(block.rows[0] ?? []) * 10 + explicitSteps.length * 6,
      };
    })
    .filter(item => item.hasStepHeader && item.explicitCount > 0)
    .sort((a, b) => b.score - a.score)[0]?.block;
}

function parseFlexibleTableStepSource(sectionText: string): {
  steps: StructuredProcedureStep[];
  explicitStepCount: number;
  tableDetected: boolean;
} {
  const pipeBlock = chooseBestStepTableBlock(parsePipeTableBlocks(sectionText));
  if (pipeBlock) {
    const explicitSteps = extractTableStepsFromRows(pipeBlock.rows);
    return {
      steps: dedupeSteps(explicitSteps),
      explicitStepCount: explicitSteps.length,
      tableDetected: explicitSteps.length > 0,
    };
  }

  const delimitedRows = parseDelimitedTableRows(sectionText);
  const explicitSteps = extractTableStepsFromRows(delimitedRows);
  if (explicitSteps.length > 0) {
    return {
      steps: dedupeSteps(explicitSteps),
      explicitStepCount: explicitSteps.length,
      tableDetected: true,
    };
  }

  return {
    steps: [],
    explicitStepCount: 0,
    tableDetected: false,
  };
}

function chooseStructuredStepSection(text: string): StructuredStepSectionChoice | undefined {
  const sectionPatterns = [/standardablauf/i, /prozessablauf/i, /verfahrensablauf/i, /\bablauf\b/i, /\bvorgehen\b/i];
  const rolePatterns = [/rollen?\s*(?:und|&|\/)\s*systeme?/i, /systeme?\s*(?:und|&|\/)\s*rollen?/i, /^rollen?$/i, /verantwortlichkeiten/i];
  const sections = collectNamedSections(text);

  const sectionCandidates = sections
    .map(section => {
      const sectionText = section.body || section.raw;
      const tableSource = parseFlexibleTableStepSource(sectionText);
      const flatSteps = tableSource.steps.length > 0 ? [] : parseFlatStepBlocks(sectionText);
      const matchedHeading = sectionPatterns.some(pattern => pattern.test(section.heading));
      const roleLikeHeading = rolePatterns.some(pattern => pattern.test(section.heading));
      const explicitStepCount = tableSource.explicitStepCount > 0 ? tableSource.explicitStepCount : flatSteps.length;
      const steps = tableSource.steps.length > 0 ? tableSource.steps : flatSteps;
      const score =
        (matchedHeading ? 140 : 0)
        + (tableSource.tableDetected ? 70 : 0)
        + explicitStepCount * 7
        + steps.length * 3
        - (roleLikeHeading ? 80 : 0);

      return {
        text: sectionText,
        section,
        steps,
        explicitStepCount,
        tableDetected: tableSource.tableDetected,
        wholeTextFallback: false,
        sectionFallback: !matchedHeading,
        matchedHeading,
        score,
      };
    })
    .filter(candidate => candidate.explicitStepCount > 0);

  const preferredSections = sectionCandidates.filter(candidate => candidate.matchedHeading);
  const bestSection = (preferredSections.length > 0 ? preferredSections : sectionCandidates)
    .sort((a, b) => b.score - a.score)[0];
  if (bestSection) {
    return {
      text: bestSection.text,
      section: bestSection.section,
      steps: bestSection.steps,
      explicitStepCount: bestSection.explicitStepCount,
      tableDetected: bestSection.tableDetected,
      wholeTextFallback: false,
      sectionFallback: bestSection.sectionFallback,
    };
  }

  const fullTextTableSource = parseFlexibleTableStepSource(text);
  const fullTextSteps = fullTextTableSource.steps.length > 0 ? fullTextTableSource.steps : parseFlatStepBlocks(text);
  const explicitStepCount = fullTextTableSource.explicitStepCount > 0 ? fullTextTableSource.explicitStepCount : fullTextSteps.length;
  if (explicitStepCount === 0) return undefined;

  return {
    text,
    steps: fullTextSteps,
    explicitStepCount,
    tableDetected: fullTextTableSource.tableDetected,
    wholeTextFallback: true,
    sectionFallback: true,
  };
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
  const pipeBlock = chooseBestRoleTableBlock(parsePipeTableBlocks(sectionText));
  const pipeRoles = extractRoleRowsFromTableRows(pipeBlock?.rows ?? []);
  if (pipeRoles.length > 0) return pipeRoles;

  const delimitedRoles = extractRoleRowsFromTableRows(parseDelimitedTableRows(sectionText));
  if (delimitedRoles.length > 0) return delimitedRoles;

  return [];
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
      roles.push({ name: preserveRoleLabel(trimmed.slice(0, colonIdx).trim()) ?? trimmed.slice(0, colonIdx).trim(), responsibility: trimmed.slice(colonIdx + 1).trim() || undefined });
    } else if (trimmed.length < 80 && !isHeaderCell(trimmed)) {
      roles.push({ name: preserveRoleLabel(trimmed) ?? trimmed });
    }
  }
  return roles.filter((role, index, all) => all.findIndex(candidate => candidate.name.toLowerCase() === role.name.toLowerCase()) === index);
}

function extractStructuredRoleEvidence(sectionText: string): {
  roles: StructuredProcedureRole[];
  explicitRoleTableDetected: boolean;
} {
  const flatRoleRows = parseFlatRoleRows(sectionText);
  const tableRoles = parseRoleTable(sectionText);
  const explicitRoleTableDetected = flatRoleRows.length > 0 || tableRoles.length > 0;
  const roles = [
    ...flatRoleRows,
    ...(tableRoles.length > 0 ? tableRoles : parseRoles(sectionText)),
  ].filter((role, index, all) => all.findIndex(candidate => candidate.name.toLowerCase() === role.name.toLowerCase()) === index);

  return {
    roles,
    explicitRoleTableDetected,
  };
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
      name: preserveRoleLabel(name) ?? name,
      responsibility: responsibility || undefined,
      owner: maybeOwner && !/^systeme?$/i.test(maybeOwner) ? (cleanCell(maybeOwner) || undefined) : undefined,
      systems: maybeOwner && !/^systeme?$/i.test(maybeOwner) ? preserveSystemLabels(maybeOwner) : undefined,
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
  const roleSectionPatterns = [
    /rollen?\s*(?:und|&|\/)\s*systeme?/i,
    /systeme?\s*(?:und|&|\/)\s*rollen?/i,
    /rollen?.*systeme?/i,
    /^rollen?$/i,
    /verantwortlichkeiten/i,
  ];
  const namedRolesSection = findNamedSection(text, roleSectionPatterns, ['2']);
  const namedApprovalsSection = findNamedSection(text, [/entscheidungslogik/i, /entscheidungsregeln/i, /freigaberegeln/i, /entscheidungen/i], ['6', '4']);
  const stepsSource = chooseStructuredStepSection(text);
  if (!stepsSource) return null;
  const rolesSection = namedRolesSection?.body ?? sections.get('2') ?? '';
  const approvalsSection = namedApprovalsSection?.body ?? sections.get('3') ?? sections.get('4') ?? '';

  let steps = stepsSource.steps;

  if (stepsSource.wholeTextFallback) {
    warnings.push('Prozessschritte wurden nicht in einem benannten Ablaufabschnitt gefunden – Ganztext-Fallback verwendet.');
  } else if (stepsSource.sectionFallback) {
    warnings.push('Benannter Ablaufabschnitt wurde nicht eindeutig erkannt – bestpassende strukturierte Ablaufquelle verwendet.');
  }

  const roleEvidence = extractStructuredRoleEvidence(rolesSection || text);
  const roles = roleEvidence.roles;

  steps = enrichStepsWithRoleRows(dedupeSteps(steps), roles);
  steps = dedupeSteps(steps);
  if (!steps.length) return null;

  const explicitSystems = uniqueCaseInsensitive([
    ...roles.flatMap(role => role.systems ?? []),
    ...steps.flatMap(step => [...(step.explicitSystems ?? []), ...(step.systems ?? [])]),
  ]);
  const structuredRecallLoss = steps.length < stepsSource.explicitStepCount;
  if (structuredRecallLoss) {
    warnings.push(`Structured-Recall-Verlust erkannt: ${steps.length} von ${stepsSource.explicitStepCount} expliziten Ablaufzeilen wurden übernommen.`);
  }

  const approvals = parseApprovals(approvalsSection || text);
  const title = extractTitle(text);

  return {
    title,
    steps,
    roles,
    systems: explicitSystems,
    approvals,
    warnings,
    explicitStructuredStepCount: stepsSource.explicitStepCount,
    structuredSectionFallback: stepsSource.sectionFallback,
    structuredWholeTextFallback: stepsSource.wholeTextFallback,
    structuredTableDetected: stepsSource.tableDetected,
    explicitRoleTableDetected: roleEvidence.explicitRoleTableDetected,
    explicitSystemCount: explicitSystems.length,
    structuredRecallLoss,
  };
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
