import type {
  ProcessMiningState,
  ProcessMiningDataset,
  ProcessMiningDatasetSettings,
  ProcessMiningAssistedState,
  EventLogEvent,
  RawProcessMiningDataset,
  RawProcessMiningState,
} from '../domain/process';

function syncTopLevelFromDataset(
  pm: ProcessMiningState,
  ds: ProcessMiningDataset,
): ProcessMiningState {
  return {
    ...pm,
    sourceLabel: ds.sourceLabel,
    importedAt: ds.importedAt,
    events: ds.events,
    activityMappings: ds.activityMappings,
    warnings: ds.warnings,
    truncated: ds.truncated,
    maxEvents: ds.maxEvents,
    timeMode: ds.timeMode,
    sourceRefId: ds.sourceRefId,
    activeDatasetId: ds.id,
  };
}

export function deriveDatasetFromActive(pm: ProcessMiningState): ProcessMiningDataset {
  return {
    id: pm.activeDatasetId ?? crypto.randomUUID(),
    sourceLabel: pm.sourceLabel,
    importedAt: pm.importedAt,
    events: pm.events,
    activityMappings: pm.activityMappings,
    warnings: pm.warnings,
    truncated: pm.truncated,
    maxEvents: pm.maxEvents,
    timeMode: pm.timeMode,
    sourceRefId: pm.sourceRefId,
  };
}

export interface EventIntegrityViolation {
  index: number;
  caseId: string | undefined;
  activity: string | undefined;
  timestamp: string | undefined;
  reason: string;
}

export interface EventIntegrityResult {
  valid: boolean;
  totalEvents: number;
  violations: EventIntegrityViolation[];
  violationCount: number;
  summary: string;
}

function isTimestampParseable(ts: string): boolean {
  const ms = Date.parse(ts);
  return Number.isFinite(ms);
}

export function checkEventLogIntegrity(events: EventLogEvent[]): EventIntegrityResult {
  const violations: EventIntegrityViolation[] = [];
  const MAX_REPORTED = 20;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const reasons: string[] = [];

    if (!ev.caseId || ev.caseId.trim() === '') {
      reasons.push('caseId fehlt oder ist leer');
    }
    if (!ev.activity || ev.activity.trim() === '') {
      reasons.push('activity fehlt oder ist leer');
    }
    if (!ev.timestamp || ev.timestamp.trim() === '') {
      reasons.push('timestamp fehlt oder ist leer');
    } else if (!isTimestampParseable(ev.timestamp)) {
      reasons.push(`timestamp nicht parsebar: "${ev.timestamp}"`);
    }

    if (reasons.length > 0 && violations.length < MAX_REPORTED) {
      violations.push({
        index: i,
        caseId: ev.caseId,
        activity: ev.activity,
        timestamp: ev.timestamp,
        reason: reasons.join('; '),
      });
    } else if (reasons.length > 0 && violations.length === MAX_REPORTED) {
      violations.push({
        index: -1,
        caseId: undefined,
        activity: undefined,
        timestamp: undefined,
        reason: '(weitere Verletzungen nicht einzeln aufgeführt)',
      });
    }
  }

  const violationCount = violations.filter(v => v.index !== -1).length;
  const hasOverflow = violations.some(v => v.index === -1);
  const valid = violationCount === 0 && !hasOverflow;

  let summary = '';
  if (!valid) {
    const countLabel = hasOverflow ? `mehr als ${MAX_REPORTED}` : String(violationCount);
    summary =
      `${countLabel} von ${events.length} Events verletzen Pflichtkriterien. ` +
      'Jedes Event muss eine nicht-leere caseId, activity und einen parsbaren ISO-Timestamp haben. ' +
      'Bitte das Quell-Log prüfen und neu importieren.';
  }

  return { valid, totalEvents: events.length, violations, violationCount, summary };
}


export function assertDatasetTimeMode(ds: RawProcessMiningDataset, context: string): void {
  const raw = (ds as { timeMode?: unknown }).timeMode;
  if (raw !== 'real') {
    const reason = raw === 'synthetic'
      ? 'Das Dataset ist als timeMode="synthetic" (Altbestand) markiert. Synthetische Timestamps sind unzulässig.'
      : `Das timeMode-Feld fehlt oder hat einen unbekannten Wert (${JSON.stringify(raw)}). Nur timeMode="real" ist zulässig.`;
    throw new Error(
      `${context}: Dataset „${ds.sourceLabel}" (id=${ds.id}) kann nicht für Process Mining verwendet werden. ` +
      reason + ' ' +
      'Bitte das Dataset löschen und ein reales Event Log (CSV, XES) neu importieren.'
    );
  }
  if (ds.truncated) {
    throw new Error(
      `${context}: Dataset „${ds.sourceLabel}" (id=${ds.id}) ist als unvollständig markiert (truncated=true). ` +
      'Abgeschnittene Event Logs ergeben ein unvollständiges Ist-Bild und sind für Process Mining nicht zulässig. ' +
      'Bitte das Dataset löschen, das Log extern vorfiltern und erneut importieren.'
    );
  }
}

