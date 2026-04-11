import type {
  ProcessMiningAssistedV2State,
  ProcessMiningGovernanceSnapshot,
  ProcessMiningGovernanceState,
  ProcessMiningGovernanceWorkflowStage,
  ProcessVersion,
  ProcessMiningGovernanceReviewTemplateKey,
} from '../../domain/process';
import {
  computeGovernanceSummary,
  countGovernanceDecisionStatuses,
  createEmptyGovernanceState,
  upsertGovernanceDecision,
} from './governance';

export interface GovernanceWorkflowSummary {
  stage: ProcessMiningGovernanceWorkflowStage;
  stageLabel: string;
  headline: string;
  detail: string;
  nextAction: string;
  approvalFresh: boolean;
  hasApproval: boolean;
  basisFingerprint: string;
}

export interface GovernanceSnapshotDelta {
  summary: string;
  metricChanges: Array<{
    key: 'open' | 'in_review' | 'approved' | 'deferred';
    label: string;
    previousValue: number;
    currentValue: number;
    delta: number;
  }>;
  workflowChanged: boolean;
  isAligned: boolean;
}

export type ReviewTemplatePreset = {
  key: ProcessMiningGovernanceReviewTemplateKey;
  label: string;
  shortLabel: string;
  description: string;
  decisionTitles: string[];
};

export const REVIEW_TEMPLATE_PRESETS: ReviewTemplatePreset[] = [
  {
    key: 'team-review',
    label: 'Team-Review',
    shortLabel: 'Team-Review',
    description: 'Geeignet für einen ruhigen internen Prüfstand mit Service, Fachbereich und Prozessverantwortung.',
    decisionTitles: [
      'Hauptlinie und wichtige Varianten mit dem Team abgleichen',
      'Offene Datenlücken priorisieren und Owner festlegen',
      'Wichtige Reibungssignale fachlich bestätigen oder relativieren',
    ],
  },
  {
    key: 'management-approval',
    label: 'Management-Freigabe',
    shortLabel: 'Management',
    description: 'Geeignet für kurze Entscheidungsvorlagen, Freigaben und Management-Weitergabe.',
    decisionTitles: [
      'Management-Zusammenfassung auf Belastbarkeit prüfen',
      'Freigabekriterien und offene Risiken explizit festhalten',
      'Owner und nächstes Entscheidungsdatum bestätigen',
    ],
  },
  {
    key: 'pilot-release',
    label: 'Pilot-Weitergabe',
    shortLabel: 'Pilot',
    description: 'Geeignet für einen begleiteten Pilotlauf mit klaren offenen Punkten und Verantwortlichkeiten.',
    decisionTitles: [
      'Pilot-Paket und Zielgruppe vor Weitergabe prüfen',
      'Offene Governance-Punkte für den Pilot explizit benennen',
      'Review-Kreis und nächstes Pilot-Check-in festhalten',
    ],
  },
];

function safeArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function buildGovernanceBasisFingerprint(state: ProcessMiningAssistedV2State): string {
  const discovery = state.discoverySummary;
  const conformance = state.conformanceSummary;
  const enhancement = state.enhancementSummary;
  const quality = state.qualitySummary;
  const payload = {
    cases: state.cases.length,
    observations: state.observations.length,
    steps: quality?.stepObservationCount ?? state.observations.filter(item => item.kind === 'step').length,
    evidence: quality?.stepObservationsWithEvidence ?? state.observations.filter(item => item.kind === 'step' && item.evidenceSnippet?.trim()).length,
    topSteps: safeArray(discovery?.topSteps).slice(0, 8),
    variantCount: discovery?.variantCount ?? 0,
    mainVariantShare: discovery?.mainVariantShare ?? 0,
    deviations: safeArray(conformance?.deviationNotes).slice(0, 8),
    hotspots: safeArray(enhancement?.issues).slice(0, 6).map(item => item.title),
    reportBasis: state.reportSnapshot?.basis ?? null,
  };
  return JSON.stringify(payload);
}

