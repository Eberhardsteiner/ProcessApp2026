const SPLIT_RE = /[\n\r,;|]+|\s*\/\s*|\s+(?:und|sowie|plus)\s+/i;
const PIPE_SEPARATOR_RE = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/;
const MARKDOWN_SECTION_HEADING_RE = /^\s*(#{1,6})\s+(.+?)\s*$/;
const MAJOR_SECTION_HEADING_RE = /^\s*([1-9])\.\s+(.+)$/;
const ALPHA_SECTION_HEADING_RE = /^\s*([A-ZÄÖÜ])\.\s+(.+)$/;
const MIXED_PROCESS_VERB_RE = /\b(erfassen|anlegen|prüfen|pruefen|bewerten|zuordnen|kommunizieren|dokumentieren|freigeben|entscheiden|einholen|abschließen|abschliessen|weiterleiten|validieren|archivieren|aufnehmen)\b/i;
const MIXED_PROCESS_HINT_RE = /\b(prozesskern|prozessschritt|standardablauf|prozessablauf|verfahrensfolge|ablauf|vorgehen|typischerweise|[üu]blicherweise)\b/i;
const MIXED_SIGNAL_TABLE_RE = /\b(signaltabelle|signalmatrix|beobachtung(?:en)?|wirkung|bedeutung|friktion|reibung|risiko)\b/i;
const MIXED_PROCESS_TABLE_RE = /\b(schritt|aktivit[aä]t|vorgang|prozessschritt|rolle|verantwort(?:ung|lich)|systeme?)\b/i;
const MIXED_REVIEW_RE = /\b(review|notiz|r[üu]ckmeldung|merkpunkt|bitte\b|redaktionell|pr[üu]fen|pruefen)\b/i;
const MIXED_GOVERNANCE_RE = /\b(governance|owner|eigent[üu]merschaft|verantwort|freigabestatus|management-freigabe|intern freigegeben|4-augen|audit|compliance|zieldatum|policy|richtlinie)\b/i;
const MIXED_ACCEPTANCE_RE = /\b(abnahme|abnahmekriter(?:ium|ien)?|annahmekriter(?:ium|ien)?|akzeptanz|done criteria|nicht in den kernprozess|nicht als kernschritt|nur unterst[üu]tzend|nur als hinweis)\b/i;
const MIXED_SUPPORT_CONTEXT_RE = /\b(kontext|rahmen|hintergrund|erg[aä]nzend|zus[aä]tzlich|begleitend|einordnung)\b/i;
const MIXED_QUESTION_RE = /(^|\s)(wer|wie|wann|warum|wieso|wozu)\b|\?|\boffene fragen\b/i;
const MIXED_QUOTE_RE = /(^["'„“‚‘]|zitat|mail-auszug|e-?mail-auszug|besprechungsausschnitt)/i;
const LOCAL_ISSUE_CUE_RE = /\b(problem|risiko|issue|hinder|st[öo]r|warn|verz[öo]ger|verlangsam|warte|block|eskal|konflikt|fehl\w+|unvollst[aä]ndig|mehrfach|medienbruch|r[üu]ckfrage|unklar|nacharbeit|abweich|druck|engpass|stillstand|kritisch|schwach|erschwer|belast|mehraufwand|zus[aä]tzlichen?\s+aufwand|aufwendig)\b/i;

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
  if (header.includes('verantwort') || header.includes('zuständig') || header.includes('zustaendig') || header.includes('zuständigkeit') || header.includes('zustaendigkeit') || header.includes('bearbeiter') || header.includes('team') || header === 'rolle') return 'responsible';
  if (header === 'system' || header === 'systeme' || header.includes('tool') || header.includes('anwendung') || header.includes('applik')) return 'system';
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

function emptyMixedSegmentCounts() {
  return {
    'process-core': 0,
    quote: 0,
    question: 0,
    'review-note': 0,
    'governance-note': 0,
    'signal-table': 0,
    'acceptance-instruction': 0,
    'support-context': 0,
  };
}

function isTableLikeBlock(text) {
  return text.split('\n').some(line => line.trim().startsWith('|'));
}

function isMixedProcessTable(text) {
  if (!isTableLikeBlock(text)) return false;
  const normalized = normalizeWhitespace(text);
  return MIXED_PROCESS_TABLE_RE.test(normalized) && /\b(schritt|aktivit[aä]t|vorgang|prozessschritt)\b/i.test(normalized);
}

function splitMixedBlocks(body) {
  const lines = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks = [];
  let current = [];
  let currentMode = null;

  const flush = () => {
    const block = current.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (block) blocks.push(block);
    current = [];
    currentMode = null;
  };

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line) {
      flush();
      continue;
    }

    const isTableLine = rawLine.trim().startsWith('|');
    if (isTableLine) {
      if (currentMode === 'text' && current.length > 0) flush();
      currentMode = 'table';
      current.push(line);
      continue;
    }

    if (currentMode === 'table') flush();
    currentMode = 'text';
    current.push(line);
  }

  flush();
  return blocks;
}

function deriveMixedBlockTitle(body, fallbackTitle) {
  const lines = body.split('\n').map(line => normalizeWhitespace(line)).filter(Boolean);
  const firstLine = normalizeWhitespace((lines[0] ?? '').replace(/^[•*-]\s*/, '').replace(/^>\s*/, ''));
  if (firstLine && firstLine.length <= 96 && !/[.!?]/.test(firstLine)) {
    return firstLine.replace(/[.:]+$/g, '').trim();
  }

  const normalized = normalizeWhitespace(body);
  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  const candidate = normalizeWhitespace(firstSentence.replace(/^[•*-]\s*/, '').replace(/[.:]+$/g, ''));
  return candidate || fallbackTitle || 'Abschnitt';
}

function classifyMixedSectionKind(section) {
  const combined = normalizeWhitespace(`${section.title} ${section.body}`);
  const lower = combined.toLowerCase();
  const hasTableLike = isTableLikeBlock(section.body);
  const hasProcessTable = hasTableLike && isMixedProcessTable(section.body);
  const hasSignalTable = hasTableLike && !hasProcessTable && MIXED_SIGNAL_TABLE_RE.test(lower);
  const hasProcessHint = MIXED_PROCESS_HINT_RE.test(lower) || MIXED_PROCESS_VERB_RE.test(lower);
  const hasReviewNote = MIXED_REVIEW_RE.test(lower);
  const hasGovernanceNote = MIXED_GOVERNANCE_RE.test(lower);

  if (!combined) return 'support-context';
  if (MIXED_ACCEPTANCE_RE.test(lower)) return 'acceptance-instruction';
  if (MIXED_QUESTION_RE.test(section.body) || MIXED_QUESTION_RE.test(section.title)) return 'question';
  if (hasSignalTable) return 'signal-table';
  if (hasGovernanceNote && !hasReviewNote) return 'governance-note';
  if (hasReviewNote && !hasProcessTable) return 'review-note';
  if (MIXED_QUOTE_RE.test(section.body) || MIXED_QUOTE_RE.test(section.title)) return 'quote';
  if (hasProcessTable || hasProcessHint) return 'process-core';
  if (hasGovernanceNote) return 'governance-note';
  if (MIXED_SUPPORT_CONTEXT_RE.test(lower)) return 'support-context';
  return 'support-context';
}

function extractMixedProcessSteps(body) {
  const listSteps = body
    .split('\n')
    .map(line => normalizeWhitespace(line))
    .map((line, index) => {
      const match = line.match(/^(?:[-•*]|\d+[.)])\s+(.+)$/);
      if (!match) return null;
      const label = normalizeWhitespace(match[1]).replace(/[.:]+$/g, '').trim();
      if (!label || !MIXED_PROCESS_VERB_RE.test(label)) return null;
      return {
        label,
        explicitRoles: [],
        explicitSystems: [],
        evidenceAnchor: `mixed-list:${index + 1}`,
      };
    })
    .filter(Boolean);
  if (listSteps.length >= 2) return listSteps;

  return normalizeWhitespace(body)
    .split(/(?<=[.!?])\s+/)
    .map((sentence, index) => {
      const label = normalizeWhitespace(sentence).replace(/[.:]+$/g, '').trim();
      if (label.length < 18 || !MIXED_PROCESS_VERB_RE.test(label)) return null;
      return {
        label,
        explicitRoles: [],
        explicitSystems: [],
        evidenceAnchor: `mixed-sentence:${index + 1}`,
      };
    })
    .filter(Boolean);
}

