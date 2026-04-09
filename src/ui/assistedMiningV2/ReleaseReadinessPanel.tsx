import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Link2,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import type { ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import type { AppSettings } from '../../settings/appSettings';
import { HelpPopover } from '../components/HelpPopover';
import { evaluateReleaseStability, type ReleaseGateKey, type ReleaseGateStatus } from './releaseStability';

interface Props {
  state: ProcessMiningAssistedV2State;
  version: ProcessVersion;
  settings: AppSettings;
  onJump?: (key: ReleaseGateKey) => void;
}

function statusTone(status: ReleaseGateStatus) {
  if (status === 'ready') {
    return {
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      panel: 'border-emerald-200 bg-emerald-50',
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
      label: 'stabil',
    };
  }
  if (status === 'attention') {
    return {
      badge: 'border-amber-200 bg-amber-50 text-amber-800',
      panel: 'border-amber-200 bg-amber-50',
      icon: <Wrench className="h-4 w-4 text-amber-600" />,
      label: 'nachziehen',
    };
  }
  return {
    badge: 'border-rose-200 bg-rose-50 text-rose-800',
    panel: 'border-rose-200 bg-rose-50',
    icon: <Sparkles className="h-4 w-4 text-rose-600" />,
    label: 'noch offen',
  };
}

function levelTone(level: ReturnType<typeof evaluateReleaseStability>['level']) {
  if (level === 'release-ready') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (level === 'review-ready') return 'border-cyan-200 bg-cyan-50 text-cyan-800';
  if (level === 'stabilizing') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rose-200 bg-rose-50 text-rose-800';
}

function gateIcon(key: ReleaseGateKey) {
  if (key === 'report') return <FileText className="h-4 w-4 text-cyan-600" />;
  if (key === 'governance') return <Users className="h-4 w-4 text-violet-600" />;
  if (key === 'collaboration') return <Users className="h-4 w-4 text-cyan-600" />;
  if (key === 'security') return <ShieldCheck className="h-4 w-4 text-emerald-600" />;
  if (key === 'pilot') return <PackageCheck className="h-4 w-4 text-amber-600" />;
  if (key === 'acceptance') return <ShieldCheck className="h-4 w-4 text-emerald-600" />;
  if (key === 'connectors') return <Link2 className="h-4 w-4 text-slate-600" />;
  if (key === 'quality') return <ShieldCheck className="h-4 w-4 text-emerald-600" />;
  return <Sparkles className="h-4 w-4 text-blue-600" />;
}

const JUMP_LABELS: Record<ReleaseGateKey, string> = {
  basis: 'Zu den Quellen',
  analysis: 'Zu den Analyseschritten',
  report: 'Zum Bericht',
  governance: 'Zur Governance',
  collaboration: 'Zur Zusammenarbeit',
  security: 'Zu Sicherheit & Deployment',
  pilot: 'Zum Pilot-Paket',
  acceptance: 'Zur formalen Abnahme',
  connectors: 'Zu den Connectoren',
  quality: 'Zu Qualität und Checks',
};

export function ReleaseReadinessPanel({ state, version, settings, onJump }: Props) {
  const summary = evaluateReleaseStability({ state, version, settings });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2 text-slate-800">
            <ShieldCheck className="h-4 w-4 text-cyan-600" />
            <p className="text-sm font-semibold">Freigabe und Stabilisierung</p>
            <HelpPopover helpKey="pmv2.releaseFlow" ariaLabel="Hilfe: Freigabe und Stabilisierung" />
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${levelTone(summary.level)}`}>
              {summary.levelLabel}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
              {summary.score}/100
            </span>
          </div>
          <p className="text-base font-semibold text-slate-900">{summary.headline}</p>
          <p className="text-sm leading-relaxed text-slate-600">{summary.summary}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 xl:max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Roter Faden in Schritt 5</p>
          <p className="mt-2 leading-relaxed">
            Erst den <strong>Bericht</strong> auf den aktuellen Stand ziehen, dann <strong>Review und Freigabe</strong>
            klären, danach <strong>Pilot-Paket</strong> und nur bei Bedarf die optionalen <strong>Connector-Pakete</strong>
            exportieren.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summary.gates.map(gate => {
          const tone = statusTone(gate.status);
          return (
            <div key={gate.key} className={`rounded-xl border p-4 space-y-3 ${tone.panel}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-slate-900">
                    {gateIcon(gate.key)}
                    <p className="text-sm font-semibold">{gate.label}</p>
                    {gate.optional && (
                      <span className="inline-flex items-center rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        optional
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-800 leading-relaxed">{gate.summary}</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
                  {tone.icon}
                  {tone.label}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">{gate.detail}</p>
              <div className="flex flex-wrap items-center gap-2">
                {gate.action && (
                  <span className="inline-flex items-center rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                    {gate.action}
                  </span>
                )}
                {onJump && (
                  <button
                    type="button"
                    onClick={() => onJump(gate.key)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white transition-colors"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    {JUMP_LABELS[gate.key]}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(summary.strengths.length > 0 || summary.nextActions.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-emerald-900">Was schon trägt</p>
            {summary.strengths.length > 0 ? (
              <ul className="space-y-1 text-sm leading-relaxed text-slate-700 list-disc pl-5">
                {summary.strengths.map(item => <li key={item}>{item}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">Noch keine klaren Stärken abgesichert.</p>
            )}
          </div>
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-cyan-900">Was jetzt als Nächstes sinnvoll ist</p>
            {summary.nextActions.length > 0 ? (
              <ul className="space-y-1 text-sm leading-relaxed text-slate-700 list-disc pl-5">
                {summary.nextActions.map(item => <li key={item}>{item}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">Der aktuelle Stand wirkt bereits geschlossen.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