function stageLabel(stage: ProcessMiningGovernanceWorkflowStage): string {
  switch (stage) {
    case 'draft':
      return 'Analysebasis';
    case 'review-prep':
      return 'Review vorbereiten';
    case 'review-running':
      return 'In Prüfung';
    case 'approval-ready':
      return 'Freigabe';
    case 'approved':
      return 'Weitergabe';
    default:
      return stage;
  }
}

export function computeGovernanceWorkflow(params: {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
}): GovernanceWorkflowSummary {
  const { state, version } = params;
  const governance = state.governance ?? createEmptyGovernanceState();
  const summary = computeGovernanceSummary({ state, version });
  const counts = countGovernanceDecisionStatuses(governance);
  const approval = governance.approval;
  const basisFingerprint = buildGovernanceBasisFingerprint(state);
  const approvalFresh = Boolean(approval?.status === 'approved' && approval.basisFingerprint === basisFingerprint);
  const hasApproval = Boolean(approval?.status === 'approved');

  let stage: ProcessMiningGovernanceWorkflowStage = 'draft';
  let headline = 'Der Governance-Pfad beginnt mit einer belastbaren Analysebasis.';
  let detail = 'Sobald Materialbasis, Bericht und Review-Kreis stehen, lässt sich der Stand ruhig in ein Review überführen.';
  let nextAction = summary.nextAction;

  if (state.cases.length === 0 || state.observations.length === 0) {
    stage = 'draft';
    headline = 'Noch keine belastbare Analysebasis für Review oder Freigabe.';
    detail = 'Starten Sie mit mindestens einer ausgewerteten Quelle, damit Review und Governance auf echten Schritten aufbauen.';
    nextAction = 'Mindestens eine Quelle auswerten';
  } else if (hasApproval && approvalFresh) {
    stage = 'approved';
    headline = 'Der Governance-Stand ist freigegeben und passt noch zur aktuellen Analysebasis.';
    detail = approval?.approvedAt
      ? `Freigegeben am ${new Date(approval.approvedAt).toLocaleString('de-DE')}${approval.approvedBy ? ` durch ${approval.approvedBy}` : ''}.`
      : 'Die Freigabe ist im aktuellen Arbeitsstand dokumentiert.';
    nextAction = 'Den Stand jetzt als Bericht, Pilot-Paket oder Governance-Export weitergeben';
  } else if (summary.readyForShare && summary.activeDecisionCount === 0 && Boolean(state.reportSnapshot)) {
    stage = 'approval-ready';
    headline = hasApproval
      ? 'Eine frühere Freigabe ist durch Änderungen nicht mehr aktuell.'
      : 'Der Stand wirkt reif für eine formale Freigabe.';
    detail = hasApproval
      ? 'Bericht, Analyse oder Governance wurden seit der letzten Freigabe verändert. Bestätigen Sie die Freigabe bitte noch einmal bewusst.'
      : 'Es sind keine aktiven Governance-Punkte mehr offen und ein aktueller Bericht liegt vor.';
    nextAction = 'Freigabe setzen oder eine kurze letzte Review-Runde durchführen';
  } else if (counts.in_review > 0 || Boolean(governance.teamPlan?.reviewStartedAt)) {
    stage = 'review-running';
    headline = 'Der Governance-Stand ist aktuell in Prüfung.';
    detail = counts.in_review > 0
      ? `${counts.in_review} ${counts.in_review === 1 ? 'Punkt ist' : 'Punkte sind'} aktiv in Prüfung. Halten Sie Owner, Belege und Zieltermine knapp nach.`
      : 'Ein Review wurde gestartet. Jetzt geht es vor allem darum, offene Punkte sauber auf „freigegeben“ oder „zurückgestellt“ zu klären.';
    nextAction = counts.in_review > 0 ? 'Aktive Punkte klären und für Freigabe vorbereiten' : 'Review-Ergebnisse festhalten und offene Punkte schließen';
  } else {
    stage = 'review-prep';
    headline = 'Die Analyse ist da, Review und Freigabe können jetzt vorbereitet werden.';
    detail = 'Legen Sie Koordination, Review-Kreis und die wichtigsten Governance-Punkte fest. Danach kann das Team strukturiert prüfen.';
    nextAction = summary.nextAction || 'Review-Kreis festlegen und erste Governance-Punkte anlegen';
  }

  return {
    stage,
    stageLabel: stageLabel(stage),
    headline,
    detail,
    nextAction,
    approvalFresh,
    hasApproval,
    basisFingerprint,
  };
}

