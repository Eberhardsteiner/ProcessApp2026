import type { Process, ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import { APP_SEMVER, APP_VERSION_LABEL } from '../../config/release';
import type { PilotReadinessSummary } from './pilotReadiness';
import { hardenWorkspaceState } from './workspaceIntegrity';

const VALID_STEPS = new Set<ProcessMiningAssistedV2State['currentStep']>([
  'observations',
  'discovery',
  'conformance',
  'enhancement',
  'augmentation',
]);

export interface WorkspaceSnapshotFile {
  schemaVersion: 'pm-assisted-v2-snapshot';
  exportedAt: string;
  appVersion: string;
  process: {
    processId: string;
    title: string;
    versionId?: string;
    versionLabel?: string;
  };
  readiness?: {
    level: PilotReadinessSummary['level'];
    levelLabel: string;
    score: number;
    headline: string;
  };
  state: ProcessMiningAssistedV2State;
}

export interface ParsedWorkspaceSnapshot {
  metadata: {
    title: string;
    exportedAt: string;
    sourceVersion?: string;
    versionLabel?: string;
  };
  state: ProcessMiningAssistedV2State;
  warnings: string[];
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function sanitizeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9äöüß_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'pm-workspace';
}

export function buildWorkspaceSnapshot(params: {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  readiness: PilotReadinessSummary;
}): WorkspaceSnapshotFile {
  const { process, version, state, readiness } = params;
  return {
    schemaVersion: 'pm-assisted-v2-snapshot',
    exportedAt: new Date().toISOString(),
    appVersion: `${APP_VERSION_LABEL} (${APP_SEMVER})`,
    process: {
      processId: process.processId,
      title: process.title,
      versionId: version.versionId,
      versionLabel: version.versionLabel,
    },
    readiness: {
      level: readiness.level,
      levelLabel: readiness.levelLabel,
      score: readiness.score,
      headline: readiness.headline,
    },
    state: VALID_STEPS.has(state.currentStep) ? state : { ...state, currentStep: 'observations' },
  };
}

export function serializeWorkspaceSnapshot(snapshot: WorkspaceSnapshotFile): string {
  return JSON.stringify(snapshot, null, 2);
}

export function downloadWorkspaceSnapshot(snapshot: WorkspaceSnapshotFile): void {
  const content = serializeWorkspaceSnapshot(snapshot);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFilename(snapshot.process.title)}-${snapshot.readiness?.level ?? 'snapshot'}.pm-workspace.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function parseWorkspaceSnapshotText(text: string): ParsedWorkspaceSnapshot {
  const raw = JSON.parse(text) as Partial<WorkspaceSnapshotFile> | undefined;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Die Datei enthält keinen lesbaren JSON-Arbeitsstand.');
  }
  if (raw.schemaVersion !== 'pm-assisted-v2-snapshot') {
    throw new Error('Die Datei ist kein unterstützter PM-Arbeitsstand der App.');
  }

  const warnings: string[] = [];
  const hardened = hardenWorkspaceState(raw.state);
  const state = hardened.state;
  warnings.push(...hardened.report.issues.map(issue => issue.message));
  if (state.cases.length === 0 && state.observations.length === 0) {
    warnings.push('Der importierte Arbeitsstand enthält keine Fälle oder erkannten Schritte.');
  }
  if (!state.reportSnapshot) {
    warnings.push('Im importierten Arbeitsstand war noch kein Bericht gespeichert.');
  }
  if (!state.reviewState?.normalizationRules?.length && !state.reviewState?.repairJournal?.length) {
    warnings.push('Der importierte Arbeitsstand enthält noch keine gemerkten Reparaturen oder Vereinheitlichungsregeln.');
  }

  return {
    metadata: {
      title: safeString(raw.process?.title, 'Unbenannter PM-Arbeitsstand'),
      exportedAt: safeString(raw.exportedAt, new Date().toISOString()),
      sourceVersion: safeString(raw.appVersion, APP_VERSION_LABEL),
      versionLabel: safeString(raw.process?.versionLabel, ''),
    },
    state,
    warnings,
  };
}

export async function importWorkspaceSnapshot(file: File): Promise<ParsedWorkspaceSnapshot> {
  const text = await file.text();
  return parseWorkspaceSnapshotText(text);
}
