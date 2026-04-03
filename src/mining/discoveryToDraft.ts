import type { EventLogEvent } from '../domain/process';
import type { ProcessMiningActivityMapping } from '../domain/process';
import type { CaptureDraft, CaptureDraftStep, CaptureDraftDecision } from '../domain/capture';
import { computeVariants, buildActivityStats } from './processMiningLite';
import { buildDirectlyFollowsGraph } from './discoveryDfg';

export interface DeriveOptions {
  maxSteps?: number;
}

export interface DeriveDfgOptions extends DeriveOptions {
  minEdgeCount?: number;
  minEdgeShare?: number;
  maxExtraBranches?: number;
  restrictToTopVariantPath?: boolean;
  includeLoops?: boolean;
  enableParallelBlocks?: boolean;
  minNodeCoverage?: number;
}

export interface DeriveResult {
  draft: CaptureDraft;
  steps: CaptureDraftStep[];
  activityMappings: ProcessMiningActivityMapping[];
  topVariant: { variant: string; count: number; share: number } | null;
  warnings: string[];
}

export interface DeriveDfgResult extends DeriveResult {
  xorDecisions: number;
  andDecisions: number;
  edgesUsed: number;
}

export function deriveDraftFromTopVariant(
  events: EventLogEvent[],
  options: DeriveOptions = {}
): DeriveResult {
  const warnings: string[] = [];
  const { maxSteps = 100 } = options;

  const variants = computeVariants(events);

  if (variants.length === 0) {
    const emptyDraft: CaptureDraft = {
      draftVersion: 'capture-draft-v1',
      happyPath: [],
      decisions: [],
      exceptions: [],
      notes: ['Automatisch aus Event Log abgeleitet (Top Variante)'],
    };
    return {
      draft: emptyDraft,
      steps: [],
      activityMappings: [],
      topVariant: null,
      warnings: ['Keine Varianten gefunden – Event Log ist leer oder enthält keine auswertbaren Fälle.'],
    };
  }

  const topVariant = variants[0];
  const rawTopKeys = topVariant.variant
    .split(' → ')
    .filter((k) => k.length > 0);

  const seenKeys = new Set<string>();
  const topKeys: string[] = [];
  for (const k of rawTopKeys) {
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      topKeys.push(k);
    }
  }
  if (topKeys.length < rawTopKeys.length) {
    warnings.push('Top-Variante enthält wiederholte Aktivitäten; für das Modell wurden Duplikate entfernt.');
  }

  const topKeySet = new Set(topKeys);

  const allStats = buildActivityStats(events, []);

  const remainingByCount = allStats
    .filter((s) => !topKeySet.has(s.activityKey))
    .map((s) => s.activityKey);

  const orderedKeys = [...topKeys, ...remainingByCount].slice(0, maxSteps);

  if (orderedKeys.length === 0) {
    warnings.push('Top-Variante enthält keine verwertbaren Activity-Keys.');
  }

  const statsByKey = new Map(allStats.map((s) => [s.activityKey, s]));

  const steps: CaptureDraftStep[] = orderedKeys.map((key, idx) => {
    const stat = statsByKey.get(key);
    const label = stat?.example ?? key;
    return {
      stepId: crypto.randomUUID(),
      order: idx + 1,
      label,
      workType: 'unknown',
      status: 'derived',
    };
  });

  const activityMappings = buildActivityStats(events, steps);

  const draft: CaptureDraft = {
    draftVersion: 'capture-draft-v1',
    happyPath: steps,
    decisions: [],
    exceptions: [],
    notes: ['Automatisch aus Event Log abgeleitet (Top Variante)'],
  };

  return {
    draft,
    steps,
    activityMappings,
    topVariant,
    warnings,
  };
}

