import type { EventLogEvent, ProcessMiningActivityMapping } from '../domain/process';
import type { CaptureDraftStep } from '../domain/capture';
import { normalizeActivityKey } from './processMiningLite';

export interface AlignmentBucket {
  bucket: string;
  count: number;
  pct: number;
  exampleCaseId?: string;
}

export interface AlignmentWorstCase {
  caseId: string;
  distance: number;
  insertions: number;
  deletions: number;
  mappedSteps: number;
}

export interface AlignmentStepDeviation {
  stepId: string;
  order: number;
  label: string;
  count: number;
  pct: number;
  exampleCaseId?: string;
}

export interface AlignmentConformanceResult {
  totalCases: number;
  expectedSteps: number;
  analyzedCases: number;
  casesWithNoMappedSteps: number;
  meanDistance: number;
  medianDistance: number;
  p90Distance: number;
  distanceBuckets: AlignmentBucket[];
  worstCases: AlignmentWorstCase[];
  warnings: string[];
  casesWithInsertions: { count: number; pct: number };
  casesWithDeletions: { count: number; pct: number };
  topInsertedSteps: AlignmentStepDeviation[];
  topDeletedSteps: AlignmentStepDeviation[];
  fitnessMean: number;
  fitnessMedian: number;
  precisionMean: number;
  precisionMedian: number;
  casesWithOrderViolations: { count: number; pct: number };
  casesWithRework: { count: number; pct: number };
  topPatterns: Array<{
    signature: string;
    count: number;
    pct: number;
    exampleCaseId?: string;
    missingSteps: AlignmentStepDeviation[];
    insertedSteps: AlignmentStepDeviation[];
  }>;
  sampleDeviatingCaseIds: string[];
}

function lcsLength(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const n = a.length;
  const m = b.length;
  let prev = new Array<number>(m + 1).fill(0);
  let curr = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
    curr.fill(0);
  }
  return prev[m];
}

function lcsMatchFlags(
  expectedOrders: number[],
  mappedOrders: number[],
  maxMatrixSize: number
): { matchedExpected: boolean[]; matchedMapped: boolean[]; lcsLen: number } | null {
  const n = expectedOrders.length;
  const m = mappedOrders.length;
  if (n * m > maxMatrixSize) return null;

  const dp = new Uint32Array((n + 1) * (m + 1));
  const stride = m + 1;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (expectedOrders[i - 1] === mappedOrders[j - 1]) {
        dp[i * stride + j] = dp[(i - 1) * stride + (j - 1)] + 1;
      } else {
        const up = dp[(i - 1) * stride + j];
        const left = dp[i * stride + (j - 1)];
        dp[i * stride + j] = up > left ? up : left;
      }
    }
  }

  const lcsLen = dp[n * stride + m];
  const matchedExpected = new Array<boolean>(n).fill(false);
  const matchedMapped = new Array<boolean>(m).fill(false);

  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (expectedOrders[i - 1] === mappedOrders[j - 1]) {
      matchedExpected[i - 1] = true;
      matchedMapped[j - 1] = true;
      i--;
      j--;
    } else if (dp[(i - 1) * stride + j] >= dp[i * stride + (j - 1)]) {
      i--;
    } else {
      j--;
    }
  }

  return { matchedExpected, matchedMapped, lcsLen };
}

