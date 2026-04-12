import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCopy, Download, MessageSquarePlus, MessagesSquare, ShieldEllipsis, UserRoundCheck } from 'lucide-react';
import type { ProcessMiningAssistedV2State, ProcessVersion, ProcessMiningCommentStatus } from '../../domain/process';
import { CollapsibleCard } from '../components/CollapsibleCard';
import {
  appendAuditForComment,
  buildCollaborationExportText,
  buildCollaborationSummary,
  buildCollaborationTargetOptions,
  changeCommentStatus,
  createComment,
  noteCollaborationEvent,
  rememberCollaborationActor,
  upsertComment,
} from './collaboration';
import { downloadTextFile } from '../../utils/downloadTextFile';

interface Props {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onSaveEvidence: (text: string, key: string) => void;
}

const STATUS_LABELS: Record<ProcessMiningCommentStatus, string> = {
  open: 'offen',
  in_review: 'in Prüfung',
  resolved: 'erledigt',
};

function sanitizeFilename(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]+/g, '')
    .replace(/\s+/g, '_')
    .trim() || 'zusammenarbeit';
}

export function CollaborationPanel({ state, version, onChange, onSaveEvidence }: Props) {
  const summary = useMemo(() => buildCollaborationSummary(state), [state]);
  const targetOptions = useMemo(() => buildCollaborationTargetOptions(state), [state]);
  const comments = state.collaboration?.comments ?? [];
  const auditTrail = state.collaboration?.auditTrail ?? [];
  const [author, setAuthor] = useState(state.collaboration?.lastActor ?? '');
  const [selectedTarget, setSelectedTarget] = useState(targetOptions[0]?.value ?? 'workspace::workspace');
  const [text, setText] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [savedCommentId, setSavedCommentId] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const target = targetOptions.find(option => option.value === selectedTarget) ?? targetOptions[0];
  const activeComments = comments.filter(comment => comment.status !== 'resolved');
  const resolvedComments = comments.filter(comment => comment.status === 'resolved');

  function updateAuthor(value: string) {
    setAuthor(value);
    onChange({
      collaboration: rememberCollaborationActor(state.collaboration, value),
    });
  }

  function addComment() {
    if (!target || !text.trim()) return;
    const comment = createComment({
      targetType: target.targetType,
      targetRef: target.targetRef,
      targetLabel: target.targetLabel,
      author,
      text,
      nextAction,
    });
    let collaboration = upsertComment(state.collaboration, comment);
    collaboration = rememberCollaborationActor(collaboration, author);
    collaboration = appendAuditForComment(collaboration, {
      action: 'comment-added',
      comment,
      actor: author,
    });
    onChange({ collaboration });
    setSavedCommentId(comment.id);
    setText('');
    setNextAction('');
    setTimeout(() => setSavedCommentId(''), 1800);
  }

  function setCommentStatus(commentId: string, status: ProcessMiningCommentStatus) {
    const comment = comments.find(entry => entry.id === commentId);
    if (!comment) return;
    let collaboration = changeCommentStatus(state.collaboration, commentId, status);
    collaboration = appendAuditForComment(collaboration, {
      action: status === 'resolved' ? 'comment-resolved' : status === 'open' ? 'comment-reopened' : 'comment-status-changed',
      comment: { ...comment, status },
      actor: author || comment.author,
      detail: `${comment.text}${comment.nextAction ? ` · Nächster Schritt: ${comment.nextAction}` : ''}`,
    });
    collaboration = rememberCollaborationActor(collaboration, author || comment.author);
    onChange({ collaboration });
  }

  async function copyExport() {
    const exportText = buildCollaborationExportText(state);
    await navigator.clipboard.writeText(exportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function downloadExport() {
    downloadTextFile({
      filename: `${sanitizeFilename(version.titleSnapshot || 'pm')}_zusammenarbeit.txt`,
      content: buildCollaborationExportText(state),
      mimeType: 'text/plain;charset=utf-8',
    });
  }

  function saveCommentAsEvidence(commentId: string) {
    const comment = comments.find(entry => entry.id === commentId);
    if (!comment) return;
    const payload = [
      `Kommentar zu ${comment.targetLabel}`,
      comment.author ? `Von: ${comment.author}` : undefined,
      `Status: ${STATUS_LABELS[comment.status]}`,
      `Text: ${comment.text}`,
      comment.nextAction ? `Nächster Schritt: ${comment.nextAction}` : undefined,
    ].filter(Boolean).join('\n');
    onSaveEvidence(payload, `collaboration-${comment.id}`);
  }

  function markReviewTaken(note: string) {
    const collaboration = noteCollaborationEvent(state.collaboration, {
      action: 'comment-status-changed',
      actor: author,
      targetType: 'workspace',
      targetLabel: 'Zusammenarbeit und Review',
      detail: note,
    });
    onChange({ collaboration: rememberCollaborationActor(collaboration, author) });
  }

  return (
    <CollapsibleCard
      title="Zusammenarbeit, Kommentare und Auditspur"
      helpKey="pmv2.collaboration"
      description="Hält kurze Review-Kommentare, nächste Schritte und eine nachvollziehbare Auditspur direkt am PM-Arbeitsstand."
      defaultOpen={false}
      right={
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${summary.needsAttention ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {summary.needsAttention ? 'Kommentare offen' : 'ruhiger Stand'}
        </span>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-cyan-900">
              <MessagesSquare className="h-4 w-4" />
              <p className="text-sm font-semibold">Zusammenarbeit auf einen Blick</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                ['Offen', summary.openCommentCount],
                ['In Prüfung', summary.inReviewCommentCount],
                ['Erledigt', summary.resolvedCommentCount],
                ['Audit-Einträge', summary.auditEntryCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-white/80 bg-white/80 p-3">
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{summary.latestAuditHeadline}</p>
            {summary.latestAuditDetail && <p className="text-xs leading-relaxed text-slate-500">{summary.latestAuditDetail}</p>}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <MessageSquarePlus className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Kommentar erfassen</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Kommentar von</label>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  value={author}
                  onChange={event => updateAuthor(event.target.value)}
                  placeholder="z. B. Julia Neumann"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Bezieht sich auf</label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  value={selectedTarget}
                  onChange={event => setSelectedTarget(event.target.value)}
                >
                  {targetOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Kommentar</label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-y"
                value={text}
                onChange={event => setText(event.target.value)}
                placeholder="Was sollte das Team sehen, prüfen oder bewusst festhalten?"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Nächster Schritt (optional)</label>
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                value={nextAction}
                onChange={event => setNextAction(event.target.value)}
                placeholder="z. B. im nächsten Review mit Qualität und Vertrieb klären"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addComment}
                disabled={!text.trim() || !target}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MessageSquarePlus className="h-4 w-4" />
                Kommentar übernehmen
              </button>
              {savedCommentId && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Kommentar gespeichert
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <UserRoundCheck className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Aktive Kommentare</p>
            </div>
            {activeComments.length === 0 ? (
              <p className="text-sm text-slate-500">Aktuell gibt es keine offenen oder laufenden Team-Kommentare.</p>
            ) : (
              <div className="space-y-3">
                {activeComments.map(comment => (
                  <div key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">{comment.targetLabel}</span>
                      <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">{STATUS_LABELS[comment.status]}</span>
                      {comment.author && <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">{comment.author}</span>}
                    </div>
                    <p className="text-sm leading-relaxed text-slate-800">{comment.text}</p>
                    {comment.nextAction && <p className="text-xs leading-relaxed text-slate-600">Nächster Schritt: {comment.nextAction}</p>}
                    <div className="flex flex-wrap gap-2">
                      <select
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                        value={comment.status}
                        onChange={event => setCommentStatus(comment.id, event.target.value as ProcessMiningCommentStatus)}
                      >
                        <option value="open">offen</option>
                        <option value="in_review">in Prüfung</option>
                        <option value="resolved">erledigt</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => saveCommentAsEvidence(comment.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <ShieldEllipsis className="h-3.5 w-3.5" /> Als Evidenz merken
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldEllipsis className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Auditspur</p>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Jede bewusste Team-Notiz oder Governance-Aktion kann hier als nachvollziehbare Spur mitgeführt werden.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyExport}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ClipboardCopy className="h-3.5 w-3.5" /> {copied ? 'Kopiert' : 'Auditspur kopieren'}
              </button>
              <button
                type="button"
                onClick={downloadExport}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" /> Als Text herunterladen
              </button>
              <button
                type="button"
                onClick={() => markReviewTaken('Review-Kommentar wurde als Team-Update festgehalten.')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <MessagesSquare className="h-3.5 w-3.5" /> Team-Update merken
              </button>
            </div>
            {auditTrail.length === 0 ? (
              <p className="text-sm text-slate-500">Noch keine Audit-Einträge vorhanden.</p>
            ) : (
              <div className="space-y-2">
                {auditTrail.slice().reverse().slice(0, 10).map(entry => (
                  <div key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-700">{entry.targetLabel}</span>
                      <span className="text-[11px] text-slate-500">{new Date(entry.createdAt).toLocaleString('de-DE')}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-800">{entry.detail ?? entry.action}</p>
                    <p className="text-xs leading-relaxed text-slate-500">{entry.actor ? `${entry.actor} · ` : ''}{entry.action}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-semibold">Erledigte Kommentare</p>
            </div>
            {resolvedComments.length === 0 ? (
              <p className="text-sm text-slate-500">Noch keine erledigten Kommentare im aktuellen Arbeitsstand.</p>
            ) : (
              <div className="space-y-2">
                {resolvedComments.slice().reverse().slice(0, 6).map(comment => (
                  <div key={comment.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">{comment.targetLabel}</span>
                      <span className="text-[11px] text-slate-500">{comment.author ?? 'ohne Autor'}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{comment.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}
