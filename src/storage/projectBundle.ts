import type { Project, Process, ProcessVersion } from '../domain/process';
import { getProject, createProject, listProjects } from './repositories/projectsRepo';
import { listProcesses, createProcess, updateProcess } from './repositories/processesRepo';
import { listVersions, putVersionRaw } from './repositories/versionsRepo';
import { materializeMiningSidecarEventBlobs, reExternalizeMiningSidecarEventBlobs } from './eventBlobLifecycle';
import { loadAppSettings } from '../settings/appSettings';

export type ProjectBundleSchemaVersion = 'project-bundle-v1';

export interface ProjectBundleV1 {
  schemaVersion: ProjectBundleSchemaVersion;
  exportedAt: string;
  project: Project;
  processes: Process[];
  versions: ProcessVersion[];
}

export async function exportProjectBundle(projectId: string): Promise<ProjectBundleV1> {
  const project = await getProject(projectId);
  if (!project) {
    throw new Error('Projekt nicht gefunden. Export abgebrochen.');
  }

  const processes = await listProcesses(projectId);
  processes.sort((a, b) => a.title.localeCompare(b.title, 'de'));

  const versions: ProcessVersion[] = [];
  for (const proc of processes) {
    const procVersions = await listVersions(proc.processId);
    procVersions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (const v of procVersions) {
      const cloned = structuredClone(v);
      try {
        cloned.sidecar = await materializeMiningSidecarEventBlobs(cloned.sidecar);
      } catch (err) {
        throw new Error(
          `Export abgebrochen: Mining-Dataset in Version "${v.versionId}" (Prozess "${proc.title}") konnte nicht materialisiert werden – ` +
          `${err instanceof Error ? err.message : String(err)}`
        );
      }
      versions.push(cloned);
    }
  }

  versions.sort((a, b) => {
    const p = a.processId.localeCompare(b.processId);
    if (p !== 0) return p;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return {
    schemaVersion: 'project-bundle-v1',
    exportedAt: new Date().toISOString(),
    project,
    processes,
    versions,
  };
}

export function parseProjectBundle(jsonText: string): ProjectBundleV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Import-Datei ist kein gültiges Projekt-Bundle (project-bundle-v1).');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Import-Datei ist kein gültiges Projekt-Bundle (project-bundle-v1).');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.schemaVersion !== 'project-bundle-v1') {
    throw new Error('Import-Datei ist kein gültiges Projekt-Bundle (project-bundle-v1).');
  }

  if (typeof obj.exportedAt !== 'string' || !obj.exportedAt) {
    throw new Error('Import-Datei ist kein gültiges Projekt-Bundle (project-bundle-v1).');
  }

  if (typeof obj.project !== 'object' || obj.project === null) {
    throw new Error('Import-Datei ist kein gültiges Projekt-Bundle (project-bundle-v1).');
  }

  const project = obj.project as Record<string, unknown>;
  if (typeof project.name !== 'string') {
    throw new Error('Import-Datei ist kein gültiges Projekt-Bundle (project-bundle-v1).');
  }

  if (!Array.isArray(obj.processes)) {
    throw new Error('Import-Datei ist kein gültiges Projekt-Bundle (project-bundle-v1).');
  }

  if (!Array.isArray(obj.versions)) {
    throw new Error('Import-Datei ist kein gültiges Projekt-Bundle (project-bundle-v1).');
  }

  return parsed as ProjectBundleV1;
}

export interface ImportProjectBundleResult {
  projectId: string;
  importedProcessCount: number;
  importedVersionCount: number;
  warnings: string[];
}

