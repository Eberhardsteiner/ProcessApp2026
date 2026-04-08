import type {
  DerivationMultiCaseSummary,
  DerivationSourceProfile,
  ProcessMiningObservation,
} from '../../domain/process';
import { normalizeWhitespace, sentenceCase, uniqueStrings } from './pmShared';
import { canonicalizeProcessStepLabel, inferStepFamily, stepSemanticKey } from './semanticStepFamilies';

export type SourceParagraphKind =
  | 'timeline'
  | 'procedural'
  | 'communication'
  | 'issue'
  | 'decision'
  | 'knowledge'
  | 'measure'
  | 'governance'
  | 'commentary'
  | 'tableLike'
  | 'noise';

export interface ClassifiedParagraph {
  text: string;
  kind: SourceParagraphKind;
  score: number;
  reasons: string[];
}

export interface SourceExtractionPlan {
  profile: DerivationSourceProfile;
  primaryParagraphs: ClassifiedParagraph[];
  supportParagraphs: ClassifiedParagraph[];
  primaryText: string;
  supportText: string;
  selectedKinds: SourceParagraphKind[];
}

const TIME_HEADING_RE = /^\s*\d{1,2}:\d{2}\s*Uhr\s*\|/i;
const BULLET_RE = /^\s*(?:[-•*]|\d+[.)])\s+/;
const HEADING_RE = /^\s*([1-9]\.|[A-ZÄÖÜ][^.!?]{0,70}:)\s*$/;
const TABLE_RE = /\|/;

const TIMELINE_RE = /(\d{1,2}:\d{2}\s*uhr|danach|anschlie[ßs]end|zun[aä]chst|sp[äa]ter|am fr[üu]hen nachmittag|gegen ende des tages|als die freigabe|noch bevor|w[aä]hrend ich|im laufe des tages)/i;
const PROCEDURAL_RE = /(erfassen|anlegen|pr[üu]fen|bewerten|klassifizieren|weiterleiten|anfordern|dokumentieren|informieren|ausl[öo]sen|versenden|abschlie[ßs]en|bestellen|freigeben|bearbeiten|organisieren|abstimmen|recherchieren|suchen|diagnostizieren|beheben|aktualisieren|bestätigen|vorbereiten|einplanen|zuordnen|bereitstellen|anstoßen|koordinier(?:en|t)|validieren|verdichten|zusammenführen|prüfen lassen)/i;
const COMMUNICATION_RE = /(kunde|kundenmail|zwischenmeldung|r[üu]ckfrage|telefon|anruf|e-mail|postfach|kommunikation|abstimmen|formul|zwischenstand|mail|chat|erwartungsmanagement)/i;
const ISSUE_RE = /(fehlt|fehlende|risiko|problem|unsicherheit|stillstand|dringend|warten|wartezeit|aufwand|schwierig|belastung|engpass|mehrfachdokumentation|medienbruch|reibung|nicht eindeutig|unklar|verz[öo]ger|druck|fehlzuordnung)/i;
const DECISION_RE = /(priorit[aä]t|eskalation|freigabe|kulanz|entscheidung|festlegen|genehmig|plausibel|strategisch wichtig|teamleitung|vertrieb|budgetfreigabe|approval)/i;
const KNOWLEDGE_RE = /(ähnlich|aehnlich|wissensspeicher|erinnerung|historie|erfahrungswissen|vergleichsfall|alte e-mail|recherch|semantische suche|fallähnlichkeit)/i;
const MEASURE_RE = /(sinnvolle .* unterst[üu]tzung|automatische vollst[äa]ndigkeitspr[üu]fung|fallansicht|erwartete wirkung|entlastung|schnellerer zugriff|weniger r[üu]ckfragen|weniger fensterwechsel|konsistenter ton|rollenbezogene zusammenfassungen|to-do-steuerung|einmalige verdichtung|ki-hinweis|nutzen f[üu]r den test)/i;
const GOVERNANCE_RE = /(governance|review|owner|zieldatum|freigabestatus|audit|compliance|entscheidungsliste|management-freigabe|pilot-weitergabe|review-template)/i;
const COMMENTARY_RE = /(ki-unterst[üu]tzung|beispielfragen|kurzfazit|welche signale|rahmen der geschichte|die person im prozess|tagesverlauf|aus sicht der mitarbeiterin|fiktiv|test-app|signal\s*$|beobachtete reibung|erwartete wirkung|narrative perspektive)/i;
const SECTION_HEADING_RE = /^\s*\d{1,2}\.\s+[^.!?\n]{2,120}$/;
const STEP_SECTION_RE = /\b(standardablauf|prozessablauf|ablauf|vorgehen|prozessschritte?)\b/i;
const ROLE_SECTION_RE = /\b(rollen? und systeme|rollen?|verantwortlichkeiten?)\b/i;
const DECISION_SECTION_RE = /\b(entscheidungslogik|entscheidungsregeln|freigaberegeln|entscheidungen)\b/i;
const KPI_SECTION_RE = /\b(kpi|qualit[aä]tsanforderungen|qualit[aä]t|zielbild|governance)\b/i;
const TABLE_HEADER_STEP_RE = /^(nr\.?|schritt|verantwort(?:ung|lich)|ergebnis|rolle|aufgabe|systeme?|zielwert)$/i;
const DIGIT_ONLY_RE = /^\d{1,2}$/;

