import type {
  ProcessSidecar,
  ProcessMiningDataset,
  RawProcessMiningDataset,
} from '../domain/process';
import { getEvents, putEvents, deleteEvents, listEventKeys } from './indexedDbEventStore';
import { maybeExternalizeEvents } from '../mining/externalizeEvents';
import { listAllVersions } from './repositories/versionsRepo';

export interface ReExternalizeOptions {
  enabled: boolean;
  threshold: number;
}

type AnyDataset = ProcessMiningDataset | RawProcessMiningDataset;

async function cloneDataset(dataset: AnyDataset): Promise<AnyDataset> {
  const copy = structuredClone(dataset);

  if (copy.eventsRef) {
    const originalKey = copy.eventsRef.key;
    const events = await getEvents(originalKey);

    if (events === null) {
      throw new Error(
        `eventBlobLifecycle: cannot clone dataset "${dataset.id}" – eventsRef key "${originalKey}" not found in IndexedDB`
      );
    }

    const freshKey = crypto.randomUUID();
    await putEvents(freshKey, events);

    copy.eventsRef = {
      ...copy.eventsRef,
      key: freshKey,
      createdAt: new Date().toISOString(),
    };
  }

  return copy;
}

async function materializeDataset(dataset: AnyDataset): Promise<AnyDataset> {
  if (!dataset.eventsRef) {
    return structuredClone(dataset);
  }

  const key = dataset.eventsRef.key;
  const events = await getEvents(key);

  if (events === null) {
    throw new Error(
      `eventBlobLifecycle: cannot materialize dataset "${dataset.id}" – eventsRef key "${key}" not found in IndexedDB`
    );
  }

  const copy = structuredClone(dataset);
  copy.events = events;
  delete copy.eventsRef;
  return copy;
}

async function reExternalizeDataset(
  dataset: AnyDataset,
  options: ReExternalizeOptions
): Promise<AnyDataset> {
  if (dataset.eventsRef) {
    const hasInlineEvents = Array.isArray(dataset.events) && dataset.events.length > 0;

    if (!hasInlineEvents) {
      throw new Error(
        `eventBlobLifecycle: dataset "${dataset.id}" has eventsRef but no inline events – ` +
          `this bundle is not portable (externalized mining data references without event payload)`
      );
    }

    const copy = structuredClone(dataset);
    delete copy.eventsRef;

    const result = await maybeExternalizeEvents({
      datasetId: copy.id,
      events: copy.events,
      enabled: options.enabled,
      threshold: options.threshold,
    });

    copy.events = result.events;
    if (result.eventsRef) {
      copy.eventsRef = result.eventsRef;
    } else {
      delete copy.eventsRef;
    }
    return copy;
  }

  const result = await maybeExternalizeEvents({
    datasetId: dataset.id,
    events: dataset.events,
    enabled: options.enabled,
    threshold: options.threshold,
  });

  const copy = structuredClone(dataset);
  copy.events = result.events;
  if (result.eventsRef) {
    copy.eventsRef = result.eventsRef;
  } else {
    delete copy.eventsRef;
  }
  return copy;
}

export async function cloneMiningSidecarEventBlobs(
  sidecar: ProcessSidecar
): Promise<ProcessSidecar> {
  const copy = structuredClone(sidecar);

  if (copy.processMining?.datasets && copy.processMining.datasets.length > 0) {
    copy.processMining = {
      ...copy.processMining,
      datasets: await Promise.all(
        copy.processMining.datasets.map((ds) => cloneDataset(ds))
      ) as typeof copy.processMining.datasets,
    };
  }

  if (
    copy.processMiningAssisted?.datasets &&
    copy.processMiningAssisted.datasets.length > 0
  ) {
    copy.processMiningAssisted = {
      ...copy.processMiningAssisted,
      datasets: await Promise.all(
        copy.processMiningAssisted.datasets.map((ds) => cloneDataset(ds))
      ) as typeof copy.processMiningAssisted.datasets,
    };
  }

  return copy;
}

export async function materializeMiningSidecarEventBlobs(
  sidecar: ProcessSidecar
): Promise<ProcessSidecar> {
  const copy = structuredClone(sidecar);

  if (copy.processMining?.datasets && copy.processMining.datasets.length > 0) {
    copy.processMining = {
      ...copy.processMining,
      datasets: await Promise.all(
        copy.processMining.datasets.map((ds) => materializeDataset(ds))
      ) as typeof copy.processMining.datasets,
    };
  }

  if (
    copy.processMiningAssisted?.datasets &&
    copy.processMiningAssisted.datasets.length > 0
  ) {
    copy.processMiningAssisted = {
      ...copy.processMiningAssisted,
      datasets: await Promise.all(
        copy.processMiningAssisted.datasets.map((ds) => materializeDataset(ds))
      ) as typeof copy.processMiningAssisted.datasets,
    };
  }

  return copy;
}

export async function reExternalizeMiningSidecarEventBlobs(
  sidecar: ProcessSidecar,
  options: ReExternalizeOptions
): Promise<ProcessSidecar> {
  const copy = structuredClone(sidecar);

  if (copy.processMining?.datasets && copy.processMining.datasets.length > 0) {
    copy.processMining = {
      ...copy.processMining,
      datasets: await Promise.all(
        copy.processMining.datasets.map((ds) => reExternalizeDataset(ds, options))
      ) as typeof copy.processMining.datasets,
    };
  }

  if (
    copy.processMiningAssisted?.datasets &&
    copy.processMiningAssisted.datasets.length > 0
  ) {
    copy.processMiningAssisted = {
      ...copy.processMiningAssisted,
      datasets: await Promise.all(
        copy.processMiningAssisted.datasets.map((ds) => reExternalizeDataset(ds, options))
      ) as typeof copy.processMiningAssisted.datasets,
    };
  }

  return copy;
}

export function extractReferencedEventBlobKeysFromSidecar(sidecar: ProcessSidecar): Set<string> {
  const keys = new Set<string>();

  for (const ds of sidecar.processMining?.datasets ?? []) {
    if (ds.eventsRef?.key) {
      keys.add(ds.eventsRef.key);
    }
  }

  for (const ds of sidecar.processMiningAssisted?.datasets ?? []) {
    if (ds.eventsRef?.key) {
      keys.add(ds.eventsRef.key);
    }
  }

  return keys;
}

export async function collectReferencedEventBlobKeys(): Promise<Set<string>> {
  const versions = await listAllVersions();
  const keys = new Set<string>();

  for (const version of versions) {
    const sidecarKeys = extractReferencedEventBlobKeysFromSidecar(version.sidecar);
    for (const key of sidecarKeys) {
      keys.add(key);
    }
  }

  return keys;
}

export async function sweepOrphanedEventBlobs(): Promise<{
  deletedKeys: string[];
  keptKeys: string[];
}> {
  const [referencedKeys, storedKeys] = await Promise.all([
    collectReferencedEventBlobKeys(),
    listEventKeys(),
  ]);

  const deletedKeys: string[] = [];
  const keptKeys: string[] = [];

  for (const key of storedKeys) {
    if (referencedKeys.has(key)) {
      keptKeys.push(key);
    } else {
      await deleteEvents(key);
      deletedKeys.push(key);
    }
  }

  return { deletedKeys, keptKeys };
}
