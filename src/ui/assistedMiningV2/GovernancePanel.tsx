import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  Download,
  FileCheck2,
  History,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import type { ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import { CollapsibleCard } from '../components/CollapsibleCard';
import { HelpPopover } from '../components/HelpPopover';
import {
  buildGovernanceNote,
  buildGovernanceOpenDecisionsText,
  buildGovernanceReviewPackageText,
  computeGovernanceSummary,
  countGovernanceDecisionStatuses,
  createEmptyGovernanceState,
  getGovernanceStatusLabel,
  getGovernanceStatusTone,
  removeGovernanceDecision,
  updateGovernanceTeamPlan,
  upsertGovernanceDecision,
} from './governance';
import {
  applyReviewTemplate,
  approveGovernance,
  buildReviewTemplateText,
  clearGovernanceApproval,
  compareGovernanceSnapshotToCurrent,
  computeGovernanceWorkflow,
  createGovernanceSnapshot,
  markGovernanceApprovalReady,
  pushGovernanceSnapshot,
  REVIEW_TEMPLATE_PRESETS,
  startGovernanceReview,
} from './governanceWorkflow';
import { downloadTextFile } from '../../utils/downloadTextFile';
import { GovernanceInsightsPanel } from './GovernanceInsightsPanel';

interface Props {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onSaveEvidence: (text: string, key: string) => void;
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'offen' },
  { value: 'in_review', label: 'in Prüfung' },
  { value: 'approved', label: 'freigegeben' },
  { value: 'deferred', label: 'zurückgestellt' },
] as const;

const WORKFLOW_ORDER = [
  { key: 'draft', label: 'Analysebasis' },
  { key: 'review-prep', label: 'Review vorbereiten' },
  { key: 'review-running', label: 'In Prüfung' },
  { key: 'approval-ready', label: 'Freigabe' },
  { key: 'approved', label: 'Weitergabe' },
] as const;

function sanitizeFilename(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]+/g, '')
    .replace(/\s+/g, '_')
    .trim() || 'governance';
}

function workflowTone(status: 'done' | 'current' | 'waiting') {
  if (status === 'done') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (status === 'current') return 'border-cyan-200 bg-cyan-50 text-cyan-900';
  return 'border-slate-200 bg-white text-slate-600';
}

