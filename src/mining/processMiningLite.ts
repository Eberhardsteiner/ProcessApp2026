import type { EventLogEvent, ProcessMiningActivityMapping } from '../domain/process';
import type { CaptureDraftStep } from '../domain/capture';
import { parseCsvText } from '../import/csv';
import { normalizeCatalogToken } from '../utils/catalogAliases';

export function normalizeActivityKey(input: string): string {
  return normalizeCatalogToken(input);
}

export function detectEventLogColumns(headers: string[]): {
  caseIdCol: number;
  activityCol: number;
  timestampCol: number;
  resourceCol: number;
} {
  const normalized = headers.map((h) => h.toLowerCase().replace(/[_\s-]/g, ''));

  const findCol = (candidates: string[]): number => {
    const normalizedCandidates = candidates.map((c) => c.toLowerCase().replace(/[_\s-]/g, ''));
    for (const candidate of normalizedCandidates) {
      const index = normalized.indexOf(candidate);
      if (index !== -1) return index;
    }
    return -1;
  };

  const caseIdCol = findCol(['caseid', 'case', 'fall', 'fallid', 'instance', 'trace', 'traceid']);
  const activityCol = findCol(['activity', 'aktivitaet', 'aktivität', 'event', 'task', 'step', 'aktion']);
  const timestampCol = findCol(['timestamp', 'time', 'datetime', 'date', 'ts', 'zeit', 'zeitstempel', 'createdat', 'starttime']);
  const resourceCol = findCol(['resource', 'user', 'owner', 'actor', 'rolle', 'role']);

  return { caseIdCol, activityCol, timestampCol, resourceCol };
}

function parseDateGerman(value: string): number | null {
  const trimmed = value.trim();

  const dateTimePattern = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
  const match = trimmed.match(dateTimePattern);

  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const hour = match[4] ? parseInt(match[4], 10) : 0;
    const minute = match[5] ? parseInt(match[5], 10) : 0;
    const second = match[6] ? parseInt(match[6], 10) : 0;

    const date = new Date(year, month - 1, day, hour, minute, second);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  return null;
}

export interface CsvImportValidationError {
  type: 'missing_mandatory_field' | 'invalid_timestamp';
  rowIndex: number;
  field: 'caseId' | 'activity' | 'timestamp';
  rawValue?: string;
}

