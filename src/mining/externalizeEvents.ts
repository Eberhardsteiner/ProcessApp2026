import type { EventLogEvent, ProcessMiningDatasetEventsRef } from '../domain/process';
import { putEvents, isIndexedDbAvailable } from '../storage/indexedDbEventStore';

export interface ExternalizeEventsParams {
  datasetId: string;
  events: EventLogEvent[];
  enabled: boolean;
  threshold: number;
}

export interface ExternalizeEventsResult {
  events: EventLogEvent[];
  eventsRef?: ProcessMiningDatasetEventsRef;
}

export async function maybeExternalizeEvents(
  params: ExternalizeEventsParams
): Promise<ExternalizeEventsResult> {
  const { events, enabled, threshold } = params;

  if (!enabled || events.length < threshold) {
    return { events, eventsRef: undefined };
  }

  if (!isIndexedDbAvailable()) {
    console.warn('IndexedDB not available, falling back to in-memory storage');
    return { events, eventsRef: undefined };
  }

  try {
    const key = crypto.randomUUID();
    await putEvents(key, events);

    const eventsRef: ProcessMiningDatasetEventsRef = {
      store: 'indexeddb',
      key,
      eventCount: events.length,
      createdAt: new Date().toISOString(),
    };

    return { events: [], eventsRef };
  } catch (err) {
    console.error('Failed to externalize events:', err);
    return { events, eventsRef: undefined };
  }
}
