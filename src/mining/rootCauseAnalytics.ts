import type { EventLogEvent } from '../domain/process';

export type RootCauseThresholdMode = 'p90' | 'p95' | 'custom';

export interface RootCauseSignal {
  attributeKey: string;
  attributeValue: string;
  countAll: number;
  pctAll: number;
  countSlow: number;
  pctSlow: number;
  lift: number;
  diffPct: number;
  exampleCaseId?: string;
}

export interface RootCauseResult {
  totalCases: number;
  analyzedCases: number;
  slowCases: number;
  thresholdMs: number;
  signals: RootCauseSignal[];
  warnings: string[];
}

function safeParse(ts: string): number | null {
  const n = Date.parse(ts);
  return isNaN(n) ? null : n;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeRootCauseSignals(params: {
  events: EventLogEvent[];
  thresholdMode?: RootCauseThresholdMode;
  customThresholdMs?: number;
  maxCases?: number;
  minSupportCases?: number;
  maxSignals?: number;
  maxValuesPerKey?: number;
  timeMode?: string;
}): RootCauseResult {
  const {
    events,
    thresholdMode = 'p90',
    customThresholdMs,
    maxCases = 5000,
    minSupportCases = 10,
    maxSignals = 30,
    maxValuesPerKey = 20,
    timeMode,
  } = params;

  const warnings: string[] = [];

  if (timeMode !== 'real') {
    throw new Error(
      'computeRootCause: Dataset hat kein explizit gültiges timeMode="real". ' +
      (timeMode
        ? `Empfangener Wert: "${timeMode}" – nur "real" ist zulässig.`
        : 'Fehlendes timeMode-Feld. Legacy-Dataset wird blockiert.') +
      ' Bitte das Dataset neu importieren.'
    );
  }

  const caseMap = new Map<string, EventLogEvent[]>();
  for (const ev of events) {
    let arr = caseMap.get(ev.caseId);
    if (!arr) { arr = []; caseMap.set(ev.caseId, arr); }
    arr.push(ev);
  }

  const totalCases = caseMap.size;
  let caseIds = Array.from(caseMap.keys());

  if (caseIds.length > maxCases) {
    caseIds = caseIds.slice(0, maxCases);
    warnings.push(
      `Anzeigestichprobe: ${maxCases.toLocaleString('de-DE')} von ${totalCases.toLocaleString('de-DE')} Cases für diese Ansicht analysiert. ` +
      'Das Dataset ist vollständig und unverändert. Ursachensignale sind Näherungswerte.'
    );
  }

  const analyzedCases = caseIds.length;

  const durationsMap = new Map<string, number>();
  const caseAttrsMap = new Map<string, Map<string, string>>();
  let hasAnyAttrs = false;
  let hasAnyResource = false;

  for (const caseId of caseIds) {
    const evList = caseMap.get(caseId)!.slice().sort((a, b) => {
      const ta = safeParse(a.timestamp) ?? 0;
      const tb = safeParse(b.timestamp) ?? 0;
      return ta - tb;
    });

    const firstTs = safeParse(evList[0].timestamp);
    const lastTs = safeParse(evList[evList.length - 1].timestamp);
    if (firstTs !== null && lastTs !== null && lastTs - firstTs >= 0) {
      durationsMap.set(caseId, lastTs - firstTs);
    }

    const attrs = new Map<string, string>();

    for (const ev of evList) {
      if (ev.attributes) {
        for (const [k, v] of Object.entries(ev.attributes)) {
          if (v != null && String(v).trim() !== '' && !attrs.has(k)) {
            attrs.set(k, String(v));
            hasAnyAttrs = true;
          }
        }
      }
    }

    const firstResource = evList.find((e) => e.resource && e.resource.trim() !== '')?.resource;
    const lastResource = [...evList].reverse().find((e) => e.resource && e.resource.trim() !== '')?.resource;

    if (firstResource) {
      attrs.set('first_resource', firstResource.trim());
      hasAnyResource = true;
    }
    if (lastResource) {
      attrs.set('last_resource', lastResource.trim());
      hasAnyResource = true;
    }

    caseAttrsMap.set(caseId, attrs);
  }

  if (!hasAnyAttrs && !hasAnyResource) {
    warnings.push('Keine Attribute/Resource verfügbar. Ursachenanalyse benötigt Event-Attribute oder eine Resource-Spalte.');
  }

  const casesWithDuration = caseIds.filter((id) => durationsMap.has(id));
  const sortedDurations = casesWithDuration.map((id) => durationsMap.get(id)!).sort((a, b) => a - b);

  if (sortedDurations.length === 0) {
    warnings.push('Keine verwertbaren Zeitstempel: Ursachenanalyse über Durchlaufzeiten nicht möglich.');
    return { totalCases, analyzedCases, slowCases: 0, thresholdMs: 0, signals: [], warnings };
  }

  let thresholdMs = 0;
  if (thresholdMode === 'custom') {
    if (customThresholdMs && customThresholdMs > 0) {
      thresholdMs = customThresholdMs;
    } else {
      thresholdMs = quantile(sortedDurations, 0.9);
      warnings.push('Kein gültiger Custom-Schwellenwert angegeben, Fallback auf P90.');
    }
  } else if (thresholdMode === 'p95') {
    thresholdMs = quantile(sortedDurations, 0.95);
  } else {
    thresholdMs = quantile(sortedDurations, 0.9);
  }

  const slowCaseIds = new Set(casesWithDuration.filter((id) => (durationsMap.get(id) ?? 0) >= thresholdMs));
  const slowCases = slowCaseIds.size;

  if (slowCases === 0) {
    warnings.push('Keine „langsamen" Cases gefunden (Schwelle oder Zeitdaten prüfen).');
    return { totalCases, analyzedCases, slowCases, thresholdMs, signals: [], warnings };
  }

  const allCount = new Map<string, number>();
  const slowCount = new Map<string, number>();
  const exampleCase = new Map<string, string>();

  for (const caseId of caseIds) {
    const attrs = caseAttrsMap.get(caseId);
    if (!attrs) continue;
    const isSlow = slowCaseIds.has(caseId);
    for (const [k, v] of attrs.entries()) {
      const key = `${k}\x00${v}`;
      allCount.set(key, (allCount.get(key) ?? 0) + 1);
      if (!exampleCase.has(key)) exampleCase.set(key, caseId);
      if (isSlow) {
        slowCount.set(key, (slowCount.get(key) ?? 0) + 1);
      }
    }
  }

  const keyValueCounts = new Map<string, Map<string, number>>();
  for (const [compKey, cnt] of allCount.entries()) {
    const sep = compKey.indexOf('\x00');
    const attrKey = compKey.slice(0, sep);
    if (!keyValueCounts.has(attrKey)) keyValueCounts.set(attrKey, new Map());
    keyValueCounts.get(attrKey)!.set(compKey, cnt);
  }

  const allowedKeys = new Set<string>();
  for (const [, valMap] of keyValueCounts.entries()) {
    const sorted = Array.from(valMap.entries()).sort((a, b) => b[1] - a[1]);
    for (const [k] of sorted.slice(0, maxValuesPerKey)) {
      allowedKeys.add(k);
    }
  }

  const signals: RootCauseSignal[] = [];

  for (const compKey of allowedKeys) {
    const cnt = allCount.get(compKey) ?? 0;
    if (cnt < minSupportCases) continue;

    const pctAll = cnt / analyzedCases;
    if (pctAll <= 0) continue;

    const slowCnt = slowCount.get(compKey) ?? 0;
    const pctSlow = slowCases > 0 ? slowCnt / slowCases : 0;
    const lift = pctSlow / pctAll;
    const diffPct = pctSlow - pctAll;

    const sep = compKey.indexOf('\x00');
    signals.push({
      attributeKey: compKey.slice(0, sep),
      attributeValue: compKey.slice(sep + 1),
      countAll: cnt,
      pctAll,
      countSlow: slowCnt,
      pctSlow,
      lift,
      diffPct,
      exampleCaseId: exampleCase.get(compKey),
    });
  }

  signals.sort((a, b) => {
    if (b.lift !== a.lift) return b.lift - a.lift;
    if (b.diffPct !== a.diffPct) return b.diffPct - a.diffPct;
    return b.countSlow - a.countSlow;
  });

  return {
    totalCases,
    analyzedCases,
    slowCases,
    thresholdMs,
    signals: signals.slice(0, maxSignals),
    warnings,
  };
}
