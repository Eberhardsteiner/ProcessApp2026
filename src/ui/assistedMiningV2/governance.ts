import type {
  ProcessVersion,
  ProcessMiningAssistedV2State,
  ProcessMiningGovernanceDecision,
  ProcessMiningGovernanceDecisionStatus,
  ProcessMiningGovernanceState,
} from '../../domain/process';
import { compareReportToCurrentState } from './reportHistory';
import { computeDataMaturity } from './dataMaturity';
import { buildReviewOverview } from './reviewSuggestions';
import { evaluatePilotReadiness } from './pilotReadiness';
import { computeMiningReadiness } from './analysisReadiness';

export type GovernanceCheckStatus = 'good' | 'attention' | 'open';

export interface GovernanceCheck {
  key: 'material' | 'evidence' | 'report' | 'handover' | 'quality' | 'ownership';
  label: string;
  status: GovernanceCheckStatus;
  detail: string;
  nextAction?: string;
}

export interface GovernanceSummary {
  checks: GovernanceCheck[];
  openDecisionCount: number;
  activeDecisionCount: number;
  readyForShare: boolean;
  headline: string;
  summary: string;
  nextAction: string;
  suggestions: string[];
}

export function createEmptyGovernanceState(): ProcessMiningGovernanceState {
  return {
    decisions: [],
    teamPlan: {},
  };
}

export function upsertGovernanceDecision(
  governance: ProcessMiningGovernanceState | undefined,
  input: Partial<ProcessMiningGovernanceDecision> & { id?: string },
): ProcessMiningGovernanceState {
  const base = governance ?? createEmptyGovernanceState();
  const decisions = base.decisions ?? [];
  const now = new Date().toISOString();
  const nextEntry: ProcessMiningGovernanceDecision = {
    id: input.id ?? crypto.randomUUID(),
    title: input.title?.trim() || 'Neue Entscheidung',
    detail: input.detail ?? '',
    status: input.status ?? 'open',
    sourceType: input.sourceType ?? 'manual',
    owner: input.owner ?? '',
    dueDate: input.dueDate ?? '',
    relatedStepLabel: input.relatedStepLabel ?? '',
    evidenceHint: input.evidenceHint ?? '',
    createdAt: input.id ? decisions.find(entry => entry.id === input.id)?.createdAt ?? now : now,
    updatedAt: now,
  };

  const idx = decisions.findIndex(entry => entry.id === nextEntry.id);
  const nextDecisions = idx >= 0
    ? decisions.map(entry => (entry.id === nextEntry.id ? nextEntry : entry))
    : [...decisions, nextEntry];

  return {
    ...base,
    decisions: nextDecisions,
  };
}

export function removeGovernanceDecision(
  governance: ProcessMiningGovernanceState | undefined,
  id: string,
): ProcessMiningGovernanceState {
  const base = governance ?? createEmptyGovernanceState();
  return {
    ...base,
    decisions: (base.decisions ?? []).filter(entry => entry.id !== id),
  };
}

export function updateGovernanceTeamPlan(
  governance: ProcessMiningGovernanceState | undefined,
  patch: Partial<NonNullable<ProcessMiningGovernanceState['teamPlan']>>,
): ProcessMiningGovernanceState {
  const base = governance ?? createEmptyGovernanceState();
  return {
    ...base,
    teamPlan: {
      ...(base.teamPlan ?? {}),
      ...patch,
    },
  };
}

export function getGovernanceStatusLabel(status: ProcessMiningGovernanceDecisionStatus): string {
  switch (status) {
    case 'open':
      return 'offen';
    case 'in_review':
      return 'in Prüfung';
    case 'approved':
      return 'freigegeben';
    case 'deferred':
      return 'zurückgestellt';
    default:
      return status;
  }
}

