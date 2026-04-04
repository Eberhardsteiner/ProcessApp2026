import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  ClipboardCopy,
  Download,
  FileArchive,
  PackageCheck,
  Save,
  Users,
} from 'lucide-react';
import type { Process, ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import { downloadTextFile } from '../../utils/downloadTextFile';
import { CollapsibleCard } from '../components/CollapsibleCard';
import { countGovernanceDecisionStatuses } from './governance';
import {
  buildPilotToolkitPackage,
  downloadPilotToolkitJson,
  downloadPilotToolkitZip,
} from './pilotToolkit';

interface Props {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
  onSaveEvidence: (text: string, key: string) => void;
}

function preview(text: string, lineCount = 7): string {
  return text.split('\n').slice(0, lineCount).join('\n');
}

export function PilotToolkitPanel({ process, version, state, onChange, onSaveEvidence }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const toolkit = state.pilotToolkit ?? {};
  const previewPackage = useMemo(
    () => buildPilotToolkitPackage({ process, version, state }),
    [process, version, state],
  );
  const governanceCounts = countGovernanceDecisionStatuses(state.governance);

  function updateToolkit(patch: Partial<NonNullable<ProcessMiningAssistedV2State['pilotToolkit']>>) {
    onChange({ pilotToolkit: { ...(state.pilotToolkit ?? {}), ...patch } });
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(current => (current === key ? null : current)), 1800);
  }

  function buildFreshPackage() {
    return buildPilotToolkitPackage({ process, version, state });
  }

  async function exportZip() {
    setExportingZip(true);
    try {
      const pkg = buildFreshPackage();
      await downloadPilotToolkitZip(pkg);
      updateToolkit({ lastExportedAt: pkg.exportedAt });
    } finally {
      setExportingZip(false);
    }
  }

  function exportJson() {
    const pkg = buildFreshPackage();
    downloadPilotToolkitJson(pkg);
    updateToolkit({ lastExportedAt: pkg.exportedAt });
  }

  function downloadSingleText(filenameSuffix: string, content: string) {
    const pkg = buildFreshPackage();
    downloadTextFile({
      filename: `${pkg.fileBase}-${filenameSuffix}.md`,
      content,
      mimeType: 'text/markdown;charset=utf-8',
    });
    updateToolkit({ lastExportedAt: pkg.exportedAt });
  }

  function saveToolkitEvidence() {
    onSaveEvidence(previewPackage.pilotBriefingText, 'pilot-toolkit-briefing');
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const cards = [
    {
      key: 'briefing',
      title: 'Pilot-Briefing',
      description: 'Kurzbrief für Management, Moderation oder Sponsor des Pilots.',
      text: previewPackage.pilotBriefingText,
      filename: 'pilot-briefing',
    },
    {
      key: 'workshop',
      title: 'Workshop-Fahrplan',
      description: 'Agenda, Leitfragen und Storyline für den nächsten Termin.',
      text: previewPackage.workshopAgendaText,
      filename: 'workshop-fahrplan',
    },
    {
      key: 'governance',
      title: 'Governance-Review',
      description: 'Review-Checkliste, offene Entscheidungen und Teamabstimmung.',
      text: previewPackage.governanceReviewText,
      filename: 'governance-review',
    },
  ];

  return (
    <CollapsibleCard
      title="Pilot-Toolkit und Exportpakete"
      helpKey="pmv2.pilotToolkit"
      description="Bereitet einen ruhigen Export für Workshop, Governance-Review oder Pilottermin vor."
      defaultOpen={false}
      right={
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${previewPackage.readiness.level === 'pilot-ready' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : previewPackage.readiness.level === 'workshop-ready' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          {previewPackage.readiness.levelLabel}
        </span>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-cyan-900">
              <PackageCheck className="h-4 w-4" />
              <p className="text-sm font-semibold">Was das Paket enthält</p>
            </div>
            <p className="text-sm leading-relaxed text-slate-800">
              Das Pilot-Paket bündelt Bericht, Übergaben, Governance-Stand, Pilot-Checkliste und
              den vollständigen PM-Arbeitsstand in einer Form, die sich ruhig weitergeben oder im
              nächsten Termin direkt nutzen lässt.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ['Dateien im Paket', previewPackage.includedFiles.length],
                ['Offene Entscheidungen', governanceCounts.open + governanceCounts.in_review],
                ['Letzter Export', toolkit.lastExportedAt ? new Date(toolkit.lastExportedAt).toLocaleDateString('de-DE') : '—'],
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
              <CalendarDays className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Rahmen für Pilot oder Workshop</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Titel des Termins</label>
                <input
                  type="text"
                  value={toolkit.sessionTitle ?? ''}
                  onChange={event => updateToolkit({ sessionTitle: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  placeholder="z. B. Reklamationsprozess · Pilot-Review"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Geplanter Termin</label>
                <input
                  type="datetime-local"
                  value={toolkit.plannedAt ?? ''}
                  onChange={event => updateToolkit({ plannedAt: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Moderation / Ansprechpartner</label>
                <input
                  type="text"
                  value={toolkit.facilitator ?? ''}
                  onChange={event => updateToolkit({ facilitator: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  placeholder="z. B. Julia Neumann"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Zielgruppe</label>
                <input
                  type="text"
                  value={toolkit.audience ?? ''}
                  onChange={event => updateToolkit({ audience: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  placeholder="z. B. Management, Fachteam, Review-Kreis"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Ziel des Termins</label>
              <textarea
                rows={2}
                value={toolkit.sessionGoal ?? ''}
                onChange={event => updateToolkit({ sessionGoal: event.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-y"
                placeholder="Was soll in Pilot, Workshop oder Review konkret erreicht werden?"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Moderations- oder Übergabenotiz</label>
              <textarea
                rows={3}
                value={toolkit.note ?? ''}
                onChange={event => updateToolkit({ note: event.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-y"
                placeholder="Zum Beispiel: Welche Punkte sollen nicht ausufern? Welche Entscheidung soll am Ende getroffen werden?"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-800">
              <FileArchive className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold">Exportieren und weitergeben</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportZip}
                disabled={exportingZip}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                <FileArchive className="w-4 h-4" />
                {exportingZip ? 'Paket wird erstellt…' : 'Komplettes Pilot-Paket laden'}
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Paket als JSON
              </button>
              <button
                type="button"
                onClick={saveToolkitEvidence}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {saved ? <Check className="w-4 h-4 text-emerald-600" /> : <Save className="w-4 h-4" />}
                Pilot-Briefing als Evidenz merken
              </button>
            </div>
            <div className="rounded-lg border border-white bg-white p-3 text-xs leading-relaxed text-slate-600">
              <p>
                Das ZIP enthält Bericht, Übergaben, Governance-Review, offene Punkte, Pilot-Checkliste
                und den kompletten PM-Arbeitsstand als wiederherstellbare JSON-Datei.
              </p>
            </div>
            <ul className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
              {previewPackage.includedFiles.map(file => (
                <li key={file} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">{file}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-violet-900">
              <Users className="h-4 w-4" />
              <p className="text-sm font-semibold">Empfohlene Besetzung</p>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed">
              {state.governance?.teamPlan?.reviewers?.length
                ? `Review-Kreis: ${state.governance?.teamPlan?.reviewers?.join(', ')}.`
                : 'Noch kein Review-Kreis festgelegt. Für einen ruhigen Termin sind Fachseite, Prozessverantwortung und Koordination sinnvoll.'}
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Offene Entscheidungen: {governanceCounts.open} · In Prüfung: {governanceCounts.in_review} · Freigegeben: {governanceCounts.approved} · Zurückgestellt: {governanceCounts.deferred}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {cards.map(card => (
          <div key={card.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{card.title}</p>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">{card.description}</p>
            </div>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
              {preview(card.text)}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyText(card.text, card.key)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {copiedKey === card.key ? <Check className="w-4 h-4 text-emerald-600" /> : <ClipboardCopy className="w-4 h-4" />}
                Kopieren
              </button>
              <button
                type="button"
                onClick={() => downloadSingleText(card.filename, card.text)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Als Text laden
              </button>
            </div>
          </div>
        ))}
      </div>
    </CollapsibleCard>
  );
}
