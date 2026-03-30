import type {
  ProcessVersion,
  ProcessStatus,
  EndToEndDefinition,
  ProcessSidecar,
  ModelQuality,
} from '../../domain/process';
import type { CaptureProgress } from '../../domain/capture';
import type { BpmnModelRef } from '../../domain/bpmn';
import { createInitialCaptureProgress } from '../../domain/capture';
import { createInitialBpmnModelRef } from '../../domain/bpmn';
import { withStore, withIndex } from '../indexedDb';
import { cloneMiningSidecarEventBlobs } from '../eventBlobLifecycle';

export interface CreateVersionInput {
  status?: ProcessStatus;
  titleSnapshot: string;
  endToEndDefinition: EndToEndDefinition;
  sidecar?: Partial<ProcessSidecar>;
  bpmn?: Partial<BpmnModelRef>;
  quality?: Partial<ModelQuality>;
  captureProgress?: Partial<CaptureProgress>;
}

export interface CloneVersionInput {
  titleSnapshot: string;
  status?: ProcessStatus;
  resetBpmnXml?: boolean;
}

function createDefaultSidecar(): ProcessSidecar {
  return {
    roles: [],
    systems: [],
    dataObjects: [],
    kpis: [],
    improvementBacklog: [],
    evidenceSources: [],
    aiImportNotes: [],
  };
}

function createDefaultQuality(): ModelQuality {
  return {
    syntaxFindings: [],
    semanticQuestions: [],
    namingFindings: [],
  };
}

export async function createVersion(
  processId: string,
  input: CreateVersionInput
): Promise<ProcessVersion> {
  const now = new Date().toISOString();
  const versionId = crypto.randomUUID();

  const version: ProcessVersion = {
    id: `${processId}:${versionId}`,
    processId,
    versionId,
    status: input.status ?? 'draft',
    createdAt: now,
    updatedAt: now,
    titleSnapshot: input.titleSnapshot,
    endToEndDefinition: input.endToEndDefinition,
    bpmn: {
      ...createInitialBpmnModelRef(),
      ...input.bpmn,
    },
    sidecar: {
      ...createDefaultSidecar(),
      ...input.sidecar,
    },
    quality: {
      ...createDefaultQuality(),
      ...input.quality,
    },
    captureProgress: {
      ...createInitialCaptureProgress(),
      ...input.captureProgress,
    },
  };

  await withStore('processVersions', 'readwrite', (store) => store.add(version));
  return version;
}

export async function listVersions(processId: string): Promise<ProcessVersion[]> {
  return withIndex('processVersions', 'processId', (index) => index.getAll(processId));
}

export async function listAllVersions(): Promise<ProcessVersion[]> {
  return withStore('processVersions', 'readonly', (store) => store.getAll());
}

export async function getVersion(processId: string, versionId: string): Promise<ProcessVersion | null> {
  const id = `${processId}:${versionId}`;
  const result = await withStore('processVersions', 'readonly', (store) => store.get(id));
  return result || null;
}

export async function getLatestVersion(processId: string): Promise<ProcessVersion | null> {
  const versions = await listVersions(processId);
  if (versions.length === 0) {
    return null;
  }

  versions.sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return versions[0];
}

export async function updateVersion(
  processId: string,
  versionId: string,
  patch: Partial<Omit<ProcessVersion, 'id' | 'processId' | 'versionId' | 'createdAt'>>
): Promise<ProcessVersion> {
  const existing = await getVersion(processId, versionId);
  if (!existing) {
    throw new Error(`Version ${versionId} für Prozess ${processId} nicht gefunden`);
  }

  const updated: ProcessVersion = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await withStore('processVersions', 'readwrite', (store) => store.put(updated));
  return updated;
}

export async function putVersionRaw(version: ProcessVersion): Promise<ProcessVersion> {
  await withStore('processVersions', 'readwrite', (store) => store.put(version));
  return version;
}

export async function cloneVersion(
  processId: string,
  sourceVersionId: string,
  input: CloneVersionInput
): Promise<ProcessVersion> {
  const source = await getVersion(processId, sourceVersionId);
  if (!source) {
    throw new Error('Quelle für Duplikat nicht gefunden.');
  }

  const sidecarCopy = await cloneMiningSidecarEventBlobs(source.sidecar);
  const qualityCopy = structuredClone(source.quality);
  const captureProgressCopy = structuredClone(source.captureProgress);
  const bpmnCopy = structuredClone(source.bpmn);

  if (input.resetBpmnXml !== false) {
    delete bpmnCopy.bpmnXml;
    delete bpmnCopy.lastExportedAt;
  }

  return await createVersion(processId, {
    status: input.status ?? 'draft',
    titleSnapshot: input.titleSnapshot,
    endToEndDefinition: structuredClone(source.endToEndDefinition),
    sidecar: sidecarCopy,
    quality: qualityCopy,
    captureProgress: captureProgressCopy,
    bpmn: bpmnCopy,
  });
}