export function parseEventLogFromCsv(params: {
  csvText: string;
  columns: { caseIdCol: number; activityCol: number; timestampCol: number; resourceCol: number };
  maxEvents?: number;
}): {
  events: EventLogEvent[];
  warnings: string[];
} {
  const maxEvents = params.maxEvents ?? 200000;
  const warnings: string[] = [];
  const events: EventLogEvent[] = [];

  const parsed = parseCsvText(params.csvText);
  const { caseIdCol, activityCol, timestampCol, resourceCol } = params.columns;

  const coreColSet = new Set<number>([caseIdCol, activityCol, timestampCol]);
  if (resourceCol >= 0) coreColSet.add(resourceCol);

  const attrColIndices: number[] = [];
  for (let c = 0; c < parsed.headers.length; c++) {
    if (!coreColSet.has(c)) attrColIndices.push(c);
  }

  const maxKeysPerEvent = 20;
  const maxValueLen = 200;
  let warnedKeyLimit = false;
  let warnedValueTrunc = false;

  const validationErrors: CsvImportValidationError[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];

    const caseId = row[caseIdCol]?.trim() || '';
    const activity = row[activityCol]?.trim() || '';
    const timestampRaw = row[timestampCol]?.trim() || '';

    if (!caseId) {
      validationErrors.push({ type: 'missing_mandatory_field', rowIndex: i + 2, field: 'caseId' });
      continue;
    }
    if (!activity) {
      validationErrors.push({ type: 'missing_mandatory_field', rowIndex: i + 2, field: 'activity' });
      continue;
    }
    if (!timestampRaw) {
      validationErrors.push({ type: 'missing_mandatory_field', rowIndex: i + 2, field: 'timestamp' });
      continue;
    }

    let timestampMs = Date.parse(timestampRaw);
    if (isNaN(timestampMs)) {
      const germanMs = parseDateGerman(timestampRaw);
      if (germanMs !== null) {
        timestampMs = germanMs;
      } else {
        validationErrors.push({ type: 'invalid_timestamp', rowIndex: i + 2, field: 'timestamp', rawValue: timestampRaw });
        continue;
      }
    }

    const timestamp = new Date(timestampMs).toISOString();

    const event: EventLogEvent = {
      caseId,
      activity,
      timestamp,
    };

    if (resourceCol >= 0) {
      const resource = row[resourceCol]?.trim();
      if (resource) {
        event.resource = resource;
      }
    }

    if (attrColIndices.length > 0) {
      const attrs: Record<string, string> = {};
      let keyCount = 0;
      for (const c of attrColIndices) {
        if (keyCount >= maxKeysPerEvent) {
          if (!warnedKeyLimit) {
            warnings.push(`Attribut-Keys auf ${maxKeysPerEvent} pro Event begrenzt (weitere Spalten ignoriert).`);
            warnedKeyLimit = true;
          }
          break;
        }
        const key = parsed.headers[c]?.trim().toLowerCase();
        if (!key) continue;
        let value = row[c]?.trim() ?? '';
        if (!value) continue;
        if (value.length > maxValueLen) {
          if (!warnedValueTrunc) {
            warnings.push(`Attribut-Werte auf ${maxValueLen} Zeichen gekürzt.`);
            warnedValueTrunc = true;
          }
          value = value.slice(0, maxValueLen);
        }
        attrs[key] = value;
        keyCount++;
      }
      if (Object.keys(attrs).length > 0) {
        event.attributes = attrs;
      }
    }

    events.push(event);

    if (events.length >= maxEvents) {
      const remaining = parsed.rows.length - (i + 1);
      throw new Error(
        `Import abgebrochen: Die CSV-Datei enthält mehr als ${maxEvents.toLocaleString('de-DE')} Events (mindestens ${(events.length + remaining).toLocaleString('de-DE')} erkannt).\n` +
        'Automatisches Kürzen des Event Logs ist nicht zulässig. Ein abgeschnittenes Log ergibt ein unvollständiges Ist-Bild.\n' +
        'Bitte das Log extern vorfiltern (z.\u202fB. auf einen Zeitraum oder eine Teilmenge von Cases) und erneut importieren.'
      );
    }
  }

  if (validationErrors.length > 0) {
    const missingTs = validationErrors.filter(e => e.field === 'timestamp' && e.type === 'missing_mandatory_field');
    const invalidTs = validationErrors.filter(e => e.type === 'invalid_timestamp');
    const missingCaseId = validationErrors.filter(e => e.field === 'caseId');
    const missingActivity = validationErrors.filter(e => e.field === 'activity');

    const parts: string[] = [];
    if (missingCaseId.length > 0) {
      const rows = missingCaseId.slice(0, 3).map(e => `Zeile ${e.rowIndex}`).join(', ');
      parts.push(`${missingCaseId.length} Event(s) ohne Case-ID (${rows}${missingCaseId.length > 3 ? ', ...' : ''})`);
    }
    if (missingActivity.length > 0) {
      const rows = missingActivity.slice(0, 3).map(e => `Zeile ${e.rowIndex}`).join(', ');
      parts.push(`${missingActivity.length} Event(s) ohne Aktivität (${rows}${missingActivity.length > 3 ? ', ...' : ''})`);
    }
    if (missingTs.length > 0) {
      const rows = missingTs.slice(0, 3).map(e => `Zeile ${e.rowIndex}`).join(', ');
      parts.push(`${missingTs.length} Event(s) ohne Zeitstempel (${rows}${missingTs.length > 3 ? ', ...' : ''})`);
    }
    if (invalidTs.length > 0) {
      const samples = invalidTs.slice(0, 3).map(e => `"${e.rawValue}" (Zeile ${e.rowIndex})`).join(', ');
      parts.push(`${invalidTs.length} Event(s) mit ungültigem Zeitstempel (${samples}${invalidTs.length > 3 ? ', ...' : ''})`);
    }

    throw new Error(
      `Import abgebrochen: ${validationErrors.length} Event(s) verletzen Pflichtfelder (caseId, activity, timestamp müssen vorhanden und gültig sein).\n` +
      parts.join('\n') +
      '\nBitte korrigieren Sie die Daten und importieren Sie erneut. Kein teilbereinigtes Dataset wird gespeichert.'
    );
  }

  return { events, warnings };
}

