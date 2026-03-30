import type { EventLogEvent, ProcessMiningActivityMapping } from '../domain/process';
import type { CaptureDraftStep } from '../domain/capture';
import { normalizeActivityKey } from './processMiningLite';

export interface BpmnIllegalTransition {
  fromStepId: string;
  toStepId: string;
  fromLabel: string;
  toLabel: string;
  count: number;
  pct: number;
  exampleCaseIds: string[];
}

export interface BpmnConformanceResult {
  totalCases: number;
  analyzedCases: number;
  casesWithNoMappedSteps: { count: number; pct: number };
  casesWithUnknownTasks: { count: number; pct: number };
  casesWithIllegalStart: { count: number; pct: number };
  casesWithIllegalTransition: { count: number; pct: number };
  casesConformTransitions: { count: number; pct: number };
  topIllegalTransitions: BpmnIllegalTransition[];
  warnings: string[];
  modelInfo: { tasks: number; flows: number; hasParallel: boolean; hasInclusive: boolean; hasEventBased: boolean };
}

function collectFirstTasksFrom(
  nodeId: string,
  outgoingMap: Map<string, string[]>,
  tasksSet: Set<string>
): Set<string> {
  const result = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const nexts = outgoingMap.get(current) ?? [];
    for (const next of nexts) {
      if (tasksSet.has(next)) {
        result.add(next);
      } else {
        queue.push(next);
      }
    }
  }
  return result;
}

