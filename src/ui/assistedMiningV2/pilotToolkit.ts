import type {
  Process,
  ProcessMiningAssistedV2State,
  ProcessMiningBenchmarkSnapshot,
  ProcessMiningHandoverDraft,
  ProcessMiningReportSnapshot,
  ProcessVersion,
} from '../../domain/process';
import { APP_SEMVER, APP_VERSION_LABEL } from '../../config/release';
import { downloadTextFile } from '../../utils/downloadTextFile';
import { computeGovernanceSummary, buildGovernanceNote, buildGovernanceReviewPackageText, buildGovernanceOpenDecisionsText } from './governance';
import type { PilotReadinessSummary } from './pilotReadiness';
import { evaluatePilotReadiness } from './pilotReadiness';
import { buildProcessMiningReport } from './reporting';
import { buildWorkspaceSnapshot, serializeWorkspaceSnapshot } from './workspaceSnapshot';

export interface PilotToolkitExportInput {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  readiness?: PilotReadinessSummary;
}

export interface PilotToolkitExportPackage {
  exportedAt: string;
  fileBase: string;
  report: ProcessMiningReportSnapshot;
  handovers: ProcessMiningHandoverDraft[];
  readiness: PilotReadinessSummary;
  governanceSummary: ReturnType<typeof computeGovernanceSummary>;
  governanceNote: string;
  openDecisionText: string;
  governanceReviewText: string;
  pilotBriefingText: string;
  workshopAgendaText: string;
  pilotChecklistText: string;
  packageJson: Record<string, unknown>;
  workspaceSnapshotText: string;
  includedFiles: string[];
}

function sanitizeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9äöüß_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'pm-pilot';
}

function formatDateTime(value?: string): string {
  if (!value) return 'noch nicht festgelegt';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('de-DE');
}

function latestBenchmark(state: ProcessMiningAssistedV2State): ProcessMiningBenchmarkSnapshot | undefined {
  return state.benchmarkSnapshots?.[state.benchmarkSnapshots.length - 1];
}

function firstNonEmpty(values: Array<string | undefined>, fallback: string): string {
  return values.find(value => Boolean(value?.trim())) ?? fallback;
}

function bullet(lines: Array<string | undefined>): string {
  return lines.filter((line): line is string => Boolean(line?.trim())).map(line => `- ${line}`).join('\n');
}

function buildPilotBriefingText(params: {
  input: PilotToolkitExportInput;
  readiness: PilotReadinessSummary;
  report: ProcessMiningReportSnapshot;
  governanceSummary: ReturnType<typeof computeGovernanceSummary>;
  latestBenchmark?: ProcessMiningBenchmarkSnapshot;
}): string {
  const { input, readiness, report, governanceSummary, latestBenchmark } = params;
  const toolkit = input.state.pilotToolkit ?? {};
  const handovers = input.state.handoverDrafts ?? [];
  const managementHandover = handovers.find(entry => entry.audience === 'management');

  return [
    `Pilot-Briefing | ${toolkit.sessionTitle?.trim() || input.process.title}`,
    '',
    `Stand: ${formatDateTime(report.generatedAt)}`,
    `Geplanter Termin: ${formatDateTime(toolkit.plannedAt)}`,
    `Moderation / Koordination: ${toolkit.facilitator?.trim() || input.state.governance?.teamPlan?.coordinator || 'noch nicht festgelegt'}`,
    `Zielgruppe: ${toolkit.audience?.trim() || input.state.governance?.teamPlan?.shareTargets || 'Fachworkshop / Pilot-Review'}`,
    `Pilot-Reife: ${readiness.levelLabel} (${readiness.score}/100)`,
    '',
    'Ziel des Termins',
    toolkit.sessionGoal?.trim() || 'Analysebild, Reibungen, offene Entscheidungen und nächste Schritte gemeinsam validieren.',
    '',
    'Kernaussage',
    managementHandover?.text || report.executiveSummary,
    '',
    'Wichtigste Befunde',
    bullet(report.keyFindings),
    '',
    'Nächste sinnvolle Schritte',
    bullet(report.nextActions.slice(0, 4)),
    '',
    'Governance-Stand',
    `${governanceSummary.headline} Offene Entscheidungen: ${governanceSummary.openDecisionCount}.`,
    '',
    'Lokaler Qualitätsstand',
    latestBenchmark
      ? `${latestBenchmark.headline} · ${latestBenchmark.overallScore}/100 · Engine ${latestBenchmark.engineVersion}`
      : 'Noch kein gespeicherter Benchmark-Lauf vorhanden.',
    ...(toolkit.note?.trim() ? ['', 'Moderationsnotiz', toolkit.note.trim()] : []),
  ].join('\n');
}