export function getGovernanceStatusTone(status: ProcessMiningGovernanceDecisionStatus): string {
  switch (status) {
    case 'approved':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'in_review':
      return 'border-cyan-200 bg-cyan-50 text-cyan-800';
    case 'deferred':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'open':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function countStepObservations(state: ProcessMiningAssistedV2State): number {
  return state.qualitySummary?.stepObservationCount
    ?? state.observations.filter(item => item.kind === 'step').length;
}

function countEvidenceSteps(state: ProcessMiningAssistedV2State): number {
  return state.qualitySummary?.stepObservationsWithEvidence
    ?? state.observations.filter(item => item.kind === 'step' && item.evidenceSnippet?.trim()).length;
}

function latestBenchmarkStatus(state: ProcessMiningAssistedV2State): 'pass' | 'attention' | 'fail' | undefined {
  return state.benchmarkSnapshots?.[state.benchmarkSnapshots.length - 1]?.status;
}

function buildSuggestedDecisionTitles(checks: GovernanceCheck[]): string[] {
  return checks
    .filter(check => check.status !== 'good' && check.nextAction)
    .map(check => check.nextAction as string)
    .slice(0, 4);
}

export function computeGovernanceSummary(params: {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
}): GovernanceSummary {
  const { state, version } = params;
  const governance = state.governance ?? createEmptyGovernanceState();
  const reviewSuggestionCount = buildReviewOverview({ cases: state.cases, observations: state.observations }).suggestionCount;
  const maturity = computeDataMaturity({ state, version, reviewSuggestionCount });
  const readiness = computeMiningReadiness({ state, version });
  const pilotReadiness = evaluatePilotReadiness({ state, version });
  const reportFreshness = state.reportSnapshot ? compareReportToCurrentState(state.reportSnapshot, state) : null;
  const stepCount = countStepObservations(state);
  const evidenceStepCount = countEvidenceSteps(state);
  const evidenceCoverage = stepCount > 0 ? evidenceStepCount / stepCount : 0;
  const latestBenchmark = latestBenchmarkStatus(state);
  const decisions = governance.decisions ?? [];
  const openDecisionCount = decisions.filter(entry => entry.status === 'open').length;
  const activeDecisionCount = decisions.filter(entry => entry.status === 'open' || entry.status === 'in_review').length;
  const reviewerCount = governance.teamPlan?.reviewers?.filter(Boolean).length ?? 0;

  const checks: GovernanceCheck[] = [
    {
      key: 'material',
      label: 'Materialbasis',
      status: stepCount >= 3 && state.cases.length > 0 ? 'good' : state.cases.length > 0 ? 'attention' : 'open',
      detail: stepCount >= 3
        ? `Die Arbeitsbasis umfasst ${state.cases.length} ${state.cases.length === 1 ? 'Quelle' : 'Quellen'} und ${stepCount} erkannte Schritte.`
        : state.cases.length > 0
        ? 'Es liegt Material vor, aber die Schrittbasis ist noch nicht stabil genug für eine belastbare Übergabe.'
        : 'Noch keine ausgewertete Quelle vorhanden.',
      nextAction: stepCount >= 3 ? undefined : 'Mehr belastbare Schritte aus Quellen ableiten',
    },
    {
      key: 'evidence',
      label: 'Beleglage',
      status: evidenceCoverage >= 0.55 ? 'good' : evidenceCoverage >= 0.3 ? 'attention' : 'open',
      detail: stepCount === 0
        ? 'Noch keine Schritte mit Belegstellen vorhanden.'
        : `${evidenceStepCount} von ${stepCount} Schritten sind bereits direkt mit einer Belegstelle verbunden.`,
      nextAction: evidenceCoverage >= 0.55 ? undefined : 'Belegstellen für wichtige Schritte schärfen',
    },
    {
      key: 'report',
      label: 'Bericht und Storyline',
      status: !state.reportSnapshot ? 'open' : reportFreshness?.isAligned ? 'good' : 'attention',
      detail: !state.reportSnapshot
        ? 'Noch kein aktueller Bericht erzeugt.'
        : reportFreshness?.summary ?? 'Ein Bericht liegt vor.',
      nextAction: !state.reportSnapshot || !reportFreshness?.isAligned ? 'Bericht für die aktuelle Analysebasis neu erzeugen' : undefined,
    },
    {
      key: 'handover',
      label: 'Übergabe an andere',
      status: (state.handoverDrafts?.length ?? 0) >= 2 ? 'good' : state.handoverDrafts?.length ? 'attention' : 'open',
      detail: (state.handoverDrafts?.length ?? 0) >= 2
        ? `${state.handoverDrafts?.length} Übergabetexte liegen bereits vor.`
        : state.handoverDrafts?.length
        ? 'Es gibt erste Übergabetexte, aber noch keine breite Zielgruppenabdeckung.'
        : 'Noch keine Übergaben vorbereitet.',
      nextAction: (state.handoverDrafts?.length ?? 0) >= 2 ? undefined : 'Übergabetexte für Management und Team vorbereiten',
    },
    {
      key: 'quality',
      label: 'Qualitäts- und Pilotcheck',
      status: latestBenchmark === 'pass'
        ? 'good'
        : latestBenchmark === 'attention' || pilotReadiness.level === 'internal-review'
        ? 'attention'
        : latestBenchmark === 'fail'
        ? 'open'
        : 'attention',
      detail: latestBenchmark
        ? `Letzter lokaler Qualitätscheck: ${latestBenchmark === 'pass' ? 'bestanden' : latestBenchmark === 'attention' ? 'beobachten' : 'kritisch'}. Pilot-Readiness: ${pilotReadiness.levelLabel}.`
        : `Noch kein gespeicherter Qualitätslauf. Pilot-Readiness derzeit: ${pilotReadiness.levelLabel}.`,
      nextAction: latestBenchmark === 'pass' ? undefined : 'Lokalen Qualitätscheck erneut laufen lassen',
    },
    {
      key: 'ownership',
      label: 'Verantwortung und Teamabstimmung',
      status: governance.teamPlan?.coordinator && reviewerCount > 0 ? 'good' : governance.teamPlan?.coordinator || reviewerCount > 0 ? 'attention' : 'open',
      detail: governance.teamPlan?.coordinator && reviewerCount > 0
        ? `Koordination liegt bei ${governance.teamPlan.coordinator}; ${reviewerCount} ${reviewerCount === 1 ? 'Reviewer ist' : 'Reviewer sind'} hinterlegt.`
        : governance.teamPlan?.coordinator || reviewerCount > 0
        ? 'Es gibt bereits erste Zuständigkeiten, aber die Abstimmung ist noch nicht vollständig geklärt.'
        : 'Noch keine klare Koordination oder Review-Beteiligung hinterlegt.',
      nextAction: governance.teamPlan?.coordinator && reviewerCount > 0 ? undefined : 'Koordination und Review-Beteiligte festlegen',
    },
  ];

  const blockingChecks = checks.filter(check => check.status === 'open');
  const attentionChecks = checks.filter(check => check.status === 'attention');
  const readyForShare = blockingChecks.length === 0 && attentionChecks.length <= 1;
  const headline = readyForShare
    ? 'Governance-Stand wirkt tragfähig für die nächste Übergabe.'
    : blockingChecks.length > 0
    ? 'Vor einer breiteren Weitergabe sollten noch Grundlagen geklärt werden.'
    : 'Die Analyse ist weit, braucht aber noch eine kurze Governance-Schärfung.';
  const nextAction = checks.find(check => check.status !== 'good')?.nextAction
    ?? readiness.nextActions[0]
    ?? 'Sie können den aktuellen Stand jetzt mit anderen teilen.';
  const suggestions = buildSuggestedDecisionTitles(checks);
  const summary = `${headline} Offen sind aktuell ${openDecisionCount} ${openDecisionCount === 1 ? 'Entscheidung' : 'Entscheidungen'}. ${maturity.levelLabel} · ${readiness.analysisModeLabel}.`;

  return {
    checks,
    openDecisionCount,
    activeDecisionCount,
    readyForShare,
    headline,
    summary,
    nextAction,
    suggestions,
  };
}


export function countGovernanceDecisionStatuses(
  governance: ProcessMiningGovernanceState | undefined,
): Record<ProcessMiningGovernanceDecisionStatus, number> {
  const counts: Record<ProcessMiningGovernanceDecisionStatus, number> = {
    open: 0,
    in_review: 0,
    approved: 0,
    deferred: 0,
  };
  (governance?.decisions ?? []).forEach(entry => {
    counts[entry.status] += 1;
  });
  return counts;
}

export function buildGovernanceOpenDecisionsText(params: {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
}): string {
  const { state, version } = params;
  const governance = state.governance ?? createEmptyGovernanceState();
  const summary = computeGovernanceSummary({ state, version });
  const openItems = (governance.decisions ?? []).filter(entry => entry.status === 'open' || entry.status === 'in_review');

  const lines: string[] = [
    'Governance · offene und aktive Punkte',
    '',
    summary.summary,
    '',
  ];

  if (openItems.length === 0) {
    lines.push('Aktuell sind keine offenen oder aktiven Governance-Entscheidungen hinterlegt.');
  } else {
    lines.push('Aktive Entscheidungen');
    openItems.forEach((entry, index) => {
      lines.push(`- ${index + 1}. ${entry.title} · ${getGovernanceStatusLabel(entry.status)}${entry.owner ? ` · Owner: ${entry.owner}` : ''}${entry.dueDate ? ` · Ziel: ${entry.dueDate}` : ''}`);
      if (entry.detail?.trim()) lines.push(`  ${entry.detail.trim()}`);
      if (entry.evidenceHint?.trim()) lines.push(`  Evidenz: ${entry.evidenceHint.trim()}`);
    });
  }

  lines.push('', `Empfohlene nächste Governance-Aktion: ${summary.nextAction}`);
  return lines.join('\n');
}

export function buildGovernanceReviewPackageText(params: {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
}): string {
  const { state, version } = params;
  const summary = computeGovernanceSummary({ state, version });
  const pilotReadiness = evaluatePilotReadiness({ state, version });
  const note = buildGovernanceNote({ state, version });
  const openDecisions = buildGovernanceOpenDecisionsText({ state, version });

  return [
    'Governance-Review-Paket',
    '',
    `Pilot-Reife: ${pilotReadiness.levelLabel} (${pilotReadiness.score}/100)`,
    `Empfohlener nächster Schritt: ${summary.nextAction}`,
    '',
    note,
    '',
    'Aktive Punkte für das Review',
    openDecisions,
  ].join('\n');
}

export function buildGovernanceNote(params: {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
}): string {
  const { state, version } = params;
  const governance = state.governance ?? createEmptyGovernanceState();
  const summary = computeGovernanceSummary({ state, version });
  const decisions = governance.decisions ?? [];
  const teamPlan = governance.teamPlan ?? {};

  const lines: string[] = [
    'Governance-Überblick',
    '',
    summary.summary,
    '',
    'Checkliste',
    ...summary.checks.map(check => `- ${check.label}: ${check.status === 'good' ? 'gut' : check.status === 'attention' ? 'prüfen' : 'offen'} · ${check.detail}`),
  ];

  if (decisions.length > 0) {
    lines.push('', 'Entscheidungslog');
    decisions.forEach((entry, index) => {
      lines.push(`- ${index + 1}. ${entry.title} · ${getGovernanceStatusLabel(entry.status)}${entry.owner ? ` · Owner: ${entry.owner}` : ''}${entry.dueDate ? ` · Ziel: ${entry.dueDate}` : ''}`);
      if (entry.detail?.trim()) lines.push(`  ${entry.detail.trim()}`);
    });
  }

  if (teamPlan.coordinator || teamPlan.nextReviewAt || teamPlan.shareTargets || teamPlan.shareNote) {
    lines.push('', 'Teamabstimmung');
    if (teamPlan.coordinator) lines.push(`- Koordination: ${teamPlan.coordinator}`);
    if (teamPlan.reviewers?.length) lines.push(`- Review-Beteiligte: ${teamPlan.reviewers.join(', ')}`);
    if (teamPlan.nextReviewAt) lines.push(`- Nächster Review-Termin: ${teamPlan.nextReviewAt}`);
    if (teamPlan.shareTargets) lines.push(`- Zielgruppe / Weitergabe: ${teamPlan.shareTargets}`);
    if (teamPlan.shareNote) lines.push(`- Abstimmungsnotiz: ${teamPlan.shareNote}`);
  }

  lines.push('', `Empfohlene nächste Governance-Aktion: ${summary.nextAction}`);
  return lines.join('\n');
}