export function GovernancePanel({ state, version, onChange, onSaveEvidence }: Props) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const [templateCopied, setTemplateCopied] = useState(false);
  const governance = state.governance ?? createEmptyGovernanceState();
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(governance.teamPlan?.reviewTemplateKey ?? 'team-review');
  const [approvalBy, setApprovalBy] = useState(governance.approval?.approvedBy ?? governance.teamPlan?.coordinator ?? '');
  const [approvalNote, setApprovalNote] = useState(governance.approval?.note ?? '');

  useEffect(() => {
    setSelectedTemplateKey(governance.teamPlan?.reviewTemplateKey ?? 'team-review');
    setApprovalBy(governance.approval?.approvedBy ?? governance.teamPlan?.coordinator ?? '');
    setApprovalNote(governance.approval?.note ?? '');
  }, [governance.teamPlan?.reviewTemplateKey, governance.teamPlan?.coordinator, governance.approval?.approvedBy, governance.approval?.note]);

  const summary = useMemo(() => computeGovernanceSummary({ state, version }), [state, version]);
  const workflow = useMemo(() => computeGovernanceWorkflow({ state, version }), [state, version]);
  const governanceNote = useMemo(() => buildGovernanceNote({ state, version }), [state, version]);
  const openDecisionText = useMemo(() => buildGovernanceOpenDecisionsText({ state, version }), [state, version]);
  const reviewPackageText = useMemo(() => buildGovernanceReviewPackageText({ state, version }), [state, version]);
  const statusCounts = useMemo(() => countGovernanceDecisionStatuses(governance), [governance]);
  const decisions = governance.decisions ?? [];
  const reviewersValue = (governance.teamPlan?.reviewers ?? []).join(', ');
  const history = governance.history ?? [];
  const latestSnapshot = history.length > 0 ? history[history.length - 1] : undefined;
  const snapshotDelta = useMemo(
    () => compareGovernanceSnapshotToCurrent(latestSnapshot, { state, version }),
    [latestSnapshot, state, version],
  );
  const templateText = useMemo(
    () => buildReviewTemplateText({ key: selectedTemplateKey, state, version }),
    [selectedTemplateKey, state, version],
  );
  const workflowIndex = WORKFLOW_ORDER.findIndex(entry => entry.key === workflow.stage);

  async function copyGovernanceNote() {
    await navigator.clipboard.writeText(governanceNote);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function copyTemplate() {
    await navigator.clipboard.writeText(templateText);
    setTemplateCopied(true);
    setTimeout(() => setTemplateCopied(false), 1800);
  }

  function saveGovernanceEvidence() {
    onSaveEvidence(governanceNote, 'governance-note');
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function addDecision(title?: string) {
    onChange({
      governance: upsertGovernanceDecision(governance, {
        title: title ?? 'Neue Governance-Entscheidung',
        status: 'open',
        sourceType: title ? 'analysis' : 'manual',
      }),
    });
  }

  function saveSnapshot(label?: string) {
    const snapshot = createGovernanceSnapshot({ state, version, label });
    onChange({
      governance: {
        ...governance,
        history: pushGovernanceSnapshot(governance.history, snapshot),
      },
    });
    setSnapshotSaved(true);
    setTimeout(() => setSnapshotSaved(false), 1800);
  }

  function applyTemplate() {
    onChange({
      governance: applyReviewTemplate(governance, selectedTemplateKey),
    });
  }

  function handleStartReview() {
    onChange({
      governance: startGovernanceReview(applyReviewTemplate(governance, selectedTemplateKey)),
    });
  }

  function handleApprovalReady() {
    onChange({
      governance: markGovernanceApprovalReady(governance),
    });
  }

  function handleApprove() {
    onChange({
      governance: approveGovernance({
        governance,
        approvedBy: approvalBy,
        note: approvalNote,
        basisFingerprint: workflow.basisFingerprint,
      }),
    });
  }

  function handleClearApproval() {
    onChange({
      governance: clearGovernanceApproval(governance),
    });
  }

  function setDecisionStatus(entryId: string, status: typeof STATUS_OPTIONS[number]['value']) {
    const entry = decisions.find(item => item.id === entryId);
    if (!entry) return;
    onChange({
      governance: upsertGovernanceDecision(governance, { ...entry, status }),
    });
  }

  return (
    <CollapsibleCard
      title="Governance, Nachvollziehbarkeit und Teamarbeit"
      helpKey="pmv2.governance"
      description="Sammelt Entscheidungslog, Review-Checkliste, Governance-Vergleiche und klare Freigabewege an einem ruhigen Ort."
      defaultOpen={false}
      right={
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${workflow.stage === 'approved' && workflow.approvalFresh ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : summary.readyForShare ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {workflow.stage === 'approved' && workflow.approvalFresh ? 'freigegeben' : summary.readyForShare ? 'freigabebereit' : 'vor Weitergabe prüfen'}
        </span>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-cyan-900">
              <ShieldCheck className="h-4 w-4" />
              <p className="text-sm font-semibold">Governance-Überblick</p>
              <HelpPopover helpKey="pmv2.governance" ariaLabel="Hilfe: Governance-Überblick" />
            </div>
            <p className="text-sm leading-relaxed text-slate-800">{summary.headline}</p>
            <p className="text-xs leading-relaxed text-slate-600">{summary.summary}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ['Offene Entscheidungen', summary.openDecisionCount],
                ['Aktive Punkte', summary.activeDecisionCount],
                ['Checklisten-Punkte', summary.checks.length],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-white/80 bg-white/80 p-3">
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                ['Offen', statusCounts.open],
                ['In Prüfung', statusCounts.in_review],
                ['Freigegeben', statusCounts.approved],
                ['Zurückgestellt', statusCounts.deferred],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-white/80 bg-white/80 p-3">
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <ArrowRight className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Review- und Freigabepfad</p>
              <HelpPopover helpKey="pmv2.governance" ariaLabel="Hilfe: Review- und Freigabepfad" />
            </div>
            <div className="grid gap-2 md:grid-cols-5">
              {WORKFLOW_ORDER.map((entry, index) => {
                const status = index < workflowIndex ? 'done' : index === workflowIndex ? 'current' : 'waiting';
                return (
                  <div key={entry.key} className={`rounded-xl border p-3 ${workflowTone(status)}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{status === 'done' ? 'erledigt' : status === 'current' ? 'aktuell' : 'wartet'}</p>
                    <p className="mt-2 text-sm font-semibold leading-tight">{entry.label}</p>
                  </div>
                );
              })}
            </div>
            <div className={`rounded-xl border p-4 space-y-2 ${workflow.stage === 'approved' && workflow.approvalFresh ? 'border-emerald-200 bg-emerald-50' : workflow.stage === 'approval-ready' ? 'border-cyan-200 bg-cyan-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-700">Status: {workflow.stageLabel}</span>
                {governance.approval?.approvedAt && (
                  <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                    Freigabe: {new Date(governance.approval.approvedAt).toLocaleDateString('de-DE')}
                  </span>
                )}
                {governance.teamPlan?.reviewStartedAt && (
                  <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                    Review gestartet: {new Date(governance.teamPlan.reviewStartedAt).toLocaleDateString('de-DE')}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-slate-900">{workflow.headline}</p>
              <p className="text-sm leading-relaxed text-slate-700">{workflow.detail}</p>
              <p className="text-xs font-medium text-slate-600">Nächster sinnvoller Schritt: {workflow.nextAction}</p>

              {!workflow.approvalFresh && workflow.hasApproval && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Eine frühere Freigabe ist noch dokumentiert, passt aber nicht mehr vollständig zur aktuellen Analysebasis. Bestätigen Sie die Freigabe bitte bewusst neu.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {workflow.stage !== 'approved' && workflow.stage !== 'approval-ready' && (
                  <button
                    type="button"
                    onClick={handleStartReview}
                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700"
                  >
                    <Play className="h-4 w-4" />
                    Review starten
                  </button>
                )}
                {workflow.stage !== 'approved' && (
                  <button
                    type="button"
                    onClick={handleApprovalReady}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-medium text-cyan-800 hover:bg-cyan-50"
                  >
                    <Clock3 className="h-4 w-4" />
                    Für Freigabe markieren
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => saveSnapshot()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {snapshotSaved ? <Check className="h-4 w-4 text-emerald-600" /> : <History className="h-4 w-4" />}
                  Governance-Stand merken
                </button>
                {governance.approval?.status && (
                  <button
                    type="button"
                    onClick={handleClearApproval}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Freigabe zurückziehen
                  </button>
                )}
              </div>

              {(workflow.stage === 'approval-ready' || workflow.stage === 'approved' || workflow.hasApproval) && (
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_1.2fr_auto]">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600">Freigegeben von</label>
                    <input
                      type="text"
                      value={approvalBy}
                      onChange={event => setApprovalBy(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                      placeholder="z. B. Teamleitung Service"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600">Freigabe-Notiz</label>
                    <input
                      type="text"
                      value={approvalNote}
                      onChange={event => setApprovalNote(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                      placeholder="kurze Einordnung für Review oder Weitergabe"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleApprove}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Freigabe setzen
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <GovernanceInsightsPanel
            state={state}
            version={version}
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-800">
              <FileCheck2 className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Review-Checkliste</p>
            </div>
            <div className="space-y-2">
              {summary.checks.map(check => {
                const tone = check.status === 'good'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : check.status === 'attention'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900';
                const badge = check.status === 'good' ? 'gut' : check.status === 'attention' ? 'prüfen' : 'offen';
                return (
                  <div key={check.key} className={`rounded-xl border p-3 space-y-1 ${tone}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold">{check.label}</p>
                      <span className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[11px] font-medium">{badge}</span>
                    </div>
                    <p className="text-sm leading-relaxed">{check.detail}</p>
                    {check.nextAction && (
                      <p className="text-xs font-medium">Nächster Schritt: {check.nextAction}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-violet-900">
              <Users className="h-4 w-4" />
              <p className="text-sm font-semibold">Teamabstimmung</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Koordination</label>
                <input
                  type="text"
                  value={governance.teamPlan?.coordinator ?? ''}
                  onChange={event => onChange({ governance: updateGovernanceTeamPlan(governance, { coordinator: event.target.value }) })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  placeholder="z. B. Julia Neumann"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Nächster Review-Termin</label>
                <input
                  type="date"
                  value={governance.teamPlan?.nextReviewAt ?? ''}
                  onChange={event => onChange({ governance: updateGovernanceTeamPlan(governance, { nextReviewAt: event.target.value }) })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Review-Beteiligte</label>
              <input
                type="text"
                value={reviewersValue}
                onChange={event => onChange({ governance: updateGovernanceTeamPlan(governance, { reviewers: event.target.value.split(',').map(value => value.trim()).filter(Boolean) }) })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                placeholder="z. B. Qualität, Service, Vertrieb"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Zielgruppe für Weitergabe</label>
              <input
                type="text"
                value={governance.teamPlan?.shareTargets ?? ''}
                onChange={event => onChange({ governance: updateGovernanceTeamPlan(governance, { shareTargets: event.target.value }) })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                placeholder="z. B. Management, Teamleitung, Workshop"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Abstimmungsnotiz</label>
              <textarea
                rows={3}
                value={governance.teamPlan?.shareNote ?? ''}
                onChange={event => onChange({ governance: updateGovernanceTeamPlan(governance, { shareNote: event.target.value }) })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-y"
                placeholder="Worauf soll das Team im nächsten Review besonders achten?"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <History className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Vergleichbarer Governance-Stand</p>
              <HelpPopover helpKey="pmv2.governance" ariaLabel="Hilfe: Vergleichbarer Governance-Stand" />
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              Merken Sie wichtige Review- oder Freigabestände bewusst, damit spätere Änderungen zur Governance schnell vergleichbar bleiben.
            </p>
            {latestSnapshot ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{latestSnapshot.label}</p>
                  <p className="text-xs text-slate-600">
                    Gemerkt am {new Date(latestSnapshot.capturedAt).toLocaleString('de-DE')} · {latestSnapshot.workflowStage === 'approved' ? 'freigegeben' : latestSnapshot.workflowStage === 'approval-ready' ? 'freigabebereit' : 'Review-Stand'}
                  </p>
                  <p className="mt-2 text-sm text-slate-800">{snapshotDelta?.summary ?? 'Noch kein Vergleich verfügbar.'}</p>
                  {snapshotDelta?.metricChanges.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {snapshotDelta.metricChanges.slice(0, 4).map(item => (
                        <span key={item.key} className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {item.label}: {item.previousValue} → {item.currentValue} ({item.delta > 0 ? '+' : ''}{item.delta})
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.slice(-4).reverse().map(entry => (
                    <span key={entry.id} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                      {entry.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                Noch kein Governance-Stand gemerkt. Nutzen Sie „Governance-Stand merken“, sobald ein sinnvoller Review- oder Freigabestand erreicht ist.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <FileCheck2 className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Review-Vorlagen</p>
              <HelpPopover helpKey="pmv2.governance" ariaLabel="Hilfe: Review-Vorlagen" />
            </div>
            <div className="flex flex-wrap gap-2">
              {REVIEW_TEMPLATE_PRESETS.map(preset => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setSelectedTemplateKey(preset.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${selectedTemplateKey === preset.key ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {preset.shortLabel}
                </button>
              ))}
            </div>
            <p className="text-sm leading-relaxed text-slate-700">
              {REVIEW_TEMPLATE_PRESETS.find(item => item.key === selectedTemplateKey)?.description}
            </p>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">{templateText}</pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyTemplate}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-1.5 text-xs font-medium text-cyan-800 hover:bg-cyan-50"
              >
                Vorlage anwenden
              </button>
              <button
                type="button"
                onClick={copyTemplate}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {templateCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <ClipboardCopy className="h-4 w-4" />}
                Kopieren
              </button>
              <button
                type="button"
                onClick={() => downloadTextFile({ filename: `${sanitizeFilename(version.titleSnapshot || 'review')}_${selectedTemplateKey}.txt`, content: templateText, mimeType: 'text/plain;charset=utf-8' })}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Text laden
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Governance-Notiz und Exporte</p>
                <p className="text-xs text-slate-500">Zum Kopieren, Laden oder als Evidenz für spätere Review- und Freigabegespräche.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyGovernanceNote}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <ClipboardCopy className="h-4 w-4" />}
                  Kopieren
                </button>
                <button
                  type="button"
                  onClick={() => downloadTextFile({ filename: `${sanitizeFilename(version.titleSnapshot || 'governance')}_governance.txt`, content: governanceNote, mimeType: 'text/plain;charset=utf-8' })}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  Text laden
                </button>
                <button
                  type="button"
                  onClick={() => downloadTextFile({ filename: `${sanitizeFilename(version.titleSnapshot || 'governance')}_governance.json`, content: JSON.stringify({ governance, summary, workflow }, null, 2), mimeType: 'application/json;charset=utf-8' })}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  JSON laden
                </button>
                <button
                  type="button"
                  onClick={() => downloadTextFile({ filename: `${sanitizeFilename(version.titleSnapshot || 'governance')}_offene_punkte.txt`, content: openDecisionText, mimeType: 'text/plain;charset=utf-8' })}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  Offene Punkte laden
                </button>
                <button
                  type="button"
                  onClick={() => downloadTextFile({ filename: `${sanitizeFilename(version.titleSnapshot || 'governance')}_review_paket.txt`, content: reviewPackageText, mimeType: 'text/plain;charset=utf-8' })}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  Review-Paket laden
                </button>
                <button
                  type="button"
                  onClick={saveGovernanceEvidence}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {saved ? <Check className="h-4 w-4 text-emerald-600" /> : <FileCheck2 className="h-4 w-4" />}
                  Als Evidenz merken
                </button>
              </div>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">{governanceNote}</pre>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Entscheidungslog</p>
            <p className="text-xs text-slate-500">Dokumentiert offene, geprüfte und freigegebene Entscheidungen zur Analyse.</p>
          </div>
          <button
            type="button"
            onClick={() => addDecision()}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700"
          >
            <Plus className="h-4 w-4" />
            Entscheidung hinzufügen
          </button>
        </div>

        {summary.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {summary.suggestions.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => addDecision(suggestion)}
                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        )}

        {decisions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            Noch keine Governance-Entscheidungen erfasst. Nutzen Sie die Vorschläge, eine Review-Vorlage oder legen Sie eigene Punkte an, die vor Review, Pilot oder Weitergabe geklärt werden sollen.
          </div>
        ) : (
          <div className="space-y-3">
            {decisions.map(entry => (
              <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-[260px] space-y-2">
                    <input
                      type="text"
                      value={entry.title}
                      onChange={event => onChange({ governance: upsertGovernanceDecision(governance, { ...entry, title: event.target.value }) })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                    />
                    <textarea
                      rows={2}
                      value={entry.detail ?? ''}
                      onChange={event => onChange({ governance: upsertGovernanceDecision(governance, { ...entry, detail: event.target.value }) })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-y"
                      placeholder="Worum geht es genau und was muss entschieden oder bestätigt werden?"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getGovernanceStatusTone(entry.status)}`}>
                      {getGovernanceStatusLabel(entry.status)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange({ governance: removeGovernanceDecision(governance, entry.id) })}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      Entfernen
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDecisionStatus(entry.id, option.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${entry.status === option.value ? getGovernanceStatusTone(option.value) : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600">Owner</label>
                    <input
                      type="text"
                      value={entry.owner ?? ''}
                      onChange={event => onChange({ governance: upsertGovernanceDecision(governance, { ...entry, owner: event.target.value }) })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                      placeholder="wer übernimmt?"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600">Zieldatum</label>
                    <input
                      type="date"
                      value={entry.dueDate ?? ''}
                      onChange={event => onChange({ governance: upsertGovernanceDecision(governance, { ...entry, dueDate: event.target.value }) })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600">Beleg / Hinweis</label>
                    <input
                      type="text"
                      value={entry.evidenceHint ?? ''}
                      onChange={event => onChange({ governance: upsertGovernanceDecision(governance, { ...entry, evidenceHint: event.target.value }) })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                      placeholder="z. B. Bericht, Fall, Schritt"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