export function createGovernanceSnapshot(params: {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
  label?: string;
}): ProcessMiningGovernanceSnapshot {
  const { state, version, label } = params;
  const governance = state.governance ?? createEmptyGovernanceState();
  const counts = countGovernanceDecisionStatuses(governance);
  const summary = computeGovernanceSummary({ state, version });
  const workflow = computeGovernanceWorkflow({ state, version });
  const capturedAt = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    label: label?.trim() || `Governance-Stand ${new Date(capturedAt).toLocaleDateString('de-DE')}`,
    capturedAt,
    workflowStage: workflow.stage,
    readyForShare: summary.readyForShare,
    headline: workflow.headline,
    summary: summary.summary,
    nextAction: workflow.nextAction,
    openDecisionCount: counts.open,
    inReviewDecisionCount: counts.in_review,
    approvedDecisionCount: counts.approved,
    deferredDecisionCount: counts.deferred,
    reviewerCount: governance.teamPlan?.reviewers?.filter(Boolean).length ?? 0,
    coordinator: governance.teamPlan?.coordinator,
    nextReviewAt: governance.teamPlan?.nextReviewAt,
    shareTargets: governance.teamPlan?.shareTargets,
    basisFingerprint: workflow.basisFingerprint,
  };
}

export function pushGovernanceSnapshot(
  history: ProcessMiningGovernanceSnapshot[] | undefined,
  next: ProcessMiningGovernanceSnapshot,
  limit = 8,
): ProcessMiningGovernanceSnapshot[] {
  const base = history ?? [];
  const latest = base.length > 0 ? base[base.length - 1] : undefined;
  if (
    latest &&
    latest.workflowStage === next.workflowStage &&
    latest.readyForShare === next.readyForShare &&
    latest.openDecisionCount === next.openDecisionCount &&
    latest.inReviewDecisionCount === next.inReviewDecisionCount &&
    latest.approvedDecisionCount === next.approvedDecisionCount &&
    latest.deferredDecisionCount === next.deferredDecisionCount &&
    latest.basisFingerprint === next.basisFingerprint
  ) {
    return [...base.slice(0, -1), { ...next, id: latest.id }].slice(-limit);
  }
  return [...base, next].slice(-limit);
}

export function compareGovernanceSnapshotToCurrent(
  snapshot: ProcessMiningGovernanceSnapshot | undefined,
  params: { state: ProcessMiningAssistedV2State; version: ProcessVersion },
): GovernanceSnapshotDelta | null {
  if (!snapshot) return null;
  const current = createGovernanceSnapshot(params);
  const metricChanges = [
    { key: 'open' as const, label: 'Offene Punkte', previousValue: snapshot.openDecisionCount, currentValue: current.openDecisionCount },
    { key: 'in_review' as const, label: 'In Prüfung', previousValue: snapshot.inReviewDecisionCount, currentValue: current.inReviewDecisionCount },
    { key: 'approved' as const, label: 'Freigegeben', previousValue: snapshot.approvedDecisionCount, currentValue: current.approvedDecisionCount },
    { key: 'deferred' as const, label: 'Zurückgestellt', previousValue: snapshot.deferredDecisionCount, currentValue: current.deferredDecisionCount },
  ]
    .map(item => ({ ...item, delta: item.currentValue - item.previousValue }))
    .filter(item => item.delta !== 0);
  const workflowChanged = snapshot.workflowStage !== current.workflowStage || snapshot.readyForShare !== current.readyForShare;
  const fingerprintChanged = snapshot.basisFingerprint !== current.basisFingerprint;
  const summaryParts: string[] = [];
  if (workflowChanged) {
    summaryParts.push(`Status ${stageLabel(snapshot.workflowStage)} → ${stageLabel(current.workflowStage)}`);
  }
  if (metricChanges.length > 0) {
    summaryParts.push(metricChanges.slice(0, 3).map(item => `${item.label} ${item.delta > 0 ? '+' : ''}${item.delta}`).join(' · '));
  }
  if (summaryParts.length === 0) {
    summaryParts.push('Gegenüber dem gemerkten Governance-Stand ist keine sichtbare Änderung erkennbar.');
  }
  return {
    summary: summaryParts.join(' · '),
    metricChanges,
    workflowChanged,
    isAligned: !workflowChanged && !fingerprintChanged && metricChanges.length === 0,
  };
}

