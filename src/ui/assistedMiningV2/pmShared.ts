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

function getRealTimeCoverage(observations: ProcessMiningObservation[]): number {
  const stepObservations = observations.filter(observation => observation.kind === 'step');
  if (stepObservations.length === 0) return 0;
  const realTimeCount = stepObservations.filter(observation => observation.timestampQuality === 'real').length;
  return realTimeCount / stepObservations.length;
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
  const stepObservations = observations.filter(observation => observation.kind === 'step');
  const realTimeCoverage = getRealTimeCoverage(stepObservations);
  const procedureDocument = lastDerivationSummary?.documentKind === 'procedure-document';

  if (caseCount <= 1) return 'process-draft';
  if (procedureDocument && caseCount <= 2) return 'process-draft';

  const enoughCasesForMining = caseCount >= 8;
  const enoughTimeForMining = realTimeCoverage >= 0.6;
  const enoughEventsForMining = stepObservations.length >= Math.max(24, caseCount * 3);

  if (enoughCasesForMining && enoughTimeForMining && enoughEventsForMining) {
    return 'true-mining';
  }

  return 'exploratory-mining';
}

export function getAnalysisModeLabel(mode: ProcessMiningAnalysisMode): string {
  if (mode === 'process-draft') return 'Prozessentwurf';
  if (mode === 'exploratory-mining') return 'Fallvergleich';
  return 'Echtes Process Mining';
}

export function canUseStrongPercentages(mode: ProcessMiningAnalysisMode, caseCount: number): boolean {
  return mode === 'true-mining' && caseCount >= 8;
}

export function formatCaseCountShare(params: {
  count: number;
  total: number;
  mode?: ProcessMiningAnalysisMode;
}): string {
  const { count, total, mode } = params;
  if (total <= 0) return 'noch keine belastbare Basis';
  if (!canUseStrongPercentages(mode ?? 'exploratory-mining', total)) {
    return `${count} von ${total} ${total === 1 ? 'Quelle' : 'Fällen/Quellen'}`;
  }
  return `${Math.round((count / Math.max(total, 1)) * 100)} %`;
}


export type AnalysisClaimStrength = 'draft-only' | 'cautious-comparison' | 'strong-mining';

export function getAnalysisClaimStrength(mode: ProcessMiningAnalysisMode, caseCount: number): AnalysisClaimStrength {
  if (mode === 'process-draft') return 'draft-only';
  if (canUseStrongPercentages(mode, caseCount)) return 'strong-mining';
  return 'cautious-comparison';
}

export function buildAnalysisClaimNote(params: {
  mode: ProcessMiningAnalysisMode;
  caseCount: number;
}): string {
  const { mode, caseCount } = params;
  const strength = getAnalysisClaimStrength(mode, caseCount);
  if (strength === 'draft-only') {
    return 'Die App sollte hier nur von einem Prozessentwurf sprechen. Prozentwerte und Standardquoten wären zu stark.';
  }
  if (strength === 'cautious-comparison') {
    return `Die App darf ${caseCount} Fälle vorsichtig vergleichen, sollte Mengen- und Prozentangaben aber nur zurückhaltend verwenden.`;
  }
  return 'Die Datenbasis ist stark genug für deutlich belastbarere Mengen- und Prozentangaben.';
}

export function buildAnalysisModeNotice(params: {
  mode: ProcessMiningAnalysisMode;
  caseCount: number;
  documentKind?: DerivationSummary['documentKind'];
}): string {
  const { mode, caseCount, documentKind } = params;
  if (mode === 'process-draft') {
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
    if (documentKind === 'procedure-document') {
      return 'Aktuell liegt vor allem ein einzelnes Verfahrensdokument vor. Die Ergebnisse sind daher als Prozessentwurf zu lesen, nicht als belastbare Mengen- oder Quotenanalyse.';
    }
    return 'Aktuell liegt nur ein einzelner Fall oder eine einzelne Quelle vor. Die Ergebnisse zeigen einen Prozessentwurf, aber noch keine belastbare Aussage über typische Häufigkeiten.';
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
    if (documentKind === 'procedure-document' || documentKind === 'semi-structured-procedure-document') {
      return 'Aktuell liegt vor allem ein einzelnes Verfahrensdokument vor. Die Ergebnisse zeigen daher einen Prozessentwurf, keine statistisch belastbaren Häufigkeiten.';
    }
    if (documentKind === 'mixed-document') {
      return 'Aktuell liegt ein Mischdokument vor. Die Ergebnisse zeigen einen vorsichtigen Prozessentwurf mit getrennten Struktur- und Narrativanteilen.';
    }
    return 'Aktuell liegt nur ein einzelner Fall vor. Die Ergebnisse zeigen einen Prozessentwurf aus diesem Fall, noch kein belastbares Mining-Muster.';
>>>>>>> theirs
  }
  if (mode === 'exploratory-mining') {
    return `Es liegen ${caseCount} Fälle oder Quellen vor. Das reicht für einen vorsichtigen Fallvergleich, aber noch nicht für harte Standardquoten wie in einem echten Eventlog.`;
  }
  return `Es liegen ${caseCount} strukturierte Fälle mit ausreichender Zeitbasis vor. Prozentwerte und Vergleichsaussagen sind damit deutlich belastbarer.`;
}

export function sampleAwarePercentLabel(count: number, total: number, mode?: ProcessMiningAnalysisMode): string {
  if (total <= 1) {
    return count === 1 ? 'im ausgewerteten Fall' : 'im ausgewerteten Material';
  }
  if (!canUseStrongPercentages(mode ?? 'exploratory-mining', total)) {
    return `in ${count} von ${total} Fällen`;
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