type StructuredDocumentClass = NonNullable<DerivationSourceProfile['documentClass']>;

interface StructuredDocumentSignals {
  sectionHeadingCount: number;
  numberedStepRows: number;
  tableHeaderCount: number;
  roleRowCount: number;
  hasStepSection: boolean;
  hasRoleSection: boolean;
  hasDecisionSection: boolean;
  hasKpiSection: boolean;
  hasStorySignals: boolean;
  shortLineRatio: number;
}

const PROCESS_PRIORITY: SourceParagraphKind[] = [
  'timeline',
  'procedural',
  'decision',
  'communication',
  'knowledge',
  'issue',
  'measure',
  'governance',
  'commentary',
  'tableLike',
  'noise',
];

const PRIMARY_KIND_ORDER: Record<DerivationSourceProfile['inputProfile'], SourceParagraphKind[]> = {
  'procedure-document': ['procedural', 'decision', 'communication', 'timeline'],
  'narrative-timeline': ['timeline', 'communication', 'decision', 'knowledge'],
  'mixed-process-document': ['timeline', 'procedural', 'decision', 'communication', 'knowledge'],
  'signal-heavy-document': ['decision', 'communication', 'issue', 'knowledge'],
  'table-like-material': ['procedural', 'decision', 'communication'],
  unclear: ['procedural', 'timeline', 'decision', 'communication'],
};

const SUPPORT_KIND_ORDER: Record<DerivationSourceProfile['inputProfile'], SourceParagraphKind[]> = {
  'procedure-document': ['knowledge', 'issue', 'measure', 'governance'],
  'narrative-timeline': ['issue', 'knowledge', 'measure'],
  'mixed-process-document': ['issue', 'knowledge', 'measure', 'governance'],
  'signal-heavy-document': ['issue', 'knowledge', 'measure', 'governance'],
  'table-like-material': ['issue', 'knowledge', 'measure'],
  unclear: ['issue', 'knowledge', 'measure', 'governance'],
};

function emptySectionCounts(): DerivationSourceProfile['sectionCounts'] {
  return {
    timeline: 0,
    procedural: 0,
    communication: 0,
    issue: 0,
    decision: 0,
    knowledge: 0,
    measure: 0,
    governance: 0,
    commentary: 0,
    tableLike: 0,
    noise: 0,
  };
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function nonEmptyLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => normalizeWhitespace(line))
    .filter(Boolean);
}

function analyzeStructuredDocumentSignals(text: string): StructuredDocumentSignals {
  const lines = nonEmptyLines(text);
  const shortLineCount = lines.filter(line => line.length <= 80).length;
  const signals: StructuredDocumentSignals = {
    sectionHeadingCount: lines.filter(line => SECTION_HEADING_RE.test(line)).length,
    numberedStepRows: 0,
    tableHeaderCount: 0,
    roleRowCount: 0,
    hasStepSection: lines.some(line => STEP_SECTION_RE.test(line)),
    hasRoleSection: lines.some(line => ROLE_SECTION_RE.test(line)),
    hasDecisionSection: lines.some(line => DECISION_SECTION_RE.test(line)),
    hasKpiSection: lines.some(line => KPI_SECTION_RE.test(line)),
    hasStorySignals: /\b(ich|wir|meine|mein|mich|uns)\b/i.test(text) || /\bdie geschichte\b/i.test(text),
    shortLineRatio: lines.length > 0 ? shortLineCount / lines.length : 0,
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (TABLE_HEADER_STEP_RE.test(line)) {
      signals.tableHeaderCount += 1;
    }
    if (DIGIT_ONLY_RE.test(line)) {
      const next = lines[index + 1] ?? '';
      if (next.length >= 8 && next.length <= 140) {
        signals.numberedStepRows += 1;
      }
    }
    if (
      index + 2 < lines.length
      && /^(rolle|funktion)$/i.test(line)
      && /^(aufgabe|verantwortung)$/i.test(lines[index + 1] ?? '')
      && /^systeme?$/i.test(lines[index + 2] ?? '')
    ) {
      signals.tableHeaderCount += 3;
    }
    if (
      index + 2 < lines.length
      && lines[index].length >= 4
      && lines[index].length <= 80
      && lines[index + 1].length >= 4
      && lines[index + 1].length <= 120
      && lines[index + 2].length >= 3
      && lines[index + 2].length <= 80
      && !SECTION_HEADING_RE.test(lines[index])
      && !DIGIT_ONLY_RE.test(lines[index])
      && !SECTION_HEADING_RE.test(lines[index + 1])
    ) {
      signals.roleRowCount += 1;
    }
  }

  return signals;
}