export function deriveDraftFromDfgHeuristics(
  events: EventLogEvent[],
  options: DeriveDfgOptions = {}
): DeriveDfgResult {
  const warnings: string[] = [];
  const {
    maxSteps = 100,
    minEdgeCount = 1,
    minEdgeShare = 0,
    maxExtraBranches = 3,
    restrictToTopVariantPath = true,
    includeLoops = false,
    enableParallelBlocks = false,
    minNodeCoverage = 0,
  } = options;

  const variants = computeVariants(events);

  if (variants.length === 0) {
    const emptyDraft: CaptureDraft = {
      draftVersion: 'capture-draft-v1',
      happyPath: [],
      decisions: [],
      exceptions: [],
      notes: ['Automatisch aus Event Log abgeleitet (DFG Heuristik)'],
    };
    return {
      draft: emptyDraft,
      steps: [],
      activityMappings: [],
      topVariant: null,
      warnings: ['Keine Varianten gefunden – Event Log ist leer oder enthält keine auswertbaren Fälle.'],
      xorDecisions: 0,
      andDecisions: 0,
      edgesUsed: 0,
    };
  }

  const topVariant = variants[0];
  const rawTopKeys = topVariant.variant
    .split(' → ')
    .filter((k) => k.length > 0);

  const seenKeys = new Set<string>();
  const topKeys: string[] = [];
  for (const k of rawTopKeys) {
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      topKeys.push(k);
    }
  }
  if (topKeys.length < rawTopKeys.length) {
    warnings.push('Top-Variante enthält wiederholte Aktivitäten; für das Modell wurden Duplikate entfernt.');
  }

  const topKeySet = new Set(topKeys);
  const allStats = buildActivityStats(events, []);
  const statsByKey = new Map(allStats.map((s) => [s.activityKey, s]));

  const activityKeyToLabel = new Map(allStats.map((s) => [s.activityKey, s.example]));

  const dfg = buildDirectlyFollowsGraph({ events, mode: 'activity', activityKeyToLabel });
  const totalCases = Math.max(1, dfg.totalCases);

  const nodeCoverageMap = new Map(dfg.nodes.map((n) => [n.key, n.caseCoverage]));

  let remainingByCount = allStats
    .filter((s) => !topKeySet.has(s.activityKey))
    .map((s) => s.activityKey);

  if (minNodeCoverage > 0) {
    remainingByCount = remainingByCount.filter((k) => {
      const cov = nodeCoverageMap.get(k) ?? 0;
      return cov >= minNodeCoverage;
    });
  }

  const orderedKeys = [...topKeys, ...remainingByCount].slice(0, maxSteps);

  const steps: CaptureDraftStep[] = orderedKeys.map((key, idx) => {
    const stat = statsByKey.get(key);
    const label = stat?.example ?? key;
    return {
      stepId: crypto.randomUUID(),
      order: idx + 1,
      label,
      workType: 'unknown',
      status: 'derived',
    };
  });

  const keyToStepId = new Map<string, string>();
  const keyToOrder = new Map<string, number>();
  orderedKeys.forEach((key, idx) => {
    keyToStepId.set(key, steps[idx].stepId);
    keyToOrder.set(key, idx + 1);
  });

  const getLabel = (key: string): string =>
    activityKeyToLabel.get(key) ?? key;

  const edgeCount = new Map<string, number>();
  for (const edge of dfg.edges) {
    edgeCount.set(`${edge.from}\0${edge.to}`, edge.count);
  }

  const outgoing = new Map<string, Array<{ to: string; count: number }>>();
  for (const edge of dfg.edges) {
    let arr = outgoing.get(edge.from);
    if (!arr) {
      arr = [];
      outgoing.set(edge.from, arr);
    }
    arr.push({ to: edge.to, count: edge.count });
  }
  for (const arr of outgoing.values()) {
    arr.sort((a, b) => b.count - a.count);
  }

  const passes = (count: number): boolean =>
    count >= minEdgeCount &&
    (minEdgeShare <= 0 || count / totalCases >= minEdgeShare);

  const decisions: CaptureDraftDecision[] = [];
  const hasAndAfter = new Set<string>();
  let edgesUsed = 0;

  if (enableParallelBlocks) {
    for (let i = 0; i + 3 < topKeys.length; i++) {
      const after = topKeys[i];
      const p1 = topKeys[i + 1];
      const p2 = topKeys[i + 2];
      const join = topKeys[i + 3];

      const afterP1 = edgeCount.get(`${after}\0${p1}`) ?? 0;
      const afterP2 = edgeCount.get(`${after}\0${p2}`) ?? 0;
      const p1p2 = edgeCount.get(`${p1}\0${p2}`) ?? 0;
      const p2p1 = edgeCount.get(`${p2}\0${p1}`) ?? 0;
      const p1Join = edgeCount.get(`${p1}\0${join}`) ?? 0;
      const p2Join = edgeCount.get(`${p2}\0${join}`) ?? 0;

      if (
        passes(afterP1) && passes(afterP2) &&
        passes(p1p2) && passes(p2p1) &&
        passes(p1Join) && passes(p2Join)
      ) {
        const afterStepId = keyToStepId.get(after);
        const p1StepId = keyToStepId.get(p1);
        const p2StepId = keyToStepId.get(p2);
        if (afterStepId && p1StepId && p2StepId) {
          decisions.push({
            decisionId: crypto.randomUUID(),
            afterStepId,
            gatewayType: 'and',
            question: `Parallel nach ${getLabel(after)}`,
            branches: [
              {
                branchId: crypto.randomUUID(),
                conditionLabel: getLabel(p1),
                nextStepId: p1StepId,
              },
              {
                branchId: crypto.randomUUID(),
                conditionLabel: getLabel(p2),
                nextStepId: p2StepId,
              },
            ],
            status: 'derived',
          });
          hasAndAfter.add(after);
          edgesUsed += 4;
          i += 2;
        }
      }
    }
  }

  const pathKeys = restrictToTopVariantPath ? topKeys : orderedKeys;

  for (let i = 0; i < pathKeys.length - 1; i++) {
    const afterKey = pathKeys[i];

    if (hasAndAfter.has(afterKey)) continue;

    const afterOrder = keyToOrder.get(afterKey) ?? (i + 1);
    const defaultNextKey = pathKeys[i + 1];

    if (!keyToStepId.has(defaultNextKey)) continue;

    const candidates = (outgoing.get(afterKey) ?? []).filter((e) => passes(e.count));

    const filteredCandidates = includeLoops
      ? candidates
      : candidates.filter((e) => (keyToOrder.get(e.to) ?? Infinity) > afterOrder);

    const altTargets = filteredCandidates.filter((e) => e.to !== defaultNextKey && keyToStepId.has(e.to));

    if (altTargets.length === 0) continue;

    edgesUsed += 1 + altTargets.length;

    let usedAlts = altTargets;
    if (usedAlts.length > maxExtraBranches) {
      usedAlts = usedAlts.slice(0, maxExtraBranches);
      warnings.push(
        `Branches nach '${getLabel(afterKey)}' wurden auf ${maxExtraBranches} alternative(n) gekürzt.`
      );
    }

    const afterStepId = keyToStepId.get(afterKey)!;
    const defaultNextStepId = keyToStepId.get(defaultNextKey)!;

    const branches = [
      {
        branchId: crypto.randomUUID(),
        conditionLabel: 'Weiter',
        nextStepId: defaultNextStepId,
      },
      ...usedAlts.map((e) => {
        const targetOrder = keyToOrder.get(e.to) ?? Infinity;
        const condLabel =
          targetOrder <= afterOrder
            ? `Zurück zu: ${getLabel(e.to)}`
            : getLabel(e.to);
        return {
          branchId: crypto.randomUUID(),
          conditionLabel: condLabel,
          nextStepId: keyToStepId.get(e.to)!,
        };
      }),
    ];

    decisions.push({
      decisionId: crypto.randomUUID(),
      afterStepId,
      gatewayType: 'xor',
      question: `Alternative nach ${getLabel(afterKey)}`,
      branches,
      status: 'derived',
    });
  }

  const activityMappings = buildActivityStats(events, steps);

  const draft: CaptureDraft = {
    draftVersion: 'capture-draft-v1',
    happyPath: steps,
    decisions,
    exceptions: [],
    notes: ['Automatisch aus Event Log abgeleitet (DFG Heuristik)'],
  };

  const xorDecisions = decisions.filter((d) => d.gatewayType === 'xor').length;
  const andDecisions = decisions.filter((d) => d.gatewayType === 'and').length;

  return {
    draft,
    steps,
    activityMappings,
    topVariant,
    warnings,
    xorDecisions,
    andDecisions,
    edgesUsed,
  };
}
