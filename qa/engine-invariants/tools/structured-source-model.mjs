const SPLIT_RE = /[,;|]|\s+\/\s+|\s+und\s+|\s+sowie\s+|\s+plus\s+/i;
const PIPE_SEPARATOR_RE = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/;

const DOMAIN_GROUPS = [
  { key: 'service', patterns: [/störung|stoerung|ticket|monitoring|leitstand|remote|einsatz/i] },
  { key: 'billing', patterns: [/rechnung|zahlung|gutschrift|buchhaltung/i] },
  { key: 'onboarding', patterns: [/onboarding|zugang|equipment|personalnummer|iam/i] },
  { key: 'procurement', patterns: [/beschaffung|einkauf|lieferant|bestellung|angebot/i] },
  { key: 'returns', patterns: [/retoure|garantie|rma|rücksendung|ruecksendung/i] },
  { key: 'complaints', patterns: [/reklamation|mangel|abweichung|kulanz/i] },
];

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const cleaned = normalizeWhitespace(value);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function atomizeStructuredValues(values) {
  return uniqueStrings(
    values.flatMap(value => normalizeWhitespace(value).split(SPLIT_RE).map(part => normalizeWhitespace(part))),
  );
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
    if (!current) {
      current = { startLine: index + 1, rows: [] };
    }
    current.rows.push(cells);
  });

  flush(lines.length);
  return blocks;
}

function normalizeHeaderCell(value) {
  return normalizeWhitespace(value).toLowerCase().replace(/[.:]/g, '');
}

function classifyHeaderKey(value) {
  const header = normalizeHeaderCell(value);
  if (['nr', 'nummer', 'id', 'code'].includes(header)) return 'index';
  if (header.includes('schritt') || header.includes('aktiv') || header.includes('vorgang')) return 'label';
  if (header.includes('verantwort') || header.includes('zuständig') || header.includes('zustaendig') || header === 'rolle') return 'responsible';
  if (header === 'system' || header === 'systeme') return 'system';
  if (header === 'ergebnis' || header === 'output') return 'result';
  if (header === 'aufgabe' || header === 'beschreibung') return 'description';
  if (header === 'rolle' || header === 'funktion' || header === 'name') return 'role-name';
  return undefined;
}

function headerCoverage(row) {
  return row.filter(cell => Boolean(classifyHeaderKey(cell))).length;
}

function mapHeaderRow(row) {
  const headerMap = {};
  row.forEach((cell, index) => {
    const key = classifyHeaderKey(cell);
    if (key && headerMap[key] === undefined) {
      headerMap[key] = index;
    }
  });
  return headerMap;
}

function extractStepRowsFromBlock(block) {
  const headerIndex = block.rows.findIndex(row => headerCoverage(row) >= 2 && mapHeaderRow(row).label !== undefined);
  if (headerIndex < 0) return [];
  const headerMap = mapHeaderRow(block.rows[headerIndex]);
  return block.rows
    .slice(headerIndex + 1)
    .map((row, index) => {
      const label = normalizeWhitespace(row[headerMap.label] ?? '');
      if (!label) return null;
      return {
        label,
        explicitRoles: atomizeStructuredValues([row[headerMap.responsible] ?? '']),
        explicitSystems: atomizeStructuredValues([row[headerMap.system] ?? '']),
        evidenceAnchor: `table-row:${block.startLine + headerIndex + index + 1}`,
      };
    })
    .filter(Boolean);
}

function extractRoleRowsFromBlock(block) {
  const headerIndex = block.rows.findIndex(row => {
    const headerMap = mapHeaderRow(row);
    return headerCoverage(row) >= 2 && (headerMap['role-name'] !== undefined || headerMap.responsible !== undefined) && headerMap.system !== undefined;
  });
  if (headerIndex < 0) return [];
  const headerMap = mapHeaderRow(block.rows[headerIndex]);
  const roleIndex = headerMap['role-name'] ?? headerMap.responsible ?? 0;
  return block.rows
    .slice(headerIndex + 1)
    .map(row => ({
      name: normalizeWhitespace(row[roleIndex] ?? ''),
      systems: atomizeStructuredValues([row[headerMap.system] ?? '']),
    }))
    .filter(row => row.name);
}

function chooseBestStepBlock(blocks) {
  return blocks
    .map(block => ({ block, rows: extractStepRowsFromBlock(block) }))
    .filter(item => item.rows.length > 0)
    .sort((left, right) => right.rows.length - left.rows.length)[0];
}

function chooseBestRoleBlock(blocks) {
  return blocks
    .map(block => ({ block, rows: extractRoleRowsFromBlock(block) }))
    .filter(item => item.rows.length > 0)
    .sort((left, right) => right.rows.length - left.rows.length)[0];
}

function extractNumberedListSteps(text) {
  return text
    .split('\n')
    .map(line => normalizeWhitespace(line))
    .map((line, index) => {
      const match = line.match(/^\d+[.)]\s+(.+)$/);
      if (!match) return null;
      return {
        label: normalizeWhitespace(match[1]),
        explicitRoles: [],
        explicitSystems: [],
        evidenceAnchor: `numbered-line:${index + 1}`,
      };
    })
    .filter(Boolean);
}

function detectDomainConflict(text) {
  const scored = DOMAIN_GROUPS
    .map(group => ({
      key: group.key,
      score: group.patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0),
    }))
    .filter(group => group.score > 0)
    .sort((left, right) => right.score - left.score);

  return {
    hasConflict: (scored[0]?.score ?? 0) > 0 && (scored[1]?.score ?? 0) > 0 && Math.abs((scored[0]?.score ?? 0) - (scored[1]?.score ?? 0)) <= 1,
    dominantDomains: scored.slice(0, 3).map(item => item.key),
  };
}

export function deriveStructuredSourceModel(text) {
  const tableBlocks = parseTableBlocks(text);
  const bestStepBlock = chooseBestStepBlock(tableBlocks);
  const bestRoleBlock = chooseBestRoleBlock(tableBlocks);
  const explicitSteps = bestStepBlock?.rows?.length > 0
    ? bestStepBlock.rows
    : extractNumberedListSteps(text);
  const roleRows = bestRoleBlock?.rows ?? [];
  const explicitStepLabels = explicitSteps.map(step => step.label);
  const aggregateExplicitRoles = atomizeStructuredValues([
    ...roleRows.map(row => row.name),
    ...explicitSteps.flatMap(step => step.explicitRoles),
  ]);
  const aggregateExplicitSystems = atomizeStructuredValues([
    ...roleRows.flatMap(row => row.systems),
    ...explicitSteps.flatMap(step => step.explicitSystems),
  ]);
  const hasMultivalueRoles = explicitSteps.some(step => step.explicitRoles.length > 1);
  const hasMultivalueSystems = explicitSteps.some(step => step.explicitSystems.length > 1);
  const domainConflict = detectDomainConflict(text);

  return {
    sourceFamily: hasMultivalueRoles || hasMultivalueSystems ? 'structured-multivalue-context' : 'structured-explicit-workflow',
    isStructuredWorkflow: explicitSteps.length >= 3,
    explicitStepCount: explicitSteps.length,
    explicitStepLabels,
    explicitSteps,
    aggregateExplicitRoles,
    aggregateExplicitSystems,
    hasMultivalueRoles,
    hasMultivalueSystems,
    hasDomainConflict: domainConflict.hasConflict,
    dominantDomains: domainConflict.dominantDomains,
    stepTableDetected: Boolean(bestStepBlock),
    roleTableDetected: Boolean(bestRoleBlock),
  };
}
