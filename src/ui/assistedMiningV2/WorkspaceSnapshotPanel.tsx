import { useRef, useState, type ChangeEvent } from 'react';
import { Check, Download, FolderUp, ShieldCheck } from 'lucide-react';
import type { Process, ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import type { PilotReadinessSummary } from './pilotReadiness';
import {
  buildWorkspaceSnapshot,
  downloadWorkspaceSnapshot,
  importWorkspaceSnapshot,
} from './workspaceSnapshot';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  readiness: PilotReadinessSummary;
  onRestoreState: (nextState: ProcessMiningAssistedV2State) => void;
}

export function WorkspaceSnapshotPanel({ process, version, state, readiness, onRestoreState }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string>('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<{ title: string; exportedAt: string; sourceVersion?: string; versionLabel?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function exportSnapshot() {
    const snapshot = buildWorkspaceSnapshot({ process, version, state, readiness });
    downloadWorkspaceSnapshot(snapshot);
    setMessage('Der aktuelle PM-Arbeitsstand wurde als JSON gesichert.');
    setWarnings([]);
    setMetadata({
      title: snapshot.process.title,
      exportedAt: snapshot.exportedAt,
      sourceVersion: snapshot.appVersion,
      versionLabel: snapshot.process.versionLabel,
    });
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const parsed = await importWorkspaceSnapshot(file);
      onRestoreState(parsed.state);
      setWarnings(parsed.warnings);
      setMetadata(parsed.metadata);
      setMessage(`Arbeitsstand „${parsed.metadata.title}“ wurde wiederhergestellt.`);
    } catch (error) {
      setWarnings([]);
      setMetadata(null);
      setMessage(error instanceof Error ? error.message : 'Der Arbeitsstand konnte nicht geladen werden.');
    } finally {
      setBusy(false);
      if (event.target) event.target.value = '';
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-slate-800">
            <ShieldCheck className="w-4 h-4 text-cyan-600" />
            <h3 className="text-sm font-semibold">Arbeitsstand sichern und wiederherstellen</h3>
            <HelpPopover helpKey="pmv2.snapshot" ariaLabel="Hilfe: Arbeitsstand sichern und wiederherstellen" />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Sichern Sie den aktuellen PM-Arbeitsstand als JSON, um ihn vor einem Pilottermin, vor größeren Änderungen oder für eine Übergabe griffbereit zu haben.
            Ein gespeicherter Arbeitsstand kann später wieder vollständig in die App geladen werden.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportSnapshot}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Arbeitsstand sichern
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <FolderUp className="w-4 h-4" />
            Arbeitsstand laden
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {(message || metadata || warnings.length > 0) && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          {message && (
            <div className="flex items-start gap-2 text-slate-800">
              <Check className="w-4 h-4 text-green-600 mt-0.5" />
              <p className="text-sm leading-relaxed">{busy ? 'Arbeitsstand wird geladen…' : message}</p>
            </div>
          )}

          {metadata && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Titel</p>
                <p className="text-sm font-medium text-slate-800">{metadata.title}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Exportiert am</p>
                <p className="text-sm font-medium text-slate-800">{new Date(metadata.exportedAt).toLocaleString('de-DE')}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">App-Stand</p>
                <p className="text-sm font-medium text-slate-800">{metadata.sourceVersion ?? 'unbekannt'}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Version</p>
                <p className="text-sm font-medium text-slate-800">{metadata.versionLabel || 'ohne Bezeichnung'}</p>
              </div>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">Hinweise zum geladenen Arbeitsstand</p>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-amber-900/90">
                {warnings.map(warning => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
