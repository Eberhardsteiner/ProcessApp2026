import type {
  DerivationSummary,
  ProcessMiningAnalysisMode,
  ProcessMiningObservation,
  ProcessMiningObservationCase,
} from '../../domain/process';
import {
  buildAnalysisModeNotice,
  detectProcessMiningAnalysisMode,
  normalizeLabel,
  sampleAwarePercentLabel,
} from './pmShared';
import { canonicalizeProcessStepLabel, stepSemanticKey } from './semanticStepFamilies';

export type HotspotKind = 'timing' | 'rework' | 'instability' | 'handoff' | 'exception';

export interface V2Hotspot {
  id: string;
  kind: HotspotKind;
  stepLabel: string;
  headline: string;
  detail: string;
  affectedCases: number;
  affectedCasePct: number;
  isTimeBased: boolean;
  savedAsNote: boolean;
}

export interface V2EnhancementResult {
  analysisMode: ProcessMiningAnalysisMode;
  sampleNotice: string;
  hasTimingData: boolean;
  totalCases: number;
  hotspots: V2Hotspot[];
  variantInstabilityPct: number;
  computedAt: string;
}

function getStepObservations(observations: ProcessMiningObservation[]): ProcessMiningObservation[] {
  return observations.filter(observation => observation.kind === 'step');
}

function getIssueObservations(observations: ProcessMiningObservation[]): ProcessMiningObservation[] {
  return observations.filter(observation => observation.kind === 'issue');
}

function getCaseIds(observations: ProcessMiningObservation[]): string[] {
  return Array.from(
    new Set(observations.map(observation => observation.sourceCaseId).filter((id): id is string => Boolean(id))),
  );
}

function getSequenceForCase(
  caseId: string,
  observations: ProcessMiningObservation[],
): ProcessMiningObservation[] {
  return observations
    .filter(observation => observation.sourceCaseId === caseId)
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex);
}

