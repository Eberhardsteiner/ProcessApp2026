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
      <ol className="flex items-center w-full">
        {MINING_STEPS.map((step, index) => {
          const isActive = step.id === currentStep;
          const isDone = completedSteps?.has(step.id) ?? index < currentIndex;
          const isClickable = isDone || index <= currentIndex;

          return (
            <li key={step.id} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick?.(step.id)}
                className={[
                  'flex flex-col items-center gap-1 group transition-opacity',
                  isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                ].join(' ')}
                title={step.label}
              >
                <div
                  className={[
                    'w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all text-sm font-semibold',
                    isActive
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200'
                      : isDone
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'bg-white border-slate-300 text-slate-400',
                  ].join(' ')}
                >
                  {isDone && !isActive ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <div className="hidden sm:flex flex-col items-center text-center max-w-[90px]">
                  <span
                    className={[
                      'text-xs font-medium leading-tight',
                      isActive ? 'text-blue-700' : isDone ? 'text-green-700' : 'text-slate-500',
                    ].join(' ')}
                  >
                    {step.label}
                  </span>
                  <span className="text-[10px] text-slate-400 leading-tight mt-0.5">{step.subtitle}</span>
                </div>
              </button>

              {index < MINING_STEPS.length - 1 && (
                <div
                  className={[
                    'flex-1 h-0.5 mx-2',
                    index < currentIndex ? 'bg-green-400' : 'bg-slate-200',
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
