import type {
  MiningWorkerRequest,
  MiningWorkerRequestWithId,
  MiningWorkerResponse,
} from './miningWorkerProtocol';

const MAX_CACHE_ENTRIES = 60;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

class MiningWorkerClient {
  private worker: Worker | null = null;
  private workerAvailable = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private resultCache = new Map<string, unknown>();
  private inflightCache = new Map<string, Promise<unknown>>();
  private cacheInsertionOrder: string[] = [];
  private nextRequestId = 1;

  constructor() {
    this.initializeWorker();
  }

  private failAllPending(err: Error) {
    for (const [, pending] of this.pendingRequests) {
      try { pending.reject(err); } catch { /* intentional: reject must not throw */ }
    }
    this.pendingRequests.clear();

    this.inflightCache.clear();

    this.workerAvailable = false;

    if (this.worker) {
      try { this.worker.terminate(); } catch { /* intentional: terminate must not throw */ }
      this.worker = null;
    }
  }

  private initializeWorker() {
    try {
      this.worker = new Worker(
        new URL('../workers/miningWorker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event: MessageEvent<MiningWorkerResponse>) => {
        const response = event.data;
        const pending = this.pendingRequests.get(response.id);

        if (!pending) {
          console.warn('[MiningWorkerClient] Received response for unknown request:', response.id);
          return;
        }

        this.pendingRequests.delete(response.id);

        if (response.ok) {
          this.addToCache(response.cacheKey, response.result);
          this.inflightCache.delete(response.cacheKey);
          pending.resolve(response.result);
        } else {
          this.inflightCache.delete(response.cacheKey);
          pending.reject(new Error(response.error));
        }
      };

      this.worker.onerror = (error) => {
        console.error('[MiningWorkerClient] Worker error:', error);
        this.failAllPending(new Error('Mining worker crashed'));
        this.initializeWorker();
      };

      this.worker.onmessageerror = () => {
        this.failAllPending(new Error('Mining worker message error'));
      };

      this.workerAvailable = true;
    } catch (err) {
      console.warn('[MiningWorkerClient] Failed to initialize worker:', err);
      this.workerAvailable = false;
    }
  }

  private addToCache(cacheKey: string, result: unknown) {
    if (this.resultCache.has(cacheKey)) {
      return;
    }

    if (this.cacheInsertionOrder.length >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cacheInsertionOrder.shift();
      if (oldestKey) {
        this.resultCache.delete(oldestKey);
      }
    }

    this.resultCache.set(cacheKey, result);
    this.cacheInsertionOrder.push(cacheKey);
  }

  public runMiningTask<T>(request: MiningWorkerRequest): Promise<T> {
    const { cacheKey } = request;

    const cached = this.resultCache.get(cacheKey);
    if (cached !== undefined) {
      return Promise.resolve(cached as T);
    }

    const inflight = this.inflightCache.get(cacheKey);
    if (inflight) {
      return inflight as Promise<T>;
    }

    if (!this.workerAvailable || !this.worker) {
      return Promise.reject(
        new Error('Mining worker not available. Use fallback implementation.')
      );
    }

    const requestId = String(this.nextRequestId++);
    const requestWithId: MiningWorkerRequestWithId = {
      ...request,
      id: requestId,
    };

    const promise = new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve: resolve as (result: unknown) => void,
        reject,
      });

      this.worker!.postMessage(requestWithId);
    });

    this.inflightCache.set(cacheKey, promise);

    return promise;
  }

  public clearCache(prefix?: string) {
    if (!prefix) {
      this.resultCache.clear();
      this.cacheInsertionOrder = [];
      return;
    }

    const keysToRemove: string[] = [];
    for (const key of this.resultCache.keys()) {
      if (key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.resultCache.delete(key);
      const index = this.cacheInsertionOrder.indexOf(key);
      if (index !== -1) {
        this.cacheInsertionOrder.splice(index, 1);
      }
    }
  }

  public getCacheSize(): number {
    return this.resultCache.size;
  }

  public isWorkerAvailable(): boolean {
    return this.workerAvailable;
  }
}

const clientInstance = new MiningWorkerClient();

export function runMiningTask<T>(request: MiningWorkerRequest): Promise<T> {
  return clientInstance.runMiningTask<T>(request);
}

export function clearMiningWorkerCache(prefix?: string): void {
  clientInstance.clearCache(prefix);
}

export function getMiningWorkerCacheSize(): number {
  return clientInstance.getCacheSize();
}

export function isMiningWorkerAvailable(): boolean {
  return clientInstance.isWorkerAvailable();
}