function classifyStructuredDocument(signals: StructuredDocumentSignals): StructuredDocumentClass {
  const structuredScore =
    (signals.hasStepSection ? 3 : 0)
    + (signals.hasRoleSection ? 2 : 0)
    + (signals.hasDecisionSection ? 1 : 0)
    + (signals.hasKpiSection ? 1 : 0)
    + Math.min(signals.sectionHeadingCount, 5)
    + Math.min(signals.numberedStepRows, 6)
    + Math.min(Math.floor(signals.tableHeaderCount / 2), 3);

  const semiStructuredScore =
    (signals.hasStepSection ? 2 : 0)
    + Math.min(signals.sectionHeadingCount, 4)
    + Math.min(signals.numberedStepRows, 4)
    + (signals.shortLineRatio >= 0.45 ? 1 : 0);

  if (!signals.hasStorySignals && structuredScore >= 10) return 'structured-target-procedure';
  if (!signals.hasStorySignals && semiStructuredScore >= 6) return 'semi-structured-procedure';
  if (signals.hasStorySignals && (signals.hasStepSection || signals.hasRoleSection || signals.hasDecisionSection)) return 'mixed-document';
  if (signals.hasStorySignals) return 'narrative-case';
  return 'weak-material';
}

function buildDocumentClassLabel(documentClass: StructuredDocumentClass): string {
  switch (documentClass) {
    case 'structured-target-procedure':
      return 'Strukturiertes Sollprozessdokument';
    case 'semi-structured-procedure':
      return 'Semistrukturiertes Verfahrensdokument';
    case 'narrative-case':
      return 'Narrative Fallbeschreibung';
    case 'mixed-document':
      return 'Mischdokument';
    default:
      return 'Rohmaterial / schwaches Material';
  }
}

function splitParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blockChunks = normalized
    .split(/\n{2,}/)
    .map(chunk => normalizeWhitespace(chunk))
    .filter(Boolean);

  const lines = nonEmptyLines(normalized);
  if (blockChunks.length <= 2 && lines.length >= 12) {
    return lines;
  }
  return blockChunks;
}

function isHeadingOnly(text: string): boolean {
  return HEADING_RE.test(text) || (/^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\s]{4,80}$/.test(text) && !/[.!?]/.test(text));
}

function scoreParagraphKind(text: string) {
  const trimmed = normalizeWhitespace(text);
  const scores: Record<SourceParagraphKind, number> = {
    timeline: 0,
    procedural: 0,
    communication: 0,
    issue: 0,
    decision: 0,
    knowledge: 0,
    measure: 0,
    governance: 0,
    commentary: 0,
    tableLike: 0,
    noise: 0,
  };
  const reasons: string[] = [];

  if (!trimmed) {
    scores.noise = 5;
    return { scores, reasons };
  }

  if (TABLE_RE.test(trimmed) && trimmed.split('|').filter(Boolean).length >= 3) {
    scores.tableLike += 4;
    reasons.push('tabellenartige Struktur');
  }
  if (SECTION_HEADING_RE.test(trimmed)) {
    scores.commentary += 2;
    reasons.push('strukturierte Abschnittsüberschrift');
  }
  if (TABLE_HEADER_STEP_RE.test(trimmed)) {
    scores.tableLike += 3;
    reasons.push('Tabellenkopf mit Prozessbezug');
  }
  if (DIGIT_ONLY_RE.test(trimmed)) {
    scores.tableLike += 2;
    reasons.push('nummerierte Tabellenzeile');
  }
  if (TIME_HEADING_RE.test(trimmed)) {
    scores.timeline += 4;
    reasons.push('Zeitmarke');
  }
  if (TIMELINE_RE.test(trimmed)) {
    scores.timeline += 2;
    reasons.push('Zeitverlauf');
  }
  if (BULLET_RE.test(trimmed) && PROCEDURAL_RE.test(trimmed)) {
    scores.procedural += 3;
    reasons.push('Listen- oder Ablaufpunkt');
  }
  if (PROCEDURAL_RE.test(trimmed)) {
    scores.procedural += 2;
    reasons.push('klare Prozesshandlung');
  }
  if (DECISION_RE.test(trimmed)) {
    scores.decision += 2;
    reasons.push('Entscheidung oder Freigabe');
  }
  if (COMMUNICATION_RE.test(trimmed)) {
    scores.communication += 2;
    reasons.push('Kommunikationsanteil');
  }
  if (ISSUE_RE.test(trimmed)) {
    scores.issue += 2;
    reasons.push('Reibungs- oder Risikoanteil');
  }
  if (KNOWLEDGE_RE.test(trimmed)) {
    scores.knowledge += 2;
    reasons.push('Wissens- oder Historienbezug');
  }
  if (MEASURE_RE.test(trimmed)) {
    scores.measure += 3;
    reasons.push('Maßnahmen- oder Nutzenbeschreibung');
  }
  if (GOVERNANCE_RE.test(trimmed)) {
    scores.governance += 3;
    reasons.push('Governance- oder Reviewbezug');
  }
  if (COMMENTARY_RE.test(trimmed) || isHeadingOnly(trimmed)) {
    scores.commentary += 3;
    reasons.push('Kommentar- oder Rahmentext');
  }
  if (trimmed.length < 40 && !PROCEDURAL_RE.test(trimmed) && !TIMELINE_RE.test(trimmed)) {
    scores.noise += 2;
  }

  if (Object.values(scores).every(value => value === 0)) {
    scores.noise = trimmed.length >= 40 ? 1 : 3;
    reasons.push(trimmed.length >= 40 ? 'kein klares Muster, vorsichtige Standardlogik' : 'kurzer Zusatztext');
  }

  return { scores, reasons };
}

