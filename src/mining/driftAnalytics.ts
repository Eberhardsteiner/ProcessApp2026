import type { EventLogEvent, ProcessMiningActivityMapping } from '../domain/process';
import type { CaptureDraftStep } from '../domain/capture';
import { normalizeActivityKey } from './processMiningLite';

export type DriftCompareMode = 'activity' | 'step';

export interface DriftDistributionRow {
  key: string;
  count: number;
  share: number;
}

export interface DriftKeyCoverageRow {
  key: string;
  label: string;
  caseCount: number;
  pctCases: number;
}

export interface DriftProfile {
  totalCases: number;
  analyzedCases: number;
  totalEvents: number;
  analyzedEvents: number;

  uniqueKeys: number;

  variantsTotal: number;
  topVariants: DriftDistributionRow[];
  otherVariantsShare: number;

  topKeysByCaseCoverage: DriftKeyCoverageRow[];
  otherKeysShare: number;

  durationMedianMs: number | null;
  durationP90Ms: number | null;
  durationP95Ms: number | null;

  warnings: string[];
}

export interface ShareDeltaRow {
  key: string;
  shareA: number;
  shareB: number;
  delta: number;
  countA: number;
  countB: number;
}

function safeParseMs(ts: string): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return isNaN(ms) ? null : ms;
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

export function computeDriftProfile(params: {
  events: EventLogEvent[];
  mode: DriftCompareMode;
  activityMappings?: ProcessMiningActivityMapping[];
  draftSteps?: CaptureDraftStep[];
  maxCases?: number;
  topVariants?: number;
  topKeys?: number;
  timeMode?: string;
}): DriftProfile {
  const {
    events,
    mode,
    activityMappings = [],
    draftSteps = [],
    maxCases = 5000,
    topVariants: topVariantsN = 30,
    topKeys: topKeysN = 30,
    timeMode,
  } = params;

  const warnings: string[] = [];

  if (timeMode !== 'real') {
    throw new Error(
      'computeDriftProfile: Dataset hat kein explizit gültiges timeMode="real". ' +
      (timeMode
        ? `Empfangener Wert: "${timeMode}" – nur "real" ist zulässig.`
        : 'Fehlendes timeMode-Feld. Legacy-Dataset wird blockiert.') +
      ' Bitte das Dataset neu importieren.'
    );
  }

  const caseMap = new Map<string, EventLogEvent[]>();
  for (const ev of events) {
    const cid = ev.caseId ?? '';
    if (!caseMap.has(cid)) caseMap.set(cid, []);
    caseMap.get(cid)!.push(ev);
  }

  const totalCases = caseMap.size;
  const totalEvents = events.length;

  let allCaseIds = Array.from(caseMap.keys()).sort();
  if (allCaseIds.length > maxCases) {
    allCaseIds = allCaseIds.slice(0, maxCases);
    warnings.push(
      `Anzeigestichprobe: ${maxCases.toLocaleString('de-DE')} von ${totalCases.toLocaleString('de-DE')} Cases für diese Drift-Ansicht berechnet. ` +
      'Das Dataset ist vollständig und unverändert. Drift-Werte sind Näherungswerte.'
    );
  }

  const actToStep = new Map<string, string>();
  if (mode === 'step') {
    for (const m of activityMappings) {
      if (m.stepId) {
        actToStep.set(normalizeActivityKey(m.activityKey), m.stepId);
      }
    }
  }

  const stepOrderLabel = new Map<string, string>();
  if (mode === 'step') {
    for (const s of draftSteps) {
      stepOrderLabel.set(s.stepId, `${s.order}. ${s.label}`);
    }
  }

  const variantCounts = new Map<string, number>();
  const caseCountByKey = new Map<string, number>();
  const caseDurations: number[] = [];

  let analyzedEvents = 0;

  for (const cid of allCaseIds) {
    const evs = caseMap.get(cid)!.slice().sort((a, b) => {
      const ta = safeParseMs(a.timestamp ?? '') ?? 0;
      const tb = safeParseMs(b.timestamp ?? '') ?? 0;
      return ta - tb;
    });

    analyzedEvents += evs.length;

    const rawKeys: string[] = evs.map(ev => {
      const actKey = normalizeActivityKey(ev.activity ?? '');
      if (mode === 'step') {
        const stepId = actToStep.get(actKey);
        return stepId ? stepId : `unmapped:${actKey}`;
      }
      return actKey;
    });

    const dedupKeys: string[] = [];
    for (let i = 0; i < rawKeys.length; i++) {
      if (i === 0 || rawKeys[i] !== rawKeys[i - 1]) {
        dedupKeys.push(rawKeys[i]);
      }
    }

    const variant = dedupKeys.join(' → ');
    variantCounts.set(variant, (variantCounts.get(variant) ?? 0) + 1);

    const seen = new Set<string>();
    for (const k of dedupKeys) {
      if (!seen.has(k)) {
        seen.add(k);
        caseCountByKey.set(k, (caseCountByKey.get(k) ?? 0) + 1);
      }
    }

    const timestamps = evs.map(ev => safeParseMs(ev.timestamp ?? '')).filter((t): t is number => t !== null);
    if (timestamps.length >= 2) {
      const dur = timestamps[timestamps.length - 1] - timestamps[0];
      if (dur >= 0) caseDurations.push(dur);
    }
  }

  const analyzedCases = allCaseIds.length;

  const variantsTotal = variantCounts.size;
  const sortedVariants = Array.from(variantCounts.entries()).sort((a, b) => b[1] - a[1]);
  const topVariantsList: DriftDistributionRow[] = sortedVariants.slice(0, topVariantsN).map(([key, count]) => ({
    key,
    count,
    share: analyzedCases > 0 ? count / analyzedCases : 0,
  }));
  const topVariantsShareSum = topVariantsList.reduce((s, r) => s + r.share, 0);
  const otherVariantsShare = Math.max(0, 1 - topVariantsShareSum);

  const uniqueKeys = caseCountByKey.size;
  const sortedKeys = Array.from(caseCountByKey.entries()).sort((a, b) => b[1] - a[1]);
  const topKeysList: DriftKeyCoverageRow[] = sortedKeys.slice(0, topKeysN).map(([key, count]) => {
    let label: string;
    if (mode === 'step') {
      if (key.startsWith('unmapped:')) {
        label = key;
      } else {
        label = stepOrderLabel.get(key) ?? key;
      }
    } else {
      label = key;
    }
    return {
      key,
      label,
      caseCount: count,
      pctCases: analyzedCases > 0 ? count / analyzedCases : 0,
    };
  });
  const topKeysPctSum = topKeysList.reduce((s, r) => s + r.pctCases, 0);
  const otherKeysShare = Math.min(1, Math.max(0, 1 - topKeysPctSum));

  let durationMedianMs: number | null = null;
  let durationP90Ms: number | null = null;
  let durationP95Ms: number | null = null;

  const sorted = caseDurations.slice().sort((a, b) => a - b);
  durationMedianMs = quantile(sorted, 0.5);
  durationP90Ms = quantile(sorted, 0.9);
  durationP95Ms = quantile(sorted, 0.95);

  return {
    totalCases,
    analyzedCases,
    totalEvents,
    analyzedEvents,
    uniqueKeys,
    variantsTotal,
    topVariants: topVariantsList,
    otherVariantsShare,
    topKeysByCaseCoverage: topKeysList,
    otherKeysShare,
    durationMedianMs,
    durationP90Ms,
    durationP95Ms,
    warnings,
  };
}