export function assertInlineDatasetIntegrity(ds: RawProcessMiningDataset, context: string): void {
  assertDatasetTimeMode(ds, context);

  const events = (ds.events ?? []) as EventLogEvent[];
  const eventsRef = (ds as { eventsRef?: { eventCount?: number } }).eventsRef;
  const isExternalized = !!eventsRef;

  if (isExternalized) {
    if (events.length > 0) {
      throw new Error(
        `${context}: Dataset „${ds.sourceLabel}" (id=${ds.id}) ist inkonsistent: ` +
        `eventsRef ist gesetzt, aber events[] enthält noch ${events.length} Inline-Events. ` +
        'Gemischte Zustände sind unzulässig. ' +
        'Bitte das Dataset löschen und ein reales Event Log neu importieren.'
      );
    }
    if (eventsRef.eventCount !== undefined && eventsRef.eventCount <= 0) {
      throw new Error(
        `${context}: Dataset „${ds.sourceLabel}" (id=${ds.id}) ist externalisiert, ` +
        `aber eventsRef.eventCount ist ${eventsRef.eventCount} – das Dataset ist leer und wird abgelehnt. ` +
        'Bitte das Dataset löschen und ein reales Event Log neu importieren.'
      );
    }
    return;
  }

  if (events.length === 0) {
    throw new Error(
      `${context}: Dataset „${ds.sourceLabel}" (id=${ds.id}) enthält keine Events und ist nicht externalisiert. ` +
      'Leere Inline-Datasets sind unzulässig. ' +
      'Bitte das Dataset löschen und ein reales Event Log (CSV, XES) neu importieren.'
    );
  }

  const result = checkEventLogIntegrity(events);
  if (!result.valid) {
    throw new Error(
      `${context}: Dataset „${ds.sourceLabel}" (id=${ds.id}) enthält ungültige Events und wurde abgelehnt. ` +
      result.summary
    );
  }
}

function assertRawDatasetIsReal(ds: RawProcessMiningDataset, context: string): ProcessMiningDataset {
  assertInlineDatasetIntegrity(ds, context);
  return ds as ProcessMiningDataset;
}

export function normalizeProcessMiningState(pm: RawProcessMiningState): ProcessMiningState {
  const rawTopLevel = (pm as { timeMode?: unknown }).timeMode;

  if (pm.datasets && pm.datasets.length > 0) {
    const normalizedDatasets = pm.datasets.map((ds) =>
      assertRawDatasetIsReal(ds, 'normalizeProcessMiningState')
    );
    const activeId = pm.activeDatasetId ?? normalizedDatasets[0].id;
    const active = normalizedDatasets.find((d) => d.id === activeId) ?? normalizedDatasets[0];
    const normalizedState: ProcessMiningState = {
      ...(pm as unknown as ProcessMiningState),
      timeMode: 'real',
      datasets: normalizedDatasets,
    };
    return syncTopLevelFromDataset(normalizedState, active);
  }

  if (rawTopLevel !== 'real') {
    const reason = rawTopLevel === 'synthetic'
      ? 'Das Dataset ist als timeMode="synthetic" (Altbestand) markiert. Synthetische Timestamps sind unzulässig.'
      : `Das timeMode-Feld fehlt oder hat einen unbekannten Wert (${JSON.stringify(rawTopLevel)}). Nur timeMode="real" ist zulässig.`;
    throw new Error(
      `normalizeProcessMiningState: ProcessMiningState kann nicht für Process Mining verwendet werden. ` +
      reason + ' ' +
      'Bitte das Dataset löschen und ein reales Event Log (CSV, XES) neu importieren.'
    );
  }

  const normalizedState: ProcessMiningState = { ...(pm as unknown as ProcessMiningState), timeMode: 'real' };
  const ds = deriveDatasetFromActive(normalizedState);
  assertInlineDatasetIntegrity(ds, 'normalizeProcessMiningState (Legacy-Top-Level)');
  return {
    ...normalizedState,
    datasets: [ds],
    activeDatasetId: ds.id,
  };
}

export function addMiningDataset(
  pm: RawProcessMiningState | undefined,
  dataset: ProcessMiningDataset,
  makeActive = true,
): ProcessMiningState {
  assertInlineDatasetIntegrity(dataset, 'addMiningDataset');

  if (!pm) {
    const base: ProcessMiningState = {
      schemaVersion: 'process-mining-v1',
      sourceLabel: dataset.sourceLabel,
      importedAt: dataset.importedAt,
      events: dataset.events,
      activityMappings: dataset.activityMappings,
      warnings: dataset.warnings,
      truncated: dataset.truncated,
      maxEvents: dataset.maxEvents,
      timeMode: dataset.timeMode,
      sourceRefId: dataset.sourceRefId,
      datasets: [dataset],
      activeDatasetId: dataset.id,
    };
    return base;
  }

  const normalized = normalizeProcessMiningState(pm);
  const existing = normalized.datasets!.find((d) => d.id === dataset.id);
  const datasets = existing
    ? normalized.datasets!.map((d) => (d.id === dataset.id ? dataset : d))
    : [...normalized.datasets!, dataset];

  const result: ProcessMiningState = { ...normalized, datasets };

  if (makeActive) {
    return syncTopLevelFromDataset(result, dataset);
  }
  return result;
}

