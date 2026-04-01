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
  | 'tableLike'
  | 'noise';

export interface ClassifiedParagraph {
  text: string;
  kind: SourceParagraphKind;
}

const HEADING_RE = /^\s*([1-9]\.|[A-ZÄÖÜ][^.!?]{0,70}:)\s*$/;
const TIME_HEADING_RE = /^\s*\d{1,2}:\d{2}\s*Uhr\s*\|/i;
const TABLE_RE = /\|/;
const BULLET_RE = /^\s*(?:[-•*]|\d+[.)])\s+/;
const AI_SECTION_RE = /(ki-unterst[üu]tzung|beispielfragen|kurzfazit|welche signale|nutzen f[üu]r den test)/i;

const TIMELINE_RE = /(\d{1,2}:\d{2}\s*uhr|danach|anschlie[ßs]end|zun[aä]chst|sp[äa]ter|am fr[üu]hen nachmittag|gegen ende des tages|als die freigabe|noch bevor|w[aä]hrend ich)/i;
const PROCEDURAL_RE = /(erfassen|anlegen|pr[üu]fen|bewerten|klassifizieren|weiterleiten|anfordern|dokumentieren|informieren|ausl[öo]sen|versenden|abschlie[ßs]en|bestellen|freigeben|bearbeiten|organisieren|abstimmen|recherchieren|suchen|diagnostizieren|beheben|aktualisieren|bestätigen)/i;
const COMMUNICATION_RE = /(kunde|kundenmail|zwischenmeldung|r[üu]ckfrage|telefon|anruf|e-mail|postfach|kommunikation|abstimmen|formul)/i;
const ISSUE_RE = /(fehlt|fehlende|risiko|problem|unsicherheit|stillstand|dringend|warten|wartezeit|aufwand|schwierig|belastung|engpass|mehrfachdokumentation|medienbruch|reibung|nicht eindeutig)/i;
const DECISION_RE = /(priorit[aä]t|eskalation|freigabe|kulanz|entscheidung|festlegen|genehmig|plausibel|strategisch wichtig|teamleitung|vertrieb)/i;
const KNOWLEDGE_RE = /(ähnlich|aehnlich|wissensspeicher|erinnerung|historie|erfahrungswissen|vergleichsfall|alte e-mail|recherch)/i;

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n{2,}/)
    .map(chunk => normalizeWhitespace(chunk))
    .filter(Boolean);
}

function classifyParagraph(text: string): SourceParagraphKind {
  if (!text) return 'noise';
  if (AI_SECTION_RE.test(text)) return 'noise';
  if (HEADING_RE.test(text)) return 'noise';
  if (TIME_HEADING_RE.test(text) || TIMELINE_RE.test(text)) return 'timeline';
  if (TABLE_RE.test(text) && text.split('|').filter(Boolean).length >= 3) return 'tableLike';
  if (BULLET_RE.test(text) && PROCEDURAL_RE.test(text)) return 'procedural';

  const score = {
    timeline: TIMELINE_RE.test(text) ? 1 : 0,
    procedural: PROCEDURAL_RE.test(text) ? 1 : 0,
    communication: COMMUNICATION_RE.test(text) ? 1 : 0,
    issue: ISSUE_RE.test(text) ? 1 : 0,
    decision: DECISION_RE.test(text) ? 1 : 0,
    knowledge: KNOWLEDGE_RE.test(text) ? 1 : 0,
  };

  const ranked = Object.entries(score)
    .sort((a, b) => b[1] - a[1])
    .filter(([, value]) => value > 0) as Array<[Exclude<SourceParagraphKind, 'tableLike' | 'noise'>, number]>;

  if (ranked.length === 0) {
    if (text.length < 40) return 'noise';
    return 'procedural';
  }

  return ranked[0][0];
}

export function classifySourceParagraphs(text: string): ClassifiedParagraph[] {
  return splitParagraphs(text).map(paragraph => ({ text: paragraph, kind: classifyParagraph(paragraph) }));
}

