import type {
  ExtractionCandidate,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
  ObservationTimestampQuality,
  ProcessMiningQualitySummary,
} from '../../domain/process';
import {
  buildContextWindow,
  buildEvidenceSourceRef,
  createObservationFromStepCandidate,
  createStepCandidate,
  createSupportCandidate,
} from './evidenceModel';

const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?)\b/;
const DE_DATETIME_RE = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\b/;
const TIME_ONLY_RE = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(Uhr)?\b/;
const RELATIVE_TIME_RE = /\b(\d+)\s*(Minute[n]?|Stunde[n]?|Tag[e]?|Woche[n]?|Monat[e]?|Sekunde[n]?|min|h|d)\b/i;

export interface ParsedTimestamp {
  raw: string;
  iso: string;
  quality: ObservationTimestampQuality;
}

function tryParseTimestamp(sentence: string): ParsedTimestamp | null {
  const isoMatch = ISO_DATE_RE.exec(sentence);
  if (isoMatch) {
    const raw = isoMatch[1];
    const iso = raw.includes('T') ? raw : `${raw}T00:00:00Z`;
    return { raw, iso, quality: 'real' };
  }

  const deMatch = DE_DATETIME_RE.exec(sentence);
  if (deMatch) {
    const day = deMatch[1].padStart(2, '0');
    const month = deMatch[2].padStart(2, '0');
    const year = deMatch[3];
    const hour = deMatch[4] ? deMatch[4].padStart(2, '0') : '00';
    const minute = deMatch[5] ? deMatch[5].padStart(2, '0') : '00';
    const raw = deMatch[0].trim();
    const iso = `${year}-${month}-${day}T${hour}:${minute}:00Z`;
    return { raw, iso, quality: 'real' };
  }

  if (RELATIVE_TIME_RE.test(sentence)) {
    const match = RELATIVE_TIME_RE.exec(sentence)!;
    return { raw: match[0], iso: '', quality: 'synthetic' };
  }

  if (TIME_ONLY_RE.test(sentence)) {
    const match = TIME_ONLY_RE.exec(sentence)!;
    return { raw: match[0], iso: '', quality: 'synthetic' };
  }

  return null;
}

const TIMING_KEYWORDS = /wart|verzög|dauer|dauert|dauerte|stund|minut|stunde|stunden|minuten|tag|tage|woch|woche|wochen|monat|monate|sekund|kurz|lang|langsam|schnell|sofort|danach|anschließend|zunächst|zuerst|dann|später|vorher/i;
const ROLE_KEYWORDS = /mitarbeiter|bearbeiter|sachbearbeiter|chef|leiter|manager|abteilung|team|kolleg|kollege|system|automatisch|bot|tool|software|anwender|nutzer|benutzer|zuständig|verantwortlich/i;
const ISSUE_KEYWORDS = /problem|fehler|fehlt|falsch|unklar|schwierig|miss|nicht vorhanden|vergessen|doppelt|inkonsistent|lücke|verzögerung|engpass|blockiert|warten auf|wartet|hängt|hängen/i;
const VARIANT_KEYWORDS = /manchmal|gelegentlich|fallweise|alternativ|ausnahm|sonderfall|variante|je nach|abhängig|kann auch|oder aber|in einigen fällen|bei bestimmten|selten|häufig|meistens|normalerweise/i;

function classifySentence(text: string): ProcessMiningObservation['kind'] {
  const lower = text.toLowerCase();
  if (ISSUE_KEYWORDS.test(lower)) return 'issue';
  if (TIMING_KEYWORDS.test(lower) && /\d/.test(lower)) return 'timing';
  if (ROLE_KEYWORDS.test(lower)) return 'role';
  if (VARIANT_KEYWORDS.test(lower)) return 'variant';
  return 'step';
}

function splitIntoSentences(text: string): string[] {
  const byNewline = text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const result: string[] = [];
  for (const line of byNewline) {
    if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*') || /^\d+[.)]\s/.test(line)) {
      result.push(line.replace(/^[-•*]|\d+[.)]\s/, '').trim());
    } else {
      const sentenceSplit = line
        .split(/(?<=[.!?])\s+(?=[A-ZÜÄÖA-Z])/)
        .map(s => s.trim())
        .filter(s => s.length > 4);
      result.push(...sentenceSplit);
    }
  }
  return result.filter(s => s.length > 4);
}

function buildLabel(sentence: string): string {
  let label = sentence.replace(/^(dann|zunächst|zuerst|danach|anschließend|als nächstes|schließlich|abschließend|erstens|zweitens|drittens)\s+/i, '').trim();
  if (label.length > 80) {
    label = label.slice(0, 77) + '…';
  }
  label = label.replace(/[.!?]+$/, '').trim();
  const first = label.charAt(0).toUpperCase();
  return first + label.slice(1);
}

export interface ExtractionResult {
  observations: ProcessMiningObservation[];
  extractionCandidates: ExtractionCandidate[];
  caseObservationCount: number;
  hasOrdering: boolean;
}

function buildSentenceContext(sentences: string[], index: number): string {
  return buildContextWindow([
    sentences[index - 1],
    sentences[index],
    sentences[index + 1],
  ]);
}

