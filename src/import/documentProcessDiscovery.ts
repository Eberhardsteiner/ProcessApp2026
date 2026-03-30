export interface DocumentProcessCandidate {
  id: string;
  refId: string;
  heading?: string;
  snippet: string;
  text: string;
  score: number;
  reasons: string[];
  start: number;
  end: number;
}

type Passage = {
  refId: string;
  heading?: string;
  text: string;
  start: number;
  end: number;
};

const HEADING_RE = /^(#{1,6}\s+.+|[A-ZÄÖÜ][^.!?\n]{2,80}(?:\n|$)(?=[\s\S]))/m;
const NUMBERED_HEADING_RE = /^(\d+(\.\d+)*\.?\s+[A-ZÄÖÜ\w][^\n]{2,80})/m;

const MAX_PASSAGE_CHARS = 600;
const MIN_PASSAGE_CHARS = 40;
const MIN_SCORE = 1.5;

const STEP_CODE_RE = /^[A-Z]-?\d{1,3}\b/;
const PIPE_ROW_RE = /^\s*\|.+\|/;
const NUMBERED_ITEM_RE = /^\s*\d+[.)]\s+\S/;
const BULLET_ITEM_RE = /^\s*[-•*]\s+\S/;
const ALPHA_ITEM_RE = /^\s*[a-zA-Z][.)]\s+\S/;

function isStructuredLine(line: string): boolean {
  const t = line.trim();
  return (
    PIPE_ROW_RE.test(t) ||
    STEP_CODE_RE.test(t) ||
    NUMBERED_ITEM_RE.test(t) ||
    BULLET_ITEM_RE.test(t) ||
    ALPHA_ITEM_RE.test(t)
  );
}

function isPipeSeparatorLine(line: string): boolean {
  return /^\s*\|[-:| ]+\|\s*$/.test(line);
}

function groupStructuredLines(
  lines: string[],
  runSize: number
): string[][] {
  const groups: string[][] = [];
  let i = 0;
  while (i < lines.length) {
    const group: string[] = [];
    while (i < lines.length && group.length < runSize) {
      group.push(lines[i]);
      i++;
    }
    if (group.length > 0) groups.push(group);
  }
  return groups;
}

function splitBlockIntoPassages(
  refId: string,
  block: string,
  blockStart: number,
  heading: string | undefined,
  normalised: string
): Passage[] {
  const lines = block.split('\n');

  const structuredLines = lines.filter(l => isStructuredLine(l) && !isPipeSeparatorLine(l));
  const totalLines = lines.filter(l => l.trim().length > 0).length;
  const structuredRatio = totalLines > 0 ? structuredLines.length / totalLines : 0;

  if (structuredRatio >= 0.4 && structuredLines.length >= 2) {
    const isPipeTable = structuredLines.some(l => PIPE_ROW_RE.test(l.trim()));
    const runSize = isPipeTable ? 5 : 4;

    const contentLines = lines.filter(l => !isPipeSeparatorLine(l));
    const groups = groupStructuredLines(contentLines, runSize);

    const passages: Passage[] = [];
    for (const group of groups) {
      const groupText = group.join('\n').trim();
      if (groupText.length < MIN_PASSAGE_CHARS) continue;
      const gStart = normalised.indexOf(groupText, blockStart);
      if (gStart === -1) continue;
      passages.push({
        refId,
        heading,
        text: groupText,
        start: gStart,
        end: gStart + groupText.length,
      });
    }
    if (passages.length > 0) return passages;
  }

  if (block.length <= MAX_PASSAGE_CHARS) {
    return [{
      refId,
      heading,
      text: block,
      start: blockStart,
      end: blockStart + block.length,
    }];
  }

  const windows = splitIntoWindows(block, MAX_PASSAGE_CHARS, 80);
  const passages: Passage[] = [];
  for (const w of windows) {
    const wStart = normalised.indexOf(w, blockStart);
    if (wStart === -1) continue;
    passages.push({
      refId,
      heading,
      text: w,
      start: wStart,
      end: wStart + w.length,
    });
  }
  return passages;
}

