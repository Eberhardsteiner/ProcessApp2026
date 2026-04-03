import { AlertTriangle, CheckCircle2, Rocket, ShieldCheck } from 'lucide-react';
import type { ProcessMiningAssistedV2State, ProcessVersion } from '../../domain/process';
import { evaluatePilotReadiness } from './pilotReadiness';
import { HelpPopover } from '../components/HelpPopover';

interface Props {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
}

function toneForLevel(level: ReturnType<typeof evaluatePilotReadiness>['level']) {
  if (level === 'pilot-ready') {
    return {
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      panel: 'border-emerald-200 bg-emerald-50',
      icon: 'text-emerald-600',
    };
  }
  if (level === 'workshop-ready') {
    return {
      badge: 'border-cyan-200 bg-cyan-50 text-cyan-800',
      panel: 'border-cyan-200 bg-cyan-50',
      icon: 'text-cyan-600',
    };
  }
  if (level === 'internal-review') {
    return {
      badge: 'border-amber-200 bg-amber-50 text-amber-800',
      panel: 'border-amber-200 bg-amber-50',
      icon: 'text-amber-600',
    };
  }
  return {
    badge: 'border-rose-200 bg-rose-50 text-rose-800',
    panel: 'border-rose-200 bg-rose-50',
    icon: 'text-rose-600',
  };
}

function toneForCheck(status: ReturnType<typeof evaluatePilotReadiness>['checks'][number]['status']) {
  if (status === 'good') return 'border-emerald-200 bg-emerald-50';
  if (status === 'attention') return 'border-amber-200 bg-amber-50';
  return 'border-slate-200 bg-white';
}

function labelForCheck(status: ReturnType<typeof evaluatePilotReadiness>['checks'][number]['status']) {
  if (status === 'good') return 'gut';
  if (status === 'attention') return 'prüfen';
  return 'fehlt';
}

export function PilotReadinessPanel({ state, version }: Props) {
  const readiness = evaluatePilotReadiness({ state, version });
  const tone = toneForLevel(readiness.level);

  return (
    <div className={`rounded-2xl border p-5 shadow-sm space-y-4 ${tone.panel}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-slate-800">
            <ShieldCheck className={`w-4 h-4 ${tone.icon}`} />
            <h3 className="text-sm font-semibold">Pilot-Readiness</h3>
            <HelpPopover helpKey="pmv2.pilot" ariaLabel="Hilfe: Pilot-Readiness" />
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tone.badge}`}>
              {readiness.levelLabel}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-900">{readiness.headline}</p>
          <p className="text-sm text-slate-700 leading-relaxed">{readiness.summary}</p>
        </div>

        <div className="rounded-xl border border-white/70 bg-white/70 px-4 py-3 min-w-[11rem]">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pilot-Score</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{readiness.score}</p>
          <p className="text-xs text-slate-600 mt-1">von 100 Punkten</p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
        <div className="grid gap-3 md:grid-cols-2">
          {readiness.checks.map(check => (
            <div key={check.key} className={`rounded-xl border p-4 space-y-2 ${toneForCheck(check.status)}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{check.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{check.metric}</p>
                </div>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-700 border border-white/70">
                  {labelForCheck(check.status)}
                </span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{check.summary}</p>
              <p className="text-xs text-slate-600 leading-relaxed">{check.detail}</p>
              {check.action && (
                <p className="text-xs font-medium text-slate-700">Nächster Schritt: {check.action}</p>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-white/70 bg-white/70 p-4 space-y-2">
            <div className="flex items-center gap-2 text-slate-800">
              <Rocket className={`w-4 h-4 ${tone.icon}`} />
              <p className="text-sm font-semibold">Was jetzt am meisten hilft</p>
            </div>
            <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
              {readiness.nextActions.length > 0 ? readiness.nextActions.map(action => <li key={action}>{action}</li>) : <li>Der Arbeitsstand wirkt stabil genug für den nächsten echten Testlauf.</li>}
            </ul>
          </div>

          <div className="rounded-xl border border-white/70 bg-white/70 p-4 space-y-2">
            <div className="flex items-center gap-2 text-slate-800">
              <CheckCircle2 className={`w-4 h-4 ${tone.icon}`} />
              <p className="text-sm font-semibold">Was schon gut wirkt</p>
            </div>
            <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
              {readiness.strengths.length > 0 ? readiness.strengths.map(item => <li key={item}>{item}</li>) : <li>Noch keine klaren Stärken erkennbar.</li>}
            </ul>
          </div>

          {readiness.cautionNotes.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-900">
                <AlertTriangle className="w-4 h-4" />
                <p className="text-sm font-semibold">Worauf Sie noch achten sollten</p>
              </div>
              <ul className="space-y-2 text-sm text-amber-900/90 list-disc pl-5">
                {readiness.cautionNotes.map(note => <li key={note}>{note}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
