import { useMemo, useState } from 'react';
import {
  Check,
  ClipboardCopy,
  Download,
  FileCheck2,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import type { ProcessVersion, ProcessMiningAssistedV2State } from '../../domain/process';
import { CollapsibleCard } from '../components/CollapsibleCard';
import {
  buildGovernanceNote,
  computeGovernanceSummary,
  createEmptyGovernanceState,
  getGovernanceStatusLabel,
  getGovernanceStatusTone,
  removeGovernanceDecision,
  updateGovernanceTeamPlan,
  upsertGovernanceDecision,
} from './governance';
import { downloadTextFile } from '../../utils/downloadTextFile';

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

function sanitizeFilename(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]+/g, '')
    .replace(/\s+/g, '_')
    .trim() || 'governance';
}

export function GovernancePanel({ state, version, onChange, onSaveEvidence }: Props) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const summary = useMemo(() => computeGovernanceSummary({ state, version }), [state, version]);
  const governance = state.governance ?? createEmptyGovernanceState();
  const governanceNote = useMemo(() => buildGovernanceNote({ state, version }), [state, version]);
  const decisions = governance.decisions ?? [];
  const reviewersValue = (governance.teamPlan?.reviewers ?? []).join(', ');

  async function copyGovernanceNote() {
    await navigator.clipboard.writeText(governanceNote);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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

  return (
    <CollapsibleCard
      title="Governance, Nachvollziehbarkeit und Teamarbeit"
      helpKey="pmv2.governance"
      description="Sammelt Entscheidungslog, Review-Checkliste und Teamabstimmung an einem ruhigen Ort."
      defaultOpen={false}
      right={
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${summary.readyForShare ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {summary.readyForShare ? 'weitergabefähig' : 'vor Weitergabe prüfen'}
        </span>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-cyan-900">
              <ShieldCheck className="h-4 w-4" />
              <p className="text-sm font-semibold">Governance-Überblick</p>
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
          </div>

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
                placeholder="Was muss vor der Weitergabe noch bestätigt oder abgestimmt werden?"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-800">Governance-Notiz und Export</p>
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
                  onClick={() => downloadTextFile({ filename: `${sanitizeFilename(version.titleSnapshot || 'governance')}_governance.json`, content: JSON.stringify({ governance, summary }, null, 2), mimeType: 'application/json;charset=utf-8' })}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  JSON laden
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
            Noch keine Governance-Entscheidungen erfasst. Nutzen Sie die Vorschläge oder legen Sie eigene Punkte an, die vor Review, Pilot oder Weitergabe geklärt werden sollen.
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

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-600">Status</label>
                    <select
                      value={entry.status}
                      onChange={event => onChange({ governance: upsertGovernanceDecision(governance, { ...entry, status: event.target.value as typeof STATUS_OPTIONS[number]['value'] }) })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                    >
                      {STATUS_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
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