function extractIssueAnchors(text) {
  const sentenceAnchors = normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map(part => normalizeWhitespace(part))
    .filter(part => part.length >= 20 && LOCAL_ISSUE_CUE_RE.test(part));
  const tableAnchors = text
    .split('\n')
    .map(line => normalizeWhitespace(line))
    .filter(line => line.startsWith('|') && LOCAL_ISSUE_CUE_RE.test(line));
  return uniqueStrings([...sentenceAnchors, ...tableAnchors]);
}

function parseMixedSections(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\f/g, '\n');
  const lines = normalized.split('\n');
  const rawSections = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const body = current.lines.join('\n').trim();
    if (body || current.title) rawSections.push({ ...current, lines: current.lines.slice() });
    current = null;
  };

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line) {
      if (current && current.lines[current.lines.length - 1] !== '') current.lines.push('');
      continue;
    }

    const markdownHeading = rawLine.match(MARKDOWN_SECTION_HEADING_RE);
    if (markdownHeading) {
      flush();
      current = { heading: markdownHeading[1], title: normalizeWhitespace(markdownHeading[2]), lines: [] };
      continue;
    }

    const majorHeading = line.match(MAJOR_SECTION_HEADING_RE);
    if (majorHeading) {
      flush();
      current = { heading: majorHeading[1], title: normalizeWhitespace(majorHeading[2]), lines: [] };
      continue;
    }

    const alphaHeading = line.match(ALPHA_SECTION_HEADING_RE);
    if (alphaHeading) {
      flush();
      current = { heading: alphaHeading[1], title: normalizeWhitespace(alphaHeading[2]), lines: [] };
      continue;
    }

    if (!current) current = { title: rawSections.length === 0 ? 'Kontext' : `Abschnitt ${rawSections.length + 1}`, lines: [] };
    current.lines.push(line);
  }

  flush();

  return rawSections
    .flatMap((section, index) => {
      const body = section.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      const blocks = splitMixedBlocks(body);
      const normalizedBlocks = blocks.length > 0 ? blocks : [body];
      return normalizedBlocks.map((block, blockIndex) => {
        const title = normalizedBlocks.length === 1 ? section.title : deriveMixedBlockTitle(block, section.title);
        const kind = classifyMixedSectionKind({ title, body: block });
        return {
          key: `mixed-section:${index + 1}:${blockIndex + 1}`,
          title,
          body: block,
          kind,
        };
      });
    })
    .filter(section => normalizeWhitespace(`${section.title} ${section.body}`).length >= 8);
}

