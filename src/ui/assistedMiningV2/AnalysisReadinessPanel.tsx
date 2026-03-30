import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Compass, Sparkles } from 'lucide-react';
import type { ProcessMiningAssistedV2Step, ProcessVersion } from '../../domain/process';
import type { ProcessMiningAssistedV2State } from './types';
import { computeMiningReadiness } from './analysisReadiness';

interface Props {
  state: ProcessMiningAssistedV2State;
  version?: ProcessVersion;
  onOpenStep?: (step: ProcessMiningAssistedV2Step) => void;
}

const TONE_STYLES = {
  green: 'bg-green-50 border-green-200 text-green-800',
  amber: 'bg-amber-50 border-amber-200 text-amber-800',
  red: 'bg-red-50 border-red-200 text-red-800',
  slate: 'bg-slate-50 border-slate-200 text-slate-700',
} as const;

export function AnalysisReadinessPanel({ state, version, onOpenStep }: Props) {
  const readiness = computeMiningReadiness({ state, version });

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-cyan-50 p-5 shadow-sm space-y-4">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-slate-700">
            <Compass className="w-4 h-4 text-cyan-600" />
            <p className="text-sm font-semibold">Wo steht die Analyse gerade?</p>
          </div>
          <p className="text-base font-semibold text-slate-900">{readiness.headline}</p>
          <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">{readiness.summary}</p>
        </div>

        <div className="flex flex-wrap gap-2 items-start">
          <span className="px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700">
            Phase: {readiness.stageLabel}
          </span>
          <span className="px-3 py-1 rounded-full bg-cyan-100 text-cyan-800 text-xs font-medium">
            {readiness.analysisModeLabel}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${TONE_STYLES[readiness.confidenceTone]}`}>
            {readiness.confidenceLabel}
          </span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sinnvollster nächster Schritt</p>
          <p className="text-sm font-semibold text-slate-900 mt-1">{readiness.recommendedStepLabel}</p>
          <p className="text-sm text-slate-600 leading-relaxed mt-1">{readiness.recommendedStepReason}</p>
        </div>
        {onOpenStep && (
          <button
            type="button"
            onClick={() => onOpenStep(readiness.recommendedStep)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            {readiness.recommendedStepLabel}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr_1fr] gap-4">
        <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Activity className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold">Was die App jetzt schon leisten kann</h3>
          </div>
          <div className="space-y-2">
            {readiness.capabilities.map(capability => (
              <div key={capability.key} className="flex items-start gap-2.5">
                {capability.enabled ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-800">{capability.label}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{capability.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold">Sinnvolle nächste Schritte</h3>
          </div>
          {readiness.nextActions.length > 0 ? (
            <ol className="space-y-2">
              {readiness.nextActions.map((action, index) => (
                <li key={index} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <span>{action}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">Die Analyse kann direkt fortgesetzt werden.</p>
          )}
        </div>

        <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-700">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Worauf Sie die Ergebnisse vorsichtig lesen sollten</h3>
          </div>
          {readiness.cautionNotes.length > 0 ? (
            <ul className="space-y-2">
              {readiness.cautionNotes.map((note, index) => (
                <li key={index} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Zurzeit keine besonderen Vorbehalte erkennbar.</p>
          )}
        </div>
      </div>
    </div>
  );
}
