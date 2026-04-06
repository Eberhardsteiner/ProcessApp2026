import { useMemo, useState } from 'react';
import { Check, ClipboardCopy, Download, Link2, PackageCheck, PlugZap, Save } from 'lucide-react';
import type { Process, ProcessMiningAssistedV2State, ProcessVersion, ProcessMiningConnectorBundleKey } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { downloadTextFile } from '../../utils/downloadTextFile';
import { CollapsibleCard } from '../components/CollapsibleCard';
import {
  buildConnectorBundlePreviews,
  compareConnectorExportToCurrent,
  pushConnectorExportSnapshot,
} from './connectorBundles';

interface Props {
  process: Process;
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  settings: AppSettings;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
}

function tone(status: 'ready' | 'partial' | 'blocked') {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'partial') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rose-200 bg-rose-50 text-rose-800';
}

function label(status: 'ready' | 'partial' | 'blocked') {
  if (status === 'ready') return 'bereit';
  if (status === 'partial') return 'teilweise';
  return 'noch nicht';
}

export function ConnectorBundlesPanel({ process, version, state, settings, onChange }: Props) {
  const summary = useMemo(() => buildConnectorBundlePreviews({ process, version, state, settings }), [process, version, state, settings]);
  const preferred = state.connectorToolkit?.preferredBundleKey;
  const initialKey = (preferred && summary.bundles.some(item => item.key === preferred) ? preferred : summary.bundles[0]?.key) ?? 'ticket-handover';
  const [selectedKey, setSelectedKey] = useState<ProcessMiningConnectorBundleKey>(initialKey);
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [downloaded, setDownloaded] = useState<string | null>(null);

  const selected = summary.bundles.find(item => item.key === selectedKey) ?? summary.bundles[0];
  const latestExport = state.connectorToolkit?.history?.length ? state.connectorToolkit.history[state.connectorToolkit.history.length - 1] : undefined;
  const exportComparison = compareConnectorExportToCurrent(latestExport, summary.bundles);

  async function copyJson() {
    if (!selected) return;
    await navigator.clipboard.writeText(JSON.stringify(selected.jsonPayload, null, 2));
    setCopied('json');
    setTimeout(() => setCopied(current => (current === 'json' ? null : current)), 1800);
  }

  async function copyText() {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.textPayload);
    setCopied('text');
    setTimeout(() => setCopied(current => (current === 'text' ? null : current)), 1800);
  }

  function downloadJson() {
    if (!selected) return;
    downloadTextFile({
      filename: `${selected.fileBase}.json`,
      content: JSON.stringify(selected.jsonPayload, null, 2),
      mimeType: 'application/json;charset=utf-8',
    });
    markExport('json');
  }

  function downloadText() {
    if (!selected) return;
    downloadTextFile({
      filename: `${selected.fileBase}.md`,
      content: selected.textPayload,
      mimeType: 'text/markdown;charset=utf-8',
    });
    markExport('text');
  }

  function markExport(mode: 'json' | 'text' | 'save' = 'save') {
    if (!selected) return;
    const exportedAt = new Date().toISOString();
    onChange({
      connectorToolkit: {
        ...(state.connectorToolkit ?? {}),
        preferredBundleKey: selected.key,
        lastExportedAt: exportedAt,
        history: pushConnectorExportSnapshot(state.connectorToolkit?.history, {
          id: crypto.randomUUID(),
          key: selected.key,
          label: selected.label,
          exportedAt,
          basisFingerprint: selected.basisFingerprint,
          status: selected.status,
          summary: selected.summary,
          fileBase: selected.fileBase,
        }),
      },
    });
    if (mode === 'save') {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } else {
      setDownloaded(mode);
      setTimeout(() => setDownloaded(current => (current === mode ? null : current)), 1800);
    }
  }

  function updateToolkitField(patch: Partial<NonNullable<ProcessMiningAssistedV2State['connectorToolkit']>>) {
    onChange({
      connectorToolkit: {
        ...(state.connectorToolkit ?? {}),
        ...patch,
      },
    });
  }

  if (!selected) return null;

  return (
    <CollapsibleCard
      title="Connector-Pakete und Betriebshilfen"
      helpKey="pmv2.connectorBundles"
      description="Vorbereitete Pakete für Ticket-/Case-Handover, BI, KI-/API-Proxy und Governance – bewusst optional und ohne stille Live-Kopplung."
      defaultOpen={false}
      right={<span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone(selected.status)}`}>{label(selected.status)}</span>}
    >
      <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-cyan-900">
              <PlugZap className="w-4 h-4" />
              <p className="text-sm font-semibold">Optionaler Connector-Rahmen</p>
            </div>
            <p className="text-sm leading-relaxed text-slate-800">{summary.headline}</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Empfehlung: {summary.recommendation}
              </span>
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                {summary.readinessText}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <PackageCheck className="w-4 h-4 text-cyan-600" />
              <p className="text-sm font-semibold">Paket auswählen</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {summary.bundles.map(bundle => (
                <button
                  key={bundle.key}
                  type="button"
                  onClick={() => {
                    setSelectedKey(bundle.key);
                    updateToolkitField({ preferredBundleKey: bundle.key });
                  }}
                  className={`rounded-xl border p-3 text-left transition-colors ${selected.key === bundle.key ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{bundle.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{bundle.audience}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone(bundle.status)}`}>{label(bundle.status)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{bundle.summary}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <Link2 className="w-4 h-4 text-cyan-600" />
              <p className="text-sm font-semibold">Betriebshilfe</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Ansprechpartner / Operator</label>
                <input
                  type="text"
                  value={state.connectorToolkit?.operator ?? ''}
                  onChange={event => updateToolkitField({ operator: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  placeholder="z. B. Integration Team"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Endpoint-/Connector-Notiz</label>
                <input
                  type="text"
                  value={state.connectorToolkit?.endpointNote ?? ''}
                  onChange={event => updateToolkitField({ endpointNote: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  placeholder="z. B. API-Proxy im Review"
                />
              </div>
            </div>
            {exportComparison && (
              <div className={`rounded-lg border p-3 text-sm leading-relaxed ${exportComparison.isAligned ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                {exportComparison.summary}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{selected.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{selected.rationale}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone(selected.status)}`}>{label(selected.status)}</span>
            </div>
            <div className="grid gap-2">
              {selected.includes.map(item => (
                <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900">JSON-Vorschau</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
              {JSON.stringify(selected.jsonPayload, null, 2)}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyJson}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {copied === 'json' ? <Check className="w-4 h-4 text-emerald-600" /> : <ClipboardCopy className="w-4 h-4" />}
                JSON kopieren
              </button>
              <button
                type="button"
                onClick={downloadJson}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {downloaded === 'json' ? <Check className="w-4 h-4 text-emerald-600" /> : <Download className="w-4 h-4" />}
                Als JSON laden
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Textbriefing</p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
              {selected.textPayload}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyText}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {copied === 'text' ? <Check className="w-4 h-4 text-emerald-600" /> : <ClipboardCopy className="w-4 h-4" />}
                Text kopieren
              </button>
              <button
                type="button"
                onClick={downloadText}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {downloaded === 'text' ? <Check className="w-4 h-4 text-emerald-600" /> : <Download className="w-4 h-4" />}
                Als Markdown laden
              </button>
              <button
                type="button"
                onClick={() => markExport('save')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {saved ? <Check className="w-4 h-4 text-emerald-600" /> : <Save className="w-4 h-4" />}
                Export merken
              </button>
            </div>
            {state.connectorToolkit?.lastExportedAt && (
              <p className="text-xs leading-relaxed text-slate-500">
                Letzter Connector-Export: {new Date(state.connectorToolkit.lastExportedAt).toLocaleString('de-DE')}
              </p>
            )}
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}
