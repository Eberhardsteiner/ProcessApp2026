import { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardCopy, Download, Link2, ReceiptText, ShieldCheck } from 'lucide-react';
import type { Process, ProcessMiningAssistedV2State, ProcessMiningConnectorReceiptStatus, ProcessVersion } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { downloadTextFile } from '../../utils/downloadTextFile';
import { CollapsibleCard } from '../components/CollapsibleCard';
import { noteCollaborationEvent, rememberCollaborationActor } from './collaboration';
import {
  buildConnectorContractProfiles,
  describeReceiptStatus,
  parseConnectorReceipt,
  pushConnectorContractSnapshot,
  pushConnectorReceipt,
} from './integrationContracts';

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
  if (status === 'partial') return 'teilweise bereit';
  return 'noch nicht bereit';
}

function receiptTone(status: ProcessMiningConnectorReceiptStatus) {
  if (status === 'completed' || status === 'accepted') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (status === 'rejected') return 'border-rose-200 bg-rose-50 text-rose-900';
  return 'border-amber-200 bg-amber-50 text-amber-900';
}

export function IntegrationWorkbenchPanel({ process, version, state, settings, onChange }: Props) {
  const summary = useMemo(() => buildConnectorContractProfiles({ process, version, state, settings }), [process, version, state, settings]);
  const preferred = state.connectorToolkit?.preferredBundleKey ?? summary.profiles[0]?.key;
  const [selectedKey, setSelectedKey] = useState(preferred);
  const [copied, setCopied] = useState<string>('');
  const [receiptText, setReceiptText] = useState('');
  const [receiptNotice, setReceiptNotice] = useState<string>('');
  const [receiptError, setReceiptError] = useState<string>('');
  const latestReceipt = state.connectorToolkit?.receipts?.length ? state.connectorToolkit.receipts[state.connectorToolkit.receipts.length - 1] : undefined;
  const latestContract = state.connectorToolkit?.contractHistory?.length ? state.connectorToolkit.contractHistory[state.connectorToolkit.contractHistory.length - 1] : undefined;

  useEffect(() => {
    if (!summary.profiles.find(item => item.key === selectedKey)) {
      setSelectedKey(preferred);
    }
  }, [preferred, selectedKey, summary.profiles]);

  const selected = summary.profiles.find(item => item.key === selectedKey) ?? summary.profiles[0];
  if (!selected) return null;

  const requiredFields = selected.fields.filter(item => item.required);
  const optionalFields = selected.fields.filter(item => !item.required);
  const receiptAligned = latestReceipt && latestReceipt.key === selected.key && (!latestReceipt.basisFingerprint || latestReceipt.basisFingerprint === selected.basisFingerprint);

  function updateToolkitField(patch: Partial<NonNullable<ProcessMiningAssistedV2State['connectorToolkit']>>) {
    onChange({
      connectorToolkit: {
        ...(state.connectorToolkit ?? {}),
        ...patch,
      },
    });
  }

  async function copyPackage() {
    await navigator.clipboard.writeText(JSON.stringify(selected.exchangePackage, null, 2));
    setCopied('json');
    setTimeout(() => setCopied(current => (current === 'json' ? '' : current)), 1800);
  }

  function downloadPackage() {
    downloadTextFile({
      filename: `${selected.fileBase}-exchange.json`,
      content: JSON.stringify(selected.exchangePackage, null, 2),
      mimeType: 'application/json;charset=utf-8',
    });
  }

  function rememberContract() {
    const builtAt = new Date().toISOString();
    let collaboration = noteCollaborationEvent(state.collaboration, {
      action: 'connector-contract-generated',
      actor: state.collaboration?.lastActor,
      targetType: 'connector',
      targetLabel: selected.label,
      detail: `Vertrag mit ${selected.contractScore}/100 gemerkt. Fehlende Pflichtfelder: ${selected.missingRequiredFields.length}.`,
    });
    collaboration = rememberCollaborationActor(collaboration, state.collaboration?.lastActor);
    onChange({
      connectorToolkit: {
        ...(state.connectorToolkit ?? {}),
        preferredBundleKey: selected.key,
        contractHistory: pushConnectorContractSnapshot(state.connectorToolkit?.contractHistory, {
          id: crypto.randomUUID(),
          key: selected.key,
          label: selected.label,
          builtAt,
          basisFingerprint: selected.basisFingerprint,
          completenessScore: selected.contractScore,
          missingRequiredFields: selected.missingRequiredFields,
          fileBase: selected.fileBase,
        }),
      },
      collaboration,
    });
    setReceiptNotice('Vertrag im Arbeitsstand gemerkt.');
    setReceiptError('');
    setTimeout(() => setReceiptNotice(current => (current === 'Vertrag im Arbeitsstand gemerkt.' ? '' : current)), 2200);
  }

  function importReceiptFromText() {
    const parsed = parseConnectorReceipt({ text: receiptText, profiles: summary.profiles, source: 'paste' });
    if (!parsed.receipt) {
      setReceiptError(parsed.error ?? 'Die Rückmeldung konnte nicht gelesen werden.');
      setReceiptNotice('');
      return;
    }
    let collaboration = noteCollaborationEvent(state.collaboration, {
      action: 'connector-receipt-imported',
      actor: state.collaboration?.lastActor,
      targetType: 'connector',
      targetLabel: parsed.receipt.label,
      detail: `${describeReceiptStatus(parsed.receipt.status)}${parsed.receipt.externalRef ? ` · Ref ${parsed.receipt.externalRef}` : ''}`,
    });
    collaboration = rememberCollaborationActor(collaboration, state.collaboration?.lastActor);
    onChange({
      connectorToolkit: {
        ...(state.connectorToolkit ?? {}),
        preferredBundleKey: parsed.receipt.key,
        receipts: pushConnectorReceipt(state.connectorToolkit?.receipts, parsed.receipt),
        lastReceiptAt: parsed.receipt.importedAt,
      },
      collaboration,
    });
    setReceiptText('');
    setReceiptError('');
    setReceiptNotice(`Rückmeldung für ${parsed.receipt.label} wurde übernommen.`);
  }

  return (
    <CollapsibleCard
      title="Integrationswerkbank"
      helpKey="pmv2.integrationAdapters"
      description="Strukturierte Verträge, Paketvorschau und Rückmeldungen für kontrollierte Connector-Wege – ohne stille Live-Kopplung."
      defaultOpen={false}
      right={<span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone(selected.status)}`}>{label(selected.status)}</span>}
    >
      <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-cyan-900">
              <Link2 className="w-4 h-4" />
              <p className="text-sm font-semibold">Kontrollierte Adapter- und Übergabepfade</p>
            </div>
            <p className="text-sm leading-relaxed text-slate-800">{summary.headline}</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Empfehlung: {summary.recommendation}
              </span>
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Bereit {summary.readyCount} · Teilweise {summary.partialCount} · Blockiert {summary.blockedCount}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldCheck className="w-4 h-4 text-cyan-600" />
              <p className="text-sm font-semibold">Integrationsweg auswählen</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {summary.profiles.map(profile => (
                <button
                  key={profile.key}
                  type="button"
                  onClick={() => {
                    setSelectedKey(profile.key);
                    updateToolkitField({ preferredBundleKey: profile.key });
                  }}
                  className={`rounded-xl border p-3 text-left transition-colors ${selected.key === profile.key ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{profile.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{profile.audience}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone(profile.status)}`}>{label(profile.status)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{profile.summary}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">Vertrag: {profile.contractScore}/100 · Pflichtfelder {profile.filledRequiredCount}/{profile.requiredCount}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <ReceiptText className="w-4 h-4 text-cyan-600" />
              <p className="text-sm font-semibold">Externe Rückmeldung übernehmen</p>
            </div>
            <p className="text-sm leading-relaxed text-slate-700">
              Fügen Sie hier eine einfache JSON-Rückmeldung aus einem Zielsystem oder Proxy ein. Unterstützt werden Status, externe Referenz,
              Endpoint-Hinweis und Notiz.
            </p>
            <textarea
              value={receiptText}
              onChange={event => setReceiptText(event.target.value)}
              rows={7}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
              placeholder={`{
  "connectorKey": "${selected.key}",
  "status": "accepted",
  "externalRef": "CASE-2048",
  "endpoint": "ticket-proxy/v1",
  "note": "Übergabe angenommen"
}`}
            />
            {receiptError && <p className="text-sm text-rose-700">{receiptError}</p>}
            {receiptNotice && <p className="text-sm text-emerald-700">{receiptNotice}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={importReceiptFromText}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors"
              >
                <ReceiptText className="w-4 h-4" />
                Rückmeldung übernehmen
              </button>
            </div>
            {latestReceipt && (
              <div className={`rounded-lg border p-3 text-sm leading-relaxed ${receiptTone(latestReceipt.status)}`}>
                Letzte Rückmeldung: {latestReceipt.label} · {describeReceiptStatus(latestReceipt.status)} · {new Date(latestReceipt.importedAt).toLocaleString('de-DE')}
                {latestReceipt.externalRef ? ` · Ref ${latestReceipt.externalRef}` : ''}
                {latestReceipt.endpoint ? ` · ${latestReceipt.endpoint}` : ''}
                {receiptAligned === false ? ' · Prüfen: Rückmeldung gehört zu einer älteren Analysebasis.' : ''}
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
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                Vertrag {selected.contractScore}/100
              </span>
            </div>
            <div className="grid gap-2">
              {requiredFields.map(item => (
                <div key={item.key} className={`rounded-lg border px-3 py-2 ${item.filled ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{item.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.summary}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Quelle: {item.sourceHint}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${item.filled ? 'border-emerald-200 bg-white/80 text-emerald-800' : 'border-rose-200 bg-white/80 text-rose-800'}`}>
                      {item.filled ? 'gefüllt' : 'fehlt'}
                    </span>
                  </div>
                  {item.valuePreview && <p className="mt-2 text-xs leading-relaxed text-slate-700">Wert: {item.valuePreview}</p>}
                </div>
              ))}
            </div>
            {optionalFields.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-sm font-semibold text-slate-900">Optionale Verstärker</p>
                <div className="grid gap-2">
                  {optionalFields.map(item => (
                    <div key={item.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{item.label}</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.summary}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${item.filled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                          {item.filled ? 'vorhanden' : 'optional'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selected.missingRequiredFields.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
                Noch offen für diesen Vertrag: {selected.missingRequiredFields.join(', ')}.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Exchange Package</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
              {JSON.stringify(selected.exchangePackage, null, 2)}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyPackage}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {copied === 'json' ? <Check className="w-4 h-4 text-emerald-600" /> : <ClipboardCopy className="w-4 h-4" />}
                Paket kopieren
              </button>
              <button
                type="button"
                onClick={downloadPackage}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Paket als JSON laden
              </button>
              <button
                type="button"
                onClick={rememberContract}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                Vertrag merken
              </button>
            </div>
            {latestContract && latestContract.key === selected.key && (
              <p className="text-xs leading-relaxed text-slate-500">
                Letztmals gemerkt am {new Date(latestContract.builtAt).toLocaleString('de-DE')} · Vollständigkeit {latestContract.completenessScore}/100.
              </p>
            )}
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}
