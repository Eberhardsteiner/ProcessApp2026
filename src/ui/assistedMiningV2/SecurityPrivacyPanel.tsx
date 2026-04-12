import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ClipboardCopy, Download, LockKeyhole, ShieldCheck } from 'lucide-react';
import type {
  ProcessMiningAssistedV2State,
  ProcessMiningDataClassification,
  ProcessMiningDeploymentTarget,
  ProcessVersion,
} from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { downloadTextFile } from '../../utils/downloadTextFile';
import { CollapsibleCard } from '../components/CollapsibleCard';
import { noteCollaborationEvent, rememberCollaborationActor } from './collaboration';
import { evaluateSecurityReadiness, type SecurityReadinessStatus } from './securityReadiness';

interface Props {
  version: ProcessVersion;
  state: ProcessMiningAssistedV2State;
  settings: AppSettings;
  onChange: (patch: Partial<ProcessMiningAssistedV2State>) => void;
}

function tone(status: SecurityReadinessStatus) {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (status === 'attention') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-rose-200 bg-rose-50 text-rose-900';
}

function label(status: SecurityReadinessStatus) {
  if (status === 'ready') return 'stabil';
  if (status === 'attention') return 'prüfen';
  return 'offen';
}

function levelTone(level: ReturnType<typeof evaluateSecurityReadiness>['level']) {
  if (level === 'controlled') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (level === 'review') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rose-200 bg-rose-50 text-rose-800';
}