function buildWorkshopAgendaText(params: {
  input: PilotToolkitExportInput;
  readiness: PilotReadinessSummary;
  report: ProcessMiningReportSnapshot;
  governanceSummary: ReturnType<typeof computeGovernanceSummary>;
}): string {
  const { input, readiness, report, governanceSummary } = params;
  const toolkit = input.state.pilotToolkit ?? {};
  const workshopHandover = (input.state.handoverDrafts ?? []).find(entry => entry.audience === 'workshop');

  return [
    `Workshop-Fahrplan | ${toolkit.sessionTitle?.trim() || input.process.title}`,
    '',
    `Termin: ${formatDateTime(toolkit.plannedAt)}`,
    `Moderation: ${toolkit.facilitator?.trim() || input.state.governance?.teamPlan?.coordinator || 'noch nicht festgelegt'}`,
    `Zielgruppe: ${toolkit.audience?.trim() || 'Fachteam, Prozessverantwortung, Review'}`,
    '',
    'Empfohlene Agenda',
    bullet([
      '5 Min. Ziel und Materialbasis klären',
      '10 Min. Hauptlinie und wichtigste Reibung erklären',
      firstNonEmpty(report.keyFindings.map(item => `10 Min. Befund prüfen: ${item}`), '10 Min. Wichtigste Befunde prüfen'),
      firstNonEmpty(report.nextActions.map(item => `10 Min. Nächsten Schritt festlegen: ${item}`), '10 Min. Nächste Schritte festlegen'),
      governanceSummary.nextAction ? `5 Min. Governance-Schritt festziehen: ${governanceSummary.nextAction}` : undefined,
    ]),
    '',
    'Drei Leitfragen',
    bullet([
      firstNonEmpty(report.cautionNotes, 'Wo sind die Aussagen noch als Entwurf und nicht als gesicherter Befund zu lesen?'),
      firstNonEmpty(report.nextActions, 'Welcher Schritt stärkt die Analyse am schnellsten?'),
      governanceSummary.nextAction,
    ]),
    '',
    'Kurze Storyline für den Einstieg',
    workshopHandover?.text || report.processStory,
    ...(toolkit.note?.trim() ? ['', 'Moderationshinweis', toolkit.note.trim()] : []),
    '',
    `Pilot-Reife heute: ${readiness.levelLabel} (${readiness.score}/100)` ,
  ].join('\n');
}

function buildPilotChecklistText(params: {
  readiness: PilotReadinessSummary;
  governanceSummary: ReturnType<typeof computeGovernanceSummary>;
  latestBenchmark?: ProcessMiningBenchmarkSnapshot;
  report: ProcessMiningReportSnapshot;
  input: PilotToolkitExportInput;
}): string {
  const { readiness, governanceSummary, latestBenchmark, report, input } = params;
  const toolkit = input.state.pilotToolkit ?? {};
  return [
    `Pilot-Checkliste | ${toolkit.sessionTitle?.trim() || input.process.title}`,
    '',
    `Pilot-Reife: ${readiness.levelLabel} (${readiness.score}/100)`,
    `Governance: ${governanceSummary.headline}`,
    `Bericht: ${formatDateTime(report.generatedAt)}`,
    latestBenchmark ? `Benchmark: ${latestBenchmark.overallScore}/100 (${latestBenchmark.status})` : 'Benchmark: noch kein Lauf gespeichert',
    '',
    'Vor dem Termin prüfen',
    bullet([
      ...readiness.checks.map(check => `${check.label}: ${check.status === 'good' ? 'gut' : check.status === 'attention' ? 'prüfen' : 'offen'} · ${check.metric}`),
      governanceSummary.nextAction ? `Governance: ${governanceSummary.nextAction}` : undefined,
    ]),
    '',
    'Für die Weitergabe bereithalten',
    bullet([
      'Management-Kurzbrief oder Executive Summary',
      'Übergabe für Prozessverantwortung oder Team',
      'Governance-Notiz mit offenen Entscheidungen',
      'PM-Arbeitsstand als Snapshot für sichere Wiederherstellung',
    ]),
  ].join('\n');
}

