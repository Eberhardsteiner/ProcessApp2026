import type { EventLogEvent } from '../domain/process';

export interface ResourceStatRow {
  resource: string;
  eventCount: number;
  caseCount: number;
  pctCases: number;
}

export interface HandoverEdgeRow {
  fromResource: string;
  toResource: string;
  occurrences: number;
  cases: number;
  pctCases: number;
  exampleCaseId?: string;
}

export interface OrganizationAnalyticsResult {
  totalEvents: number;
  eventsWithResource: number;
  pctEventsWithResource: number;
  totalCases: number;
  analyzedCases: number;
  resources: ResourceStatRow[];
  handovers: HandoverEdgeRow[];
  warnings: string[];
}

export function computeOrganizationAnalytics(params: {
  events: EventLogEvent[];
  maxCases?: number;
}): OrganizationAnalyticsResult {
  const { events, maxCases = 5000 } = params;

  const totalEvents = events.length;
  const eventsWithResource = events.filter(e => e.resource && e.resource.trim() !== '').length;
  const pctEventsWithResource = totalEvents > 0 ? eventsWithResource / totalEvents : 0;

  const caseMap = new Map<string, EventLogEvent[]>();
  for (const ev of events) {
    let bucket = caseMap.get(ev.caseId);
    if (!bucket) { bucket = []; caseMap.set(ev.caseId, bucket); }
    bucket.push(ev);
  }

  const totalCases = caseMap.size;
  const warnings: string[] = [];

  let caseEntries = Array.from(caseMap.entries());
  if (caseEntries.length > maxCases) {
    caseEntries = caseEntries.slice(0, maxCases);
    warnings.push(
      `Anzeigestichprobe: ${maxCases.toLocaleString('de-DE')} von ${totalCases.toLocaleString('de-DE')} Cases für diese Ansicht berechnet. ` +
      'Das Dataset ist vollständig und unverändert. Organisationskennzahlen sind Näherungswerte.'
    );
  }
  const analyzedCases = caseEntries.length;

  const eventCountByResource = new Map<string, number>();
  const caseSetByResource = new Map<string, Set<string>>();

  const edgeOccurrences = new Map<string, number>();
  const edgeCases = new Map<string, Set<string>>();
  const edgeExample = new Map<string, string>();

  for (const [caseId, caseEvents] of caseEntries) {
    const sorted = caseEvents.slice().sort((a, b) => {
      const ta = Date.parse(a.timestamp);
      const tb = Date.parse(b.timestamp);
      if (!isNaN(ta) && !isNaN(tb)) return ta - tb;
      return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0;
    });

    const resourceSeq: string[] = [];
    for (const ev of sorted) {
      if (!ev.resource) continue;
      const r = ev.resource.trim();
      if (!r) continue;

      const cnt = eventCountByResource.get(r) ?? 0;
      eventCountByResource.set(r, cnt + 1);

      let cs = caseSetByResource.get(r);
      if (!cs) { cs = new Set(); caseSetByResource.set(r, cs); }
      cs.add(caseId);

      if (resourceSeq.length === 0 || resourceSeq[resourceSeq.length - 1] !== r) {
        resourceSeq.push(r);
      }
    }

    const seenEdgesInCase = new Set<string>();
    for (let i = 0; i < resourceSeq.length - 1; i++) {
      const from = resourceSeq[i];
      const to = resourceSeq[i + 1];
      if (from === to) continue;
      const key = from + '\0' + to;

      edgeOccurrences.set(key, (edgeOccurrences.get(key) ?? 0) + 1);

      if (!edgeExample.has(key)) {
        edgeExample.set(key, caseId);
      }

      seenEdgesInCase.add(key);
    }

    for (const key of seenEdgesInCase) {
      let cs = edgeCases.get(key);
      if (!cs) { cs = new Set(); edgeCases.set(key, cs); }
      cs.add(caseId);
    }
  }

  const resources: ResourceStatRow[] = Array.from(eventCountByResource.entries()).map(([resource, eventCount]) => {
    const caseCount = caseSetByResource.get(resource)?.size ?? 0;
    return { resource, eventCount, caseCount, pctCases: analyzedCases > 0 ? caseCount / analyzedCases : 0 };
  }).sort((a, b) => b.caseCount - a.caseCount || b.eventCount - a.eventCount);

  const handovers: HandoverEdgeRow[] = Array.from(edgeOccurrences.entries()).map(([key, occurrences]) => {
    const [fromResource, toResource] = key.split('\0');
    const cases = edgeCases.get(key)?.size ?? 0;
    return {
      fromResource,
      toResource,
      occurrences,
      cases,
      pctCases: analyzedCases > 0 ? cases / analyzedCases : 0,
      exampleCaseId: edgeExample.get(key),
    };
  }).sort((a, b) => b.cases - a.cases || b.occurrences - a.occurrences);

  if (pctEventsWithResource < 0.5) {
    warnings.push(`Nur ${Math.round(pctEventsWithResource * 100)}% der Events haben eine Resource-Angabe. Organisations-Analyse eingeschränkt.`);
  }

  return {
    totalEvents,
    eventsWithResource,
    pctEventsWithResource,
    totalCases,
    analyzedCases,
    resources,
    handovers,
    warnings,
  };
}