export function SecurityPrivacyPanel({ version, state, settings, onChange }: Props) {
  const summary = useMemo(() => evaluateSecurityReadiness({ state, version, settings }), [state, version, settings]);
  const [copied, setCopied] = useState<'json' | 'briefing' | null>(null);
  const [saved, setSaved] = useState(false);

  function updateSecurityField(patch: Partial<NonNullable<ProcessMiningAssistedV2State['security']>>) {
    onChange({
      security: {
        ...(state.security ?? {}),
        ...patch,
      },
    });
  }

  function markReviewed() {
    const reviewedBy = state.security?.reviewedBy?.trim() || state.collaboration?.lastActor || undefined;
    let collaboration = noteCollaborationEvent(state.collaboration, {
      action: 'security-profile-reviewed',
      actor: reviewedBy,
      targetType: 'release',
      targetLabel: 'Sicherheits- und Deployment-Profil',
      detail: `${summary.levelLabel} · ${summary.score}/100 · Klassifikation ${state.security?.dataClassification ?? 'offen'} · Deployment ${state.security?.deploymentTarget ?? 'offen'}`,
    });
    collaboration = rememberCollaborationActor(collaboration, reviewedBy);
    onChange({
      security: {
        ...(state.security ?? {}),
        reviewedBy,
        reviewedAt: new Date().toISOString(),
      },
      collaboration,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function copyProfile() {
    await navigator.clipboard.writeText(JSON.stringify(summary.payloads.profile, null, 2));
    setCopied('json');
    setTimeout(() => setCopied(current => (current === 'json' ? null : current)), 1800);
  }

  async function copyBriefing() {
    await navigator.clipboard.writeText(summary.payloads.briefing);
    setCopied('briefing');
    setTimeout(() => setCopied(current => (current === 'briefing' ? null : current)), 1800);
  }

  function markExport(detail: string) {
    const actor = state.security?.reviewedBy?.trim() || state.collaboration?.lastActor;
    let collaboration = noteCollaborationEvent(state.collaboration, {
      action: 'security-profile-exported',
      actor,
      targetType: 'release',
      targetLabel: 'Sicherheits- und Deployment-Profil',
      detail,
    });
    collaboration = rememberCollaborationActor(collaboration, actor);
    onChange({
      security: {
        ...(state.security ?? {}),
        lastProfileExportedAt: new Date().toISOString(),
      },
      collaboration,
    });
  }

  function downloadProfile() {
    downloadTextFile({
      filename: `pm-security-profile-${version.versionLabel || version.id}.json`.replace(/\s+/g, '-'),
      content: JSON.stringify(summary.payloads.profile, null, 2),
      mimeType: 'application/json;charset=utf-8',
    });
    markExport(`JSON-Profil exportiert · ${summary.score}/100`);
  }

  function downloadBriefing() {
    downloadTextFile({
      filename: `pm-security-briefing-${version.versionLabel || version.id}.md`.replace(/\s+/g, '-'),
      content: summary.payloads.briefing,
      mimeType: 'text/markdown;charset=utf-8',
    });
    markExport(`Text-Briefing exportiert · ${summary.levelLabel}`);
  }

  return (
    <CollapsibleCard
      title="Sicherheit, Datenschutz und Deployment"
      helpKey="pmv2.security"
      description="Legt den Betriebsrahmen für lokale Nutzung, externe Wege, Aufbewahrung und Deployment sichtbar fest – ohne versteckte Kopplung."
      defaultOpen={false}
      right={<span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${levelTone(summary.level)}`}>{summary.levelLabel}</span>}
    >
      <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-cyan-900">
              <ShieldCheck className="w-4 h-4" />
              <p className="text-sm font-semibold">Sicherheits- und Betriebsrahmen</p>
            </div>
            <p className="text-sm leading-relaxed text-slate-800">{summary.headline}</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Score {summary.score}/100
              </span>
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Klassifikation: {state.security?.dataClassification ?? 'offen'}
              </span>
              <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                Deployment: {state.security?.deploymentTarget ?? 'offen'}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{summary.summary}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {summary.items.map(item => (
              <div key={item.key} className={`rounded-xl border p-4 space-y-2 ${tone(item.status)}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone(item.status)}`}>{label(item.status)}</span>
                </div>
                <p className="text-sm leading-relaxed">{item.summary}</p>
                <p className="text-xs leading-relaxed opacity-90">{item.detail}</p>
                {item.action && (
                  <p className="text-xs font-medium opacity-90">Nächster Schritt: {item.action}</p>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <LockKeyhole className="w-4 h-4 text-cyan-600" />
              <p className="text-sm font-semibold">Festlegungen im Arbeitsstand</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Geprüft von</label>
                <input
                  type="text"
                  value={state.security?.reviewedBy ?? ''}
                  onChange={event => updateSecurityField({ reviewedBy: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  placeholder="z. B. PMO oder Datenschutz"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Incident- / Betriebsansprechpartner</label>
                <input
                  type="text"
                  value={state.security?.incidentContact ?? ''}
                  onChange={event => updateSecurityField({ incidentContact: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                  placeholder="z. B. Integration Team"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Datenklassifikation</label>
                <select
                  value={state.security?.dataClassification ?? ''}
                  onChange={event => updateSecurityField({ dataClassification: (event.target.value || undefined) as ProcessMiningDataClassification | undefined })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                >
                  <option value="">Bitte wählen…</option>
                  <option value="internal">intern</option>
                  <option value="confidential">vertraulich</option>
                  <option value="restricted">streng vertraulich</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Deployment-Ziel</label>
                <select
                  value={state.security?.deploymentTarget ?? ''}
                  onChange={event => updateSecurityField({ deploymentTarget: (event.target.value || undefined) as ProcessMiningDeploymentTarget | undefined })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                >
                  <option value="">Bitte wählen…</option>
                  <option value="local-browser">lokaler Browserbetrieb</option>
                  <option value="internal-static">interne statische Bereitstellung</option>
                  <option value="internal-proxy">interner Proxy-/Gateway-Betrieb</option>
                  <option value="managed-pilot">betreuter Pilotbetrieb</option>
                </select>
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(state.security?.allowExternalProcessing)}
                onChange={event => updateSecurityField({ allowExternalProcessing: event.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              />
              <span>
                Externe Verarbeitung ist für diesen Arbeitsstand bewusst freigegeben, sofern API, Übersetzung oder andere externe Wege aktiv sind.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Datenschutznote</label>
                <textarea
                  rows={3}
                  value={state.security?.privacyNote ?? ''}
                  onChange={event => updateSecurityField({ privacyNote: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-y"
                  placeholder="z. B. Personen- und Kundendaten werden nur intern verarbeitet; Exporte vor Weitergabe prüfen."
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Aufbewahrung und Löschung</label>
                <textarea
                  rows={3}
                  value={state.security?.retentionNote ?? ''}
                  onChange={event => updateSecurityField({ retentionNote: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-y"
                  placeholder="z. B. Pilotmaterial nach Review löschen, Snapshots nur für Freigabephase halten."
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Backup- und Snapshot-Umgang</label>
                <textarea
                  rows={3}
                  value={state.security?.backupNote ?? ''}
                  onChange={event => updateSecurityField({ backupNote: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-y"
                  placeholder="z. B. Snapshots verschlüsselt ablegen, Pilot-Pakete nur intern teilen."
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Deployment-Notiz</label>
                <textarea
                  rows={3}
                  value={state.security?.deploymentNote ?? ''}
                  onChange={event => updateSecurityField({ deploymentNote: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-200 resize-y"
                  placeholder="z. B. Pilot nur im internen Netzwerk, kein öffentlicher Internetzugang."
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={markReviewed}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-900 hover:bg-cyan-100 transition-colors"
              >
                {saved ? <Check className="w-4 h-4 text-emerald-600" /> : <ShieldCheck className="w-4 h-4" />}
                Sicherheitsprofil merken
              </button>
              {state.security?.reviewedAt && (
                <span className="text-xs text-slate-500">{summary.latestReviewLabel}</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <AlertTriangle className="w-4 h-4 text-cyan-600" />
              <p className="text-sm font-semibold">Externe Wege und Marker</p>
            </div>
            <div className="space-y-2 text-sm text-slate-700">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aktiv</p>
                {summary.externalPaths.active.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {summary.externalPaths.active.map(item => (
                      <span key={item} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">{item}</span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-600">Keine aktiven externen Wege.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Optional</p>
                {summary.externalPaths.optional.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {summary.externalPaths.optional.map(item => (
                      <span key={item} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">{item}</span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-600">Keine optionalen Außenwege dokumentiert.</p>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600">
                Sensible Marker: {summary.signals.sensitiveMarkerCount} · E-Mail {summary.signals.emailCount} · Telefon {summary.signals.phoneCount} · Kennzeichen {summary.signals.identifierCount}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Profil exportieren</p>
            <p className="text-sm leading-relaxed text-slate-700">
              Das Profil fasst Datenumgang, Deployment-Ziel und offene Sicherheitsfragen für Review, Datenschutz oder IT-Betrieb zusammen.
            </p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
              {JSON.stringify(summary.payloads.profile, null, 2)}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyProfile}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {copied === 'json' ? <Check className="w-4 h-4 text-emerald-600" /> : <ClipboardCopy className="w-4 h-4" />}
                JSON kopieren
              </button>
              <button
                type="button"
                onClick={downloadProfile}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Als JSON laden
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Kurzbrief für Datenschutz, IT oder Pilotleitung</p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
              {summary.payloads.briefing}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyBriefing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {copied === 'briefing' ? <Check className="w-4 h-4 text-emerald-600" /> : <ClipboardCopy className="w-4 h-4" />}
                Briefing kopieren
              </button>
              <button
                type="button"
                onClick={downloadBriefing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Als Text laden
              </button>
            </div>
            {state.security?.lastProfileExportedAt && (
              <p className="text-xs leading-relaxed text-slate-500">
                Zuletzt exportiert am {new Date(state.security.lastProfileExportedAt).toLocaleString('de-DE')}.
              </p>
            )}
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}