function classifyParagraph(text: string): ClassifiedParagraph {
  const trimmed = normalizeWhitespace(text);
  if (!trimmed) return { text: trimmed, kind: 'noise', score: 5, reasons: ['leer'] };

  const { scores, reasons } = scoreParagraphKind(trimmed);
  const ranked = PROCESS_PRIORITY
    .map(kind => ({ kind, score: scores[kind] }))
    .sort((a, b) => b.score - a.score || PROCESS_PRIORITY.indexOf(a.kind) - PROCESS_PRIORITY.indexOf(b.kind));
  const best = ranked[0];

  return {
    text: trimmed,
    kind: best.score > 0 ? best.kind : 'noise',
    score: best.score > 0 ? best.score : 1,
    reasons: uniqueStrings(reasons),
  };
}

export function classifySourceParagraphs(text: string): ClassifiedParagraph[] {
  return splitParagraphs(text).map(paragraph => classifyParagraph(paragraph));
}

function countKinds(paragraphs: ClassifiedParagraph[]): DerivationSourceProfile['sectionCounts'] {
  const counts = emptySectionCounts();
  paragraphs.forEach(paragraph => {
    counts[paragraph.kind] += 1;
  });
  return counts;
}

function buildProfileLabel(profile: DerivationSourceProfile['inputProfile']): string {
  switch (profile) {
    case 'procedure-document':
      return 'Verfahrensbeschreibung';
    case 'narrative-timeline':
      return 'Fallgeschichte mit Zeitverlauf';
    case 'mixed-process-document':
      return 'Mischdokument mit Prozesskern';
    case 'signal-heavy-document':
      return 'Signal- und Problemtext';
    case 'table-like-material':
      return 'Tabellenartiges Material';
    default:
      return 'Noch unklar';
  }
}

function buildProfileFocus(profile: DerivationSourceProfile['inputProfile']): string {
  switch (profile) {
    case 'procedure-document':
      return 'Die lokale Engine nutzt vor allem formale Verfahrensschritte und behandelt Hinweise zu Nutzen oder Zusatzmaterial nur unterstützend.';
    case 'narrative-timeline':
      return 'Die lokale Engine verdichtet vor allem Zeitverlauf, Entscheidungen und Kommunikationspunkte zu einer Hauptlinie.';
    case 'mixed-process-document':
      return 'Die lokale Engine trennt den Prozesskern von Reibungs-, Maßnahmen- und Kommentarabschnitten und stützt die Ableitung auf die ablaufnahen Passagen.';
    case 'signal-heavy-document':
      return 'Die lokale Engine liest nur ablaufnahe Fragmente als Schritte und führt den Großteil des Materials bewusst als Signal oder Kontext weiter.';
    case 'table-like-material':
      return 'Die lokale Engine priorisiert tabellarische Zeilen mit erkennbarem Ablaufbezug und ergänzt Rollen oder Systeme nur bei klarer Evidenz.';
    default:
      return 'Die lokale Engine erkennt noch kein klares Materialmuster und arbeitet daher mit vorsichtiger Standardlogik.';
  }
}

