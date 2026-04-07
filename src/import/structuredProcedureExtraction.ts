import type { AiCaptureResultV1 } from '../ai/aiTypes';

export interface StructuredProcedureStep {
  stepCode?: string;
  label: string;
  responsible?: string;
  description?: string;
  due?: string;
  result?: string;
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

function parsePipeTableRows(sectionText: string): string[][] {
  const rows: string[][] = [];
  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|[-\s|]+\|?\s*$/.test(trimmed)) continue;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim());
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
  const first = rows[0].map(c => c.toLowerCase());
  const headerKeywords = ['schritt', 'nr', 'code', 'verantwortlich', 'termin', 'ergebnis', 'beschreibung', 'prozessschritt'];
  const matches = first.filter(c => headerKeywords.some(k => c.includes(k)));
  return matches.length >= 2 ? 0 : -1;
}

function mapPipeTableHeaders(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, i) => {
    const lc = cell.toLowerCase();
    if (STEP_CODE_INLINE_RE.test(cell)) {
      map['code'] = i;
    } else if (lc.includes('prozessschritt') || lc.includes('schritt') || lc.includes('aktivität') || lc.includes('tätigkeit')) {
      map['label'] = i;
    } else if (lc.includes('verantwortlich') || lc.includes('zuständig') || lc.includes('rolle')) {
      map['responsible'] = i;
    } else if (lc.includes('beschreibung') || lc.includes('inhalt')) {
      map['description'] = i;
    } else if (lc.includes('termin') || lc.includes('frist') || lc.includes('zeitpunkt')) {
      map['due'] = i;
    } else if (lc.includes('ergebnis') || lc.includes('nachweis') || lc.includes('output')) {
      map['result'] = i;
    } else if (lc.includes('nr') || lc.includes('code') || lc === 'id') {
      map['code'] = i;
    }
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

function parseTableStepsFromRows(rows: string[][]): StructuredProcedureStep[] {
  if (!rows.length) return [];
  const headerIdx = detectPipeTableHeaders(rows);
  if (headerIdx < 0) return [];
  const colMap = mapPipeTableHeaders(rows[headerIdx]);

  const steps: StructuredProcedureStep[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (key: string): string | undefined => {
      const idx = colMap[key];
      return idx !== undefined && idx < row.length ? row[idx] || undefined : undefined;
    };

    let codeVal = get('code');
    let labelVal = sanitizeStepLabel(get('label'));
    if (!labelVal && codeVal && !STEP_CODE_INLINE_RE.test(codeVal)) {
      labelVal = sanitizeStepLabel(codeVal);
      codeVal = undefined;
    }
    if (!labelVal) {
      const firstFilled = row.find(c => c.length > 2 && !STEP_CODE_INLINE_RE.test(c));
      labelVal = sanitizeStepLabel(firstFilled);
    }
    if (!labelVal) continue;

    steps.push({
      stepCode: codeVal,
      label: labelVal,
      responsible: get('responsible'),
      description: get('description'),
      due: get('due'),
      result: get('result'),
      evidenceSnippet: row.filter(Boolean).join(' | ').slice(0, 300),
    });
  }
  return steps;
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
  const lines = sectionText.split('\n').map(l => l.trim()).filter(Boolean);
  const steps: StructuredProcedureStep[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const codeMatch = line.match(STEP_CODE_RE) || line.match(STEP_CODE_INLINE_RE);
    if (!codeMatch) {
      i++;
      continue;
    }
    const stepCode = codeMatch[1];
    const consumed: string[] = [line];
    let label = '';
    let responsible: string | undefined;
    let description: string | undefined;
    let due: string | undefined;
    let result: string | undefined;

    const nextLines: string[] = [];
    i++;
    while (i < lines.length && !lines[i].match(STEP_CODE_RE)) {
      nextLines.push(lines[i]);
      i++;
    }

    consumed.push(...nextLines);

    for (const nl of nextLines) {
      if (DUE_RE.test(nl)) {
        due = nl;
      } else if (!label) {
        label = nl;
      } else if (!responsible && nl.length < 80 && !/^\d/.test(nl)) {
        responsible = nl;
      } else if (!description) {
        description = nl;
      } else if (!result) {
        result = nl;
      }
    }

    label = sanitizeStepLabel(label) ?? '';
    if (!label) continue;

    steps.push({
      stepCode,
      label,
      responsible,
      description,
      due,
      result,
      evidenceSnippet: consumed.join(' ').slice(0, 300),
    });
  }
  return steps;
}

function parseRoles(sectionText: string): StructuredProcedureRole[] {
  const roles: StructuredProcedureRole[] = [];
  const rows = parsePipeTableRows(sectionText);
  const headerIdx = rows.findIndex(row => {
    const lc = row.map(c => c.toLowerCase());
    return lc.some(c => c.includes('rolle') || c.includes('funktion') || c.includes('gremium'));
  });

  if (headerIdx >= 0) {
    const header = rows[headerIdx].map(c => c.toLowerCase());
    const nameIdx = header.findIndex(c => c.includes('rolle') || c.includes('funktion') || c.includes('gremium') || c.includes('name'));
    const ownerIdx = header.findIndex(c => c.includes('inhaber') || c.includes('owner') || c.includes('leiter') || c.includes('besetzt'));
    const respIdx = header.findIndex(c => c.includes('aufgabe') || c.includes('verantwortung') || c.includes('zuständigkeit'));

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const name = nameIdx >= 0 && row[nameIdx] ? row[nameIdx] : row[0];
      if (!name) continue;
      roles.push({
        name,
        owner: ownerIdx >= 0 ? row[ownerIdx] || undefined : undefined,
        responsibility: respIdx >= 0 ? row[respIdx] || undefined : undefined,
      });
    }
    return roles;
  }

  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 150) continue;
    if (/^\d+\.\s/.test(trimmed)) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0 && colonIdx < 50) {
      roles.push({ name: trimmed.slice(0, colonIdx).trim(), responsibility: trimmed.slice(colonIdx + 1).trim() || undefined });
    } else if (trimmed.length < 80) {
      roles.push({ name: trimmed });
    }
  }
  return roles;
}