export function splitEvidenceTextIntoPassages(
  refId: string,
  text: string
): Passage[] {
  const passages: Passage[] = [];
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const rawBlocks = normalised.split(/\n{2,}/);

  let cursor = 0;
  for (const block of rawBlocks) {
    const trimmed = block.trim();
    const blockStart = normalised.indexOf(trimmed, cursor);
    const blockEnd = blockStart + trimmed.length;
    cursor = blockEnd;

    if (trimmed.length < MIN_PASSAGE_CHARS) continue;

    const headingMatch =
      NUMBERED_HEADING_RE.exec(trimmed) ?? HEADING_RE.exec(trimmed);
    const heading =
      headingMatch && headingMatch.index === 0
        ? headingMatch[0].replace(/^#+\s*/, '').trim()
        : undefined;

    const contentStart = heading
      ? trimmed.indexOf('\n', headingMatch!.index) + 1
      : 0;
    const content = heading ? trimmed.slice(contentStart).trim() : trimmed;
    const contentOffset = blockStart + (heading ? trimmed.indexOf(content) : 0);

    const subPassages = splitBlockIntoPassages(
      refId,
      content,
      contentOffset,
      heading,
      normalised
    );
    passages.push(...subPassages);
  }

  return passages;
}

function splitIntoWindows(text: string, size: number, overlap: number): string[] {
  const result: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = pos + size;
    if (end < text.length) {
      const newline = text.lastIndexOf('\n', end);
      if (newline > pos + overlap) end = newline;
    }
    const chunk = text.slice(pos, end);
    if (chunk.trim().length >= MIN_PASSAGE_CHARS) result.push(chunk.trim());
    pos += size - overlap;
    if (pos + MIN_PASSAGE_CHARS >= text.length) break;
  }
  if (result.length === 0 && text.trim().length >= MIN_PASSAGE_CHARS) {
    result.push(text.trim());
  }
  return result;
}

const STEP_CODE_SIGNAL_RE = /\b[A-Z]-?\d{1,3}\b/g;
const TABLE_HEADER_RE = /\b(verantwortlich|zuständig|termin|ergebnis|status|freigabe|bearbeiter|input|output|system|tool|beschreibung|aktivität|tätigkeit)\b/i;

const PROCESS_TERMS: [RegExp, string, number][] = [
  [/\b(prozess|geschäftsprozess|workflow)\b/i, 'Prozessbegriff', 1.0],
  [/\b(ablauf|prozeßablauf|arbeitsablauf)\b/i, 'Ablaufbegriff', 0.8],
  [/\b(schritt|teilschritt|verfahrensschritt)\b/i, 'Schrittbegriff', 0.7],
  [/\b(vorgang|vorgangsnummer|vorgangsart)\b/i, 'Vorgangsbegriff', 0.7],
  [/\b(bearbeitung|bearbeitungsschritt|bearbeitungsprozess)\b/i, 'Bearbeitungsbegriff', 0.7],
  [/\b(freigabe|genehmigung|autorisierung)\b/i, 'Freigabebegriff', 0.8],
  [/\b(prüfung|überprüfung|kontrolle|review)\b/i, 'Prüfbegriff', 0.7],
  [/\b(antrag|antragsstellung|antragsprozess)\b/i, 'Antragsbegriff', 0.8],
  [/\b(ticket|ticketnummer|incident|anfrage)\b/i, 'Ticket-/Anfragebegriff', 0.7],
  [/\b(auftrag|bestellung|auftragserteilung)\b/i, 'Auftragsbegriff', 0.7],
  [/\b(eingang|eingangskanal|eingehend)\b/i, 'Eingangsbegriff', 0.5],
  [/\b(ausgang|ausgehend|versand)\b/i, 'Ausgangsbegriff', 0.5],
];

