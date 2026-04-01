interface Step {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface StepperProps {
  steps: Step[];
  activeId: string;
  onSelect?: (id: string) => void;
}

export function Stepper({ steps, activeId, onSelect }: StepperProps) {
  const activeIndex = steps.findIndex(step => step.id === activeId);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, index) => {
          const isActive = step.id === activeId;
          const isDone = index < activeIndex;
          const isEnabled = onSelect !== undefined && !step.disabled;

          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => isEnabled && onSelect(step.id)}
                disabled={!isEnabled}
                className={`
                  group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all
                  ${isActive
                    ? 'bg-slate-900 text-white shadow-md'
                    : step.disabled
                    ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                    : isDone
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer'
                    : 'bg-slate-50 text-slate-500'
                  }
                  ${isEnabled ? 'cursor-pointer' : ''}
                `}
              >
                <div
                  className={`
                    flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold
                    ${isActive
                      ? 'bg-white text-slate-900'
                      : step.disabled
                      ? 'bg-slate-200 text-slate-300'
                      : isDone
                      ? 'bg-slate-300 text-slate-700'
                      : 'bg-slate-200 text-slate-400'
                    }
                  `}
                >
                  {index + 1}
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium">{step.label}</span>
                  {step.description && (
                    <span className={`text-xs ${isActive ? 'text-slate-300' : step.disabled ? 'text-slate-300' : 'text-slate-500'}`}>
                      {step.description}
                    </span>
                  )}
                </div>
              </button>

              {index < steps.length - 1 && (
                <div className="hidden sm:block w-8 h-0.5 bg-slate-200 mx-1" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