function countKinds(paragraphs: ClassifiedParagraph[]): DerivationSourceProfile['sectionCounts'] {
  const counts: DerivationSourceProfile['sectionCounts'] = {
    timeline: 0,
    procedural: 0,
    communication: 0,
    issue: 0,
    decision: 0,
    knowledge: 0,
    tableLike: 0,
    noise: 0,
  };

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
      return 'Die lokale Engine liest vor allem formale Verfahrensschritte und blendet ergänzende Signaltexte aus.';
    case 'narrative-timeline':
      return 'Die lokale Engine verdichtet vor allem den Zeitverlauf und die geschilderten Episoden zu einer klaren Hauptlinie.';
    case 'mixed-process-document':
      return 'Die lokale Engine trennt die eigentliche Fallgeschichte von Signal-, Tabellen- und Hilfstexten und nutzt den Prozesskern als Hauptquelle.';
    case 'signal-heavy-document':
      return 'Die lokale Engine nutzt nur die wenigen ablaufnahen Passagen als Schritte und führt den Rest eher als Reibungssignal.';
    case 'table-like-material':
      return 'Die lokale Engine behandelt das Material vorsichtig und nutzt primär Zeilen mit erkennbarem Ablaufbezug.';
    default:
      return 'Die lokale Engine erkennt noch kein klares Materialmuster und arbeitet daher mit vorsichtiger Standardlogik.';
  }
}

function buildStability(counts: DerivationSourceProfile['sectionCounts']): DerivationSourceProfile['stability'] {
  const processBearing = counts.timeline + counts.procedural + counts.decision + counts.communication;
  const ambiguous = counts.issue + counts.tableLike + counts.noise;
  if (processBearing >= 4 && ambiguous <= Math.max(1, Math.floor(processBearing / 2))) return 'high';
  if (processBearing >= 2) return 'medium';
  return 'low';
}

export function buildSourceProfile(text: string): DerivationSourceProfile {
  const paragraphs = classifySourceParagraphs(text);
  const counts = countKinds(paragraphs);
  const processBearing = counts.timeline + counts.procedural + counts.decision + counts.communication;

  let inputProfile: DerivationSourceProfile['inputProfile'] = 'unclear';
  if (counts.tableLike >= 2 && processBearing <= 2) {
    inputProfile = 'table-like-material';
  } else if (counts.timeline >= 2 && (counts.communication + counts.issue + counts.knowledge) >= 2) {
    inputProfile = 'mixed-process-document';
  } else if (counts.timeline >= 2) {
    inputProfile = 'narrative-timeline';
  } else if (counts.procedural >= 3 || (counts.procedural >= 2 && counts.decision >= 1)) {
    inputProfile = 'procedure-document';
  } else if (counts.issue + counts.tableLike > processBearing && (counts.issue + counts.tableLike) >= 2) {
    inputProfile = 'signal-heavy-document';
  }

  return {
    inputProfile,
    inputProfileLabel: buildProfileLabel(inputProfile),
    extractionFocus: buildProfileFocus(inputProfile),
    sectionCounts: counts,
    stability: buildStability(counts),
  };
}

function rankParagraph(kind: SourceParagraphKind): number {
  switch (kind) {
    case 'timeline':
      return 6;
    case 'procedural':
      return 5;
    case 'decision':
      return 4;
    case 'communication':
      return 3;
    case 'knowledge':
      return 2;
    case 'issue':
      return 1;
    default:
      return 0;
  }
}

export function selectProcessParagraphs(text: string, profile?: DerivationSourceProfile): string[] {
  const paragraphs = classifySourceParagraphs(text);
  const activeProfile = profile ?? buildSourceProfile(text);
  const keepIssueParagraphs = activeProfile.inputProfile === 'signal-heavy-document';

  return paragraphs
    .filter(paragraph => rankParagraph(paragraph.kind) >= 2 || (keepIssueParagraphs && paragraph.kind === 'issue'))
    .filter(paragraph => paragraph.text.length >= 30)
    .map(paragraph => paragraph.text);
}

