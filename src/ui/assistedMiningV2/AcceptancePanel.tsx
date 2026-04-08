import { useMemo, useState } from 'react';
import {
  Check,
  ClipboardCheck,
  Download,
  FileJson,
  FileText,
  ShieldCheck,
  Stamp,
} from 'lucide-react';
import type { Process, ProcessMiningAcceptanceChecklist, ProcessMiningAcceptanceDecision, ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { downloadTextFile } from '../../utils/downloadTextFile';
import { HelpPopover } from '../components/HelpPopover';
import { CollapsibleCard } from '../components/CollapsibleCard';
import {
  buildAcceptanceDecisionText,
  compareAcceptanceSnapshotToCurrent,
  createAcceptanceSnapshot,
  evaluateAcceptanceReadiness,
  getAcceptanceDecisionLabel,
  pushAcceptanceSnapshot,
} from './acceptance';
import { noteCollaborationEvent, rememberCollaborationActor } from './collaboration';

interface Props {
  process: Process;
  version: ProcessVersion;
  settings: AppSettings;
  state: ProcessMiningAssistedV2State;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onSaveEvidence: (text: string, key: string) => void;
}

const DECISION_OPTIONS: Array<{ value: ProcessMiningAcceptanceDecision; label: string }> = [
  { value: 'continue-pilot', label: 'Pilot gezielt fortsetzen' },
  { value: 'limited-release', label: 'Begrenzt freigeben' },
  { value: 'needs-refinement', label: 'Vor Freigabe nachschärfen' },
  { value: 'stop', label: 'Vorläufig stoppen' },
];

const CHECKLIST_FIELDS: Array<{ key: keyof ProcessMiningAcceptanceChecklist; label: string }> = [
  { key: 'benchmarkReviewed', label: 'Lokalen Benchmark gesehen und verstanden' },
  { key: 'reportReviewed', label: 'Bericht und Übergaben geprüft' },
  { key: 'governanceReviewed', label: 'Governance- und Review-Stand geprüft' },
  { key: 'securityReviewed', label: 'Sicherheit, Datenschutz und Deployment geklärt' },
  { key: 'pilotPrepared', label: 'Pilotmaterial und Pilot-Paket vorbereitet' },
  { key: 'enablementPrepared', label: 'Enablement / Training oder Übergabe vorbereitet' },
];

function sanitizeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9äöüß_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'pm-acceptance';
}

