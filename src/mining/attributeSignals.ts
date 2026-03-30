import type { EventLogEvent } from '../domain/process';

export type AttributeSignal = {
  key: string;
  value: string;
  supportCases: number;
  supportPct: number;
  baselinePct: number;
  lift: number;
  exampleCaseId?: string;
};

export type AttributeSignalsResult = {
  signals: AttributeSignal[];
  warnings: string[];
};

export function computeAttributeSignals(params: {
  events: EventLogEvent[];
  targetCaseIds: Set<string>;
  minSupportCases?: number;
  maxKeys?: number;
  maxValuesPerKey?: number;
}): AttributeSignalsResult {
  const {
    events,
    targetCaseIds,
    minSupportCases = 10,
    maxKeys = 30,
    maxValuesPerKey = 30,
  } = params;

  const warnings: string[] = [];

  if (events.length === 0) {
    warnings.push('Keine Events vorhanden.');
    return { signals: [], warnings };
  }

  const baselineCaseIds = new Set<string>();
  const caseAttributes = new Map<string, Set<string>>();

  for (const event of events) {
    baselineCaseIds.add(event.caseId);

    if (!event.attributes || Object.keys(event.attributes).length === 0) {
      continue;
    }

    if (!caseAttributes.has(event.caseId)) {
      caseAttributes.set(event.caseId, new Set());
    }
    const caseKVs = caseAttributes.get(event.caseId)!;

    for (const [key, value] of Object.entries(event.attributes)) {
      if (value === null || value === undefined || value === '') continue;
      const valueStr = String(value);
      caseKVs.add(`${key}\0${valueStr}`);
    }
  }

  if (caseAttributes.size === 0) {
    warnings.push('Keine Attribute in den Events gefunden.');
    return { signals: [], warnings };
  }

  const actualTargetCases = new Set<string>(
    [...targetCaseIds].filter((id) => baselineCaseIds.has(id))
  );

  if (actualTargetCases.size === 0) {
    warnings.push('Keine Überschneidung zwischen targetCaseIds und vorhandenen Cases.');
    return { signals: [], warnings };
  }

  if (actualTargetCases.size < minSupportCases) {
    warnings.push(
      `Sehr wenige Ziel-Cases (${actualTargetCases.size}). Ergebnisse können unzuverlässig sein.`
    );
  }

  const keyFrequency = new Map<string, number>();
  for (const kvSet of caseAttributes.values()) {
    const keysInCase = new Set<string>();
    for (const kv of kvSet) {
      const [key] = kv.split('\0');
      keysInCase.add(key);
    }
    for (const key of keysInCase) {
      keyFrequency.set(key, (keyFrequency.get(key) || 0) + 1);
    }
  }

  const sortedKeys = [...keyFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeys)
    .map(([key]) => key);

  const allowedKeys = new Set(sortedKeys);

  const valueFrequency = new Map<string, Map<string, number>>();
  for (const kvSet of caseAttributes.values()) {
    for (const kv of kvSet) {
      const [key, value] = kv.split('\0');
      if (!allowedKeys.has(key)) continue;

      if (!valueFrequency.has(key)) {
        valueFrequency.set(key, new Map());
      }
      const valMap = valueFrequency.get(key)!;
      valMap.set(value, (valMap.get(value) || 0) + 1);
    }
  }

  const allowedKVs = new Set<string>();
  for (const [key, valMap] of valueFrequency.entries()) {
    const sortedValues = [...valMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxValuesPerKey);
    for (const [value] of sortedValues) {
      allowedKVs.add(`${key}\0${value}`);
    }
  }

  const kvBaselineCount = new Map<string, number>();
  const kvTargetCount = new Map<string, number>();
  const kvExampleCase = new Map<string, string>();

  for (const [caseId, kvSet] of caseAttributes.entries()) {
    const isTarget = actualTargetCases.has(caseId);
    for (const kv of kvSet) {
      if (!allowedKVs.has(kv)) continue;

      kvBaselineCount.set(kv, (kvBaselineCount.get(kv) || 0) + 1);
      if (isTarget) {
        kvTargetCount.set(kv, (kvTargetCount.get(kv) || 0) + 1);
        if (!kvExampleCase.has(kv)) {
          kvExampleCase.set(kv, caseId);
        }
      }
    }
  }

  const signals: AttributeSignal[] = [];
  const baselineTotal = baselineCaseIds.size;
  const targetTotal = actualTargetCases.size;

  for (const [kv, supportCases] of kvTargetCount.entries()) {
    const [key, value] = kv.split('\0');
    const baselineCases = kvBaselineCount.get(kv) || 0;

    const supportPct = supportCases / targetTotal;
    const baselinePct = baselineCases / baselineTotal;

    const lift = baselinePct > 0 ? supportPct / baselinePct : Infinity;

    signals.push({
      key,
      value,
      supportCases,
      supportPct,
      baselinePct,
      lift,
      exampleCaseId: kvExampleCase.get(kv),
    });
  }

  signals.sort((a, b) => {
    if (b.lift !== a.lift) return b.lift - a.lift;
    return b.supportCases - a.supportCases;
  });

  return {
    signals: signals.slice(0, 20),
    warnings,
  };
}
