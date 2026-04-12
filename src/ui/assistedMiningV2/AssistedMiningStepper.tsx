import { Check } from 'lucide-react';
import type { ProcessMiningAssistedV2Step } from './types';
import { MINING_STEPS } from './types';

interface Props {
  currentStep: ProcessMiningAssistedV2Step;
  onStepClick?: (step: ProcessMiningAssistedV2Step) => void;
  completedSteps?: Set<ProcessMiningAssistedV2Step>;
}

const STEP_IDS = MINING_STEPS.map(s => s.id);

export function AssistedMiningStepper({ currentStep, onStepClick, completedSteps }: Props) {
  const currentIndex = STEP_IDS.indexOf(currentStep);

  return (
    <nav aria-label="Prozess-Mining Schritte" className="w-full">
      <ol className="flex w-full items-start gap-2">
        {MINING_STEPS.map((step, index) => {
          const isActive = step.id === currentStep;
          const isDone = completedSteps?.has(step.id) ?? index < currentIndex;
          const isClickable = isDone || index <= currentIndex;

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-start gap-2 last:flex-none">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(step.id)}
                className={[
                  'group flex min-w-0 flex-1 items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                  isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                  isActive
                    ? 'border-blue-200 bg-blue-50 shadow-sm'
                    : isDone
                    ? 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50',
                ].join(' ')}
                title={step.label}
                aria-current={isActive ? 'step' : undefined}
              >
                <div
                  className={[
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-all',
                    isActive
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : isDone
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-slate-300 bg-white text-slate-500',
                  ].join(' ')}
                >
                  {isDone && !isActive ? <Check className="h-4 w-4" /> : <span>{index + 1}</span>}
                </div>
                <div className="min-w-0 space-y-0.5">
                  <span
                    className={[
                      'block text-sm font-semibold leading-tight',
                      isActive ? 'text-blue-800' : isDone ? 'text-emerald-800' : 'text-slate-700',
                    ].join(' ')}
                  >
                    {step.label}
                  </span>
                  <span className="block text-[11px] leading-tight text-slate-500">{step.subtitle}</span>
                </div>
              </button>

              {index < MINING_STEPS.length - 1 && (
                <div
                  aria-hidden="true"
                  className={[
                    'mt-7 hidden h-0.5 flex-1 sm:block',
                    index < currentIndex ? 'bg-emerald-300' : 'bg-slate-200',
                  ].join(' ')}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