function parseRealTimestamp(observation: ProcessMiningObservation): number | null {
  if (observation.timestampQuality !== 'real') return null;
  const value = observation.timestampIso || observation.timestampRaw;
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundPct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function buildIssueHotspots(issueObservations: ProcessMiningObservation[], totalCases: number): V2Hotspot[] {
  const grouped = new Map<string, { label: string; caseIds: Set<string>; snippets: string[] }>();
  for (const observation of issueObservations) {
    if (!observation.sourceCaseId) continue;
    const key = normalizeLabel(observation.label);
    if (!grouped.has(key)) {
      grouped.set(key, { label: observation.label, caseIds: new Set(), snippets: [] });
    }
    const entry = grouped.get(key)!;
    entry.caseIds.add(observation.sourceCaseId);
    if (observation.evidenceSnippet) entry.snippets.push(observation.evidenceSnippet);
  }

  return Array.from(grouped.values()).map(entry => {
    const count = entry.caseIds.size;
    const lead = sampleAwarePercentLabel(count, totalCases);
    return {
      id: crypto.randomUUID(),
      kind: 'exception',
      stepLabel: entry.label,
      headline: entry.label,
      detail:
        totalCases <= 1
          ? `Im ausgewerteten Material zeigt sich dieses Reibungssignal: ${entry.label}.`
          : `${lead} zeigt sich dieses Reibungssignal: ${entry.label}.`,
      affectedCases: count,
      affectedCasePct: roundPct(count, totalCases),
      isTimeBased: false,
      savedAsNote: false,
    };
  });
}

function buildReworkHotspots(stepObservations: ProcessMiningObservation[], totalCases: number): V2Hotspot[] {
  const reworkMap = new Map<string, Set<string>>();
  for (const caseId of getCaseIds(stepObservations)) {
    const seen = new Set<string>();
    for (const observation of getSequenceForCase(caseId, stepObservations)) {
      const key = stepSemanticKey(observation.label);
      if (seen.has(key)) {
        if (!reworkMap.has(key)) reworkMap.set(key, new Set());
        reworkMap.get(key)!.add(caseId);
      }
      seen.add(key);
    }
  }

  return Array.from(reworkMap.entries()).map(([key, caseIdSet]) => {
    const count = caseIdSet.size;
    const label = stepObservations.find(observation => stepSemanticKey(observation.label) === key)?.label ?? key.replace(/^family:/, '');
    const lead = sampleAwarePercentLabel(count, totalCases);
    return {
      id: crypto.randomUUID(),
      kind: 'rework' as const,
      stepLabel: label,
      headline: `Hier wird zurückgesprungen: „${label}“`,
      detail:
        totalCases <= 1
          ? `Im ausgewerteten Ablauf wird dieser Schritt mehrfach durchlaufen. Das deutet auf Rückfragen, Korrekturen oder Nacharbeit hin.`
          : `${lead} wird dieser Schritt mehrfach durchlaufen. Das deutet auf Rückfragen, Korrekturen oder Nacharbeit hin.`,
      affectedCases: count,
      affectedCasePct: roundPct(count, totalCases),
      isTimeBased: false,
      savedAsNote: false,
    };
  });
}

function buildTimingHotspots(stepObservations: ProcessMiningObservation[], totalCases: number): V2Hotspot[] {
  const durationsByStep = new Map<string, { label: string; caseIds: Set<string>; durationsMs: number[] }>();

  for (const caseId of getCaseIds(stepObservations)) {
    const sequence = getSequenceForCase(caseId, stepObservations)
      .map(observation => ({ observation, ts: parseRealTimestamp(observation) }))
      .filter((entry): entry is { observation: ProcessMiningObservation; ts: number } => entry.ts !== null)
      .sort((a, b) => a.ts - b.ts);

    for (let index = 0; index < sequence.length - 1; index += 1) {
      const current = sequence[index];
      const next = sequence[index + 1];
      const diffMs = next.ts - current.ts;
      if (!(diffMs > 0)) continue;
      const key = stepSemanticKey(current.observation.label);
      if (!durationsByStep.has(key)) {
        durationsByStep.set(key, { label: canonicalizeProcessStepLabel({ title: current.observation.label, body: current.observation.evidenceSnippet, fallback: current.observation.label }), caseIds: new Set(), durationsMs: [] });
      }
      const entry = durationsByStep.get(key)!;
      entry.caseIds.add(caseId);
      entry.durationsMs.push(diffMs);
    }
  }

  return Array.from(durationsByStep.values())
    .map(entry => {
      const count = entry.caseIds.size;
      const avgMinutes = Math.round(entry.durationsMs.reduce((sum, value) => sum + value, 0) / Math.max(entry.durationsMs.length, 1) / 60000);
      return {
        id: crypto.randomUUID(),
        kind: 'timing' as const,
        stepLabel: entry.label,
        headline: `Hier staut es sich nach „${entry.label}“`,
        detail:
          totalCases <= 1
            ? `Im ausgewerteten Ablauf entsteht nach diesem Schritt eine mittlere Warte- oder Bearbeitungszeit von rund ${avgMinutes} Minuten.`
            : `${sampleAwarePercentLabel(count, totalCases)} entsteht nach diesem Schritt messbare Warte- oder Bearbeitungszeit. Durchschnittlich rund ${avgMinutes} Minuten.`,
        affectedCases: count,
        affectedCasePct: roundPct(count, totalCases),
        isTimeBased: true,
        savedAsNote: false,
      };
    })
    .filter(entry => entry.affectedCases > 0)
    .sort((a, b) => b.affectedCases - a.affectedCases);
}

function buildHandoffHotspots(stepObservations: ProcessMiningObservation[], totalCases: number): V2Hotspot[] {
  const handoffMap = new Map<string, { pair: string; caseIds: Set<string> }>();

  for (const caseId of getCaseIds(stepObservations)) {
    const sequence = getSequenceForCase(caseId, stepObservations);
    for (let index = 0; index < sequence.length - 1; index += 1) {
      const current = sequence[index];
      const next = sequence[index + 1];
      if (!current.role || !next.role) continue;
      if (normalizeLabel(current.role) === normalizeLabel(next.role)) continue;
      const pair = `${current.role} → ${next.role}`;
      const key = normalizeLabel(pair);
      if (!handoffMap.has(key)) handoffMap.set(key, { pair, caseIds: new Set() });
      handoffMap.get(key)!.caseIds.add(caseId);
    }
  }

  return Array.from(handoffMap.values())
    .filter(entry => entry.caseIds.size > 0)
    .map(entry => ({
      id: crypto.randomUUID(),
      kind: 'handoff' as const,
      stepLabel: entry.pair,
      headline: `Viele Übergaben zwischen ${entry.pair}`,
      detail:
        totalCases <= 1
          ? `Im ausgewerteten Ablauf gibt es an dieser Stelle eine Rollenübergabe. Das ist kein Fehler, aber ein möglicher Prüfpunkt für Medienbrüche oder Abstimmungsaufwand.`
          : `${sampleAwarePercentLabel(entry.caseIds.size, totalCases)} tritt diese Rollenübergabe auf. Das ist ein möglicher Prüfpunkt für Abstimmungs- oder Medienbruchaufwand.`,
      affectedCases: entry.caseIds.size,
      affectedCasePct: roundPct(entry.caseIds.size, totalCases),
      isTimeBased: false,
      savedAsNote: false,
    }));
}

function buildInstabilityHotspots(
  stepObservations: ProcessMiningObservation[],
  totalCases: number,
  analysisMode: ProcessMiningAnalysisMode,
): { hotspots: V2Hotspot[]; variantInstabilityPct: number } {
  if (analysisMode === 'process-draft' || totalCases < 3) {
    return { hotspots: [], variantInstabilityPct: 0 };
  }

  const variantKeys = getCaseIds(stepObservations).map(caseId =>
    getSequenceForCase(caseId, stepObservations)
      .map(observation => stepSemanticKey(observation.label))
      .join(' → '),
  );
  const variantCount = new Set(variantKeys).size;
  const variantInstabilityPct = roundPct(variantCount, totalCases);

  const positions = new Map<string, { label: string; positions: Set<number>; caseIds: Set<string> }>();
  for (const caseId of getCaseIds(stepObservations)) {
    getSequenceForCase(caseId, stepObservations).forEach((observation, index) => {
      const key = stepSemanticKey(observation.label);
      if (!positions.has(key)) {
        positions.set(key, { label: observation.label, positions: new Set(), caseIds: new Set() });
      }
      const entry = positions.get(key)!;
      entry.positions.add(index);
      entry.caseIds.add(caseId);
    });
  }

  const hotspots = Array.from(positions.values())
    .filter(entry => entry.positions.size >= 3 && entry.caseIds.size >= 2)
    .map(entry => ({
      id: crypto.randomUUID(),
      kind: 'instability' as const,
      stepLabel: entry.label,
      headline: `Hier läuft der Prozess uneinheitlich: „${entry.label}“`,
      detail: `${sampleAwarePercentLabel(entry.caseIds.size, totalCases)} taucht dieser Schritt an unterschiedlichen Stellen im Ablauf auf. Das deutet auf fehlende Standardisierung oder viele Sonderfälle hin.`,
      affectedCases: entry.caseIds.size,
      affectedCasePct: roundPct(entry.caseIds.size, totalCases),
      isTimeBased: false,
      savedAsNote: false,
    }));

  return { hotspots, variantInstabilityPct };
}

export function computeV2Enhancement(params: {
  cases: ProcessMiningObservationCase[];
  observations: ProcessMiningObservation[];
  lastDerivationSummary?: DerivationSummary;
}): V2EnhancementResult {
  const stepObservations = getStepObservations(params.observations);
  const issueObservations = getIssueObservations(params.observations);
  const totalCases = Math.max(params.cases.length, getCaseIds(stepObservations).length);
  const analysisMode = detectProcessMiningAnalysisMode({
    cases: params.cases,
    observations: stepObservations,
    lastDerivationSummary: params.lastDerivationSummary,
  });
  const sampleNotice = buildAnalysisModeNotice({
    mode: analysisMode,
    caseCount: totalCases,
    documentKind: params.lastDerivationSummary?.documentKind,
  });

  const hasTimingData = stepObservations.some(observation => parseRealTimestamp(observation) !== null);

  const timingHotspots = hasTimingData ? buildTimingHotspots(stepObservations, totalCases) : [];
  const issueHotspots = buildIssueHotspots(issueObservations, totalCases);
  const reworkHotspots = buildReworkHotspots(stepObservations, totalCases);
  const handoffHotspots = buildHandoffHotspots(stepObservations, totalCases);
  const { hotspots: instabilityHotspots, variantInstabilityPct } = buildInstabilityHotspots(
    stepObservations,
    totalCases,
    analysisMode,
  );

  const hotspots = [
    ...timingHotspots,
    ...issueHotspots,
    ...reworkHotspots,
    ...handoffHotspots,
    ...instabilityHotspots,
  ].sort((a, b) => {
    if (b.affectedCases !== a.affectedCases) return b.affectedCases - a.affectedCases;
    return a.headline.localeCompare(b.headline);
  });

  return {
    analysisMode,
    sampleNotice,
    hasTimingData,
    totalCases,
    hotspots,
    variantInstabilityPct,
    computedAt: new Date().toISOString(),
  };
}