export function buildActivityStats(
  events: EventLogEvent[],
  draftSteps: CaptureDraftStep[]
): ProcessMiningActivityMapping[] {
  const activityCounts = new Map<string, { example: string; count: number; originals: Map<string, number> }>();

  for (const event of events) {
    const key = normalizeActivityKey(event.activity);
    const existing = activityCounts.get(key);
    if (existing) {
      existing.count++;
      const originalCount = existing.originals.get(event.activity) || 0;
      existing.originals.set(event.activity, originalCount + 1);
    } else {
      const originals = new Map<string, number>();
      originals.set(event.activity, 1);
      activityCounts.set(key, { example: event.activity, count: 1, originals });
    }
  }

  const stepKeyToId = new Map<string, string>();
  for (const step of draftSteps) {
    const key = normalizeActivityKey(step.label);
    if (!stepKeyToId.has(key)) {
      stepKeyToId.set(key, step.stepId);
    } else {
      stepKeyToId.set(key, '');
    }
  }

  const mappings: ProcessMiningActivityMapping[] = [];
  for (const [activityKey, data] of activityCounts) {
    let mostCommon = data.example;
    let maxCount = 0;
    for (const [original, count] of data.originals) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = original;
      }
    }

    const mapping: ProcessMiningActivityMapping = {
      activityKey,
      example: mostCommon,
      count: data.count,
    };

    const mappedStepId = stepKeyToId.get(activityKey);
    if (mappedStepId && mappedStepId !== '') {
      mapping.stepId = mappedStepId;
    }

    mappings.push(mapping);
  }

  mappings.sort((a, b) => b.count - a.count);

  return mappings;
}

export function computeVariants(events: EventLogEvent[]): Array<{
  variant: string;
  count: number;
  share: number;
}> {
  const caseMap = new Map<string, EventLogEvent[]>();

  for (const event of events) {
    const caseEvents = caseMap.get(event.caseId) || [];
    caseEvents.push(event);
    caseMap.set(event.caseId, caseEvents);
  }

  const variantCounts = new Map<string, number>();

  for (const [, caseEvents] of caseMap) {
    caseEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const sequence: string[] = [];
    let lastKey: string | null = null;
    for (const event of caseEvents) {
      const key = normalizeActivityKey(event.activity);
      if (key !== lastKey) {
        sequence.push(key);
        lastKey = key;
      }
    }

    const variantKey = sequence.join(' → ');
    variantCounts.set(variantKey, (variantCounts.get(variantKey) || 0) + 1);
  }

  const totalCases = caseMap.size;
  const variants: Array<{ variant: string; count: number; share: number }> = [];

  for (const [variant, count] of variantCounts) {
    variants.push({
      variant,
      count,
      share: totalCases > 0 ? count / totalCases : 0,
    });
  }

  variants.sort((a, b) => b.count - a.count);

  return variants.slice(0, 10);
}

export type ConformancePatternKey = string;

export interface ConformancePattern {
  key: ConformancePatternKey;
  label: string;
  count: number;
  pct: number;
  exampleCaseIds: string[];
}

export interface ConformanceMissingStep {
  stepId: string;
  order: number;
  label: string;
  count: number;
  pct: number;
  exampleCaseIds: string[];
}

export interface ConformanceMappedVariant {
  variant: string;
  count: number;
  share: number;
  exampleCaseId: string;
}

export interface ConformanceResult {
  totalCases: number;
  exactHappyPath: { count: number; pct: number };
  casesCoverHappyPath: { count: number; pct: number };
  casesWithBacktrack: { count: number; pct: number };
  casesWithUnmapped: { count: number; pct: number };
  casesWithMissingSteps: { count: number; pct: number };
  casesWithOrderMismatch: { count: number; pct: number };
  missingStepCounts: ConformanceMissingStep[];
  missingStepCountsAll: ConformanceMissingStep[];
  deviationPatterns: ConformancePattern[];
  mappedVariants: ConformanceMappedVariant[];
}

