import type {
  Process,
  ProcessCategory,
  ProcessManagementLevel,
  ProcessHierarchyLevel,
} from '../../domain/process';
import { withStore, withIndex } from '../indexedDb';

export interface CreateProcessInput {
  title: string;
  category: ProcessCategory;
  managementLevel: ProcessManagementLevel;
  hierarchyLevel: ProcessHierarchyLevel;
  parentProcessId?: string | null;
}

export async function createProcess(
  projectId: string,
  input: CreateProcessInput
): Promise<Process> {
  const now = new Date().toISOString();
  const process: Process = {
    processId: crypto.randomUUID(),
    projectId,
    title: input.title,
    category: input.category,
    managementLevel: input.managementLevel,
    hierarchyLevel: input.hierarchyLevel,
    parentProcessId: input.parentProcessId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await withStore('processes', 'readwrite', (store) => store.add(process));
  return process;
}

export async function listProcesses(projectId: string): Promise<Process[]> {
  return withIndex('processes', 'projectId', (index) => index.getAll(projectId));
}

export async function getProcess(processId: string): Promise<Process | null> {
  const result = await withStore('processes', 'readonly', (store) => store.get(processId));
  return result || null;
}

export async function updateProcess(
  processId: string,
  patch: Partial<Omit<Process, 'processId' | 'projectId' | 'createdAt'>>
): Promise<Process> {
  const existing = await getProcess(processId);
  if (!existing) {
    throw new Error(`Prozess mit ID ${processId} nicht gefunden`);
  }

  const updated: Process = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await withStore('processes', 'readwrite', (store) => store.put(updated));
  return updated;
}