export async function importProjectBundleAsNewProject(
  bundle: ProjectBundleV1
): Promise<ImportProjectBundleResult> {
  const warnings: string[] = [];

  if (bundle.versions.some((v) => v.bpmn?.bpmnXml)) {
    warnings.push('Hinweis: BPMN-XML wurde übernommen. Bei Bedarf bitte neu generieren, da IDs aus dem Quellsystem stammen können.');
  }

  const baseName = bundle.project.name.trim() || 'Projekt';
  const existingProjects = await listProjects();
  const existingNamesLower = new Set(existingProjects.map((p) => p.name.toLowerCase()));

  let name = baseName;
  if (existingNamesLower.has(baseName.toLowerCase())) {
    const dateStamp = new Date().toISOString().slice(0, 10);
    name = `${baseName} (Import ${dateStamp})`;
    warnings.push(`Projektname existierte bereits. Neuer Name: "${name}".`);
  }

  const description = bundle.project.description;
  const newProject = await createProject(name, description);

  const processIdMap = new Map<string, string>();
  const newTitleByOldProcessId = new Map<string, string>();

  for (const proc of bundle.processes) {
    const title = proc.title.trim() || 'Prozess';
    const newProc = await createProcess(newProject.projectId, {
      title,
      category: proc.category,
      managementLevel: proc.managementLevel,
      hierarchyLevel: proc.hierarchyLevel,
      parentProcessId: null,
    });

    const metaPatch: Partial<Process> = {};
    if (proc.description) metaPatch.description = proc.description;
    if (Array.isArray(proc.editors) && proc.editors.length > 0) metaPatch.editors = proc.editors;
    if (Array.isArray(proc.tags) && proc.tags.length > 0) metaPatch.tags = proc.tags;
    if (proc.raci && typeof proc.raci === 'object') metaPatch.raci = proc.raci;

    if (Object.keys(metaPatch).length > 0) {
      await updateProcess(newProc.processId, metaPatch);
    }

    processIdMap.set(proc.processId, newProc.processId);
    newTitleByOldProcessId.set(proc.processId, title);
  }

  for (const proc of bundle.processes) {
    if (!proc.parentProcessId) continue;

    const childNewId = processIdMap.get(proc.processId);
    const parentNewId = processIdMap.get(proc.parentProcessId);

    if (!childNewId) {
      warnings.push('Import: Prozess-Mapping fehlgeschlagen (child).');
      continue;
    }

    if (!parentNewId) {
      warnings.push(`Import: parentProcessId konnte nicht aufgelöst werden und wurde entfernt (Prozess: "${proc.title}").`);
      continue;
    }

    await updateProcess(childNewId, { parentProcessId: parentNewId });
  }

  const appSettings = loadAppSettings();
  const reExternalizeOptions = {
    enabled: appSettings.processMining?.externalizeEvents ?? false,
    threshold: appSettings.processMining?.externalizeThreshold ?? 150000,
  };

  let importedVersionCount = 0;
  for (const v of bundle.versions) {
    const newProcessId = processIdMap.get(v.processId);
    if (!newProcessId) {
      warnings.push('Import: Version referenziert einen Prozess, der nicht im Bundle importiert wurde. Version wurde übersprungen.');
      continue;
    }

    const cloned = structuredClone(v);
    cloned.processId = newProcessId;
    cloned.id = `${newProcessId}:${cloned.versionId}`;
    cloned.titleSnapshot = newTitleByOldProcessId.get(v.processId) ?? cloned.titleSnapshot;

    if (cloned.sidecar?.captureDraft && !cloned.sidecar.captureDraft.draftVersion) {
      cloned.sidecar.captureDraft.draftVersion = 'capture-draft-v1';
      warnings.push('Import: draftVersion fehlte in einer Version und wurde ergänzt.');
    }

    try {
      cloned.sidecar = await reExternalizeMiningSidecarEventBlobs(cloned.sidecar, reExternalizeOptions);
    } catch (err) {
      throw new Error(
        `Import abgebrochen: Mining-Dataset in Version "${v.versionId}" konnte nicht re-externalisiert werden – ` +
        `${err instanceof Error ? err.message : String(err)}`
      );
    }

    await putVersionRaw(cloned);
    importedVersionCount++;
  }

  return {
    projectId: newProject.projectId,
    importedProcessCount: bundle.processes.length,
    importedVersionCount,
    warnings,
  };
}
