import type { EventLogEvent } from '../domain/process';
import { normalizeActivityKey } from './processMiningLite';

export interface EventLogStats {
  totalEvents: number;
  totalCases: number;
  distinctActivities: number;
  missingTimestampEvents: number;
  minTimestamp?: string;
  maxTimestamp?: string;
  eventsWithAttributes: number;
  distinctAttributeKeys: number;
  eventsWithResource: number;
  distinctResources: number;
  casesWithOutOfOrderTimestamps: number;
}

export function computeEventLogStats(events: EventLogEvent[]): EventLogStats {
  const MAX_ATTR_KEYS = 200;
  const MAX_RESOURCES = 500;

  const caseIds = new Set<string>();
  const activityKeys = new Set<string>();
  const attrKeys = new Set<string>();
  const resources = new Set<string>();

  let missingTimestampEvents = 0;
  let eventsWithAttributes = 0;
  let eventsWithResource = 0;
  let minMs = Infinity;
  let maxMs = -Infinity;

  const caseTimestamps = new Map<string, number[]>();

  for (const e of events) {
    caseIds.add(e.caseId);
    activityKeys.add(normalizeActivityKey(e.activity));

    if (!e.timestamp || Number.isNaN(Date.parse(e.timestamp))) {
      missingTimestampEvents++;
    } else {
      const ms = Date.parse(e.timestamp);
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;

      let arr = caseTimestamps.get(e.caseId);
      if (!arr) { arr = []; caseTimestamps.set(e.caseId, arr); }
      arr.push(ms);
    }

    if (e.resource) {
      eventsWithResource++;
      if (resources.size < MAX_RESOURCES) resources.add(e.resource);
    }

    if (e.attributes && Object.keys(e.attributes).length > 0) {
      eventsWithAttributes++;
      if (attrKeys.size < MAX_ATTR_KEYS) {
        for (const k of Object.keys(e.attributes)) {
          if (attrKeys.size >= MAX_ATTR_KEYS) break;
          attrKeys.add(k);
        }
      }
    }
  }

  let casesWithOutOfOrderTimestamps = 0;
  for (const tsList of caseTimestamps.values()) {
    if (tsList.length < 2) continue;
    for (let i = 0; i < tsList.length - 1; i++) {
      if (tsList[i] > tsList[i + 1]) {
        casesWithOutOfOrderTimestamps++;
        break;
      }
    }
  }

  const result: EventLogStats = {
    totalEvents: events.length,
    totalCases: caseIds.size,
    distinctActivities: activityKeys.size,
    missingTimestampEvents,
    eventsWithAttributes,
    distinctAttributeKeys: attrKeys.size,
    eventsWithResource,
    distinctResources: resources.size,
    casesWithOutOfOrderTimestamps,
  };

  if (minMs !== Infinity) result.minTimestamp = new Date(minMs).toISOString();
  if (maxMs !== -Infinity) result.maxTimestamp = new Date(maxMs).toISOString();

  return result;
}
