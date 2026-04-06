import type { ReactNode } from 'react';

type StepMetricTone = 'slate' | 'blue' | 'green' | 'amber' | 'violet' | 'red' | 'cyan' | 'emerald';

export type StepMetricItem = {
  label: string;
  value: ReactNode;
  tone?: StepMetricTone;
  detail?: ReactNode;
};

interface StepMetricGridProps {
  items: StepMetricItem[];
  className?: string;
}

const TONE_CLASSES: Record<StepMetricTone, string> = {
  slate: 'border-slate-200 bg-slate-50 text-slate-800',
  blue: 'border-blue-200 bg-blue-50 text-blue-900',
  green: 'border-green-200 bg-green-50 text-green-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  violet: 'border-violet-200 bg-violet-50 text-violet-900',
  red: 'border-red-200 bg-red-50 text-red-900',
  cyan: 'border-cyan-200 bg-cyan-50 text-cyan-900',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

export function StepMetricGrid({ items, className = '' }: StepMetricGridProps) {
  if (items.length === 0) return null;

  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${className}`.trim()}>
      {items.map(item => {
        const tone = item.tone ?? 'slate';
        return (
          <div key={item.label} className={`rounded-xl border p-3 shadow-sm ${TONE_CLASSES[tone]}`}>
            <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{item.label}</p>
            <p className="mt-1 text-2xl font-bold leading-none">{item.value}</p>
            {item.detail ? <div className="mt-2 text-xs leading-relaxed opacity-80">{item.detail}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
