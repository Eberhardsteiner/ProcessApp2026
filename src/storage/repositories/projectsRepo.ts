import type { Project } from '../../domain/process';
import { withStore } from '../indexedDb';

export async function createProject(name: string, description?: string): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = {
    projectId: crypto.randomUUID(),
    name,
    description,
    createdAt: now,
    updatedAt: now,
  };

  await withStore('projects', 'readwrite', (store) => store.add(project));
  return project;
}

export async function listProjects(): Promise<Project[]> {
  return withStore('projects', 'readonly', (store) => store.getAll());
}

export async function getProject(projectId: string): Promise<Project | null> {
  const result = await withStore('projects', 'readonly', (store) => store.get(projectId));
  return result || null;
}

export async function updateProject(
  projectId: string,
  patch: Partial<Omit<Project, 'projectId' | 'createdAt'>>
): Promise<Project> {
  const existing = await getProject(projectId);
  if (!existing) {
    throw new Error(`Projekt mit ID ${projectId} nicht gefunden`);
  }

  const updated: Project = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await withStore('projects', 'readwrite', (store) => store.put(updated));
  return updated;
}
