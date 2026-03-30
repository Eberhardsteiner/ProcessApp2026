import type { EventLogEvent } from '../domain/process';

export interface SegmentFilter {
  attributeKey: string;
  attributeValue: string;
}

export function filterEventsBySegment(
  events: EventLogEvent[],
  filter: SegmentFilter | null,
): EventLogEvent[] {
  if (!filter) return events;

  const { attributeKey, attributeValue } = filter;

  const matchingCaseIds = new Set<string>();
  for (const e of events) {
    if (e.attributes?.[attributeKey] === attributeValue) {
      matchingCaseIds.add(e.caseId);
    }
  }

  if (matchingCaseIds.size === 0) return [];

  return events.filter((e) => matchingCaseIds.has(e.caseId));
}