const SEQUENCE_MARKERS: [RegExp, string, number][] = [
  [/\b(zuerst|zunächst|als erstes)\b/i, 'Sequenzmarker (Beginn)', 0.6],
  [/\b(dann|danach|anschließend|im anschluss)\b/i, 'Sequenzmarker (Folge)', 0.6],
  [/\b(im nächsten schritt|nachfolgend|daraufhin)\b/i, 'Sequenzmarker (Schritt)', 0.7],
  [/\b(abschließend|zum schluss|zuletzt|am ende)\b/i, 'Sequenzmarker (Abschluss)', 0.6],
  [/\b(parallel|gleichzeitig|zeitgleich)\b/i, 'Parallelausführungshinweis', 0.4],
  [/\b(falls|wenn|sofern|im fall[e]?\s*(dass|von))\b/i, 'Bedingungsmarker', 0.4],
];

const ROLE_SYSTEM_TERMS: [RegExp, string, number][] = [
  [/\b(sachbearbeiter[in]?|bearbeiter[in]?)\b/i, 'Rollenhinweis (Sachbearbeiter)', 0.7],
  [/\b(teamleitung|abteilungsleiter|vorgesetzter|führungskraft)\b/i, 'Rollenhinweis (Führung)', 0.6],
  [/\b(fachabteilung|fachbereich|zuständige abteilung)\b/i, 'Rollenhinweis (Abteilung)', 0.5],
  [/\b(system|softwaresystem|anwendung|applikation)\b/i, 'Systemhinweis', 0.4],
  [/\b(sap|crm|erp|jira|servicenow|sharepoint|portal)\b/i, 'Konkretes System', 0.8],
  [/\b(e-?mail|benachrichtigung|nachricht)\b/i, 'Kommunikationskanal', 0.4],
  [/\b(datenbank|datenbanksystem|datensatz)\b/i, 'Datensystemhinweis', 0.5],
];

const ACTIVITY_VERBS: [RegExp, string, number][] = [
  [/\b(prüfen|überprüfen|kontrollieren|verifizieren)\b/i, 'Tätigkeitsverb (Prüfen)', 0.7],
  [/\b(genehmigen|freigeben|bestätigen|autorisieren)\b/i, 'Tätigkeitsverb (Genehmigen)', 0.8],
  [/\b(erfassen|eingeben|eintragen|dokumentieren)\b/i, 'Tätigkeitsverb (Erfassen)', 0.7],
  [/\b(anlegen|erstellen|erzeugen|generieren)\b/i, 'Tätigkeitsverb (Anlegen)', 0.7],
  [/\b(weiterleiten|eskalieren|übergeben|übertragen)\b/i, 'Tätigkeitsverb (Weiterleiten)', 0.8],
  [/\b(versenden|übermitteln|senden|schicken)\b/i, 'Tätigkeitsverb (Versenden)', 0.7],
  [/\b(abschließen|beenden|abschluss|fertigstellen)\b/i, 'Tätigkeitsverb (Abschließen)', 0.8],
  [/\b(starten|beginnen|einleiten|initiieren|anstoßen)\b/i, 'Tätigkeitsverb (Starten)', 0.7],
  [/\b(zuweisen|zuordnen|beauftragen|delegieren)\b/i, 'Tätigkeitsverb (Zuweisen)', 0.7],
  [/\b(berechnen|ermitteln|kalkulieren|auswerten)\b/i, 'Tätigkeitsverb (Berechnen)', 0.5],
  [/\b(speichern|archivieren|ablegen|hinterlegen)\b/i, 'Tätigkeitsverb (Speichern)', 0.5],
  [/\b(informieren|benachrichtigen|melden|mitteilen)\b/i, 'Tätigkeitsverb (Informieren)', 0.5],
];

const LIST_PATTERNS: [RegExp, string, number][] = [
  [/^\s*\d+\.\s+\S/m, 'Nummerierte Liste', 0.6],
  [/^\s*[-•*]\s+\S/m, 'Aufzählungsliste', 0.4],
  [/^\s*[a-z]\)\s+\S/im, 'Buchstabenliste', 0.4],
  [/\b(schritt\s+\d+|phase\s+\d+|stufe\s+\d+)\b/i, 'Explizite Schrittnummerierung', 0.8],
];

