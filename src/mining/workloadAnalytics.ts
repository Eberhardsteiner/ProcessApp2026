import type { EventLogEvent } from '../domain/process';

export interface WorkloadResourceRow {
  resource: string;
  count: number;
  pct: number;
}

export interface WorkloadWeekdayRow {
  weekday: number;
  label: string;
  count: number;
  pct: number;
}

export interface WorkloadHourRow {
  hour: number;
  count: number;
  pct: number;
}

export interface WorkloadAnalyticsResult {
  totalEvents: number;
  totalCases: number;

  timedEvents: number;
  invalidTimestampEvents: number;

  resources: WorkloadResourceRow[];
  byWeekday: WorkloadWeekdayRow[];
  byHour: WorkloadHourRow[];
  heatmap: number[][];

  warnings: string[];
}

function weekdayMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function computeWorkloadAnalytics(params: {
  events: EventLogEvent[];
  timeMode?: string;
  maxResources?: number;
}): WorkloadAnalyticsResult {

  const { events, timeMode, maxResources = 20 } = params;

  if (timeMode !== 'real') {
    throw new Error(
      'computeWorkloadAnalytics: Dataset hat kein explizit gültiges timeMode="real". ' +
      (timeMode
        ? `Empfangener Wert: "${timeMode}" – nur "real" ist zulässig.`
        : 'Fehlendes timeMode-Feld. Legacy-Dataset wird blockiert.') +
      ' Bitte das Dataset neu importieren.'
    );
  }

  const totalEvents = events.length;
  const totalCases = new Set(events.map(e => e.caseId)).size;

  const resCounts = new Map<string, number>();
  for (const e of events) {
    const r = (e.resource ?? '').trim();
    const key = r ? r : '(unbekannt)';
    resCounts.set(key, (resCounts.get(key) ?? 0) + 1);
  }
  const resourcesAll = Array.from(resCounts.entries())
    .map(([resource, count]) => ({ resource, count, pct: totalEvents > 0 ? count / totalEvents : 0 }))
    .sort((a, b) => b.count - a.count);

  const resources = resourcesAll.slice(0, maxResources);

  const warnings: string[] = [];

  const weekdayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const byWeekdayCounts = new Array(7).fill(0) as number[];
  const byHourCounts = new Array(24).fill(0) as number[];
  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[]);

  let timedEvents = 0;
  let invalidTimestampEvents = 0;

  for (const e of events) {
    const t = Date.parse(e.timestamp);
    if (!Number.isFinite(t)) {
      invalidTimestampEvents++;
      continue;
    }
    timedEvents++;
    const d = new Date(t);
    const wd = weekdayMon0(d);
    const hr = d.getHours();

    byWeekdayCounts[wd]++;
    byHourCounts[hr]++;
    heatmap[wd][hr]++;
  }

  if (timedEvents === 0 && totalEvents > 0) {
    warnings.push('Keine verwertbaren Zeitstempel gefunden: Peak-Analyse nicht möglich.');
  } else if (invalidTimestampEvents > 0) {
    warnings.push(`${invalidTimestampEvents.toLocaleString('de-DE')} Events ohne verwertbaren Zeitstempel wurden für Peaks ignoriert.`);
  }

  const denom = timedEvents > 0 ? timedEvents : 1;

  const byWeekday: WorkloadWeekdayRow[] = weekdayLabels.map((label, idx) => ({
    weekday: idx,
    label,
    count: byWeekdayCounts[idx],
    pct: byWeekdayCounts[idx] / denom,
  }));

  const byHour: WorkloadHourRow[] = byHourCounts.map((count, hour) => ({
    hour,
    count,
    pct: count / denom,
  }));

  return {
    totalEvents,
    totalCases,
    timedEvents,
    invalidTimestampEvents,
    resources,
    byWeekday,
    byHour,
    heatmap,
    warnings,
  };
}