export function computeBpmnConformance(params: {
  bpmnXml: string;
  events: EventLogEvent[];
  activityMappings: ProcessMiningActivityMapping[];
  draftSteps: CaptureDraftStep[];
  maxCases?: number;
}): BpmnConformanceResult {
  const { bpmnXml, events, activityMappings, draftSteps } = params;
  const maxCases = params.maxCases ?? 5000;
  const warnings: string[] = [];

  const doc = new DOMParser().parseFromString(bpmnXml, 'text/xml');
  const parserError = doc.getElementsByTagName('parsererror');
  if (parserError.length > 0) {
    throw new Error('BPMN XML konnte nicht geparst werden. Bitte BPMN erneut exportieren.');
  }

  const outgoingMap = new Map<string, string[]>();
  const allElementIds = new Set<string>();
  const startEventIds: string[] = [];
  const tasksSet = new Set<string>();
  let flowCount = 0;
  let hasParallel = false;
  let hasInclusive = false;
  let hasEventBased = false;

  const allElements = doc.getElementsByTagName('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const localName = el.localName;
    const id = el.getAttribute('id');
    if (id) allElementIds.add(id);

    if (localName === 'sequenceFlow') {
      const src = el.getAttribute('sourceRef');
      const tgt = el.getAttribute('targetRef');
      if (src && tgt) {
        const existing = outgoingMap.get(src) ?? [];
        existing.push(tgt);
        outgoingMap.set(src, existing);
        flowCount++;
      }
    } else if (localName === 'startEvent' && id) {
      startEventIds.push(id);
    } else if (localName === 'parallelGateway') {
      hasParallel = true;
    } else if (localName === 'inclusiveGateway') {
      hasInclusive = true;
    } else if (localName === 'eventBasedGateway') {
      hasEventBased = true;
    }

    if (id && id.startsWith('Task_')) {
      tasksSet.add(id);
    }
  }

  for (const [src, tgts] of outgoingMap) {
    if (src.startsWith('Task_')) tasksSet.add(src);
    for (const tgt of tgts) {
      if (tgt.startsWith('Task_')) tasksSet.add(tgt);
    }
  }

  if (hasParallel) {
    warnings.push('Hinweis: Parallelität in BPMN wird heuristisch geprüft (kein Token-Simulator).');
  }
  if (hasInclusive) {
    warnings.push('Hinweis: Inclusive Gateways werden heuristisch behandelt.');
  }
  if (hasEventBased) {
    warnings.push('Hinweis: Event-Based Gateways werden heuristisch behandelt.');
  }

  const startTasks = new Set<string>();
  for (const startId of startEventIds) {
    for (const t of collectFirstTasksFrom(startId, outgoingMap, tasksSet)) {
      startTasks.add(t);
    }
  }

  const taskAdjacency = new Map<string, Set<string>>();
  for (const taskId of tasksSet) {
    taskAdjacency.set(taskId, collectFirstTasksFrom(taskId, outgoingMap, tasksSet));
  }

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

  const totalCases = caseMap.size;
  let analyzedCases = 0;
  let noMappedStepsCount = 0;
  let unknownTasksCount = 0;
  let illegalStartCount = 0;
  let illegalTransitionCount = 0;
  let conformTransitionsCount = 0;

  const illegalTransMap = new Map<string, { fromStepId: string; toStepId: string; count: number; examples: string[] }>();

  let caseCount = 0;
  for (const [caseId, caseEvents] of caseMap) {
    if (caseCount >= maxCases) break;
    caseCount++;
    analyzedCases++;

    caseEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const stepIdSeq: string[] = [];
    let lastStepId: string | null = null;
    for (const event of caseEvents) {
      const key = normalizeActivityKey(event.activity);
      const stepId = activityKeyToStepId.get(key);
      if (stepId && stepId !== lastStepId) {
        stepIdSeq.push(stepId);
        lastStepId = stepId;
      }
    }

    if (stepIdSeq.length === 0) {
      noMappedStepsCount++;
      continue;
    }

    const taskSeq = stepIdSeq.map((id) => `Task_${id}`);

    let hasUnknown = false;
    for (const taskId of taskSeq) {
      if (!tasksSet.has(taskId)) {
        hasUnknown = true;
        break;
      }
    }
    if (hasUnknown) {
      unknownTasksCount++;
    }

    let hasIllegalStart = false;
    if (startTasks.size > 0 && !startTasks.has(taskSeq[0])) {
      hasIllegalStart = true;
      illegalStartCount++;
    }

    let hasIllegalTransition = false;
    for (let i = 0; i < taskSeq.length - 1; i++) {
      const from = taskSeq[i];
      const to = taskSeq[i + 1];
      const allowed = taskAdjacency.get(from);
      if (allowed && !allowed.has(to)) {
        hasIllegalTransition = true;
        const fromStepId = stepIdSeq[i];
        const toStepId = stepIdSeq[i + 1];
        const key = `${fromStepId}::${toStepId}`;
        const existing = illegalTransMap.get(key);
        if (existing) {
          existing.count++;
          if (existing.examples.length < 3) existing.examples.push(caseId);
        } else {
          illegalTransMap.set(key, { fromStepId, toStepId, count: 1, examples: [caseId] });
        }
      }
    }
    if (hasIllegalTransition) {
      illegalTransitionCount++;
    }

    if (!hasUnknown && !hasIllegalStart && !hasIllegalTransition) {
      conformTransitionsCount++;
    }
  }

  if (totalCases > maxCases) {
    warnings.push(
      `Anzeigestichprobe: BPMN-Conformance basiert auf ${analyzedCases.toLocaleString('de-DE')} von ${totalCases.toLocaleString('de-DE')} Cases. ` +
      'Das Dataset ist vollständig und unverändert. Conformance-Werte sind Näherungswerte.'
    );
  }

  const topIllegalTransitions: BpmnIllegalTransition[] = Array.from(illegalTransMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((t) => ({
      fromStepId: t.fromStepId,
      toStepId: t.toStepId,
      fromLabel: stepById.get(t.fromStepId)?.label ?? t.fromStepId,
      toLabel: stepById.get(t.toStepId)?.label ?? t.toStepId,
      count: t.count,
      pct: analyzedCases > 0 ? t.count / analyzedCases : 0,
      exampleCaseIds: t.examples,
    }));

  const pct = (count: number) => (analyzedCases > 0 ? count / analyzedCases : 0);

  return {
    totalCases,
    analyzedCases,
    casesWithNoMappedSteps: { count: noMappedStepsCount, pct: pct(noMappedStepsCount) },
    casesWithUnknownTasks: { count: unknownTasksCount, pct: pct(unknownTasksCount) },
    casesWithIllegalStart: { count: illegalStartCount, pct: pct(illegalStartCount) },
    casesWithIllegalTransition: { count: illegalTransitionCount, pct: pct(illegalTransitionCount) },
    casesConformTransitions: { count: conformTransitionsCount, pct: pct(conformTransitionsCount) },
    topIllegalTransitions,
    warnings,
    modelInfo: { tasks: tasksSet.size, flows: flowCount, hasParallel, hasInclusive, hasEventBased },
  };
}