export function AcceptancePanel({ process, version, settings, state, onChange, onSaveEvidence }: Props) {
  const summary = useMemo(() => evaluateAcceptanceReadiness({ state, version, settings }), [state, version, settings]);
  const acceptance: NonNullable<ProcessMiningAssistedV2State['acceptance']> = state.acceptance ?? { checklist: {}, history: [] };
  const latestSnapshot = acceptance.history?.length ? acceptance.history[acceptance.history.length - 1] : undefined;
  const delta = useMemo(() => compareAcceptanceSnapshotToCurrent(latestSnapshot, state), [latestSnapshot, state]);
  const decisionText = useMemo(() => buildAcceptanceDecisionText({ process, version, state, settings }), [process, version, state, settings]);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exported, setExported] = useState<'text' | 'json' | null>(null);
  const [snapshotted, setSnapshotted] = useState(false);

  function updateAcceptance(patch: Partial<NonNullable<ProcessMiningAssistedV2State['acceptance']>>) {
    onChange({
      acceptance: {
        checklist: acceptance.checklist ?? {},
        history: acceptance.history ?? [],
        ...acceptance,
        ...patch,
      },
    });
  }

  function handleChecklistToggle(key: keyof ProcessMiningAcceptanceChecklist) {
    updateAcceptance({
      checklist: {
        ...(acceptance.checklist ?? {}),
        [key]: !(acceptance.checklist?.[key] ?? false),
      },
    });
  }

  function withAudit(nextAcceptance: NonNullable<ProcessMiningAssistedV2State['acceptance']>, action: 'acceptance-updated' | 'acceptance-snapshot-saved', targetLabel: string, detail: string) {
    let collaboration = noteCollaborationEvent(state.collaboration, {
      action,
      actor: nextAcceptance.decidedBy,
      targetType: 'release',
      targetLabel,
      detail,
    });
    collaboration = rememberCollaborationActor(collaboration, nextAcceptance.decidedBy);
    onChange({ acceptance: nextAcceptance, collaboration });
  }

  function handleDecisionConfirm() {
    const nextAcceptance = {
      ...acceptance,
      checklist: acceptance.checklist ?? {},
      history: acceptance.history ?? [],
      decision: acceptance.decision ?? summary.recommendedDecision,
      decidedAt: new Date().toISOString(),
    };
    withAudit(
      nextAcceptance,
      'acceptance-updated',
      'Formale Abnahme',
      `Entscheidung festgehalten: ${getAcceptanceDecisionLabel(nextAcceptance.decision ?? summary.recommendedDecision)}`,
    );
  }

  function handleSnapshot() {
    const snapshot = createAcceptanceSnapshot({ state, summary });
    const nextAcceptance = {
      ...acceptance,
      checklist: acceptance.checklist ?? {},
      history: pushAcceptanceSnapshot(acceptance.history, snapshot),
      decision: acceptance.decision ?? summary.recommendedDecision,
      decidedAt: acceptance.decidedAt ?? new Date().toISOString(),
    };
    withAudit(nextAcceptance, 'acceptance-snapshot-saved', snapshot.label, snapshot.summary);
    setSnapshotted(true);
    setTimeout(() => setSnapshotted(false), 1800);
  }

  async function handleCopyText() {
    await navigator.clipboard.writeText(decisionText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function markExport(kind: 'text' | 'json') {
    updateAcceptance({ lastExportedAt: new Date().toISOString() });
    setExported(kind);
    setTimeout(() => setExported(current => (current === kind ? null : current)), 1800);
  }

  function downloadDecisionText() {
    downloadTextFile({
      filename: `${sanitizeFilename(version.titleSnapshot || process.title)}_abnahme.txt`,
      content: decisionText,
      mimeType: 'text/plain;charset=utf-8',
    });
    markExport('text');
  }

  function downloadDecisionJson() {
    downloadTextFile({
      filename: `${sanitizeFilename(version.titleSnapshot || process.title)}_abnahme.json`,
      content: JSON.stringify({ acceptance, summary, latestSnapshot }, null, 2),
      mimeType: 'application/json;charset=utf-8',
    });
    markExport('json');
  }

  function saveAsEvidence() {
    onSaveEvidence(decisionText, 'acceptance-brief');
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const badgeClass = summary.level === 'ready'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : summary.level === 'attention'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-rose-200 bg-rose-50 text-rose-800';

  return (
    <CollapsibleCard
      title="Pilotbetrieb 3.0 und formale Abnahme"
      helpKey="pmv2.acceptance"
      description="Verdichtet den Stand zu einer formalen Abnahmehilfe mit Entscheidung, Checkliste und exportierbarer Vorlage."
      defaultOpen={false}
      right={
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${badgeClass}`}>
          {summary.levelLabel}
        </span>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 space-y-3 ${summary.level === 'ready' ? 'border-emerald-200 bg-emerald-50' : summary.level === 'attention' ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50'}`}>
            <div className="flex items-center gap-2 text-slate-900">
              <Stamp className={`h-4 w-4 ${summary.level === 'ready' ? 'text-emerald-600' : summary.level === 'attention' ? 'text-amber-600' : 'text-rose-600'}`} />
              <p className="text-sm font-semibold">Formale Abnahme auf einen Blick</p>
              <HelpPopover helpKey="pmv2.acceptance" ariaLabel="Hilfe: Formale Abnahme" />
            </div>
            <p className="text-sm font-semibold text-slate-900">{summary.headline}</p>
            <p className="text-sm leading-relaxed text-slate-700">{summary.summary}</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">{summary.score}/100</span>
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">Empfehlung: {summary.recommendedDecisionLabel}</span>
              {acceptance.lastExportedAt && (
                <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                  Exportiert: {new Date(acceptance.lastExportedAt).toLocaleString('de-DE')}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <ClipboardCheck className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Abnahme-Checkliste</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {CHECKLIST_FIELDS.map(field => (
                <label key={field.key} className="flex items-start gap-3 rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(acceptance.checklist?.[field.key])}
                    onChange={() => handleChecklistToggle(field.key)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span>{field.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Entscheidung</label>
              <select
                value={acceptance.decision ?? summary.recommendedDecision}
                onChange={event => updateAcceptance({ decision: event.target.value as ProcessMiningAcceptanceDecision })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
              >
                {DECISION_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Verantwortlich</label>
              <input
                type="text"
                value={acceptance.decidedBy ?? ''}
                onChange={event => updateAcceptance({ decidedBy: event.target.value })}
                placeholder="z. B. Projektleitung / Prozessowner"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Geltungsbereich</label>
              <input
                type="text"
                value={acceptance.scope ?? ''}
                onChange={event => updateAcceptance({ scope: event.target.value })}
                placeholder="z. B. Pilot mit zwei Fachbereichen"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Zeitrahmen / nächste Entscheidung</label>
              <input
                type="text"
                value={acceptance.targetWindow ?? ''}
                onChange={event => updateAcceptance({ targetWindow: event.target.value })}
                placeholder="z. B. Review in zwei Wochen"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Erfolgskriterien</label>
              <textarea
                rows={4}
                value={acceptance.successCriteria ?? ''}
                onChange={event => updateAcceptance({ successCriteria: event.target.value })}
                placeholder="Woran wird der Pilot oder die Freigabe konkret gemessen?"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-y"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Bekannte Risiken / Restpunkte</label>
              <textarea
                rows={4}
                value={acceptance.knownRisks ?? ''}
                onChange={event => updateAcceptance({ knownRisks: event.target.value })}
                placeholder="Welche Restpunkte bleiben bewusst offen?"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-y"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Enablement / Training</label>
              <textarea
                rows={3}
                value={acceptance.trainingNote ?? ''}
                onChange={event => updateAcceptance({ trainingNote: event.target.value })}
                placeholder="Welche Einweisung, Schulung oder Übergabe ist nötig?"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-y"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Formale Notiz</label>
              <textarea
                rows={3}
                value={acceptance.note ?? ''}
                onChange={event => updateAcceptance({ note: event.target.value })}
                placeholder="Kurze Abnahme- oder Entscheidungskommentare"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-y"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldCheck className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Abnahme-Bausteine</p>
            </div>
            <div className="space-y-2">
              {summary.checks.map(check => {
                const tone = check.status === 'ready'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : check.status === 'attention'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800';
                return (
                  <div key={check.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{check.label}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>{check.metric}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-700">{check.summary}</p>
                    <p className="text-[11px] leading-relaxed text-slate-500">{check.detail}</p>
                    {check.action && <p className="text-[11px] font-medium text-cyan-700">Nächster Schritt: {check.action}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <FileText className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Formale Entscheidungsvorlage</p>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              Diese Vorlage bündelt Analyse, Freigabe, Sicherheit, Pilotstand und Ihre formale Empfehlung in einem ruhigen Text für Review, Pilotleitung oder Management.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={handleDecisionConfirm} className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-800 hover:bg-cyan-100 transition-colors">
                <Stamp className="h-4 w-4" />Formale Entscheidung festhalten
              </button>
              <button type="button" onClick={handleSnapshot} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                <ClipboardCheck className="h-4 w-4" />Abnahmestand merken
              </button>
              <button type="button" onClick={handleCopyText} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <FileText className="h-4 w-4" />}Text kopieren
              </button>
              <button type="button" onClick={downloadDecisionText} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                {exported === 'text' ? <Check className="h-4 w-4 text-emerald-600" /> : <Download className="h-4 w-4" />}Text herunterladen
              </button>
              <button type="button" onClick={downloadDecisionJson} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                {exported === 'json' ? <Check className="h-4 w-4 text-emerald-600" /> : <FileJson className="h-4 w-4" />}JSON herunterladen
              </button>
              <button type="button" onClick={saveAsEvidence} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                {saved ? <Check className="h-4 w-4 text-emerald-600" /> : <ShieldCheck className="h-4 w-4" />}Als Evidenz merken
              </button>
            </div>
            {(copied || saved || snapshotted) && (
              <p className="text-xs font-medium text-emerald-700">
                {copied ? 'Entscheidungsvorlage kopiert.' : saved ? 'Entscheidungsvorlage als Evidenz gespeichert.' : 'Abnahmestand gemerkt.'}
              </p>
            )}
          </div>

          {(latestSnapshot || delta) && (
            <div className={`rounded-xl border p-4 space-y-2 ${delta?.isAligned ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center gap-2 text-slate-900">
                <Stamp className={`h-4 w-4 ${delta?.isAligned ? 'text-emerald-600' : 'text-amber-600'}`} />
                <p className="text-sm font-semibold">Letzter gemerkter Abnahmestand</p>
              </div>
              {latestSnapshot ? (
                <>
                  <p className="text-sm leading-relaxed text-slate-800">
                    {latestSnapshot.label} · {latestSnapshot.decisionLabel} · {latestSnapshot.score}/100
                  </p>
                  <p className="text-xs leading-relaxed text-slate-600">{delta?.summary ?? latestSnapshot.summary}</p>
                </>
              ) : (
                <p className="text-sm leading-relaxed text-slate-800">Noch kein gemerkter Abnahmestand vorhanden.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </CollapsibleCard>
  );
}