export function setActiveMiningDataset(
  pm: RawProcessMiningState,
  datasetId: string,
): ProcessMiningState {
  const normalized = normalizeProcessMiningState(pm);
  const ds = normalized.datasets!.find((d) => d.id === datasetId);
  if (!ds) return normalized;
  return syncTopLevelFromDataset(normalized, ds);
}

export function renameMiningDataset(
  pm: RawProcessMiningState,
  datasetId: string,
  newLabel: string,
): ProcessMiningState {
  const normalized = normalizeProcessMiningState(pm);
  const datasets = normalized.datasets!.map((d) =>
    d.id === datasetId ? { ...d, sourceLabel: newLabel } : d,
  );
  const result: ProcessMiningState = { ...normalized, datasets };

  if (normalized.activeDatasetId === datasetId) {
    return { ...result, sourceLabel: newLabel };
  }
  return result;
}

export function duplicateMiningDataset(
  pm: RawProcessMiningState,
  datasetId: string,
): ProcessMiningState {
  const normalized = normalizeProcessMiningState(pm);
  const original = normalized.datasets!.find((d) => d.id === datasetId);
  if (!original) return normalized;

  const now = new Date().toISOString();
  const copy: ProcessMiningDataset = {
    ...original,
    id: crypto.randomUUID(),
    sourceLabel: `${original.sourceLabel} (Kopie)`,
    importedAt: now,
    provenance: {
      kind: 'transform',
      method: 'duplicate',
      createdAt: now,
      createdFromDatasetId: original.id,
      createdFromLabel: original.sourceLabel,
    },
  };

  return {
    ...normalized,
    datasets: [...normalized.datasets!, copy],
  };
}

export function removeMiningDataset(
  pm: RawProcessMiningState,
  datasetId: string,
): ProcessMiningState | undefined {
  const normalized = normalizeProcessMiningState(pm);
  const remaining = normalized.datasets!.filter((d) => d.id !== datasetId);

  if (remaining.length === 0) return undefined;

  const wasActive = normalized.activeDatasetId === datasetId;
  const result: ProcessMiningState = { ...normalized, datasets: remaining };

  if (wasActive) {
    return syncTopLevelFromDataset(result, remaining[0]);
  }
  return result;
}

function mergeDatasetSettings(
  base?: ProcessMiningDatasetSettings,
  patch?: Partial<ProcessMiningDatasetSettings>,
): ProcessMiningDatasetSettings {
  const b = base ?? {};
  const p = patch ?? {};
  return {
    ...b,
    ...p,
    segment: { ...(b.segment ?? {}), ...(p.segment ?? {}) },
    discovery: { ...(b.discovery ?? {}), ...(p.discovery ?? {}) },
    conformance: { ...(b.conformance ?? {}), ...(p.conformance ?? {}) },
    performance: { ...(b.performance ?? {}), ...(p.performance ?? {}) },
    rootCause: { ...(b.rootCause ?? {}), ...(p.rootCause ?? {}) },
    assistant: { ...(b.assistant ?? {}), ...(p.assistant ?? {}) },
  };
}

export function updateActiveMiningDatasetSettings(
  pm: ProcessMiningState,
  patch: Partial<ProcessMiningDatasetSettings>,
): ProcessMiningState {
  const normalized = normalizeProcessMiningState(pm);
  const activeId = normalized.activeDatasetId!;
  const active = normalized.datasets!.find((d) => d.id === activeId);
  if (!active) return normalized;

  const nextSettings = mergeDatasetSettings(active.settings, patch);
  return updateActiveMiningDataset(normalized, { settings: nextSettings });
}

export function updateActiveMiningDataset(
  pm: ProcessMiningState,
  patch: Partial<Omit<ProcessMiningDataset, 'id'>>,
): ProcessMiningState {
  const normalized = normalizeProcessMiningState(pm);
  const activeId = normalized.activeDatasetId!;

  const datasets = normalized.datasets!.map((d) =>
    d.id === activeId ? { ...d, ...patch } : d,
  );

  const updatedActive = datasets.find((d) => d.id === activeId)!;
  return syncTopLevelFromDataset({ ...normalized, datasets }, updatedActive);
}

export function normalizeAssistedMiningState(
  assisted: ProcessMiningAssistedState,
): ProcessMiningAssistedState {
  const rawDatasets = (assisted.datasets ?? []) as unknown as RawProcessMiningDataset[];
  const normalizedDatasets = rawDatasets.map((ds) =>
    assertRawDatasetIsReal(ds, 'normalizeAssistedMiningState')
  );
  return { ...assisted, datasets: normalizedDatasets };
}