function buildStability(counts: DerivationSourceProfile['sectionCounts']): DerivationSourceProfile['stability'] {
  const processBearing = counts.timeline + counts.procedural + counts.communication + counts.decision + counts.knowledge;
  const supportBearing = counts.issue + counts.measure + counts.governance + counts.commentary + counts.tableLike + counts.noise;
  if (processBearing >= 4 && supportBearing <= Math.max(2, processBearing)) return 'high';
  if (processBearing >= 2) return 'medium';
  return 'low';
}

function sectionLabel(kind: string): string {
  const labels: Record<string, string> = {
    timeline: 'Zeitverlauf',
    procedural: 'Verfahrensschritte',
    communication: 'Kommunikation',
    issue: 'Reibungssignale',
    decision: 'Entscheidungen',
    knowledge: 'Erfahrungswissen',
    measure: 'Maßnahmen / Nutzen',
    governance: 'Governance / Review',
    commentary: 'Kommentar / Rahmen',
    tableLike: 'Tabellenanteile',
    noise: 'Zusatzmaterial',
  };
  return labels[kind] ?? kind;
}

function buildProfileReasons(params: {
  inputProfile: DerivationSourceProfile['inputProfile'];
  counts: DerivationSourceProfile['sectionCounts'];
  documentClass?: StructuredDocumentClass;
  signals?: StructuredDocumentSignals;
}): string[] {
  const { inputProfile, counts, documentClass, signals } = params;
  const reasons: string[] = [];

  if (documentClass === 'structured-target-procedure') reasons.push('Klare Sollprozess-Struktur mit Ablauf-, Rollen- und Regelblöcken erkannt');
  if (documentClass === 'semi-structured-procedure') reasons.push('Verfahrensdokument mit erkennbarer Ablaufstruktur erkannt');
  if (documentClass === 'narrative-case') reasons.push('Fallbeschreibung mit erzählender Struktur erkannt');
  if (documentClass === 'mixed-document') reasons.push('Mischdokument mit Prozesskern und Zusatzmaterial erkannt');
  if (documentClass === 'weak-material') reasons.push('Material liefert nur schwache oder uneinheitliche Struktursignale');

  if (inputProfile === 'mixed-process-document') reasons.push('Prozesskern wird aus ablaufnahen Abschnitten gefiltert');
  if (inputProfile === 'narrative-timeline') reasons.push('Zeitverlauf trägt die lokale Hauptlinie');
  if (inputProfile === 'procedure-document') reasons.push('Formale Schritte dominieren das Material');
  if (inputProfile === 'signal-heavy-document') reasons.push('Reibungssignale überwiegen gegenüber klaren Ablaufpassagen');
  if (counts.measure > 0) reasons.push('Nutzen- und Maßnahmenblöcke werden nicht als Prozessschritte gezählt');
  if (counts.commentary > 0) reasons.push('Kommentar- und Rahmentexte bleiben Kontext');
  if (counts.governance > 0) reasons.push('Governance-Hinweise werden getrennt von Prozessschritten geführt');
  if (counts.knowledge > 0) reasons.push('Erfahrungswissen stärkt die lokale Fall- und Signalverdichtung');
  if (counts.tableLike > 0) reasons.push('Tabellen werden nur bei erkennbarem Ablaufbezug übernommen');
  if (signals?.numberedStepRows && signals.numberedStepRows >= 3) reasons.push('Mehrere nummerierte Schrittzeilen stützen den Ablauf');
  if (signals?.hasRoleSection) reasons.push('Rollenblock wurde als strukturierter Zusatz erkannt');
  if (signals?.hasDecisionSection) reasons.push('Entscheidungs- oder Regelblock getrennt erkannt');

  return uniqueStrings(reasons).slice(0, 5);
}

function buildExtractionPlan(inputProfile: DerivationSourceProfile['inputProfile']): string[] {
  switch (inputProfile) {
    case 'procedure-document':
      return ['Formale Schritte zuerst lesen', 'Entscheidungen und Rollen ergänzen', 'Zusatzmaterial nur unterstützend nutzen'];
    case 'narrative-timeline':
      return ['Zeitverlauf in Episoden verdichten', 'Kommunikation und Entscheidungen als Schritthinweise lesen', 'Reibungen getrennt als Signale führen'];
    case 'mixed-process-document':
      return ['Prozesskern aus Story oder Schrittliste filtern', 'Maßnahmen- und Kommentarblöcke bewusst zurücknehmen', 'Reibungen und Erfahrungswissen getrennt mitführen'];
    case 'signal-heavy-document':
      return ['Nur ablaufnahe Passagen als Schritte verwenden', 'Signaltext nicht mit Prozessschritten vermischen', 'Ergebnis kurz in der Prüfwerkstatt kontrollieren'];
    case 'table-like-material':
      return ['Zeilen mit Ablaufbezug priorisieren', 'Kontext, Rollen und Systeme ergänzen', 'Struktur vorsichtig verdichten'];
    default:
      return ['Vorsichtige Standardlogik verwenden', 'Belegstellen kurz mitprüfen', 'Schrittnamen bei Bedarf nachschärfen'];
  }
}

