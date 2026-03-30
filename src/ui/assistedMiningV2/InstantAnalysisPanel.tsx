import { ArrowRight, CheckCircle2, Lightbulb, Sparkles, AlertTriangle } from 'lucide-react';
import type { ProcessMiningAssistedV2Step } from '../../domain/process';
import type { InstantAnalysisSnapshot } from './instantAnalysis';

interface Props {
  snapshot: InstantAnalysisSnapshot;
  onOpenStep?: (step: ProcessMiningAssistedV2Step) => void;
}

const CARD_STYLES = {
  strength: {
    wrapper: 'bg-green-50 border-green-200',
    title: 'text-green-900',
    summary: 'text-green-800',
    bullet: 'bg-green-500',
    icon: <CheckCircle2 className="w-4 h-4 text-green-600" />,
  },
  risk: {
    wrapper: 'bg-amber-50 border-amber-200',
    title: 'text-amber-900',
    summary: 'text-amber-800',
    bullet: 'bg-amber-500',
    icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
  },
  gap: {
    wrapper: 'bg-slate-50 border-slate-200',
    title: 'text-slate-900',
    summary: 'text-slate-700',
    bullet: 'bg-slate-400',
    icon: <Lightbulb className="w-4 h-4 text-slate-500" />,
  },
} as const;

export function InstantAnalysisPanel({ snapshot, onOpenStep }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-5 shadow-sm space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-slate-700">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-semibold">Lokale Sofortauswertung</p>
          </div>
          <p className="text-base font-semibold text-slate-900">{snapshot.headline}</p>
          <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">{snapshot.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          <span className="px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700">
            {snapshot.analysisModeLabel}
          </span>
          <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
            {snapshot.mainSteps.length} Hauptschritte sichtbar
          </span>
        </div>
      </div>

      {snapshot.mainSteps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Erkannte Hauptlinie</p>
          <ol className="flex flex-wrap gap-2 items-center">
            {snapshot.mainSteps.map((step, index) => (
              <li key={`${step}-${index}`} className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500">{index + 1}.</span>
                <span className="text-sm text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-0.5">
                  {step}
                </span>
                {index < snapshot.mainSteps.length - 1 && <span className="text-slate-300 text-xs">→</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-3">
        {snapshot.cards.map(card => {
          const styles = CARD_STYLES[card.tone];
          return (
            <div key={card.id} className={`border rounded-xl p-4 space-y-3 ${styles.wrapper}`}>
              <div className="flex items-start gap-2.5">
                <span className="shrink-0 mt-0.5">{styles.icon}</span>
                <div className="space-y-1 min-w-0">
                  <p className={`text-sm font-semibold ${styles.title}`}>{card.title}</p>
                  <p className={`text-sm leading-relaxed ${styles.summary}`}>{card.summary}</p>
                </div>
              </div>
              {card.bullets && card.bullets.length > 0 && (
                <ul className="space-y-1.5 pl-1">
                  {card.bullets.map((bullet, index) => (
                    <li key={`${card.id}-${index}`} className={`flex items-start gap-2 text-xs ${styles.summary}`}>
                      <span className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${styles.bullet}`} />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Empfohlener nächster Schritt</p>
          <p className="text-sm font-semibold text-slate-900 mt-1">{snapshot.nextStepLabel}</p>
          <p className="text-sm text-slate-600 leading-relaxed mt-1">{snapshot.nextStepReason}</p>
        </div>
        {onOpenStep && (
          <button
            type="button"
            onClick={() => onOpenStep(snapshot.nextStep)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            {snapshot.nextStepLabel}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
