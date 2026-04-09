import type {
  Process,
  ProcessMiningAcceptanceDecision,
  ProcessMiningAcceptanceSnapshot,
  ProcessMiningAssistedV2State,
  ProcessVersion,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { compareReportToCurrentState } from './reportHistory';
import { computeGovernanceSummary } from './governance';
import { computeGovernanceWorkflow } from './governanceWorkflow';
import { evaluatePilotReadiness } from './pilotReadiness';
import { evaluateSecurityReadiness } from './securityReadiness';

export type AcceptanceCheckStatus = 'ready' | 'attention' | 'blocked';
export type AcceptanceLevel = 'blocked' | 'attention' | 'ready';

export interface AcceptanceCheck {
  key: 'benchmark' | 'report' | 'governance' | 'security' | 'pilot' | 'checklist';
  label: string;
  status: AcceptanceCheckStatus;
  metric: string;
  summary: string;
  detail: string;
  action?: string;
}

export interface AcceptanceReadinessSummary {
  level: AcceptanceLevel;
  levelLabel: string;
  headline: string;
  summary: string;
  score: number;
  checks: AcceptanceCheck[];
  strengths: string[];
  nextActions: string[];
  recommendedDecision: ProcessMiningAcceptanceDecision;
  recommendedDecisionLabel: string;
  readyForAcceptance: boolean;
}

export interface AcceptanceSnapshotDelta {
  isAligned: boolean;
  summary: string;
}

function statusWeight(status: AcceptanceCheckStatus): number {
  if (status === 'ready') return 100;
  if (status === 'attention') return 65;
  return 25;
}

function levelLabel(level: AcceptanceLevel): string {
  if (level === 'ready') return 'Abnahmereif';
  if (level === 'attention') return 'Abnahme mit Nacharbeit';
  return 'Noch nicht abnahmereif';
}

export function getAcceptanceDecisionLabel(decision: ProcessMiningAcceptanceDecision): string {
  switch (decision) {
    case 'continue-pilot':
      return 'Pilot gezielt fortsetzen';
    case 'limited-release':
      return 'Begrenzt freigeben';
    case 'needs-refinement':
      return 'Vor Freigabe nachschärfen';
    case 'stop':
      return 'Vorläufig stoppen';
    default:
      return decision;
  }
}

function safeText(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export function buildAcceptanceBasisFingerprint(state: ProcessMiningAssistedV2State): string {
  return JSON.stringify({
    report: state.reportSnapshot?.generatedAt ?? null,
    benchmark: state.benchmarkSnapshots?.[state.benchmarkSnapshots.length - 1]?.computedAt ?? null,
    governance: state.governance?.approval?.basisFingerprint ?? state.governance?.history?.[state.governance.history.length - 1]?.basisFingerprint ?? null,
    security: state.security?.reviewedAt ?? null,
    pilot: state.pilotToolkit?.lastExportedAt ?? null,
    connectors: state.connectorToolkit?.lastExportedAt ?? null,
    receipts: state.connectorToolkit?.lastReceiptAt ?? null,
    updatedAt: state.updatedAt,
  });
}

export function compareAcceptanceSnapshotToCurrent(
  snapshot: ProcessMiningAcceptanceSnapshot | undefined,
  state: ProcessMiningAssistedV2State,
): AcceptanceSnapshotDelta | null {
  if (!snapshot) return null;
  const currentFingerprint = buildAcceptanceBasisFingerprint(state);
  const isAligned = snapshot.basisFingerprint === currentFingerprint;
  return {
    isAligned,
    summary: isAligned
      ? `Der gemerkte Abnahmestand „${snapshot.label}“ passt noch zur aktuellen Analysebasis.`
      : `Seit dem gemerkten Abnahmestand „${snapshot.label}“ hat sich die Analysebasis verändert. Die formale Abnahme sollte kurz neu bestätigt werden.`,
  };
}

export function evaluateAcceptanceReadiness(params: {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
  settings: AppSettings;
}): AcceptanceReadinessSummary {
  const { state, version, settings } = params;
  const latestBenchmark = state.benchmarkSnapshots?.[state.benchmarkSnapshots.length - 1];
  const reportFreshness = state.reportSnapshot ? compareReportToCurrentState(state.reportSnapshot, state) : null;
  const governanceSummary = computeGovernanceSummary({ state, version });
  const governanceWorkflow = computeGovernanceWorkflow({ state, version });
  const pilotReadiness = evaluatePilotReadiness({ state, version });
  const securityReadiness = evaluateSecurityReadiness({ state, version, settings });
  const securityReadyForAcceptance = securityReadiness.level === 'controlled' || (
    securityReadiness.level === 'review' &&
    securityReadiness.score >= 85 &&
    Boolean(state.security?.reviewedAt) &&
    Boolean(state.security?.dataClassification) &&
    Boolean(state.security?.deploymentTarget)
  );
  const checklist = state.acceptance?.checklist ?? {};
  const checklistFlags = [
    checklist.benchmarkReviewed,
    checklist.reportReviewed,
    checklist.governanceReviewed,
    checklist.securityReviewed,
    checklist.pilotPrepared,
    checklist.enablementPrepared,
  ];
  const checklistReadyCount = checklistFlags.filter(Boolean).length;

  const checks: AcceptanceCheck[] = [
    {
      key: 'benchmark',
      label: 'Lokale Referenzbasis',
      status: latestBenchmark?.strictGate?.pass || latestBenchmark?.status === 'pass' ? 'ready' : latestBenchmark ? 'attention' : 'blocked',
      metric: latestBenchmark ? `${latestBenchmark.overallScore}/100` : 'kein Lauf',
      summary: latestBenchmark
        ? `${latestBenchmark.caseCount} Referenzfälle · ${latestBenchmark.status === 'pass' ? 'lokal stabil' : 'noch beobachten'}`
        : 'Noch kein lokaler Qualitätslauf gespeichert.',
      detail: latestBenchmark
        ? latestBenchmark.summary
        : 'Vor einer formalen Abnahme sollte mindestens ein Benchmark-Lauf oder ein strenger Qualitätscheck dokumentiert sein.',
      action: latestBenchmark ? undefined : 'Vor Abnahme einmal den lokalen Benchmark ausführen oder in der App speichern.',
    },
    {
      key: 'report',
      label: 'Bericht und Weitergabe',
      status: state.reportSnapshot && reportFreshness?.isAligned ? 'ready' : state.reportSnapshot ? 'attention' : 'blocked',
      metric: state.reportSnapshot ? 'Bericht vorhanden' : 'kein Bericht',
      summary: !state.reportSnapshot
        ? 'Es liegt noch kein aktueller Bericht vor.'
        : reportFreshness?.isAligned
        ? 'Bericht und Übergaben passen zur aktuellen Analysebasis.'
        : reportFreshness?.summary ?? 'Der Bericht sollte noch einmal geprüft werden.',
      detail: state.handoverDrafts?.length
        ? `${state.handoverDrafts.length} Übergaben verfügbar.`
        : 'Noch keine Übergaben gespeichert.',
      action: !state.reportSnapshot || !reportFreshness?.isAligned ? 'Bericht für die aktuelle Analysebasis neu erzeugen.' : undefined,
    },
    {
      key: 'governance',
      label: 'Review und Freigabe',
      status: governanceWorkflow.stage === 'approved' && governanceWorkflow.approvalFresh && governanceSummary.readyForShare
        ? 'ready'
        : governanceWorkflow.stage === 'review-running' || governanceWorkflow.stage === 'approval-ready' || governanceSummary.readyForShare
        ? 'attention'
        : 'blocked',
      metric: governanceWorkflow.stageLabel,
      summary: governanceWorkflow.headline,
      detail: governanceSummary.summary,
      action: governanceWorkflow.stage === 'approved' && governanceWorkflow.approvalFresh && governanceSummary.readyForShare
        ? undefined
        : governanceSummary.nextAction,
    },
    {
      key: 'security',
      label: 'Sicherheit und Deployment-Rahmen',
      status: securityReadyForAcceptance ? 'ready' : securityReadiness.level === 'review' ? 'attention' : 'blocked',
      metric: `${securityReadiness.score}/100`,
      summary: securityReadiness.headline,
      detail: securityReadiness.summary,
      action: securityReadiness.items.find(item => item.status !== 'ready')?.action,
    },
    {
      key: 'pilot',
      label: 'Pilotbetrieb und Materialpaket',
      status: pilotReadiness.level === 'pilot-ready' ? 'ready' : pilotReadiness.level === 'workshop-ready' || pilotReadiness.level === 'internal-review' ? 'attention' : 'blocked',
      metric: `${pilotReadiness.score}/100`,
      summary: pilotReadiness.headline,
      detail: pilotReadiness.summary,
      action: state.pilotToolkit?.lastExportedAt ? pilotReadiness.nextActions[0] : 'Pilot-Paket einmal bewusst exportieren oder Pilotdaten prüfen.',
    },
    {
      key: 'checklist',
      label: 'Formale Abnahme-Checkliste',
      status: checklistReadyCount >= 5 ? 'ready' : checklistReadyCount >= 3 ? 'attention' : 'blocked',
      metric: `${checklistReadyCount}/6`,
      summary: checklistReadyCount >= 5
        ? 'Die wichtigsten Abnahmepunkte sind aktiv bestätigt.'
        : checklistReadyCount >= 3
        ? 'Ein Teil der formalen Punkte ist bestätigt, aber noch nicht alles.'
        : 'Die formale Abnahme ist noch nicht aktiv vorbereitet.',
      detail: 'Bestätigt werden Benchmark, Bericht, Governance, Sicherheit, Pilotvorbereitung und Enablement/Training.',
      action: checklistReadyCount >= 5 ? undefined : 'Checkliste vor der finalen Abnahme kurz aktiv durchgehen.',
    },
  ];

  const score = Math.round(checks.reduce((sum, check) => sum + statusWeight(check.status), 0) / Math.max(checks.length, 1));
  const blockedCount = checks.filter(check => check.status === 'blocked').length;
  const attentionCount = checks.filter(check => check.status === 'attention').length;
  const level: AcceptanceLevel = blockedCount > 0 ? 'blocked' : attentionCount > 0 || score < 85 ? 'attention' : 'ready';

  const strengths = checks.filter(check => check.status === 'ready').map(check => `${check.label}: ${check.summary}`);
  const nextActions = checks.filter(check => check.status !== 'ready').map(check => check.action ?? `${check.label} kurz nachziehen.`);

  const recommendedDecision: ProcessMiningAcceptanceDecision = level === 'ready'
    ? securityReadyForAcceptance && governanceWorkflow.stage === 'approved' && governanceWorkflow.approvalFresh
      ? 'limited-release'
      : 'continue-pilot'
    : score >= 60
    ? 'needs-refinement'
    : 'stop';

  const headline = level === 'ready'
    ? 'Der Stand wirkt bereit für eine formale Abnahme oder eine begrenzte Freigabe.'
    : level === 'attention'
    ? 'Der Stand ist weit, braucht vor der formalen Abnahme aber noch kurze Nacharbeit.'
    : 'Für eine formale Abnahme fehlen noch zentrale Voraussetzungen.';

  const summary = `${checks.length} Abnahme-Bausteine · ${score}/100 · ${checks.filter(check => check.status === 'ready').length} stabil · ${attentionCount} beobachten · ${blockedCount} offen.`;

  return {
    level,
    levelLabel: levelLabel(level),
    headline,
    summary,
    score,
    checks,
    strengths,
    nextActions,
    recommendedDecision,
    recommendedDecisionLabel: getAcceptanceDecisionLabel(recommendedDecision),
    readyForAcceptance: level === 'ready',
  };
}

export function createAcceptanceSnapshot(params: {
  state: ProcessMiningAssistedV2State;
  summary: AcceptanceReadinessSummary;
  label?: string;
}): ProcessMiningAcceptanceSnapshot {
  const decidedBy = params.state.acceptance?.decidedBy?.trim() || undefined;
  const decision = params.state.acceptance?.decision ?? params.summary.recommendedDecision;
  const createdAt = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt,
    label: params.label?.trim() || `Abnahmestand ${new Date(createdAt).toLocaleString('de-DE')}`,
    decision,
    decisionLabel: getAcceptanceDecisionLabel(decision),
    score: params.summary.score,
    level: params.summary.level,
    levelLabel: params.summary.levelLabel,
    summary: params.summary.summary,
    basisFingerprint: buildAcceptanceBasisFingerprint(params.state),
    decidedBy,
  };
}

export function pushAcceptanceSnapshot(
  history: ProcessMiningAcceptanceSnapshot[] | undefined,
  snapshot: ProcessMiningAcceptanceSnapshot,
): ProcessMiningAcceptanceSnapshot[] {
  return [...(history ?? []), snapshot].slice(-12);
}

export function buildAcceptanceDecisionText(params: {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  settings: AppSettings;
}): string {
  const summary = evaluateAcceptanceReadiness({ state: params.state, version: params.version, settings: params.settings });
  const acceptance = params.state.acceptance ?? {};
  const decision = acceptance.decision ?? summary.recommendedDecision;
  const latestBenchmark = params.state.benchmarkSnapshots?.[params.state.benchmarkSnapshots.length - 1];
  const latestSnapshot = acceptance.history?.length ? acceptance.history[acceptance.history.length - 1] : undefined;
  const delta = compareAcceptanceSnapshotToCurrent(latestSnapshot, params.state);

  return [
    `Formale Abnahme | ${params.process.title}`,
    '',
    `Version: ${params.version.versionLabel ?? params.version.versionId}`,
    `Stand: ${new Date().toLocaleString('de-DE')}`,
    `Abnahme-Reife: ${summary.levelLabel} (${summary.score}/100)`,
    `Empfohlene Entscheidung: ${summary.recommendedDecisionLabel}`,
    `Aktuell gewählte Entscheidung: ${getAcceptanceDecisionLabel(decision)}`,
    `Verantwortlich: ${safeText(acceptance.decidedBy, 'noch nicht festgelegt')}`,
    `Zielrahmen: ${safeText(acceptance.targetWindow, 'noch nicht festgelegt')}`,
    '',
    'Kernaussage',
    summary.headline,
    summary.summary,
    '',
    'Was schon trägt',
    ...(summary.strengths.length > 0 ? summary.strengths.map(item => `- ${item}`) : ['- Noch keine klaren Stärken bestätigt.']),
    '',
    'Was vor der Entscheidung noch wichtig ist',
    ...(summary.nextActions.length > 0 ? summary.nextActions.map(item => `- ${item}`) : ['- Keine unmittelbaren Nacharbeiten sichtbar.']),
    '',
    'Eigene Erfolgskriterien',
    safeText(acceptance.successCriteria, 'noch nicht ergänzt'),
    '',
    'Bekannte Risiken und Restpunkte',
    safeText(acceptance.knownRisks, 'keine zusätzlichen Risiken erfasst'),
    '',
    'Enablement / Training',
    safeText(acceptance.trainingNote, 'noch nicht ergänzt'),
    '',
    'Formale Notiz',
    safeText(acceptance.note, 'noch nicht ergänzt'),
    '',
    'Checkliste',
    ...[
      ['Benchmark geprüft', acceptance.checklist?.benchmarkReviewed],
      ['Bericht geprüft', acceptance.checklist?.reportReviewed],
      ['Governance geprüft', acceptance.checklist?.governanceReviewed],
      ['Sicherheit/Deployment geprüft', acceptance.checklist?.securityReviewed],
      ['Pilotpaket vorbereitet', acceptance.checklist?.pilotPrepared],
      ['Enablement/Training vorbereitet', acceptance.checklist?.enablementPrepared],
    ].map(([label, done]) => `- ${done ? '✓' : '○'} ${label}`),
    '',
    'Lokaler Qualitätsrahmen',
    latestBenchmark
      ? `- Benchmark: ${latestBenchmark.overallScore}/100 · ${latestBenchmark.status} · ${latestBenchmark.caseCount} Referenzfälle`
      : '- Benchmark: noch kein Lauf gespeichert',
    delta ? `- Letzter gemerkter Abnahmestand: ${delta.summary}` : '- Noch kein gemerkter Abnahmestand vorhanden',
  ].join('\n');
}