export function buildSourceProfile(text: string): DerivationSourceProfile {
  const paragraphs = classifySourceParagraphs(text);
  const counts = countKinds(paragraphs);
  const processBearing = counts.timeline + counts.procedural + counts.communication + counts.decision + counts.knowledge;
  const supportBearing = counts.issue + counts.measure + counts.governance + counts.commentary + counts.tableLike + counts.noise;
  const totalParagraphs = Math.max(paragraphs.length, 1);
  const structuredSignals = analyzeStructuredDocumentSignals(text);
  const documentClass = classifyStructuredDocument(structuredSignals);

  let inputProfile: DerivationSourceProfile['inputProfile'] = 'unclear';
  if (documentClass === 'structured-target-procedure' || documentClass === 'semi-structured-procedure') {
    inputProfile = 'procedure-document';
  } else if (documentClass === 'mixed-document') {
    inputProfile = 'mixed-process-document';
  } else if (documentClass === 'narrative-case') {
    inputProfile = 'narrative-timeline';
  } else if (counts.tableLike >= 2 && processBearing <= 2) {
    inputProfile = 'table-like-material';
  } else if ((counts.timeline >= 2 || counts.procedural >= 2) && (counts.issue + counts.knowledge + counts.measure + counts.commentary) >= 2) {
    inputProfile = 'mixed-process-document';
  } else if (counts.timeline >= 2) {
    inputProfile = 'narrative-timeline';
  } else if (counts.procedural >= 3 || (counts.procedural >= 2 && counts.decision >= 1)) {
    inputProfile = 'procedure-document';
  } else if (supportBearing > processBearing && supportBearing >= 3) {
    inputProfile = 'signal-heavy-document';
  }

  const dominantKinds = (Object.entries(counts) as Array<[keyof DerivationSourceProfile['sectionCounts'], number]>)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([kind]) => sectionLabel(kind));

  return {
    inputProfile,
    inputProfileLabel: buildProfileLabel(inputProfile),
    documentClass,
    documentClassLabel: buildDocumentClassLabel(documentClass),
    extractionFocus: buildProfileFocus(inputProfile),
    sectionCounts: counts,
    stability: buildStability(counts),
    classificationReasons: buildProfileReasons({ inputProfile, counts, documentClass, signals: structuredSignals }),
    processBearingSharePct: pct(processBearing, totalParagraphs),
    evidenceParagraphCount: processBearing + supportBearing,
    dominantKinds,
    extractionPlan: buildExtractionPlan(inputProfile),
  };
}

function uniqueKinds(paragraphs: ClassifiedParagraph[]): SourceParagraphKind[] {
  return uniqueStrings(paragraphs.map(paragraph => paragraph.kind)) as SourceParagraphKind[];
}

export function buildSourceExtractionPlan(text: string, profile?: DerivationSourceProfile): SourceExtractionPlan {
  const baseProfile = profile ?? buildSourceProfile(text);
  const paragraphs = classifySourceParagraphs(text);
  const primaryKinds = PRIMARY_KIND_ORDER[baseProfile.inputProfile];
  const supportKinds = SUPPORT_KIND_ORDER[baseProfile.inputProfile];

  const primaryParagraphs = paragraphs.filter(paragraph => primaryKinds.includes(paragraph.kind) && paragraph.text.length >= 28);
  const supportParagraphs = paragraphs.filter(paragraph => !primaryParagraphs.includes(paragraph) && supportKinds.includes(paragraph.kind) && paragraph.text.length >= 24);

  const effectivePrimary = primaryParagraphs.length > 0
    ? primaryParagraphs
    : paragraphs.filter(paragraph => ['procedural', 'timeline', 'decision', 'communication', 'knowledge'].includes(paragraph.kind) && paragraph.text.length >= 24);
  const effectiveSupport = supportParagraphs.filter(paragraph => !effectivePrimary.includes(paragraph));

  const selectionReasons = [
    effectivePrimary.length > 0 ? `${effectivePrimary.length} ablaufnahe Abschnitte bilden den lokalen Prozesskern` : 'Kein klarer Prozesskern erkennbar, Standardlogik aktiv',
    effectiveSupport.length > 0 ? `${effectiveSupport.length} ergänzende Abschnitte liefern Reibungs- oder Wissenssignale` : undefined,
  ].filter((value): value is string => Boolean(value));

  const enrichedProfile: DerivationSourceProfile = {
    ...baseProfile,
    classificationReasons: uniqueStrings([...(baseProfile.classificationReasons ?? []), ...selectionReasons]),
    selectedParagraphCount: effectivePrimary.length,
    supportParagraphCount: effectiveSupport.length,
    evidenceParagraphCount: Math.max(baseProfile.evidenceParagraphCount ?? 0, effectivePrimary.length + effectiveSupport.length),
  };

  return {
    profile: enrichedProfile,
    primaryParagraphs: effectivePrimary,
    supportParagraphs: effectiveSupport,
    primaryText: effectivePrimary.map(paragraph => paragraph.text).join('\n\n'),
    supportText: effectiveSupport.map(paragraph => paragraph.text).join('\n\n'),
    selectedKinds: uniqueKinds(effectivePrimary),
  };
}

