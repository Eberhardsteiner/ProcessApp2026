import type { EventLogEvent } from '../domain/process';
import { normalizeActivityKey } from './processMiningLite';

export interface DurationBucket {
  label: string;
  minMs: number;
  maxMs?: number;
}

export interface CaseDurationRow {
  caseId: string;
  durationMs: number;
  startTs: string;
  endTs: string;
}

export interface CaseDurationStats {
  totalCases: number;
  analyzedCases: number;
  medianMs: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  buckets: Array<{ label: string; count: number; pct: number }>;
  worstCases: CaseDurationRow[];
  warnings: string[];
  durationsMs: number[];
  p25Ms: number | null;
  p75Ms: number | null;
  iqrMs: number | null;
  outlierUpperFenceMs: number | null;
  outlierCount: number;
  outlierPct: number;
}

export interface TransitionPerfRow {
  fromKey: string;
  toKey: string;
  fromLabel: string;
  toLabel: string;
  count: number;
  medianMs: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  exampleCaseId?: string;
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function median(sorted: number[]): number | null {
  return quantile(sorted, 0.5);
}

function safeParseTs(ts: string): number | null {
  const v = Date.parse(ts);
  return isNaN(v) ? null : v;
}

function defaultBuckets(): DurationBucket[] {
  const H = 3_600_000;
  const D = 86_400_000;
  return [
    { label: '< 1h', minMs: 0, maxMs: H },
    { label: '1 – 4h', minMs: H, maxMs: 4 * H },
    { label: '4 – 24h', minMs: 4 * H, maxMs: D },
    { label: '1 – 3d', minMs: D, maxMs: 3 * D },
    { label: '3 – 7d', minMs: 3 * D, maxMs: 7 * D },
    { label: '> 7d', minMs: 7 * D },
  ];
}

export function computeCaseDurationStats(params: {
  events: EventLogEvent[];
  maxCases?: number;
  buckets?: DurationBucket[];
  timeMode?: string;
}): CaseDurationStats {
  const { events, maxCases = 5000, timeMode } = params;
  const buckets = params.buckets ?? defaultBuckets();
  const warnings: string[] = [];

  if (timeMode !== 'real') {
    throw new Error(
      'computeCaseDurationStats: Dataset hat kein explizit gültiges timeMode="real". ' +
      (timeMode
        ? `Empfangener Wert: "${timeMode}" – nur "real" ist zulässig.`
        : 'Fehlendes timeMode-Feld. Legacy-Dataset wird blockiert.') +
      ' Bitte das Dataset neu importieren.'
    );
  }

  const byCase = new Map<string, EventLogEvent[]>();
  for (const ev of events) {
    let arr = byCase.get(ev.caseId);
    if (!arr) { arr = []; byCase.set(ev.caseId, arr); }
    arr.push(ev);
  }
  const totalCases = byCase.size;

  let caseIds = [...byCase.keys()];
  if (caseIds.length > maxCases) {
    warnings.push(
      `Anzeigestichprobe: ${maxCases.toLocaleString('de-DE')} von ${caseIds.length.toLocaleString('de-DE')} Cases für diese Ansicht berechnet. ` +
      'Das zugrunde liegende Dataset ist vollständig und unverändert. Kennzahlen sind Näherungswerte der Stichprobe.'
    );
    caseIds = caseIds.slice(0, maxCases);
  }

  const rows: CaseDurationRow[] = [];
  let unparseable = 0;

  for (const caseId of caseIds) {
    const evs = byCase.get(caseId)!;
    evs.sort((a, b) => a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0);
    const firstTs = safeParseTs(evs[0].timestamp);
    const lastTs = safeParseTs(evs[evs.length - 1].timestamp);
    if (firstTs === null || lastTs === null) { unparseable++; continue; }
    const durationMs = lastTs - firstTs;
    if (durationMs < 0) continue;
    rows.push({ caseId, durationMs, startTs: evs[0].timestamp, endTs: evs[evs.length - 1].timestamp });
  }

  if (unparseable > 0) {
    warnings.push(
      `${unparseable} Cases mit nicht parsbaren Timestamps konnten nicht analysiert werden. ` +
      'Das importierte Dataset sollte ausschließlich parsbare ISO-8601-Zeitstempel enthalten. ' +
      'Bitte das Quell-Log prüfen und ggf. neu importieren.'
    );
  }

  const sorted = rows.map(r => r.durationMs).sort((a, b) => a - b);
  const analyzedCases = sorted.length;

  const p25 = quantile(sorted, 0.25);
  const p75 = quantile(sorted, 0.75);
  const iqr = (p25 !== null && p75 !== null) ? (p75 - p25) : null;
  const upperFence = (iqr !== null && p75 !== null) ? (p75 + 1.5 * iqr) : null;
  const outlierCount = (upperFence !== null) ? sorted.filter(v => v > upperFence).length : 0;
  const outlierPct = analyzedCases > 0 ? outlierCount / analyzedCases : 0;

  const bucketCounts = buckets.map(b => ({ label: b.label, count: 0, pct: 0 }));
  for (const dur of sorted) {
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      const inRange = dur >= b.minMs && (b.maxMs === undefined || dur < b.maxMs);
      if (inRange) { bucketCounts[i].count++; break; }
    }
  }
  for (const bc of bucketCounts) {
    bc.pct = analyzedCases > 0 ? bc.count / analyzedCases : 0;
  }