export function computeConformance(params: {
  events: EventLogEvent[];
  activityMappings: ProcessMiningActivityMapping[];
  draftSteps: CaptureDraftStep[];
}): ConformanceResult {
  const { events, activityMappings, draftSteps } = params;

  const activityKeyToOrder = new Map<string, number>();
  const stepById = new Map<string, CaptureDraftStep>();

  for (const step of draftSteps) {
    stepById.set(step.stepId, step);
  }

  for (const mapping of activityMappings) {
    if (mapping.stepId) {
      const step = stepById.get(mapping.stepId);
      if (step) {
        activityKeyToOrder.set(mapping.activityKey, step.order);
      }
    }
  }

  const mappedActivityKeys = new Set<string>();
  for (const mapping of activityMappings) {
    if (mapping.stepId && stepById.has(mapping.stepId)) {
      mappedActivityKeys.add(mapping.activityKey);
    }
  }

  const expectedSteps = draftSteps.slice().sort((a, b) => a.order - b.order);
  const expectedOrders = expectedSteps.map((s) => s.order);

  const caseMap = new Map<string, EventLogEvent[]>();
  for (const event of events) {
    const caseEvents = caseMap.get(event.caseId) || [];
    caseEvents.push(event);
    caseMap.set(event.caseId, caseEvents);
  }

  let exactHappyPathCount = 0;
  let casesCoverHappyPathCount = 0;
  let casesWithBacktrackCount = 0;
  let casesWithUnmappedCount = 0;
  let casesWithMissingStepsCount = 0;
  let casesWithOrderMismatchCount = 0;

  const stepMissingCounts = new Map<string, number>();
  const stepMissingExamples = new Map<string, string[]>();
  for (const step of draftSteps) {
    stepMissingCounts.set(step.stepId, 0);
    stepMissingExamples.set(step.stepId, []);
  }

  const patternCounts = new Map<string, number>();
  const patternLabels = new Map<string, string>();
  const patternExamples = new Map<string, string[]>();

  const variantCounts = new Map<string, number>();
  const variantExamples = new Map<string, string>();

  for (const [caseId, caseEvents] of caseMap) {
    caseEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const mappedOrders: number[] = [];
    let lastOrder: number | null = null;
    let unmappedSeen = false;

    for (const event of caseEvents) {
      const key = normalizeActivityKey(event.activity);
      const order = activityKeyToOrder.get(key);
      if (order !== undefined) {
        if (order !== lastOrder) {
          mappedOrders.push(order);
          lastOrder = order;
        }
      } else if (!mappedActivityKeys.has(key)) {
        unmappedSeen = true;
      }
    }

    if (unmappedSeen) {
      casesWithUnmappedCount++;
    }

    let backtrackSeen = false;
    for (let i = 1; i < mappedOrders.length; i++) {
      if (mappedOrders[i] < mappedOrders[i - 1]) {
        backtrackSeen = true;
        break;
      }
    }

    if (backtrackSeen) {
      casesWithBacktrackCount++;
    }

    let idx = 0;
    for (const order of mappedOrders) {
      if (idx < expectedOrders.length && order === expectedOrders[idx]) {
        idx++;
      }
    }
    const coversHappyPath = idx === expectedOrders.length;

    if (coversHappyPath) {
      casesCoverHappyPathCount++;
    }

    const isExact =
      mappedOrders.length === expectedOrders.length &&
      mappedOrders.every((o, i) => o === expectedOrders[i]) &&
      !unmappedSeen;

    if (isExact) {
      exactHappyPathCount++;
    }

    const ordersInCase = new Set(mappedOrders);
    const missingOrders = expectedOrders.filter((o) => !ordersInCase.has(o));

    const missingCount = missingOrders.length;
    if (missingCount > 0) casesWithMissingStepsCount++;
    const orderMismatch = !coversHappyPath && missingCount === 0;
    if (orderMismatch) casesWithOrderMismatchCount++;

    for (const missingOrder of missingOrders) {
      const step = expectedSteps.find((s) => s.order === missingOrder);
      if (step) {
        stepMissingCounts.set(step.stepId, (stepMissingCounts.get(step.stepId) || 0) + 1);
        const ex = stepMissingExamples.get(step.stepId)!;
        if (ex.length < 3) ex.push(caseId);
      }
    }

    if (!isExact) {
      let bucketMissing: string;
      if (missingCount === 0) bucketMissing = '0';
      else if (missingCount === 1) bucketMissing = '1';
      else if (missingCount === 2) bucketMissing = '2';
      else bucketMissing = '3+';

      const key = `${bucketMissing}|bt:${backtrackSeen ? 1 : 0}|unmapped:${unmappedSeen ? 1 : 0}|ordermis:${orderMismatch ? 1 : 0}`;

      const parts: string[] = [];
      if (missingCount > 0) {
        parts.push(`Fehlende Schritte: ${missingCount > 2 ? '3+' : missingCount}`);
      } else {
        parts.push('Keine fehlenden Schritte');
      }
      if (orderMismatch) parts.push('Reihenfolgeabweichung');
      if (backtrackSeen) parts.push('Backtracking');
      if (unmappedSeen) parts.push('Unmapped Aktivitäten');
      const label = parts.join(' • ');

      patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
      patternLabels.set(key, label);
      const ex = patternExamples.get(key) ?? [];
      if (ex.length < 3) ex.push(caseId);
      patternExamples.set(key, ex);
    }

    const variantKey = mappedOrders.length > 0
      ? mappedOrders.map((o) => String(o)).join('→')
      : '(keine gemappten Schritte)';
    variantCounts.set(variantKey, (variantCounts.get(variantKey) || 0) + 1);
    if (!variantExamples.has(variantKey)) {
      variantExamples.set(variantKey, caseId);
    }
  }

  const totalCases = caseMap.size;

  const missingStepCounts: ConformanceMissingStep[] = [];
  for (const step of draftSteps) {
    const count = stepMissingCounts.get(step.stepId) || 0;
    missingStepCounts.push({
      stepId: step.stepId,
      order: step.order,
      label: step.label,
      count,
      pct: totalCases > 0 ? count / totalCases : 0,
      exampleCaseIds: stepMissingExamples.get(step.stepId) ?? [],
    });
  }
  missingStepCounts.sort((a, b) => b.count - a.count);

  const deviationPatterns: ConformancePattern[] = [];
  for (const [key, count] of patternCounts) {
    deviationPatterns.push({
      key,
      label: patternLabels.get(key) ?? key,
      count,
      pct: totalCases > 0 ? count / totalCases : 0,
      exampleCaseIds: patternExamples.get(key) ?? [],
    });
  }
  deviationPatterns.sort((a, b) => b.count - a.count);

  const mappedVariants: ConformanceMappedVariant[] = [];
  for (const [variant, count] of variantCounts) {
    mappedVariants.push({
      variant,
      count,
      share: totalCases > 0 ? count / totalCases : 0,
      exampleCaseId: variantExamples.get(variant) ?? '',
    });
  }
  mappedVariants.sort((a, b) => b.count - a.count);

  return {
    totalCases,
    exactHappyPath: {
      count: exactHappyPathCount,
      pct: totalCases > 0 ? exactHappyPathCount / totalCases : 0,
    },
    casesCoverHappyPath: {
      count: casesCoverHappyPathCount,
      pct: totalCases > 0 ? casesCoverHappyPathCount / totalCases : 0,
    },
    casesWithBacktrack: {
      count: casesWithBacktrackCount,
      pct: totalCases > 0 ? casesWithBacktrackCount / totalCases : 0,
    },
    casesWithUnmapped: {
      count: casesWithUnmappedCount,
      pct: totalCases > 0 ? casesWithUnmappedCount / totalCases : 0,
    },
    casesWithMissingSteps: {
      count: casesWithMissingStepsCount,
      pct: totalCases > 0 ? casesWithMissingStepsCount / totalCases : 0,
    },
    casesWithOrderMismatch: {
      count: casesWithOrderMismatchCount,
      pct: totalCases > 0 ? casesWithOrderMismatchCount / totalCases : 0,
    },
    missingStepCounts: missingStepCounts.slice(0, 10),
    missingStepCountsAll: missingStepCounts,
    deviationPatterns: deviationPatterns.slice(0, 8),
    mappedVariants: mappedVariants.slice(0, 10),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function computeStepMetrics(params: {
  events: EventLogEvent[];
  activityMappings: ProcessMiningActivityMapping[];
  draftSteps: CaptureDraftStep[];
}): Array<{
  stepId: string;
  order: number;
  label: string;
  coverageCases: number;
  coveragePct: number;
  medianSpanMs: number | null;
  medianWaitToNextMs: number | null;
}> {
  const { events, activityMappings, draftSteps } = params;

  const activityKeyToOrder = new Map<string, number>();
  const stepById = new Map<string, CaptureDraftStep>();

  for (const step of draftSteps) {
    stepById.set(step.stepId, step);
  }

  for (const mapping of activityMappings) {
    if (mapping.stepId) {
      const step = stepById.get(mapping.stepId);
      if (step) {
        activityKeyToOrder.set(mapping.activityKey, step.order);
      }
    }
  }

  const caseMap = new Map<string, EventLogEvent[]>();
  for (const event of events) {
    const caseEvents = caseMap.get(event.caseId) || [];
    caseEvents.push(event);
    caseMap.set(event.caseId, caseEvents);
  }

  const stepMetricsData = new Map<
    number,
    {
      stepId: string;
      label: string;
      cases: Set<string>;
      spans: number[];
      waits: number[];
    }
  >();

  for (const step of draftSteps) {
    stepMetricsData.set(step.order, {
      stepId: step.stepId,
      label: step.label,
      cases: new Set(),
      spans: [],
      waits: [],
    });
  }

  for (const [caseId, caseEvents] of caseMap) {
    caseEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const orderTimestamps = new Map<number, number[]>();

    for (const event of caseEvents) {
      const key = normalizeActivityKey(event.activity);
      const order = activityKeyToOrder.get(key);
      if (order !== undefined) {
        const timestamps = orderTimestamps.get(order) || [];
        timestamps.push(new Date(event.timestamp).getTime());
        orderTimestamps.set(order, timestamps);
      }
    }

    const sortedOrders = Array.from(orderTimestamps.keys()).sort((a, b) => a - b);

    for (let i = 0; i < sortedOrders.length; i++) {
      const order = sortedOrders[i];
      const timestamps = orderTimestamps.get(order)!;
      let stepStart = Number.POSITIVE_INFINITY;
      let stepEnd = Number.NEGATIVE_INFINITY;
      for (const t of timestamps) {
        if (t < stepStart) stepStart = t;
        if (t > stepEnd) stepEnd = t;
      }
      if (!Number.isFinite(stepStart) || !Number.isFinite(stepEnd)) continue;
      const spanMs = stepEnd - stepStart;

      const data = stepMetricsData.get(order);
      if (data) {
        data.cases.add(caseId);
        data.spans.push(spanMs);

        if (i + 1 < sortedOrders.length) {
          const nextOrder = sortedOrders[i + 1];
          const nextTimestamps = orderTimestamps.get(nextOrder)!;
          let nextStepStart = Number.POSITIVE_INFINITY;
          for (const t of nextTimestamps) {
            if (t < nextStepStart) nextStepStart = t;
          }
          if (!Number.isFinite(nextStepStart)) continue;
          const waitMs = nextStepStart - stepEnd;
          if (waitMs >= 0) {
            data.waits.push(waitMs);
          }
        }
      }
    }
  }

  const totalCases = caseMap.size;
  const results: Array<{
    stepId: string;
    order: number;
    label: string;
    coverageCases: number;
    coveragePct: number;
    medianSpanMs: number | null;
    medianWaitToNextMs: number | null;
  }> = [];

  for (const step of draftSteps) {
    const data = stepMetricsData.get(step.order);
    if (data) {
      results.push({
        stepId: data.stepId,
        order: step.order,
        label: data.label,
        coverageCases: data.cases.size,
        coveragePct: totalCases > 0 ? data.cases.size / totalCases : 0,
        medianSpanMs: median(data.spans),
        medianWaitToNextMs: median(data.waits),
      });
    }
  }

  results.sort((a, b) => a.order - b.order);

  return results;
}

export interface StepEnhancementMetric {
  stepId: string;
  order: number;
  label: string;

  caseCount: number;
  eventCount: number;
  caseCoverage: number;

  medianSpanMs: number | null;
  medianWaitToNextMs: number | null;

  reworkCaseCount: number;
  reworkPct: number;

  exampleCaseId?: string;
  exampleWaitCaseId?: string;
  exampleSpanCaseId?: string;
  exampleReworkCaseId?: string;
}

export function computeStepEnhancement(params: {
  events: EventLogEvent[];
  draftSteps: CaptureDraftStep[];
  activityMappings: ProcessMiningActivityMapping[];
  timeMode: string;
}): StepEnhancementMetric[] {
  const { events, draftSteps, activityMappings, timeMode } = params;

  const stepById = new Map<string, CaptureDraftStep>();
  for (const step of draftSteps) {
    stepById.set(step.stepId, step);
  }

  const activityKeyToStepId = new Map<string, string>();
  for (const mapping of activityMappings) {
    if (mapping.stepId && stepById.has(mapping.stepId)) {
      activityKeyToStepId.set(mapping.activityKey, mapping.stepId);
    }
  }

  const caseMap = new Map<string, EventLogEvent[]>();
  for (const event of events) {
    const caseEvents = caseMap.get(event.caseId);
    if (caseEvents) {
      caseEvents.push(event);
    } else {
      caseMap.set(event.caseId, [event]);
    }
  }

  const stepData = new Map<
    string,
    {
      caseIds: Set<string>;
      totalEvents: number;
      spans: number[];
      waits: number[];
      reworkCases: Set<string>;
      maxWaitCaseId: string | null;
      maxWait: number;
      maxSpanCaseId: string | null;
      maxSpan: number;
      maxReworkCaseId: string | null;
      maxRework: number;
    }
  >();

  for (const step of draftSteps) {
    stepData.set(step.stepId, {
      caseIds: new Set(),
      totalEvents: 0,
      spans: [],
      waits: [],
      reworkCases: new Set(),
      maxWaitCaseId: null,
      maxWait: -1,
      maxSpanCaseId: null,
      maxSpan: -1,
      maxReworkCaseId: null,
      maxRework: -1,
    });
  }

  const totalCases = caseMap.size;

  for (const [caseId, caseEvents] of caseMap) {
    caseEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const stepOccurrences = new Map<string, { count: number; firstTs: number; lastTs: number }>();

    for (const event of caseEvents) {
      const key = normalizeActivityKey(event.activity);
      const stepId = activityKeyToStepId.get(key);
      if (!stepId) continue;

      const tsMs = new Date(event.timestamp).getTime();
      const existing = stepOccurrences.get(stepId);
      if (existing) {
        existing.count++;
        if (tsMs < existing.firstTs) existing.firstTs = tsMs;
        if (tsMs > existing.lastTs) existing.lastTs = tsMs;
      } else {
        stepOccurrences.set(stepId, { count: 1, firstTs: tsMs, lastTs: tsMs });
      }
    }

    for (const [stepId, occ] of stepOccurrences) {
      const data = stepData.get(stepId);
      if (!data) continue;

      data.caseIds.add(caseId);
      data.totalEvents += occ.count;

      if (occ.count >= 2) {
        data.reworkCases.add(caseId);
        if (occ.count > data.maxRework) {
          data.maxRework = occ.count;
          data.maxReworkCaseId = caseId;
        }
      }

      if (timeMode === 'real') {
        const spanMs = occ.lastTs - occ.firstTs;
        data.spans.push(spanMs);
        if (spanMs > data.maxSpan) {
          data.maxSpan = spanMs;
          data.maxSpanCaseId = caseId;
        }
      }
    }

    if (timeMode === 'real') {
      const stepSequence: Array<{ stepId: string; lastTs: number }> = [];
      const stepLastTs = new Map<string, number>();

      for (const event of caseEvents) {
        const key = normalizeActivityKey(event.activity);
        const stepId = activityKeyToStepId.get(key);
        if (!stepId) continue;
        const tsMs = new Date(event.timestamp).getTime();
        stepLastTs.set(stepId, Math.max(stepLastTs.get(stepId) ?? -Infinity, tsMs));
      }

      const seenInSeq = new Set<string>();
      for (const event of caseEvents) {
        const key = normalizeActivityKey(event.activity);
        const stepId = activityKeyToStepId.get(key);
        if (!stepId) continue;
        if (!seenInSeq.has(stepId)) {
          seenInSeq.add(stepId);
          stepSequence.push({ stepId, lastTs: stepLastTs.get(stepId)! });
        }
      }

      for (let i = 0; i < stepSequence.length - 1; i++) {
        const current = stepSequence[i];
        const next = stepSequence[i + 1];

        const nextFirstTs = (() => {
          for (const event of caseEvents) {
            const key = normalizeActivityKey(event.activity);
            const sid = activityKeyToStepId.get(key);
            if (sid === next.stepId) {
              return new Date(event.timestamp).getTime();
            }
          }
          return null;
        })();

        if (nextFirstTs === null) continue;

        const waitMs = nextFirstTs - current.lastTs;
        if (waitMs >= 0) {
          const data = stepData.get(current.stepId);
          if (data) {
            data.waits.push(waitMs);
            if (waitMs > data.maxWait) {
              data.maxWait = waitMs;
              data.maxWaitCaseId = caseId;
            }
          }
        }
      }
    }
  }

  const results: StepEnhancementMetric[] = [];

  for (const step of draftSteps) {
    const data = stepData.get(step.stepId);
    if (!data) continue;

    const caseCount = data.caseIds.size;

    let exampleCaseId: string | undefined;
    if (timeMode === 'real' && data.maxWaitCaseId) {
      exampleCaseId = data.maxWaitCaseId;
    } else if (timeMode === 'real' && data.maxSpanCaseId) {
      exampleCaseId = data.maxSpanCaseId;
    } else if (data.maxReworkCaseId) {
      exampleCaseId = data.maxReworkCaseId;
    } else if (caseCount > 0) {
      exampleCaseId = Array.from(data.caseIds)[0];
    }

    results.push({
      stepId: step.stepId,
      order: step.order,
      label: step.label,
      caseCount,
      eventCount: data.totalEvents,
      caseCoverage: totalCases > 0 ? caseCount / totalCases : 0,
      medianSpanMs: timeMode === 'real' ? median(data.spans) : null,
      medianWaitToNextMs: timeMode === 'real' ? median(data.waits) : null,
      reworkCaseCount: data.reworkCases.size,
      reworkPct: caseCount > 0 ? data.reworkCases.size / caseCount : 0,
      exampleCaseId,
      exampleWaitCaseId: timeMode === 'real' ? (data.maxWaitCaseId ?? undefined) : undefined,
      exampleSpanCaseId: timeMode === 'real' ? (data.maxSpanCaseId ?? undefined) : undefined,
      exampleReworkCaseId: data.maxReworkCaseId ?? undefined,
    });
  }

  results.sort((a, b) => a.order - b.order);

  return results;
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function buildCaseIndex(events: EventLogEvent[]): {
  caseIds: string[];
  cases: Map<string, EventLogEvent[]>;
  totalCases: number;
} {
  const cases = new Map<string, EventLogEvent[]>();

  for (const event of events) {
    const caseEvents = cases.get(event.caseId);
    if (caseEvents) {
      caseEvents.push(event);
    } else {
      cases.set(event.caseId, [event]);
    }
  }

  for (const [, caseEvents] of cases) {
    caseEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  const caseIds = Array.from(cases.keys()).sort();

  return { caseIds, cases, totalCases: cases.size };
}

export function computeEventLogQuality(params: {
  events: EventLogEvent[];
  activityMappings: ProcessMiningActivityMapping[];
}): {
  totalEvents: number;
  totalCases: number;
  activitiesDistinct: number;
  medianEventsPerCase: number | null;
  p90EventsPerCase: number | null;
  medianCaseDurationMs: number | null;
  p90CaseDurationMs: number | null;
  duplicateEvents: number;
  duplicatePct: number;
  unmappedEventsPct: number;
} {
  const { events, activityMappings } = params;

  const mappedKeys = new Set<string>();
  for (const m of activityMappings) {
    if (m.stepId) {
      mappedKeys.add(m.activityKey);
    }
  }

  const caseMap = new Map<string, EventLogEvent[]>();
  for (const event of events) {
    const caseEvents = caseMap.get(event.caseId);
    if (caseEvents) {
      caseEvents.push(event);
    } else {
      caseMap.set(event.caseId, [event]);
    }
  }

  const eventsPerCase: number[] = [];
  const caseDurationsMs: number[] = [];
  let duplicateEvents = 0;
  let unmappedCount = 0;

  for (const [, caseEvents] of caseMap) {
    eventsPerCase.push(caseEvents.length);

    const sorted = [...caseEvents].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (sorted.length >= 2) {
      const first = new Date(sorted[0].timestamp).getTime();
      const last = new Date(sorted[sorted.length - 1].timestamp).getTime();
      caseDurationsMs.push(last - first);
    }

    const seen = new Set<string>();
    for (const ev of caseEvents) {
      const key = `${ev.caseId}::${normalizeActivityKey(ev.activity)}::${ev.timestamp}`;
      if (seen.has(key)) {
        duplicateEvents++;
      } else {
        seen.add(key);
      }
    }
  }

  for (const ev of events) {
    const key = normalizeActivityKey(ev.activity);
    if (!mappedKeys.has(key)) {
      unmappedCount++;
    }
  }

  eventsPerCase.sort((a, b) => a - b);
  caseDurationsMs.sort((a, b) => a - b);

  const totalEvents = events.length;
  const totalCases = caseMap.size;
  const activitiesDistinct = new Set(events.map((e) => normalizeActivityKey(e.activity))).size;

  return {
    totalEvents,
    totalCases,
    activitiesDistinct,
    medianEventsPerCase: quantile(eventsPerCase, 0.5),
    p90EventsPerCase: quantile(eventsPerCase, 0.9),
    medianCaseDurationMs: quantile(caseDurationsMs, 0.5),
    p90CaseDurationMs: quantile(caseDurationsMs, 0.9),
    duplicateEvents,
    duplicatePct: totalEvents > 0 ? duplicateEvents / totalEvents : 0,
    unmappedEventsPct: totalEvents > 0 ? unmappedCount / totalEvents : 0,
  };
}

export function formatDurationShort(ms?: number | null): string {
  if (ms === null || ms === undefined) return '-';

  const minutes = ms / (1000 * 60);
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }

  const days = ms / (1000 * 60 * 60 * 24);
  return `${Math.round(days)}d`;
}