function rankParagraph(kind: SourceParagraphKind, profile: DerivationSourceProfile['inputProfile']): number {
  const order = PRIMARY_KIND_ORDER[profile];
  const index = order.indexOf(kind);
  return index >= 0 ? order.length - index : 0;
}

export function selectProcessParagraphs(text: string, profile?: DerivationSourceProfile): string[] {
  const plan = buildSourceExtractionPlan(text, profile);
  return [...plan.primaryParagraphs]
    .sort((a, b) => rankParagraph(b.kind, plan.profile.inputProfile) - rankParagraph(a.kind, plan.profile.inputProfile))
    .map(paragraph => paragraph.text);
}

export function buildSourceProfileNote(profile: DerivationSourceProfile): string {
  const strongKinds = Object.entries(profile.sectionCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([kind, count]) => `${sectionLabel(kind)}: ${count}`);

  const selectionNote = profile.selectedParagraphCount
    ? ` Für die lokale Ableitung wurden ${profile.selectedParagraphCount} Kernabschnitte und ${profile.supportParagraphCount ?? 0} ergänzende Abschnitte genutzt.`
    : '';
  const reasons = profile.classificationReasons && profile.classificationReasons.length > 0
    ? ` Gründe: ${profile.classificationReasons.slice(0, 3).join(', ')}.`
    : '';

  const classLabel = profile.documentClassLabel ? `${profile.documentClassLabel}. ` : '';
  return `${classLabel}${profile.inputProfileLabel} erkannt. ${profile.extractionFocus}${strongKinds.length > 0 ? ` Schwerpunkte im Material: ${strongKinds.join(', ')}.` : ''}${selectionNote}${reasons}`;
}

export function buildMultiCaseSummary(observations: ProcessMiningObservation[]): DerivationMultiCaseSummary | undefined {
  const stepObservations = observations.filter(observation => observation.kind === 'step');
  const caseIds = uniqueStrings(stepObservations.map(observation => observation.sourceCaseId));
  if (caseIds.length < 2) return undefined;

  const familyToCases = new Map<string, Set<string>>();
  const familyLabels = new Map<string, string>();
  const issueToCases = new Map<string, Set<string>>();

  stepObservations.forEach((observation, index) => {
    const family = inferStepFamily(`${observation.label} ${observation.evidenceSnippet ?? ''}`);
    const canonical = family?.label ?? canonicalizeProcessStepLabel({
      title: observation.label,
      body: observation.evidenceSnippet,
      fallback: observation.label,
      index,
    });
    const key = family?.id ? `family:${family.id}` : stepSemanticKey(canonical);
    const caseId = observation.sourceCaseId ?? '__global__';
    if (!familyToCases.has(key)) familyToCases.set(key, new Set());
    familyToCases.get(key)!.add(caseId);
    familyLabels.set(key, canonical);
  });

  observations
    .filter(observation => observation.kind === 'issue')
    .forEach(observation => {
      const label = normalizeWhitespace(observation.label).toLowerCase();
      const caseId = observation.sourceCaseId ?? '__global__';
      if (!issueToCases.has(label)) issueToCases.set(label, new Set());
      issueToCases.get(label)!.add(caseId);
    });

  const stableThreshold = Math.max(2, Math.ceil(caseIds.length * 0.6));
  const variableThreshold = Math.max(2, Math.ceil(caseIds.length * 0.3));

  const stableEntries = Array.from(familyToCases.entries())
    .filter(([, caseSet]) => caseSet.size >= stableThreshold)
    .sort((a, b) => b[1].size - a[1].size);
  const variableEntries = Array.from(familyToCases.entries())
    .filter(([, caseSet]) => caseSet.size >= variableThreshold && caseSet.size < stableThreshold)
    .sort((a, b) => b[1].size - a[1].size);

  const stableSteps = stableEntries.map(([key]) => familyLabels.get(key) ?? key).slice(0, 8);
  const variableSteps = variableEntries.map(([key]) => familyLabels.get(key) ?? key).slice(0, 8);
  const recurringSignals = Array.from(issueToCases.entries())
    .filter(([, caseSet]) => caseSet.size >= stableThreshold)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([label]) => sentenceCase(label))
    .slice(0, 6);

  let patternNote = `Aus ${caseIds.length} Quellen wurden wiederkehrende Schrittmuster lokal verdichtet.`;
  if (stableSteps.length > 0) {
    patternNote += ` Stabil sind vor allem: ${stableSteps.slice(0, 3).join(', ')}.`;
  }
  if (variableSteps.length > 0) {
    patternNote += ` Variabler zeigen sich: ${variableSteps.slice(0, 3).join(', ')}.`;
  }
  if (recurringSignals.length > 0) {
    patternNote += ` Wiederkehrende Reibungssignale: ${recurringSignals.slice(0, 3).join(', ')}.`;
  }

  const totalFamilies = familyToCases.size || 1;
  const stabilityScore = Math.round((stableEntries.length / totalFamilies) * 100);

  return {
    caseCount: caseIds.length,
    stableSteps,
    variableSteps,
    patternNote,
    stabilityScore,
    repeatableFamilyCount: stableEntries.length,
    branchingFamilyCount: variableEntries.length,
    dominantPattern: stableSteps[0],
    recurringSignals,
    stabilityNote: stabilityScore >= 60 ? 'Mehrere Quellen stützen bereits einen erkennbaren Kernablauf.' : 'Zwischen den Quellen bleibt noch sichtbare Varianz im Ablauf.',
  };
}

