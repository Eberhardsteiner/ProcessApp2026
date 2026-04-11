import type {
  ExtractionCandidate,
  ExtractionCandidateReview,
  ExtractionSupportClass,
  ProcessMiningObservation,
  SourceRoutingContext,
} from '../../domain/process';
import { normalizeWhitespace, createObservation, sentenceCase, uniqueStrings } from './pmShared';
import { canonicalizeProcessStepLabel } from './semanticStepFamilies';
import { rolePreferredValue, systemPreferredValue } from './reviewNormalization';

const WEAK_STEP_LABEL_RE = /^(mail|e-?mail|chat|kommentar|notiz|hinweis|offen|ticket|frage|status|todo)$/i;
const ACTIVITY_STEP_RE = /\b(pr[üu]f|bearbeit|anleg|validier|freigeb|abstimm|dokumentier|versend|zuordn|abschlie[ßs]|eskalier|bereitstell|bestell|recherchier|koordinier|erfass|erstell|meld|genehmig|archivier|übermittel|kommunizier|informier|analysier|bewert|entschei|klär|klaer|empfang|start|beend|schlie[ßs]|einreich|überwach|kontrollier|bestätig|bestaetig|aktualisier)\w*/i;
const PROCESS_NOUN_RE = /\b(anfrage|auftrag|bestellung|rechnung|freigabe|meldung|fall|ticket|retoure|onboarding|stammdaten|reklamation|incident|zugang|prüfung|pruefung|abschluss|antrag)\b/i;
const WEAK_FRAGMENT_RE = /\?|(^|[\s:])(offen|todo|notiz|hinweis|kommentar|status|frage|zitat|quote|unklar)([\s.]|$)/i;
const COMMUNICATION_ONLY_RE = /\b(mail|e-?mail|chat|telefon|anruf|kommentar|notiz|nachricht)\b/i;
const GOVERNANCE_RE = /\b(freigabe|genehmig|richtlinie|policy|compliance|kontrolle|audit|governance|vorgabe)\b/i;
const FRICTION_RE = /\b(warte|verzöger|verzoeger|engpass|block|reibung|mehrfach|medienbruch|fehler|unvollständig|unvollstaendig|unklar|fehl\w+|nacharbeit|rückfrage|rueckfrage)\b/i;
const ISSUE_RE = /\b(problem|risiko|abweich|issue|hinder|störung|stoer|unsicher|warnung)\b/i;

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

function getStepRejectionReason(candidate: ExtractionCandidate): string | undefined {
  const rawLabel = normalizeWhitespace(candidate.rawLabel);
  const evidenceAnchor = normalizeWhitespace(candidate.evidenceAnchor);
  const context = normalizeWhitespace(candidate.contextWindow);

  if (evidenceAnchor.length < 12) return 'Kein belastbarer Evidenzanker am Kernschritt.';
  if (context.length < 20) return 'Kein ausreichendes lokales Kontextfenster am Kernschritt.';
  if (WEAK_STEP_LABEL_RE.test(rawLabel)) return 'Nur schwaches Kurzlabel ohne belastbaren Prozessbezug.';
  if (WEAK_FRAGMENT_RE.test(`${rawLabel} ${context}`)) return 'Schwaches Fragment, Notiz oder offene Frage wird nicht als Kernschritt übernommen.';
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
  evidenceAnchor: string;
  contextWindow: string;
  confidence?: ExtractionCandidate['confidence'];
  originChannel: ExtractionCandidate['originChannel'];
  sourceFragmentType: ExtractionCandidate['sourceFragmentType'];
  routingContext: SourceRoutingContext;
  sourceRef: string;
  index: number;
}): ExtractionCandidate {
  return {
    candidateId: params.candidateId ?? crypto.randomUUID(),
    candidateType: 'step',
    rawLabel: trimEvidence(params.rawLabel, 180),
    normalizedLabel: canonicalizeProcessStepLabel({
      title: params.normalizedLabel ?? params.rawLabel,
      body: params.contextWindow || params.evidenceAnchor,
      fallback: params.rawLabel,
      index: params.index,
    }),
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
    ? uniqueStrings(params.labels.map(label => rolePreferredValue(label)))
    : uniqueStrings(params.labels.map(label => systemPreferredValue(label)));

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
  timestampRaw?: string;
  timestampIso?: string;
  timestampQuality?: ProcessMiningObservation['timestampQuality'];
}): ProcessMiningObservation {
  const observation = createObservation({
    caseId: params.caseId,
    label: params.candidate.normalizedLabel,
    sequenceIndex: params.sequenceIndex,
    evidenceSnippet: params.candidate.evidenceAnchor,
    role: params.role ? rolePreferredValue(params.role) : undefined,
    system: params.system ? systemPreferredValue(params.system) : undefined,
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
  };
}
