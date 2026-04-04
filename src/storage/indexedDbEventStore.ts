import type { EventLogEvent } from '../domain/process';

const DB_NAME = 'process-mining-events';
const STORE_NAME = 'events';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

async function openDb(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function putEvents(key: string, events: EventLogEvent[]): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(events, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to store events'));
    });
  } catch (err) {
    throw new Error(`Failed to put events: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function getEvents(key: string): Promise<EventLogEvent[] | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result || null);
      };
      request.onerror = () => reject(new Error('Failed to retrieve events'));
    });
  } catch (err) {
    throw new Error(`Failed to get events: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function deleteEvents(key: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to delete events'));
    });
  } catch (err) {
    throw new Error(`Failed to delete events: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function listEventKeys(): Promise<string[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(new Error('Failed to list event keys'));
    });
  } catch (err) {
    throw new Error(`Failed to list event keys: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}
