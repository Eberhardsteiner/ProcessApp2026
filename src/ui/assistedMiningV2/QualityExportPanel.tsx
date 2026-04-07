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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
              <FileJson className="h-3.5 w-3.5" />
              Qualitätscheck-Export
            </span>
            <HelpPopover helpKey="pmv2.qualityExport" ariaLabel="Hilfe: Qualitätscheck-Export" />
          </div>
          <p className="text-sm font-semibold text-slate-900">Analysezustand als JSON exportieren</p>
          <p className="text-sm leading-relaxed text-slate-600">
            Dieser Export enthält nur den aktuellen Analysezustand des Materials, das Sie gerade in der App geprüft haben.
            Er enthält keine fest eingebauten Referenzfälle und keinen automatischen Testlauf.
          </p>
          <p className="text-xs text-slate-500">
            Aktuell im Export: {state.cases.length} {state.cases.length === 1 ? 'Quelle' : 'Quellen'} · {stepCount} erkannte Schritte · {issueCount} Reibungssignale
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button
            type="button"
            onClick={() => downloadQualityExportFile(exportFile)}
            disabled={!hasMaterial}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Erst nachdem ein Dokument oder Fall ausgewertet wurde, kann ein sinnvoller Qualitätscheck exportiert werden.
        </div>
      )}
    </div>
  );
}