export function buildReviewTemplateText(params: {
  key: ProcessMiningGovernanceReviewTemplateKey;
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
}): string {
  const preset = REVIEW_TEMPLATE_PRESETS.find(item => item.key === params.key) ?? REVIEW_TEMPLATE_PRESETS[0];
  const summary = computeGovernanceSummary({ state: params.state, version: params.version });
  const workflow = computeGovernanceWorkflow({ state: params.state, version: params.version });
  return [
    `${preset.label} · Vorlage`,
    '',
    preset.description,
    '',
    `Aktueller Governance-Status: ${workflow.stageLabel}`,
    summary.summary,
    '',
    'Empfohlene Prüfpunkte',
    ...preset.decisionTitles.map(item => `- ${item}`),
    '',
    `Nächster sinnvoller Schritt: ${workflow.nextAction}`,
  ].join('\n');
}

export function applyReviewTemplate(
  governance: ProcessMiningGovernanceState | undefined,
  key: ProcessMiningGovernanceReviewTemplateKey,
): ProcessMiningGovernanceState {
  const base = governance ?? createEmptyGovernanceState();
  const preset = REVIEW_TEMPLATE_PRESETS.find(item => item.key === key) ?? REVIEW_TEMPLATE_PRESETS[0];
  const existing = new Set((base.decisions ?? []).map(entry => entry.title.trim().toLowerCase()));
  const withSuggestions = preset.decisionTitles.reduce<ProcessMiningGovernanceState>((current, title) => {
    if (existing.has(title.trim().toLowerCase())) return current;
    return upsertGovernanceDecision(current, {
      title,
      status: 'open',
      sourceType: 'manual',
    });
  }, base);
  return {
    ...withSuggestions,
    teamPlan: {
      ...(withSuggestions.teamPlan ?? {}),
      reviewTemplateKey: key,
    },
  };
}

export function startGovernanceReview(governance: ProcessMiningGovernanceState | undefined): ProcessMiningGovernanceState {
  const base = governance ?? createEmptyGovernanceState();
  return {
    ...base,
    teamPlan: {
      ...(base.teamPlan ?? {}),
      reviewStartedAt: new Date().toISOString(),
    },
    approval: base.approval?.status === 'approved'
      ? { ...base.approval, status: 'approval_ready' }
      : base.approval,
  };
}

export function markGovernanceApprovalReady(governance: ProcessMiningGovernanceState | undefined): ProcessMiningGovernanceState {
  const base = governance ?? createEmptyGovernanceState();
  return {
    ...base,
    approval: {
      ...(base.approval ?? {}),
      status: 'approval_ready',
      approvedAt: undefined,
      approvedBy: base.approval?.approvedBy,
      note: base.approval?.note,
    },
  };
}

export function approveGovernance(params: {
  governance: ProcessMiningGovernanceState | undefined;
  approvedBy?: string;
  note?: string;
  basisFingerprint: string;
}): ProcessMiningGovernanceState {
  const { governance, approvedBy, note, basisFingerprint } = params;
  const base = governance ?? createEmptyGovernanceState();
  return {
    ...base,
    approval: {
      status: 'approved',
      approvedBy: approvedBy?.trim() || base.approval?.approvedBy,
      approvedAt: new Date().toISOString(),
      note: note?.trim() || base.approval?.note,
      basisFingerprint,
    },
  };
}

export function clearGovernanceApproval(governance: ProcessMiningGovernanceState | undefined): ProcessMiningGovernanceState {
  const base = governance ?? createEmptyGovernanceState();
  const rest: ProcessMiningGovernanceState = { ...base };
  delete (rest as { approval?: ProcessMiningGovernanceState['approval'] }).approval;
  return rest;
}
