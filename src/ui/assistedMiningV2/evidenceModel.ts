import type {
  ExtractionCandidate,
  ExtractionCandidateReview,
  ExtractionSupportClass,
  ProcessMiningObservation,
  SourceRoutingContext,
} from '../../domain/process';
import { normalizeWhitespace, createObservation, sentenceCase, uniqueStrings } from './pmShared';
import { canonicalizeProcessStepLabel, inferStepFamily } from './semanticStepFamilies';
import { rolePreferredValue, systemPreferredValue } from './reviewNormalization';

const WEAK_STEP_LABEL_RE = /^(mail|e-?mail|chat|kommentar|notiz|hinweis|offen|ticket|frage|status|todo)$/i;
const ACTIVITY_STEP_RE = /\b(pr[üu]f|bearbeit|anleg|validier|freigeb|abstimm|dokumentier|versend|zuordn|abschlie[ßs]|eskalier|bereitstell|bestell|recherchier|koordinier|erfass|erstell|meld|genehmig|archivier|übermittel|kommunizier|informier|analysier|bewert|entschei|klär|klaer|empfang|start|beend|schlie[ßs]|einreich|überwach|kontrollier|bestätig|bestaetig|aktualisier)\w*/i;
const PROCESS_NOUN_RE = /\b(anfrage|auftrag|bestellung|rechnung|freigabe|meldung|fall|ticket|retoure|onboarding|stammdaten|reklamation|incident|zugang|prüfung|pruefung|abschluss|antrag)\b/i;
const WEAK_FRAGMENT_RE = /\?|(^|[\s:])(offen|todo|notiz|hinweis|kommentar|status|frage|zitat|quote|unklar)([\s.]|$)/i;
const COMMUNICATION_ONLY_RE = /\b(mail|e-?mail|chat|telefon|anruf|kommentar|notiz|nachricht)\b/i;
const GOVERNANCE_RE = /\b(freigabe|genehmig|richtlinie|policy|compliance|kontrolle|audit|governance|vorgabe)\b/i;
const FRICTION_RE = /\b(warte|verzöger|verzoeger|engpass|block|reibung|mehrfach|medienbruch|fehler|unvollständig|unvollstaendig|unklar|fehl\w+|nacharbeit|rückfrage|rueckfrage)\b/i;
const ISSUE_RE = /\b(problem|risiko|abweich|issue|hinder|störung|stoer|unsicher|warnung)\b/i;
const META_STEP_RE = /^(?:fall\s+[a-z0-9äöüß]+(?:\s*[·-]\s*.+)?|rollen\s*:|systeme\s*:|signal\s*:|friktion\s*:|st[äa]rke\s*:|wichtig\s*:|hinweis\s*:|frage\s*:|die fallserie zeigt|die folgenden\s+\w+\s+f[äa]lle)/i;
const ENTITY_SENTENCE_RE = /[.!?"„“:]/;
const ENTITY_VERB_RE = /\b(?:ist|sind|war|waren|wurde|wurden|wird|werden|hat|haben|fehlte|fehlen|meldete|legte|erhielt|musste|funktionierte|funktionierten|ben[öo]tigt|braucht|drohte|starten|warten|angelegt|gepr[üu]ft|ge[aä]ndert|nachgezogen)\b/i;

function trimEvidence(value: string, max = 320): string {
  return normalizeWhitespace(value).slice(0, max);
}

export function buildEvidenceSourceRef(caseId: string, fragmentKey: string): string {
  return `${caseId}::${fragmentKey}`;
}

export function buildContextWindow(parts: Array<string | undefined>, max = 320): string {
  return trimEvidence(parts.filter(Boolean).join(' | '), max);
}

function buildSupportClass(candidate: ExtractionCandidate): ExtractionSupportClass {
  const text = normalizeWhitespace(`${candidate.rawLabel} ${candidate.contextWindow}`).toLowerCase();
  if (candidate.candidateType === 'step') return 'core-step';
  if (WEAK_FRAGMENT_RE.test(text) || (COMMUNICATION_ONLY_RE.test(text) && !ACTIVITY_STEP_RE.test(text))) {
    return 'weak-raw-fragment';
  }
  if (GOVERNANCE_RE.test(text)) return 'governance-note';
  if (FRICTION_RE.test(text)) return 'friction-signal';
  if (candidate.candidateType === 'signal' || ISSUE_RE.test(text)) return 'issue-signal';
  return 'support-evidence';
}

function hasActivityCharacter(candidate: ExtractionCandidate): boolean {
  const rawLabel = normalizeWhitespace(candidate.rawLabel);
  const context = normalizeWhitespace(candidate.contextWindow);
  if (ACTIVITY_STEP_RE.test(`${rawLabel} ${context}`)) return true;
  if (
    (candidate.sourceFragmentType === 'event-row' || candidate.sourceFragmentType === 'table-row')
    && rawLabel.length >= 3
    && !WEAK_STEP_LABEL_RE.test(rawLabel)
  ) {
    return true;
  }
  return PROCESS_NOUN_RE.test(context) && !COMMUNICATION_ONLY_RE.test(rawLabel);
}

function splitEntitySeeds(values: string[]): string[] {
  return values
    .flatMap(value => normalizeWhitespace(value).split(/[,/;]|\s+und\s+/i))
    .map(value => normalizeWhitespace(value))
    .filter(Boolean);
}

function isEntityLikeLabel(value: string, type: 'role' | 'system'): boolean {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return false;
  if (trimmed.length > (type === 'role' ? 48 : 56)) return false;
  if ((trimmed.match(/\s+/g) ?? []).length >= (type === 'role' ? 4 : 5)) return false;
  if (ENTITY_SENTENCE_RE.test(trimmed)) return false;
  if (ENTITY_VERB_RE.test(trimmed)) return false;
  if (/^(?:wichtig|signal|friktion|hinweis|frage|fall\s+[a-z0-9äöüß]+)/i.test(trimmed)) return false;
  return true;
}

function getStepRejectionReason(candidate: ExtractionCandidate): string | undefined {
  const rawLabel = normalizeWhitespace(candidate.rawLabel);
  const normalizedLabel = normalizeWhitespace(candidate.normalizedLabel);
  const evidenceAnchor = normalizeWhitespace(candidate.evidenceAnchor);
  const context = normalizeWhitespace(candidate.contextWindow);

  if (evidenceAnchor.length < 12) return 'Kein belastbarer Evidenzanker am Kernschritt.';
  if (context.length < 20) return 'Kein ausreichendes lokales Kontextfenster am Kernschritt.';
  if (META_STEP_RE.test(rawLabel) || META_STEP_RE.test(evidenceAnchor)) {
    return 'Einleitungs-, Review- oder Meta-Fragment wird nicht als Kernschritt übernommen.';
  }
  if (WEAK_STEP_LABEL_RE.test(rawLabel)) return 'Nur schwaches Kurzlabel ohne belastbaren Prozessbezug.';
  if (WEAK_FRAGMENT_RE.test(`${rawLabel} ${context}`)) return 'Schwaches Fragment, Notiz oder offene Frage wird nicht als Kernschritt übernommen.';
  if (/^\s*bitte\b/i.test(rawLabel) || /^\s*wer\b/i.test(rawLabel) || /\?$/.test(rawLabel)) {
    return 'Review- oder Fragefragment wird nicht als Kernschritt übernommen.';
  }
  if (/^\s*(?:am|um|gegen|sp[aä]ter|danach|erst bei|f[üu]r einen|f[üu]r eine)\b/i.test(rawLabel) && rawLabel === normalizedLabel) {
    return 'Zeit- oder fallspezifische Episodensätze werden nur mit belastbarer Prozessverdichtung als Kernschritt übernommen.';
  }
  if (/^\s*(?:falls|wenn|jedoch|dadurch|deshalb|diese|dieser|diesmal|sondern|obwohl|wobei)\b/i.test(rawLabel) && rawLabel === normalizedLabel) {
    return 'Neben- oder Reviewsatz ohne belastbare Prozessverdichtung wird nicht als Kernschritt übernommen.';
  }
  if (COMMUNICATION_ONLY_RE.test(rawLabel) && !ACTIVITY_STEP_RE.test(context)) {
    return 'Reine Kommunikationsform ohne belastbare Prozessfunktion.';
  }
  if (!hasActivityCharacter(candidate)) return 'Kein stabiler Aktivitätscharakter oder keine belastbare Prozessfunktion im lokalen Kontext.';
  return undefined;
}

function dedupeCandidates(candidates: ExtractionCandidate[]): ExtractionCandidate[] {
  const seen = new Set<string>();
  const deduped: ExtractionCandidate[] = [];
  for (const candidate of candidates) {
    const key = [
      candidate.candidateType,
      candidate.relatedCandidateId ?? '',
      candidate.normalizedLabel.toLowerCase(),
      candidate.evidenceAnchor.toLowerCase(),
      candidate.sourceRef ?? '',
      candidate.supportClass ?? '',
    ].join('::');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

export function createStepCandidate(params: {
  candidateId?: string;
  rawLabel: string;
  normalizedLabel?: string;
  preserveOriginalLabel?: boolean;
  originalStepLabel?: string;
  canonicalStepFamily?: string;
  stepWasPreserved?: boolean;
  mergeSkippedBecauseStructured?: boolean;
  explicitRoles?: string[];
  explicitSystems?: string[];
  suppressedInferredRoles?: string[];
  suppressedInferredSystems?: string[];
  domainAligned?: boolean;
  secondaryDomainHint?: string;
  evidenceAnchor: string;
  contextWindow: string;
  confidence?: ExtractionCandidate['confidence'];
  originChannel: ExtractionCandidate['originChannel'];
  sourceFragmentType: ExtractionCandidate['sourceFragmentType'];
  routingContext: SourceRoutingContext;
  sourceRef: string;
  index: number;
}): ExtractionCandidate {
  const originalStepLabel = trimEvidence(params.originalStepLabel ?? params.rawLabel, 180);
  const canonicalStepFamily = params.canonicalStepFamily
    ?? inferStepFamily(params.normalizedLabel ?? params.rawLabel)?.label;
  return {
    candidateId: params.candidateId ?? crypto.randomUUID(),
    candidateType: 'step',
    rawLabel: trimEvidence(params.rawLabel, 180),
    normalizedLabel: params.preserveOriginalLabel
      ? trimEvidence(params.normalizedLabel ?? originalStepLabel, 180)
      : canonicalizeProcessStepLabel({
        title: params.normalizedLabel ?? params.rawLabel,
        body: params.contextWindow || params.evidenceAnchor,
        fallback: params.rawLabel,
        index: params.index,
      }),
    originalStepLabel,
    canonicalStepFamily,
    stepWasPreserved: params.stepWasPreserved,
    mergeSkippedBecauseStructured: params.mergeSkippedBecauseStructured,
    explicitRoles: params.explicitRoles,
    explicitSystems: params.explicitSystems,
    suppressedInferredRoles: params.suppressedInferredRoles,
    suppressedInferredSystems: params.suppressedInferredSystems,
    domainAligned: params.domainAligned,
    secondaryDomainHint: params.secondaryDomainHint,
    evidenceAnchor: trimEvidence(params.evidenceAnchor),
    contextWindow: trimEvidence(params.contextWindow),
    confidence: params.confidence ?? 'medium',
    originChannel: params.originChannel,
    sourceFragmentType: params.sourceFragmentType,
    routingClass: params.routingContext.routingClass,
    sourceRef: params.sourceRef,
    status: 'candidate',
    supportClass: 'core-step',
  };
}

function createLinkedCandidates(params: {
  type: 'role' | 'system';
  labels: string[];
  evidenceAnchor: string;
  contextWindow: string;
  confidence?: ExtractionCandidate['confidence'];
  originChannel: ExtractionCandidate['originChannel'];
  sourceFragmentType: ExtractionCandidate['sourceFragmentType'];
  routingContext: SourceRoutingContext;
  sourceRef: string;
  relatedCandidateId: string;
}): ExtractionCandidate[] {
  const labels = params.type === 'role'
    ? uniqueStrings(splitEntitySeeds(params.labels).filter(label => isEntityLikeLabel(label, 'role')).map(label => rolePreferredValue(label)))
    : uniqueStrings(splitEntitySeeds(params.labels).filter(label => isEntityLikeLabel(label, 'system')).map(label => systemPreferredValue(label)));

  return labels.map(label => ({
    candidateId: crypto.randomUUID(),
    candidateType: params.type,
    rawLabel: label,
    normalizedLabel: sentenceCase(label),
    evidenceAnchor: trimEvidence(params.evidenceAnchor),
    contextWindow: trimEvidence(params.contextWindow),
    confidence: params.confidence ?? 'medium',
    originChannel: params.originChannel,
    sourceFragmentType: params.sourceFragmentType,
    routingClass: params.routingContext.routingClass,
    sourceRef: params.sourceRef,
    relatedCandidateId: params.relatedCandidateId,
    status: 'candidate',
    supportClass: 'support-evidence',
  }));
}

export function createRoleCandidates(params: Omit<Parameters<typeof createLinkedCandidates>[0], 'type'>): ExtractionCandidate[] {
  return createLinkedCandidates({ ...params, type: 'role' });
}

export function createSystemCandidates(params: Omit<Parameters<typeof createLinkedCandidates>[0], 'type'>): ExtractionCandidate[] {
  return createLinkedCandidates({ ...params, type: 'system' });
}

export function createSupportCandidate(params: {
  candidateType?: 'signal' | 'support';
  candidateId?: string;
  rawLabel: string;
  normalizedLabel?: string;
  evidenceAnchor: string;
  contextWindow: string;
  confidence?: ExtractionCandidate['confidence'];
  originChannel: ExtractionCandidate['originChannel'];
  sourceFragmentType: ExtractionCandidate['sourceFragmentType'];
  routingContext: SourceRoutingContext;
  sourceRef?: string;
  relatedCandidateId?: string;
  supportClass?: ExtractionSupportClass;
  status?: ExtractionCandidate['status'];
  rejectionReason?: string;
  downgradeReason?: string;
}): ExtractionCandidate {
  return {
    candidateId: params.candidateId ?? crypto.randomUUID(),
    candidateType: params.candidateType ?? 'support',
    rawLabel: trimEvidence(params.rawLabel, 180),
    normalizedLabel: sentenceCase(params.normalizedLabel ?? params.rawLabel),
    evidenceAnchor: trimEvidence(params.evidenceAnchor),
    contextWindow: trimEvidence(params.contextWindow),
    confidence: params.confidence ?? 'low',
    originChannel: params.originChannel,
    sourceFragmentType: params.sourceFragmentType,
    routingClass: params.routingContext.routingClass,
    sourceRef: params.sourceRef,
    relatedCandidateId: params.relatedCandidateId,
    status: params.status ?? 'support-only',
    supportClass: params.supportClass,
    rejectionReason: params.rejectionReason,
    downgradeReason: params.downgradeReason,
  };
}

export function reviewExtractionCandidates(candidates: ExtractionCandidate[]): ExtractionCandidate[] {
  return dedupeCandidates(
    candidates.map(candidate => {
      if (candidate.candidateType === 'step') {
        if (candidate.stepWasPreserved) {
          return {
            ...candidate,
            status: 'merged' as const,
            supportClass: 'core-step' as const,
            rejectionReason: undefined,
          };
        }
        const rejectionReason = getStepRejectionReason(candidate);
        if (rejectionReason) {
          return {
            ...candidate,
            status: 'rejected' as const,
            supportClass: 'weak-raw-fragment' as const,
            confidence: 'low' as const,
            rejectionReason,
          };
        }
        return {
          ...candidate,
          status: 'merged' as const,
          supportClass: 'core-step' as const,
          rejectionReason: undefined,
        };
      }

      if (candidate.candidateType === 'role' || candidate.candidateType === 'system') {
        if (!candidate.relatedCandidateId) {
          return {
            ...candidate,
            status: 'support-only' as const,
            supportClass: 'support-evidence' as const,
            downgradeReason: candidate.downgradeReason ?? 'Zuordnung ist nicht lokal an einen Schrittkandidaten verankert.',
          };
        }
        const locallyAnchored = trimEvidence(candidate.evidenceAnchor).length >= 8 && trimEvidence(candidate.contextWindow).length >= 16;
        return {
          ...candidate,
          status: locallyAnchored ? candidate.status : 'support-only',
          supportClass: 'support-evidence' as const,
          downgradeReason: locallyAnchored ? candidate.downgradeReason : 'Lokale Zuordnung bleibt zu schwach und wird nur als Stützhinweis geführt.',
        };
      }

      const supportClass = candidate.supportClass ?? buildSupportClass(candidate);
      return {
        ...candidate,
        status: candidate.status === 'rejected' ? 'rejected' : 'support-only',
        supportClass,
        downgradeReason: candidate.downgradeReason
          ?? (supportClass === 'weak-raw-fragment'
            ? 'Schwaches Rohfragment wird außerhalb des Kernprozesses gehalten.'
            : 'Hinweis bleibt als Stützsignal außerhalb des Kernprozesses.'),
      };
    }),
  );
}

export function buildExtractionCandidateReview(candidates: ExtractionCandidate[]): ExtractionCandidateReview {
  return {
    totalCandidates: candidates.length,
    mergedCoreSteps: candidates.filter(candidate => candidate.candidateType === 'step' && candidate.status === 'merged').length,
    rejectedCoreSteps: candidates.filter(candidate => candidate.candidateType === 'step' && candidate.status === 'rejected').length,
    supportOnlyCandidates: candidates.filter(candidate => candidate.status === 'support-only').length,
    localRoleAssignments: candidates.filter(candidate => candidate.candidateType === 'role' && candidate.status !== 'support-only' && Boolean(candidate.relatedCandidateId)).length,
    localSystemAssignments: candidates.filter(candidate => candidate.candidateType === 'system' && candidate.status !== 'support-only' && Boolean(candidate.relatedCandidateId)).length,
    weakFragmentCount: candidates.filter(candidate => candidate.supportClass === 'weak-raw-fragment').length,
  };
}

export function createObservationFromStepCandidate(params: {
  candidate: ExtractionCandidate;
  caseId: string;
  sequenceIndex: number;
  role?: string;
  system?: string;
  roles?: string[];
  systems?: string[];
  explicitRoles?: string[];
  explicitSystems?: string[];
  timestampRaw?: string;
  timestampIso?: string;
  timestampQuality?: ProcessMiningObservation['timestampQuality'];
}): ProcessMiningObservation {
  const preserveStructured = Boolean(params.candidate.stepWasPreserved);
  const primaryRole = params.role ?? params.roles?.[0];
  const primarySystem = params.system ?? params.systems?.[0];
  const roles = params.roles
    ? uniqueStrings(params.roles)
    : primaryRole
    ? [preserveStructured ? primaryRole : rolePreferredValue(primaryRole)]
    : [];
  const systems = params.systems
    ? uniqueStrings(params.systems)
    : primarySystem
    ? [preserveStructured ? primarySystem : systemPreferredValue(primarySystem)]
    : [];
  const observation = createObservation({
    caseId: params.caseId,
    label: params.candidate.normalizedLabel,
    sequenceIndex: params.sequenceIndex,
    evidenceSnippet: params.candidate.evidenceAnchor,
    role: primaryRole
      ? (preserveStructured ? primaryRole : rolePreferredValue(primaryRole))
      : undefined,
    system: primarySystem
      ? (preserveStructured ? primarySystem : systemPreferredValue(primarySystem))
      : undefined,
    timestampRaw: params.timestampRaw,
    timestampIso: params.timestampIso,
    timestampQuality: params.timestampQuality,
    kind: 'step',
  });
  return {
    ...observation,
    candidateId: params.candidate.candidateId,
    evidenceAnchor: params.candidate.evidenceAnchor,
    contextWindow: params.candidate.contextWindow,
    originChannel: params.candidate.originChannel,
    sourceFragmentType: params.candidate.sourceFragmentType,
    originalStepLabel: params.candidate.originalStepLabel,
    canonicalStepFamily: params.candidate.canonicalStepFamily,
    stepWasPreserved: params.candidate.stepWasPreserved,
    mergeSkippedBecauseStructured: params.candidate.mergeSkippedBecauseStructured,
    roles: roles.length > 0 ? roles : undefined,
    systems: systems.length > 0 ? systems : undefined,
    explicitRoles: params.explicitRoles ?? params.candidate.explicitRoles,
    explicitSystems: params.explicitSystems ?? params.candidate.explicitSystems,
    suppressedInferredRoles: params.candidate.suppressedInferredRoles,
    suppressedInferredSystems: params.candidate.suppressedInferredSystems,
    domainAligned: params.candidate.domainAligned,
    secondaryDomainHint: params.candidate.secondaryDomainHint,
  };
}
