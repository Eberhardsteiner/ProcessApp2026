const DB_NAME = 'process-advisor';
const DB_VERSION = 1;

let dbInstancePromise: Promise<IDBDatabase> | null = null;

export async function openDb(): Promise<IDBDatabase> {
  if (dbInstancePromise) {
    return dbInstancePromise;
  }

  dbInstancePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      const errorName = request.error?.name || 'UnknownError';
      const errorMessage = request.error?.message || 'Keine Details verfügbar';
      reject(new Error(`IndexedDB öffnen fehlgeschlagen [${errorName}]: ${errorMessage}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'projectId' });
      }

      if (!db.objectStoreNames.contains('processes')) {
        const processesStore = db.createObjectStore('processes', { keyPath: 'processId' });
        processesStore.createIndex('projectId', 'projectId', { unique: false });
      }

      if (!db.objectStoreNames.contains('processVersions')) {
        const versionsStore = db.createObjectStore('processVersions', { keyPath: 'id' });
        versionsStore.createIndex('processId', 'processId', { unique: false });
      }
    };
  });

  return dbInstancePromise;
}

export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  const transaction = db.transaction(storeName, mode);
  const store = transaction.objectStore(storeName);
  const request = callback(store);

  return new Promise((resolve, reject) => {
    let result: T;

    request.onsuccess = () => {
      result = request.result;
      if (mode === 'readonly') {
        resolve(result);
      }
    };

    request.onerror = () => {
      const errorName = request.error?.name || 'UnknownError';
      const errorMessage = request.error?.message || 'Keine Details verfügbar';
      reject(
        new Error(
          `IndexedDB-Operation fehlgeschlagen [${errorName}] (${storeName}): ${errorMessage}`
        )
      );
    };

    if (mode === 'readwrite' || mode === 'versionchange') {
      transaction.oncomplete = () => {
        resolve(result);
      };

      transaction.onerror = () => {
        const errorName = transaction.error?.name || 'UnknownError';
        const errorMessage = transaction.error?.message || 'Keine Details verfügbar';
        reject(
          new Error(
            `IndexedDB-Transaktion fehlgeschlagen [${errorName}] (${storeName}): ${errorMessage}`
          )
        );
      };
    }
  });
}

export async function withIndex<T>(
  storeName: string,
  indexName: string,
  callback: (index: IDBIndex) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  const transaction = db.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  const index = store.index(indexName);
  const request = callback(index);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      const errorName = request.error?.name || 'UnknownError';
      const errorMessage = request.error?.message || 'Keine Details verfügbar';
      reject(
        new Error(
          `IndexedDB-Index-Operation fehlgeschlagen [${errorName}] (${storeName}.${indexName}): ${errorMessage}`
        )
      );
    };
  });
}
