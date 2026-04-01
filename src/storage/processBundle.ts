import type { Process, ProcessVersion } from '../domain/process';
import { getProcess, createProcess, listProcesses, updateProcess } from './repositories/processesRepo';
import { listVersions, putVersionRaw, createVersion } from './repositories/versionsRepo';
import { materializeMiningSidecarEventBlobs, reExternalizeMiningSidecarEventBlobs } from './eventBlobLifecycle';
import { loadAppSettings } from '../settings/appSettings';

export type ProcessBundleSchemaVersion = 'process-bundle-v1';

export interface ProcessBundleV1 {
  schemaVersion: ProcessBundleSchemaVersion;
  exportedAt: string;
  process: Process;
  versions: ProcessVersion[];
}

export async function exportProcessBundle(processId: string): Promise<ProcessBundleV1> {
  const process = await getProcess(processId);
  if (!process) {
    throw new Error('Prozess nicht gefunden. Export abgebrochen.');
  }

  const versions = await listVersions(processId);
  versions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const materializedVersions: ProcessVersion[] = [];
  for (const v of versions) {
    const cloned = structuredClone(v);
    try {
      cloned.sidecar = await materializeMiningSidecarEventBlobs(cloned.sidecar);
    } catch (err) {
      throw new Error(
        `Export abgebrochen: Mining-Dataset in Version "${v.versionId}" konnte nicht materialisiert werden – ` +
        `${err instanceof Error ? err.message : String(err)}`
      );
    }
    materializedVersions.push(cloned);
  }

  return {
    schemaVersion: 'process-bundle-v1',
    exportedAt: new Date().toISOString(),
    process,
    versions: materializedVersions,
  };
}

export function parseProcessBundle(jsonText: string): ProcessBundleV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Import-Datei ist kein gültiges Prozess-Bundle (process-bundle-v1).');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Import-Datei ist kein gültiges Prozess-Bundle (process-bundle-v1).');
  }

  const bundle = parsed as Record<string, unknown>;

  if (bundle.schemaVersion !== 'process-bundle-v1') {
    throw new Error('Import-Datei ist kein gültiges Prozess-Bundle (process-bundle-v1).');
  }

  if (typeof bundle.exportedAt !== 'string' || !bundle.exportedAt) {
    throw new Error('Import-Datei ist kein gültiges Prozess-Bundle (process-bundle-v1).');
  }

  if (!bundle.process || typeof bundle.process !== 'object') {
    throw new Error('Import-Datei ist kein gültiges Prozess-Bundle (process-bundle-v1).');
  }

  const process = bundle.process as Record<string, unknown>;
  if (typeof process.title !== 'string') {
    throw new Error('Import-Datei ist kein gültiges Prozess-Bundle (process-bundle-v1).');
  }

  if (!Array.isArray(bundle.versions)) {
    throw new Error('Import-Datei ist kein gültiges Prozess-Bundle (process-bundle-v1).');
  }

  return parsed as ProcessBundleV1;
}

export interface ImportProcessBundleResult {
  processId: string;
  importedVersionCount: number;
  warnings: string[];
}

export async function importProcessBundleToProject(
  targetProjectId: string,
  bundle: ProcessBundleV1
): Promise<ImportProcessBundleResult> {
  const warnings: string[] = [];

  if (bundle.process.parentProcessId) {
    warnings.push('Hinweis: parentProcessId wird beim Import entfernt, da nur ein einzelner Prozess importiert wird.');
  }

  if (bundle.versions.some((v) => v.bpmn?.bpmnXml)) {
    warnings.push('Hinweis: BPMN-XML wurde übernommen. Bei Bedarf bitte neu generieren, da IDs aus dem Quellsystem stammen können.');
  }

  const baseTitle = bundle.process.title.trim() || 'Prozess';
  const existingProcesses = await listProcesses(targetProjectId);
  const existingTitles = existingProcesses.map((p) => p.title.toLowerCase());

  let title = baseTitle;
  if (existingTitles.includes(baseTitle.toLowerCase())) {
    const dateStamp = new Date().toISOString().slice(0, 10);
    title = `${baseTitle} (Import ${dateStamp})`;
    warnings.push(`Prozesstitel existierte bereits. Neuer Titel: "${title}".`);
  }

  const newProcess = await createProcess(targetProjectId, {
    title,
    category: bundle.process.category,
    managementLevel: bundle.process.managementLevel,
    hierarchyLevel: bundle.process.hierarchyLevel,
    parentProcessId: null,
  });

  const metaPatch: Partial<Process> = {};
  if (bundle.process.description) metaPatch.description = bundle.process.description;
  if (Array.isArray(bundle.process.editors) && bundle.process.editors.length > 0) metaPatch.editors = bundle.process.editors;
  if (Array.isArray(bundle.process.tags) && bundle.process.tags.length > 0) metaPatch.tags = bundle.process.tags;
  if (bundle.process.raci && typeof bundle.process.raci === 'object') metaPatch.raci = bundle.process.raci;

  if (Object.keys(metaPatch).length > 0) {
    await updateProcess(newProcess.processId, metaPatch);
  }

  if (bundle.versions.length === 0) {
    warnings.push('Bundle enthält keine Versionen. Es wurde eine leere Draft-Version angelegt.');
    await createVersion(newProcess.processId, {
      status: 'draft',
      titleSnapshot: title,
      endToEndDefinition: { trigger: '', customer: '', outcome: '' },
    });
    return {
      processId: newProcess.processId,
      importedVersionCount: 1,
      warnings,
    };
  }

  const appSettings = loadAppSettings();
  const reExternalizeOptions = {
    enabled: appSettings.processMining?.externalizeEvents ?? false,
    threshold: appSettings.processMining?.externalizeThreshold ?? 150000,
  };

  for (const v of bundle.versions) {
    const cloned = structuredClone(v);
    cloned.processId = newProcess.processId;
    cloned.id = `${newProcess.processId}:${cloned.versionId}`;
    cloned.titleSnapshot = title;

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
  }

  return {
    processId: newProcess.processId,
    importedVersionCount: bundle.versions.length,
    warnings,
  };
}
