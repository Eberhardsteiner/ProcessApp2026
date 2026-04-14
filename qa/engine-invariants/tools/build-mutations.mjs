import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readStructuredSourceText } from './source-reader.mjs';

const PIPE_SEPARATOR_RE = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/;

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseTableBlocks(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks = [];
  let current = null;

  const flush = endLine => {
    if (!current || current.rows.length === 0) {
      current = null;
      return;
    }
    blocks.push({ ...current, endLine });
    current = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      flush(index);
      return;
    }
    if (PIPE_SEPARATOR_RE.test(trimmed)) return;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => normalizeWhitespace(cell));
    if (!current) current = { startLine: index, rows: [] };
    current.rows.push(cells);
  });

  flush(lines.length);
  return { lines, blocks };
}

function stringifyTable(rows) {
  if (rows.length === 0) return '';
  const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
  return [
    `| ${rows[0].join(' | ')} |`,
    separator,
    ...rows.slice(1).map(row => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function replaceBlock(lines, block, replacement) {
  const next = [...lines];
  next.splice(block.startLine, block.endLine - block.startLine, ...replacement.split('\n'));
  return next.join('\n');
}

function normalizeHeaderCell(value) {
  return normalizeWhitespace(value).toLowerCase().replace(/[.:]/g, '');
}

function classifyHeaderKey(value) {
  const header = normalizeHeaderCell(value);
  if (['nr', 'nummer', 'id', 'code'].includes(header)) return 'index';
  if (header.includes('schritt') || header.includes('aktiv') || header.includes('vorgang')) return 'label';
  if (header === 'rolle' || header === 'name') return 'role-name';
  if (header.includes('verantwort') || header.includes('zuständig') || header.includes('zustaendig') || header === 'aufgabe') return 'responsibility';
  if (header === 'system' || header === 'systeme') return 'system';
  if (header === 'ergebnis' || header === 'output') return 'result';
  return undefined;
}

function reorderStructuredTables(text) {
  const { lines, blocks } = parseTableBlocks(text);
  let currentText = lines.join('\n');
  const workingBlocks = blocks.sort((left, right) => right.startLine - left.startLine);

  for (const block of workingBlocks) {
    const header = block.rows[0] ?? [];
    const headerKeys = header.map(classifyHeaderKey);
    const headerMap = new Map(headerKeys.map((key, index) => [key, index]).filter(([key]) => Boolean(key)));
    const isStepTable = headerMap.has('label') && headerMap.has('index');
    const isRoleTable = headerMap.has('role-name') && headerMap.has('system') && !headerMap.has('index');
    if (!isStepTable && !isRoleTable) continue;

    const order = isStepTable
      ? ['label', 'index', 'system', 'responsibility', 'result']
      : ['system', 'role-name', 'responsibility'];
    const available = order
      .map(key => headerMap.get(key))
      .filter(index => Number.isInteger(index));
    const remaining = header.map((_, index) => index).filter(index => !available.includes(index));
    const nextOrder = [...available, ...remaining];
    const reorderedRows = block.rows.map(row => nextOrder.map(index => row[index] ?? ''));
    currentText = replaceBlock(currentText.split('\n'), block, stringifyTable(reorderedRows));
  }

  return currentText;
}

function rewriteHeadings(text) {
  return text
    .replace(/^# .+$/m, '# Strukturierte Verfahrensquelle')
    .replace(/^## Rollen und Systeme$/m, '## Zuständigkeiten und Werkzeuge')
    .replace(/^## Standardablauf$/m, '## Verfahrensfolge')
    .replace(/^## Hinweise$/m, '## Ergänzende Rahmenbedingungen');
}

function neutralizeNarrativeLanguage(text) {
  return text
    .replace(/Sollprozess/g, 'Ablaufbeschreibung')
    .replace(/Primärwahrheit/g, 'führende Struktur')
    .replace(/klaren Sollprozess/g, 'klaren Ablauf')
    .replace(/klare[nr]? Sollprozess/g, 'klaren Ablauf');
}

function mutateStepLabels(text) {
  return text
    .replace(/\berfassen\b/gi, 'aufnehmen')
    .replace(/\bprüfen\b/gi, 'validieren')
    .replace(/\banfordern\b/gi, 'einholen')
    .replace(/\bbewerten\b/gi, 'klassifizieren')
    .replace(/\babstimmen\b/gi, 'entscheiden')
    .replace(/\bkommunizieren\b/gi, 'übermitteln')
    .replace(/\bfesthalten\b/gi, 'dokumentieren')
    .replace(/\bsichern\b/gi, 'archivieren');
}

function shiftSeparators(text) {
  return text
    .replace(/; /g, ' / ')
    .replace(/, /g, ' / ');
}

function appendGovernanceSection(text) {
  return `${text.trim()}\n\n## Governance und Risiko\nZusätzliche Governance-, Risiko- und Review-Hinweise dürfen die expliziten Ablaufzeilen nicht überschreiben.`.trim();
}

function baseNameFor(sourcePath) {
  return path.basename(sourcePath, path.extname(sourcePath));
}

export async function buildMutationVariants(params) {
  const sourceText = await readStructuredSourceText(params.sourcePath);
  const outputDir = params.outputDir;
  await mkdir(outputDir, { recursive: true });

  const variants = [
    {
      id: 'headings-neutral',
      description: 'Andere Überschriften und neutralisierte Rahmensprache',
      text: appendGovernanceSection(neutralizeNarrativeLanguage(rewriteHeadings(sourceText))),
    },
    {
      id: 'step-synonyms',
      description: 'Mutierte Schrittlabels mit Synonymen und zusätzlicher Governance-Sektion',
      text: appendGovernanceSection(mutateStepLabels(sourceText)),
    },
    {
      id: 'column-order',
      description: 'Vertauschte Tabellen-Spaltenreihenfolge',
      text: reorderStructuredTables(sourceText),
    },
    {
      id: 'separator-shift',
      description: 'Andere Mehrwert-Trenner und neutralisierte Sprache',
      text: neutralizeNarrativeLanguage(shiftSeparators(sourceText)),
    },
  ];

  const written = [];
  for (const variant of variants) {
    const filePath = path.join(outputDir, `${baseNameFor(params.sourcePath)}--${variant.id}.md`);
    await writeFile(filePath, `${variant.text.trim()}\n`, 'utf8');
    written.push({
      id: variant.id,
      description: variant.description,
      sourcePath: filePath,
    });
  }

  return written;
}
