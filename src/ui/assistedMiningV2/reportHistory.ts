import type {
  ProcessMiningAssistedV2State,
  ProcessMiningReportBasisSnapshot,
  ProcessMiningReportSnapshot,
} from '../../domain/process';

export interface ReportMetricChange {
  key: 'cases' | 'steps' | 'evidence' | 'variants' | 'deviations' | 'hotspots';
  label: string;
  previousValue: number;
  currentValue: number;
  delta: number;
}

export interface ReportSnapshotDelta {
  summary: string;
  metricChanges: ReportMetricChange[];
  addedFindings: string[];
  removedFindings: string[];
  addedActions: string[];
  removedActions: string[];
}

export interface ReportFreshnessDelta {
  summary: string;
  metricChanges: ReportMetricChange[];
  isAligned: boolean;
}

function roundDelta(value: number): number {
  return Math.round(value * 10) / 10;
}

function metricDefinitions() {
  return [
    { key: 'cases' as const, label: 'Quellen' },
    { key: 'steps' as const, label: 'Schritte' },
    { key: 'evidence' as const, label: 'Belegstellen' },
    { key: 'variants' as const, label: 'Varianten' },
    { key: 'deviations' as const, label: 'Soll-Hinweise' },
    { key: 'hotspots' as const, label: 'Hotspots' },
  ];
}

function toBasisMetrics(basis: ProcessMiningReportBasisSnapshot): Record<ReportMetricChange['key'], number> {
  return {
    cases: basis.caseCount,
    steps: basis.stepCount,
    evidence: basis.evidenceStepCount,
    variants: basis.variantCount,
    deviations: basis.deviationCount,
    hotspots: basis.hotspotCount,
  };
}

function fromState(state: ProcessMiningAssistedV2State): ProcessMiningReportBasisSnapshot {
  const quality = state.qualitySummary;
  const stepCount = quality?.stepObservationCount ?? state.observations.filter(item => item.kind === 'step').length;
  const evidenceStepCount = quality?.stepObservationsWithEvidence ?? state.observations.filter(item => item.kind === 'step' && item.evidenceSnippet?.trim()).length;
  return {
    caseCount: quality?.totalCases ?? state.cases.length,
    stepCount,
    evidenceStepCount,
    variantCount: state.discoverySummary?.variantCount ?? 0,
    deviationCount: state.conformanceSummary?.deviationNotes?.length ?? 0,
    hotspotCount: state.enhancementSummary?.issueCount ?? state.enhancementSummary?.issues?.length ?? 0,
    readinessHeadline: '',
    maturityLabel: '',
  };
}

function buildMetricChanges(previous: ProcessMiningReportBasisSnapshot, current: ProcessMiningReportBasisSnapshot): ReportMetricChange[] {
  const previousMap = toBasisMetrics(previous);
  const currentMap = toBasisMetrics(current);
  return metricDefinitions()
    .map(def => ({
      key: def.key,
      label: def.label,
      previousValue: previousMap[def.key],
      currentValue: currentMap[def.key],
      delta: roundDelta(currentMap[def.key] - previousMap[def.key]),
    }))
    .filter(item => item.delta !== 0);
}

function equivalentSnapshots(a: ProcessMiningReportSnapshot, b: ProcessMiningReportSnapshot): boolean {
  const aBasis = JSON.stringify(a.basis ?? null);
  const bBasis = JSON.stringify(b.basis ?? null);
  return (
    a.executiveSummary === b.executiveSummary &&
    a.processStory === b.processStory &&
    aBasis === bBasis &&
    a.keyFindings.join('|') === b.keyFindings.join('|') &&
    a.nextActions.join('|') === b.nextActions.join('|') &&
    a.cautionNotes.join('|') === b.cautionNotes.join('|')
  );
}

function summarizeMetricChanges(changes: ReportMetricChange[]): string {
  if (changes.length === 0) {
    return 'Gegenüber dem Vergleichsstand ist keine sichtbare Veränderung erkennbar.';
  }
  return changes
    .slice(0, 3)
    .map(item => `${item.label} ${item.delta > 0 ? '+' : ''}${item.delta}`)
    .join(' · ');
}

function uniqueAdded(current: string[], previous: string[]): string[] {
  const prevSet = new Set(previous);
  return current.filter(item => !prevSet.has(item));
}

function uniqueRemoved(current: string[], previous: string[]): string[] {
  const currSet = new Set(current);
  return previous.filter(item => !currSet.has(item));
}

export function pushReportSnapshot(
  history: ProcessMiningReportSnapshot[] | undefined,
  next: ProcessMiningReportSnapshot,
  limit = 6,
): ProcessMiningReportSnapshot[] {
  const base = history ?? [];
  const latest = base.length > 0 ? base[base.length - 1] : undefined;
  if (latest && equivalentSnapshots(latest, next)) {
    return [...base.slice(0, -1), next].slice(-limit);
  }
  return [...base, next].slice(-limit);
}

export function compareReportSnapshots(
  previous: ProcessMiningReportSnapshot | undefined,
  current: ProcessMiningReportSnapshot,
): ReportSnapshotDelta | null {
  if (!previous || !previous.basis || !current.basis) return null;

  const metricChanges = buildMetricChanges(previous.basis, current.basis);
  const addedFindings = uniqueAdded(current.keyFindings, previous.keyFindings).slice(0, 3);
  const removedFindings = uniqueRemoved(current.keyFindings, previous.keyFindings).slice(0, 3);
  const addedActions = uniqueAdded(current.nextActions, previous.nextActions).slice(0, 3);
  const removedActions = uniqueRemoved(current.nextActions, previous.nextActions).slice(0, 3);

  const summaryParts: string[] = [];
  if (metricChanges.length > 0) summaryParts.push(summarizeMetricChanges(metricChanges));
  if (addedFindings.length > 0) summaryParts.push(`${addedFindings.length} neue Befunde`);
  if (removedFindings.length > 0) summaryParts.push(`${removedFindings.length} frühere Befunde entfallen`);
  if (summaryParts.length === 0) summaryParts.push('Die Berichtsgrundlage ist im Vergleich zum vorherigen Bericht weitgehend stabil.');

  return {
    summary: summaryParts.join(' · '),
    metricChanges,
    addedFindings,
    removedFindings,
    addedActions,
    removedActions,
  };
}

export function compareReportToCurrentState(
  report: ProcessMiningReportSnapshot | undefined,
  state: ProcessMiningAssistedV2State,
): ReportFreshnessDelta | null {
  if (!report?.basis) return null;
  const currentBasis = fromState(state);
  const metricChanges = buildMetricChanges(report.basis, currentBasis);
  return {
    summary:
      metricChanges.length === 0
        ? 'Der aktuelle Arbeitsstand passt grob noch zum letzten erzeugten Bericht.'
        : `Seit dem letzten Bericht: ${summarizeMetricChanges(metricChanges)}.`,
    metricChanges,
    isAligned: metricChanges.length === 0,
  };
}
