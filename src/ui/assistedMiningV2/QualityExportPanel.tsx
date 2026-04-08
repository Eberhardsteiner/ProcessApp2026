import { useMemo, useState } from 'react';
import { Download, Copy, FileJson } from 'lucide-react';
import type { Process, ProcessVersion, ProcessMiningAssistedV2State } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import type { WorkspaceIntegrityReport } from './workspaceIntegrity';
import { HelpPopover } from '../components/HelpPopover';
import { buildQualityExportFile, downloadQualityExportFile, serializeQualityExportFile } from './qualityExport';

interface Props {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  settings: AppSettings;
  integrity: WorkspaceIntegrityReport;
}

export function QualityExportPanel({ process, version, state, settings, integrity }: Props) {
  const [copied, setCopied] = useState(false);
  const exportFile = useMemo(
    () => buildQualityExportFile({ process, version, state, settings, integrity }),
    [process, version, state, settings, integrity],
  );
  const serialized = useMemo(() => serializeQualityExportFile(exportFile), [exportFile]);
  const hasMaterial = state.cases.length > 0 || state.observations.length > 0;
  const stepCount = state.observations.filter(item => item.kind === 'step').length;
  const issueCount = state.observations.filter(item => item.kind === 'issue').length;

  async function handleCopy() {
    await navigator.clipboard.writeText(serialized);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
              <FileJson className="h-3.5 w-3.5" />
              Qualitätscheck-Export
            </span>
            <HelpPopover helpKey="pmv2.qualityExport" ariaLabel="Hilfe: Qualitätscheck-Export" />
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${hasMaterial ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              {hasMaterial ? 'Export bereit' : 'Noch keine Basis'}
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Analysezustand als JSON exportieren</p>
            <p className="text-sm leading-relaxed text-slate-600">
              Exportieren Sie den aktuellen Analysezustand des gerade geprüften Materials. Der Export enthält acht feste Qualitätsdimensionen,
              sodass ein einzelner Testfall extern präzise bewertet werden kann.
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Im Export: {state.cases.length} {state.cases.length === 1 ? 'Quelle' : 'Quellen'} · {stepCount} erkannte Schritte · {issueCount} Reibungssignale · 8 Qualitätsdimensionen
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button
            type="button"
            onClick={() => downloadQualityExportFile({ file: exportFile, processTitle: process.title })}
            disabled={!hasMaterial}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Qualitätscheck JSON exportieren
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!hasMaterial}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'JSON kopiert' : 'JSON kopieren'}
          </button>
        </div>
      </div>
      {!hasMaterial && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Erst nachdem ein Dokument oder Fall ausgewertet wurde, kann ein sinnvoller Qualitätscheck exportiert werden.
        </div>
      )}
    </div>
  );
}
