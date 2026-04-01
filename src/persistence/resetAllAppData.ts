export const APP_RESET_SCOPE_NOTE =
  'Löscht lokale App-Daten (localStorage, sessionStorage, IndexedDB) auf diesem Gerät. Server-/API-Daten werden nicht gelöscht.';

const APP_LOCAL_STORAGE_KEYS: string[] = [
  'process-app-settings-v1',
  'pm.workspace.view',
  'assisted.context.subtab',
  'pm.dataImport.tab',
  'pm.drift.tab',
  'pm.conformance.tab',
  'pm.performance.tab',
  'pm.drift.mode',
  'pm.drift.a',
  'pm.drift.b',
  'pm.drift.slice.start',
  'pm.drift.slice.end',
  'pm.discovery.tab',
  'pm.drift.slice.grain',
  'pm.discovery.mode',
  'pm.discovery.minEdgeShare',
  'pm.discovery.maxExtraBranches',
  'pm.discovery.includeLoops',
  'pm.discovery.restrictToTopPath',
  'pm.discovery.maxSteps',
  'pm.discovery.minNodeCoverage',
  'pm.conformance.draftModel',
  'pm.perf.mode',
];

const APP_INDEXED_DB_NAMES: string[] = [
  'process-advisor',
  'process-mining-events',
];

const deleteIndexedDbDatabase = (name: string): Promise<void> =>
  new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });

export async function resetAllAppData(): Promise<void> {
  for (const key of APP_LOCAL_STORAGE_KEYS) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }

  try {
    const lsLen = localStorage.length;
    const pmKeys: string[] = [];
    for (let i = 0; i < lsLen; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('pm.') || k.startsWith('assisted.'))) {
        pmKeys.push(k);
      }
    }
    for (const k of pmKeys) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  try { sessionStorage.clear(); } catch { /* ignore */ }

  await Promise.all(APP_INDEXED_DB_NAMES.map(deleteIndexedDbDatabase));
}