function scorePassage(text: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const lower = text.toLowerCase();

  const applyRules = (rules: [RegExp, string, number][]) => {
    for (const [re, label, weight] of rules) {
      if (re.test(lower)) {
        score += weight;
        reasons.push(label);
      }
    }
  };

  applyRules(PROCESS_TERMS);
  applyRules(SEQUENCE_MARKERS);
  applyRules(ROLE_SYSTEM_TERMS);
  applyRules(ACTIVITY_VERBS);
  applyRules(LIST_PATTERNS);

  const sequenceHits = SEQUENCE_MARKERS.filter(([re]) => re.test(lower)).length;
  if (sequenceHits >= 3) {
    score += 0.5;
    reasons.push('Mehrere Sequenzmarker gleichzeitig');
  }

  const verbHits = ACTIVITY_VERBS.filter(([re]) => re.test(lower)).length;
  if (verbHits >= 3) {
    score += 0.6;
    reasons.push('Mehrere Tätigkeitsverben gleichzeitig');
  }

  const stepCodes = text.match(STEP_CODE_SIGNAL_RE) ?? [];
  if (stepCodes.length >= 2) {
    score += 0.8 + Math.min(stepCodes.length - 2, 4) * 0.2;
    reasons.push(`Schrittcodes (${stepCodes.slice(0, 4).join(', ')}${stepCodes.length > 4 ? ', …' : ''})`);
  } else if (stepCodes.length === 1) {
    score += 0.4;
    reasons.push(`Schrittcode (${stepCodes[0]})`);
  }

  if (PIPE_ROW_RE.test(text)) {
    score += 0.6;
    reasons.push('Tabellenzeile');
    if (TABLE_HEADER_RE.test(lower)) {
      score += 0.8;
      reasons.push('Prozessrelevante Tabellenspalten');
    }
  }

  const pipeLines = text.split('\n').filter(l => PIPE_ROW_RE.test(l.trim()) && !isPipeSeparatorLine(l));
  if (pipeLines.length >= 3) {
    score += 0.5;
    reasons.push('Zusammenhängende Tabellenzeilen');
  }

  const numberedLines = text.split('\n').filter(l => NUMBERED_ITEM_RE.test(l) || STEP_CODE_RE.test(l.trim()));
  if (numberedLines.length >= 3) {
    score += 0.6;
    reasons.push('Zusammenhängende nummerierte Schritte');
  }

  return { score, reasons };
}

function makeSnippet(text: string, maxLen = 160): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';

  if (lines.some(l => PIPE_ROW_RE.test(l) || STEP_CODE_RE.test(l))) {
    const meaningful = lines.filter(l => !isPipeSeparatorLine(l)).slice(0, 4);
    const joined = meaningful.join(' | ');
    if (joined.length <= maxLen) return joined;
    return joined.slice(0, maxLen - 1).trimEnd() + '…';
  }

  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.7 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

let candidateSeq = 0;

export function findDocumentProcessCandidates(
  docs: Array<{ refId: string; text: string }>,
  options?: { maxCandidates?: number }
): DocumentProcessCandidate[] {
  const maxCandidates = options?.maxCandidates ?? 50;
  const results: DocumentProcessCandidate[] = [];

  for (const doc of docs) {
    if (!doc.text || !doc.text.trim()) continue;

    const passages = splitEvidenceTextIntoPassages(doc.refId, doc.text);

    for (const passage of passages) {
      const { score, reasons } = scorePassage(passage.text);
      if (score < MIN_SCORE) continue;

      candidateSeq += 1;
      results.push({
        id: `dpc-${doc.refId}-${candidateSeq}`,
        refId: doc.refId,
        heading: passage.heading,
        snippet: makeSnippet(passage.text),
        text: passage.text,
        score,
        reasons,
        start: passage.start,
        end: passage.end,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxCandidates);
}
