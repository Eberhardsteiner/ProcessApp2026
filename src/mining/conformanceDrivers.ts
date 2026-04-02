import type { CaptureDraftStep } from '../domain/capture';
import type { ConformanceResult } from './processMiningLite';

type MappedVariantLike = { variant: string; share: number; count: number; exampleCaseId?: string };

export interface ConformanceDriverRow {
  stepId: string;
  order: number;
  label: string;
  missingPctA: number;
  missingPctB: number;
  deltaPp: number;
  exampleCaseId?: string;
}

export interface ConformanceDriverAnalysis {
  bullets: string[];
  topMissingStepDeltas: ConformanceDriverRow[];
  variantNote?: string;
}

function pctPp(p: number): number {
  return p * 100;
}

function formatPp(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}pp`;
}

function parseMappedVariantOrders(variant: string): number[] {
  if (variant === '(keine gemappten Schritte)') return [];
  return variant
    .split('\u2192')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

export function buildConformanceDriverAnalysis(params: {
  conformanceA: ConformanceResult;
  conformanceB: ConformanceResult;
  topMappedVariantA?: MappedVariantLike | null;
  topMappedVariantB?: MappedVariantLike | null;
  draftSteps: CaptureDraftStep[];
  segmentLabelA: string;
  segmentLabelB: string;
}): ConformanceDriverAnalysis {
  const { conformanceA, conformanceB, topMappedVariantA, topMappedVariantB, draftSteps, segmentLabelA, segmentLabelB } = params;

  const bullets: string[] = [];

  const exactDelta = pctPp(conformanceA.exactHappyPath.pct) - pctPp(conformanceB.exactHappyPath.pct);
  bullets.push(
    `Exakt konform: ${segmentLabelA} ${pctPp(conformanceA.exactHappyPath.pct).toFixed(1)}% vs. ${segmentLabelB} ${pctPp(conformanceB.exactHappyPath.pct).toFixed(1)}% (Δ ${formatPp(exactDelta)})`
  );

  const missingDelta = pctPp(conformanceA.casesWithMissingSteps.pct) - pctPp(conformanceB.casesWithMissingSteps.pct);
  bullets.push(
    `Fälle mit fehlenden Schritten: ${segmentLabelA} ${pctPp(conformanceA.casesWithMissingSteps.pct).toFixed(1)}% vs. ${segmentLabelB} ${pctPp(conformanceB.casesWithMissingSteps.pct).toFixed(1)}% (Δ ${formatPp(missingDelta)})`
  );

  const unmappedDelta = pctPp(conformanceA.casesWithUnmapped.pct) - pctPp(conformanceB.casesWithUnmapped.pct);
  bullets.push(
    `Unmapped Aktivitäten: ${segmentLabelA} ${pctPp(conformanceA.casesWithUnmapped.pct).toFixed(1)}% vs. ${segmentLabelB} ${pctPp(conformanceB.casesWithUnmapped.pct).toFixed(1)}% (Δ ${formatPp(unmappedDelta)})`
  );

  const backtrackDelta = pctPp(conformanceA.casesWithBacktrack.pct) - pctPp(conformanceB.casesWithBacktrack.pct);
  bullets.push(
    `Backtracking: ${segmentLabelA} ${pctPp(conformanceA.casesWithBacktrack.pct).toFixed(1)}% vs. ${segmentLabelB} ${pctPp(conformanceB.casesWithBacktrack.pct).toFixed(1)}% (Δ ${formatPp(backtrackDelta)})`
  );

  const orderMismatchDelta = pctPp(conformanceA.casesWithOrderMismatch.pct) - pctPp(conformanceB.casesWithOrderMismatch.pct);
  bullets.push(
    `Reihenfolgeabweichung: ${segmentLabelA} ${pctPp(conformanceA.casesWithOrderMismatch.pct).toFixed(1)}% vs. ${segmentLabelB} ${pctPp(conformanceB.casesWithOrderMismatch.pct).toFixed(1)}% (Δ ${formatPp(orderMismatchDelta)})`
  );

  const mapA = new Map<string, (typeof conformanceA.missingStepCountsAll)[number]>();
  for (const m of conformanceA.missingStepCountsAll) {
    mapA.set(m.stepId, m);
  }
  const mapB = new Map<string, (typeof conformanceB.missingStepCountsAll)[number]>();
  for (const m of conformanceB.missingStepCountsAll) {
    mapB.set(m.stepId, m);
  }

  const rows: ConformanceDriverRow[] = [];
  for (const step of draftSteps) {
    const a = mapA.get(step.stepId);
    const b = mapB.get(step.stepId);
    const pctA = a?.pct ?? 0;
    const pctB = b?.pct ?? 0;
    const deltaPp = (pctA - pctB) * 100;
    if (Math.abs(deltaPp) < 2.0 && (a?.count ?? 0) < 3 && (b?.count ?? 0) < 3) continue;

    let exampleCaseId: string | undefined;
    if (deltaPp > 0) {
      exampleCaseId = a?.exampleCaseIds[0];
    } else if (deltaPp < 0) {
      exampleCaseId = b?.exampleCaseIds[0];
    }

    rows.push({
      stepId: step.stepId,
      order: step.order,
      label: step.label,
      missingPctA: pctA,
      missingPctB: pctB,
      deltaPp,
      exampleCaseId,
    });
  }

  rows.sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp));
  const topMissingStepDeltas = rows.slice(0, 6);

  let variantNote: string | undefined;
  if (topMappedVariantA && topMappedVariantB && topMappedVariantA.variant !== topMappedVariantB.variant) {
    const ordersA = new Set(parseMappedVariantOrders(topMappedVariantA.variant));
    const ordersB = new Set(parseMappedVariantOrders(topMappedVariantB.variant));
    const onlyInA = [...ordersA].filter((o) => !ordersB.has(o));
    const onlyInB = [...ordersB].filter((o) => !ordersA.has(o));

    if (onlyInA.length > 0 || onlyInB.length > 0) {
      const partsA = onlyInA.length > 0 ? `nur in A: Schritt(e) ${onlyInA.join(', ')}` : '';
      const partsB = onlyInB.length > 0 ? `nur in B: Schritt(e) ${onlyInB.join(', ')}` : '';
      const combined = [partsA, partsB].filter(Boolean).join('; ');
      variantNote = `Top gemappte Variante unterscheidet sich: ${combined}.`;
    } else {
      variantNote = 'Top gemappte Variante nutzt ähnliche Schritte, aber in anderer Reihenfolge (Hinweis auf Reihenfolgeabweichung/Backtracking).';
    }
  }

  return { bullets, topMissingStepDeltas, variantNote };
}
