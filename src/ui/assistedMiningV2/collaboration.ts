import type {
  ProcessMiningAssistedV2State,
  ProcessMiningAuditAction,
  ProcessMiningAuditEntry,
  ProcessMiningCollaborationState,
  ProcessMiningComment,
  ProcessMiningCommentStatus,
  ProcessMiningCommentTargetType,
} from '../../domain/process';

export interface CollaborationSummary {
  totalCommentCount: number;
  openCommentCount: number;
  inReviewCommentCount: number;
  resolvedCommentCount: number;
  auditEntryCount: number;
  actorCount: number;
  latestAuditHeadline: string;
  latestAuditDetail?: string;
  needsAttention: boolean;
}

export interface CollaborationTargetOption {
  value: string;
  label: string;
  targetType: ProcessMiningCommentTargetType;
  targetRef?: string;
  targetLabel: string;
}

export function createEmptyCollaborationState(): ProcessMiningCollaborationState {
  return {
    comments: [],
    auditTrail: [],
  };
}

function safeState(state: ProcessMiningAssistedV2State): ProcessMiningCollaborationState {
  return state.collaboration ?? createEmptyCollaborationState();
}

function actionLabel(action: ProcessMiningAuditAction): string {
  switch (action) {
    case 'comment-added':
      return 'Kommentar erfasst';
    case 'comment-status-changed':
      return 'Kommentarstatus geändert';
    case 'comment-reopened':
      return 'Kommentar wieder geöffnet';
    case 'comment-resolved':
      return 'Kommentar erledigt';
    case 'report-generated':
      return 'Bericht erzeugt';
    case 'connector-contract-generated':
      return 'Connector-Vertrag erzeugt';
    case 'connector-receipt-imported':
      return 'Connector-Rückmeldung importiert';
    case 'security-profile-reviewed':
      return 'Sicherheitsprofil geprüft';
    case 'security-profile-exported':
      return 'Sicherheitsprofil exportiert';
    case 'governance-decision-added':
      return 'Governance-Punkt ergänzt';
    case 'governance-decision-status':
      return 'Governance-Status geändert';
    case 'governance-review-started':
      return 'Review gestartet';
    case 'governance-snapshot-saved':
      return 'Governance-Stand gemerkt';
    case 'governance-approved':
      return 'Freigabe erteilt';
    case 'governance-approval-cleared':
      return 'Freigabe zurückgenommen';
    case 'acceptance-updated':
      return 'Abnahme-Entscheidung aktualisiert';
    case 'acceptance-snapshot-saved':
      return 'Abnahmestand gemerkt';
    default:
      return 'Änderung dokumentiert';
  }
}

export function buildCollaborationSummary(state: ProcessMiningAssistedV2State): CollaborationSummary {
  const collaboration = safeState(state);
  const comments = collaboration.comments ?? [];
  const auditTrail = collaboration.auditTrail ?? [];
  const latestAudit = auditTrail.length > 0 ? auditTrail[auditTrail.length - 1] : undefined;
  const actorCount = new Set(
    [
      collaboration.lastActor,
      ...comments.map(comment => comment.author),
      ...auditTrail.map(entry => entry.actor),
    ].filter((value): value is string => Boolean(value && value.trim())),
  ).size;

  const openCommentCount = comments.filter(comment => comment.status === 'open').length;
  const inReviewCommentCount = comments.filter(comment => comment.status === 'in_review').length;
  const resolvedCommentCount = comments.filter(comment => comment.status === 'resolved').length;

  return {
    totalCommentCount: comments.length,
    openCommentCount,
    inReviewCommentCount,
    resolvedCommentCount,
    auditEntryCount: auditTrail.length,
    actorCount,
    latestAuditHeadline: latestAudit ? `${actionLabel(latestAudit.action)} · ${latestAudit.targetLabel}` : 'Noch keine Zusammenarbeit dokumentiert.',
    latestAuditDetail: latestAudit?.detail,
    needsAttention: openCommentCount > 0 || inReviewCommentCount > 0,
  };
}

export function buildCollaborationTargetOptions(state: ProcessMiningAssistedV2State): CollaborationTargetOption[] {
  const options: CollaborationTargetOption[] = [
    {
      value: 'workspace::workspace',
      label: 'Arbeitsstand insgesamt',
      targetType: 'workspace',
      targetLabel: 'Arbeitsstand insgesamt',
    },
  ];

  if (state.reportSnapshot) {
    options.push({
      value: 'report::current',
      label: 'Aktueller Bericht',
      targetType: 'report',
      targetRef: 'current-report',
      targetLabel: state.reportSnapshot.title || 'Aktueller Bericht',
    });
  }

  if (state.governance) {
    options.push({
      value: 'governance::state',
      label: 'Governance-Stand',
      targetType: 'governance',
      targetRef: 'governance-state',
      targetLabel: 'Governance-Stand',
    });
  }

  for (const decision of state.governance?.decisions ?? []) {
    options.push({
      value: `governance-decision::${decision.id}`,
      label: `Governance-Entscheidung: ${decision.title}`,
      targetType: 'governance-decision',
      targetRef: decision.id,
      targetLabel: decision.title,
    });
  }

  for (const stepLabel of state.discoverySummary?.topSteps ?? []) {
    options.push({
      value: `step::${stepLabel}`,
      label: `Kernschritt: ${stepLabel}`,
      targetType: 'step',
      targetRef: stepLabel,
      targetLabel: stepLabel,
    });
  }

  for (const source of state.cases) {
    options.push({
      value: `source::${source.id}`,
      label: `Quelle: ${source.name}`,
      targetType: 'source',
      targetRef: source.id,
      targetLabel: source.name,
    });
  }

  for (const exportItem of state.connectorToolkit?.history ?? []) {
    options.push({
      value: `connector::${exportItem.id}`,
      label: `Connector-Export: ${exportItem.label}`,
      targetType: 'connector',
      targetRef: exportItem.id,
      targetLabel: exportItem.label,
    });
  }

  for (const contractItem of state.connectorToolkit?.contractHistory ?? []) {
    options.push({
      value: `connector::contract-${contractItem.id}`,
      label: `Integrationsvertrag: ${contractItem.label}`,
      targetType: 'connector',
      targetRef: contractItem.id,
      targetLabel: contractItem.label,
    });
  }

  for (const receipt of state.connectorToolkit?.receipts ?? []) {
    options.push({
      value: `connector::receipt-${receipt.id}`,
      label: `Connector-Rückmeldung: ${receipt.label}`,
      targetType: 'connector',
      targetRef: receipt.id,
      targetLabel: receipt.label,
    });
  }

  return options;
}

