import type { AiCaptureResultV1 } from '../ai/aiTypes';

export interface SemiStructuredProcedureStep {
  label: string;
  responsible?: string;
  description?: string;
  due?: string;
  evidenceSnippet: string;
  sourceHeading?: string;
}

export interface SemiStructuredProcedureExtraction {
  title?: string;
  steps: SemiStructuredProcedureStep[];
  roles: string[];
  warnings: string[];
  confidence: 'high' | 'medium' | 'low';
}

const NUMBERED_ITEM_RE = /^(\d{1,2}\.(?:\d{1,2}\.)*)\s+(.+)/;
const BULLET_ITEM_RE = /^[-–•*]\s+(.+)/;
const HEADING_RE = /^(#{1,4}\s+.+|[A-ZÄÖÜ][A-ZÄÖÜa-zäöüß\s\-/]{3,60}:?\s*)$/;
const HEADING_NUMBERED_RE = /^(\d{1,2})\.\s+([A-ZÄÖÜ].{3,80})$/;
const DUE_RE = /\b(T[+-]\s*\d+|bis\s+\d{1,2}\.\d{1,2}\.(\d{2,4})?|innerhalb\s+von\s+\d+\s*(Tag(e)?|Woche[n]?|Monat(e)?)|spätestens\s+\w+|\d+\s*Werktage?)\b/i;
const ROLE_INLINE_RE = /\(([^)]{2,50})\)|(?:verantwortlich|zuständig|durchgeführt von|durch|von):\s*([^\n,;.]{2,50})|(?:^|\s)(Abteilung\s+\w+|Gruppe\s+\w+|Team\s+\w+|Leiter[in]?\s+\w+|Sachbearbeiter[in]?|Fachbereich\s+\w+|Projektleiter[in]?|Controller[in]?|Manager[in]?|Koordinator[in]?|Referent[in]?|Prüfer[in]?|Ersteller[in]?|Freigeber[in]?)\b/i;
const ROLE_STANDALONE_RE = /^([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*)\s*[:–-]\s*(.+)/;

const ACTION_VERBS_RE = /\b(prüf|erfass|erstell|bearbeit|übermittel|leite[nt]|genehmig|freigeb|dokumentier|archivie|meld[et]|benachrichtig|informier|koordinier|stell[et]\s+sicher|überwach|kontrollier|bestätig|versend|empfang|erfass|beantrag|entscheid|absend|durchführ|abschlies|fertigstell|einreich|abklär|kommunizier|plant?|terminier|bewert|analysier|überprüf|korrigier|anpass|verteil|zuweis|eröffn|schließ|bear|auslös|startet?|beend|abbrech|verschi|eskalier|lösch|erstell|änder|ergänz)\w*/i;

const FILLER_RE = /^(dies|das|ein|eine|der|die|das|gem\.|gemäß|vgl\.|hinweis|anmerkung|note|beispiel|bsp\.|z\.b\.|etc\.|usw\.|ggf\.|bei bedarf|falls|wenn nötig|s\.\s*auch|siehe auch)\b/i;
const MIN_LABEL_LEN = 8;
const MAX_LABEL_LEN = 200;

function cleanLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function extractTitle(lines: string[]): string | undefined {
  for (const line of lines.slice(0, 20)) {
    const trimmed = cleanLine(line.replace(/^#+\s*/, ''));
    if (trimmed.length >= 8 && trimmed.length <= 150 && !/^\d+\./.test(trimmed)) {
      return trimmed;
    }
  }
  return undefined;
}

function isHeading(line: string): boolean {
  const trimmed = cleanLine(line);
  if (!trimmed) return false;
  if (HEADING_RE.test(trimmed)) return true;
  if (HEADING_NUMBERED_RE.test(trimmed)) return true;
  if (/^#{1,4}\s/.test(trimmed)) return true;
  return false;
}

function extractHeadingText(line: string): string {
  return cleanLine(line.replace(/^#+\s*/, '').replace(/:\s*$/, ''));
}

function extractDue(text: string): string | undefined {
  const m = text.match(DUE_RE);
  return m ? m[0].trim() : undefined;
}

function extractResponsible(text: string): string | undefined {
  const m = text.match(ROLE_INLINE_RE);
  if (!m) return undefined;
  for (let i = 1; i < m.length; i++) {
    if (m[i] && m[i].trim().length > 1) return m[i].trim();
  }
  return undefined;
}

function isActionLine(text: string): boolean {
  return ACTION_VERBS_RE.test(text);
}

function isFiller(text: string): boolean {
  return FILLER_RE.test(text.trim());
}

function isUsefulLabel(text: string): boolean {
  const t = cleanLine(text);
  if (t.length < MIN_LABEL_LEN || t.length > MAX_LABEL_LEN) return false;
  if (isFiller(t)) return false;
  if (/^[\d.]+$/.test(t)) return false;
  return true;
}

interface RawItem {
  kind: 'numbered' | 'bullet' | 'action';
  text: string;
  heading?: string;
  prefix?: string;
}

function collectItems(text: string): RawItem[] {
  const lines = text.split('\n');
  const items: RawItem[] = [];
  let currentHeading: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = cleanLine(raw);
    if (!trimmed) continue;

    if (isHeading(raw)) {
      currentHeading = extractHeadingText(raw);
      continue;
    }

    const numMatch = trimmed.match(NUMBERED_ITEM_RE);
    if (numMatch) {
      items.push({ kind: 'numbered', text: numMatch[2].trim(), heading: currentHeading, prefix: numMatch[1] });
      continue;
    }

    const bulletMatch = trimmed.match(BULLET_ITEM_RE);
    if (bulletMatch) {
      const content = bulletMatch[1].trim();
      if (isUsefulLabel(content)) {
        items.push({ kind: 'bullet', text: content, heading: currentHeading });
      }
      continue;
    }

    if (isActionLine(trimmed) && isUsefulLabel(trimmed)) {
      const standalone = trimmed.match(ROLE_STANDALONE_RE);
      if (standalone && isActionLine(standalone[2])) {
        items.push({ kind: 'action', text: standalone[2].trim(), heading: currentHeading });
        continue;
      }
      items.push({ kind: 'action', text: trimmed, heading: currentHeading });
    }
  }

  return items;
}

function deduplicateSteps(steps: SemiStructuredProcedureStep[]): SemiStructuredProcedureStep[] {
  const seen = new Set<string>();
  return steps.filter(s => {
    const key = s.label.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSteps(items: RawItem[]): SemiStructuredProcedureStep[] {
  return items
    .filter(it => isUsefulLabel(it.text))
    .map(it => ({
      label: it.text.length > 120 ? it.text.slice(0, 120).trimEnd() + '…' : it.text,
      responsible: extractResponsible(it.text),
      due: extractDue(it.text),
      evidenceSnippet: it.text.slice(0, 300),
      sourceHeading: it.heading,
    }));
}

function computeConfidence(
  steps: SemiStructuredProcedureStep[],
  roles: string[],
  items: RawItem[],
): 'high' | 'medium' | 'low' {
  const numberedCount = items.filter(i => i.kind === 'numbered').length;
  const bulletCount = items.filter(i => i.kind === 'bullet').length;
  const actionCount = items.filter(i => i.kind === 'action').length;
  const structuredSignals = numberedCount + bulletCount;
  const hasRoles = roles.length > 0;
  const headings = new Set(items.map(i => i.heading).filter(Boolean)).size;

  let score = 0;
  if (steps.length >= 5) score += 2;
  else if (steps.length >= 3) score += 1;
  if (structuredSignals >= 4) score += 2;
  else if (structuredSignals >= 2) score += 1;
  if (hasRoles) score += 1;
  if (headings >= 2) score += 1;
  if (actionCount >= 3) score += 1;

  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

function extractRolesFromSteps(steps: SemiStructuredProcedureStep[], text: string): string[] {
  const roleSet = new Set<string>();

  for (const s of steps) {
    if (s.responsible) roleSet.add(s.responsible);
  }

  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = cleanLine(line);
    if (!trimmed || trimmed.length > 100) continue;
    const m = trimmed.match(/^([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){0,3})\s*[:–-]\s*\S/);
    if (m && !isActionLine(m[1]) && !isFiller(m[1])) {
      roleSet.add(m[1]);
    }
  }

  return Array.from(roleSet).slice(0, 12);
}

export function extractSemiStructuredProcedureFromText(
  _refId: string,
  text: string,
): SemiStructuredProcedureExtraction | null {
  if (!text || text.trim().length < 40) return null;

  const warnings: string[] = [];
  const lines = text.split('\n');
  const title = extractTitle(lines);
  const items = collectItems(text);

  if (!items.length) return null;

  const numberedItems = items.filter(i => i.kind === 'numbered');
  const bulletItems = items.filter(i => i.kind === 'bullet');
  const actionItems = items.filter(i => i.kind === 'action');

  let primaryItems: RawItem[];
  if (numberedItems.length >= 2) {
    primaryItems = numberedItems;
  } else if (bulletItems.length >= 2) {
    primaryItems = bulletItems;
  } else if (actionItems.length >= 2) {
    primaryItems = actionItems;
    warnings.push('Keine strukturierten Listen gefunden – Extraktion basiert nur auf Aktionszeilen.');
  } else {
    return null;
  }

  const rawSteps = buildSteps(primaryItems);
  const steps = deduplicateSteps(rawSteps);

  if (steps.length < 2) return null;

  const roles = extractRolesFromSteps(steps, text);
  const confidence = computeConfidence(steps, roles, items);

  if (confidence === 'low' && steps.length < 3) {
    warnings.push('Zu wenige strukturierte Signale für einen verlässlichen Prozessentwurf.');
  }

  return { title, steps, roles, warnings, confidence };
}

export function buildAiCaptureFromSemiStructuredProcedure(
  extraction: SemiStructuredProcedureExtraction,
): AiCaptureResultV1 {
  const happyPath = extraction.steps.map(s => s.label);

  const stepDetails: AiCaptureResultV1['stepDetails'] = extraction.steps.map((s, idx) => ({
    step: idx + 1,
    role: s.responsible,
    evidenceSnippet: s.evidenceSnippet,
  }));

  const trigger = extraction.steps[0]?.label ?? 'Prozessstart';
  const outcome = extraction.steps[extraction.steps.length - 1]?.label ?? 'Prozessende';
  const customer = extraction.roles[0] ?? 'intern';

  const notes: string[] = [];
  if (extraction.confidence !== 'high') {
    notes.push(`Extraktionskonfidenz: ${extraction.confidence} – manuelle Prüfung empfohlen.`);
  }

  return {
    schemaVersion: 'ai-capture-v1',
    language: 'de',
    endToEnd: {
      trigger,
      customer,
      outcome,
    },
    happyPath,
    roles: extraction.roles.length ? extraction.roles : undefined,
    stepDetails: stepDetails.length ? stepDetails : undefined,
    notes: notes.length ? notes : undefined,
    warnings: extraction.warnings.length ? extraction.warnings : undefined,
  };
}
