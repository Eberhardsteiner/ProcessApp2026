import { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardCopy, Download, GaugeCircle, ShieldCheck } from 'lucide-react';
import type { Process, ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { WorkbenchSection } from './WorkbenchSection';
import {
  buildQualityCheckExport,
  downloadQualityCheckExport,
  serializeQualityCheckExport,
} from './qualityCheckExport';

interface Props {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  settings: AppSettings;
}

function statusTone(status: ReturnType<typeof buildQualityCheckExport>['scores']['status']): string {
  if (status === 'stabil') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'beobachten') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rose-200 bg-rose-50 text-rose-800';
}

function buildDefaultLabel(process: Process, state: ProcessMiningAssistedV2State): string {
  const sourceNames = state.cases.map(item => item.name).filter(Boolean);
  if (sourceNames.length === 0) return `${process.title} · Qualitätscheck`;
  const preview = sourceNames.slice(0, 2).join(' + ');
  const suffix = sourceNames.length > 2 ? ` (+${sourceNames.length - 2})` : '';
  return `${preview}${suffix} · Qualitätscheck`;
}

export function QualityCheckExportPanel({ process, version, state, settings }: Props) {
  const defaultLabel = useMemo(() => buildDefaultLabel(process, state), [process, state]);
  const [exportLabel, setExportLabel] = useState(defaultLabel);
  const [exportNote, setExportNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [downloadedAt, setDownloadedAt] = useState<string | null>(null);

  useEffect(() => {
    setExportLabel(current => current.trim() ? current : defaultLabel);
  }, [defaultLabel]);

  const exportPayload = useMemo(
    () => buildQualityCheckExport({ process, version, state, settings, exportLabel, exportNote }),
    [process, version, state, settings, exportLabel, exportNote],
  );

  const stepCount = exportPayload.analysis.qualitySummary?.stepObservationCount
    ?? state.observations.filter(item => item.kind === 'step').length;
  const evidenceCoverage = stepCount > 0
    ? Math.round(((exportPayload.analysis.qualitySummary?.stepObservationsWithEvidence ?? 0) / Math.max(stepCount, 1)) * 100)
    : 0;

  function handleDownload() {
    downloadQualityCheckExport(exportPayload);
    setDownloadedAt(exportPayload.exportedAt);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(serializeQualityCheckExport(exportPayload));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <WorkbenchSection
      title="Qualitätscheck als JSON exportieren"
      helpKey="pmv2.qualityExport"
      description="Nutzen Sie diesen Export, nachdem Sie ein Referenzdokument oder einen Testlauf durch die App haben laufen lassen. Die JSON-Datei enthält den aktuellen Arbeitsstand, Qualitätsmetriken und die volle Analysekette, damit ich die Analysequalität später im Detail bewerten kann."
      badge={(
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusTone(exportPayload.scores.status)}`}>
          {exportPayload.scores.status} · {exportPayload.scores.overall}/100
        </span>
      )}
      actions={(
        <>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            Qualitätscheck JSON exportieren
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <ClipboardCopy className="h-4 w-4" />}
            JSON kopieren
          </button>
        </>
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Laufbezeichnung</label>
                <input
                  type="text"
                  value={exportLabel}
                  onChange={event => setExportLabel(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="z. B. Referenzdokument 01 · Sollprozess"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Letzter Export</label>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  {downloadedAt ? new Date(downloadedAt).toLocaleString('de-DE') : 'Noch nicht exportiert'}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-600">Optionale Notiz</label>
              <textarea
                rows={3}
                value={exportNote}
                onChange={event => setExportNote(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y"
                placeholder="Zum Beispiel: Welches Referenzdokument wurde getestet? Welche Erwartung hatten Sie?"
              />
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Der Export enthält bewusst den vollständigen PM-Arbeitsstand plus die wichtigsten Qualitäts- und Reifeindikatoren. Sie können die JSON-Datei danach hier hochladen, damit ich die Analysequalität, Stärken, Schwächen und nächste Schritte bewerte.
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-blue-900">
              <ShieldCheck className="h-4 w-4" />
              <p className="text-sm font-semibold">Was im Export steckt</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                'Quellen und erfasste Fälle',
                'Schrittableitung, Discovery, Soll-Abgleich und Hotspots',
                'Datenreife, Release-, Governance- und Sicherheitsstatus',
                'Vollständiger PM-Arbeitsstand für die Detailprüfung',
              ].map(item => (
                <div key={item} className="rounded-lg border border-white/90 bg-white/80 px-3 py-2 text-xs text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-800">
              <GaugeCircle className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-semibold">Schneller Überblick zum Export</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Gesamteindruck', `${exportPayload.scores.overall}/100`],
                ['Quellen', String(state.cases.length)],
                ['Erkannte Schritte', String(stepCount)],
                ['Belegabdeckung', `${evidenceCoverage} %`],
                ['Datenreife', exportPayload.analysis.dataMaturity.levelLabel],
                ['Release-Reife', exportPayload.analysis.releaseReadiness.levelLabel],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white bg-white px-3 py-2">
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-900">Wofür dieser Export gedacht ist</p>
            <ul className="space-y-1 text-xs leading-relaxed text-slate-700 list-disc pl-4">
              <li>Sie lassen ein Referenzdokument oder einen Testfall vollständig durch die App laufen.</li>
              <li>Danach exportieren Sie hier den Qualitätscheck als JSON.</li>
              <li>Diese JSON-Datei kann ich anschließend im Detail auswerten und die Analysequalität der App beurteilen.</li>
            </ul>
          </div>
        </div>
      </div>
    </WorkbenchSection>
  );
}