function deriveMixedSourceModel(text) {
  const sections = parseMixedSections(text);
  if (sections.length < 2) return null;

  const counts = emptyMixedSegmentCounts();
  sections.forEach(section => {
    counts[section.kind] += 1;
  });

  const strongNonCoreCount = sections.filter(section => (
    ['quote', 'question', 'review-note', 'governance-note', 'signal-table', 'acceptance-instruction'].includes(section.kind)
  )).length;
  const explicitSteps = [];
  const seen = new Set();
  sections
    .filter(section => section.kind === 'process-core')
    .flatMap(section => extractMixedProcessSteps(section.body))
    .forEach(step => {
      const key = normalizeKey(step.label);
      if (seen.has(key)) return;
      seen.add(key);
      explicitSteps.push(step);
    });

  if (explicitSteps.length < 2 || strongNonCoreCount === 0) return null;

  const issueAnchors = uniqueStrings(
    sections
      .filter(section => section.kind !== 'process-core')
      .flatMap(section => extractIssueAnchors(`${section.title}\n${section.body}`)),
  );

  return {
    sourceFamily: 'mixed-document-with-process-core',
    isStructuredWorkflow: false,
    isMixedDocument: true,
    explicitStepCount: explicitSteps.length,
    explicitStepLabels: explicitSteps.map(step => step.label),
    explicitSteps,
    aggregateExplicitRoles: [],
    aggregateExplicitSystems: [],
    hasMultivalueRoles: false,
    hasMultivalueSystems: false,
    hasDomainConflict: false,
    dominantDomains: [],
    stepTableDetected: false,
    roleTableDetected: false,
    segmentCounts: counts,
    nonCoreTypes: uniqueStrings(sections.filter(section => section.kind !== 'process-core').map(section => section.kind)),
    issueAnchorCount: issueAnchors.length,
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
    isMixedDocument: false,
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
    segmentCounts: emptyMixedSegmentCounts(),
    nonCoreTypes: [],
    issueAnchorCount: 0,
  };
}

export function deriveSourceModel(text) {
  return deriveMixedSourceModel(text) ?? deriveStructuredSourceModel(text);
}