function safeParseTs(ts: string): number | null {
  const v = Date.parse(ts);
  return isNaN(v) ? null : v;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function computeAlignmentConformance(params: {
  events: EventLogEvent[];
  activityMappings: ProcessMiningActivityMapping[];
  draftSteps: CaptureDraftStep[];
  maxCases?: number;
  maxMatrixSize?: number;
}): AlignmentConformanceResult {
  const { events, activityMappings, draftSteps } = params;
  const maxCases = params.maxCases ?? 5000;
  const maxMatrixSize = params.maxMatrixSize ?? 20000;

  const warnings: string[] = [];

  const stepById = new Map<string, CaptureDraftStep>();
  for (const step of draftSteps) {
    stepById.set(step.stepId, step);
  }

  const activityKeyToOrder = new Map<string, number>();
  for (const mapping of activityMappings) {
    if (mapping.stepId) {
      const step = stepById.get(mapping.stepId);
      if (step) {
        activityKeyToOrder.set(mapping.activityKey, step.order);
      }
    }
  }

  const expectedSteps = draftSteps.slice().sort((a, b) => a.order - b.order);
  const expectedOrders = expectedSteps.map((s) => s.order);
  const expectedSet = new Set(expectedOrders);
  const stepByOrder = new Map<number, CaptureDraftStep>(expectedSteps.map((s) => [s.order, s]));

  const caseMap = new Map<string, EventLogEvent[]>();
  for (const event of events) {
    const caseEvents = caseMap.get(event.caseId);
    if (caseEvents) {
      caseEvents.push(event);
    } else {
      caseMap.set(event.caseId, [event]);
    }
  }

  const totalCases = caseMap.size;
  let analyzedCases = 0;
  let casesWithNoMappedSteps = 0;
  let approxWarned = false;

  const distances: number[] = [];
  const worstCasesRaw: AlignmentWorstCase[] = [];

  const bucketKeys = ['0', '1–2', '3–5', '6–10', '11+'];
  const bucketCounts = new Map<string, number>();
  const bucketExamples = new Map<string, string>();
  for (const k of bucketKeys) {
    bucketCounts.set(k, 0);
  }

  const insertedCountByOrder = new Map<number, number>();
  const deletedCountByOrder = new Map<number, number>();
  const insertedExampleByOrder = new Map<number, string>();
  const deletedExampleByOrder = new Map<number, string>();
  let casesWithInsertionsCount = 0;
  let casesWithDeletionsCount = 0;

  const fitnessValues: number[] = [];
  const precisionValues: number[] = [];
  let casesWithOrderViolationsCount = 0;
  let casesWithReworkCount = 0;
  const sampleDeviatingCaseIds: string[] = [];

  type PatternAgg = {
    count: number;
    exampleCaseId?: string;
    missingCountByOrder: Map<number, { count: number; exampleCaseId?: string }>;
    insertedCountByOrder: Map<number, { count: number; exampleCaseId?: string }>;
  };
  const patternMap = new Map<string, PatternAgg>();

  function getBucketKey(d: number): string {
    if (d === 0) return '0';
    if (d <= 2) return '1–2';
    if (d <= 5) return '3–5';
    if (d <= 10) return '6–10';
    return '11+';
  }

  let caseCount = 0;
  for (const [caseId, caseEvents] of caseMap) {
    if (caseCount >= maxCases) break;
    caseCount++;
    analyzedCases++;

    caseEvents.sort((a, b) => {
      const ta = safeParseTs(a.timestamp);
      const tb = safeParseTs(b.timestamp);
      if (ta !== null && tb !== null) return ta - tb;
      return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0;
    });

    const mappedOrders: number[] = [];
    let lastOrder: number | null = null;
    for (const event of caseEvents) {
      const key = normalizeActivityKey(event.activity);
      const order = activityKeyToOrder.get(key);
      if (order !== undefined && order !== lastOrder) {
        mappedOrders.push(order);
        lastOrder = order;
      }
    }

    if (mappedOrders.length === 0) {
      casesWithNoMappedSteps++;
      const d = expectedOrders.length;
      distances.push(d);
      const bk = getBucketKey(d);
      bucketCounts.set(bk, (bucketCounts.get(bk) ?? 0) + 1);
      if (!bucketExamples.has(bk)) bucketExamples.set(bk, caseId);
      worstCasesRaw.push({ caseId, distance: d, insertions: 0, deletions: d, mappedSteps: 0 });

      const fitness = expectedOrders.length > 0 ? 0 : 1;
      const precision = 0;
      fitnessValues.push(fitness);
      precisionValues.push(precision);

      if (expectedOrders.length > 0) {
        casesWithDeletionsCount++;
        for (const o of expectedOrders) {
          deletedCountByOrder.set(o, (deletedCountByOrder.get(o) ?? 0) + 1);
          if (!deletedExampleByOrder.has(o)) deletedExampleByOrder.set(o, caseId);
        }

        if (sampleDeviatingCaseIds.length < 200) {
          sampleDeviatingCaseIds.push(caseId);
        }

        const missingPart = `- ${expectedOrders.join(',')}`;
        const signature = missingPart;
        let patternAgg = patternMap.get(signature);
        if (!patternAgg) {
          patternAgg = {
            count: 0,
            missingCountByOrder: new Map(),
            insertedCountByOrder: new Map(),
          };
          patternMap.set(signature, patternAgg);
        }
        patternAgg.count++;
        if (!patternAgg.exampleCaseId) patternAgg.exampleCaseId = caseId;

        for (const o of expectedOrders) {
          const existing = patternAgg.missingCountByOrder.get(o);
          if (existing) {
            existing.count++;
          } else {
            patternAgg.missingCountByOrder.set(o, { count: 1, exampleCaseId: caseId });
          }
        }
      }
      continue;
    }

    const expectedLen = expectedOrders.length;
    const mappedLen = mappedOrders.length;
    const matrixSize = expectedLen * mappedLen;

    let distance: number;
    let insertions: number;
    let deletions: number;
    let missingOrders: number[];
    let extraOrders: number[];
    let lcsLen = 0;

    if (matrixSize > maxMatrixSize) {
      if (!approxWarned) {
        warnings.push(`Einige Cases approximiert (Matrixgröße > ${maxMatrixSize})`);
        approxWarned = true;
      }
      const mappedSet = new Set(mappedOrders);
      missingOrders = expectedOrders.filter((o) => !mappedSet.has(o));
      extraOrders = mappedOrders.filter((o) => !expectedSet.has(o));

      const orderCounts = new Map<number, number>();
      for (const o of mappedOrders) {
        orderCounts.set(o, (orderCounts.get(o) ?? 0) + 1);
      }
      for (const [order, count] of orderCounts) {
        if (count > 1) {
          for (let i = 0; i < count - 1; i++) {
            extraOrders.push(order);
          }
        }
      }

      deletions = missingOrders.length;
      insertions = extraOrders.length;
      distance = deletions + insertions;
      lcsLen = Math.max(0, Math.min(mappedLen, expectedLen - deletions));
    } else {
      const flags = lcsMatchFlags(expectedOrders, mappedOrders, maxMatrixSize);
      if (flags) {
        lcsLen = flags.lcsLen;
        missingOrders = expectedOrders.filter((_, idx) => !flags.matchedExpected[idx]);
        extraOrders = mappedOrders.filter((_, idx) => !flags.matchedMapped[idx]);
        deletions = missingOrders.length;
        insertions = extraOrders.length;
        distance = deletions + insertions;
      } else {
        lcsLen = lcsLength(expectedOrders, mappedOrders);
        deletions = expectedLen - lcsLen;
        insertions = mappedLen - lcsLen;
        distance = deletions + insertions;
        const mappedSet = new Set(mappedOrders);
        missingOrders = expectedOrders.filter((o) => !mappedSet.has(o));
        extraOrders = mappedOrders.filter((o) => !expectedSet.has(o));
      }
    }

    const fitness = expectedLen > 0 ? lcsLen / expectedLen : 1;
    const precision = mappedLen > 0 ? lcsLen / mappedLen : 0;
    fitnessValues.push(fitness);
    precisionValues.push(precision);

    distances.push(distance);
    const bk = getBucketKey(distance);
    bucketCounts.set(bk, (bucketCounts.get(bk) ?? 0) + 1);
    if (!bucketExamples.has(bk)) bucketExamples.set(bk, caseId);

    worstCasesRaw.push({ caseId, distance, insertions, deletions, mappedSteps: mappedLen });

    if (extraOrders.length > 0) {
      casesWithInsertionsCount++;
      for (const o of extraOrders) {
        insertedCountByOrder.set(o, (insertedCountByOrder.get(o) ?? 0) + 1);
        if (!insertedExampleByOrder.has(o)) insertedExampleByOrder.set(o, caseId);
      }
    }
    if (missingOrders.length > 0) {
      casesWithDeletionsCount++;
      for (const o of missingOrders) {
        deletedCountByOrder.set(o, (deletedCountByOrder.get(o) ?? 0) + 1);
        if (!deletedExampleByOrder.has(o)) deletedExampleByOrder.set(o, caseId);
      }
    }

    let orderViolation = false;
    for (let i = 1; i < mappedOrders.length; i++) {
      if (mappedOrders[i] < mappedOrders[i - 1]) {
        orderViolation = true;
        break;
      }
    }
    if (orderViolation) {
      casesWithOrderViolationsCount++;
    }

    const rework = new Set(mappedOrders).size < mappedOrders.length;
    if (rework) {
      casesWithReworkCount++;
    }

    if (distance > 0 || orderViolation || rework) {
      if (sampleDeviatingCaseIds.length < 200) {
        sampleDeviatingCaseIds.push(caseId);
      }

      const missingPart = missingOrders.length > 0 ? `- ${missingOrders.join(',')}` : '';
      const extraPart = extraOrders.length > 0 ? `+ ${extraOrders.join(',')}` : '';
      let baseSig = missingPart && extraPart ? `${missingPart} | ${extraPart}` : missingPart || extraPart || '—';
      if (orderViolation) baseSig += ' | order';
      if (rework) baseSig += ' | rework';

      let patternAgg = patternMap.get(baseSig);
      if (!patternAgg) {
        patternAgg = {
          count: 0,
          missingCountByOrder: new Map(),
          insertedCountByOrder: new Map(),
        };
        patternMap.set(baseSig, patternAgg);
      }
      patternAgg.count++;
      if (!patternAgg.exampleCaseId) patternAgg.exampleCaseId = caseId;

      for (const o of missingOrders) {
        const existing = patternAgg.missingCountByOrder.get(o);
        if (existing) {
          existing.count++;
        } else {
          patternAgg.missingCountByOrder.set(o, { count: 1, exampleCaseId: caseId });
        }
      }

      for (const o of extraOrders) {
        const existing = patternAgg.insertedCountByOrder.get(o);
        if (existing) {
          existing.count++;
        } else {
          patternAgg.insertedCountByOrder.set(o, { count: 1, exampleCaseId: caseId });
        }
      }
    }
  }

  if (totalCases > maxCases) {
    warnings.push(
      `Anzeigestichprobe: Alignment basiert auf ${analyzedCases.toLocaleString('de-DE')} von ${totalCases.toLocaleString('de-DE')} Cases. ` +
      'Das Dataset ist vollständig und unverändert. Fitness und Deviation-Werte sind Näherungswerte.'
    );
  }

  const sortedDistances = distances.slice().sort((a, b) => a - b);
  const mean = distances.length > 0 ? distances.reduce((s, v) => s + v, 0) / distances.length : 0;
  const median = quantile(sortedDistances, 0.5);
  const p90 = quantile(sortedDistances, 0.9);

  const fitnessMean =
    fitnessValues.length > 0 ? fitnessValues.reduce((s, v) => s + v, 0) / fitnessValues.length : 0;
  const sortedFitness = fitnessValues.slice().sort((a, b) => a - b);
  const fitnessMedian = quantile(sortedFitness, 0.5);

  const precisionMean =
    precisionValues.length > 0 ? precisionValues.reduce((s, v) => s + v, 0) / precisionValues.length : 0;
  const sortedPrecision = precisionValues.slice().sort((a, b) => a - b);
  const precisionMedian = quantile(sortedPrecision, 0.5);

  const distanceBuckets: AlignmentBucket[] = bucketKeys.map((k) => {
    const count = bucketCounts.get(k) ?? 0;
    return {
      bucket: k,
      count,
      pct: analyzedCases > 0 ? count / analyzedCases : 0,
      exampleCaseId: bucketExamples.get(k),
    };
  });

  worstCasesRaw.sort((a, b) => {
    if (b.distance !== a.distance) return b.distance - a.distance;
    return b.mappedSteps - a.mappedSteps;
  });
  const worstCases = worstCasesRaw.slice(0, 5);

  const topDeletedSteps: AlignmentStepDeviation[] = expectedSteps
    .map((step) => {
      const count = deletedCountByOrder.get(step.order) ?? 0;
      return {
        stepId: step.stepId,
        order: step.order,
        label: step.label,
        count,
        pct: analyzedCases > 0 ? count / analyzedCases : 0,
        exampleCaseId: deletedExampleByOrder.get(step.order),
      };
    })
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const allInsertedOrders = Array.from(insertedCountByOrder.keys());
  const topInsertedSteps: AlignmentStepDeviation[] = allInsertedOrders
    .map((order) => {
      const count = insertedCountByOrder.get(order) ?? 0;
      const step = stepByOrder.get(order);
      return {
        stepId: step?.stepId ?? String(order),
        order,
        label: step?.label ?? String(order),
        count,
        pct: analyzedCases > 0 ? count / analyzedCases : 0,
        exampleCaseId: insertedExampleByOrder.get(order),
      };
    })
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topPatterns = Array.from(patternMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([signature, agg]) => {
      const missingEntries = Array.from(agg.missingCountByOrder.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);
      const missingSteps: AlignmentStepDeviation[] = missingEntries.map(([order, info]) => {
        const step = stepByOrder.get(order);
        return {
          stepId: step?.stepId ?? String(order),
          order,
          label: step?.label ?? String(order),
          count: info.count,
          pct: analyzedCases > 0 ? info.count / analyzedCases : 0,
          exampleCaseId: info.exampleCaseId,
        };
      });

      const insertedEntries = Array.from(agg.insertedCountByOrder.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);
      const insertedSteps: AlignmentStepDeviation[] = insertedEntries.map(([order, info]) => {
        const step = stepByOrder.get(order);
        return {
          stepId: step?.stepId ?? String(order),
          order,
          label: step?.label ?? String(order),
          count: info.count,
          pct: analyzedCases > 0 ? info.count / analyzedCases : 0,
          exampleCaseId: info.exampleCaseId,
        };
      });

      return {
        signature,
        count: agg.count,
        pct: analyzedCases > 0 ? agg.count / analyzedCases : 0,
        exampleCaseId: agg.exampleCaseId,
        missingSteps,
        insertedSteps,
      };
    });

  return {
    totalCases,
    expectedSteps: expectedOrders.length,
    analyzedCases,
    casesWithNoMappedSteps,
    meanDistance: mean,
    medianDistance: median,
    p90Distance: p90,
    distanceBuckets,
    worstCases,
    warnings,
    casesWithInsertions: {
      count: casesWithInsertionsCount,
      pct: analyzedCases > 0 ? casesWithInsertionsCount / analyzedCases : 0,
    },
    casesWithDeletions: {
      count: casesWithDeletionsCount,
      pct: analyzedCases > 0 ? casesWithDeletionsCount / analyzedCases : 0,
    },
    topInsertedSteps,
    topDeletedSteps,
    fitnessMean,
    fitnessMedian,
    precisionMean,
    precisionMedian,
    casesWithOrderViolations: {
      count: casesWithOrderViolationsCount,
      pct: analyzedCases > 0 ? casesWithOrderViolationsCount / analyzedCases : 0,
    },
    casesWithRework: {
      count: casesWithReworkCount,
      pct: analyzedCases > 0 ? casesWithReworkCount / analyzedCases : 0,
    },
    topPatterns,
    sampleDeviatingCaseIds,
  };
}