function parseApprovals(sectionText: string): StructuredProcedureApproval[] {
  const approvals: StructuredProcedureApproval[] = [];
  const rows = parsePipeTableRows(sectionText);
  const headerIdx = rows.findIndex(row => {
    const lc = row.map(c => c.toLowerCase());
    return lc.some(c => c.includes('genehmigung') || c.includes('freigabe') || c.includes('frist') || c.includes('beschluss'));
  });

  if (headerIdx >= 0) {
    const header = rows[headerIdx].map(c => c.toLowerCase());
    const nameIdx = header.findIndex(c => c.includes('genehmigung') || c.includes('freigabe') || c.includes('beschluss') || c.includes('schritt'));
    const authorityIdx = header.findIndex(c => c.includes('instanz') || c.includes('gremium') || c.includes('organ') || c.includes('zuständig'));
    const leadIdx = header.findIndex(c => c.includes('frist') || c.includes('vorlauf') || c.includes('termin'));
    const respIdx = header.findIndex(c => c.includes('verantwortlich') || c.includes('einreicher') || c.includes('ersteller'));

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const name = nameIdx >= 0 && row[nameIdx] ? row[nameIdx] : row[0];
      if (!name) continue;
      approvals.push({
        name,
        authority: authorityIdx >= 0 ? row[authorityIdx] || undefined : undefined,
        leadTime: leadIdx >= 0 ? row[leadIdx] || undefined : undefined,
        responsible: respIdx >= 0 ? row[respIdx] || undefined : undefined,
      });
    }
    return approvals;
  }

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

  const stepsSection = sections.get('4') ?? '';
  const rolesSection = sections.get('2') ?? '';
  const approvalsSection = sections.get('3') ?? '';

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

  if (!steps.length) return null;

  const roles = parseRoles(rolesSection || text);
  const approvals = parseApprovals(approvalsSection || text);
  const title = extractTitle(text);

  return { title, steps, roles, approvals, warnings };
}

export function buildAiCaptureFromStructuredProcedure(
  extraction: StructuredProcedureExtraction,
): AiCaptureResultV1 {
  const happyPath = extraction.steps.map(s =>
    s.stepCode ? `${s.stepCode} ${s.label}` : s.label,
  );

  const roles = extraction.roles.length
    ? extraction.roles.map(r => r.name)
    : [...new Set(extraction.steps.map(s => s.responsible).filter((r): r is string => Boolean(r)))];

  const stepDetails: AiCaptureResultV1['stepDetails'] = extraction.steps.map((s, idx) => ({
    step: idx + 1,
    role: s.responsible,
    evidenceSnippet: s.evidenceSnippet,
  }));

  const notes: string[] = [];
  if (extraction.approvals.length) {
    notes.push(
      'Genehmigungen/Fristen: ' +
        extraction.approvals
          .map(a => [a.name, a.authority, a.leadTime].filter(Boolean).join(', '))
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
