import type {
  DerivationSummary,
  ProcessMiningAnalysisMode,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
} from '../../domain/process';

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeLabel(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

export function sentenceCase(value: string): string {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = normalizeWhitespace(value ?? '');
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function getCaseIdsFromObservations(observations: ProcessMiningObservation[]): string[] {
  return Array.from(new Set(observations.map(o => o.sourceCaseId).filter((id): id is string => Boolean(id))));
}

export function detectProcessMiningAnalysisMode(params: {
  cases?: ProcessMiningObservationCase[];
  observations?: ProcessMiningObservation[];
  lastDerivationSummary?: DerivationSummary;
}): ProcessMiningAnalysisMode {
  const { cases = [], observations = [], lastDerivationSummary } = params;

  if (lastDerivationSummary?.analysisMode) {
    return lastDerivationSummary.analysisMode;
  }

  const caseCount = Math.max(cases.length, getCaseIdsFromObservations(observations).length);
  const realTimeCount = observations.filter(o => o.timestampQuality === 'real').length;

  if (caseCount <= 1) return 'process-draft';
  if (caseCount < 5 || realTimeCount === 0) return 'exploratory-mining';
  return 'true-mining';
}

export function getAnalysisModeLabel(mode: ProcessMiningAnalysisMode): string {
  if (mode === 'process-draft') return 'Dokumentbasierter Prozessentwurf';
  if (mode === 'exploratory-mining') return 'Explorative Prozessanalyse';
  return 'Belastbares Process Mining';
}

export function buildAnalysisModeNotice(params: {
  mode: ProcessMiningAnalysisMode;
  caseCount: number;
  documentKind?: DerivationSummary['documentKind'];
}): string {
  const { mode, caseCount, documentKind } = params;
  if (mode === 'process-draft') {
    if (documentKind === 'procedure-document') {
      return 'Aktuell liegt vor allem ein einzelnes Verfahrensdokument vor. Die Ergebnisse zeigen daher einen Prozessentwurf, keine statistisch belastbaren Häufigkeiten.';
    }
    return 'Aktuell liegt nur ein einzelner Fall vor. Die Ergebnisse zeigen einen Prozessentwurf aus diesem Fall, noch kein belastbares Mining-Muster.';
  }
  if (mode === 'exploratory-mining') {
    return `Es liegen ${caseCount} Fälle vor. Das reicht für eine erste explorative Auswertung, aber noch nicht für belastbare Standardquoten wie in einem echten Eventlog.`;
  }
  return `Es liegen ${caseCount} Fälle mit ausreichend Struktur für ein belastbares Mining vor.`;
}

export function sampleAwarePercentLabel(count: number, total: number): string {
  if (total <= 1) {
    return count === 1 ? 'im ausgewerteten Fall' : 'im ausgewerteten Material';
  }
  return `in ${Math.round((count / Math.max(total, 1)) * 100)} % der Fälle`;
}

export function createObservation(params: {
  caseId: string;
  label: string;
  sequenceIndex: number;
  kind?: ProcessMiningObservation['kind'];
  evidenceSnippet?: string;
  role?: string;
  system?: string;
  timestampRaw?: string;
  timestampIso?: string;
  timestampQuality?: ProcessMiningObservation['timestampQuality'];
}): ProcessMiningObservation {
  return {
    id: crypto.randomUUID(),
    sourceCaseId: params.caseId,
    label: sentenceCase(params.label),
    evidenceSnippet: params.evidenceSnippet,
    role: params.role,
    system: params.system,
    kind: params.kind ?? 'step',
    sequenceIndex: params.sequenceIndex,
    timestampRaw: params.timestampRaw,
    timestampIso: params.timestampIso,
    timestampQuality: params.timestampQuality ?? (params.timestampIso || params.timestampRaw ? 'real' : 'missing'),
    createdAt: new Date().toISOString(),
  };
}
