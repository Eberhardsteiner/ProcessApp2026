import type {
  ProcessMiningAssistedV2State,
  ProcessMiningGovernanceDecision,
  ProcessVersion,
} from '../../domain/process';
import { computeGovernanceSummary } from './governance';
import { compareGovernanceSnapshotToCurrent, computeGovernanceWorkflow } from './governanceWorkflow';

export type GovernanceInsightTone = 'good' | 'attention' | 'critical';

export interface GovernanceInsightMetric {
  key: 'score' | 'active' | 'review' | 'approval' | 'history';
  label: string;
  value: string;
  detail: string;
  tone: GovernanceInsightTone;
}

export interface GovernancePriorityItem {
  id: string;
  title: string;
  detail: string;
  nextAction: string;
  severity: 'high' | 'medium' | 'low';
  decisionId?: string;
}

export interface GovernanceInsightsSummary {
  score: number;
  tone: GovernanceInsightTone;
  headline: string;
  summary: string;
  nextAction: string;
  activeDecisionCount: number;
  overdueDecisionCount: number;
  dueSoonDecisionCount: number;
  missingOwnerCount: number;
  missingDueDateCount: number;
  currentReviewAgeDays: number | null;
  approvalAgeDays: number | null;
  approvalFresh: boolean;
  snapshotCount: number;
  metrics: GovernanceInsightMetric[];
  priorities: GovernancePriorityItem[];
  trendSummary: string;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function diffDays(fromIso: string | undefined, to: Date = new Date()): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  const diff = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function dueState(dueDate: string | undefined): 'overdue' | 'soon' | 'future' | 'missing' {
  if (!dueDate) return 'missing';
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 'missing';
  const today = startOfToday();
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const delta = Math.floor((dueStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (delta < 0) return 'overdue';
  if (delta <= 3) return 'soon';
  return 'future';
}

function rankDecision(entry: ProcessMiningGovernanceDecision): number {
  const statusWeight = entry.status === 'in_review' ? 4 : entry.status === 'open' ? 3 : entry.status === 'deferred' ? 1 : 0;
  const dueWeight = dueState(entry.dueDate) === 'overdue' ? 4 : dueState(entry.dueDate) === 'soon' ? 2 : dueState(entry.dueDate) === 'missing' ? 1 : 0;
  const ownerWeight = entry.owner?.trim() ? 0 : 2;
  return statusWeight + dueWeight + ownerWeight;
}

function buildMetricTone(score: number): GovernanceInsightTone {
  if (score >= 85) return 'good';
  if (score >= 65) return 'attention';
  return 'critical';
}

export function computeGovernanceInsights(params: {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
}): GovernanceInsightsSummary {
  const { state, version } = params;
  const summary = computeGovernanceSummary({ state, version });
  const workflow = computeGovernanceWorkflow({ state, version });
  const governance = state.governance;
  const decisions = governance?.decisions ?? [];
  const activeDecisions = decisions.filter(entry => entry.status === 'open' || entry.status === 'in_review');
  const overdueDecisionCount = activeDecisions.filter(entry => dueState(entry.dueDate) === 'overdue').length;
  const dueSoonDecisionCount = activeDecisions.filter(entry => dueState(entry.dueDate) === 'soon').length;
  const missingOwnerCount = activeDecisions.filter(entry => !entry.owner?.trim()).length;
  const missingDueDateCount = activeDecisions.filter(entry => dueState(entry.dueDate) === 'missing').length;
  const currentReviewAgeDays = diffDays(governance?.teamPlan?.reviewStartedAt);
  const approvalAgeDays = diffDays(governance?.approval?.approvedAt);
  const snapshotCount = governance?.history?.length ?? 0;
  const latestSnapshot = snapshotCount > 0 ? governance?.history?.[snapshotCount - 1] : undefined;
  const delta = compareGovernanceSnapshotToCurrent(latestSnapshot, { state, version });
  const approvalFresh = workflow.approvalFresh;
  const reportReady = Boolean(state.reportSnapshot);
  const coordinatorReady = Boolean(governance?.teamPlan?.coordinator?.trim());
  const reviewerReady = (governance?.teamPlan?.reviewers?.filter(Boolean).length ?? 0) > 0;

  let score = 100;
  score -= Math.min(30, activeDecisions.length * 4);
  score -= overdueDecisionCount * 10;
  score -= dueSoonDecisionCount * 3;
  score -= missingOwnerCount * 8;
  score -= missingDueDateCount * 5;
  if (!coordinatorReady) score -= 8;
  if (!reviewerReady) score -= 8;
  if (!reportReady) score -= 8;
  if (workflow.hasApproval && !approvalFresh) score -= 14;
  if (snapshotCount === 0) score -= 5;
  if (currentReviewAgeDays !== null && currentReviewAgeDays > 14 && activeDecisions.length > 0) score -= 8;
  if (approvalAgeDays !== null && approvalAgeDays > 30 && approvalFresh) score -= 4;
  score = Math.max(0, Math.min(100, score));

  const tone = buildMetricTone(score);
  const headline =
    tone === 'good'
      ? 'Governance und Freigabe wirken ruhig geführt und nachvollziehbar.'
      : tone === 'attention'
      ? 'Governance wirkt tragfähig, braucht aber noch einige gezielte Klärungen.'
      : 'Governance und Freigabe haben aktuell sichtbare Engpässe.';

  const summaryText = workflow.hasApproval && !approvalFresh
    ? 'Seit der letzten Freigabe hat sich die Analysebasis verändert. Die Freigabe sollte deshalb bewusst neu bestätigt werden.'
    : activeDecisions.length > 0
    ? `${activeDecisions.length} aktive Governance-Punkte halten den Freigabepfad noch offen.`
    : summary.readyForShare
    ? 'Es gibt aktuell keine aktiven Governance-Punkte. Der Stand wirkt grundsätzlich weitergabefähig.'
    : summary.summary;

  const nextAction =
    overdueDecisionCount > 0
      ? 'Überfällige Governance-Punkte zuerst klären oder bewusst zurückstellen.'
      : missingOwnerCount > 0
      ? 'Aktiven Governance-Punkten klare Owner zuordnen.'
      : missingDueDateCount > 0
      ? 'Für aktive Governance-Punkte Zieltermine festlegen.'
      : workflow.hasApproval && !approvalFresh
      ? 'Freigabe nach der letzten Änderung bewusst neu bestätigen.'
      : currentReviewAgeDays !== null && currentReviewAgeDays > 14 && activeDecisions.length > 0
      ? 'Laufendes Review straffen und die ältesten Punkte priorisieren.'
      : workflow.nextAction;

  const priorities: GovernancePriorityItem[] = [];

  if (workflow.hasApproval && !approvalFresh) {
    priorities.push({
      id: 'approval-refresh',
      title: 'Freigabe bewusst erneuern',
      detail: 'Die aktuelle Freigabe passt nicht mehr vollständig zur veränderten Analysebasis.',
      nextAction: 'Freigabe-Notiz prüfen und nach kurzer Review-Runde neu bestätigen.',
      severity: 'high',
    });
  }

  activeDecisions
    .slice()
    .sort((a, b) => rankDecision(b) - rankDecision(a) || (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 4)
    .forEach(entry => {
      const due = dueState(entry.dueDate);
      const issues: string[] = [];
      if (due === 'overdue') issues.push('überfällig');
      else if (due === 'soon') issues.push('zeitnah fällig');
      else if (due === 'missing') issues.push('ohne Termin');
      if (!entry.owner?.trim()) issues.push('ohne Owner');
      if (entry.status === 'in_review') issues.push('in Prüfung');
      priorities.push({
        id: `decision-${entry.id}`,
        decisionId: entry.id,
        title: entry.title,
        detail: issues.length > 0 ? issues.join(', ') : 'aktiver Governance-Punkt',
        nextAction: entry.owner?.trim()
          ? `Mit ${entry.owner.trim()} klären und Status aktualisieren.`
          : 'Owner festlegen und Entscheidungspfad kurz dokumentieren.',
        severity: due === 'overdue' || !entry.owner?.trim() ? 'high' : due === 'soon' || entry.status === 'in_review' ? 'medium' : 'low',
      });
    });

  if (!coordinatorReady || !reviewerReady) {
    priorities.push({
      id: 'review-setup',
      title: 'Review-Kreis schärfen',
      detail: `${coordinatorReady ? 'Koordination steht' : 'Koordination fehlt'} · ${reviewerReady ? 'Reviewer hinterlegt' : 'Reviewer fehlen'}`,
      nextAction: 'Koordination und Review-Beteiligte knapp festlegen, damit der Pfad belastbar wird.',
      severity: coordinatorReady && reviewerReady ? 'low' : 'medium',
    });
  }

  if (snapshotCount === 0) {
    priorities.push({
      id: 'snapshot',
      title: 'Governance-Stand merken',
      detail: 'Es gibt noch keinen gemerkten Governance-Stand für spätere Vergleiche.',
      nextAction: 'Den aktuellen Review- oder Freigabestand einmal bewusst sichern.',
      severity: 'low',
    });
  }

  const metrics: GovernanceInsightMetric[] = [
    {
      key: 'score',
      label: 'Governance-Reife',
      value: `${score}/100`,
      detail: headline,
      tone,
    },
    {
      key: 'active',
      label: 'Aktive Punkte',
      value: `${activeDecisions.length}`,
      detail:
        overdueDecisionCount > 0
          ? `${overdueDecisionCount} überfällig${missingOwnerCount > 0 ? ` · ${missingOwnerCount} ohne Owner` : ''}`
          : missingOwnerCount > 0
          ? `${missingOwnerCount} ohne Owner${missingDueDateCount > 0 ? ` · ${missingDueDateCount} ohne Termin` : ''}`
          : activeDecisions.length > 0
          ? 'Aktive Governance-Punkte ohne akute Überfälligkeit'
          : 'Keine aktiven Governance-Punkte',
      tone: overdueDecisionCount > 0 || missingOwnerCount > 0 ? 'critical' : activeDecisions.length > 0 ? 'attention' : 'good',
    },
    {
      key: 'review',
      label: 'Review-Zyklus',
      value: currentReviewAgeDays === null ? '—' : `${currentReviewAgeDays} Tage`,
      detail:
        currentReviewAgeDays === null
          ? 'Noch kein laufender Review-Zyklus dokumentiert'
          : currentReviewAgeDays > 14
          ? 'Review läuft schon relativ lange'
          : 'Laufender Review-Zyklus ist zeitlich unkritisch',
      tone: currentReviewAgeDays === null ? 'attention' : currentReviewAgeDays > 14 ? 'critical' : currentReviewAgeDays > 7 ? 'attention' : 'good',
    },
    {
      key: 'approval',
      label: 'Freigabe-Status',
      value: workflow.hasApproval ? (approvalFresh ? 'aktuell' : 'erneuern') : 'offen',
      detail:
        workflow.hasApproval
          ? approvalFresh
            ? approvalAgeDays === null
              ? 'Freigabe ist dokumentiert und aktuell'
              : `Freigabe vor ${approvalAgeDays} Tagen dokumentiert`
            : 'Freigabe ist dokumentiert, aber nicht mehr deckungsgleich mit der Analysebasis'
          : 'Noch keine formale Freigabe dokumentiert',
      tone: workflow.hasApproval ? (approvalFresh ? 'good' : 'critical') : summary.readyForShare ? 'attention' : 'attention',
    },
    {
      key: 'history',
      label: 'Vergleichsbasis',
      value: `${snapshotCount}`,
      detail: snapshotCount > 0 ? delta?.summary ?? 'Mindestens ein Governance-Stand ist für Vergleiche vorhanden.' : 'Noch kein gemerkter Governance-Stand vorhanden',
      tone: snapshotCount > 0 ? 'good' : 'attention',
    },
  ];

  return {
    score,
    tone,
    headline,
    summary: summaryText,
    nextAction,
    activeDecisionCount: activeDecisions.length,
    overdueDecisionCount,
    dueSoonDecisionCount,
    missingOwnerCount,
    missingDueDateCount,
    currentReviewAgeDays,
    approvalAgeDays,
    approvalFresh,
    snapshotCount,
    metrics,
    priorities: priorities.slice(0, 6),
    trendSummary: delta?.summary ?? 'Noch kein Governance-Vergleich vorhanden.',
  };
}

export function buildGovernanceAssistantBrief(params: {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
}): string {
  const insights = computeGovernanceInsights(params);
  const lines = [
    'Freigabe-Assistenz und Governance-Auswertung',
    '',
    `Governance-Reife: ${insights.score}/100`,
    insights.headline,
    insights.summary,
    `Nächster sinnvoller Schritt: ${insights.nextAction}`,
    '',
    'Kernwerte',
    ...insights.metrics.map(item => `- ${item.label}: ${item.value} · ${item.detail}`),
    '',
    'Priorisierte Governance-Punkte',
    ...(insights.priorities.length > 0
      ? insights.priorities.map(item => `- [${item.severity === 'high' ? 'hoch' : item.severity === 'medium' ? 'mittel' : 'niedrig'}] ${item.title}: ${item.detail}. ${item.nextAction}`)
      : ['- Aktuell keine priorisierten Governance-Punkte.']),
    '',
    `Trend zum letzten gemerkten Governance-Stand: ${insights.trendSummary}`,
  ];
  return lines.join('\n');
}
