import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Download,
  Link2,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { downloadTextFile } from '../../utils/downloadTextFile';
import { evaluateIntegrationReadiness, type IntegrationStatus } from './integrationReadiness';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
  settings: AppSettings;
}

function badgeTone(status: IntegrationStatus): string {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'partial') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rose-200 bg-rose-50 text-rose-800';
}

function badgeLabel(status: IntegrationStatus): string {
  if (status === 'ready') return 'bereit';
  if (status === 'partial') return 'teilweise bereit';
  return 'noch nicht bereit';
}

export function IntegrationReadinessPanel({ state, version, settings }: Props) {
  const summary = evaluateIntegrationReadiness({ state, version, settings });
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [showPayloads, setShowPayloads] = useState(false);

  async function copyPayload(value: unknown, key: string) {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(current => (current === key ? '' : current)), 1800);
  }

  function downloadPayload(filename: string, value: unknown) {
    downloadTextFile({
      filename,
      content: JSON.stringify(value, null, 2),
      mimeType: 'application/json;charset=utf-8',
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-slate-800">
            <Link2 className="w-4 h-4 text-cyan-600" />
            <h3 className="text-sm font-semibold">Betriebsgrenzen und optionale Integrationen</h3>
            <HelpPopover helpKey="pmv2.integration" ariaLabel="Hilfe: Betriebsgrenzen und optionale Integrationen" />
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{summary.headline}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <ShieldCheck className="w-4 h-4 text-cyan-600" />
          Live-Kopplungen bleiben optional. Die App zeigt bewusst vorbereitete Wege statt stiller Hintergrundsynchronisation.
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {summary.items.map(item => (
          <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                <p className="mt-1 text-sm text-slate-700 leading-relaxed">{item.summary}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badgeTone(item.status)}`}>
                {badgeLabel(item.status)}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-900">
            <ShieldCheck className="w-4 h-4" />
            <p className="text-sm font-semibold">Belastbar möglich</p>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-800">
            {summary.boundaries.stable.length > 0
              ? summary.boundaries.stable.map(item => <li key={item}>{item}</li>)
              : <li>Derzeit liegt noch keine stabile Basis vor.</li>}
          </ul>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-900">
            <Zap className="w-4 h-4" />
            <p className="text-sm font-semibold">Mit Vorsicht lesen</p>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-800">
            {summary.boundaries.caution.length > 0
              ? summary.boundaries.caution.map(item => <li key={item}>{item}</li>)
              : <li>Der aktuelle Stand hat hier keine besonderen Warnsignale.</li>}
          </ul>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-rose-900">
            <Link2 className="w-4 h-4" />
            <p className="text-sm font-semibold">Bewusst noch nicht aktiv</p>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-800">
            {summary.boundaries.blocked.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <button
          type="button"
          onClick={() => setShowPayloads(open => !open)}
          className="flex items-center gap-2 text-sm font-semibold text-slate-800"
        >
          {showPayloads ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          Vorbereitete Integrationsprofile
        </button>
        <p className="text-sm text-slate-600 leading-relaxed">
          Diese Profile sind bewusst leichtgewichtig: Sie bündeln den aktuellen Stand für Copy/Paste, API-Proxy oder externe Weiterverarbeitung,
          ohne eine Live-Kopplung vorauszusetzen.
        </p>

        {showPayloads && (
          <div className="grid gap-3 xl:grid-cols-2">
            {[
              {
                key: 'profile',
                title: 'Connector-Kurzprofil',
                filename: 'pm-integration-profile.json',
                payload: summary.payloads.profile,
              },
              {
                key: 'handover',
                title: 'Connector-Handover',
                filename: 'pm-integration-handover.json',
                payload: summary.payloads.handover,
              },
            ].map(item => (
              <div key={item.key} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    Für externe Orchestrierung, Review-Protokolle oder vorbereitete API-Nutzung.
                  </p>
                </div>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                  {JSON.stringify(item.payload, null, 2)}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyPayload(item.payload, item.key)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {copiedKey === item.key ? <Check className="w-4 h-4 text-emerald-600" /> : <ClipboardCopy className="w-4 h-4" />}
                    Kopieren
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPayload(item.filename, item.payload)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Als JSON laden
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