export function buildSourceProfileNote(profile: DerivationSourceProfile): string {
  const strongKinds = Object.entries(profile.sectionCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([kind, count]) => {
      const labelMap: Record<string, string> = {
        timeline: 'Zeitverlauf',
        procedural: 'Verfahrensschritte',
        communication: 'Kommunikation',
        issue: 'Reibungssignale',
        decision: 'Entscheidungen',
        knowledge: 'Erfahrungswissen',
        tableLike: 'Tabellenanteile',
        noise: 'Zusatzmaterial',
      };
      return `${labelMap[kind] ?? kind}: ${count}`;
    });

  return `${profile.inputProfileLabel} erkannt. ${profile.extractionFocus}${strongKinds.length > 0 ? ` Schwerpunkte im Material: ${strongKinds.join(', ')}.` : ''}`;
}

export function buildMultiCaseSummary(observations: ProcessMiningObservation[]): DerivationMultiCaseSummary | undefined {
  const stepObservations = observations.filter(observation => observation.kind === 'step');
  const caseIds = uniqueStrings(stepObservations.map(observation => observation.sourceCaseId));
  if (caseIds.length < 2) return undefined;

  const familyToCases = new Map<string, Set<string>>();
  const familyLabels = new Map<string, string>();

  stepObservations.forEach(observation => {
    const family = inferStepFamily(`${observation.label} ${observation.evidenceSnippet ?? ''}`);
    const canonical = family?.label ?? canonicalizeProcessStepLabel({
      title: observation.label,
      body: observation.evidenceSnippet,
      fallback: observation.label,
      index: observation.sequenceIndex,
    });
    const key = family?.id ? `family:${family.id}` : stepSemanticKey(canonical);
    const caseId = observation.sourceCaseId ?? '__global__';
    if (!familyToCases.has(key)) familyToCases.set(key, new Set());
    familyToCases.get(key)!.add(caseId);
    familyLabels.set(key, canonical);
  });

  const stableThreshold = Math.max(2, Math.ceil(caseIds.length * 0.6));
  const variableThreshold = Math.max(2, Math.ceil(caseIds.length * 0.3));

  const stableSteps = Array.from(familyToCases.entries())
    .filter(([, caseSet]) => caseSet.size >= stableThreshold)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([key]) => familyLabels.get(key) ?? key)
    .slice(0, 8);

  const variableSteps = Array.from(familyToCases.entries())
    .filter(([, caseSet]) => caseSet.size >= variableThreshold && caseSet.size < stableThreshold)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([key]) => familyLabels.get(key) ?? key)
    .slice(0, 8);

  let patternNote = `Aus ${caseIds.length} Quellen wurden wiederkehrende Schrittmuster lokal verdichtet.`;
  if (stableSteps.length > 0) {
    patternNote += ` Stabil sind vor allem: ${stableSteps.slice(0, 3).join(', ')}.`;
  }
  if (variableSteps.length > 0) {
    patternNote += ` Variabler zeigen sich: ${variableSteps.slice(0, 3).join(', ')}.`;
  }

  return {
    caseCount: caseIds.length,
    stableSteps,
    variableSteps,
    patternNote,
  };
}

export function aggregateSourceProfiles(profiles: Array<DerivationSourceProfile | undefined>): DerivationSourceProfile | undefined {
  const validProfiles = profiles.filter((profile): profile is DerivationSourceProfile => Boolean(profile));
  if (validProfiles.length === 0) return undefined;

  const counts: DerivationSourceProfile['sectionCounts'] = {
    timeline: 0,
    procedural: 0,
    communication: 0,
    issue: 0,
    decision: 0,
    knowledge: 0,
    tableLike: 0,
    noise: 0,
  };

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

  return {
    inputProfile: selectedProfile,
    inputProfileLabel: selectedProfile === 'unclear' ? 'Gemischtes Quellenpaket' : sentenceCase(buildProfileLabel(selectedProfile)),
    extractionFocus: `Mehrere Quellen wurden gemeinsam verdichtet. ${uniqueStrings(validProfiles.map(profile => profile.extractionFocus)).slice(0, 2).join(' ')}`.trim(),
    sectionCounts: counts,
    stability,
  };
}