export function extractObservationsFromCase(
  caseItem: ProcessMiningObservationCase,
): ExtractionResult {
  const sentences = splitIntoSentences(caseItem.narrative);
  const extractionCandidates: ExtractionCandidate[] = [];
  const observations: ProcessMiningObservation[] = [];

  sentences.forEach((sentence, index) => {
    const ts = tryParseTimestamp(sentence);
    const kind = classifySentence(sentence);
    const label = buildLabel(sentence);
    const sourceRef = buildEvidenceSourceRef(caseItem.id, `sentence:${index + 1}`);
    const contextWindow = buildSentenceContext(sentences, index);
    const quality: ObservationTimestampQuality = ts ? ts.quality : 'missing';

    if (kind === 'step') {
      const candidate = createStepCandidate({
        rawLabel: label,
        evidenceAnchor: sentence,
        contextWindow,
        confidence: quality === 'real' ? 'medium' : 'low',
        originChannel: 'sentence',
        sourceFragmentType: 'sentence',
        routingContext: caseItem.routingContext ?? {
          routingClass: 'mixed-document',
          routingConfidence: 'low',
          routingSignals: ['narrative-fallback:sentence'],
        },
        sourceRef,
        index,
      });
      extractionCandidates.push(candidate);
      observations.push(createObservationFromStepCandidate({
        candidate,
        caseId: caseItem.id,
        sequenceIndex: observations.length,
        timestampRaw: ts?.raw,
        timestampIso: ts?.iso || undefined,
        timestampQuality: quality,
      }));
      return;
    }

    extractionCandidates.push(createSupportCandidate({
      candidateType: kind === 'issue' || kind === 'timing' || kind === 'variant' ? 'signal' : 'support',
      rawLabel: label,
      evidenceAnchor: sentence,
      contextWindow,
      confidence: kind === 'issue' ? 'medium' : 'low',
      originChannel: 'sentence',
      sourceFragmentType: 'sentence',
      routingContext: caseItem.routingContext ?? {
        routingClass: 'mixed-document',
        routingConfidence: 'low',
        routingSignals: ['narrative-fallback:sentence'],
      },
      sourceRef,
    }));
  });

  const hasOrdering = sentences.length > 1;

  return {
    observations,
    extractionCandidates,
    caseObservationCount: observations.length,
    hasOrdering,
  };
}

export function computeQualitySummary(
  cases: ProcessMiningObservationCase[],
  observations: ProcessMiningObservation[],
  signalCount?: number,
): ProcessMiningQualitySummary {
  const caseIds = new Set(cases.map(c => c.id));

  const casesWithOrderingSet = new Set<string>();
  for (const obs of observations) {
    if (obs.sourceCaseId && caseIds.has(obs.sourceCaseId)) {
      const caseObs = observations.filter(o => o.sourceCaseId === obs.sourceCaseId);
      if (caseObs.length > 1) {
        casesWithOrderingSet.add(obs.sourceCaseId);
      }
    }
  }

  const withReal = observations.filter(o => o.timestampQuality === 'real').length;
  const withSynthetic = observations.filter(o => o.timestampQuality === 'synthetic').length;
  const withNone = observations.filter(o => o.timestampQuality === 'missing').length;
  const unclearLabels = observations.filter(o => o.label.length < 6 || o.label === 'Unbekannt').length;
  const stepObservations = observations.filter(o => o.kind === 'step');
  const stepObservationCount = stepObservations.length;
  const issueObservationCount = typeof signalCount === 'number' ? signalCount : observations.filter(o => o.kind === 'issue').length;
  const stepObservationsWithEvidence = stepObservations.filter(o => Boolean(o.evidenceSnippet?.trim())).length;
  const stepObservationsWithRole = stepObservations.filter(o => Boolean(o.role?.trim())).length;
  const stepObservationsWithSystem = stepObservations.filter(o => Boolean(o.system?.trim())).length;

  return {
    totalCases: cases.length,
    totalObservations: observations.length,
    stepObservationCount,
    issueObservationCount,
    casesWithOrdering: casesWithOrderingSet.size,
    observationsWithRealTime: withReal,
    observationsWithSyntheticTime: withSynthetic,
    observationsWithNoTime: withNone,
    unclearLabelCount: unclearLabels,
    stepObservationsWithEvidence,
    stepObservationsWithRole,
    stepObservationsWithSystem,
    updatedAt: new Date().toISOString(),
  };
}

export function mergeObservations(
  a: ProcessMiningObservation,
  b: ProcessMiningObservation,
): ProcessMiningObservation {
  return {
    ...a,
    label: `${a.label} / ${b.label}`,
    evidenceSnippet: [a.evidenceSnippet, b.evidenceSnippet].filter(Boolean).join(' '),
    timestampQuality:
      a.timestampQuality === 'real' || b.timestampQuality === 'real'
        ? 'real'
        : a.timestampQuality === 'synthetic' || b.timestampQuality === 'synthetic'
        ? 'synthetic'
        : 'missing',
    timestampRaw: a.timestampRaw ?? b.timestampRaw,
    timestampIso: a.timestampIso ?? b.timestampIso,
  };
}