export function computeShareDeltas(params: {
  a: DriftDistributionRow[];
  aOtherShare: number;
  b: DriftDistributionRow[];
  bOtherShare: number;
  topUnion?: number;
}): ShareDeltaRow[] {
  const { a, aOtherShare, b, bOtherShare, topUnion = 60 } = params;

  const aSlice = a.slice(0, topUnion);
  const bSlice = b.slice(0, topUnion);

  const aMap = new Map(aSlice.map(r => [r.key, r]));
  const bMap = new Map(bSlice.map(r => [r.key, r]));

  const keys = new Set<string>([...aMap.keys(), ...bMap.keys(), '__other__']);

  const rows: ShareDeltaRow[] = Array.from(keys).map(key => {
    if (key === '__other__') {
      return {
        key,
        shareA: aOtherShare,
        shareB: bOtherShare,
        delta: bOtherShare - aOtherShare,
        countA: 0,
        countB: 0,
      };
    }
    const ra = aMap.get(key);
    const rb = bMap.get(key);
    const shareA = ra?.share ?? 0;
    const shareB = rb?.share ?? 0;
    return {
      key,
      shareA,
      shareB,
      delta: shareB - shareA,
      countA: ra?.count ?? 0,
      countB: rb?.count ?? 0,
    };
  });

  rows.sort((x, y) => {
    const absDiff = Math.abs(y.delta) - Math.abs(x.delta);
    if (absDiff !== 0) return absDiff;
    return Math.max(y.countA, y.countB) - Math.max(x.countA, x.countB);
  });

  return rows.slice(0, 40);
}

export function computeDistributionDistance(params: {
  a: DriftDistributionRow[];
  aOtherShare: number;
  b: DriftDistributionRow[];
  bOtherShare: number;
}): { overlap: number; jsd: number } {
  const { a, aOtherShare, b, bOtherShare } = params;

  const aMap = new Map(a.map(r => [r.key, r.share]));
  const bMap = new Map(b.map(r => [r.key, r.share]));
  const keys = new Set<string>([...aMap.keys(), ...bMap.keys(), '__other__']);

  const pVals: number[] = [];
  const qVals: number[] = [];

  for (const key of keys) {
    if (key === '__other__') {
      pVals.push(aOtherShare);
      qVals.push(bOtherShare);
    } else {
      pVals.push(aMap.get(key) ?? 0);
      qVals.push(bMap.get(key) ?? 0);
    }
  }

  const sumP = pVals.reduce((s, v) => s + v, 0);
  const sumQ = qVals.reduce((s, v) => s + v, 0);

  const p = sumP > 0 ? pVals.map(v => v / sumP) : pVals;
  const q = sumQ > 0 ? qVals.map(v => v / sumQ) : qVals;

  let overlap = 0;
  for (let i = 0; i < p.length; i++) {
    overlap += Math.min(p[i], q[i]);
  }

  let jsd = 0;
  for (let i = 0; i < p.length; i++) {
    const pi = p[i];
    const qi = q[i];
    const m = (pi + qi) / 2;
    if (m > 0) {
      if (pi > 0) jsd += 0.5 * pi * Math.log2(pi / m);
      if (qi > 0) jsd += 0.5 * qi * Math.log2(qi / m);
    }
  }

  return {
    overlap: Math.min(1, Math.max(0, overlap)),
    jsd: Math.min(1, Math.max(0, jsd)),
  };
}
