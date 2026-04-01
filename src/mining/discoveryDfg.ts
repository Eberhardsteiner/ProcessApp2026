import type { EventLogEvent } from '../domain/process';
import { normalizeActivityKey } from './processMiningLite';

export interface DfgNode {
  key: string;
  label: string;
  occurrences: number;
  caseCoverage: number;
  medianOutDeltaMs: number | null;
  p95OutDeltaMs: number | null;
}

export interface DfgEdge {
  from: string;
  to: string;
  count: number;
  medianDeltaMs: number | null;
  p90DeltaMs: number | null;
  p95DeltaMs: number | null;
}

export interface BuildDfgParams {
  events: EventLogEvent[];
  mode: 'activity' | 'step';
  activityKeyToStepId?: Map<string, string>;
  stepIdToLabel?: Map<string, string>;
  stepIdToOrder?: Map<string, number>;
  activityKeyToLabel?: Map<string, string>;
  timeMode?: string;
}

export interface BuildDfgResult {
  nodes: DfgNode[];
  edges: DfgEdge[];
  totalCases: number;
}

const MAX_DELTAS_PER_EDGE = 5000;

function medianOfSorted(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 1 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function quantileOfSorted(arr: number[], q: number): number | null {
  if (arr.length === 0) return null;
  const pos = q * (arr.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return arr[lo];
  return arr[lo] + (arr[hi] - arr[lo]) * (pos - lo);
}

export function buildDirectlyFollowsGraph(params: BuildDfgParams): BuildDfgResult {
  const { events, mode, activityKeyToStepId, stepIdToLabel, activityKeyToLabel } = params;

  const caseMap = new Map<string, EventLogEvent[]>();
  for (const e of events) {
    let caseEvents = caseMap.get(e.caseId);
    if (!caseEvents) {
      caseEvents = [];
      caseMap.set(e.caseId, caseEvents);
    }
    caseEvents.push(e);
  }

  const totalCases = caseMap.size;

  const nodeOccurrences = new Map<string, number>();
  const nodeLabel = new Map<string, string>();
  const nodeCaseSets = new Map<string, Set<string>>();
  const edgeCounts = new Map<string, number>();
  const edgeDeltas = new Map<string, number[]>();
  const nodeOutDeltas = new Map<string, number[]>();

  for (const [caseId, caseEvents] of caseMap) {
    const sorted = caseEvents.slice().sort((a, b) => {
      const ta = Date.parse(a.timestamp);
      const tb = Date.parse(b.timestamp);
      if (!isNaN(ta) && !isNaN(tb)) return ta - tb;
      return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0;
    });

    const nodeKeys: string[] = [];
    const timestamps: number[] = [];

    for (const e of sorted) {
      const actKey = normalizeActivityKey(e.activity);
      let key: string;
      let label: string;

      if (mode === 'step') {
        const stepId = activityKeyToStepId?.get(actKey);
        if (stepId) {
          key = stepId;
          label = stepIdToLabel?.get(stepId) ?? stepId;
        } else {
          key = `unmapped:${actKey}`;
          label = `unmapped: ${e.activity}`;
        }
      } else {
        key = actKey;
        label = activityKeyToLabel?.get(actKey) ?? e.activity;
      }

      nodeKeys.push(key);
      nodeLabel.set(key, label);

      nodeOccurrences.set(key, (nodeOccurrences.get(key) ?? 0) + 1);

      let caseSet = nodeCaseSets.get(key);
      if (!caseSet) {
        caseSet = new Set();
        nodeCaseSets.set(key, caseSet);
      }
      caseSet.add(caseId);

      const t = Date.parse(e.timestamp);
      timestamps.push(isNaN(t) ? NaN : t);
    }

    for (let i = 0; i < nodeKeys.length - 1; i++) {
      const from = nodeKeys[i];
      const to = nodeKeys[i + 1];
      const edgeKey = `${from}\x00${to}`;

      edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) ?? 0) + 1);

      const t1 = timestamps[i];
      const t2 = timestamps[i + 1];
      if (!isNaN(t1) && !isNaN(t2)) {
        const delta = t2 - t1;
        let deltas = edgeDeltas.get(edgeKey);
        if (!deltas) {
          deltas = [];
          edgeDeltas.set(edgeKey, deltas);
        }
        if (deltas.length < MAX_DELTAS_PER_EDGE) {
          deltas.push(delta);
        }

        let out = nodeOutDeltas.get(from);
        if (!out) {
          out = [];
          nodeOutDeltas.set(from, out);
        }
        if (out.length < MAX_DELTAS_PER_EDGE) {
          out.push(delta);
        }
      }
    }
  }

  const nodes: DfgNode[] = [];
  for (const [key, occurrences] of nodeOccurrences) {
    const caseSet = nodeCaseSets.get(key);
    const caseCoverage = caseSet ? caseSet.size / totalCases : 0;

    const out = nodeOutDeltas.get(key);
    let medianOutDeltaMs: number | null = null;
    let p95OutDeltaMs: number | null = null;
    if (out && out.length > 0) {
      const sorted = out.slice().sort((a, b) => a - b);
      medianOutDeltaMs = medianOfSorted(sorted);
      p95OutDeltaMs = quantileOfSorted(sorted, 0.95);
    }

    nodes.push({
      key,
      label: nodeLabel.get(key) ?? key,
      occurrences,
      caseCoverage,
      medianOutDeltaMs,
      p95OutDeltaMs,
    });
  }

  const edges: DfgEdge[] = [];
  for (const [edgeKey, count] of edgeCounts) {
    const sep = edgeKey.indexOf('\x00');
    const from = edgeKey.slice(0, sep);
    const to = edgeKey.slice(sep + 1);
    const deltas = edgeDeltas.get(edgeKey);
    let medianDeltaMs: number | null = null;
    let p90DeltaMs: number | null = null;
    let p95DeltaMs: number | null = null;
    if (deltas && deltas.length > 0) {
      const sorted = deltas.slice().sort((a, b) => a - b);
      medianDeltaMs = medianOfSorted(sorted);
      p90DeltaMs = quantileOfSorted(sorted, 0.9);
      p95DeltaMs = quantileOfSorted(sorted, 0.95);
    }
    edges.push({ from, to, count, medianDeltaMs, p90DeltaMs, p95DeltaMs });
  }

  return { nodes, edges, totalCases };
}