  const worstCases = [...rows].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10);

  return {
    totalCases,
    analyzedCases,
    medianMs: median(sorted),
    p90Ms: quantile(sorted, 0.9),
    p95Ms: quantile(sorted, 0.95),
    buckets: bucketCounts,
    worstCases,
    warnings,
    durationsMs: sorted,
    p25Ms: p25,
    p75Ms: p75,
    iqrMs: iqr,
    outlierUpperFenceMs: upperFence,
    outlierCount,
    outlierPct,
  };
}

export function computeTransitionPerformance(params: {
  events: EventLogEvent[];
  mode: 'activity' | 'step';
  activityKeyToStepId?: Map<string, string>;
  stepIdToLabel?: Map<string, string>;
  activityKeyToLabel?: Map<string, string>;
  maxCases?: number;
  maxDeltasPerEdge?: number;
  timeMode?: string;
}): { totalCases: number; analyzedCases: number; rows: TransitionPerfRow[]; warnings: string[] } {
  const {
    events,
    mode,
    activityKeyToStepId,
    stepIdToLabel,
    activityKeyToLabel,
    maxCases = 5000,
    maxDeltasPerEdge = 5000,
    timeMode,
  } = params;

  if (timeMode !== 'real') {
    throw new Error(
      'computeTransitionPerformance: Dataset hat kein explizit gültiges timeMode="real". ' +
      (timeMode
        ? `Empfangener Wert: "${timeMode}" – nur "real" ist zulässig.`
        : 'Fehlendes timeMode-Feld. Legacy-Dataset wird blockiert.') +
      ' Bitte das Dataset neu importieren.'
    );
  }

  const warnings: string[] = [];

  const byCase = new Map<string, EventLogEvent[]>();
  for (const ev of events) {
    let arr = byCase.get(ev.caseId);
    if (!arr) { arr = []; byCase.set(ev.caseId, arr); }
    arr.push(ev);
  }
  const totalCases = byCase.size;

  let caseIds = [...byCase.keys()];
  if (caseIds.length > maxCases) {
    warnings.push(
      `Anzeigestichprobe: ${maxCases.toLocaleString('de-DE')} von ${caseIds.length.toLocaleString('de-DE')} Cases für Transition Performance berechnet. ` +
      'Das Dataset ist vollständig und unverändert. Zeitdeltas sind Näherungswerte.'
    );
    caseIds = caseIds.slice(0, maxCases);
  }

  const edgeCounts = new Map<string, number>();
  const edgeDeltas = new Map<string, number[]>();
  const edgeExampleCaseId = new Map<string, { caseId: string; maxDelta: number }>();
  let analyzedCases = 0;

  const toKey = (ev: EventLogEvent): string => {
    const actKey = normalizeActivityKey(ev.activity);
    if (mode === 'step') {
      const stepId = activityKeyToStepId?.get(actKey);
      return stepId ?? `unmapped:${actKey}`;
    }
    return actKey;
  };

  for (const caseId of caseIds) {
    const evs = byCase.get(caseId)!;
    evs.sort((a, b) => {
      const ta = safeParseTs(a.timestamp);
      const tb = safeParseTs(b.timestamp);
      if (ta !== null && tb !== null) return ta - tb;
      return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0;
    });

    const seq: Array<{ key: string; ts: number | null }> = [];
    for (const ev of evs) {
      const key = toKey(ev);
      if (seq.length > 0 && seq[seq.length - 1].key === key) continue;
      seq.push({ key, ts: safeParseTs(ev.timestamp) });
    }

    if (seq.length < 2) continue;
    analyzedCases++;

    for (let i = 0; i < seq.length - 1; i++) {
      const edgeKey = `${seq[i].key}\x00${seq[i + 1].key}`;
      edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) ?? 0) + 1);

      if (seq[i].ts !== null && seq[i + 1].ts !== null) {
        const delta = seq[i + 1].ts! - seq[i].ts!;
        if (delta >= 0) {
          let deltas = edgeDeltas.get(edgeKey);
          if (!deltas) { deltas = []; edgeDeltas.set(edgeKey, deltas); }
          if (deltas.length < maxDeltasPerEdge) deltas.push(delta);

          const ex = edgeExampleCaseId.get(edgeKey);
          if (!ex || delta > ex.maxDelta) {
            edgeExampleCaseId.set(edgeKey, { caseId, maxDelta: delta });
          }
        }
      }
    }
  }

  const toLabel = (key: string): string => {
    if (mode === 'step') {
      if (key.startsWith('unmapped:')) return `unmapped: ${key.slice(9)}`;
      return stepIdToLabel?.get(key) ?? key;
    }
    return activityKeyToLabel?.get(key) ?? key;
  };

  const rows: TransitionPerfRow[] = [];
  for (const [edgeKey, count] of edgeCounts) {
    const [fromKey, toKey2] = edgeKey.split('\x00');
    const deltas = edgeDeltas.get(edgeKey);
    let medianMs: number | null = null;
    let p90Ms: number | null = null;
    let p95Ms: number | null = null;
    let maxMs: number | null = null;

    if (deltas && deltas.length > 0) {
      const sorted = [...deltas].sort((a, b) => a - b);
      medianMs = median(sorted);
      p90Ms = quantile(sorted, 0.9);
      p95Ms = quantile(sorted, 0.95);
      maxMs = sorted[sorted.length - 1];
    }

    rows.push({
      fromKey,
      toKey: toKey2,
      fromLabel: toLabel(fromKey),
      toLabel: toLabel(toKey2),
      count,
      medianMs,
      p90Ms,
      p95Ms,
      maxMs,
      exampleCaseId: edgeExampleCaseId.get(edgeKey)?.caseId,
    });
  }

  rows.sort((a, b) => {
    const ap90 = a.p90Ms ?? -1;
    const bp90 = b.p90Ms ?? -1;
    if (bp90 !== ap90) return bp90 - ap90;
    return b.count - a.count;
  });

  return { totalCases, analyzedCases, rows, warnings };
}

export type HistogramBin = { fromMs: number; toMs: number; count: number; pct: number };

export function buildHistogramBins(valuesMs: number[], bins = 10): HistogramBin[] {
  const vals = valuesMs.filter(v => Number.isFinite(v) && v >= 0);
  if (vals.length === 0) return [];
  const min = vals[0];
  const max = vals[vals.length - 1];
  if (max === min) {
    return [{ fromMs: min, toMs: max, count: vals.length, pct: 1 }];
  }
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of vals) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  }
  return counts.map((c, i) => {
    const fromMs = min + i * width;
    const toMs = (i === bins - 1) ? max : (min + (i + 1) * width);
    return { fromMs, toMs, count: c, pct: c / vals.length };
  });
}
