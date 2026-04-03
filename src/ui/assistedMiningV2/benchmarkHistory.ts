import type { ProcessMiningBenchmarkSnapshot } from '../../domain/process';
import type { BenchmarkSuiteResult } from './benchmarkLab';

export interface BenchmarkSnapshotDelta {
  scoreDelta: number;
  passedDelta: number;
  attentionDelta: number;
  failedDelta: number;
  summary: string;
  changedDomains: Array<{
    label: string;
    previousScore: number;
    currentScore: number;
    delta: number;
  }>;
  changedDimensions: Array<{
    label: string;
    previousScore: number;
    currentScore: number;
    delta: number;
  }>;
}

export function toBenchmarkSnapshot(result: BenchmarkSuiteResult): ProcessMiningBenchmarkSnapshot {
  return {
    computedAt: result.computedAt,
    engineVersion: result.engineVersion,
    status: result.status,
    overallScore: result.overallScore,
    passedCount: result.passedCount,
    attentionCount: result.attentionCount,
    failedCount: result.failedCount,
    caseCount: result.coverage.totalCases,
    goldCaseCount: result.coverage.goldCaseCount,
    samplePackCount: result.coverage.samplePackCount,
    headline: result.headline,
    summary: result.summary,
    domainScores: result.domainScores.map(item => ({
      key: item.key,
      label: item.label,
      count: item.count,
      score: item.score,
      status: item.status,
    })),
    dimensionScores: result.dimensionScores.map(item => ({
      key: item.key,
      label: item.label,
      score: item.score,
      note: item.note,
    })),
    weakestCases: result.weakestCases.map(item => ({
      id: item.id,
      label: item.label,
      domain: item.domain,
      score: item.score,
      status: item.status,
    })),
    recommendations: result.recommendations,
    strictGate: result.strictGate,
  };
}

export function pushBenchmarkSnapshot(
  history: ProcessMiningBenchmarkSnapshot[] | undefined,
  next: ProcessMiningBenchmarkSnapshot,
  limit = 6,
): ProcessMiningBenchmarkSnapshot[] {
  const base = history ?? [];
  return [...base, next].slice(-limit);
}

function roundDelta(value: number): number {
  return Math.round(value * 10) / 10;
}

export function compareBenchmarkSnapshots(
  previous: ProcessMiningBenchmarkSnapshot | undefined,
  current: ProcessMiningBenchmarkSnapshot,
): BenchmarkSnapshotDelta | null {
  if (!previous) return null;

  const domainMap = new Map(previous.domainScores.map(item => [item.key, item]));
  const dimensionMap = new Map(previous.dimensionScores.map(item => [item.key, item]));

  const changedDomains = current.domainScores
    .map(item => {
      const prev = domainMap.get(item.key);
      const delta = roundDelta(item.score - (prev?.score ?? 0));
      return prev ? {
        label: item.label,
        previousScore: prev.score,
        currentScore: item.score,
        delta,
      } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter(item => item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const changedDimensions = current.dimensionScores
    .map(item => {
      const prev = dimensionMap.get(item.key);
      const delta = roundDelta(item.score - (prev?.score ?? 0));
      return prev ? {
        label: item.label,
        previousScore: prev.score,
        currentScore: item.score,
        delta,
      } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter(item => item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const scoreDelta = roundDelta(current.overallScore - previous.overallScore);
  const passedDelta = current.passedCount - previous.passedCount;
  const attentionDelta = current.attentionCount - previous.attentionCount;
  const failedDelta = current.failedCount - previous.failedCount;

  const parts: string[] = [];
  if (scoreDelta !== 0) {
    parts.push(scoreDelta > 0 ? `Gesamtscore +${scoreDelta}` : `Gesamtscore ${scoreDelta}`);
  }
  if (failedDelta !== 0) {
    parts.push(failedDelta > 0 ? `${failedDelta} kritische Fälle mehr` : `${Math.abs(failedDelta)} kritische Fälle weniger`);
  }
  if (attentionDelta !== 0) {
    parts.push(attentionDelta > 0 ? `${attentionDelta} Beobachtungsfälle mehr` : `${Math.abs(attentionDelta)} Beobachtungsfälle weniger`);
  }
  if (passedDelta !== 0) {
    parts.push(passedDelta > 0 ? `${passedDelta} stabile Fälle mehr` : `${Math.abs(passedDelta)} stabile Fälle weniger`);
  }

  return {
    scoreDelta,
    passedDelta,
    attentionDelta,
    failedDelta,
    summary: parts.length > 0 ? parts.join(' · ') : 'Gegenüber dem letzten Benchmark-Lauf gibt es keine sichtbare Veränderung.',
    changedDomains,
    changedDimensions,
  };
}