export function aggregateSourceProfiles(profiles: Array<DerivationSourceProfile | undefined>): DerivationSourceProfile | undefined {
  const validProfiles = profiles.filter((profile): profile is DerivationSourceProfile => Boolean(profile));
  if (validProfiles.length === 0) return undefined;

  const counts = emptySectionCounts();
  validProfiles.forEach(profile => {
    Object.entries(profile.sectionCounts).forEach(([key, value]) => {
      counts[key as keyof typeof counts] += value;
    });
  });

  const profileOrder: DerivationSourceProfile['inputProfile'][] = [
    'mixed-process-document',
    'narrative-timeline',
    'procedure-document',
    'signal-heavy-document',
    'table-like-material',
    'unclear',
  ];
  const selectedProfile = profileOrder.find(profileType => validProfiles.some(profile => profile.inputProfile === profileType)) ?? 'unclear';
  const stability = validProfiles.some(profile => profile.stability === 'low')
    ? 'low'
    : validProfiles.some(profile => profile.stability === 'medium')
    ? 'medium'
    : 'high';
  const documentClassOrder: StructuredDocumentClass[] = [
    'mixed-document',
    'structured-target-procedure',
    'semi-structured-procedure',
    'narrative-case',
    'weak-material',
  ];
  const selectedDocumentClass = documentClassOrder.find(documentClass => validProfiles.some(profile => profile.documentClass === documentClass)) ?? 'weak-material';

  return {
    inputProfile: selectedProfile,
    inputProfileLabel: selectedProfile === 'unclear' ? 'Gemischtes Quellenpaket' : sentenceCase(buildProfileLabel(selectedProfile)),
    documentClass: selectedDocumentClass,
    documentClassLabel: buildDocumentClassLabel(selectedDocumentClass),
    extractionFocus: `Mehrere Quellen wurden gemeinsam verdichtet. ${uniqueStrings(validProfiles.map(profile => profile.extractionFocus)).slice(0, 2).join(' ')}`.trim(),
    sectionCounts: counts,
    stability,
    classificationReasons: uniqueStrings(validProfiles.flatMap(profile => profile.classificationReasons ?? [])).slice(0, 6),
    selectedParagraphCount: validProfiles.reduce((sum, profile) => sum + (profile.selectedParagraphCount ?? 0), 0),
    supportParagraphCount: validProfiles.reduce((sum, profile) => sum + (profile.supportParagraphCount ?? 0), 0),
    evidenceParagraphCount: validProfiles.reduce((sum, profile) => sum + (profile.evidenceParagraphCount ?? 0), 0),
    processBearingSharePct: Math.round(validProfiles.reduce((sum, profile) => sum + (profile.processBearingSharePct ?? 0), 0) / validProfiles.length),
    dominantKinds: uniqueStrings(validProfiles.flatMap(profile => profile.dominantKinds ?? [])).slice(0, 5),
    extractionPlan: uniqueStrings(validProfiles.flatMap(profile => profile.extractionPlan ?? [])).slice(0, 5),
  };
}