export function buildPilotToolkitPackage(input: PilotToolkitExportInput): PilotToolkitExportPackage {
  const readiness = input.readiness ?? evaluatePilotReadiness({ state: input.state, version: input.version });
  const reportResult = input.state.reportSnapshot && input.state.handoverDrafts?.length
    ? { snapshot: input.state.reportSnapshot, handovers: input.state.handoverDrafts }
    : buildProcessMiningReport({ process: input.process, version: input.version, state: input.state });
  const report = reportResult.snapshot;
  const handovers = reportResult.handovers;
  const governanceSummary = computeGovernanceSummary({ state: input.state, version: input.version });
  const governanceNote = buildGovernanceNote({ state: input.state, version: input.version });
  const openDecisionText = buildGovernanceOpenDecisionsText({ state: input.state, version: input.version });
  const governanceReviewText = buildGovernanceReviewPackageText({ state: input.state, version: input.version });
  const latest = latestBenchmark(input.state);
  const pilotBriefingText = buildPilotBriefingText({ input, readiness, report, governanceSummary, latestBenchmark: latest });
  const workshopAgendaText = buildWorkshopAgendaText({ input, readiness, report, governanceSummary });
  const pilotChecklistText = buildPilotChecklistText({ readiness, governanceSummary, latestBenchmark: latest, report, input });
  const exportedAt = new Date().toISOString();
  const fileBase = sanitizeFilename(input.state.pilotToolkit?.sessionTitle?.trim() || input.process.title || 'pm-pilot');
  const stateForSnapshot: ProcessMiningAssistedV2State = input.state.reportSnapshot && input.state.handoverDrafts?.length
    ? input.state
    : {
        ...input.state,
        reportSnapshot: report,
        handoverDrafts: handovers,
      };
  const workspaceSnapshot = buildWorkspaceSnapshot({
    process: input.process,
    version: input.version,
    state: stateForSnapshot,
    readiness,
  });
  const workspaceSnapshotText = serializeWorkspaceSnapshot(workspaceSnapshot);

  const packageJson = {
    schemaVersion: 'pm-pilot-package-v1',
    exportedAt,
    appVersion: `${APP_VERSION_LABEL} (${APP_SEMVER})`,
    process: {
      processId: input.process.processId,
      title: input.process.title,
      versionId: input.version.versionId,
      versionLabel: input.version.versionLabel,
    },
    toolkit: input.state.pilotToolkit ?? {},
    readiness,
    governanceSummary,
    governanceState: input.state.governance ?? {},
    latestBenchmark: latest ?? null,
    report,
    handovers,
    workspaceSnapshot,
  } satisfies Record<string, unknown>;

  const includedFiles = [
    'README.md',
    '01_pilot-briefing.md',
    '02_workshop-fahrplan.md',
    '03_governance-review.md',
    '04_pilot-checkliste.md',
    '05_governance-offene-punkte.md',
    '06_management-uebergabe.txt',
    '07_prozessverantwortung-uebergabe.txt',
    '08_team-uebergabe.txt',
    '09_workshop-uebergabe.txt',
    '10_pm-arbeitsstand.json',
    '11_pilot-paket.json',
  ];

  return {
    exportedAt,
    fileBase,
    report,
    handovers,
    readiness,
    governanceSummary,
    governanceNote,
    openDecisionText,
    governanceReviewText,
    pilotBriefingText,
    workshopAgendaText,
    pilotChecklistText,
    packageJson,
    workspaceSnapshotText,
    includedFiles,
  };
}

export function downloadPilotToolkitJson(pkg: PilotToolkitExportPackage): void {
  downloadTextFile({
    filename: `${pkg.fileBase}-pilot-paket.json`,
    content: JSON.stringify(pkg.packageJson, null, 2),
    mimeType: 'application/json;charset=utf-8',
  });
}

export async function downloadPilotToolkitZip(pkg: PilotToolkitExportPackage): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const handoverByAudience = new Map(pkg.handovers.map(entry => [entry.audience, entry]));

  const readme = [
    `Pilot-Paket | ${pkg.fileBase}`,
    '',
    `Exportiert am: ${formatDateTime(pkg.exportedAt)}`,
    `App-Version: ${APP_VERSION_LABEL} (${APP_SEMVER})`,
    `Pilot-Reife: ${pkg.readiness.levelLabel} (${pkg.readiness.score}/100)`,
    '',
    'Enthaltene Dateien',
    bullet(pkg.includedFiles),
    '',
    'Hinweis',
    'Das Paket bündelt Bericht, Governance, Übergaben, Pilot-Checkliste und den vollständigen PM-Arbeitsstand für sichere Weitergabe oder Wiederherstellung.',
  ].join('\n');

  zip.file('README.md', readme);
  zip.file('01_pilot-briefing.md', pkg.pilotBriefingText);
  zip.file('02_workshop-fahrplan.md', pkg.workshopAgendaText);
  zip.file('03_governance-review.md', pkg.governanceReviewText);
  zip.file('04_pilot-checkliste.md', pkg.pilotChecklistText);
  zip.file('05_governance-offene-punkte.md', pkg.openDecisionText);
  zip.file('06_management-uebergabe.txt', handoverByAudience.get('management')?.text ?? 'Keine Management-Übergabe vorhanden.');
  zip.file('07_prozessverantwortung-uebergabe.txt', handoverByAudience.get('process_owner')?.text ?? 'Keine Übergabe für Prozessverantwortung vorhanden.');
  zip.file('08_team-uebergabe.txt', handoverByAudience.get('operations')?.text ?? 'Keine Team-Übergabe vorhanden.');
  zip.file('09_workshop-uebergabe.txt', handoverByAudience.get('workshop')?.text ?? 'Keine Workshop-Übergabe vorhanden.');
  zip.file('10_pm-arbeitsstand.json', pkg.workspaceSnapshotText);
  zip.file('11_pilot-paket.json', JSON.stringify(pkg.packageJson, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${pkg.fileBase}-pilot-paket.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
