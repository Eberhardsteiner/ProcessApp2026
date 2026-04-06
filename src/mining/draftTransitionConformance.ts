import type { EventLogEvent, ProcessMiningActivityMapping } from '../domain/process';
import type { CaptureDraftStep, CaptureDraftDecision } from '../domain/capture';
import { normalizeActivityKey } from './processMiningLite';

export interface DraftIllegalTransition {
  fromStepId: string;
  toStepId: string;
  fromLabel: string;
  toLabel: string;
  count: number;
  pct: number;
  exampleCaseIds: string[];
}

export interface DraftTransitionConformanceResult {
  totalCases: number;
  analyzedCases: number;
  casesWithNoMappedSteps: { count: number; pct: number };
  casesWithIllegalStart: { count: number; pct: number };
  casesWithIllegalTransition: { count: number; pct: number };
  casesConformTransitions: { count: number; pct: number };
  topIllegalTransitions: DraftIllegalTransition[];
  warnings: string[];
  modelInfo: { nodes: number; flows: number; xorDecisions: number; andBlocks: number };
}

export function computeDraftTransitionConformance(params: {
  events: EventLogEvent[];
  activityMappings: ProcessMiningActivityMapping[];
  draftSteps: CaptureDraftStep[];
  draftDecisions: CaptureDraftDecision[];
  maxCases?: number;
}): DraftTransitionConformanceResult {
  const { events, activityMappings, draftSteps, draftDecisions } = params;
  const maxCases = params.maxCases ?? 5000;
  const warnings: string[] = [];

  const stepById = new Map<string, CaptureDraftStep>();
  for (const step of draftSteps) {
    stepById.set(step.stepId, step);
  }

  const sortedSteps = [...draftSteps].sort((a, b) => a.order - b.order);

  const activityKeyToStepId = new Map<string, string>();
  for (const mapping of activityMappings) {
    if (mapping.stepId && stepById.has(mapping.stepId)) {
      activityKeyToStepId.set(mapping.activityKey, mapping.stepId);
    }
  }

  const allowedTransitions = new Map<string, Set<string>>();
  const addTransition = (from: string, to: string) => {
    let set = allowedTransitions.get(from);
    if (!set) {
      set = new Set();
      allowedTransitions.set(from, set);
    }
    set.add(to);
  };

  for (let i = 0; i < sortedSteps.length - 1; i++) {
    addTransition(sortedSteps[i].stepId, sortedSteps[i + 1].stepId);
  }

  let xorDecisions = 0;
  let andBlocks = 0;

  for (const decision of draftDecisions) {
    if (decision.gatewayType === 'xor') {
      xorDecisions++;
      for (const branch of decision.branches) {
        if (branch.nextStepId && !branch.endsProcess) {
          addTransition(decision.afterStepId, branch.nextStepId);
        }
      }
    } else if (decision.gatewayType === 'and') {
      const validBranches = decision.branches.filter((b) => !b.endsProcess && b.nextStepId);
      if (validBranches.length < 2) continue;

      const afterStep = stepById.get(decision.afterStepId);
      if (!afterStep) continue;

      const branchStepOrders: number[] = [];
      for (const branch of validBranches) {
        const s = stepById.get(branch.nextStepId!);
        if (s) branchStepOrders.push(s.order);
      }

      if (branchStepOrders.length < 2) continue;

      const minOrder = Math.min(...branchStepOrders);
      const maxOrder = Math.max(...branchStepOrders);

      if (minOrder !== afterStep.order + 1) continue;

      const expectedOrders = new Set<number>();
      for (let o = minOrder; o <= maxOrder; o++) expectedOrders.add(o);
      const actualOrders = new Set(branchStepOrders);
      let contiguous = true;
      for (const o of expectedOrders) {
        if (!actualOrders.has(o)) {
          contiguous = false;
          break;
        }
      }
      if (!contiguous) continue;

      const parallelStepIds: string[] = [];
      for (const step of sortedSteps) {
        if (step.order >= minOrder && step.order <= maxOrder) {
          parallelStepIds.push(step.stepId);
        }
      }

      const joinStep = sortedSteps.find((s) => s.order === maxOrder + 1);

      for (const parallelId of parallelStepIds) {
        addTransition(decision.afterStepId, parallelId);
        for (const otherId of parallelStepIds) {
          if (otherId !== parallelId) {
            addTransition(parallelId, otherId);
          }
        }
        if (joinStep) {
          addTransition(parallelId, joinStep.stepId);
        }
      }

      andBlocks++;
    }
  }

  let flowCount = 0;
  for (const set of allowedTransitions.values()) {
    flowCount += set.size;
  }

  const startStep = sortedSteps[0];
  const startStepId = startStep?.stepId;

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

    let hasIllegalStart = false;
    if (startStepId && stepIdSeq[0] !== startStepId) {
      hasIllegalStart = true;
      illegalStartCount++;
    }

    let hasIllegalTransition = false;
    for (let i = 0; i < stepIdSeq.length - 1; i++) {
      const from = stepIdSeq[i];
      const to = stepIdSeq[i + 1];
      const allowed = allowedTransitions.get(from);
      if (allowed && !allowed.has(to)) {
        hasIllegalTransition = true;
        const transKey = `${from}::${to}`;
        const existing = illegalTransMap.get(transKey);
        if (existing) {
          existing.count++;
          if (existing.examples.length < 3) existing.examples.push(caseId);
        } else {
          illegalTransMap.set(transKey, { fromStepId: from, toStepId: to, count: 1, examples: [caseId] });
        }
      }
    }

    if (hasIllegalTransition) {
      illegalTransitionCount++;
    }

    if (!hasIllegalStart && !hasIllegalTransition) {
      conformTransitionsCount++;
    }
  }

  if (totalCases > maxCases) {
    warnings.push(
      `Anzeigestichprobe: Draft-Transition-Conformance basiert auf ${analyzedCases.toLocaleString('de-DE')} von ${totalCases.toLocaleString('de-DE')} Cases. ` +
      'Das Dataset ist vollständig und unverändert. Transition-Werte sind Näherungswerte.'
    );
  }
  if (draftSteps.length === 0) {
    warnings.push('Kein Happy Path definiert – Conformance nicht berechenbar.');
  }
  if (activityKeyToStepId.size === 0) {
    warnings.push('Keine Activity-Mappings vorhanden – alle Schritte gelten als nicht gemappt.');
  }

  const topIllegalTransitions: DraftIllegalTransition[] = Array.from(illegalTransMap.values())
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
    casesWithIllegalStart: { count: illegalStartCount, pct: pct(illegalStartCount) },
    casesWithIllegalTransition: { count: illegalTransitionCount, pct: pct(illegalTransitionCount) },
    casesConformTransitions: { count: conformTransitionsCount, pct: pct(conformTransitionsCount) },
    topIllegalTransitions,
    warnings,
    modelInfo: { nodes: draftSteps.length, flows: flowCount, xorDecisions, andBlocks },
  };
}