export function createComment(params: {
  targetType: ProcessMiningCommentTargetType;
  targetRef?: string;
  targetLabel: string;
  author?: string;
  text: string;
  nextAction?: string;
}): ProcessMiningComment {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    targetType: params.targetType,
    targetRef: params.targetRef,
    targetLabel: params.targetLabel,
    author: params.author?.trim() || undefined,
    text: params.text.trim(),
    nextAction: params.nextAction?.trim() || undefined,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertComment(
  collaboration: ProcessMiningCollaborationState | undefined,
  comment: ProcessMiningComment,
): ProcessMiningCollaborationState {
  const current = collaboration ?? createEmptyCollaborationState();
  const comments = current.comments ?? [];
  const index = comments.findIndex(item => item.id === comment.id);
  const nextComments = index >= 0
    ? comments.map(item => (item.id === comment.id ? comment : item))
    : [...comments, comment];
  return {
    ...current,
    comments: nextComments,
  };
}

export function changeCommentStatus(
  collaboration: ProcessMiningCollaborationState | undefined,
  commentId: string,
  status: ProcessMiningCommentStatus,
): ProcessMiningCollaborationState {
  const current = collaboration ?? createEmptyCollaborationState();
  const now = new Date().toISOString();
  return {
    ...current,
    comments: (current.comments ?? []).map(comment =>
      comment.id === commentId ? { ...comment, status, updatedAt: now } : comment,
    ),
  };
}

export function pushAuditEntry(
  collaboration: ProcessMiningCollaborationState | undefined,
  entry: Omit<ProcessMiningAuditEntry, 'id' | 'createdAt'>,
): ProcessMiningCollaborationState {
  const current = collaboration ?? createEmptyCollaborationState();
  const nextEntry: ProcessMiningAuditEntry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  const auditTrail = [...(current.auditTrail ?? []), nextEntry].slice(-80);
  return {
    ...current,
    auditTrail,
  };
}

export function rememberCollaborationActor(
  collaboration: ProcessMiningCollaborationState | undefined,
  actor: string | undefined,
): ProcessMiningCollaborationState {
  const current = collaboration ?? createEmptyCollaborationState();
  return {
    ...current,
    lastActor: actor?.trim() || current.lastActor,
  };
}

export function appendAuditForComment(
  collaboration: ProcessMiningCollaborationState | undefined,
  params: {
    action: ProcessMiningAuditAction;
    comment: ProcessMiningComment;
    actor?: string;
    detail?: string;
  },
): ProcessMiningCollaborationState {
  return pushAuditEntry(collaboration, {
    action: params.action,
    actor: params.actor?.trim() || params.comment.author,
    targetType: params.comment.targetType,
    targetLabel: params.comment.targetLabel,
    detail: params.detail ?? params.comment.text,
  });
}

export function noteCollaborationEvent(
  collaboration: ProcessMiningCollaborationState | undefined,
  params: {
    action: ProcessMiningAuditAction;
    actor?: string;
    targetType: ProcessMiningAuditEntry['targetType'];
    targetLabel: string;
    detail?: string;
  },
): ProcessMiningCollaborationState {
  return pushAuditEntry(collaboration, params);
}

export function buildCollaborationExportText(state: ProcessMiningAssistedV2State): string {
  const collaboration = safeState(state);
  const comments = collaboration.comments ?? [];
  const auditTrail = collaboration.auditTrail ?? [];
  const open = comments.filter(comment => comment.status !== 'resolved');
  const resolved = comments.filter(comment => comment.status === 'resolved');

  return [
    'Zusammenarbeit und Auditspur',
    '',
    `Offene Kommentare: ${open.length}`,
    `Erledigte Kommentare: ${resolved.length}`,
    `Audit-Einträge: ${auditTrail.length}`,
    '',
    'Aktive Kommentare',
    ...open.map(comment => `- [${comment.status}] ${comment.targetLabel}: ${comment.text}${comment.nextAction ? ` · Nächster Schritt: ${comment.nextAction}` : ''}`),
    '',
    'Auditspur',
    ...auditTrail.slice(-12).map(entry => `- ${new Date(entry.createdAt).toLocaleString('de-DE')} · ${actionLabel(entry.action)} · ${entry.targetLabel}${entry.detail ? ` · ${entry.detail}` : ''}`),
  ].join('\n');
}
